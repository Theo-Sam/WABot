const config = require("../config");
const { fetchJson, fetchBuffer } = require("../lib/helpers");
const axios = require("axios");

async function pollinate(prompt, model) {
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}${model ? "?model=" + model : ""}`;
  const res = await axios.get(url, { timeout: 60000, responseType: "text" });
  if (!res.data || typeof res.data !== "string" || res.data.length < 2) throw new Error("empty");
  return res.data;
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
          const res = await axios.post("https://api.remove.bg/v1.0/removebg", form, {
            headers: { ...form.getHeaders(), "X-Api-Key": "SU6Mu47dFw8RPyZYK6FFgnpA" },
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
        form.append("apikey", "K82296058288957");
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
