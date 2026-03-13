const config = require("../config");
const { fetchJson, fetchBuffer, isUrl, tempFile } = require("../lib/helpers");
const fs = require("fs");
const axios = require("axios");
const play = require("play-dl");

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.fdn.fr",
  "https://vid.puffyan.us",
  "https://invidious.nerdvpn.de",
];

async function ytSearch(query) {
  try {
    const results = await play.search(query, { limit: 5, source: { youtube: "video" } });
    if (results.length) {
      return results.map(v => ({
        url: v.url,
        title: v.title || query,
        thumbnail: v.thumbnails?.[0]?.url || "",
        duration: v.durationRaw || "",
        views: v.views?.toLocaleString() || "",
        author: v.channel?.name || "",
        videoId: v.id,
      }));
    }
  } catch {}
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

async function ytDownloadAudio(url) {
  try {
    const info = await play.video_info(url);
    const format = info.format.filter(f => f.mimeType?.startsWith("audio/")).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    if (format?.url) {
      const res = await axios.get(format.url, { responseType: "arraybuffer", timeout: 60000 });
      if (res.data?.byteLength > 1000) return Buffer.from(res.data);
    }
  } catch {}
  return null;
}

async function ytDownloadVideo(url) {
  try {
    const info = await play.video_info(url);
    const format = info.format.filter(f => f.mimeType?.startsWith("video/") && f.hasAudio).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    if (format?.url) {
      const res = await axios.get(format.url, { responseType: "arraybuffer", timeout: 60000, maxContentLength: 50 * 1024 * 1024 });
      if (res.data?.byteLength > 1000) return Buffer.from(res.data);
    }
  } catch {}
  return null;
}

async function igDownload(url) {
  const endpoints = [
    async () => {
      const res = await axios.post("https://fastdl.app/api/convert", new URLSearchParams({ url }), { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } });
      const dlUrl = res.data?.url || res.data?.result?.[0]?.url;
      if (dlUrl) return await fetchBuffer(dlUrl);
      return null;
    },
    async () => {
      const res = await axios.get(`https://api.igdownloader.app/api/v1/download?url=${encodeURIComponent(url)}`, { timeout: 15000 });
      const dlUrl = res.data?.data?.[0]?.url;
      if (dlUrl) return await fetchBuffer(dlUrl);
      return null;
    },
  ];
  for (const fn of endpoints) {
    try { const buf = await fn(); if (buf?.length > 1000) return buf; } catch {}
  }
  return null;
}

async function fbDownload(url) {
  const endpoints = [
    async () => {
      const res = await axios.get(`https://api.fbdownloader.app/api/v1/download?url=${encodeURIComponent(url)}`, { timeout: 15000 });
      const dlUrl = res.data?.data?.hd || res.data?.data?.sd;
      if (dlUrl) return await fetchBuffer(dlUrl);
      return null;
    },
  ];
  for (const fn of endpoints) {
    try { const buf = await fn(); if (buf?.length > 1000) return buf; } catch {}
  }
  return null;
}

