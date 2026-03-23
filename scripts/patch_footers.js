/**
 * Upgrade all old short footer patterns to the new consistent footer
 *   OLD: _${config.BOT_NAME}_
 *   OLD: _${config.BOT_NAME} | Powered by Desam Tech_ ⚡
 *   NEW: ────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡
 */
const fs = require("fs");
const path = require("path");

const D = "────────────────────────────────";
const NEW_FOOTER = `\n${D}\n_\${config.BOT_NAME} · Desam Tech_ ⚡`;

const PLUGINS_DIR = path.join(__dirname, "../plugins");
const files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith(".js"));

let updated = 0;

for (const file of files) {
  const fp = path.join(PLUGINS_DIR, file);
  let src = fs.readFileSync(fp, "utf8");
  const before = src;

  // OLD 1: `\n_${config.BOT_NAME}_`  (just name, no tech credit)
  src = src.split("\\n_${config.BOT_NAME}_`").join(`${NEW_FOOTER}\``);
  src = src.split("\\n\\n_${config.BOT_NAME}_`").join(`${NEW_FOOTER}\``);

  // OLD 2: `_${config.BOT_NAME}_` at end of a line (no preceding \n)
  src = src.split("_${config.BOT_NAME}_`").join(`_\${config.BOT_NAME} · Desam Tech_ ⚡\``);

  // OLD 3: `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`
  src = src.split("_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`").join(`_\${config.BOT_NAME} · Desam Tech_ ⚡\``);

  // Make sure we don't have double D lines
  src = src.split(`${D}\n${D}`).join(D);

  if (src !== before) {
    fs.writeFileSync(fp, src);
    console.log("✅ " + file);
    updated++;
  }
}

console.log(`\n${updated} files updated.`);
