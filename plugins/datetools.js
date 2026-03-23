const config = require("../config");

function parseDate(str) {
  const s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00");
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, mo, y] = s.split("/");
    return new Date(`${y}-${mo}-${d}T00:00:00`);
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, mo, y] = s.split("-");
    return new Date(`${y}-${mo}-${d}T00:00:00`);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function diffDetails(ms) {
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30.4375);
  const years = Math.floor(days / 365.25);
  return { days, weeks, months, years };
}

function fmtDuration(ms) {
  const { days, weeks, months, years } = diffDetails(ms);
  if (years >= 1) return `${years} year${years !== 1 ? "s" : ""}, ${months % 12} month${months % 12 !== 1 ? "s" : ""}`;
  if (months >= 1) return `${months} month${months !== 1 ? "s" : ""}, ${days % 30} day${days % 30 !== 1 ? "s" : ""}`;
  if (weeks >= 1) return `${weeks} week${weeks !== 1 ? "s" : ""}, ${days % 7} day${days % 7 !== 1 ? "s" : ""}`;
  return `${days} day${days !== 1 ? "s" : ""}`;
}

const ZODIAC = [
  { sign:"Capricorn", symbol:"♑", dates:"Dec 22 - Jan 19", start:[12,22], end:[1,19] },
  { sign:"Aquarius", symbol:"♒", dates:"Jan 20 - Feb 18", start:[1,20], end:[2,18] },
  { sign:"Pisces", symbol:"♓", dates:"Feb 19 - Mar 20", start:[2,19], end:[3,20] },
  { sign:"Aries", symbol:"♈", dates:"Mar 21 - Apr 19", start:[3,21], end:[4,19] },
  { sign:"Taurus", symbol:"♉", dates:"Apr 20 - May 20", start:[4,20], end:[5,20] },
  { sign:"Gemini", symbol:"♊", dates:"May 21 - Jun 20", start:[5,21], end:[6,20] },
  { sign:"Cancer", symbol:"♋", dates:"Jun 21 - Jul 22", start:[6,21], end:[7,22] },
  { sign:"Leo", symbol:"♌", dates:"Jul 23 - Aug 22", start:[7,23], end:[8,22] },
  { sign:"Virgo", symbol:"♍", dates:"Aug 23 - Sep 22", start:[8,23], end:[9,22] },
  { sign:"Libra", symbol:"♎", dates:"Sep 23 - Oct 22", start:[9,23], end:[10,22] },
  { sign:"Scorpio", symbol:"♏", dates:"Oct 23 - Nov 21", start:[10,23], end:[11,21] },
  { sign:"Sagittarius", symbol:"♐", dates:"Nov 22 - Dec 21", start:[11,22], end:[12,21] },
];

