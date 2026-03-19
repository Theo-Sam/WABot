const config = require("../config");
const { fetchBuffer, fetchJson, isUrl, getSelfJid, pickNonRepeating } = require("../lib/helpers");

const imageSearchCaptions = [
  "🔍 *Image Search Result*",
  "🖼️ *Found This For You*",
  "✨ *Visual Match*",
  "📸 *Top Image Pick*",
];

const commands = [
  {
    name: ["img", "image", "gimage"],
    category: "search",
    desc: "Search for images",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}img <query>`);
      m.react("⏳");
      try {
        const unsplashKey = process.env.UNSPLASH_ACCESS_KEY || "";
          // Use open image search fallback (duckduckgo images)
          const ddg = await fetchJson(`https://duckduckgo-image-search.vercel.app/api/search?q=${encodeURIComponent(text)}&count=1`).catch(() => null);
          imageUrl = ddg?.results?.[0]?.image || "";
        if (unsplashKey) {
          const data = await fetchJson(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(text)}&page=1&per_page=1&orientation=landscape&client_id=${encodeURIComponent(unsplashKey)}`).catch(() => null);
          imageUrl = data?.results?.[0]?.urls?.regular || "";
        }

        if (!imageUrl) {
          return m.reply("❌ Unsplash API key is required for image search. Set UNSPLASH_ACCESS_KEY in your environment.");
        }

        const buffer = await fetchBuffer(imageUrl);
        const heading = pickNonRepeating(imageSearchCaptions, `${m.chat}:img-caption`, { maxHistory: 2 });
        await sock.sendMessage(m.chat, {
          image: buffer,
          caption: `${heading}\nQuery: ${text}\n\n_Powered by Desam Tech_`,
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
        // Use open image upload fallback (uguu.se)
        const res = await axios.post("https://uguu.se/upload.php", form, {
          headers: { ...form.getHeaders() },
          timeout: 30000,
        });
        if (res.data && res.data.files?.[0]?.url) {
          await m.reply(`✅ *Image Uploaded*\n\n${res.data.files[0].url}`);
          m.react("✅");
        } else {
          throw new Error("Upload failed");
        }
          await m.reply(`✅ *Image Uploaded*\n\n${res.data.data.link}`);
          m.react("✅");
        } else {
          throw new Error("Upload failed");
        }
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
        const caption = m.quoted.message[mediaType]?.caption || "";
        const ownerNum = config.OWNER_NUMBER?.replace(/[^0-9]/g, "") || "";
        const ownerJid = ownerNum ? `${ownerNum}@s.whatsapp.net` : getSelfJid(sock);
        if (!ownerJid) {
          m.react("❌");
          return m.reply("❌ Could not determine owner number. Set OWNER_NUMBER or pair the bot first.");
        }
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
      } catch (err) {
        console.error("[DESAM] ViewOnce error:", err);
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
        const caption = m.quoted.message[mediaType]?.caption || "";

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
      } catch (err) {
        console.error("[DESAM] ViewOnce DM error:", err);
        m.react("❌");
        await m.reply("❌ Failed to reveal view once message.");
      }
    },
  },
];

module.exports = { commands };