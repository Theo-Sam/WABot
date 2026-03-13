const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");

const startTime = Date.now();

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

async function fetchBuffer(url, opts = {}) {
  const res = await axios.get(url, { ...opts, responseType: "arraybuffer", timeout: 30000 });
  return Buffer.from(res.data);
}

async function fetchJson(url, opts = {}) {
  const res = await axios.get(url, { ...opts, timeout: 15000 });
  return res.data;
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

const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb7n5HyEgGfKW3Wp7U1h";
const CHANNEL_CONTEXT_INFO = {
  externalAdReply: {
    title: "Desam WABot",
    body: "View Channel",
    mediaType: 1,
    renderLargerThumbnail: false,
    showAdAttribution: false,
    sourceUrl: CHANNEL_URL,
  }
};

async function sendImageOrText(sock, chatId, imgBuffer, text, quotedMsg) {
  const quoted = quotedMsg ? { quoted: { key: quotedMsg.key, message: quotedMsg.message } } : {};
  if (imgBuffer && text.length <= MAX_CAPTION_LENGTH) {
    try {
      return await sock.sendMessage(chatId, { image: imgBuffer, caption: text, contextInfo: CHANNEL_CONTEXT_INFO }, quoted);
    } catch {}
  }
  if (imgBuffer) {
    try {
      await sock.sendMessage(chatId, { image: imgBuffer, caption: "", contextInfo: CHANNEL_CONTEXT_INFO }, quoted);
    } catch {}
  }
  return await sock.sendMessage(chatId, { text, contextInfo: CHANNEL_CONTEXT_INFO }, quoted);
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
  getUserJid,
  parseMention,
  getTimeGreeting,
  getSystemInfo,
  startTime,
  sendImageOrText,
  MAX_CAPTION_LENGTH,
};