function getZodiac(month, day) {
  for (const z of ZODIAC) {
    const [sm, sd] = z.start;
    const [em, ed] = z.end;
    if ((month === sm && day >= sd) || (month === em && day <= ed)) return z;
  }
  return ZODIAC[0];
}

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const commands = [
  {
    name: ["daysuntil", "countdown2", "until"],
    category: "tools",
    desc: "Count down the days until any date or event",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("daysuntil <date> [event name]\nFormats: YYYY-MM-DD or DD/MM/YYYY", "daysuntil 2025-12-25 Christmas");
      const parts = text.trim().split(/\s+/);
      const dateStr = parts[0];
      const event = parts.slice(1).join(" ") || "the date";
      const target = parseDate(dateStr);
      if (!target) return m.reply("❌ Invalid date. Use YYYY-MM-DD or DD/MM/YYYY format.");
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diff = target.getTime() - now.getTime();
      const { days, weeks, months } = diffDetails(Math.abs(diff));
      const past = diff < 0;
      const dayOfWeek = DAYS[target.getDay()];
      const dateDisplay = `${MONTHS[target.getMonth()]} ${target.getDate()}, ${target.getFullYear()}`;
      let msg = `📅 *${event.charAt(0).toUpperCase() + event.slice(1)}*\n\n`;
      msg += `📆 Date: ${dayOfWeek}, ${dateDisplay}\n\n`;
      if (diff === 0) {
        msg += `🎉 *Today is the day!*\n`;
      } else if (past) {
        msg += `⏮️ *${days} day${days !== 1 ? "s" : ""} ago*\n`;
        msg += `≈ ${weeks} week${weeks !== 1 ? "s" : ""} | ${months} month${months !== 1 ? "s" : ""}\n`;
      } else {
        msg += `⏳ *${days} day${days !== 1 ? "s" : ""} to go*\n`;
        msg += `≈ ${weeks} week${weeks !== 1 ? "s" : ""} | ${months} month${months !== 1 ? "s" : ""}\n`;
      }
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["dayslived", "lifedays", "borndays"],
    category: "fun",
    desc: "Calculate how many days, hours, minutes you've been alive",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("dayslived <birthdate>\nFormats: YYYY-MM-DD or DD/MM/YYYY", "dayslived 1998-06-15");
      const birth = parseDate(text.trim());
      if (!birth) return m.reply("❌ Invalid date. Use YYYY-MM-DD or DD/MM/YYYY format.");
      if (birth > new Date()) return m.reply("❌ Birthdate can't be in the future!");
      const now = new Date();
      const ms = now.getTime() - birth.getTime();
      const days = Math.floor(ms / 86400000);
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor(ms / 60000);
      const weeks = Math.floor(days / 7);
      const months = Math.floor(days / 30.4375);
      const years = Math.floor(days / 365.25);
      const nextBday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
      if (nextBday <= now) nextBday.setFullYear(now.getFullYear() + 1);
      const daysToNext = Math.ceil((nextBday.getTime() - now.getTime()) / 86400000);
      let msg = `🎂 *Life Stats*\n\n`;
      msg += `📅 Birthday: ${MONTHS[birth.getMonth()]} ${birth.getDate()}, ${birth.getFullYear()}\n`;
      msg += `🎂 Age: ${years} years old\n\n`;
      msg += `📊 *You've been alive for:*\n`;
      msg += `📆 ${days.toLocaleString()} days\n`;
      msg += `📅 ${weeks.toLocaleString()} weeks\n`;
      msg += `🗓️ ${months.toLocaleString()} months\n`;
      msg += `⏰ ${hours.toLocaleString()} hours\n`;
      msg += `⏱️ ${minutes.toLocaleString()} minutes\n\n`;
      msg += `🎉 Next birthday in: *${daysToNext} day${daysToNext !== 1 ? "s" : ""}*\n`;
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["dayofweek", "whatday", "weekday"],
    category: "tools",
    desc: "Find out what day of the week any date was/is",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("dayofweek <date>\nFormats: YYYY-MM-DD or DD/MM/YYYY", "dayofweek 1969-07-20");
      const d = parseDate(text.trim());
      if (!d) return m.reply("❌ Invalid date. Use YYYY-MM-DD or DD/MM/YYYY format.");
      const now = new Date();
      const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
      const dayName = DAYS[d.getDay()];
      const monthName = MONTHS[d.getMonth()];
      const isLeap = d.getFullYear() % 4 === 0 && (d.getFullYear() % 100 !== 0 || d.getFullYear() % 400 === 0);
      const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
      const weekOfYear = Math.ceil(dayOfYear / 7);
      let msg = `📅 *${monthName} ${d.getDate()}, ${d.getFullYear()}*\n\n`;
      msg += `📆 Day: *${dayName}*\n`;
      msg += `🗓️ Week of year: ${weekOfYear}\n`;
      msg += `📊 Day of year: ${dayOfYear}/365\n`;
      msg += `🔄 Leap year: ${isLeap ? "Yes" : "No"}\n`;
      if (diff === 0) msg += `\n📍 This is *today*!`;
      else if (diff > 0) msg += `\n⏳ That's in *${fmtDuration(d - now)}*`;
      else msg += `\n⏮️ That was *${fmtDuration(now - d)} ago*`;
      msg += `\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["timesince", "since", "elapsed"],
    category: "tools",
    desc: "Calculate time elapsed since any date",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("timesince <date> [event]", "timesince 2020-03-11 COVID declared pandemic");
      const parts = text.trim().split(/\s+/);
      const d = parseDate(parts[0]);
      const event = parts.slice(1).join(" ") || "that date";
      if (!d) return m.reply("❌ Invalid date. Use YYYY-MM-DD or DD/MM/YYYY.");
      if (d > new Date()) return m.reply("❌ Date is in the future — use .daysuntil instead.");
      const ms = Date.now() - d.getTime();
      const { days, weeks, months, years } = diffDetails(ms);
      const hours = Math.floor(ms / 3600000);
      let msg = `⏱️ *Time Since ${event}*\n\n`;
      msg += `📅 Since: ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}\n\n`;
      msg += `📆 ${years} year${years !== 1 ? "s" : ""}\n`;
      msg += `📅 ${months} month${months !== 1 ? "s" : ""}\n`;
      msg += `🗓️ ${weeks} week${weeks !== 1 ? "s" : ""}\n`;
      msg += `⏳ ${days.toLocaleString()} days\n`;
      msg += `⏰ ${hours.toLocaleString()} hours\n`;
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["zodiacdate", "starsign", "stardate"],
    category: "fun",
    desc: "Get zodiac sign from a birth date",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("zodiacdate <birthdate>", "zodiacdate 15/06/1998");
      const d = parseDate(text.trim());
      if (!d) return m.reply("❌ Invalid date. Use YYYY-MM-DD or DD/MM/YYYY.");
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const z = getZodiac(month, day);
      const traits = {
        Aries:"Bold, ambitious, passionate, confident, courageous",
        Taurus:"Reliable, patient, practical, devoted, responsible",
        Gemini:"Gentle, affectionate, curious, adaptable, quick-witted",
        Cancer:"Tenacious, loyal, emotional, sympathetic, persuasive",
        Leo:"Creative, passionate, generous, warm-hearted, cheerful",
        Virgo:"Loyal, analytical, kind, hardworking, practical",
        Libra:"Cooperative, diplomatic, gracious, fair-minded, social",
        Scorpio:"Resourceful, brave, passionate, stubborn, determined",
        Sagittarius:"Generous, idealistic, great sense of humor, adventurous",
        Capricorn:"Responsible, disciplined, self-control, good managers",
        Aquarius:"Progressive, original, independent, humanitarian",
        Pisces:"Compassionate, artistic, intuitive, gentle, wise",
      };
      const compat = {
        Aries:"Leo, Sagittarius, Gemini", Taurus:"Virgo, Capricorn, Cancer",
        Gemini:"Libra, Aquarius, Aries", Cancer:"Scorpio, Pisces, Taurus",
        Leo:"Aries, Sagittarius, Gemini", Virgo:"Taurus, Capricorn, Cancer",
        Libra:"Gemini, Aquarius, Leo", Scorpio:"Cancer, Pisces, Virgo",
        Sagittarius:"Aries, Leo, Libra", Capricorn:"Taurus, Virgo, Scorpio",
        Aquarius:"Gemini, Libra, Sagittarius", Pisces:"Cancer, Scorpio, Capricorn",
      };
      let msg = `${z.symbol} *${z.sign}*\n\n`;
      msg += `📅 Born: ${MONTHS[d.getMonth()]} ${day}, ${d.getFullYear()}\n`;
      msg += `🗓️ Dates: ${z.dates}\n\n`;
      msg += `✨ *Traits:* ${traits[z.sign]}\n`;
      msg += `💕 *Best match:* ${compat[z.sign]}\n`;
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["age2", "exactage", "howold"],
    category: "tools",
    desc: "Get your exact age in years, months and days",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("age2 <birthdate>", "age2 1995-08-20");
      const birth = parseDate(text.trim());
      if (!birth) return m.reply("❌ Invalid date. Use YYYY-MM-DD or DD/MM/YYYY.");
      if (birth > new Date()) return m.reply("❌ Birthdate can't be in the future!");
      const now = new Date();
      let years = now.getFullYear() - birth.getFullYear();
      let months = now.getMonth() - birth.getMonth();
      let days = now.getDate() - birth.getDate();
      if (days < 0) {
        months--;
        days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      }
      if (months < 0) { years--; months += 12; }
      const nextBday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
      if (nextBday <= now) nextBday.setFullYear(now.getFullYear() + 1);
      const daysToNext = Math.ceil((nextBday.getTime() - now.getTime()) / 86400000);
      const totalDays = Math.floor((now.getTime() - birth.getTime()) / 86400000);
      let msg = `🎂 *Exact Age*\n\n`;
      msg += `📅 Birthday: ${MONTHS[birth.getMonth()]} ${birth.getDate()}, ${birth.getFullYear()}\n\n`;
      msg += `*${years} years, ${months} months, ${days} days*\n\n`;
      msg += `📊 Total days lived: ${totalDays.toLocaleString()}\n`;
      msg += `🎉 Next birthday in: ${daysToNext} days\n`;
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["datecalc", "datemath", "adddates"],
    category: "tools",
    desc: "Add or subtract days/months/years from a date",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("datecalc <date> +/-<number> <days/weeks/months/years>", "datecalc 2024-01-15 +90 days");
      const match = text.trim().match(/^(.+?)\s+([+-]?\d+)\s+(days?|weeks?|months?|years?)/i);
      if (!match) return m.usageReply("datecalc <date> +/-<number> <days/weeks/months/years>");
      const d = parseDate(match[1].trim());
      const num = parseInt(match[2]);
      const unit = match[3].toLowerCase();
      if (!d) return m.reply("❌ Invalid date.");
      const result = new Date(d.getTime());
      if (unit.startsWith("day")) result.setDate(result.getDate() + num);
      else if (unit.startsWith("week")) result.setDate(result.getDate() + num * 7);
      else if (unit.startsWith("month")) result.setMonth(result.getMonth() + num);
      else if (unit.startsWith("year")) result.setFullYear(result.getFullYear() + num);
      const dayName = DAYS[result.getDay()];
      const from = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      const to = `${MONTHS[result.getMonth()]} ${result.getDate()}, ${result.getFullYear()}`;
      let msg = `📅 *Date Calculator*\n\n`;
      msg += `Start: ${from}\n`;
      msg += `Change: ${num >= 0 ? "+" : ""}${num} ${unit}\n`;
      msg += `Result: *${dayName}, ${to}*\n`;
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["workingdays", "businessdays", "workdays"],
    category: "tools",
    desc: "Count working days between two dates",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("workdays <start date> <end date>", "workdays 2024-01-01 2024-03-31");
      const parts = text.trim().split(/\s+/);
      if (parts.length < 2) return m.reply("❌ Please provide two dates.");
      const start = parseDate(parts[0]);
      const end = parseDate(parts[1]);
      if (!start || !end) return m.reply("❌ Invalid date format. Use YYYY-MM-DD.");
      if (start > end) return m.reply("❌ Start date must be before end date.");
      const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000);
      if (diffDays > 3650) return m.reply("❌ Date range too large (max 10 years).");
      let workdays = 0;
      const cur = new Date(start.getTime());
      while (cur <= end) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) workdays++;
        cur.setDate(cur.getDate() + 1);
      }
      const weekends = diffDays + 1 - workdays;
      let msg = `📊 *Working Days*\n\n`;
      msg += `From: ${MONTHS[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()}\n`;
      msg += `To:   ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}\n\n`;
      msg += `📅 Total days:    ${diffDays + 1}\n`;
      msg += `💼 Working days:  *${workdays}*\n`;
      msg += `🏖️ Weekend days:  ${weekends}\n`;
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
];

module.exports = { commands };
