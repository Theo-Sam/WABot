const config = require("../config");
const path = require("path");
const { setEnvValue } = require("../lib/env-util");
const { downloadMediaMessage, getContentType, jidNormalizedUser } = require("@whiskeysockets/baileys");

function isAutoStatusViewEnabled() {
  return String(config.AUTO_STATUS_VIEW || "off").toLowerCase() === "on";
}

function isAutoStatusSaveEnabled() {
  return String(config.AUTO_STATUS_SAVE || "on").toLowerCase() === "on";
}

function getOwnerJid(sock) {
  const ownerNumber = String(config.OWNER_NUMBER || "").replace(/[^0-9]/g, "");
  if (ownerNumber) return jidNormalizedUser(`${ownerNumber}@s.whatsapp.net`);
  if (sock?.user?.id) return jidNormalizedUser(sock.user.id);
  return "";
}

function getStatusSaveTargetChat(sock, m) {
  if (m.chat !== "status@broadcast") return m.chat;
  return getOwnerJid(sock) || m.sender || m.chat;
}

const commands = [
  {
    name: ["statusdl", "statussave", "savestatus", "dlstatus", "save", "savestory", "storysave"],
    category: "status",
    desc: "Download recent WhatsApp statuses",
    owner: true,
    handler: async (sock, m, { args }) => {
      const quotedStatusData =
        m.chat === "status@broadcast" && m.quoted
          ? {
              key: m.quoted.key,
              message: m.quoted.message,
              type: m.quoted.type,
              sender: m.quoted.sender,
              pushName: m.quoted.pushName || m.quoted.sender?.split("@")[0] || "Unknown",
              timestamp: Date.now(),
            }
          : null;

      let statusCache;
      try {
        statusCache = require("../lib/connection").statusCache;
      } catch {
        return m.reply("❌ Status cache not available.");
      }
      console.log(`[DESAM-STATUS] Status retrieval requested by ${m.sender} | cached_records=${statusCache?.size || 0}`);
      if (!quotedStatusData && (!statusCache || statusCache.size === 0)) {
        console.log("[DESAM-STATUS] Status retrieval returned empty cache.");
        const autoViewState = isAutoStatusViewEnabled() ? "on" : "off";
        const guidance = autoViewState === "on"
          ? "Auto-view is already ON. Ask a contact to post a new status, wait a few seconds, then run statusdl list again."
          : `Enable auto-view with ${config.PREFIX}statusview on or set AUTO_STATUS_VIEW=on in .env, then try again after a new status arrives.`;
        return m.reply(`📭 No recent statuses cached.\n\nAUTO_STATUS_VIEW is currently: *${autoViewState}*\n${guidance}`);
      }
      const targetChat = getStatusSaveTargetChat(sock, m);
      const arg0 = String(args[0] || "").toLowerCase();
      const orderedEntries = [...statusCache.entries()].sort((a, b) => (a[1]?.timestamp || 0) - (b[1]?.timestamp || 0));
      if (arg0 === "list") {
        let list = `📡 *Recent Statuses*\n`;
        list += `Total cached: ${orderedEntries.length}\n\n`;
        let i = 1;
        for (const [, data] of orderedEntries) {
          const name = data.pushName || data.sender?.split("@")[0] || "Unknown";
          const typeLabel = data.type?.replace("Message", "") || "text";
          const ago = Math.floor((Date.now() - data.timestamp) / 60000);
          list += `${i}. *${name}* — ${typeLabel} • ${ago}m ago\n`;
          i++;
        }
        list += `\nUse ${config.PREFIX}statusdl <number> to fetch one, or ${config.PREFIX}save to fetch latest.`;
        return m.reply(list);
      }

      let index = orderedEntries.length - 1;
      if (arg0 && arg0 !== "latest") {
        index = parseInt(arg0, 10) - 1;
        if (isNaN(index) || index < 0 || index >= orderedEntries.length) {
          return m.reply("❌ Invalid number. Use list to pick a valid status or use 'latest'.");
        }
      }
      m.react("⏳");
      try {
        let data;
        if (quotedStatusData && (!arg0 || arg0 === "latest")) {
          data = quotedStatusData;
        } else {
          const [, selectedData] = orderedEntries[index] || [];
          data = selectedData;
        }

        if (!data) {
          return m.reply("❌ Could not find a status to save.");
        }

        const rawType = data.type || getContentType(data.message) || Object.keys(data.message || {})[0];
        const msg = data.message || {};
        const credit = `📡 *Status from ${data.pushName || "Unknown"}*`;

        // Normalize document mime — some clients send video/audio as documentMessage
        const docMime = msg.documentMessage?.mimetype || "";
        const isDocVideo = rawType === "documentMessage" && docMime.startsWith("video/");
        const isDocAudio = rawType === "documentMessage" && docMime.startsWith("audio/");

        // GIFs arrive as videoMessage with gifPlayback:true
        const isGif = rawType === "videoMessage" && !!msg.videoMessage?.gifPlayback;

        console.log(`[DESAM-STATUS] Saving type=${rawType} isDocVideo=${isDocVideo} isDocAudio=${isDocAudio} isGif=${isGif} from ${data.pushName || "Unknown"}`);

        const MEDIA_TYPES = ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage", "ptvMessage"];

        if (rawType === "conversation" || rawType === "extendedTextMessage") {
          // ── Plain / rich text status ─────────────────────────────────────────
          const text = msg.conversation || msg.extendedTextMessage?.text || "";
          await sock.sendMessage(targetChat, { text: `${credit}\n\n${text}` }, { quoted: { key: m.key, message: m.message } });

        } else if (MEDIA_TYPES.includes(rawType) || isDocVideo || isDocAudio) {
          // ── All media types (image / video / audio / sticker / document) ─────
          let buffer;
          try {
            buffer = await downloadMediaMessage(
              { key: data.key, message: msg },
              "buffer",
              {},
              { reuploadRequest: sock.updateMediaMessage }
            );
          } catch (dlErr) {
            console.error(`[DESAM-STATUS] downloadMediaMessage failed: ${dlErr.message}`);
            return m.reply("❌ Failed to download status media. It may have expired — statuses are only available for 24 hours.");
          }
          if (!buffer || buffer.length < 100) return m.reply("❌ Downloaded media appears empty or corrupt.");

          let mediaOpts = {};
          if (rawType === "imageMessage") {
            mediaOpts = { image: buffer, caption: credit };
          } else if (rawType === "videoMessage") {
            if (isGif) {
              mediaOpts = { video: buffer, caption: credit, gifPlayback: true };
            } else {
              mediaOpts = { video: buffer, caption: credit };
            }
          } else if (rawType === "audioMessage" || rawType === "ptvMessage") {
            mediaOpts = { audio: buffer, mimetype: "audio/mp4", ptt: rawType === "ptvMessage" };
          } else if (rawType === "stickerMessage") {
            mediaOpts = { sticker: buffer };
          } else if (isDocVideo) {
            mediaOpts = { video: buffer, caption: credit };
          } else if (isDocAudio) {
            mediaOpts = { audio: buffer, mimetype: docMime || "audio/mp4", ptt: false };
          } else {
            // Generic documentMessage (PDF, ZIP, etc.)
            mediaOpts = {
              document: buffer,
              mimetype: docMime || "application/octet-stream",
              fileName: msg.documentMessage?.fileName || "status-file",
              caption: credit,
            };
          }
          await sock.sendMessage(targetChat, mediaOpts, { quoted: { key: m.key, message: m.message } });

        } else if (rawType === "contactMessage") {
          // ── Contact card ──────────────────────────────────────────────────────
          const vcard = msg.contactMessage?.vcard || "";
          const name = msg.contactMessage?.displayName || "Contact";
          await sock.sendMessage(targetChat, {
            contacts: { displayName: name, contacts: [{ vcard }] },
          }, { quoted: { key: m.key, message: m.message } });
          await sock.sendMessage(targetChat, { text: `${credit}\n_Contact status_` }, { quoted: { key: m.key, message: m.message } });

        } else if (rawType === "contactsArrayMessage") {
          // ── Multiple contacts ─────────────────────────────────────────────────
          const contacts = (msg.contactsArrayMessage?.contacts || []).map(c => ({ vcard: c.vcard }));
          const names = (msg.contactsArrayMessage?.contacts || []).map(c => c.displayName).join(", ");
          await sock.sendMessage(targetChat, {
            contacts: { displayName: names || "Contacts", contacts },
          }, { quoted: { key: m.key, message: m.message } });
          await sock.sendMessage(targetChat, { text: `${credit}\n_Contacts status_` }, { quoted: { key: m.key, message: m.message } });

        } else if (rawType === "locationMessage" || rawType === "liveLocationMessage") {
          // ── Location status ───────────────────────────────────────────────────
          const loc = msg.locationMessage || msg.liveLocationMessage || {};
          const locName = loc.name || loc.address || "";
          await sock.sendMessage(targetChat, {
            location: { degreesLatitude: loc.degreesLatitude, degreesLongitude: loc.degreesLongitude },
          }, { quoted: { key: m.key, message: m.message } });
          await sock.sendMessage(targetChat, {
            text: `${credit}\n_Location status_${locName ? `\n📍 ${locName}` : ""}`,
          }, { quoted: { key: m.key, message: m.message } });

        } else if (rawType === "templateMessage") {
          // ── Template / button message — extract text ──────────────────────────
          const tmpl = msg.templateMessage?.hydratedTemplate || msg.templateMessage || {};
          const text = tmpl.hydratedContentText || tmpl.hydratedTitleText || JSON.stringify(tmpl);
          await sock.sendMessage(targetChat, { text: `${credit}\n\n${text}` }, { quoted: { key: m.key, message: m.message } });

        } else if (rawType === "buttonsMessage" || rawType === "interactiveMessage" || rawType === "listMessage") {
          // ── Interactive / list / buttons — extract text ───────────────────────
          const b = msg.buttonsMessage || msg.listMessage || msg.interactiveMessage || {};
          const text = b.contentText || b.title || b.description || b.buttonText?.displayText || JSON.stringify(b).slice(0, 200);
          await sock.sendMessage(targetChat, { text: `${credit}\n\n${text}` }, { quoted: { key: m.key, message: m.message } });

        } else {
          // ── Unknown type — dump raw so we know what it is ─────────────────────
          console.warn(`[DESAM-STATUS] Unknown status type: ${rawType} — dumping message keys: ${Object.keys(msg).join(", ")}`);
          const fallbackText = JSON.stringify(msg).slice(0, 300);
          await sock.sendMessage(targetChat, {
            text: `${credit}\n\n_Unknown status type: ${rawType}_\n\`\`\`${fallbackText}\`\`\``,
          }, { quoted: { key: m.key, message: m.message } });
        }
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply("❌ Failed to download status.");
      }
    },
  },
  {
    name: ["setstatusreact", "statusreact", "autoreact"],
    category: "status",
    desc: "Toggle auto-react to statuses",
    owner: true,
    handler: async (sock, m, { text }) => {
      const mode = String(text || "").trim().toLowerCase();
      if (mode === "on") {
        config.AUTO_STATUS_REACT = "on";
        console.log("[DESAM-STATUS] AUTO_STATUS_REACT toggled ON via command.");
        await m.reply("✅ Auto status react enabled. The bot will react to viewed statuses.");
      } else if (mode === "off") {
        config.AUTO_STATUS_REACT = "off";
        console.log("[DESAM-STATUS] AUTO_STATUS_REACT toggled OFF via command.");
        await m.reply("✅ Auto status react disabled.");
      } else {
        await m.reply(`Usage: ${config.PREFIX}statusreact on/off\nCurrent: ${config.AUTO_STATUS_REACT || "off"}`);
      }
    },
  },
  {
    name: ["setstatusview", "statusview", "autoview", "autostatusview", "autostatus"],
    category: "status",
    desc: "Toggle auto-viewing of statuses",
    owner: true,
    handler: async (sock, m, { text }) => {
      const mode = String(text || "").trim().toLowerCase();
      const envPath = path.join(__dirname, "..", ".env");
      let newValue = config.AUTO_STATUS_VIEW;
      if (!mode || mode === "toggle") {
        newValue = isAutoStatusViewEnabled() ? "off" : "on";
        config.AUTO_STATUS_VIEW = newValue;
        setEnvValue(envPath, "AUTO_STATUS_VIEW", newValue);
        console.log(`[DESAM-STATUS] AUTO_STATUS_VIEW toggled ${String(newValue).toUpperCase()} via statusview command.`);
        return m.reply(`✅ Auto status view is now *${newValue}* (persisted).`);
      }
      if (mode === "on") {
        newValue = "on";
        config.AUTO_STATUS_VIEW = newValue;
        setEnvValue(envPath, "AUTO_STATUS_VIEW", newValue);
        console.log("[DESAM-STATUS] AUTO_STATUS_VIEW toggled ON via statusview command.");
        await m.reply("✅ Auto status view enabled. New statuses will be marked as seen automatically. (persisted)");
      } else if (mode === "off") {
        newValue = "off";
        config.AUTO_STATUS_VIEW = newValue;
        setEnvValue(envPath, "AUTO_STATUS_VIEW", newValue);
        console.log("[DESAM-STATUS] AUTO_STATUS_VIEW toggled OFF via statusview command.");
        await m.reply("✅ Auto status view disabled. (persisted)");
      } else if (mode === "status" || mode === "state") {
        await m.reply(
          `ℹ️ Status settings:\n` +
          `▸ Auto-view: *${config.AUTO_STATUS_VIEW || "off"}*\n` +
          `▸ Auto-save: *${config.AUTO_STATUS_SAVE || "on"}*`
        );
      } else {
        await m.reply(`Usage: ${config.PREFIX}autoview on/off/toggle\nCurrent: ${config.AUTO_STATUS_VIEW || "off"}`);
      }
    },
  },
  {
    name: ["statusave", "autosave", "autostatussave", "setstatussave"],
    category: "status",
    desc: "Toggle auto-saving of statuses to cache",
    owner: true,
    handler: async (sock, m, { text }) => {
      const mode = String(text || "").trim().toLowerCase();
      const envPath = path.join(__dirname, "..", ".env");
      let newValue = config.AUTO_STATUS_SAVE;
      if (!mode || mode === "toggle") {
        newValue = isAutoStatusSaveEnabled() ? "off" : "on";
        config.AUTO_STATUS_SAVE = newValue;
        setEnvValue(envPath, "AUTO_STATUS_SAVE", newValue);
        console.log(`[DESAM-STATUS] AUTO_STATUS_SAVE toggled ${String(newValue).toUpperCase()} via statusave command.`);
        return m.reply(`✅ Auto status save is now *${newValue}* (persisted).`);
      }
      if (mode === "on") {
        newValue = "on";
        config.AUTO_STATUS_SAVE = newValue;
        setEnvValue(envPath, "AUTO_STATUS_SAVE", newValue);
        console.log("[DESAM-STATUS] AUTO_STATUS_SAVE toggled ON via statusave command.");
        await m.reply("✅ Auto status save enabled. New statuses will be cached for .statusdl. (persisted)");
      } else if (mode === "off") {
        newValue = "off";
        config.AUTO_STATUS_SAVE = newValue;
        setEnvValue(envPath, "AUTO_STATUS_SAVE", newValue);
        console.log("[DESAM-STATUS] AUTO_STATUS_SAVE toggled OFF via statusave command.");
        await m.reply("✅ Auto status save disabled. Statuses will NOT be cached. (persisted)");
      } else if (mode === "status" || mode === "state") {
        await m.reply(
          `ℹ️ Status settings:\n` +
          `▸ Auto-view: *${config.AUTO_STATUS_VIEW || "off"}*\n` +
          `▸ Auto-save: *${config.AUTO_STATUS_SAVE || "on"}*`
        );
      } else {
        await m.reply(`Usage: ${config.PREFIX}statusave on/off/toggle\nCurrent: ${config.AUTO_STATUS_SAVE || "on"}`);
      }
    },
  },
];

module.exports = { commands };
