const fs = require("fs");
const { tempFile } = require("../lib/helpers");
const config = require("../config");

async function createSticker(buffer, opts = {}) {
  const sharp = require("sharp");
  const packName = opts.pack || config.BOT_NAME;
  const authorName = opts.author || "Desam Tech";

  const img = sharp(buffer).resize(512, 512, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  const webpBuffer = await img.webp({ quality: 80 }).toBuffer();

  const exifData = createExif(packName, authorName);
  return addExifToWebp(webpBuffer, exifData);
}

function createExif(packName, authorName) {
  const json = JSON.stringify({
    "sticker-pack-id": "com.desamtech.bot",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": authorName,
    "emojis": ["🤖"],
  });

  const exif = Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00]),
    Buffer.from(new Uint32Array([json.length]).buffer),
    Buffer.from([0x16, 0x00, 0x00, 0x00]),
    Buffer.from(json, "utf-8"),
  ]);

  return exif;
}

function addExifToWebp(webpBuffer, exifData) {
  const RIFF = Buffer.from("RIFF");
  const WEBP = Buffer.from("WEBP");
  const EXIF = Buffer.from("EXIF");

  if (webpBuffer.slice(0, 4).toString() !== "RIFF") {
    return webpBuffer;
  }

  const chunks = [];
  let offset = 12;

  while (offset < webpBuffer.length) {
    const chunkId = webpBuffer.slice(offset, offset + 4).toString();
    const chunkSize = webpBuffer.readUInt32LE(offset + 4);
    const paddedSize = chunkSize + (chunkSize % 2);

    if (chunkId !== "EXIF") {
      chunks.push(webpBuffer.slice(offset, offset + 8 + paddedSize));
    }
    offset += 8 + paddedSize;
  }

  const exifChunk = Buffer.concat([
    EXIF,
    Buffer.from(new Uint32Array([exifData.length]).buffer),
    exifData,
    exifData.length % 2 ? Buffer.from([0]) : Buffer.alloc(0),
  ]);

  chunks.push(exifChunk);

  const body = Buffer.concat(chunks);
  const totalSize = 4 + body.length;

  return Buffer.concat([RIFF, Buffer.from(new Uint32Array([totalSize]).buffer), WEBP, body]);
}

const commands = [
  {
    name: ["sticker", "s"],
    category: "sticker",
    desc: "Create sticker from image/video",
    handler: async (sock, m, { text }) => {
      const media = m.isImage || m.isVideo ? m : m.quoted && (m.quoted.isImage || m.quoted.isVideo) ? m.quoted : null;

      if (!media) {
        return m.reply(`Send or reply to an image/video with ${config.PREFIX}sticker`);
      }

      m.react("⏳");

      try {
        const buffer = await media.download();
        const [pack, author] = (text || "").split("|").map((s) => s?.trim());
        const stickerBuf = await createSticker(buffer, { pack, author });
        await sock.sendMessage(m.chat, { sticker: stickerBuf }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[DESAM] Sticker error:", err);
        m.react("❌");
        await m.reply("❌ Failed to create sticker.");
      }
    },
  },
  {
    name: ["toimg", "toimage"],
    category: "sticker",
    desc: "Convert sticker to image",
    handler: async (sock, m) => {
      const media = m.isSticker ? m : m.quoted?.isSticker ? m.quoted : null;
      if (!media) {
        return m.reply(`Reply to a sticker with ${config.PREFIX}toimg`);
      }

      m.react("⏳");
      try {
        const sharp = require("sharp");
        const buffer = await media.download();
        const pngBuf = await sharp(buffer).png().toBuffer();
        await sock.sendMessage(m.chat, { image: pngBuf }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[DESAM] toimg error:", err);
        m.react("❌");
        await m.reply("❌ Failed to convert sticker.");
      }
    },
  },
  {
    name: ["steal", "take"],
    category: "sticker",
    desc: "Change sticker pack name",
    handler: async (sock, m, { text }) => {
      const media = m.isSticker ? m : m.quoted?.isSticker ? m.quoted : null;
      if (!media) {
        return m.reply(`Reply to a sticker with ${config.PREFIX}steal pack|author`);
      }

      m.react("⏳");
      try {
        const buffer = await media.download();
        const [pack, author] = (text || "Desam Tech|Desam Bot").split("|").map((s) => s?.trim());
        const stickerBuf = await createSticker(buffer, { pack, author });
        await sock.sendMessage(m.chat, { sticker: stickerBuf }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply("❌ Failed to steal sticker.");
      }
    },
  },
];

module.exports = { commands, createSticker };