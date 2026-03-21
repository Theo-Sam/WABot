const fs = require("fs");
const path = require("path");
let Database;
let databaseLoadError = null;
try {
  Database = require("better-sqlite3");
} catch (error) {
  Database = null;
  databaseLoadError = error;
}

let db = null;

function getDatabasePath() {
  const configuredPath = String(process.env.SQLITE_PATH || "./data/bot.db").trim();
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }
  return path.join(__dirname, "..", configuredPath);
}

function getDb() {
  if (db) return db;
  if (!Database) {
    const detail = databaseLoadError ? ` ${databaseLoadError.message}` : "";
    throw new Error(`SQLite driver failed to load.${detail}`);
  }
  const dbPath = getDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  try {
    db = new Database(dbPath);
  } catch (error) {
    throw new Error(`Failed to open SQLite database at ${dbPath}: ${error.message}`);
  }
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  initTables();
  return db;
}

function closeDb() {
  if (!db) return;
  db.close();
  db = null;
}

function ensureDatabaseReady() {
  return getDb();
}

function initTables() {
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_settings (
      jid TEXT PRIMARY KEY,
      welcome INTEGER DEFAULT 0,
      welcome_msg TEXT DEFAULT '',
      goodbye INTEGER DEFAULT 0,
      goodbye_msg TEXT DEFAULT '',
      antilink INTEGER DEFAULT 0,
      antilink_action TEXT DEFAULT 'warn',
      antibad INTEGER DEFAULT 0,
      badwords TEXT DEFAULT '[]',
      antispam INTEGER DEFAULT 0,
      mute INTEGER DEFAULT 0,
      antiviewonce INTEGER DEFAULT 0,
      antidelete INTEGER DEFAULT 0,
      chatbot INTEGER DEFAULT 0,
      autosticker INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS warnings (
      jid TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      type TEXT NOT NULL,
      count INTEGER DEFAULT 1,
      PRIMARY KEY (jid, user_jid, type)
    );
    CREATE TABLE IF NOT EXISTS banned (
      jid TEXT PRIMARY KEY,
      reason TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS notes (
      jid TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by TEXT DEFAULT '',
      created_at INTEGER DEFAULT 0,
      PRIMARY KEY (jid, name)
    );
  `);
}

function getGroupSettings(jid) {
  const d = getDb();
  if (!d) return null;
  let row = d.prepare("SELECT * FROM group_settings WHERE jid = ?").get(jid);
  if (!row) {
    d.prepare("INSERT OR IGNORE INTO group_settings (jid) VALUES (?)").run(jid);
    row = d.prepare("SELECT * FROM group_settings WHERE jid = ?").get(jid);
  }
  return row;
}

function updateGroupSetting(jid, key, value) {
  const d = getDb();
  if (!d) return;
  const allowed = [
    "welcome", "welcome_msg", "goodbye", "goodbye_msg",
    "antilink", "antilink_action", "antibad", "badwords",
    "antispam", "mute", "antiviewonce", "antidelete",
    "chatbot", "autosticker",
  ];
  if (!allowed.includes(key)) return;
  d.prepare("INSERT OR IGNORE INTO group_settings (jid) VALUES (?)").run(jid);
  d.prepare(`UPDATE group_settings SET ${key} = ? WHERE jid = ?`).run(value, jid);
}

function getWarnings(jid, userJid, type) {
  const d = getDb();
  if (!d) return 0;
  const row = d.prepare("SELECT count FROM warnings WHERE jid = ? AND user_jid = ? AND type = ?").get(jid, userJid, type);
  return row ? row.count : 0;
}

function addWarning(jid, userJid, type) {
  const d = getDb();
  if (!d) return 1;
  d.prepare(`INSERT INTO warnings (jid, user_jid, type, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(jid, user_jid, type) DO UPDATE SET count = count + 1`).run(jid, userJid, type);
  const row = d.prepare("SELECT count FROM warnings WHERE jid = ? AND user_jid = ? AND type = ?").get(jid, userJid, type);
  return row ? row.count : 1;
}

function resetWarnings(jid, userJid, type) {
  const d = getDb();
  if (!d) return;
  if (userJid) {
    d.prepare("DELETE FROM warnings WHERE jid = ? AND user_jid = ? AND type = ?").run(jid, userJid, type);
  } else {
    d.prepare("DELETE FROM warnings WHERE jid = ? AND type = ?").run(jid, type);
  }
}

function isBanned(jid) {
  const d = getDb();
  if (!d) return false;
  return !!d.prepare("SELECT 1 FROM banned WHERE jid = ?").get(jid);
}

function banUser(jid, reason) {
  const d = getDb();
  if (!d) return;
  d.prepare("INSERT OR REPLACE INTO banned (jid, reason) VALUES (?, ?)").run(jid, reason || "");
}

function unbanUser(jid) {
  const d = getDb();
  if (!d) return;
  d.prepare("DELETE FROM banned WHERE jid = ?").run(jid);
}

function addNote(jid, name, content, createdBy) {
  const d = getDb();
  if (!d) return;
  d.prepare(
    "INSERT OR REPLACE INTO notes (jid, name, content, created_by, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(jid, name.toLowerCase(), content, createdBy || "", Date.now());
}

function getNote(jid, name) {
  const d = getDb();
  if (!d) return null;
  return d.prepare("SELECT * FROM notes WHERE jid = ? AND name = ?").get(jid, name.toLowerCase()) || null;
}

function deleteNote(jid, name) {
  const d = getDb();
  if (!d) return false;
  const result = d.prepare("DELETE FROM notes WHERE jid = ? AND name = ?").run(jid, name.toLowerCase());
  return result.changes > 0;
}

function listNotes(jid) {
  const d = getDb();
  if (!d) return [];
  return d.prepare("SELECT name, created_by, created_at FROM notes WHERE jid = ? ORDER BY name").all(jid);
}

function migrateDb() {
  const d = getDb();
  if (!d) return;
  try {
    d.prepare("SELECT chatbot FROM group_settings LIMIT 1").get();
  } catch {
    try { d.exec("ALTER TABLE group_settings ADD COLUMN chatbot INTEGER DEFAULT 0"); } catch {}
    try { d.exec("ALTER TABLE group_settings ADD COLUMN autosticker INTEGER DEFAULT 0"); } catch {}
  }
  try {
    d.prepare("SELECT 1 FROM notes LIMIT 1").get();
  } catch {
    try {
      d.exec(`CREATE TABLE IF NOT EXISTS notes (
        jid TEXT NOT NULL, name TEXT NOT NULL, content TEXT NOT NULL,
        created_by TEXT DEFAULT '', created_at INTEGER DEFAULT 0,
        PRIMARY KEY (jid, name)
      )`);
    } catch {}
  }
}

migrateDb();

function listBanned() {
  const d = getDb();
  if (!d) return [];
  return d.prepare("SELECT jid, reason FROM banned ORDER BY jid").all();
}

module.exports = {
  closeDb,
  ensureDatabaseReady,
  getDatabasePath,
  getGroupSettings,
  updateGroupSetting,
  getWarnings,
  addWarning,
  resetWarnings,
  isBanned,
  banUser,
  unbanUser,
  addNote,
  getNote,
  deleteNote,
  listNotes,
  listBanned,
};