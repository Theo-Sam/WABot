const config = require("../config");
const { fetchBuffer, fetchJson } = require("../lib/helpers");

const afkMap = new Map();

function checkAfk(sock, m) {
  const mentioned = m.mentions || [];
  for (const jid of mentioned) {
    if (afkMap.has(jid)) {
      const { reason, time } = afkMap.get(jid);
      const mins = Math.floor((Date.now() - time) / 60000);
      const tag = jid.split("@")[0];
      sock.sendMessage(m.chat, {
        text: `⏸️ @${tag} is AFK: ${reason || "No reason"} (${mins}m ago)`,
        mentions: [jid],
      });
    }
  }
}

function clearAfk(sender) {
  if (afkMap.has(sender)) {
    const info = afkMap.get(sender);
    afkMap.delete(sender);
    return info;
  }
  return null;
}

const commands = [
  {
    name: ["emojimix", "emix", "mixemoji"],
    category: "fun",
    desc: "Mix two emojis into a sticker",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("emojimix 😀🤣");
      const emojis = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text.trim())].map((s) => s.segment).filter((s) => /\p{Emoji}/u.test(s));
      if (emojis.length < 2) return m.reply(`❌ Please provide two emojis.\nUsage: ${config.PREFIX}emojimix 😀🤣`);
      m.react("⏳");
      try {
        const emoji1 = emojis[0];
        const emoji2 = emojis[1];
        let imgUrl = "";

        // No-key: open Emoji Kitchen renderer
        imgUrl = `https://emojik.vercel.app/s/${encodeURIComponent(`${emoji1}_${emoji2}`)}?size=256`;

        const buffer = await fetchBuffer(imgUrl);
        const sharp = require("sharp");
        const webpBuffer = await sharp(buffer).resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        }).webp({ quality: 80 }).toBuffer();
        await sock.sendMessage(m.chat, { sticker: webpBuffer }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("EmojiMix");
      }
    },
  },
  {
    name: ["giphy", "gif", "tenor"],
    category: "fun",
    desc: "Search for GIFs",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("giphy <query>");
      m.react("⏳");
      try {
        let gifUrl = "";

        // Primary: Tenor v1 with shared demo key (no personal key required)
        const tenorData = await fetchJson(
          `https://g.tenor.com/v1/search?q=${encodeURIComponent(text)}&key=LIVDSRZULELA&limit=10&media_filter=minimal&contentfilter=medium`
        ).catch(() => null);
        const results = tenorData?.results || [];
        if (results.length) {
          const pick = results[Math.floor(Math.random() * results.length)];
          gifUrl = pick?.media?.[0]?.gif?.url || pick?.media?.[0]?.tinygif?.url || "";
        }

        // Fallback: Tenor trending GIFs filtered by query keyword
        if (!gifUrl) {
          const trending = await fetchJson(
            `https://g.tenor.com/v1/trending?key=LIVDSRZULELA&limit=10&media_filter=minimal`
          ).catch(() => null);
          const tr = trending?.results || [];
          if (tr.length) {
            const pick = tr[Math.floor(Math.random() * tr.length)];
            gifUrl = pick?.media?.[0]?.gif?.url || pick?.media?.[0]?.tinygif?.url || "";
          }
        }

        if (!gifUrl) return m.reply("❌ No GIF found for that search.");
        const buffer = await fetchBuffer(gifUrl, { timeout: 30000 });
        await sock.sendMessage(m.chat, { video: buffer, gifPlayback: true, caption: `🎬 *GIF:* ${text}` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("GIF");
      }
    },
  },
  {
    name: ["couple", "match"],
    category: "fun",
    group: true,
    desc: "Match two group members for compatibility",
    handler: async (sock, m, { args }) => {
      m.react("⏳");
      try {
        let user1, user2;
        const mentioned = m.mentions || [];
        if (mentioned.length >= 2) {
          user1 = mentioned[0];
          user2 = mentioned[1];
        } else {
          const groupMeta = await sock.groupMetadata(m.chat);
          const members = groupMeta.participants.map((p) => p.id);
          if (members.length < 2) return m.reply("❌ Not enough members in this group.");
          const shuffled = members.sort(() => Math.random() - 0.5);
          user1 = shuffled[0];
          user2 = shuffled[1];
        }
        const sorted = [user1, user2].sort();
        let hash = 0;
        const combined = sorted[0] + sorted[1];
        for (let i = 0; i < combined.length; i++) {
          hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
        }
        const percent = Math.abs(hash) % 101;
        const filled = Math.round(percent / 10);
        const bar = "❤️".repeat(filled) + "🖤".repeat(10 - filled);
        const tag1 = user1.split("@")[0];
        const tag2 = user2.split("@")[0];
        let label = "";
        if (percent >= 80) label = "💕 Perfect Match!";
        else if (percent >= 60) label = "💗 Great Chemistry!";
        else if (percent >= 40) label = "💛 Could Work!";
        else if (percent >= 20) label = "💔 Needs Effort";
        else label = "🖤 Not Meant To Be";
        const msg = `💘 *Love Match*\n\n👤 @${tag1}\n👤 @${tag2}\n\n${bar}\n\n💖 *Compatibility: ${percent}%*\n${label}`;
        await sock.sendMessage(m.chat, { text: msg, mentions: [user1, user2] }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        return m.errorReply("Failed to calculate match. Please try again.");
      }
    },
  },
  {
    name: ["afk", "brb"],
    category: "fun",
    desc: "Set your AFK status",
    handler: async (sock, m, { text }) => {
      m.react("⏳");
      const reason = text || "No reason";
      afkMap.set(m.sender, { reason, time: Date.now() });
      const tag = m.sender.split("@")[0];
      await sock.sendMessage(m.chat, {
        text: `⏸️ @${tag} is now AFK${reason !== "No reason" ? ": " + reason : ""}`,
        mentions: [m.sender],
      });
      m.react("✅");
    },
  },
];

module.exports = { commands, checkAfk, clearAfk };