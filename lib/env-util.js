// Utility to update or insert a key=value in a .env file
const fs = require('fs');
const path = require('path');

function setEnvValue(filePath, key, value) {
  let lines = [];
  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  }
  let found = false;
  const keyEq = key + '=';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(keyEq)) {
      lines[i] = keyEq + value;
      found = true;
      break;
    }
  }
  if (!found) {
    lines.push(keyEq + value);
  }
  fs.writeFileSync(filePath, lines.join('\n'));
}

module.exports = { setEnvValue };