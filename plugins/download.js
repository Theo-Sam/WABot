const config = require("../config");
const { fetchJson, fetchBuffer, postJson, isUrl, extractUrls, tempFile, pickNonRepeating } = require("../lib/helpers");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const axios = require("axios");
const play = require("play-dl");
const { endpoints } = require("../lib/endpoints");

const INVIDIOUS_INSTANCES = endpoints.youtube.invidiousInstances;

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

/**
 * Use yt-dlp to get a direct media URL from YouTube, then download it with axios.
 * Returns the buffer, or null on failure.
 */
async function ytDlpGetBuffer(url, formatSelector, maxBytes) {
  const ytdlpBin = findYtDlpBin();
  if (!ytdlpBin) return null;
  try {
    const directUrl = await new Promise((resolve, reject) => {
      execFile(ytdlpBin, [
        '--get-url', '--no-warnings', '--no-playlist',
        '-f', formatSelector,
        url,
      ], { timeout: 30000 }, (err, stdout) => {
        if (err) return reject(err);
        const line = stdout.trim().split('\n')[0];
        resolve(line || null);
      });
    });
    if (!directUrl) return null;
    const res = await axios.get(directUrl, {
      responseType: 'arraybuffer',
      timeout: 90000,
      maxContentLength: maxBytes || 50 * 1024 * 1024,
    });
    if (res.data?.byteLength > 1000) return Buffer.from(res.data);
  } catch (err) {
    console.error('[ytDlp] error:', err.message);
  }
  return null;
}

