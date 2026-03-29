const fs = require("fs");
const path = require("path");
const config = require("../config");
const { serialize } = require("./serialize");
const { areJidsSameUser, jidNormalizedUser } = require("@whiskeysockets/baileys");
const { isBanned, getGroupSettings } = require("./database");
const { getSelfJid, normalizeAiText } = require("./helpers");

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
let gamesPlugin = null;
let helpersModule = null;

const DESC_STOP_WORDS = new Set([
  "a", "an", "the", "to", "for", "of", "and", "or", "if", "is", "in", "on", "with", "from", "into", "by", "at", "as",
  "get", "show", "run", "use", "your", "you", "all", "new", "set", "check", "bot", "command", "commands"
]);

const WORD_SYNONYMS = {
  picture: ["pic", "image", "photo"],
  image: ["img", "pic", "photo"],
  photo: ["pic", "image"],
  download: ["dl", "getfile"],
  video: ["vid", "clip"],
  audio: ["music", "song"],
  sticker: ["stk", "stiker"],
  translate: ["trans", "convertlang"],
  weather: ["forecast", "temp"],
  football: ["soccer"],
  soccer: ["football"],
  standings: ["table"],
  owner: ["creator"],
  search: ["find", "lookup"],
  profile: ["info"],
  settings: ["config", "setup"],
  remove: ["delete"],
  random: ["rand"],
  calculator: ["calc"],
};

function normalizeCommandDescription(desc, primaryName, category) {
  if (typeof desc === "string" && desc.trim()) return desc.trim();
  const clean = String(primaryName || "command").replace(/[_-]+/g, " ").trim();
  const label = clean || "command";
  const cat = String(category || "misc").trim();
  return `Run ${label} (${cat}).`;
}

function buildAliasCandidates(cmd, names) {
  const candidates = new Set();
  const push = (value) => {
    const alias = String(value || "").toLowerCase().trim();
    if (!alias) return;
    if (alias.length < 2 || alias.length > 24) return;
    if (!/^[a-z0-9]+$/.test(alias)) return;
    candidates.add(alias);
  };

  for (const rawName of names) {
    const lower = String(rawName || "").toLowerCase().trim();
    if (!lower) continue;

    const compact = lower.replace(/[^a-z0-9]/g, "");
    if (compact && compact !== lower) push(compact);

    const parts = lower.split(/[^a-z0-9]+/).filter(Boolean);
    for (const part of parts) {
      if (part.length >= 3) push(part);
    }
    if (parts.length >= 2) {
      push(parts.map((p) => p[0]).join(""));
      push(parts.slice(0, 2).join(""));
      push(parts.join(""));
    }

    if (compact.length >= 6) {
      push(compact.slice(0, 4));
      push(compact.slice(0, 5));
    }
  }

  const descWords = String(cmd.desc || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !DESC_STOP_WORDS.has(w));

  for (const w of descWords.slice(0, 8)) {
    push(w);
    const syns = WORD_SYNONYMS[w];
    if (Array.isArray(syns)) {
      for (const syn of syns) push(syn);
    }
  }

  if (descWords.length >= 2) {
    const w1 = descWords[0];
    const w2 = descWords[1];
    push(`${w1}${w2}`);
    push(`${w1}${w2.slice(0, 3)}`);
  }

  return candidates;
}

function expandAliasesForCommands(loaded) {
  const seenDeclared = new Set();
  for (const item of loaded) {
    for (const n of item.originalNames) seenDeclared.add(n);
  }

  const aliasOwners = new Map();
  for (let i = 0; i < loaded.length; i++) {
    const item = loaded[i];
    const ownSet = new Set(item.originalNames);
    const candidates = buildAliasCandidates(item.cmd, item.originalNames);
    for (const alias of candidates) {
      if (ownSet.has(alias)) continue;
      if (seenDeclared.has(alias)) continue;
      if (!aliasOwners.has(alias)) aliasOwners.set(alias, new Set());
      aliasOwners.get(alias).add(i);
    }
  }

  for (const [alias, ownerIds] of aliasOwners) {
    if (ownerIds.size !== 1) continue;
    const ownerIdx = [...ownerIds][0];
    loaded[ownerIdx].autoAliases.push(alias);
  }

  for (const item of loaded) {
    const merged = [...item.originalNames, ...item.autoAliases.sort()];
    item.cmd.name = [...new Set(merged)];
  }
}

