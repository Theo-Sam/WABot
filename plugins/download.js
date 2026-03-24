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
 * Use yt-dlp to download media directly to a temp file, then read it into a buffer.
 * This avoids the signed-URL IP-restriction problem from using --get-url + axios.
 */
async function ytDlpDownloadToBuffer(url, extraArgs, tmpExt) {
  const ytdlpBin = findYtDlpBin();
  if (!ytdlpBin) return null;
  const tmpPath = tempFile(tmpExt);
  const BASE_ARGS = [
    '--no-warnings', '--no-playlist', '--quiet',
    '--geo-bypass',
    '--extractor-retries', '3',
    '--fragment-retries', '3',
    '--retry-sleep', '2',
    '--user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];
  try {
    await new Promise((resolve, reject) => {
      execFile(ytdlpBin, [
        ...BASE_ARGS,
        ...extraArgs,
        '-o', tmpPath,
        url,
      ], { timeout: 120000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    if (fs.existsSync(tmpPath)) {
      const buf = fs.readFileSync(tmpPath);
      if (buf.length > 1000) return buf;
    }
  } catch (err) {
    console.error('[ytDlp] download error:', err.message);
  } finally {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
  }
  return null;
}

async function ytDownloadAudio(url) {
  // Use android player client: bypasses JS signature decryption, ~10x faster
  return ytDlpDownloadToBuffer(url, [
    '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
    '--no-part',
    '--extractor-args', 'youtube:player_client=android,web',
  ], 'm4a');
}

async function ytDownloadVideo(url) {
  // Format priority (YouTube 2025+):
  //   1. Format 22 — 720p progressive MP4 (H.264+AAC, pre-merged, no PO Token, available on older/shorter videos)
  //   2. Format 18 — 360p progressive MP4 (H.264+AAC, pre-merged, no PO Token, widely available)
  //   3. best[ext=mp4][height<=480] — best pre-merged MP4 ≤480p
  //   4. best[height<=480] — last resort, any codec ≤480p
  // Adaptive (DASH) formats like 136/137 (720p+/1080p) require a GVS PO Token
  // and are NOT used here because YouTube now enforces this from server IPs.
  return ytDlpDownloadToBuffer(url, [
    '-f', '22/18/best[ext=mp4][height<=480]/best[height<=480]',
    '--merge-output-format', 'mp4',
    '--no-part',
    '--max-filesize', '55m',
    '--extractor-args', 'youtube:player_client=android,web',
  ], 'mp4');
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
 * Download using yt-dlp with optional session cookie.
 * Returns an array of { buffer, type } for single posts AND carousel/album posts.
 * Carousel items are all downloaded in one yt-dlp run (no --no-playlist).
 */
function igDownloadYtDlp(url, withCookie) {
  return new Promise((resolve) => {
    const ytdlpBin = findYtDlpBin();
    if (!ytdlpBin) { resolve([]); return; }

    const sessionCookie = withCookie ? (process.env.INSTAGRAM_SESSION || null) : null;
    if (withCookie && !sessionCookie) { resolve([]); return; }

    const tmpDir = os.tmpdir();
    const uniqueId = `ig_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    // Use playlist_index in template so carousel items get numbered filenames
    const outTemplate = path.join(tmpDir, `${uniqueId}_%(playlist_index)s.%(ext)s`);

    const args = [
      '--quiet', '--no-warnings',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--max-downloads', '10',
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

    execFile(ytdlpBin, args, { timeout: 120000 }, (err) => {
      if (cookieFile) try { fs.unlinkSync(cookieFile); } catch {}
      if (err && err.killed) { console.error('[igDownload] yt-dlp timed out'); resolve([]); return; }

      const results = [];
      try {
        const files = fs.readdirSync(tmpDir)
          .filter(f => f.startsWith(uniqueId + '_') && !f.endsWith('_cookies.txt'))
          .sort();
        for (const file of files) {
          const filePath = path.join(tmpDir, file);
          try {
            const buffer = fs.readFileSync(filePath);
            fs.unlinkSync(filePath);
            const ext = path.extname(file).toLowerCase();
            const type = ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext) ? 'video' : 'image';
            if (buffer.length > 1000) results.push({ buffer, type });
          } catch {}
        }
      } catch (readErr) {
        console.error('[igDownload] yt-dlp file read error:', readErr.message);
      }
      resolve(results);
    });
  });
}

/**
 * Download Instagram media using the Instagram GraphQL API.
 * Requires INSTAGRAM_SESSION env var (sessionid cookie value).
 * Supports single posts, reels, AND carousel/album posts (returns all items).
 */
async function igGraphQLDownload(url) {
  const sessionCookie = process.env.INSTAGRAM_SESSION;
  if (!sessionCookie) return [];

  const shortcode = extractIgShortcode(url);
  if (!shortcode) return [];

  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const decodedSession = decodeURIComponent(sessionCookie.trim());

  try {
    // Get CSRF token without session cookie (avoids redirect loops)
    let csrfToken = '';
    try {
      const homeRes = await axios.get('https://www.instagram.com/', {
        headers: { 'User-Agent': ua, 'Accept': 'text/html' },
        timeout: 12000, maxRedirects: 3, validateStatus: () => true,
      });
      for (const c of homeRes.headers['set-cookie'] || []) {
        const m = c.match(/^csrftoken=([^;]+)/);
        if (m) { csrfToken = m[1]; break; }
      }
    } catch {}
    if (!csrfToken) return [];

    const cookieStr = `csrftoken=${csrfToken}; sessionid=${decodedSession}; ig_did=00000000-0000-0000-0000-000000000000; ig_nrcb=1`;
    const qs = require('querystring');
    const body = qs.stringify({
      variables: JSON.stringify({
        shortcode, fetch_tagged_user_count: null,
        hoisted_comment_id: null, hoisted_reply_id: null,
      }),
      doc_id: '9510064595728286',
    });

    const gqlRes = await axios.post('https://www.instagram.com/graphql/query', body, {
      headers: {
        'User-Agent': ua,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRFToken': csrfToken,
        'X-IG-App-ID': '936619743392459',
        'X-IG-WWW-Claim': '0',
        'X-ASBD-ID': '129477',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieStr,
        'Referer': 'https://www.instagram.com/',
        'Accept': '*/*',
        'Origin': 'https://www.instagram.com',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
      },
      timeout: 20000, validateStatus: () => true,
    });

    const media = gqlRes.data?.data?.xdt_shortcode_media;
    if (!media) {
      console.error('[igGraphQL] no media in response:', JSON.stringify(gqlRes.data).slice(0, 100));
      return [];
    }

    // Collect all media URLs (handles carousel/sidecar automatically)
    const mediaItems = [];
    if (media.edge_sidecar_to_children?.edges?.length) {
      for (const { node } of media.edge_sidecar_to_children.edges) {
        mediaItems.push({ url: node.is_video ? node.video_url : node.display_url, type: node.is_video ? 'video' : 'image' });
      }
    } else {
      mediaItems.push({ url: media.is_video ? media.video_url : media.display_url, type: media.is_video ? 'video' : 'image' });
    }

    const results = [];
    for (const { url: mediaUrl, type } of mediaItems) {
      if (!mediaUrl) continue;
      try {
        const buf = await fetchBuffer(mediaUrl, { timeout: 60000 });
        if (buf?.length > 1000) results.push({ buffer: buf, type });
      } catch {}
    }
    return results;
  } catch (err) {
    console.error('[igGraphQL] error:', err.message);
    return [];
  }
}

/**
 * Three-package Instagram download chain using the exact packages requested:
 *   Tier 1 — nayan-media-downloader  (npm security placeholder; throws MODULE_NOT_FOUND, caught instantly)
 *   Tier 2 — api-dylux igstalk       (profile stalker; returns image display_url for image posts only)
 *   Tier 3 — youtube-dl-exec         (wraps our yt-dlp binary; returns a direct CDN URL without saving to disk)
 *
 * Returns { directUrl, type } for Baileys URL-streaming, or null if all tiers fail.
 * This avoids saving any file to local disk — media URLs are returned raw for Baileys to stream.
 */
async function igPackageChain(url) {
  const shortcode = extractIgShortcode(url);

  // ── Tier 1: nayan-media-downloader ────────────────────────────────────────
  // This package was removed from npm and replaced with a security placeholder.
  // require() throws MODULE_NOT_FOUND — caught immediately, chains to Tier 2.
  try {
    const nayan = require('nayan-media-downloader');
    // Detect any callable download function across known method names
    const fn = nayan.getMedia || nayan.downloadMedia || nayan.download
      || nayan.instagramDl || nayan.ig || nayan.igDl;
    if (typeof fn !== 'function') throw new Error('nayan-media-downloader: no download function (security placeholder package)');
    const result = await fn(url);
    const directUrl = result?.url || result?.data?.url || result?.media?.[0]?.url
      || result?.result?.url || (Array.isArray(result) ? result[0]?.url : null);
    if (!directUrl) throw new Error('nayan-media-downloader: empty result');
    const type = directUrl.includes('.mp4') ? 'video' : 'image';
    console.log('[igChain T1] nayan-media-downloader success');
    return { directUrl, type };
  } catch (e) {
    console.log('[igChain T1] nayan-media-downloader:', e.message.slice(0, 80));
  }

  // ── Tier 2: api-dylux ─────────────────────────────────────────────────────
  // api-dylux exposes igstalk() which stalks a public profile and returns
  // post thumbnails (display_url). Only works for image posts — videos only
  // have a thumbnail, not the video_url. Instagram's API returns 429 from
  // cloud IPs (rate-limited), so this tier also commonly fails from Replit.
  if (shortcode) {
    try {
      const { igstalk } = require('api-dylux');
      // Try to resolve the username via Instagram's embed page (no auth needed)
      const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      const embedRes = await axios.get(`https://www.instagram.com/p/${shortcode}/embed/`, {
        headers: { 'User-Agent': ua, 'Accept': 'text/html' },
        timeout: 8000, validateStatus: () => true,
      });
      // Extract username from embed HTML
      const username = String(embedRes.data || '').match(/(?:"owner":\{"username":"([^"]+)")|(?:class="UsernameText[^>]*>([^<]+)<)|(?:instagrammer">([^<]+)<)/)?.[1]
        || String(embedRes.data || '').match(/@([a-zA-Z0-9._]+)/)?.[1];
      if (!username) throw new Error('api-dylux: could not resolve username from embed page');

      const profile = await igstalk(username, 50);
      if (!profile?.status) throw new Error(`api-dylux: igstalk failed — ${profile?.message || 'blocked'}`);

      const post = profile.posts?.find(p => p.shortcode === shortcode);
      if (!post) throw new Error('api-dylux: post not found in recent profile feed');
      if (post.isVideo) throw new Error('api-dylux: igstalk only returns image display_url, not video_url');

      const directUrl = post.display;
      if (!directUrl) throw new Error('api-dylux: no display URL on post');
      console.log('[igChain T2] api-dylux success (image post)');
      return { directUrl, type: 'image' };
    } catch (e) {
      console.log('[igChain T2] api-dylux:', e.message.slice(0, 80));
    }
  }

  // ── Tier 3: youtube-dl-exec ───────────────────────────────────────────────
  // Uses our existing yt-dlp binary via youtube-dl-exec's create() API.
  // --dump-single-json returns full media info including the direct CDN URL.
  // No file is saved to disk — the CDN URL is returned raw for Baileys to stream.
  // Note: Instagram requires auth; this tier fails for most public content.
  try {
    const { create: createYtDl } = require('youtube-dl-exec');
    const ytdlpPath = path.resolve('./bin/yt-dlp');
    if (!fs.existsSync(ytdlpPath)) throw new Error('youtube-dl-exec: yt-dlp binary not found at ./bin/yt-dlp');

    const ytdlp = createYtDl(ytdlpPath);
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      quiet: true,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      extractorArgs: 'youtube:player_client=android,web',
    });

    if (typeof info !== 'object' || !info) throw new Error('youtube-dl-exec: no JSON response');

    // Pull the best direct URL from the response
    let directUrl = info.url;
    if (!directUrl && Array.isArray(info.formats)) {
      const mp4 = info.formats.filter(f => f.ext === 'mp4' && f.url && f.vcodec !== 'none').pop();
      directUrl = mp4?.url || info.formats.filter(f => f.url).pop()?.url;
    }
    if (!directUrl) throw new Error('youtube-dl-exec: no media URL in response');

    const type = (info.ext === 'mp4' || info._type === 'video' || info.formats?.some(f => f.vcodec)) ? 'video' : 'image';
    console.log('[igChain T3] youtube-dl-exec success');
    return { directUrl, type };
  } catch (e) {
    console.log('[igChain T3] youtube-dl-exec:', e.message.slice(0, 80));
  }

  return null;
}

/**
 * Free third-party scraper APIs — tried in order, return first success.
 * Most are blocked from cloud server IPs by Instagram/Cloudflare since 2024.
 * They will fail fast (DNS errors), wasting minimal time.
 */
async function igDownloadFreeApi(url) {
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const h = { 'User-Agent': ua, 'Accept': 'application/json, text/plain, */*' };

  async function fetchItem(mediaUrl, typeHint) {
    if (!mediaUrl || typeof mediaUrl !== 'string') return null;
    const buf = await fetchBuffer(mediaUrl, { timeout: 60000 });
    return buf?.length > 1000 ? { buffer: buf, type: typeHint === 'video' || mediaUrl.includes('.mp4') ? 'video' : 'image' } : null;
  }

  function parseAioDl(data) {
    const links = data?.data?.url || data?.medias || [];
    return [...links.filter(l => l.url?.includes('.mp4')), ...links.filter(l => !l.url?.includes('.mp4'))].map(l => l.url).filter(Boolean);
  }

  const tryApis = [
    // SnapInsta
    async () => {
      const r = await axios.post('https://snapinsta.to/api/ajaxSearch', `q=${encodeURIComponent(url)}&t=media&lang=en`,
        { headers: { ...h, 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://snapinsta.to' }, timeout: 10000 });
      return parseAioDl(r.data);
    },
    // SaveIG
    async () => {
      const r = await axios.post('https://saveig.app/api/ajaxSearch', `q=${encodeURIComponent(url)}&t=media&lang=en`,
        { headers: { ...h, 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://saveig.app' }, timeout: 10000 });
      return parseAioDl(r.data);
    },
    // Nyxs
    async () => {
      const r = await fetchJson(`https://api.nyxs.pw/dl/ig?url=${encodeURIComponent(url)}`, { timeout: 10000 });
      const media = Array.isArray(r?.result) ? r.result : (r?.result ? [r.result] : []);
      return media.slice(0, 10).map(m => m?.url).filter(Boolean);
    },
    // Reelsaver
    async () => {
      const r = await axios.post('https://reelsaver.net/api/ajaxSearch', `q=${encodeURIComponent(url)}&t=media&lang=en`,
        { headers: { ...h, 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://reelsaver.net' }, timeout: 10000 });
      return parseAioDl(r.data);
    },
    // Ryzendesu community API
    async () => {
      const r = await fetchJson(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(url)}`, { timeout: 10000 });
      const items = r?.data || r?.result || [];
      return (Array.isArray(items) ? items : [items]).map(i => i?.url || i?.link).filter(Boolean);
    },
  ];

  for (const tryApi of tryApis) {
    try {
      const urls = await tryApi();
      if (!urls?.length) continue;
      const items = await Promise.all(urls.slice(0, 10).map(u => fetchItem(u, u.includes('.mp4') ? 'video' : 'image').catch(() => null)));
      const valid = items.filter(Boolean);
      if (valid.length) return valid;
    } catch {}
  }
  return [];
}

/**
 * Main Instagram download orchestrator.
 * Returns an array of { buffer, type } (multiple items for carousels), or [] if all fail.
 *
 * Priority order:
 *  1. Instagram GraphQL API with INSTAGRAM_SESSION (supports all content + carousels)
 *  2. yt-dlp with INSTAGRAM_SESSION (video-focused fallback)
 *  3. Free third-party scraper APIs (mostly blocked from server IPs, but worth a fast try)
 *  4. yt-dlp without session (fails for most content — "login required")
 */
async function igDownload(url) {
  const cleanUrl = normalizeInputUrl(url).split("?")[0].replace(/\/$/, "") + "/";
  const hasSession = !!process.env.INSTAGRAM_SESSION;

  // 1. Instagram GraphQL API — best for carousels, fastest when session is set
  if (hasSession) {
    try {
      const results = await igGraphQLDownload(cleanUrl);
      if (results?.length) return results;
    } catch (err) {
      console.error('[igDownload] GraphQL error:', err.message);
    }
  }

  // 2. yt-dlp with session — reliable fallback for videos when GraphQL fails
  if (hasSession && findYtDlpBin()) {
    try {
      const results = await igDownloadYtDlp(cleanUrl, true);
      if (results?.length) return results;
    } catch (err) {
      console.error('[igDownload] yt-dlp+cookie error:', err.message);
    }
  }

  // 3. Free third-party APIs — mostly fail from cloud IPs, but try anyway
  try {
    const results = await igDownloadFreeApi(cleanUrl);
    if (results?.length) return results;
  } catch (err) {
    console.error('[igDownload] free API error:', err.message);
  }

  // 4. yt-dlp without session — will fail with "login required" but worth a shot
  if (findYtDlpBin()) {
    try {
      const results = await igDownloadYtDlp(cleanUrl, false);
      if (results?.length) return results;
    } catch (err) {
      console.error('[igDownload] yt-dlp no-cookie error:', err.message);
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

        const audioBuffer = await ytDownloadAudio(videoUrl);

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
          mimetype: "audio/mpeg",
          fileName: `${safeName}.mp3`,
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

        const videoBuffer = await ytDownloadVideo(videoUrl);

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
        // ── Path A: three-package chain (nayan-media-downloader → api-dylux → youtube-dl-exec)
        // Returns a direct CDN URL which Baileys streams — no local storage used.
        const chainResult = await igPackageChain(targetUrl);
        if (chainResult?.directUrl) {
          const { directUrl, type } = chainResult;
          if (type === 'video') {
            await sock.sendMessage(m.chat, { video: { url: directUrl }, caption: baseCaption, mimetype: 'video/mp4' }, quotedMsg);
          } else {
            await sock.sendMessage(m.chat, { image: { url: directUrl }, caption: baseCaption }, quotedMsg);
          }
          return m.react("✅");
        }

        // ── Path B: buffered fallback (GraphQL API / yt-dlp / scraper APIs)
        const results = await igDownload(targetUrl);
        if (!results?.length) {
          const hasSession = !!process.env.INSTAGRAM_SESSION;
          const tip = hasSession
            ? "The post may be private, age-restricted, or all download servers are currently blocked."
            : "Instagram now requires authentication for automated downloads from cloud servers.\n\n*To enable Instagram downloads:*\n1. Copy your Instagram `sessionid` cookie\n2. Set it as the `INSTAGRAM_SESSION` secret in the bot environment\n\nThis is enforced by Meta's server-IP blocking policy (not a bug).";
          m.react("❌");
          return m.reply(`❌ Could not download this Instagram post.\n\n${tip}`);
        }

        const caption = results.length > 1
          ? `📸 Instagram Download _(${results.length} items)_\n\n────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
          : baseCaption;

        for (let i = 0; i < results.length; i++) {
          const { buffer, type } = results[i];
          const msgCaption = i === 0 ? caption : undefined;
          const opts = i === 0 ? quotedMsg : {};
          if (type === "image") {
            await sock.sendMessage(m.chat, { image: buffer, caption: msgCaption }, opts);
          } else {
            await sock.sendMessage(m.chat, { video: buffer, caption: msgCaption }, opts);
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
