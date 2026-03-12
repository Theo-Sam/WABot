/**
 * Message Handler - Process incoming messages
 */

const path = require('path');
const fs = require('fs');

/**
 * Handle incoming messages
 */
async function handleMessage(sock, m, config) {
  try {
    const { messages } = m;
    
    if (!messages || messages.length === 0) {
      return;
    }

    for (const message of messages) {
      // Skip if no message content
      if (!message.message) continue;
      
      // Skip own messages unless specified
      if (message.key.fromMe && !config.ACCEPT_ANY_SESSION) continue;

      // Get message text
      const text = message.message.conversation || 
                   message.message.extendedTextMessage?.text || 
                   message.message.imageMessage?.caption || 
                   message.message.videoMessage?.caption || 
                   '';

      const sender = message.key.remoteJid;
      const isGroup = sender?.endsWith('@g.us');
      
      // Log message
      console.log(`📨 Message from ${sender}:`, text.substring(0, 50));

      // Auto-read messages if enabled
      if (config.AUTO_READ === 'on') {
        try {
          await sock.readMessages([message.key]);
        } catch (err) {
          // Silent fail for read receipts
        }
      }

      // Handle commands prefixed with the configured prefix
      if (text.startsWith(config.PREFIX)) {
        const args = text.slice(config.PREFIX.length).trim().split(/\s+/);
        const command = args[0]?.toLowerCase();

        console.log(`⌨️  Command: ${command} | Args:`, args.slice(1));

        // Handle specific commands
        if (command === 'ping') {
          await sock.sendMessage(sender, { 
            text: '🏓 Pong! Bot is online.',
            quoted: message 
          });
        } 
        else if (command === 'hello' || command === 'hi') {
          await sock.sendMessage(sender, {
            text: `👋 Hello! I'm ${config.BOT_NAME}. How can I help you?`,
            quoted: message
          });
        }
        else if (command === 'info') {
          const info = `
ℹ️ *Bot Information*
━━━━━━━━━━━━━━━━━━
🤖 Name: ${config.BOT_NAME}
⌨️  Prefix: ${config.PREFIX}
🔧 Device: ${config.DEVICE_MODE}
🌍 Timezone: ${config.TIMEZONE}
          `;
          await sock.sendMessage(sender, {
            text: info,
            quoted: message
          });
        }
        else if (command === 'help') {
          const help = `
*📚 Available Commands*
━━━━━━━━━━━━━━━━━━
${config.PREFIX}ping - Check if bot is online
${config.PREFIX}hello - Get greeting
${config.PREFIX}info - Show bot information
${config.PREFIX}help - Show this message
          `;
          await sock.sendMessage(sender, {
            text: help,
            quoted: message
          });
        }
        else {
          await sock.sendMessage(sender, {
            text: `❓ Unknown command: ${command}\nType ${config.PREFIX}help for available commands`,
            quoted: message
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in message handler:', error.message);
  }
}

/**
 * Send a text message
 */
async function sendText(sock, jid, text, quoted = null) {
  try {
    const message = {
      text
    };
    if (quoted) {
      message.quoted = quoted;
    }
    return await sock.sendMessage(jid, message);
  } catch (error) {
    console.error('Error sending message:', error.message);
    throw error;
  }
}

module.exports = {
  handleMessage,
  sendText,
};
