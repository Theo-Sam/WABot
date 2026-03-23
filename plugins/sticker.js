const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { tempFile } = require("../lib/helpers");
const config = require("../config");

const execFileAsync = promisify(execFile);

function findFfmpeg() {
  const candidates = [
    "/run/current-system/sw/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return "ffmpeg";
}

function createExif(packName, authorName) {
  const json = JSON.stringify({
    "sticker-pack-id": "com.desamtech.bot",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": authorName,
    emojis: ["🤖"],
  });

  return Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2a, 0x00]),
    Buffer.from([0x08, 0x00, 0x00, 0x00]),
    Buffer.from([0x01, 0x00]),
    Buffer.from([0x41, 0x57]),
    Buffer.from([0x07, 0x00]),
    Buffer.from(new Uint32Array([json.length]).buffer),
    Buffer.from([0x1a, 0x00, 0x00, 0x00]),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from(json, "utf-8"),
  ]);
}

function addExifToWebp(webpBuffer, exifData) {
  if (!webpBuffer || webpBuffer.slice(0, 4).toString() !== "RIFF") {
    return webpBuffer;
  }

  const chunks = [];
  let offset = 12; // skip RIFF(4) + size(4) + WEBP(4)
  let hasVP8X = false;

  while (offset + 8 <= webpBuffer.length) {
    const chunkId = webpBuffer.slice(offset, offset + 4).toString();
    const chunkSize = webpBuffer.readUInt32LE(offset + 4);
    // WebP chunks are padded to even size but the stored size is the actual size
    const paddedSize = chunkSize + (chunkSize % 2);
    const chunkEnd = offset + 8 + paddedSize;

    if (chunkId === "VP8X") {
      hasVP8X = true;
      // Copy the VP8X chunk and set the EXIF metadata flag (bit 2 = 0x04)
      // VP8X chunk data layout: flags(1) + reserved(3) + canvasW-1(3) + canvasH-1(3)
      // The flags byte is at position 8 (right after the 8-byte RIFF chunk header)
      const vp8xCopy = Buffer.from(webpBuffer.slice(offset, chunkEnd));
      vp8xCopy[8] = vp8xCopy[8] | 0x04; // set EXIF present flag
      chunks.push(vp8xCopy);
    } else if (chunkId !== "EXIF") {
      chunks.push(webpBuffer.slice(offset, chunkEnd));
    }

    offset = chunkEnd;
  }

  // If no VP8X chunk exists (plain VP8/VP8L), we must create one before adding EXIF.
  // Sharp with transparent background always emits VP8X, but handle the fallback anyway.
  if (!hasVP8X) {
    // Read canvas dimensions from VP8 bitstream header if possible
    let canvasW = 0;
    let canvasH = 0;
    const firstChunkId = webpBuffer.slice(12, 16).toString();
    if (firstChunkId === "VP8 " && webpBuffer.length >= 34) {
      canvasW = (webpBuffer.readUInt16LE(26) & 0x3fff);
      canvasH = (webpBuffer.readUInt16LE(28) & 0x3fff);
    }
    const vp8xData = Buffer.alloc(10, 0);
    vp8xData[0] = 0x04; // EXIF flag
    vp8xData.writeUIntLE(Math.max(0, canvasW - 1), 4, 3);
    vp8xData.writeUIntLE(Math.max(0, canvasH - 1), 7, 3);
    const vp8xSizeBuf = Buffer.allocUnsafe(4);
    vp8xSizeBuf.writeUInt32LE(10, 0);
    const vp8xChunk = Buffer.concat([Buffer.from("VP8X"), vp8xSizeBuf, vp8xData]);
    // VP8X must be first — prepend it before all other chunks
    chunks.unshift(vp8xChunk);
  }

  // Build EXIF chunk (pad to even size)
  const exifPayload = exifData.length % 2
    ? Buffer.concat([exifData, Buffer.from([0])])
    : exifData;
  const exifSizeBuf = Buffer.allocUnsafe(4);
  exifSizeBuf.writeUInt32LE(exifData.length, 0);
  const exifChunk = Buffer.concat([Buffer.from("EXIF"), exifSizeBuf, exifPayload]);
  chunks.push(exifChunk);

  const body = Buffer.concat(chunks);
  const totalSizeBuf = Buffer.allocUnsafe(4);
  totalSizeBuf.writeUInt32LE(4 + body.length, 0); // 4 = "WEBP"
  return Buffer.concat([Buffer.from("RIFF"), totalSizeBuf, Buffer.from("WEBP"), body]);
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

  const exifData = createExif(packName, authorName);
  return addExifToWebp(webpBuffer, exifData);
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
    const exifData = createExif(packName, authorName);
    return addExifToWebp(webpBuffer, exifData);
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
