const config = require("../config");
const { fetchJson, normalizeAiText, pickNonRepeating } = require("../lib/helpers");
// No-key mode: avoid paid AI SDKs (use free endpoints where available)

const planets = {
  mercury: { name: "Mercury", emoji: "☿️", distance: "57.9M km", diameter: "4,879 km", moons: 0, dayLength: "59 Earth days", yearLength: "88 Earth days", temp: "-180°C to 430°C", fact: "Smallest planet in our solar system and closest to the Sun." },
  venus: { name: "Venus", emoji: "♀️", distance: "108.2M km", diameter: "12,104 km", moons: 0, dayLength: "243 Earth days", yearLength: "225 Earth days", temp: "465°C avg", fact: "Hottest planet. Rotates backward compared to other planets." },
  earth: { name: "Earth", emoji: "🌍", distance: "149.6M km", diameter: "12,756 km", moons: 1, dayLength: "24 hours", yearLength: "365.25 days", temp: "15°C avg", fact: "Only known planet with life. 71% covered in water." },
  mars: { name: "Mars", emoji: "♂️", distance: "227.9M km", diameter: "6,792 km", moons: 2, dayLength: "24.6 hours", yearLength: "687 Earth days", temp: "-65°C avg", fact: "Known as the Red Planet. Has the tallest volcano in the solar system (Olympus Mons)." },
  jupiter: { name: "Jupiter", emoji: "♃", distance: "778.5M km", diameter: "142,984 km", moons: 95, dayLength: "9.9 hours", yearLength: "11.9 Earth years", temp: "-110°C avg", fact: "Largest planet. The Great Red Spot is a storm larger than Earth." },
  saturn: { name: "Saturn", emoji: "♄", distance: "1.43B km", diameter: "120,536 km", moons: 146, dayLength: "10.7 hours", yearLength: "29.4 Earth years", temp: "-140°C avg", fact: "Known for its ring system made of ice and rock." },
  uranus: { name: "Uranus", emoji: "♅", distance: "2.87B km", diameter: "51,118 km", moons: 27, dayLength: "17.2 hours", yearLength: "84 Earth years", temp: "-195°C avg", fact: "Rotates on its side. An ice giant with a blue-green color." },
  neptune: { name: "Neptune", emoji: "♆", distance: "4.50B km", diameter: "49,528 km", moons: 16, dayLength: "16.1 hours", yearLength: "164.8 Earth years", temp: "-200°C avg", fact: "Windiest planet with speeds up to 2,100 km/h." },
};

const wordOfTheDayPool = [
  { word: "Ephemeral", part: "adjective", meaning: "Lasting for a very short time", example: "The ephemeral beauty of cherry blossoms.", tip: "Use it for moments, trends, or feelings that do not last." },
  { word: "Serendipity", part: "noun", meaning: "Finding pleasant things by chance", example: "Finding that book was pure serendipity.", tip: "Great for happy accidents." },
  { word: "Resilient", part: "adjective", meaning: "Able to recover quickly from difficulties", example: "She stayed resilient under pressure.", tip: "Useful for people, systems, or teams." },
  { word: "Ubiquitous", part: "adjective", meaning: "Present everywhere", example: "Smartphones are ubiquitous.", tip: "Use for very common things." },
  { word: "Pragmatic", part: "adjective", meaning: "Practical rather than idealistic", example: "A pragmatic solution.", tip: "Good for decision-making contexts." },
];

async function grammarWithFreeAi(input) {
  const prompt =
    "Check the following text for grammar and clarity. " +
    "Return:\n1) Corrected text\n2) Brief bullet list of issues (if any)\n\nText:\n" +
    input;
  const data = await fetchJson("https://text.pollinations.ai/openai", {
    timeout: 30000,
    headers: { "Content-Type": "application/json" },
    method: "post",
    data: { model: "openai", messages: [{ role: "user", content: prompt }] },
  }).catch(() => null);
  return data?.choices?.[0]?.message?.content || "";
}

