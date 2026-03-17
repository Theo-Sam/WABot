const config = require("../config");
const { downloadMediaMessage, getContentType } = require("@whiskeysockets/baileys");

const commands = [
  {
    name: ["statusdl", "statussave", "savestatus", "dlstatus", "save", "savestory", "storysave"],
    category: "status",
    desc: "Download recent WhatsApp statuses",
    owner: true,
    handler: async (sock, m, { args }) => {
      const quotedStatusData =
        m.chat === "status@broadcast" && m.quoted
          ? {
              key: m.quoted.key,
              message: m.quoted.message,
              type: m.quoted.type,
              sender: m.quoted.sender,
              pushName: m.quoted.pushName || m.quoted.sender?.split("@")[0] || "Unknown",
              timestamp: Date.now(),
            }
          : null;

      let statusCache;
      try {
        statusCache = require("../lib/connection").statusCache;
      } catch {
        return m.reply("❌ Status cache not available.");
      }
      if (!quotedStatusData && (!statusCache || statusCache.size === 0)) {
        return m.reply("📭 No recent statuses cached.\n\nEnable auto-view first: set AUTO_STATUS_VIEW=on in .env or use statusview on.");
      }
      const targetChat = m.chat === "status@broadcast" ? m.sender : m.chat;
      if (args[0] === "list") {
        let list = `📡 *Recent Statuses*\n`;
        list += `Total cached: ${statusCache.size}\n\n`;
        let i = 1;
        for (const [id, data] of statusCache) {
          const name = data.pushName || data.sender?.split("@")[0] || "Unknown";
          const typeLabel = data.type?.replace("Message", "") || "text";
          const ago = Math.floor((Date.now() - data.timestamp) / 60000);
          list += `${i}. *${name}* — ${typeLabel} • ${ago}m ago\n`;
          i++;
        }
        list += `\nUse ${config.PREFIX}statusdl <number> to fetch one, or ${config.PREFIX}save to fetch latest.`;
        return m.reply(list);
      }

      let index = statusCache.size - 1;
      if (args[0] && args[0] !== "latest") {
        index = parseInt(args[0], 10) - 1;
        if (isNaN(index) || index < 0 || index >= statusCache.size) {
          return m.reply("❌ Invalid number. Use list to pick a valid status or use 'latest'.");
        }
      }
      m.react("⏳");
      try {
        let data;
        if (quotedStatusData && (!args[0] || args[0] === "latest")) {
          data = quotedStatusData;
        } else {
          const entries = [...statusCache.entries()];
          const [, selectedData] = entries[index];
          data = selectedData;
        }

        if (!data) {
          return m.reply("❌ Could not find a status to save.");
        }

        const type = data.type;
        if (type === "conversation" || type === "extendedTextMessage") {
          const text = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
          await sock.sendMessage(targetChat, { text: `📡 *Status from ${data.pushName || "Unknown"}*\n\n${text}` }, { quoted: { key: m.key, message: m.message } });
        } else if (type === "imageMessage" || type === "videoMessage" || type === "audioMessage") {
          const buffer = await downloadMediaMessage(
            { key: data.key, message: data.message },
            "buffer",
            {},
            { reuploadRequest: sock.updateMediaMessage }
          );
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
          await sock.sendMessage(targetChat, mediaOpts, { quoted: { key: m.key, message: m.message } });
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
        await m.reply("✅ Auto status react enabled. The bot will react to viewed statuses.");
      } else if (text === "off") {
        config.AUTO_STATUS_REACT = "off";
        await m.reply("✅ Auto status react disabled.");
      } else {
        await m.reply(`Usage: ${config.PREFIX}statusreact on/off\nCurrent: ${config.AUTO_STATUS_REACT || "off"}`);
      }
    },
  },
  {
    name: ["setstatusview", "statusview", "autoview", "autostatusview"],
    category: "status",
    desc: "Toggle auto-viewing of statuses",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        config.AUTO_STATUS_VIEW = "on";
        await m.reply("✅ Auto status view enabled. New statuses will be marked as seen automatically.");
      } else if (text === "off") {
        config.AUTO_STATUS_VIEW = "off";
        await m.reply("✅ Auto status view disabled.");
      } else {
        await m.reply(`Usage: ${config.PREFIX}autoview on/off\nCurrent: ${config.AUTO_STATUS_VIEW || "off"}`);
      }
    },
  },
];

module.exports = { commands };
