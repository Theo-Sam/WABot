const config = require("../config");
const { fetchJson } = require("../lib/helpers");

const FIRST_NAMES_M = ["James","John","Robert","Michael","William","David","Richard","Joseph","Thomas","Charles","Christopher","Daniel","Matthew","Anthony","Mark","Donald","Steven","Paul","Andrew","Joshua","Kenneth","Kevin","Brian","George","Timothy","Ronald","Edward","Jason","Jeffrey","Ryan","Jacob","Gary","Nicholas","Eric","Jonathan","Stephen","Larry","Justin","Scott","Brandon","Benjamin","Samuel","Raymond","Frank","Gregory","Alexander","Patrick","Jack","Dennis","Jerry","Tyler","Aaron","Jose","Henry","Adam","Douglas","Nathan","Peter","Zachary","Kyle","Walter","Harold","Jeremy","Ethan","Carl","Keith","Roger","Gerald","Christian","Terry","Sean","Arthur","Austin","Noah","Lawrence","Jesse","Joe","Bryan","Billy","Jordan","Albert","Dylan","Bruce","Willie","Gabriel","Alan","Juan","Logan","Wayne","Ralph","Roy","Eugene","Randy","Vincent","Russell","Louis","Philip","Bobby","Johnny","Bradley"];
const FIRST_NAMES_F = ["Mary","Patricia","Jennifer","Linda","Barbara","Susan","Elizabeth","Dorothy","Sarah","Karen","Lisa","Nancy","Betty","Sandra","Margaret","Ashley","Dorothy","Kimberly","Emily","Donna","Michelle","Carol","Amanda","Melissa","Deborah","Stephanie","Rebecca","Sharon","Laura","Cynthia","Kathleen","Amy","Angela","Shirley","Anna","Brenda","Pamela","Emma","Nicole","Helen","Samantha","Katherine","Christine","Debra","Rachel","Carolyn","Janet","Catherine","Maria","Heather","Diane","Julie","Joyce","Victoria","Kelly","Christina","Lauren","Joan","Evelyn","Olivia","Judith","Megan","Cheryl","Martha","Andrea","Frances","Hannah","Jacqueline","Ann","Gloria","Jean","Kathryn","Alice","Teresa","Sara","Janice","Doris","Madison","Julia","Grace","Judith","Amber","Denise","Danielle","Marilyn","Beverly","Charlotte","Natalie","Diana","Brittany","Theresa","Kayla","Alexis","Tiffany","Vanessa","Sophia","Isabella","Abigail","Avery"];
const LAST_NAMES = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts","Turner","Phillips","Evans","Parker","Collins","Edwards","Stewart","Flores","Morris","Nguyen","Murphy","Rivera","Cook","Rogers","Morgan","Peterson","Cooper","Reed","Bailey","Bell","Gomez","Kelly","Howard","Ward","Cox","Diaz","Richardson","Wood","Watson","Brooks","Bennett","Gray","James","Reyes","Hughes","Price","Myers","Hamilton","Foster","Rose","Long","Powell","Russell","Griffin","Kim","Jenkins","Cruz","Ford","Hayes"];