const commands = [
  {
    name: ["element", "periodic"],
    category: "education",
    desc: "Periodic table lookup (name/symbol/number)",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}element <name|symbol|number>\nExample: ${config.PREFIX}element oxygen`);
      m.react("⚛️");
      try {
        const q = String(text).trim();
        const data = await fetchJson(`https://api.popcat.xyz/periodic-table?element=${encodeURIComponent(q)}`).catch(() => null);
        if (!data?.name) return m.reply("❌ Element not found. Try name, symbol, or atomic number.");
        let msg = `⚛️ *${data.name}*\n\n`;
        msg += `🔤 Symbol: ${data.symbol}\n`;
        msg += `🔢 Atomic Number: ${data.atomic_number}\n`;
        msg += `⚖️ Atomic Mass: ${data.atomic_mass}\n`;
        if (data.phase) msg += `📊 Phase: ${data.phase}\n`;
        if (data.summary) msg += `\n📝 ${String(data.summary).substring(0, 900)}`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The element API is currently overloaded.");
      }
    },
  },
  {
    name: ["planet", "solar"],
    category: "education",
    desc: "Get planet/space info",
    handler: async (sock, m, { text }) => {
      if (!text) {
        return m.reply(
          `🌌 *Solar System*\n\nAvailable planets:\n` +
          `- Mercury\n- Venus\n- Earth\n- Mars\n- Jupiter\n- Saturn\n- Uranus\n- Neptune\n\n` +
          `Usage: ${config.PREFIX}planet <name>`
        );
      }
      const key = String(text).toLowerCase().trim();
      const planet = planets[key];
      if (!planet) return m.reply("❌ Planet not found. Try: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune");
      let msg = `${planet.emoji} *${planet.name}*\n\n`;
      msg += `📏 Distance from Sun: ${planet.distance}\n`;
      msg += `🔵 Diameter: ${planet.diameter}\n`;
      msg += `🌙 Moons: ${planet.moons}\n`;
      msg += `🌅 Day Length: ${planet.dayLength}\n`;
      msg += `📅 Year Length: ${planet.yearLength}\n`;
      msg += `🌡️ Temperature: ${planet.temp}\n`;
      msg += `\n💡 *Fun Fact:* ${planet.fact}`;
      await m.reply(msg);
    },
  },
  {
    name: ["spell", "spellcheck", "sp"],
    category: "education",
    desc: "Check spelling of a word",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}spell <word>`);
      m.react("📝");
      try {
        const data = await fetchJson(`https://api.datamuse.com/sug?s=${encodeURIComponent(text)}`).catch(() => []);
        if (!data?.length) return m.reply(`✅ "${text}" looks correct (or no suggestions found).`);
        const exact = data.find((d) => d.word?.toLowerCase() === String(text).toLowerCase());
        if (exact) return m.reply(`✅ *"${text}"* is spelled correctly!`);
        let msg = `📝 *Spell Check: "${text}"*\n\nDid you mean:\n`;
        data.slice(0, 8).forEach((d, i) => { msg += `${i + 1}. ${d.word}\n`; });
        await m.reply(msg.trim());
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Spell Check API is currently overloaded.");
      }
    },
  },
  {
    name: ["synonym", "synonyms", "syn"],
    category: "education",
    desc: "Find synonyms of a word",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}synonym <word>`);
      m.react("📖");
      try {
        const data = await fetchJson(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(text)}&max=15`).catch(() => []);
        if (!data?.length) return m.reply(`❌ No synonyms found for "${text}".`);
        let msg = `📖 *Synonyms for "${text}"*\n\n`;
        data.slice(0, 15).forEach((d, i) => { msg += `${i + 1}. ${d.word}\n`; });
        await m.reply(msg.trim());
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Synonym API is currently overloaded.");
      }
    },
  },
  {
    name: ["antonym", "antonyms", "opposite", "ant"],
    category: "education",
    desc: "Find antonyms of a word",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}antonym <word>`);
      m.react("📖");
      try {
        const data = await fetchJson(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(text)}&max=15`).catch(() => []);
        if (!data?.length) return m.reply(`❌ No antonyms found for "${text}".`);
        let msg = `📖 *Antonyms for "${text}"*\n\n`;
        data.slice(0, 15).forEach((d, i) => { msg += `${i + 1}. ${d.word}\n`; });
        await m.reply(msg.trim());
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Antonym API is currently overloaded.");
      }
    },
  },
  {
    name: ["rhyme", "rhymes", "rhy"],
    category: "education",
    desc: "Find words that rhyme",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}rhyme <word>`);
      m.react("🎵");
      try {
        const data = await fetchJson(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(text)}&max=20`).catch(() => []);
        if (!data?.length) return m.reply(`❌ No rhymes found for "${text}".`);
        let msg = `🎵 *Rhymes with "${text}"*\n\n`;
        data.slice(0, 20).forEach((d, i) => { msg += `${i + 1}. ${d.word}\n`; });
        await m.reply(msg.trim());
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Rhyme API is currently overloaded.");
      }
    },
  },
  {
    name: ["grammar", "gram"],
    category: "education",
    desc: "Check grammar with AI (no key)",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply(`Usage: ${config.PREFIX}grammar <text> or reply to a message`);
      m.react("📝");
      try {
        const answer = await grammarWithFreeAi(input);
        if (!answer) return m.reply("⏳ Grammar check is busy. Try again later.");
        await m.reply(`📝 *Grammar Check*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Grammar API is currently overloaded.");
      }
    },
  },
  {
    name: ["wordoftheday", "wotd"],
    category: "education",
    desc: "Get word of the day",
    handler: async (sock, m) => {
      m.react("📖");
      const w = pickNonRepeating(wordOfTheDayPool, `${m.chat}:wotd`, { maxHistory: 4 });
      await m.reply(
        `📖 *Word of the Day*\n\n` +
        `📌 *${w.word}* (${w.part})\n\n` +
        `📝 Meaning: ${w.meaning}\n\n` +
        `💬 Example: _"${w.example}"_\n\n` +
        `🎯 Tip: ${w.tip}\n\n` +
        `📅 ${new Date().toLocaleDateString()}`
      );
      m.react("✅");
    },
  },
];

module.exports = { commands };
