const config = require("../config");
const { downloadMediaMessage, getContentType } = require("@whiskeysockets/baileys");

const commands = [
  {
    name: ["statusdl", "statussave", "savestatus", "dlstatus"],
    category: "status",
    desc: "Download recent WhatsApp statuses",
    owner: true,
    handler: async (sock, m, { args }) => {
      let statusCache;
      try {
        statusCache = require("../lib/connection").statusCache;
      } catch {
        return m.reply("❌ Status cache not available.");
      }
      if (!statusCache || statusCache.size === 0) {
        return m.reply("📭 No recent statuses cached.\n\nMake sure AUTO_STATUS_VIEW is set to *on* in your settings.");
      }
      if (!args[0]) {
        let list = `📡 *Recent Statuses (${statusCache.size})*\n\n`;
        let i = 1;
        for (const [id, data] of statusCache) {
          const name = data.pushName || data.sender?.split("@")[0] || "Unknown";
          const typeLabel = data.type?.replace("Message", "") || "text";
          const ago = Math.floor((Date.now() - data.timestamp) / 60000);
          list += `${i}. *${name}* — ${typeLabel} (${ago}m ago)\n`;
          i++;
        }
        list += `\nUse ${config.PREFIX}statusdl <number> to download.`;
        return m.reply(list);
      }
      const index = parseInt(args[0]) - 1;
      if (isNaN(index) || index < 0 || index >= statusCache.size) {
        return m.reply("❌ Invalid number. Use the list to pick a valid status.");
      }
      m.react("⏳");
      try {
        const entries = [...statusCache.entries()];
        const [id, data] = entries[index];
        const type = data.type;
        if (type === "conversation" || type === "extendedTextMessage") {
          const text = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
          await m.reply(`📡 *Status from ${data.pushName}*\n\n${text}`);
        } else if (type === "imageMessage" || type === "videoMessage" || type === "audioMessage") {
          const buffer = await downloadMediaMessage({ key: data.key, message: data.message }, "buffer", {});
          if (!buffer) return m.reply("❌ Failed to download status media.");
          const mediaOpts = {};
          if (type === "imageMessage") {
            mediaOpts.image = buffer;
            mediaOpts.caption = `📡 Status from *${data.pushName}*`;
          } else if (type === "videoMessage") {
            mediaOpts.video = buffer;
            mediaOpts.caption = `📡 Status from *${data.pushName}*`;
          } else {
            mediaOpts.audio = buffer;
            mediaOpts.mimetype = "audio/mp4";
            mediaOpts.ptt = true;
          }
          await sock.sendMessage(m.chat, mediaOpts, { quoted: { key: m.key, message: m.message } });
        } else {
          return m.reply("❌ Unsupported status type.");
        }
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply("❌ Failed to download status.");
      }
    },
  },
  {
    name: ["setstatusreact", "statusreact", "autoreact"],
    category: "status",
    desc: "Toggle auto-react to statuses",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        config.AUTO_STATUS_REACT = "on";
        await m.reply("✅ Auto status react enabled! Will react to statuses with random emojis.");
      } else if (text === "off") {
        config.AUTO_STATUS_REACT = "off";
        await m.reply("✅ Auto status react disabled!");
      } else {
        await m.reply(`Usage: ${config.PREFIX}statusreact on/off\nCurrent: ${config.AUTO_STATUS_REACT || "off"}`);
      }
    },
  },
  {
    name: ["setstatusview", "statusview", "autoview"],
    category: "status",
    desc: "Toggle auto-viewing of statuses",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        config.AUTO_STATUS_VIEW = "on";
        await m.reply("✅ Auto status view enabled! The bot will now automatically mark statuses as seen.");
      } else if (text === "off") {
        config.AUTO_STATUS_VIEW = "off";
        await m.reply("✅ Auto status view disabled!");
      } else {
        await m.reply(`Usage: ${config.PREFIX}autoview on/off\nCurrent: ${config.AUTO_STATUS_VIEW || "off"}`);
      }
    },
  },
];

module.exports = { commands };
