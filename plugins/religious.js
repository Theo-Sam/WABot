const config = require("../config");
const { fetchJson, pickNonRepeating } = require("../lib/helpers");

// ── Translation sets ──────────────────────────────────────────────────────────
// Versions served directly by bible-api.com (public domain)
const BIBLE_API_VERSIONS = new Set(["kjv", "web", "bbe", "asv", "darby", "youngs"]);
// NIV and NET (served by labs.bible.org — NET is the closest free modern equiv.)
const NIV_VERSIONS = new Set(["niv", "net"]);
// Ghanaian language bibles (loaded from GitHub CDN, cached in memory)
const GHANAIAN_VERSIONS = new Set(["twi", "ewe"]);

// KJV is first (primary), NIV second, WEB third
const DEFAULT_BIBLE_VERSIONS = ["kjv", "niv", "web"];

const VERSION_LABELS = {
  kjv: "King James Version (KJV)",
  niv: "New International Version (NIV) — NET Bible",
  net: "New English Translation (NET Bible)",
  web: "World English Bible (WEB)",
  bbe: "Bible in Basic English (BBE)",
  asv: "American Standard Version (ASV)",
  darby: "Darby Translation",
  youngs: "Young's Literal Translation (YLT)",
  twi: "Twi Bible 🇬🇭 (Akuapem Twi)",
  ewe: "Ewe Bible 🇬🇭",
};

const GHANAIAN_BIBLE_URLS = {
  twi: "https://raw.githubusercontent.com/codeDeSyntax/multi-language-bible-json-twi-json/main/twiBible.json",
  ewe: "https://raw.githubusercontent.com/codeDeSyntax/multi-language-bible-json-twi-json/main/eweBible.json",
};

// In-memory cache for Ghanaian bibles (persists across requests in same process)
const _ghanaianCache = new Map();
const _ghanaianLoading = new Map();

