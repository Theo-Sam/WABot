#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(rootDir, 'backups');
const targetDir = path.join(backupRoot, `state-${timestamp}`);

const dbPath = path.join(rootDir, process.env.SQLITE_PATH || './data/bot.db');
const authStateDir = path.join(rootDir, 'auth_state');
const dataDir = path.join(rootDir, 'data');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyIfExists(source, destination) {
  if (!fs.existsSync(source)) {
    return false;
  }

  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.cpSync(source, destination, { recursive: true });
  } else {
    ensureDir(path.dirname(destination));
    fs.copyFileSync(source, destination);
  }

  return true;
}

function main() {
  ensureDir(backupRoot);
  ensureDir(targetDir);

  const copied = {
    sqlite: copyIfExists(dbPath, path.join(targetDir, 'data', path.basename(dbPath))),
    authState: copyIfExists(authStateDir, path.join(targetDir, 'auth_state')),
    dataDir: copyIfExists(dataDir, path.join(targetDir, 'data_full')),
  };

  const meta = {
    createdAt: new Date().toISOString(),
    sqlitePath: dbPath,
    includes: copied,
    note: 'Restore using: npm run restore:state -- --from backups/state-<timestamp>',
  };

  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(meta, null, 2));

  console.log(`Backup completed: ${targetDir}`);
  console.log(`SQLite copied: ${copied.sqlite}`);
  console.log(`Auth state copied: ${copied.authState}`);
  console.log(`Data directory copied: ${copied.dataDir}`);
}

main();
