const config = require("../config");
const { getGroupSettings, updateGroupSetting, addWarning, resetWarnings, getWarnings } = require("../lib/database");
const { isGroupLink, extractUrls } = require("../lib/helpers");

async function handleGroupEvent(sock, update) {
  const { id: jid, participants, action } = update;
  const settings = getGroupSettings(jid);
  if (!settings) return;

  let groupMeta;
  try {
    groupMeta = await sock.groupMetadata(jid);
  } catch {
    return;
  }

  const groupName = groupMeta.subject || "Group";

  for (const participant of participants) {
    const name = participant.split("@")[0];
    const ppUrl = await sock.profilePictureUrl(participant, "image").catch(() => null);

    if (action === "add" && settings.welcome) {
      let welcomeMsg = settings.welcome_msg || `Welcome to *${groupName}*, @${name}! 🎉\n\nEnjoy your stay!`;
      welcomeMsg = welcomeMsg
        .replace(/{user}/g, `@${name}`)
        .replace(/{group}/g, groupName)
        .replace(/{desc}/g, groupMeta.desc || "No description")
        .replace(/{count}/g, groupMeta.participants.length);

      const msgOpts = {
        text: welcomeMsg,
        mentions: [participant],
      };
      if (ppUrl) {
        try {
          const axios = require("axios");
          const res = await axios.get(ppUrl, { responseType: "arraybuffer", timeout: 10000 });
          msgOpts.contextInfo = {
            externalAdReply: {
              title: `Welcome to ${groupName}`,
              body: config.BOT_NAME,
              thumbnail: Buffer.from(res.data),
              mediaType: 1,
            },
          };
        } catch {}
      }
      await sock.sendMessage(jid, msgOpts).catch(() => {});
    }

    if (action === "remove" && settings.goodbye) {
      let goodbyeMsg = settings.goodbye_msg || `Goodbye @${name}! 👋\n\nWe'll miss you in *${groupName}*!`;
      goodbyeMsg = goodbyeMsg
        .replace(/{user}/g, `@${name}`)
        .replace(/{group}/g, groupName)
        .replace(/{count}/g, groupMeta.participants.length);

      await sock.sendMessage(jid, {
        text: goodbyeMsg,
        mentions: [participant],
      }).catch(() => {});
    }
  }
}

async function handleAntilink(sock, m, { groupMeta }) {
  if (!m.isGroup || m.fromMe) return false;
  const settings = getGroupSettings(m.chat);
  if (!settings || !settings.antilink) return false;

  const isAdmin = groupMeta?.participants?.some(
    (p) => p.id === m.sender && (p.admin === "admin" || p.admin === "superadmin")
  );
  if (isAdmin) return false;

  const ownerNum = String(config.OWNER_NUMBER || "").replace(/[^0-9]/g, "");
  if (m.sender.replace(/@.+/, "") === ownerNum) return false;

  const urls = extractUrls(m.body);
  const hasGroupLink = urls.some((u) => isGroupLink(u));

  if (!hasGroupLink) return false;

  const action = settings.antilink_action || "warn";

  if (action === "delete") {
    await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {});
    await sock.sendMessage(m.chat, {
      text: `⚠️ @${m.sender.split("@")[0]}, group links are not allowed here!`,
      mentions: [m.sender],
    }).catch(() => {});
    return true;
  }

  if (action === "warn") {
    await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {});
    const warns = addWarning(m.chat, m.sender, "antilink");
    if (warns >= 3) {
      await sock.groupParticipantsUpdate(m.chat, [m.sender], "remove").catch(() => {});
      resetWarnings(m.chat, m.sender, "antilink");
      await sock.sendMessage(m.chat, {
        text: `❌ @${m.sender.split("@")[0]} has been removed for posting links (3 warnings).`,
        mentions: [m.sender],
      }).catch(() => {});
    } else {
      await sock.sendMessage(m.chat, {
        text: `⚠️ @${m.sender.split("@")[0]}, group links are not allowed! Warning ${warns}/3`,
        mentions: [m.sender],
      }).catch(() => {});
    }
    return true;
  }

  if (action === "kick") {
    await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {});
    await sock.groupParticipantsUpdate(m.chat, [m.sender], "remove").catch(() => {});
    await sock.sendMessage(m.chat, {
      text: `❌ @${m.sender.split("@")[0]} has been removed for posting group links.`,
      mentions: [m.sender],
    }).catch(() => {});
    return true;
  }

  return false;
}