function loadPlugins() {
  commands.clear();
  categories.clear();
  const pluginsDir = path.join(__dirname, "..", "plugins");
  if (!fs.existsSync(pluginsDir)) return;

  const loaded = [];
  const files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(pluginsDir, file))];
      const plugin = require(path.join(pluginsDir, file));
      if (plugin.commands && Array.isArray(plugin.commands)) {
        for (const cmd of plugin.commands) {
          const baseNames = (Array.isArray(cmd.name) ? cmd.name : [cmd.name])
            .map((n) => String(n || "").toLowerCase().trim())
            .filter(Boolean);
          if (!baseNames.length) continue;
          cmd.desc = normalizeCommandDescription(cmd.desc, baseNames[0], cmd.category || "misc");
          loaded.push({ cmd, originalNames: [...new Set(baseNames)], autoAliases: [] });
        }
      }
    } catch (err) {
      console.error(`[DESAM] Failed to load plugin ${file}:`, err.message);
    }
  }

  expandAliasesForCommands(loaded);

  for (const item of loaded) {
    const cmd = item.cmd;
    const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
    for (const name of names) {
      commands.set(name, cmd);
    }

    const cat = cmd.category || "misc";
    if (!categories.has(cat)) categories.set(cat, []);
    const primaryName = names[0];
    if (!categories.get(cat).find((c) => c.name === primaryName)) {
      categories.get(cat).push({
        name: primaryName,
        aliases: names.slice(1),
        desc: cmd.desc || "",
      });
    }
  }

  try { funPlugin = require(path.join(pluginsDir, "fun.js")); } catch { }
  try { groupPlugin = require(path.join(pluginsDir, "group.js")); } catch { }
  try { stickerPlugin = require(path.join(pluginsDir, "sticker.js")); } catch { }
  try { gamesPlugin = require(path.join(pluginsDir, "games.js")); } catch { }
  try { helpersModule = require(path.join(__dirname, "helpers.js")); } catch { }

  console.log(`[DESAM] Loaded ${commands.size} commands from ${files.length} plugins`);
}

function getMenu() {
  const { runtime: rt, getTimeGreeting } = require("./helpers");
  const uptime = rt();
  const greeting = getTimeGreeting(config.TIMEZONE || "Africa/Accra");

  const CAT_ORDER = [
    "main", "ai", "boosting", "download", "media", "sticker", "fun",
    "tools", "lifestyle", "education", "sports", "search",
    "group", "settings", "notes", "religious", "utility",
    "status", "reactions", "privacy", "converter", "anime",
    "games", "misc", "owner",
  ];

  const sortedCats = [...categories.entries()].sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a[0].toLowerCase());
    const bi = CAT_ORDER.indexOf(b[0].toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const totalCmds = commands.size;
  const totalCats = sortedCats.length;

  let menu = "";
  menu += `╔══════════════════════════════╗\n`;
  menu += `║  🤖  *${config.BOT_NAME}*  ║\n`;
  menu += `║      Powered by Desam Tech   ║\n`;
  menu += `╚══════════════════════════════╝\n\n`;
  menu += `${greeting} 👋\n\n`;
  menu += `⏱️  Uptime : ${uptime}\n`;
  menu += `🔑  Prefix : ${config.PREFIX}\n`;
  menu += `📊  Commands : ${totalCmds} across ${totalCats} categories\n\n`;
  menu += `┌──────────────────────────────┐\n`;
  menu += `│      📂  MENU CATEGORIES     │\n`;
  menu += `└──────────────────────────────┘\n\n`;

  for (const [cat, cmds] of sortedCats) {
    const emoji = getCategoryEmoji(cat);
    const label = CAT_LABELS[cat.toLowerCase()] || cat.charAt(0).toUpperCase() + cat.slice(1);
    const count = cmds.length;
    const pad = " ".repeat(Math.max(0, 18 - label.length));
    menu += `${emoji}  *${label}*${pad}  [${count} cmds]\n`;
    menu += `     ➜ ${config.PREFIX}menu ${cat.toLowerCase()}\n\n`;
  }

  menu += `────────────────────────────────\n`;
  menu += `💡 *How to use:*\n`;
  menu += `  • ${config.PREFIX}menu <category>  — category commands\n`;
  menu += `  • ${config.PREFIX}list             — full numbered list\n`;
  menu += `  • ${config.PREFIX}list 2           — go to page 2\n`;
  menu += `  • ${config.PREFIX}help <command>   — command details\n`;
  menu += `────────────────────────────────\n`;
  menu += `_${config.BOT_NAME} | Desam Tech_ ⚡`;
  return menu;
}

