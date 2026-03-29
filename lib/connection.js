const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  getContentType,
  jidNormalizedUser,
  areJidsSameUser,
  isJidStatusBroadcast,
} = require("@whiskeysockets/baileys");
const { BufferJSON } = require("@whiskeysockets/baileys/lib/Utils/generics");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const qrcode = require("qrcode-terminal");
const config = require("../config");
const { handleMessage } = require("./handler");
const { getGroupSettings } = require("./database");
const { handleGroupEvent } = require("../plugins/group");
const {
  getJidType,
  isPersonalChat,
  isGroupChat,
  isBroadcast,
  isNewsletter,
  isLid,
  formatJidForLogging,
  getChatTypeLabel,
  getSupportedFeatures,
} = require("./jid-utils");

// Logger must be defined before passing to store
const logger = pino({ level: "silent" });

// Enhanced in-memory store with file persistence
function createBasicStore(filePath = "./baileys_store.json") {
  const messages = new Map();
  const chats = new Map(); // Store for chat metadata
  const contacts = new Map(); // Store for contact information

  const readFromFile = () => {
    try {
      if (fs.existsSync(filePath)) {
        const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (json && typeof json === "object") {
          // Load messages
          if (Array.isArray(json.messages)) {
            for (const msg of json.messages) {
              if (msg?.key?.id) messages.set(msg.key.id, msg);
            }
          }
          // Load chats
          if (Array.isArray(json.chats)) {
            for (const chat of json.chats) {
              if (chat?.id) chats.set(chat.id, chat);
            }
          }
          // Load contacts
          if (Array.isArray(json.contacts)) {
            for (const contact of json.contacts) {
              if (contact?.id) contacts.set(contact.id, contact);
            }
          }
        }
      }
    } catch (e) {
      logger.warn({ err: e }, "[STORE] Failed to read store file");
    }
  };

  const writeToFile = () => {
    try {
      const data = {
        messages: Array.from(messages.values()),
        chats: Array.from(chats.values()),
        contacts: Array.from(contacts.values()),
      };
      fs.writeFileSync(filePath, JSON.stringify(data));
    } catch (e) {
      logger.warn({ err: e }, "[STORE] Failed to write store file");
    }
  };

  const store = {
    bind(ev) {
      // Message events
      ev.on("messages.upsert", ({ messages: msgs }) => {
        for (const msg of msgs || []) {
          if (msg?.key?.id) messages.set(msg.key.id, msg);
        }
      });
      ev.on("messages.update", (updates) => {
        for (const upd of updates || []) {
          const id = upd?.key?.id;
          if (!id) continue;
          const prev = messages.get(id) || { key: upd.key };
          messages.set(id, { ...prev, ...upd });
        }
      });
      ev.on("messaging-history.set", ({ messages: history }) => {
        for (const msg of history || []) {
          if (msg?.key?.id) messages.set(msg.key.id, msg);
        }
      });
      // Chat events
      ev.on("chats.upsert", ({ chats: newChats }) => {
        for (const chat of newChats || []) {
          if (chat?.id) chats.set(chat.id, chat);
        }
      });
      // Contact events
      ev.on("contacts.upsert", ({ contacts: newContacts }) => {
        for (const contact of newContacts || []) {
          if (contact?.id) contacts.set(contact.id, contact);
        }
      });
    },
    async getMessage(key) {
      return messages.get(key.id);
    },
    getChats: () => Array.from(chats.values()),
    getContacts: () => Array.from(contacts.values()),
    readFromFile,
    writeToFile,
  };

  readFromFile();
  setInterval(writeToFile, 30000);
  return store;
}

const store = createBasicStore();

let activeSock = null;
let reconnectTimer = null;
let isStartingConnection = false;
let consecutive440 = 0;
let lastOpenAt = 0;

function scheduleReconnect(delayMs = 5000) {
  // Always clear existing timer before scheduling new one
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await startConnection();
    } catch (err) {
      console.error("[DESAM] Reconnect failed:", err?.message || err);
      // Wait before trying again to prevent rapid reconnection storms
      scheduleReconnect(5000);
    }
  }, delayMs);
}

// Cache for status/story messages (used by statusdl command)
const statusCache = new Map();
const statusFingerprintIndex = new Map();
const statusMessageIdIndex = new Map();
const STATUS_CACHE_MAX = Math.max(10, Number.parseInt(process.env.STATUS_CACHE_MAX || "100", 10) || 100);
const STATUS_CACHE_PATH = path.join(__dirname, "..", "data", "status-cache.json");
let statusPersistTimer = null;

function normalizeStatusTimestamp(rawTimestamp) {
  const now = Date.now();
  if (typeof rawTimestamp === "number") {
    return rawTimestamp < 1e12 ? rawTimestamp * 1000 : rawTimestamp;
  }
  if (typeof rawTimestamp === "string") {
    const parsed = Number(rawTimestamp);
    if (Number.isFinite(parsed) && parsed > 0) return parsed < 1e12 ? parsed * 1000 : parsed;
    return now;
  }
  if (rawTimestamp && typeof rawTimestamp === "object") {
    const candidate = Number(rawTimestamp.low ?? rawTimestamp.value ?? 0);
    if (Number.isFinite(candidate) && candidate > 0) return candidate < 1e12 ? candidate * 1000 : candidate;
  }
  return now;
}

function extractStatusText(unwrappedStatusMessage, msgType) {
  const content = unwrappedStatusMessage?.[msgType] || {};
  if (msgType === "conversation") return String(unwrappedStatusMessage?.conversation || "");
  if (msgType === "extendedTextMessage") return String(content?.text || "");
  if (msgType === "imageMessage" || msgType === "videoMessage") return String(content?.caption || "");
  return "";
}

