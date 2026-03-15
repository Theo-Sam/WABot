const config = require("../config");
const { fetchJson, normalizeAiText } = require("../lib/helpers");

const elements = {
  "hydrogen": { symbol: "H", number: 1, mass: "1.008", group: "Nonmetal", period: 1 },
  "helium": { symbol: "He", number: 2, mass: "4.003", group: "Noble Gas", period: 1 },
  "lithium": { symbol: "Li", number: 3, mass: "6.941", group: "Alkali Metal", period: 2 },
  "beryllium": { symbol: "Be", number: 4, mass: "9.012", group: "Alkaline Earth", period: 2 },
  "boron": { symbol: "B", number: 5, mass: "10.81", group: "Metalloid", period: 2 },
  "carbon": { symbol: "C", number: 6, mass: "12.01", group: "Nonmetal", period: 2 },
  "nitrogen": { symbol: "N", number: 7, mass: "14.01", group: "Nonmetal", period: 2 },
  "oxygen": { symbol: "O", number: 8, mass: "16.00", group: "Nonmetal", period: 2 },
  "fluorine": { symbol: "F", number: 9, mass: "19.00", group: "Halogen", period: 2 },
  "neon": { symbol: "Ne", number: 10, mass: "20.18", group: "Noble Gas", period: 2 },
  "sodium": { symbol: "Na", number: 11, mass: "22.99", group: "Alkali Metal", period: 3 },
  "magnesium": { symbol: "Mg", number: 12, mass: "24.31", group: "Alkaline Earth", period: 3 },
  "aluminum": { symbol: "Al", number: 13, mass: "26.98", group: "Post-Transition Metal", period: 3 },
  "silicon": { symbol: "Si", number: 14, mass: "28.09", group: "Metalloid", period: 3 },
  "phosphorus": { symbol: "P", number: 15, mass: "30.97", group: "Nonmetal", period: 3 },
  "sulfur": { symbol: "S", number: 16, mass: "32.07", group: "Nonmetal", period: 3 },
  "chlorine": { symbol: "Cl", number: 17, mass: "35.45", group: "Halogen", period: 3 },
  "argon": { symbol: "Ar", number: 18, mass: "39.95", group: "Noble Gas", period: 3 },
  "potassium": { symbol: "K", number: 19, mass: "39.10", group: "Alkali Metal", period: 4 },
  "calcium": { symbol: "Ca", number: 20, mass: "40.08", group: "Alkaline Earth", period: 4 },
  "iron": { symbol: "Fe", number: 26, mass: "55.85", group: "Transition Metal", period: 4 },
  "copper": { symbol: "Cu", number: 29, mass: "63.55", group: "Transition Metal", period: 4 },
  "zinc": { symbol: "Zn", number: 30, mass: "65.38", group: "Transition Metal", period: 4 },
  "silver": { symbol: "Ag", number: 47, mass: "107.87", group: "Transition Metal", period: 5 },
  "tin": { symbol: "Sn", number: 50, mass: "118.71", group: "Post-Transition Metal", period: 5 },
  "gold": { symbol: "Au", number: 79, mass: "196.97", group: "Transition Metal", period: 6 },
  "mercury": { symbol: "Hg", number: 80, mass: "200.59", group: "Transition Metal", period: 6 },
  "lead": { symbol: "Pb", number: 82, mass: "207.2", group: "Post-Transition Metal", period: 6 },
  "uranium": { symbol: "U", number: 92, mass: "238.03", group: "Actinide", period: 7 },
  "platinum": { symbol: "Pt", number: 78, mass: "195.08", group: "Transition Metal", period: 6 },
  "titanium": { symbol: "Ti", number: 22, mass: "47.87", group: "Transition Metal", period: 4 },
  "nickel": { symbol: "Ni", number: 28, mass: "58.69", group: "Transition Metal", period: 4 },
};

