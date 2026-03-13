const config = require("../config");
const { fetchBuffer, isUrl, getSelfJid } = require("../lib/helpers");

const commands = [
  {
    name: ["img", "image", "gimage"],
    category: "search",
    desc: "Search for images",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}img <query>`);
      m.react("⏳");
      try {
        const imageUrl = await Promise.any([
          (async () => {
            const data = await require("../lib/helpers").fetchJson(`https://api.lolhuman.xyz/api/gimage2?apikey=GataDios&query=${encodeURIComponent(text)}`);
            if (!data?.result) throw new Error("empty");
            return data.result;
          })(),
          (async () => {
            // Immediately resolve the unsplash random URL as a valid fallback
            return `https://source.unsplash.com/random/800x600/?${encodeURIComponent(text)}`;
          })()
        ]).catch(() => `https://source.unsplash.com/random/800x600/?${encodeURIComponent(text)}`);
        const buffer = await fetchBuffer(imageUrl);
        await sock.sendMessage(m.chat, {
          image: buffer,
          caption: `🔍 *Image Search*\nQuery: ${text}\n\n_Powered by Desam Tech_`,
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
        const FormData = (await import("form-data")).default;
        const axios = require("axios");
        const form = new FormData();
        form.append("file", buffer, { filename: "image.jpg", contentType: "image/jpeg" });
        const res = await axios.post("https://telegra.ph/upload", form, {
          headers: form.getHeaders(),
          timeout: 30000,
        });
        if (res.data && res.data[0]?.src) {
          await m.reply(`✅ *Image Uploaded*\n\nhttps://telegra.ph${res.data[0].src}`);
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
        if (!ownerJid) return m.reply("❌ Could not determine owner number. Set OWNER_NUMBER or pair the bot first.");
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