function buildStatusFingerprint(msg, unwrappedStatusMessage, msgType) {
  const sender = msg?.key?.participant || msg?.key?.remoteJid || "unknown";
  const remote = msg?.key?.remoteJid || "unknown";
  const msgId = msg?.key?.id || "";
  const ts = normalizeStatusTimestamp(msg?.messageTimestamp);
  const snippet = extractStatusText(unwrappedStatusMessage, msgType)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${remote}|${sender}|${msgId}|${msgType}|${ts}|${snippet}`;
}

function schedulePersistStatusCache() {
  if (statusPersistTimer) return;
  statusPersistTimer = setTimeout(() => {
    statusPersistTimer = null;
    try {
      fs.mkdirSync(path.dirname(STATUS_CACHE_PATH), { recursive: true });
      const payload = {
        version: 1,
        savedAt: Date.now(),
        maxSize: STATUS_CACHE_MAX,
        entries: [...statusCache.entries()].map(([id, data]) => ({ id, ...data })),
      };
      const tempPath = `${STATUS_CACHE_PATH}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(payload));
      fs.renameSync(tempPath, STATUS_CACHE_PATH);
      console.log(`[DESAM-STATUS] Persisted ${statusCache.size} statuses to ${STATUS_CACHE_PATH}`);
    } catch (err) {
      console.error("[DESAM-STATUS] Failed to persist status cache:", err.message);
    }
  }, 250);
}

function removeOldestStatusEntry() {
  const oldestId = statusCache.keys().next().value;
  if (!oldestId) return;
  const entry = statusCache.get(oldestId);
  const entryMsgId = entry?.key?.id;
  statusCache.delete(oldestId);
  for (const [fingerprint, mappedId] of statusFingerprintIndex.entries()) {
    if (mappedId === oldestId) {
      statusFingerprintIndex.delete(fingerprint);
    }
  }
  if (entryMsgId) {
    statusMessageIdIndex.delete(entryMsgId);
  }
}

function trimStatusCache() {
  while (statusCache.size > STATUS_CACHE_MAX) {
    removeOldestStatusEntry();
  }
}

function loadStatusCache() {
  try {
    if (!fs.existsSync(STATUS_CACHE_PATH)) {
      console.log("[DESAM-STATUS] No persisted status cache file found; starting fresh.");
      return;
    }
    const raw = fs.readFileSync(STATUS_CACHE_PATH, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
      const key = entry?.key;
      const message = entry?.message;
      const type = entry?.type;
      const id = String(entry?.id || "");
      if (!id || !key || !message || !type) continue;
      if (SKIP_STATUS_TYPES.has(type)) continue; // drop old protocol entries from disk

      const timestamp = normalizeStatusTimestamp(entry.timestamp);
      const cacheRecord = {
        key,
        message,
        type,
        sender: entry.sender || key.participant || key.remoteJid || "unknown",
        pushName: entry.pushName || "Unknown",
        timestamp,
      };
      statusCache.set(id, cacheRecord);
      const fp = buildStatusFingerprint({ key, messageTimestamp: timestamp }, message, type);
      statusFingerprintIndex.set(fp, id);
      if (key.id) {
        statusMessageIdIndex.set(key.id, id);
      }
    }
    trimStatusCache();
    console.log(`[DESAM-STATUS] Loaded ${statusCache.size} cached statuses from disk.`);
  } catch (err) {
    console.error("[DESAM-STATUS] Failed to load persisted status cache:", err.message);
  }
}

loadStatusCache();

function isStatusLikeJid(jid) {
  if (!jid || typeof jid !== "string") return false;
  return isBroadcast(jid) || isJidStatusBroadcast(jid) || jid.endsWith("@broadcast");
}

function isAutoStatusViewEnabled() {
  return String(config.AUTO_STATUS_VIEW || "off").toLowerCase() === "on";
}

function isAutoStatusSaveEnabled() {
  return String(config.AUTO_STATUS_SAVE || "on").toLowerCase() === "on";
}

function buildStatusReadKey(key = {}) {
  return {
    remoteJid: "status@broadcast",
    id: key.id,
    participant: key.participant,
    fromMe: !!key.fromMe,
  };
}

function markStatusViewed(sock, key, sourceLabel = "upsert") {
  if (!isAutoStatusViewEnabled()) return;
  const normalizedKey = buildStatusReadKey(key || {});
  if (!normalizedKey.id) return;

  sock.readMessages([normalizedKey]).then(() => {
    console.log(`[DESAM-STATUS] Marked status as viewed (${sourceLabel}): ${normalizedKey.id}`);
  }).catch((err) => {
    console.error(`[DESAM-STATUS] Failed to mark status viewed (${sourceLabel}): ${normalizedKey.id} | ${err.message}`);
  });
}

const STATUS_REACT_EMOJIS = ["❤️", "🔥", "😍", "👏", "🤩", "😊", "💯", "🙌", "✨", "💪"];

function isAutoStatusReactEnabled() {
  return String(config.AUTO_STATUS_REACT || "off").toLowerCase() === "on";
}

function sendStatusReaction(sock, key) {
  if (!isAutoStatusReactEnabled()) return;
  if (!key?.id || !key?.participant) return;
  const emoji = STATUS_REACT_EMOJIS[Math.floor(Math.random() * STATUS_REACT_EMOJIS.length)];
  const reactKey = {
    remoteJid: "status@broadcast",
    id: key.id,
    participant: key.participant,
    fromMe: false,
  };
  sock.sendMessage("status@broadcast", { react: { text: emoji, key: reactKey } }).then(() => {
    console.log(`[DESAM-STATUS] Reacted ${emoji} to status ${key.id} from ${key.participant}`);
  }).catch((err) => {
    console.error(`[DESAM-STATUS] Failed to react to status ${key.id}: ${err.message}`);
  });
}

function extractStatusBody(unwrappedStatusMessage, msgType) {
  return extractStatusText(unwrappedStatusMessage, msgType);
}

