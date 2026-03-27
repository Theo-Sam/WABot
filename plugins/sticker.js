const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile, execSync } = require("child_process");
const { promisify } = require("util");
const { tempFile } = require("../lib/helpers");
const config = require("../config");

const execFileAsync = promisify(execFile);

function findFfmpeg() {
  // 1. Try system PATH first (Replit provides ffmpeg 6.x there)
  try {
    const p = execSync("which ffmpeg", { encoding: "utf8" }).trim();
    if (p) return p;
  } catch {}
  // 2. Hardcoded NixOS locations
  const candidates = [
    "/run/current-system/sw/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // 3. Bundled installer binary as last resort
  try {
    const p = require("@ffmpeg-installer/ffmpeg").path;
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return "ffmpeg";
}

/**
 * Build a TIFF-format EXIF buffer containing WhatsApp sticker pack metadata.
 * Tag 0x5741 ("WA") holds the JSON payload — this is the format WhatsApp reads.
 */
function buildStickerExif(packName, authorName) {
  const json = JSON.stringify({
    "sticker-pack-id": "com.desamtech.bot",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": authorName,
    emojis: ["🤖"],
  });
  const jsonBuf = Buffer.from(json, "utf-8");
  // TIFF little-endian header + single IFD entry for tag 0x5741
  // IFD layout: count(2) + [tag(2)+type(2)+count(4)+valueOffset(4)] + nextIFD(4)
  // Value starts at offset 26 (8 header + 2 count + 12 entry + 4 nextIFD)
  const VALUE_OFFSET = 26;
  const exif = Buffer.alloc(VALUE_OFFSET);
  exif.write("II", 0);                          // little-endian marker
  exif.writeUInt16LE(0x002a, 2);                // TIFF magic
  exif.writeUInt32LE(8, 4);                     // IFD offset = 8
  exif.writeUInt16LE(1, 8);                     // 1 IFD entry
  exif.writeUInt16LE(0x5741, 10);               // tag = WA
  exif.writeUInt16LE(7, 12);                    // type = UNDEFINED
  exif.writeUInt32LE(jsonBuf.length, 14);       // count = json byte length
  exif.writeUInt32LE(VALUE_OFFSET, 18);         // value offset
  exif.writeUInt32LE(0, 22);                    // next IFD = 0 (end)
  return Buffer.concat([exif, jsonBuf]);
}

/**
 * Inject EXIF metadata into a WebP buffer using node-webpmux.
 * node-webpmux correctly handles VP8X extension creation and chunk ordering.
 */
async function addExifToWebp(webpBuffer, exifData) {
  try {
    const webpmux = require("node-webpmux");
    const img = new webpmux.Image();
    await img.load(webpBuffer);
    // node-webpmux requires an "extended" WebP to hold EXIF; convert if needed
    if (img.type !== webpmux.TYPE_EXTENDED) {
      img._convertToExtended();
    }
    img.exif = exifData;
    return await img.save(null);
  } catch (err) {
    console.error("[STICKER] node-webpmux EXIF inject failed:", err.message?.slice(0, 100));
    // Fall back to raw buffer without EXIF rather than crashing
    return webpBuffer;
  }
}

async function createSticker(buffer, opts = {}) {
  const sharp = require("sharp");
  const packName = opts.pack || config.BOT_NAME;
  const authorName = opts.author || "Desam Tech";

  const meta = await sharp(buffer).metadata();
  const isAnimated = meta.pages && meta.pages > 1;

  let webpBuffer;

  if (isAnimated) {
    webpBuffer = await sharp(buffer, { animated: true })
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80, loop: 0 })
      .toBuffer();
  } else {
    webpBuffer = await sharp(buffer)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, lossless: false })
      .toBuffer();
  }

  const exifData = buildStickerExif(packName, authorName);
  return await addExifToWebp(webpBuffer, exifData);
}

