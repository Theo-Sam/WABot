const config = require("../config");
const { fetchJson, fetchBuffer, isUrl, extractUrls, tempFile, pickNonRepeating } = require("../lib/helpers");
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
  const cleanUrl = normalizeInputUrl(url).split("?")[0].replace(/\/$/, "");

  // 1. cobalt.tools — open-source, most reliable
  try {
    const res = await axios.post(
      "https://api.cobalt.tools/api/json",
      { url: cleanUrl },
      { timeout: 25000, headers: { Accept: "application/json", "Content-Type": "application/json" } }
    );
    const d = res.data;
    if ((d.status === "redirect" || d.status === "stream") && d.url) {
      const buf = await fetchBuffer(d.url, { timeout: 60000 });
      if (buf?.length > 1000) return { buffer: buf, type: "video" };
    }
    if (d.status === "picker" && d.picker?.length) {
      const first = d.picker[0];
      const buf = await fetchBuffer(first.url, { timeout: 60000 });
      if (buf?.length > 1000) return { buffer: buf, type: first.type === "photo" ? "image" : "video" };
    }
  } catch {}

  // 2. saveig.app
  try {
    const res = await axios.get(
      `https://saveig.app/api/?url=${encodeURIComponent(cleanUrl)}`,
      { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const item = res.data?.data?.[0] || res.data?.results?.[0];
    if (item?.url) {
      const buf = await fetchBuffer(item.url, { timeout: 60000 });
      if (buf?.length > 1000) return { buffer: buf, type: item.type === "image" ? "image" : "video" };
    }
  } catch {}

  // 3. fastdl.app
  try {
    const res = await axios.post(
      "https://fastdl.app/api/convert",
      new URLSearchParams({ url: cleanUrl }),
      { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const dlUrl = res.data?.url || res.data?.result?.[0]?.url;
    if (dlUrl) {
      const buf = await fetchBuffer(dlUrl, { timeout: 60000 });
      if (buf?.length > 1000) return { buffer: buf, type: "video" };
    }
  } catch {}

  // 4. igdownloader.app
  try {
    const res = await axios.get(
      `https://api.igdownloader.app/api/v1/download?url=${encodeURIComponent(cleanUrl)}`,
      { timeout: 15000 }
    );
    const item = res.data?.data?.[0];
    if (item?.url) {
      const buf = await fetchBuffer(item.url, { timeout: 60000 });
      if (buf?.length > 1000) return { buffer: buf, type: item.type === "GraphImage" ? "image" : "video" };
    }
  } catch {}

  // 5. sssinstagram (scraper fallback)
  try {
    const res = await axios.post(
      "https://sssinstagram.com/api/convert",
      new URLSearchParams({ q: cleanUrl }),
      { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const items = res.data?.data || res.data?.medias || [];
    const item = items[0];
    if (item?.url) {
      const buf = await fetchBuffer(item.url, { timeout: 60000 });
      if (buf?.length > 1000) return { buffer: buf, type: item.type === "image" ? "image" : "video" };
    }
  } catch {}

  // 6. ddinstagram HTML fallback (often survives API outages)
  try {
    const ddUrl = cleanUrl
      .replace(/^https?:\/\/(www\.)?instagram\.com/i, "https://ddinstagram.com")
      .replace(/^https?:\/\/instagr\.am/i, "https://ddinstagram.com");
    const res = await axios.get(ddUrl, {
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const html = String(res.data || "");
    const mediaMatch =
      html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const mediaUrl = mediaMatch?.[1];
    if (mediaUrl && /^https?:\/\//i.test(mediaUrl)) {
      const buf = await fetchBuffer(mediaUrl, { timeout: 60000 });
      if (buf?.length > 1000) {
        const isImage = /og:image/i.test(mediaMatch?.[0] || "") || /\.(jpe?g|png|webp)(\?|$)/i.test(mediaUrl);
        return { buffer: buf, type: isImage ? "image" : "video" };
      }
    }
  } catch {}

  return null;
}

function normalizeInputUrl(raw) {
  const cleaned = String(raw || "")
    .replace(/[\u200B-\u200F\uFEFF\u2060]/g, "")
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/[),.!?;]+$/g, "");

  if (!cleaned) return "";
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (/^(www\.)?[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(cleaned)) return `https://${cleaned}`;
  return cleaned;
}

function resolveInputUrl(text, m) {
  const direct = normalizeInputUrl(text);
  if (direct && isUrl(direct)) return direct;

  const fromText = extractUrls(String(text || ""))[0];
  if (fromText) return normalizeInputUrl(fromText);

  const quotedBody = String(m?.quoted?.body || "");
  const fromQuoted = extractUrls(quotedBody)[0];
  if (fromQuoted) return normalizeInputUrl(fromQuoted);

  return "";
}

async function fbDownload(url) {
  // 1. cobalt.tools
  try {
    const res = await axios.post(
      "https://api.cobalt.tools/api/json",
      { url },
      { timeout: 25000, headers: { Accept: "application/json", "Content-Type": "application/json" } }
    );
    const d = res.data;
    if ((d.status === "redirect" || d.status === "stream") && d.url) {
      const buf = await fetchBuffer(d.url, { timeout: 60000 });
      if (buf?.length > 1000) return buf;
    }
  } catch {}

  // 2. fdown.net
  try {
    const res = await axios.get(
      `https://fdown.net/api/v1?url=${encodeURIComponent(url)}`,
      { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const dlUrl = res.data?.hd_url || res.data?.sd_url || res.data?.url;
    if (dlUrl) {
      const buf = await fetchBuffer(dlUrl, { timeout: 60000 });
      if (buf?.length > 1000) return buf;
    }
  } catch {}

  // 3. fbdownloader.app (original)
  try {
    const res = await axios.get(
      `https://api.fbdownloader.app/api/v1/download?url=${encodeURIComponent(url)}`,
      { timeout: 15000 }
    );
    const dlUrl = res.data?.data?.hd || res.data?.data?.sd;
    if (dlUrl) {
      const buf = await fetchBuffer(dlUrl, { timeout: 60000 });
      if (buf?.length > 1000) return buf;
    }
  } catch {}

  // 4. getfvid
  try {
    const res = await axios.post(
      "https://getfvid.com/api/convert",
      new URLSearchParams({ url }),
      { timeout: 15000, headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" } }
    );
    const dlUrl = res.data?.hd || res.data?.sd || res.data?.links?.[0]?.url;
    if (dlUrl) {
      const buf = await fetchBuffer(dlUrl, { timeout: 60000 });
      if (buf?.length > 1000) return buf;
    }
  } catch {}

  return null;
}

async function twitterDownload(url) {
  // 1. cobalt.tools
  try {
    const res = await axios.post(
      "https://api.cobalt.tools/api/json",
      { url },
      { timeout: 25000, headers: { Accept: "application/json", "Content-Type": "application/json" } }
    );
    const d = res.data;
    if ((d.status === "redirect" || d.status === "stream") && d.url) {
      const buf = await fetchBuffer(d.url, { timeout: 60000 });
      if (buf?.length > 1000) return buf;
    }
    if (d.status === "picker" && d.picker?.length) {
      const buf = await fetchBuffer(d.picker[0].url, { timeout: 60000 });
      if (buf?.length > 1000) return buf;
    }
  } catch {}

  // 2. vxtwitter
  try {
    const tweetId = url.match(/status\/(\d+)/)?.[1];
    if (tweetId) {
      const data = await fetchJson(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, { timeout: 15000 });
      const mediaUrl = data?.media_extended?.[0]?.url || data?.mediaURLs?.[0];
      if (mediaUrl) {
        const buf = await fetchBuffer(mediaUrl, { timeout: 60000 });
        if (buf?.length > 1000) return buf;
      }
    }
  } catch {}

  // 3. fxtwitter
  try {
    const tweetId = url.match(/status\/(\d+)/)?.[1];
    if (tweetId) {
      const data = await fetchJson(`https://api.fxtwitter.com/Twitter/status/${tweetId}`, { timeout: 15000 });
      const mediaUrl = data?.tweet?.media?.videos?.[0]?.url || data?.tweet?.media?.photos?.[0]?.url;
      if (mediaUrl) {
        const buf = await fetchBuffer(mediaUrl, { timeout: 60000 });
        if (buf?.length > 1000) return buf;
      }
    }
  } catch {}

  return null;
}

function formatVideoMeta(item = {}) {
  const lines = [];
  if (item.title) lines.push(`🎵 Title: *${item.title}*`);
  if (item.author) lines.push(`👤 Channel: ${item.author}`);
  if (item.duration) lines.push(`⏱️ Duration: ${item.duration}`);
  if (item.views) lines.push(`👁️ Views: ${item.views}`);
  if (item.url) lines.push(`🔗 ${item.url}`);
  return lines.join("\n");
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
        const first = results[0];
        const { url: videoUrl, title } = first;
        let audioBuffer = await ytDownloadAudio(videoUrl);
        if (!audioBuffer) {
          let msg = `🎵 *Audio Preview*\n\n${formatVideoMeta(first)}\n\n`;
          msg += `⚠️ Direct audio download is temporarily unavailable.\n`;
          msg += `Use the link above and try again shortly.\n\n`;
          msg += `_${config.BOT_NAME}_`;
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
    name: ["video", "ytmp4", "ytvideo", "youtube", "yt", "v"],
    category: "download",
    desc: "Download YouTube video",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}video <video name or URL>`);
      m.react("⏳");
      try {
        let videoUrl = text;
        let picked = { title: text, url: text };
        if (!isUrl(text)) {
          const results = await ytSearch(text);
          if (!results.length) return m.reply("❌ No results found.");
          picked = results[0];
          videoUrl = picked.url;
        }
        let videoBuffer = await ytDownloadVideo(videoUrl);
        if (!videoBuffer) {
          return m.reply(
            `🎬 *Video Preview*\n\n${formatVideoMeta(picked)}\n\n` +
            `⚠️ Direct video download is temporarily unavailable.\n` +
            `Use the link above and try again shortly.\n\n` +
            `_${config.BOT_NAME}_`
          );
        }
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `🎬 *${picked.title || "YouTube Video"}*\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
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
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.reply(`Usage: ${config.PREFIX}tiktok <TikTok URL>`);
      m.react("⏳");
      try {
        let videoBuffer = null;
        // 1. cobalt.tools
        try {
          const res = await axios.post(
            "https://api.cobalt.tools/api/json",
            { url: targetUrl },
            { timeout: 25000, headers: { Accept: "application/json", "Content-Type": "application/json" } }
          );
          const d = res.data;
          if ((d.status === "redirect" || d.status === "stream") && d.url) {
            videoBuffer = await fetchBuffer(d.url, { timeout: 60000 });
          }
        } catch {}
        // 2. tikwm (fallback)
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const data = await axios.post("https://www.tikwm.com/api/", new URLSearchParams({ url: targetUrl, hd: 1 }), { timeout: 15000 });
            const playUrl = data.data?.data?.hdplay || data.data?.data?.play;
            if (playUrl) videoBuffer = await fetchBuffer(playUrl);
          } catch {}
        }
        if (!videoBuffer || videoBuffer.length < 1000) return m.reply("❌ Could not download TikTok video. The link may be expired or region-locked.");
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
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.reply(`Usage: ${config.PREFIX}tta <TikTok URL>`);
      m.react("⏳");
      try {
        let audioBuffer = null;
        // 1. tikwm background music
        try {
          const data = await axios.post("https://www.tikwm.com/api/", new URLSearchParams({ url: targetUrl }), { timeout: 15000 });
          const musicUrl = data.data?.data?.music;
          if (musicUrl) audioBuffer = await fetchBuffer(musicUrl);
        } catch {}
        // 2. tikwm play audio fallback
        if (!audioBuffer || audioBuffer.length < 1000) {
          try {
            const data = await axios.post("https://www.tikwm.com/api/", new URLSearchParams({ url: targetUrl, hd: 1 }), { timeout: 15000 });
            const playUrl = data.data?.data?.play;
            if (playUrl) audioBuffer = await fetchBuffer(playUrl);
          } catch {}
        }
        if (!audioBuffer || audioBuffer.length < 1000) return m.reply("❌ Could not download TikTok audio.");
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
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.reply(`Usage: ${config.PREFIX}ig <Instagram URL>`);
      if (!/instagram\.com|instagr\.am/i.test(targetUrl)) return m.reply("❌ Please provide a valid Instagram URL.");
      m.react("⏳");
      try {
        const result = await igDownload(targetUrl);
        if (!result) return m.reply("❌ Could not download Instagram media. The link may be private, expired, or the download servers are busy. Try again shortly.");
        const { buffer, type } = result;
        const caption = `📸 Instagram Download\n\n_${config.BOT_NAME}_`;
        if (type === "image") {
          await sock.sendMessage(m.chat, { image: buffer, caption }, { quoted: { key: m.key, message: m.message } });
        } else {
          await sock.sendMessage(m.chat, { video: buffer, caption }, { quoted: { key: m.key, message: m.message } });
        }
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
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.reply(`Usage: ${config.PREFIX}fb <Facebook URL>`);
      if (!/facebook\.com|fb\.watch|fb\.com/i.test(targetUrl)) return m.reply("❌ Please provide a valid Facebook URL.");
      m.react("⏳");
      try {
        let videoBuffer = await fbDownload(targetUrl);
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
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.reply(`Usage: ${config.PREFIX}twitter <Twitter/X URL>`);
      if (!/twitter\.com|x\.com/i.test(targetUrl)) return m.reply("❌ Please provide a valid Twitter/X URL.");
      m.react("⏳");
      try {
        let videoBuffer = await twitterDownload(targetUrl);
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
    name: ["spotify", "spdl"],
    category: "download",
    desc: "Download Spotify track",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.reply(`Usage: ${config.PREFIX}spotify <Spotify URL>`);
      m.react("⏳");
      try {
        if (!/spotify\.com/i.test(targetUrl)) return m.reply("❌ Please provide a Spotify URL.");
        let audioBuffer = null;
        try {
          const trackMatch = targetUrl.match(/track\/([a-zA-Z0-9]+)/);
          if (trackMatch) {
            // Get track title via Spotify oEmbed (no auth required)
            let searchQuery = "";
            try {
              const oembed = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(targetUrl)}`, { timeout: 10000 });
              if (oembed?.title) searchQuery = oembed.title;
            } catch {}
            if (!searchQuery) {
              // Fallback: try spotifydown metadata
              try {
                const meta = await fetchJson(`https://api.spotifydown.com/metadata/track/${trackMatch[1]}`, { timeout: 10000 });
                if (meta?.title) searchQuery = `${meta.title} ${meta.artists || ""}`;
              } catch {}
            }
            if (searchQuery) {
              const results = await play.search(searchQuery, { limit: 1, source: { youtube: "video" } }).catch(() => []);
              if (results.length) audioBuffer = await ytDownloadAudio(results[0].url);
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
    name: ["pinterest", "pintdl"],
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
            const list = images.slice(0, 10);
            const randomImg = pickNonRepeating(list, `${m.chat}:pin:${text.toLowerCase()}`, { maxHistory: Math.min(4, Math.max(1, list.length - 1)) });
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
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.reply(`Usage: ${config.PREFIX}mediafire <MediaFire URL>`);
      m.react("⏳");
      try {
        if (!/^https?:\/\/(www\.)?mediafire\.com\//i.test(targetUrl)) return m.reply("❌ Please provide a valid MediaFire URL.");
        const html = await axios.get(targetUrl, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" }, maxRedirects: 3 });
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

        let msg = `📱 *APK SEARCH*\n\n`;
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
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.reply(`Usage: ${config.PREFIX}gdrive <Google Drive URL>`);
      m.react("⏳");
      try {
        const match = targetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
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
    name: ["soundcloud", "scdl", "sc"],
    category: "download",
    desc: "Download from SoundCloud",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.reply(`Usage: ${config.PREFIX}soundcloud <SoundCloud URL>`);
      if (!/soundcloud\.com/i.test(targetUrl)) return m.reply("❌ Please provide a valid SoundCloud URL.");
      m.react("⏳");
      try {
        let audioBuffer = null;
        // 1. cobalt.tools
        try {
          const res = await axios.post(
            "https://api.cobalt.tools/api/json",
            { url: targetUrl },
            { timeout: 25000, headers: { Accept: "application/json", "Content-Type": "application/json" } }
          );
          const d = res.data;
          if ((d.status === "redirect" || d.status === "stream") && d.url) {
            audioBuffer = await fetchBuffer(d.url, { timeout: 60000 });
          }
        } catch {}
        // 2. scdl API fallback
        if (!audioBuffer || audioBuffer.length < 1000) {
          try {
            const res = await fetchJson(
              `https://api.scdl.cc/resolve?url=${encodeURIComponent(targetUrl)}`,
              { timeout: 15000 }
            );
            const dlUrl = res?.download_url || res?.stream_url;
            if (dlUrl) audioBuffer = await fetchBuffer(dlUrl, { timeout: 60000 });
          } catch {}
        }
        if (!audioBuffer || audioBuffer.length < 1000) return m.reply("❌ Could not download SoundCloud track. The link may be private or the servers are busy.");
        await sock.sendMessage(m.chat, { audio: audioBuffer, mimetype: "audio/mpeg" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download SoundCloud track.");
      }
    },
  },
  {
    name: ["reddit", "redditdl"],
    category: "download",
    desc: "Download Reddit video/image",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.reply(`Usage: ${config.PREFIX}reddit <Reddit URL>`);
      m.react("⏳");
      try {
        let mediaBuffer = null;
        let isVideo = true;
        // 1. cobalt.tools
        try {
          const res = await axios.post(
            "https://api.cobalt.tools/api/json",
            { url: targetUrl },
            { timeout: 25000, headers: { Accept: "application/json", "Content-Type": "application/json" } }
          );
          const d = res.data;
          if ((d.status === "redirect" || d.status === "stream") && d.url) {
            mediaBuffer = await fetchBuffer(d.url, { timeout: 60000 });
          }
          if (d.status === "picker" && d.picker?.length) {
            mediaBuffer = await fetchBuffer(d.picker[0].url, { timeout: 60000 });
            isVideo = d.picker[0].type !== "photo";
          }
        } catch {}
        // 2. Reddit JSON API fallback
        if (!mediaBuffer || mediaBuffer.length < 1000) {
          try {
            const jsonUrl = targetUrl.replace(/\/?$/, ".json");
            const data = await fetchJson(jsonUrl);
            const post = data?.[0]?.data?.children?.[0]?.data;
            if (post) {
              isVideo = !!post.secure_media?.reddit_video;
              const mediaUrl = post.secure_media?.reddit_video?.fallback_url || post.url_overridden_by_dest;
              if (mediaUrl) mediaBuffer = await fetchBuffer(mediaUrl);
            }
          } catch {}
        }
        if (!mediaBuffer || mediaBuffer.length < 1000) return m.reply("❌ Could not download Reddit media.");
        const caption = `🔴 Reddit Download\n\n_${config.BOT_NAME}_`;
        if (isVideo) {
          await sock.sendMessage(m.chat, { video: mediaBuffer, caption }, { quoted: { key: m.key, message: m.message } });
        } else {
          await sock.sendMessage(m.chat, { image: mediaBuffer, caption }, { quoted: { key: m.key, message: m.message } });
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Reddit media.");
      }
    },
  },
];

module.exports = { commands };
