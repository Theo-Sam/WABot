#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const backupRoot = path.join(rootDir, 'backups');

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function getLatestBackupDir() {
  if (!fs.existsSync(backupRoot)) return null;
  const candidates = fs
    .readdirSync(backupRoot)
    .filter((item) => item.startsWith('state-'))
    .map((item) => path.join(backupRoot, item))
    .filter((fullPath) => fs.statSync(fullPath).isDirectory())
    .sort();

  return candidates.length ? candidates[candidates.length - 1] : null;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeMoveToRollback(sourcePath, rollbackRoot) {
  if (!fs.existsSync(sourcePath)) return;
  const base = path.basename(sourcePath);
  const destination = path.join(rollbackRoot, base);
  fs.renameSync(sourcePath, destination);
}

function copyIfExists(source, destination) {
  if (!fs.existsSync(source)) return false;
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
  const fromArg = getArg('--from');
  const backupDir = fromArg
    ? path.isAbsolute(fromArg)
      ? fromArg
      : path.join(rootDir, fromArg)
    : getLatestBackupDir();

  if (!backupDir || !fs.existsSync(backupDir)) {
    console.error('No backup directory found. Use --from backups/state-<timestamp>.');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackRoot = path.join(backupRoot, `pre-restore-${timestamp}`);
  ensureDir(rollbackRoot);

  const sqlitePath = path.join(rootDir, process.env.SQLITE_PATH || './data/bot.db');
  const sqliteDestinationDir = path.dirname(sqlitePath);
  const authStateDir = path.join(rootDir, 'auth_state');
  const dataDir = path.join(rootDir, 'data');

  safeMoveToRollback(authStateDir, rollbackRoot);
  safeMoveToRollback(dataDir, rollbackRoot);

  ensureDir(sqliteDestinationDir);

  const restored = {
    sqlite: copyIfExists(path.join(backupDir, 'data', path.basename(sqlitePath)), sqlitePath),
    authState: copyIfExists(path.join(backupDir, 'auth_state'), authStateDir),
    dataDir: copyIfExists(path.join(backupDir, 'data_full'), dataDir),
  };

  if (!restored.sqlite && !restored.authState && !restored.dataDir) {
    console.error('Backup found but no restorable files were detected.');
    process.exit(1);
  }

  console.log(`Restore completed from: ${backupDir}`);
  console.log(`Rollback snapshot saved to: ${rollbackRoot}`);
  console.log(`SQLite restored: ${restored.sqlite}`);
  console.log(`Auth state restored: ${restored.authState}`);
  console.log(`Data directory restored: ${restored.dataDir}`);
}

main();
