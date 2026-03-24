#!/usr/bin/env node

/**
 * DESAM WHATSAPP BOT
 * Fresh rebuild with proper Baileys v7 implementation
 * Using official patterns and best practices
 */

const path = require('path');
const fs = require('fs');

// Load environment variables first
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = require('./config');
const { startBot } = require('./lib/bot');
const { ensureDatabaseReady, closeDb, getDatabasePath } = require('./lib/database');
const { startServer } = require('./lib/server');
const { getState } = require('./lib/botState');

console.clear();
console.log(`
╔════════════════════════════════════════════════════╗
║          DESAM TECH WHATSAPP BOT v3.0              ║
║   Rebuilt with Clean Baileys v7 Architecture       ║
╚════════════════════════════════════════════════════╝
`);

console.log(`📱 Bot Name: ${config.BOT_NAME}`);
console.log(`⌨️  Prefix: ${config.PREFIX}`);
console.log(`👤 Owner: ${config.OWNER_NUMBER}`);
console.log(`🌍 Timezone: ${config.TIMEZONE}`);
console.log(`🔧 Device: ${config.DEVICE_MODE}`);
console.log(`🗄️  Database: SQLite (${config.SQLITE_PATH})`);
console.log('');

function verifyStartupRequirements() {
  ensureDatabaseReady();
  console.log(`✅ SQLite ready at ${getDatabasePath()}`);
  if (!config.OWNER_NUMBER || !config.OWNER_NUMBER.trim()) {
    console.warn(`⚠️  WARNING: OWNER_NUMBER is not set in .env!`);
    console.warn(`   Owner-only commands will NOT work for the human owner.`);
    console.warn(`   Anti-delete alerts will go to the bot's own Saved Messages.`);
    console.warn(`   Set OWNER_NUMBER=<your full phone number> in .env and restart.`);
  }
}

let shuttingDown = false;
let healthTimer = null;
let healthRecoveries = 0;

const HEALTH_CHECK_INTERVAL_MS = Number(process.env.BOT_HEALTHCHECK_INTERVAL_MS || 60_000);
const MAX_DISCONNECTED_MS = Number(process.env.BOT_MAX_DISCONNECTED_MS || 10 * 60_000);
const MAX_STARTING_MS = Number(process.env.BOT_MAX_STARTING_MS || 10 * 60_000);
const MAX_HEALTH_RECOVERIES = Number(process.env.BOT_MAX_HEALTH_RECOVERIES || 3);

async function gracefulShutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  console.log(`\n✋ [${signal}] Shutting down gracefully...`);
  try {
    const { shutdownBot } = require('./lib/bot');
    await shutdownBot();
  } catch (error) {
    console.error(`❌ [${signal}] Bot shutdown error:`, error.message);
  }
  try {
    closeDb();
  } catch (error) {
    console.error(`❌ [${signal}] Database shutdown error:`, error.message);
    exitCode = 1;
  }
  process.exit(exitCode);
}

function startHealthWatchdog() {
  if (healthTimer) {
    clearInterval(healthTimer);
  }

  healthTimer = setInterval(async () => {
    if (shuttingDown) {
      return;
    }

    const state = getState();
    const now = Date.now();
    const statusUpdatedAt = state.statusUpdatedAt || state.lastUpdated || now;
    const statusAge = now - statusUpdatedAt;

    if (state.status === 'connected') {
      healthRecoveries = 0;
      return;
    }

    if (state.status === 'waiting_for_pair') {
      return;
    }

    const unhealthyStarting = state.status === 'starting' && statusAge > MAX_STARTING_MS;
    const unhealthyDisconnected = state.status === 'disconnected' && statusAge > MAX_DISCONNECTED_MS;
    const unhealthyUnknown = (!state.status || state.status === 'pairing_success') && statusAge > MAX_DISCONNECTED_MS;

    if (!unhealthyStarting && !unhealthyDisconnected && !unhealthyUnknown) {
      return;
    }

    console.warn(`[WATCHDOG] Unhealthy state detected: status=${state.status || 'unknown'} ageMs=${statusAge}. Attempting recovery...`);
    try {
      await startBot();
      healthRecoveries += 1;
    } catch (error) {
      healthRecoveries += 1;
      console.error(`[WATCHDOG] Recovery attempt failed: ${error.message}`);
    }

    if (healthRecoveries >= MAX_HEALTH_RECOVERIES) {
      console.error('[WATCHDOG] Max recovery attempts reached. Exiting for PM2 restart.');
      process.exit(1);
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ [UNCAUGHT EXCEPTION]:', error.message);
  console.error(error.stack);
  gracefulShutdown('UNCAUGHT EXCEPTION', 1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [UNHANDLED REJECTION]:', reason);
});

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT', 0);
});

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM', 0);
});

/**
 * Run yt-dlp --update in the background at startup.
 * YouTube constantly changes their systems; an outdated yt-dlp is the #1
 * cause of .music / .youtube command failures. This keeps the binary fresh
 * without blocking bot startup.
 */
function scheduleYtDlpUpdate() {
  const candidates = [
    path.join(__dirname, 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];
  const bin = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (!bin) {
    console.warn('⚠️  yt-dlp not found — .music and .youtube commands will not work');
    return;
  }
  const { execFile: _execFile } = require('child_process');
  _execFile(bin, ['--update'], { timeout: 60000 }, (err, stdout, stderr) => {
    const out = (stdout || '').trim() || (stderr || '').trim();
    if (err) {
      console.warn('[yt-dlp] update failed:', err.message.slice(0, 200));
    } else {
      const line = out.split('\n')[0]?.trim();
      if (line) console.log('[yt-dlp]', line);
    }
  });
}

// Start the bot
(async () => {
  try {
    verifyStartupRequirements();
    startServer();
    startHealthWatchdog();
    scheduleYtDlpUpdate(); // non-blocking background update
    console.log('🚀 Starting bot...\n');
    await startBot();
    console.log('\n✅ Bot is ready!');
  } catch (error) {
    console.error('\n❌ Failed to start bot:', error.message);
    console.error(error.stack);
    try {
      closeDb();
    } catch {}
    process.exit(1);
  }
})();
