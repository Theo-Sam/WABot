const os = require("os");
const path = require("path");
const fs = require("fs");
const { runtime, getSystemInfo, getTimeGreeting, formatBytes, sendImageOrText } = require("../lib/helpers");
const config = require("../config");

const CHANNEL_LINK = "https://whatsapp.com/channel/0029Vb7n5HyEgGfKW3Wp7U1h";
const CHANNEL_FOOTER = `\n📢 *Join our WhatsApp Channel for updates!*\nhttps://whatsapp.com/channel/0029Vb7n5HyEgGfKW3Wp7U1h\n\n_Powered by Desam Tech_ ⚡`;

let _cachedBotImage = null;
let _imageCacheChecked = false;

function getBotImage() {
  if (_imageCacheChecked) return _cachedBotImage;
  const imgPath = path.join(__dirname, "..", "public", "desam-bot.png");
  try {
    if (fs.existsSync(imgPath)) _cachedBotImage = fs.readFileSync(imgPath);
  } catch {}
  _imageCacheChecked = true;
  return _cachedBotImage;
}

const commands = [
  {
    name: ["menu", "help", "commands"],
    category: "main",
    desc: "Show command categories",
    handler: async (sock, m, { args, text, getMenu, commands: cmds }) => {
      m.react("📋");
      if (text) {
        const catMenu = getCategoryMenu(text.toLowerCase(), cmds);
        if (catMenu) return await sendImageOrText(sock, m.chat, getBotImage(), catMenu + CHANNEL_FOOTER, m);
        return await sendImageOrText(sock, m.chat, null, `❌ Category *${text}* not found.\n\nUse ${config.PREFIX}menu to see all categories.${CHANNEL_FOOTER}`, m);
      }
      const menuText = getMenu() + CHANNEL_FOOTER;
      await sendImageOrText(sock, m.chat, getBotImage(), menuText, m);
    },
  },
  {
    name: ["list", "allcommands", "commandlist"],
    category: "main",
    desc: "Show all commands with numbers",
    handler: async (sock, m, { args, text, commands: cmds }) => {
      m.react("📋");
      if (text) {
        const page = parseInt(text);
        if (!isNaN(page)) {
          const fullList = getFullList(cmds, page) + CHANNEL_FOOTER;
          return await sendImageOrText(sock, m.chat, getBotImage(), fullList, m);
        }
        const catMenu = getCategoryMenu(text.toLowerCase(), cmds);
        if (catMenu) {
          return await sendImageOrText(sock, m.chat, getBotImage(), catMenu + CHANNEL_FOOTER, m);
        }
      }
      const fullList = getFullList(cmds, 1) + CHANNEL_FOOTER;
      await sendImageOrText(sock, m.chat, getBotImage(), fullList, m);
    },
  },
  {
    name: ["alive", "ping", "bot"],
    category: "main",
    desc: "Check if bot is alive",
    handler: async (sock, m, { commands: cmds }) => {
      m.react("✅");
      const start = Date.now();
      const greeting = getTimeGreeting(config.TIMEZONE);
      const uptime = runtime();
      const latency = Date.now() - start;
      const totalCmds = cmds ? cmds.size : 0;
      const sys = getSystemInfo();
      const text = `🤖 *${config.BOT_NAME}*

${greeting}! 👋

✅ *Bot is online and running!*

*Bot Details*
⏱️ Uptime: ${uptime}
⚡ Speed: ${latency}ms
📡 Mode: ${config.MODE}
🔑 Prefix: ${config.PREFIX}
🤖 Commands: ${totalCmds}
👤 Owner: ${config.OWNER_NUMBER}

*System Info*
🖥️ Platform: ${sys.platform} ${sys.arch}
🧮 CPUs: ${sys.cpus}
💾 RAM: ${sys.freeMem} free / ${sys.totalMem}
📦 Node.js: ${sys.nodeVersion}
${CHANNEL_FOOTER}`;
      await sendImageOrText(sock, m.chat, getBotImage(), text, m);
    },
  },
  {
    name: ["info", "botinfo"],
    category: "main",
    desc: "Show bot information",
    handler: async (sock, m, { commands: cmds }) => {
      m.react("ℹ️");
      const sys = getSystemInfo();
      const totalCmds = cmds ? cmds.size : 0;
      const categories = new Set();
      if (cmds) for (const [, cmd] of cmds) categories.add((cmd.category || "misc").toLowerCase());
      const text = `ℹ️ *${config.BOT_NAME} — Info*

📌 *Bot Details*
📛 Name: ${config.BOT_NAME}
🔑 Prefix: ${config.PREFIX}
📡 Mode: ${config.MODE}
👤 Owner: ${config.OWNER_NUMBER}
🌍 Timezone: ${config.TIMEZONE}
🤖 Total Commands: ${totalCmds}
📂 Categories: ${categories.size}
⏱️ Uptime: ${sys.uptime}

💻 *System Info*
🖥️ Platform: ${sys.platform}
🏗️ Architecture: ${sys.arch}
🧮 CPUs: ${sys.cpus}
💾 Total RAM: ${sys.totalMem}
💾 Free RAM: ${sys.freeMem}
📦 Node.js: ${sys.nodeVersion}
${CHANNEL_FOOTER}`;
      await sendImageOrText(sock, m.chat, getBotImage(), text, m);
    },
  },
  {
    name: ["runtime", "uptime"],
    category: "main",
    desc: "Show bot uptime",
    handler: async (sock, m) => {
      m.react("⏱️");
      const text = `⏱️ *Uptime:* ${runtime()}${CHANNEL_FOOTER}`;
      await sendImageOrText(sock, m.chat, getBotImage(), text, m);
    },
  },
  {
    name: ["owner", "creator"],
    category: "main",
    desc: "Show bot owner",
    handler: async (sock, m) => {
      m.react("👑");
      const rawOwner = config.OWNER_NUMBER?.replace(/[^0-9]/g, "") ||
        sock.user?.id?.replace(/:.*@/, "@").replace(/[^0-9]/g, "") || "";
      const ownerNum = rawOwner;
      const text = `👑 *${config.BOT_NAME}*\n\n👑 *Bot Owner / Creator*\n\n📞 Number: +${ownerNum}\n🔗 Contact: wa.me/${ownerNum}\n${CHANNEL_FOOTER}`;
      await sendImageOrText(sock, m.chat, getBotImage(), text, m);
      await sock.sendMessage(m.chat, {
        contacts: {
          displayName: "Desam Tech",
          contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Desam Tech\nTEL;type=CELL;waid=${ownerNum}:+${ownerNum}\nEND:VCARD` }],
        },
      }, { quoted: { key: m.key, message: m.message } });
    },
  },
];

const CAT_EMOJIS = {
  main: "🏠", ai: "🤖", boosting: "🎵", download: "📥", media: "🎶", sticker: "🎨",
  fun: "🎮", tools: "🔧", lifestyle: "🌿", education: "📚", sports: "⚽",
  search: "🔍", group: "👥", settings: "⚙️", notes: "📝", religious: "🙏",
  utility: "🔨", status: "📡", reactions: "💫", privacy: "🔒",
  converter: "🔄", anime: "🎌", games: "🕹️", misc: "📦", owner: "👑",
};

const CAT_LABELS = {
  main: "General", ai: "AI & Chat", boosting: "Social Media Boosting",
  download: "Downloads", media: "Media & Audio", sticker: "Stickers",
  fun: "Fun & Games", tools: "Tools & Calculators", lifestyle: "Lifestyle",
  education: "Education", sports: "Sports", search: "Search & Info",
  group: "Group Admin", settings: "Settings", notes: "Notes & Reminders",
  religious: "Religious", utility: "Utility", status: "Status",
  reactions: "Reactions", privacy: "Privacy", converter: "Converter",
  anime: "Anime", games: "Games", misc: "Miscellaneous", owner: "Owner Only",
};

const CAT_ORDER = [
  "main", "ai", "download", "media", "sticker", "fun",
  "tools", "lifestyle", "education", "sports", "search",
  "group", "settings", "notes", "religious", "utility",
  "status", "reactions", "privacy", "converter", "anime",
  "games", "misc", "owner",
];

// Platform groups for the boosting category.
// Add a new entry here when a new platform is integrated.
const BOOSTING_PLATFORM_GROUPS = [
  {
    label: "TikTok",
    emoji: "🎵",
    commands: ["ttviews", "ttlikes"],
  },
  // { label: "Instagram", emoji: "📸", commands: ["igviews", "iglikes", "igfollowers"] },
  // { label: "YouTube",   emoji: "▶️",  commands: ["ytviews", "ytlikes", "ytsubs"] },
  // { label: "Facebook",  emoji: "👥",  commands: ["fbviews", "fblikes"] },
];
const BOOSTING_MGMT_COMMANDS = ["ttcheck", "boostcheck", "boosting"];

function buildBoostingMenu(catCmds) {
  const byPrimary = new Map(catCmds.map(c => [c.primary, c]));

  let msg = `╔══════════════════════════════╗\n`;
  msg += `║  🚀  *SOCIAL MEDIA BOOSTING*  ║\n`;
  msg += `║   Free engagement services   ║\n`;
  msg += `╚══════════════════════════════╝\n\n`;
  msg += `Boost your social media *for free!*\n`;
  msg += `Just paste the link — no quantity needed.\n\n`;

  // Platform sections
  for (const platform of BOOSTING_PLATFORM_GROUPS) {
    const platformCmds = platform.commands
      .map(name => byPrimary.get(name))
      .filter(Boolean);
    if (!platformCmds.length) continue;

    msg += `${platform.emoji} *— ${platform.label} —*\n`;
    for (const cmd of platformCmds) {
      msg += `  ▸ \`${config.PREFIX}${cmd.primary}\` _${cmd.desc}_\n`;
      if (cmd.usage) msg += `    Usage: ${config.PREFIX}${cmd.primary} ${cmd.usage}\n`;
    }
    msg += "\n";
  }

  // Management section — any command not in a platform group
  const mgmtCmds = catCmds.filter(c =>
    !BOOSTING_PLATFORM_GROUPS.some(p => p.commands.includes(c.primary)) &&
    c.primary !== "boosting"
  );
  if (mgmtCmds.length) {
    msg += `📦 *— Order Management —*\n`;
    for (const cmd of mgmtCmds) {
      msg += `  ▸ \`${config.PREFIX}${cmd.primary}\` _${cmd.desc}_\n`;
      if (cmd.usage) msg += `    Usage: ${config.PREFIX}${cmd.primary} ${cmd.usage}\n`;
    }
    msg += "\n";
  }

  msg += `────────────────────────────────\n`;
  msg += `💡 *${config.PREFIX}menu* — back to all categories\n`;
  msg += `_${config.BOT_NAME} · Desam Tech_ ⚡`;
  return msg;
}

function getCategoryMenu(cat, cmds) {
  const seen = new Set();
  const catCmds = [];
  if (cmds) {
    for (const [, cmd] of cmds) {
      const cmdCat = (cmd.category || "misc").toLowerCase();
      if (cmdCat !== cat) continue;
      const primaryName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
      if (seen.has(primaryName)) continue;
      seen.add(primaryName);
      const aliases = Array.isArray(cmd.name) ? cmd.name.slice(1) : [];
      catCmds.push({
        primary: primaryName,
        aliases,
        desc: cmd.desc || "",
        usage: cmd.usage || "",
        owner: cmd.owner,
        admin: cmd.admin,
        group: cmd.group,
      });
    }
  }

  if (catCmds.length === 0) return null;

  // Custom grouped layout for the boosting category
  if (cat === "boosting") return buildBoostingMenu(catCmds);

  catCmds.sort((a, b) => a.primary.localeCompare(b.primary));

  const emoji = CAT_EMOJIS[cat] || "📌";
  const label = CAT_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);

  let msg = `╔══════════════════════════════╗\n`;
  msg += `║  ${emoji}  *${label.toUpperCase()}*\n`;
  msg += `║  ${catCmds.length} command${catCmds.length !== 1 ? "s" : ""} available\n`;
  msg += `╚══════════════════════════════╝\n\n`;

  catCmds.forEach((cmd, i) => {
    const tags = [];
    if (cmd.owner) tags.push("👑");
    if (cmd.admin) tags.push("⭐");
    if (cmd.group) tags.push("👥");
    const tagStr = tags.length ? `  ${tags.join("")}` : "";

    msg += `▸ *${config.PREFIX}${cmd.primary}*${tagStr}\n`;
    if (cmd.desc) msg += `  _${cmd.desc}_\n`;
    if (cmd.usage) msg += `  Usage: \`${cmd.usage}\`\n`;
    if (cmd.aliases.length > 0) {
      msg += `  ↪ ${cmd.aliases.map(a => config.PREFIX + a).join("  ")}\n`;
    }
    if (i < catCmds.length - 1) msg += "\n";
  });

  msg += `\n────────────────────────────────\n`;
  msg += `👑 Owner only  ⭐ Admin only  👥 Group only\n`;
  msg += `💡 *${config.PREFIX}menu* — back to all categories\n`;
  return msg;
}

function getFullList(cmds, page) {
  const CMDS_PER_PAGE = 60;
  const seen = new Set();
  const allCmds = [];

  if (cmds) {
    for (const [, cmd] of cmds) {
      const primaryName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
      if (seen.has(primaryName)) continue;
      seen.add(primaryName);
      const aliases = Array.isArray(cmd.name) ? cmd.name.slice(1) : [];
      allCmds.push({
        primary: primaryName,
        aliases,
        desc: cmd.desc || "",
        category: (cmd.category || "misc").toLowerCase(),
        owner: cmd.owner,
        admin: cmd.admin,
      });
    }
  }

  allCmds.sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a.category);
    const bi = CAT_ORDER.indexOf(b.category);
    const ao = ai === -1 ? 99 : ai;
    const bo = bi === -1 ? 99 : bi;
    if (ao !== bo) return ao - bo;
    return a.primary.localeCompare(b.primary);
  });

  if (allCmds.length === 0) return `📋 No commands loaded yet. Restart the bot.`;

  const totalPages = Math.ceil(allCmds.length / CMDS_PER_PAGE);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * CMDS_PER_PAGE;
  const end = Math.min(start + CMDS_PER_PAGE, allCmds.length);
  const pageCmds = allCmds.slice(start, end);
  const totalWithAliases = allCmds.reduce((sum, c) => sum + 1 + c.aliases.length, 0);

  let msg = `╔══════════════════════════════╗\n`;
  msg += `║  📋  *FULL COMMAND LIST*\n`;
  msg += `║  ${allCmds.length} cmds · ${totalWithAliases} including aliases\n`;
  msg += `╚══════════════════════════════╝\n`;
  msg += `📄 Page *${safePage} / ${totalPages}*\n\n`;

  let currentCat = "";
  pageCmds.forEach((cmd, i) => {
    if (cmd.category !== currentCat) {
      currentCat = cmd.category;
      const catEmoji = CAT_EMOJIS[currentCat] || "📌";
      const catLabel = CAT_LABELS[currentCat] || currentCat.toUpperCase();
      msg += `\n${catEmoji} *${catLabel.toUpperCase()}*\n`;
      msg += `${"─".repeat(28)}\n`;
    }

    const num = String(start + i + 1).padStart(3, " ");
    const tags = [];
    if (cmd.owner) tags.push("👑");
    if (cmd.admin) tags.push("⭐");
    const tagStr = tags.length ? tags.join("") : "";

    msg += `${num}. *${config.PREFIX}${cmd.primary}*${tagStr}`;
    if (cmd.desc) msg += ` — ${cmd.desc}`;
    msg += "\n";

    if (cmd.aliases.length > 0) {
      msg += `      ↪ ${cmd.aliases.map(a => config.PREFIX + a).join("  ")}\n`;
    }
  });

  msg += `\n────────────────────────────────\n`;
  if (totalPages > 1) {
    msg += `📄 Page ${safePage}/${totalPages}`;
    if (safePage < totalPages) msg += `  |  ▶ *${config.PREFIX}list ${safePage + 1}*`;
    if (safePage > 1) msg += `  |  ◀ *${config.PREFIX}list ${safePage - 1}*`;
    msg += "\n";
  }
  msg += `💡 *${config.PREFIX}menu <category>* — category details\n`;
  return msg;
}

module.exports = { commands };
