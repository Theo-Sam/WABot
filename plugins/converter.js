const config = require("../config");
const { tempFile } = require("../lib/helpers");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Resolve the best available ffmpeg binary (prefer system PATH over bundled 2018 binary)
const FFMPEG_BIN = (() => {
  try { return execSync("which ffmpeg", { encoding: "utf8" }).trim(); } catch {}
  try {
    const p = require("@ffmpeg-installer/ffmpeg").path;
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return "ffmpeg";
})();

function cleanupFiles(...files) {
  for (const file of files) {
    try {
      if (file && fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
  }
}

function ffmpegConvert(inputPath, outputPath, buildFn) {
  return new Promise((resolve, reject) => {
    const ffmpeg = require("fluent-ffmpeg");
    ffmpeg.setFfmpegPath(FFMPEG_BIN);
    const cmd = ffmpeg(inputPath);
    buildFn(cmd);
    cmd
      .on("end", resolve)
      .on("error", (err) => { console.error("[ffmpegConvert] error:", err.message?.slice(0, 300)); reject(err); })
      .save(outputPath);
  });
}

/**
 * Guess a safe file extension for downloaded media based on its MIME type.
 * Using the right extension helps ffmpeg auto-detect the format.
 */
function mimeToExt(mimetype) {
  if (!mimetype) return "bin";
  if (mimetype.includes("ogg")) return "ogg";
  if (mimetype.includes("opus")) return "ogg";
  if (mimetype.includes("mp4")) return "mp4";
  if (mimetype.includes("webm")) return "webm";
  if (mimetype.includes("mpeg") || mimetype.includes("mp3")) return "mp3";
  if (mimetype.includes("aac")) return "aac";
  if (mimetype.includes("3gpp")) return "3gp";
  if (mimetype.includes("wav")) return "wav";
  if (mimetype.includes("flac")) return "flac";
  return "bin";
}

const commands = [
  {
    name: ["toaudio", "mp3", "tomp3"],
    category: "media",
    desc: "Convert video/voice to audio (reply to video or audio)",
    handler: async (sock, m) => {
      const media =
        (m.isVideo || m.isAudio) ? m
        : m.quoted && (m.quoted.isVideo || m.quoted.isAudio) ? m.quoted
        : null;
      if (!media) return m.reply(`Reply to a video or audio message with ${config.PREFIX}toaudio`);
      m.react("⏳");
      const inputExt = mimeToExt(media.mimetype);
      const input = tempFile(inputExt);
      const output = tempFile("mp3");
      try {
        const buffer = await media.download();
        if (!buffer || buffer.length < 100) throw new Error("Downloaded media is empty or too small");
        fs.writeFileSync(input, buffer);
        await ffmpegConvert(input, output, cmd =>
          cmd.noVideo().audioCodec("libmp3lame").audioBitrate(128).toFormat("mp3")
        );
        const audioBuffer = fs.readFileSync(output);
        if (audioBuffer.length < 100) throw new Error("ffmpeg produced empty output");
        await sock.sendMessage(m.chat, {
          audio: audioBuffer,
          mimetype: "audio/mpeg",
          fileName: "audio.mp3",
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[toaudio] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to convert to audio. Make sure you reply to a video or voice message.");
      } finally {
        cleanupFiles(input, output);
      }
    },
  },
  {
    name: ["tovideo", "mp4", "tomp4"],
    category: "media",
    desc: "Convert audio to video (black screen + audio)",
    handler: async (sock, m) => {
      const media =
        (m.isAudio || m.isVideo) ? m
        : m.quoted && (m.quoted.isAudio || m.quoted.isVideo) ? m.quoted
        : null;
      if (!media) return m.reply(`Reply to an audio or voice note with ${config.PREFIX}tovideo`);
      m.react("⏳");
      const inputExt = mimeToExt(media.mimetype);
      const input = tempFile(inputExt);
      const output = tempFile("mp4");
      try {
        const buffer = await media.download();
        if (!buffer || buffer.length < 100) throw new Error("Downloaded media is empty or too small");
        fs.writeFileSync(input, buffer);
        // Use execFile directly for the two-input lavfi command — fluent-ffmpeg input ordering
        // can be tricky with lavfi; this gives full control over argument order.
        await new Promise((resolve, reject) => {
          const { execFile } = require("child_process");
          execFile(FFMPEG_BIN, [
            "-y",
            "-f", "lavfi", "-i", "color=c=black:s=1280x720:r=1",
            "-i", input,
            "-map", "0:v",
            "-map", "1:a",
            "-shortest",
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-c:a", "aac",
            "-b:a", "128k",
            output,
          ], { timeout: 120000 }, (err, stdout, stderr) => {
            if (err) { console.error("[tovideo] ffmpeg error:", stderr?.slice(-300)); return reject(err); }
            resolve();
          });
        });
        const videoBuffer = fs.readFileSync(output);
        if (videoBuffer.length < 100) throw new Error("ffmpeg produced empty output");
        await sock.sendMessage(m.chat, {
          video: videoBuffer,
          caption: `_${config.BOT_NAME} · Desam Tech_ ⚡`,
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[tovideo] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to convert to video. Make sure you reply to an audio or voice note.");
      } finally {
        cleanupFiles(input, output);
      }
    },
  },
  {
    name: ["toptt", "ptt", "tovn", "vn"],
    category: "media",
    desc: "Convert audio/video to WhatsApp voice note",
    handler: async (sock, m) => {
      const media =
        (m.isAudio || m.isVideo) ? m
        : m.quoted && (m.quoted.isAudio || m.quoted.isVideo) ? m.quoted
        : null;
      if (!media) return m.reply(`Reply to an audio or video with ${config.PREFIX}toptt`);
      m.react("⏳");
      const inputExt = mimeToExt(media.mimetype);
      const input = tempFile(inputExt);
      const output = tempFile("ogg");
      try {
        const buffer = await media.download();
        if (!buffer || buffer.length < 100) throw new Error("Downloaded media is empty or too small");
        fs.writeFileSync(input, buffer);
        await ffmpegConvert(input, output, cmd =>
          cmd.noVideo().audioCodec("libopus").audioBitrate(64).toFormat("ogg")
        );
        const pttBuffer = fs.readFileSync(output);
        if (pttBuffer.length < 100) throw new Error("ffmpeg produced empty output");
        await sock.sendMessage(m.chat, {
          audio: pttBuffer,
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[toptt] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to convert to voice note. Make sure you reply to an audio or video.");
      } finally {
        cleanupFiles(input, output);
      }
    },
  },
  {
    name: ["togif"],
    category: "media",
    desc: "Convert video/sticker to GIF playback",
    handler: async (sock, m) => {
      const media =
        (m.isVideo || m.isSticker) ? m
        : m.quoted && (m.quoted.isVideo || m.quoted.isSticker) ? m.quoted
        : null;
      if (!media) return m.reply(`Reply to a video or sticker with ${config.PREFIX}togif`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        if (!buffer || buffer.length < 100) throw new Error("Downloaded media is empty or too small");
        await sock.sendMessage(m.chat, {
          video: buffer,
          gifPlayback: true,
          caption: `_${config.BOT_NAME} · Desam Tech_ ⚡`,
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[togif] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to convert to GIF.");
      }
    },
  },
  {
    name: ["crop", "square"],
    category: "media",
    desc: "Crop image to square",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}crop`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        const sharp = require("sharp");
        const metadata = await sharp(buffer).metadata();
        const size = Math.min(metadata.width, metadata.height);
        const cropped = await sharp(buffer)
          .extract({ left: Math.floor((metadata.width - size) / 2), top: Math.floor((metadata.height - size) / 2), width: size, height: size })
          .jpeg({ quality: 90 })
          .toBuffer();
        await sock.sendMessage(m.chat, { image: cropped }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[crop] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to crop image.");
      }
    },
  },
  {
    name: ["resize"],
    category: "media",
    desc: "Resize image (e.g., 500x500)",
    handler: async (sock, m, { text }) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}resize 500x500`);
      if (!text || !text.includes("x")) return m.usageReply("resize <width>x<height>", "resize 500x500");
      m.react("⏳");
      try {
        const [w, h] = text.toLowerCase().split("x").map(Number);
        if (!w || !h || w > 4096 || h > 4096) return m.reply("❌ Invalid size. Max 4096x4096.");
        const buffer = await media.download();
        const sharp = require("sharp");
        const resized = await sharp(buffer).resize(w, h, { fit: "fill" }).jpeg({ quality: 90 }).toBuffer();
        await sock.sendMessage(m.chat, { image: resized }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[resize] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to resize image.");
      }
    },
  },
  {
    name: ["circle", "round"],
    category: "media",
    desc: "Make image circular",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}circle`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        const sharp = require("sharp");
        const meta = await sharp(buffer).metadata();
        const size = Math.min(meta.width, meta.height);
        const circle = Buffer.from(`<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
        const result = await sharp(buffer)
          .resize(size, size, { fit: "cover" })
          .composite([{ input: circle, blend: "dest-in" }])
          .png()
          .toBuffer();
        await sock.sendMessage(m.chat, { image: result }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[circle] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to make circular image.");
      }
    },
  },
  {
    name: ["blur"],
    category: "media",
    desc: "Apply blur to image",
    handler: async (sock, m, { text }) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}blur`);
      m.react("⏳");
      try {
        const level = parseInt(text) || 10;
        const buffer = await media.download();
        const sharp = require("sharp");
        const blurred = await sharp(buffer).blur(Math.min(level, 100)).jpeg({ quality: 90 }).toBuffer();
        await sock.sendMessage(m.chat, { image: blurred }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[blur] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to blur image.");
      }
    },
  },
  {
    name: ["grayscale", "grey", "bw"],
    category: "media",
    desc: "Convert image to grayscale",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}grayscale`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        const sharp = require("sharp");
        const grey = await sharp(buffer).grayscale().jpeg({ quality: 90 }).toBuffer();
        await sock.sendMessage(m.chat, { image: grey }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[grayscale] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to convert to grayscale.");
      }
    },
  },
  {
    name: ["invert", "negative"],
    category: "media",
    desc: "Invert image colors",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}invert`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        const sharp = require("sharp");
        const inverted = await sharp(buffer).negate().jpeg({ quality: 90 }).toBuffer();
        await sock.sendMessage(m.chat, { image: inverted }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[invert] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to invert image.");
      }
    },
  },
  {
    name: ["rotate"],
    category: "media",
    desc: "Rotate image by degrees",
    handler: async (sock, m, { text }) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}rotate <degrees>`);
      m.react("⏳");
      try {
        const degrees = parseInt(text) || 90;
        if (Math.abs(degrees) > 3600) return m.reply("❌ Invalid degrees. Keep value between -3600 and 3600.");
        const buffer = await media.download();
        const sharp = require("sharp");
        const rotated = await sharp(buffer).rotate(degrees).jpeg({ quality: 90 }).toBuffer();
        await sock.sendMessage(m.chat, { image: rotated }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[rotate] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to rotate image.");
      }
    },
  },
  {
    name: ["flipimg", "imgflip", "vflip"],
    category: "media",
    desc: "Flip image vertically",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}flip`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        const sharp = require("sharp");
        const flipped = await sharp(buffer).flip().jpeg({ quality: 90 }).toBuffer();
        await sock.sendMessage(m.chat, { image: flipped }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[flipimg] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to flip image.");
      }
    },
  },
  {
    name: ["mirror", "flop"],
    category: "media",
    desc: "Mirror image horizontally",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}mirror`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        const sharp = require("sharp");
        const mirrored = await sharp(buffer).flop().jpeg({ quality: 90 }).toBuffer();
        await sock.sendMessage(m.chat, { image: mirrored }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[mirror] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to mirror image.");
      }
    },
  },
];

module.exports = { commands };
