const config = require("../config");
const { fetchJson } = require("../lib/helpers");

const commands = [
  {
    name: ["bible", "verse"],
    category: "religious",
    desc: "Get a Bible verse",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}bible <reference> [| <version>]\nExample: ${config.PREFIX}bible John 3:16\n${config.PREFIX}bible Psalm 23 | KJV`);
      m.react("📖");
      try {
        let reference = text;
        let version = "web";
        if (text.includes("|")) {
          const parts = text.split("|");
          reference = parts[0].trim();
          version = parts[1].trim().toLowerCase();
        }

        const data = await fetchJson(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`);
        if (!data?.text) return m.reply(`⏳ Verse not found or API is busy. Try valid reference like 'John 3:16'. Versions: kjv, asv, bbe, web, etc.`);
        let msg = `📖 *Holy Bible*\n\n`;
        msg += `📌 *${data.reference}*\n\n`;
        msg += `"${data.text.trim()}"\n\n`;
        if (data.translation_name) msg += `📚 _${data.translation_name}_`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Bible API is currently overloaded or the version is invalid.");
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
        const [surah, ayah] = text.split(":");
        if (!surah || !ayah) return m.reply("Format: surah:ayah (e.g., 2:255)");
        const data = await fetchJson(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/editions/quran-uthmani,en.sahih`);
        if (!data?.data || data.data.length < 2) return m.reply("❌ Verse not found.");
        const arabic = data.data[0];
        const english = data.data[1];
        let msg = `📖 *Al-Quran*\n\n`;
        msg += `📌 *Surah ${arabic.surah.englishName} (${arabic.surah.name}) - Ayah ${arabic.numberInSurah}*\n\n`;
        msg += `${arabic.text}\n\n`;
        msg += `*Translation:*\n${english.text}\n\n`;
        msg += `_Surah ${arabic.surah.number}, Ayah ${arabic.numberInSurah}_`;
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
    handler: async (sock, m) => {
      m.react("📖");
      try {
        const num = Math.floor(Math.random() * 300) + 1;
        const data = await fetchJson(`https://api.hadith.gading.dev/books/bukhari/${num}`).catch(() => null);
        if (data?.data?.contents) {
          const h = data.data.contents;
          let msg = `📖 *Hadith*\n\n`;
          msg += `📌 *${data.data.name} - #${h.number}*\n\n`;
          msg += `${h.arab}\n\n`;
          msg += `*Translation:*\n${h.en || h.id || ""}\n`;
          await m.reply(msg);
          m.react("✅");
        } else {
          const hadiths = [
            { text: "The best among you are those who have the best manners and character.", source: "Sahih Bukhari 6029" },
            { text: "None of you truly believes until he loves for his brother what he loves for himself.", source: "Sahih Bukhari 13" },
            { text: "The strong man is not the one who can overpower others. The strong man is the one who controls himself when he is angry.", source: "Sahih Bukhari 6114" },
            { text: "Make things easy and do not make them difficult, cheer the people up by conveying glad tidings to them and do not repulse them.", source: "Sahih Bukhari 69" },
            { text: "Whoever believes in Allah and the Last Day, let him speak good or remain silent.", source: "Sahih Bukhari 6018" },
          ];
          const h = hadiths[Math.floor(Math.random() * hadiths.length)];
          await m.reply(`📖 *Hadith*\n\n"${h.text}"\n\n_${h.source}_`);
          m.react("✅");
        }
      } catch {
        m.react("❌");
        await m.reply("❌ Could not fetch hadith.");
      }
    },
  },
  {
    name: ["pray", "prayer", "dua"],
    category: "religious",
    desc: "Get a prayer/dua",
    handler: async (sock, m) => {
      const prayers = [
        { title: "Morning Prayer", text: "O Allah, by Your leave we have reached the morning and by Your leave we have reached the evening. By Your leave we live and die, and unto You is our resurrection.", source: "Morning Dua" },
        { title: "Prayer for Guidance", text: "Our Father, who art in heaven, hallowed be thy name. Thy kingdom come, thy will be done, on earth as it is in heaven. Give us this day our daily bread, and forgive us our trespasses.", source: "The Lord's Prayer" },
        { title: "Prayer for Strength", text: "Lord, grant me the serenity to accept the things I cannot change, courage to change the things I can, and wisdom to know the difference.", source: "Serenity Prayer" },
        { title: "Prayer for Protection", text: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul.", source: "Psalm 23" },
        { title: "Prayer for Peace", text: "Lord, make me an instrument of your peace. Where there is hatred, let me sow love; where there is injury, pardon; where there is doubt, faith.", source: "Prayer of St. Francis" },
        { title: "Dua for Knowledge", text: "O Allah, I ask You for knowledge that is of benefit, a good provision, and deeds that will be accepted.", source: "Ibn Majah 925" },
        { title: "Prayer of Gratitude", text: "Give thanks to the Lord, for He is good; His love endures forever. Let the redeemed of the Lord tell their story.", source: "Psalm 107:1-2" },
        { title: "Dua for Patience", text: "Our Lord, pour upon us patience and let us die as Muslims [in submission to You].", source: "Quran 7:126" },
      ];
      const p = prayers[Math.floor(Math.random() * prayers.length)];
      await m.reply(`🙏 *${p.title}*\n\n"${p.text}"\n\n_${p.source}_`);
    },
  },
];

module.exports = { commands };
