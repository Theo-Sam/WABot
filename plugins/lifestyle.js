const config = require("../config");
const { fetchJson } = require("../lib/helpers");
const axios = require("axios");

const WORKOUTS = {
  chest: ["Push-ups 4×15","Incline Push-ups 3×12","Wide Push-ups 3×15","Diamond Push-ups 3×10","Chest Dips 3×12"],
  back: ["Pull-ups 4×8","Bent-over Rows 3×12","Superman Hold 3×30s","Reverse Snow Angels 3×15","Lat Pulldown 3×12"],
  legs: ["Squats 4×15","Lunges 3×12 each leg","Calf Raises 4×20","Wall Sit 3×45s","Jump Squats 3×10"],
  arms: ["Bicep Curls 3×12","Tricep Dips 3×15","Hammer Curls 3×12","Overhead Tricep Extension 3×12","Chin-ups 3×8"],
  shoulders: ["Shoulder Press 4×12","Lateral Raises 3×15","Front Raises 3×12","Arnold Press 3×10","Upright Rows 3×12"],
  abs: ["Crunches 4×20","Plank 3×45s","Bicycle Crunches 3×20","Leg Raises 3×15","Mountain Climbers 3×30s"],
  cardio: ["30min Brisk Walk","20min Jump Rope","25min Cycling","HIIT: 30s on/30s off × 10 rounds","20min Jogging"],
  full: ["Jumping Jacks 3×30","Push-ups 3×15","Squats 3×15","Plank 3×45s","Lunges 3×12","Burpees 3×8","Sit-ups 3×20"],
};

const MENTAL_TIPS = [
  "🌬️ Try the 4-7-8 breathing technique: inhale for 4s, hold for 7s, exhale for 8s. Repeat 3 times.",
  "📓 Write down 3 things you're grateful for today. It rewires your brain toward positivity.",
  "🌿 Spend 10 minutes outside without your phone. Nature significantly reduces cortisol levels.",
  "💧 Drink a full glass of water right now. Dehydration directly affects mood and focus.",
  "🎵 Listen to music that matches the mood you *want* to feel, not the mood you're in.",
  "📵 Set a 1-hour phone-free period today. Even a short digital detox reduces anxiety.",
  "🤸 Do 10 jumping jacks or a 5-minute walk. Movement is one of the fastest mood boosters.",
  "😴 Try to sleep and wake at the same time every day — it stabilizes your internal clock.",
  "🛑 Practice the 5-4-3-2-1 grounding technique: name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste.",
  "📞 Reach out to one person you care about today — even a short message matters.",
  "✅ Write one small task you can do in 5 minutes and do it now — momentum builds from tiny actions.",
  "🧘 Sit quietly for 5 minutes and focus only on your breath. This is meditation — no app needed.",
];

function calcSleep(bedtime) {
  const [h, m] = bedtime.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const totalMins = h * 60 + m;
  const wakeTimes = [];
  for (let cycles = 4; cycles <= 7; cycles++) {
    const wakeMin = (totalMins + cycles * 90 + 15) % (24 * 60);
    const wh = Math.floor(wakeMin / 60);
    const wm = wakeMin % 60;
    const period = wh < 12 ? "AM" : "PM";
    const h12 = wh % 12 || 12;
    wakeTimes.push({ cycles, time: `${h12}:${String(wm).padStart(2, "0")} ${period}` });
  }
  return wakeTimes;
}

function calcWater(weightKg, activityLevel = "moderate") {
  const multipliers = { low: 30, moderate: 35, high: 40 };
  const ml = Math.round(weightKg * (multipliers[activityLevel] || 35));
  const glasses = Math.round(ml / 250);
  return { ml, glasses };
}

