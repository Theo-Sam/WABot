const config = require("../config");
const { fetchJson, fetchBuffer, postJson, isUrl, extractUrls, tempFile, pickNonRepeating } = require("../lib/helpers");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile, execFile: execFileRaw } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFileRaw);
const axios = require("axios");
const play = require("play-dl");
const { endpoints } = require("../lib/endpoints");
const FileType = require("file-type");

const INVIDIOUS_INSTANCES = endpoints.youtube.invidiousInstances;

// Max duration for search results — prevents downloading DJ mixes / compilations (>25 min)
const SEARCH_MAX_DURATION_SEC = 25 * 60;

async function ytSearch(query) {
  // ── play-dl (primary) ─────────────────────────────────────────────────────
  // Certain queries trigger a play-dl bug where YouTube returns a Browse result
  // (e.g., an artist page / genre shelf) and play-dl crashes reading browseId.
  // Workaround: retry with a suffixed query that forces YouTube to return
  // standard video search results instead.
  const mapPlayDlResults = (results) => {
    const mapped = results.map(v => ({
      url: v.url,
      title: v.title || query,
      thumbnail: v.thumbnails?.[0]?.url || "",
      duration: v.durationRaw || "",
      durationSec: v.durationInSec || 0,
      views: v.views?.toLocaleString() || "",
      author: v.channel?.name || "",
      videoId: v.id,
    }));
    // Prefer videos ≤25 min; fall back to first result only if everything is longer
    const short = mapped.filter(v => v.durationSec > 0 && v.durationSec <= SEARCH_MAX_DURATION_SEC);
    return short.length ? short : mapped.slice(0, 1);
  };

  // Attempt 1: original query
  try {
    const results = await play.search(query, { limit: 8, source: { youtube: "video" } });
    if (results.length) return mapPlayDlResults(results);
  } catch (err) {
    if (!err.message?.includes("browseId")) {
      console.error("[ytSearch] play-dl error:", err.message);
    } else {
      // Attempt 2+: browseId crash happens when YouTube returns an artist/genre page.
      // Retry with suffixes that force standard video search results.
      const retrySuffixes = [" songs", " official video", " music video 2024"];
      for (const suffix of retrySuffixes) {
        try {
          const results2 = await play.search(`${query}${suffix}`, { limit: 8, source: { youtube: "video" } });
          if (results2.length) return mapPlayDlResults(results2);
        } catch {}
      }
    }
  }

  // ── Invidious fallback ────────────────────────────────────────────────────
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const data = await fetchJson(`${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { timeout: 10000 });
      const videos = Array.isArray(data) ? data.filter(v => v.type === "video" && (!v.lengthSeconds || v.lengthSeconds <= SEARCH_MAX_DURATION_SEC)) : [];
      if (videos.length) {
        return videos.map(v => ({
          url: `https://youtube.com/watch?v=${v.videoId}`,
          title: v.title,
          thumbnail: v.videoThumbnails?.[0]?.url || "",
          duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${String(v.lengthSeconds % 60).padStart(2, "0")}` : "",
          durationSec: v.lengthSeconds || 0,
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
 * Locate a YouTube cookies.txt file in the bot root directory.
 * If found, yt-dlp uses it to authenticate — this unlocks the `web` client
 * and bypasses most IP-based restrictions on VPS hosts.
 * Place cookies.txt or youtube-cookies.txt in the same folder as index.js.
 */
function findCookiesFile() {
  const botRoot = path.join(__dirname, '..');
  const candidates = [
    path.join(botRoot, 'cookies.txt'),
    path.join(botRoot, 'youtube-cookies.txt'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 100) {
        console.log(`[ytDlp] Using cookies file: ${p}`);
        return p;
      }
    } catch {}
  }
  return null;
}

/**
 * Use yt-dlp to download media directly to a temp file, then read it into a buffer.
 * This avoids the signed-URL IP-restriction problem from using --get-url + axios.
 */
async function ytDlpDownloadToBuffer(url, extraArgs, tmpExt, timeoutMs = 120000) {
  const ytdlpBin = findYtDlpBin();
  if (!ytdlpBin) {
    console.error('[ytDlp] yt-dlp binary not found — checked ./bin/yt-dlp, /usr/local/bin/yt-dlp, /usr/bin/yt-dlp');
    return null;
  }
  const tmpPath = tempFile(tmpExt);
  const cookiesFile = findCookiesFile();

  // Only inject the YouTube Android User-Agent for actual YouTube URLs.
  // SoundCloud, Twitch, and other platforms reject it — causing silent download failures.
  const isYouTubeUrl = /youtube\.com|youtu\.be/i.test(url);
  const BASE_ARGS = [
    '--no-warnings', '--no-playlist',
    '--geo-bypass',
    '--extractor-retries', '3',
    '--fragment-retries', '3',
    '--retry-sleep', '2',
    '--force-ipv4',
    ...(isYouTubeUrl ? ['--user-agent', 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'] : []),
    ...(cookiesFile ? ['--cookies', cookiesFile] : []),
  ];

  // Track any alternate path yt-dlp may have written (e.g. tmpPath.opus when ext is .m4a)
  let altPath = null;
  try {
    await new Promise((resolve, reject) => {
      const proc = execFile(ytdlpBin, [
        ...BASE_ARGS,
        ...extraArgs,
        '-o', tmpPath,
        url,
      ], { timeout: timeoutMs }, (err) => {
        if (err) reject(err);
        else resolve();
      });
      // Capture stderr so the real error is visible in logs
      let stderrBuf = '';
      proc.stderr?.on('data', (d) => { stderrBuf += d; });
      proc.on('close', (code) => {
        if (code !== 0 && stderrBuf.trim()) {
          console.error('[ytDlp] stderr:', stderrBuf.trim().slice(0, 800));
        }
      });
    });

    // Primary check: exact output path
    if (fs.existsSync(tmpPath)) {
      const buf = fs.readFileSync(tmpPath);
      if (buf.length > 1000) return buf;
      console.error('[ytDlp] output file too small (%d bytes) — download likely failed silently', buf.length);
    } else {
      // yt-dlp sometimes appends the real extension (e.g. writes foo.m4a.opus instead of foo.m4a)
      // Scan the temp dir for any file that starts with our tmpPath basename
      try {
        const dir = path.dirname(tmpPath);
        const base = path.basename(tmpPath);
        const siblings = fs.readdirSync(dir).filter(f => f !== base && f.startsWith(base + '.'));
        if (siblings.length) {
          altPath = path.join(dir, siblings[0]);
          const buf = fs.readFileSync(altPath);
          if (buf.length > 1000) {
            console.log(`[ytDlp] found alternate output: ${siblings[0]}`);
            return buf;
          }
        }
      } catch {}
      console.error('[ytDlp] output file missing after yt-dlp ran — check stderr above');
    }
  } catch (err) {
    console.error('[ytDlp] download error:', err.message?.slice(0, 300));
  } finally {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    try { if (altPath && fs.existsSync(altPath)) fs.unlinkSync(altPath); } catch {}
  }
  return null;
}

/**
 * Strip YouTube-specific title suffixes before passing to SoundCloud search.
 * "Lasmid - Puul (Official Video)" → "Lasmid - Puul"
 * SoundCloud tracks don't have these tags so they cause wrong matches.
 */
function cleanTitleForSoundCloud(title) {
  return (title || '')
    .replace(/\(Official\s*(Music\s*)?Video\)/gi, '')
    .replace(/\(Official\s*(Audio|Lyric[s]?)\)/gi, '')
    .replace(/\(Lyric[s]?\s*Video\)/gi, '')
    .replace(/\(Audio\)/gi, '')
    .replace(/\(Video\)/gi, '')
    .replace(/\(HD\)/gi, '')
    .replace(/\(4K\)/gi, '')
    .replace(/\(ft\.[^)]*\)/gi, '')
    .replace(/\(feat\.[^)]*\)/gi, '')
    .replace(/\[Official[^\]]*\]/gi, '')
    .replace(/\|\s*Official.*$/gi, '')
    .replace(/\s*[-–]\s*Official\s*(Music\s*)?Video.*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the YouTube video ID from any YouTube URL format.
 */
function ytVideoId(url) {
  const m = String(url).match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * External API fallbacks for YouTube audio download.
 * Used when ALL yt-dlp player clients fail (e.g. VPS IP is rate-limited by YouTube).
 * Chain: SoundCloud search → Invidious proxy → cobalt instances → yt-download.org → loader.to
 *
 * @param {string} url           - YouTube URL
 * @param {string} [searchQuery] - Song title/query for SoundCloud search (most reliable fallback)
 */
async function ytAudioExternalFallback(url, searchQuery) {
  const vid = ytVideoId(url);
  if (!vid) return null;

  // ── 0. SoundCloud (via yt-dlp scsearch) ───────────────────────────────────
  // SoundCloud is NOT IP-restricted like YouTube. As long as yt-dlp itself works,
  // this succeeds even on VPS IPs fully blocked by YouTube.
  // Clean the query first — SoundCloud doesn't have "(Official Video)" etc.
  const rawQuery = searchQuery || await (async () => {
    try {
      const oe = await fetchJson(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { timeout: 6000 }
      );
      return oe?.title || null;
    } catch { return null; }
  })();
  const scQuery = rawQuery ? cleanTitleForSoundCloud(rawQuery) : null;

  if (scQuery) {
    try {
      console.log(`[ytAudio] trying SoundCloud: "${scQuery.slice(0, 60)}"`);
      const buf = await ytDlpDownloadToBuffer(
        `scsearch1:${scQuery}`,
        ['-f', 'bestaudio', '--no-part', '--no-warnings'],
        'm4a'
      );
      if (buf?.length > 10000) { console.log('[ytAudio] SoundCloud OK'); return buf; }
    } catch (e) { console.error('[ytAudio] SoundCloud error:', e.message?.slice(0, 100)); }
  }

  // ── 1a. Invidious /latest_version proxy (simpler than JSON API, often works when API fails) ──
  // This endpoint streams the raw YouTube content through the Invidious server.
  // itag 140 = m4a audio ~128kbps (pre-built, no merge needed).
  // Timeout: 20s — if an instance is unreachable it should fail fast, not hang for 2 minutes.
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const proxyUrl = `${instance}/latest_version?id=${vid}&itag=140&local=true`;
      console.log(`[ytAudio] trying Invidious /latest_version: ${instance}`);
      const buf = await fetchBuffer(proxyUrl, { timeout: 20000 });
      if (buf?.length > 10000) { console.log(`[ytAudio] Invidious /latest_version ${instance} OK`); return buf; }
    } catch (e) { console.error(`[ytAudio] Invidious /latest_version ${instance} error:`, e.message?.slice(0, 80)); }
  }

  // ── 1b. Invidious JSON API (full format list) ──────────────────────────────
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`[ytAudio] trying Invidious API: ${instance}`);
      const data = await fetchJson(`${instance}/api/v1/videos/${vid}?local=true`, { timeout: 10000 });
      const audioFormats = (data?.adaptiveFormats || [])
        .filter(f => f.type?.startsWith('audio/') && f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (audioFormats.length) {
        const audioUrl = audioFormats[0].url;
        console.log('[ytAudio] Invidious API got audio URL, downloading...');
        const buf = await fetchBuffer(audioUrl, { timeout: 25000 });
        if (buf?.length > 10000) { console.log(`[ytAudio] Invidious API ${instance} OK`); return buf; }
      }
    } catch (e) { console.error(`[ytAudio] Invidious API ${instance} error:`, e.message?.slice(0, 100)); }
  }

  // ── 2. cobalt.tools (public instance — no auth, audio mode) ───────────────
  // Some cobalt self-hosted instances don't require JWT. Try a few known ones.
  const cobaltInstances = [
    'https://co.wuk.sh',
    'https://cobalt.tools',
    'https://api.cobalt.tools',
  ];
  for (const cobaltBase of cobaltInstances) {
    try {
      console.log(`[ytAudio] trying cobalt: ${cobaltBase}`);
      const d = await postJson(
        `${cobaltBase}/api/json`,
        { url, isAudioOnly: true, aFormat: 'mp3' },
        { timeout: 20000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
      );
      const dlUrl = d?.url;
      if (dlUrl && (d?.status === 'redirect' || d?.status === 'stream' || d?.status === 'tunnel')) {
        const buf = await fetchBuffer(dlUrl, { timeout: 90000 });
        if (buf?.length > 10000) { console.log(`[ytAudio] cobalt ${cobaltBase} OK`); return buf; }
      }
    } catch (e) { console.error(`[ytAudio] cobalt ${cobaltBase} error:`, e.message?.slice(0, 100)); }
  }

  // ── 3. yt-download.org public API ─────────────────────────────────────────
  try {
    console.log('[ytAudio] trying yt-download.org...');
    const data = await fetchJson(`https://yt-download.org/api/button/mp3/${vid}`, { timeout: 20000 });
    const link = data?.link || data?.url || data?.dl_url;
    if (link) {
      const buf = await fetchBuffer(link, { timeout: 90000 });
      if (buf?.length > 10000) { console.log('[ytAudio] yt-download.org OK'); return buf; }
    }
  } catch (e) { console.error('[ytAudio] yt-download.org error:', e.message?.slice(0, 100)); }

  // ── 4. loader.to (polling, if endpoint recovers) ──────────────────────────
  try {
    console.log('[ytAudio] trying loader.to...');
    const init = await fetchJson(
      `https://loader.to/api/button/?url=${encodeURIComponent(url)}&f=mp3`,
      { timeout: 20000 }
    );
    const jobId = init?.id;
    if (jobId) {
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const prog = await fetchJson(`https://loader.to/api/progress/?id=${jobId}`, { timeout: 15000 });
        const dlUrl = prog?.download_url || prog?.dl_url;
        if (dlUrl) {
          const buf = await fetchBuffer(dlUrl, { timeout: 90000 });
          if (buf?.length > 10000) { console.log('[ytAudio] loader.to OK'); return buf; }
          break;
        }
        if (prog?.status === 'error' || prog?.error) break;
      }
    }
  } catch (e) { console.error('[ytAudio] loader.to error:', e.message?.slice(0, 100)); }

  return null;
}

