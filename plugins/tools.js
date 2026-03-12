const config = require("../config");
const { fetchBuffer, fetchJson, isUrl, parseMention } = require("../lib/helpers");

const commands = [
  {
    name: ["tts", "say"],
    category: "tools",
    desc: "Text to speech",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}tts <text>`);
      m.react("⏳");
      try {
        const lang = "en";
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
        const buffer = await fetchBuffer(url);
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
    name: ["weather", "wea"],
    category: "tools",
    desc: "Get weather info for a city",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}weather <city>`);
      m.react("⏳");
      try {
        const data = await fetchJson(`https://wttr.in/${encodeURIComponent(text)}?format=j1`);
        const cur = data.current_condition[0];
        const loc = data.nearest_area[0];
        const weather = `🌤️ *Weather for ${loc.areaName[0].value}, ${loc.country[0].value}*

🌡️ Temperature: ${cur.temp_C}°C / ${cur.temp_F}°F
🤒 Feels Like: ${cur.FeelsLikeC}°C / ${cur.FeelsLikeF}°F
💧 Humidity: ${cur.humidity}%
💨 Wind: ${cur.windspeedKmph} km/h ${cur.winddir16Point}
☁️ Cloud Cover: ${cur.cloudcover}%
👁️ Visibility: ${cur.visibility} km
📊 Pressure: ${cur.pressure} mb
🌧️ Precipitation: ${cur.precipMM} mm
📝 Condition: ${cur.weatherDesc[0].value}`;
        await m.reply(weather);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Weather API is currently overloaded.");
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
        const data = await fetchJson("https://api.quotable.io/random");
        await m.reply(`📜 *"${data.content}"*\n\n— _${data.author}_`);
        m.react("✅");
      } catch {
        const quotes = [
          { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
          { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
          { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
          { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
          { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
        ];
        const q = quotes[Math.floor(Math.random() * quotes.length)];
        await m.reply(`📜 *"${q.text}"*\n\n— _${q.author}_`);
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
          await m.reply(`😂 ${data.joke}`);
        } else {
          await m.reply(`😂 ${data.setup}\n\n${data.delivery}`);
        }
      } catch {
        await m.reply("😂 Why did the programmer quit his job? Because he didn't get arrays!");
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
        await m.reply(`🧠 *Did you know?*\n\n${data.text}`);
      } catch {
        await m.reply("🧠 *Did you know?*\n\nHoney never spoils. Archaeologists have found 3000-year-old honey in Egyptian tombs that was still edible!");
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
      const answers = [
        "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.",
        "As I see it, yes.", "Most likely.", "Outlook good.", "Yes.",
        "Signs point to yes.", "Reply hazy, try again.", "Ask again later.",
        "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.",
        "Don't count on it.", "My reply is no.", "My sources say no.",
        "Outlook not so good.", "Very doubtful.",
      ];
      const answer = answers[Math.floor(Math.random() * answers.length)];
      await m.reply(`🎱 *Magic 8-Ball*\n\n❓ ${text}\n🔮 ${answer}`);
    },
  },
];

module.exports = { commands };