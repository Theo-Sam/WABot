const config = require("../config");

const D = "────────────────────────────────";
const FOOTER = `\n${D}\n_${config.BOT_NAME} · Desam Tech_ ⚡`;

function header(title, emoji = "") {
  const e = emoji ? `${emoji}  ` : "";
  return `${e}*${title}*\n${D}\n`;
}

function section(title, emoji = "▸") {
  return `\n${emoji} *${title}*\n`;
}

function row(label, value, emoji = "") {
  const e = emoji ? `${emoji} ` : "";
  return `${e}*${label}:*  ${value}\n`;
}

function usage(syntax, example = null, aliases = [], note = null) {
  const p = config.PREFIX;
  let msg = `📖 *Usage:*\n  \`${p}${syntax}\``;
  if (example) msg += `\n\n💡 *Example:*\n  \`${p}${example}\``;
  if (aliases && aliases.length > 0) {
    msg += `\n\n↪ *Aliases:*  ${aliases.map(a => `\`${p}${a}\``).join("  ")}`;
  }
  if (note) msg += `\n\n📌 ${note}`;
  return msg + FOOTER;
}

function error(message, tip = null) {
  let msg = `❌ *${message}*`;
  if (tip) msg += `\n\n💡 *Try:* ${tip}`;
  return msg + FOOTER;
}

function noResult(query, tip = null) {
  let msg = `🔍 *No results found*\n\nNothing matched _"${query}"_.`;
  if (tip) msg += `\n\n💡 *Try:* ${tip}`;
  return msg + FOOTER;
}

function apiError(service = null) {
  const name = service ? `the *${service}* ` : `this `;
  return `⚠️ *Service unavailable*\n\n${name}service is temporarily down. Please try again in a moment.` + FOOTER;
}

function buildCard(lines) {
  return lines.filter(Boolean).join("") + FOOTER;
}

module.exports = { D, FOOTER, header, section, row, usage, error, noResult, apiError, buildCard };