const SKIP_STATUS_TYPES = new Set([
  "protocolMessage",
  "senderKeyDistributionMessage",
  "reactionMessage",
  "receiptMessage",
  "callLogMesssage",
  "pollUpdateMessage",
]);

function cacheStatusMessage(msg, unwrappedStatusMessage, msgType) {
  if (!msg?.key || !unwrappedStatusMessage || !msgType) return;
  if (SKIP_STATUS_TYPES.has(msgType)) {
    console.log(`[DESAM-STATUS] Skipping non-content status type: ${msgType}`);
    return;
  }
  // Also skip if the raw message (before unwrap) contains only protocol fields
  const rawKeys = Object.keys(msg.message || {}).filter(k => k !== "messageContextInfo");
  const allSkippable = rawKeys.length > 0 && rawKeys.every(k => SKIP_STATUS_TYPES.has(k));
  if (allSkippable) {
    console.log(`[DESAM-STATUS] Skipping message with only protocol keys: ${rawKeys.join(", ")}`);
    return;
  }

  const statusTimestamp = normalizeStatusTimestamp(msg.messageTimestamp);
  const fingerprint = buildStatusFingerprint(msg, unwrappedStatusMessage, msgType);
  const cacheId = msg.key.id ? `id:${msg.key.id}` : `fp:${fingerprint}`;
  const existingByMsgId = msg.key.id ? statusMessageIdIndex.get(msg.key.id) : null;
  const existingId = statusFingerprintIndex.get(fingerprint);
  const targetId = existingByMsgId || existingId || cacheId;

  // Ignore owner command messages sent in status context (e.g. .save)
  // so latest cached status remains an actual story.
  if (msg.key?.fromMe) {
    const statusBody = extractStatusBody(unwrappedStatusMessage, msgType)
      .replace(/[\u200B-\u200F\uFEFF\u2060]/g, "")
      .trim();
    if (
      statusBody.startsWith(config.PREFIX) ||
      statusBody.startsWith(`*${config.PREFIX}`)
    ) {
      return;
    }
  }

  const sender = msg.key.participant || msg.key.remoteJid || "unknown";
  const pushName = msg.pushName || sender.split("@")[0] || "Unknown";
  statusCache.set(targetId, {
    key: msg.key,
    message: unwrappedStatusMessage,
    type: msgType,
    sender,
    pushName,
    timestamp: statusTimestamp,
  });
  statusFingerprintIndex.set(fingerprint, targetId);
  if (msg.key.id) {
    statusMessageIdIndex.set(msg.key.id, targetId);
  }

  trimStatusCache();
  schedulePersistStatusCache();
  console.log(
    `[DESAM-STATUS] Captured status | sender=${sender} | type=${msgType} | cache_size=${statusCache.size} | id=${targetId}`
  );
}

function getOwnerJid(sock) {
  const ownerNumber = config.OWNER_NUMBER?.replace(/[^0-9]/g, "");
  if (ownerNumber) return jidNormalizedUser(`${ownerNumber}@s.whatsapp.net`);
  if (sock?.user?.id) return jidNormalizedUser(sock.user.id);
  return "";
}

function isOwnerStatusCommandSender(sock, msg = {}) {
  const ownerJid = getOwnerJid(sock);
  const selfJid = sock?.user?.id ? jidNormalizedUser(sock.user.id) : "";
  const senderJid = jidNormalizedUser(msg?.key?.participant || msg?.participant || msg?.key?.remoteJid || "");

  if (!senderJid) return !!msg?.key?.fromMe;
  if (ownerJid && areJidsSameUser(senderJid, ownerJid)) return true;
  if (selfJid && areJidsSameUser(senderJid, selfJid)) return true;
  return !!msg?.key?.fromMe;
}

function unwrapMessage(message) {
  if (!message || typeof message !== "object") return message;
  let current = message;
  const wrappers = [
    "deviceSentMessage",
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
  ];

  for (let i = 0; i < 6; i++) {
    const type = getContentType(current);
    if (!type || !wrappers.includes(type)) break;
    const next = current[type]?.message;
    if (!next) break;
    current = next;
  }
  return current;
}

/**
 * Recursively revives Buffer objects from {type: 'Buffer', data: []} format.
 * This is crucial for reviving sessions from Base64 environment variables
 * when using newer Baileys versions that don't auto-revive during handshake.
 */
function reviveBuffers(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return Buffer.from(obj.data);
  }
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      obj[key] = reviveBuffers(obj[key]);
    }
  }
  return obj;
}

