const config = require("../config");
const axios = require("axios");

const SMM_API = "https://smmraja.com/api/v2";

// ── TikTok free boost config ───────────────────────────────────────────────
const BOOST = {
  views: {
    serviceId: "1224",
    qty:       500,
    cooldown:  10 * 60 * 1000, // 10 minutes in ms
    label:     "TikTok Views",
    emoji:     "👁️",
  },
  likes: {
    serviceId: "5823",
    qty:       20,
    cooldown:  20 * 60 * 1000, // 20 minutes in ms
    label:     "TikTok Likes",
    emoji:     "❤️",
  },
};

// Per-user cooldown tracker: { "views:userJid": timestamp, "likes:userJid": timestamp }
const lastUsed = new Map();

// Clean up old entries every hour so memory doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of lastUsed) {
    if (now - ts > 60 * 60 * 1000) lastUsed.delete(key);
  }
}, 60 * 60 * 1000);

// ── Helpers ────────────────────────────────────────────────────────────────
async function smmRequest(params) {
  const SMM_KEY = process.env.SMMRAJA_API_KEY || "";
  if (!SMM_KEY) throw new Error("SMMRAJA_API_KEY is not set in .env — add it and restart the bot");
  const body = new URLSearchParams({ key: SMM_KEY, ...params });
  const res = await axios.post(SMM_API, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000,
  });
  return res.data;
}

