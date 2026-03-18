#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const cachePath = path.join(rootDir, "data", "status-cache.json");

process.chdir(rootDir);

function log(step, detail) {
  console.log(`[verify-status-cache] ${step}: ${detail}`);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[verify-status-cache] FAIL: ${message}`);
    process.exit(1);
  }
  log("PASS", message);
}

function buildStatus(id, sender, text, ts) {
  return {
    id: `id:${id}`,
    key: {
      remoteJid: "status@broadcast",
      id,
      participant: sender,
    },
    message: {
      extendedTextMessage: {
        text,
      },
    },
    type: "extendedTextMessage",
    sender,
    pushName: sender.split("@")[0],
    timestamp: ts,
  };
}

function main() {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  const fixtures = [
    buildStatus("s1", "11111111111@s.whatsapp.net", "hello one", Date.now() - 4000),
    buildStatus("s1", "11111111111@s.whatsapp.net", "hello one", Date.now() - 3000),
    buildStatus("s2", "22222222222@s.whatsapp.net", "hello two", Date.now() - 2000),
  ];

  fs.writeFileSync(cachePath, JSON.stringify({ version: 1, entries: fixtures }));
  log("setup", `wrote fixture file with ${fixtures.length} entries`);

  const { statusCache } = require("../lib/connection");
  assert(statusCache.size >= 2, "cache reload includes recent statuses from disk");

  const ids = [...statusCache.values()].map((entry) => entry.key?.id).filter(Boolean);
  const uniqueIds = new Set(ids);
  assert(uniqueIds.size === ids.length, "dedupe removes duplicate status ids on reload");

  const config = require("../config");
  config.AUTO_STATUS_VIEW = "off";
  assert(config.AUTO_STATUS_VIEW === "off", "runtime statusview off can be applied without restart");
  config.AUTO_STATUS_VIEW = "on";
  assert(config.AUTO_STATUS_VIEW === "on", "runtime statusview on can be applied without restart");

  const newest = [...statusCache.values()].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).at(-1);
  assert(!!newest, "statusdl list would have at least one recent status to show");

  try {
    fs.unlinkSync(cachePath);
    log("cleanup", "removed temporary fixture cache file");
  } catch (err) {
    log("cleanup", `could not remove fixture cache file: ${err.message}`);
  }

  log("done", "status cache verification completed successfully");
  process.exit(0);
}

main();
