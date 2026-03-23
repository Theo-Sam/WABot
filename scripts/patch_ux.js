/**
 * UX Patch Script — updates all plugin files to use m.usageReply() and
 * m.apiErrorReply() / m.errorReply() consistently.
 *
 * Run with: node scripts/patch_ux.js
 */

const fs = require("fs");
const path = require("path");

const PLUGINS_DIR = path.join(__dirname, "../plugins");
const files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith(".js"));

let totalFixed = 0;

for (const file of files) {
  const filePath = path.join(PLUGINS_DIR, file);
  let src = fs.readFileSync(filePath, "utf8");
  const before = src;

  // ── 1. Fix wrong ⏳ emoji + "API currently overloaded" error messages ──────
  // Pattern: await m.reply("⏳ The XYZ API is currently overloaded.");
  src = src.replace(
    /await m\.reply\(`⏳ The (.+?) API is currently overloaded\.`\);?/g,
    (_, svc) => `return m.apiErrorReply("${svc}");`
  );
  src = src.replace(
    /await m\.reply\("⏳ The (.+?) API is currently overloaded\."\);?/g,
    (_, svc) => `return m.apiErrorReply("${svc}");`
  );

  // ── 2. Fix generic "Failed to fetch X." error messages ────────────────────
  src = src.replace(
    /(?:await )?m\.reply\("❌ Failed to fetch (.+?)\."\);?/g,
    (_, svc) => `return m.apiErrorReply("${svc}");`
  );
  src = src.replace(
    /(?:await )?m\.reply\(`❌ Failed to fetch (.+?)\.`\);?/g,
    (_, svc) => `return m.apiErrorReply("${svc}");`
  );

  // ── 3. Fix "Grammar check is busy" and similar one-off overload messages ──
  src = src.replace(
    /(?:await )?m\.reply\("⏳ Grammar check is busy\. Try again later\."\);?/g,
    `return m.apiErrorReply("Grammar Check");`
  );
  src = src.replace(
    /(?:await )?m\.reply\("⏳ ([^"]+?) is (currently overloaded|busy|unavailable)[^"]*"\);?/g,
    (_, svc) => `return m.apiErrorReply("${svc.trim()}");`
  );

  // ── 4. Fix "Failed to calculate / look up / get" patterns ─────────────────
  src = src.replace(
    /(?:await )?m\.reply\("❌ Failed to (calculate|look up|get|load|send|save|delete|parse) (.+?)\."\);?/g,
    (_, verb, what) => `return m.errorReply("Failed to ${verb} ${what}. Please try again.");`
  );

  // ── 5. Simple "Usage: prefix + cmd" single-line patterns ──────────────────
  // Pattern: return m.reply(`Usage: ${config.PREFIX}cmd <arg>\nExample: ...`)
  // → two-line with example
  src = src.replace(
    /return m\.reply\(`Usage: \$\{config\.PREFIX\}([^\n`]+)\\nExample: \$\{config\.PREFIX\}([^\n`]+)`\);?/g,
    (_, syntax, example) => `return m.usageReply("${syntax.trim()}", "${example.trim()}");`
  );

  // Pattern: return m.reply(`Usage: prefix + cmd\nExample: ...`) (with \n newline chars)
  src = src.replace(
    /return m\.reply\(`Usage: \$\{config\.PREFIX\}([^\`]+?)\\nExample: ([^\`]+?)`\);?/g,
    (_, syntax, example) => {
      const s = syntax.trim().replace(/\n/g, " ");
      const e = example.replace(/\$\{config\.PREFIX\}/g, "").trim();
      return `return m.usageReply("${s}", "${e}");`;
    }
  );

  // Pattern: single-line, no example
  src = src.replace(
    /return m\.reply\(`Usage: \$\{config\.PREFIX\}([^`\n]+?)`\);?/g,
    (_, syntax) => `return m.usageReply("${syntax.trim()}");`
  );

  if (src !== before) {
    fs.writeFileSync(filePath, src);
    const count = (src.length - before.length);
    console.log(`✅  ${file} — patched`);
    totalFixed++;
  } else {
    console.log(`—   ${file} — no changes`);
  }
}

console.log(`\nDone. ${totalFixed}/${files.length} files updated.`);
