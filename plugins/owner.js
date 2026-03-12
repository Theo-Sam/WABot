const config = require("../config");
const { banUser, unbanUser, isBanned, listBanned } = require("../lib/database");
const { runtime, getSystemInfo } = require("../lib/helpers");

const commands = [
  {
    name: ["restart", "reboot"],
    category: "owner",
    desc: "Restart the bot",
    owner: true,
    handler: async (sock, m) => {
      await m.reply("🔄 Restarting bot...");
      process.exit(0);
    },
  },
  {
    name: ["shutdown", "off"],
    category: "owner",
    desc: "Shutdown the bot",
    owner: true,
    handler: async (sock, m) => {
      await m.reply("👋 Shutting down...");
      process.exit(1);
    },
  },
  {
    name: ["reload", "loadplugins"],
    category: "owner",
    desc: "Reload all plugins",
    owner: true,
    handler: async (sock, m) => {
      const { loadPlugins } = require("../lib/handler");
      loadPlugins();
      await m.reply("✅ All plugins reloaded!");
    },
  },
  {
    name: ["broadcast", "bc"],
    category: "owner",
    desc: "Broadcast message to all chats",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}broadcast <message>`);
      m.react("⏳");
      try {
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.keys(chats);
        let sent = 0;
        for (const jid of groups) {
          try {
            await sock.sendMessage(jid, { text: `📢 *Broadcast from ${config.BOT_NAME}*\n\n${text}` });
            sent++;
          } catch {}
        }
        await m.reply(`✅ Broadcast sent to ${sent}/${groups.length} groups.`);
      } catch (err) {
        await m.reply("❌ Broadcast failed.");
      }
    },
  },
  {
    name: ["ban"],
    category: "owner",
    desc: "Ban a user from using the bot",
    owner: true,
    handler: async (sock, m, { text }) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to ban.");
      banUser(target, text || "Banned by owner");
      await m.reply(`🚫 @${target.split("@")[0]} has been banned from using the bot.`, { mentions: [target] });
    },
  },
  {
    name: ["unban"],
    category: "owner",
    desc: "Unban a user",
    owner: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to unban.");
      unbanUser(target);
      await m.reply(`✅ @${target.split("@")[0]} has been unbanned.`, { mentions: [target] });
    },
  },
  {
    name: ["setprefix"],
    category: "owner",
    desc: "Change bot prefix",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply("Provide a new prefix.");
      config.PREFIX = text.trim();
      await m.reply(`✅ Prefix changed to: *${config.PREFIX}*`);
    },
  },
  {
    name: ["setmode", "mode"],
    category: "owner",
    desc: "Set bot mode (public/private)",
    owner: true,
    handler: async (sock, m, { text }) => {
      const mode = text?.toLowerCase();
      if (!["public", "private"].includes(mode)) {
        return m.reply(`Usage: ${config.PREFIX}setmode public/private`);
      }
      config.MODE = mode;
      await m.reply(`✅ Bot mode changed to: *${mode}*`);
    },
  },
  {
    name: ["setname", "setbotname"],
    category: "owner",
    desc: "Change bot display name",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply("Provide a new name.");
      config.BOT_NAME = text.trim();
      await m.reply(`✅ Bot name changed to: *${config.BOT_NAME}*`);
    },
  },
  {
    name: ["status", "botstatus"],
    category: "owner",
    desc: "Show detailed bot status",
    owner: true,
    handler: async (sock, m) => {
      const sys = getSystemInfo();
      const mem = process.memoryUsage();
      const text = `📊 *Bot Status*

⏱️ Uptime: ${runtime()}
📡 Mode: ${config.MODE}
🔑 Prefix: ${config.PREFIX}

💻 *System*
▸ RAM Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB
▸ Total RAM: ${sys.totalMem}
▸ Free RAM: ${sys.freeMem}
▸ CPUs: ${sys.cpus}
▸ Platform: ${sys.platform}
▸ Node: ${sys.nodeVersion}`;
      await m.reply(text);
    },
  },
  {
    name: ["jid"],
    category: "owner",
    desc: "Get JID of chat/user",
    owner: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender || m.chat;
      await m.reply(`📌 JID: ${target}`);
    },
  },
  {
    name: ["eval", "exec", "run"],
    category: "owner",
    desc: "Execute JavaScript code",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}eval <code>`);
      try {
        let result = eval(text);
        if (result instanceof Promise) result = await result;
        if (typeof result !== "string") result = require("util").inspect(result, { depth: 2 });
        await m.reply(`✅ *Result:*\n\n${result.substring(0, 3000)}`);
      } catch (err) {
        await m.reply(`❌ *Error:*\n\n${err.message}`);
      }
    },
  },
  {
    name: ["shell", "bash", "cmd"],
    category: "owner",
    desc: "Execute shell command",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}shell <command>`);
      try {
        const { exec } = require("child_process");
        const result = await new Promise((resolve, reject) => {
          exec(text, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            if (err && !stdout && !stderr) reject(err);
            else resolve((stdout || "") + (stderr || ""));
          });
        });
        await m.reply(`💻 *Shell Output:*\n\n${(result || "No output").substring(0, 3000)}`);
      } catch (err) {
        await m.reply(`❌ *Error:*\n\n${err.message}`);
      }
    },
  },
  {
    name: ["banlist", "bannedlist"],
    category: "owner",
    desc: "Show all banned users",
    owner: true,
    handler: async (sock, m) => {
      const banned = listBanned();
      if (!banned || banned.length === 0) {
        return m.reply("✅ No banned users.");
      }
      let msg = `🚫 *Banned Users (${banned.length})*\n\n`;
      banned.forEach((b, i) => {
        msg += `${i + 1}. ${b.jid.split("@")[0]}${b.reason ? ` — ${b.reason}` : ""}\n`;
      });
      await m.reply(msg);
    },
  },
  {
    name: ["listplugins", "plugins"],
    category: "owner",
    desc: "List all loaded plugins",
    owner: true,
    handler: async (sock, m, { commands: cmds }) => {
      const fs = require("fs");
      const path = require("path");
      const pluginsDir = path.join(__dirname);
      const files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith(".js"));
      let msg = `📦 *Loaded Plugins (${files.length})*\n\n`;
      files.forEach((f) => { msg += `▸ ${f}\n`; });
      msg += `\n📊 Total commands: ${cmds.size}`;
      await m.reply(msg);
    },
  },
];

module.exports = { commands };