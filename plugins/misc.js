const config = require("../config");
const { fetchBuffer, fetchJson, postJson, postBuffer, isUrl, pickNonRepeating } = require("../lib/helpers");

const fallbackMemes = [
  { title: "When code works on first run", subtitle: "Everyone acts normal, but inside you're shocked.", subreddit: "programmerhumor" },
  { title: "Deploy Friday?", subtitle: "Bold strategy, team.", subreddit: "memes" },
  { title: "One bug fixed, two appear", subtitle: "Classic software lifecycle.", subreddit: "coding" },
  { title: "Refactor complete", subtitle: "Same behavior, 3x confidence.", subreddit: "dev" },
  { title: "API down at demo time", subtitle: "Plan B is now Plan A.", subreddit: "techhumor" },
];

const catCaptions = ["🐱 *Cat Drop*", "🐾 *Feline Moment*", "🐈 *Cat of the Minute*", "😺 *Mood Booster Cat*", "🧶 *Tiny Tiger Update*"];
const dogCaptions = ["🐶 *Dog Drop*", "🐾 *Good Boy/Girl Alert*", "🦴 *Paw-some Moment*", "🐕 *Dog of the Minute*", "🎾 *Tail-Wag Update*"];
const foxCaptions = ["🦊 *Fox Drop*", "🍂 *Wild Fox Moment*", "✨ *Floof Alert*", "🌲 *Forest Vibes*", "🧡 *Fox of the Minute*"];