const planets = {
  "mercury_planet": { name: "Mercury", emoji: "☿️", distance: "57.9M km", diameter: "4,879 km", moons: 0, dayLength: "59 Earth days", yearLength: "88 Earth days", temp: "-180°C to 430°C", fact: "Smallest planet in our solar system and closest to the Sun." },
  "venus": { name: "Venus", emoji: "♀️", distance: "108.2M km", diameter: "12,104 km", moons: 0, dayLength: "243 Earth days", yearLength: "225 Earth days", temp: "465°C avg", fact: "Hottest planet. Rotates backward compared to other planets." },
  "earth": { name: "Earth", emoji: "🌍", distance: "149.6M km", diameter: "12,756 km", moons: 1, dayLength: "24 hours", yearLength: "365.25 days", temp: "15°C avg", fact: "Only known planet with life. 71% covered in water." },
  "mars": { name: "Mars", emoji: "♂️", distance: "227.9M km", diameter: "6,792 km", moons: 2, dayLength: "24.6 hours", yearLength: "687 Earth days", temp: "-65°C avg", fact: "Known as the Red Planet. Has the tallest volcano in the solar system (Olympus Mons)." },
  "jupiter": { name: "Jupiter", emoji: "♃", distance: "778.5M km", diameter: "142,984 km", moons: 95, dayLength: "9.9 hours", yearLength: "11.9 Earth years", temp: "-110°C avg", fact: "Largest planet. The Great Red Spot is a storm larger than Earth." },
  "saturn": { name: "Saturn", emoji: "♄", distance: "1.43B km", diameter: "120,536 km", moons: 146, dayLength: "10.7 hours", yearLength: "29.4 Earth years", temp: "-140°C avg", fact: "Known for its beautiful ring system made of ice and rock." },
  "uranus": { name: "Uranus", emoji: "♅", distance: "2.87B km", diameter: "51,118 km", moons: 27, dayLength: "17.2 hours", yearLength: "84 Earth years", temp: "-195°C avg", fact: "Rotates on its side. An ice giant with a blue-green color." },
  "neptune": { name: "Neptune", emoji: "♆", distance: "4.50B km", diameter: "49,528 km", moons: 16, dayLength: "16.1 hours", yearLength: "164.8 Earth years", temp: "-200°C avg", fact: "Windiest planet with speeds up to 2,100 km/h." },
};

