/**
 * Shared bot state — readable by the web server
 */

const state = {
  status: 'starting',
  pairingCode: null,
  pairingPhone: null,
  jid: null,
  botName: null,
  prefix: null,
  commandCount: 0,
  connectedAt: null,
  lastUpdated: Date.now(),
};

function setState(updates) {
  Object.assign(state, updates, { lastUpdated: Date.now() });
}

function getState() {
  return { ...state };
}

module.exports = { setState, getState };
