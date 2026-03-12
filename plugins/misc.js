const config = require("../config");
const { fetchBuffer, fetchJson, isUrl } = require("../lib/helpers");

const commands = [
  {
    name: ["qr", "qrcode"],
    category: "tools",
    desc: "Generate QR code",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}qr <text or URL>`);
      m.react("⏳");
      try {
        const buffer = await fetchBuffer(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`);
        await sock.sendMessage(m.chat, { image: buffer, caption: `📱 *QR Code*\n\nContent: ${text}` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The QR Generator API is currently overloaded.");
      }
    },
  },
  {
    name: ["readqr", "scanqr"],
    category: "tools",
    desc: "Read/scan QR code from image",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to a QR code image with ${config.PREFIX}readqr`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        const FormData = require("form-data");
        const axios = require("axios");
        const form = new FormData();
        form.append("file", buffer, { filename: "qr.png", contentType: "image/png" });
        const res = await axios.post("https://api.qrserver.com/v1/read-qr-code/", form, { headers: form.getHeaders(), timeout: 15000 });
        const data = res.data?.[0]?.symbol?.[0]?.data;
        if (!data) return m.reply("❌ No QR code detected.");
        await m.reply(`📱 *QR Code Content*\n\n${data}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The QR Reader API is currently overloaded.");
      }
    },
  },
  {
    name: ["shorturl", "short", "tinyurl"],
    category: "tools",
    desc: "Shorten a URL",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}shorturl <URL>`);
      m.react("⏳");
      try {
        const shortUrl = await Promise.any([
          (async () => {
            const data = await fetchJson(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`);
            if (typeof data !== "string") throw new Error("empty");
            return data;
          })(),
          (async () => {
            const res = await fetchJson(`https://is.gd/create.php?format=json&url=${encodeURIComponent(text)}`);
            if (!res?.shorturl) throw new Error("empty");
            return res.shorturl;
          })()
        ]).catch(() => null);

        if (!shortUrl) return m.reply("⏳ The URL Shortener API is currently overloaded.");
        await m.reply(`🔗 *Short URL*\n\n${shortUrl}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The URL Shortener API is currently overloaded.");
      }
    },
  },
  {
    name: ["screenshot", "ss", "ssweb"],
    category: "tools",
    desc: "Take website screenshot",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.reply(`Usage: ${config.PREFIX}screenshot <URL>`);
      m.react("⏳");
      try {
        const buffer = await fetchBuffer(`https://api.screenshotmachine.com/?key=c3dc2a&url=${encodeURIComponent(text)}&dimension=1920x1080`);
        await sock.sendMessage(m.chat, { image: buffer, caption: `📸 *Screenshot*\n\n🔗 ${text}` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Screenshot API is currently overloaded.");
      }
    },
  },
  {
    name: ["meme"],
    category: "fun",
    desc: "Get a random meme",
    handler: async (sock, m) => {
      m.react("😂");
      try {
        const data = await fetchJson("https://meme-api.com/gimme");
        if (!data?.url) {
          m.react("❌");
          return m.reply("⏳ The Meme API is currently overloaded.");
        }
        const buffer = await fetchBuffer(data.url);
        await sock.sendMessage(m.chat, { image: buffer, caption: `😂 *${data.title || "Meme"}*\n\n👍 ${data.ups || 0} upvotes\n📍 r/${data.subreddit || "memes"}` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Meme API is currently overloaded.");
      }
    },
  },
  {
    name: ["cat", "kucing"],
    category: "fun",
    desc: "Random cat image",
    handler: async (sock, m) => {
      m.react("🐱");
      try {
        const data = await fetchJson("https://api.thecatapi.com/v1/images/search");
        const buffer = await fetchBuffer(data[0].url);
        await sock.sendMessage(m.chat, { image: buffer, caption: "🐱 *Meow!*" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Cat API is currently overloaded.");
      }
    },
  },
  {
    name: ["dog", "anjing"],
    category: "fun",
    desc: "Random dog image",
    handler: async (sock, m) => {
      m.react("🐶");
      try {
        const data = await fetchJson("https://dog.ceo/api/breeds/image/random");
        const buffer = await fetchBuffer(data.message);
        await sock.sendMessage(m.chat, { image: buffer, caption: "🐶 *Woof!*" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Dog API is currently overloaded.");
      }
    },
  },
  {
    name: ["fox"],
    category: "fun",
    desc: "Random fox image",
    handler: async (sock, m) => {
      m.react("🦊");
      try {
        const data = await fetchJson("https://randomfox.ca/floof/");
        const buffer = await fetchBuffer(data.image);
        await sock.sendMessage(m.chat, { image: buffer, caption: "🦊 *Floof!*" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Fox API is currently overloaded.");
      }
    },
  },
  {
    name: ["carbon", "carbonize"],
    category: "tools",
    desc: "Create code snippet image",
    handler: async (sock, m, { text }) => {
      const code = text || m.quoted?.body || "";
      if (!code) return m.reply(`Usage: ${config.PREFIX}carbon <code> or reply to a message`);
      m.react("⏳");
      try {
        const axios = require("axios");
        const res = await axios.post("https://carbonara.solopov.dev/api/cook", {
          code: code,
          theme: "one-dark",
          fontFamily: "JetBrains Mono",
          fontSize: "14px",
          padding: "32px",
        }, { responseType: "arraybuffer", timeout: 30000 });
        const buffer = Buffer.from(res.data);
        await sock.sendMessage(m.chat, { image: buffer, caption: "💻 *Code Snippet*" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Code Snippet API is currently overloaded.");
      }
    },
  },
  {
    name: ["color", "hex", "hexcolor"],
    category: "tools",
    desc: "Generate color preview",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}color <hex>\nExample: ${config.PREFIX}color ff5733`);
      const hex = text.replace("#", "");
      m.react("⏳");
      try {
        const buffer = await fetchBuffer(`https://singlecolorimage.com/get/${hex}/200x200`);
        await m.reply(`🎨 *Color: #${hex}*`);
        await sock.sendMessage(m.chat, { image: buffer }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Invalid color code.");
      }
    },
  },
  {
    name: ["encode", "encrypt"],
    category: "tools",
    desc: "Encode text (ROT13)",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}encode <text>`);
      const encoded = text.replace(/[a-zA-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < "n" ? 13 : -13)));
      await m.reply(`🔐 *Encoded (ROT13)*\n\n${encoded}`);
    },
  },
  {
    name: ["decode", "decrypt"],
    category: "tools",
    desc: "Decode ROT13 text",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}decode <text>`);
      const decoded = text.replace(/[a-zA-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < "n" ? 13 : -13)));
      await m.reply(`🔓 *Decoded (ROT13)*\n\n${decoded}`);
    },
  },
  {
    name: ["reverse", "rev"],
    category: "tools",
    desc: "Reverse text",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply(`Usage: ${config.PREFIX}reverse <text>`);
      await m.reply(`🔄 ${input.split("").reverse().join("")}`);
    },
  },
  {
    name: ["repeat", "echo"],
    category: "tools",
    desc: "Repeat a message",
    handler: async (sock, m, { args }) => {
      const count = parseInt(args[0]) || 1;
      const msg = args.slice(1).join(" ");
      if (!msg) return m.reply(`Usage: ${config.PREFIX}repeat <count> <message>`);
      const limited = Math.min(count, 10);
      let result = "";
      for (let i = 0; i < limited; i++) result += msg + "\n";
      await m.reply(result.trim());
    },
  },
  {
    name: ["count", "wordcount", "charcount"],
    category: "tools",
    desc: "Count characters/words in text",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply(`Usage: ${config.PREFIX}count <text> or reply to a message`);
      const chars = input.length;
      const words = input.split(/\s+/).filter(Boolean).length;
      const lines = input.split("\n").length;
      const sentences = input.split(/[.!?]+/).filter(Boolean).length;
      await m.reply(`📊 *Text Stats*\n\n📝 Characters: ${chars}\n📖 Words: ${words}\n📄 Lines: ${lines}\n📋 Sentences: ${sentences}`);
    },
  },
  {
    name: ["uppercase", "upper"],
    category: "tools",
    desc: "Convert to uppercase",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply("Provide text or reply to a message.");
      await m.reply(input.toUpperCase());
    },
  },
  {
    name: ["lowercase", "lower"],
    category: "tools",
    desc: "Convert to lowercase",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply("Provide text or reply to a message.");
      await m.reply(input.toLowerCase());
    },
  },
  {
    name: ["mock", "spongebob"],
    category: "fun",
    desc: "mOcKiNg SpOnGeBoB text",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply("Provide text or reply to a message.");
      const mocked = input.split("").map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join("");
      await m.reply(mocked);
    },
  },
  {
    name: ["clap"],
    category: "fun",
    desc: "Add 👏 between words",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply("Provide text or reply to a message.");
      await m.reply(input.split(" ").join(" 👏 "));
    },
  },
  {
    name: ["space", "vaporwave"],
    category: "fun",
    desc: "V A P O R W A V E text",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply("Provide text or reply to a message.");
      await m.reply(input.split("").join(" "));
    },
  },
  {
    name: ["fancy", "style"],
    category: "fun",
    desc: "Convert text to fancy styles",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}fancy <text>`);
      const styles = {
        bold: text.replace(/[a-zA-Z]/g, (c) => String.fromCodePoint(c.charCodeAt(0) + (c >= "a" ? 0x1D5EE - 0x61 : 0x1D5D4 - 0x41))),
        italic: text.replace(/[a-zA-Z]/g, (c) => String.fromCodePoint(c.charCodeAt(0) + (c >= "a" ? 0x1D622 - 0x61 : 0x1D608 - 0x41))),
        mono: text.replace(/[a-zA-Z]/g, (c) => String.fromCodePoint(c.charCodeAt(0) + (c >= "a" ? 0x1D68A - 0x61 : 0x1D670 - 0x41))),
        circled: text.replace(/[a-zA-Z]/g, (c) => String.fromCodePoint(c.charCodeAt(0) + (c >= "a" ? 0x24D0 - 0x61 : 0x24B6 - 0x41))),
      };
      let msg = `✨ *Fancy Text Styles*\n\n`;
      msg += `*Bold:* ${styles.bold}\n`;
      msg += `*Italic:* ${styles.italic}\n`;
      msg += `*Mono:* ${styles.mono}\n`;
      msg += `*Circled:* ${styles.circled}\n`;
      await m.reply(msg);
    },
  },
  {
    name: ["datetime", "time", "date"],
    category: "tools",
    desc: "Show current date and time",
    handler: async (sock, m, { text }) => {
      const moment = require("moment-timezone");
      const tz = text || config.TIMEZONE;
      try {
        const now = moment().tz(tz);
        await m.reply(`🕐 *Date & Time*\n\n📅 Date: ${now.format("dddd, MMMM D, YYYY")}\n⏰ Time: ${now.format("hh:mm:ss A")}\n🌐 Timezone: ${tz}`);
      } catch {
        await m.reply("❌ Invalid timezone. Example: Africa/Accra, Asia/Tokyo, America/New_York");
      }
    },
  },
  {
    name: ["remind", "reminder"],
    category: "tools",
    desc: "Set a reminder",
    handler: async (sock, m, { args }) => {
      const minutes = parseInt(args[0]);
      const message = args.slice(1).join(" ");
      if (!minutes || !message) return m.reply(`Usage: ${config.PREFIX}remind <minutes> <message>\nExample: ${config.PREFIX}remind 5 Time to eat!`);
      if (minutes > 1440) return m.reply("Maximum reminder time is 24 hours (1440 minutes).");
      await m.reply(`⏰ Reminder set for ${minutes} minutes from now!`);
      setTimeout(async () => {
        await sock.sendMessage(m.chat, {
          text: `⏰ *Reminder for @${m.sender.split("@")[0]}*\n\n${message}`,
          mentions: [m.sender],
        });
      }, minutes * 60000);
    },
  },
];

module.exports = { commands };