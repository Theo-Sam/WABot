const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  console.log(`[DESAM] Found .env at ${envPath}`);
  require("dotenv").config({ path: envPath });
} else {
  console.log(`[DESAM] No .env found at ${envPath}`);
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

const sessionFromEnv = process.env.SESSION_ID || "";
const sessionFromFile = readSessionFromFile(process.env.SESSION_FILE || "");
const resolvedSessionId = sessionFromEnv || sessionFromFile;

console.log(`[DESAM] process.env.SESSION_ID starts with: ${resolvedSessionId ? resolvedSessionId.substring(0, 20) : "empty"}`);
if (!resolvedSessionId) {
  console.warn(`[DESAM] ⚠️  No SESSION_ID found. Provide SESSION_ID or SESSION_FILE (QR login is disabled).`);
}

module.exports = {
  SESSION_ID: resolvedSessionId,
  SESSION_FILE: process.env.SESSION_FILE || "",
  SQLITE_PATH: process.env.SQLITE_PATH || "./data/bot.db",
  BOT_NAME: process.env.BOT_NAME || "Desam WABot",
  PREFIX: process.env.PREFIX || ".",
  MODE: process.env.MODE || "public",
  OWNER_NUMBER: process.env.OWNER_NUMBER || "",
  TIMEZONE: process.env.TIMEZONE || "Africa/Accra",
  AUTO_READ: process.env.AUTO_READ || "off",
  AUTO_STATUS_VIEW: process.env.AUTO_STATUS_VIEW || "off",
  ANTI_CALL: process.env.ANTI_CALL || "on",
  ANTI_CALL_MSG: process.env.ANTI_CALL_MSG || "❌ Calls are not allowed. This bot rejects all calls.",
  AUTO_BIO: process.env.AUTO_BIO || "off",
  AUTO_BIO_MSG: process.env.AUTO_BIO_MSG || "🤖 Desam WABot | {time} | {date}",
  CHATBOT: process.env.CHATBOT || "off",
  AUTO_STATUS_REACT: "off",
  DEVICE_MODE: process.env.DEVICE_MODE || "Android",
  ACCEPT_ANY_SESSION: process.env.ACCEPT_ANY_SESSION === "on" ? true : true,
  BOT_PHONE_NUMBER: process.env.BOT_PHONE_NUMBER || "233557703453",
};