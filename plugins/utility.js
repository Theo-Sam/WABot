const config = require("../config");
const { fetchJson } = require("../lib/helpers");
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
        const data = await fetchJson(`https://api.exchangerate-api.com/v4/latest/${from}`);
        if (!data?.rates?.[to]) return m.reply(`❌ Invalid currency code. Example: USD, EUR, GBP, GHS, NGN, KES`);
        const rate = data.rates[to];
        const result = (amount * rate).toFixed(2);
        await m.reply(`💱 *Currency Converter*\n\n💵 ${amount} ${from} = *${result} ${to}*\n\n📊 Rate: 1 ${from} = ${rate.toFixed(4)} ${to}\n📅 Updated: ${new Date().toLocaleDateString()}`);
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
        let msg = `🌍 *${c.name?.common?.toUpperCase()}*\n\n`;
        if (c.name?.official) msg += `📛 *Official Name:* ${c.name.official}\n`;
        if (c.name?.nativeName) {
          const native = Object.values(c.name.nativeName)[0];
          if (native && native.common) msg += `🏷️ *Native Name:* ${native.common}\n`;
        }
        if (c.capital?.[0]) msg += `🏛️ *Capital:* ${c.capital[0]}\n`;
        if (c.continents?.[0]) msg += `🗺️ *Continent:* ${c.continents[0]}\n`;
        if (c.region) msg += `🌐 *Region:* ${c.region}${c.subregion ? ` (${c.subregion})` : ""}\n`;
        if (c.population) msg += `👥 *Population:* ${c.population.toLocaleString()}\n`;
        if (c.area) msg += `📐 *Area:* ${c.area.toLocaleString()} km²\n`;
        if (c.currencies) {
          const cur = Object.values(c.currencies)[0];
          msg += `💰 *Currency:* ${cur.name} (${cur.symbol})\n`;
        }
        if (c.languages) msg += `🗣️ *Languages:* ${Object.values(c.languages).join(", ")}\n`;
        if (c.idd?.root) {
          const suffix = c.idd.suffixes?.[0] || "";
          msg += `☎️ *Calling Code:* ${c.idd.root}${suffix}\n`;
        }
        if (c.tld?.[0]) msg += `🔗 *Top Level Domain:* ${c.tld[0]}\n`;
        msg += `🏛️ *UN Member:* ${c.unMember ? "Yes ✅" : "No ❌"}\n`;
        msg += `🚗 *Driving Side:* ${c.car?.side === "right" ? "Right ➡️" : "Left ⬅️"}\n`;
        if (c.timezones?.length) msg += `🕐 *Timezones:* ${c.timezones.join(", ")}\n`;
        if (c.borders?.length) msg += `🚧 *Borders:* ${c.borders.join(", ")}\n`;
        if (c.maps?.googleMaps) msg += `📍 *Google Maps:* ${c.maps.googleMaps}\n`;

        if (c.flag) msg += `\n${c.flag}`;

        // Only try to fetch the flag for the image
        const imgUrl = c.flags?.png;
        if (imgUrl) {
          const buf = await require("../lib/helpers").fetchBuffer(imgUrl).catch(() => null);
          if (buf) {
            await sock.sendMessage(m.chat, { image: buf, caption: msg }, { quoted: { key: m.key, message: m.message } });
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
      if (bmi < 18.5) category = "Underweight 🔵";
      else if (bmi < 25) category = "Normal ✅";
      else if (bmi < 30) category = "Overweight 🟡";
      else category = "Obese 🔴";
      await m.reply(`⚖️ *BMI Calculator*\n\n📊 Weight: ${weight} kg\n📏 Height: ${heightCm} cm\n\n🔢 BMI: *${bmi}*\n📌 Category: *${category}*`);
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
        await m.reply(`🎂 *Age Calculator*\n\n📅 Birth: ${text}\n\n🔢 *${years} years, ${months} months, ${days} days*\n📊 Total days: ${totalDays.toLocaleString()}\n⏰ That's about ${Math.floor(totalDays * 24).toLocaleString()} hours!`);
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
      await m.reply(`🔐 *Password Generator*\n\n\`\`\`${password}\`\`\`\n\n📏 Length: ${length}\n🔒 Strength: ${length >= 20 ? "Very Strong" : length >= 14 ? "Strong" : "Good"}\n\n_Save this somewhere safe!_`);
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
      await m.reply(`🔐 *Hash Generator*\n\n📝 Input: ${input.substring(0, 50)}${input.length > 50 ? "..." : ""}\n\n*MD5:*\n\`\`\`${md5}\`\`\`\n\n*SHA1:*\n\`\`\`${sha1}\`\`\`\n\n*SHA256:*\n\`\`\`${sha256}\`\`\``);
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
        const [dnsA, dnsMX, dnsNS] = await Promise.all([
          fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`).catch(() => null),
          fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`).catch(() => null),
          fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`).catch(() => null),
        ]);
        let msg = `🌐 *Domain Lookup: ${domain}*\n\n`;
        if (dnsA?.Answer?.length) {
          msg += `📌 *A Records (IP):*\n`;
          dnsA.Answer.forEach((r) => { if (r.type === 1) msg += `▸ ${r.data}\n`; });
          msg += `\n`;
        }
        if (dnsNS?.Answer?.length) {
          msg += `🖥️ *Name Servers:*\n`;
          dnsNS.Answer.forEach((r) => { if (r.type === 2) msg += `▸ ${r.data}\n`; });
          msg += `\n`;
        }
        if (dnsMX?.Answer?.length) {
          msg += `📧 *Mail Servers:*\n`;
          dnsMX.Answer.forEach((r) => { if (r.type === 15) msg += `▸ ${r.data}\n`; });
        }
        if (!dnsA?.Answer?.length && !dnsNS?.Answer?.length && !dnsMX?.Answer?.length) {
          msg += `No DNS records found for this domain.`;
        }
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
        msg += `💻 CPU: ${cpus[0]?.model || "N/A"}\n`;
        msg += `🧮 Cores: ${cpus.length}\n`;
        msg += `💾 RAM: ${(usedMem / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB\n`;
        msg += `📊 Usage: ${((usedMem / totalMem) * 100).toFixed(1)}%\n`;
        msg += `⏱️ Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n`;
        msg += `🖥️ Platform: ${os.platform()} ${os.arch()}\n`;
        msg += `📦 Node: ${process.version}`;
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
          const emoji = emojis[sign] || "🔮";
          await m.reply(`${emoji} *Daily Horoscope - ${sign.charAt(0).toUpperCase() + sign.slice(1)}*\n\n${data.horoscope}\n\n📅 _${new Date().toLocaleDateString()}_`);
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
        const data = await fetchJson(`http://numbersapi.com/${num}/trivia?json`);
        if (data?.text) {
          await m.reply(`🔢 *Number Fact*\n\n#${data.number}: ${data.text}`);
        } else {
          await m.reply(`🔢 ${num} is a ${num % 2 === 0 ? "even" : "odd"} number.`);
        }
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
      colors.forEach((c, i) => { msg += `${i + 1}. \`${c}\` ${"█".repeat(8)}\n`; });
      msg += `\n_Use ${config.PREFIX}color <hex> to preview a color!_`;
      await m.reply(msg);
    },
  },
];

module.exports = { commands };
