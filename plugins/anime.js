const config = require("../config");
const { fetchBuffer, fetchJson } = require("../lib/helpers");

const commands = [
  {
    name: ["waifu"],
    category: "fun",
    desc: "Get a random waifu image",
    handler: async (sock, m) => {
      m.react("⏳");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/waifu");
        if (!data?.url) return m.reply("❌ Failed to get waifu image.");
        const buffer = await fetchBuffer(data.url);
        await sock.sendMessage(m.chat, { image: buffer, caption: `🎌 *Random Waifu*\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Waifu API is currently overloaded.");
      }
    },
  },
  {
    name: ["neko"],
    category: "fun",
    desc: "Get a random neko image",
    handler: async (sock, m) => {
      m.react("⏳");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/neko");
        if (!data?.url) return m.reply("❌ Failed.");
        const buffer = await fetchBuffer(data.url);
        await sock.sendMessage(m.chat, { image: buffer, caption: `🐱 *Random Neko*\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Neko API is currently overloaded.");
      }
    },
  },
  {
    name: ["shinobu"],
    category: "fun",
    desc: "Get a Shinobu image",
    handler: async (sock, m) => {
      m.react("⏳");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/shinobu");
        const buffer = await fetchBuffer(data.url);
        await sock.sendMessage(m.chat, { image: buffer, caption: `🦋 *Shinobu*\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["megumin"],
    category: "fun",
    desc: "Get a Megumin image",
    handler: async (sock, m) => {
      m.react("⏳");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/megumin");
        const buffer = await fetchBuffer(data.url);
        await sock.sendMessage(m.chat, { image: buffer, caption: `💥 *Megumin*\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["hug"],
    category: "fun",
    desc: "Hug someone",
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      m.react("🤗");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/hug");
        const buffer = await fetchBuffer(data.url);
        const caption = target ? `🤗 @${m.sender.split("@")[0]} hugs @${target.split("@")[0]}!` : `🤗 *Hug*`;
        await sock.sendMessage(m.chat, { image: buffer, caption, mentions: target ? [m.sender, target] : [] }, { quoted: { key: m.key, message: m.message } });
      } catch {
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["slap"],
    category: "fun",
    desc: "Slap someone",
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      m.react("👋");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/slap");
        const buffer = await fetchBuffer(data.url);
        const caption = target ? `👋 @${m.sender.split("@")[0]} slaps @${target.split("@")[0]}!` : `👋 *Slap*`;
        await sock.sendMessage(m.chat, { image: buffer, caption, mentions: target ? [m.sender, target] : [] }, { quoted: { key: m.key, message: m.message } });
      } catch {
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["pat"],
    category: "fun",
    desc: "Pat someone",
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      m.react("🤚");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/pat");
        const buffer = await fetchBuffer(data.url);
        const caption = target ? `🤚 @${m.sender.split("@")[0]} pats @${target.split("@")[0]}!` : `🤚 *Pat*`;
        await sock.sendMessage(m.chat, { image: buffer, caption, mentions: target ? [m.sender, target] : [] }, { quoted: { key: m.key, message: m.message } });
      } catch {
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["kiss"],
    category: "fun",
    desc: "Kiss someone",
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      m.react("💋");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/kiss");
        const buffer = await fetchBuffer(data.url);
        const caption = target ? `💋 @${m.sender.split("@")[0]} kisses @${target.split("@")[0]}!` : `💋 *Kiss*`;
        await sock.sendMessage(m.chat, { image: buffer, caption, mentions: target ? [m.sender, target] : [] }, { quoted: { key: m.key, message: m.message } });
      } catch {
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["cuddle"],
    category: "fun",
    desc: "Cuddle someone",
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      m.react("🥰");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/cuddle");
        const buffer = await fetchBuffer(data.url);
        const caption = target ? `🥰 @${m.sender.split("@")[0]} cuddles @${target.split("@")[0]}!` : `🥰 *Cuddle*`;
        await sock.sendMessage(m.chat, { image: buffer, caption, mentions: target ? [m.sender, target] : [] }, { quoted: { key: m.key, message: m.message } });
      } catch {
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["cry"],
    category: "fun",
    desc: "Cry reaction",
    handler: async (sock, m) => {
      m.react("😢");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/cry");
        const buffer = await fetchBuffer(data.url);
        await sock.sendMessage(m.chat, { image: buffer, caption: `😢 *Crying...*` }, { quoted: { key: m.key, message: m.message } });
      } catch {
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["smile", "happy"],
    category: "fun",
    desc: "Smile/happy reaction",
    handler: async (sock, m) => {
      m.react("😊");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/smile");
        const buffer = await fetchBuffer(data.url);
        await sock.sendMessage(m.chat, { image: buffer, caption: `😊 *Smile!*` }, { quoted: { key: m.key, message: m.message } });
      } catch {
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["wave"],
    category: "fun",
    desc: "Wave at someone",
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      m.react("👋");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/wave");
        const buffer = await fetchBuffer(data.url);
        const caption = target ? `👋 @${m.sender.split("@")[0]} waves at @${target.split("@")[0]}!` : `👋 *Wave*`;
        await sock.sendMessage(m.chat, { image: buffer, caption, mentions: target ? [m.sender, target] : [] }, { quoted: { key: m.key, message: m.message } });
      } catch {
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["bite"],
    category: "fun",
    desc: "Bite someone",
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      m.react("😬");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/bite");
        const buffer = await fetchBuffer(data.url);
        const caption = target ? `😬 @${m.sender.split("@")[0]} bites @${target.split("@")[0]}!` : `😬 *Bite*`;
        await sock.sendMessage(m.chat, { image: buffer, caption, mentions: target ? [m.sender, target] : [] }, { quoted: { key: m.key, message: m.message } });
      } catch {
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["kick_anime", "animekick", "yeet"],
    category: "fun",
    desc: "Kick someone (anime)",
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      m.react("🦵");
      try {
        const data = await fetchJson("https://api.waifu.pics/sfw/kick");
        const buffer = await fetchBuffer(data.url);
        const caption = target ? `🦵 @${m.sender.split("@")[0]} kicks @${target.split("@")[0]}!` : `🦵 *Kick*`;
        await sock.sendMessage(m.chat, { image: buffer, caption, mentions: target ? [m.sender, target] : [] }, { quoted: { key: m.key, message: m.message } });
      } catch {
        await m.reply("⏳ The Anime API is currently overloaded.");
      }
    },
  },
  {
    name: ["animequote", "aquote", "aq"],
    category: "fun",
    desc: "Get a random anime quote",
    handler: async (sock, m) => {
      m.react("🎌");
      try {
        const data = await fetchJson("https://animechan.xyz/api/random").catch(() => null);
        if (data?.quote) {
          await m.reply(`🎌 *Anime Quote*\n\n"${data.quote}"\n\n— *${data.character}* from _${data.anime}_`);
        } else {
          const quotes = [
            { quote: "People's lives don't end when they die. It ends when they lose faith.", character: "Itachi Uchiha", anime: "Naruto" },
            { quote: "If you don't take risks, you can't create a future!", character: "Monkey D. Luffy", anime: "One Piece" },
            { quote: "The world isn't perfect. But it's there for us, doing the best it can.", character: "Roy Mustang", anime: "Fullmetal Alchemist" },
            { quote: "Even if I die, you keep living okay? Live to see the end of this world.", character: "Zoro", anime: "One Piece" },
          ];
          const q = quotes[Math.floor(Math.random() * quotes.length)];
          await m.reply(`🎌 *Anime Quote*\n\n"${q.quote}"\n\n— *${q.character}* from _${q.anime}_`);
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Anime Quote API is currently overloaded.");
      }
    },
  },
];

module.exports = { commands };