function normalizeSessionId(value) {
  if (!value) return "";
  let text = String(value).trim();

  if (text.startsWith("SESSION_ID=")) {
    text = text.slice("SESSION_ID=".length).trim();
  }

  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }

  return text.replace(/\r?\n|\s+/g, "");
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function decodeBase64Variant(text, urlSafe = false) {
  try {
    const normalized = urlSafe ? text.replace(/-/g, "+").replace(/_/g, "/") : text;
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function looksLikeCredsObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  // Keys that indicate this is a WhatsApp credentials object
  const whatsappKeys = [
    "noiseKey",
    "signedIdentityKey",
    "signedPreKey",
    "registrationId",
    "advSecretKey",
    "account",
    "me",
    "nextPreKeyId",
    "pairingCode",       // Also accept pairing codes
    "sessionId",         // Session ID variant
  ];

  // More lenient: if it has at least 2 of the expected keys, consider it valid
  const matchingKeys = whatsappKeys.filter((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );

  return matchingKeys.length >= 2;
}

function hasSignalKeyStore(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.keys && typeof payload.keys === "object") return true;
  if (payload.state?.keys && typeof payload.state.keys === "object") return true;
  if (payload.authState?.keys && typeof payload.authState.keys === "object") return true;
  if (payload.auth?.keys && typeof payload.auth.keys === "object") return true;
  return false;
}

function isKeyStoreObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function findSessionStateObject(payload, depth = 0) {
  if (!payload || typeof payload !== "object" || depth > 5) return null;

  const candidates = [
    payload,
    payload.state,
    payload.authState,
    payload.auth,
    payload.session,
    payload.data,
    payload.result,
    payload.payload,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const creds = looksLikeCredsObject(candidate.creds)
      ? candidate.creds
      : (looksLikeCredsObject(candidate) ? candidate : null);

    if (creds) {
      const keys = isKeyStoreObject(candidate.keys)
        ? candidate.keys
        : isKeyStoreObject(candidate.state?.keys)
          ? candidate.state.keys
          : isKeyStoreObject(candidate.authState?.keys)
            ? candidate.authState.keys
            : isKeyStoreObject(candidate.auth?.keys)
              ? candidate.auth.keys
              : null;
      return { creds, keys };
    }
  }

  const nestedKeys = ["data", "session", "auth", "authState", "state", "payload", "result"];
  for (const key of nestedKeys) {
    const nested = payload[key];
    if (!nested) continue;

    if (typeof nested === "string") {
      const parsedNested = extractSessionStateFromSessionId(nested);
      if (parsedNested?.creds) return parsedNested;
      continue;
    }

    const nestedState = findSessionStateObject(nested, depth + 1);
    if (nestedState?.creds) return nestedState;
  }

  return null;
}

function extractSessionStateFromSessionId(rawSessionId) {
  const sessionId = normalizeSessionId(rawSessionId);
  if (!sessionId) {
    console.warn("[DESAM] Session ID is empty after normalization");
    return null;
  }

  const decodeAttempts = [
    { label: "direct JSON", text: sessionId },
    { label: "Base64 (standard)", text: decodeBase64Variant(sessionId, false) },
    { label: "Base64 (URL-safe)", text: decodeBase64Variant(sessionId, true) },
  ];

  for (const attempt of decodeAttempts) {
    try {
      if (!attempt.text) continue;
      const parsed = tryParseJson(attempt.text);
      if (!parsed) continue;

      const sessionState = findSessionStateObject(parsed);
      if (sessionState?.creds) {
        if (!sessionState.keys && !hasSignalKeyStore(parsed)) {
          console.warn("[DESAM] ⚠️ SESSION_ID contains creds but no signal key store. Incoming message decryption may fail.");
        }
        console.log(`[DESAM] ✅ Session data extracted from ${attempt.label}`);
        return sessionState;
      }

      if (looksLikeCredsObject(parsed)) {
        console.log(`[DESAM] ✅ Credentials extracted from ${attempt.label} (partial match)`);
        return { creds: parsed, keys: null };
      }
    } catch (err) {
      console.warn(`[DESAM] Failed to parse as ${attempt.label}:`, err.message);
    }
  }

  try {
    const jsonMatches = sessionId.match(/\{[\s\S]*\}/);
    if (jsonMatches) {
      const rawJson = tryParseJson(jsonMatches[0]);
      if (rawJson) {
        const sessionState = findSessionStateObject(rawJson);
        if (sessionState?.creds) {
          console.log("[DESAM] ✅ Session data extracted from embedded JSON");
          return sessionState;
        }
      }
    }
  } catch (err) {
    console.warn("[DESAM] Failed to extract embedded JSON:", err.message);
  }

  console.error("[DESAM] ❌ Could not extract credentials from SESSION_ID");
  console.error("[DESAM] The SESSION_ID should be a WhatsApp credentials JSON (encoded or not)");
  return null;
}

function fixAuthFileName(fileName) {
  return String(fileName || "").replace(/\//g, "__").replace(/:/g, "-");
}

function persistKeyStoreToAuthDir(authDir, keys) {
  if (!isKeyStoreObject(keys)) return 0;

  let count = 0;
  for (const category of Object.keys(keys)) {
    const entries = keys[category];
    if (!isKeyStoreObject(entries)) continue;

    for (const id of Object.keys(entries)) {
      const value = entries[id];
      if (!value) continue;

      const fileName = fixAuthFileName(`${category}-${id}.json`);
      const filePath = path.join(authDir, fileName);
      fs.writeFileSync(filePath, JSON.stringify(value));
      count += 1;
    }
  }

  return count;
}

function extractCredsFromSessionId(rawSessionId) {
  return extractSessionStateFromSessionId(rawSessionId)?.creds || null;
}

async function loadSession() {
  const authDir = path.join(__dirname, "..", "auth_state");
  const credsPath = path.join(authDir, "creds.json");
  const markerPath = path.join(__dirname, "..", ".current_session_id");
  const badMacFlagPath = path.join(__dirname, "..", ".bad_mac_detected");
  const forceQrFlagPath = path.join(__dirname, "..", ".force_qr_mode");

  console.log("[DESAM-SESSION] ===== SESSION LOADING START =====");
  console.log("[DESAM-SESSION] config.SESSION_ID exists:", !!config.SESSION_ID);
  if (config.SESSION_ID) {
    console.log("[DESAM-SESSION] config.SESSION_ID length:", config.SESSION_ID.length);
    console.log("[DESAM-SESSION] config.SESSION_ID first 50 chars:", config.SESSION_ID.substring(0, 50));
  }

  let lastUsedSessionId = "";
  if (fs.existsSync(markerPath)) {
    lastUsedSessionId = normalizeSessionId(fs.readFileSync(markerPath, "utf-8"));
  }

  const incomingSessionId = normalizeSessionId(config.SESSION_ID);
  console.log("[DESAM-SESSION] normalizeSessionId result length:", incomingSessionId?.length || 0);
  if (incomingSessionId) {
    console.log("[DESAM-SESSION] incomingSessionId first 50 chars:", incomingSessionId.substring(0, 50));
  }
  console.log("[DESAM-SESSION] lastUsedSessionId === incomingSessionId:", lastUsedSessionId === incomingSessionId);


  if (fs.existsSync(forceQrFlagPath)) {
    console.log("[DESAM] Force QR mode active. Skipping SESSION_ID for fresh login...");
    // Only enforce fresh login if explicitly flagged AND no SESSION_ID provided
    if (!incomingSessionId) {
      try {
        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
        fs.mkdirSync(authDir, { recursive: true });
      } catch {}
      return;
    } else {
      console.log("[DESAM] SESSION_ID provided - overriding force QR mode");
      // Continue to use the SESSION_ID instead
      try {
        if (fs.existsSync(forceQrFlagPath)) fs.unlinkSync(forceQrFlagPath);
      } catch {}
    }
  }

  // Check if Bad MAC error was detected
  const badMacDetected = fs.existsSync(badMacFlagPath);
  if (badMacDetected && !incomingSessionId) {
    // Only clear session if Bad MAC detected AND no new SESSION_ID provided
    console.log("[DESAM] Bad MAC error detected. Clearing corrupted session...");
    try {
      if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
      if (fs.existsSync(badMacFlagPath)) fs.unlinkSync(badMacFlagPath);
      if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
      fs.mkdirSync(authDir, { recursive: true });
      console.log("[DESAM] Corrupted session cleared. Waiting for fresh login...");
    } catch (e) {
      console.error("[DESAM] Failed to clear bad session:", e.message);
    }
    return;
  } else if (badMacDetected && incomingSessionId) {
    // Clear the bad mac flag when using new SESSION_ID
    console.log("[DESAM] Clearing Bad MAC flag - using new SESSION_ID");
    try {
      if (fs.existsSync(badMacFlagPath)) fs.unlinkSync(badMacFlagPath);
    } catch {}
  }

  // Deep reset if SESSION_ID changed or first time OR credentials missing on disk
  if (incomingSessionId && (lastUsedSessionId !== incomingSessionId || !fs.existsSync(credsPath))) {
    console.log("[DESAM] Loading new SESSION_ID...");
    if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
    if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
    fs.mkdirSync(authDir, { recursive: true });

    const sessionState = extractSessionStateFromSessionId(incomingSessionId);

    if (sessionState?.creds) {
      const { creds, keys } = sessionState;
      console.log("[DESAM-CREDS] Extracted creds keys:", Object.keys(creds).slice(0, 10).join(", "));
      console.log("[DESAM-CREDS] Has noiseKey:", !!creds.noiseKey);
      console.log("[DESAM-CREDS] Has account:", !!creds.account);
      console.log("[DESAM-CREDS] Has me:", !!creds.me);
      console.log("[DESAM-CREDS] Account me.id:", creds.me?.id || "missing");

      fs.writeFileSync(credsPath, JSON.stringify(creds));
      const restoredKeyFiles = persistKeyStoreToAuthDir(authDir, keys);
      fs.writeFileSync(markerPath, incomingSessionId);

      console.log(`[DESAM] ✅ Session credentials extracted from SESSION_ID`);
      console.log(`[DESAM] 🔐 Restored key files: ${restoredKeyFiles}`);
      if (!restoredKeyFiles) {
        console.warn("[DESAM] ⚠️ No key files restored from SESSION_ID. Incoming message decryption may fail.");
      }
    } else {
      console.log("[DESAM] 📱 SESSION_ID could not be processed. Bot will scan QR code on startup.");
    }
  } else if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
}

async function startConnection() {
  if (isStartingConnection) {
    return activeSock;
  }
  isStartingConnection = true;
  try {
    if (activeSock) {
      try {
        activeSock.end?.(new Error("Restarting socket"));
      } catch {}
      activeSock = null;
    }

    await loadSession();

  const authDir = path.join(__dirname, "..", "auth_state");
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  // MANUALLY REVIVE EVERYTHING to prevent TypeError during Noise handshake
  if (state.creds) reviveBuffers(state.creds);
  if (state.keys) reviveBuffers(state.keys);

  // Set browser signature based on device mode
  const getBrowserConfig = () => {
    const mode = (config.DEVICE_MODE || "macOS").toLowerCase();
    switch(mode) {
      case "macos":
        return ["Desam-Bot", "Safari", "15.6.1"];
      case "iphone":
        return ["Desam-Bot", "Safari", "15.6.1"];
      case "windows":
        return ["Desam-Bot", "Edge", "120.0.0.0"];
      case "android":
      default:
        return ["Desam-Bot", "Chrome", "4.0.0"];
    }
  };

  console.log(`[DESAM-SOCKET] Creating socket with state.creds...`);
  console.log(`[DESAM-SOCKET] state.creds exists:`, !!state.creds);
  if (state.creds) {
    console.log(`[DESAM-SOCKET] state.creds.me.id:`, state.creds.me?.id || "missing");
    console.log(`[DESAM-SOCKET] state.creds.account:`, !!state.creds.account);
  }

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    browser: getBrowserConfig(),
    syncFullHistory: false,
    markOnlineOnConnect: true,
    defaultQueryTimeoutMs: 15000,
    keepAliveIntervalMs: 15000,
    maxMsgRetryCount: 0,
    emitOwnEvents: true,
    fireInitQueries: true,
    generateHighQualityLinkPreview: false,
    retryRequestDelayMs: 100,
    getMessage: async (key) => {
      if (store && typeof store.getMessage === "function") {
        const msg = await store.getMessage(key);
        return msg?.message || msg || undefined;
      }
      return undefined;
    },
  });

  console.log(`[DESAM-CONN] Socket created successfully. sock.ev exists: ${!!sock.ev}`);
  console.log(`[DESAM-STATUS] Auto status view is ${isAutoStatusViewEnabled() ? "ENABLED" : "DISABLED"}`);
  activeSock = sock;

  // ── Centralized Loop Prevention ───────────────────────────────────────
  // Cache to store IDs of messages sent by this bot instance
  const sentMessageCache = new Set();

  // Wrap sock.sendMessage to track outgoing IDs
  const originalSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    const result = await originalSendMessage(jid, content, options);
    if (result && result.key && result.key.id) {
      sentMessageCache.add(result.key.id);
      // Prune cache to maintain performance (keep last 100 items)
      if (sentMessageCache.size > 100) {
        const firstId = sentMessageCache.values().next().value;
        sentMessageCache.delete(firstId);
      }
    }
    return result;
  };

  // Expose cache check to message handlers
  sock.isSelfSent = (id) => sentMessageCache.has(id);

  // Bind store to socket for automatic message/chat tracking
  store.bind(sock.ev);

  console.log(`[DESAM-CONN] Store bound to socket.ev`);

  sock.ev.on("creds.update", async () => {
    try {
      fs.mkdirSync(authDir, { recursive: true });
      await saveCreds();
    } catch (err) {
      console.error("[DESAM] Failed to save credentials:", err);
    }
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log("\n[DESAM] QR Code generated! Scan with your WhatsApp:\n");
      qrcode.generate(qr, { small: true });
      console.log("\n");
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || "";
      const fullError = lastDisconnect?.error || {};
      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      const markerPath = path.join(__dirname, "..", ".current_session_id");
      const forceQrFlagPath = path.join(__dirname, "..", ".force_qr_mode");

      console.log(`[DESAM] Connection closed. Reason: ${reason || "unknown"} (${errorMessage || "no error message"}). Reconnecting: ${shouldReconnect}`);
      if (fullError && Object.keys(fullError).length > 0) {
        console.log(`[DESAM] Full error:`, JSON.stringify(fullError, null, 2).substring(0, 300));
      }

      if (reason === 440) {
        const unstableOpen = lastOpenAt && (Date.now() - lastOpenAt) < 30000;
        consecutive440 = unstableOpen ? consecutive440 + 1 : 1;
        console.log(`[DESAM] ⚠️  Conflict detected (440). Count: ${consecutive440}`);
        if (consecutive440 >= 3) {
          console.log("[DESAM] Repeated 440 detected. Forcing fresh QR session...");
          try {
            if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
            if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
            fs.writeFileSync(forceQrFlagPath, Date.now().toString());
          } catch {}
        }
      } else {
        consecutive440 = 0;
      }

      if (reason === DisconnectReason.loggedOut) {
        console.log("[DESAM] Logged out. Clearing auth state...");
        try { fs.rmSync(authDir, { recursive: true, force: true }); } catch { }
        process.exit(1);
      }

      if (reason === DisconnectReason.badSession) {
        console.log("[DESAM] Bad session detected. Clearing auth state and reconnecting...");
        try { fs.rmSync(authDir, { recursive: true, force: true }); } catch { }
        scheduleReconnect(5000);
      } else if (reason === DisconnectReason.restartRequired) {
        console.log("[DESAM] Restart required by server. Reconnecting...");
        scheduleReconnect(2000);
      } else if (reason === 428) {
        console.log("[DESAM] Connection closed by server (428). Retrying in 10s...");
        scheduleReconnect(10000);
      } else if (shouldReconnect) {
        scheduleReconnect(5000);
      }
    } else if (connection === "open") {
      lastOpenAt = Date.now();
      const forceQrFlagPath = path.join(__dirname, "..", ".force_qr_mode");
      if (fs.existsSync(forceQrFlagPath)) {
        try { fs.unlinkSync(forceQrFlagPath); } catch {}
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      console.log(`[DESAM] ✅ ONLINE! Connected as ${sock.user.name || sock.user.id}`);

      if (!config.OWNER_NUMBER || config.OWNER_NUMBER.replace(/[^0-9]/g, "").length === 0) {
        const connectedNum = sock.user.id.split("@")[0].split(":")[0];
        if (connectedNum) {
          config.OWNER_NUMBER = connectedNum;
          console.log(`[DESAM] 👤 Auto-set OWNER_NUMBER to connected number: ${connectedNum}`);
        }
      }

      // Log connection quality
      console.log(`[DESAM] 📊 Connection quality: Receiving messages = ${store ? 'YES (store active)' : 'NO (no store)'}`);
      console.log(`[DESAM] 📊 Message history sync: ${sock.config?.syncFullHistory ? 'ENABLED' : 'DISABLED'}`);

      // List active chats for debugging (guard for minimal store)
      setTimeout(async () => {
        try {
          if (store && store.chats && typeof store.chats.all === "function") {
            const chats = Array.from(store.chats.all());
            console.log(`[DESAM] 📱 Active chats: ${chats.length} total`);
            
            // Categorize chats by type
            const groups = chats.filter(c => c.id.endsWith('@g.us'));
            const personal = chats.filter(c => c.id.endsWith('@s.whatsapp.net'));
            const lids = chats.filter(c => c.id.includes('@lid'));
            const newsletters = chats.filter(c => c.id.endsWith('@newsletter'));
            
            console.log(`[DESAM] 👥 Groups: ${groups.length}`);
            if (groups.length > 0) console.log(`[DESAM]   └─ Sample:`, groups.slice(0, 2).map(g => g.id));
            
            console.log(`[DESAM] 👤 Personal: ${personal.length}`);
            if (personal.length > 0) console.log(`[DESAM]   └─ Sample:`, personal.slice(0, 2).map(c => c.id));
            
            if (lids.length > 0) console.log(`[DESAM] 🔗 Link IDs: ${lids.length} | Sample:`, lids.slice(0, 2).map(c => c.id));
            if (newsletters.length > 0) console.log(`[DESAM] 📰 Newsletters: ${newsletters.length} | Sample:`, newsletters.slice(0, 2).map(c => c.id));
          } else {
            console.log(`[DESAM] ⚠️  Chat listing skipped (store has no chat index).`);
          }
        } catch (e) {
          console.log(`[DESAM] ⚠️  Could not list chats:`, e.message);
        }
      }, 5000);

      const ownerNumber = config.OWNER_NUMBER?.replace(/[^0-9]/g, "");
      if (ownerNumber) {
        const ownerJid = jidNormalizedUser(`${ownerNumber}@s.whatsapp.net`);
        sock.sendMessage(ownerJid, {
          text: `🚀 *${config.BOT_NAME || 'Desam WABot'} is Online & Ready!*\n\n` +
            `✅ Connection established successfully.\n` +
            `🌐 Mode: ${config.MODE || 'Public'}\n` +
            `🔑 Prefix: [  ${config.PREFIX || '.'}  ]\n\n` +
            `💡 *Quick Guide to Features:*\n` +
            `▸ *${config.PREFIX || '.'}menu* — View the full list of awesome commands\n` +
            `▸ *${config.PREFIX || '.'}ping* — Check bot response speed\n` +
            `▸ *${config.PREFIX || '.'}alive* — See uptime and status\n` +
            `▸ *${config.PREFIX || '.'}tiktok <link>* — Download TikToks without watermark\n` +
            `▸ *${config.PREFIX || '.'}weather <city>* — Check current weather anywhere\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📢 *Join our WhatsApp Channel for updates!*\n` +
            `https://whatsapp.com/channel/0029Vb7n5HyEgGfKW3Wp7U1h\n\n` +
            `_${config.BOT_NAME || 'Desam WABot'} | Powered by Desam Tech_ ⚡`,
        }).catch(err => console.error("[DESAM] Failed to send connection notification:", err.message));
      }
    }
  });

  // Catch Bad MAC and other critical errors
  let badMacReported = false;
  if (typeof process !== 'undefined' && process.on) {
    const originalEmit = process.emit;
    process.emit = function(event, error) {
      if (error && error.message && error.message.includes('Bad MAC')) {
        if (!badMacReported) {
          console.error("[DESAM] ⚠️  Bad MAC error - Session keys are out of sync with WhatsApp");
          console.error("[DESAM] Please provide a fresh SESSION_ID from your generator");
          badMacReported = true;
          try {
            const badMacFlagPath = path.join(__dirname, "..", ".bad_mac_detected");
            fs.writeFileSync(badMacFlagPath, Date.now().toString());
          } catch (e) {
            // Silently fail
          }
          sock.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: DisconnectReason.badSession } } } });
        }
        // Suppress further Bad MAC error logs
        return true;
      }
      return originalEmit.apply(process, arguments);
    };
  }

  console.log(`[DESAM-CONN] Attaching messages.upsert event listener...`);

  sock.ev.on("messaging-history.set", ({ messages: history }) => {
    if (!Array.isArray(history)) return;
    for (const msg of history) {
      const remoteJid = msg?.key?.remoteJid || "";
      if (!isStatusLikeJid(remoteJid) && !isStatusLikeJid(msg?.key?.participant || "")) continue;
      if (!isAutoStatusSaveEnabled()) continue;
      const unwrappedStatusMessage = unwrapMessage(msg.message);
      const msgType = getContentType(unwrappedStatusMessage) || Object.keys(unwrappedStatusMessage || {})[0];
      cacheStatusMessage(msg, unwrappedStatusMessage, msgType);
    }
  });

  sock.ev.on("messages.update", (updates) => {
    if (!Array.isArray(updates)) return;
    for (const update of updates) {
      const remoteJid = update?.key?.remoteJid || "";
      const participantJid = update?.key?.participant || "";
      if (!isStatusLikeJid(remoteJid) && !isStatusLikeJid(participantJid)) continue;
      if (!update?.message) continue;
      const normalizedUpdate = {
        key: update.key,
        message: update.message,
        messageTimestamp: update.messageTimestamp,
        pushName: update.pushName,
      };
      if (isAutoStatusSaveEnabled()) {
        const unwrappedStatusMessage = unwrapMessage(update.message);
        const msgType = getContentType(unwrappedStatusMessage) || Object.keys(unwrappedStatusMessage || {})[0];
        cacheStatusMessage(normalizedUpdate, unwrappedStatusMessage, msgType);
      }
      if (isAutoStatusViewEnabled()) {
        markStatusViewed(sock, update.key, "update");
      }
    }
  });

  sock.ev.on("messages.upsert", async (chatUpdate) => {
    const msgCount = chatUpdate.messages?.length || 0;
    console.log(`[DESAM-CONN] ✉️  Message upsert: type=${chatUpdate.type}, count=${msgCount}`);

    if (!Array.isArray(chatUpdate.messages)) return;

    for (const msg of chatUpdate.messages) {
      try {
        const remoteJid = msg.key?.remoteJid || "";
        const msgId = msg.key?.id || "no-id";
        const fromMe = msg.key?.fromMe || false;
        const hasMessage = !!msg.message;
        const messageType = msg.message ? Object.keys(msg.message)[0] : "none";
        const jidType = getJidType(remoteJid);
        const chatTypeLabel = getChatTypeLabel(remoteJid);
        console.log(`[DESAM-CONN] Processing message from ${formatJidForLogging(remoteJid)} | ID: ${msgId} | fromMe: ${fromMe} | hasMessage: ${hasMessage} | type: ${messageType}`);
        
        // Skip protocol messages and other system messages
        if (messageType === "protocolMessage" || messageType === "senderKeyDistributionMessage") {
          console.log(`[DESAM-CONN] ⏭️  Skipping system message type: ${messageType}`);
          continue;
        }

        // ── Handle Broadcast/Status Messages ────────────────────────────────────
        if (isStatusLikeJid(remoteJid) || isStatusLikeJid(msg.key?.participant || "")) {
          console.log(`[DESAM-CONN] 📢 Broadcast/Status message from ${formatJidForLogging(remoteJid)}`);
          const unwrappedStatusMessage = unwrapMessage(msg.message);
          const msgType = getContentType(unwrappedStatusMessage) || Object.keys(unwrappedStatusMessage || {})[0];
          // Cache status for statusdl command (only if AUTO_STATUS_SAVE=on)
          if (isAutoStatusSaveEnabled()) {
            cacheStatusMessage(msg, unwrappedStatusMessage, msgType);
          } else {
            console.log(`[DESAM-STATUS] Auto-save disabled; status not cached: ${msg.key?.id || "no-id"}`);
          }
          // Auto-view status (only if AUTO_STATUS_VIEW=on)
          if (isAutoStatusViewEnabled()) {
            markStatusViewed(sock, msg.key, "upsert");
          } else {
            console.log(`[DESAM-STATUS] Auto-view disabled; status not marked seen: ${msg.key?.id || "no-id"}`);
          }
          // Auto-react to status (only if AUTO_STATUS_REACT=on)
          sendStatusReaction(sock, msg.key);

          // Allow owner-triggered commands from status context (e.g. replying .save on a status)
          if (isOwnerStatusCommandSender(sock, msg)) {
            const statusBody = extractStatusBody(unwrappedStatusMessage, msgType)
              .replace(/[\u200B-\u200F\uFEFF\u2060]/g, "")
              .trim();

            const isStatusCommand =
              statusBody.startsWith(config.PREFIX) ||
              statusBody.startsWith(`*${config.PREFIX}`);

            if (isStatusCommand) {
              await handleMessage(sock, msg).catch((err) => {
                console.error(`[DESAM-CONN] Error handling status-context command ${msgId}:`, err.message);
              });
            }
          }
          continue;
        }

        // ── Handle Newsletter Messages ──────────────────────────────────────────
        if (isNewsletter(remoteJid)) {
          console.log(`[DESAM-CONN] 📰 Newsletter message from ${formatJidForLogging(remoteJid)}`);
          // Newsletters are read-only by design, skip processing
          continue;
        }

        // ── Handle Link ID (LID) Messages ──────────────────────────────────────
        if (isLid(remoteJid)) {
          console.log(`[DESAM-CONN] 🔗 Link ID message from ${formatJidForLogging(remoteJid)}`);
          // Process LID messages (similar to personal chats)
        }

        // Process messages with granular error handling per message
        console.log(`[DESAM-CONN] Calling handleMessage for message...`);
        await handleMessage(sock, msg).catch((err) => {
          console.error(`[DESAM-CONN] Error in handleMessage for ${msgId}:`, err.message);
          // Check for Bad MAC in message processing
          if (err && err.message && err.message.includes('Bad MAC')) {
            console.error("[DESAM] Bad MAC detected during message processing!");
            const badMacFlagPath = path.join(__dirname, "..", ".bad_mac_detected");
            try {
              fs.writeFileSync(badMacFlagPath, Date.now().toString());
            } catch (e) {}
          }
        });
        console.log(`[DESAM-CONN] handleMessage completed for ${msgId}`);
      } catch (msgError) {
        const msgId = msg?.key?.id || "unknown";
        console.error(`[DESAM-CONN] Error extracting/validating message ${msgId}:`, msgError.message);
        if (msgError && msgError.message && msgError.message.includes('Bad MAC')) {
          console.error("[DESAM] Critical: Bad MAC error in message handling!");
          const badMacFlagPath = path.join(__dirname, "..", ".bad_mac_detected");
          try {
            fs.writeFileSync(badMacFlagPath, Date.now().toString());
          } catch (e) {}
        }
      }
    }
  });

  // ── Call Handler (ANTI_CALL) ──────────────────────────────────────────
  sock.ev.on("call", async (callEvents) => {
    if (config.ANTI_CALL !== "on") return;
    for (const call of callEvents) {
      if (call.status === "offer") {
        try {
          await sock.rejectCall(call.id, call.from);
          const msg = config.ANTI_CALL_MSG || "❌ Calls are not allowed. This bot rejects all calls.";
          await sock.sendMessage(call.from, { text: msg });
          console.log(`[DESAM] Rejected call from ${call.from}`);
        } catch (err) {
          console.error("[DESAM] Failed to reject call:", err.message);
        }
      }
    }
  });

  // ── Group Participants Update (Welcome/Goodbye) ───────────────────────
  sock.ev.on("group-participants.update", async (update) => {
    try {
      await handleGroupEvent(sock, update);
    } catch (err) {
      console.error("[DESAM] Group event error:", err.message);
    }
  });

  // ── Auto Bio Update ───────────────────────────────────────────────────
  if (config.AUTO_BIO === "on") {
    const bioInterval = setInterval(async () => {
      try {
        const now = moment().tz(config.TIMEZONE || "Africa/Accra");
        const time = now.format("HH:mm");
        const date = now.format("DD/MM/YYYY");
        const bio = (config.AUTO_BIO_MSG || "🤖 Desam WABot | {time} | {date}")
          .replace(/{time}/g, time)
          .replace(/{date}/g, date);
        await sock.updateProfileStatus(bio);
      } catch (err) {
        console.error("[DESAM] Auto bio update failed:", err.message);
      }
    }, 60000);
    // Clear interval on connection close
    sock.ev.on("connection.update", (u) => {
      if (u.connection === "close") clearInterval(bioInterval);
    });
  }

    return sock;
  } finally {
    isStartingConnection = false;
  }
}

module.exports = {
  startConnection,
  statusCache,
  statusMessageIdIndex,
  cacheStatusMessage,
  markStatusViewed,
  sendStatusReaction,
  isAutoStatusViewEnabled,
  isAutoStatusSaveEnabled,
  isAutoStatusReactEnabled,
  isStatusLikeJid,
  unwrapMessage,
  getOwnerJid,
  store,
};