/**
 * Download YouTube audio via external API fallbacks only.
 *
 * yt-dlp YouTube clients are skipped entirely — VPS IP is blocked by YouTube.
 * Chain: SoundCloud (yt-dlp scsearch) → Invidious proxy → cobalt → yt-download.org → loader.to
 *
 * @param {string} url           - YouTube URL
 * @param {string} [searchQuery] - Song title/query to pass to SoundCloud fallback
 */
async function ytDownloadAudio(url, searchQuery) {
  console.log('[ytAudio] skipping yt-dlp YouTube clients (VPS IP blocked) — going straight to external fallbacks');
  return ytAudioExternalFallback(url, searchQuery || null);
}

/**
 * External API fallbacks for YouTube video download.
 * Used when ALL yt-dlp player clients fail on the VPS.
 * Chain: Invidious formatStreams → cobalt instances → SaveFrom.net → yt-download.org
 *
 * @param {string} url           - YouTube URL
 * @param {string} [searchQuery] - Video title (reserved for future platform-specific search)
 */
async function ytVideoExternalFallback(url, searchQuery) {
  const vid = ytVideoId(url);
  if (!vid) return null;

  // ── 1a. Invidious /latest_version proxy (bypass JSON API — streams raw content through server) ─
  // itag 22 = 720p progressive MP4 (video+audio, pre-merged)
  // itag 18 = 360p progressive MP4 (video+audio, pre-merged, smaller)
  // Timeout: 25s — unreachable instances should bail fast, not hang for 2 min each.
  for (const itag of [22, 18]) {
    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const proxyUrl = `${instance}/latest_version?id=${vid}&itag=${itag}&local=true`;
        console.log(`[ytVideo] trying Invidious /latest_version itag=${itag}: ${instance}`);
        const buf = await fetchBuffer(proxyUrl, { timeout: 25000 });
        if (buf?.length > 50000) { console.log(`[ytVideo] Invidious /latest_version ${instance} itag=${itag} OK`); return buf; }
      } catch (e) { console.error(`[ytVideo] Invidious /latest_version ${instance} error:`, e.message?.slice(0, 80)); }
    }
  }

  // ── 1b. Invidious JSON API (full formatStreams list) ──────────────────────
  // formatStreams contains pre-muxed video+audio — no DASH, no ffmpeg merge needed.
  // We prefer 720p → 480p → 360p to stay within the 60 MB WhatsApp limit.
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`[ytVideo] trying Invidious formatStreams API: ${instance}`);
      const data = await fetchJson(`${instance}/api/v1/videos/${vid}?local=true`, { timeout: 10000 });

      // formatStreams: pre-merged progressive formats (360p, 720p)
      const streams = (data?.formatStreams || []).filter(f => f.url && f.container === 'mp4');
      const preferred = ['hd720', '720p60', '720p', '480p', '360p'];
      const sorted = [...streams].sort((a, b) => {
        const ai = preferred.indexOf(a.qualityLabel);
        const bi = preferred.indexOf(b.qualityLabel);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      if (sorted.length) {
        const chosen = sorted[0];
        console.log(`[ytVideo] Invidious API ${instance} — downloading ${chosen.qualityLabel}...`);
        const buf = await fetchBuffer(chosen.url, { timeout: 30000 });
        if (buf?.length > 50000) { console.log(`[ytVideo] Invidious API ${instance} OK`); return buf; }
      }
    } catch (e) { console.error(`[ytVideo] Invidious API ${instance} error:`, e.message?.slice(0, 100)); }
  }

  // ── 2. cobalt.tools instances ─────────────────────────────────────────────
  const cobaltInstances = ['https://co.wuk.sh', 'https://cobalt.tools', 'https://api.cobalt.tools'];
  for (const cobaltBase of cobaltInstances) {
    try {
      console.log(`[ytVideo] trying cobalt: ${cobaltBase}`);
      const d = await postJson(
        `${cobaltBase}/api/json`,
        { url, vQuality: '720', isAudioMuted: false },
        { timeout: 20000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
      );
      const dlUrl = d?.url;
      if (dlUrl && (d?.status === 'redirect' || d?.status === 'stream' || d?.status === 'tunnel')) {
        const buf = await fetchBuffer(dlUrl, { timeout: 120000 });
        if (buf?.length > 50000) { console.log(`[ytVideo] cobalt ${cobaltBase} OK`); return buf; }
      }
    } catch (e) { console.error(`[ytVideo] cobalt ${cobaltBase} error:`, e.message?.slice(0, 100)); }
  }

  // ── 3. SaveFrom.net scraper ────────────────────────────────────────────────
  // savefrom.net routes downloads through their own servers — bypasses VPS IP restrictions.
  try {
    console.log('[ytVideo] trying SaveFrom.net...');
    const sfRes = await fetchJson(
      `https://sfrom.me/api/button?url=${encodeURIComponent(url)}`,
      { timeout: 20000 }
    );
    const sfUrl = sfRes?.url || sfRes?.data?.url;
    if (sfUrl && typeof sfUrl === 'string' && sfUrl.startsWith('http')) {
      const buf = await fetchBuffer(sfUrl, { timeout: 120000 });
      if (buf?.length > 50000) { console.log('[ytVideo] SaveFrom.net OK'); return buf; }
    }
    // Sometimes returns an array of formats
    const sfLinks = sfRes?.links || sfRes?.data?.links;
    if (Array.isArray(sfLinks) && sfLinks.length) {
      const mp4Link = sfLinks.find(l => l.ext === 'mp4' || /mp4/i.test(l.type || '')) || sfLinks[0];
      const linkUrl = mp4Link?.url;
      if (linkUrl && linkUrl.startsWith('http')) {
        const buf = await fetchBuffer(linkUrl, { timeout: 120000 });
        if (buf?.length > 50000) { console.log('[ytVideo] SaveFrom.net (links) OK'); return buf; }
      }
    }
  } catch (e) { console.error('[ytVideo] SaveFrom.net error:', e.message?.slice(0, 100)); }

  // ── 4. yt-download.org video API ─────────────────────────────────────────
  try {
    console.log('[ytVideo] trying yt-download.org...');
    const data = await fetchJson(`https://yt-download.org/api/button/videos/${vid}`, { timeout: 20000 });
    // Returns { link: "...", links: [{quality, link}] }
    const links = data?.links || [];
    const preferred = links.find(l => /360|480|720/.test(l.quality || '')) || links[0];
    const dlUrl = preferred?.link || data?.link;
    if (dlUrl) {
      const buf = await fetchBuffer(dlUrl, { timeout: 120000 });
      if (buf?.length > 50000) { console.log('[ytVideo] yt-download.org OK'); return buf; }
    }
  } catch (e) { console.error('[ytVideo] yt-download.org error:', e.message?.slice(0, 100)); }

  return null;
}

