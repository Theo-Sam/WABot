const config = require("../config");
const { fetchJson, fetchBuffer } = require("../lib/helpers");
const axios = require("axios");

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
  messages.push({ role: "user", content: prompt });
  const res = await axios.post("https://text.pollinations.ai/openai", {
    model: "openai",
    messages,
  }, { timeout: 60000, headers: { "Content-Type": "application/json" } });
  const answer = res.data?.choices?.[0]?.message?.content;
  if (!answer || answer.length < 2) throw new Error("empty");
  return answer;
}

const commands = [
  {
    name: ["ai", "gpt", "chatgpt", "ask"],
    category: "ai",
    desc: "Chat with AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}ai <question>`);
      m.react("🤖");
      try {
        const answer = await pollinate(text, "openai");
        await m.reply(`🤖 *${config.BOT_NAME} AI*\n\n${answer}`);
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
      if (!text) return m.reply(`Usage: ${config.PREFIX}gemini <question>`);
      m.react("🤖");
      try {
        const answer = await pollinate(text, "gemini");
        await m.reply(`💎 *Gemini AI*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Gemini AI server is busy. Please try again later!");
      }
    },
  },
  {
    name: ["deepseek", "ds"],
    category: "ai",
    desc: "Chat with DeepSeek AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}deepseek <question>`);
      m.react("🤖");
      try {
        const answer = await pollinate(text, "deepseek");
        await m.reply(`🧠 *DeepSeek AI*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The DeepSeek AI server is busy. Please try again later!");
      }
    },
  },
  {
    name: ["llama", "ll"],
    category: "ai",
    desc: "Chat with Llama AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}llama <question>`);
      m.react("🤖");
      try {
        const answer = await pollinate(text, "llama");
        await m.reply(`🦙 *Llama AI*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Llama AI server is busy. Please try again later!");
      }
    },
  },
  {
    name: ["mistral", "mis"],
    category: "ai",
    desc: "Chat with Mistral AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}mistral <question>`);
      m.react("🤖");
      try {
        const answer = await pollinate(text, "mistral");
        await m.reply(`🌀 *Mistral AI*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Mistral AI server is busy. Please try again later!");
      }
    },
  },
  {
    name: ["dalle", "imagine", "generateimage", "imgai", "img", "draw"],
    category: "ai",
    desc: "Generate image with AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}dalle <prompt>`);
      m.react("🎨");
      try {
        const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
        const imgBuffer = await fetchBuffer(imgUrl);
        if (!imgBuffer || imgBuffer.length < 1000) return m.reply("⏳ Image generation is currently busy. Try again soon!");
        await sock.sendMessage(m.chat, { image: imgBuffer, caption: `🎨 *AI Generated Image*\n\nPrompt: ${text}\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ Image generation servers are currently busy. Try again soon!");
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
      if (!query) return m.reply(`Usage: ${config.PREFIX}translate <lang> <text>\nExample: ${config.PREFIX}translate es Hello world\n\nLanguage codes: en, es, fr, de, ja, ko, zh, ar, hi, pt, ru, it, tr, etc.`);
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
        await m.reply(`🌐 *Translation* (→ ${lang})\n\n${translated}`);
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
      if (!text) return m.reply(`Usage: ${config.PREFIX}claude <question>`);
      m.react("🤖");
      try {
        const answer = await pollinate(text, "claude");
        await m.reply(`🟠 *Claude AI*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Claude AI server is busy. Please try again later!");
      }
    },
  },
  {
    name: ["copilot", "bing", "cp"],
    category: "ai",
    desc: "Chat with Copilot AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}copilot <question>`);
      m.react("🤖");
      try {
        const answer = await pollinate(text, "copilot");
        await m.reply(`🔵 *Copilot AI*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Copilot AI server is busy. Please try again later!");
      }
    },
  },
  {
    name: ["bard", "bd"],
    category: "ai",
    desc: "Chat with Bard AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}bard <question>`);
      m.react("🤖");
      try {
        const answer = await pollinate(text, "gemini");
        await m.reply(`🟡 *Bard AI*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Bard AI server is busy. Please try again later!");
      }
    },
  },
  {
    name: ["blackbox", "bb"],
    category: "ai",
    desc: "Chat with Blackbox AI (code expert)",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}blackbox <question>`);
      m.react("🤖");
      try {
        const answer = await pollinate(`You are a coding expert assistant. Answer this coding/technical question:\n\n${text}`, "openai");
        await m.reply(`⬛ *Blackbox AI*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Blackbox AI server is busy. Please try again later!");
      }
    },
  },
  {
    name: ["summarize", "summary", "tldr", "sum"],
    category: "ai",
    desc: "Summarize text with AI",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply(`Usage: ${config.PREFIX}summarize <text> or reply to a message`);
      m.react("📝");
      try {
        const prompt = `Summarize the following text concisely:\n\n${input}`;
        const answer = await pollinate(prompt, "openai");
        if (!answer) return m.reply("⏳ Summarization server is busy. Try again soon!");
        await m.reply(`📝 *Summary*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ Summarization server is busy. Try again soon!");
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
      try {
        const buffer = await media.download();
        const FormData = require("form-data");
        const form = new FormData();
        form.append("image", buffer, { filename: "image.png", contentType: "image/png" });
        let resultBuffer;
        try {
          const rbgKey = process.env.REMOVEBG_API_KEY;
          if (!rbgKey) throw new Error("No REMOVEBG_API_KEY configured");
          const res = await axios.post("https://api.remove.bg/v1.0/removebg", form, {
            headers: { ...form.getHeaders(), "X-Api-Key": rbgKey },
            responseType: "arraybuffer",
            timeout: 30000,
          });
          resultBuffer = Buffer.from(res.data);
        } catch {}
        if (!resultBuffer) return m.reply("⏳ Background removal API is currently overloaded. Please try again later!");
        await sock.sendMessage(m.chat, { image: resultBuffer, caption: "✅ Background removed!" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ Background removal API is currently overloaded. Please try again later!");
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
        const sharp = require("sharp");
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
        const FormData = require("form-data");
        const form = new FormData();
        form.append("file", buffer, { filename: "image.png", contentType: "image/png" });
        const ocrKey = process.env.OCR_API_KEY;
        if (!ocrKey) return m.reply("❌ OCR API key not configured. Set OCR_API_KEY in environment.");
        form.append("apikey", ocrKey);
        form.append("language", "eng");
        const res = await axios.post("https://api.ocr.space/parse/image", form, { headers: form.getHeaders(), timeout: 30000 });
        const text = res.data?.ParsedResults?.[0]?.ParsedText || "";
        if (!text) return m.reply("❌ No text detected in image.");
        await m.reply(`📝 *OCR Result*\n\n${text.trim()}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ OCR failed.");
      }
    },
  },
];

module.exports = { commands };
