const config = require("../config");
const { fetchJson, normalizeAiText, pickNonRepeating } = require("../lib/helpers");
const { pollinate } = require("./ai");

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
  { word: "Tenacious", part: "adjective", meaning: "Holding firm; not giving up easily", example: "A tenacious athlete who trains every day.", tip: "Great for describing determination." },
  { word: "Candid", part: "adjective", meaning: "Truthful and straightforward", example: "She gave a candid opinion.", tip: "Use when someone is being honest and direct." },
  { word: "Eloquent", part: "adjective", meaning: "Fluent and persuasive in speaking or writing", example: "He gave an eloquent speech.", tip: "Use for well-expressed communication." },
  { word: "Conundrum", part: "noun", meaning: "A confusing or difficult problem", example: "It's a real conundrum — no easy answer.", tip: "Use for tricky dilemmas." },
  { word: "Meticulous", part: "adjective", meaning: "Very careful about details", example: "A meticulous researcher.", tip: "Use for someone who pays close attention." },
];

/**
 * Fetch a random fun fact.
 * Primary: uselessfacts.jsph.pl (reliable JSON API)
 * Fallback: api.api-ninjas.com facts endpoint (no key required for basic use)
 */
async function fetchFunFact() {
  try {
    const data = await fetchJson("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en", { timeout: 10000 });
    if (data?.text) return data.text;
  } catch {}
  try {
    const data = await fetchJson("https://api.popcat.xyz/fact", { timeout: 10000 });
    if (data?.fact) return data.fact;
  } catch {}
  return null;
}

/**
 * Fetch periodic table element data.
 * Primary: api.popcat.xyz/periodic-table
 * Fallback: neelpatel05.pythonanywhere.com
 */
async function fetchElement(query) {
  const q = encodeURIComponent(query.trim());
  try {
    const data = await fetchJson(`https://api.popcat.xyz/periodic-table?element=${q}`, { timeout: 10000 });
    if (data?.name) return data;
  } catch {}
  try {
    const isNum = /^\d+$/.test(query.trim());
    const endpoint = isNum
      ? `https://neelpatel05.pythonanywhere.com/element/atomicnumber?elementid=${q}`
      : `https://neelpatel05.pythonanywhere.com/element/name?elementname=${q}`;
    const data = await fetchJson(endpoint, { timeout: 10000 });
    if (data?.ElementName) {
      return {
        name: data.ElementName,
        symbol: data.Symbol,
        atomic_number: data.AtomicNumber,
        atomic_mass: data.AtomicMass,
        phase: data.Phase,
        summary: `${data.ElementName} (${data.Symbol}) — Group ${data.Group}, Period ${data.Period}. Type: ${data.Type || "N/A"}.`,
      };
    }
  } catch {}
  return null;
}

const commands = [
  {
    name: ["element", "periodic"],
    category: "education",
    desc: "Periodic table lookup (name/symbol/number)",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("element <name|symbol|number>", "element oxygen\nelement Au\nelement 8");
      m.react("⚛️");
      try {
        const data = await fetchElement(text);
        if (!data?.name) return m.reply("❌ Element not found. Try a name (oxygen), symbol (Au), or atomic number (8).");
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
        return m.apiErrorReply("Periodic Table");
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
          `- Mercury  - Venus  - Earth  - Mars\n- Jupiter  - Saturn  - Uranus  - Neptune\n\n` +
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
      if (!text) return m.usageReply("spell <word>");
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
        return m.apiErrorReply("Spell Check");
      }
    },
  },
  {
    name: ["synonym", "synonyms", "syn"],
    category: "education",
    desc: "Find synonyms of a word",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("synonym <word>");
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
        return m.apiErrorReply("Synonym");
      }
    },
  },
  {
    name: ["antonym", "antonyms", "opposite", "ant"],
    category: "education",
    desc: "Find antonyms of a word",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("antonym <word>");
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
        return m.apiErrorReply("Antonym");
      }
    },
  },
  {
    name: ["rhyme", "rhymes", "rhy"],
    category: "education",
    desc: "Find words that rhyme",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("rhyme <word>");
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
        return m.apiErrorReply("Rhyme");
      }
    },
  },
  {
    name: ["grammar", "gram", "grammarcheck"],
    category: "education",
    desc: "Check and correct grammar with AI",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.usageReply("grammar <text> or reply to a message", "grammar She go to school yesterday");
      m.react("📝");
      try {
        const prompt =
          "You are a grammar expert. Check the following text for grammar, spelling, and clarity errors.\n" +
          "Return ONLY:\n" +
          "1. ✅ Corrected version of the text\n" +
          "2. 📋 Short bullet list of corrections made (if any), or 'No errors found' if the text is correct.\n\n" +
          "Text to check:\n" + input;

        const answer = await pollinate(prompt, "openai");
        if (!answer || answer.length < 5) {
          m.react("❌");
          return m.apiErrorReply("Grammar Check");
        }
        await m.reply(`📝 *Grammar Check*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Grammar Check");
      }
    },
  },
  {
    name: ["explain", "explainit", "whatis"],
    category: "education",
    desc: "AI explains any topic in simple terms",
    handler: async (sock, m, { text }) => {
      const topic = text || m.quoted?.body || "";
      if (!topic) return m.usageReply("explain <topic or concept>", "explain black holes\nexplain how vaccines work");
      m.react("🧠");
      try {
        const prompt =
          "Explain the following topic in simple, easy-to-understand terms. " +
          "Use short paragraphs and plain language suitable for a general audience. " +
          "Keep it under 250 words. Do not use markdown headers.\n\nTopic: " + topic;

        const answer = await pollinate(prompt, "openai");
        if (!answer || answer.length < 10) {
          m.react("❌");
          return m.apiErrorReply("Explain");
        }
        await m.reply(
          `🧠 *${topic.trim()}*\n\n` +
          normalizeAiText(answer, { keepLightFormatting: true }) +
          `\n\n────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
        );
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Explain");
      }
    },
  },
  {
    name: ["funfact", "fact", "randomfact"],
    category: "education",
    desc: "Get a random interesting fact",
    handler: async (sock, m) => {
      m.react("💡");
      try {
        const fact = await fetchFunFact();
        if (!fact) {
          m.react("❌");
          return m.apiErrorReply("Fun Fact");
        }
        await m.reply(
          `💡 *Random Fact*\n\n${fact}\n\n` +
          `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
        );
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Fun Fact");
      }
    },
  },
  {
    name: ["wordoftheday", "wotd"],
    category: "education",
    desc: "Get word of the day",
    handler: async (sock, m) => {
      m.react("📖");
      const w = pickNonRepeating(wordOfTheDayPool, `${m.chat}:wotd`, { maxHistory: 8 });
      await m.reply(
        `📖 *Word of the Day*\n\n` +
        `📌 *${w.word}* (${w.part})\n\n` +
        `📝 Meaning: ${w.meaning}\n\n` +
        `💬 Example: _"${w.example}"_\n\n` +
        `🎯 Tip: ${w.tip}\n\n` +
        `📅 ${new Date().toLocaleDateString()}\n` +
        `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
      );
      m.react("✅");
    },
  },
];

module.exports = { commands };
