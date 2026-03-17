const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  console.log(`[DESAM] Found .env at ${envPath}`);
  require("dotenv").config({ path: envPath, override: true });
} else {
  console.log(`[DESAM] No .env found at ${envPath}`);
}

if (process.env.BOT_NAME === "Desam Tech Bot") process.env.BOT_NAME = "Desam WABot";
if (process.env.AUTO_BIO_MSG && process.env.AUTO_BIO_MSG.includes("Desam Tech Bot")) {
  process.env.AUTO_BIO_MSG = process.env.AUTO_BIO_MSG.replace(/Desam Tech Bot/g, "Desam WABot");
}

function readSessionFromFile(sessionFileValue) {
  if (!sessionFileValue) return "";
  const resolvedPath = path.isAbsolute(sessionFileValue)
    ? sessionFileValue
    : path.join(__dirname, sessionFileValue);

  if (!fs.existsSync(resolvedPath)) {
    console.warn(`[DESAM] SESSION_FILE not found at ${resolvedPath}`);
    return "";
  }

  try {
    const value = fs.readFileSync(resolvedPath, "utf8").trim();
    if (!value) {
      console.warn(`[DESAM] SESSION_FILE is empty at ${resolvedPath}`);
      return "";
    }
    console.log(`[DESAM] Loaded SESSION_ID from SESSION_FILE (${resolvedPath})`);
    return value;
  } catch (error) {
    console.warn(`[DESAM] Failed reading SESSION_FILE: ${error.message}`);
    return "";
  }
}

function readSessionFromVaultToken(sessionValue) {
  if (!sessionValue) return "";
  const token = String(sessionValue).trim();
  if (!/^desam_[a-zA-Z0-9_-]+$/.test(token)) return "";

  const configuredDir = process.env.SESSION_VAULT_DIR || "";
  const candidates = [
    configuredDir,
    "/opt/desam-bots/sessions",
    path.join(__dirname, "sessions"),
  ].filter(Boolean);

  for (const baseDir of candidates) {
    const tokenPath = path.join(baseDir, `${token}.txt`);
    if (!fs.existsSync(tokenPath)) continue;

    try {
      const value = fs.readFileSync(tokenPath, "utf8").trim();
      if (!value) continue;
      console.log(`[DESAM] Resolved SESSION_ID token from vault (${tokenPath})`);
      return value;
    } catch (error) {
      console.warn(`[DESAM] Failed reading SESSION_ID vault token at ${tokenPath}: ${error.message}`);
    }
  }

  console.warn(`[DESAM] SESSION_ID token provided but no vault file was found for ${token}`);
  return "";
}

const sessionFromEnv = process.env.SESSION_ID || "";
const sessionFromFile = readSessionFromFile(process.env.SESSION_FILE || "");
const sessionFromVault = readSessionFromVaultToken(sessionFromEnv);
const resolvedSessionId = sessionFromVault || sessionFromEnv || sessionFromFile;
const acceptAnySessionRaw = String(process.env.ACCEPT_ANY_SESSION || "").trim().toLowerCase();
const resolvedAcceptAnySession = acceptAnySessionRaw ? acceptAnySessionRaw === "on" : true;

console.log(`[DESAM] process.env.SESSION_ID starts with: ${resolvedSessionId ? resolvedSessionId.substring(0, 20) : "empty"}`);
if (!resolvedSessionId) {
  console.warn(`[DESAM] ℹ️  No SESSION_ID found. Bot will start in QR linking mode and persist multi-device credentials in auth_state.`);
}

module.exports = {
  SESSION_ID: resolvedSessionId,
  SESSION_FILE: process.env.SESSION_FILE || "",
  SESSION_VAULT_DIR: process.env.SESSION_VAULT_DIR || "",
  SQLITE_PATH: process.env.SQLITE_PATH || "./data/bot.db",
  BOT_NAME: process.env.BOT_NAME || "Desam WABot",
  PREFIX: process.env.PREFIX || ".",
  MODE: process.env.MODE || "public",
  OWNER_NUMBER: process.env.OWNER_NUMBER || "",
  TIMEZONE: process.env.TIMEZONE || "Africa/Accra",
  AUTO_READ: process.env.AUTO_READ || "off",
  AUTO_STATUS_VIEW: process.env.AUTO_STATUS_VIEW || "off",
  ANTI_CALL: process.env.ANTI_CALL || "off",
  ANTI_CALL_MSG: process.env.ANTI_CALL_MSG || "❌ Calls are not allowed. This bot rejects all calls.",
  AUTO_BIO: process.env.AUTO_BIO || "off",
  AUTO_BIO_MSG: process.env.AUTO_BIO_MSG || "🤖 Desam WABot | {time} | {date}",
  CHATBOT: process.env.CHATBOT || "off",
  AUTO_STATUS_REACT: "off",
  DEVICE_MODE: process.env.DEVICE_MODE || "Android",
  BROWSER_VERSION: process.env.BROWSER_VERSION || "120.0.0",
  ACCEPT_ANY_SESSION: resolvedAcceptAnySession,
};