async function handleAntibad(sock, m, { groupMeta }) {
  if (!m.isGroup || m.fromMe) return false;
  const settings = getGroupSettings(m.chat);
  if (!settings || !settings.antibad) return false;

  const isAdmin = groupMeta?.participants?.some(
    (p) => p.id === m.sender && (p.admin === "admin" || p.admin === "superadmin")
  );
  if (isAdmin) return false;

  let badwords = [];
  try {
    badwords = JSON.parse(settings.badwords || "[]");
  } catch {
    badwords = [];
  }

  if (badwords.length === 0) return false;

  const lowerBody = m.body.toLowerCase();
  const found = badwords.some((w) => lowerBody.includes(w.toLowerCase()));
  if (!found) return false;

  await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {});
  const warns = addWarning(m.chat, m.sender, "antibad");

  if (warns >= 3) {
    await sock.groupParticipantsUpdate(m.chat, [m.sender], "remove").catch(() => {});
    resetWarnings(m.chat, m.sender, "antibad");
    await sock.sendMessage(m.chat, {
      text: `❌ @${m.sender.split("@")[0]} has been removed for using bad words (3 warnings).`,
      mentions: [m.sender],
    }).catch(() => {});
  } else {
    await sock.sendMessage(m.chat, {
      text: `⚠️ @${m.sender.split("@")[0]}, watch your language! Warning ${warns}/3`,
      mentions: [m.sender],
    }).catch(() => {});
  }

  return true;
}

