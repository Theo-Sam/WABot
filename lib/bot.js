/**
 * DESAM BOT - Core Bot Connection Manager
 * Implements official Baileys v7 patterns
 */

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, Browsers, BufferJSON, fetchLatestBaileysVersion, getContentType, downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const NodeCache = require('node-cache');

const config = require('../config');
const { handleMessage, loadPlugins } = require('./handler');
const { setState } = require('./botState');
const {
  cacheStatusMessage,
  markStatusViewed,
  sendStatusReaction,
  isAutoStatusViewEnabled,
  isAutoStatusSaveEnabled,
  isStatusLikeJid,
  unwrapMessage,
  getOwnerJid,
  store,
} = require('./connection');
const { getGroupSettings, getMessageMetaFromStore } = require('./database');

// Logger setup
const logger = pino({ 
  level: process.env.LOG_LEVEL || 'info'
});

// Message store for retries
const msgRetryCounterCache = new NodeCache({ stdTTL: 60 * 60 });

let sock = null;
let isConnecting = false;
let isShuttingDown = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let lastConnectedNotification = { jid: '', at: 0 };
const RECONNECT_BASE_DELAY = 3000; // 3 seconds
const RECONNECT_MAX_DELAY = 60000; // 60 seconds
const CONNECTED_NOTIFY_DEDUP_MS = 120000; // 2 minutes

function reviveBuffers(value, depth = 0) {
  // Use Baileys' official BufferJSON to handle Buffer revival
  // Prevent infinite recursion
  if (depth > 100) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => reviveBuffers(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    // Use BufferJSON.fromObject for proper Buffer revival
    if (value.type === 'Buffer' && Array.isArray(value.data)) {
      return BufferJSON.fromObject(value);
    }

    // Recursively revive all properties
    const revived = {};
    for (const [key, item] of Object.entries(value)) {
      revived[key] = reviveBuffers(item, depth + 1);
    }
    return revived;
  }

  return value;
}

