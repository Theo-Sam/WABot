const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");

const startTime = Date.now();
const recentRandomPicks = new Map();

function runtime() {
  const ms = Date.now() - startTime;
  const secs = Math.floor(ms / 1000) % 60;
  const mins = Math.floor(ms / 60000) % 60;
  const hrs = Math.floor(ms / 3600000) % 24;
  const days = Math.floor(ms / 86400000);
  let result = "";
  if (days) result += `${days}d `;
  if (hrs) result += `${hrs}h `;
  if (mins) result += `${mins}m `;
  result += `${secs}s`;
  return result.trim();
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isUrl(text) {
  return /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/.test(text);
}

function extractUrls(text) {
  const regex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;
  return text.match(regex) || [];
}

function isGroupLink(text) {
  return /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/.test(text);
}

function tempFile(ext) {
  return path.join(os.tmpdir(), `desam_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
}

const DEFAULT_HTTP_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

function mergeHeaders(base, extra) {
  return { ...(base || {}), ...(extra || {}) };
}

function uniqueUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls || []) {
    const item = String(raw || "").trim();
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function buildUrlCandidates(url, fallbackUrls = []) {
  const base = String(url || "").trim();
  if (!base) return [];

  const candidates = [base, ...fallbackUrls];
  if (base.startsWith("http://")) {
    candidates.unshift(base.replace(/^http:\/\//i, "https://"));
  }
  return uniqueUrls(candidates);
}

function shouldRetryStatus(status) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function shouldRetryError(err) {
  const code = String(err?.code || "").toUpperCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    ["ETIMEDOUT", "ECONNRESET", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "CERT_HAS_EXPIRED"].includes(code) ||
    msg.includes("timeout") ||
    msg.includes("socket hang up")
  );
}

async function requestWithRetry(method, url, payload, opts = {}, mode = "json") {
  const retries = Math.max(0, Number.parseInt(opts.retries ?? "2", 10) || 2);
  const fallbackUrls = Array.isArray(opts.fallbackUrls) ? opts.fallbackUrls : [];
  const timeout = Number.parseInt(opts.timeout || (mode === "buffer" ? "30000" : "15000"), 10) || (mode === "buffer" ? 30000 : 15000);
  const delayMs = Math.max(0, Number.parseInt(opts.retryDelayMs || "700", 10) || 700);

  const candidates = buildUrlCandidates(url, fallbackUrls);
  if (!candidates.length) throw new Error("No URL provided");

  let lastError = null;

  for (const candidate of candidates) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await axios({
          method,
          url: candidate,
          data: payload,
          ...opts,
          timeout,
          responseType: mode === "buffer" ? "arraybuffer" : opts.responseType,
          headers: mergeHeaders(DEFAULT_HTTP_HEADERS, opts.headers),
          validateStatus: (status) => status >= 200 && status < 300,
        });
        return response;
      } catch (err) {
        lastError = err;
        const status = err?.response?.status;
        const isLastAttempt = attempt >= retries;
        const mayRetry = shouldRetryError(err) || (status ? shouldRetryStatus(status) : false);
        if (!isLastAttempt && mayRetry) {
          await sleep(delayMs * (attempt + 1));
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error("Request failed");
}

async function fetchBuffer(url, opts = {}) {
  const res = await requestWithRetry("get", url, undefined, opts, "buffer");
  return Buffer.from(res.data);
}

async function fetchJson(url, opts = {}) {
  const res = await requestWithRetry("get", url, undefined, opts, "json");
  const data = res.data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return { raw: data };
    }
  }
  return data;
}

async function postJson(url, body = {}, opts = {}) {
  const res = await requestWithRetry("post", url, body, opts, "json");
  const data = res.data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return { raw: data };
    }
  }
  return data;
}

async function postBuffer(url, body = {}, opts = {}) {
  const res = await requestWithRetry("post", url, body, opts, "buffer");
  return Buffer.from(res.data);
}

function getUserJid(text, suffix = "@s.whatsapp.net") {
  if (!text) return null;
  const num = text.replace(/[^0-9]/g, "");
  return num ? `${num}${suffix}` : null;
}

function parseMention(text) {
  return [...(text || "").matchAll(/@(\d+)/g)].map((m) => m[1] + "@s.whatsapp.net");
}

function getTimeGreeting(tz) {
  const moment = require("moment-timezone");
  const hour = moment().tz(tz || "Africa/Accra").hour();
  if (hour < 5) return "Good Late Night";
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  if (hour < 21) return "Good Evening";
  return "Good Night";
}

function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMem: formatBytes(os.totalmem()),
    freeMem: formatBytes(os.freemem()),
    uptime: runtime(),
    nodeVersion: process.version,
  };
}

const MAX_CAPTION_LENGTH = 60000;

async function sendImageOrText(sock, chatId, imgBuffer, text, quotedMsg) {
  const quoted = quotedMsg ? { quoted: { key: quotedMsg.key, message: quotedMsg.message } } : {};
  if (imgBuffer && text.length <= MAX_CAPTION_LENGTH) {
    try {
      return await sock.sendMessage(chatId, { image: imgBuffer, caption: text }, quoted);
    } catch {}
  }
  if (imgBuffer) {
    try {
      await sock.sendMessage(chatId, { image: imgBuffer, caption: "" }, quoted);
    } catch {}
  }
  return await sock.sendMessage(chatId, { text }, quoted);
}

function getSelfJid(sock) {
  return sock?.user?.id?.replace(/:.*@/, "@") || "";
}

function splitTextIntoChunks(text, maxLength = 3500) {
  const input = String(text || "");
  if (!input) return [""];
  if (input.length <= maxLength) return [input];

  const chunks = [];
  let remaining = input;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n\n", maxLength);
    if (splitAt < Math.floor(maxLength * 0.5)) splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt < Math.floor(maxLength * 0.5)) splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt <= 0) splitAt = maxLength;

    const part = remaining.slice(0, splitAt).trim();
    if (part) chunks.push(part);
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function replyLongText(m, text, options = {}) {
  const chunkSize = options.chunkSize || 3500;
  const chunks = splitTextIntoChunks(text, chunkSize);
  for (const chunk of chunks) {
    await m.reply(chunk);
  }
}

function normalizeAiText(input, options = {}) {
  if (!input) return "";
  const keepLightFormatting = options.keepLightFormatting !== false;
  let text = String(input).replace(/\r\n/g, "\n");

  text = text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").trim())
    .replace(/^\|.+\|$/gm, "")
    .replace(/^\s*[-:| ]{3,}\s*$/gm, "")
    .replace(/[\u2500-\u257F\u2580-\u259F]+/g, "")
    .replace(/^[#>]+\s*/gm, "")
    .replace(/\*\*\*/g, "*")
    .replace(/__/g, "_")
    .replace(/`/g, "");

  if (!keepLightFormatting) {
    text = text.replace(/[\*_~]/g, "");
  } else {
    text = text
      .replace(/\*{2,}/g, "*")
      .replace(/_{2,}/g, "_")
      .replace(/~{2,}/g, "~");
  }

  text = text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return text;
}

function pickNonRepeating(items, key, options = {}) {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  if (!key) return items[Math.floor(Math.random() * items.length)];

  const maxHistory = Math.max(1, options.maxHistory || Math.min(5, Math.floor(items.length / 2)));
  const prev = recentRandomPicks.get(key) || [];

  const available = items.filter((item) => !prev.includes(item));
  const pool = available.length ? available : items;
  const selected = pool[Math.floor(Math.random() * pool.length)];

  const nextHistory = [...prev, selected].slice(-maxHistory);
  recentRandomPicks.set(key, nextHistory);
  return selected;
}

module.exports = {
  runtime,
  formatBytes,
  sleep,
  isUrl,
  extractUrls,
  isGroupLink,
  tempFile,
  fetchBuffer,
  fetchJson,
  postJson,
  postBuffer,
  getUserJid,
  parseMention,
  getTimeGreeting,
  getSystemInfo,
  startTime,
  sendImageOrText,
  getSelfJid,
  normalizeAiText,
  MAX_CAPTION_LENGTH,
  pickNonRepeating,
  splitTextIntoChunks,
  replyLongText,
};