/**
 * Download YouTube video via external API fallbacks only.
 *
 * yt-dlp YouTube clients are skipped entirely — VPS IP is blocked by YouTube.
 * Chain: Invidious /latest_version → Invidious JSON API → cobalt → SaveFrom.net → yt-download.org
 *
 * @param {string} url           - YouTube URL
 * @param {string} [searchQuery] - Video title (passed to external fallback chain)
 */
async function ytDownloadVideo(url, searchQuery) {
  console.log('[ytVideo] skipping yt-dlp YouTube clients (VPS IP blocked) — going straight to external fallbacks');
  return ytVideoExternalFallback(url, searchQuery || null);
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
 * Guess media type from a URL string (fallback only).
 */
function igGuessType(u) {
  return (u.includes('.mp4') || u.includes('video') || u.includes('reel')) ? 'video' : 'image';
}

const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/avi', 'video/x-msvideo', 'video/3gpp', 'video/3gpp2', 'video/mpeg']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']);

/**
 * Locate the ffmpeg binary for video conversion.
 */
function findFfmpegBin() {
  const candidates = ['/run/current-system/sw/bin/ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
  for (const p of candidates) {
    try { if (p === 'ffmpeg' || fs.existsSync(p)) return p; } catch {}
  }
  return 'ffmpeg';
}

/**
 * Convert any video buffer to MP4 (H.264 + AAC) using ffmpeg.
 * Returns a new buffer on success, or the original buffer if conversion fails.
 */
async function convertBufferToMp4(buf) {
  const inputPath = tempFile('input');
  const outputPath = tempFile('mp4');
  try {
    fs.writeFileSync(inputPath, buf);
    const ffmpegBin = findFfmpegBin();
    await execFileAsync(ffmpegBin, [
      '-y', '-i', inputPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '28',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-f', 'mp4', outputPath
    ], { timeout: 60000 });
    if (fs.existsSync(outputPath)) {
      const converted = fs.readFileSync(outputPath);
      if (converted.length > 1000) return converted;
    }
  } catch (e) {
    console.error('[igConvert] ffmpeg conversion failed:', e.message?.slice(0, 200));
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
  return buf;
}

/**
 * Fetch one media URL into a buffer, returning { buffer, type, mimetype } or null.
 * Uses file-type for accurate MIME detection instead of URL guessing.
 */
async function igFetchItem(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== 'string') return null;
  try {
    const buf = await fetchBuffer(mediaUrl, { timeout: 60000 });
    if (!buf || buf.length < 1000) return null;

    const ft = await FileType.fromBuffer(buf);
    const mimetype = ft?.mime || null;

    let type;
    if (mimetype && VIDEO_MIMES.has(mimetype)) {
      type = 'video';
    } else if (mimetype && IMAGE_MIMES.has(mimetype)) {
      type = 'image';
    } else {
      type = igGuessType(mediaUrl);
    }

    // If it's a video but not MP4, convert it so WhatsApp can play it
    if (type === 'video' && mimetype && mimetype !== 'video/mp4') {
      console.log(`[igFetchItem] Converting ${mimetype} → mp4`);
      const converted = await convertBufferToMp4(buf);
      return { buffer: converted, type: 'video', mimetype: 'video/mp4' };
    }

    return { buffer: buf, type, mimetype: mimetype || (type === 'video' ? 'video/mp4' : 'image/jpeg') };
  } catch { return null; }
}

/**
 * Decode the obfuscated JavaScript response returned by snapsave.app and rapidsave.com.
 *
 * Their action.php returns: eval(function(h,u,n,t,e,r){...}("ENCODED",u,"nStr",t,e,r))
 * The encoded string is a custom base-N encoding. This function reverses it to get
 * the plain HTML containing download links.
 *
 * Returns an array of media URLs found in the decoded HTML, or [] on failure.
 */
function decodeSnapsaveResponse(body) {
  try {
    const m = String(body).match(/\}\("([^"]+)",\s*\d+,\s*"([^"]+)",\s*(\d+),\s*(\d+),\s*\d+\)\)/);
    if (!m) return [];
    const [, encoded, tokenStr, tStr, eStr] = m;
    const t = parseInt(tStr, 10);
    const e = parseInt(eStr, 10);
    const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
    const fromAlpha = ALPHA.slice(0, e);

    function toBase10(s) {
      return s.split('').reverse().reduce((acc, ch, idx) => {
        const pos = fromAlpha.indexOf(ch);
        return pos !== -1 ? acc + pos * Math.pow(e, idx) : acc;
      }, 0);
    }

    const delimiter = tokenStr[e];
    let result = '';
    let i = 0;
    while (i < encoded.length) {
      let chunk = '';
      while (i < encoded.length && encoded[i] !== delimiter) { chunk += encoded[i++]; }
      i++;
      for (let j = 0; j < tokenStr.length; j++) {
        chunk = chunk.split(tokenStr[j]).join(String(j));
      }
      const code = toBase10(chunk) - t;
      if (code > 0 && code < 65535) result += String.fromCharCode(code);
    }

    const html = (() => { try { return decodeURIComponent(escape(result)); } catch { return result; } })();

    // If decoded to an error message, return nothing
    if (html.includes('Unable to connect') || html.includes('error_api_get_instagram')) return [];

    // Extract href links from decoded HTML — these are the direct CDN download URLs
    const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
    const srcs  = [...html.matchAll(/src="(https?:\/\/[^"]+\.(?:mp4|jpg|jpeg|png|webp)[^"]*)"/g)].map(m => m[1]);
    const all = [...hrefs, ...srcs].filter(u => u && !u.includes('snapsave.app') && !u.includes('rapidsave.com'));
    // Videos first
    return [
      ...all.filter(u => u.includes('.mp4') || u.includes('video')),
      ...all.filter(u => !u.includes('.mp4') && !u.includes('video')),
    ];
  } catch {
    return [];
  }
}