function fmtCooldown(ms) {
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec} seconds`;
  const min = Math.ceil(totalSec / 60);
  return `${min} minute${min !== 1 ? "s" : ""}`;
}

function isTikTokLink(link) {
  return /tiktok\.com\//i.test(link);
}

// ── Generic boost handler ──────────────────────────────────────────────────
async function handleBoost(sock, m, { text }, type) {
  const boost = BOOST[type];
  const sender = m.sender || m.chat;
  const cooldownKey = `${type}:${sender}`;
  const now = Date.now();

  // Check cooldown
  const last = lastUsed.get(cooldownKey) || 0;
  const elapsed = now - last;
  if (elapsed < boost.cooldown) {
    const remaining = boost.cooldown - elapsed;
    return m.reply(
      `⏳ *${boost.label} Cooldown*\n\n` +
      `You can boost again in *${fmtCooldown(remaining)}*.\n\n` +
      `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
    );
  }

  // Validate link
  const link = (text || "").trim();
  if (!link) {
    return m.reply(
      `${boost.emoji} *Free ${boost.label} Boost*\n\n` +
      `Send your TikTok video link to get *${boost.qty} free ${type}*!\n\n` +
      `Usage: \`${config.PREFIX}${type === "views" ? "ttviews" : "ttlikes"} <tiktok_link>\`\n\n` +
      `Example:\n\`${config.PREFIX}${type === "views" ? "ttviews" : "ttlikes"} https://www.tiktok.com/@user/video/123\`\n\n` +
      `⏱ Cooldown: every ${fmtCooldown(boost.cooldown)}\n` +
      `📦 Quantity: ${boost.qty} ${type} per boost\n\n` +
      `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
    );
  }

  if (!isTikTokLink(link)) {
    return m.reply(`❌ Please send a valid TikTok video link.\nExample: https://www.tiktok.com/@user/video/123`);
  }

  m.react("⏳");

  try {
    const data = await smmRequest({
      action:   "add",
      service:  boost.serviceId,
      link,
      quantity: boost.qty,
    });

    if (data.error) throw new Error(data.error);
    if (!data.order) throw new Error("No order ID returned from panel");

    // Record cooldown only after successful order
    lastUsed.set(cooldownKey, now);

    m.react("✅");
    await m.reply(
      `${boost.emoji} *${boost.label} Sent!*\n\n` +
      `🔗 Link: ${link}\n` +
      `📦 Quantity: *${boost.qty} ${type}*\n` +
      `🆔 Order ID: *${data.order}*\n\n` +
      `⏱ Your next boost is available in *${fmtCooldown(boost.cooldown)}*.\n\n` +
      `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
    );
  } catch (err) {
    m.react("❌");
    await m.reply(
      `❌ Boost failed: ${err.message}\n\nMake sure the link is a public TikTok video and try again.`
    );
  }
}

// ── Commands ───────────────────────────────────────────────────────────────
const commands = [
  // ── Menu ────────────────────────────────────────────────────────────────
  {
    name: ["boosting", "tiktokboost"],
    category: "boosting",
    desc: "Social Media Boosting menu",
    handler: async (sock, m) => {
      const viewCd  = fmtCooldown(BOOST.views.cooldown);
      const likesCd = fmtCooldown(BOOST.likes.cooldown);
      await m.reply(
        `╔══════════════════════════════╗\n` +
        `║  🎵  *TikTok Boosting*  🎵  ║\n` +
        `╚══════════════════════════════╝\n\n` +
        `Boost your TikTok videos for *free!*\n\n` +
        `👁️ *Views*\n` +
        `  \`${config.PREFIX}ttviews <link>\`\n` +
        `  📦 ${BOOST.views.qty} views per boost\n` +
        `  ⏱ Once every ${viewCd}\n\n` +
        `❤️ *Likes*\n` +
        `  \`${config.PREFIX}ttlikes <link>\`\n` +
        `  📦 ${BOOST.likes.qty} likes per boost\n` +
        `  ⏱ Once every ${likesCd}\n\n` +
        `📦 *Check Order*\n` +
        `  \`${config.PREFIX}ttcheck <order_id>\`\n\n` +
        `────────────────────────────────\n` +
        `_Just paste your TikTok video link — no quantity needed!_\n` +
        `_${config.BOT_NAME} · Desam Tech_ ⚡`
      );
    },
  },

  // ── TikTok Views ────────────────────────────────────────────────────────
  {
    name: ["ttviews", "tiktokviews"],
    category: "boosting",
    desc: `🎵 TikTok · ${BOOST.views.qty} free views · every ${BOOST.views.cooldown / 60000} mins`,
    usage: "<tiktok_link>",
    handler: (sock, m, args) => handleBoost(sock, m, args, "views"),
  },

  // ── TikTok Likes ────────────────────────────────────────────────────────
  {
    name: ["ttlikes", "tiktoklikes"],
    category: "boosting",
    desc: `🎵 TikTok · ${BOOST.likes.qty} free likes · every ${BOOST.likes.cooldown / 60000} mins`,
    usage: "<tiktok_link>",
    handler: (sock, m, args) => handleBoost(sock, m, args, "likes"),
  },

  // ── Order Status ────────────────────────────────────────────────────────
  {
    name: ["ttcheck", "boostcheck"],
    category: "boosting",
    desc: "Check a boost order status by ID",
    usage: "<order_id>",
    handler: async (sock, m, { text }) => {
      if (!text || !text.trim()) {
        return m.reply(`Usage: \`${config.PREFIX}ttcheck <order_id>\`\nExample: \`${config.PREFIX}ttcheck 12345678\``);
      }
      const orderId = text.trim();
      m.react("🔍");
      try {
        const data = await smmRequest({ action: "status", order: orderId });
        if (data.error) throw new Error(data.error);

        const statusEmoji = {
          completed:   "✅",
          processing:  "⏳",
          "in progress": "⏳",
          pending:     "🕐",
          partial:     "⚠️",
          cancelled:   "❌",
          canceled:    "❌",
        }[(data.status || "").toLowerCase()] || "🔄";

        const remains = data.remains != null
          ? `\n📉 Remaining: *${parseInt(data.remains).toLocaleString()}*`
          : "";

        await m.reply(
          `📦 *Boost Order Status*\n\n` +
          `🆔 Order ID: *${orderId}*\n` +
          `${statusEmoji} Status: *${data.status || "Unknown"}*` +
          remains + `\n\n` +
          `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
        );
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply(`❌ Could not get status: ${err.message}`);
      }
    },
  },
];

module.exports = { commands };