function normalizeSessionId(raw) {
  if (!raw) return '';
  let text = String(raw).trim();
  text = text.replace(/^SESSION_ID=/i, '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text.replace(/\r?\n|\s+/g, '');
}

function tryParseJson(text) {
  try {
    return JSON.parse(text, BufferJSON.reviver);
  } catch {
    return null;
  }
}

function decodeBase64Variant(text, urlSafe = false) {
  try {
    const normalized = urlSafe ? text.replace(/-/g, '+').replace(/_/g, '/') : text;
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function looksLikeCredsObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keyHints = [
    'noiseKey',
    'signedIdentityKey',
    'registrationId',
    'advSecretKey',
    'account',
    'me',
    'pairingCode',
    'sessionId',
  ];
  const hitCount = keyHints.filter((k) => Object.prototype.hasOwnProperty.call(value, k)).length;
  return hitCount >= 2;
}

function findSessionStateObject(payload, depth = 0) {
  if (!payload || typeof payload !== 'object' || depth > 5) return null;

  const candidates = [
    payload,
    payload.state,
    payload.authState,
    payload.auth,
    payload.session,
    payload.data,
    payload.result,
    payload.payload,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const creds = looksLikeCredsObject(candidate?.creds)
      ? candidate.creds
      : (looksLikeCredsObject(candidate) ? candidate : null);

    if (!creds) continue;

    const keys =
      candidate.keys ||
      candidate.state?.keys ||
      candidate.authState?.keys ||
      candidate.auth?.keys ||
      null;

    return { creds, keys };
  }

  const nestedKeys = ['data', 'session', 'auth', 'authState', 'state', 'payload', 'result'];
  for (const key of nestedKeys) {
    const nested = payload[key];
    if (!nested) continue;

    if (typeof nested === 'string') {
      try {
        const parsedNested = parseExternalSession(nested);
        if (parsedNested?.creds) return parsedNested;
      } catch {}
      continue;
    }

    const nestedResult = findSessionStateObject(nested, depth + 1);
    if (nestedResult?.creds) return nestedResult;
  }

  return null;
}

function parseExternalSession(rawSessionId) {
  const normalized = normalizeSessionId(rawSessionId);
  if (!normalized) return null;

  let decodedUriCandidate = '';
  try {
    decodedUriCandidate = decodeURIComponent(normalized);
  } catch {
    decodedUriCandidate = '';
  }

  const parseCandidates = [
    normalized,
    decodedUriCandidate,
    decodeBase64Variant(normalized, false),
    decodeBase64Variant(normalized, true),
    decodedUriCandidate ? decodeBase64Variant(decodedUriCandidate, false) : '',
    decodedUriCandidate ? decodeBase64Variant(decodedUriCandidate, true) : '',
  ];

  for (const candidate of parseCandidates) {
    if (!candidate) continue;
    const parsed = tryParseJson(candidate);
    if (!parsed) continue;

    const found = findSessionStateObject(parsed);
    if (found?.creds) return found;
    if (looksLikeCredsObject(parsed)) return { creds: parsed, keys: null };
  }

  const embeddedJson = normalized.match(/\{[\s\S]*\}/);
  if (embeddedJson?.[0]) {
    const parsed = tryParseJson(embeddedJson[0]);
    const found = parsed ? findSessionStateObject(parsed) : null;
    if (found?.creds) return found;
    if (looksLikeCredsObject(parsed)) return { creds: parsed, keys: null };
  }

  throw new Error('Invalid SESSION_ID. Provide valid WhatsApp creds JSON (raw/base64/url-safe).');
}

async function importExternalSessionToState(state, saveCreds) {
  const rawSessionId = config.SESSION_ID;
  if (!rawSessionId) {
    return false;
  }

  const session = parseExternalSession(rawSessionId);
  if (!session?.creds) {
    logger.warn('SESSION_ID parsed but no creds found; skipping import.');
    return;
  }

  // Buffers are already properly revived by BufferJSON.reviver in parseExternalSession
  state.creds = session.creds;

  // Extract pre-keys from creds and populate the keys store
  // Baileys uses the keys store to retrieve pre-keys during noise protocol
  if (session.creds && typeof session.creds === 'object') {
    // Pre-key IDs are typically stored as "preKey-{id}"
    const preKeyMatches = Object.entries(session.creds).filter(([key]) => 
      key.match(/^preKey-\d+$/)
    );
    
    for (const [keyId, keyPair] of preKeyMatches) {
      if (keyPair && keyPair.private && keyPair.public) {
        await state.keys.set(keyId, keyPair);
      }
    }
    
    // Also extract identity key into the keys store if present
    if (session.creds.signalIdentities && Array.isArray(session.creds.signalIdentities)) {
      for (const identity of session.creds.signalIdentities) {
        if (identity?.identifier && identity?.identifierKey) {
          const keyId = `${identity.identifier.name}-${identity.identifier.deviceId}`;
          await state.keys.set(keyId, identity.identifierKey);
        }
      }
    }
  }

  // Import any external keys Map if provided
  if (session.keys && typeof session.keys === 'object') {
    if (session.keys instanceof Map) {
      for (const [key, value] of session.keys.entries()) {
        await state.keys.set(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(session.keys)) {
        await state.keys.set(key, value);
      }
    }
  }

  await saveCreds();
  logger.info('External SESSION_ID imported into auth state.');
  return true;
}

/**
 * Start the WhatsApp bot
 */
async function startBot() {
  try {
    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
      logger.warn('Connection attempt already in progress');
      return sock;
    }

    isShuttingDown = false;
    isConnecting = true;

    // Only reset reconnect counter on a fresh (non-reconnect) start
    if (reconnectAttempts === 0) {
      logger.info('🆕 Fresh bot start');
    }

    // Use multifile auth state (official pattern)
    const authDir = path.join(__dirname, '..', 'auth_state');
    const credsFile = path.join(authDir, 'creds.json');
    const markerFile = path.join(__dirname, '..', '.current_session_id');
    const incomingSessionId = normalizeSessionId(config.SESSION_ID);
    const hasIncomingSession = !!incomingSessionId;

    let previousSessionId = '';
    if (fs.existsSync(markerFile)) {
      try {
        previousSessionId = normalizeSessionId(fs.readFileSync(markerFile, 'utf8'));
      } catch {}
    }

    let hasExistingCreds = fs.existsSync(credsFile);
    const sessionChanged = hasIncomingSession && previousSessionId !== incomingSessionId;

    // If SESSION_ID is provided, sync auth_state from it.
    // Otherwise, use persisted MD auth from disk and allow fresh QR linking.
    if (hasIncomingSession && (sessionChanged || !hasExistingCreds)) {
      logger.info(sessionChanged
        ? '🔄 SESSION_ID changed in .env. Rebuilding auth_state from SESSION_ID...'
        : '📦 SESSION_ID found in .env. Building auth_state from SESSION_ID...');
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
      }
      fs.mkdirSync(authDir, { recursive: true });
      hasExistingCreds = false;
    }

    if (hasExistingCreds) {
      logger.info('♻️  Existing auth state found — reusing (signal keys preserved).');
    } else {
      logger.info('🆕 No existing auth state found — preparing a fresh session state.');
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    if (!hasExistingCreds && hasIncomingSession) {
      try {
        logger.info('📦 Importing SESSION_ID from .env into auth state...');
        const imported = await importExternalSessionToState(state, saveCreds);
        if (!imported) {
          logger.warn('SESSION_ID was provided but could not be imported. Falling back to QR linking.');
        }
        fs.writeFileSync(markerFile, incomingSessionId, 'utf8');
      } catch (err) {
        logger.error('❌ Failed to import SESSION_ID:', err.message);
        throw err;
      }
    }

    // Multi-device pairing is required on first run.
    const needsPairing = !state.creds.registered;
    if (needsPairing) {
      logger.info('🔗 No registered auth state found. Scan the QR from terminal or pairing UI to link this bot as a companion device.');
      setState({ status: 'waiting_for_pair', pairingCode: null });
    }

    logger.info(`🔐 Auth state loaded from: ${authDir}`);

    // Fetch latest WA version to avoid Connection Failure from outdated protocol
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`Using WA version ${version.join('.')} (latest: ${isLatest})`);

    // Socket configuration (official recommended)
    const socketConfig = {
      // Auth and store
      auth: state,
      logger,
      msgRetryCounterCache,

      // Browser identification
      browser: ["Ubuntu", "Chrome", config.BROWSER_VERSION || "120.0.0"],

      // Connection settings
      markOnlineOnConnect: true,
      emitOwnEventsUnfiltered: true,
      defaultQueryTimeoutMs: 15000,
      maxMsgRetryCount: 5,

      // Syncing options
      syncFullHistory: false,
      fireInitQueries: true,

      // Use dynamically fetched WA version
      version,
    };

    logger.info('📡 Creating WhatsApp socket...');
    sock = makeWASocket(socketConfig);

    // Bind store events
    if (sock.ev && sock.ev.on) {
      logger.info('✅ Socket created successfully');

      // ===== CONNECTION HANDLING =====
      sock.ev.on('connection.update', async (update) => {
        await handleConnectionUpdate(update);
      });

      // ===== SAVE CREDENTIALS =====
      sock.ev.on('creds.update', saveCreds);

      // ===== BIND MESSAGE STORE (needed for anti-delete) =====
      store.bind(sock.ev);

      // ===== INCOMING MESSAGES =====
      sock.ev.on('messages.upsert', async (upsert) => {
        try {
          const { messages, type } = upsert;
          if (!Array.isArray(messages)) return;
          for (const msg of messages) {
            const remoteJid = msg.key?.remoteJid || '';

            // ── Status / broadcast messages ──
            if (isStatusLikeJid(remoteJid) || isStatusLikeJid(msg.key?.participant || '')) {
              if (msg.message) {
                const unwrapped = unwrapMessage(msg.message);
                const msgType = getContentType(unwrapped) || Object.keys(unwrapped || {})[0];
                if (isAutoStatusSaveEnabled()) {
                  cacheStatusMessage(msg, unwrapped, msgType);
                }
                if (isAutoStatusViewEnabled()) {
                  markStatusViewed(sock, msg.key, 'upsert');
                }
                // Auto-react to status (only if AUTO_STATUS_REACT=on)
                sendStatusReaction(sock, msg.key);
              }
              // Still allow owner commands from status context (e.g. .save reply)
              if (msg.key?.fromMe || msg.key?.participant === sock.user?.id?.replace(/:.*@/, '@')) {
                const unwrapped = unwrapMessage(msg.message);
                const msgType = getContentType(unwrapped) || Object.keys(unwrapped || {})[0];
                const body = (unwrapped?.conversation || unwrapped?.[msgType]?.text || unwrapped?.[msgType]?.caption || '').trim();
                if (body.startsWith(config.PREFIX)) {
                  await handleMessage(sock, msg).catch(err => logger.error('[BOT] status-cmd error:', err.message));
                }
              }
              continue;
            }

            await handleMessage(sock, msg).catch(err => {
              logger.error(`[BOT] ❌ Error handling message: ${err.message}`);
            });
          }
        } catch (err) {
          logger.error(`[BOT] ❌ Error in messages.upsert: ${err.message}`);
        }
      });

      // ===== STATUS HISTORY & UPDATES =====
      sock.ev.on('messaging-history.set', ({ messages: history }) => {
        if (!Array.isArray(history)) return;
        for (const msg of history) {
          const remoteJid = msg?.key?.remoteJid || '';
          if (!isStatusLikeJid(remoteJid)) continue;
          if (!isAutoStatusSaveEnabled()) continue;
          const unwrapped = unwrapMessage(msg.message);
          const msgType = getContentType(unwrapped) || Object.keys(unwrapped || {})[0];
          cacheStatusMessage(msg, unwrapped, msgType);
        }
      });

      sock.ev.on('messages.update', (updates) => {
        if (!Array.isArray(updates)) return;
        for (const update of updates) {
          const remoteJid = update?.key?.remoteJid || '';
          if (!isStatusLikeJid(remoteJid)) continue;
          if (!update?.message) continue;
          if (isAutoStatusSaveEnabled()) {
            const unwrapped = unwrapMessage(update.message);
            const msgType = getContentType(unwrapped) || Object.keys(unwrapped || {})[0];
            cacheStatusMessage({ key: update.key, message: update.message, messageTimestamp: update.messageTimestamp, pushName: update.pushName }, unwrapped, msgType);
          }
          if (isAutoStatusViewEnabled()) {
            markStatusViewed(sock, update.key, 'update');
          }
        }
      });

      // ===== ANTI-DELETE =====
      // Deduplicate: track message IDs we've already processed so the backup
      // REVOKE path and the messages.delete path don't double-fire.
      const _adSeen = new Set();

      /**
       * Core anti-delete processor — call from both messages.delete AND the
       * messages.upsert REVOKE backup path.
       * @param {object} key  — WAMessageKey { remoteJid, id, fromMe, participant }
       */
      const processAntiDelete = async (key) => {
        try {
          const chat = key.remoteJid;
          if (!chat) return;
          if (_adSeen.has(key.id)) return;   // already handled
          _adSeen.add(key.id);
          setTimeout(() => _adSeen.delete(key.id), 60000); // clean up after 1 min

          // Check if anti-delete is enabled for this chat or globally
          const globalSettings = getGroupSettings('__global__');
          const chatSettings   = getGroupSettings(chat);
          const antideleteActive = globalSettings?.antidelete || chatSettings?.antidelete;
          logger.info(`[ANTI-DEL] delete event — chat=${chat} msgId=${key.id} enabled=${!!antideleteActive}`);
          if (!antideleteActive) return;

          const ownerJid    = getOwnerJid(sock);
          const isGroup     = chat.endsWith('@g.us');
          const groupMeta   = isGroup ? await sock.groupMetadata(chat).catch(() => null) : null;
          const chatLabel   = isGroup
            ? (groupMeta?.subject || chat)
            : chat.replace('@s.whatsapp.net', '').replace('@lid', '');
          const chatIcon    = isGroup ? '👥' : '👤';

          // Always send to owner's private DM / Saved Messages
          const notifyDest = ownerJid || chat;

          const stored = await store.getMessage(key);
          logger.info(`[ANTI-DEL] store lookup for ${key.id}: ${stored ? 'FOUND' : 'NOT FOUND'}`);

          if (!stored?.message) {
            // Full message not available — try the lightweight meta record
            const meta = getMessageMetaFromStore(key.id);
            const typeLabel = meta?.type && meta.type !== 'unknown'
              ? meta.type.replace('Message', ' message')
              : 'message';
            const metaSender = meta?.sender
              ? `@${meta.sender.split('@')[0]}`
              : 'Someone';
            let notifText = `🗑️ *Anti-Delete* — ${metaSender} deleted a *${typeLabel}*\n${chatIcon} *${chatLabel}*`;
            if (meta?.body) notifText += `\n📝 ${meta.body}`;
            else notifText += `\n_Media content could not be recovered_`;
            await sock.sendMessage(notifyDest, {
              text: notifText,
              mentions: meta?.sender ? [meta.sender] : [],
            }).catch(() => {});
            return;
          }

          const senderJid    = jidNormalizedUser(stored.key?.participant || stored.key?.remoteJid || '');
          const senderNum    = senderJid ? senderJid.split('@')[0] : 'unknown';
          const normalizedMsg = unwrapMessage(stored.message);
          const type         = getContentType(normalizedMsg) || 'unknown';
          const content      = normalizedMsg?.[type] || {};
          const body         = normalizedMsg?.conversation || content?.text || content?.caption || '';

          const header =
            `🗑️ *Anti-Delete* — @${senderNum} deleted a message\n`
            + `${chatIcon} *${chatLabel}*`;

          const MEDIA_TYPES = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];

          if (MEDIA_TYPES.includes(type)) {
            const mediaBuffer = await downloadMediaMessage(
              { key: stored.key, message: stored.message },
              'buffer',
              {},
            ).catch(() => null);

            if (mediaBuffer && mediaBuffer.length > 0) {
              if (type === 'imageMessage') {
                await sock.sendMessage(notifyDest, { image: mediaBuffer, caption: `${header}${body ? `\n📝 ${body}` : ''}`, mentions: senderJid ? [senderJid] : [] }).catch(() => {});
              } else if (type === 'videoMessage') {
                await sock.sendMessage(notifyDest, { video: mediaBuffer, caption: `${header}${body ? `\n📝 ${body}` : ''}`, mentions: senderJid ? [senderJid] : [] }).catch(() => {});
              } else if (type === 'audioMessage') {
                await sock.sendMessage(notifyDest, { audio: mediaBuffer, mimetype: content?.mimetype || 'audio/mpeg', ptt: content?.ptt || false }).catch(() => {});
                await sock.sendMessage(notifyDest, { text: `${header}${body ? `\n📝 ${body}` : ''}`, mentions: senderJid ? [senderJid] : [] }).catch(() => {});
              } else if (type === 'documentMessage') {
                await sock.sendMessage(notifyDest, { document: mediaBuffer, fileName: content?.fileName || 'deleted-file', mimetype: content?.mimetype || 'application/octet-stream', caption: `${header}${body ? `\n📝 ${body}` : ''}`, mentions: senderJid ? [senderJid] : [] }).catch(() => {});
              } else if (type === 'stickerMessage') {
                await sock.sendMessage(notifyDest, { sticker: mediaBuffer }).catch(() => {});
                await sock.sendMessage(notifyDest, { text: header, mentions: senderJid ? [senderJid] : [] }).catch(() => {});
              }
              logger.info(`[ANTI-DEL] forwarded ${type} from ${chat}`);
              return;
            }
            // Media re-download failed — at least tell the owner what type was deleted
            const friendlyType = type.replace('Message', '');
            await sock.sendMessage(notifyDest, {
              text: `${header}\n📎 *${friendlyType}* deleted${body ? `\n📝 ${body}` : ''}\n_Media could not be re-downloaded (WhatsApp CDN expired)_`,
              mentions: senderJid ? [senderJid] : [],
            }).catch(() => {});
            logger.info(`[ANTI-DEL] media download failed for ${type} — sent text fallback`);
            return;
          }

          // Text / reactions / polls / unknown
          await sock.sendMessage(notifyDest, {
            text: `${header}${body ? `\n📝 ${body}` : '\n_(no text content)_'}`,
            mentions: senderJid ? [senderJid] : [],
          }).catch(() => {});
          logger.info(`[ANTI-DEL] forwarded text from ${chat}`);
        } catch (err) {
          logger.error('[BOT] Anti-delete error:', err.message);
        }
      };

      // ── Primary trigger: Baileys messages.delete event ──────────────────────
      sock.ev.on('messages.delete', async (item) => {
        // item is either { keys: WAMessageKey[] } or { jid: string, all: true }
        if (!item.keys) return;
        for (const key of item.keys) {
          await processAntiDelete(key);
        }
      });

      // ── Backup trigger: protocolMessage type 0 (REVOKE) in messages.upsert ──
      // In some Baileys builds / WhatsApp versions, the delete arrives here first
      // (or instead of messages.delete). We catch it so anti-delete never misses.
      sock.ev.on('messages.upsert', async ({ messages: upsertMsgs }) => {
        if (!Array.isArray(upsertMsgs)) return;
        for (const msg of upsertMsgs) {
          const proto = msg?.message?.protocolMessage;
          if (!proto) continue;
          // type 0 = REVOKE ("delete for everyone")
          if (proto.type !== 0) continue;
          const revokedKey = proto.key;
          if (!revokedKey?.id) continue;
          // Fill in remoteJid from the outer message if the proto key is missing it
          if (!revokedKey.remoteJid) revokedKey.remoteJid = msg.key?.remoteJid;
          await processAntiDelete(revokedKey);
        }
      });

      // ===== CALL HANDLING =====
      sock.ev.on('call', async (calls) => {
        if (config.ANTI_CALL === 'on') {
          for (const call of calls) {
            if (call.status === 'offer') {
              logger.info(`📞 Rejecting call from ${call.from}`);
              try {
                await sock.rejectCall(call.id, call.from);
                const msg = config.ANTI_CALL_MSG || '❌ Calls are not allowed. This bot rejects all calls.';
                await sock.sendMessage(call.from, { text: msg });
              } catch (err) {
                logger.error('Error rejecting call:', err.message);
              }
            }
          }
        }
      });

      // ===== GROUP PARTICIPANT EVENTS (welcome/goodbye) =====
      sock.ev.on('group-participants.update', async (update) => {
        try {
          const { handleGroupEvent } = require('../plugins/group');
          await handleGroupEvent(sock, update);
        } catch (err) {
          logger.error('[BOT] Group event error:', err.message);
        }
      });

      // ===== GROUP UPDATES =====
      sock.ev.on('groups.update', async (updates) => {
        logger.debug('Group update received:', updates);
      });

      logger.info('✅ All event handlers registered');
    }

    isConnecting = false;
    return sock;

  } catch (error) {
    isConnecting = false;
    logger.error('Failed to start bot:', error.message);
    throw error;
  }
}

