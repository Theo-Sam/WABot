const config = require("../config");
const { banUser, unbanUser, isBanned, listBanned } = require("../lib/database");
const { runtime, getSystemInfo, fetchJson } = require("../lib/helpers");

const commands = [
  {
    name: ["restart", "reboot"],
    category: "owner",
    desc: "Restart the bot",
    owner: true,
    handler: async (sock, m) => {
      await m.reply("🔄 Restarting bot...");
      process.exit(0);
    },
  },
  {
    name: ["shutdown", "off"],
    category: "owner",
    desc: "Shutdown the bot",
    owner: true,
    handler: async (sock, m) => {
      await m.reply("👋 Shutting down...");
      process.exit(1);
    },
  },
  {
    name: ["reload", "loadplugins"],
    category: "owner",
    desc: "Reload all plugins",
    owner: true,
    handler: async (sock, m) => {
      const { loadPlugins } = require("../lib/handler");
      loadPlugins();
      await m.reply("✅ All plugins reloaded!");
    },
  },
  {
    name: ["broadcast", "bc"],
    category: "owner",
    desc: "Broadcast message to all chats",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("broadcast <message>");
      m.react("⏳");
      try {
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.keys(chats);
        if (!groups.length) return m.reply("ℹ️ No groups found for broadcast.");
        let sent = 0;
        for (const jid of groups) {
          try {
            await sock.sendMessage(jid, { text: `📢 *Broadcast from ${config.BOT_NAME}*\n\n${text}` });
            sent++;
          } catch {}
        }
        await m.reply(`✅ Broadcast complete.\nDelivered: ${sent}/${groups.length} groups.`);
      } catch (err) {
        await m.reply("❌ Broadcast failed.");
      }
    },
  },
  {
    name: ["ban"],
    category: "owner",
    desc: "Ban a user from using the bot",
    owner: true,
    handler: async (sock, m, { text }) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to ban.");
      banUser(target, text || "Banned by owner");
      await m.reply(`🚫 @${target.split("@")[0]} has been banned from using the bot.`, { mentions: [target] });
    },
  },
  {
    name: ["unban"],
    category: "owner",
    desc: "Unban a user",
    owner: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      if (!target) return m.reply("Tag or reply to someone to unban.");
      unbanUser(target);
      await m.reply(`✅ @${target.split("@")[0]} has been unbanned.`, { mentions: [target] });
    },
  },
  {
    name: ["setprefix"],
    category: "owner",
    desc: "Change bot prefix",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply("Provide a new prefix.");
      config.PREFIX = text.trim();
      await m.reply(`✅ Prefix changed to: *${config.PREFIX}*`);
    },
  },
  {
    name: ["setmode", "mode"],
    category: "owner",
    desc: "Set bot mode (public/private)",
    owner: true,
    handler: async (sock, m, { text }) => {
      const mode = text?.toLowerCase();
      if (!["public", "private"].includes(mode)) {
        return m.usageReply("setmode public/private");
      }
      config.MODE = mode;
      await m.reply(`✅ Bot mode changed to: *${mode}*`);
    },
  },
  {
    name: ["setname", "setbotname"],
    category: "owner",
    desc: "Change bot display name",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply("Provide a new name.");
      config.BOT_NAME = text.trim();
      await m.reply(`✅ Bot name changed to: *${config.BOT_NAME}*`);
    },
  },
  {
    name: ["status", "botstatus"],
    category: "owner",
    desc: "Show detailed bot status",
    owner: true,
    handler: async (sock, m) => {
      const sys = getSystemInfo();
      const mem = process.memoryUsage();
      const text = `📊 *Bot Status*\n\n` +
        `⏱️ Uptime: ${runtime()}\n` +
        `📡 Mode: ${config.MODE}\n` +
        `🔑 Prefix: ${config.PREFIX}\n\n` +
        `💻 *System*\n` +
        `RAM Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB\n` +
        `Total RAM: ${sys.totalMem}\n` +
        `Free RAM: ${sys.freeMem}\n` +
        `CPUs: ${sys.cpus}\n` +
        `Platform: ${sys.platform}\n` +
        `Node: ${sys.nodeVersion}`;
      await m.reply(text);
    },
  },
  {
    name: ["jid"],
    category: "owner",
    desc: "Get JID of chat/user",
    owner: true,
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender || m.chat;
      await m.reply(`📌 JID: ${target}`);
    },
  },
  {
    name: ["eval", "exec", "run"],
    category: "owner",
    desc: "Execute JavaScript code",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("eval <code>");
      try {
        let result = eval(text);
        if (result instanceof Promise) result = await result;
        if (typeof result !== "string") result = require("util").inspect(result, { depth: 2 });
        await m.reply(`✅ *Result:*\n\n${result.substring(0, 3000)}`);
      } catch (err) {
        await m.reply(`❌ *Error:*\n\n${err.message}`);
      }
    },
  },
  {
    name: ["shell", "bash", "cmd"],
    category: "owner",
    desc: "Execute shell command",
    owner: true,
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("shell <command>");
      try {
        const { exec } = require("child_process");
        const result = await new Promise((resolve, reject) => {
          exec(text, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            if (err && !stdout && !stderr) reject(err);
            else resolve((stdout || "") + (stderr || ""));
          });
        });
        await m.reply(`💻 *Shell Output:*\n\n${(result || "No output").substring(0, 3000)}`);
      } catch (err) {
        await m.reply(`❌ *Error:*\n\n${err.message}`);
      }
    },
  },
  {
    name: ["banlist", "bannedlist"],
    category: "owner",
    desc: "Show all banned users",
    owner: true,
    handler: async (sock, m) => {
      const banned = listBanned();
      if (!banned || banned.length === 0) {
        return m.reply("✅ No banned users.");
      }
      let msg = `🚫 *Banned Users (${banned.length})*\n\n`;
      banned.forEach((b, i) => {
        msg += `${i + 1}. ${b.jid.split("@")[0]}${b.reason ? ` — ${b.reason}` : ""}\n`;
      });
      msg += `\nUse ${config.PREFIX}unban @user to remove a ban.`;
      await m.reply(msg);
    },
  },
  {
    name: ["listplugins", "plugins"],
    category: "owner",
    desc: "List all loaded plugins",
    owner: true,
    handler: async (sock, m, { commands: cmds }) => {
      const fs = require("fs");
      const path = require("path");
      const pluginsDir = path.join(__dirname);
      const files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith(".js"));
      let msg = `📦 *Loaded Plugins (${files.length})*\n\n`;
      files.forEach((f) => { msg += `▸ ${f}\n`; });
      msg += `\n📊 Total commands: ${cmds.size}`;
      await m.reply(msg);
    },
  },
  {
    name: ["testdl", "dltest", "diagdl"],
    category: "owner",
    desc: "Diagnose download stack — tests yt-dlp, SoundCloud, Invidious on this VPS",
    owner: true,
    handler: async (sock, m) => {
      const { execFile } = require("child_process");
      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      const axios = require("axios");

      await m.reply("🔍 Running download diagnostics — this may take up to 60 seconds...");

      const results = [];
      const TEST_VID = "JGwWNGJdvx8"; // Ed Sheeran - Shape of You
      const TEST_URL = `https://www.youtube.com/watch?v=${TEST_VID}`;

      // Helper: run yt-dlp and return { ok, info }
      function runYtDlp(args, timeoutMs = 20000) {
        return new Promise((resolve) => {
          const ytdlpBin = [
            path.join(__dirname, "..", "bin", "yt-dlp"),
            "/usr/local/bin/yt-dlp",
            "/usr/bin/yt-dlp",
          ].find((p) => { try { return fs.existsSync(p); } catch { return false; } });
          if (!ytdlpBin) return resolve({ ok: false, info: "binary not found" });
          let stderr = "";
          const proc = execFile(ytdlpBin, args, { timeout: timeoutMs }, (err, stdout) => {
            if (err) resolve({ ok: false, info: stderr.replace(/\n/g, " ").slice(0, 120) });
            else resolve({ ok: true, info: stdout.trim().slice(0, 80) });
          });
          proc.stderr?.on("data", (d) => { stderr += d; });
        });
      }

      // 1. yt-dlp version
      const ver = await runYtDlp(["--version"], 5000);
      results.push(`${ver.ok ? "✅" : "❌"} yt-dlp binary: ${ver.ok ? ver.info : ver.info}`);

      // 2. YouTube tv_embedded (--get-url only, no download)
      const ytEmbed = await runYtDlp([
        "--no-warnings", "--no-playlist", "--force-ipv4", "--geo-bypass",
        "--extractor-args", "youtube:player_client=tv_embedded",
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "--get-url", TEST_URL,
      ], 20000);
      results.push(`${ytEmbed.ok ? "✅" : "❌"} YouTube tv_embedded: ${ytEmbed.ok ? "URL ok" : ytEmbed.info}`);

      // 3. YouTube android_vr (--get-url only)
      const ytAndroid = await runYtDlp([
        "--no-warnings", "--no-playlist", "--force-ipv4", "--geo-bypass",
        "--extractor-args", "youtube:player_client=android_vr",
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "--get-url", TEST_URL,
      ], 20000);
      results.push(`${ytAndroid.ok ? "✅" : "❌"} YouTube android_vr: ${ytAndroid.ok ? "URL ok" : ytAndroid.info}`);

      // 4. SoundCloud via scsearch (--get-url only)
      const sc = await runYtDlp([
        "--no-warnings", "--no-playlist", "--force-ipv4",
        "-f", "bestaudio",
        "--get-url", "scsearch1:Shape of You Ed Sheeran",
      ], 25000);
      results.push(`${sc.ok ? "✅" : "❌"} SoundCloud scsearch: ${sc.ok ? "URL ok" : sc.info}`);

      // 5. Invidious API
      const INVIDIOUS = [
        "https://invidious.protokolla.fi",
        "https://inv.tux.pizza",
        "https://invidious.io.lol",
      ];
      let invOk = false;
      for (const inst of INVIDIOUS) {
        try {
          const data = await fetchJson(`${inst}/api/v1/videos/${TEST_VID}?local=true`, { timeout: 10000 });
          if (data?.adaptiveFormats?.length) {
            results.push(`✅ Invidious (${inst.replace("https://", "")}): ${data.adaptiveFormats.length} formats`);
            invOk = true;
            break;
          }
        } catch (e) {
          // continue
        }
      }
      if (!invOk) results.push("❌ Invidious: all instances failed");

      // 6. cookies.txt present?
      const botRoot = path.join(__dirname, "..");
      const cookiesPath = [
        path.join(botRoot, "cookies.txt"),
        path.join(botRoot, "youtube-cookies.txt"),
      ].find((p) => { try { return fs.existsSync(p) && fs.statSync(p).size > 100; } catch { return false; } });
      results.push(`${cookiesPath ? "✅" : "⚠️"} cookies.txt: ${cookiesPath ? "found (" + path.basename(cookiesPath) + ")" : "not found (add for best reliability)"}`);

      // 7. Network: can we reach YouTube at all?
      try {
        await axios.get("https://www.youtube.com/robots.txt", { timeout: 6000 });
        results.push("✅ Network: YouTube reachable");
      } catch (e) {
        results.push(`❌ Network: YouTube unreachable (${e.message?.slice(0, 50)})`);
      }

      // 8. Network: SoundCloud reachable?
      try {
        await axios.get("https://soundcloud.com/robots.txt", { timeout: 6000 });
        results.push("✅ Network: SoundCloud reachable");
      } catch (e) {
        results.push(`❌ Network: SoundCloud unreachable (${e.message?.slice(0, 50)})`);
      }

      const report = [
        "📊 *Download Diagnostics*",
        `🖥️ VPS: ${os.hostname()} | Node ${process.version}`,
        "────────────────────────",
        ...results,
        "────────────────────────",
        "Share this report to diagnose download failures.",
      ].join("\n");

      await m.reply(report);
    },
  },
];

module.exports = { commands };