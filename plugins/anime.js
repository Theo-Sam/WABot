const config = require("../config");
const { fetchBuffer, fetchJson, pickNonRepeating } = require("../lib/helpers");

const fallbackAnimeQuotes = [
  { quote: "People's lives don't end when they die. It ends when they lose faith.", character: "Itachi Uchiha", anime: "Naruto" },
  { quote: "If you don't take risks, you can't create a future!", character: "Monkey D. Luffy", anime: "One Piece" },
  { quote: "The world isn't perfect. But it's there for us, doing the best it can.", character: "Roy Mustang", anime: "Fullmetal Alchemist" },
  { quote: "Even if I die, you keep living okay? Live to see the end of this world.", character: "Zoro", anime: "One Piece" },
  { quote: "Power comes in response to a need, not a desire.", character: "Goku", anime: "Dragon Ball Z" },
  { quote: "Knowing you're different is only the beginning. If you accept these differences you'll be able to get past them.", character: "Kakashi Hatake", anime: "Naruto" },
];

const styleCaptions = {
  waifu: ["🎌 *Waifu Drop*", "✨ *Waifu Highlight*", "💫 *Anime Waifu Pick*"],
  neko: ["🐱 *Neko Drop*", "🌸 *Neko Moment*", "✨ *Cute Neko Pick*"],
  shinobu: ["🦋 *Shinobu Spotlight*", "⚔️ *Demon Slayer Vibes*", "💜 *Kocho Style*"],
  megumin: ["💥 *Explosion Queen*", "✨ *Megumin Moment*", "🔥 *Crimson Magic*"],
  cry: ["😢 *Anime Mood*", "💧 *Emotional Scene*", "🥺 *Feels Moment*"],
  smile: ["😊 *Smile Mode*", "🌟 *Positive Vibes*", "😄 *Happy Anime Moment*"],
};

const actionVerbs = {
  hug: ["hugs", "gives a warm hug to", "wraps arms around"],
  slap: ["slaps", "gives a dramatic slap to", "bonks"],
  pat: ["pats", "gently pats", "gives head pats to"],
  kiss: ["kisses", "sends a kiss to", "gives a sweet kiss to"],
  cuddle: ["cuddles", "snuggles with", "cozies up with"],
  wave: ["waves at", "greets", "says hi to"],
  bite: ["bites", "playfully bites", "nibbles"],
  kick: ["kicks", "yeets", "launches a kick at"],
};

function buildActionCaption(chatId, action, sender, target) {
  if (!target) {
    return `${action === "kick" ? "🦵" : "✨"} *${action.charAt(0).toUpperCase() + action.slice(1)}*`;
  }
  const verb = pickNonRepeating(actionVerbs[action] || [action], `${chatId}:anime:${action}:verb`, { maxHistory: 2 });
  return `✨ @${sender.split("@")[0]} ${verb} @${target.split("@")[0]}!`;
}

const commands = [
  {
    name: ["waifu"],
    category: "fun",
    desc: "Get a random waifu image",
    handler: async (sock, m) => {
      m.react("⏳");
      try {
        const data = await fetchJson("https://nekos.best/api/v2/waifu");
        const url = data?.results?.[0]?.url;
        if (!url) return m.reply("❌ Failed to get waifu image.");
        const buffer = await fetchBuffer(url);
        const title = pickNonRepeating(styleCaptions.waifu, `${m.chat}:anime:waifu`, { maxHistory: 2 });
        await sock.sendMessage(m.chat, { image: buffer, caption: `${title}\n\n📡 Source: nekos.best\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
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
        const data = await fetchJson("https://nekos.best/api/v2/neko");
        const url = data?.results?.[0]?.url;
        if (!url) return m.reply("❌ Failed.");
        const buffer = await fetchBuffer(url);
        const title = pickNonRepeating(styleCaptions.neko, `${m.chat}:anime:neko`, { maxHistory: 2 });
        await sock.sendMessage(m.chat, { image: buffer, caption: `${title}\n\n📡 Source: nekos.best\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
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
        const data = await fetchJson("https://nekos.best/api/v2/shinobu");
        const url = data?.results?.[0]?.url;
        if (!url) return m.reply("❌ Failed to get shinobu image.");
        const buffer = await fetchBuffer(url);
        const title = pickNonRepeating(styleCaptions.shinobu, `${m.chat}:anime:shinobu`, { maxHistory: 2 });
        await sock.sendMessage(m.chat, { image: buffer, caption: `${title}\n\n📡 Source: nekos.best\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
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
        const data = await fetchJson("https://nekos.best/api/v2/megumin");
        const url = data?.results?.[0]?.url;
        if (!url) return m.reply("❌ Failed to get megumin image.");
        const buffer = await fetchBuffer(url);
        const title = pickNonRepeating(styleCaptions.megumin, `${m.chat}:anime:megumin`, { maxHistory: 2 });
        await sock.sendMessage(m.chat, { image: buffer, caption: `${title}\n\n📡 Source: nekos.best\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
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
        const { NekoClient } = require('nekos.life');
        const neko = new NekoClient();
        const data = await neko.sfw.hug();
        const url = data?.url;
        if (!url) return m.reply("❌ Failed to get hug image.");
        const buffer = await fetchBuffer(url);
        const caption = buildActionCaption(m.chat, "hug", m.sender, target);
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
        const caption = buildActionCaption(m.chat, "slap", m.sender, target);
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
        const caption = buildActionCaption(m.chat, "pat", m.sender, target);
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
        const caption = buildActionCaption(m.chat, "kiss", m.sender, target);
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
        const caption = buildActionCaption(m.chat, "cuddle", m.sender, target);
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
        const title = pickNonRepeating(styleCaptions.cry, `${m.chat}:anime:cry`, { maxHistory: 2 });
        await sock.sendMessage(m.chat, { image: buffer, caption: `${title}\n\n📡 Source: waifu.pics` }, { quoted: { key: m.key, message: m.message } });
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
        const title = pickNonRepeating(styleCaptions.smile, `${m.chat}:anime:smile`, { maxHistory: 2 });
        await sock.sendMessage(m.chat, { image: buffer, caption: `${title}\n\n📡 Source: waifu.pics` }, { quoted: { key: m.key, message: m.message } });
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
        const caption = buildActionCaption(m.chat, "wave", m.sender, target);
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
        const caption = buildActionCaption(m.chat, "bite", m.sender, target);
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
        const caption = buildActionCaption(m.chat, "kick", m.sender, target);
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
        const data = await fetchJson("https://animechan.vercel.app/api/random").catch(() => null);
        if (data?.quote) {
          await m.reply(`🎌 *Anime Quote*\n\n"${data.quote}"\n\n— *${data.character}* from _${data.anime}_\n📡 Source: AnimeChan`);
        } else {
          const q = pickNonRepeating(fallbackAnimeQuotes, `${m.chat}:animequote`, { maxHistory: 4 });
          await m.reply(`🎌 *Anime Quote*\n\n"${q.quote}"\n\n— *${q.character}* from _${q.anime}_\n📡 Source: Local fallback`);
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