/**
 * Download Instagram media using a comprehensive chain of free public APIs.
 *
 * Services tried in order (no login / no session required):
 *   1.  snapsave.app                 — popular scraper with JS-encoded response (decoded server-side)
 *   2.  rapidsave.com                — snapsave clone with same JS encoding
 *   3.  snapinsta.app                — SnapInsta public scraper (ajaxSearch API)
 *   4.  saveig.app                   — SaveIG public scraper (ajaxSearch API)
 *   5.  saveinsta.app                — SaveInsta public scraper (ajaxSearch API)
 *   6.  igram.world                  — igram.io mirror, no-auth scraper
 *   7.  sssinstagram.com             — SSS Instagram scraper (ajaxSearch API)
 *   8.  api.nyxs.pw                  — Nyxs community API (JSON)
 *   9.  RapidAPI services            — Instagram downloaders (needs RAPIDAPI_KEY env var)
 *       - All-in-One Social Downloader (SaverAPI.net)
 *       - Social Saver API
 *       - Instagram Post/Reels/Stories Downloader (diyorbekkanal)
 *       - Instagram Video Downloader (skdeveloper)
 *   10. yt-dlp                       — last resort; fails for most content without auth
 *
 * Returns an array of { buffer, type } or [] if all services fail.
 */
async function igDownload(url) {
  const cleanUrl = normalizeInputUrl(url).split("?")[0].replace(/\/$/, "") + "/";

  // Desktop + mobile UA variants to rotate and bypass some bot filters
  const uaDesktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const uaMobile  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

  // Helper: parse the common "ajaxSearch" WordPress-plugin response format
  function parseAjaxResponse(data) {
    const links = data?.data?.url || data?.medias || data?.links || [];
    if (!Array.isArray(links)) return [];
    return [
      ...links.filter(l => l.url?.includes('.mp4')),
      ...links.filter(l => l.url && !l.url.includes('.mp4')),
    ].map(l => l.url || l.link).filter(Boolean);
  }

  // Helper: make a snapsave/rapidsave-style POST and decode the obfuscated JS response
  async function trySnapsaveStyle(baseUrl) {
    const r = await axios.post(`${baseUrl}/action.php`,
      `url=${encodeURIComponent(cleanUrl)}&lang=en&button=`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': uaMobile, 'Origin': baseUrl, 'Referer': `${baseUrl}/` }, timeout: 15000 });
    return decodeSnapsaveResponse(String(r.data));
  }

  const tryApis = [

    // ── 1. snapsave.app ───────────────────────────────────────────────────────
    () => trySnapsaveStyle('https://snapsave.app'),

    // ── 2. rapidsave.com ──────────────────────────────────────────────────────
    () => trySnapsaveStyle('https://rapidsave.com'),

    // ── 3. snapinsta.app ──────────────────────────────────────────────────────
    async () => {
      const r = await axios.post('https://snapinsta.app/api/ajaxSearch',
        `q=${encodeURIComponent(cleanUrl)}&t=media&lang=en`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': uaDesktop, 'Origin': 'https://snapinsta.app', 'Referer': 'https://snapinsta.app/' }, timeout: 12000 });
      return parseAjaxResponse(r.data);
    },

    // ── 4. saveig.app ─────────────────────────────────────────────────────────
    async () => {
      const r = await axios.post('https://saveig.app/api/ajaxSearch',
        `q=${encodeURIComponent(cleanUrl)}&t=media&lang=en`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': uaDesktop, 'Origin': 'https://saveig.app', 'Referer': 'https://saveig.app/' }, timeout: 12000 });
      return parseAjaxResponse(r.data);
    },

    // ── 5. saveinsta.app ──────────────────────────────────────────────────────
    async () => {
      const r = await axios.post('https://saveinsta.app/api/ajaxSearch',
        `q=${encodeURIComponent(cleanUrl)}&t=media&lang=en`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': uaDesktop, 'Origin': 'https://saveinsta.app', 'Referer': 'https://saveinsta.app/' }, timeout: 12000 });
      return parseAjaxResponse(r.data);
    },

    // ── 6. igram.world ────────────────────────────────────────────────────────
    async () => {
      const r = await axios.post('https://igram.world/api/convert',
        `data=${encodeURIComponent(cleanUrl)}&url=${encodeURIComponent(cleanUrl)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': uaMobile, 'Origin': 'https://igram.world', 'Referer': 'https://igram.world/' }, timeout: 12000 });
      const items = r.data?.data || r.data?.url || r.data?.result || [];
      return (Array.isArray(items) ? items : []).map(i => i?.url || i?.src || i?.link).filter(u => typeof u === 'string' && u.startsWith('http'));
    },

    // ── 7. sssinstagram.com ───────────────────────────────────────────────────
    async () => {
      const r = await axios.post('https://sssinstagram.com/api/ajaxSearch',
        `q=${encodeURIComponent(cleanUrl)}&t=media&lang=en`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': uaDesktop, 'Origin': 'https://sssinstagram.com', 'Referer': 'https://sssinstagram.com/' }, timeout: 12000 });
      return parseAjaxResponse(r.data);
    },

    // ── 8. api.nyxs.pw ───────────────────────────────────────────────────────
    async () => {
      const r = await fetchJson(`https://api.nyxs.pw/dl/ig?url=${encodeURIComponent(cleanUrl)}`, { timeout: 12000 });
      const items = Array.isArray(r?.result) ? r.result : (r?.result ? [r.result] : []);
      return items.slice(0, 10).map(i => i?.url || i?.link).filter(Boolean);
    },

    // ── 9a. RapidAPI: All-in-One Social Downloader by SaverAPI.net ────────────
    async () => {
      const key = process.env.RAPIDAPI_KEY;
      if (!key) return [];
      const r = await fetchJson(
        `https://all-in-one-social-media-video-downloader.p.rapidapi.com/v1/social/autolink?url=${encodeURIComponent(cleanUrl)}`,
        { timeout: 15000, headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'all-in-one-social-media-video-downloader.p.rapidapi.com' } }
      );
      const links = r?.medias || r?.data || r?.links || [];
      return (Array.isArray(links) ? links : []).map(l => l.url || l.link).filter(Boolean);
    },

    // ── 9b. RapidAPI: Social Saver API ───────────────────────────────────────
    async () => {
      const key = process.env.RAPIDAPI_KEY;
      if (!key) return [];
      const r = await fetchJson(
        `https://social-saver-api.p.rapidapi.com/download?url=${encodeURIComponent(cleanUrl)}`,
        { timeout: 15000, headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'social-saver-api.p.rapidapi.com' } }
      );
      const links = r?.data || r?.medias || [];
      return (Array.isArray(links) ? links : []).map(l => l.url || l.link).filter(Boolean);
    },

    // ── 9c. RapidAPI: Instagram Post/Reels/Stories Downloader (diyorbekkanal)
    async () => {
      const key = process.env.RAPIDAPI_KEY;
      if (!key) return [];
      const r = await fetchJson(
        `https://instagram-post-reels-stories-downloader.p.rapidapi.com/fetch/?url=${encodeURIComponent(cleanUrl)}`,
        { timeout: 15000, headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'instagram-post-reels-stories-downloader.p.rapidapi.com' } }
      );
      const links = r?.result || r?.data || r?.medias || [];
      return (Array.isArray(links) ? links : []).map(l => l.url || l.link || l).filter(u => typeof u === 'string');
    },

    // ── 9d. RapidAPI: Instagram Video Downloader (skdeveloper) ───────────────
    async () => {
      const key = process.env.RAPIDAPI_KEY;
      if (!key) return [];
      const r = await fetchJson(
        `https://instagram-video-downloader2.p.rapidapi.com/reels/?url=${encodeURIComponent(cleanUrl)}`,
        { timeout: 15000, headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'instagram-video-downloader2.p.rapidapi.com' } }
      );
      const links = r?.media || r?.data || r?.result || [];
      return (Array.isArray(links) ? links : []).map(l => l.url || l.link || l).filter(u => typeof u === 'string');
    },

    // ── 10. yt-dlp (last resort — fails for most content without auth) ─────────
    async () => {
      const ytdlpBin = findYtDlpBin();
      if (!ytdlpBin) return [];
      const tmpDir = os.tmpdir();
      const uid = `ig_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const outTemplate = path.join(tmpDir, `${uid}_%(playlist_index)s.%(ext)s`);
      await new Promise(resolve => {
        execFile(ytdlpBin, [
          '--quiet', '--no-warnings',
          '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
          '--merge-output-format', 'mp4', '--max-downloads', '10',
          '-o', outTemplate, cleanUrl,
        ], { timeout: 90000 }, () => resolve());
      });
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(uid + '_')).sort();
      const results = [];
      for (const file of files) {
        const filePath = path.join(tmpDir, file);
        try {
          const buf = fs.readFileSync(filePath);
          fs.unlinkSync(filePath);
          const ext = path.extname(file).toLowerCase();
          const type = ['.mp4', '.mov', '.webm'].includes(ext) ? 'video' : 'image';
          if (buf.length > 1000) results.push({ buffer: buf, type });
        } catch {}
      }
      return results.map(r => r.buffer ? r : null).filter(Boolean);
    },
  ];

  // Try each service in order; return on first success
  for (let i = 0; i < tryApis.length; i++) {
    try {
      const result = await tryApis[i]();

      // Last entry (yt-dlp) returns { buffer, type } objects directly
      if (i === tryApis.length - 1) {
        if (result?.length) return result;
        continue;
      }

      // All others return URL arrays — fetch each to a buffer
      const urls = result;
      if (!urls?.length) continue;
      const items = await Promise.all(
        urls.slice(0, 10).map(u => igFetchItem(u))
      );
      const valid = items.filter(Boolean);
      if (valid.length) {
        console.log(`[igDownload] service #${i + 1} succeeded (${valid.length} items)`);
        return valid;
      }
    } catch (e) {
      // Silently skip failed services
    }
  }

  return [];
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
  // 1. yt-dlp direct download (most reliable for public Facebook videos)
  try {
    const buf = await ytDlpDownloadToBuffer(url, [
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--no-part',
    ], 'mp4');
    if (buf) return buf;
  } catch (err) {
    console.error('[fbDownload] yt-dlp error:', err.message);
  }

  // 2. cobalt.tools (v10 API)
  try {
    const d = await postJson(
      endpoints.download.cobaltApiJson,
      { url, downloadMode: "auto" },
      { timeout: 25000, headers: { Accept: "application/json", "Content-Type": "application/json" } }
    );
    if ((d.status === "redirect" || d.status === "tunnel" || d.status === "stream") && d.url) {
      const buf = await fetchBuffer(d.url, { timeout: 60000 });
      if (buf?.length > 1000) return buf;
    }
    if (d.status === "picker" && d.picker?.length) {
      const buf = await fetchBuffer(d.picker[0].url, { timeout: 60000 });
      if (buf?.length > 1000) return buf;
    }
  } catch (err) {
    console.error('[fbDownload] cobalt error:', err.message);
  }

  // 3. SaveFrom.net free scraper endpoint
  try {
    const sfUrl = `https://sfrom.me/api/button?url=${encodeURIComponent(url)}`;
    const sfRes = await axios.get(sfUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' },
    });
    const mediaUrl = sfRes.data?.url || sfRes.data?.data?.url;
    if (mediaUrl && typeof mediaUrl === 'string' && mediaUrl.startsWith('http')) {
      const buf = await fetchBuffer(mediaUrl, { timeout: 60000 });
      if (buf?.length > 1000) return buf;
    }
  } catch (err) {
    console.error('[fbDownload] savefrom error:', err.message);
  }

  return null;
}

