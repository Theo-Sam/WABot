const fs = require("fs");
const path = require("path");
const config = require("../config");
const { serialize } = require("./serialize");
const { areJidsSameUser, jidNormalizedUser } = require("@whiskeysockets/baileys");
const { isBanned, getGroupSettings } = require("./database");

const commands = new Map();
const categories = new Map();

const spamTracker = new Map();
const chatbotThrottle = new Map();
const SPAM_WINDOW = 5000;
const SPAM_WARN = 10;
const SPAM_DELETE = 15;
const SPAM_KICK = 20;

const groupMetaCache = new Map();
const GROUP_META_TTL = 30000;

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of spamTracker) {
    if (now - data.lastReset > SPAM_WINDOW * 6) spamTracker.delete(key);
  }
  for (const [key, ts] of chatbotThrottle) {
    if (now - ts > 5000) chatbotThrottle.delete(key);
  }
  for (const [key, data] of groupMetaCache) {
    if (now - data.ts > GROUP_META_TTL * 5) groupMetaCache.delete(key);
  }
  for (const [key, data] of bannedCache) {
    if (now - data.ts > BANNED_CACHE_TTL * 3) bannedCache.delete(key);
  }
  for (const [key, data] of groupSettingsCache) {
    if (now - data.ts > GROUP_SETTINGS_TTL * 3) groupSettingsCache.delete(key);
  }
}, 30000);

async function getCachedGroupMeta(sock, chat) {
  const cached = groupMetaCache.get(chat);
  if (cached && Date.now() - cached.ts < GROUP_META_TTL) {
    return cached.data;
  }
  try {
    const meta = await sock.groupMetadata(chat);
    groupMetaCache.set(chat, { data: meta, ts: Date.now() });
    return meta;
  } catch {
    return cached?.data || null;
  }
}

let funPlugin = null;
let groupPlugin = null;
let stickerPlugin = null;
let helpersModule = null;

function loadPlugins() {
  commands.clear();
  categories.clear();
  const pluginsDir = path.join(__dirname, "..", "plugins");
  if (!fs.existsSync(pluginsDir)) return;

  const files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(pluginsDir, file))];
      const plugin = require(path.join(pluginsDir, file));
      if (plugin.commands && Array.isArray(plugin.commands)) {
        for (const cmd of plugin.commands) {
          const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
          for (const name of names) {
            commands.set(name.toLowerCase(), cmd);
          }
          const cat = cmd.category || "misc";
          if (!categories.has(cat)) categories.set(cat, []);
          const primaryName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
          if (!categories.get(cat).find((c) => c.name === primaryName)) {
            categories.get(cat).push({
              name: primaryName,
              aliases: Array.isArray(cmd.name) ? cmd.name.slice(1) : [],
              desc: cmd.desc || "",
            });
          }
        }
      }
    } catch (err) {
      console.error(`[DESAM] Failed to load plugin ${file}:`, err.message);
    }
  }

  try { funPlugin = require(path.join(pluginsDir, "fun.js")); } catch { }
  try { groupPlugin = require(path.join(pluginsDir, "group.js")); } catch { }
  try { stickerPlugin = require(path.join(pluginsDir, "sticker.js")); } catch { }
  try { helpersModule = require(path.join(__dirname, "helpers.js")); } catch { }

  console.log(`[DESAM] Loaded ${commands.size} commands from ${files.length} plugins`);
}

