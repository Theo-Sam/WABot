const config = require("../config");
const path = require("path");
const { getGroupSettings, updateGroupSetting } = require("../lib/database");
const { setEnvValue } = require("../lib/env-util");

const commands = [
  {
    name: ["antiviewonce", "antivo"],
    category: "settings",
    desc: "Auto-repost view once media",
    group: true,
    admin: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        updateGroupSetting(m.chat, "antiviewonce", 1);
        await m.reply("✅ Anti-ViewOnce enabled. Captured view-once content will be saved and sent to owner DM.");
      } else if (text === "off") {
        updateGroupSetting(m.chat, "antiviewonce", 0);
        await m.reply("✅ Anti-ViewOnce disabled.");
      } else {
        const current = getGroupSettings(m.chat)?.antiviewonce ? "on" : "off";
        await m.reply(`Usage: ${config.PREFIX}antiviewonce on/off\nCurrent: ${current}`);
      }
    },
  },
  {
    name: ["antidelete", "antidel"],
    category: "settings",
    desc: "Repost deleted messages. In your DM: enables globally for all chats. In a group: enables for that group only.",
    handler: async (sock, m, { text, isOwner, isAdmin }) => {
      const inGroup = m.isGroup;

      if (inGroup) {
        // Group context: require admin or owner
        if (!isAdmin && !isOwner) {
          return m.reply("❌ You need to be a group admin to toggle Anti-Delete in a group.");
        }
        // Per-group toggle — visible only inside the group
        if (text === "on") {
          updateGroupSetting(m.chat, "antidelete", 1);
          await m.reply(`✅ Anti-Delete enabled for this group. Deleted content will be forwarded to the owner.`);
        } else if (text === "off") {
          updateGroupSetting(m.chat, "antidelete", 0);
          await m.reply("✅ Anti-Delete disabled for this group.");
        } else {
          const current = getGroupSettings(m.chat)?.antidelete ? "on" : "off";
          await m.reply(`Usage: ${config.PREFIX}antidelete on/off\nScope: this group\nCurrent: ${current}`);
        }
      } else {
        // DM context: owner only — sets a GLOBAL flag silently
        if (!isOwner) {
          return m.reply("❌ Only the bot owner can toggle Anti-Delete.");
        }
        if (text === "on") {
          updateGroupSetting("__global__", "antidelete", 1);
          await m.reply(
            `✅ *Anti-Delete enabled globally.*\n` +
            `Every deleted message from *any* chat (groups + DMs) will be forwarded to you privately.\n` +
            `Nobody else knows this is active.`
          );
        } else if (text === "off") {
          updateGroupSetting("__global__", "antidelete", 0);
          await m.reply("✅ Global Anti-Delete disabled.");
        } else {
          const globalOn = getGroupSettings("__global__")?.antidelete ? "on" : "off";
          await m.reply(
            `*Anti-Delete Settings*\n\n` +
            `🌍 Global (all chats): *${globalOn}*\n\n` +
            `Usage:\n` +
            `• ${config.PREFIX}antidelete on — enable globally from this DM\n` +
            `• ${config.PREFIX}antidelete off — disable global\n` +
            `• Use inside a group to toggle for that group only`
          );
        }
      }
    },
  },
  {
    name: ["antispam"],
    category: "settings",
    desc: "Toggle anti-spam protection",
    group: true,
    admin: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        updateGroupSetting(m.chat, "antispam", 1);
        await m.reply("✅ Anti-spam enabled. Repeated/flood messages will be controlled.");
      } else if (text === "off") {
        updateGroupSetting(m.chat, "antispam", 0);
        await m.reply("✅ Anti-spam disabled.");
      } else {
        const current = getGroupSettings(m.chat)?.antispam ? "on" : "off";
        await m.reply(`Usage: ${config.PREFIX}antispam on/off\nCurrent: ${current}`);
      }
    },
  },
  {
    name: ["setautoread", "autoread"],
    category: "settings",
    desc: "Toggle auto-read messages",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        config.AUTO_READ = "on";
        await m.reply("✅ Auto-read enabled. Incoming chats will be marked as read automatically.");
      } else if (text === "off") {
        config.AUTO_READ = "off";
        await m.reply("✅ Auto-read disabled.");
      } else {
        await m.reply(`Usage: ${config.PREFIX}autoread on/off\nCurrent: ${config.AUTO_READ}`);
      }
    },
  },
  {
    name: ["setautostatus"],
    category: "settings",
    desc: "Toggle auto view status",
    owner: true,
    handler: async (sock, m, { text }) => {
      const envPath = path.join(__dirname, "..", ".env");
      if (text === "on") {
        config.AUTO_STATUS_VIEW = "on";
        setEnvValue(envPath, "AUTO_STATUS_VIEW", "on");
        console.log("[DESAM-STATUS] AUTO_STATUS_VIEW toggled ON via setautostatus command.");
        await m.reply("✅ Auto-status view enabled. New statuses will be marked as seen. (persisted)");
      } else if (text === "off") {
        config.AUTO_STATUS_VIEW = "off";
        setEnvValue(envPath, "AUTO_STATUS_VIEW", "off");
        console.log("[DESAM-STATUS] AUTO_STATUS_VIEW toggled OFF via setautostatus command.");
        await m.reply("✅ Auto-status view disabled. (persisted)");
      } else {
        await m.reply(`Usage: ${config.PREFIX}setautostatus on/off\nCurrent: ${config.AUTO_STATUS_VIEW || "off"}`);
      }
    },
  },
  {
    name: ["setanticall", "anticall"],
    category: "settings",
    desc: "Toggle anti-call",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        config.ANTI_CALL = "on";
        await m.reply("✅ Anti-call enabled! All calls will be rejected.");
      } else if (text === "off") {
        config.ANTI_CALL = "off";
        await m.reply("✅ Anti-call disabled.");
      } else {
        await m.reply(`Usage: ${config.PREFIX}anticall on/off\nCurrent: ${config.ANTI_CALL}`);
      }
    },
  },
  {
    name: ["setautobio", "autobio"],
    category: "settings",
    desc: "Toggle auto bio update",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (text === "on") {
        config.AUTO_BIO = "on";
        await m.reply("✅ Auto-bio enabled. Bio will refresh based on your configured template.");
      } else if (text === "off") {
        config.AUTO_BIO = "off";
        await m.reply("✅ Auto-bio disabled.");
      } else {
        await m.reply(`Usage: ${config.PREFIX}autobio on/off\nCurrent: ${config.AUTO_BIO}`);
      }
    },
  },
  {
    name: ["block"],
    category: "settings",
    desc: "Block a user",
    owner: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to block.");
      await sock.updateBlockStatus(target, "block").catch(() => {});
      await m.reply(`🚫 Blocked @${target.split("@")[0]}`, { mentions: [target] });
    },
  },
  {
    name: ["unblock"],
    category: "settings",
    desc: "Unblock a user",
    owner: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to unblock.");
      await sock.updateBlockStatus(target, "unblock").catch(() => {});
      await m.reply(`✅ Unblocked @${target.split("@")[0]}`, { mentions: [target] });
    },
  },
  {
    name: ["disappear", "ephemeral"],
    category: "settings",
    desc: "Set disappearing messages",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m, { text }) => {
      const durations = { off: 0, "24h": 86400, "7d": 604800, "90d": 7776000 };
      if (!text || !durations.hasOwnProperty(text)) {
        return m.reply(`Usage: ${config.PREFIX}disappear off/24h/7d/90d`);
      }
      await sock.sendMessage(m.chat, { disappearingMessagesInChat: durations[text] });
      await m.reply(`✅ Disappearing messages ${text === "off" ? "disabled" : `set to ${text}`}.`);
    },
  },
  {
    name: ["setpp", "setprofilepic", "setbotpp"],
    category: "settings",
    desc: "Set bot profile picture",
    owner: true,
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}setpp`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        await sock.updateProfilePicture(sock.user.id, buffer);
        await m.reply("✅ Profile picture updated!");
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to update profile picture.");
      }
    },
  },
  {
    name: ["setgrouppp", "setgpp"],
    category: "settings",
    desc: "Set group profile picture",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}setgrouppp`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        await sock.updateProfilePicture(m.chat, buffer);
        await m.reply("✅ Group picture updated!");
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to update group picture.");
      }
    },
  },
  {
    name: ["setgroupname", "setgname", "setsubject"],
    category: "settings",
    desc: "Set group name",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}setgroupname <new name>`);
      try {
        await sock.groupUpdateSubject(m.chat, text);
        await m.reply(`✅ Group name changed to: *${text}*`);
      } catch {
        await m.reply("❌ Failed to change group name. Make sure the bot is an admin.");
      }
    },
  },
  {
    name: ["setgroupdesc", "setgdesc", "setdesc"],
    category: "settings",
    desc: "Set group description",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}setgroupdesc <description>`);
      try {
        await sock.groupUpdateDescription(m.chat, text);
        await m.reply("✅ Group description updated!");
      } catch {
        await m.reply("❌ Failed to update group description. Make sure the bot is an admin.");
      }
    },
  },
  {
    name: ["getpp", "profilepic", "pp"],
    category: "settings",
    desc: "Get profile picture",
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender || m.sender;
      m.react("⏳");
      try {
        const ppUrl = await sock.profilePictureUrl(target, "image");
        const buffer = await require("../lib/helpers").fetchBuffer(ppUrl);
        await sock.sendMessage(m.chat, { image: buffer, caption: `👤 Profile picture of @${target.split("@")[0]}`, mentions: [target] });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Could not get profile picture. It may be hidden.");
      }
    },
  },
  {
    name: ["revoke", "resetlink"],
    category: "settings",
    desc: "Reset group invite link",
    group: true,
    admin: true,
    botAdmin: true,
    handler: async (sock, m) => {
      try {
        await sock.groupRevokeInvite(m.chat);
        const newCode = await sock.groupInviteCode(m.chat);
        await m.reply(`✅ Group link reset!\n\nNew link: https://chat.whatsapp.com/${newCode}`);
      } catch {
        await m.reply("❌ Failed to reset invite link. Make sure the bot is an admin.");
      }
    },
  },
  {
    name: ["link", "grouplink", "invite"],
    category: "settings",
    desc: "Get group invite link",
    group: true,
    admin: true,
    handler: async (sock, m) => {
      try {
        const code = await sock.groupInviteCode(m.chat);
        await m.reply(`🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}\n\n_Only share this with trusted members._`);
      } catch {
        await m.reply("❌ Failed to get invite link. Make sure the bot has access.");
      }
    },
  },
  {
    name: ["leave", "bye"],
    category: "settings",
    desc: "Leave the group",
    owner: true,
    group: true,
    handler: async (sock, m) => {
      await m.reply("👋 Goodbye!");
      await sock.groupLeave(m.chat);
    },
  },
];

module.exports = { commands };