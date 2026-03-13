/**
 * DESAM BOT - Core Bot Connection Manager
 * Implements official Baileys v7 patterns
 */

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, Browsers, BufferJSON, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const NodeCache = require('node-cache');

const config = require('../config');
const { handleMessage, loadPlugins } = require('./handler');
const { setState } = require('./botState');

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
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 3000; // 3 seconds

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

function parseExternalSession(rawSessionId) {
  const normalized = normalizeSessionId(rawSessionId);
  if (!normalized) return null;

  let parsed;
  try {
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    // Use BufferJSON.reviver for proper Buffer revival
    parsed = JSON.parse(decoded, BufferJSON.reviver);
  } catch {
    try {
      parsed = JSON.parse(normalized, BufferJSON.reviver);
    } catch {
      throw new Error('Invalid SESSION_ID. Provide base64 JSON or raw JSON.');
    }
  }

  // No need for deep revive since BufferJSON.reviver handles it
  const session = parsed;

  // Handle different credential shapes
  if (session?.creds) {
    const result = {
      creds: session.creds,
      keys: session.keys || session.state?.keys || session.authState?.keys || null,
    };
    return result;
  }

  if (session?.state?.creds) {
    return {
      creds: session.state.creds,
      keys: session.state.keys || null,
    };
  }

  if (session?.authState?.creds) {
    return {
      creds: session.authState.creds,
      keys: session.authState.keys || null,
    };
  }

  const looksLikeCreds =
    session &&
    typeof session === 'object' &&
    !Array.isArray(session) &&
    (Object.prototype.hasOwnProperty.call(session, 'noiseKey') ||
      Object.prototype.hasOwnProperty.call(session, 'signedIdentityKey') ||
      Object.prototype.hasOwnProperty.call(session, 'registrationId'));

  if (looksLikeCreds) {
    // This is just plain creds, no separate keys wrapper
    return { creds: session, keys: null };
  }

  throw new Error('SESSION_ID JSON format not recognized.');
}

