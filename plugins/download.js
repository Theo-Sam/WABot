const config = require("../config");
const { fetchJson, fetchBuffer, isUrl, tempFile } = require("../lib/helpers");
const fs = require("fs");

const commands = [
  {
    name: ["play", "song", "music", "p", "m", "s"],
    category: "download",
    desc: "Play/download a song from YouTube",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}play <song name>`);
      m.react("⏳");
      try {
        const searchUrl = `https://deliriussapi-oficial.vercel.app/search/ytsearch?q=${encodeURIComponent(text)}`;
        const searchData = await fetchJson(searchUrl).catch(() => null);
        let videoUrl = "";
        let title = text;
        let thumbnail = "";
        if (searchData?.data?.[0]) {
          videoUrl = searchData.data[0].url;
          title = searchData.data[0].title;
          thumbnail = searchData.data[0].thumbnail;
        } else {
          const altSearch = await fetchJson(`https://weeb-api.vercel.app/ytsearch?query=${encodeURIComponent(text)}`).catch(() => null);
          if (altSearch?.[0]) {
            videoUrl = altSearch[0].url;
            title = altSearch[0].title;
            thumbnail = altSearch[0].thumbnail;
          }
        }
        if (!videoUrl) return m.reply("⏳ No results found. (API might be overloaded)");
        let audioBuffer = await Promise.any([
          (async () => {
            const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: videoUrl, isAudioOnly: true }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 15000 });
            if (!res.data?.url) throw new Error("empty");
            return await fetchBuffer(res.data.url);
          })(),
          (async () => {
            const alt = await fetchJson(`https://api.dreaded.site/api/ytdl/audio?url=${encodeURIComponent(videoUrl)}`);
            if (!alt?.result) throw new Error("empty");
            return await fetchBuffer(alt.result);
          })(),
          (async () => {
            const alt2 = await fetchJson(`https://deliriussapi-oficial.vercel.app/download/ytmp3?url=${encodeURIComponent(videoUrl)}`);
            if (!alt2?.data?.download?.url) throw new Error("empty");
            return await fetchBuffer(alt2.data.download.url);
          })()
        ]).catch(() => null);
        if (!audioBuffer) {
          m.react("❌");
          return m.reply("⏳ Audio download failed. The API may be overloaded.");
        }
        await sock.sendMessage(m.chat, {
          audio: audioBuffer,
          mimetype: "audio/mpeg",
          fileName: `${title}.mp3`,
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[DESAM] play error:", err);
        m.react("❌");
        await m.reply("⏳ Server busy: Failed to download song.");
      }
    },
  },
  {
    name: ["video", "ytmp4", "ytvideo", "v"],
    category: "download",
    desc: "Download YouTube video",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}video <video name or URL>`);
      m.react("⏳");
      try {
        let videoUrl = text;
        if (!isUrl(text)) {
          const searchData = await fetchJson(`https://deliriussapi-oficial.vercel.app/search/ytsearch?q=${encodeURIComponent(text)}`).catch(() => null);
          if (searchData?.data?.[0]) videoUrl = searchData.data[0].url;
          else return m.reply("⏳ No results found. (API might be overloaded)");
        }
        let videoBuffer = await Promise.any([
          (async () => {
            const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: videoUrl }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 15000 });
            if (!res.data?.url) throw new Error("empty");
            return await fetchBuffer(res.data.url);
          })(),
          (async () => {
            const alt = await fetchJson(`https://deliriussapi-oficial.vercel.app/download/ytmp4?url=${encodeURIComponent(videoUrl)}`);
            if (!alt?.data?.download?.url) throw new Error("empty");
            return await fetchBuffer(alt.data.download.url);
          })()
        ]).catch(() => null);
        if (!videoBuffer) return m.reply("⏳ Video download failed. The API may be overloaded.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `🎬 Downloaded from YouTube\n\n_Powered by ${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ Server busy: Failed to download video.");
      }
    },
  },
  {
    name: ["ytmp3", "yta"],
    category: "download",
    desc: "Download YouTube audio by URL",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}ytmp3 <YouTube URL>`);
      m.react("⏳");
      try {
        let audioBuffer = await Promise.any([
          (async () => {
            const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: text, isAudioOnly: true }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 15000 });
            if (!res.data?.url) throw new Error("empty");
            return await fetchBuffer(res.data.url);
          })(),
          (async () => {
            const alt = await fetchJson(`https://deliriussapi-oficial.vercel.app/download/ytmp3?url=${encodeURIComponent(text)}`).catch(() => null);
            if (!alt?.data?.download?.url) throw new Error("empty");
            return await fetchBuffer(alt.data.download.url);
          })()
        ]).catch(() => null);
        if (!audioBuffer) return m.reply("⏳ Audio download failed. The API may be overloaded.");
        await sock.sendMessage(m.chat, { audio: audioBuffer, mimetype: "audio/mpeg" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ Server busy: Failed to download audio.");
      }
    },
  },
  {
    name: ["tiktok", "tt", "ttdl"],
    category: "download",
    desc: "Download TikTok video",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}tiktok <TikTok URL>`);
      m.react("⏳");
      try {
        let videoBuffer = await Promise.any([
          (async () => {
            const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: text }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 15000 });
            if (!res.data?.url) throw new Error("empty");
            return await fetchBuffer(res.data.url);
          })(),
          (async () => {
            const alt = await fetchJson(`https://deliriussapi-oficial.vercel.app/download/tiktok?url=${encodeURIComponent(text)}`).catch(() => null);
            if (!alt?.data?.download) throw new Error("empty");
            return await fetchBuffer(alt.data.download);
          })()
        ]).catch(() => null);
        if (!videoBuffer) return m.reply("❌ Could not download TikTok video.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `📱 TikTok Download\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download TikTok video.");
      }
    },
  },
  {
    name: ["tiktokmp3", "ttaudio", "tta"],
    category: "download",
    desc: "Download TikTok audio",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}tta <TikTok URL>`);
      m.react("⏳");
      try {
        let audioBuffer;
        try {
          const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: text, isAudioOnly: true }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 30000 });
          if (res.data?.url) audioBuffer = await fetchBuffer(res.data.url);
        } catch { }
        if (!audioBuffer) return m.reply("❌ Could not download TikTok audio.");
        await sock.sendMessage(m.chat, { audio: audioBuffer, mimetype: "audio/mpeg" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download TikTok audio.");
      }
    },
  },
  {
    name: ["instagram", "igdl", "ig", "insta"],
    category: "download",
    desc: "Download Instagram post/reel",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}ig <Instagram URL>`);
      m.react("⏳");
      try {
        let mediaBuffer;
        try {
          const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: text }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 30000 });
          if (res.data?.url) mediaBuffer = await fetchBuffer(res.data.url);
        } catch { }
        if (!mediaBuffer) {
          const alt = await fetchJson(`https://deliriussapi-oficial.vercel.app/download/instagram?url=${encodeURIComponent(text)}`).catch(() => null);
          if (alt?.data?.[0]?.url) mediaBuffer = await fetchBuffer(alt.data[0].url);
        }
        if (!mediaBuffer) return m.reply("❌ Could not download Instagram media.");
        await sock.sendMessage(m.chat, { video: mediaBuffer, caption: `📸 Instagram Download\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Instagram media.");
      }
    },
  },
  {
    name: ["facebook", "fbdl", "fb"],
    category: "download",
    desc: "Download Facebook video",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}fb <Facebook URL>`);
      m.react("⏳");
      try {
        let videoBuffer;
        try {
          const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: text }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 30000 });
          if (res.data?.url) videoBuffer = await fetchBuffer(res.data.url);
        } catch { }
        if (!videoBuffer) {
          const alt = await fetchJson(`https://deliriussapi-oficial.vercel.app/download/facebook?url=${encodeURIComponent(text)}`).catch(() => null);
          if (alt?.data?.download) videoBuffer = await fetchBuffer(alt.data.download);
        }
        if (!videoBuffer) return m.reply("❌ Could not download Facebook video.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `📘 Facebook Download\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Facebook video.");
      }
    },
  },
  {
    name: ["twitter", "twitterdl", "tweet", "x", "tw"],
    category: "download",
    desc: "Download Twitter/X video",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}twitter <Twitter/X URL>`);
      m.react("⏳");
      try {
        let videoBuffer;
        try {
          const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: text }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 30000 });
          if (res.data?.url) videoBuffer = await fetchBuffer(res.data.url);
        } catch { }
        if (!videoBuffer) return m.reply("❌ Could not download Twitter video.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `🐦 Twitter/X Download\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Twitter video.");
      }
    },
  },
  {
    name: ["spotify", "spdl", "sp"],
    category: "download",
    desc: "Download Spotify track",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}spotify <song name or Spotify URL>`);
      m.react("⏳");
      try {
        let audioBuffer;
        if (isUrl(text)) {
          try {
            const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: text, isAudioOnly: true }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 30000 });
            if (res.data?.url) audioBuffer = await fetchBuffer(res.data.url);
          } catch { }
        }
        if (!audioBuffer) {
          const search = await fetchJson(`https://deliriussapi-oficial.vercel.app/search/spotify?q=${encodeURIComponent(text)}`).catch(() => null);
          if (search?.data?.[0]?.url) {
            try {
              const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: search.data[0].url, isAudioOnly: true }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 30000 });
              if (res.data?.url) audioBuffer = await fetchBuffer(res.data.url);
            } catch { }
          }
        }
        if (!audioBuffer) return m.reply("❌ Could not download Spotify track.");
        await sock.sendMessage(m.chat, { audio: audioBuffer, mimetype: "audio/mpeg" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Spotify track.");
      }
    },
  },
  {
    name: ["pinterest", "pin"],
    category: "download",
    desc: "Search Pinterest images",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}pinterest <query>`);
      m.react("⏳");
      try {
        const data = await fetchJson(`https://deliriussapi-oficial.vercel.app/search/pinterest?q=${encodeURIComponent(text)}`).catch(() => null);
        if (!data?.data?.length) return m.reply("❌ No results found.");
        const random = data.data[Math.floor(Math.random() * Math.min(data.data.length, 10))];
        const imgUrl = typeof random === "string" ? random : random.url || random.image;
        const buffer = await fetchBuffer(imgUrl);
        await sock.sendMessage(m.chat, { image: buffer, caption: `📌 Pinterest: ${text}\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to search Pinterest.");
      }
    },
  },
  {
    name: ["mediafire", "mf"],
    category: "download",
    desc: "Download from MediaFire",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}mediafire <MediaFire URL>`);
      m.react("⏳");
      try {
        const data = await fetchJson(`https://deliriussapi-oficial.vercel.app/download/mediafire?url=${encodeURIComponent(text)}`).catch(() => null);
        if (!data?.data?.download) return m.reply("❌ Could not get download link.");
        const buffer = await fetchBuffer(data.data.download);
        const filename = data.data.filename || "file";
        await sock.sendMessage(m.chat, { document: buffer, fileName: filename, mimetype: "application/octet-stream" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download from MediaFire.");
      }
    },
  },
  {
    name: ["apk"],
    category: "download",
    desc: "Download APK from APKPure",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}apk <app name>`);
      m.react("⏳");
      try {
        const data = await fetchJson(`https://deliriussapi-oficial.vercel.app/search/apk?q=${encodeURIComponent(text)}`).catch(() => null);
        if (!data?.data?.[0]) return m.reply("❌ No APK found.");
        const app = data.data[0];
        let msg = `📱 *${app.name || text}*\n\n`;
        if (app.developer) msg += `👤 Developer: ${app.developer}\n`;
        if (app.size) msg += `📦 Size: ${app.size}\n`;
        if (app.rating) msg += `⭐ Rating: ${app.rating}\n`;
        if (app.link) msg += `\n🔗 Download: ${app.link}`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to search APK.");
      }
    },
  },
  {
    name: ["gdrive", "drive"],
    category: "download",
    desc: "Download from Google Drive",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}gdrive <Google Drive URL>`);
      m.react("⏳");
      try {
        const match = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (!match) return m.reply("❌ Invalid Google Drive URL.");
        const fileId = match[1];
        const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        const buffer = await fetchBuffer(directUrl);
        await sock.sendMessage(m.chat, { document: buffer, fileName: `gdrive_${fileId}`, mimetype: "application/octet-stream" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download from Google Drive.");
      }
    },
  },
  {
    name: ["reddit", "redditdl"],
    category: "download",
    desc: "Download Reddit video/image",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}reddit <Reddit URL>`);
      m.react("⏳");
      try {
        let mediaBuffer;
        try {
          const res = await require("axios").post("https://api.cobalt.tools/api/json", { url: text }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 30000 });
          if (res.data?.url) mediaBuffer = await fetchBuffer(res.data.url);
        } catch { }
        if (!mediaBuffer) return m.reply("❌ Could not download Reddit media.");
        await sock.sendMessage(m.chat, { video: mediaBuffer, caption: `🔴 Reddit Download\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Reddit media.");
      }
    },
  },
];

module.exports = { commands };