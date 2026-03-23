const config = require("../config");
const { fetchJson, postJson, normalizeAiText } = require("../lib/helpers");
const axios = require("axios");
const sharp = require("sharp");
const { endpoints } = require("../lib/endpoints");

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
  const openaiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const messages = [];
  const systemMsg = AI_PERSONAS[persona];
  if (systemMsg) messages.push({ role: "system", content: systemMsg });
  messages.push({
    role: "system",
    content: "Reply in clean WhatsApp chat style. Use short paragraphs. Avoid markdown tables and avoid decorative formatting.",
  });
  messages.push({ role: "user", content: prompt });

  // No-key default: use Pollinations (community/free endpoint; may rate-limit).
  if (!openaiKey) {
    try {
      const payload = { model: "openai", messages };
      const data = await postJson("https://text.pollinations.ai/openai", payload, {
        timeout: 30000,
        headers: { "Content-Type": "application/json" },
      });
      const answer = data?.choices?.[0]?.message?.content;
      if (answer && answer.length >= 2) return normalizeAiText(answer, { keepLightFormatting: true });
    } catch {}

    // Fallbacks for when Pollinations is rate-limited or fails
    try {
      const fb1 = await fetchJson(`https://api.vyturex.com/prompt=${encodeURIComponent(prompt)}`, { timeout: 15000 });
      if (fb1 && typeof fb1 === "string") return normalizeAiText(fb1, { keepLightFormatting: true });
    } catch {}

    try {
      const fb2 = await fetchJson(`https://api.nyxs.pw/ai/gpt4?text=${encodeURIComponent(prompt)}`, { timeout: 15000 });
      if (fb2 && fb2.result) return normalizeAiText(fb2.result, { keepLightFormatting: true });
    } catch {}

    throw new Error("empty");
  }

  // If user explicitly configures a paid key, use official OpenAI.
  const { OpenAI } = require("openai");
  const openai = new OpenAI({ apiKey: openaiKey });
  const completion = await openai.chat.completions.create({
    model: endpoints.openai.model,
    messages,
  });
  const answer = completion.choices?.[0]?.message?.content;
  if (!answer || answer.length < 2) throw new Error("empty");
  return normalizeAiText(answer, { keepLightFormatting: true });
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
        await m.reply("⏳ The AI server is currently busy. Please try again in a moment!");
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
        if (!imgBuffer) return m.reply("⏳ Image generation is currently busy. Try again in a moment.");
        await sock.sendMessage(m.chat, { image: imgBuffer, caption: `🎨 *AI Generated Image*\n\nPrompt: ${text}\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ Image generation temporarily failed. Please try again.");
      }
    },
  },
  {
    name: ["translate", "tr"],
    category: "ai",
    desc: "Translate text to any language",
    handler: async (sock, m, { args, text }) => {
      const lang = args[0] || "en";
      const query = args.slice(1).join(" ") || (m.quoted?.body) || "";
      if (!query) return m.usageReply("translate <lang> <text>", "translate es Hello world\n\nLanguage codes: en, es, fr, de, ja, ko, zh, ar, hi, pt, ru, it, tr, etc.");
      m.react("🌐");
      try {
        let translated = "";
        try {
          const data = await fetchJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=auto|${lang}`);
          if (data?.responseData?.translatedText) translated = data.responseData.translatedText;
        } catch {}
        if (!translated) {
          translated = await pollinate(`Translate the following text to ${lang}. Only output the translation, nothing else:\n\n${query}`, "openai").catch(() => "");
        }
        if (!translated) return m.reply("⏳ Translation API is overloaded. Try again later.");
        await m.reply(`🌐 *Translation* (→ ${lang})\n\n${normalizeAiText(translated, { keepLightFormatting: true })}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ Translation API is overloaded. Try again later.");
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
      await m.reply(
        `❌ *removebg* disabled in no-key mode.\n\n` +
        `Background removal generally requires paid APIs or heavy local ML.\n` +
        `If you want it enabled, set REMOVE_BG_API_KEY (paid) or we can add a local rembg workflow.`
      );
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

module.exports = { commands };