// ── Book name mapping ─────────────────────────────────────────────────────────
// Maps user abbreviations/aliases → canonical book name (as used in Ghanaian JSON files)
const BOOK_NAME_MAP = {
  genesis: "Genesis", gen: "Genesis", ge: "Genesis", gn: "Genesis",
  exodus: "Exodus", exod: "Exodus", ex: "Exodus", exo: "Exodus",
  leviticus: "Leviticus", lev: "Leviticus", le: "Leviticus", lv: "Leviticus",
  numbers: "Numbers", num: "Numbers", nu: "Numbers", nm: "Numbers",
  deuteronomy: "Deuteronomy", deut: "Deuteronomy", dt: "Deuteronomy", de: "Deuteronomy",
  joshua: "Joshua", josh: "Joshua", jos: "Joshua",
  judges: "Judges", judg: "Judges", jdg: "Judges", jg: "Judges",
  ruth: "Ruth", rut: "Ruth", ru: "Ruth",
  "1 samuel": "I Samuel", "1samuel": "I Samuel", "1 sam": "I Samuel", "1sam": "I Samuel", "1sa": "I Samuel", "i samuel": "I Samuel", "i sam": "I Samuel",
  "2 samuel": "II Samuel", "2samuel": "II Samuel", "2 sam": "II Samuel", "2sam": "II Samuel", "2sa": "II Samuel", "ii samuel": "II Samuel", "ii sam": "II Samuel",
  "1 kings": "I Kings", "1kings": "I Kings", "1 kgs": "I Kings", "1kgs": "I Kings", "1ki": "I Kings", "i kings": "I Kings",
  "2 kings": "II Kings", "2kings": "II Kings", "2 kgs": "II Kings", "2kgs": "II Kings", "2ki": "II Kings", "ii kings": "II Kings",
  "1 chronicles": "I Chronicles", "1chronicles": "I Chronicles", "1 chr": "I Chronicles", "1chr": "I Chronicles", "1ch": "I Chronicles", "i chronicles": "I Chronicles", "i chr": "I Chronicles",
  "2 chronicles": "II Chronicles", "2chronicles": "II Chronicles", "2 chr": "II Chronicles", "2chr": "II Chronicles", "2ch": "II Chronicles", "ii chronicles": "II Chronicles", "ii chr": "II Chronicles",
  ezra: "Ezra", ezr: "Ezra",
  nehemiah: "Nehemiah", neh: "Nehemiah", ne: "Nehemiah",
  esther: "Esther", esth: "Esther", est: "Esther", es: "Esther",
  job: "Job", jb: "Job",
  psalms: "Psalms", psalm: "Psalms", ps: "Psalms", psa: "Psalms", psm: "Psalms",
  proverbs: "Proverbs", prov: "Proverbs", pro: "Proverbs", prv: "Proverbs", pr: "Proverbs",
  ecclesiastes: "Ecclesiastes", eccl: "Ecclesiastes", ecc: "Ecclesiastes", ec: "Ecclesiastes", qoh: "Ecclesiastes",
  "song of solomon": "Song of Solomon", "song of songs": "Song of Solomon", song: "Song of Solomon", sos: "Song of Solomon", sg: "Song of Solomon", ss: "Song of Solomon", canticles: "Song of Solomon",
  isaiah: "Isaiah", isa: "Isaiah", is: "Isaiah",
  jeremiah: "Jeremiah", jer: "Jeremiah", je: "Jeremiah", jr: "Jeremiah",
  lamentations: "Lamentations", lam: "Lamentations", la: "Lamentations",
  ezekiel: "Ezekiel", ezek: "Ezekiel", eze: "Ezekiel", ezk: "Ezekiel",
  daniel: "Daniel", dan: "Daniel", da: "Daniel", dn: "Daniel",
  hosea: "Hosea", hos: "Hosea", ho: "Hosea",
  joel: "Joel", joe: "Joel", jl: "Joel",
  amos: "Amos",
  obadiah: "Obadiah", obad: "Obadiah", ob: "Obadiah",
  jonah: "Jonah", jon: "Jonah", jnh: "Jonah",
  micah: "Micah", mic: "Micah", mi: "Micah",
  nahum: "Nahum", nah: "Nahum", na: "Nahum",
  habakkuk: "Habakkuk", hab: "Habakkuk",
  zephaniah: "Zephaniah", zeph: "Zephaniah", zep: "Zephaniah",
  haggai: "Haggai", hag: "Haggai", hg: "Haggai",
  zechariah: "Zechariah", zech: "Zechariah", zec: "Zechariah",
  malachi: "Malachi", mal: "Malachi", ml: "Malachi",
  matthew: "Matthew", matt: "Matthew", mt: "Matthew",
  mark: "Mark", mar: "Mark", mrk: "Mark", mk: "Mark", mr: "Mark",
  luke: "Luke", luk: "Luke", lk: "Luke",
  john: "John", joh: "John", jn: "John", jhn: "John",
  acts: "Acts", act: "Acts", ac: "Acts",
  romans: "Romans", rom: "Romans", ro: "Romans", rm: "Romans",
  "1 corinthians": "I Corinthians", "1corinthians": "I Corinthians", "1 cor": "I Corinthians", "1cor": "I Corinthians", "1co": "I Corinthians", "i corinthians": "I Corinthians", "i cor": "I Corinthians",
  "2 corinthians": "II Corinthians", "2corinthians": "II Corinthians", "2 cor": "II Corinthians", "2cor": "II Corinthians", "2co": "II Corinthians", "ii corinthians": "II Corinthians", "ii cor": "II Corinthians",
  galatians: "Galatians", gal: "Galatians",
  ephesians: "Ephesians", eph: "Ephesians",
  philippians: "Philippians", phil: "Philippians", php: "Philippians", pp: "Philippians",
  colossians: "Colossians", col: "Colossians",
  "1 thessalonians": "I Thessalonians", "1thessalonians": "I Thessalonians", "1 thess": "I Thessalonians", "1thess": "I Thessalonians", "1th": "I Thessalonians", "i thessalonians": "I Thessalonians", "i thess": "I Thessalonians",
  "2 thessalonians": "II Thessalonians", "2thessalonians": "II Thessalonians", "2 thess": "II Thessalonians", "2thess": "II Thessalonians", "2th": "II Thessalonians", "ii thessalonians": "II Thessalonians", "ii thess": "II Thessalonians",
  "1 timothy": "I Timothy", "1timothy": "I Timothy", "1 tim": "I Timothy", "1tim": "I Timothy", "1ti": "I Timothy", "i timothy": "I Timothy", "i tim": "I Timothy",
  "2 timothy": "II Timothy", "2timothy": "II Timothy", "2 tim": "II Timothy", "2tim": "II Timothy", "2ti": "II Timothy", "ii timothy": "II Timothy", "ii tim": "II Timothy",
  titus: "Titus", tit: "Titus",
  philemon: "Philemon", phlm: "Philemon", phm: "Philemon", pm: "Philemon",
  hebrews: "Hebrews", heb: "Hebrews",
  james: "James", jas: "James", jm: "James",
  "1 peter": "I Peter", "1peter": "I Peter", "1 pet": "I Peter", "1pet": "I Peter", "1pe": "I Peter", "1pt": "I Peter", "i peter": "I Peter", "i pet": "I Peter",
  "2 peter": "II Peter", "2peter": "II Peter", "2 pet": "II Peter", "2pet": "II Peter", "2pe": "II Peter", "2pt": "II Peter", "ii peter": "II Peter", "ii pet": "II Peter",
  "1 john": "I John", "1john": "I John", "1 joh": "I John", "1joh": "I John", "1jn": "I John", "1jo": "I John", "i john": "I John",
  "2 john": "II John", "2john": "II John", "2 joh": "II John", "2joh": "II John", "2jn": "II John", "2jo": "II John", "ii john": "II John",
  "3 john": "III John", "3john": "III John", "3 joh": "III John", "3joh": "III John", "3jn": "III John", "3jo": "III John", "iii john": "III John",
  jude: "Jude", jud: "Jude",
  revelation: "Revelation", rev: "Revelation", re: "Revelation", rv: "Revelation", apoc: "Revelation",
};

