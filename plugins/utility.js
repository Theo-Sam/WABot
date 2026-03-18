const config = require("../config");
const { fetchJson, fetchBuffer, sendImageOrText } = require("../lib/helpers");
const crypto = require("crypto");

const commands = [
  {
    name: ["currency", "convert", "exchange"],
    category: "utility",
    desc: "Convert currency",
    handler: async (sock, m, { args }) => {
      if (args.length < 3) return m.reply(`Usage: ${config.PREFIX}currency <amount> <from> <to>\nExample: ${config.PREFIX}currency 100 USD GHS`);
      const amount = parseFloat(args[0]);
      const from = args[1].toUpperCase();
      const to = args[2].toUpperCase();
      if (isNaN(amount)) return m.reply("Invalid amount.");
      m.react("💱");
      try {
        let rate = null;

        const data = await fetchJson(`https://api.exchangerate-api.com/v4/latest/${from}`).catch(() => null);
        if (data?.rates?.[to]) {
          rate = Number(data.rates[to]);
        }

        if (!rate) {
          const frankfurter = await fetchJson(`https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).catch(() => null);
          if (frankfurter?.rates?.[to]) {
            rate = Number(frankfurter.rates[to]);
          }
        }

        if (!rate) {
          const exchangerateHost = await fetchJson(`https://api.exchangerate.host/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=1`).catch(() => null);
          if (Number.isFinite(Number(exchangerateHost?.result))) {
            rate = Number(exchangerateHost.result);
          }
        }

        if (!rate || !Number.isFinite(rate)) {
          return m.reply(`❌ Invalid currency code or provider unavailable. Example: USD, EUR, GBP, GHS, NGN, KES`);
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
        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Currency API is currently overloaded.");
      }
    },
  },
  {
    name: ["country", "countryinfo", "cty"],
    category: "utility",
    desc: "Get country information",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}country <country name>`);
      m.react("🌍");
      try {
        const data = await fetchJson(`https://restcountries.com/v3.1/name/${encodeURIComponent(text)}`);
        if (!data?.[0]) return m.reply("❌ Country not found.");
        const c = data[0];

        let msg = `🌍 *Country Info*\n\n`;
        msg += `${c.flag || ""} *${c.name?.common?.toUpperCase()}*\n\n`;

        msg += `*Names*\n`;
        if (c.name?.official) msg += `📛 Official: ${c.name.official}\n`;
        if (c.name?.nativeName) {
          const natives = Object.values(c.name.nativeName);
          natives.forEach(n => {
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
          const currencies = Object.entries(c.currencies).map(([code, cur]) =>
            `${cur.name} (${cur.symbol || code})`
          );
          msg += `💰 Currency: ${currencies.join(", ")}\n`;
        }
        if (c.gini) {
          const giniEntries = Object.entries(c.gini);
          if (giniEntries.length) msg += `📊 GINI Index: ${giniEntries[0][1]} (${giniEntries[0][0]})\n`;
        }
        msg += `\n`;

        msg += `*Practical Info*\n`;
        if (c.idd?.root) {
          const suffixes = c.idd.suffixes?.slice(0, 3).map(s => c.idd.root + s).join(", ") || c.idd.root;
          msg += `☎️ Calling Code: ${suffixes}\n`;
        }
        if (c.tld?.length) msg += `🔗 Domain: ${c.tld.join(", ")}\n`;
        msg += `🚗 Driving Side: ${c.car?.side === "right" ? "Right ➡️" : "Left ⬅️"}\n`;
        if (c.car?.signs?.length) msg += `🚘 Car Signs: ${c.car.signs.join(", ")}\n`;
        if (c.timezones?.length) msg += `🕐 Timezones: ${c.timezones.join(", ")}\n`;
        if (c.startOfWeek) msg += `📅 Week Starts: ${c.startOfWeek.charAt(0).toUpperCase() + c.startOfWeek.slice(1)}\n`;
        if (c.postalCode?.format) msg += `📮 Postal Format: ${c.postalCode.format}\n`;
        msg += `\n`;

        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;

        const flagUrl = c.flags?.png;
        const coatUrl = c.coatOfArms?.png;
        if (flagUrl) {
          const buf = await fetchBuffer(flagUrl).catch(() => null);
          if (buf) {
            await sendImageOrText(sock, m.chat, buf, msg, m);
            if (coatUrl) {
              const coatBuf = await fetchBuffer(coatUrl).catch(() => null);
              if (coatBuf) {
                await sendImageOrText(sock, m.chat, coatBuf, `🏛️ *Coat of Arms — ${c.name?.common}*`, m);
              }
            }
            m.react("✅");
            return;
          }
        }
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Country API is currently overloaded.");
      }
    },
  },
  {
    name: ["bmi"],
    category: "utility",
    desc: "Calculate BMI",
    handler: async (sock, m, { args }) => {
      if (args.length < 2) return m.reply(`Usage: ${config.PREFIX}bmi <weight_kg> <height_cm>\nExample: ${config.PREFIX}bmi 70 175`);
      const weight = parseFloat(args[0]);
      const heightCm = parseFloat(args[1]);
      if (isNaN(weight) || isNaN(heightCm)) return m.reply("Invalid numbers.");
      const heightM = heightCm / 100;
      const bmi = (weight / (heightM * heightM)).toFixed(1);
      let category = "";
      let advice = "";
      if (bmi < 16) { category = "Severely Underweight 🔴"; advice = "Please consult a healthcare provider."; }
      else if (bmi < 18.5) { category = "Underweight 🔵"; advice = "Consider a balanced diet with more calories."; }
      else if (bmi < 25) { category = "Normal Weight ✅"; advice = "Great! Maintain your healthy lifestyle."; }
      else if (bmi < 30) { category = "Overweight 🟡"; advice = "Consider regular exercise and balanced meals."; }
      else if (bmi < 35) { category = "Obese (Class I) 🟠"; advice = "Consult a healthcare provider for guidance."; }
      else { category = "Obese (Class II+) 🔴"; advice = "Please seek medical advice."; }

      const idealMin = (18.5 * heightM * heightM).toFixed(1);
      const idealMax = (24.9 * heightM * heightM).toFixed(1);

      let msg = `⚖️ *BMI Calculator*\n\n`;
      msg += `📊 Weight: ${weight} kg\n`;
      msg += `📏 Height: ${heightCm} cm (${heightM.toFixed(2)} m)\n\n`;
      msg += `🔢 BMI: *${bmi}*\n`;
      msg += `📌 Category: *${category}*\n`;
      msg += `💡 ${advice}\n`;
      msg += `⚖️ Ideal Weight: ${idealMin} - ${idealMax} kg\n\n`;
      msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
      await m.reply(msg);
    },
  },
  {
    name: ["age", "agecalc"],
    category: "utility",
    desc: "Calculate age from birthdate",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}age <YYYY-MM-DD>\nExample: ${config.PREFIX}age 2000-01-15`);
      try {
        const birth = new Date(text);
        if (isNaN(birth.getTime())) return m.reply("Invalid date format. Use YYYY-MM-DD.");
        const now = new Date();
        let years = now.getFullYear() - birth.getFullYear();
        let months = now.getMonth() - birth.getMonth();
        let days = now.getDate() - birth.getDate();
        if (days < 0) { months--; days += 30; }
        if (months < 0) { years--; months += 12; }
        const totalDays = Math.floor((now - birth) / 86400000);
        const totalWeeks = Math.floor(totalDays / 7);
        const totalHours = totalDays * 24;
        const totalMinutes = totalHours * 60;

        const nextBirthday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
        if (nextBirthday < now) nextBirthday.setFullYear(now.getFullYear() + 1);
        const daysUntilBday = Math.ceil((nextBirthday - now) / 86400000);

        const zodiacSigns = [
          { sign: "Capricorn ♑", start: [0, 20] }, { sign: "Aquarius ♒", start: [1, 19] },
          { sign: "Pisces ♓", start: [2, 20] }, { sign: "Aries ♈", start: [3, 20] },
          { sign: "Taurus ♉", start: [4, 20] }, { sign: "Gemini ♊", start: [5, 21] },
          { sign: "Cancer ♋", start: [6, 22] }, { sign: "Leo ♌", start: [7, 23] },
          { sign: "Virgo ♍", start: [8, 23] }, { sign: "Libra ♎", start: [9, 23] },
          { sign: "Scorpio ♏", start: [10, 22] }, { sign: "Sagittarius ♐", start: [11, 22] },
          { sign: "Capricorn ♑", start: [11, 32] }
        ];
        let zodiac = "Unknown";
        const bm = birth.getMonth();
        const bd = birth.getDate();
        for (let i = 0; i < zodiacSigns.length - 1; i++) {
          const curr = zodiacSigns[i];
          const next = zodiacSigns[i + 1];
          if ((bm === curr.start[0] && bd >= curr.start[1]) || (bm === next.start[0] && bd < next.start[1])) {
            zodiac = curr.sign;
            break;
          }
        }

        let msg = `🎂 *Age Calculator*\n\n`;
        msg += `📅 Born: ${text}\n`;
        msg += `🔢 *${years} years, ${months} months, ${days} days*\n\n`;
        msg += `📊 Total Days: ${totalDays.toLocaleString()}\n`;
        msg += `📊 Total Weeks: ${totalWeeks.toLocaleString()}\n`;
        msg += `⏰ Total Hours: ${totalHours.toLocaleString()}\n`;
        msg += `⏱️ Total Minutes: ${totalMinutes.toLocaleString()}\n\n`;
        msg += `🎂 Next Birthday: ${daysUntilBday} days away\n`;
        msg += `♈ Zodiac: ${zodiac}\n`;
        msg += `🌙 Born on: ${birth.toLocaleDateString("en-US", { weekday: "long" })}\n\n`;
        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
        await m.reply(msg);
      } catch {
        await m.reply("❌ Invalid date. Use format YYYY-MM-DD.");
      }
    },
  },
  {
    name: ["password", "genpass", "passgen", "pass"],
    category: "utility",
    desc: "Generate random password",
    handler: async (sock, m, { text }) => {
      const length = Math.min(Math.max(parseInt(text) || 16, 8), 64);
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=";
      let password = "";
      const bytes = crypto.randomBytes(length);
      for (let i = 0; i < length; i++) {
        password += chars[bytes[i] % chars.length];
      }
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasDigit = /\d/.test(password);
      const hasSpecial = /[!@#$%^&*()_+\-=]/.test(password);
      const score = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
      const strengthLabel = score === 4 && length >= 20 ? "Very Strong 💪" : score >= 3 && length >= 14 ? "Strong 🔒" : score >= 2 ? "Good 👍" : "Moderate ⚠️";

      let msg = `🔐 *Password Generator*\n\n`;
      msg += `\`\`\`${password}\`\`\`\n\n`;
      msg += `📏 Length: ${length}\n`;
      msg += `🔒 Strength: ${strengthLabel}\n`;
      msg += `🔤 Uppercase: ${hasUpper ? "✅" : "❌"}\n`;
      msg += `🔡 Lowercase: ${hasLower ? "✅" : "❌"}\n`;
      msg += `🔢 Digits: ${hasDigit ? "✅" : "❌"}\n`;
      msg += `🔣 Special: ${hasSpecial ? "✅" : "❌"}\n\n`;
      msg += `_Save this somewhere safe!_`;
      await m.reply(msg);
    },
  },
  {
    name: ["uuid"],
    category: "utility",
    desc: "Generate UUID",
    handler: async (sock, m) => {
      const uuid = crypto.randomUUID();
      await m.reply(`🆔 *UUID Generator*\n\n\`\`\`${uuid}\`\`\``);
    },
  },
  {
    name: ["timestamp", "epoch", "unix", "ts"],
    category: "utility",
    desc: "Get current Unix timestamp",
    handler: async (sock, m, { text }) => {
      if (text && !isNaN(text)) {
        const date = new Date(parseInt(text) * (text.length <= 10 ? 1000 : 1));
        return m.reply(`🕐 *Timestamp Converter*\n\n📌 Input: ${text}\n📅 Date: ${date.toUTCString()}\n🌍 Local: ${date.toLocaleString()}`);
      }
      const now = Math.floor(Date.now() / 1000);
      await m.reply(`🕐 *Unix Timestamp*\n\n📌 Seconds: \`${now}\`\n📌 Milliseconds: \`${Date.now()}\`\n📅 UTC: ${new Date().toUTCString()}`);
    },
  },
  {
    name: ["hash"],
    category: "utility",
    desc: "Hash text (MD5/SHA256)",
    handler: async (sock, m, { text }) => {
      const input = text || m.quoted?.body || "";
      if (!input) return m.reply(`Usage: ${config.PREFIX}hash <text>`);
      const md5 = crypto.createHash("md5").update(input).digest("hex");
      const sha1 = crypto.createHash("sha1").update(input).digest("hex");
      const sha256 = crypto.createHash("sha256").update(input).digest("hex");
      let msg = `🔐 *Hash Generator*\n\n`;
      msg += `📝 Input: ${input.substring(0, 50)}${input.length > 50 ? "..." : ""}\n\n`;
      msg += `*MD5:*\n\`\`\`${md5}\`\`\`\n\n`;
      msg += `*SHA1:*\n\`\`\`${sha1}\`\`\`\n\n`;
      msg += `*SHA256:*\n\`\`\`${sha256}\`\`\``;
      await m.reply(msg);
    },
  },
  {
    name: ["whois", "domain"],
    category: "utility",
    desc: "Domain/WHOIS lookup",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}whois <domain>`);
      m.react("⏳");
      try {
        const domain = text.replace(/https?:\/\//g, "").split("/")[0];
        const [dnsA, dnsMX, dnsNS, dnsAAAA, dnsTXT] = await Promise.all([
          fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`).catch(() => null),
          fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`).catch(() => null),
          fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`).catch(() => null),
          fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=AAAA`).catch(() => null),
          fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=TXT`).catch(() => null),
        ]);
        let msg = `🌐 *Domain Lookup*\n\n`;
        msg += `🌐 Domain: *${domain}*\n\n`;

        if (dnsA?.Answer?.length) {
          msg += `*A Records (IPv4)*\n`;
          dnsA.Answer.forEach((r) => { if (r.type === 1) msg += `📌 ${r.data} (TTL: ${r.TTL}s)\n`; });
          msg += `\n`;
        }
        if (dnsAAAA?.Answer?.length) {
          msg += `*AAAA Records (IPv6)*\n`;
          dnsAAAA.Answer.forEach((r) => { if (r.type === 28) msg += `📌 ${r.data}\n`; });
          msg += `\n`;
        }
        if (dnsNS?.Answer?.length) {
          msg += `*Name Servers*\n`;
          dnsNS.Answer.forEach((r) => { if (r.type === 2) msg += `🖥️ ${r.data}\n`; });
          msg += `\n`;
        }
        if (dnsMX?.Answer?.length) {
          msg += `*Mail Servers*\n`;
          dnsMX.Answer.forEach((r) => { if (r.type === 15) msg += `📧 ${r.data}\n`; });
          msg += `\n`;
        }
        if (dnsTXT?.Answer?.length) {
          msg += `*TXT Records*\n`;
          dnsTXT.Answer.filter(r => r.type === 16).slice(0, 5).forEach((r) => {
            msg += `📝 ${r.data?.substring(0, 100)}\n`;
          });
          msg += `\n`;
        }

        if (!dnsA?.Answer?.length && !dnsNS?.Answer?.length && !dnsMX?.Answer?.length) {
          msg += `No DNS records found for this domain.\n`;
        }
        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The WHOIS API is currently overloaded.");
      }
    },
  },
  {
    name: ["speedtest", "speed", "spd"],
    category: "utility",
    desc: "Check server speed info",
    handler: async (sock, m) => {
      m.react("⏳");
      const start = Date.now();
      try {
        await fetchJson("https://api.ipify.org?format=json");
        const ping = Date.now() - start;
        const os = require("os");
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const uptime = os.uptime();

        let msg = `🚀 *Server Speed Info*\n\n`;
        msg += `📡 Ping: ${ping}ms\n`;
        msg += `📊 Status: ${ping < 100 ? "Excellent 🟢" : ping < 300 ? "Good 🟡" : "Slow 🔴"}\n\n`;
        msg += `💻 CPU: ${cpus[0]?.model || "N/A"}\n`;
        msg += `🧮 Cores: ${cpus.length}\n`;
        msg += `⚡ Speed: ${cpus[0]?.speed || "N/A"} MHz\n\n`;
        msg += `💾 Total RAM: ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB\n`;
        msg += `💾 Used RAM: ${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB\n`;
        msg += `💾 Free RAM: ${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB\n`;
        msg += `📊 Usage: ${((usedMem / totalMem) * 100).toFixed(1)}%\n\n`;
        msg += `🖥️ Platform: ${os.platform()} ${os.arch()}\n`;
        msg += `📦 Node: ${process.version}\n`;
        msg += `⏱️ Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s\n`;
        msg += `🏠 Hostname: ${os.hostname()}\n\n`;
        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ Speed test failed. Server might be busy.");
      }
    },
  },
  {
    name: ["zodiac", "horoscope", "zod"],
    category: "utility",
    desc: "Get daily horoscope",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}zodiac <sign>\nSigns: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces`);
      m.react("♈");
      try {
        const sign = text.toLowerCase();
        const data = await fetchJson(`https://ohmanda.com/api/horoscope/${sign}/`).catch(() => null);
        if (data?.horoscope) {
          const emojis = { aries: "♈", taurus: "♉", gemini: "♊", cancer: "♋", leo: "♌", virgo: "♍", libra: "♎", scorpio: "♏", sagittarius: "♐", capricorn: "♑", aquarius: "♒", pisces: "♓" };
          const elements = { aries: "Fire 🔥", taurus: "Earth 🌍", gemini: "Air 💨", cancer: "Water 💧", leo: "Fire 🔥", virgo: "Earth 🌍", libra: "Air 💨", scorpio: "Water 💧", sagittarius: "Fire 🔥", capricorn: "Earth 🌍", aquarius: "Air 💨", pisces: "Water 💧" };
          const emoji = emojis[sign] || "🔮";
          const element = elements[sign] || "Unknown";

          let msg = `${emoji} *Daily Horoscope*\n\n`;
          msg += `${emoji} *${sign.charAt(0).toUpperCase() + sign.slice(1)}*\n`;
          msg += `🌍 Element: ${element}\n`;
          msg += `📅 ${new Date().toLocaleDateString()}\n\n`;
          msg += `${data.horoscope}\n\n`;
          msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
          await m.reply(msg);
        } else {
          await m.reply("❌ Invalid zodiac sign.");
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Horoscope API is currently overloaded.");
      }
    },
  },
  {
    name: ["numberinfo", "numfact", "numberfact", "num"],
    category: "utility",
    desc: "Fun fact about a number",
    handler: async (sock, m, { text }) => {
      const num = parseInt(text) || Math.floor(Math.random() * 1000);
      m.react("🔢");
      try {
        const [triviaData, mathData, yearData] = await Promise.all([
          fetchJson(`https://numbersapi.com/${num}/trivia?json`).catch(() => null),
          fetchJson(`https://numbersapi.com/${num}/math?json`).catch(() => null),
          fetchJson(`https://numbersapi.com/${num}/year?json`).catch(() => null),
        ]);

        let msg = `🔢 *Number Facts*\n\n`;
        msg += `🔢 Number: *${num}*\n\n`;

        if (triviaData?.text) msg += `📌 *Trivia:* ${triviaData.text}\n\n`;
        if (mathData?.text) msg += `🧮 *Math:* ${mathData.text}\n\n`;
        if (yearData?.text) msg += `📅 *Year:* ${yearData.text}\n\n`;

        if (!triviaData?.text && !mathData?.text && !yearData?.text) {
          msg += `📌 *Trivia:* ${num} is ${num % 2 === 0 ? "an even" : "an odd"} number.\n\n`;
          msg += `🧮 *Math:* Square = ${num * num}, Cube = ${num * num * num}.\n\n`;
          msg += `📅 *Year:* ${num} in Roman numerals is ${toRoman(Math.max(1, Math.min(num, 3999)))}.\n\n`;
        }

        msg += `*Properties*\n`;
        msg += `${num % 2 === 0 ? "Even" : "Odd"} number\n`;
        const isPrime = num > 1 && Array.from({ length: Math.floor(Math.sqrt(num)) }, (_, i) => i + 2).every(d => num % d !== 0);
        msg += `${isPrime ? "✅ Prime" : "❌ Not Prime"}\n`;
        msg += `Binary: ${num.toString(2)}\n`;
        msg += `Hex: 0x${num.toString(16).toUpperCase()}\n`;
        msg += `Octal: 0${num.toString(8)}\n\n`;
        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Number Fact API is currently overloaded.");
      }
    },
  },
  {
    name: ["color2", "randomcolor", "colorgen"],
    category: "utility",
    desc: "Generate random color palette",
    handler: async (sock, m) => {
      const colors = [];
      for (let i = 0; i < 5; i++) {
        const hex = Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
        colors.push(`#${hex}`);
      }
      let msg = `🎨 *Random Color Palette*\n\n`;
      colors.forEach((c, i) => {
        const r = parseInt(c.slice(1, 3), 16);
        const g = parseInt(c.slice(3, 5), 16);
        const b = parseInt(c.slice(5, 7), 16);
        msg += `${i + 1}. \`${c}\` RGB(${r}, ${g}, ${b}) ${"█".repeat(8)}\n`;
      });
      msg += `\n_Use ${config.PREFIX}color <hex> to preview a color!_`;
      await m.reply(msg);
    },
  },
];

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

module.exports = { commands };
