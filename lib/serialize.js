const { jidNormalizedUser, getContentType } = require("@whiskeysockets/baileys");

function unwrapMessage(message) {
  if (!message || typeof message !== "object") return message;

  let current = message;
  const wrappers = [
    "deviceSentMessage",
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
  ];

  for (let i = 0; i < 6; i++) {
    const type = getContentType(current);
    if (!type) break;
    if (!wrappers.includes(type)) break;

    const next = current[type]?.message;
    if (!next) break;
    current = next;
  }

  return current;
}

function serialize(sock, msg) {
  if (!msg.message) {
    const fallbackBody = Array.isArray(msg.messageStubParameters)
      ? msg.messageStubParameters.join(" ").trim()
      : "";
    if (/No matching sessions found for message/i.test(fallbackBody)) {
      console.log(`[DESAM-SERIALIZE] Skipping undecryptable message stub (missing signal session) for msgId: ${msg.key?.id}`);
      return null;
    }
    if (!fallbackBody) {
      console.log(`[DESAM-SERIALIZE] No message content and no stub params - returning null for msgId: ${msg.key?.id}`);
      return null;
    }
    console.log(`[DESAM-SERIALIZE] Using fallback from stub params: "${fallbackBody}"`);
    msg.message = { conversation: fallbackBody };
  }

  const m = {};
  m.key = msg.key;
  m.id = msg.key.id;
  m.chat = msg.key.remoteJid;
  m.fromMe = msg.key.fromMe;
  m.isGroup = m.chat.endsWith("@g.us");
  // For outgoing messages in groups, participant may be missing; use self JID.
  // This keeps owner checks consistent for owner-only commands.
  m.sender = m.isGroup
    ? jidNormalizedUser(m.fromMe ? sock.user.id : (msg.key.participant || m.chat))
    : m.fromMe
      ? jidNormalizedUser(sock.user.id)
      : jidNormalizedUser(m.chat);
  m.pushName = msg.pushName || "Unknown";

  const rawType = getContentType(msg.message);
  m.isViewOnce = rawType === "viewOnceMessage" || rawType === "viewOnceMessageV2" || rawType === "viewOnceMessageV2Extension" || !!msg.message?.[rawType]?.viewOnce;
  m.rawMessage = msg.message;

  const normalizedMessage = unwrapMessage(msg.message);
  const type = getContentType(normalizedMessage);
  m.type = type;
  m.message = normalizedMessage;

  const content = normalizedMessage?.[type] || {};
  if (type === "conversation") {
    m.body = String(normalizedMessage?.conversation || "");
  } else if (type === "extendedTextMessage") {
    m.body = content?.text || "";
  } else if (type === "imageMessage" || type === "videoMessage") {
    m.body = content?.caption || "";
  } else if (type === "buttonsResponseMessage") {
    m.body = content?.selectedButtonId || "";
  } else if (type === "listResponseMessage") {
    m.body = content?.singleSelectReply?.selectedRowId || "";
  } else if (type === "templateButtonReplyMessage") {
    m.body = content?.selectedId || "";
  } else if (type === "interactiveResponseMessage") {
    m.body = JSON.parse(content?.nativeFlowResponseMessage?.paramsJson || "{}")?.id || "";
  } else {
    m.body = "";
  }

  m.isMedia = ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage", "ptvMessage"].includes(type);
  m.isImage = type === "imageMessage";
  m.isVideo = type === "videoMessage" || type === "ptvMessage";
  m.isAudio = type === "audioMessage";
  m.isPtv = type === "ptvMessage";
  m.isSticker = type === "stickerMessage";
  m.isDocument = type === "documentMessage";
  m.mimetype = content?.mimetype || content?.audio?.mimetype || null;
  m.isPtt = m.isAudio && (content?.ptt === true);
  m.isGif = m.isVideo && (content?.gifPlayback === true);
  m.fileName = content?.fileName || null;

  m.mentions = content?.contextInfo?.mentionedJid || [];

  const quoted = content?.contextInfo?.quotedMessage;
  if (quoted) {
    let qType = getContentType(quoted);
    let actualQuoted = quoted;
    let isViewOnce = false;

    if (qType === "viewOnceMessage" || qType === "viewOnceMessageV2" || qType === "viewOnceMessageV2Extension") {
      isViewOnce = true;
      const inner = quoted[qType]?.message;
      if (inner) {
        actualQuoted = inner;
        qType = getContentType(inner);
      }
    } else if (quoted[qType]?.viewOnce) {
      isViewOnce = true;
    }

    const qContent = actualQuoted[qType] || {};
    m.quoted = {
      key: {
        remoteJid: m.chat,
        fromMe: content.contextInfo.participant === jidNormalizedUser(sock.user.id),
        id: content.contextInfo.stanzaId,
        participant: content.contextInfo.participant,
      },
      message: actualQuoted,
      type: qType,
      sender: jidNormalizedUser(content.contextInfo.participant || m.chat),
      isMedia: ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage", "ptvMessage"].includes(qType),
      isImage: qType === "imageMessage",
      isVideo: qType === "videoMessage" || qType === "ptvMessage",
      isAudio: qType === "audioMessage",
      isPtv: qType === "ptvMessage",
      isSticker: qType === "stickerMessage",
      isDocument: qType === "documentMessage",
      isViewOnce,
      mimetype: qContent?.mimetype || null,
      isPtt: qType === "audioMessage" && (qContent?.ptt === true),
      isGif: (qType === "videoMessage" || qType === "ptvMessage") && (qContent?.gifPlayback === true),
      fileName: qContent?.fileName || null,
      body: actualQuoted.conversation || actualQuoted.extendedTextMessage?.text || actualQuoted[qType]?.caption || "",
    };
    m.quoted.download = async () => {
      const { downloadMediaMessage } = require("@whiskeysockets/baileys");
      return downloadMediaMessage(
        { key: m.quoted.key, message: m.quoted.message },
        "buffer",
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );
    };
  } else {
    m.quoted = null;
  }

  m.download = async () => {
    const { downloadMediaMessage } = require("@whiskeysockets/baileys");
    return downloadMediaMessage(msg, "buffer", {}, { reuploadRequest: sock.updateMediaMessage });
  };

  m.reply = async (text, opts = {}) => {
    try {
      return await sock.sendMessage(m.chat, { text, ...opts }, { quoted: msg });
    } catch {
      return sock.sendMessage(m.chat, { text, ...opts });
    }
  };

  m.react = async (emoji) => {
    try {
      return await sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
    } catch {
      return null;
    }
  };

  // ── UX helpers — available in every command handler ────────
  m.errorReply = async (message, tip = null) => {
    const { error } = require("./ux");
    await m.react("❌").catch(() => {});
    return m.reply(error(message, tip));
  };

  m.usageReply = async (syntax, example = null, aliases = [], note = null) => {
    const { usage } = require("./ux");
    return m.reply(usage(syntax, example, aliases, note));
  };

  m.noResultReply = async (query, tip = null) => {
    const { noResult } = require("./ux");
    await m.react("❌").catch(() => {});
    return m.reply(noResult(query, tip));
  };

  m.apiErrorReply = async (service = null) => {
    const { apiError } = require("./ux");
    await m.react("❌").catch(() => {});
    return m.reply(apiError(service));
  };

  return m;
}

module.exports = { serialize };