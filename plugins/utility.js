const config = require("../config");
const { fetchJson, fetchBuffer, sendImageOrText } = require("../lib/helpers");
const { endpoints } = require("../lib/endpoints");
const crypto = require("crypto");
const os = require("os");

const localHoroscopes = {
  aries: "Today is a day for bold decisions. Trust your instincts and take that first step forward with confidence. Energy and momentum are on your side — don't hesitate.",
  taurus: "Focus on stability and the foundations you've already built. Your patience will be rewarded in ways you haven't expected. Take time to appreciate the present moment.",
  gemini: "Communication flows naturally today. Share your ideas openly — people around you are receptive and ready to collaborate. Your curiosity leads somewhere worthwhile.",
  cancer: "Your emotional intuition is especially sharp right now. Lean into your feelings and nurture the relationships that mean the most. A quiet moment of reflection will bring clarity.",
  leo: "Your warmth and confidence are your greatest assets today. Lead with heart and authenticity — others will naturally respond to your energy. Recognition may come your way.",
  virgo: "Details matter today and your sharp eye catches what others miss. Use your analytical strengths wisely. A well-thought-out plan now saves considerable effort later.",
  libra: "Seek balance in all things today. Your gift for diplomacy helps you navigate any tension with grace. A fair and thoughtful approach brings people to agreement.",
  scorpio: "Deep truths are surfacing and transformation is in the air. Embrace change rather than resist it — what ends now creates real space for something far greater ahead.",
  sagittarius: "Adventure and curiosity call to you today. Keep your mind wide open to new perspectives and unexpected opportunities. A spontaneous choice could lead somewhere wonderful.",
  capricorn: "Steady effort is paying off, even when the results aren't yet visible. Stay focused on your long-term goals — your discipline and persistence are building something lasting.",
  aquarius: "Your originality and forward-thinking perspective shine today. Don't be afraid to stand apart from the crowd. The ideas others call unconventional may well be ahead of their time.",
  pisces: "Your creativity and compassion are heightened. Let your imagination guide you and don't dismiss what feels like intuition. Meaningful connections are within easy reach today.",
};

function toRoman(value) {
  const map = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let n = value;
  let out = "";
  for (const [k, s] of map) {
    while (n >= k) {
      out += s;
      n -= k;
    }
  }
  return out;
}

async function resolveDns(domain, type) {
  const url = `${endpoints.dns.googleResolveBase}?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`;
  return fetchJson(url).catch(() => null);
}