function normalizeBookName(input) {
  const lower = String(input).trim().toLowerCase().replace(/\s+/g, " ");
  return BOOK_NAME_MAP[lower] || null;
}

/**
 * Parse a verse reference like "John 3:16", "1 Cor 13:4-7", "Psalm 23:1-6"
 * Returns { bookName, chapter, verseStart, verseEnd, label } or null.
 */
function parseVerseRef(text) {
  const clean = String(text).trim();
  const m = clean.match(/^((?:[123]|I{1,3}|II?I?)\.?\s+)?([a-zA-Z][a-zA-Z\s.]*?)\s+(\d+):(\d+)(?:-(\d+))?$/i);
  if (!m) return null;
  const prefix = (m[1] || "").trim().replace(/\.$/, "");
  const bookRaw = ((prefix ? prefix + " " : "") + m[2].trim()).replace(/\s+/g, " ");
  const bookName = normalizeBookName(bookRaw);
  if (!bookName) return null;
  const chapter = parseInt(m[3], 10);
  const verseStart = parseInt(m[4], 10);
  const verseEnd = m[5] ? parseInt(m[5], 10) : null;
  return {
    bookName,
    chapter,
    verseStart,
    verseEnd,
    label: `${bookName} ${chapter}:${verseStart}${verseEnd ? "-" + verseEnd : ""}`,
  };
}