const COUNTRIES = [
  { name:"Nigeria", capital:"Abuja", continent:"Africa", flag:"🇳🇬", currency:"NGN", pop:"220M" },
  { name:"Ghana", capital:"Accra", continent:"Africa", flag:"🇬🇭", currency:"GHS", pop:"33M" },
  { name:"Kenya", capital:"Nairobi", continent:"Africa", flag:"🇰🇪", currency:"KES", pop:"55M" },
  { name:"South Africa", capital:"Pretoria", continent:"Africa", flag:"🇿🇦", currency:"ZAR", pop:"60M" },
  { name:"Ethiopia", capital:"Addis Ababa", continent:"Africa", flag:"🇪🇹", currency:"ETB", pop:"120M" },
  { name:"Egypt", capital:"Cairo", continent:"Africa", flag:"🇪🇬", currency:"EGP", pop:"105M" },
  { name:"United States", capital:"Washington D.C.", continent:"N. America", flag:"🇺🇸", currency:"USD", pop:"335M" },
  { name:"Brazil", capital:"Brasília", continent:"S. America", flag:"🇧🇷", currency:"BRL", pop:"215M" },
  { name:"Mexico", capital:"Mexico City", continent:"N. America", flag:"🇲🇽", currency:"MXN", pop:"130M" },
  { name:"Canada", capital:"Ottawa", continent:"N. America", flag:"🇨🇦", currency:"CAD", pop:"39M" },
  { name:"United Kingdom", capital:"London", continent:"Europe", flag:"🇬🇧", currency:"GBP", pop:"67M" },
  { name:"Germany", capital:"Berlin", continent:"Europe", flag:"🇩🇪", currency:"EUR", pop:"84M" },
  { name:"France", capital:"Paris", continent:"Europe", flag:"🇫🇷", currency:"EUR", pop:"68M" },
  { name:"Italy", capital:"Rome", continent:"Europe", flag:"🇮🇹", currency:"EUR", pop:"60M" },
  { name:"Spain", capital:"Madrid", continent:"Europe", flag:"🇪🇸", currency:"EUR", pop:"47M" },
  { name:"Russia", capital:"Moscow", continent:"Europe/Asia", flag:"🇷🇺", currency:"RUB", pop:"144M" },
  { name:"China", capital:"Beijing", continent:"Asia", flag:"🇨🇳", currency:"CNY", pop:"1.4B" },
  { name:"India", capital:"New Delhi", continent:"Asia", flag:"🇮🇳", currency:"INR", pop:"1.4B" },
  { name:"Japan", capital:"Tokyo", continent:"Asia", flag:"🇯🇵", currency:"JPY", pop:"125M" },
  { name:"South Korea", capital:"Seoul", continent:"Asia", flag:"🇰🇷", currency:"KRW", pop:"52M" },
  { name:"Indonesia", capital:"Jakarta", continent:"Asia", flag:"🇮🇩", currency:"IDR", pop:"275M" },
  { name:"Pakistan", capital:"Islamabad", continent:"Asia", flag:"🇵🇰", currency:"PKR", pop:"230M" },
  { name:"Australia", capital:"Canberra", continent:"Oceania", flag:"🇦🇺", currency:"AUD", pop:"26M" },
  { name:"New Zealand", capital:"Wellington", continent:"Oceania", flag:"🇳🇿", currency:"NZD", pop:"5M" },
  { name:"Saudi Arabia", capital:"Riyadh", continent:"Asia", flag:"🇸🇦", currency:"SAR", pop:"36M" },
  { name:"UAE", capital:"Abu Dhabi", continent:"Asia", flag:"🇦🇪", currency:"AED", pop:"10M" },
  { name:"Turkey", capital:"Ankara", continent:"Europe/Asia", flag:"🇹🇷", currency:"TRY", pop:"85M" },
  { name:"Argentina", capital:"Buenos Aires", continent:"S. America", flag:"🇦🇷", currency:"ARS", pop:"46M" },
  { name:"Colombia", capital:"Bogotá", continent:"S. America", flag:"🇨🇴", currency:"COP", pop:"51M" },
  { name:"Tanzania", capital:"Dodoma", continent:"Africa", flag:"🇹🇿", currency:"TZS", pop:"63M" },
];

const RANDOM_WORDS = ["serendipity","ephemeral","luminous","melancholy","sonder","aurora","cascade","labyrinth","whimsical","solitude","zenith","velvet","horizon","mystique","tranquil","radiant","obscure","pristine","vivid","eloquent","ethereal","cryptic","resilience","nostalgia","wanderlust","paradox","infinite","serene","jubilant","intricate","profound","celestial","enigmatic","iridescent","azure","cascade","lullaby","mosaic","opaque","synergy","tenacious","ubiquitous","vivacious","wistful","xenial","yearning","zeal","ambiguous","bliss","cathartic","daunting","effervescent","fleeting","graceful","halcyon","idyllic","jovial","kinetic","languid","meticulous","nonchalant","oblivious","placid","quaint","raucous","sublime","temerity","uncanny","valiant","whimsical","xenophile","yonder","zealous"];

const NATO = {a:"Alpha",b:"Bravo",c:"Charlie",d:"Delta",e:"Echo",f:"Foxtrot",g:"Golf",h:"Hotel",i:"India",j:"Juliet",k:"Kilo",l:"Lima",m:"Mike",n:"November",o:"Oscar",p:"Papa",q:"Quebec",r:"Romeo",s:"Sierra",t:"Tango",u:"Uniform",v:"Victor",w:"Whiskey",x:"X-ray",y:"Yankee",z:"Zulu","0":"Zero","1":"One","2":"Two","3":"Three","4":"Four","5":"Five","6":"Six","7":"Seven","8":"Eight","9":"Nine"};