async function importExternalSessionToState(state, saveCreds) {
  const rawSessionId = config.SESSION_ID;
  if (!rawSessionId) {
    throw new Error('SESSION_ID is required. QR login is disabled in this build.');
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
    const hasExistingCreds = fs.existsSync(credsFile);

    if (hasExistingCreds) {
      logger.info('♻️  Existing auth state found — reusing (signal keys preserved).');
    } else {
      logger.info('🆕 No existing auth state found — starting fresh session.');
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
      }
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // Determine if we need pairing code flow (no registered device yet)
    const needsPairing = !state.creds.registered;
    if (needsPairing) {
      const phone = (config.BOT_PHONE_NUMBER || '').replace(/[^0-9]/g, '');
      if (!phone) {
        logger.error('❌ BOT_PHONE_NUMBER is not set in .env! Cannot generate pairing code.');
        logger.error('   Add BOT_PHONE_NUMBER=233557703453 (your bot\'s WhatsApp number) to .env');
        process.exit(1);
      }
      logger.info(`📱 Fresh session — will generate pairing code for ${phone}`);
    }

    logger.info('🔐 Auth state loaded from:', authDir);

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
      browser: ["Ubuntu", "Chrome", "20.0.04"],

      // Connection settings
      markOnlineOnConnect: true,
      emitOwnEventsUnfiltered: true,
      defaultQueryTimeoutMs: 60000,

      // Syncing options
      syncFullHistory: false,
      receiveAllMessages: true,
      offlineMaxRetries: 5,
      fireInitQueries: true,

      // Use dynamically fetched WA version
      version,
    };

    logger.info('📡 Creating WhatsApp socket...');
    sock = makeWASocket(socketConfig);

    // Bind store events
    if (sock.ev && sock.ev.on) {
      logger.info('✅ Socket created successfully');

      // ===== PAIRING CODE (fresh session only) =====
      if (needsPairing) {
        const phone = (config.BOT_PHONE_NUMBER || '').replace(/[^0-9]/g, '');
        setState({ status: 'waiting_pairing', pairingPhone: phone });
        setTimeout(async () => {
          try {
            const code = await sock.requestPairingCode(phone);
            const formatted = code.slice(0, 4) + '-' + code.slice(4);
            setState({ status: 'show_code', pairingCode: formatted });
            console.log('\n╔══════════════════════════════════════════════╗');
            console.log(`║  🔑 WHATSAPP PAIRING CODE: ${formatted}         ║`);
            console.log('╠══════════════════════════════════════════════╣');
            console.log('║  Steps to link:                              ║');
            console.log('║  1. Open WhatsApp on your phone              ║');
            console.log('║  2. Tap  ⋮  → Linked Devices                 ║');
            console.log('║  3. Tap "Link a Device"                      ║');
            console.log('║  4. Tap "Link with phone number instead"     ║');
            console.log(`║  5. Enter: ${formatted}                         ║`);
            console.log('╚══════════════════════════════════════════════╝\n');
          } catch (err) {
            logger.error('❌ Failed to request pairing code:', err.message);
            setState({ status: 'error', pairingCode: null });
          }
        }, 3000);
      }

      // ===== CONNECTION HANDLING =====
      sock.ev.on('connection.update', async (update) => {
        await handleConnectionUpdate(update);
      });

      // ===== SAVE CREDENTIALS =====
      sock.ev.on('creds.update', saveCreds);

      // ===== INCOMING MESSAGES =====
      sock.ev.on('messages.upsert', async (upsert) => {
        try {
          const { messages, type } = upsert;
          if (!messages) return;
          console.log(`[BOT] 📨 messages.upsert: type=${type}, count=${messages.length}`);
          for (const msg of messages) {
            const from = msg.key?.remoteJid || 'unknown';
            const fromMe = msg.key?.fromMe;
            const hasContent = !!msg.message;
            console.log(`[BOT] 📩 msg: from=${from} fromMe=${fromMe} hasContent=${hasContent}`);
            await handleMessage(sock, msg).catch(err => {
              console.error(`[BOT] ❌ Error handling message: ${err.message}`);
            });
          }
        } catch (err) {
          console.error(`[BOT] ❌ Error in messages.upsert: ${err.message}`);
        }
      });

      // ===== CALL HANDLING =====
      sock.ev.on('call', async (calls) => {
        if (config.ANTI_CALL === 'on') {
          for (const call of calls) {
            logger.info(`📞 Rejecting call from ${call.from}`);
            try {
              await sock.rejectCall(call.id, call.from);
            } catch (err) {
              logger.error('Error rejecting call:', err.message);
            }
          }
        }
      });

      // ===== GROUP UPDATES =====
      sock.ev.on('groups.update', async (updates) => {
        logger.debug('Group update received:', updates);
      });

      // ===== CHAT UPDATES =====
      sock.ev.on('chats.update', async (updates) => {
        logger.debug('Chat update received');
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

    // QR code: ignored — we use pairing code instead of QR
    if (qr) {
      logger.info('⏳ Waiting for pairing code entry... (ignore QR, use the pairing code printed in logs)');
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
        logger.error('⛔ Session is invalid or logged out. Delete auth_state folder and restart to re-pair.');
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

      try {
        const botNumber = (sock.user?.id || '').replace(/:.*@/, '@');
        const notifyJid = config.OWNER_NUMBER
          ? config.OWNER_NUMBER.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          : botNumber;

        if (notifyJid && notifyJid !== '@s.whatsapp.net') {
          const now = new Date().toLocaleString('en-US', { timeZone: config.TIMEZONE || 'Africa/Accra' });
          const caption = `╔══════════════════════════╗\n║    *${config.BOT_NAME}*    ║\n╚══════════════════════════╝\n\n✅ *Bot is now online!*\n\n🕒 Time: ${now}\n🔑 Prefix: ${config.PREFIX}\n📡 Mode: ${config.MODE}\n📊 Commands: ${commands instanceof Map ? commands.size : 0}\n📊 Status: Connected & ready\n\n_Type ${config.PREFIX}menu to see all commands_\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n📢 *Join our WhatsApp Channel for updates:*\nhttps://whatsapp.com/channel/0029Vb7n5HyEgGfKW3Wp7U1h\n\n_Powered by Desam Tech_ ⚡`;
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
async function attemptReconnect() {
  if (isShuttingDown) {
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error(`❌ Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Exiting.`);
    process.exit(1);
  }

  reconnectAttempts++;
  const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1);
  
  logger.info(`🔄 Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}. Waiting ${delay}ms...`);

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
