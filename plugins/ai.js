const config = require("../config");
const { fetchJson, fetchBuffer } = require("../lib/helpers");

const commands = [
  {
    name: ["ai", "gpt", "chatgpt", "ask"],
    category: "ai",
    desc: "Chat with AI",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}ai <question>`);
      m.react("🤖");
      try {
        const apis = [
          `https://deliriussapi-oficial.vercel.app/ia/gptweb?text=${encodeURIComponent(text)}`,
          `https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(text)}`,
          `https://api.siputzx.my.id/api/ai/gpt4o?content=${encodeURIComponent(text)}`,
        ];
        let answer = await Promise.any(
          apis.map(async (url) => {
            const data = await fetchJson(url);
            const res = data?.data || data?.result || data?.answer || data?.response;
            if (!res) throw new Error("empty");
            return res;
          })
        ).catch(() => "");
        if (!answer) return m.reply("⏳ The free AI servers are currently overloaded. Please try again in a few minutes!");
        await m.reply(`🤖 *${config.BOT_NAME} AI*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The free AI servers are currently overloaded. Please try again in a few minutes!");
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
        const apis = [
          `https://deliriussapi-oficial.vercel.app/ia/gemini?text=${encodeURIComponent(text)}`,
          `https://api.dreaded.site/api/gemini?text=${encodeURIComponent(text)}`,
        ];
        let answer = await Promise.any(
          apis.map(async (url) => {
            const data = await fetchJson(url);
            const res = data?.data || data?.result || data?.answer;
            if (!res) throw new Error("empty");
            return res;
          })
        ).catch(() => "");
        if (!answer) return m.reply("⏳ The Gemini AI server is overloaded. Please try again later!");
        await m.reply(`💎 *Gemini AI*\n\n${answer}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Gemini AI server is overloaded. Please try again later!");
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
        const apis = [
          `https://deliriussapi-oficial.vercel.app/ia/dalle?text=${encodeURIComponent(text)}`,
          `https://api.dreaded.site/api/dalle?prompt=${encodeURIComponent(text)}`,
        ];
        let imgBuffer = await Promise.any(
          apis.map(async (url) => {
            const data = await fetchJson(url);
            const imgUrl = data?.data || data?.result || data?.url;
            if (!imgUrl) throw new Error("empty");
            return await fetchBuffer(imgUrl);
          })
        ).catch(() => null);
        if (!imgBuffer) return m.reply("⏳ Image generation servers are currently busy. Try again soon!");
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
        let translated = await Promise.any([
          (async () => {
            const data = await fetchJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=auto|${lang}`);
            if (!data?.responseData?.translatedText) throw new Error("empty");
            return data.responseData.translatedText;
          })(),
          (async () => {
            const data = await fetchJson(`https://deliriussapi-oficial.vercel.app/tools/translate?text=${encodeURIComponent(query)}&to=${lang}`);
            if (!data?.data) throw new Error("empty");
            return data.data;
          })()
        ]).catch(() => "");
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
        let answer = "";
        try {
          const data = await fetchJson(`https://deliriussapi-oficial.vercel.app/ia/gptweb?text=${encodeURIComponent(prompt)}`);
          answer = data?.data || "";
        } catch { }
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
        const axios = require("axios");
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
        } catch { }
        if (!resultBuffer) {
          try {
            const res2 = await axios.post("https://deliriussapi-oficial.vercel.app/tools/removebg", form, {
              headers: form.getHeaders(),
              responseType: "arraybuffer",
              timeout: 30000,
            });
            resultBuffer = Buffer.from(res2.data);
          } catch { }
        }
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
        const axios = require("axios");
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