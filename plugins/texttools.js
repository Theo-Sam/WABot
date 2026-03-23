const config = require("../config");

const MORSE = {
  a:".-",b:"-...",c:"-.-.",d:"-..",e:".",f:"..-.",g:"--.",h:"....",i:"..",j:".---",k:"-.-",
  l:".-..",m:"--",n:"-.",o:"---",p:".--.",q:"--.-",r:".-.",s:"...",t:"-",u:"..-",v:"...-",
  w:".--",x:"-..-",y:"-.--",z:"--..",
  "0":"-----","1":".----","2":"..---","3":"...--","4":"....-","5":".....",
  "6":"-....","7":"--...","8":"---..","9":"----.",".":".-.-.-",",":"--..--",
  "?":"..--..","!":"-.-.--","/":"-..-.","(":"-.--.",")":"-.--.-",
  "&":".-...",":":"---...",";":"-.-.-.","=":"-...-","+":".-.-.","-":"-....-",
  "_":"..--.-","\"":".-..-.","$":"...-..-","@":".--.-.","'":".----."
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

const FLIP_MAP = {
  a:"ɐ",b:"q",c:"ɔ",d:"p",e:"ǝ",f:"ɟ",g:"ƃ",h:"ɥ",i:"ᴉ",j:"ɾ",k:"ʞ",l:"l",
  m:"ɯ",n:"u",o:"o",p:"d",q:"b",r:"ɹ",s:"s",t:"ʇ",u:"n",v:"ʌ",w:"ʍ",x:"x",
  y:"ʎ",z:"z",A:"∀",B:"ᗺ",C:"Ɔ",D:"ᗡ",E:"Ǝ",F:"Ⅎ",G:"פ",H:"H",I:"I",
  J:"ſ",K:"ʞ",L:"⅂",M:"W",N:"N",O:"O",P:"Ԁ",Q:"Q",R:"ᴚ",S:"S",T:"⊥",
  U:"∩",V:"Λ",W:"M",X:"X",Y:"⅄",Z:"Z",
  "0":"0","1":"Ɩ","2":"ᄅ","3":"Ɛ","4":"ᔭ","5":"ϛ","6":"9","7":"L","8":"8","9":"6",
  ".":"˙",",":"'","?":"¿","!":"¡","(":")",")":"(","[":"]","]":"[","<":">",">":"<",
  "'":"‚",'"':",,","&":"⅋","_":"‾"
};

function textToMorse(text) {
  return text.toLowerCase().split("").map(c => {
    if (c === " ") return "/";
    return MORSE[c] || c;
  }).join(" ");
}

function morseToText(morse) {
  return morse.trim().split(" / ").map(word =>
    word.split(" ").map(code => MORSE_REV[code] || code).join("")
  ).join(" ");
}

function textToBinary(text) {
  return text.split("").map(c => c.charCodeAt(0).toString(2).padStart(8, "0")).join(" ");
}

function binaryToText(binary) {
  return binary.trim().split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join("");
}

function textToHex(text) {
  return text.split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
}

function hexToText(hex) {
  return hex.trim().split(/\s+/).map(h => String.fromCharCode(parseInt(h, 16))).join("");
}

function toRoman(num) {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
  let result = "";
  for (let i = 0; i < vals.length; i++) {
    while (num >= vals[i]) { result += syms[i]; num -= vals[i]; }
  }
  return result;
}

function fromRoman(roman) {
  const map = {I:1,V:5,X:10,L:50,C:100,D:500,M:1000};
  let result = 0;
  const r = roman.toUpperCase();
  for (let i = 0; i < r.length; i++) {
    const cur = map[r[i]] || 0;
    const next = map[r[i+1]] || 0;
    result += cur < next ? -cur : cur;
  }
  return result;
}

function caesar(text, shift) {
  shift = ((shift % 26) + 26) % 26;
  return text.split("").map(c => {
    if (/[a-z]/.test(c)) return String.fromCharCode(((c.charCodeAt(0) - 97 + shift) % 26) + 97);
    if (/[A-Z]/.test(c)) return String.fromCharCode(((c.charCodeAt(0) - 65 + shift) % 26) + 65);
    return c;
  }).join("");
}

function flipText(text) {
  return text.split("").map(c => FLIP_MAP[c] || c).reverse().join("");
}

function zalgo(text, intensity = 2) {
  const above = ["\u030d","\u030e","\u0304","\u0305","\u033f","\u0311","\u0306","\u0310","\u0352","\u0357","\u0351","\u0307","\u0308","\u030a","\u0342","\u0343","\u0344","\u034a","\u034b","\u034c","\u0303","\u0302","\u030c","\u0350","\u0300","\u0301","\u030b","\u030f","\u0312","\u0313","\u0314","\u033d","\u0309","\u0363","\u0364","\u0365","\u0366","\u0367","\u0368","\u0369","\u036a","\u036b","\u036c","\u036d","\u036e","\u036f","\u033e","\u035b"];
  const below = ["\u0316","\u0317","\u0318","\u0319","\u031c","\u031d","\u031e","\u031f","\u0320","\u0324","\u0325","\u0326","\u0329","\u032a","\u032b","\u032c","\u032d","\u032e","\u032f","\u0330","\u0331","\u0332","\u0333","\u0339","\u033a","\u033b","\u033c","\u0345","\u0347","\u0348","\u0349","\u034d","\u034e","\u0353","\u0354","\u0355","\u0356","\u0359","\u035a","\u0323"];
  const rand = arr => arr[Math.floor(Math.random() * arr.length)];
  return text.split("").map(c => {
    let result = c;
    for (let i = 0; i < intensity; i++) result += rand(above);
    for (let i = 0; i < intensity; i++) result += rand(below);
    return result;
  }).join("");
}

function smallCaps(text) {
  const map = {a:"ᴀ",b:"ʙ",c:"ᴄ",d:"ᴅ",e:"ᴇ",f:"ꜰ",g:"ɢ",h:"ʜ",i:"ɪ",j:"ᴊ",k:"ᴋ",l:"ʟ",m:"ᴍ",n:"ɴ",o:"ᴏ",p:"ᴘ",q:"Q",r:"ʀ",s:"ꜱ",t:"ᴛ",u:"ᴜ",v:"ᴠ",w:"ᴡ",x:"x",y:"ʏ",z:"ᴢ"};
  return text.split("").map(c => map[c.toLowerCase()] || c).join("");
}

function strikethrough(text) {
  return text.split("").join("\u0336");
}

function isPalindrome(text) {
  const clean = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean === clean.split("").reverse().join("");
}

function getAnagram(text) {
  const chars = text.toLowerCase().replace(/\s/g, "").split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function lorem(count = 1) {
  const sentences = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
    "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.",
    "Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia.",
    "Nulla pariatur laboris nisi ut aliquip ex ea commodo consequat.",
    "Quis autem vel eum iure reprehenderit qui in ea voluptate velit.",
    "Nam libero tempore cum soluta nobis est eligendi optio cumque.",
    "Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus.",
    "Itaque earum rerum hic tenetur a sapiente delectus ut aut reiciendis.",
    "At vero eos et accusamus et iusto odio dignissimos ducimus.",
    "Nam libero tempore cum soluta nobis eligendi optio cumque nihil.",
    "Quis nostrum exercitationem ullam corporis suscipit laboriosam.",
    "Neque porro quisquam est qui dolorem ipsum quia dolor sit amet.",
    "Ut labore et dolore magnam aliquam quaerat voluptatem.",
  ];
  const result = [];
  for (let i = 0; i < Math.min(count, 10); i++) {
    result.push(sentences[i % sentences.length]);
  }
  return result.join(" ");
}

const commands = [
  {
    name: ["morse", "morsecode"],
    category: "tools",
    desc: "Convert text to/from Morse code",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("morse encode/decode <text>", "morse encode hello world", ["morsecode"], "Use *encode* or *decode* as first word");
      const [mode, ...rest] = text.split(" ");
      const input = rest.join(" ");
      if (!input) return m.usageReply("morse encode/decode <text>", "morse encode hello world", ["morsecode"], "Use *encode* or *decode* as first word");
      if (mode.toLowerCase() === "decode") {
        const result = morseToText(input);
        return m.reply(`📡 *Morse → Text*\n\n*Input:* ${input}\n*Output:* ${result}`);
      }
      const result = textToMorse(input);
      return m.reply(`📡 *Text → Morse*\n\n*Input:* ${input}\n*Output:* ${result}`);
    },
  },
  {
    name: ["binary", "bin"],
    category: "tools",
    desc: "Convert text to/from binary",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("binary encode/decode <text>", "binary encode hello", ["bin"], "Use *encode* or *decode* as first word");
      const [mode, ...rest] = text.split(" ");
      const input = rest.join(" ");
      if (!input) return m.usageReply("binary encode/decode <text>", "binary encode hello", ["bin"], "Use *encode* or *decode* as first word");
      if (mode.toLowerCase() === "decode") {
        try {
          const result = binaryToText(input);
          return m.reply(`💻 *Binary → Text*\n\n*Input:* ${input}\n*Output:* ${result}`);
        } catch {
          return m.reply("❌ Invalid binary input.");
        }
      }
      const result = textToBinary(input);
      return m.reply(`💻 *Text → Binary*\n\n*Input:* ${input}\n*Output:* ${result}`);
    },
  },
  {
    name: ["hex", "hexcode"],
    category: "tools",
    desc: "Convert text to/from hexadecimal",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("hex encode/decode <text>", "hex encode hello", ["hexcode"], "Use *encode* or *decode* as first word");
      const [mode, ...rest] = text.split(" ");
      const input = rest.join(" ");
      if (!input) return m.usageReply("hex encode/decode <text>", "hex encode hello", ["hexcode"], "Use *encode* or *decode* as first word");
      if (mode.toLowerCase() === "decode") {
        try {
          const result = hexToText(input);
          return m.reply(`🔢 *Hex → Text*\n\n*Input:* ${input}\n*Output:* ${result}`);
        } catch {
          return m.reply("❌ Invalid hex input.");
        }
      }
      const result = textToHex(input);
      return m.reply(`🔢 *Text → Hex*\n\n*Input:* ${input}\n*Output:* ${result}`);
    },
  },
  {
    name: ["roman", "romannumeral"],
    category: "tools",
    desc: "Convert numbers to/from Roman numerals",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("roman <number or Roman numeral>");
      const input = text.trim();
      if (/^\d+$/.test(input)) {
        const num = parseInt(input);
        if (num < 1 || num > 3999) return m.reply("❌ Number must be between 1 and 3999.");
        return m.reply(`🏛️ *Roman Numerals*\n\n${num} → *${toRoman(num)}*`);
      }
      if (/^[MDCLXVI]+$/i.test(input)) {
        const result = fromRoman(input);
        return m.reply(`🏛️ *Roman Numerals*\n\n${input.toUpperCase()} → *${result}*`);
      }
      return m.reply("❌ Please enter a number (1-3999) or a Roman numeral (e.g. XIV).");
    },
  },
  {
    name: ["caesar", "caesarcipher"],
    category: "tools",
    desc: "Encode/decode text with Caesar cipher",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("caesar <shift> <text>", "caesar 3 hello");
      const parts = text.split(" ");
      const shift = parseInt(parts[0]);
      const message = parts.slice(1).join(" ");
      if (isNaN(shift) || !message) return m.usageReply("caesar <shift> <text>", "caesar 3 hello");
      const encoded = caesar(message, shift);
      const decoded = caesar(message, -shift);
      return m.reply(`🔐 *Caesar Cipher (shift ${shift})*\n\n*Original:* ${message}\n*Encoded (+${shift}):* ${encoded}\n*Decoded (-${shift}):* ${decoded}`);
    },
  },
  {
    name: ["lorem", "loremipsum", "placeholder"],
    category: "tools",
    desc: "Generate lorem ipsum placeholder text",
    handler: async (sock, m, { text }) => {
      const count = Math.max(1, Math.min(10, parseInt(text) || 3));
      const result = lorem(count);
      return m.reply(`📝 *Lorem Ipsum (${count} sentence${count > 1 ? "s" : ""})*\n\n${result}`);
    },
  },
  {
    name: ["fliptext", "upsidedown"],
    category: "tools",
    desc: "Flip text upside down",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("fliptext <text>");
      const result = flipText(text);
      return m.reply(`🙃 *Flipped Text*\n\n${result}`);
    },
  },
  {
    name: ["zalgo", "glitch", "creepy"],
    category: "tools",
    desc: "Make text glitchy/creepy (Zalgo effect)",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("zalgo <text>");
      const intensity = Math.min(5, Math.max(1, parseInt(text.split(" ")[0]) || 2));
      const msg = isNaN(parseInt(text.split(" ")[0])) ? text : text.split(" ").slice(1).join(" ");
      if (!msg) return m.usageReply("zalgo <text> or ${config.PREFIX}zalgo <intensity 1-5> <text>");
      const result = zalgo(msg, intensity);
      return m.reply(`👁️ *Zalgo Text*\n\n${result}`);
    },
  },
  {
    name: ["smallcaps", "sc2"],
    category: "tools",
    desc: "Convert text to small caps",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("smallcaps <text>");
      return m.reply(`🔠 *Small Caps*\n\n${smallCaps(text)}`);
    },
  },
  {
    name: ["strike", "strikethrough"],
    category: "tools",
    desc: "Add strikethrough to text",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("strike <text>");
      return m.reply(`~~Text~~\n\n${strikethrough(text)}`);
    },
  },
  {
    name: ["anagram"],
    category: "tools",
    desc: "Scramble letters to make an anagram",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("anagram <word or phrase>");
      const result = getAnagram(text);
      return m.reply(`🔀 *Anagram*\n\n*Original:* ${text}\n*Scrambled:* ${result}`);
    },
  },
  {
    name: ["palindrome", "ispalindrome"],
    category: "tools",
    desc: "Check if text is a palindrome",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("palindrome <text>");
      const result = isPalindrome(text);
      const clean = text.toLowerCase().replace(/[^a-z0-9]/g, "");
      return m.reply(`🔁 *Palindrome Check*\n\n*Text:* ${text}\n*Cleaned:* ${clean}\n*Result:* ${result ? "✅ Yes, it's a palindrome!" : "❌ Not a palindrome."}`);
    },
  },
  {
    name: ["numbertowords", "n2w", "numwords"],
    category: "tools",
    desc: "Convert a number to words",
    handler: async (sock, m, { text }) => {
      if (!text || isNaN(text.trim())) return m.usageReply("n2w <number>", "n2w 1234");
      const num = parseInt(text.trim());
      if (num < 0 || num > 999999999) return m.reply("❌ Number must be between 0 and 999,999,999.");
      const ones = ["","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
      const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
      function say(n) {
        if (n === 0) return "zero";
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n/10)] + (n % 10 ? "-" + ones[n % 10] : "");
        if (n < 1000) return ones[Math.floor(n/100)] + " hundred" + (n % 100 ? " " + say(n % 100) : "");
        if (n < 1000000) return say(Math.floor(n/1000)) + " thousand" + (n % 1000 ? " " + say(n % 1000) : "");
        return say(Math.floor(n/1000000)) + " million" + (n % 1000000 ? " " + say(n % 1000000) : "");
      }
      return m.reply(`🔢 *Number to Words*\n\n*Number:* ${num.toLocaleString()}\n*Words:* ${say(num)}`);
    },
  },
];

module.exports = { commands };