const CAT_LABELS = {
  main: "General",
  ai: "AI & Chat",
  boosting: "TikTok Boosting",
  download: "Downloads",
  media: "Media & Audio",
  sticker: "Stickers",
  fun: "Fun & Games",
  tools: "Tools & Calc",
  lifestyle: "Lifestyle",
  education: "Education",
  sports: "Sports",
  search: "Search & Info",
  group: "Group Admin",
  settings: "Settings",
  notes: "Notes & Reminders",
  religious: "Religious",
  utility: "Utility",
  status: "Status",
  reactions: "Reactions",
  privacy: "Privacy",
  converter: "Converter",
  anime: "Anime",
  games: "Games",
  misc: "Miscellaneous",
  owner: "Owner Only",
};

function getCategoryEmoji(cat) {
  const emojis = {
    main: "🏠",
    ai: "🤖",
    boosting: "🎵",
    download: "📥",
    media: "🎵",
    sticker: "🎨",
    fun: "🎮",
    tools: "🔧",
    lifestyle: "🌿",
    education: "📚",
    sports: "⚽",
    search: "🔍",
    group: "👥",
    settings: "⚙️",
    notes: "📝",
    religious: "🙏",
    utility: "🔨",
    status: "📡",
    reactions: "💫",
    privacy: "🔒",
    converter: "🔄",
    anime: "🎌",
    games: "🕹️",
    misc: "📦",
    owner: "👑",
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
const GROUP_SETTINGS_TTL = 3000;

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
  const m = serialize(sock, rawMsg);
  if (!m) return;

  const rawBody = typeof m.body === "string" ? m.body : (m.body ? String(m.body) : "");
  const body = rawBody.replace(/[\u200B-\u200F\uFEFF\u2060]/g, "").trim();
  
  if (!body && !m.isMedia && !m.isSticker) return;

  debugLog(`[DEBUG] Received message from ${m.sender} in ${m.chat}. fromMe: ${m.fromMe}, id: ${m.id}`);

  const isCommand = body.startsWith(config.PREFIX) || body.startsWith(`*${config.PREFIX}`);
  debugLog(`[DEBUG] Body: "${body}", isCommand: ${isCommand}`);

  // ── Infinite Loop Prevention ──────────────────────────────────────────
  // Ignore messages sent by this bot instance unless it's an explicit command from me.
  if (sock.isSelfSent && sock.isSelfSent(m.id) && !(m.fromMe && isCommand)) {
    debugLog(`[DEBUG] Skipping message ${m.id} as it was sent by the bot (Loop Prevention).`);
    return;
  }

  // ── Strict Owner & Bot-Ignore Policy ────────────────────────────────
  // Ignore messages from other bots (commonly starting with BAE5, 3EB0, or 16-char Baileys ids)
  if (m.id && (m.id.startsWith("BAE5") || m.id.startsWith("3EB0") || m.id.length === 16) && !m.fromMe) {
    debugLog(`[DEBUG] Skipping message from another bot. ID: ${m.id}`);
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

  const normalizedOwner = config.OWNER_NUMBER?.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const selfJid = sock.user?.id?.replace(/:.*@/, "@") || "";
  const isOwner = areJidsSameUser(m.sender, normalizedOwner) || areJidsSameUser(m.sender, selfJid) || (sock.user?.lid && areJidsSameUser(m.sender, sock.user.lid));

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

    const metaNeeded = isCommand || (groupSettings && (groupSettings.antispam || groupSettings.antilink || groupSettings.antibad || groupSettings.antiviewonce));
    if (metaNeeded) {
      groupMeta = await getCachedGroupMeta(sock, m.chat);
      if (groupMeta) {
        const participants = groupMeta.participants || [];
        isAdmin = participants.some((p) => areJidsSameUser(p.id, m.sender) && (p.admin === "admin" || p.admin === "superadmin"));
        const botJid = jidNormalizedUser(sock.user.id);
        isBotAdmin = participants.some((p) => areJidsSameUser(p.id, botJid) && (p.admin === "admin" || p.admin === "superadmin"));
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

    if (groupSettings && groupSettings.antiviewonce && m.isViewOnce && !m.fromMe) {
      try {
        const ownerNumber = config.OWNER_NUMBER?.replace(/[^0-9]/g, "");
        const ownerJid = ownerNumber
          ? jidNormalizedUser(`${ownerNumber}@s.whatsapp.net`)
          : getSelfJid(sock);
        if (ownerJid) {
          const buffer = await m.download();
          const fromLabel = m.pushName || m.sender.split("@")[0];
          const groupName = groupMeta?.subject || m.chat;
          const caption = `👁️ *Anti-ViewOnce Saved*\n📩 From: ${fromLabel}\n👥 Group: ${groupName}`;
          if (buffer && buffer.length > 100) {
            if (m.isImage) {
              await sock.sendMessage(ownerJid, { image: buffer, caption });
            } else if (m.isVideo) {
              await sock.sendMessage(ownerJid, { video: buffer, caption });
            } else if (m.isAudio) {
              await sock.sendMessage(ownerJid, {
                audio: buffer,
                mimetype: "audio/mpeg",
                ptt: false,
              });
              await sock.sendMessage(ownerJid, { text: caption });
            } else {
              await sock.sendMessage(ownerJid, {
                text: `${caption}\n📝 Text: ${m.body || "(no text content)"}`,
              });
            }
          } else {
            await sock.sendMessage(ownerJid, {
              text: `${caption}\n📝 Text: ${m.body || "(media could not be downloaded)"}`,
            });
          }
        }
      } catch (err) {
        console.error("[DESAM] Anti-viewonce forward error:", err.message);
      }
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

  // ── Spelling game answer checking (runs on every non-bot message) ─────────
  if (gamesPlugin && !m.fromMe && body && !isCommand) {
    try { gamesPlugin.checkSpellingAnswer(sock, m, body); } catch { }
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
    if (cmd) {
      commandMatched = true;

      // STRICT OWNER-ONLY MODE: Ignore commands from ANY other user
      if (!isOwner) {
        debugLog(`[DEBUG] Ignoring command ${cmdName} from non-owner ${m.sender}`);
        return;
      }

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
    // STRICT OWNER-ONLY MODE: Ignore chatbot triggers from ANY other user
    if (!isOwner) return;

    try {
      const now = Date.now();
      const chatKey = `chatbot:${m.chat}`;
      const lastReply = chatbotThrottle.get(chatKey) || 0;
      if (now - lastReply < 500) return;
      chatbotThrottle.set(chatKey, now);
      const question = m.body.trim();
      if (question.length > 0 && question.length < 1000) {
        const axios = require("axios");
        const chatSystemPrompt =
          "You are a WhatsApp assistant. Rules you MUST follow: " +
          "(1) Reply in 1-3 SHORT sentences only — never write essays or lists. " +
          "(2) NEVER use bullet points, numbered lists, or headings of any kind. " +
          "(3) NEVER start with filler words like Sure, Certainly, Of course, Great question. " +
          "(4) Write like a friend texting — casual and direct. " +
          "(5) If the answer needs more than 3 sentences, summarise it into one clear sentence instead.";
        const answer = await Promise.race([
          (async () => {
            const res = await axios.post("https://text.pollinations.ai/openai", {
              model: "openai",
              messages: [
                { role: "system", content: chatSystemPrompt },
                { role: "user", content: question },
              ],
              max_tokens: 120,
              temperature: 0.7,
            }, { timeout: 10000, headers: { "Content-Type": "application/json" } });
            return res.data?.choices?.[0]?.message?.content || "";
          })(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Chatbot timeout")), 10000))
        ]).catch(() => "");

        if (answer) {
          await m.reply(normalizeAiText(answer, { keepLightFormatting: false }));
        }
      }
    } catch { }
  }
}


module.exports = { loadPlugins, handleMessage, commands, categories, getMenu };

loadPlugins();
