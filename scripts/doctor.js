#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
process.chdir(rootDir);

require('dotenv').config({ path: path.join(rootDir, '.env') });

const config = require('../config');
const { getDatabasePath, ensureDatabaseReady, closeDb } = require('../lib/database');

const results = [];

function addResult(status, title, detail) {
  results.push({ status, title, detail });
}

function check(condition, title, successDetail, failureDetail) {
  if (condition) {
    addResult('PASS', title, successDetail);
    return true;
  }
  addResult('FAIL', title, failureDetail);
  return false;
}

function warn(condition, title, okDetail, warnDetail) {
  if (condition) {
    addResult('PASS', title, okDetail);
    return true;
  }
  addResult('WARN', title, warnDetail);
  return false;
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function printResults() {
  for (const result of results) {
    const prefix = result.status === 'PASS' ? '[PASS]' : result.status === 'WARN' ? '[WARN]' : '[FAIL]';
    console.log(`${prefix} ${result.title}`);
    if (result.detail) {
      console.log(`       ${result.detail}`);
    }
  }
}

function main() {
  console.log('DESAM WABOT deployment doctor\n');

  const majorNode = Number(process.versions.node.split('.')[0]);
  check(
    majorNode >= 20 && majorNode < 25,
    'Node.js version',
    `Running Node ${process.versions.node}`,
    `Node ${process.versions.node} detected. Required range is >=20 <25.`
  );

  check(
    !!config.SESSION_ID,
    'WhatsApp session configured',
    'SESSION_ID or SESSION_FILE is present.',
    'Missing SESSION_ID/SESSION_FILE. The bot cannot start without a valid external session.'
  );

  const dbPath = getDatabasePath();
  try {
    ensureDatabaseReady();
    addResult('PASS', 'SQLite database ready', `SQLite opened successfully at ${dbPath}`);
  } catch (error) {
    addResult('FAIL', 'SQLite database ready', error.message);
  }

  check(
    fileExists('.env.example'),
    'Environment template',
    '.env.example is present.',
    '.env.example is missing.'
  );

  check(
    fileExists('ecosystem.config.cjs'),
    'PM2 config',
    'ecosystem.config.cjs is present.',
    'ecosystem.config.cjs is missing.'
  );

  check(
    fileExists('Procfile'),
    'Heroku worker config',
    'Procfile is present.',
    'Procfile is missing.'
  );

  check(
    fileExists('render.yaml'),
    'Render worker config',
    'render.yaml is present.',
    'render.yaml is missing.'
  );

  check(
    fileExists('Dockerfile'),
    'Docker config',
    'Dockerfile is present.',
    'Dockerfile is missing.'
  );

  warn(
    fileExists('DEPLOYMENT.md'),
    'Deployment guide',
    'DEPLOYMENT.md is present.',
    'DEPLOYMENT.md is missing.'
  );

  const authDir = path.join(rootDir, 'auth_state');
  const dataDir = path.join(rootDir, 'data');
  warn(
    fs.existsSync(authDir),
    'Auth state directory',
    `auth_state directory exists at ${authDir}`,
    'auth_state directory does not exist yet. It will be created at runtime.'
  );

  warn(
    fs.existsSync(dataDir),
    'Data directory',
    `data directory exists at ${dataDir}`,
    'data directory does not exist yet. It will be created when SQLite starts.'
  );

  printResults();

  const hasFailures = results.some((result) => result.status === 'FAIL');
  closeDb();
  process.exit(hasFailures ? 1 : 0);
}

main();
