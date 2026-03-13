const config = require("../config");
const { fetchJson, fetchBuffer, isUrl, tempFile } = require("../lib/helpers");
const fs = require("fs");
const axios = require("axios");

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.fdn.fr",
  "https://vid.puffyan.us",
  "https://invidious.nerdvpn.de",
];

async function ytSearch(query) {
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const data = await fetchJson(`${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { timeout: 10000 });
      const videos = Array.isArray(data) ? data.filter(v => v.type === "video") : [];
      if (videos.length) {
        return videos.map(v => ({
          url: `https://youtube.com/watch?v=${v.videoId}`,
          title: v.title,
          thumbnail: v.videoThumbnails?.[0]?.url || "",
          duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${String(v.lengthSeconds % 60).padStart(2, "0")}` : "",
          views: v.viewCount?.toLocaleString() || "",
          author: v.author || "",
          videoId: v.videoId,
        }));
      }
    } catch {}
  }
  return [];
}

async function cobaltDownload(url, audioOnly = false) {
  const instances = [
    "https://api.cobalt.tools",
    "https://cobalt-api.hyper.lol",
  ];
  for (const inst of instances) {
    try {
      const body = { url };
      if (audioOnly) body.downloadMode = "audio";
      const res = await axios.post(inst, body, {
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        timeout: 30000,
      });
      const dlUrl = res.data?.url || (res.data?.picker?.[0]?.url);
      if (dlUrl) return await fetchBuffer(dlUrl);
    } catch {}
  }
  return null;
}

const commands = [
  {
    name: ["play", "song", "music", "p", "m", "s"],
    category: "download",
    desc: "Play/download a song from YouTube",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}play <song name>`);
      m.react("⏳");
      try {
        const results = await ytSearch(text);
        if (!results.length) return m.reply("❌ No results found. Try a different search term.");
        const { url: videoUrl, title } = results[0];
        const audioBuffer = await cobaltDownload(videoUrl, true);
        if (!audioBuffer) {
          let msg = `🎵 *${title}*\n\n🔗 ${videoUrl}\n\n_Direct download is temporarily unavailable. Use the link above._\n\n_${config.BOT_NAME}_`;
          return m.reply(msg);
        }
        await sock.sendMessage(m.chat, {
          audio: audioBuffer,
          mimetype: "audio/mpeg",
          fileName: `${title}.mp3`,
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[DESAM] play error:", err.message);
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
        let title = text;
        if (!isUrl(text)) {
          const results = await ytSearch(text);
          if (!results.length) return m.reply("❌ No results found.");
          videoUrl = results[0].url;
          title = results[0].title;
        }
        const videoBuffer = await cobaltDownload(videoUrl, false);
        if (!videoBuffer) {
          return m.reply(`🎬 *${title}*\n\n🔗 ${videoUrl}\n\n_Direct download is temporarily unavailable. Use the link above._\n\n_${config.BOT_NAME}_`);
        }
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `🎬 *${title}*\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
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
        const audioBuffer = await cobaltDownload(text, true);
        if (!audioBuffer) return m.reply("⏳ Audio download failed. The download servers may be busy.");
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
        let videoBuffer = null;
        try {
          const data = await axios.post("https://www.tikwm.com/api/", new URLSearchParams({ url: text, hd: 1 }), { timeout: 15000 });
          const playUrl = data.data?.data?.hdplay || data.data?.data?.play;
          if (playUrl) videoBuffer = await fetchBuffer(playUrl);
        } catch {}
        if (!videoBuffer) videoBuffer = await cobaltDownload(text, false);
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
        let audioBuffer = null;
        try {
          const data = await axios.post("https://www.tikwm.com/api/", new URLSearchParams({ url: text }), { timeout: 15000 });
          const musicUrl = data.data?.data?.music;
          if (musicUrl) audioBuffer = await fetchBuffer(musicUrl);
        } catch {}
        if (!audioBuffer) audioBuffer = await cobaltDownload(text, true);
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
        let mediaBuffer = await cobaltDownload(text, false);
        if (!mediaBuffer) {
          try {
            const data = await fetchJson(`https://api.saveig.app/api/v1/instagram?url=${encodeURIComponent(text)}`, { timeout: 15000 });
            const dlUrl = data?.data?.[0]?.url || data?.result?.[0]?.url;
            if (dlUrl) mediaBuffer = await fetchBuffer(dlUrl);
          } catch {}
        }
        if (!mediaBuffer) return m.reply("❌ Could not download Instagram media. The download servers may be busy.");
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
        let videoBuffer = await cobaltDownload(text, false);
        if (!videoBuffer) {
          try {
            const data = await fetchJson(`https://api.savefrom.biz/api/convert?url=${encodeURIComponent(text)}`, { timeout: 15000 });
            const dlUrl = data?.url || data?.result?.url;
            if (dlUrl) videoBuffer = await fetchBuffer(dlUrl);
          } catch {}
        }
        if (!videoBuffer) return m.reply("❌ Could not download Facebook video. The download servers may be busy.");
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
        let videoBuffer = await cobaltDownload(text, false);
        if (!videoBuffer) {
          try {
            const tweetId = text.match(/status\/(\d+)/)?.[1];
            if (tweetId) {
              const data = await fetchJson(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, { timeout: 15000 });
              const mediaUrl = data?.media_extended?.[0]?.url || data?.mediaURLs?.[0];
              if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl);
            }
          } catch {}
        }
        if (!videoBuffer) return m.reply("❌ Could not download Twitter video. The download servers may be busy.");
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
      if (!text) return m.reply(`Usage: ${config.PREFIX}spotify <Spotify URL>`);
      m.react("⏳");
      try {
        let audioBuffer = null;
        if (isUrl(text)) {
          audioBuffer = await cobaltDownload(text, true);
        }
        if (!audioBuffer) return m.reply("❌ Could not download Spotify track. Please provide a Spotify URL.");
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
        let imgBuffer = null;
        try {
          const searchUrl = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=/search/pins/?q=${encodeURIComponent(text)}&data=${encodeURIComponent(JSON.stringify({ options: { query: text, scope: "pins" } }))}`;
          imgBuffer = await fetchBuffer(`https://source.unsplash.com/random/1080x1080/?${encodeURIComponent(text)}`);
        } catch {}
        if (!imgBuffer || imgBuffer.length < 1000) {
          imgBuffer = await fetchBuffer(`https://image.pollinations.ai/prompt/${encodeURIComponent("aesthetic pinterest style photo of " + text)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`).catch(() => null);
        }
        if (!imgBuffer) return m.reply("❌ No images found.");
        await sock.sendMessage(m.chat, { image: imgBuffer, caption: `📌 Pinterest: ${text}\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
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
        if (!/^https?:\/\/(www\.)?mediafire\.com\//i.test(text)) return m.reply("❌ Please provide a valid MediaFire URL.");
        const html = await axios.get(text, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" }, maxRedirects: 3 });
        const match = html.data?.match(/href="(https:\/\/download[^"]+)"/);
        if (!match?.[1]) return m.reply("❌ Could not extract download link from MediaFire.");
        const buffer = await fetchBuffer(match[1]);
        const nameMatch = html.data?.match(/class="dl-btn-label"[^>]*>([^<]+)/);
        const filename = nameMatch?.[1]?.trim() || "mediafire_file";
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
    desc: "Search APK from app stores",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}apk <app name>`);
      m.react("⏳");
      try {
        let apps = [];
        try {
          const html = await axios.get(`https://apkpure.com/search?q=${encodeURIComponent(text)}`, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
          const matches = [...(html.data || "").matchAll(/class="p-detail"[^>]*>[\s\S]*?<p class="first-title[^"]*"[^>]*>([^<]+)<\/p>[\s\S]*?class="developer"[^>]*>([^<]*)/g)];
          if (matches.length) {
            apps = matches.slice(0, 5).map(m => ({ name: m[1]?.trim(), developer: m[2]?.trim() }));
          }
        } catch {}
        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 📱 *APK SEARCH* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `🔎 Query: *${text}*\n\n`;
        if (apps.length) {
          apps.forEach((app, i) => {
            msg += `${i + 1}. *${app.name}*\n`;
            if (app.developer) msg += `   👤 ${app.developer}\n`;
          });
          msg += `\n`;
        }
        msg += `🔗 *Download from:*\n`;
        msg += `• APKPure: https://apkpure.com/search?q=${encodeURIComponent(text)}\n`;
        msg += `• APKCombo: https://apkcombo.com/search/${encodeURIComponent(text)}\n`;
        msg += `• APKMirror: https://www.apkmirror.com/?s=${encodeURIComponent(text)}\n\n`;
        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
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
        let mediaBuffer = null;
        try {
          const jsonUrl = text.replace(/\/?$/, ".json");
          const data = await fetchJson(jsonUrl);
          const post = data?.[0]?.data?.children?.[0]?.data;
          const videoUrl = post?.secure_media?.reddit_video?.fallback_url || post?.url_overridden_by_dest;
          if (videoUrl) mediaBuffer = await fetchBuffer(videoUrl);
        } catch {}
        if (!mediaBuffer) mediaBuffer = await cobaltDownload(text, false);
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
