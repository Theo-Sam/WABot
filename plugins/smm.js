const config = require("../config");
const axios = require("axios");

const SMM_API = "https://smmraja.com/api/v2";
const SMM_KEY = process.env.SMMRAJA_API_KEY || "";

// Default service IDs — cheapest/popular options per platform
// Owner can override these with .smmset command
const DEFAULT_SERVICES = {
  "ig_followers":   { id: "2174", min: 10,  max: 1000000, label: "Instagram Followers" },
  "ig_likes":       { id: "5297", min: 10,  max: 500000,  label: "Instagram Likes"     },
  "ig_views":       { id: "5223", min: 100, max: 1000000, label: "Instagram Views"      },
  "ig_comments":    { id: null,   min: 10,  max: 10000,   label: "Instagram Comments"   },
  "fb_followers":   { id: "1927", min: 10,  max: 500000,  label: "Facebook Followers"   },
  "fb_likes":       { id: "1832", min: 10,  max: 500000,  label: "Facebook Likes"       },
  "yt_subscribers": { id: "2128", min: 10,  max: 100000,  label: "YouTube Subscribers"  },
  "yt_views":       { id: "3857", min: 100, max: 5000000, label: "YouTube Views"         },
  "yt_likes":       { id: "2847", min: 10,  max: 100000,  label: "YouTube Likes"         },
  "tt_followers":   { id: "3424", min: 10,  max: 1000000, label: "TikTok Followers"      },
  "tt_likes":       { id: "5963", min: 10,  max: 500000,  label: "TikTok Likes"          },
  "tt_views":       { id: "5812", min: 100, max: 5000000, label: "TikTok Views"          },
  "tw_followers":   { id: "6349", min: 10,  max: 500000,  label: "Twitter/X Followers"  },
  "tw_likes":       { id: "5925", min: 10,  max: 100000,  label: "Twitter/X Likes"       },
};

// In-memory service overrides (owner can change per session)
const serviceOverrides = {};

function getServiceId(key) {
  return serviceOverrides[key] || DEFAULT_SERVICES[key]?.id || null;
}

async function smmRequest(params) {
  if (!SMM_KEY) throw new Error("SMMRAJA_API_KEY not configured");
  const body = new URLSearchParams({ key: SMM_KEY, ...params });
  const res = await axios.post(SMM_API, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000,
  });
  return res.data;
}

// Format currency
function fmtUSD(amount) {
  return `$${parseFloat(amount || 0).toFixed(4)}`;
}

// Format rate per 1000
function fmtRate(rate) {
  return `$${parseFloat(rate || 0).toFixed(4)}/1K`;
}

// Status emoji
function statusEmoji(status) {
  const s = (status || "").toLowerCase();
  if (s === "completed") return "✅";
  if (s === "processing" || s === "in progress") return "⏳";
  if (s === "pending") return "🕐";
  if (s === "partial") return "⚠️";
  if (s === "cancelled" || s === "canceled") return "❌";
  return "🔄";
}

// Place an order helper
async function placeOrder(serviceId, link, quantity) {
  const data = await smmRequest({ action: "add", service: serviceId, link, quantity });
  if (data.error) throw new Error(data.error);
  if (!data.order) throw new Error("No order ID returned");
  return data.order;
}

// Get order status
async function getOrderStatus(orderId) {
  const data = await smmRequest({ action: "status", order: orderId });
  if (data.error) throw new Error(data.error);
  return data;
}

// Get balance
async function getBalance() {
  const data = await smmRequest({ action: "balance" });
  if (data.error) throw new Error(data.error);
  return data;
}

// ─── Service menu text ────────────────────────────────────────────────────────
function buildSmmMenu(prefix) {
  return `╔══════════════════════════════╗
║  📊  *SMM Panel Menu*  📊  ║
╚══════════════════════════════╝

*📸 Instagram*
  \`${prefix}igfollowers\` — Followers
  \`${prefix}iglikes\`     — Post Likes
  \`${prefix}igviews\`     — Video/Reel Views

*👥 Facebook*
  \`${prefix}fbfollowers\` — Page/Profile Followers
  \`${prefix}fblikes\`     — Post Likes

*▶️ YouTube*
  \`${prefix}ytsubs\`      — Subscribers
  \`${prefix}ytviews\`     — Video Views
  \`${prefix}ytlikes\`     — Video Likes

*🎵 TikTok*
  \`${prefix}ttfollowers\` — Followers
  \`${prefix}ttlikes\`     — Post Likes
  \`${prefix}ttviews\`     — Video Views

*🐦 Twitter / X*
  \`${prefix}twfollowers\` — Followers
  \`${prefix}twlikes\`     — Tweet Likes

*📦 Order Management*
  \`${prefix}smmstatus <id>\`  — Check order status
  \`${prefix}smmbalance\`      — View API balance
  \`${prefix}smm\`             — Show this menu

────────────────────────────────
_Usage: ${prefix}iglikes <link> <qty>_
_Example: ${prefix}iglikes https://instagram.com/p/xxx 100_
_${config.BOT_NAME} · Desam Tech_ ⚡`;
}

