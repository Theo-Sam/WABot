const config = require("../config");
const { parseMention } = require("../lib/helpers");

const commands = [
  {
    name: ["react"],
    category: "misc",
    desc: "React to a message with emoji",
    handler: async (sock, m, { text }) => {
      if (!m.quoted) return m.reply(`Reply to a message with ${config.PREFIX}react <emoji>`);
      if (!text) return m.reply("Provide an emoji to react with.");
      await sock.sendMessage(m.chat, { react: { text: text.trim(), key: m.quoted.key } });
    },
  },
  {
    name: ["forward", "fwd"],
    category: "misc",
    desc: "Forward a message",
    handler: async (sock, m, { text }) => {
      if (!m.quoted) return m.reply("Reply to a message to forward it.");
      const target = m.mentions[0] || (text ? text.replace(/[^0-9]/g, "") + "@s.whatsapp.net" : null);
      if (!target) return m.reply(`Usage: Reply to a message with ${config.PREFIX}forward @person or number`);
      await sock.sendMessage(target, { forward: { key: m.quoted.key, message: m.quoted.message } });
      await m.reply("✅ Message forwarded!");
    },
  },
  {
    name: ["copy", "c"],
    category: "misc",
    desc: "Copy text from replied message",
    handler: async (sock, m) => {
      if (!m.quoted) return m.reply("Reply to a message to copy its text.");
      const text = m.quoted.body || "";
      if (!text) return m.reply("No text found in that message.");
      await m.reply(text);
    },
  },
  {
    name: ["delete", "del", "d"],
    category: "misc",
    desc: "Delete bot message",
    handler: async (sock, m) => {
      if (!m.quoted) return m.reply("Reply to a bot message to delete it.");
      if (!m.quoted.key.fromMe) return m.reply("I can only delete my own messages.");
      await sock.sendMessage(m.chat, { delete: m.quoted.key });
    },
  },
  {
    name: ["poll", "vote"],
    category: "misc",
    desc: "Create a poll",
    group: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}poll Question | Option1 | Option2 | Option3\n\nExample: ${config.PREFIX}poll Best color? | Red | Blue | Green`);
      const parts = text.split("|").map((p) => p.trim());
      if (parts.length < 3) return m.reply("Provide a question and at least 2 options separated by |");
      const question = parts[0];
      const options = parts.slice(1);
      await sock.sendMessage(m.chat, {
        poll: { name: question, values: options, selectableCount: 1 },
      });
    },
  },
  {
    name: ["clear", "purge"],
    category: "misc",
    desc: "Clear chat (bot messages)",
    owner: true,
    handler: async (sock, m) => {
      await sock.chatModify({ delete: true, lastMessages: [{ key: m.key, messageTimestamp: m.key.id }] }, m.chat);
      await m.reply("✅ Chat cleared!");
    },
  },
  {
    name: ["archive"],
    category: "misc",
    desc: "Archive current chat",
    owner: true,
    handler: async (sock, m) => {
      await sock.chatModify({ archive: true, lastMessages: [{ key: m.key, messageTimestamp: m.key.id }] }, m.chat);
      await m.reply("✅ Chat archived!");
    },
  },
  {
    name: ["pin"],
    category: "misc",
    desc: "Pin current chat",
    owner: true,
    handler: async (sock, m) => {
      await sock.chatModify({ pin: true }, m.chat);
      await m.reply("✅ Chat pinned!");
    },
  },
  {
    name: ["unpin"],
    category: "misc",
    desc: "Unpin current chat",
    owner: true,
    handler: async (sock, m) => {
      await sock.chatModify({ pin: false }, m.chat);
      await m.reply("✅ Chat unpinned!");
    },
  },
  {
    name: ["star", "favourite"],
    category: "misc",
    desc: "Star a message",
    handler: async (sock, m) => {
      if (!m.quoted) return m.reply("Reply to a message to star it.");
      await sock.chatModify({ star: { messages: [{ id: m.quoted.key.id, fromMe: m.quoted.key.fromMe }], star: true } }, m.chat);
      await m.reply("⭐ Message starred!");
    },
  },
  {
    name: ["listgroups", "groups", "mygroups"],
    category: "misc",
    desc: "List all bot groups",
    owner: true,
    handler: async (sock, m) => {
      m.react("⏳");
      try {
        const groups = await sock.groupFetchAllParticipating();
        const entries = Object.entries(groups);
        if (!entries.length) return m.reply("Not in any groups.");
        let msg = `👥 *Bot Groups (${entries.length})*\n\n`;
        entries.forEach(([jid, info], i) => {
          msg += `${i + 1}. *${info.subject}*\n   Members: ${info.participants?.length || 0}\n\n`;
        });
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to list groups.");
      }
    },
  },
  {
    name: ["vcard", "contact"],
    category: "misc",
    desc: "Send a contact card",
    handler: async (sock, m, { text }) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target && !text) return m.reply(`Usage: ${config.PREFIX}contact @person or number`);
      const num = target ? target.replace("@s.whatsapp.net", "") : text.replace(/[^0-9]/g, "");
      const jid = `${num}@s.whatsapp.net`;
      await sock.sendMessage(m.chat, {
        contacts: {
          displayName: num,
          contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${num}\nTEL;type=CELL;waid=${num}:+${num}\nEND:VCARD` }],
        },
      }, { quoted: { key: m.key, message: m.message } });
    },
  },
  {
    name: ["location", "loc"],
    category: "misc",
    desc: "Send a location",
    handler: async (sock, m, { text }) => {
      if (!text || !text.includes(",")) return m.reply(`Usage: ${config.PREFIX}location <lat>,<lon>\nExample: ${config.PREFIX}location 5.6037,-0.1870`);
      const [lat, lon] = text.split(",").map(Number);
      if (isNaN(lat) || isNaN(lon)) return m.reply("Invalid coordinates.");
      await sock.sendMessage(m.chat, {
        location: { degreesLatitude: lat, degreesLongitude: lon },
      });
    },
  },
  {
    name: ["presence", "typing", "recording"],
    category: "misc",
    desc: "Set chat presence",
    owner: true,
    handler: async (sock, m, { text }) => {
      const modes = ["composing", "recording", "paused", "available", "unavailable"];
      if (!text || !modes.includes(text)) {
        return m.reply(`Usage: ${config.PREFIX}presence <mode>\nModes: ${modes.join(", ")}`);
      }
      await sock.sendPresenceUpdate(text, m.chat);
      await m.reply(`✅ Presence set to: *${text}*`);
    },
  },
  {
    name: ["setbio", "bio"],
    category: "misc",
    desc: "Set bot bio/about",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}setbio <text>`);
      await sock.updateProfileStatus(text);
      await m.reply(`✅ Bio updated to: ${text}`);
    },
  },
  {
    name: ["readchat", "markread"],
    category: "misc",
    desc: "Mark all messages as read",
    owner: true,
    handler: async (sock, m) => {
      await sock.readMessages([m.key]);
      await m.reply("✅ Chat marked as read!");
    },
  },
];

module.exports = { commands };