const commands = [
  {
    name: ["currency", "convert", "exchange"],
    category: "utility",
    desc: "Convert currency",
    handler: async (sock, m, { args }) => {
      if (args.length < 3) return m.usageReply("currency <amount> <from> <to>", "currency 100 USD GHS");
      const amount = parseFloat(args[0]);
      const from = args[1].toUpperCase();
      const to = args[2].toUpperCase();
      if (!Number.isFinite(amount)) return m.reply("Invalid amount.");
      m.react("💱");
      try {
        let rate = null;

        const data = await fetchJson(`https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(from)}`).catch(() => null);
        if (data?.rates?.[to]) rate = Number(data.rates[to]);

        if (!rate) {
          const frankfurter = await fetchJson(`https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).catch(() => null);
          if (frankfurter?.rates?.[to]) rate = Number(frankfurter.rates[to]);
        }

        if (!rate) {
          // Fallback: open.er-api.com (no key; subject to rate limits)
          const er = await fetchJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`).catch(() => null);
          if (er?.result === "success" && er?.rates?.[to]) rate = Number(er.rates[to]);
        }

        if (!rate || !Number.isFinite(rate)) {
          return m.reply("❌ Invalid currency code or provider unavailable. Example: USD, EUR, GBP, GHS, NGN, KES");
        }

        const result = (amount * rate).toFixed(2);
        const reverseRate = (1 / rate).toFixed(6);
        let msg = `💱 *Currency Converter*\n\n`;
        msg += `💵 ${amount.toLocaleString()} ${from}\n`;
        msg += `⬇️\n`;
        msg += `💰 *${parseFloat(result).toLocaleString()} ${to}*\n\n`;
        msg += `📊 1 ${from} = ${rate.toFixed(4)} ${to}\n`;
        msg += `📊 1 ${to} = ${reverseRate} ${from}\n`;
        msg += `📅 Updated: ${new Date().toLocaleDateString()}\n\n`;
        msg += `_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Currency");
      }
    },
  },
  {
    name: ["country", "countryinfo", "cty"],
    category: "utility",
    desc: "Get country information",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("country <country name>");
      m.react("🌍");
      try {
        const data = await fetchJson(`https://restcountries.com/v3.1/name/${encodeURIComponent(text)}`).catch(() => null);
        if (!data?.[0]) return m.reply("❌ Country not found.");
        const c = data[0];

        let msg = `🌍 *Country Info*\n\n`;
        msg += `${c.flag || ""} *${c.name?.common?.toUpperCase()}*\n\n`;

        msg += `*Names*\n`;
        if (c.name?.official) msg += `📛 Official: ${c.name.official}\n`;
        if (c.name?.nativeName) {
          const natives = Object.values(c.name.nativeName);
          natives.forEach((n) => {
            if (n.official) msg += `🏷️ Native: ${n.official} (${n.common})\n`;
          });
        }
        if (c.altSpellings?.length) msg += `✏️ Alt Names: ${c.altSpellings.join(", ")}\n`;
        if (c.cca2) msg += `🔤 ISO Code: ${c.cca2}${c.cca3 ? " / " + c.cca3 : ""}\n`;
        if (c.cioc) msg += `🏅 Olympic Code: ${c.cioc}\n`;
        if (c.fifa) msg += `⚽ FIFA Code: ${c.fifa}\n`;
        msg += `\n`;

        msg += `*Geography*\n`;
        if (c.capital?.length) msg += `🏛️ Capital: ${c.capital.join(", ")}\n`;
        if (c.continents?.length) msg += `🗺️ Continent: ${c.continents.join(", ")}\n`;
        if (c.region) msg += `🌐 Region: ${c.region}\n`;
        if (c.subregion) msg += `📍 Subregion: ${c.subregion}\n`;
        if (c.latlng?.length) msg += `📌 Coordinates: ${c.latlng[0]}°, ${c.latlng[1]}°\n`;
        if (c.area) msg += `📐 Area: ${c.area.toLocaleString()} km²\n`;
        msg += `🏝️ Landlocked: ${c.landlocked ? "Yes" : "No"}\n`;
        if (c.borders?.length) msg += `🚧 Borders: ${c.borders.join(", ")}\n`;
        if (c.maps?.googleMaps) msg += `📍 Google Maps: ${c.maps.googleMaps}\n`;
        msg += `\n`;

        msg += `*People*\n`;
        if (c.population) msg += `👥 Population: ${c.population.toLocaleString()}\n`;
        if (c.demonyms?.eng) msg += `🏷️ Demonym: ${c.demonyms.eng.m}${c.demonyms.eng.f !== c.demonyms.eng.m ? " / " + c.demonyms.eng.f : ""}\n`;
        if (c.languages) msg += `🗣️ Languages: ${Object.values(c.languages).join(", ")}\n`;
        msg += `\n`;

        msg += `*Government & Economy*\n`;
        msg += `🏛️ UN Member: ${c.unMember ? "Yes ✅" : "No ❌"}\n`;
        msg += `🏛️ Independent: ${c.independent !== false ? "Yes ✅" : "No ❌"}\n`;
        if (c.currencies) {
          const currencies = Object.entries(c.currencies).map(([code, cur]) => `${cur.name} (${cur.symbol || code})`);
          msg += `💰 Currency: ${currencies.join(", ")}\n`;
        }
        msg += `\n`;

        msg += `*Practical Info*\n`;
        if (c.idd?.root) {
          const suffixes = c.idd.suffixes?.slice(0, 3).map((s) => c.idd.root + s).join(", ") || c.idd.root;
          msg += `☎️ Calling Code: ${suffixes}\n`;
        }
        if (c.tld?.length) msg += `🔗 Domain: ${c.tld.join(", ")}\n`;
        msg += `🚗 Driving Side: ${c.car?.side === "right" ? "Right ➡️" : "Left ⬅️"}\n`;
        if (c.timezones?.length) msg += `🕐 Timezones: ${c.timezones.join(", ")}\n`;
        msg += `\n`;
        msg += `_${config.BOT_NAME} · Desam Tech_ ⚡`;

        const flagUrl = c.flags?.png;
        if (flagUrl) {
          const buf = await fetchBuffer(flagUrl).catch(() => null);
          if (buf) {
            await sendImageOrText(sock, m.chat, buf, msg, m);
            m.react("✅");
            return;
          }
        }
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Country");
      }
    },
  },
  {
    name: ["bmi"],
    category: "utility",
    desc: "Calculate BMI",
    handler: async (sock, m, { args }) => {
      if (args.length < 2) return m.usageReply("bmi <weight_kg> <height_cm>", "bmi 70 175");
      const weight = parseFloat(args[0]);
      const heightCm = parseFloat(args[1]);
      if (!Number.isFinite(weight) || !Number.isFinite(heightCm) || heightCm <= 0) return m.reply("Invalid numbers.");
      const heightM = heightCm / 100;
      const bmi = weight / (heightM * heightM);
      const label =
        bmi < 18.5 ? "Underweight" :
        bmi < 25 ? "Normal" :
        bmi < 30 ? "Overweight" :
        "Obese";
      return m.reply(`🧍 *BMI Calculator*\n\n⚖️ Weight: ${weight} kg\n📏 Height: ${heightCm} cm\n\n📊 BMI: *${bmi.toFixed(1)}* (${label})`);
    },
  },
  {
    name: ["age", "dob"],
    category: "utility",
    desc: "Calculate age from date (YYYY-MM-DD)",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("age <YYYY-MM-DD>", "age 2000-01-31");
      const birth = new Date(text);
      if (Number.isNaN(birth.getTime())) return m.reply("❌ Invalid date. Use format YYYY-MM-DD.");
      const now = new Date();
      let years = now.getFullYear() - birth.getFullYear();
      let months = now.getMonth() - birth.getMonth();
      let days = now.getDate() - birth.getDate();
      if (days < 0) {
        const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        days += prevMonthDays;
        months -= 1;
      }
      if (months < 0) {
        months += 12;
        years -= 1;
      }
      const totalDays = Math.floor((now.getTime() - birth.getTime()) / 86400000);
      const nextBirthday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
      if (nextBirthday < now) nextBirthday.setFullYear(now.getFullYear() + 1);
      const daysUntilBday = Math.ceil((nextBirthday.getTime() - now.getTime()) / 86400000);
      await m.reply(
        `🎂 *Age Calculator*\n\n` +
        `📅 Born: ${text}\n` +
        `🔢 *${years} years, ${months} months, ${days} days*\n\n` +
        `📊 Total Days: ${totalDays.toLocaleString()}\n` +
        `🎂 Next Birthday: ${daysUntilBday} days away`
      );
    },
  },
  {
    name: ["password", "genpass", "passgen", "pass"],
    category: "utility",
    desc: "Generate random password",
    handler: async (sock, m, { text }) => {
      const length = Math.min(Math.max(parseInt(text, 10) || 16, 8), 64);
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=";
      const bytes = crypto.randomBytes(length);
      let password = "";
      for (let i = 0; i < length; i++) password += chars[bytes[i] % chars.length];
      await m.reply(`🔐 *Password Generator*\n\n\`\`\`${password}\`\`\`\n\n📏 Length: ${length}`);
    },
  },
  {
    name: ["uuid"],
    category: "utility",
    desc: "Generate UUID",
    handler: async (sock, m) => {
      await m.reply(`🆔 *UUID Generator*\n\n\`\`\`${crypto.randomUUID()}\`\`\``);
    },
  },
  {
    name: ["timestamp", "epoch", "unix", "ts"],
    category: "utility",
    desc: "Get current Unix timestamp (or convert)",
    handler: async (sock, m, { text }) => {
      if (text && !Number.isNaN(Number(text))) {
        const n = Number(text);
        const ms = String(text).length <= 10 ? n * 1000 : n;
        const date = new Date(ms);
        return m.reply(`🕐 *Timestamp Converter*\n\n📌 Input: ${text}\n📅 UTC: ${date.toUTCString()}\n🌍 Local: ${date.toLocaleString()}`);
      }
      const nowSec = Math.floor(Date.now() / 1000);
      await m.reply(`🕐 *Unix Timestamp*\n\n📌 Seconds: \`${nowSec}\`\n📌 Milliseconds: \`${Date.now()}\`\n📅 UTC: ${new Date().toUTCString()}`);
    },
  },
  {
    name: ["hash"],
    category: "utility",
    desc: "Hash text (MD5/SHA1/SHA256)",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.usageReply("hash <text>");
      const md5 = crypto.createHash("md5").update(input).digest("hex");
      const sha1 = crypto.createHash("sha1").update(input).digest("hex");
      const sha256 = crypto.createHash("sha256").update(input).digest("hex");
      await m.reply(
        `🔐 *Hash Generator*\n\n` +
        `*MD5:*\n\`\`\`${md5}\`\`\`\n\n` +
        `*SHA1:*\n\`\`\`${sha1}\`\`\`\n\n` +
        `*SHA256:*\n\`\`\`${sha256}\`\`\``
      );
    },
  },
  {
    name: ["whois", "domain"],
    category: "utility",
    desc: "DNS lookup (A/MX/NS/TXT/AAAA)",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("whois <domain>");
      m.react("⏳");
      try {
        const domain = String(text).replace(/^https?:\/\//i, "").split("/")[0].trim();
        if (!domain) return m.reply("❌ Invalid domain.");
        const [dnsA, dnsAAAA, dnsMX, dnsNS, dnsTXT] = await Promise.all([
          resolveDns(domain, "A"),
          resolveDns(domain, "AAAA"),
          resolveDns(domain, "MX"),
          resolveDns(domain, "NS"),
          resolveDns(domain, "TXT"),
        ]);

        const formatAnswers = (resp, label, typeNum) => {
          const answers = resp?.Answer || [];
          const lines = answers.filter((a) => (typeNum ? a.type === typeNum : true)).map((a) => `- ${a.data} (TTL: ${a.TTL}s)`);
          if (!lines.length) return "";
          return `*${label}*\n${lines.join("\n")}\n\n`;
        };

        let msg = `🌐 *Domain Lookup*\n\n🌐 Domain: *${domain}*\n\n`;
        msg += formatAnswers(dnsA, "A Records (IPv4)", 1);
        msg += formatAnswers(dnsAAAA, "AAAA Records (IPv6)", 28);
        msg += formatAnswers(dnsMX, "MX Records", 15);
        msg += formatAnswers(dnsNS, "NS Records", 2);
        msg += formatAnswers(dnsTXT, "TXT Records", 16);
        msg += `_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg.trim());
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("DNS lookup");
      }
    },
  },
  {
    name: ["speedtest", "speed", "spd"],
    category: "utility",
    desc: "Check server speed info (light)",
    handler: async (sock, m) => {
      m.react("⏳");
      const start = Date.now();
      try {
        await fetchJson(endpoints.ip.ipify).catch(() => null);
        const ping = Date.now() - start;
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const uptime = os.uptime();
        let msg = `🚀 *Server Speed Info*\n\n`;
        msg += `📡 Ping: ${ping}ms\n`;
        msg += `📊 Status: ${ping < 100 ? "Excellent" : ping < 300 ? "Good" : "Slow"}\n\n`;
        msg += `💻 CPU: ${cpus[0]?.model || "N/A"}\n`;
        msg += `🧮 Cores: ${cpus.length}\n\n`;
        msg += `💾 RAM: ${(usedMem / 1024 / 1024 / 1024).toFixed(2)} / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB\n`;
        msg += `⏱️ Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n\n`;
        msg += `_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Speed test");
      }
    },
  },
  {
    name: ["zodiac", "horoscope", "zod"],
    category: "utility",
    desc: "Get daily horoscope",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("zodiac <sign>\nSigns: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces");
      m.react("♈");
      try {
        const validSigns = ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"];
        const sign = String(text).toLowerCase().trim();
        if (!validSigns.includes(sign)) return m.reply(`❌ Invalid zodiac sign. Valid signs:\n${validSigns.join(", ")}`);

        let horoscope = null;

        const primary = await fetchJson(
          `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${sign}&day=today`,
          { timeout: 12000 }
        ).catch(() => null);
        if (primary?.data?.horoscope_data) {
          horoscope = primary.data.horoscope_data;
        }

        if (!horoscope) {
          horoscope = localHoroscopes[sign] || null;
        }

        if (!horoscope) return m.reply("❌ Could not retrieve horoscope right now. Try again later.");

        await m.reply(`🔮 *Daily Horoscope*\n\n♈ Sign: *${sign[0].toUpperCase() + sign.slice(1)}*\n📅 ${new Date().toLocaleDateString()}\n\n${horoscope}\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Horoscope");
      }
    },
  },
  {
    name: ["numberinfo", "numfact", "numberfact", "num"],
    category: "utility",
    desc: "Fun fact about a number",
    handler: async (sock, m, { text }) => {
      const num = Number.parseInt(text, 10);
      const n = Number.isFinite(num) ? num : Math.floor(Math.random() * 1000);
      m.react("🔢");
      try {
        const [triviaData, mathData, yearData] = await Promise.all([
          fetchJson(`https://numbersapi.com/${n}/trivia?json`).catch(() => null),
          fetchJson(`https://numbersapi.com/${n}/math?json`).catch(() => null),
          fetchJson(`https://numbersapi.com/${n}/year?json`).catch(() => null),
        ]);
        let msg = `🔢 *Number Facts*\n\n🔢 Number: *${n}*\n\n`;
        if (triviaData?.text) msg += `📌 *Trivia:* ${triviaData.text}\n\n`;
        if (mathData?.text) msg += `🧮 *Math:* ${mathData.text}\n\n`;
        if (yearData?.text) msg += `📅 *Year:* ${yearData.text}\n\n`;
        if (!triviaData?.text && !mathData?.text && !yearData?.text) {
          msg += `📌 *Trivia:* ${n} is ${n % 2 === 0 ? "even" : "odd"}.\n\n`;
          msg += `🧮 *Math:* Square = ${n * n}, Cube = ${n * n * n}.\n\n`;
          msg += `📅 *Year:* Roman numerals: ${toRoman(Math.max(1, Math.min(n, 3999)))}.\n\n`;
        }
        msg += `_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg.trim());
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Number Fact");
      }
    },
  },
];

module.exports = { commands };
