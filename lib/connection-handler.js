/**
 * Connection Handler - Handle connection-related events
 */

async function handleConnection(sock, update) {
  try {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('✅ Connection established');
    } else if (connection === 'close') {
      console.log('❌ Connection closed');
    } else if (connection === 'connecting') {
      console.log('⏳ Connecting to WhatsApp...');
    }
  } catch (error) {
    console.error('Error in connection handler:', error.message);
  }
}

module.exports = {
  handleConnection,
};
