const config = require("../config");
const { fetchJson, parseMention } = require("../lib/helpers");

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
    desc: "Forward a message to a contact",
    handler: async (sock, m, { text }) => {
      if (!m.quoted) return m.reply(`Reply to a message, then use:\n${config.PREFIX}forward @mention  or  ${config.PREFIX}forward <number>\nExample: ${config.PREFIX}forward 233241234567`);
      let phoneNum = text ? text.replace(/\D/g, "") : null;
      if (phoneNum && phoneNum.startsWith("0") && !m.mentions[0]) return m.reply("❌ Please provide the number with the country code (e.g., 233... or 1...). Local numbers starting with '0' are not allowed.");
      const target = m.mentions[0] || (phoneNum ? phoneNum + "@s.whatsapp.net" : null);
      if (!target) return m.reply("Tag someone or provide a phone number with country code.");
      try {
        await sock.sendMessage(target, { forward: { key: m.quoted.key, message: m.quoted.message } });
        await m.reply("✅ Message forwarded!");
      } catch {
        await m.reply("❌ Could not forward — make sure the number is correct and includes country code.");
      }
    },
  },
  {
    name: ["copy"],
    category: "misc",
    desc: "Copy text from replied message",
    handler: async (sock, m) => {
      if (!m.quoted) return m.reply("Reply to a message to copy its text.");
      const text = m.quoted.body || "";
      if (!text) return m.reply("No text found in that message.");
      await m.reply(`📋 *Copied Text*\n\n${text}`);
    },
  },
  {
    name: ["delete", "del", "d"],
    category: "misc",
    desc: "Delete a bot message",
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
      if (!text) return m.reply(
        `Usage: ${config.PREFIX}poll Question | Option1 | Option2 | Option3\n\nExample:\n${config.PREFIX}poll Best color? | Red | Blue | Green`
      );
      const parts = text.split("|").map((p) => p.trim()).filter(Boolean);
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
    desc: "Clear this chat (bot side)",
    owner: true,
    handler: async (sock, m) => {
      try {
        await sock.chatModify(
          { delete: true, lastMessages: [{ key: m.key, messageTimestamp: Math.floor(Date.now() / 1000) }] },
          m.chat
        );
        await m.reply("✅ Chat cleared!");
      } catch {
        await m.reply("❌ Could not clear chat.");
      }
    },
  },
  {
    name: ["archive"],
    category: "misc",
    desc: "Archive current chat",
    owner: true,
    handler: async (sock, m) => {
      try {
        await sock.chatModify(
          { archive: true, lastMessages: [{ key: m.key, messageTimestamp: Math.floor(Date.now() / 1000) }] },
          m.chat
        );
        await m.reply("✅ Chat archived!");
      } catch {
        await m.reply("❌ Could not archive chat.");
      }
    },
  },
  {
    name: ["pin"],
    category: "misc",
    desc: "Pin current chat",
    owner: true,
    handler: async (sock, m) => {
      try {
        await sock.chatModify({ pin: true }, m.chat);
        await m.reply("✅ Chat pinned!");
      } catch {
        await m.reply("❌ Could not pin chat.");
      }
    },
  },
  {
    name: ["unpin"],
    category: "misc",
    desc: "Unpin current chat",
    owner: true,
    handler: async (sock, m) => {
      try {
        await sock.chatModify({ pin: false }, m.chat);
        await m.reply("✅ Chat unpinned!");
      } catch {
        await m.reply("❌ Could not unpin chat.");
      }
    },
  },
  {
    name: ["star", "favourite"],
    category: "misc",
    desc: "Star a message",
    handler: async (sock, m) => {
      if (!m.quoted) return m.reply("Reply to a message to star it.");
      try {
        await sock.chatModify(
          { star: { messages: [{ id: m.quoted.key.id, fromMe: m.quoted.key.fromMe }], star: true } },
          m.chat
        );
        await m.reply("⭐ Message starred!");
      } catch {
        await m.reply("❌ Could not star message.");
      }
    },
  },
  {
    name: ["listgroups", "groups", "mygroups"],
    category: "misc",
    desc: "List all groups the bot is in",
    owner: true,
    handler: async (sock, m) => {
      m.react("⏳");
      try {
        const groups = await sock.groupFetchAllParticipating();
        const entries = Object.entries(groups);
        if (!entries.length) return m.reply("Not in any groups.");
        let msg = `👥 *Bot Groups (${entries.length})*\n\n`;
        entries.forEach(([, info], i) => {
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
      if (!target && !text) return m.reply(`Usage: ${config.PREFIX}contact @person or number (with country code)`);
      const num = target ? target.replace("@s.whatsapp.net", "") : text.replace(/\D/g, "");
      if (!num) return m.reply("Provide a valid phone number with country code.");
      await sock.sendMessage(m.chat, {
        contacts: {
          displayName: `+${num}`,
          contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:+${num}\nTEL;type=CELL;waid=${num}:+${num}\nEND:VCARD` }],
        },
      }, { quoted: { key: m.key, message: m.message } });
      await m.reply("✅ Contact card sent.");
    },
  },
  {
    name: ["location", "loc", "map"],
    category: "misc",
    desc: "Send a location by city/place name",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}location <place name>\nExample: ${config.PREFIX}location Accra, Ghana`);
      m.react("⏳");
      try {
        const results = await fetchJson(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=1`,
          { headers: { "User-Agent": "DesamWABot/3.0 (whatsapp-bot)" }, timeout: 12000 }
        );

        if (!results || !results.length) {
          m.react("❌");
          return m.reply(`❌ Could not find location: *${text}*\nTry being more specific, e.g. "Accra, Ghana"`);
        }

        const place = results[0];
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        const displayName = place.display_name || text;

        await sock.sendMessage(m.chat, {
          location: {
            degreesLatitude: lat,
            degreesLongitude: lon,
            name: text,
            address: displayName,
          },
        }, { quoted: { key: m.key, message: m.message } });

        await m.reply(`📍 *${text}*\n\n${displayName}\n\n🌐 Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`);
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply("❌ Location lookup failed. Try again or check your spelling.");
      }
    },
  },
  {
    name: ["presence", "typing", "recording"],
    category: "misc",
    desc: "Set chat presence status",
    owner: true,
    handler: async (sock, m, { text }) => {
      const modes = ["composing", "recording", "paused", "available", "unavailable"];
      if (!text || !modes.includes(text.toLowerCase())) {
        return m.reply(`Usage: ${config.PREFIX}presence <mode>\nModes: ${modes.join(", ")}`);
      }
      await sock.sendPresenceUpdate(text.toLowerCase(), m.chat);
      await m.reply(`✅ Presence set to: *${text}*`);
    },
  },
  {
    name: ["setbio", "bio"],
    category: "misc",
    desc: "Set bot status/about text",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}setbio <text>`);
      try {
        await sock.updateProfileStatus(text);
        await m.reply(`✅ Bio updated to: ${text}`);
      } catch {
        await m.reply("❌ Could not update bio.");
      }
    },
  },
  {
    name: ["readchat", "markread"],
    category: "misc",
    desc: "Mark chat as read",
    owner: true,
    handler: async (sock, m) => {
      try {
        await sock.readMessages([m.key]);
        await m.reply("✅ Chat marked as read!");
      } catch {
        await m.reply("❌ Could not mark as read.");
      }
    },
  },
];

module.exports = { commands };
