const config = require("../config");
const { postJson, fetchJson } = require("../lib/helpers");
const { pollinate: _pollinate } = require("./ai");

// Wrap the robust AI chain so creative handlers can still check `if (!answer)`
async function pollinate(prompt) {
  try { return await _pollinate(prompt, "openai"); } catch { return null; }
}

const PICKUP_LINES = [
  "Are you a magician? Because whenever I look at you, everyone else disappears.",
  "Do you have a map? I keep getting lost in your eyes.",
  "Is your name Google? Because you have everything I've been searching for.",
  "Are you a parking ticket? Because you've got 'fine' written all over you.",
  "Do you believe in love at first sight, or should I walk by again?",
  "Are you a bank loan? Because you have my interest.",
  "If you were a vegetable, you'd be a cute-cumber.",
  "Do you have a sunburn, or are you always this hot?",
  "Are you a time traveler? Because I see you in my future.",
  "Is your name WiFi? Because I'm feeling a connection.",
  "You must be tired because you've been running through my mind all day.",
  "Are you a star? Because your beauty lights up the room.",
  "I must be a snowflake, because I've fallen for you.",
  "Do you have a Band-Aid? I just scraped my knee falling for you.",
  "Are you an interior decorator? Because when I saw you, the entire room became beautiful.",
];

const COMPLIMENTS = [
  "Your smile could light up the entire world.",
  "You have such a kind and generous soul.",
  "You make everyone around you feel seen and valued.",
  "Your intelligence is truly impressive.",
  "You have the most genuine laugh.",
  "You radiate positivity wherever you go.",
  "You are one of the most thoughtful people I've ever met.",
  "Your creativity is absolutely inspiring.",
  "The world is genuinely a better place with you in it.",
  "You handle challenges with so much grace and strength.",
  "You have a remarkable ability to make people feel at ease.",
  "Your passion for what you do is contagious.",
  "You are proof that good things do happen.",
  "You have the best energy — it's magnetic.",
  "Anyone who has you in their life is truly lucky.",
];

const RIZZ_LINES = [
  "I was reading Hebrews 11:1 — 'Faith is being sure of what we hope for' — and I had faith I'd find someone like you.",
  "You must be the square root of -1, because you can't be real.",
  "I'd say God bless you, but it looks like He already did.",
  "Are you a campfire? Because you're hot and I want s'more.",
  "I'm not a photographer, but I can picture us together.",
  "If looks could kill, you'd definitely be a weapon of mass destruction.",
  "Are you a spell? Because you've got me completely enchanted.",
  "You must be made of copper and tellurium, because you're CuTe.",
  "I'm not an astronomer, but I can see Uranus from here — wait, I meant those stars in your eyes.",
  "Do you have a mirror in your pocket? Because I can see myself in your pants — wait, I meant see my reflection in your smile.",
  "You're like a fine wine — the more I see you, the better you get.",
  "Are you a shooting star? Because every time I see you, I make a wish.",
];

const ROASTS = [
  "You're so slow, even your internet connection feels sorry for you.",
  "You're like a cloud — when you disappear, it's a beautiful day.",
  "I'd agree with you, but then we'd both be wrong.",
  "You're not stupid, you just have bad luck thinking.",
  "If brains were taxed, you'd get a refund.",
  "You're the reason they put instructions on shampoo bottles.",
  "You're like a software update — whenever I see you, I think 'not now'.",
  "If you were any more basic, you'd be a pH level of 14.",
  "I'd call you a clown, but that would be an insult to clowns.",
  "You're proof that even evolution makes mistakes sometimes.",
  "You have the energy of a Monday morning.",
  "You're like a broken pencil — completely pointless.",
];

const DEV_JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "A SQL query walks into a bar, walks up to two tables and asks... 'Can I join you?'",
  "How many programmers does it take to change a light bulb? None — that's a hardware problem.",
  "Why do Java developers wear glasses? Because they don't C#.",
  "There are 10 types of people in the world: those who understand binary and those who don't.",
  "A programmer's partner says 'Go to the store and get a gallon of milk, and if they have eggs, get a dozen.' The programmer returns with 12 gallons of milk.",
  "Why was the JavaScript developer sad? Because they didn't know how to 'null' their feelings.",
  "Debugging is like being the detective in a crime movie where you're also the murderer.",
  "['hip', 'hip'] — hip hip array!",
  "Why do programmers hate nature? Too many bugs.",
  "!false — it's funny because it's true.",
  "My code never has bugs — it just develops random features.",
  "Error 404: Sleep not found.",
  "I asked the code reviewer if my commit was good. He said: 'git blame'.",
];