const commands = [
  {
    name: ["element", "periodic", "atom"],
    category: "education",
    desc: "Look up periodic table element",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}element <element name or symbol>\nExample: ${config.PREFIX}element gold`);
      const query = text.toLowerCase().trim();
      let el = elements[query];
      if (!el) {
        const bySymbol = Object.entries(elements).find(([, v]) => v.symbol.toLowerCase() === query);
        if (bySymbol) el = bySymbol[1];
        const byNum = Object.entries(elements).find(([, v]) => v.number === parseInt(query));
        if (byNum) el = byNum[1];
      }
      if (!el) {
        try {
          const data = await fetchJson(`https://api.popcat.xyz/periodic-table?element=${encodeURIComponent(text)}`).catch(() => null);
          if (data?.name) {
            let msg = `⚛️ *${data.name}*\n\n`;
            msg += `🔤 Symbol: ${data.symbol}\n`;
            msg += `🔢 Number: ${data.atomic_number}\n`;
            msg += `⚖️ Mass: ${data.atomic_mass}\n`;
            if (data.phase) msg += `📊 Phase: ${data.phase}\n`;
            if (data.discovered_by) msg += `🔬 Discovered by: ${data.discovered_by}\n`;
            if (data.summary) msg += `\n📝 ${data.summary.substring(0, 400)}`;
            return m.reply(msg);
          }
        } catch { }
        return m.reply("❌ Element not found. Try name, symbol, or atomic number.");
      }
      const name = Object.keys(elements).find((k) => elements[k] === el) || "Unknown";
      let msg = `⚛️ *${name.charAt(0).toUpperCase() + name.slice(1)}*\n\n`;
      msg += `🔤 Symbol: ${el.symbol}\n`;
      msg += `🔢 Atomic Number: ${el.number}\n`;
      msg += `⚖️ Atomic Mass: ${el.mass}\n`;
      msg += `📊 Group: ${el.group}\n`;
      msg += `📌 Period: ${el.period}`;
      await m.reply(msg);
    },
  },
  {
    name: ["planet", "space", "solar"],
    category: "education",
    desc: "Get planet/space info",
    handler: async (sock, m, { text }) => {
      if (!text) {
        let msg = `🌌 *Solar System*\n\nAvailable planets:\n`;
        msg += `☿️ Mercury\n♀️ Venus\n🌍 Earth\n♂️ Mars\n♃ Jupiter\n♄ Saturn\n♅ Uranus\n♆ Neptune\n\n`;
        msg += `Usage: ${config.PREFIX}planet <name>`;
        return m.reply(msg);
      }
      const query = text.toLowerCase().trim();
      let key = query === "mercury" ? "mercury_planet" : query;
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
        const data = await fetchJson(`https://api.datamuse.com/sug?s=${encodeURIComponent(text)}`);
        if (!data?.length) return m.reply(`✅ "${text}" appears to be spelled correctly (or no suggestions found).`);
        const exact = data.find((d) => d.word.toLowerCase() === text.toLowerCase());
        if (exact) {
          return m.reply(`✅ *"${text}"* is spelled correctly!`);
        }
        let msg = `📝 *Spell Check: "${text}"*\n\n`;
        msg += `Did you mean:\n`;
        data.slice(0, 8).forEach((d, i) => { msg += `${i + 1}. ${d.word}\n`; });
        await m.reply(msg);
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
        const data = await fetchJson(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(text)}&max=15`);
        if (!data?.length) return m.reply(`❌ No synonyms found for "${text}".`);
        let msg = `📖 *Synonyms for "${text}"*\n\n`;
        data.forEach((d, i) => { msg += `${i + 1}. ${d.word}\n`; });
        await m.reply(msg);
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
        const data = await fetchJson(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(text)}&max=15`);
        if (!data?.length) return m.reply(`❌ No antonyms found for "${text}".`);
        let msg = `📖 *Antonyms for "${text}"*\n\n`;
        data.forEach((d, i) => { msg += `${i + 1}. ${d.word}\n`; });
        await m.reply(msg);
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
        const data = await fetchJson(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(text)}&max=20`);
        if (!data?.length) return m.reply(`❌ No rhymes found for "${text}".`);
        let msg = `🎵 *Words that rhyme with "${text}"*\n\n`;
        data.forEach((d, i) => { msg += `${i + 1}. ${d.word}\n`; });
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Rhyme Match API is currently overloaded.");
      }
    },
  },
  {
    name: ["grammar", "gram"],
    category: "education",
    desc: "Check grammar with AI",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply(`Usage: ${config.PREFIX}grammar <text> or reply to a message`);
      m.react("📝");
      try {
        const prompt = `Check the following text for grammar errors. If there are errors, provide the corrected version and explain the mistakes. If it's correct, say so. Text: "${input}"`;
        const axios = require("axios");
        const res = await axios.post("https://text.pollinations.ai/openai", {
          model: "openai",
          messages: [{ role: "user", content: prompt }],
        }, { timeout: 30000, headers: { "Content-Type": "application/json" } });
        const answer = res.data?.choices?.[0]?.message?.content || "";
        if (!answer) return m.reply("❌ Grammar check unavailable.");
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
      const words = [
        { word: "Ephemeral", meaning: "Lasting for a very short time", example: "The ephemeral beauty of cherry blossoms." },
        { word: "Serendipity", meaning: "The occurrence of finding pleasant things by chance", example: "Finding that book was pure serendipity." },
        { word: "Eloquent", meaning: "Fluent or persuasive in speaking or writing", example: "She gave an eloquent speech at the ceremony." },
        { word: "Resilient", meaning: "Able to recover quickly from difficulties", example: "Children are remarkably resilient creatures." },
        { word: "Ubiquitous", meaning: "Present, appearing, or found everywhere", example: "Smartphones have become ubiquitous in modern life." },
        { word: "Pragmatic", meaning: "Dealing with things practically rather than theoretically", example: "A pragmatic approach to solving problems." },
        { word: "Benevolent", meaning: "Well-meaning and kindly", example: "A benevolent ruler who cared for the people." },
        { word: "Ethereal", meaning: "Extremely delicate and light in a way that seems heavenly", example: "The ethereal glow of the moonlight." },
        { word: "Cacophony", meaning: "A harsh, discordant mixture of sounds", example: "A cacophony of car horns filled the street." },
        { word: "Perspicacious", meaning: "Having a ready insight into things; shrewd", example: "A perspicacious observer of human nature." },
        { word: "Mellifluous", meaning: "Sweet-sounding; pleasant to hear", example: "Her mellifluous voice captivated the audience." },
        { word: "Quintessential", meaning: "Representing the most perfect example of something", example: "The quintessential English garden." },
        { word: "Surreptitious", meaning: "Kept secret, especially because improper", example: "A surreptitious glance across the room." },
        { word: "Indefatigable", meaning: "Persisting tirelessly", example: "An indefatigable campaigner for human rights." },
        { word: "Magnanimous", meaning: "Very generous or forgiving", example: "She was magnanimous in victory." },
      ];
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
      const w = words[dayOfYear % words.length];
      await m.reply(`📖 *Word of the Day*\n\n📌 *${w.word}*\n\n📝 Meaning: ${w.meaning}\n\n💬 Example: _"${w.example}"_\n\n📅 _${new Date().toLocaleDateString()}_`);
    },
  },
];

module.exports = { commands };
