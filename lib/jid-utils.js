/**
 * WhatsApp JID (Jabber ID) Utilities
 * 
 * Handles all WhatsApp chat types and their JID formats:
 * - Personal Chat:  phone@s.whatsapp.net     (e.g., 254700000000@s.whatsapp.net)
 * - Group Chat:     id@g.us                  (e.g., 120363419778858313@g.us)
 * - Broadcast:      status@broadcast
 * - Newsletter:     id@newsletter            (e.g., 123456789012345678@newsletter)
 * - LID (Link ID):  id:0@lid                 (e.g., 108856566886612@lid or with :0/:1/:2)
 */

/**
 * Get the JID type from a WhatsApp JID string
 * @param {string} jid - The WhatsApp JID to analyze
 * @returns {string} One of: 'personal', 'group', 'broadcast', 'newsletter', 'lid', 'unknown'
 */
function getJidType(jid) {
  if (!jid || typeof jid !== 'string') return 'unknown';

  if (jid === 'status@broadcast') return 'broadcast';
  if (jid.endsWith('@s.whatsapp.net')) return 'personal';
  if (jid.endsWith('@g.us')) return 'group';
  if (jid.endsWith('@newsletter')) return 'newsletter';
  if (jid.includes('@lid')) return 'lid';

  return 'unknown';
}

/**
 * Check if JID is a personal/direct message chat
 * @param {string} jid - The WhatsApp JID
 * @returns {boolean}
 */
function isPersonalChat(jid) {
  return getJidType(jid) === 'personal';
}

/**
 * Check if JID is a group chat
 * @param {string} jid - The WhatsApp JID
 * @returns {boolean}
 */
function isGroupChat(jid) {
  return getJidType(jid) === 'group';
}

/**
 * Check if JID is a broadcast/status message
 * @param {string} jid - The WhatsApp JID
 * @returns {boolean}
 */
function isBroadcast(jid) {
  return getJidType(jid) === 'broadcast';
}

/**
 * Check if JID is a newsletter
 * @param {string} jid - The WhatsApp JID
 * @returns {boolean}
 */
function isNewsletter(jid) {
  return getJidType(jid) === 'newsletter';
}

/**
 * Check if JID is a Link ID (LID)
 * @param {string} jid - The WhatsApp JID
 * @returns {boolean}
 */
function isLid(jid) {
  return getJidType(jid) === 'lid';
}

/**
 * Extract phone number from personal chat JID
 * @param {string} jid - The WhatsApp JID (personal only)
 * @returns {string|null} Phone number or null if not a personal JID
 */
function extractPhoneNumber(jid) {
  if (!isPersonalChat(jid)) return null;
  return jid.split('@')[0];
}

/**
 * Extract group ID from group chat JID
 * @param {string} jid - The WhatsApp JID (group only)
 * @returns {string|null} Group ID or null if not a group JID
 */
function extractGroupId(jid) {
  if (!isGroupChat(jid)) return null;
  return jid.split('@')[0];
}

/**
 * Extract newsletter ID from newsletter JID
 * @param {string} jid - The WhatsApp JID (newsletter only)
 * @returns {string|null} Newsletter ID or null if not a newsletter JID
 */
function extractNewsletterId(jid) {
  if (!isNewsletter(jid)) return null;
  return jid.split('@')[0];
}

/**
 * Extract LID from Link ID JID
 * @param {string} jid - The WhatsApp JID (LID only)
 * @returns {string|null} LID (may include :0, :1, :2 suffix) or null if not an LID JID
 */
function extractLidId(jid) {
  if (!isLid(jid)) return null;
  return jid.split('@')[0];
}

/**
 * Get a human-readable chat type label
 * @param {string} jid - The WhatsApp JID
 * @returns {string} Readable chat type label
 */
function getChatTypeLabel(jid) {
  const type = getJidType(jid);
  const labels = {
    'personal': '👤 Personal Chat',
    'group': '👥 Group Chat',
    'broadcast': '📢 Broadcast/Status',
    'newsletter': '📰 Newsletter',
    'lid': '🔗 Link ID (LID)',
    'unknown': '❓ Unknown'
  };
  return labels[type] || labels.unknown;
}

/**
 * Format a JID for logging with type information
 * @param {string} jid - The WhatsApp JID
 * @returns {string} Formatted JID string with type indicator
 */
function formatJidForLogging(jid) {
  const type = getJidType(jid);
  const icons = {
    'personal': '👤',
    'group': '👥',
    'broadcast': '📢',
    'newsletter': '📰',
    'lid': '🔗',
    'unknown': '❓'
  };
  const icon = icons[type] || '❓';
  return `${icon} ${jid} [${type}]`;
}

/**
 * Validate if a string is a properly formatted JID
 * @param {string} jid - The string to validate
 * @returns {boolean}
 */
function isValidJid(jid) {
  if (!jid || typeof jid !== 'string') return false;
  if (jid.includes('@')) {
    const type = getJidType(jid);
    return type !== 'unknown';
  }
  return false;
}

/**
 * Get supported message types for a given JID type
 * @param {string} jid - The WhatsApp JID
 * @returns {object} Object with support flags
 */
function getSupportedFeatures(jid) {
  const type = getJidType(jid);
  const features = {
    personal: {
      canReceiveMessage: true,
      canSendMessage: true,
      canReceiveCallEvent: true,
      canRejectCall: true,
      supportGroupFeatures: false,
      displayName: 'Personal Chat'
    },
    group: {
      canReceiveMessage: true,
      canSendMessage: true,
      canReceiveCallEvent: false,
      canRejectCall: false,
      supportGroupFeatures: true,
      displayName: 'Group Chat'
    },
    broadcast: {
      canReceiveMessage: true,
      canSendMessage: false,
      canReceiveCallEvent: false,
      canRejectCall: false,
      supportGroupFeatures: false,
      displayName: 'Broadcast/Status'
    },
    newsletter: {
      canReceiveMessage: true,
      canSendMessage: true,
      canReceiveCallEvent: false,
      canRejectCall: false,
      supportGroupFeatures: false,
      displayName: 'Newsletter'
    },
    lid: {
      canReceiveMessage: true,
      canSendMessage: true,
      canReceiveCallEvent: false,
      canRejectCall: false,
      supportGroupFeatures: false,
      displayName: 'Link ID (LID)'
    },
    unknown: {
      canReceiveMessage: false,
      canSendMessage: false,
      canReceiveCallEvent: false,
      canRejectCall: false,
      supportGroupFeatures: false,
      displayName: 'Unknown'
    }
  };
  return features[type] || features.unknown;
}

module.exports = {
  getJidType,
  isPersonalChat,
  isGroupChat,
  isBroadcast,
  isNewsletter,
  isLid,
  extractPhoneNumber,
  extractGroupId,
  extractNewsletterId,
  extractLidId,
  getChatTypeLabel,
  formatJidForLogging,
  isValidJid,
  getSupportedFeatures
};
