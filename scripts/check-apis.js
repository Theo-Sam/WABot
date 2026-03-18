#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");

const root = path.join(__dirname, "..");
const pluginsDir = path.join(root, "plugins");

function collectPluginFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(dir, name));
}

function extractUrls(content) {
  const regex = /https?:\/\/[^\s`"')]+/g;
  const found = content.match(regex) || [];
  return [...new Set(found)];
}

function normalizeProbeTarget(rawUrl) {
  if (rawUrl.includes("${")) return null;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function probeHttpsOrigin(origin, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const req = https.request(
      origin,
      {
        method: "GET",
        timeout: timeoutMs,
        headers: {
          "User-Agent": "WABot-API-Doctor/1.0",
          Accept: "application/json,text/plain,*/*",
        },
      },
      (res) => {
        resolve({ ok: true, statusCode: res.statusCode || 0 });
        res.resume();
      }
    );

    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });

    req.end();
  });
}

async function main() {
  const files = collectPluginFiles(pluginsDir);
  const originToFiles = new Map();

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const urls = extractUrls(content);
    for (const url of urls) {
      const origin = normalizeProbeTarget(url);
      if (!origin) continue;
      if (!originToFiles.has(origin)) originToFiles.set(origin, new Set());
      originToFiles.get(origin).add(path.relative(root, filePath));
    }
  }

  const origins = [...originToFiles.keys()].sort();
  if (!origins.length) {
    console.log("No HTTPS endpoints found.");
    process.exit(0);
  }

  console.log(`Checking ${origins.length} API origins used by plugins...\n`);

  let pass = 0;
  let fail = 0;

  for (const origin of origins) {
    const result = await probeHttpsOrigin(origin);
    const filesUsing = [...originToFiles.get(origin)].sort().join(", ");

    if (result.ok) {
      pass += 1;
      console.log(`[PASS] ${origin} -> HTTP ${result.statusCode} | used in: ${filesUsing}`);
    } else {
      fail += 1;
      console.log(`[FAIL] ${origin} -> ${result.error} | used in: ${filesUsing}`);
    }
  }

  console.log("\nSummary");
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
