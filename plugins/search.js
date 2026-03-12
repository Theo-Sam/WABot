const config = require("../config");
const { fetchJson, fetchBuffer } = require("../lib/helpers");

const commands = [
  {
    name: ["google", "search"],
    category: "search",
    desc: "Search Google",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}google <query>`);
      m.react("🔍");
      try {
        let results = await Promise.any([
          (async () => {
            const data = await fetchJson(`https://deliriussapi-oficial.vercel.app/search/googlesearch?q=${encodeURIComponent(text)}`);
            if (!data?.data?.length) throw new Error("empty");
            return data.data;
          })(),
          (async () => {
            const data = await fetchJson(`https://api.dreaded.site/api/google?query=${encodeURIComponent(text)}`);
            if (!data?.result?.length) throw new Error("empty");
            return data.result;
          })()
        ]).catch(() => []);
        if (!results.length) return m.reply("⏳ The search API is busy or no results were found. Try again soon!");
        let msg = `🔍 *Google Search: ${text}*\n\n`;
        results.slice(0, 5).forEach((r, i) => {
          msg += `*${i + 1}. ${r.title || "Untitled"}*\n`;
          if (r.description || r.snippet) msg += `${r.description || r.snippet}\n`;
          if (r.url || r.link) msg += `🔗 ${r.url || r.link}\n`;
          msg += "\n";
        });
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The search API is currently overloaded. Please try again later!");
      }
    },
  },
  {
    name: ["wiki", "wikipedia", "w"],
    category: "search",
    desc: "Search Wikipedia",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}wiki <query>`);
      m.react("📚");
      try {
        const data = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`);
        if (!data?.extract) return m.reply("⏳ No Wikipedia article found or the API is busy.");
        let msg = `📚 *Wikipedia: ${data.title}*\n\n${data.extract}`;
        if (data.content_urls?.desktop?.page) msg += `\n\n🔗 ${data.content_urls.desktop.page}`;
        await m.reply(msg);
        if (data.thumbnail?.source) {
          const imgBuf = await fetchBuffer(data.thumbnail.source).catch(() => null);
          if (imgBuf) await sock.sendMessage(m.chat, { image: imgBuf });
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Wikipedia API is currently overloaded. Please try again later!");
      }
    },
  },
  {
    name: ["lyrics", "lyric", "l"],
    category: "search",
    desc: "Search song lyrics",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}lyrics <song name>`);
      m.react("🎵");
      try {
        let { title, artist, lyrics } = await Promise.any([
          (async () => {
            const data = await fetchJson(`https://deliriussapi-oficial.vercel.app/search/lyrics?q=${encodeURIComponent(text)}`);
            if (!data?.data?.lyrics) throw new Error("empty");
            return { title: data.data.title || text, artist: data.data.artist || "", lyrics: data.data.lyrics };
          })(),
          (async () => {
            const data = await fetchJson(`https://api.dreaded.site/api/lyrics?query=${encodeURIComponent(text)}`);
            if (!data?.result?.lyrics) throw new Error("empty");
            return { title: data.result.title || text, artist: data.result.artist || "", lyrics: data.result.lyrics };
          })()
        ]).catch(() => ({ title: "", artist: "", lyrics: "" }));
        if (!lyrics) return m.reply("⏳ Lyrics not found or API is overloaded.");
        let msg = `🎵 *${title}*\n`;
        if (artist) msg += `🎤 ${artist}\n`;
        msg += `\n${lyrics.substring(0, 4000)}`;
        if (lyrics.length > 4000) msg += "\n\n_(lyrics truncated)_";
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The lyrics API is currently overloaded.");
      }
    },
  },
  {
    name: ["define", "dictionary", "dict", "meaning", "def"],
    category: "search",
    desc: "Look up word definition",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}define <word>`);
      m.react("📖");
      try {
        const data = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`);
        if (!data?.[0]) return m.reply("❌ Word not found.");
        const entry = data[0];
        let msg = `📖 *${entry.word}*\n`;
        if (entry.phonetic) msg += `🗣️ ${entry.phonetic}\n`;
        msg += "\n";
        entry.meanings?.forEach((meaning) => {
          msg += `*${meaning.partOfSpeech}*\n`;
          meaning.definitions?.slice(0, 3).forEach((def, i) => {
            msg += `${i + 1}. ${def.definition}\n`;
            if (def.example) msg += `   _"${def.example}"_\n`;
          });
          if (meaning.synonyms?.length) msg += `\n🔗 Synonyms: ${meaning.synonyms.slice(0, 5).join(", ")}\n`;
          if (meaning.antonyms?.length) msg += `🔗 Antonyms: ${meaning.antonyms.slice(0, 5).join(", ")}\n`;
          msg += "\n";
        });
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The dictionary API is currently overloaded.");
      }
    },
  },
  {
    name: ["github", "git"],
    category: "search",
    desc: "Search GitHub user/repo",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}github <username or repo>`);
      m.react("🐙");
      try {
        if (text.includes("/")) {
          const data = await fetchJson(`https://api.github.com/repos/${text}`);
          let msg = `🐙 *GitHub Repository*\n\n`;
          msg += `📦 *${data.full_name}*\n`;
          if (data.description) msg += `📝 ${data.description}\n`;
          msg += `⭐ Stars: ${data.stargazers_count}\n`;
          msg += `🍴 Forks: ${data.forks_count}\n`;
          msg += `👁️ Watchers: ${data.watchers_count}\n`;
          msg += `🔤 Language: ${data.language || "N/A"}\n`;
          msg += `📅 Created: ${new Date(data.created_at).toLocaleDateString()}\n`;
          msg += `🔗 ${data.html_url}`;
          await m.reply(msg);
        } else {
          const data = await fetchJson(`https://api.github.com/users/${text}`);
          let msg = `🐙 *GitHub User*\n\n`;
          msg += `👤 *${data.name || data.login}*\n`;
          if (data.bio) msg += `📝 ${data.bio}\n`;
          msg += `📦 Repos: ${data.public_repos}\n`;
          msg += `👥 Followers: ${data.followers}\n`;
          msg += `👤 Following: ${data.following}\n`;
          if (data.location) msg += `📍 ${data.location}\n`;
          if (data.company) msg += `🏢 ${data.company}\n`;
          msg += `🔗 ${data.html_url}`;
          if (data.avatar_url) {
            const avatar = await fetchBuffer(data.avatar_url).catch(() => null);
            if (avatar) await sock.sendMessage(m.chat, { image: avatar, caption: msg });
            else await m.reply(msg);
          } else {
            await m.reply(msg);
          }
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The GitHub API is currently overloaded.");
      }
    },
  },
  {
    name: ["ytsearch", "yts"],
    category: "search",
    desc: "Search YouTube videos",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}ytsearch <query>`);
      m.react("🔍");
      try {
        const data = await fetchJson(`https://deliriussapi-oficial.vercel.app/search/ytsearch?q=${encodeURIComponent(text)}`).catch(() => null);
        const results = data?.data || [];
        if (!results.length) return m.reply("❌ No results found.");
        let msg = `🔍 *YouTube Search: ${text}*\n\n`;
        results.slice(0, 5).forEach((r, i) => {
          msg += `*${i + 1}. ${r.title}*\n`;
          if (r.duration) msg += `⏱️ ${r.duration}\n`;
          if (r.views) msg += `👁️ ${r.views}\n`;
          msg += `🔗 ${r.url}\n\n`;
        });
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The YouTube search API is currently overloaded.");
      }
    },
  },
  {
    name: ["movie", "imdb", "mov"],
    category: "search",
    desc: "Search movie info",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}movie <movie name>`);
      m.react("🎬");
      try {
        const data = await fetchJson(`https://www.omdbapi.com/?t=${encodeURIComponent(text)}&apikey=742b2d09`);
        if (data?.Response === "False") return m.reply("❌ Movie not found.");
        let msg = `🎬 *${data.Title}* (${data.Year})\n\n`;
        msg += `⭐ IMDb: ${data.imdbRating}/10\n`;
        msg += `📅 Released: ${data.Released}\n`;
        msg += `⏱️ Runtime: ${data.Runtime}\n`;
        msg += `🎭 Genre: ${data.Genre}\n`;
        msg += `🎬 Director: ${data.Director}\n`;
        msg += `🎭 Actors: ${data.Actors}\n`;
        msg += `📝 Plot: ${data.Plot}\n`;
        if (data.Awards && data.Awards !== "N/A") msg += `🏆 Awards: ${data.Awards}\n`;
        if (data.BoxOffice && data.BoxOffice !== "N/A") msg += `💰 Box Office: ${data.BoxOffice}\n`;
        if (data.Poster && data.Poster !== "N/A") {
          const poster = await fetchBuffer(data.Poster).catch(() => null);
          if (poster) {
            await sock.sendMessage(m.chat, { image: poster, caption: msg });
          } else {
            await m.reply(msg);
          }
        } else {
          await m.reply(msg);
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Movie search API is currently overloaded.");
      }
    },
  },
  {
    name: ["anime", "anilist", "ani"],
    category: "search",
    desc: "Search anime info",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}anime <anime name>`);
      m.react("🎌");
      try {
        const query = `query ($search: String) { Media (search: $search, type: ANIME) { title { romaji english native } episodes status averageScore genres description(asHtml: false) coverImage { large } startDate { year month } endDate { year month } studios { nodes { name } } } }`;
        const axios = require("axios");
        const res = await axios.post("https://graphql.anilist.co", { query, variables: { search: text } }, { timeout: 15000 });
        const anime = res.data?.data?.Media;
        if (!anime) return m.reply("❌ Anime not found.");
        let msg = `🎌 *${anime.title.english || anime.title.romaji}*\n`;
        if (anime.title.native) msg += `🇯🇵 ${anime.title.native}\n`;
        msg += "\n";
        if (anime.averageScore) msg += `⭐ Score: ${anime.averageScore}/100\n`;
        msg += `📺 Episodes: ${anime.episodes || "N/A"}\n`;
        msg += `📊 Status: ${anime.status}\n`;
        if (anime.genres?.length) msg += `🎭 Genres: ${anime.genres.join(", ")}\n`;
        if (anime.studios?.nodes?.[0]) msg += `🏢 Studio: ${anime.studios.nodes[0].name}\n`;
        if (anime.startDate?.year) msg += `📅 Start: ${anime.startDate.month}/${anime.startDate.year}\n`;
        if (anime.description) {
          const cleanDesc = anime.description.replace(/<[^>]+>/g, "").substring(0, 500);
          msg += `\n📝 ${cleanDesc}`;
        }
        if (anime.coverImage?.large) {
          const cover = await fetchBuffer(anime.coverImage.large).catch(() => null);
          if (cover) {
            await sock.sendMessage(m.chat, { image: cover, caption: msg });
          } else {
            await m.reply(msg);
          }
        } else {
          await m.reply(msg);
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Anime search API is currently overloaded.");
      }
    },
  },
  {
    name: ["manga", "man"],
    category: "search",
    desc: "Search manga info",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}manga <manga name>`);
      m.react("📖");
      try {
        const query = `query ($search: String) { Media (search: $search, type: MANGA) { title { romaji english } chapters volumes status averageScore genres description(asHtml: false) coverImage { large } } }`;
        const axios = require("axios");
        const res = await axios.post("https://graphql.anilist.co", { query, variables: { search: text } }, { timeout: 15000 });
        const manga = res.data?.data?.Media;
        if (!manga) return m.reply("❌ Manga not found.");
        let msg = `📖 *${manga.title.english || manga.title.romaji}*\n\n`;
        if (manga.averageScore) msg += `⭐ Score: ${manga.averageScore}/100\n`;
        msg += `📚 Chapters: ${manga.chapters || "N/A"}\n`;
        msg += `📕 Volumes: ${manga.volumes || "N/A"}\n`;
        msg += `📊 Status: ${manga.status}\n`;
        if (manga.genres?.length) msg += `🎭 Genres: ${manga.genres.join(", ")}\n`;
        if (manga.description) {
          msg += `\n📝 ${manga.description.replace(/<[^>]+>/g, "").substring(0, 500)}`;
        }
        if (manga.coverImage?.large) {
          const cover = await fetchBuffer(manga.coverImage.large).catch(() => null);
          if (cover) await sock.sendMessage(m.chat, { image: cover, caption: msg });
          else await m.reply(msg);
        } else {
          await m.reply(msg);
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Manga search API is currently overloaded.");
      }
    },
  },
  {
    name: ["wallpaper", "wall", "wp"],
    category: "search",
    desc: "Search wallpapers",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}wallpaper <query>`);
      m.react("🖼️");
      try {
        const buffer = await fetchBuffer(`https://source.unsplash.com/random/1920x1080/?${encodeURIComponent(text)}`);
        await sock.sendMessage(m.chat, { image: buffer, caption: `🖼️ *Wallpaper: ${text}*\n\n_${config.BOT_NAME}_` }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Wallpaper search API is currently overloaded.");
      }
    },
  },
  {
    name: ["news", "nw"],
    category: "search",
    desc: "Get latest news",
    handler: async (sock, m, { text }) => {
      m.react("📰");
      try {
        const query = text || "technology";
        const data = await fetchJson(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=5&apiKey=e8de3e55f4ec4ce1aa94eacf41d5ecfa`).catch(() => null);
        if (!data?.articles?.length) return m.reply("❌ No news found.");
        let msg = `📰 *Latest News: ${query}*\n\n`;
        data.articles.slice(0, 5).forEach((a, i) => {
          msg += `*${i + 1}. ${a.title}*\n`;
          if (a.description) msg += `${a.description.substring(0, 150)}\n`;
          msg += `🔗 ${a.url}\n\n`;
        });
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The News API is currently overloaded.");
      }
    },
  },
  {
    name: ["crypto", "coin", "cry"],
    category: "search",
    desc: "Get cryptocurrency price",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}crypto <coin>\nExample: ${config.PREFIX}crypto bitcoin`);
      m.react("💰");
      try {
        const data = await fetchJson(`https://api.coingecko.com/api/v3/coins/${text.toLowerCase()}`);
        if (!data?.id) return m.reply("❌ Cryptocurrency not found.");
        const price = data.market_data?.current_price;
        let msg = `💰 *${data.name}* (${data.symbol?.toUpperCase()})\n\n`;
        msg += `💵 USD: $${price?.usd?.toLocaleString() || "N/A"}\n`;
        msg += `💶 EUR: €${price?.eur?.toLocaleString() || "N/A"}\n`;
        msg += `💷 GBP: £${price?.gbp?.toLocaleString() || "N/A"}\n`;
        msg += `📊 Market Cap: $${data.market_data?.market_cap?.usd?.toLocaleString() || "N/A"}\n`;
        msg += `📈 24h Change: ${data.market_data?.price_change_percentage_24h?.toFixed(2) || "N/A"}%\n`;
        msg += `📊 Volume: $${data.market_data?.total_volume?.usd?.toLocaleString() || "N/A"}\n`;
        msg += `🏆 Rank: #${data.market_cap_rank || "N/A"}`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Crypto API is currently overloaded. Use coin ID (e.g., bitcoin, ethereum).");
      }
    },
  },
  {
    name: ["ip", "iplookup"],
    category: "search",
    desc: "Look up IP address info",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}ip <IP address>`);
      m.react("🌐");
      try {
        const data = await fetchJson(`https://ipwhois.app/json/${text}`);
        if (!data?.success) return m.reply(`❌ ${data.message || "Invalid IP address"}`);
        let msg = `🌐 *IP Lookup: ${data.ip}*\n\n`;
        msg += `🌍 Country: ${data.country}\n`;
        msg += `🏙️ City: ${data.city}\n`;
        msg += `📍 Region: ${data.region}\n`;
        msg += `🗺️ Lat/Lon: ${data.latitude}, ${data.longitude}\n`;
        msg += `🕐 Timezone: ${data.timezone_name}\n`;
        msg += `🏢 ISP: ${data.isp}\n`;
        msg += `🔧 Org: ${data.org}\n`;
        msg += `📡 AS: ${data.asn}`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The IP lookup API is currently overloaded.");
      }
    },
  },
];

module.exports = { commands };