const GIT_COMMITS = [
  "fix: finally fixed the bug I introduced yesterday",
  "feat: added feature that will definitely not break anything",
  "chore: removed console.log I left in production",
  "fix: it works on my machine",
  "refactor: moved some stuff around",
  "feat: implemented dark magic to make it work",
  "fix: bandaid solution until we figure out the real issue",
  "chore: updated dependencies and prayed nothing breaks",
  "feat: added TODO for future me to deal with",
  "fix: reverted the reverted revert",
  "docs: updated README to reflect how things actually work now",
  "fix: handled the edge case I swore would never happen",
  "feat: made it work somehow, don't ask how",
  "chore: deleted dead code that nobody touched in 3 years",
  "fix: one more attempt at fixing this cursed function",
];

const commands = [
  {
    name: ["pickup", "pickupline", "flirt"],
    category: "fun",
    desc: "Get a random pickup line",
    handler: async (sock, m, { text }) => {
      const line = PICKUP_LINES[Math.floor(Math.random() * PICKUP_LINES.length)];
      return m.reply(`💘 *Pickup Line*\n\n_${line}_`);
    },
  },
  {
    name: ["compliment", "comp"],
    category: "fun",
    desc: "Get a genuine compliment",
    handler: async (sock, m, { text }) => {
      const line = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
      const target = text ? `@${text.replace(/[@+\s]/g, "")} — ` : "";
      return m.reply(`✨ *Compliment*\n\n${target}_${line}_`);
    },
  },
  {
    name: ["rizz", "rizzline"],
    category: "fun",
    desc: "Get a rizz/smooth line",
    handler: async (sock, m, { text }) => {
      const line = RIZZ_LINES[Math.floor(Math.random() * RIZZ_LINES.length)];
      return m.reply(`😏 *Rizz*\n\n_${line}_`);
    },
  },
  {
    name: ["roast", "diss"],
    category: "fun",
    desc: "Get an AI roast or use a classic one",
    handler: async (sock, m, { text }) => {
      m.react("⏳");
      if (text) {
        const answer = await pollinate(`Generate a funny, clever, non-offensive roast about someone described as: "${text}". Keep it short (1-2 sentences), witty, and playful.`);
        if (answer) {
          m.react("🔥");
          return m.reply(`🔥 *Roast*\n\n_${answer}_`);
        }
      }
      const line = ROASTS[Math.floor(Math.random() * ROASTS.length)];
      m.react("🔥");
      return m.reply(`🔥 *Roast*\n\n_${line}_`);
    },
  },
  {
    name: ["devjoke", "programmingjoke", "codejoke"],
    category: "fun",
    desc: "Get a developer/programming joke",
    handler: async (sock, m, { text }) => {
      const joke = DEV_JOKES[Math.floor(Math.random() * DEV_JOKES.length)];
      return m.reply(`👨‍💻 *Dev Joke*\n\n_${joke}_`);
    },
  },
  {
    name: ["commit", "gitcommit"],
    category: "fun",
    desc: "Generate a random git commit message",
    handler: async (sock, m, { text }) => {
      const msg = GIT_COMMITS[Math.floor(Math.random() * GIT_COMMITS.length)];
      return m.reply(`🔀 *Random Git Commit*\n\n\`${msg}\``);
    },
  },
  {
    name: ["poem", "poetry"],
    category: "fun",
    desc: "Generate a poem on any topic",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("poem <topic>", "poem the ocean at night");
      m.react("⏳");
      const answer = await pollinate(`Write a short, beautiful poem (4-8 lines) about: "${text}". Only output the poem itself with no title, no explanation.`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not generate a poem right now. Try again later."); }
      m.react("✅");
      return m.reply(`📜 *Poem: ${text}*\n\n${answer}`);
    },
  },
  {
    name: ["story", "shortstory"],
    category: "fun",
    desc: "Generate a short story",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("story <prompt>", "story a detective cat in a rainy city");
      m.react("⏳");
      const answer = await pollinate(`Write a short, engaging story (150-200 words) based on this prompt: "${text}". Make it interesting with a beginning, middle, and satisfying ending.`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not generate a story right now. Try again later."); }
      m.react("✅");
      return m.reply(`📖 *Story*\n\n${answer}`);
    },
  },
  {
    name: ["paraphrase", "rephrase"],
    category: "tools",
    desc: "Rewrite text in a different way",
    handler: async (sock, m, { text }) => {
      const input = text || m?.quoted?.body;
      if (!input) return m.usageReply("paraphrase <text> or reply to a message");
      m.react("⏳");
      const answer = await pollinate(`Paraphrase the following text. Keep the same meaning but use different words and sentence structure. Only output the paraphrased version:\n\n"${input}"`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not paraphrase right now. Try again later."); }
      m.react("✅");
      return m.reply(`✏️ *Paraphrased*\n\n${answer}`);
    },
  },
  {
    name: ["explain", "eli5"],
    category: "tools",
    desc: "Explain any concept in simple terms",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("explain <concept>", "explain quantum entanglement");
      m.react("⏳");
      const answer = await pollinate(`Explain "${text}" in simple, easy-to-understand terms as if explaining to a curious 12-year-old. Be clear and use relatable examples. Keep it concise (under 150 words).`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not generate explanation. Try again later."); }
      m.react("✅");
      return m.reply(`💡 *Explanation: ${text}*\n\n${answer}`);
    },
  },
  {
    name: ["caption", "igcaption", "postcaption"],
    category: "tools",
    desc: "Generate a social media caption",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("caption <topic or vibe>", "caption beach sunset selfie");
      m.react("⏳");
      const answer = await pollinate(`Generate 3 different social media captions for a post about: "${text}". Include relevant emojis and make them engaging. Number them 1, 2, 3.`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not generate captions. Try again later."); }
      m.react("✅");
      return m.reply(`📱 *Caption Ideas: ${text}*\n\n${answer}`);
    },
  },
  {
    name: ["hashtag", "hashtags"],
    category: "tools",
    desc: "Generate hashtags for a topic",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("hashtag <topic>", "hashtag travel photography");
      m.react("⏳");
      const answer = await pollinate(`Generate 20 relevant, trending hashtags for: "${text}". Mix popular and niche hashtags. Format them all starting with #, separated by spaces. Only output the hashtags.`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not generate hashtags. Try again later."); }
      m.react("✅");
      return m.reply(`#️⃣ *Hashtags: ${text}*\n\n${answer}`);
    },
  },
  {
    name: ["bio", "socialbio", "profilebio"],
    category: "tools",
    desc: "Generate a social media bio",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("bio <describe yourself or your page>", "bio fitness coach who loves food");
      m.react("⏳");
      const answer = await pollinate(`Generate 3 short, creative social media bios for: "${text}". Each bio should be under 150 characters, catchy and memorable. Number them 1, 2, 3.`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not generate bio. Try again later."); }
      m.react("✅");
      return m.reply(`📝 *Bio Ideas*\n\n${answer}`);
    },
  },
  {
    name: ["username", "usernamegen"],
    category: "tools",
    desc: "Generate username ideas",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("username <keyword or description>", "username dark aesthetic gamer");
      m.react("⏳");
      const answer = await pollinate(`Generate 10 unique, creative username ideas based on: "${text}". Mix different styles (minimal, edgy, cute, aesthetic, professional). One per line.`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not generate usernames. Try again later."); }
      m.react("✅");
      return m.reply(`🎭 *Username Ideas: ${text}*\n\n${answer}`);
    },
  },
  {
    name: ["essay", "essayoutline"],
    category: "tools",
    desc: "Generate an essay outline on any topic",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("essay <topic>", "essay the impact of social media on mental health");
      m.react("⏳");
      const answer = await pollinate(`Create a clear, structured essay outline on: "${text}". Include: Introduction (with thesis), 3 main body paragraph topics with 2-3 supporting points each, and Conclusion. Format it clearly.`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not generate essay outline. Try again later."); }
      m.react("✅");
      return m.reply(`📚 *Essay Outline: ${text}*\n\n${answer}`);
    },
  },
  {
    name: ["motivate", "motivation", "inspire"],
    category: "fun",
    desc: "Get an AI-powered motivational message",
    handler: async (sock, m, { text }) => {
      m.react("⏳");
      const context = text ? ` for someone dealing with: "${text}"` : "";
      const answer = await pollinate(`Generate a short (2-3 sentences), powerful, genuinely motivating message${context}. Make it feel personal and real, not generic. Be uplifting and encouraging.`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not generate message. Try again later."); }
      m.react("💪");
      return m.reply(`💪 *Motivation*\n\n_${answer}_`);
    },
  },
  {
    name: ["statusidea", "wsstatus", "statuses"],
    category: "fun",
    desc: "Generate WhatsApp status ideas",
    handler: async (sock, m, { text }) => {
      m.react("⏳");
      const mood = text ? `with a ${text} vibe` : "";
      const answer = await pollinate(`Generate 5 unique, creative WhatsApp status ideas ${mood}. Mix different styles: funny, deep, motivational, aesthetic, and relatable. Number them 1-5.`);
      if (!answer) { m.react("❌"); return m.reply("❌ Could not generate ideas. Try again later."); }
      m.react("✅");
      return m.reply(`💬 *Status Ideas*\n\n${answer}`);
    },
  },
];

module.exports = { commands };
