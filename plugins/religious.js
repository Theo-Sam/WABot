const config = require("../config");
const { fetchJson, pickNonRepeating } = require("../lib/helpers");

const DEFAULT_BIBLE_VERSIONS = ["kjv", "web", "bbe"];

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

const commands = [
  {
    name: ["bible", "verse"],
    category: "religious",
    desc: "Get a Bible verse",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}bible <reference> [| <versions>]\nExample: ${config.PREFIX}bible John 3:16\n${config.PREFIX}bible Psalm 23:1 | kjv, web, bbe`);
      m.react("📖");
      try {
        let reference = text;
        let versions = [...DEFAULT_BIBLE_VERSIONS];
        if (text.includes("|")) {
          const parts = text.split("|");
          reference = parts[0].trim();
          const requested = parts[1].split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
          if (requested.length) versions = requested.slice(0, 5);
        }

        const responses = await Promise.allSettled(
          versions.map((version) =>
            fetchJson(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`).then((data) => ({ version, data }))
          )
        );

        const ok = responses
          .filter((r) => r.status === "fulfilled" && r.value?.data?.text)
          .map((r) => r.value);

        if (!ok.length) {
          return m.reply(`⏳ Verse not found or API is busy. Try valid reference like 'John 3:16'.\nSupported version codes include: kjv, web, bbe, asv.`);
        }

        let msg = `📖 *Holy Bible*\n\n`;
        msg += `📌 *${ok[0].data.reference || reference}*\n\n`;
        ok.forEach(({ version, data }, index) => {
          const versionName = data.translation_name || version.toUpperCase();
          msg += `*${index + 1}. ${versionName} (${version.toUpperCase()})*\n`;
          msg += `"${String(data.text || "").trim()}"\n\n`;
        });

        const failed = responses.length - ok.length;
        if (failed > 0) {
          msg += `⚠️ ${failed} requested version(s) could not be fetched.\n`;
        }

        msg += `💡 Tip: ${config.PREFIX}bible John 3:16 | kjv,web,bbe`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Bible API is currently overloaded or one or more versions are invalid.");
      }
    },
  },
  {
    name: ["dailyverse", "votd"],
    category: "religious",
    desc: "Get verse of the day",
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
        const data = await fetchJson(`https://bible-api.com/${encodeURIComponent(ref)}`);
        if (!data?.text) return m.reply("❌ Could not fetch verse of the day.");
        let msg = `🌅 *Verse of the Day*\n\n`;
        msg += `📌 *${data.reference}*\n\n`;
        msg += `"${data.text.trim()}"\n\n`;
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
      if (!text) return m.reply(`Usage: ${config.PREFIX}quran <surah>:<ayah>\nExample: ${config.PREFIX}quran 1:1\n${config.PREFIX}quran 2:255`);
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

        if (!arabic && !english) return m.reply("❌ Verse not found.");
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
      try {
        const [bookRaw, numberRaw] = String(text || "").trim().split(/\s+/);
        const supportedBooks = ["bukhari", "muslim", "abudawud", "nasai", "tirmidzi", "ibnmajah"];
        const book = supportedBooks.includes((bookRaw || "").toLowerCase()) ? bookRaw.toLowerCase() : "bukhari";
        const requested = Number(numberRaw || bookRaw || 0);
        const num = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 7000) : Math.floor(Math.random() * 300) + 1;
        const data = await fetchJson(`https://api.hadith.gading.dev/books/${book}/${num}`).catch(() => null);
        if (data?.data?.contents) {
          const h = data.data.contents;
          let msg = `📖 *Hadith*\n\n`;
          msg += `📌 *${data.data.name} - #${h.number}*\n\n`;
          msg += `${h.arab}\n\n`;
          msg += `*Translation:*\n${h.en || h.id || ""}\n`;
          msg += `\n💡 Tip: ${config.PREFIX}hadith bukhari 42`;
          await m.reply(msg);
          m.react("✅");
        } else {
          const h = pickNonRepeating(fallbackHadiths, `${m.chat}:hadith`, { maxHistory: 5 });
          await m.reply(`📖 *Hadith*\n\n"${h.text}"\n\n_${h.source}_\n📡 Source: Local fallback`);
          m.react("✅");
        }
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
