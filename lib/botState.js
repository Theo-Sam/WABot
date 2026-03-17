/**
 * Shared bot state — readable by the web server
 */

const state = {
  status: 'starting',
  statusUpdatedAt: Date.now(),
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
  const next = { ...updates };
  if (Object.prototype.hasOwnProperty.call(next, 'status') && next.status !== state.status) {
    next.statusUpdatedAt = Date.now();
  }
  Object.assign(state, next, { lastUpdated: Date.now() });
}

function getState() {
  return { ...state };
}

module.exports = { setState, getState };