async function twitterDownload(url) {
  // 1. yt-dlp (supports Twitter/X natively)
  try {
    const buf = await ytDlpDownloadToBuffer(url, [
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4', '--no-part',
    ], 'mp4');
    if (buf?.length > 1000) return buf;
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

const AUDIO_SIZE_LIMIT = 15 * 1024 * 1024; // 15 MB — WhatsApp audio cap
const VIDEO_SIZE_LIMIT = 60 * 1024 * 1024; // 60 MB — WhatsApp video cap

const commands = [
  // ── .music — YouTube audio downloader (search by name OR paste URL) ──────
  {
    name: ["music", "song", "play", "mp3", "ytsong", "yta"],
    category: "download",
    desc: "Download a song from YouTube as audio",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply(
        "music <song name or YouTube URL>",
        `music Shape of You\n${config.PREFIX}music https://youtu.be/JGwWNGJdvx8`
      );
      m.react("⏳");
      try {
        let videoUrl, picked;

        if (isUrl(text)) {
          // Direct URL — skip search, build a minimal info object
          videoUrl = text;
          picked = { title: "Audio", url: text, author: "", duration: "" };
          // Try to get title from yt-dlp metadata (best effort)
          try {
            const results = await ytSearch(text);
            if (results.length) picked = results[0];
          } catch {}
        } else {
          const results = await ytSearch(text);
          if (!results.length) {
            m.react("❌");
            return m.noResultReply(text, "Try a more specific song name or paste a YouTube URL directly");
          }
          picked = results[0];
          videoUrl = picked.url;
        }

        // Inform user which song was found (before the slow download)
        const infoLines = [];
        if (picked.title && picked.title !== "Audio") infoLines.push(`🎵 *${picked.title}*`);
        if (picked.author) infoLines.push(`👤 ${picked.author}`);
        if (picked.duration) infoLines.push(`⏱️ ${picked.duration}`);
        if (infoLines.length) await m.reply(infoLines.join("\n") + "\n\n_Downloading audio, please wait..._");

        const audioBuffer = await ytDownloadAudio(videoUrl, picked.title || text);

        if (!audioBuffer || audioBuffer.length < 1000) {
          m.react("❌");
          return m.errorReply(
            "Could not download this audio.",
            "The video may be age-restricted, region-locked, or unavailable. Try a different song."
          );
        }

        if (audioBuffer.length > AUDIO_SIZE_LIMIT) {
          m.react("❌");
          return m.errorReply(
            `Audio file is too large (${(audioBuffer.length / 1024 / 1024).toFixed(1)} MB).`,
            "WhatsApp has a 15 MB audio limit. Try a shorter track."
          );
        }

        const safeName = (picked.title || "audio").replace(/[\\/:*?"<>|]/g, "").trim();
        await sock.sendMessage(m.chat, {
          audio: audioBuffer,
          mimetype: "audio/mp4",
          fileName: `${safeName}.m4a`,
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[music] error:", err.message);
        m.react("❌");
        return m.apiErrorReply("YouTube Music");
      }
    },
  },

  // ── .youtube — YouTube video downloader (search by name OR paste URL) ────
  {
    name: ["youtube", "yt", "ytdl", "ytvideo", "ytmp4", "ytvid", "video"],
    category: "download",
    desc: "Download a YouTube video",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply(
        "youtube <video name or URL>",
        `youtube Ronaldo top skills 2024\n${config.PREFIX}youtube https://youtu.be/JGwWNGJdvx8`
      );
      m.react("⏳");
      try {
        let videoUrl, picked;

        if (isUrl(text)) {
          videoUrl = text;
          picked = { title: "Video", url: text, author: "", duration: "" };
          try {
            const results = await ytSearch(text);
            if (results.length) picked = results[0];
          } catch {}
        } else {
          const results = await ytSearch(text);
          if (!results.length) {
            m.react("❌");
            return m.noResultReply(text, "Try a more specific search or paste a YouTube URL directly");
          }
          picked = results[0];
          videoUrl = picked.url;
        }

        // Inform user which video was found before the slow download
        const infoLines = [];
        if (picked.title && picked.title !== "Video") infoLines.push(`🎬 *${picked.title}*`);
        if (picked.author) infoLines.push(`👤 ${picked.author}`);
        if (picked.duration) infoLines.push(`⏱️ ${picked.duration}`);
        if (picked.views) infoLines.push(`👁️ ${picked.views} views`);
        if (infoLines.length) await m.reply(infoLines.join("\n") + "\n\n_Downloading video, please wait..._");

        const videoBuffer = await ytDownloadVideo(videoUrl, picked.title || text);

        if (!videoBuffer || videoBuffer.length < 1000) {
          m.react("❌");
          return m.errorReply(
            "Could not download this video.",
            "The video may be too long, age-restricted, region-locked, or unavailable. Try a shorter or different video."
          );
        }

        if (videoBuffer.length > VIDEO_SIZE_LIMIT) {
          m.react("❌");
          return m.errorReply(
            `Video file is too large (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB).`,
            "WhatsApp has a 60 MB video limit. Try a shorter video or use .music for audio only."
          );
        }

        const title = (picked.title && picked.title !== "Video") ? picked.title : "YouTube Video";
        const caption = [
          `🎬 *${title}*`,
          picked.author ? `👤 ${picked.author}` : "",
          picked.duration ? `⏱️ ${picked.duration}` : "",
          "",
          `────────────────────────────────`,
          `_${config.BOT_NAME} · Desam Tech_ ⚡`,
        ].filter(Boolean).join("\n");

        await sock.sendMessage(m.chat, {
          video: videoBuffer,
          caption,
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch (err) {
        console.error("[youtube] error:", err.message);
        m.react("❌");
        return m.apiErrorReply("YouTube");
      }
    },
  },
  {
    name: ["tiktok", "tt", "ttdl"],
    category: "download",
    desc: "Download TikTok video",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("tiktok <TikTok URL>");
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
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `📱 TikTok Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
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
      if (!targetUrl) return m.usageReply("tta <TikTok URL>");
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
    desc: "Download Instagram post/reel/carousel",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("ig <Instagram URL>");
      if (!/instagram\.com|instagr\.am/i.test(targetUrl)) return m.reply("❌ Please provide a valid Instagram URL.");
      m.react("⏳");

      const baseCaption = `📸 Instagram Download\n\n────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`;
      const quotedMsg = { quoted: { key: m.key, message: m.message } };

      try {
        const results = await igDownload(targetUrl);
        if (!results?.length) {
          m.react("❌");
          return m.reply(
            "❌ Could not download this Instagram post.\n\n" +
            "All download services are currently unavailable for this link. " +
            "Possible reasons:\n" +
            "• The post is from a private account\n" +
            "• Instagram is blocking automated downloads from cloud servers\n" +
            "• The link has expired or is region-restricted\n\n" +
            "_Try again in a few minutes, or send a different post._"
          );
        }

        const caption = results.length > 1
          ? `📸 Instagram Download _(${results.length} items)_\n\n────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
          : baseCaption;

        for (let i = 0; i < results.length; i++) {
          const { buffer, type, mimetype } = results[i];
          const msgCaption = i === 0 ? caption : undefined;
          const opts = i === 0 ? quotedMsg : {};
          if (type === "image") {
            await sock.sendMessage(m.chat, { image: buffer, mimetype: mimetype || 'image/jpeg', caption: msgCaption }, opts);
          } else {
            await sock.sendMessage(m.chat, { video: buffer, mimetype: mimetype || 'video/mp4', caption: msgCaption }, opts);
          }
        }
        m.react("✅");
      } catch (err) {
        m.react("❌");
        console.error('[Instagram Download] error:', err.message);
        await m.reply("❌ Failed to download Instagram media. If it's a private account post, it cannot be downloaded.");
      }
    },
  },
  {
    name: ["facebook", "fbdl", "fb"],
    category: "download",
    desc: "Download Facebook video",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("fb <Facebook URL>");
      if (!/facebook\.com|fb\.watch|fb\.com/i.test(targetUrl)) return m.reply("❌ Please provide a valid Facebook URL.");
      m.react("⏳");
      try {
        let videoBuffer = await fbDownload(targetUrl);
        if (!videoBuffer) return m.reply("❌ Could not download Facebook video. The download servers may be busy.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `📘 Facebook Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
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
      if (!targetUrl) return m.usageReply("twitter <Twitter/X URL>");
      if (!/twitter\.com|x\.com/i.test(targetUrl)) return m.reply("❌ Please provide a valid Twitter/X URL.");
      m.react("⏳");
      try {
        let videoBuffer = await twitterDownload(targetUrl);
        if (!videoBuffer) return m.reply("❌ Could not download Twitter video. The download servers may be busy.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `🐦 Twitter/X Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
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
      if (!targetUrl) return m.usageReply("spotify <Spotify URL>");
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
              if (results.length) audioBuffer = await ytDownloadAudio(results[0].url, searchQuery);
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
      if (!text) return m.usageReply("pinterest <query>");
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
            const kw = encodeURIComponent(text.replace(/\s+/g, ",").slice(0, 50));
            imgBuffer = await fetchBuffer(`${endpoints.images.randomFallbackBase}/1080/1080/${kw}`);
            imgSource = "Loremflickr";
          } catch {}
        }
        if (!imgBuffer || imgBuffer.length < 1000) return m.reply("❌ No images found for that query.");
        await sock.sendMessage(m.chat, { image: imgBuffer, caption: `📌 *${text}* (via ${imgSource})\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
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
      if (!targetUrl) return m.usageReply("mediafire <MediaFire URL>");
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
      if (!text) return m.usageReply("apk <app name>");
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
        msg += `_${config.BOT_NAME} · Desam Tech_ ⚡`;
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
      if (!targetUrl) return m.usageReply("gdrive <Google Drive URL>");
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
      if (!targetUrl) return m.usageReply("soundcloud <SoundCloud URL>");
      if (!/soundcloud\.com/i.test(targetUrl)) return m.reply("❌ Please provide a valid SoundCloud URL.");
      m.react("⏳");
      try {
        let audioBuffer = null;
        // 1. yt-dlp (supports SoundCloud natively)
        try {
          audioBuffer = await ytDlpDownloadToBuffer(targetUrl, [
            '-f', 'bestaudio/best', '--no-part',
          ], 'mp3');
        } catch {}
        // 2. Nyxs scraper
        if (!audioBuffer || audioBuffer.length < 1000) {
          try {
            const res = await fetchJson(`https://api.nyxs.pw/dl/soundcloud?url=${encodeURIComponent(targetUrl)}`, { timeout: 15000 });
            const mediaUrl = res?.result?.url || res?.result?.[0]?.url;
            if (mediaUrl) audioBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          } catch {}
        }
        if (!audioBuffer || audioBuffer.length < 1000) return m.reply("❌ Could not download SoundCloud track. The link may be private or unavailable.");
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
      if (!targetUrl) return m.usageReply("reddit <Reddit URL>");
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
        const caption = `🔴 Reddit Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
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
  {
    name: ["snapchat", "snap", "snapdl"],
    category: "download",
    desc: "Download Snapchat Spotlight/Story video",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("snap <Snapchat URL>");
      if (!/snapchat\.com/i.test(targetUrl)) return m.reply("❌ Please provide a valid Snapchat URL.");
      m.react("⏳");
      try {
        let videoBuffer = null;
        // 1. yt-dlp direct
        try {
          videoBuffer = await ytDlpDownloadToBuffer(targetUrl, [
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4', '--no-part',
          ], 'mp4');
        } catch {}
        // 2. cobalt.tools
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const d = await postJson(
              endpoints.download.cobaltApiJson,
              { url: targetUrl, downloadMode: 'auto' },
              { timeout: 25000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
            );
            const mediaUrl = d?.url || d?.picker?.[0]?.url;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          } catch {}
        }
        // 3. snapdl free scraper
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const res = await fetchJson(`https://snapdl.app/api?url=${encodeURIComponent(targetUrl)}`, { timeout: 15000 });
            const mediaUrl = res?.url || res?.data?.url || res?.result?.url;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          } catch {}
        }
        // 4. snapsave.app scraper
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const res = await axios.post(
              'https://snapsave.app/action.php',
              `url=${encodeURIComponent(targetUrl)}`,
              { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://snapsave.app', 'Referer': 'https://snapsave.app/' }, timeout: 15000 }
            );
            const match = String(res.data || '').match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/);
            if (match?.[1]) videoBuffer = await fetchBuffer(match[1], { timeout: 60000 });
          } catch {}
        }
        if (!videoBuffer || videoBuffer.length < 1000) return m.reply("❌ Could not download. Only public Snapchat Spotlight videos are supported.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `👻 Snapchat Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Snapchat media.");
      }
    },
  },
  {
    name: ["vimeo", "vimdl"],
    category: "download",
    desc: "Download Vimeo video",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("vimeo <Vimeo URL>");
      if (!/vimeo\.com/i.test(targetUrl)) return m.reply("❌ Please provide a valid Vimeo URL.");
      m.react("⏳");
      try {
        let videoBuffer = null;
        // 1. yt-dlp
        try {
          videoBuffer = await ytDlpDownloadToBuffer(targetUrl, [
            '-f', 'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best[height<=720]',
            '--merge-output-format', 'mp4', '--no-part',
          ], 'mp4');
        } catch {}
        // 2. cobalt
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const d = await postJson(
              endpoints.download.cobaltApiJson,
              { url: targetUrl, downloadMode: 'auto' },
              { timeout: 25000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
            );
            const mediaUrl = d?.url || d?.picker?.[0]?.url;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 90000 });
          } catch {}
        }
        // 3. Vimeo config API (public videos)
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const videoId = targetUrl.match(/vimeo\.com\/(\d+)/)?.[1];
            if (videoId) {
              const cfg = await fetchJson(`https://player.vimeo.com/video/${videoId}/config`, { timeout: 10000 });
              const files = cfg?.request?.files?.progressive || [];
              const best = files.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
              if (best?.url) videoBuffer = await fetchBuffer(best.url, { timeout: 90000 });
            }
          } catch {}
        }
        if (!videoBuffer || videoBuffer.length < 1000) return m.reply("❌ Could not download Vimeo video. It may be password-protected or private.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `🎬 Vimeo Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Vimeo video.");
      }
    },
  },
  {
    name: ["dailymotion", "dmdl", "dm"],
    category: "download",
    desc: "Download Dailymotion video",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("dm <Dailymotion URL>");
      if (!/dailymotion\.com|dai\.ly/i.test(targetUrl)) return m.reply("❌ Please provide a valid Dailymotion URL.");
      m.react("⏳");
      try {
        let videoBuffer = null;
        // 1. yt-dlp
        try {
          videoBuffer = await ytDlpDownloadToBuffer(targetUrl, [
            '-f', 'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best[height<=720]',
            '--merge-output-format', 'mp4', '--no-part',
          ], 'mp4');
        } catch {}
        // 2. cobalt
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const d = await postJson(
              endpoints.download.cobaltApiJson,
              { url: targetUrl, downloadMode: 'auto' },
              { timeout: 25000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
            );
            const mediaUrl = d?.url || d?.picker?.[0]?.url;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 90000 });
          } catch {}
        }
        // 3. Dailymotion embed API
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const videoId = targetUrl.match(/\/video\/([a-zA-Z0-9]+)/)?.[1] || targetUrl.match(/dai\.ly\/([a-zA-Z0-9]+)/)?.[1];
            if (videoId) {
              const meta = await fetchJson(`https://www.dailymotion.com/player/metadata/video/${videoId}?embedder=https%3A%2F%2Fwww.dailymotion.com&locale=en&dmV1st=&dmTs=&is_native_app=0`, { timeout: 10000 });
              const streams = meta?.qualities?.auto || [];
              const best = streams.find(s => s.url) || streams[0];
              if (best?.url) videoBuffer = await fetchBuffer(best.url, { timeout: 90000 });
            }
          } catch {}
        }
        if (!videoBuffer || videoBuffer.length < 1000) return m.reply("❌ Could not download Dailymotion video.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `📺 Dailymotion Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Dailymotion video.");
      }
    },
  },
  {
    name: ["likee", "likedl"],
    category: "download",
    desc: "Download Likee video",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("likee <Likee URL>");
      if (!/likee\.com|like\.video/i.test(targetUrl)) return m.reply("❌ Please provide a valid Likee URL.");
      m.react("⏳");
      try {
        let videoBuffer = null;
        // 1. yt-dlp
        try {
          videoBuffer = await ytDlpDownloadToBuffer(targetUrl, [
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4', '--no-part',
          ], 'mp4');
        } catch {}
        // 2. Likee public API
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const videoId = targetUrl.match(/\/video\/(\d+)/)?.[1];
            if (videoId) {
              const res = await axios.post(
                'https://api.likee.video/likee-activity-flow-micro/videoApi/getVideoInfo',
                { videoIds: videoId },
                { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
              );
              const videoUrl = res.data?.data?.videoList?.[0]?.videoUrl;
              if (videoUrl) videoBuffer = await fetchBuffer(videoUrl, { timeout: 60000 });
            }
          } catch {}
        }
        // 3. tikwm-style scraper
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const res = await fetchJson(`https://api.nyxs.pw/dl/likee?url=${encodeURIComponent(targetUrl)}`, { timeout: 15000 });
            const mediaUrl = res?.result?.url || res?.result?.[0]?.url;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          } catch {}
        }
        if (!videoBuffer || videoBuffer.length < 1000) return m.reply("❌ Could not download Likee video.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `❤️ Likee Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Likee video.");
      }
    },
  },
  {
    name: ["kwai", "kwaidl"],
    category: "download",
    desc: "Download Kwai video",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("kwai <Kwai URL>");
      if (!/kwai\.com|kwai\.net/i.test(targetUrl)) return m.reply("❌ Please provide a valid Kwai URL.");
      m.react("⏳");
      try {
        let videoBuffer = null;
        // 1. yt-dlp
        try {
          videoBuffer = await ytDlpDownloadToBuffer(targetUrl, [
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4', '--no-part',
          ], 'mp4');
        } catch {}
        // 2. tikwm-compatible scraper
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const res = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, { timeout: 15000 });
            const mediaUrl = res?.data?.play || res?.data?.wmplay;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          } catch {}
        }
        // 3. cobalt
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const d = await postJson(
              endpoints.download.cobaltApiJson,
              { url: targetUrl, downloadMode: 'auto' },
              { timeout: 25000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
            );
            const mediaUrl = d?.url || d?.picker?.[0]?.url;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          } catch {}
        }
        if (!videoBuffer || videoBuffer.length < 1000) return m.reply("❌ Could not download Kwai video.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `🎬 Kwai Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Kwai video.");
      }
    },
  },
  {
    name: ["threads", "threadsdl", "thr"],
    category: "download",
    desc: "Download Threads (Meta) post media",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("threads <Threads URL>");
      if (!/threads\.net/i.test(targetUrl)) return m.reply("❌ Please provide a valid Threads URL.");
      m.react("⏳");
      try {
        let mediaBuffer = null;
        let isVideo = false;
        // 1. cobalt
        try {
          const d = await postJson(
            endpoints.download.cobaltApiJson,
            { url: targetUrl, downloadMode: 'auto' },
            { timeout: 25000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
          );
          const mediaUrl = d?.url || d?.picker?.[0]?.url;
          if (mediaUrl) {
            isVideo = d?.status === 'stream' || mediaUrl.includes('.mp4');
            mediaBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          }
        } catch {}
        // 2. yt-dlp
        if (!mediaBuffer || mediaBuffer.length < 1000) {
          try {
            mediaBuffer = await ytDlpDownloadToBuffer(targetUrl, [
              '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
              '--merge-output-format', 'mp4', '--no-part',
            ], 'mp4');
            if (mediaBuffer?.length > 1000) isVideo = true;
          } catch {}
        }
        // 3. Nyxs scraper
        if (!mediaBuffer || mediaBuffer.length < 1000) {
          try {
            const res = await fetchJson(`https://api.nyxs.pw/dl/threads?url=${encodeURIComponent(targetUrl)}`, { timeout: 15000 });
            const mediaUrl = res?.result?.url || res?.result?.[0]?.url;
            if (mediaUrl) {
              isVideo = mediaUrl.includes('.mp4');
              mediaBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
            }
          } catch {}
        }
        if (!mediaBuffer || mediaBuffer.length < 1000) return m.reply("❌ Could not download Threads post. Only public posts with media are supported.");
        const caption = `🧵 Threads Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        if (isVideo) {
          await sock.sendMessage(m.chat, { video: mediaBuffer, caption }, { quoted: { key: m.key, message: m.message } });
        } else {
          await sock.sendMessage(m.chat, { image: mediaBuffer, caption }, { quoted: { key: m.key, message: m.message } });
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Threads media.");
      }
    },
  },
  {
    name: ["linkedin", "linkedindl", "li"],
    category: "download",
    desc: "Download LinkedIn video post",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("linkedin <LinkedIn URL>");
      if (!/linkedin\.com/i.test(targetUrl)) return m.reply("❌ Please provide a valid LinkedIn URL.");
      m.react("⏳");
      try {
        let videoBuffer = null;
        // 1. yt-dlp
        try {
          videoBuffer = await ytDlpDownloadToBuffer(targetUrl, [
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4', '--no-part',
          ], 'mp4');
        } catch {}
        // 2. cobalt
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const d = await postJson(
              endpoints.download.cobaltApiJson,
              { url: targetUrl, downloadMode: 'auto' },
              { timeout: 25000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
            );
            const mediaUrl = d?.url || d?.picker?.[0]?.url;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          } catch {}
        }
        // 3. Nyxs scraper
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const res = await fetchJson(`https://api.nyxs.pw/dl/linkedin?url=${encodeURIComponent(targetUrl)}`, { timeout: 15000 });
            const mediaUrl = res?.result?.url || res?.result?.[0]?.url;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          } catch {}
        }
        if (!videoBuffer || videoBuffer.length < 1000) return m.reply("❌ Could not download. LinkedIn videos must be public posts.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `💼 LinkedIn Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download LinkedIn video.");
      }
    },
  },
  {
    name: ["capcut", "capcutdl", "cc"],
    category: "download",
    desc: "Download CapCut video",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("capcut <CapCut URL>");
      if (!/capcut\.com/i.test(targetUrl)) return m.reply("❌ Please provide a valid CapCut URL.");
      m.react("⏳");
      try {
        let videoBuffer = null;
        // 1. yt-dlp
        try {
          videoBuffer = await ytDlpDownloadToBuffer(targetUrl, [
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4', '--no-part',
          ], 'mp4');
        } catch {}
        // 2. cobalt
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const d = await postJson(
              endpoints.download.cobaltApiJson,
              { url: targetUrl, downloadMode: 'auto' },
              { timeout: 25000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
            );
            const mediaUrl = d?.url || d?.picker?.[0]?.url;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          } catch {}
        }
        // 3. Nyxs scraper
        if (!videoBuffer || videoBuffer.length < 1000) {
          try {
            const res = await fetchJson(`https://api.nyxs.pw/dl/capcut?url=${encodeURIComponent(targetUrl)}`, { timeout: 15000 });
            const mediaUrl = res?.result?.url || res?.result?.[0]?.url;
            if (mediaUrl) videoBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
          } catch {}
        }
        if (!videoBuffer || videoBuffer.length < 1000) return m.reply("❌ Could not download CapCut video. The video must be publicly shared.");
        await sock.sendMessage(m.chat, { video: videoBuffer, caption: `✂️ CapCut Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download CapCut video.");
      }
    },
  },
  {
    name: ["pindl", "pinurl", "pinvideo"],
    category: "download",
    desc: "Download Pinterest pin/video from URL",
    handler: async (sock, m, { text }) => {
      const targetUrl = resolveInputUrl(text, m);
      if (!targetUrl) return m.usageReply("pindl <Pinterest URL>");
      if (!/pinterest\.com|pin\.it/i.test(targetUrl)) return m.reply("❌ Please provide a valid Pinterest URL.");
      m.react("⏳");
      try {
        let mediaBuffer = null;
        let isVideo = false;
        // 1. yt-dlp (works for Pinterest videos)
        try {
          mediaBuffer = await ytDlpDownloadToBuffer(targetUrl, [
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4', '--no-part',
          ], 'mp4');
          if (mediaBuffer?.length > 1000) isVideo = true;
        } catch {}
        // 2. cobalt
        if (!mediaBuffer || mediaBuffer.length < 1000) {
          try {
            const d = await postJson(
              endpoints.download.cobaltApiJson,
              { url: targetUrl, downloadMode: 'auto' },
              { timeout: 25000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
            );
            const mediaUrl = d?.url || d?.picker?.[0]?.url;
            if (mediaUrl) {
              isVideo = d?.status === 'stream' || mediaUrl.includes('.mp4');
              mediaBuffer = await fetchBuffer(mediaUrl, { timeout: 60000 });
            }
          } catch {}
        }
        // 3. Pinterest OEmbed (image fallback)
        if (!mediaBuffer || mediaBuffer.length < 1000) {
          try {
            const oembed = await fetchJson(`https://www.pinterest.com/oembed/?url=${encodeURIComponent(targetUrl)}`, { timeout: 10000 });
            const imgUrl = oembed?.thumbnail_url;
            if (imgUrl) {
              mediaBuffer = await fetchBuffer(imgUrl, { timeout: 30000 });
              isVideo = false;
            }
          } catch {}
        }
        if (!mediaBuffer || mediaBuffer.length < 1000) return m.reply("❌ Could not download Pinterest media.");
        const caption = `📌 Pinterest Download\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        if (isVideo) {
          await sock.sendMessage(m.chat, { video: mediaBuffer, caption }, { quoted: { key: m.key, message: m.message } });
        } else {
          await sock.sendMessage(m.chat, { image: mediaBuffer, caption }, { quoted: { key: m.key, message: m.message } });
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to download Pinterest media.");
      }
    },
  },
];

module.exports = { commands };
