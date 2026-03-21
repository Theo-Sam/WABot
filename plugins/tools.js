const config = require("../config");
const { fetchBuffer, fetchJson, postJson, isUrl, parseMention, pickNonRepeating } = require("../lib/helpers");
const { endpoints } = require("../lib/endpoints");

const fallbackQuotes = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs", tag: "work" },
  { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs", tag: "innovation" },
  { text: "Life is what happens when you're busy making other plans.", author: "John Lennon", tag: "life" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt", tag: "dreams" },
  { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle", tag: "resilience" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln", tag: "discipline" },
  { text: "Consistency compounds. Small wins repeated daily change your life.", author: "James Clear", tag: "growth" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg", tag: "execution" },
  { text: "You don't rise to the level of your goals; you fall to the level of your systems.", author: "James Clear", tag: "systems" },
  { text: "Courage starts with showing up and letting ourselves be seen.", author: "Brene Brown", tag: "courage" },
];

const fallbackJokes = [
  "Why did the programmer quit his job? Because he didn't get arrays!",
  "Why do Java developers wear glasses? Because they don't C#.",
  "I told my code to be clean. It removed all my comments.",
  "Why was the function always calm? It had no side effects.",
  "I broke production once. It was a groundbreaking release.",
  "Debugging is like being the detective and the criminal in the same movie.",
];

const fallbackFacts = [
  "Honey never spoils. Archaeologists found 3000-year-old honey that was still edible.",
  "Octopuses have three hearts and blue blood.",
  "Bananas are berries, but strawberries are not.",
  "A day on Venus is longer than a year on Venus.",
  "Sharks existed before trees appeared on Earth.",
  "The Eiffel Tower can grow taller in summer due to heat expansion.",
];

const magic8Answers = [
  "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.",
  "As I see it, yes.", "Most likely.", "Outlook good.", "Yes.",
  "Signs point to yes.", "Reply hazy, try again.", "Ask again later.",
  "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.",
  "Don't count on it.", "My reply is no.", "My sources say no.",
  "Outlook not so good.", "Very doubtful.",
];

const commands = [
  {
    name: ["tts", "say"],
    category: "tools",
    desc: "Text to speech",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}tts <text>`);
      m.react("⏳");
      try {
        const lang = (process.env.TTS_LANG || "en").trim();
        const googleKey = (process.env.GOOGLE_TTS_API_KEY || "").trim();

        let buffer = null;
        if (googleKey) {
          const voiceName = (process.env.GOOGLE_TTS_VOICE || "").trim(); // optional
          const body = {
            input: { text },
            voice: {
              languageCode: lang,
              ...(voiceName ? { name: voiceName } : {}),
            },
            audioConfig: { audioEncoding: "MP3" },
          };
          const data = await postJson(
            `${endpoints.tts.googleCloudEndpoint}?key=${encodeURIComponent(googleKey)}`,
            body,
            { timeout: 20000, headers: { "Content-Type": "application/json" } }
          ).catch(() => null);
          if (data?.audioContent) {
            buffer = Buffer.from(data.audioContent, "base64");
          }
        }

        if (!buffer) {
          const url = `${endpoints.tts.googleTranslateTtsBase}?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;
          buffer = await fetchBuffer(url);
        }

        await sock.sendMessage(m.chat, { audio: buffer, mimetype: "audio/mpeg", ptt: true }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The TTS API is currently overloaded.");
      }
    },
  },
  {
    name: ["calc", "math", "c"],
    category: "tools",
    desc: "Calculate math expression",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}calc <expression>\nExample: ${config.PREFIX}calc 2+2*3`);
      try {
        const safe = text.replace(/[^0-9+\-*/.()% ]/g, "");
        if (!safe) return m.reply("Invalid expression.");
        const result = Function(`"use strict"; return (${safe})`)();
        await m.reply(`🧮 *Calculator*\n\n▸ Expression: ${text}\n▸ Result: ${result}`);
      } catch {
        await m.reply("❌ Invalid math expression.");
      }
    },
  },
  {
    name: ["base64encode", "b64e", "e64"],
    category: "tools",
    desc: "Encode text to base64",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}base64encode <text>`);
      const encoded = Buffer.from(text).toString("base64");
      await m.reply(`🔐 *Base64 Encode*\n\n${encoded}`);
    },
  },
  {
    name: ["base64decode", "b64d"],
    category: "tools",
    desc: "Decode base64 text",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}base64decode <text>`);
      try {
        const decoded = Buffer.from(text, "base64").toString("utf-8");
        await m.reply(`🔓 *Base64 Decode*\n\n${decoded}`);
      } catch {
        await m.reply("❌ Invalid base64 text.");
      }
    },
  },
  {
    name: ["wea", "wthr"],
    category: "tools",
    desc: "Get weather info for a city",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}wea <city>`);
      m.react("⏳");
      try {
        const data = await fetchJson(`${endpoints.weather.wttrBase}/${encodeURIComponent(text)}?format=j1`);
        if (!data?.current_condition?.[0]) return m.reply("❌ City not found or weather API unavailable.");
        const cur = data.current_condition[0];
        const loc = data.nearest_area?.[0];
        const areaName = loc?.areaName?.[0]?.value || text;
        const country = loc?.country?.[0]?.value || "";
        const condition = cur.weatherDesc?.[0]?.value || "N/A";
        const weather = `🌤️ *Weather for ${areaName}${country ? ", " + country : ""}*

🌡️ Temperature: ${cur.temp_C}°C / ${cur.temp_F}°F
🤒 Feels Like: ${cur.FeelsLikeC}°C / ${cur.FeelsLikeF}°F
💧 Humidity: ${cur.humidity}%
💨 Wind: ${cur.windspeedKmph} km/h ${cur.winddir16Point}
☁️ Cloud Cover: ${cur.cloudcover}%
👁️ Visibility: ${cur.visibility} km
📊 Pressure: ${cur.pressure} mb
🌧️ Precipitation: ${cur.precipMM} mm
📝 Condition: ${condition}`;
        await m.reply(weather);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Weather API is currently unavailable.");
      }
    },
  },
  {
    name: ["quote", "quotes", "qt"],
    category: "tools",
    desc: "Get a random quote",
    handler: async (sock, m) => {
      m.react("⏳");
      try {
        let author = "Unknown";
        let content = "No quote text available.";
        let tags = "general";

        const zen = await fetchJson("https://zenquotes.io/api/random").catch(() => null);
        if (Array.isArray(zen) && zen[0]?.q) {
          content = zen[0].q;
          author = zen[0].a || author;
          tags = "inspiration";
        } else {
          const data = await fetchJson("https://dummyjson.com/quotes/random").catch(() => null);
          if (data?.quote) {
            author = data.author || author;
            content = data.quote;
            tags = "general";
          } else {
            throw new Error("quote providers unavailable");
          }
        }

        const len = String(content).length;
        await m.reply(`📜 *Daily Quote*\n\n"${content}"\n\n— _${author}_\n🏷️ Tags: ${tags}\n📏 Length: ${len} chars`);
        m.react("✅");
      } catch {
        const q = pickNonRepeating(fallbackQuotes, `${m.chat}:quote`, { maxHistory: 7 });
        await m.reply(`📜 *Daily Quote*\n\n"${q.text}"\n\n— _${q.author}_\n🏷️ Tags: ${q.tag}\n📡 Source: Local fallback`);
        m.react("✅");
      }
    },
  },
  {
    name: ["joke"],
    category: "fun",
    desc: "Get a random joke",
    handler: async (sock, m) => {
      m.react("😂");
      try {
        const data = await fetchJson("https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,racist,sexist&type=single");
        if (data.joke) {
          await m.reply(`😂 *Joke Break*\n\n${data.joke}\n\n_Type ${config.PREFIX}joke for another one._`);
        } else {
          await m.reply(`😂 *Joke Break*\n\n${data.setup}\n\n${data.delivery}`);
        }
      } catch {
        const joke = pickNonRepeating(fallbackJokes, `${m.chat}:joke`, { maxHistory: 4 });
        await m.reply(`😂 *Joke Break*\n\n${joke}\n\n📡 Source: Local fallback`);
      }
    },
  },
  {
    name: ["fact"],
    category: "fun",
    desc: "Get a random fact",
    handler: async (sock, m) => {
      m.react("🧠");
      try {
        const data = await fetchJson("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en");
        await m.reply(`🧠 *Did You Know?*\n\n${data.text}\n\n🌍 Language: EN`);
      } catch {
        const fact = pickNonRepeating(fallbackFacts, `${m.chat}:fact`, { maxHistory: 4 });
        await m.reply(`🧠 *Did You Know?*\n\n${fact}\n\n📡 Source: Local fallback`);
      }
    },
  },
  {
    name: ["flip", "coinflip", "cf"],
    category: "fun",
    desc: "Flip a coin",
    handler: async (sock, m) => {
      const result = Math.random() < 0.5 ? "Heads 🪙" : "Tails 🪙";
      await m.reply(`🪙 *Coin Flip*\n\nResult: *${result}*`);
    },
  },
  {
    name: ["roll", "dice"],
    category: "fun",
    desc: "Roll a dice",
    handler: async (sock, m, { text }) => {
      const sides = parseInt(text) || 6;
      const result = Math.floor(Math.random() * sides) + 1;
      await m.reply(`🎲 *Dice Roll* (d${sides})\n\nResult: *${result}*`);
    },
  },
  {
    name: ["8ball"],
    category: "fun",
    desc: "Ask the magic 8-ball",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}8ball <question>`);
      const answer = pickNonRepeating(magic8Answers, `${m.chat}:8ball`, { maxHistory: 6 });
      await m.reply(`🎱 *Magic 8-Ball*\n\n❓ Question: ${text}\n🔮 Answer: ${answer}`);
    },
  },
];

module.exports = { commands };