const commands = [
  {
    name: ["welcome"],
    category: "group",
    desc: "Toggle welcome messages",
    group: true,
    admin: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        updateGroupSetting(m.chat, "welcome", 1);
        await m.reply("✅ Welcome messages enabled. New members will receive a greeting.");
      } else if (text === "off") {
        updateGroupSetting(m.chat, "welcome", 0);
        await m.reply("✅ Welcome messages disabled.");
      } else {
        const current = getGroupSettings(m.chat)?.welcome ? "on" : "off";
        await m.reply(`⚙️ *welcome*  —  currently *${current}*

📖 Usage:  \`.welcome on/off\`
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
      }
    },
  },
  {
    name: ["setwelcome"],
    category: "group",
    desc: "Set custom welcome message",
    group: true,
    admin: true,
    handler: async (sock, m, { text }) => {
      if (!text) {
        return m.reply(`Set a custom welcome message.\nVariables: {user}, {group}, {desc}, {count}\n\nExample: ${config.PREFIX}setwelcome Welcome {user} to {group}! We now have {count} members!`);
      }
      updateGroupSetting(m.chat, "welcome_msg", text);
      await m.reply("✅ Welcome message set!");
    },
  },
  {
    name: ["goodbye"],
    category: "group",
    desc: "Toggle goodbye messages",
    group: true,
    admin: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        updateGroupSetting(m.chat, "goodbye", 1);
        await m.reply("✅ Goodbye messages enabled. Departing members will get a farewell message.");
      } else if (text === "off") {
        updateGroupSetting(m.chat, "goodbye", 0);
        await m.reply("✅ Goodbye messages disabled.");
      } else {
        const current = getGroupSettings(m.chat)?.goodbye ? "on" : "off";
        await m.reply(`⚙️ *goodbye*  —  currently *${current}*

📖 Usage:  \`.goodbye on/off\`
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
      }
    },
  },
  {
    name: ["setgoodbye"],
    category: "group",
    desc: "Set custom goodbye message",
    group: true,
    admin: true,
    handler: async (sock, m, { text }) => {
      if (!text) {
        return m.reply(`Set a custom goodbye message.\nVariables: {user}, {group}, {count}\n\nExample: ${config.PREFIX}setgoodbye Goodbye {user}! {group} now has {count} members.`);
      }
      updateGroupSetting(m.chat, "goodbye_msg", text);
      await m.reply("✅ Goodbye message set!");
    },
  },
  {
    name: ["antilink"],
    category: "group",
    desc: "Toggle anti-link protection",
    group: true,
    admin: true,
    handler: async (sock, m, { args }) => {
      const sub = args[0]?.toLowerCase();
      if (sub === "on") {
        updateGroupSetting(m.chat, "antilink", 1);
        const action = args[1] || "warn";
        if (["warn", "delete", "kick"].includes(action)) {
          updateGroupSetting(m.chat, "antilink_action", action);
        }
        await m.reply(`✅ Anti-link enabled! Action: *${action}*`);
      } else if (sub === "off") {
        updateGroupSetting(m.chat, "antilink", 0);
        await m.reply("✅ Anti-link disabled!");
      } else {
        const settings = getGroupSettings(m.chat);
        const enabled = settings?.antilink ? "on" : "off";
        const action = settings?.antilink_action || "warn";
        await m.reply(`⚙️ *antilink*  —  currently *${enabled}* (action: ${action})\n\n📖 Usage:\n  .antilink on [warn/delete/kick]\n  .antilink off\n────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`);
      }
    },
  },
  {
    name: ["antibad", "antibadword"],
    category: "group",
    desc: "Toggle anti-bad words",
    group: true,
    admin: true,
    handler: async (sock, m, { args, text }) => {
      const sub = args[0]?.toLowerCase();
      if (sub === "on") {
        updateGroupSetting(m.chat, "antibad", 1);
        await m.reply("✅ Anti-bad words enabled!");
      } else if (sub === "off") {
        updateGroupSetting(m.chat, "antibad", 0);
        await m.reply("✅ Anti-bad words disabled!");
      } else if (sub === "add") {
        const word = args.slice(1).join(" ");
        if (!word) return m.reply("Provide a word to add.");
        const settings = getGroupSettings(m.chat);
        let words = [];
        try { words = JSON.parse(settings.badwords || "[]"); } catch {}
        if (!words.includes(word.toLowerCase())) {
          words.push(word.toLowerCase());
          updateGroupSetting(m.chat, "badwords", JSON.stringify(words));
        }
        await m.reply(`✅ Added "${word}" to bad words list.`);
      } else if (sub === "remove" || sub === "del") {
        const word = args.slice(1).join(" ");
        if (!word) return m.reply("Provide a word to remove.");
        const settings = getGroupSettings(m.chat);
        let words = [];
        try { words = JSON.parse(settings.badwords || "[]"); } catch {}
        words = words.filter((w) => w !== word.toLowerCase());
        updateGroupSetting(m.chat, "badwords", JSON.stringify(words));
        await m.reply(`✅ Removed "${word}" from bad words list.`);
      } else if (sub === "list") {
        const settings = getGroupSettings(m.chat);
        let words = [];
        try { words = JSON.parse(settings.badwords || "[]"); } catch {}
        if (words.length === 0) return m.reply("No bad words configured.");
        await m.reply(`📝 *Bad Words List:*\n\n${words.map((w, i) => `${i + 1}. ${w}`).join("\n")}`);
      } else {
        await m.reply(`⚙️ *antibad*  —  content filter settings\n\n📖 Usage:\n  .antibad on / .antibad off\n  .antibad add <word>\n  .antibad remove <word>\n  .antibad list\n────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`);
      }
    },
  },
  {
    name: ["kick", "remove"],
    category: "group",
    desc: "Remove a member from group",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to remove them.");
      await sock.groupParticipantsUpdate(m.chat, [target], "remove").catch(() => {});
      await m.reply(`✅ Removed @${target.split("@")[0]}`, { mentions: [target] });
    },
  },
  {
    name: ["add"],
    category: "group",
    desc: "Add a member to group",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply("Provide a phone number to add.");
      const num = text.replace(/[^0-9]/g, "");
      if (num.startsWith("0")) return m.reply("❌ Please provide the number with the country code (e.g., 233... or 1...). Local numbers starting with '0' are not allowed.");
      const jid = `${num}@s.whatsapp.net`;
      const res = await sock.groupParticipantsUpdate(m.chat, [jid], "add").catch(() => null);
      if (res) {
        await m.reply(`✅ Added @${num}`, { mentions: [jid] });
      } else {
        await m.reply("❌ Failed to add. Number may not be on WhatsApp.");
      }
    },
  },
  {
    name: ["promote"],
    category: "group",
    desc: "Promote member to admin",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to promote.");
      await sock.groupParticipantsUpdate(m.chat, [target], "promote").catch(() => {});
      await m.reply(`✅ Promoted @${target.split("@")[0]} to admin!`, { mentions: [target] });
    },
  },
  {
    name: ["demote"],
    category: "group",
    desc: "Demote admin to member",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to demote.");
      await sock.groupParticipantsUpdate(m.chat, [target], "demote").catch(() => {});
      await m.reply(`✅ Demoted @${target.split("@")[0]} from admin.`, { mentions: [target] });
    },
  },
  {
    name: ["mute"],
    category: "group",
    desc: "Mute group (admins only can chat)",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m) => {
      try {
        await sock.groupSettingUpdate(m.chat, "announcement");
        await m.reply("🔇 Group muted! Only admins can send messages.");
      } catch {
        await m.reply("❌ Failed to mute group. Make sure the bot is an admin.");
      }
    },
  },
  {
    name: ["unmute"],
    category: "group",
    desc: "Unmute group",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m) => {
      try {
        await sock.groupSettingUpdate(m.chat, "not_announcement");
        await m.reply("🔊 Group unmuted! Everyone can send messages.");
      } catch {
        await m.reply("❌ Failed to unmute group. Make sure the bot is an admin.");
      }
    },
  },
  {
    name: ["tagall", "everyone"],
    category: "group",
    desc: "Tag all group members",
    group: true,
    handler: async (sock, m, { text, groupMeta }) => {
      if (!groupMeta) return m.reply("❌ Could not fetch group info. Try again.");
      const members = groupMeta.participants.map((p) => p.id);
      let msg = text ? `📢 *${text}*\n\n` : "📢 *Tagging all members*\n\n";
      msg += members.map((jid) => `▸ @${jid.split("@")[0]}`).join("\n");
      msg += `\n\n_Total: ${members.length} members_`;
      await sock.sendMessage(m.chat, { text: msg, mentions: members });
    },
  },
  {
    name: ["hidetag"],
    category: "group",
    desc: "Send hidden tag to all members",
    group: true,
    handler: async (sock, m, { text, groupMeta }) => {
      if (!groupMeta) return m.reply("❌ Could not fetch group info. Try again.");
      const members = groupMeta.participants.map((p) => p.id);
      await sock.sendMessage(m.chat, { text: text || "📢", mentions: members });
    },
  },
  {
    name: ["groupinfo", "ginfo"],
    category: "group",
    desc: "Show group information",
    group: true,
    handler: async (sock, m, { groupMeta }) => {
      if (!groupMeta) return m.reply("❌ Could not fetch group info. Try again.");
      const admins = groupMeta.participants.filter((p) => p.admin).length;
      const settings = getGroupSettings(m.chat);
      let text = `👥 *${groupMeta.subject}*\n\n`;
      text += `📌 *Group Info*\n`;
      text += `▸ ID: ${m.chat}\n`;
      text += `▸ Members: ${groupMeta.participants.length}\n`;
      text += `▸ Admins: ${admins}\n`;
      text += `▸ Description: ${groupMeta.desc || "None"}\n\n`;
      if (settings) {
        text += `⚙️ *Settings*\n`;
        text += `▸ Welcome: ${settings.welcome ? "✅" : "❌"}\n`;
        text += `▸ Goodbye: ${settings.goodbye ? "✅" : "❌"}\n`;
        text += `▸ Anti-link: ${settings.antilink ? "✅" : "❌"}\n`;
        text += `▸ Anti-bad: ${settings.antibad ? "✅" : "❌"}\n`;
        text += `▸ Anti-spam: ${settings.antispam ? "✅" : "❌"}\n`;
        text += `▸ Anti-viewonce: ${settings.antiviewonce ? "✅" : "❌"}\n`;
        text += `▸ Anti-delete: ${settings.antidelete ? "✅" : "❌"}\n`;
        text += `▸ Chatbot: ${settings.chatbot ? "✅" : "❌"}\n`;
        text += `▸ Auto-sticker: ${settings.autosticker ? "✅" : "❌"}\n`;
      }
      await m.reply(text);
    },
  },
  {
    name: ["tagadmin", "admins", "listadmin"],
    category: "group",
    desc: "Tag all group admins",
    group: true,
    handler: async (sock, m, { text, groupMeta }) => {
      if (!groupMeta) return m.reply("❌ Could not fetch group info. Try again.");
      const admins = groupMeta.participants.filter((p) => p.admin);
      if (!admins.length) return m.reply("No admins found.");
      let msg = text ? `📢 *${text}*\n\n` : `👑 *Group Admins*\n\n`;
      msg += admins.map((a) => `▸ @${a.id.split("@")[0]} (${a.admin === "superadmin" ? "Owner" : "Admin"})`).join("\n");
      msg += `\n\n_Total: ${admins.length} admins_`;
      await sock.sendMessage(m.chat, { text: msg, mentions: admins.map((a) => a.id) });
    },
  },
  {
    name: ["warn"],
    category: "group",
    desc: "Warn a group member",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m, { text }) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to warn.");
      const reason = text?.replace(/@\d+/g, "").trim() || "No reason given";
      const warns = addWarning(m.chat, target, "manual");
      if (warns >= 3) {
        await sock.groupParticipantsUpdate(m.chat, [target], "remove").catch(() => {});
        resetWarnings(m.chat, target, "manual");
        await sock.sendMessage(m.chat, {
          text: `❌ @${target.split("@")[0]} has been removed for reaching 3 warnings.\nLast warning: ${reason}`,
          mentions: [target],
        });
      } else {
        await sock.sendMessage(m.chat, {
          text: `⚠️ @${target.split("@")[0]} has been warned! (${warns}/3)\nReason: ${reason}`,
          mentions: [target],
        });
      }
    },
  },
  {
    name: ["warnings", "warninglist", "warnlist"],
    category: "group",
    desc: "Check warnings for a user",
    group: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender || m.sender;
      const warns = getWarnings(m.chat, target, "manual");
      await sock.sendMessage(m.chat, {
        text: `⚠️ @${target.split("@")[0]} has *${warns}/3* warnings.`,
        mentions: [target],
      });
    },
  },
  {
    name: ["resetwarn", "clearwarn"],
    category: "group",
    desc: "Reset warnings for a user",
    group: true,
    admin: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to reset warnings.");
      resetWarnings(m.chat, target, "manual");
      await sock.sendMessage(m.chat, {
        text: `✅ Warnings cleared for @${target.split("@")[0]}.`,
        mentions: [target],
      });
    },
  },
  {
    name: ["grouplist", "members", "memberlist"],
    category: "group",
    desc: "List all group members",
    group: true,
    handler: async (sock, m, { groupMeta }) => {
      const members = groupMeta.participants;
      let msg = `👥 *${groupMeta.subject}*\n\n`;
      msg += `📊 Total: ${members.length} members\n\n`;
      members.forEach((p, i) => {
        const role = p.admin === "superadmin" ? "👑" : p.admin === "admin" ? "⭐" : "▸";
        msg += `${role} @${p.id.split("@")[0]}\n`;
      });
      await sock.sendMessage(m.chat, { text: msg, mentions: members.map((p) => p.id) });
    },
  },
  {
    name: ["chatbot"],
    category: "group",
    desc: "Toggle AI chatbot for this group",
    group: true,
    admin: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        updateGroupSetting(m.chat, "chatbot", 1);
        await m.reply("✅ Chatbot enabled! The bot will reply to all messages in this group.");
      } else if (text === "off") {
        updateGroupSetting(m.chat, "chatbot", 0);
        await m.reply("✅ Chatbot disabled!");
      } else {
        const settings = getGroupSettings(m.chat);
        const current = settings?.chatbot ? "on" : "off";
        await m.reply(`⚙️ *chatbot*  —  currently *${current}*

📖 Usage:  \`.chatbot on/off\`
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
      }
    },
  },
  {
    name: ["autosticker", "autostic"],
    category: "group",
    desc: "Auto-convert images to stickers",
    group: true,
    admin: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        updateGroupSetting(m.chat, "autosticker", 1);
        await m.reply("✅ Auto-sticker enabled! Images sent in this group will be auto-converted to stickers.");
      } else if (text === "off") {
        updateGroupSetting(m.chat, "autosticker", 0);
        await m.reply("✅ Auto-sticker disabled!");
      } else {
        const settings = getGroupSettings(m.chat);
        const current = settings?.autosticker ? "on" : "off";
        await m.reply(`⚙️ *autosticker*  —  currently *${current}*

📖 Usage:  \`.autosticker on/off\`
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
      }
    },
  },
];

module.exports = { commands, handleGroupEvent, handleAntilink, handleAntibad };