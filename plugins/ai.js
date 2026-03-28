const config = require("../config");
const { fetchJson, normalizeAiText } = require("../lib/helpers");
const axios = require("axios");
const sharp = require("sharp");

const AI_PERSONAS = {
  openai: null,
  gemini: "You are Gemini, a helpful AI assistant created by Google. Respond naturally and helpfully.",
  deepseek: "You are DeepSeek, an AI assistant known for deep reasoning and analysis. Respond thoughtfully.",
  llama: "You are Llama, an open-source AI assistant by Meta. Respond helpfully and clearly.",
  mistral: "You are Mistral, a fast and efficient AI assistant. Respond concisely and helpfully.",
  claude: "You are Claude, an AI assistant known for being helpful, harmless, and honest. Respond thoughtfully.",
  copilot: "You are Copilot, a helpful AI coding and productivity assistant. Respond helpfully.",
  bard: "You are Bard, a creative and informative AI assistant by Google. Respond helpfully.",
  blackbox: "You are Blackbox AI, specialized in code and technical questions. Respond helpfully.",
};

async function pollinate(prompt, persona = "openai") {
  const messages = [];
  const systemMsg = AI_PERSONAS[persona];
  if (systemMsg) messages.push({ role: "system", content: systemMsg });
  messages.push({
    role: "system",
    content: [
      "You are a WhatsApp chat assistant. Follow these rules strictly:",
      "1. Keep answers SHORT and direct — 1 to 4 sentences for simple questions. Never write essays.",
      "2. NEVER use numbered paragraphs, bullet points, or headings like 'Paragraph 1' or '1.' or '•'.",
      "3. NEVER mention the user's name, phone number, or address them as 'user'.",
      "4. NEVER start with 'Certainly!', 'Sure!', 'Of course!', 'Great question!' or similar filler phrases.",
      "5. NEVER use markdown formatting like **bold**, *italic*, or backticks.",
      "6. Write like a knowledgeable friend texting — casual, direct, conversational.",
      "7. If asked a factual question, give the fact. Don't explain what you're about to do.",
    ].join(" "),
  });
  messages.push({ role: "user", content: prompt });

  // Build a concise plain-text prompt for small Ollama models (fallback only)
  const systemParts = messages.filter(m => m.role === "system").map(m => m.content).join(" ");
  const userText    = messages.filter(m => m.role === "user").map(m => m.content).join("\n");
  const ollamaPrompt = `${systemParts}\n\nQuestion: ${userText}\nAnswer:`;
  const ollamaStop   = ["\nQuestion:", "\nUser:", "\n[SYSTEM]"];

  // Strip ad blocks injected by api.airforce at the end of responses
  function stripAds(text) {
    if (!text) return text;
    return text
      .replace(/\n*Need proxies cheaper[\s\S]*$/i, "")
      .replace(/\n*Ratelimit Exceeded[\s\S]*$/i, "")
      .replace(/\n*Please join:[\s\S]*$/i, "")
      .trim();
  }

  // Detect clearly bad Ollama responses (small model hallucinations)
  function isBadOllamaResponse(answer) {
    if (!answer || answer.length < 5) return true;
    if (answer.includes("Question:") || answer.includes("Answer:")) return true;
    if (answer.startsWith(userText.slice(0, 20))) return true;
    // Catch "Dear Gemini/Claude/..." letter-format hallucinations
    if (/^Dear\s+(Gemini|Claude|Llama|Mistral|GPT|AI|Copilot|Bard)/i.test(answer)) return true;
    if (/^Subject:/i.test(answer)) return true;
    return false;
  }

  // ── Tier 0: pollinations.ai — very fast, no key needed ───────────────────────
  try {
    const res = await axios.post("https://text.pollinations.ai/openai", {
      model: "openai",
      messages,
      max_tokens: 300,
      temperature: 0.7,
    }, {
      timeout: 15000,
      headers: { "Content-Type": "application/json" },
      validateStatus: s => s < 500,
    });
    const raw = res.data?.choices?.[0]?.message?.content?.trim() || res.data?.trim?.();
    if (raw && raw.length >= 5) {
      return normalizeAiText(raw, { keepLightFormatting: true });
    }
  } catch {}

  // ── Tier 1: api.airforce — gemini-2.0-flash (best free quality, no key) ──────
  try {
    const res = await axios.post("https://api.airforce/v1/chat/completions", {
      model: "gemini-2.0-flash",
      messages,
      max_tokens: 300,
    }, {
      timeout: 20000,
      headers: { "Content-Type": "application/json" },
      validateStatus: s => s < 500,
    });
    const raw = res.data?.choices?.[0]?.message?.content?.trim();
    const answer = stripAds(raw);
    if (answer && answer.length >= 5 && !/ratelimit exceeded/i.test(answer)) {
      return normalizeAiText(answer, { keepLightFormatting: true });
    }
  } catch {}

  // ── Tier 2: api.airforce — other models as rate-limit fallback ────────────────
  const airforceFallbacks = ["llama-4-scout", "gpt-4o-mini", "deepseek-v3-0324"];
  for (const model of airforceFallbacks) {
    try {
      await new Promise(r => setTimeout(r, 500));
      const res = await axios.post("https://api.airforce/v1/chat/completions", {
        model,
        messages,
        max_tokens: 300,
      }, {
        timeout: 20000,
        headers: { "Content-Type": "application/json" },
        validateStatus: s => s < 500,
      });
      const raw = res.data?.choices?.[0]?.message?.content?.trim();
      const answer = stripAds(raw);
      if (answer && answer.length >= 5 && !/ratelimit exceeded/i.test(answer)) {
        return normalizeAiText(answer, { keepLightFormatting: true });
      }
    } catch {}
  }

  // ── Tier 3: Community-hosted public Ollama nodes (better models first) ────────
  const communityNodes = [
    { base: "http://210.212.210.104:84", model: "gemma3:1b" },
    { base: "http://119.3.179.233:80",   model: "qwen:7b" },
    { base: "http://111.230.71.93:80",   model: "tinyllama:latest" },
  ];
  for (const node of communityNodes) {
    try {
      const res = await axios.post(`${node.base}/api/generate`, {
        model: node.model,
        prompt: ollamaPrompt,
        stream: false,
        options: { stop: ollamaStop, num_predict: 300 },
      }, { timeout: 20000 });
      const answer = res.data?.response?.trim();
      if (!isBadOllamaResponse(answer)) return normalizeAiText(answer, { keepLightFormatting: true });
    } catch {}
  }

  // ── Tier 4: mlvoca.com tinyllama (last resort) ────────────────────────────────
  try {
    const res = await axios.post("https://mlvoca.com/api/generate", {
      model: "tinyllama",
      prompt: ollamaPrompt,
      stream: false,
      options: { stop: ollamaStop, num_predict: 300 },
    }, { timeout: 30000 });
    const answer = res.data?.response?.trim();
    if (!isBadOllamaResponse(answer)) return normalizeAiText(answer, { keepLightFormatting: true });
  } catch {}

  throw new Error("All free AI providers failed or returned empty responses.");
}