async function ytDownloadAudio(url) {
  // Primary: yt-dlp (reliable, handles YouTube bot checks)
  const buf = await ytDlpGetBuffer(url, 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best', 50 * 1024 * 1024);
  if (buf) return buf;
  // Fallback: play-dl
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
  // Primary: yt-dlp (reliable, handles YouTube bot checks)
  const buf = await ytDlpGetBuffer(url, 'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best[height<=720]', 80 * 1024 * 1024);
  if (buf) return buf;
  // Fallback: play-dl
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

/**
 * Resolve the yt-dlp binary — check local ./bin/ first, then common system paths.
 */
function findYtDlpBin() {
  const candidates = [
    path.join(__dirname, '..', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

/**
 * Extract the Instagram shortcode from a URL (works for /p/, /reel/, /tv/).
 */
function extractIgShortcode(url) {
  const m = String(url).match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/**
 * Download using yt-dlp. Tries with session cookie if INSTAGRAM_SESSION is set,
 * and also tries without auth for public content.
 */
function igDownloadYtDlp(url, withCookie) {
  return new Promise((resolve) => {
    const ytdlpBin = findYtDlpBin();
    if (!ytdlpBin) { resolve(null); return; }

    const sessionCookie = withCookie ? (process.env.INSTAGRAM_SESSION || null) : null;
    const tmpDir = os.tmpdir();
    const uniqueId = `ig_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const outTemplate = path.join(tmpDir, `${uniqueId}.%(ext)s`);

    const args = [
      '--quiet', '--no-warnings', '--no-playlist',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', outTemplate,
    ];

    let cookieFile = null;
    if (sessionCookie) {
      cookieFile = path.join(tmpDir, `${uniqueId}_cookies.txt`);
      const decodedSession = decodeURIComponent(sessionCookie);
      const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
      const cookieContent = [
        '# Netscape HTTP Cookie File',
        `.instagram.com\tTRUE\t/\tTRUE\t${expires}\tsessionid\t${decodedSession}`,
        `.cdninstagram.com\tTRUE\t/\tTRUE\t${expires}\tsessionid\t${decodedSession}`,
      ].join('\n');
      try { fs.writeFileSync(cookieFile, cookieContent); args.push('--cookies', cookieFile); } catch {}
    }
    args.push(url);

    execFile(ytdlpBin, args, { timeout: 90000 }, (err) => {
      if (cookieFile) try { fs.unlinkSync(cookieFile); } catch {}
      if (err && err.killed) { console.error('[igDownload] yt-dlp timed out'); resolve(null); return; }

      let found = null;
      try {
        const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(uniqueId) && !f.endsWith('_cookies.txt'));
        if (files.length > 0) {
          const filePath = path.join(tmpDir, files[0]);
          const buffer = fs.readFileSync(filePath);
          try { fs.unlinkSync(filePath); } catch {}
          const ext = path.extname(files[0]).toLowerCase();
          const type = ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext) ? 'video' : 'image';
          if (buffer.length > 1000) found = { buffer, type };
        }
      } catch (readErr) {
        console.error('[igDownload] yt-dlp file read error:', readErr.message);
      }
      resolve(found);
    });
  });
}

/**
 * Free third-party scraper APIs — no auth needed, work for public posts/reels.
 * Tries multiple services in parallel and returns the first successful result.
 */
async function igDownloadFreeApi(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
  };

  const tryApis = [
    // SaveIG
    async () => {
      const res = await axios.post(
        'https://saveig.app/api/ajaxSearch',
        `q=${encodeURIComponent(url)}&t=media&lang=en`,
        { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://saveig.app', 'Referer': 'https://saveig.app/' }, timeout: 15000 }
      );
      const links = res.data?.data?.url || [];
      const video = links.find(l => l.type === 'mp4' || l.type === 'video');
      const image = links.find(l => l.type === 'jpg' || l.type === 'image' || l.url?.includes('.jpg'));
      const pick = video || image;
      if (!pick?.url) return null;
      const buf = await fetchBuffer(pick.url, { timeout: 60000 });
      return buf?.length > 1000 ? { buffer: buf, type: video ? 'video' : 'image' } : null;
    },
    // SnapInsta
    async () => {
      const res = await axios.post(
        'https://snapinsta.app/api/ajaxSearch',
        `q=${encodeURIComponent(url)}&t=media&lang=en`,
        { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://snapinsta.app', 'Referer': 'https://snapinsta.app/' }, timeout: 15000 }
      );
      const links = res.data?.data?.url || [];
      const video = links.find(l => l.type === 'mp4' || l.type === 'video');
      const image = links.find(l => l.type === 'jpg' || l.type === 'image' || l.url?.includes('.jpg'));
      const pick = video || image;
      if (!pick?.url) return null;
      const buf = await fetchBuffer(pick.url, { timeout: 60000 });
      return buf?.length > 1000 ? { buffer: buf, type: video ? 'video' : 'image' } : null;
    },
    // Insta-Downloader API (JSON endpoint)
    async () => {
      const res = await axios.get(
        `https://api.instadownloader.org/v1/?url=${encodeURIComponent(url)}`,
        { headers, timeout: 15000 }
      );
      const media = res.data?.media || res.data?.url;
      const mediaUrl = Array.isArray(media) ? media[0]?.url : (typeof media === 'string' ? media : null);
      if (!mediaUrl) return null;
      const isVideo = mediaUrl.includes('.mp4') || res.data?.type === 'video';
      const buf = await fetchBuffer(mediaUrl, { timeout: 60000 });
      return buf?.length > 1000 ? { buffer: buf, type: isVideo ? 'video' : 'image' } : null;
    },
  ];

  for (const tryApi of tryApis) {
    try {
      const result = await tryApi();
      if (result) return result;
    } catch {}
  }
  return null;
}

/**
 * Main Instagram download orchestrator.
 * Order: yt-dlp with session → free APIs → yt-dlp without session.
 */
async function igDownload(url) {
  const cleanUrl = normalizeInputUrl(url).split("?")[0].replace(/\/$/, "") + "/";
  const sessionCookie = process.env.INSTAGRAM_SESSION;

  // 1. yt-dlp with session cookie (most reliable when auth is available)
  if (sessionCookie && findYtDlpBin()) {
    try {
      const result = await igDownloadYtDlp(cleanUrl, true);
      if (result) return result;
    } catch (err) {
      console.error('[igDownload] yt-dlp+cookie error:', err.message);
    }
  }

  // 2. Free third-party scraper APIs (no auth, works for most public posts/reels)
  try {
    const result = await igDownloadFreeApi(cleanUrl);
    if (result) return result;
  } catch (err) {
    console.error('[igDownload] free API error:', err.message);
  }

  // 3. yt-dlp without session (last resort for public content)
  if (!sessionCookie && findYtDlpBin()) {
    try {
      const result = await igDownloadYtDlp(cleanUrl, false);
      if (result) return result;
    } catch (err) {
      console.error('[igDownload] yt-dlp no-cookie error:', err.message);
    }
  }

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
    const fbDownloader = require('facebook-video-downloader');
    const info = await fbDownloader.getInfo(url);
    if (info && info.links && info.links.length > 0 && info.links[0].url) {
      const buf = await fetchBuffer(info.links[0].url, { timeout: 60000 });
      if (buf?.length > 1000) return buf;
    }
  } catch (err) {
    console.error('[fbDownload] facebook-video-downloader error:', err);
  }
  return null;
}

async function twitterDownload(url) {
  // 1. cobalt.tools
  try {
    const d = await postJson(
      endpoints.download.cobaltApiJson,
      { url },
      { timeout: 25000, headers: { Accept: "application/json", "Content-Type": "application/json" } }
    );
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
      const data = await fetchJson(`${endpoints.download.vxTwitterApiBase}/Twitter/status/${tweetId}`, { timeout: 15000 });
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
      const data = await fetchJson(`${endpoints.download.fxTwitterApiBase}/Twitter/status/${tweetId}`, { timeout: 15000 });
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
    name: ["play", "song", "music", "p", "m"],
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
        try {
          const res = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`);
          if (res && res.data && res.data.play) {
            videoBuffer = await fetchBuffer(res.data.play, { timeout: 60000 });
          }
        } catch (err) {
          console.error('[TikTok Download] tikwm error:', err);
        }
        if (!videoBuffer || videoBuffer.length < 1000) return m.reply("❌ Could not download TikTok video. The link may be expired, region-locked, or TikTok changed their endpoints.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `📱 TikTok Download\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply("❌ Failed to download TikTok video.");
        console.error('[TikTok Download] General error:', err);
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
        try {
          const res = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`);
          if (res && res.data && res.data.music) {
            audioBuffer = await fetchBuffer(res.data.music, { timeout: 60000 });
          }
        } catch (err) {
          console.error('[TikTok Audio Download] tikwm error:', err);
        }
        if (!audioBuffer || audioBuffer.length < 1000) return m.reply("❌ Could not download TikTok audio.");
        await sock.sendMessage(m.chat, { audio: audioBuffer, mimetype: "audio/aac" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply("❌ Failed to download TikTok audio.");
        console.error('[TikTok Audio Download] General error:', err);
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
        if (!result) {
          const hint = process.env.INSTAGRAM_SESSION
            ? "❌ Could not download. The post may be private, age-restricted, or removed."
            : "❌ Could not download. Instagram requires login for most content.\n\nTo enable downloads, add your Instagram session cookie to the bot's settings:\n*INSTAGRAM_SESSION=<your sessionid value>*\n\n_Get it from your browser's cookies at instagram.com_";
          return m.reply(hint);
        }
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
              // Fallback: derive a searchable title from URL path when metadata APIs are unavailable.
              const slug = targetUrl.split("/track/")[1]?.split("?")[0] || "";
              if (slug) searchQuery = slug.replace(/[-_]+/g, " ");
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
            imgBuffer = await fetchBuffer(`${endpoints.images.randomFallbackBase}/1080x1080/?${encodeURIComponent(text)}`);
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
    desc: "Search APK from Google Play Store",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}apk <app name>`);
      m.react("⏳");
      try {
        const { default: gplay } = require("google-play-scraper");
        const results = await gplay.search({ term: text, num: 5 });
        if (!results || results.length === 0) {
          return m.reply(
            `❌ No apps found for *${text}*.\n\n` +
            `🔗 Search manually:\n` +
            `• https://play.google.com/store/search?q=${encodeURIComponent(text)}&c=apps\n` +
            `• https://apkpure.com/search?q=${encodeURIComponent(text)}`
          );
        }
        let msg = `📱 *APK SEARCH RESULTS*\n\n🔎 Query: *${text}*\n\n`;
        results.forEach((app, i) => {
          msg += `${i + 1}. *${app.title}*\n`;
          msg += `   👤 Developer: ${app.developer}\n`;
          if (app.scoreText) msg += `   ⭐ Rating: ${app.scoreText}/5\n`;
          if (app.summary) msg += `   📝 ${app.summary}\n`;
          msg += `   💰 Price: ${app.free === false && app.price ? app.price : "Free"}\n`;
          msg += `   🔗 Play Store: ${app.url}\n`;
          msg += `   📦 APKPure: https://apkpure.com/${app.appId.replace(/\./g, '-')}/${app.appId}\n`;
          msg += `\n`;
        });
        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch (err) {
        console.error("[apk] error:", err.message);
        m.react("❌");
        await m.reply("❌ Failed to search APK. Please try again.");
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
          const d = await postJson(
            endpoints.download.cobaltApiJson,
            { url: targetUrl },
            { timeout: 25000, headers: { Accept: "application/json", "Content-Type": "application/json" } }
          );
          if ((d.status === "redirect" || d.status === "stream") && d.url) {
            audioBuffer = await fetchBuffer(d.url, { timeout: 60000 });
          }
        } catch {}
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
          const d = await postJson(
            endpoints.download.cobaltApiJson,
            { url: targetUrl },
            { timeout: 25000, headers: { Accept: "application/json", "Content-Type": "application/json" } }
          );
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
