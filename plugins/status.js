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

function isStatusReplyContext(m) {
  // Direct status@broadcast context
  if (m.chat === "status@broadcast") return true;
  // WhatsApp routes status replies as DMs to the poster — detect by quoted remoteJid
  if (m.quoted?.key?.remoteJid === "status@broadcast") return true;
  return false;
}

function getStatusSaveTargetChat(sock, m) {
  if (!isStatusReplyContext(m)) return m.chat;
  return getOwnerJid(sock) || m.sender || m.chat;
}

const commands = [
  {
    name: ["statusdl", "statussave", "savestatus", "dlstatus", "save", "savestory", "storysave"],
    category: "status",
    desc: "Download recent WhatsApp statuses",
    owner: true,
    handler: async (sock, m, { args }) => {
      let statusCache, statusMessageIdIndex;
      try {
        const conn = require("../lib/connection");
        statusCache = conn.statusCache;
        statusMessageIdIndex = conn.statusMessageIdIndex;
      } catch {
        return m.reply("❌ Status cache not available.");
      }

      const targetChat = getStatusSaveTargetChat(sock, m);
      const inStatusCtx = isStatusReplyContext(m);

      // Helper: all text feedback goes to targetChat (owner's DM in status context)
      const sendText = (text) => sock.sendMessage(targetChat, { text });
      const react = (emoji) => {
        if (!inStatusCtx) return m.react(emoji);
        // Send reaction as text emoji to owner's DM since status-context reactions are unreliable
        return sock.sendMessage(targetChat, { react: { text: emoji, key: m.key } }).catch(() => {});
      };

      const arg0 = String(args[0] || "").toLowerCase();
      const orderedEntries = [...statusCache.entries()].sort((a, b) => (a[1]?.timestamp || 0) - (b[1]?.timestamp || 0));

      // ── list subcommand ──────────────────────────────────────────────────────
      if (arg0 === "list") {
        if (orderedEntries.length === 0) {
          return sendText(`📭 No statuses cached yet.\nEnable auto-view: ${config.PREFIX}statusview on`);
        }
        let list = `📡 *Recent Statuses* (${orderedEntries.length} cached)\n\n`;
        let i = 1;
        for (const [, data] of orderedEntries) {
          const name = data.pushName || data.sender?.split("@")[0] || "Unknown";
          const typeLabel = (data.type || "text").replace("Message", "");
          const ago = Math.floor((Date.now() - (data.timestamp || 0)) / 60000);
          list += `${i}. *${name}* — ${typeLabel} • ${ago}m ago\n`;
          i++;
        }
        list += `\nReply to a status with *${config.PREFIX}save* to save it directly.\nOr use *${config.PREFIX}statusdl <number>* to pick one by number.`;
        return sendText(list);
      }

      // ── Resolve which status to save ─────────────────────────────────────────
      // Priority 1: user quoted a message — look it up by message ID in cache
      let data = null;
      if (m.quoted?.key?.id) {
        const quotedId = m.quoted.key.id;
        // Try direct ID lookup first
        const cacheKey = statusMessageIdIndex?.get(quotedId) || `id:${quotedId}`;
        data = statusCache.get(cacheKey) || statusCache.get(`id:${quotedId}`);
        if (!data) {
          // Search by participant sender in case ID prefix differs
          for (const [, entry] of statusCache) {
            if (entry.key?.id === quotedId) { data = entry; break; }
          }
        }
        if (!data) {
          // Quoted message isn't a cached status — build from quoted fields directly
          const qMsg = m.quoted.message;
          const qType = m.quoted.type || getContentType(qMsg) || Object.keys(qMsg || {})[0] || "";
          const SKIP = ["protocolMessage","senderKeyDistributionMessage","reactionMessage","receiptMessage","pollUpdateMessage"];
          if (qMsg && qType && !SKIP.includes(qType)) {
            data = {
              key: m.quoted.key,
              message: qMsg,
              type: qType,
              sender: m.quoted.sender || m.quoted.key?.participant,
              pushName: m.quoted.pushName || m.quoted.sender?.split("@")[0] || "Unknown",
              timestamp: Date.now(),
            };
          }
        }
        if (!data) {
          return sendText("❌ That quoted message is not a saved status. Try quoting the status directly in the status tab.");
        }
      }

      // Priority 2: numeric index from cache
      if (!data && arg0 && arg0 !== "latest") {
        const index = parseInt(arg0, 10) - 1;
        if (isNaN(index) || index < 0 || index >= orderedEntries.length) {
          return sendText(`❌ Invalid number. Use *${config.PREFIX}statusdl list* to see available statuses (1–${orderedEntries.length}).`);
        }
        data = orderedEntries[index]?.[1];
      }

      // Priority 3: if sent from within the status@broadcast context with no quote,
      // pick the latest cached status from that sender (or overall latest as fallback)
      if (!data && m.chat === "status@broadcast") {
        const senderJid = m.key?.participant || m.sender || "";
        if (senderJid) {
          // Find the most recent status from this sender
          for (let i = orderedEntries.length - 1; i >= 0; i--) {
            const [, entry] = orderedEntries[i];
            if (entry.sender === senderJid) { data = entry; break; }
          }
        }
        if (!data && orderedEntries.length > 0) {
          data = orderedEntries[orderedEntries.length - 1][1];
        }
        if (!data) {
          return sendText(`📭 No statuses cached. Enable auto-view first: *${config.PREFIX}statusview on*`);
        }
      }

      // Priority 4: plain .save with no context — latest from cache
      if (!data) {
        if (orderedEntries.length === 0) {
          const autoViewState = isAutoStatusViewEnabled() ? "on" : "off";
          const guidance = autoViewState === "on"
            ? "Auto-view is ON. Wait for a new status to arrive, then try again."
            : `Enable auto-view with *${config.PREFIX}statusview on* so statuses are cached as they come in.`;
          return sendText(`📭 No statuses cached yet.\n\n${guidance}\n\nOr go to the status tab, open a status, and *reply to it* with *${config.PREFIX}save* to save that specific one.`);
        }
        data = orderedEntries[orderedEntries.length - 1][1];
      }

      console.log(`[DESAM-STATUS] Status retrieval requested by ${m.sender} | cached_records=${statusCache?.size || 0}`);
      react("⏳");

      // In status context, quoting the original status@broadcast key in a DM is invalid.
      // Use quoted only when replying within the same regular chat.
      const msgOpts = inStatusCtx ? {} : { quoted: { key: m.key, message: m.message } };

      try {

        if (!data) {
          return sendText("❌ Could not find a status to save.");
        }

        const rawType = data.type || getContentType(data.message) || Object.keys(data.message || {})[0];
        const msg = data.message || {};
        const credit = `📡 *Status from ${data.pushName || "Unknown"}*`;

        // Skip non-content protocol messages silently
        const NON_SAVEABLE = ["protocolMessage","senderKeyDistributionMessage","reactionMessage",
          "receiptMessage","pollUpdateMessage","callLogMesssage","senderKeyDistributionMessage"];
        if (!rawType || NON_SAVEABLE.includes(rawType)) {
          console.log(`[DESAM-STATUS] Skipping non-saveable type in save handler: ${rawType}`);
          react("⚠️");
          return sendText("⚠️ That status type cannot be saved (it's a system or reaction message, not a real status).");
        }

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
          await sock.sendMessage(targetChat, { text: `${credit}\n\n${text}` }, msgOpts);

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
            return sendText("❌ Failed to download status media. It may have expired — statuses are only available for 24 hours.");
          }
          if (!buffer || buffer.length < 100) return sendText("❌ Downloaded media appears empty or corrupt.");

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
          await sock.sendMessage(targetChat, mediaOpts, msgOpts);

        } else if (rawType === "contactMessage") {
          // ── Contact card ──────────────────────────────────────────────────────
          const vcard = msg.contactMessage?.vcard || "";
          const name = msg.contactMessage?.displayName || "Contact";
          await sock.sendMessage(targetChat, { contacts: { displayName: name, contacts: [{ vcard }] } }, msgOpts);
          await sock.sendMessage(targetChat, { text: `${credit}\n_Contact status_` }, msgOpts);

        } else if (rawType === "contactsArrayMessage") {
          // ── Multiple contacts ─────────────────────────────────────────────────
          const contacts = (msg.contactsArrayMessage?.contacts || []).map(c => ({ vcard: c.vcard }));
          const names = (msg.contactsArrayMessage?.contacts || []).map(c => c.displayName).join(", ");
          await sock.sendMessage(targetChat, { contacts: { displayName: names || "Contacts", contacts } }, msgOpts);
          await sock.sendMessage(targetChat, { text: `${credit}\n_Contacts status_` }, msgOpts);

        } else if (rawType === "locationMessage" || rawType === "liveLocationMessage") {
          // ── Location status ───────────────────────────────────────────────────
          const loc = msg.locationMessage || msg.liveLocationMessage || {};
          const locName = loc.name || loc.address || "";
          await sock.sendMessage(targetChat, {
            location: { degreesLatitude: loc.degreesLatitude, degreesLongitude: loc.degreesLongitude },
          }, msgOpts);
          await sock.sendMessage(targetChat, {
            text: `${credit}\n_Location status_${locName ? `\n📍 ${locName}` : ""}`,
          }, msgOpts);

        } else if (rawType === "templateMessage") {
          // ── Template / button message — extract text ──────────────────────────
          const tmpl = msg.templateMessage?.hydratedTemplate || msg.templateMessage || {};
          const text = tmpl.hydratedContentText || tmpl.hydratedTitleText || JSON.stringify(tmpl);
          await sock.sendMessage(targetChat, { text: `${credit}\n\n${text}` }, msgOpts);

        } else if (rawType === "buttonsMessage" || rawType === "interactiveMessage" || rawType === "listMessage") {
          // ── Interactive / list / buttons — extract text ───────────────────────
          const b = msg.buttonsMessage || msg.listMessage || msg.interactiveMessage || {};
          const text = b.contentText || b.title || b.description || b.buttonText?.displayText || JSON.stringify(b).slice(0, 200);
          await sock.sendMessage(targetChat, { text: `${credit}\n\n${text}` }, msgOpts);

        } else {
          // ── Truly unknown saveable type — log for debugging, tell user cleanly ─
          console.warn(`[DESAM-STATUS] Unhandled status type in save: ${rawType} | keys: ${Object.keys(msg).join(", ")}`);
          return sendText(`⚠️ This status type (*${rawType}*) is not yet supported for saving. Please let the bot admin know so it can be added.`);
        }
        react("✅");
      } catch (err) {
        react("❌");
        await sendText("❌ Failed to download status.");
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
        await m.reply(`⚙️ *statusreact*  —  currently *${config.AUTO_STATUS_REACT || "off"}*

📖 Usage:  \`.statusreact on/off\`
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
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
        await m.reply(`⚙️ *autoview*  —  currently *${config.AUTO_STATUS_VIEW || "off"}*

📖 Usage:  \`.autoview on/off/toggle\`
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
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
        await m.reply(`⚙️ *statusave*  —  currently *${config.AUTO_STATUS_SAVE || "on"}*

📖 Usage:  \`.statusave on/off/toggle\`
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
      }
    },
  },
];

module.exports = { commands };