async function createAnimatedStickerFromVideo(videoBuffer, opts = {}, ext = "mp4") {
  const packName = opts.pack || config.BOT_NAME;
  const authorName = opts.author || "Desam Tech";
  const ffmpegBin = findFfmpeg();

  const inputPath = tempFile(ext);
  const outputPath = tempFile("webp");

  fs.writeFileSync(inputPath, videoBuffer);

  try {
    await execFileAsync(ffmpegBin, [
      "-y",
      "-i", inputPath,
      "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000@0,fps=15",
      "-t", "8",
      "-loop", "0",
      "-preset", "default",
      "-an",
      "-vsync", "0",
      outputPath,
    ], { timeout: 60000 });

    const webpBuffer = fs.readFileSync(outputPath);
    const exifData = buildStickerExif(packName, authorName);
    return await addExifToWebp(webpBuffer, exifData);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
}

const commands = [
  {
    name: ["sticker", "s"],
    category: "sticker",
    desc: "Create sticker from image/video/GIF",
    handler: async (sock, m, { text }) => {
      const media = m.isImage || m.isVideo || m.isSticker
        ? m
        : m.quoted && (m.quoted.isImage || m.quoted.isVideo || m.quoted.isSticker)
          ? m.quoted
          : null;

      if (!media) {
        return m.reply(
          `Send or reply to an image, GIF or video with ${config.PREFIX}sticker\n` +
          `Optional pack name: ${config.PREFIX}sticker pack|author`
        );
      }

      m.react("⏳");

      try {
        const buffer = await media.download();
        const [pack, author] = (text || "").split("|").map((s) => s?.trim());
        const mime = media.mimetype || "";
        const isVideo = mime.startsWith("video/");
        const isGif = mime === "image/gif" || (mime === "video/mp4" && media.isGif);

        let stickerBuf;

        if (isVideo || isGif) {
          const ext = isGif ? "gif" : "mp4";
          try {
            stickerBuf = await createAnimatedStickerFromVideo(buffer, { pack, author }, ext);
          } catch (ffErr) {
            console.error("[STICKER] ffmpeg animated failed:", ffErr.message);
            stickerBuf = await createSticker(buffer, { pack, author });
          }
        } else {
          stickerBuf = await createSticker(buffer, { pack, author });
        }

        await sock.sendMessage(m.chat, { sticker: stickerBuf }, { quoted: { key: m.key, message: m.message } });
        if (pack || author) {
          await m.reply(`✅ Sticker created${pack ? ` | Pack: ${pack}` : ""}${author ? ` | Author: ${author}` : ""}.`);
        }
        m.react("✅");
      } catch (err) {
        console.error("[DESAM] Sticker error:", err.message || err);
        m.react("❌");
        await m.reply("❌ Failed to create sticker. Make sure the file is a valid image or short video.");
      }
    },
  },
  {
    name: ["toimg", "toimage"],
    category: "sticker",
    desc: "Convert sticker to image",
    handler: async (sock, m) => {
      const media = m.isSticker ? m : m.quoted?.isSticker ? m.quoted : null;
      if (!media) return m.reply(`Reply to a sticker with ${config.PREFIX}toimg`);

      m.react("⏳");
      try {
        const sharp = require("sharp");
        const buffer = await media.download();
        const pngBuf = await sharp(buffer).png().toBuffer();
        await sock.sendMessage(m.chat, { image: pngBuf }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[DESAM] toimg error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to convert sticker.");
      }
    },
  },
  {
    name: ["steal", "take"],
    category: "sticker",
    desc: "Re-pack sticker with custom name/author",
    handler: async (sock, m, { text }) => {
      const media = m.isSticker ? m : m.quoted?.isSticker ? m.quoted : null;
      if (!media) return m.reply(`Reply to a sticker with ${config.PREFIX}steal pack|author`);

      m.react("⏳");
      try {
        const buffer = await media.download();
        const [pack, author] = (text || `${config.BOT_NAME}|Desam Tech`).split("|").map((s) => s?.trim());
        const stickerBuf = await createSticker(buffer, { pack, author });
        await sock.sendMessage(m.chat, { sticker: stickerBuf }, { quoted: { key: m.key, message: m.message } });
        await m.reply(`✅ Sticker re-packed | Pack: ${pack || config.BOT_NAME} | Author: ${author || "Desam Tech"}`);
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply("❌ Failed to re-pack sticker.");
      }
    },
  },
];

module.exports = { commands, createSticker };