const commands = [
  {
    name: ["qr", "qrcode"],
    category: "tools",
    desc: "Generate QR code",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("qr <text or URL>");
      m.react("⏳");
      try {
        const buffer = await fetchBuffer(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`);
        await sock.sendMessage(m.chat, { image: buffer, caption: `📱 *QR Code*\n\nContent: ${text}` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("QR Generator");
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
        const form = new FormData();
        form.append("file", buffer, { filename: "qr.png", contentType: "image/png" });
        const res = await postJson("https://api.qrserver.com/v1/read-qr-code/", form, { headers: form.getHeaders(), timeout: 15000 });
        const data = res?.[0]?.symbol?.[0]?.data;
        if (!data) return m.reply("❌ No QR code detected.");
        await m.reply(`📱 *QR Code Content*\n\n${data}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("QR Reader");
      }
    },
  },
  {
    name: ["shorturl", "short", "tinyurl"],
    category: "tools",
    desc: "Shorten a URL",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.usageReply("shorturl <URL>");
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

        if (!shortUrl) return m.apiErrorReply("URL Shortener");
        await m.reply(`🔗 *Short URL*\n\n${shortUrl}`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("URL Shortener");
      }
    },
  },
  {
    name: ["screenshot", "ss", "ssweb"],
    category: "tools",
    desc: "Take website screenshot",
    handler: async (sock, m, { text }) => {
      if (!text || !isUrl(text)) return m.usageReply("screenshot <URL>");
      m.react("⏳");
      try {
        const thumIoUrl = `https://image.thum.io/get/width/1920/noanimate/${text}`;
        const buffer = await fetchBuffer(thumIoUrl).catch(() => null);

        if (!buffer) return m.errorReply("Screenshot service is currently busy.", "Try again in a moment.");
        await sock.sendMessage(m.chat, { image: buffer, caption: `📸 *Screenshot*\n\n🔗 ${text}` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Screenshot");
      }
    },
  },
  {
    name: ["meme"],
    category: "fun",
    desc: "Get a random meme",
    handler: async (sock, m, { text }) => {
      m.react("😂");
      try {
        // If user provides text, use it as meme caption, else random meme
        let memeUrl = "";
        let caption = "";
        if (text) {
          // Use memegen.link API for custom caption
          // Format: top/bottom, spaces as _
          const [top, ...bottomArr] = text.split("|");
          const topText = encodeURIComponent((top || "").replace(/ /g, "_") || "_");
          const bottomText = encodeURIComponent((bottomArr.join("|") || "").replace(/ /g, "_") || "_");
          // Pick a random template from memegen.link/templates
          const templates = [
            "buzz", "doge", "drake", "gru", "joker", "kermit", "spongebob", "disastergirl",
            "expandingbrain", "twobuttons", "change", "batman", "distractedbf", "success",
            "sad-biden", "fry", "wonka", "fine", "uno", "picard", "aag", "both",
            "dennis", "hide", "iw", "money", "oag", "oprah", "patrick",
            "philosoraptor", "rollsafe", "sadfrog", "salt", "sparta", "third",
            "uno", "winter", "woody", "y-u-no", "yoda"
          ];
          const template = templates[Math.floor(Math.random() * templates.length)];
          memeUrl = `https://api.memegen.link/images/${template}/${topText}/${bottomText}.png`;
          caption = `😂 *Meme Generator*\n\n${top || ""}\n${bottomArr.join("|") || ""}`;
        } else {
          // Use random meme from memegen.link
          memeUrl = "https://api.memegen.link/images/random.png";
          caption = "😂 *Random Meme*\n\n_Source: memegen.link_";
        }
        const buffer = await fetchBuffer(memeUrl);
        await sock.sendMessage(m.chat, { image: buffer, caption }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        const mm = pickNonRepeating(fallbackMemes, `${m.chat}:meme`, { maxHistory: 4 });
        await m.reply(`😂 *${mm.title}*\n\n${mm.subtitle}\n📍 r/${mm.subreddit}\n📡 Source: Local fallback`);
        m.react("✅");
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
        const data = await fetchJson("https://nekos.best/api/v2/cat");
        const buffer = await fetchBuffer(data.results[0].url);
        const caption = pickNonRepeating(catCaptions, `${m.chat}:cat-caption`, { maxHistory: 3 });
        await sock.sendMessage(m.chat, { image: buffer, caption: `${caption}\n\n_Type ${config.PREFIX}cat for another._` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Cat");
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
        const data = await fetchJson("https://nekos.best/api/v2/dog");
        const buffer = await fetchBuffer(data.results[0].url);
        const caption = pickNonRepeating(dogCaptions, `${m.chat}:dog-caption`, { maxHistory: 3 });
        await sock.sendMessage(m.chat, { image: buffer, caption: `${caption}\n\n_Type ${config.PREFIX}dog for another._` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Dog");
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
        const data = await fetchJson("https://nekos.best/api/v2/fox");
        const buffer = await fetchBuffer(data.results[0].url);
        const caption = pickNonRepeating(foxCaptions, `${m.chat}:fox-caption`, { maxHistory: 3 });
        await sock.sendMessage(m.chat, { image: buffer, caption: `${caption}\n\n_Type ${config.PREFIX}fox for another._` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Fox");
      }
    },
  },
  {
    name: ["carbon", "carbonize"],
    category: "tools",
    desc: "Create code snippet image",
    handler: async (sock, m, { text }) => {
      const code = text || m.quoted?.body || "";
      if (!code) return m.usageReply("carbon <code> or reply to a message");
      m.react("⏳");
      try {
        const buffer = await postBuffer("https://carbonara.solopov.dev/api/cook", {
          code,
          theme: "one-dark",
          fontFamily: "JetBrains Mono",
        }, { timeout: 30000 });
        await sock.sendMessage(m.chat, { image: buffer, caption: "💻 *Code Snippet*" }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        const preview = String(code).trim().slice(0, 3000);
        await m.reply(`💻 *Code Snippet (fallback)*\n\n\`\`\`\n${preview}\n\`\`\`\n\n⚠️ Image renderer is temporarily unavailable, so I sent plain code instead.`);
        m.react("✅");
      }
    },
  },
  {
    name: ["color", "hex", "hexcolor"],
    category: "tools",
    desc: "Generate color preview",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("color <hex>", "color ff5733");
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
      if (!text) return m.usageReply("encode <text>");
      const encoded = text.replace(/[a-zA-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < "n" ? 13 : -13)));
      await m.reply(`🔐 *Encoded (ROT13)*\n\n${encoded}`);
    },
  },
  {
    name: ["decode", "decrypt"],
    category: "tools",
    desc: "Decode ROT13 text",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("decode <text>");
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
      if (!input) return m.usageReply("reverse <text>");
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
      if (!msg) return m.usageReply("repeat <count> <message>");
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
      if (!input) return m.usageReply("count <text> or reply to a message");
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
      if (!text) return m.usageReply("fancy <text>");
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
      if (!minutes || !message) return m.usageReply("remind <minutes> <message>", "remind 5 Time to eat!");
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