/**
 * Patch settings toggle usage messages in group.js, privacy.js, status.js
 */
const fs = require("fs");
const path = require("path");

const D = "────────────────────────────────";

function settingLine(cmdName, options, extraInfo, currentExpr) {
  const opts = options || "on/off";
  const extra = extraInfo ? `\n📌 ${extraInfo}` : "";
  return `m.reply(\`⚙️ *${cmdName}*  —  currently *\${${currentExpr}}*\n\n📖 Usage:  \\\`.${cmdName} ${opts}\\\`${extra}\n${D}\n_\${config.BOT_NAME} · Desam Tech_ ⚡\`)`;
}

// --- group.js patches ---
const groupPath = path.join(__dirname, "../plugins/group.js");
let groupSrc = fs.readFileSync(groupPath, "utf8");

groupSrc = groupSrc.replace(
  /await m\.reply\(`Usage: \$\{config\.PREFIX\}welcome on\/off\\nCurrent: \$\{current\}`\);/g,
  `await ${settingLine("welcome", "on/off", null, "current")};`
);
groupSrc = groupSrc.replace(
  /await m\.reply\(`Usage: \$\{config\.PREFIX\}goodbye on\/off\\nCurrent: \$\{current\}`\);/g,
  `await ${settingLine("goodbye", "on/off", null, "current")};`
);
groupSrc = groupSrc.replace(
  /await m\.reply\(`Usage: \$\{config\.PREFIX\}antilink on \[warn\/delete\/kick\]\\n\$\{config\.PREFIX\}antilink off\\nCurrent: \$\{enabled\} \(\$\{action\}\)`\);/g,
  `await m.reply(\`⚙️ *antilink*  —  currently *\${enabled}* (action: \${action})\n\n📖 Usage:\n  \`.antilink on [warn/delete/kick]\`\n  \`.antilink off\`\n${D}\n_\${config.BOT_NAME} · Desam Tech_ ⚡\`);`
);
groupSrc = groupSrc.replace(
  /await m\.reply\(`Usage: \$\{config\.PREFIX\}chatbot on\/off\\nCurrent: \$\{current\}`\);/g,
  `await ${settingLine("chatbot", "on/off", null, "current")};`
);
groupSrc = groupSrc.replace(
  /await m\.reply\(`Usage: \$\{config\.PREFIX\}autosticker on\/off\\nCurrent: \$\{current\}`\);/g,
  `await ${settingLine("autosticker", "on/off", null, "current")};`
);

const antibadMatch = groupSrc.match(/await m\.reply\(`Usage:\\n\$\{config\.PREFIX\}antibad[^`]+`\);/);
if (antibadMatch) {
  groupSrc = groupSrc.replace(antibadMatch[0],
    `await m.reply(\`⚙️ *antibad*  —  content filter settings\n\n📖 Usage:\n  \`.antibad on\` / \`.antibad off\`\n  \`.antibad add <word>\`\n  \`.antibad remove <word>\`\n  \`.antibad list\`\n${D}\n_\${config.BOT_NAME} · Desam Tech_ ⚡\`);`
  );
}

fs.writeFileSync(groupPath, groupSrc);
console.log("✅ group.js patched");

// --- privacy.js patches ---
const privPath = path.join(__dirname, "../plugins/privacy.js");
let privSrc = fs.readFileSync(privPath, "utf8");