async function twitterDownload(url) {
  try {
    const tweetId = url.match(/status\/(\d+)/)?.[1];
    if (!tweetId) return null;
    const data = await fetchJson(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, { timeout: 15000 });
    const mediaUrl = data?.media_extended?.[0]?.url || data?.mediaURLs?.[0];
    if (mediaUrl) return await fetchBuffer(mediaUrl);
  } catch {}
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
        let audioBuffer = await ytDownloadAudio(videoUrl);
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
        let videoBuffer = await ytDownloadVideo(videoUrl);
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
        let audioBuffer = await ytDownloadAudio(text);
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
        let mediaBuffer = await igDownload(text);
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
        let videoBuffer = await fbDownload(text);
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
        let videoBuffer = await twitterDownload(text);
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
        if (!isUrl(text)) return m.reply("❌ Please provide a Spotify URL.");
        let audioBuffer = null;
        try {
          const trackMatch = text.match(/track\/([a-zA-Z0-9]+)/);
          if (trackMatch) {
            const searchQuery = text;
            const results = await play.search(searchQuery, { limit: 1, source: { youtube: "video" } }).catch(() => []);
            if (results.length) {
              audioBuffer = await ytDownloadAudio(results[0].url);
            }
          }
        } catch {}
        if (!audioBuffer) return m.reply("❌ Could not download Spotify track. Try searching YouTube with .play instead.");
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
        let imgSource = "Pinterest";
        try {
          const pinterestUrl = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent("/search/pins/?q=" + text)}&data=${encodeURIComponent(JSON.stringify({ options: { query: text, scope: "pins", page_size: 10 }, context: {} }))}`;
          const res = await axios.get(pinterestUrl, {
            timeout: 10000,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept": "application/json",
            },
          });
          const results = res.data?.resource_response?.data?.results || [];
          const images = results.filter(r => r.images?.orig?.url).map(r => r.images.orig.url);
          if (images.length) {
            const randomImg = images[Math.floor(Math.random() * Math.min(images.length, 10))];
            imgBuffer = await fetchBuffer(randomImg);
          }
        } catch {}
        if (!imgBuffer || imgBuffer.length < 1000) {
          try {
            imgBuffer = await fetchBuffer(`https://source.unsplash.com/random/1080x1080/?${encodeURIComponent(text)}`);
            imgSource = "Unsplash";
          } catch {}
        }
        if (!imgBuffer || imgBuffer.length < 1000) return m.reply("❌ No images found for that query.");
        await sock.sendMessage(m.chat, { image: imgBuffer, caption: `📌 *${text}* (via ${imgSource})\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to search images.");
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
          const searchUrl = `https://apkpure.com/search?q=${encodeURIComponent(text)}`;
          const html = await axios.get(searchUrl, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
          const body = html.data || "";
          const cardPattern = /<div[^>]*class="[^"]*search-dl[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
          const cards = body.match(cardPattern) || [];
          for (const card of cards.slice(0, 5)) {
            const nameMatch = card.match(/class="p-name"[^>]*>([^<]+)/);
            const devMatch = card.match(/class="developer"[^>]*>([^<]+)/);
            const sizeMatch = card.match(/class="p-size"[^>]*>([^<]+)/);
            const verMatch = card.match(/class="p-version"[^>]*>([^<]+)/);
            const linkMatch = card.match(/href="(\/[^"]+\.html)"/);
            if (nameMatch) {
              apps.push({
                name: nameMatch[1]?.trim(),
                developer: devMatch?.[1]?.trim() || "Unknown",
                size: sizeMatch?.[1]?.trim() || "N/A",
                version: verMatch?.[1]?.trim() || "N/A",
                downloadUrl: linkMatch ? `https://apkpure.com${linkMatch[1]}` : null,
              });
            }
          }
          if (!apps.length) {
            const fallbackNames = [...body.matchAll(/class="first-title[^"]*"[^>]*>([^<]+)<\/p>/g)];
            const fallbackDevs = [...body.matchAll(/class="developer"[^>]*>([^<]*)/g)];
            const fallbackLinks = [...body.matchAll(/<a[^>]*href="(\/[^"]*-[^"]*\.html)"[^>]*class="[^"]*dd[^"]*"/g)];
            for (let i = 0; i < Math.min(fallbackNames.length, 5); i++) {
              apps.push({
                name: fallbackNames[i]?.[1]?.trim(),
                developer: fallbackDevs[i]?.[1]?.trim() || "Unknown",
                size: "N/A",
                version: "N/A",
                downloadUrl: fallbackLinks[i] ? `https://apkpure.com${fallbackLinks[i][1]}` : null,
              });
            }
          }
        } catch {}

        if (!apps.length) {
          try {
            const comboUrl = `https://apkcombo.com/search/${encodeURIComponent(text)}`;
            const comboHtml = await axios.get(comboUrl, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
            const comboBody = comboHtml.data || "";
            const comboNames = [...comboBody.matchAll(/class="name"[^>]*>([^<]+)/g)];
            const comboVers = [...comboBody.matchAll(/class="version"[^>]*>([^<]+)/g)];
            const comboLinks = [...comboBody.matchAll(/href="(\/[^"]+\/download\/[^"]*)"/g)];
            for (let i = 0; i < Math.min(comboNames.length, 5); i++) {
              apps.push({
                name: comboNames[i]?.[1]?.trim(),
                developer: "N/A",
                size: "N/A",
                version: comboVers[i]?.[1]?.trim() || "N/A",
                downloadUrl: comboLinks[i] ? `https://apkcombo.com${comboLinks[i][1]}` : null,
              });
            }
          } catch {}
        }

        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 📱 *APK SEARCH* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `🔎 Query: *${text}*\n\n`;
        if (apps.length) {
          apps.forEach((app, i) => {
            msg += `${i + 1}. *${app.name}*\n`;
            if (app.developer && app.developer !== "N/A") msg += `   👤 Developer: ${app.developer}\n`;
            msg += `   📦 Version: ${app.version}\n`;
            msg += `   💾 Size: ${app.size}\n`;
            if (app.downloadUrl) msg += `   🔗 Download: ${app.downloadUrl}\n`;
            msg += `\n`;
          });
        } else {
          msg += `No results found.\n\n`;
          msg += `🔗 *Search manually:*\n`;
          msg += `• APKPure: https://apkpure.com/search?q=${encodeURIComponent(text)}\n`;
          msg += `• APKCombo: https://apkcombo.com/search/${encodeURIComponent(text)}\n`;
          msg += `• APKMirror: https://www.apkmirror.com/?s=${encodeURIComponent(text)}\n\n`;
        }
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