// ─── Generic order handler ────────────────────────────────────────────────────
async function handleOrder(sock, m, { text }, serviceKey) {
  const svc = DEFAULT_SERVICES[serviceKey];
  const serviceId = getServiceId(serviceKey);

  if (!serviceId) {
    return m.reply(`❌ No service ID configured for ${svc.label}. Ask the bot owner to set it with \`.smmset ${serviceKey} <service_id>\`.`);
  }

  if (!text || text.trim().split(/\s+/).length < 2) {
    // Get rate info
    try {
      const services = await smmRequest({ action: "services" });
      const found = Array.isArray(services) ? services.find(s => String(s.serviceID) === String(serviceId)) : null;
      const rateInfo = found ? `\n💰 Rate: ${fmtRate(found.rate)}\n📦 Min: ${found.min} | Max: ${found.max}` : "";
      return m.reply(
        `📊 *${svc.label}*${rateInfo}\n\n` +
        `Usage: \`${config.PREFIX}${Object.keys({
          ig_followers: "igfollowers", ig_likes: "iglikes", ig_views: "igviews",
          fb_followers: "fbfollowers", fb_likes: "fblikes",
          yt_subscribers: "ytsubs", yt_views: "ytviews", yt_likes: "ytlikes",
          tt_followers: "ttfollowers", tt_likes: "ttlikes", tt_views: "ttviews",
          tw_followers: "twfollowers", tw_likes: "twlikes",
        })[serviceKey]} <link> <quantity>\`\n\n` +
        `Example: \`${config.PREFIX}iglikes https://instagram.com/p/xxx 100\`\n\n` +
        `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
      );
    } catch {
      return m.reply(
        `📊 *${svc.label}*\n\n` +
        `Min: ${svc.min} | Max: ${svc.max}\n\n` +
        `Usage: \`${config.PREFIX}iglikes <link> <quantity>\`\n\n` +
        `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
      );
    }
  }

  const parts = text.trim().split(/\s+/);
  const qty = parseInt(parts[parts.length - 1], 10);
  const link = parts.slice(0, -1).join(" ");

  if (!link || isNaN(qty) || qty < 1) {
    return m.reply(`❌ Invalid format. Use: \`${config.PREFIX}iglikes <link> <quantity>\``);
  }
  if (qty < svc.min) return m.reply(`❌ Minimum quantity for ${svc.label} is *${svc.min}*.`);
  if (qty > svc.max) return m.reply(`❌ Maximum quantity for ${svc.label} is *${svc.max.toLocaleString()}*.`);

  m.react("⏳");
  try {
    const orderId = await placeOrder(serviceId, link, qty);
    m.react("✅");
    await m.reply(
      `✅ *Order Placed Successfully!*\n\n` +
      `📊 Service: *${svc.label}*\n` +
      `🔢 Quantity: *${qty.toLocaleString()}*\n` +
      `🔗 Link: ${link}\n` +
      `🆔 Order ID: *${orderId}*\n\n` +
      `Check status: \`${config.PREFIX}smmstatus ${orderId}\`\n\n` +
      `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
    );
  } catch (err) {
    m.react("❌");
    await m.reply(`❌ Order failed: ${err.message}\n\nMake sure your link is correct and you have sufficient balance.`);
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────
module.exports = [
  // ── Menu ──────────────────────────────────────────────────────────────────
  {
    name: ["smm", "smmpanel", "smmhelp"],
    category: "smm",
    desc: "SMM panel menu — followers, likes, views and more",
    handler: async (sock, m) => {
      await m.reply(buildSmmMenu(config.PREFIX));
    },
  },

  // ── Balance ───────────────────────────────────────────────────────────────
  {
    name: ["smmbalance", "smmbala", "smmbal"],
    category: "smm",
    desc: "Check SMMRaja API balance",
    handler: async (sock, m) => {
      m.react("💰");
      try {
        const bal = await getBalance();
        await m.reply(
          `💰 *SMM Panel Balance*\n\n` +
          `Balance: *${bal.balance} ${bal.currency || "USD"}*\n\n` +
          `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
        );
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply(`❌ Failed to fetch balance: ${err.message}`);
      }
    },
  },

  // ── Order Status ──────────────────────────────────────────────────────────
  {
    name: ["smmstatus", "smmorder", "orderstatus"],
    category: "smm",
    desc: "Check SMM order status",
    usage: "<order_id>",
    handler: async (sock, m, { text }) => {
      if (!text || !text.trim()) {
        return m.reply(`Usage: \`${config.PREFIX}smmstatus <order_id>\`\nExample: \`${config.PREFIX}smmstatus 12345678\``);
      }
      const orderId = text.trim();
      m.react("🔍");
      try {
        const status = await getOrderStatus(orderId);
        const emoji = statusEmoji(status.status);
        const remains = status.remains != null ? `\n📉 Remaining: *${parseInt(status.remains).toLocaleString()}*` : "";
        const startCount = status.start_count != null ? `\n🔢 Start Count: *${parseInt(status.start_count).toLocaleString()}*` : "";
        const charge = status.charge != null ? `\n💸 Charge: *${fmtUSD(status.charge)}*` : "";
        await m.reply(
          `📦 *Order Status*\n\n` +
          `🆔 Order ID: *${orderId}*\n` +
          `${emoji} Status: *${status.status || "Unknown"}*` +
          startCount + remains + charge + `\n\n` +
          `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
        );
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply(`❌ Failed to get status: ${err.message}`);
      }
    },
  },

  // ── Multiple order status ─────────────────────────────────────────────────
  {
    name: ["smmorders"],
    category: "smm",
    desc: "Check multiple order statuses at once",
    usage: "<id1> <id2> ...",
    handler: async (sock, m, { text }) => {
      if (!text || !text.trim()) {
        return m.reply(`Usage: \`${config.PREFIX}smmorders <id1> <id2> ...\`\nUp to 100 orders at a time.`);
      }
      const ids = text.trim().split(/[\s,]+/).filter(Boolean).slice(0, 100);
      if (!ids.length) return m.reply("❌ No valid order IDs provided.");
      m.react("🔍");
      try {
        const data = await smmRequest({ action: "status", orders: ids.join(",") });
        if (data.error) throw new Error(data.error);
        let lines = `📦 *Bulk Order Status* (${ids.length} orders)\n\n`;
        for (const id of ids) {
          const s = data[id];
          if (!s) { lines += `🆔 ${id}: ❓ Not found\n`; continue; }
          lines += `🆔 ${id}: ${statusEmoji(s.status)} *${s.status || "Unknown"}*`;
          if (s.remains != null) lines += ` | Remaining: ${parseInt(s.remains).toLocaleString()}`;
          lines += "\n";
        }
        lines += `\n────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(lines);
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply(`❌ Failed: ${err.message}`);
      }
    },
  },

  // ── Service search ────────────────────────────────────────────────────────
  {
    name: ["smmsearch", "smmfind"],
    category: "smm",
    desc: "Search available SMM services",
    usage: "<keyword>",
    handler: async (sock, m, { text }) => {
      if (!text || !text.trim()) {
        return m.reply(`Usage: \`${config.PREFIX}smmsearch <keyword>\`\nExample: \`${config.PREFIX}smmsearch instagram followers\``);
      }
      m.react("🔍");
      try {
        const services = await smmRequest({ action: "services" });
        if (!Array.isArray(services)) throw new Error("Invalid response");
        const kw = text.trim().toLowerCase();
        const matches = services.filter(s =>
          s.name.toLowerCase().includes(kw) ||
          s.category.toLowerCase().includes(kw)
        ).sort((a, b) => a.rate - b.rate).slice(0, 10);

        if (!matches.length) {
          m.react("❌");
          return m.reply(`❌ No services found for "*${text.trim()}*". Try a different keyword.`);
        }

        let out = `🔍 *SMM Services: "${text.trim()}"*\n_(Top ${matches.length} results, sorted by price)_\n\n`;
        for (const s of matches) {
          out += `🆔 *${s.serviceID}* — ${s.name.slice(0, 50)}\n`;
          out += `   💰 ${fmtRate(s.rate)} | Min: ${s.min} | Max: ${s.max}\n\n`;
        }
        out += `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(out);
        m.react("✅");
      } catch (err) {
        m.react("❌");
        await m.reply(`❌ Search failed: ${err.message}`);
      }
    },
  },

  // ── Custom order ──────────────────────────────────────────────────────────
  {
    name: ["smmorder", "buysmm", "customorder"],
    category: "smm",
    desc: "Place a custom SMM order with any service ID",
    usage: "<service_id> <link> <quantity>",
    handler: async (sock, m, { text }) => {
      if (!text || text.trim().split(/\s+/).length < 3) {
        return m.reply(
          `Usage: \`${config.PREFIX}smmorder <service_id> <link> <quantity>\`\n\n` +
          `Example: \`${config.PREFIX}smmorder 5297 https://instagram.com/p/xxx 500\`\n\n` +
          `Use \`${config.PREFIX}smmsearch <keyword>\` to find service IDs.\n\n` +
          `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
        );
      }
      const parts = text.trim().split(/\s+/);
      const serviceId = parts[0];
      const qty = parseInt(parts[parts.length - 1], 10);
      const link = parts.slice(1, -1).join(" ");

      if (!link || isNaN(qty) || qty < 1) {
        return m.reply(`❌ Invalid format. Use: \`${config.PREFIX}smmorder <service_id> <link> <quantity>\``);
      }

      m.react("⏳");
      try {
        const orderId = await placeOrder(serviceId, link, qty);
        m.react("✅");
        await m.reply(
          `✅ *Order Placed!*\n\n` +
          `🆔 Order ID: *${orderId}*\n` +
          `🔧 Service: *${serviceId}*\n` +
          `🔢 Quantity: *${qty.toLocaleString()}*\n` +
          `🔗 Link: ${link}\n\n` +
          `Check status: \`${config.PREFIX}smmstatus ${orderId}\`\n\n` +
          `────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`
        );
      } catch (err) {
        m.react("❌");
        await m.reply(`❌ Order failed: ${err.message}`);
      }
    },
  },

  // ── Instagram ─────────────────────────────────────────────────────────────
  {
    name: ["igfollowers", "instafollowers", "igfollow"],
    category: "smm",
    desc: "Buy Instagram followers",
    usage: "<profile_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "ig_followers"),
  },
  {
    name: ["iglikes", "instalikes", "iglike"],
    category: "smm",
    desc: "Buy Instagram post likes",
    usage: "<post_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "ig_likes"),
  },
  {
    name: ["igviews", "instaviews", "igview"],
    category: "smm",
    desc: "Buy Instagram video/reel views",
    usage: "<video_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "ig_views"),
  },

  // ── Facebook ──────────────────────────────────────────────────────────────
  {
    name: ["fbfollowers", "fbfollow", "facebookfollowers"],
    category: "smm",
    desc: "Buy Facebook page/profile followers",
    usage: "<page_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "fb_followers"),
  },
  {
    name: ["fblikes", "facebooklikes", "fblike"],
    category: "smm",
    desc: "Buy Facebook post likes",
    usage: "<post_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "fb_likes"),
  },

  // ── YouTube ───────────────────────────────────────────────────────────────
  {
    name: ["ytsubs", "yts", "youtubesubs", "ytsubscribers"],
    category: "smm",
    desc: "Buy YouTube subscribers",
    usage: "<channel_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "yt_subscribers"),
  },
  {
    name: ["ytviews", "youtubeviews", "ytview"],
    category: "smm",
    desc: "Buy YouTube video views",
    usage: "<video_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "yt_views"),
  },
  {
    name: ["ytlikes", "youtubelikes", "ytlike"],
    category: "smm",
    desc: "Buy YouTube video likes",
    usage: "<video_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "yt_likes"),
  },

  // ── TikTok ────────────────────────────────────────────────────────────────
  {
    name: ["ttfollowers", "tiktokfollowers", "ttfollow"],
    category: "smm",
    desc: "Buy TikTok followers",
    usage: "<profile_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "tt_followers"),
  },
  {
    name: ["ttlikes", "tiktoklikes", "ttlike"],
    category: "smm",
    desc: "Buy TikTok post likes",
    usage: "<post_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "tt_likes"),
  },
  {
    name: ["ttviews", "tiktokviews", "ttview"],
    category: "smm",
    desc: "Buy TikTok video views",
    usage: "<video_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "tt_views"),
  },

  // ── Twitter / X ───────────────────────────────────────────────────────────
  {
    name: ["twfollowers", "twitterfollowers", "xfollowers"],
    category: "smm",
    desc: "Buy Twitter/X followers",
    usage: "<profile_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "tw_followers"),
  },
  {
    name: ["twlikes", "twitterlikes", "xlikes"],
    category: "smm",
    desc: "Buy Twitter/X tweet likes",
    usage: "<tweet_link> <quantity>",
    handler: (sock, m, args) => handleOrder(sock, m, args, "tw_likes"),
  },
];