const commands = [
  {
    name: ["recipe", "food", "meal", "cook"],
    category: "lifestyle",
    desc: "Search for a recipe by name or ingredient",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("recipe <food name or ingredient>", "recipe chicken pasta");
      m.react("⏳");
      try {
        let data = null;
        try {
          data = await fetchJson(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(text)}`, { timeout: 10000 });
        } catch {}
        if (!data?.meals?.length) {
          try {
            data = await fetchJson(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(text)}`, { timeout: 10000 });
            if (data?.meals?.length) {
              const detail = await fetchJson(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${data.meals[0].idMeal}`, { timeout: 10000 });
              data = detail;
            }
          } catch {}
        }
        if (!data?.meals?.length) { m.react("❌"); return m.reply(`❌ No recipe found for "*${text}*". Try a different keyword.`); }
        const meal = data.meals[0];
        const ingredients = [];
        for (let i = 1; i <= 20; i++) {
          const ing = meal[`strIngredient${i}`];
          const meas = meal[`strMeasure${i}`];
          if (ing && ing.trim()) ingredients.push(`• ${meas?.trim() || ""} ${ing}`.trim());
        }
        let msg = `🍽️ *${meal.strMeal}*\n`;
        msg += `📂 Category: ${meal.strCategory || "N/A"}\n`;
        msg += `🌍 Cuisine: ${meal.strArea || "N/A"}\n\n`;
        msg += `*Ingredients:*\n${ingredients.slice(0, 15).join("\n")}\n\n`;
        msg += `*Instructions:*\n${(meal.strInstructions || "").slice(0, 800)}${meal.strInstructions?.length > 800 ? "...\n_(see full recipe below)_" : ""}`;
        if (meal.strYoutube) msg += `\n\n▶️ Video: ${meal.strYoutube}`;
        if (meal.strSource) msg += `\n🔗 Full recipe: ${meal.strSource}`;
        msg += `\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("recipe");
      }
    },
  },
  {
    name: ["randomrecipe", "randomfood", "whatcook"],
    category: "lifestyle",
    desc: "Get a random recipe idea",
    handler: async (sock, m, { text }) => {
      m.react("⏳");
      try {
        const data = await fetchJson("https://www.themealdb.com/api/json/v1/1/random.php", { timeout: 10000 });
        if (!data?.meals?.length) { m.react("❌"); return m.reply("❌ Could not fetch a recipe right now."); }
        const meal = data.meals[0];
        const ingredients = [];
        for (let i = 1; i <= 20; i++) {
          const ing = meal[`strIngredient${i}`];
          const meas = meal[`strMeasure${i}`];
          if (ing && ing.trim()) ingredients.push(`• ${meas?.trim() || ""} ${ing}`.trim());
        }
        let msg = `🎲 *Random Recipe: ${meal.strMeal}*\n`;
        msg += `📂 Category: ${meal.strCategory || "N/A"} | 🌍 ${meal.strArea || "N/A"}\n\n`;
        msg += `*Ingredients:*\n${ingredients.slice(0, 12).join("\n")}\n\n`;
        msg += `*Instructions:*\n${(meal.strInstructions || "").slice(0, 600)}...`;
        if (meal.strYoutube) msg += `\n\n▶️ ${meal.strYoutube}`;
        msg += `\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("recipe");
      }
    },
  },
  {
    name: ["nutrition", "nutrients", "foodinfo"],
    category: "lifestyle",
    desc: "Get nutrition info for any food",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("nutrition <food name>", "nutrition banana");
      m.react("⏳");
      try {
        const res = await axios.get(
          `https://api.edamam.com/api/food-database/v2/parser?app_id=&app_key=&ingr=${encodeURIComponent(text)}&nutrition-type=cooking`,
          { timeout: 10000 }
        ).catch(() => null);
        let food = res?.data?.hints?.[0]?.food;
        if (!food) {
          const res2 = await fetchJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(text)}&search_simple=1&action=process&json=1&page_size=1`, { timeout: 10000 });
          const product = res2?.products?.[0];
          if (!product) { m.react("❌"); return m.reply(`❌ No nutrition data found for "*${text}*".`); }
          const n = product.nutriments || {};
          let msg = `🥗 *Nutrition: ${product.product_name || text}*\n`;
          if (product.brands) msg += `Brand: ${product.brands}\n`;
          msg += `\n*Per 100g/100ml:*\n`;
          if (n.energy_100g) msg += `🔥 Energy: ${Math.round(n.energy_100g)} kJ (${Math.round(n["energy-kcal_100g"] || n.energy_100g / 4.184)} kcal)\n`;
          if (n.proteins_100g != null) msg += `💪 Protein: ${n.proteins_100g}g\n`;
          if (n.carbohydrates_100g != null) msg += `🍞 Carbs: ${n.carbohydrates_100g}g\n`;
          if (n.sugars_100g != null) msg += `🍬 Sugars: ${n.sugars_100g}g\n`;
          if (n.fat_100g != null) msg += `🧈 Fat: ${n.fat_100g}g\n`;
          if (n.fiber_100g != null) msg += `🌱 Fiber: ${n.fiber_100g}g\n`;
          if (n.sodium_100g != null) msg += `🧂 Sodium: ${(n.sodium_100g * 1000).toFixed(0)}mg\n`;
          msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
          await m.reply(msg);
          return m.react("✅");
        }
        const n = food.nutrients;
        let msg = `🥗 *Nutrition: ${food.label}*\n`;
        if (food.brand) msg += `Brand: ${food.brand}\n`;
        msg += `\n*Per 100g:*\n`;
        if (n.ENERC_KCAL) msg += `🔥 Calories: ${Math.round(n.ENERC_KCAL)} kcal\n`;
        if (n.PROCNT != null) msg += `💪 Protein: ${n.PROCNT?.toFixed(1)}g\n`;
        if (n.CHOCDF != null) msg += `🍞 Carbs: ${n.CHOCDF?.toFixed(1)}g\n`;
        if (n.FAT != null) msg += `🧈 Fat: ${n.FAT?.toFixed(1)}g\n`;
        if (n.FIBTG != null) msg += `🌱 Fiber: ${n.FIBTG?.toFixed(1)}g\n`;
        msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("nutrition info");
      }
    },
  },
  {
    name: ["sleeptime", "sleep", "sleepcalc"],
    category: "lifestyle",
    desc: "Calculate ideal wake-up times based on bedtime",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("sleeptime <bedtime>", "sleeptime 22:30\n\n_Based on 90-minute sleep cycles + 15 min to fall asleep_");
      const times = calcSleep(text.trim());
      if (!times) return m.reply("❌ Invalid time format. Use HH:MM, e.g. 22:30 or 10:30");
      let msg = `😴 *Sleep Calculator*\n\nBedtime: *${text}*\n_Takes ~15 min to fall asleep_\n\n`;
      msg += `Wake up at one of these times:\n\n`;
      times.forEach(t => {
        const stars = t.cycles <= 5 ? "⭐".repeat(t.cycles === 6 ? 3 : t.cycles === 5 ? 2 : 1) : "🌟🌟🌟";
        msg += `${t.cycles === 6 ? "✅" : "•"} *${t.time}* — ${t.cycles} cycles (${t.cycles * 1.5}h) ${t.cycles >= 6 ? stars : ""}\n`;
      });
      msg += `\n_6 cycles (9h) is ideal. 5 cycles (7.5h) is the sweet spot._\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["water", "waterintake", "h2o"],
    category: "lifestyle",
    desc: "Calculate daily water intake needed",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("water <weight in kg> [low/moderate/high activity]", "water 70 high");
      const parts = text.trim().split(/\s+/);
      const weight = parseFloat(parts[0]);
      const activity = parts[1]?.toLowerCase() || "moderate";
      if (isNaN(weight) || weight < 10 || weight > 500) return m.reply("❌ Please enter a valid weight in kg (10-500).");
      if (!["low","moderate","high"].includes(activity)) return m.reply("❌ Activity must be: low, moderate, or high");
      const result = calcWater(weight, activity);
      let msg = `💧 *Daily Water Intake*\n\n`;
      msg += `⚖️ Weight: ${weight} kg\n`;
      msg += `🏃 Activity: ${activity}\n\n`;
      msg += `📊 *Recommendation:*\n`;
      msg += `• ${result.ml.toLocaleString()} ml per day\n`;
      msg += `• ~${result.glasses} glasses (250ml each)\n`;
      msg += `• ~${(result.ml / 1000).toFixed(1)} liters\n\n`;
      msg += `💡 *Tips:*\n`;
      msg += `• Drink a glass when you wake up\n`;
      msg += `• Set reminders every 2 hours\n`;
      msg += `• Drink more if it's hot or you're exercising\n\n`;
      msg += `_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["workout", "exercise", "gym", "fit"],
    category: "lifestyle",
    desc: "Get a workout routine for a muscle group",
    handler: async (sock, m, { text }) => {
      const group = (text || "full").toLowerCase().trim();
      const validGroups = Object.keys(WORKOUTS);
      if (!validGroups.includes(group)) {
        return m.usageReply("workout <muscle group>\n\nAvailable: ${validGroups.join(", ")}\n", "workout legs");
      }
      const exercises = WORKOUTS[group];
      const shuffled = [...exercises].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(5, exercises.length));
      let msg = `💪 *${group.charAt(0).toUpperCase() + group.slice(1)} Workout*\n\n`;
      selected.forEach((ex, i) => { msg += `${i + 1}. ${ex}\n`; });
      msg += `\n🔥 Rest 60-90 seconds between sets\n`;
      msg += `💧 Stay hydrated throughout\n`;
      msg += `🧘 Stretch after your workout\n\n`;
      msg += `_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["mentalhealth", "mindfulness", "selfcare"],
    category: "lifestyle",
    desc: "Get a mental health tip",
    handler: async (sock, m, { text }) => {
      const tip = MENTAL_TIPS[Math.floor(Math.random() * MENTAL_TIPS.length)];
      return m.reply(`🧠 *Mental Health Tip*\n\n${tip}\n\n_Take care of yourself. You matter._ 💙\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
    },
  },
  {
    name: ["nasa", "apod", "spaceimg"],
    category: "lifestyle",
    desc: "Get NASA's Astronomy Picture of the Day",
    handler: async (sock, m, { text }) => {
      m.react("⏳");
      try {
        const data = await fetchJson("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY", { timeout: 15000 });
        if (!data?.url) { m.react("❌"); return m.reply("❌ Could not fetch NASA APOD."); }
        let msg = `🌌 *NASA Astronomy Picture of the Day*\n\n📅 Date: ${data.date}\n🔭 *${data.title}*\n\n${data.explanation?.slice(0, 500)}${data.explanation?.length > 500 ? "..." : ""}\n\n🔗 ${data.url}\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        if (data.media_type === "image") {
          const { fetchBuffer } = require("../lib/helpers");
          const imgBuf = await fetchBuffer(data.hdurl || data.url, { timeout: 30000 }).catch(() => null);
          if (imgBuf?.length > 1000) {
            await sock.sendMessage(m.chat, { image: imgBuf, caption: msg }, { quoted: { key: m.key, message: m.message } });
            return m.react("✅");
          }
        }
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("NASA APOD");
      }
    },
  },
  {
    name: ["worldclock", "timezones", "wtime"],
    category: "lifestyle",
    desc: "Show current time in major cities worldwide",
    handler: async (sock, m, { text }) => {
      const zones = [
        { city: "New York", tz: "America/New_York", flag: "🇺🇸" },
        { city: "London", tz: "Europe/London", flag: "🇬🇧" },
        { city: "Paris", tz: "Europe/Paris", flag: "🇫🇷" },
        { city: "Dubai", tz: "Asia/Dubai", flag: "🇦🇪" },
        { city: "India", tz: "Asia/Kolkata", flag: "🇮🇳" },
        { city: "Singapore", tz: "Asia/Singapore", flag: "🇸🇬" },
        { city: "Tokyo", tz: "Asia/Tokyo", flag: "🇯🇵" },
        { city: "Sydney", tz: "Australia/Sydney", flag: "🇦🇺" },
        { city: "Lagos", tz: "Africa/Lagos", flag: "🇳🇬" },
        { city: "Accra", tz: "Africa/Accra", flag: "🇬🇭" },
        { city: "Nairobi", tz: "Africa/Nairobi", flag: "🇰🇪" },
        { city: "São Paulo", tz: "America/Sao_Paulo", flag: "🇧🇷" },
      ];
      let msg = `🌍 *World Clock*\n\n`;
      zones.forEach(z => {
        try {
          const time = new Date().toLocaleString("en-US", { timeZone: z.tz, hour: "2-digit", minute: "2-digit", hour12: true, weekday: "short" });
          msg += `${z.flag} ${z.city}: *${time}*\n`;
        } catch {}
      });
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["isbn", "bookinfo", "book"],
    category: "lifestyle",
    desc: "Look up a book by ISBN or title",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("book <title or ISBN>", "book The Alchemist");
      m.react("⏳");
      try {
        const isIsbn = /^[\d-]{10,17}$/.test(text.replace(/\s/g, ""));
        const query = isIsbn ? `isbn:${text.replace(/[-\s]/g, "")}` : `intitle:${encodeURIComponent(text)}`;
        const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`, { timeout: 10000 });
        const book = data?.items?.[0]?.volumeInfo;
        if (!book) { m.react("❌"); return m.reply(`❌ No book found for "*${text}*".`); }
        let msg = `📚 *${book.title}*`;
        if (book.subtitle) msg += `\n_${book.subtitle}_`;
        msg += `\n\n👤 Author(s): ${(book.authors || []).join(", ") || "Unknown"}`;
        if (book.publisher) msg += `\n🏢 Publisher: ${book.publisher}`;
        if (book.publishedDate) msg += `\n📅 Published: ${book.publishedDate}`;
        if (book.pageCount) msg += `\n📄 Pages: ${book.pageCount}`;
        if (book.categories?.length) msg += `\n📂 Genre: ${book.categories.join(", ")}`;
        if (book.averageRating) msg += `\n⭐ Rating: ${book.averageRating}/5 (${book.ratingsCount || 0} ratings)`;
        if (book.description) msg += `\n\n📝 *Description:*\n${book.description.slice(0, 400)}${book.description.length > 400 ? "..." : ""}`;
        if (book.previewLink) msg += `\n\n🔗 Preview: ${book.previewLink}`;
        msg += `\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.errorReply("Failed to look up book. Please try again.");
      }
    },
  },
  {
    name: ["earthquake", "quake", "seismic"],
    category: "lifestyle",
    desc: "Show recent significant earthquakes worldwide",
    handler: async (sock, m, { text }) => {
      m.react("⏳");
      try {
        const data = await fetchJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson", { timeout: 15000 });
        const quakes = data?.features?.slice(0, 8) || [];
        if (!quakes.length) { m.react("❌"); return m.reply("✅ No significant earthquakes reported this week."); }
        let msg = `🌍 *Recent Significant Earthquakes*\n_(Past 7 days — USGS)_\n\n`;
        quakes.forEach((q, i) => {
          const p = q.properties;
          const mag = p.mag?.toFixed(1);
          const place = p.place || "Unknown location";
          const time = new Date(p.time).toUTCString().slice(0, 22);
          const depth = q.geometry?.coordinates?.[2];
          msg += `${i + 1}. 🔴 *M${mag}* — ${place}\n`;
          msg += `   📅 ${time} UTC\n`;
          if (depth) msg += `   📏 Depth: ${depth.toFixed(1)} km\n`;
          msg += "\n";
        });
        msg += `_Source: USGS Earthquake Hazards Program_
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("earthquake data");
      }
    },
  },
  {
    name: ["currency2", "forex", "fx"],
    category: "lifestyle",
    desc: "Get live forex currency exchange rates",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("forex <base currency>", "forex USD\n\nShows rates against major currencies.");
      const base = text.trim().toUpperCase().slice(0, 3);
      m.react("⏳");
      try {
        const data = await fetchJson(`https://open.er-api.com/v6/latest/${base}`, { timeout: 10000 });
        if (data?.result !== "success") { m.react("❌"); return m.reply(`❌ Invalid currency code: ${base}`); }
        const rates = data.rates;
        const major = ["USD","EUR","GBP","JPY","CAD","AUD","CHF","CNY","INR","NGN","GHS","KES","ZAR","BRL","MXN","SAR","AED","SGD","HKD","NZD"];
        let msg = `💱 *Exchange Rates (${base})*\n_Updated: ${data.time_last_update_utc?.slice(0,16) || "now"}_\n\n`;
        major.filter(c => c !== base && rates[c]).forEach(c => {
          const rate = rates[c];
          msg += `${c}: *${rate < 1 ? rate.toFixed(4) : rate < 100 ? rate.toFixed(2) : Math.round(rate).toLocaleString()}*\n`;
        });
        msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("exchange rates");
      }
    },
  },
];

module.exports = { commands };