function getMenu() {
  const { runtime: rt } = require("./helpers");
  const uptime = rt();

  let menu = `╔══════════════════════════╗\n`;
  menu += `║    *${config.BOT_NAME}*    ║\n`;
  menu += `╚══════════════════════════╝\n\n`;
  menu += `👋 *Hey there!*\n`;
  menu += `⏱️ Uptime: ${uptime}\n`;
  menu += `📡 Mode: ${config.MODE}\n`;
  menu += `🔑 Prefix: ${config.PREFIX}\n`;
  menu += `📊 Commands: ${commands.size}\n\n`;
  menu += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  menu += `📋 *COMMAND CATEGORIES*\n`;
  menu += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  const catOrder = ["main", "ai", "download", "media", "sticker", "fun", "group", "settings", "tools", "utility", "search", "education", "sports", "religious", "notes", "status", "misc", "owner"];
  const sortedCats = [...categories.entries()].sort((a, b) => {
    const ai = catOrder.indexOf(a[0].toLowerCase());
    const bi = catOrder.indexOf(b[0].toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const [cat, cmds] of sortedCats) {
    const emoji = getCategoryEmoji(cat);
    const totalAliases = cmds.reduce((sum, c) => sum + 1 + (c.aliases?.length || 0), 0);
    menu += `${emoji} *${cat.toUpperCase()}* — ${cmds.length} cmds (${totalAliases} total)\n`;
    menu += `   ${config.PREFIX}menu ${cat.toLowerCase()}\n\n`;
  }

  menu += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  menu += `💡 *Quick Access:*\n`;
  menu += `▸ ${config.PREFIX}menu <category> — View category\n`;
  menu += `▸ ${config.PREFIX}list — All commands numbered\n`;
  menu += `▸ ${config.PREFIX}list 2 — Page 2 of commands\n`;
  menu += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  menu += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
  return menu;
}

function getCategoryEmoji(cat) {
  const emojis = {
    main: "🏠",
    group: "👥",
    sticker: "🎨",
    media: "🎵",
    tools: "🔧",
    fun: "🎮",
    owner: "👑",
    settings: "⚙️",
    misc: "📦",
    download: "📥",
    search: "🔍",
    ai: "🤖",
    religious: "🙏",
    sports: "⚽",
    education: "📚",
    utility: "🔨",
    status: "📡",
    notes: "📝",
  };
  return emojis[cat.toLowerCase()] || "📌";
}

function checkSpam(sender, chat) {
  const now = Date.now();
  const key = `${sender}:${chat}`;
  if (!spamTracker.has(key)) {
    spamTracker.set(key, { count: 1, lastReset: now });
    return 0;
  }
  const data = spamTracker.get(key);
  if (now - data.lastReset > SPAM_WINDOW) {
    data.count = 1;
    data.lastReset = now;
    return 0;
  }
  data.count++;
  return data.count;
}

async function handleSpam(sock, m, { isAdmin, isOwner, isBotAdmin, groupMeta }) {
  if (!m.isGroup || isAdmin || isOwner) return false;
  const settings = getGroupSettings(m.chat);
  if (!settings || !settings.antispam) return false;
  const count = checkSpam(m.sender, m.chat);
  if (count >= SPAM_KICK && isBotAdmin) {
    await sock.sendMessage(m.chat, { delete: m.key }).catch(() => { });
    await sock.groupParticipantsUpdate(m.chat, [m.sender], "remove").catch(() => { });
    await sock.sendMessage(m.chat, {
      text: `🚫 @${m.sender.split("@")[0]} has been removed for spamming!`,
      mentions: [m.sender],
    }).catch(() => { });
    const key = `${m.sender}:${m.chat}`;
    spamTracker.delete(key);
    return true;
  }
  if (count >= SPAM_DELETE && isBotAdmin) {
    await sock.sendMessage(m.chat, { delete: m.key }).catch(() => { });
    if (count === SPAM_DELETE) {
      await sock.sendMessage(m.chat, {
        text: `⚠️ @${m.sender.split("@")[0]}, stop spamming! You will be removed if you continue.`,
        mentions: [m.sender],
      }).catch(() => { });
    }
    return true;
  }
  if (count >= SPAM_WARN) {
    if (count === SPAM_WARN) {
      await sock.sendMessage(m.chat, {
        text: `⚠️ @${m.sender.split("@")[0]}, slow down! You're sending messages too fast.`,
        mentions: [m.sender],
      }).catch(() => { });
    }
    return false;
  }
  return false;
}

const bannedCache = new Map();
const BANNED_CACHE_TTL = 60000;

function isBannedCached(sender) {
  const cached = bannedCache.get(sender);
  if (cached && Date.now() - cached.ts < BANNED_CACHE_TTL) return cached.val;
  const val = isBanned(sender);
  bannedCache.set(sender, { val, ts: Date.now() });
  return val;
}

const groupSettingsCache = new Map();
const GROUP_SETTINGS_TTL = 30000;

const DEBUG_LOGS = String(process.env.DEBUG_LOGS || "off").toLowerCase() === "on";

function debugLog(message) {
  if (DEBUG_LOGS) console.log(message);
}

function getCachedGroupSettings(chat) {
  const cached = groupSettingsCache.get(chat);
  if (cached && Date.now() - cached.ts < GROUP_SETTINGS_TTL) return cached.data;
  const data = getGroupSettings(chat);
  groupSettingsCache.set(chat, { data, ts: Date.now() });
  return data;
}

async function handleMessage(sock, rawMsg) {
  console.log(`[DESAM-HANDLER] Message received, processing...`);
  const m = serialize(sock, rawMsg);
  if (!m) {
    console.log(`[DESAM-HANDLER] ⚠️  Serialize returned null, skipping message`);
    return;
  }

  const rawBody = m.body || "";
  const body = rawBody.replace(/[\u200B-\u200F\uFEFF\u2060]/g, "").trim();
  
  // Skip messages with no content unless they're for specific processing
  if (!body && !m.isMedia && !m.isSticker) {
    const msgType = m.type || "unknown";
    console.log(`[DESAM-HANDLER] ⏭️  Skipping empty message type: ${msgType}`);
    return;
  }

  console.log(`[DESAM-HANDLER] 📨 Message from ${m.sender.split('@')[0]} | fromMe: ${m.fromMe} | body: "${(m.body || '').substring(0, 30)}" | type: ${m.type}`);
  debugLog(`[DEBUG] Received message from ${m.sender} in ${m.chat}. fromMe: ${m.fromMe}, id: ${m.id}`);

  const isCommand = body.startsWith(config.PREFIX) || body.startsWith(`*${config.PREFIX}`);
  console.log(`[DESAM-HANDLER] 🔍 Body: "${body}" | isCommand: ${isCommand} | Prefix: "${config.PREFIX}"`);
  debugLog(`[DEBUG] Body: "${body}", isCommand: ${isCommand}`);

  // ── Infinite Loop Prevention ──────────────────────────────────────────
  // Ignore messages sent by this bot instance unless it's an explicit command from me.
  if (sock.isSelfSent && sock.isSelfSent(m.id) && !(m.fromMe && isCommand)) {
    debugLog(`[DEBUG] Skipping message ${m.id} as it was sent by the bot (Loop Prevention).`);
    return;
  }

  // ── Primary Device & Global Command Execution ─────────────────────────
  // 2. Allow commands sent FROM ME (the owner's phone) to trigger the bot.
  // 3. For any outgoing message (fromMe), only process if it's a command.
  // This follows the requirement: If fromMe is true AND it starts with prefix, process it.
  if (m.fromMe && !isCommand) {
    debugLog(`[DEBUG] Skipping outgoing non-command from phone.`);
    return;
  }

  // Robust Owner Check: Check against normalized JID and sock.user.lid (Baileys v6+ support)
  const normalizedOwner = config.OWNER_NUMBER?.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const isOwner = areJidsSameUser(m.sender, normalizedOwner) || (sock.user?.lid && areJidsSameUser(m.sender, sock.user.lid));

  if (config.AUTO_READ === "on") {
    sock.readMessages([m.key]).catch(() => { });
  }

  // Ban check removed - allow all users to use bot
  const isGroup = m.isGroup;
  let isAdmin = false;
  let isBotAdmin = false;
  let groupMeta = null;
  let groupSettings = null;

  if (isGroup) {
    groupSettings = getCachedGroupSettings(m.chat);

    const metaNeeded = isCommand || (groupSettings && (groupSettings.antispam || groupSettings.antilink || groupSettings.antibad));
    if (metaNeeded) {
      groupMeta = await getCachedGroupMeta(sock, m.chat);
      if (groupMeta) {
        const participants = groupMeta.participants || [];
        isAdmin = participants.some((p) => p.id === m.sender && (p.admin === "admin" || p.admin === "superadmin"));
        const botJid = sock.user.id.replace(/:.*@/, "@");
        isBotAdmin = participants.some((p) => p.id.replace(/:.*@/, "@") === botJid && (p.admin === "admin" || p.admin === "superadmin"));
      }
    }

    if (groupSettings && groupSettings.antispam) {
      const spamBlocked = await handleSpam(sock, m, { isAdmin, isOwner, isBotAdmin, groupMeta });
      if (spamBlocked) return;
    }

    if (isBotAdmin && m.body && groupPlugin && groupSettings) {
      try {
        if (groupSettings.antilink) {
          const blocked = await groupPlugin.handleAntilink(sock, m, { groupMeta });
          if (blocked) return;
        }
        if (groupSettings.antibad) {
          const blocked2 = await groupPlugin.handleAntibad(sock, m, { groupMeta });
          if (blocked2) return;
        }
      } catch { }
    }
  }

  if (funPlugin) {
    try {
      const afkInfo = funPlugin.clearAfk(m.sender);
      if (afkInfo) {
        const mins = Math.floor((Date.now() - afkInfo.time) / 60000);
        sock.sendMessage(m.chat, {
          text: `👋 @${m.sender.split("@")[0]} is back! (was AFK for ${mins}m)`,
          mentions: [m.sender],
        }).catch(() => { });
      }
      if (m.mentions && m.mentions.length > 0) {
        funPlugin.checkAfk(sock, m);
      }
    } catch { }
  }

  // Non-critical auto-sticker conversion (non-blocking)
  if (isGroup && m.isImage && stickerPlugin && groupSettings && groupSettings.autosticker) {
    (async () => {
      try {
        const buffer = await m.download();
        const stickerBuf = await stickerPlugin.createSticker(buffer);
        sock.sendMessage(m.chat, { sticker: stickerBuf }, { quoted: { key: m.key, message: m.message } }).catch(() => { });
      } catch { }
    })();
  }

  let commandMatched = false;

  if (isCommand) {
    const normalized = body.startsWith(`*${config.PREFIX}`)
      ? body.replace(/^\*/, "").replace(/\*$/, "")
      : body;
    const fullCmd = normalized.slice(config.PREFIX.length).trim();
    const args = fullCmd.split(/\s+/).filter(Boolean);
    const cmdName = (args.shift() || "").toLowerCase();
    const text = args.join(" ");

    const cmd = commands.get(cmdName);
    console.log(`[DESAM-HANDLER] 🎯 Command lookup: "${cmdName}" | Found: ${!!cmd}`);
    if (cmd) {
      commandMatched = true;
      console.log(`[DESAM-HANDLER] ✅ Executing command: ${cmdName}`);

      if (cmd.owner && !isOwner) {
        return m.reply("❌ This command is for the bot owner only.");
      }

      if (cmd.group && !isGroup && !isOwner) {
        return m.reply("❌ This command can only be used in groups.");
      }

      if (cmd.admin && !isAdmin && !isOwner) {
        return m.reply("❌ You need to be a group admin to use this command.");
      }

      if (cmd.botAdmin && !isBotAdmin && !isOwner) {
        return m.reply("❌ Bot needs to be a group admin for this command.");
      }

      try {
        await cmd.handler(sock, m, { args, text, isOwner, isAdmin, isBotAdmin, groupMeta, config, commands, getMenu });
      } catch (err) {
        console.error(`[DESAM-HANDLER] ❌ Command error in "${cmdName}": ${err?.message || err}`);
        await m.reply("⚠️ An error occurred while executing this command.").catch(() => { });
      }
    }
  }

  if (!commandMatched && isGroup && m.body && !m.fromMe && groupSettings && groupSettings.chatbot && helpersModule) {
    try {
      const now = Date.now();
      const chatKey = `chatbot:${m.chat}`;
      const lastReply = chatbotThrottle.get(chatKey) || 0;
      if (now - lastReply < 500) return;
      chatbotThrottle.set(chatKey, now);
      const question = m.body.trim();
      if (question.length > 0 && question.length < 1000) {
        const apis = [
          `https://deliriussapi-oficial.vercel.app/ia/gptweb?text=${encodeURIComponent(question)}`,
          `https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(question)}`,
        ];

        // Race the APIs for maximum speed with a strict 2.5s timeout
        const answer = await Promise.race([
          Promise.any(
            apis.map(async (url) => {
              try {
                const data = await helpersModule.fetchJson(url);
                const res = data?.data || data?.result || data?.answer || data?.response || "";
                if (!res) throw new Error("Empty response");
                return res;
              } catch (err) {
                throw err;
              }
            })
          ),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Chatbot timeout")), 2500))
        ]).catch(() => "");

        if (answer) {
          await m.reply(answer);
        }
      }
    } catch { }
  }
}


module.exports = { loadPlugins, handleMessage, commands, categories, getMenu };

loadPlugins();
