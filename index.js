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
}

let shuttingDown = false;

async function gracefulShutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
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

// Start the bot
(async () => {
  try {
    verifyStartupRequirements();
    startServer();
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