async function fetchGeneratedImage(prompt) {
  const { fetchBuffer } = require("../lib/helpers");

  // 1. Pollinations — fast, try multiple models with short timeout
  const safePrompt = encodeURIComponent(String(prompt || "").slice(0, 400));
  const seed = Math.floor(Math.random() * 1000000);
  const pollinationsModels = ["sana", "zimage", "turbo", ""];
  for (const model of pollinationsModels) {
    const modelParam = model ? `&model=${model}` : "";
    const url = `https://image.pollinations.ai/prompt/${safePrompt}?width=1024&height=1024&nologo=true&seed=${seed}${modelParam}`;
    try {
      const buf = await fetchBuffer(url, { timeout: 20000 });
      if (buf && buf.length > 2048) return buf;
    } catch {}
  }

  // 2. StableHorde community GPU — reliable free async generation
  try {
    const hordeKey = process.env.STABLE_HORDE_KEY || "0000000000";
    const submitRes = await axios.post(
      "https://stablehorde.net/api/v2/generate/async",
      {
        prompt: String(prompt || "").slice(0, 500),
        params: { steps: 20, width: 512, height: 512, n: 1, sampler_name: "k_euler" },
        r2: true,
        shared: true,
      },
      { timeout: 15000, headers: { "Content-Type": "application/json", apikey: hordeKey } }
    );
    const jobId = submitRes.data?.id;
    if (jobId) {
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const check = await axios.get(`https://stablehorde.net/api/v2/generate/check/${jobId}`, { timeout: 10000 });
        if (check.data?.done) {
          const result = await axios.get(`https://stablehorde.net/api/v2/generate/status/${jobId}`, { timeout: 10000 });
          const imgUrl = result.data?.generations?.[0]?.img;
          if (imgUrl) {
            const buf = await fetchBuffer(imgUrl, { timeout: 30000 });
            if (buf && buf.length > 2048) return buf;
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error('[fetchGeneratedImage] StableHorde failed:', err.message);
  }

  // 3. Local SVG art fallback — always works, no external call needed
  return createLocalPromptArt(prompt);
}

function hashText(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function clampText(text, max) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function pickPalette(seed) {
  const palettes = [
    ["#0B1D3A", "#13315C", "#0FA3B1", "#BEE9E8"],
    ["#1A1A2E", "#16213E", "#0F3460", "#E94560"],
    ["#102A43", "#243B53", "#486581", "#F0B429"],
    ["#1B4332", "#2D6A4F", "#40916C", "#D8F3DC"],
  ];
  return palettes[seed % palettes.length];
}

function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xFFFFFFFF;
  };
}

async function createLocalPromptArt(prompt) {
  const width = 1024;
  const height = 1024;
  const seed = hashText(prompt || "image");
  const rand = randomFromSeed(seed);
  const [c1, c2, c3, c4] = pickPalette(seed);
  const safePrompt = clampText(String(prompt || ""), 180)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  let shapes = "";
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand() * width);
    const y = Math.floor(rand() * height);
    const r = Math.floor(40 + rand() * 220);
    const fill = [c2, c3, c4][Math.floor(rand() * 3)];
    const opacity = (0.12 + rand() * 0.35).toFixed(2);
    shapes += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
  }

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="55%" stop-color="${c2}"/>
        <stop offset="100%" stop-color="${c3}"/>
      </linearGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="2"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <g filter="url(#blur)">${shapes}</g>
    <rect x="64" y="700" width="896" height="260" rx="24" fill="#000000" opacity="0.42"/>
    <text x="96" y="756" font-size="30" font-family="Arial, sans-serif" fill="#FFFFFF" font-weight="700">AI Prompt</text>
    <text x="96" y="808" font-size="28" font-family="Arial, sans-serif" fill="#FFFFFF">${safePrompt}</text>
    <text x="96" y="932" font-size="24" font-family="Arial, sans-serif" fill="#FFFFFF" opacity="0.9">Fallback render (free mode) • seed ${seed}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

const commands = [
  {
    name: ["ai", "gpt", "chatgpt", "ask"],
    category: "ai",
    desc: "Chat with AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("ai <question>");
      m.react("🤖");
      try {
        const answer = await pollinate(text, "openai");
        await m.reply(`🤖 *${config.BOT_NAME} AI*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("AI");
      }
    },
  },
  {
    name: ["gemini", "gem", "g"],
    category: "ai",
    desc: "Chat with Google Gemini AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("gemini <question>");
      m.react("🤖");
      try {
        const answer = await pollinate(text, "gemini");
        await m.reply(`💎 *Gemini AI*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Gemini AI");
      }
    },
  },
  {
    name: ["deepseek", "ds"],
    category: "ai",
    desc: "Chat with DeepSeek AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("deepseek <question>");
      m.react("🤖");
      try {
        const answer = await pollinate(text, "deepseek");
        await m.reply(`🧠 *DeepSeek AI*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("DeepSeek AI");
      }
    },
  },
  {
    name: ["llama", "ll"],
    category: "ai",
    desc: "Chat with Llama AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("llama <question>");
      m.react("🤖");
      try {
        const answer = await pollinate(text, "llama");
        await m.reply(`🦙 *Llama AI*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Llama AI");
      }
    },
  },
  {
    name: ["mistral", "mis"],
    category: "ai",
    desc: "Chat with Mistral AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("mistral <question>");
      m.react("🤖");
      try {
        const answer = await pollinate(text, "mistral");
        await m.reply(`🌀 *Mistral AI*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Mistral AI");
      }
    },
  },
  {
    name: ["dalle", "imagine", "generateimage", "imgai", "draw"],
    category: "ai",
    desc: "Generate image with AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("dalle <prompt>");
      m.react("⏳");
      await m.reply(`🎨 Generating image for: *${text}*\n\n_This may take up to 30 seconds..._`);
      try {
        const imgBuffer = await fetchGeneratedImage(text);
        if (!imgBuffer) return m.apiErrorReply("Image Generation");
        await sock.sendMessage(m.chat, { image: imgBuffer, caption: `🎨 *AI Generated Image*\n\nPrompt: ${text}\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Image Generation");
      }
    },
  },
  {
    name: ["translate", "tr", "tl"],
    category: "ai",
    desc: "Translate text to any language — supports names, codes, multi-lang, detect & more",
    handler: async (sock, m, { args, text }) => {
      // ── Language database ───────────────────────────────────────────────────
      // Each entry: [code, englishName, nativeName, flagEmoji]
      const LANGS = [
        ["af","Afrikaans","Afrikaans","🇿🇦"],["ak","Akan","Akan","🇬🇭"],["sq","Albanian","Shqip","🇦🇱"],
        ["am","Amharic","አማርኛ","🇪🇹"],["ar","Arabic","العربية","🇸🇦"],["hy","Armenian","Հայերեն","🇦🇲"],
        ["az","Azerbaijani","Azərbaycan","🇦🇿"],["eu","Basque","Euskara","🇪🇸"],["be","Belarusian","Беларуская","🇧🇾"],
        ["bn","Bengali","বাংলা","🇧🇩"],["bs","Bosnian","Bosanski","🇧🇦"],["bg","Bulgarian","Български","🇧🇬"],
        ["ca","Catalan","Català","🇪🇸"],["ny","Chichewa","Chichewa","🇲🇼"],["zh-CN","Chinese","中文","🇨🇳"],
        ["zh-TW","Chinese Traditional","繁體中文","🇹🇼"],["co","Corsican","Corsu","🇫🇷"],["hr","Croatian","Hrvatski","🇭🇷"],
        ["cs","Czech","Čeština","🇨🇿"],["da","Danish","Dansk","🇩🇰"],["nl","Dutch","Nederlands","🇳🇱"],
        ["en","English","English","🇬🇧"],["eo","Esperanto","Esperanto","🌍"],["et","Estonian","Eesti","🇪🇪"],
        ["tl","Filipino","Filipino","🇵🇭"],["fi","Finnish","Suomi","🇫🇮"],["fr","French","Français","🇫🇷"],
        ["fy","Frisian","Frysk","🇳🇱"],["gl","Galician","Galego","🇪🇸"],["ka","Georgian","ქართული","🇬🇪"],
        ["de","German","Deutsch","🇩🇪"],["el","Greek","Ελληνικά","🇬🇷"],["gu","Gujarati","ગુજરાતી","🇮🇳"],
        ["ht","Haitian Creole","Kreyòl Ayisyen","🇭🇹"],["ha","Hausa","Hausa","🇳🇬"],["haw","Hawaiian","ʻŌlelo Hawaiʻi","🌺"],
        ["iw","Hebrew","עברית","🇮🇱"],["hi","Hindi","हिन्दी","🇮🇳"],["hmn","Hmong","Hmoob","🌏"],
        ["hu","Hungarian","Magyar","🇭🇺"],["is","Icelandic","Íslenska","🇮🇸"],["ig","Igbo","Igbo","🇳🇬"],
        ["id","Indonesian","Indonesia","🇮🇩"],["ga","Irish","Gaeilge","🇮🇪"],["it","Italian","Italiano","🇮🇹"],
        ["ja","Japanese","日本語","🇯🇵"],["jw","Javanese","Javanese","🇮🇩"],["kn","Kannada","ಕನ್ನಡ","🇮🇳"],
        ["kk","Kazakh","Қазақша","🇰🇿"],["km","Khmer","ខ្មែរ","🇰🇭"],["ko","Korean","한국어","🇰🇷"],
        ["ku","Kurdish","Kurdî","🏳️"],["ky","Kyrgyz","Кыргызча","🇰🇬"],["lo","Lao","ລາວ","🇱🇦"],
        ["la","Latin","Latina","🏛️"],["lv","Latvian","Latviešu","🇱🇻"],["lt","Lithuanian","Lietuvių","🇱🇹"],
        ["lb","Luxembourgish","Lëtzebuergesch","🇱🇺"],["mk","Macedonian","Македонски","🇲🇰"],["mg","Malagasy","Malagasy","🇲🇬"],
        ["ms","Malay","Melayu","🇲🇾"],["ml","Malayalam","മലയാളം","🇮🇳"],["mt","Maltese","Malti","🇲🇹"],
        ["mi","Maori","Māori","🇳🇿"],["mr","Marathi","मराठी","🇮🇳"],["mn","Mongolian","Монгол","🇲🇳"],
        ["my","Myanmar","မြန်မာဘာသာ","🇲🇲"],["ne","Nepali","नेपाली","🇳🇵"],["no","Norwegian","Norsk","🇳🇴"],
        ["or","Odia","ଓଡ଼ିଆ","🇮🇳"],["ps","Pashto","پښتو","🇦🇫"],["fa","Persian","فارسی","🇮🇷"],
        ["pl","Polish","Polski","🇵🇱"],["pt","Portuguese","Português","🇧🇷"],["pa","Punjabi","ਪੰਜਾਬੀ","🇮🇳"],
        ["ro","Romanian","Română","🇷🇴"],["ru","Russian","Русский","🇷🇺"],["sm","Samoan","Samoan","🇼🇸"],
        ["gd","Scots Gaelic","Gàidhlig","🏴󠁧󠁢󠁳󠁣󠁴󠁿"],["sr","Serbian","Srpski","🇷🇸"],["st","Sesotho","Sesotho","🇱🇸"],
        ["sn","Shona","Shona","🇿🇼"],["sd","Sindhi","سنڌي","🇵🇰"],["si","Sinhala","සිංහල","🇱🇰"],
        ["sk","Slovak","Slovenčina","🇸🇰"],["sl","Slovenian","Slovenščina","🇸🇮"],["so","Somali","Soomaali","🇸🇴"],
        ["es","Spanish","Español","🇪🇸"],["su","Sundanese","Basa Sunda","🇮🇩"],["sw","Swahili","Kiswahili","🇹🇿"],
        ["sv","Swedish","Svenska","🇸🇪"],["tg","Tajik","Тоҷикӣ","🇹🇯"],["ta","Tamil","தமிழ்","🇮🇳"],
        ["te","Telugu","తెలుగు","🇮🇳"],["th","Thai","ภาษาไทย","🇹🇭"],["tr","Turkish","Türkçe","🇹🇷"],
        ["uk","Ukrainian","Українська","🇺🇦"],["ur","Urdu","اردو","🇵🇰"],["ug","Uyghur","ئۇيغۇرچە","🇨🇳"],
        ["uz","Uzbek","Oʻzbek","🇺🇿"],["vi","Vietnamese","Tiếng Việt","🇻🇳"],["cy","Welsh","Cymraeg","🏴󠁧󠁢󠁷󠁬󠁳󠁿"],
        ["xh","Xhosa","isiXhosa","🇿🇦"],["yi","Yiddish","ייִדיש","🏳️"],["yo","Yoruba","Yorùbá","🇳🇬"],
        ["zu","Zulu","isiZulu","🇿🇦"],["tw","Twi","Twi","🇬🇭"],
      ];

      // Build lookups
      const byCode = new Map(LANGS.map(l => [l[0].toLowerCase(), l]));
      const byName = new Map(LANGS.map(l => [l[1].toLowerCase(), l]));
      // Also index common aliases / alternate names
      const ALIASES = {
        "chinese simplified":"zh-CN","mandarin":"zh-CN","cantonese":"zh-TW",
        "chinese traditional":"zh-TW","hebrew":"iw","tagalog":"tl","pilipino":"tl",
        "farsi":"fa","persian":"fa","burmese":"my","myanmar":"my","khmer":"km",
        "cambodian":"km","punjabi":"pa","urdu":"ur","twi":"tw","akan":"ak",
        "fante":"ak","ghanaian":"tw","haitian":"ht","haitian creole":"ht",
      };

      // Resolve a raw string (name or code) → language entry [code, name, native, flag] or null
      function resolveLang(raw) {
        const s = String(raw || "").trim().toLowerCase();
        if (!s) return null;
        // 1. Exact code
        if (byCode.has(s)) return byCode.get(s);
        // 2. Alias
        if (ALIASES[s]) return byCode.get(ALIASES[s].toLowerCase()) || null;
        // 3. Exact name
        if (byName.has(s)) return byName.get(s);
        // 4. Partial name match (e.g. "span" → Spanish, "portu" → Portuguese)
        for (const [key, entry] of byName) {
          if (key.startsWith(s) || s.startsWith(key.slice(0, 4))) return entry;
        }
        // 5. Contains match
        for (const [key, entry] of byName) {
          if (key.includes(s) || s.includes(key)) return entry;
        }
        return null;
      }

      // Languages that produce romanization (transliteration) in Google's response
      const TRANSLIT_LANGS = new Set([
        "ar","iw","hi","bn","ta","te","kn","ml","gu","pa","mr","or","ne","si",
        "th","lo","my","km","ka","hy","am","el","ru","uk","be","bg","mk","sr","mn",
        "ja","ko","zh-CN","zh-TW","zh",
      ]);

      // ── Call Google Translate, returns { translated, translit, detectedCode } ─
      async function googleTranslate(q, targetCode) {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetCode)}&dt=t&dt=rm&q=${encodeURIComponent(q)}`;
        const data = await fetchJson(url, { timeout: 12000 });
        if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
        const segments = data[0];
        const translated = segments.map(s => (Array.isArray(s) ? s[0] || "" : "")).join("").trim();
        const translit   = segments.map(s => (Array.isArray(s) ? s[2] || "" : "")).join("").trim();
        const detectedCode = typeof data[2] === "string" ? data[2] : null;
        return { translated, translit: translit || null, detectedCode };
      }

      // ── MyMemory fallback ────────────────────────────────────────────────────
      async function myMemoryTranslate(q, srcCode, targetCode) {
        const pair = `${srcCode || "en"}|${targetCode}`;
        const data = await fetchJson(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${pair}`,
          { timeout: 10000 }
        );
        const result = data?.responseData?.translatedText;
        if (!result || /INVALID LANGUAGE PAIR/i.test(result)) return null;
        return result.trim();
      }

      // ── Translate a single query to a single target, with fallbacks ──────────
      async function translateOne(q, targetLang) {
        let result = null;
        try { result = await googleTranslate(q, targetLang[0]); } catch {}
        if (result?.translated) return result;

        // MyMemory fallback
        try {
          const mm = await myMemoryTranslate(q, "auto", targetLang[0]);
          if (mm) return { translated: mm, translit: null, detectedCode: null };
        } catch {}

        // AI fallback
        try {
          const ai = await pollinate(
            `Translate the following text to ${targetLang[1]}. Output ONLY the translated text, nothing else:\n\n${q}`,
            "openai"
          );
          if (ai) return { translated: ai.trim(), translit: null, detectedCode: null };
        } catch {}

        return null;
      }

      // ────────────────────────────────────────────────────────────────────────
      // Parse command
      // ────────────────────────────────────────────────────────────────────────
      const firstArg = (args[0] || "").toLowerCase().trim();

      // ── .translate help ──────────────────────────────────────────────────────
      if (firstArg === "help") {
        return m.reply(
          `🌐 *Translate — Usage Guide*\n\n` +
          `*Basic translation:*\n` +
          `▸ .translate French Hello world\n` +
          `▸ .translate Spanish Good morning\n` +
          `▸ .translate Arabic Thank you\n\n` +
          `*Using language codes:*\n` +
          `▸ .translate fr Bonjour\n` +
          `▸ .translate es Hello\n` +
          `▸ .translate zh-CN Hello\n\n` +
          `*Reply to any message:*\n` +
          `▸ Reply to a message → .translate German\n` +
          `▸ Reply to a message → .translate ja\n\n` +
          `*Translate to multiple languages at once:*\n` +
          `▸ .translate fr,es,de Hello world\n` +
          `▸ .translate Arabic,French,Swahili Good night\n\n` +
          `*Detect language:*\n` +
          `▸ .translate detect Bonjour le monde\n` +
          `▸ .translate detect こんにちは\n\n` +
          `*Browse languages:*\n` +
          `▸ .translate list\n\n` +
          `────────────────────────────────\n` +
          `_${config.BOT_NAME} · Desam Tech_ ⚡`
        );
      }

      // ── .translate list ──────────────────────────────────────────────────────
      if (firstArg === "list" || firstArg === "langs" || firstArg === "languages") {
        const rows = LANGS.map(([code, name, native, flag]) =>
          `${flag} ${name} (${code}) — _${native}_`
        );
        const half = Math.ceil(rows.length / 2);
        return m.reply(
          `🌍 *Supported Languages (${LANGS.length})*\n\n` +
          rows.slice(0, half).join("\n") + "\n\n" +
          rows.slice(half).join("\n") + "\n\n" +
          `────────────────────────────────\n` +
          `_Use .translate help for usage examples_`
        );
      }

      // ── .translate detect <text> ─────────────────────────────────────────────
      if (firstArg === "detect" || firstArg === "id" || firstArg === "identify") {
        const query = args.slice(1).join(" ").trim() || m.quoted?.body || "";
        if (!query) return m.reply("❓ Provide text to detect: .translate detect <text>");
        m.react("🔍");
        try {
          const result = await googleTranslate(query, "en");
          if (!result) return m.apiErrorReply("Language detection");
          const detLang = result.detectedCode ? (byCode.get(result.detectedCode.toLowerCase()) || null) : null;
          const displayName = detLang ? `${detLang[3]} *${detLang[1]}* (${detLang[0]}) — _${detLang[2]}_` : `code: \`${result.detectedCode || "unknown"}\``;
          const preview = query.length > 80 ? query.slice(0, 80) + "…" : query;
          await m.reply(
            `🔍 *Language Detection*\n\n` +
            `*Text:* ${preview}\n\n` +
            `*Detected:* ${displayName}\n\n` +
            `────────────────────────────────\n` +
            `_${config.BOT_NAME} · Desam Tech_ ⚡`
          );
          m.react("✅");
        } catch {
          m.react("❌");
          return m.apiErrorReply("Language detection");
        }
        return;
      }

      // ── Multi-language: detect commas in first arg ───────────────────────────
      const isMulti = firstArg.includes(",");
      if (isMulti) {
        const targets = firstArg.split(",").map(s => s.trim()).filter(Boolean)
          .map(s => resolveLang(s)).filter(Boolean);
        if (!targets.length) return m.reply("❌ No valid languages found. Use .translate list to see all languages.");
        const query = args.slice(1).join(" ").trim() || m.quoted?.body || "";
        if (!query) return m.reply(`❌ Provide text after the languages.\n_Example: .translate fr,es,de Hello world_`);
        if (query.length > 500) return m.reply("❌ Text too long. Keep it under 500 characters for multi-language translation.");
        m.react("🌐");
        try {
          const results = await Promise.all(targets.map(async lang => {
            const res = await translateOne(query, lang);
            return { lang, res };
          }));
          const lines = results.map(({ lang, res }) => {
            if (!res?.translated) return `${lang[3]} *${lang[1]}:* ❌ Failed`;
            return `${lang[3]} *${lang[1]}:* ${res.translated}`;
          });
          // Detected source language from first successful result
          const firstDetected = results.find(r => r.res?.detectedCode)?.res?.detectedCode;
          const srcLang = firstDetected ? byCode.get(firstDetected.toLowerCase()) : null;
          const srcLine = srcLang
            ? `*From:* ${srcLang[3]} ${srcLang[1]}\n`
            : "";
          const preview = query.length > 100 ? query.slice(0, 100) + "…" : query;
          await m.reply(
            `🌐 *Translation (${targets.length} languages)*\n\n` +
            `*Text:* ${preview}\n` +
            srcLine + `\n` +
            lines.join("\n") + `\n\n` +
            `────────────────────────────────\n` +
            `_${config.BOT_NAME} · Desam Tech_ ⚡`
          );
          m.react("✅");
        } catch {
          m.react("❌");
          return m.apiErrorReply("Translation");
        }
        return;
      }

      // ── Single-language translation ──────────────────────────────────────────
      const targetLang = resolveLang(firstArg);
      if (!targetLang && firstArg) {
        return m.reply(
          `❌ Unknown language: *${args[0]}*\n\n` +
          `Use a name like _French_, _Spanish_, _Arabic_ or a code like _fr_, _es_, _ar_.\n` +
          `Type *.translate list* to see all supported languages.`
        );
      }

      const finalLang = targetLang || byCode.get("en");
      const query = args.slice(1).join(" ").trim() || m.quoted?.body || "";

      if (!query) {
        return m.usageReply(
          "translate <language> <text>",
          "translate French Hello, how are you?\n" +
          "translate Arabic Good morning\n" +
          "translate es,fr,de Hello world\n" +
          "translate detect Bonjour le monde\n" +
          "translate list — see all languages\n" +
          "translate help — full guide"
        );
      }

      m.react("🌐");
      try {
        const result = await translateOne(query, finalLang);
        if (!result?.translated) {
          m.react("❌");
          return m.apiErrorReply("Translation");
        }

        const { translated, translit, detectedCode } = result;

        // Source language
        const srcLang = detectedCode ? byCode.get(detectedCode.toLowerCase()) : null;
        const fromLine = srcLang
          ? `*From:* ${srcLang[3]} ${srcLang[1]} (_${srcLang[2]}_)\n`
          : "";

        // Transliteration (only for non-Latin target scripts)
        const showTranslit = translit && TRANSLIT_LANGS.has(finalLang[0]) && translit !== translated;
        const translitLine = showTranslit ? `\n*Pronunciation:* _${translit}_` : "";

        const preview = query.length > 120 ? query.slice(0, 120) + "…" : query;

        await m.reply(
          `🌐 *Translation*\n\n` +
          `*Text:* ${preview}\n` +
          fromLine +
          `*To:* ${finalLang[3]} ${finalLang[1]} (_${finalLang[2]}_)\n\n` +
          `*Result:*\n${translated}` +
          translitLine + `\n\n` +
          `────────────────────────────────\n` +
          `_${config.BOT_NAME} · Desam Tech_ ⚡`
        );
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Translation");
      }
    },
  },
  {
    name: ["claude", "cl"],
    category: "ai",
    desc: "Chat with Claude AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("claude <question>");
      m.react("🤖");
      try {
        const answer = await pollinate(text, "claude");
        await m.reply(`🟠 *Claude AI*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Claude AI");
      }
    },
  },
  {
    name: ["copilot", "bing", "cp"],
    category: "ai",
    desc: "Chat with Copilot AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("copilot <question>");
      m.react("🤖");
      try {
        const answer = await pollinate(text, "copilot");
        await m.reply(`🔵 *Copilot AI*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Copilot AI");
      }
    },
  },
  {
    name: ["bard", "bd"],
    category: "ai",
    desc: "Chat with Bard AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("bard <question>");
      m.react("🤖");
      try {
        const answer = await pollinate(text, "gemini");
        await m.reply(`🟡 *Bard AI*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Bard AI");
      }
    },
  },
  {
    name: ["blackbox", "bb"],
    category: "ai",
    desc: "Chat with Blackbox AI (code expert)",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("blackbox <question>");
      m.react("🤖");
      try {
        const answer = await pollinate(`You are a coding expert assistant. Answer this coding/technical question:\n\n${text}`, "openai");
        await m.reply(`⬛ *Blackbox AI*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Blackbox AI");
      }
    },
  },
  {
    name: ["summarize", "summary", "tldr", "sum"],
    category: "ai",
    desc: "Summarize text with AI",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.usageReply("summarize <text> or reply to a message");
      m.react("📝");
      try {
        const prompt = `Summarize the following text concisely:\n\n${input}`;
        const answer = await pollinate(prompt, "openai");
        if (!answer) return m.apiErrorReply("Summarization server");
        await m.reply(`📝 *Summary*\n\n${normalizeAiText(answer, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Summarization server");
      }
    },
  },
  {
    name: ["removebg", "rmbg", "nobg", "rbg"],
    category: "ai",
    desc: "Remove background from image",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}removebg`);
      m.react("⏳");

      let resultBuffer = null;

      try {
        const inputBuffer = await media.download();

        // ── 1. remove.bg paid API (if key is configured — highest quality) ────
        if (process.env.REMOVE_BG_API_KEY && !resultBuffer) {
          try {
            const FormData = require("form-data");
            const form = new FormData();
            form.append("image_file", inputBuffer, { filename: "image.png", contentType: "image/png" });
            form.append("size", "auto");
            const res = await axios.post("https://api.remove.bg/v1.0/removebg", form, {
              headers: { ...form.getHeaders(), "X-Api-Key": process.env.REMOVE_BG_API_KEY },
              responseType: "arraybuffer",
              timeout: 30000,
            });
            if (res.data && res.data.length > 500) resultBuffer = Buffer.from(res.data);
          } catch (e) {
            console.error("[removebg] remove.bg API failed:", e.message?.slice(0, 100));
          }
        }

        // ── 2. Sharp-based color-flood removal (no API key — works for solid/simple backgrounds) ──
        if (!resultBuffer) {
          try {
            const sharp = require("sharp");
            // Decode to raw RGBA pixels
            const { data, info } = await sharp(inputBuffer)
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true });
            const { width, height, channels } = info; // channels === 4

            // Sample border pixels to find the dominant background color
            const borderSamples = [];
            for (let x = 0; x < width; x++) {
              // top row + bottom row
              for (const y of [0, height - 1]) {
                const i = (y * width + x) * 4;
                borderSamples.push([data[i], data[i + 1], data[i + 2]]);
              }
            }
            for (let y = 1; y < height - 1; y++) {
              // left col + right col
              for (const x of [0, width - 1]) {
                const i = (y * width + x) * 4;
                borderSamples.push([data[i], data[i + 1], data[i + 2]]);
              }
            }
            // Median of each channel as the background color
            const ch = (c) => borderSamples.map(s => s[c]).sort((a, b) => a - b);
            const mid = (arr) => arr[Math.floor(arr.length / 2)];
            const bgR = mid(ch(0)), bgG = mid(ch(1)), bgB = mid(ch(2));

            // Remove pixels within tolerance of background color (with smooth falloff)
            const TOLERANCE = 40; // color distance threshold
            const out = Buffer.from(data); // copy
            for (let i = 0; i < out.length; i += 4) {
              const dr = out[i] - bgR, dg = out[i + 1] - bgG, db = out[i + 2] - bgB;
              const dist = Math.sqrt(dr * dr + dg * dg + db * db);
              if (dist < TOLERANCE) {
                // Smooth fade: pixels close to BG color become more transparent
                out[i + 3] = Math.round(Math.min(255, (dist / TOLERANCE) * 255));
              }
            }
            resultBuffer = await sharp(out, { raw: { width, height, channels: 4 } })
              .png()
              .toBuffer();
            console.log("[removebg] sharp color-flood result size:", resultBuffer.length);
          } catch (e) {
            console.error("[removebg] sharp fallback failed:", e.message?.slice(0, 150));
          }
        }

        // ── 3. HuggingFace inference API (requires HF_TOKEN — free account works) ──
        if (!resultBuffer && process.env.HF_TOKEN) {
          try {
            const res = await axios.post(
              "https://api-inference.huggingface.co/models/briaai/RMBG-2.0",
              inputBuffer,
              {
                headers: {
                  "Content-Type": "application/octet-stream",
                  Authorization: `Bearer ${process.env.HF_TOKEN}`,
                },
                responseType: "arraybuffer",
                timeout: 45000,
              }
            );
            if (res.data && res.data.length > 500) resultBuffer = Buffer.from(res.data);
          } catch (e) {
            console.error("[removebg] HuggingFace RMBG failed:", e.message?.slice(0, 100));
          }
        }

        if (!resultBuffer) {
          m.react("❌");
          return m.reply("❌ Background removal failed. Please try again in a moment.");
        }

        await sock.sendMessage(
          m.chat,
          { image: resultBuffer, caption: `🖼️ Background removed!\n\n_Tip: For AI-quality results on complex backgrounds, set REMOVE_BG_API_KEY or HF_TOKEN._\n\n────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡` },
          { quoted: { key: m.key, message: m.message } }
        );
        m.react("✅");
      } catch (err) {
        m.react("❌");
        console.error("[removebg] error:", err.message);
        await m.reply("❌ Failed to remove background.");
      }
    },
  },
  {
    name: ["enhance", "upscale", "hd", "en"],
    category: "ai",
    desc: "Enhance/upscale image quality",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}enhance`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        const enhanced = await sharp(buffer)
          .resize({ width: 2048, withoutEnlargement: false })
          .sharpen({ sigma: 1.5 })
          .modulate({ brightness: 1.05, saturation: 1.1 })
          .jpeg({ quality: 95 })
          .toBuffer();
        await sock.sendMessage(m.chat, { image: enhanced, caption: "✨ Image enhanced!" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to enhance image.");
      }
    },
  },
  {
    name: ["ocr", "readtext"],
    category: "ai",
    desc: "Extract text from image (OCR)",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}ocr`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        const Tesseract = require('tesseract.js');
        const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
        if (!text) return m.reply("❌ No text detected in image.");
        await m.reply(`📝 *OCR Result*\n\n${normalizeAiText(text.trim(), { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ OCR failed.");
      }
    },
  },
];

module.exports = { commands, pollinate };
