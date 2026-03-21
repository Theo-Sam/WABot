const config = require("../config");
const { fetchBuffer, fetchJson, getSelfJid, pickNonRepeating } = require("../lib/helpers");
const { endpoints } = require("../lib/endpoints");
const axios = require("axios");
const FormData = require("form-data");

const imageSearchCaptions = [
  "🔍 *Image Search Result*",
  "🖼️ *Found This For You*",
  "✨ *Visual Match*",
  "📸 *Top Image Pick*",
];

async function findImageUrl(query) {
  const unsplashKey = (process.env.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_ACCESS_KEY || "").trim();
  if (unsplashKey) {
    const data = await fetchJson(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=1&per_page=1&orientation=landscape&client_id=${encodeURIComponent(unsplashKey)}`
    ).catch(() => null);
    const url = data?.results?.[0]?.urls?.regular;
    if (url) return url;
  }
  // Loremflickr — free topic-based random images, no key needed
  const kw = encodeURIComponent(query.replace(/\s+/g, ",").slice(0, 50));
  return `${endpoints.images.unsplashRandom}/1080/1080/${kw}`;
}

async function uploadImageTo0x0(buffer) {
  const form = new FormData();
  form.append("file", buffer, { filename: "image.jpg" });
  const res = await axios.post(endpoints.images.upload0x0, form, {
    headers: form.getHeaders(),
    timeout: 30000,
    maxBodyLength: Infinity,
  });
  const url = String(res.data || "").trim();
  if (!url.startsWith("http")) throw new Error("Upload failed");
  return url;
}

const commands = [
  {
    name: ["img", "image", "gimage"],
    category: "search",
    desc: "Search for images",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}img <query>`);
      m.react("⏳");
      try {
        const imageUrl = await findImageUrl(text);
        const buffer = await fetchBuffer(imageUrl, { timeout: 30000 });
        const heading = pickNonRepeating(imageSearchCaptions, `${m.chat}:img-caption`, { maxHistory: 2 });
        await sock.sendMessage(m.chat, {
          image: buffer,
          caption: `${heading}\nQuery: ${text}\n\n_${config.BOT_NAME}_`,
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Image Search API is currently overloaded.");
      }
    },
  },
  {
    name: ["url", "imgurl", "tourl"],
    category: "tools",
    desc: "Upload image and get URL",
    handler: async (sock, m) => {
      const media = m.isImage ? m : m.quoted?.isImage ? m.quoted : null;
      if (!media) return m.reply(`Reply to an image with ${config.PREFIX}url`);
      m.react("⏳");
      try {
        const buffer = await media.download();
        const url = await uploadImageTo0x0(buffer);
        await m.reply(`✅ *Image Uploaded*\n\n${url}`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Image Upload API is currently overloaded.");
      }
    },
  },
  {
    name: ["viewonce", "vo", "vv"],
    category: "media",
    desc: "Send view once media to owner's DM",
    handler: async (sock, m) => {
      if (!m.quoted) return m.reply("Reply to a view once message.");
      if (!m.quoted.isViewOnce) return m.reply("❌ That's not a view once message.");
      m.react("⏳");
      try {
        const buffer = await m.quoted.download();
        const mediaType = m.quoted.type;
        const caption = m.quoted.message?.[mediaType]?.caption || "";
        const ownerNum = config.OWNER_NUMBER?.replace(/[^0-9]/g, "") || "";
        const ownerJid = ownerNum ? `${ownerNum}@s.whatsapp.net` : getSelfJid(sock);
        if (!ownerJid) return m.reply("❌ Could not determine owner number. Set OWNER_NUMBER.");
        const fromLabel = m.pushName || m.sender.split("@")[0];
        const fullCaption = `👁️ *View Once from ${fromLabel}*\n${m.isGroup ? `Group: ${m.chat}` : "DM"}\n\n${caption}`;
        if (mediaType.includes("image")) {
          await sock.sendMessage(ownerJid, { image: buffer, caption: fullCaption });
        } else if (mediaType.includes("video")) {
          await sock.sendMessage(ownerJid, { video: buffer, caption: fullCaption });
        } else if (mediaType.includes("audio")) {
          await sock.sendMessage(ownerJid, { audio: buffer, mimetype: "audio/mpeg" });
        } else {
          return m.reply("❌ Unsupported media type.");
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to reveal view once message.");
      }
    },
  },
  {
    name: ["vv2", "viewonce2"],
    category: "media",
    desc: "Re-send view once media in this chat",
    handler: async (sock, m) => {
      if (!m.quoted) return m.reply("Reply to a view once message.");
      if (!m.quoted.isViewOnce) return m.reply("❌ That's not a view once message.");
      m.react("⏳");
      try {
        const buffer = await m.quoted.download();
        const mediaType = m.quoted.type;
        const caption = m.quoted.message?.[mediaType]?.caption || "";
        if (mediaType.includes("image")) {
          await sock.sendMessage(m.chat, { image: buffer, caption: `👁️ *View Once Revealed*\n\n${caption}` });
        } else if (mediaType.includes("video")) {
          await sock.sendMessage(m.chat, { video: buffer, caption: `👁️ *View Once Revealed*\n\n${caption}` });
        } else if (mediaType.includes("audio")) {
          await sock.sendMessage(m.chat, { audio: buffer, mimetype: "audio/mpeg" });
        } else {
          return m.reply("❌ Unsupported media type.");
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to reveal view once message.");
      }
    },
  },
];

module.exports = { commands };