// ── Ghanaian Bible loader with in-memory caching ──────────────────────────────
async function loadGhanaianBible(lang) {
  if (_ghanaianCache.has(lang)) return _ghanaianCache.get(lang);
  if (_ghanaianLoading.has(lang)) return _ghanaianLoading.get(lang);

  const promise = (async () => {
    const url = GHANAIAN_BIBLE_URLS[lang];
    if (!url) return null;
    const data = await fetchJson(url).catch(() => null);
    if (!data?.books || !Array.isArray(data.books)) return null;

    const index = new Map();
    for (const book of data.books) {
      const bookName = book.name;
      for (const ch of book.chapters || []) {
        for (const v of ch.verses || []) {
          index.set(`${bookName}|${ch.chapter}|${v.verse}`, v.text || "");
        }
      }
    }
    const result = { index, langName: VERSION_LABELS[lang] || lang.toUpperCase() };
    _ghanaianCache.set(lang, result);
    _ghanaianLoading.delete(lang);
    return result;
  })();

  _ghanaianLoading.set(lang, promise);
  return promise;
}

async function lookupGhanaianVerse(lang, parsed) {
  const bible = await loadGhanaianBible(lang);
  if (!bible) return null;
  const { bookName, chapter, verseStart, verseEnd } = parsed;

  if (verseEnd && verseEnd > verseStart) {
    const parts = [];
    for (let v = verseStart; v <= verseEnd; v++) {
      const text = bible.index.get(`${bookName}|${String(chapter)}|${String(v)}`);
      if (text) parts.push(`${v}. ${text.trim()}`);
    }
    if (!parts.length) return null;
    return { text: parts.join(" "), reference: `${bookName} ${chapter}:${verseStart}-${verseEnd}`, translation_name: bible.langName };
  } else {
    const text = bible.index.get(`${bookName}|${String(chapter)}|${String(verseStart)}`);
    if (!text) return null;
    return { text: text.trim(), reference: `${bookName} ${chapter}:${verseStart}`, translation_name: bible.langName };
  }
}