const LEET = {a:"4",e:"3",g:"9",i:"1",l:"1",o:"0",s:"5",t:"7",z:"2",b:"8",A:"4",E:"3",G:"9",I:"1",L:"1",O:"0",S:"5",T:"7",Z:"2",B:"8"};

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function randomHex() {
  return "#" + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, "0").toUpperCase();
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return { r, g, b };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const commands = [
  {
    name: ["randomname", "genname", "fakename"],
    category: "fun",
    desc: "Generate a random name",
    handler: async (sock, m, { text }) => {
      const gender = (text || "").toLowerCase();
      let first;
      if (gender.startsWith("m")) {
        first = FIRST_NAMES_M[randomInt(0, FIRST_NAMES_M.length - 1)];
      } else if (gender.startsWith("f")) {
        first = FIRST_NAMES_F[randomInt(0, FIRST_NAMES_F.length - 1)];
      } else {
        const pool = Math.random() > 0.5 ? FIRST_NAMES_M : FIRST_NAMES_F;
        first = pool[randomInt(0, pool.length - 1)];
      }
      const last = LAST_NAMES[randomInt(0, LAST_NAMES.length - 1)];
      const initials = `${first[0]}.${last[0]}.`;
      return m.reply(`👤 *Random Name*\n\n*Full name:* ${first} ${last}\n*Initials:* ${initials}\n\n_Try: ${config.PREFIX}randomname male/female_
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
    },
  },
  {
    name: ["randomword", "randword", "wordgen"],
    category: "fun",
    desc: "Get a random interesting English word",
    handler: async (sock, m, { text }) => {
      let word = null;
      let definition = null;
      try {
        const res = await fetchJson("https://random-word-api.vercel.app/api?words=1", { timeout: 8000 });
        word = Array.isArray(res) ? res[0] : null;
      } catch {}
      if (!word) {
        word = RANDOM_WORDS[randomInt(0, RANDOM_WORDS.length - 1)];
      }
      try {
        const dict = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, { timeout: 8000 });
        const meanings = dict?.[0]?.meanings?.[0];
        definition = meanings?.definitions?.[0]?.definition;
      } catch {}
      let msg = `📖 *Random Word*\n\n*Word:* ${word}\n`;
      if (definition) msg += `*Meaning:* ${definition}\n`;
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["randomcountry", "randcountry"],
    category: "fun",
    desc: "Get a random country with facts",
    handler: async (sock, m, { text }) => {
      const c = COUNTRIES[randomInt(0, COUNTRIES.length - 1)];
      let msg = `🌍 *Random Country*\n\n`;
      msg += `${c.flag} *${c.name}*\n`;
      msg += `🏛️ Capital: ${c.capital}\n`;
      msg += `🌎 Continent: ${c.continent}\n`;
      msg += `💰 Currency: ${c.currency}\n`;
      msg += `👥 Population: ~${c.pop}\n`;
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["randomcolor", "randcolor", "colorgen"],
    category: "fun",
    desc: "Generate a random color with hex, RGB, HSL",
    handler: async (sock, m, { text }) => {
      const hex = randomHex();
      const { r, g, b } = hexToRgb(hex);
      const { h, s, l } = rgbToHsl(r, g, b);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      const isDark = brightness < 128;
      let msg = `🎨 *Random Color*\n\n`;
      msg += `🔑 HEX:  \`${hex}\`\n`;
      msg += `🔴 RGB:  rgb(${r}, ${g}, ${b})\n`;
      msg += `🌈 HSL:  hsl(${h}°, ${s}%, ${l}%)\n`;
      msg += `💡 Tone: ${isDark ? "Dark" : "Light"}\n`;
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["token", "gentoken", "apikey"],
    category: "tools",
    desc: "Generate a random secure token/API key",
    handler: async (sock, m, { text }) => {
      const len = Math.min(128, Math.max(8, parseInt(text) || 32));
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const hex = "0123456789abcdef";
      const token = Array.from({ length: len }, () => chars[randomInt(0, chars.length - 1)]).join("");
      const hexToken = Array.from({ length: len }, () => hex[randomInt(0, 15)]).join("");
      const b64 = Buffer.from(token).toString("base64").slice(0, len);
      let msg = `🔑 *Secure Token Generator*\n\n`;
      msg += `*Alphanumeric (${len}):*\n\`${token}\`\n\n`;
      msg += `*Hex (${len}):*\n\`${hexToken}\`\n\n`;
      msg += `*Base64:*\n\`${b64}\`\n\n`;
      msg += `_Try: ${config.PREFIX}token 64 for a longer key_
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["luckynumber", "lucky", "luckynum"],
    category: "fun",
    desc: "Get your lucky numbers for today",
    handler: async (sock, m, { text }) => {
      const seed = new Date().toDateString() + (m.sender || "");
      let hash = 0;
      for (const c of seed) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
      const nums = new Set();
      let n = Math.abs(hash);
      while (nums.size < 6) {
        nums.add((n % 49) + 1);
        n = ((n * 1664525) + 1013904223) | 0;
        n = Math.abs(n);
      }
      const sorted = [...nums].sort((a, b) => a - b);
      const lotto = [...nums].sort((a, b) => a - b).join(" - ");
      const powerball = (Math.abs(n) % 26) + 1;
      let msg = `🍀 *Lucky Numbers for Today*\n\n`;
      msg += `🎰 Main numbers: *${lotto}*\n`;
      msg += `🔴 Power number: *${powerball}*\n\n`;
      msg += `🌟 Today's lucky number: *${sorted[0]}*\n`;
      msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
      return m.reply(msg);
    },
  },
  {
    name: ["leetspeak", "leet", "l33t"],
    category: "fun",
    desc: "Convert text to l33t speak",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("leet <text>");
      const result = text.split("").map(c => LEET[c] || c).join("");
      return m.reply(`😎 *L33t Speak*\n\nOriginal: ${text}\nL33t:     ${result}\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
    },
  },
  {
    name: ["nato", "phonetic", "natoalphabet"],
    category: "tools",
    desc: "Convert text to NATO phonetic alphabet",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("nato <text>", "nato hello");
      const result = text.toLowerCase().split("").map(c => {
        if (c === " ") return "[space]";
        return NATO[c] ? `*${NATO[c]}*` : c.toUpperCase();
      }).join(" - ");
      return m.reply(`📻 *NATO Phonetic*\n\n${text.toUpperCase()}\n\n${result}\n
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
    },
  },
  {
    name: ["slang", "urbandictionary", "ud"],
    category: "tools",
    desc: "Look up internet slang or slang words",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("slang <word>", "slang bussin");
      m.react("⏳");
      try {
        const data = await fetchJson(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(text)}`, { timeout: 10000 });
        const entry = data?.list?.[0];
        if (!entry) { m.react("❌"); return m.reply(`❌ No definition found for "*${text}*".`); }
        const def = (entry.definition || "").replace(/\[|\]/g, "").slice(0, 400);
        const ex = (entry.example || "").replace(/\[|\]/g, "").slice(0, 200);
        let msg = `📚 *${entry.word}*\n\n`;
        msg += `📖 *Definition:*\n${def}${entry.definition?.length > 400 ? "..." : ""}\n`;
        if (ex) msg += `\n💬 *Example:*\n_${ex}_\n`;
        msg += `\n👍 ${entry.thumbs_up} | 👎 ${entry.thumbs_down}\n`;
        msg += `_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Could not reach Urban Dictionary.");
      }
    },
  },
  {
    name: ["httpcode", "httpstatus", "statuscode"],
    category: "tools",
    desc: "Look up an HTTP status code meaning",
    handler: async (sock, m, { text }) => {
      const codes = {
        100:"Continue",101:"Switching Protocols",102:"Processing",
        200:"OK",201:"Created",202:"Accepted",204:"No Content",206:"Partial Content",
        301:"Moved Permanently",302:"Found",304:"Not Modified",307:"Temporary Redirect",308:"Permanent Redirect",
        400:"Bad Request",401:"Unauthorized",403:"Forbidden",404:"Not Found",405:"Method Not Allowed",408:"Request Timeout",409:"Conflict",410:"Gone",413:"Payload Too Large",414:"URI Too Long",415:"Unsupported Media Type",422:"Unprocessable Entity",429:"Too Many Requests",
        500:"Internal Server Error",501:"Not Implemented",502:"Bad Gateway",503:"Service Unavailable",504:"Gateway Timeout",
      };
      const desc = {
        200:"The request succeeded.", 201:"A new resource was created.", 204:"The server fulfilled the request but there's no content to return.",
        400:"The server cannot process the request due to client error (bad syntax).", 401:"Authentication is required and has failed or not been provided.", 403:"The server understood the request but refuses to authorize it.", 404:"The requested resource could not be found.", 405:"The HTTP method is not supported for this endpoint.", 408:"The server timed out waiting for the request.", 429:"Too many requests in a given time — rate limited.", 500:"Unexpected server error.", 502:"The server received an invalid response from an upstream server.", 503:"The server is temporarily unavailable (overloaded or down).", 504:"The upstream server did not respond in time.",
      };
      const code = parseInt(text);
      const cat = { 1:"ℹ️ Informational", 2:"✅ Success", 3:"↪️ Redirection", 4:"❌ Client Error", 5:"💥 Server Error" };
      if (isNaN(code) || code < 100 || code > 599) return m.usageReply("httpcode <status code>", "httpcode 404");
      const name = codes[code] || "Unknown";
      const detail = desc[code] || "";
      const category = cat[Math.floor(code / 100)] || "";
      return m.reply(`🌐 *HTTP ${code} — ${name}*\n\n${category}\n${detail ? `\n📝 ${detail}\n` : ""}
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`);
    },
  },
  {
    name: ["nameinfo", "namemeaning", "myname"],
    category: "tools",
    desc: "Get meaning and origin of a name",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("nameinfo <name>", "nameinfo Sophia");
      m.react("⏳");
      try {
        const data = await fetchJson(`https://api.genderize.io/?name=${encodeURIComponent(text)}`, { timeout: 8000 });
        const nation = await fetchJson(`https://api.nationalize.io/?name=${encodeURIComponent(text)}`, { timeout: 8000 });
        const gender = data?.gender ? `${data.gender.charAt(0).toUpperCase() + data.gender.slice(1)} (${Math.round((data.probability || 0) * 100)}% probability)` : "Unknown";
        const topNation = nation?.country?.[0];
        let msg = `👤 *Name: ${text}*\n\n`;
        msg += `⚧ Gender: ${gender}\n`;
        if (topNation) msg += `🌍 Most common in: ${topNation.country_id} (${Math.round((topNation.probability || 0) * 100)}%)\n`;
        msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Could not fetch name info.");
      }
    },
  },
  {
    name: ["emojimix2", "emojiinfo", "whatemoji"],
    category: "fun",
    desc: "Look up the meaning of an emoji",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("emojiinfo <emoji>", "emojiinfo 🔥");
      try {
        const chars = [...text];
        const emoji = chars[0];
        if (!emoji) return m.reply("❌ Please send a valid emoji.");
        const codepoint = emoji.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0");
        const decimal = emoji.codePointAt(0);
        const htmlCode = `&#${decimal};`;

        let emojiName = null;
        try {
          const data = await fetchJson(`https://emojihub.yurace.pro/api/all`, { timeout: 10000 });
          if (Array.isArray(data)) {
            const found = data.find(e => e.unicode?.some(u => u.replace("U+", "").toUpperCase() === codepoint));
            if (found?.name) emojiName = found.name;
          }
        } catch {}

        let msg = `${emoji} *Emoji Info*\n\n`;
        if (emojiName) msg += `📛 Name: ${emojiName}\n`;
        msg += `🔣 Emoji: ${emoji}\n`;
        msg += `🔑 Unicode: U+${codepoint}\n`;
        msg += `💻 HTML: ${htmlCode}\n`;
        if (chars.length > 1) msg += `🔗 Sequence: ${chars.length} characters\n`;
        msg += `\n────────────────────────────────\n_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Could not get emoji info.");
      }
    },
  },
  {
    name: ["capital", "countrycapital"],
    category: "tools",
    desc: "Get the capital city of a country",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("capital <country name>", "capital France");
      m.react("⏳");
      try {
        const data = await fetchJson(`https://restcountries.com/v3.1/name/${encodeURIComponent(text)}?fields=name,capital,flags,currencies,population,region`, { timeout: 10000 });
        const country = Array.isArray(data) ? data[0] : data;
        if (!country?.name) { m.react("❌"); return m.reply(`❌ Country "${text}" not found.`); }
        const capital = (country.capital || [])[0] || "N/A";
        const currencies = Object.values(country.currencies || {}).map(c => `${c.name} (${c.symbol || ""})`).join(", ") || "N/A";
        const pop = country.population ? `${(country.population / 1e6).toFixed(1)}M` : "N/A";
        let msg = `🏛️ *${country.name.common}*\n\n`;
        msg += `🏙️ Capital: *${capital}*\n`;
        msg += `🌍 Region: ${country.region || "N/A"}\n`;
        msg += `👥 Population: ${pop}\n`;
        msg += `💰 Currency: ${currencies}\n`;
        msg += `
────────────────────────────────
_${config.BOT_NAME} · Desam Tech_ ⚡`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply(`❌ Country "${text}" not found.`);
      }
    },
  },
];

module.exports = { commands };
