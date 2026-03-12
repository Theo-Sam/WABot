const os = require("os");
const { runtime, getSystemInfo, getTimeGreeting, formatBytes } = require("../lib/helpers");
const config = require("../config");

const commands = [
  {
    name: ["menu", "help", "commands"],
    category: "main",
    desc: "Show command categories",
    handler: async (sock, m, { args, text, getMenu, commands: cmds }) => {
      m.react("📋");
      if (text) {
        const catMenu = getCategoryMenu(text.toLowerCase(), cmds);
        if (catMenu) return m.reply(catMenu);
        return m.reply(`❌ Category *${text}* not found.\n\nUse ${config.PREFIX}menu to see all categories.`);
      }
      await m.reply(getMenu());
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
          const fullList = getFullList(cmds, page);
          return m.reply(fullList);
        }
        const catMenu = getCategoryMenu(text.toLowerCase(), cmds);
        if (catMenu) return m.reply(catMenu);
      }
      const fullList = getFullList(cmds, 1);
      await m.reply(fullList);
    },
  },
  {
    name: ["alive", "ping", "bot"],
    category: "main",
    desc: "Check if bot is alive",
    handler: async (sock, m) => {
      m.react("✅");
      const start = Date.now();
      const greeting = getTimeGreeting(config.TIMEZONE);
      const uptime = runtime();
      const latency = Date.now() - start;
      const text = `╔══════════════════════╗
║   *${config.BOT_NAME}*   ║
╚══════════════════════╝

${greeting}! 👋

✅ *Bot is online and running!*

⏱️ *Uptime:* ${uptime}
⚡ *Speed:* ${latency}ms
📡 *Mode:* ${config.MODE}
🔑 *Prefix:* ${config.PREFIX}
👤 *Owner:* ${config.OWNER_NUMBER}

_Powered by Desam Tech_ ⚡`;
      await m.reply(text);
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
      const text = `🤖 *${config.BOT_NAME} - Info*

📌 *Bot Details*
▸ Name: ${config.BOT_NAME}
▸ Prefix: ${config.PREFIX}
▸ Mode: ${config.MODE}
▸ Owner: ${config.OWNER_NUMBER}
▸ Timezone: ${config.TIMEZONE}
▸ Total Commands: ${totalCmds}

💻 *System Info*
▸ Platform: ${sys.platform}
▸ Architecture: ${sys.arch}
▸ CPUs: ${sys.cpus}
▸ Total RAM: ${sys.totalMem}
▸ Free RAM: ${sys.freeMem}
▸ Uptime: ${sys.uptime}
▸ Node.js: ${sys.nodeVersion}

_Powered by Desam Tech_ ⚡`;
      await m.reply(text);
    },
  },
  {
    name: ["runtime", "uptime"],
    category: "main",
    desc: "Show bot uptime",
    handler: async (sock, m) => {
      m.react("⏱️");
      await m.reply(`⏱️ *Uptime:* ${runtime()}`);
    },
  },
  {
    name: ["owner", "creator"],
    category: "main",
    desc: "Show bot owner",
    handler: async (sock, m) => {
      m.react("👑");
      const ownerJid = config.OWNER_NUMBER.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
      await sock.sendMessage(m.chat, {
        contacts: {
          displayName: "Desam Tech",
          contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Desam Tech\nTEL;type=CELL;waid=${config.OWNER_NUMBER.replace(/[^0-9]/g, "")}:+${config.OWNER_NUMBER.replace(/[^0-9]/g, "")}\nEND:VCARD` }],
        },
      }, { quoted: { key: m.key, message: m.message } });
    },
  },
];

function getCategoryMenu(cat, cmds) {
  const catEmojis = {
    main: "🏠", group: "👥", sticker: "🎨", media: "🎵", tools: "🔧",
    fun: "🎮", owner: "👑", settings: "⚙️", misc: "📦", download: "📥",
    search: "🔍", ai: "🤖", religious: "🙏", sports: "⚽", education: "📚",
    utility: "🔨", status: "📡", notes: "📝",
  };

  const seen = new Set();
  const catCmds = [];
  if (cmds) {
    for (const [name, cmd] of cmds) {
      const cmdCat = (cmd.category || "misc").toLowerCase();
      if (cmdCat !== cat) continue;
      const primaryName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
      if (seen.has(primaryName)) continue;
      seen.add(primaryName);
      const aliases = Array.isArray(cmd.name) ? cmd.name.slice(1) : [];
      catCmds.push({ primary: primaryName, aliases, desc: cmd.desc || "", owner: cmd.owner, admin: cmd.admin, group: cmd.group });
    }
  }

  if (catCmds.length === 0) return null;

  const emoji = catEmojis[cat] || "📌";
  let msg = `${emoji} *${cat.toUpperCase()} COMMANDS* (${catCmds.length})\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  catCmds.forEach((cmd, i) => {
    const tags = [];
    if (cmd.owner) tags.push("👑");
    if (cmd.admin) tags.push("⭐");
    if (cmd.group) tags.push("👥");
    const tagStr = tags.length ? " " + tags.join("") : "";
    msg += `${i + 1}. ${config.PREFIX}${cmd.primary}${tagStr}\n`;
    if (cmd.desc) msg += `   _${cmd.desc}_\n`;
    if (cmd.aliases.length > 0) {
      msg += `   Aliases: ${cmd.aliases.map(a => config.PREFIX + a).join(", ")}\n`;
    }
    msg += "\n";
  });
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👑 = Owner only | ⭐ = Admin | 👥 = Group only\n`;
  msg += `_${config.BOT_NAME} | Powered by Desam Tech_`;
  return msg;
}

function getFullList(cmds, page) {
  const CMDS_PER_PAGE = 100;
  const seen = new Set();
  const allCmds = [];
  const catOrder = ["main", "ai", "download", "media", "sticker", "fun", "group", "settings", "tools", "utility", "search", "education", "sports", "religious", "notes", "status", "misc", "owner"];

  if (cmds) {
    for (const [name, cmd] of cmds) {
      const primaryName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
      if (seen.has(primaryName)) continue;
      seen.add(primaryName);
      const aliases = Array.isArray(cmd.name) ? cmd.name.slice(1) : [];
      allCmds.push({
        primary: primaryName,
        aliases,
        desc: cmd.desc || "",
        category: (cmd.category || "misc").toLowerCase(),
      });
    }
  }

  allCmds.sort((a, b) => {
    const ai = catOrder.indexOf(a.category);
    const bi = catOrder.indexOf(b.category);
    const ao = ai === -1 ? 99 : ai;
    const bo = bi === -1 ? 99 : bi;
    if (ao !== bo) return ao - bo;
    return a.primary.localeCompare(b.primary);
  });

  if (allCmds.length === 0) return `📋 No commands loaded yet. Try again after bot restart.`;
  const totalPages = Math.ceil(allCmds.length / CMDS_PER_PAGE);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * CMDS_PER_PAGE;
  const end = Math.min(start + CMDS_PER_PAGE, allCmds.length);
  const pageCmds = allCmds.slice(start, end);

  const totalAliases = allCmds.reduce((sum, c) => sum + 1 + c.aliases.length, 0);

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  *${config.BOT_NAME}*  ║\n`;
  msg += `║  📋 FULL COMMAND LIST    ║\n`;
  msg += `╚══════════════════════════╝\n\n`;
  msg += `📊 *${allCmds.length} commands* (${totalAliases} with aliases)\n`;
  msg += `📄 Page *${safePage}/${totalPages}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  let currentCat = "";
  const catEmojis = {
    main: "🏠", group: "👥", sticker: "🎨", media: "🎵", tools: "🔧",
    fun: "🎮", owner: "👑", settings: "⚙️", misc: "📦", download: "📥",
    search: "🔍", ai: "🤖", religious: "🙏", sports: "⚽", education: "📚",
    utility: "🔨", status: "📡", notes: "📝",
  };

  pageCmds.forEach((cmd, i) => {
    if (cmd.category !== currentCat) {
      currentCat = cmd.category;
      const emoji = catEmojis[currentCat] || "📌";
      msg += `\n${emoji} *${currentCat.toUpperCase()}*\n`;
    }
    const num = start + i + 1;
    msg += `${num}. ${config.PREFIX}${cmd.primary}`;
    if (cmd.aliases.length > 0) {
      msg += ` _(${cmd.aliases.join(", ")})_`;
    }
    if (cmd.desc) msg += ` — ${cmd.desc}`;
    msg += "\n";
  });

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (totalPages > 1) {
    msg += `📄 Page ${safePage}/${totalPages}`;
    if (safePage < totalPages) msg += ` | Next: ${config.PREFIX}list ${safePage + 1}`;
    msg += "\n";
  }
  msg += `💡 ${config.PREFIX}menu <category> for details\n`;
  msg += `_${config.BOT_NAME} | Powered by Desam Tech_`;
  return msg;
}

module.exports = { commands };
