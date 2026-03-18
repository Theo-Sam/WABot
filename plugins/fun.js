const config = require("../config");
const { fetchBuffer, fetchJson } = require("../lib/helpers");

const TENOR_API_KEY = process.env.TENOR_API_KEY || "LIVDSRZULELA";
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || "";

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
      if (!text) return m.reply(`Usage: ${config.PREFIX}emojimix 😀🤣`);
      const emojis = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text.trim())].map((s) => s.segment).filter((s) => /\p{Emoji}/u.test(s));
      if (emojis.length < 2) return m.reply(`❌ Please provide two emojis.\nUsage: ${config.PREFIX}emojimix 😀🤣`);
      m.react("⏳");
      try {
        const emoji1 = emojis[0];
        const emoji2 = emojis[1];
        let imgUrl = "";

        if (TENOR_API_KEY) {
          const url = `https://tenor.googleapis.com/v2/featured?key=${encodeURIComponent(TENOR_API_KEY)}&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v6&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`;
          const data = await fetchJson(url);
          if (data?.results?.length) imgUrl = data.results[0].url;
        }

        if (!imgUrl) {
          imgUrl = `https://emojik.vercel.app/s/${encodeURIComponent(`${emoji1}_${emoji2}`)}?size=256`;
        }

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
        await m.reply("⏳ The EmojiMix API is currently overloaded.");
      }
    },
  },
  {
    name: ["giphy", "gif", "tenor"],
    category: "fun",
    desc: "Search for GIFs",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}giphy <query>`);
      m.react("⏳");
      try {
        let gifUrl = "";

        const tenorUrl = `https://tenor.googleapis.com/v2/search?key=${encodeURIComponent(TENOR_API_KEY)}&q=${encodeURIComponent(text)}&limit=1&media_filter=gif`;
        const tenorData = await fetchJson(tenorUrl).catch(() => null);
        gifUrl = tenorData?.results?.[0]?.media_formats?.gif?.url || "";

        if (!gifUrl && GIPHY_API_KEY) {
          const giphyUrl = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(GIPHY_API_KEY)}&q=${encodeURIComponent(text)}&limit=1&rating=g&lang=en`;
          const giphyData = await fetchJson(giphyUrl).catch(() => null);
          gifUrl = giphyData?.data?.[0]?.images?.original?.url || "";
        }

        if (!gifUrl) return m.reply("❌ No GIF URL found.");
        const buffer = await fetchBuffer(gifUrl);
        await sock.sendMessage(m.chat, { video: buffer, gifPlayback: true, caption: `🎬 *GIF:* ${text}` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The GIF API is currently overloaded.");
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
        await m.reply("❌ Failed to calculate match.");
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