// ── Unified verse fetcher ─────────────────────────────────────────────────────
async function fetchBibleVerse(version, reference, parsed) {
  try {
    if (BIBLE_API_VERSIONS.has(version)) {
      const data = await fetchJson(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`).catch(() => null);
      if (!data?.text) return null;
      return {
        version,
        text: String(data.text).trim(),
        reference: data.reference || reference,
        translation_name: VERSION_LABELS[version] || version.toUpperCase(),
      };
    }

    if (NIV_VERSIONS.has(version)) {
      const data = await fetchJson(`https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&type=json`).catch(() => null);
      if (!Array.isArray(data) || !data.length) return null;
      const first = data[0];
      const last = data[data.length - 1];
      const refLabel = data.length === 1
        ? `${first.bookname} ${first.chapter}:${first.verse}`
        : `${first.bookname} ${first.chapter}:${first.verse}-${last.verse}`;
      const text = data.length === 1
        ? first.text.trim()
        : data.map(v => `${v.verse}. ${v.text.trim()}`).join(" ");
      return { version, text, reference: refLabel, translation_name: VERSION_LABELS[version] || "NIV / NET Bible" };
    }

    if (GHANAIAN_VERSIONS.has(version)) {
      if (!parsed) return null;
      const result = await lookupGhanaianVerse(version, parsed);
      if (!result) return null;
      return { version, text: result.text, reference: result.reference, translation_name: result.translation_name };
    }

    return null;
  } catch {
    return null;
  }
}

// ── Static data ───────────────────────────────────────────────────────────────
const fallbackHadiths = [
  { text: "The best among you are those who have the best manners and character.", source: "Sahih Bukhari 6029" },
  { text: "None of you truly believes until he loves for his brother what he loves for himself.", source: "Sahih Bukhari 13" },
  { text: "The strong man is not the one who can overpower others. The strong man is the one who controls himself when he is angry.", source: "Sahih Bukhari 6114" },
  { text: "Make things easy and do not make them difficult, cheer people up and do not repulse them.", source: "Sahih Bukhari 69" },
  { text: "Whoever believes in Allah and the Last Day, let him speak good or remain silent.", source: "Sahih Bukhari 6018" },
  { text: "The most beloved deeds to Allah are those done consistently, even if they are small.", source: "Sahih Muslim 783" },
  { text: "Allah does not look at your appearance or wealth, but He looks at your hearts and deeds.", source: "Sahih Muslim 2564" },
];

const prayers = [
  { title: "Morning Surrender", text: "Heavenly Father, thank You for the gift of this new day. Order my steps, guard my heart, and help me walk in Your will with joy.", source: "Psalm 143:8" },
  { title: "Prayer for Guidance", text: "Our Father, who art in heaven, hallowed be thy name. Thy kingdom come, thy will be done, on earth as it is in heaven. Give us this day our daily bread, and forgive us our trespasses.", source: "The Lord's Prayer" },
  { title: "Prayer for Strength", text: "Lord Jesus, when I am weak, be my strength. Help me endure with faith, speak with grace, and finish today with courage.", source: "Philippians 4:13" },
  { title: "Prayer for Protection", text: "Lord, be my refuge and fortress. Cover me and my family under Your wings, and keep us from harm in body, mind, and spirit.", source: "Psalm 91:1-4" },
  { title: "Prayer for Peace", text: "Lord, make me an instrument of your peace. Where there is hatred, let me sow love; where there is injury, pardon; where there is doubt, faith.", source: "Prayer of St. Francis" },
  { title: "Prayer for Wisdom", text: "Father, give me wisdom for every decision today. Let Your Word shape my thinking, and let Your Spirit lead my actions.", source: "James 1:5" },
  { title: "Prayer of Gratitude", text: "Thank You, Lord, for Your goodness and mercy. Teach me to notice Your blessings and to serve others with a thankful heart.", source: "Psalm 107:1" },
  { title: "Prayer for Patience", text: "Lord, help me be patient in trials, kind in conversations, and faithful while I wait for Your timing.", source: "Romans 12:12" },
  { title: "Prayer for Forgiveness", text: "Merciful Father, forgive my sins and renew a right spirit within me. Help me forgive others as You have forgiven me.", source: "1 John 1:9" },
  { title: "Prayer for Work and Purpose", text: "God, bless the work of my hands. Let my efforts honor You and bring help, excellence, and integrity wherever I serve.", source: "Colossians 3:23" },
  { title: "Night Prayer", text: "Lord, thank You for carrying me through today. As I rest, grant me peace, restore my strength, and watch over my home.", source: "Psalm 4:8" },
];

// ── Commands ──────────────────────────────────────────────────────────────────
const commands = [
  {
    name: ["bible", "verse"],
    category: "religious",
    desc: "Get a Bible verse (KJV · NIV · WEB + Ghanaian: twi, ewe)",
    handler: async (sock, m, { text }) => {
      if (!text) {
        return m.usageReply(
          "bible <reference> [| <versions>]",
          `bible John 3:16\n${config.PREFIX}bible Psalm 23:1-6 | kjv, niv\n${config.PREFIX}bible John 3:16 | twi\n${config.PREFIX}bible John 3:16 | kjv, niv, twi, ewe`
        );
      }
      m.react("📖");
      try {
        let reference = text.trim();
        let versions = [...DEFAULT_BIBLE_VERSIONS];

        if (text.includes("|")) {
          const parts = text.split("|");
          reference = parts[0].trim();
          const requested = parts[1].split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
          if (requested.length) versions = requested.slice(0, 5);
        }

        const parsed = parseVerseRef(reference);
        const needsParsed = versions.some(v => GHANAIAN_VERSIONS.has(v));
        if (needsParsed && !parsed) {
          const ghanaianVersions = versions.filter(v => GHANAIAN_VERSIONS.has(v));
          const otherVersions = versions.filter(v => !GHANAIAN_VERSIONS.has(v));
          if (!otherVersions.length) {
            return m.reply(
              `⚠️ Could not parse *"${reference}"* as a verse reference for Ghanaian Bible lookup.\n` +
              `Please use the format: *Book Chapter:Verse* (e.g., John 3:16)\n` +
              `Ghanaian versions: ${ghanaianVersions.join(", ")}`
            );
          }
          versions = otherVersions;
        }

        if (needsParsed && parsed) {
          await m.reply(`⏳ Loading Ghanaian Bible data for the first time — this may take a moment...`).catch(() => {});
        }

        const results = await Promise.allSettled(
          versions.map(v => fetchBibleVerse(v, reference, parsed))
        );

        const ok = results
          .filter(r => r.status === "fulfilled" && r.value?.text)
          .map(r => r.value);

        if (!ok.length) {
          return m.reply(
            `❌ Verse not found or API is unavailable.\n` +
            `Try: *${config.PREFIX}bible John 3:16*\n` +
            `Supported versions: kjv, niv, web, bbe, asv | 🇬🇭 twi, ewe`
          );
        }

        let msg = `📖 *Holy Bible*\n\n`;
        msg += `📌 *${ok[0].reference || reference}*\n\n`;

        for (let i = 0; i < ok.length; i++) {
          const { version, translation_name, text: verseText } = ok[i];
          msg += `*${i + 1}. ${translation_name}*\n`;
          if (version === "niv") {
            msg += `_[New International Version — served via NET Bible, the closest freely available modern translation]_\n`;
          }
          msg += `"${verseText}"\n\n`;
        }

        const failed = results.length - ok.length;
        if (failed > 0) {
          msg += `⚠️ ${failed} version(s) could not be fetched.\n`;
        }

        msg += `💡 *Versions:* kjv · niv · web · bbe · asv\n`;
        msg += `🇬🇭 *Ghanaian:* twi (Akuapem Twi) · ewe\n`;
        msg += `_Usage: ${config.PREFIX}bible John 3:16 | kjv, niv, twi_`;

        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.apiErrorReply("Bible");
      }
    },
  },
  {
    name: ["dailyverse", "votd"],
    category: "religious",
    desc: "Get verse of the day (KJV + NIV)",
    handler: async (sock, m) => {
      m.react("📖");
      try {
        const dailyVerses = [
          "Psalm 23:1-6", "Proverbs 3:5-6", "Jeremiah 29:11", "Philippians 4:13",
          "Isaiah 41:10", "Romans 8:28", "Joshua 1:9", "Psalm 46:1",
          "Matthew 11:28", "2 Timothy 1:7", "Psalm 27:1", "Romans 15:13",
          "Philippians 4:6-7", "Psalm 121:1-2", "Isaiah 40:31", "John 3:16",
          "Psalm 91:1-2", "Ephesians 6:10", "Hebrews 11:1", "1 Peter 5:7",
          "Psalm 37:4", "Proverbs 16:3", "Matthew 6:33-34", "2 Corinthians 5:7",
          "Psalm 119:105", "Isaiah 26:3", "Romans 12:2", "Galatians 5:22-23",
          "Colossians 3:23", "1 Thessalonians 5:16-18", "Psalm 34:8",
        ];
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        const ref = dailyVerses[dayOfYear % dailyVerses.length];

        const [kjvResult, nivResult] = await Promise.allSettled([
          fetchJson(`https://bible-api.com/${encodeURIComponent(ref)}?translation=kjv`),
          fetchJson(`https://labs.bible.org/api/?passage=${encodeURIComponent(ref)}&type=json`),
        ]);

        const kjv = kjvResult.status === "fulfilled" && kjvResult.value?.text ? kjvResult.value : null;
        const nivRaw = nivResult.status === "fulfilled" && Array.isArray(nivResult.value) && nivResult.value.length ? nivResult.value : null;

        if (!kjv && !nivRaw) return m.reply("❌ Could not fetch verse of the day. Please try again shortly.");

        let msg = `🌅 *Verse of the Day*\n\n`;

        if (kjv) {
          msg += `📌 *${kjv.reference || ref}*\n\n`;
          msg += `*King James Version (KJV)*\n"${kjv.text.trim()}"\n\n`;
        }

        if (nivRaw) {
          const refLabel = nivRaw.length === 1
            ? `${nivRaw[0].bookname} ${nivRaw[0].chapter}:${nivRaw[0].verse}`
            : `${nivRaw[0].bookname} ${nivRaw[0].chapter}:${nivRaw[0].verse}-${nivRaw[nivRaw.length - 1].verse}`;
          if (!kjv) msg += `📌 *${refLabel}*\n\n`;
          const text = nivRaw.length === 1
            ? nivRaw[0].text.trim()
            : nivRaw.map(v => `${v.verse}. ${v.text.trim()}`).join(" ");
          msg += `*New International Version (NIV)*\n"${text}"\n\n`;
        }

        msg += `_Have a blessed day!_ 🙏`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Could not fetch verse of the day.");
      }
    },
  },
  {
    name: ["quran", "ayah"],
    category: "religious",
    desc: "Get a Quran verse",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("quran <surah>:<ayah>", "quran 1:1\n${config.PREFIX}quran 2:255");
      m.react("📖");
      try {
        const cleaned = String(text || "").trim();
        const pair = cleaned.includes(":")
          ? cleaned.split(":")
          : cleaned.split(/\s+/);
        const surah = Number.parseInt(pair[0], 10);
        const ayah = Number.parseInt(pair[1], 10);

        if (!Number.isFinite(surah) || !Number.isFinite(ayah)) {
          return m.reply("Format: surah:ayah (e.g., 2:255) or surah ayah (e.g., 2 255)");
        }
        if (surah < 1 || surah > 114 || ayah < 1 || ayah > 286) {
          return m.reply("❌ Invalid verse reference. Surah must be 1-114 and ayah must be a positive number.");
        }

        const bundled = await fetchJson(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/editions/quran-uthmani,en.sahih`).catch(() => null);
        let arabic = bundled?.data?.find((x) => x?.edition?.identifier === "quran-uthmani") || bundled?.data?.[0] || null;
        let english = bundled?.data?.find((x) => x?.edition?.identifier === "en.sahih") || bundled?.data?.[1] || null;

        if (!arabic) {
          const arRes = await fetchJson(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/quran-uthmani`).catch(() => null);
          arabic = arRes?.data || null;
        }
        if (!english) {
          const enRes = await fetchJson(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/en.sahih`).catch(() => null);
          english = enRes?.data || null;
        }

        if (!arabic && !english) {
          const fb = await fetchJson(`https://quranapi.pages.dev/api/${surah}/${ayah}.json`).catch(() => null);
          if (fb?.arabic1 && !arabic) {
            arabic = { text: fb.arabic1, surah: { englishName: fb.surahName || `Surah ${surah}`, name: fb.surahNameArabic || "" }, numberInSurah: ayah };
          }
          if (fb?.english && !english) {
            english = { text: fb.english, surah: { englishName: fb.surahName || `Surah ${surah}`, name: fb.surahNameArabic || "" }, numberInSurah: ayah };
          }
        }

        if (!arabic && !english) return m.reply(`❌ Could not fetch verse ${surah}:${ayah}. The Quran API may be temporarily unavailable — please try again shortly.`);
        const refSurahNameEn = arabic?.surah?.englishName || english?.surah?.englishName || `Surah ${surah}`;
        const refSurahNameAr = arabic?.surah?.name || "";
        const refAyah = arabic?.numberInSurah || english?.numberInSurah || ayah;
        let msg = `📖 *Al-Quran*\n\n`;
        msg += `📌 *${refSurahNameEn}${refSurahNameAr ? ` (${refSurahNameAr})` : ""} - Ayah ${refAyah}*\n\n`;
        if (arabic?.text) msg += `${arabic.text}\n\n`;
        if (english?.text) msg += `*Translation:*\n${english.text}\n\n`;
        msg += `_Surah ${surah}, Ayah ${refAyah}_`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Could not fetch Quran verse.");
      }
    },
  },
  {
    name: ["hadith"],
    category: "religious",
    desc: "Get a random hadith",
    handler: async (sock, m, { text }) => {
      m.react("📖");

      const stripHtml = (str) => String(str || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const gadingBooks = ["bukhari", "muslim", "abudawud", "nasai", "tirmidzi", "ibnmajah"];

      try {
        const [bookRaw, numberRaw] = String(text || "").trim().split(/\s+/);
        const book = gadingBooks.includes((bookRaw || "").toLowerCase()) ? bookRaw.toLowerCase() : "bukhari";
        const requested = Number(numberRaw || bookRaw || 0);
        const num = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 7000) : Math.floor(Math.random() * 300) + 1;

        if (!requested || requested <= 0) {
          const sunnahData = await fetchJson("https://api.sunnah.com/v1/hadiths/random", {
            headers: { "X-API-Key": "SqD712P3E82xnwOAEOkGd5JZH8s9wRR24TqNFzjk" },
          }).catch(() => null);

          if (sunnahData?.hadith?.length) {
            const enH = sunnahData.hadith.find((h) => h.lang === "en");
            const arH = sunnahData.hadith.find((h) => h.lang === "ar");
            const enText = stripHtml(enH?.body);
            const arText = stripHtml(arH?.body);
            const sunnahBookMap2 = {
              bukhari: "sahih-bukhari", muslim: "sahih-muslim", abudawud: "abu-dawud",
              nasai: "an-nasai", tirmidzi: "al-tirmidhi", ibnmajah: "ibn-majah",
            };
            const bookName = sunnahData.collection || sunnahBookMap2[book] || "Sahih Bukhari";
            const hadithNum = sunnahData.hadithNumber || "?";

            let msg = `📖 *Hadith*\n\n`;
            msg += `📌 *${bookName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} - #${hadithNum}*\n\n`;
            if (arText) msg += `${arText}\n\n`;
            if (enText) msg += `*Translation (English):*\n${enText}\n`;
            msg += `\n💡 Tip: ${config.PREFIX}hadith bukhari 42`;
            await m.reply(msg);
            m.react("✅");
            return;
          }
        }

        const data = await fetchJson(`https://api.hadith.gading.dev/books/${book}/${num}`).catch(() => null);
        if (data?.data?.contents) {
          const h = data.data.contents;
          let msg = `📖 *Hadith*\n\n`;
          msg += `📌 *${data.data.name} - #${h.number}*\n\n`;
          msg += `${h.arab}\n\n`;
          const gadingTrans = h.en || h.id || "";
          const gadingLang = h.en ? "English" : "Indonesian";
          if (gadingTrans) msg += `*Translation (${gadingLang}):*\n${gadingTrans}\n`;
          msg += `\n💡 Tip: ${config.PREFIX}hadith bukhari 42`;
          await m.reply(msg);
          m.react("✅");
          return;
        }

        const hf = pickNonRepeating(fallbackHadiths, `${m.chat}:hadith`, { maxHistory: 5 });
        await m.reply(`📖 *Hadith*\n\n"${hf.text}"\n\n_${hf.source}_\n📡 Source: Local fallback`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Could not fetch hadith.");
      }
    },
  },
  {
    name: ["pray", "prayer"],
    category: "religious",
    desc: "Get a Christian prayer",
    handler: async (sock, m) => {
      const p = pickNonRepeating(prayers, `${m.chat}:prayer`, { maxHistory: 6 });
      await m.reply(`🙏 *${p.title}*\n\n"${p.text}"\n\n_${p.source}_\n\n_Tip: share this with someone who needs encouragement today._`);
    },
  },
];

module.exports = { commands };
