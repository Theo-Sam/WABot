/**
 * Pairing Web UI Server
 * Serves the WhatsApp pairing page and status API
 */

const express = require('express');
const path = require('path');
const { getState } = require('./botState');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/status', (req, res) => {
  res.json(getState());
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Pairing UI available at http://0.0.0.0:${PORT}`);
  });
}

module.exports = { startServer };