/**
 * Handle connection state changes
 */
async function handleConnectionUpdate(update) {
  try {
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    if (isShuttingDown) {
      return;
    }

    // QR code for first-time multi-device linking
    if (qr) {
      logger.info('📷 Scan the QR with WhatsApp > Linked Devices to finish multi-device pairing.');
      setState({ status: 'waiting_for_pair' });
      return;
    }

    // Pairing completed — Baileys will close and reopen the connection
    if (isNewLogin) {
      logger.info('✅ Pairing code accepted! New device linked. Reconnecting as authenticated device...');
      setState({ status: 'pairing_success', pairingCode: null });
      return;
    }

    // Connection closed
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode || DisconnectReason.badSession;

      // Detect conflict/replaced — another session is already active, no point reconnecting
      const isConflict =
        reason === DisconnectReason.connectionReplaced ||
        lastDisconnect?.error?.message?.includes('conflict') ||
        lastDisconnect?.error?.message?.includes('Stream Errored (conflict)');

      // After pairing, Baileys closes with RestartRequired (515) — that's expected, reconnect
      const isPairingRestart = reason === 515 || lastDisconnect?.error?.message?.includes('restart');

      const shouldReconnect =
        !isConflict &&
        reason !== DisconnectReason.loggedOut &&
        (reason !== DisconnectReason.badSession || isPairingRestart);

      logger.info(`❌ Connection closed. Reason: ${reason}. Should reconnect: ${shouldReconnect}`);
      setState({ status: 'disconnected' });

      if (isConflict) {
        logger.error('⛔ Session conflict: another WhatsApp session is active. Close the other session and restart the bot.');
        process.exit(1);
      } else if (shouldReconnect) {
        if (isPairingRestart) {
          reconnectAttempts = 0; // Pairing restarts don't count as failures
        }
        await attemptReconnect();
      } else {
        try {
          const authDir = path.join(__dirname, '..', 'auth_state');
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
          }
          const markerFile = path.join(__dirname, '..', '.current_session_id');
          if (fs.existsSync(markerFile)) {
            fs.rmSync(markerFile, { force: true });
          }
          logger.info('🗑️ Cleared corrupted auth_state directory and marker file to prevent crash loops.');
        } catch (err) {
          logger.error('Failed to clear auth_state:', err.message);
        }
        logger.error('⛔ Session is invalid or logged out. Delete auth_state and pair again via QR.');
        process.exit(1);
      }
    }

    // Connection established
    if (connection === 'open') {
      reconnectAttempts = 0;
      const jid = sock.user?.id || 'unknown';
      logger.info(`✅ Connected successfully! JID: ${jid}`);
      const { commands } = require('./handler');
      setState({
        status: 'connected',
        pairingCode: null,
        jid,
        botName: config.BOT_NAME,
        prefix: config.PREFIX,
        commandCount: commands instanceof Map ? commands.size : (commands ? Object.keys(commands).length : 0),
        connectedAt: new Date().toISOString(),
      });

      const notifyFlagPath = path.join(__dirname, '..', '.desam-notify-flag');
      if (fs.existsSync(notifyFlagPath)) {
        try {
          fs.unlinkSync(notifyFlagPath);
        } catch (err) {
          logger.warn('Could not delete notify flag file:', err.message);
        }
        try {
          const botNumber = (sock.user?.id || '').replace(/:.*@/, '@');
          const notifyJid = config.OWNER_NUMBER
            ? config.OWNER_NUMBER.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
            : botNumber;

          if (notifyJid && notifyJid !== '@s.whatsapp.net') {
            const nowMs = Date.now();
            const recentlyNotified =
              lastConnectedNotification.jid === notifyJid &&
              nowMs - lastConnectedNotification.at < CONNECTED_NOTIFY_DEDUP_MS;

            if (recentlyNotified) {
              logger.info(`🔕 Skipping duplicate connected notification to ${notifyJid}`);
              return;
            }

            lastConnectedNotification = { jid: notifyJid, at: nowMs };
            const now = new Date().toLocaleString('en-US', { timeZone: config.TIMEZONE || 'Africa/Accra' });
            const { runtime } = require('./helpers');
            const uptime = runtime();
            const caption = `╔══════════════════════════╗\n║    *${config.BOT_NAME}*    ║\n╚══════════════════════════╝\n\n✅ *Bot is now online!*\n\n🕒 Time: ${now}\n⏱️ Uptime: ${uptime}\n🔑 Prefix: ${config.PREFIX}\n📡 Mode: ${config.MODE}\n📊 Commands: ${commands instanceof Map ? commands.size : 0}\n📊 Status: Connected & ready\n\n_Type ${config.PREFIX}menu to see all commands_\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n📢 *Join our WhatsApp Channel for updates!*\nhttps://whatsapp.com/channel/0029Vb7n5HyEgGfKW3Wp7U1h\n\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
            const imgPath = require('path').join(__dirname, '..', 'public', 'desam-bot.png');
            let imgBuffer = null;
            try { imgBuffer = require('fs').readFileSync(imgPath); } catch {}
            if (imgBuffer) {
              await sock.sendMessage(notifyJid, { image: imgBuffer, caption });
            } else {
              await sock.sendMessage(notifyJid, { text: caption });
            }
            logger.info(`📩 Connected notification sent to ${notifyJid}`);
          }
        } catch (err) {
          logger.warn('Could not send connected notification:', err.message);
        }
      }

      if (config.AUTO_BIO === 'on') {
        try {
          const time = new Date().toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          const date = new Date().toLocaleDateString();
          const bio = config.AUTO_BIO_MSG
            .replace('{time}', time)
            .replace('{date}', date);
          await sock.updateProfileStatus(bio);
        } catch (err) {
          logger.warn('Could not update bio:', err.message);
        }
      }
    }

    // Connecting
    if (connection === 'connecting') {
      logger.info('⏳ Connecting...');
    }

  } catch (error) {
    logger.error('Error handling connection update:', error.message);
  }
}

/**
 * Attempt to reconnect with exponential backoff
 */
async function attemptReconnect(options = {}) {
  if (isShuttingDown) {
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(
    RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1),
    RECONNECT_MAX_DELAY
  );
  logger.warn(`🔄 Reconnection attempt ${reconnectAttempts}. Waiting ${delay}ms before retry...`);

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot().catch(err => {
      logger.error('Reconnection failed:', err.message);
      attemptReconnect();
    });
  }, delay);
}

/**
 * Get the socket
 */
function getSocket() {
  return sock;
}

/**
 * Safely shutdown bot
 */
async function shutdownBot() {
  logger.info('🛑 Shutting down bot...');
  isShuttingDown = true;
  isConnecting = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    try {
      await sock.end();
      sock = null;
    } catch (err) {
      logger.warn('Error closing socket:', err.message);
    }
  }
}

module.exports = {
  startBot,
  getSocket,
  shutdownBot,
};