const privPatterns = [
  [/await m\.reply\(`Usage: \$\{config\.PREFIX\}antiviewonce on\/off\\nCurrent: \$\{current\}`\);/g, "antiviewonce"],
  [/await m\.reply\(`Usage: \$\{config\.PREFIX\}antidelete on\/off\\nScope: this group\\nCurrent: \$\{current\}`\);/g, "antidelete", "In a group: applies to that group only"],
  [/await m\.reply\(`Usage: \$\{config\.PREFIX\}antispam on\/off\\nCurrent: \$\{current\}`\);/g, "antispam"],
  [/await m\.reply\(`Usage: \$\{config\.PREFIX\}autoread on\/off\\nCurrent: \$\{config\.AUTO_READ\}`\);/g, "autoread", null, "config.AUTO_READ"],
  [/await m\.reply\(`Usage: \$\{config\.PREFIX\}setautostatus on\/off\\nCurrent: \$\{config\.AUTO_STATUS_VIEW \|\| "off"\}`\);/g, "setautostatus", null, 'config.AUTO_STATUS_VIEW || "off"'],
  [/await m\.reply\(`Usage: \$\{config\.PREFIX\}anticall on\/off\\nCurrent: \$\{config\.ANTI_CALL\}`\);/g, "anticall", null, "config.ANTI_CALL"],
  [/await m\.reply\(`Usage: \$\{config\.PREFIX\}autobio on\/off\\nCurrent: \$\{config\.AUTO_BIO\}`\);/g, "autobio", null, "config.AUTO_BIO"],
];

for (const [pattern, cmd, note, dynExpr] of privPatterns) {
  const expr = dynExpr || "current";
  const noteStr = note ? `\n📌 ${note}` : "";
  privSrc = privSrc.replace(pattern,
    `await m.reply(\`⚙️ *${cmd}*  —  currently *\${${expr}}*\n\n📖 Usage:  \\\`.${cmd} on\\\`  /  \\\`.${cmd} off\\\`${noteStr}\n${D}\n_\${config.BOT_NAME} · Desam Tech_ ⚡\`);`
  );
}

fs.writeFileSync(privPath, privSrc);
console.log("✅ privacy.js patched");

// --- status.js patches ---
const statusPath = path.join(__dirname, "../plugins/status.js");
let statusSrc = fs.readFileSync(statusPath, "utf8");

const statusPatterns = [
  [/await m\.reply\(`Usage: \$\{config\.PREFIX\}statusreact on\/off\\nCurrent: \$\{config\.AUTO_STATUS_REACT \|\| "off"\}`\);/g, "statusreact", null, 'config.AUTO_STATUS_REACT || "off"'],
  [/await m\.reply\(`Usage: \$\{config\.PREFIX\}autoview on\/off\/toggle\\nCurrent: \$\{config\.AUTO_STATUS_VIEW \|\| "off"\}`\);/g, "autoview", "on/off/toggle", null, 'config.AUTO_STATUS_VIEW || "off"'],
  [/await m\.reply\(`Usage: \$\{config\.PREFIX\}statusave on\/off\/toggle\\nCurrent: \$\{config\.AUTO_STATUS_SAVE \|\| "on"\}`\);/g, "statusave", "on/off/toggle", null, 'config.AUTO_STATUS_SAVE || "on"'],
];

for (const [pattern, cmd, opts, note, dynExpr] of statusPatterns) {
  const expr = dynExpr || "current";
  const options = opts || "on/off";
  const noteStr = note ? `\n📌 ${note}` : "";
  statusSrc = statusSrc.replace(pattern,
    `await m.reply(\`⚙️ *${cmd}*  —  currently *\${${expr}}*\n\n📖 Usage:  \\\`.${cmd} ${options}\\\`${noteStr}\n${D}\n_\${config.BOT_NAME} · Desam Tech_ ⚡\`);`
  );
}

fs.writeFileSync(statusPath, statusSrc);
console.log("✅ status.js patched");

// --- games.js ttt ---
const gamesPath = path.join(__dirname, "../plugins/games.js");
let gamesSrc = fs.readFileSync(gamesPath, "utf8");
gamesSrc = gamesSrc.replace(
  /if \(!target\) return m\.reply\(`Usage:\\n\$\{config\.PREFIX\}ttt @player - Start a game\\n\$\{config\.PREFIX\}ttt <1-9> - Make a move[^`]*`\);?/g,
  `if (!target) return m.usageReply("ttt @player", "ttt @player", [], "Use .ttt <1-9> to make a move during a game");`
);

fs.writeFileSync(gamesPath, gamesSrc);
console.log("✅ games.js patched");

console.log("\n✅ All settings patches applied.");
