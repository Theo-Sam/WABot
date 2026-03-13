const config = require("../config");
const { fetchJson, fetchBuffer, sendImageOrText } = require("../lib/helpers");

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
        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 🔍 *Google Search Results* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `🔎 Query: *${text}*\n`;
        msg += `📊 Showing top ${Math.min(results.length, 7)} results\n\n`;
        results.slice(0, 7).forEach((r, i) => {
          msg += `┌─── *${i + 1}. ${r.title || "Untitled"}* ───\n`;
          if (r.description || r.snippet) msg += `│ ${(r.description || r.snippet).substring(0, 300)}\n`;
          if (r.url || r.link) msg += `│ 🔗 ${r.url || r.link}\n`;
          msg += `└──────────────────\n\n`;
        });
        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
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
        const [data, catData, fullExtractData] = await Promise.all([
          fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`),
          fetchJson(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(text)}&prop=categories&cllimit=20&format=json`).catch(() => null),
          fetchJson(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(text)}&prop=extracts&exintro=false&explaintext=true&exlimit=1&format=json`).catch(() => null),
        ]);
        if (!data?.extract) return m.reply("⏳ No Wikipedia article found or the API is busy.");

        let fullExtract = "";
        if (fullExtractData?.query?.pages) {
          const pageContent = Object.values(fullExtractData.query.pages);
          fullExtract = pageContent[0]?.extract || "";
        }
        if (!fullExtract) fullExtract = data.extract || "";

        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 📚 *WIKIPEDIA* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `📖 *${data.title}*\n`;
        if (data.description) msg += `📝 _${data.description}_\n`;
        msg += `\n`;
        if (data.type) msg += `📂 Type: ${data.type}\n`;
        if (data.timestamp) msg += `📅 Last Updated: ${new Date(data.timestamp).toLocaleDateString()}\n`;
        if (data.coordinates) msg += `📍 Coordinates: ${data.coordinates.lat}, ${data.coordinates.lon}\n`;

        if (catData?.query?.pages) {
          const pages = Object.values(catData.query.pages);
          const cats = pages[0]?.categories?.map(c => c.title?.replace("Category:", "")).filter(Boolean) || [];
          if (cats.length) msg += `🏷️ Categories: ${cats.join(", ")}\n`;
        }

        msg += `\n`;
        msg += fullExtract.substring(0, 4000);
        if (fullExtract.length > 4000) msg += "\n\n_(article truncated — read full article below)_";
        if (data.content_urls?.desktop?.page) msg += `\n\n🔗 *Read More:* ${data.content_urls.desktop.page}`;
        if (data.content_urls?.mobile?.page) msg += `\n📱 *Mobile:* ${data.content_urls.mobile.page}`;
        msg += `\n\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
        if (data.thumbnail?.source) {
          const imgBuf = await fetchBuffer(data.thumbnail.source).catch(() => null);
          if (imgBuf) {
            await sendImageOrText(sock, m.chat, imgBuf, msg, m);
            m.react("✅");
            return;
          }
        }
        await m.reply(msg);
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
        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 🎵 *SONG LYRICS* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `🎶 *${title}*\n`;
        if (artist) msg += `🎤 Artist: ${artist}\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        msg += lyrics.substring(0, 4000);
        if (lyrics.length > 4000) msg += "\n\n_(lyrics truncated)_";
        msg += `\n\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
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
        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 📖 *DICTIONARY* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `📝 *${entry.word}*\n`;
        if (entry.phonetic) msg += `🗣️ Phonetic: ${entry.phonetic}\n`;
        const allPhonetics = entry.phonetics?.filter(p => p.text) || [];
        if (allPhonetics.length > 1) {
          msg += `🔊 Pronunciations: ${allPhonetics.map(p => p.text).join(", ")}\n`;
        }
        const audioPhonetic = entry.phonetics?.find(p => p.audio);
        if (audioPhonetic?.audio) msg += `🎧 Audio: ${audioPhonetic.audio}\n`;
        if (entry.origin) msg += `📜 Origin/Etymology: ${entry.origin}\n`;
        msg += `\n`;

        entry.meanings?.forEach((meaning) => {
          msg += `┌─── *${meaning.partOfSpeech.toUpperCase()}* ───\n`;
          meaning.definitions?.forEach((def, i) => {
            msg += `│ ${i + 1}. ${def.definition}\n`;
            if (def.example) msg += `│    _Example: "${def.example}"_\n`;
          });
          if (meaning.synonyms?.length) msg += `│\n│ 🔗 Synonyms: ${meaning.synonyms.join(", ")}\n`;
          if (meaning.antonyms?.length) msg += `│ 🔗 Antonyms: ${meaning.antonyms.join(", ")}\n`;
          msg += `└──────────────────\n\n`;
        });

        const allSyn = data.flatMap(e => e.meanings?.flatMap(m => m.synonyms || []) || []);
        const allAnt = data.flatMap(e => e.meanings?.flatMap(m => m.antonyms || []) || []);
        if (allSyn.length > 0) msg += `📗 *All Synonyms:* ${[...new Set(allSyn)].join(", ")}\n`;
        if (allAnt.length > 0) msg += `📕 *All Antonyms:* ${[...new Set(allAnt)].join(", ")}\n`;

        if (entry.sourceUrls?.length) msg += `\n🔗 Source: ${entry.sourceUrls[0]}`;
        msg += `\n\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
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
      if (!text) return m.reply(`Usage: ${config.PREFIX}github <username or user/repo>`);
      m.react("🐙");
      try {
        if (text.includes("/")) {
          const data = await fetchJson(`https://api.github.com/repos/${text}`);
          let msg = `╔══════════════════════════╗\n`;
          msg += `║ 🐙 *GITHUB REPOSITORY* ║\n`;
          msg += `╚══════════════════════════╝\n\n`;
          msg += `📦 *${data.full_name}*\n`;
          if (data.description) msg += `📝 ${data.description}\n`;
          msg += `\n`;
          msg += `┌─── *Stats* ───\n`;
          msg += `│ ⭐ Stars: ${(data.stargazers_count || 0).toLocaleString()}\n`;
          msg += `│ 🍴 Forks: ${(data.forks_count || 0).toLocaleString()}\n`;
          msg += `│ 👁️ Watchers: ${(data.watchers_count || 0).toLocaleString()}\n`;
          msg += `│ 🐛 Open Issues: ${(data.open_issues_count || 0).toLocaleString()}\n`;
          msg += `│ 📏 Size: ${(data.size || 0).toLocaleString()} KB\n`;
          msg += `└──────────────────\n\n`;
          msg += `┌─── *Details* ───\n`;
          msg += `│ 🔤 Language: ${data.language || "N/A"}\n`;
          msg += `│ 📜 License: ${data.license?.name || "N/A"}\n`;
          msg += `│ 🌿 Default Branch: ${data.default_branch || "main"}\n`;
          msg += `│ 📅 Created: ${new Date(data.created_at).toLocaleDateString()}\n`;
          msg += `│ 🔄 Last Updated: ${new Date(data.updated_at).toLocaleDateString()}\n`;
          msg += `│ 📤 Last Push: ${new Date(data.pushed_at).toLocaleDateString()}\n`;
          if (data.homepage) msg += `│ 🌐 Homepage: ${data.homepage}\n`;
          msg += `│ 🍴 Is Fork: ${data.fork ? "Yes" : "No"}\n`;
          msg += `│ 📦 Is Archived: ${data.archived ? "Yes" : "No"}\n`;
          if (data.topics?.length) msg += `│ 🏷️ Topics: ${data.topics.join(", ")}\n`;
          msg += `└──────────────────\n\n`;
          msg += `🔗 ${data.html_url}\n`;
          msg += `\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;

          if (data.owner?.avatar_url) {
            const avatar = await fetchBuffer(data.owner.avatar_url).catch(() => null);
            if (avatar) {
              await sendImageOrText(sock, m.chat, avatar, msg, m);
              m.react("✅");
              return;
            }
          }
          await m.reply(msg);
        } else {
          const [data, reposData] = await Promise.all([
            fetchJson(`https://api.github.com/users/${text}`),
            fetchJson(`https://api.github.com/users/${text}/repos?sort=stars&per_page=5`).catch(() => [])
          ]);
          let msg = `╔══════════════════════════╗\n`;
          msg += `║ 🐙 *GITHUB USER PROFILE* ║\n`;
          msg += `╚══════════════════════════╝\n\n`;
          msg += `👤 *${data.name || data.login}*`;
          if (data.login) msg += ` (@${data.login})`;
          msg += `\n`;
          if (data.bio) msg += `📝 _${data.bio}_\n`;
          msg += `\n`;
          msg += `┌─── *Profile* ───\n`;
          msg += `│ 📦 Public Repos: ${(data.public_repos || 0).toLocaleString()}\n`;
          msg += `│ 📋 Public Gists: ${(data.public_gists || 0).toLocaleString()}\n`;
          msg += `│ 👥 Followers: ${(data.followers || 0).toLocaleString()}\n`;
          msg += `│ 👤 Following: ${(data.following || 0).toLocaleString()}\n`;
          if (data.location) msg += `│ 📍 Location: ${data.location}\n`;
          if (data.company) msg += `│ 🏢 Company: ${data.company}\n`;
          if (data.blog) msg += `│ 🌐 Blog: ${data.blog}\n`;
          if (data.twitter_username) msg += `│ 🐦 Twitter: @${data.twitter_username}\n`;
          if (data.email) msg += `│ 📧 Email: ${data.email}\n`;
          msg += `│ 📅 Joined: ${new Date(data.created_at).toLocaleDateString()}\n`;
          msg += `│ 🔄 Last Active: ${new Date(data.updated_at).toLocaleDateString()}\n`;
          msg += `│ 📊 Type: ${data.type || "User"}\n`;
          if (data.hireable) msg += `│ 💼 Hireable: Yes ✅\n`;
          msg += `└──────────────────\n`;

          if (reposData.length > 0) {
            msg += `\n┌─── *Top Repositories* ───\n`;
            reposData.forEach((r, i) => {
              msg += `│ ${i + 1}. *${r.name}* ⭐ ${r.stargazers_count}`;
              if (r.language) msg += ` (${r.language})`;
              msg += `\n`;
              if (r.description) msg += `│    _${r.description.substring(0, 80)}_\n`;
            });
            msg += `└──────────────────\n`;
          }

          msg += `\n🔗 ${data.html_url}\n`;
          msg += `\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;

          if (data.avatar_url) {
            const avatar = await fetchBuffer(data.avatar_url).catch(() => null);
            if (avatar) {
              await sendImageOrText(sock, m.chat, avatar, msg, m);
              m.react("✅");
              return;
            }
          }
          await m.reply(msg);
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
        let msg = `╔══════════════════════════╗\n`;
        msg += `║ ▶️ *YOUTUBE SEARCH* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `🔎 Query: *${text}*\n\n`;
        results.slice(0, 7).forEach((r, i) => {
          msg += `┌─── *${i + 1}. ${r.title}* ───\n`;
          if (r.duration) msg += `│ ⏱️ Duration: ${r.duration}\n`;
          if (r.views) msg += `│ 👁️ Views: ${r.views}\n`;
          if (r.uploaded || r.ago) msg += `│ 📅 Uploaded: ${r.uploaded || r.ago}\n`;
          if (r.author?.name) msg += `│ 👤 Channel: ${r.author.name}\n`;
          msg += `│ 🔗 ${r.url}\n`;
          msg += `└──────────────────\n\n`;
        });
        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
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
        const data = await fetchJson(`https://www.omdbapi.com/?t=${encodeURIComponent(text)}&plot=full&apikey=742b2d09`);
        if (data?.Response === "False") return m.reply("❌ Movie not found.");
        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 🎬 *MOVIE INFO* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `🎬 *${data.Title}* (${data.Year})\n\n`;

        msg += `┌─── *Ratings* ───\n`;
        if (data.imdbRating && data.imdbRating !== "N/A") msg += `│ ⭐ IMDb: ${data.imdbRating}/10`;
        if (data.imdbVotes && data.imdbVotes !== "N/A") msg += ` (${data.imdbVotes} votes)`;
        msg += `\n`;
        if (data.Ratings) {
          data.Ratings.forEach(r => {
            if (r.Source !== "Internet Movie Database") {
              msg += `│ 🏆 ${r.Source}: ${r.Value}\n`;
            }
          });
        }
        if (data.Metascore && data.Metascore !== "N/A") msg += `│ 📊 Metascore: ${data.Metascore}/100\n`;
        msg += `└──────────────────\n\n`;

        msg += `┌─── *Details* ───\n`;
        if (data.Released && data.Released !== "N/A") msg += `│ 📅 Released: ${data.Released}\n`;
        if (data.Runtime && data.Runtime !== "N/A") msg += `│ ⏱️ Runtime: ${data.Runtime}\n`;
        if (data.Genre && data.Genre !== "N/A") msg += `│ 🎭 Genre: ${data.Genre}\n`;
        if (data.Rated && data.Rated !== "N/A") msg += `│ 🔞 Rated: ${data.Rated}\n`;
        if (data.Type) msg += `│ 📂 Type: ${data.Type}\n`;
        if (data.Language && data.Language !== "N/A") msg += `│ 🗣️ Language: ${data.Language}\n`;
        if (data.Country && data.Country !== "N/A") msg += `│ 🌍 Country: ${data.Country}\n`;
        msg += `└──────────────────\n\n`;

        msg += `┌─── *Cast & Crew* ───\n`;
        if (data.Director && data.Director !== "N/A") msg += `│ 🎬 Director: ${data.Director}\n`;
        if (data.Writer && data.Writer !== "N/A") msg += `│ ✍️ Writer: ${data.Writer}\n`;
        if (data.Actors && data.Actors !== "N/A") msg += `│ 🎭 Cast: ${data.Actors}\n`;
        if (data.Production && data.Production !== "N/A") msg += `│ 🏢 Production: ${data.Production}\n`;
        msg += `└──────────────────\n\n`;

        if ((data.Awards && data.Awards !== "N/A") || (data.BoxOffice && data.BoxOffice !== "N/A")) {
          msg += `┌─── *Awards & Revenue* ───\n`;
          if (data.Awards && data.Awards !== "N/A") msg += `│ 🏆 Awards: ${data.Awards}\n`;
          if (data.BoxOffice && data.BoxOffice !== "N/A") msg += `│ 💰 Box Office: ${data.BoxOffice}\n`;
          if (data.DVD && data.DVD !== "N/A") msg += `│ 📀 DVD Release: ${data.DVD}\n`;
          msg += `└──────────────────\n\n`;
        }

        if (data.Plot && data.Plot !== "N/A") {
          msg += `📝 *Plot:*\n${data.Plot}\n\n`;
        }

        if (data.totalSeasons) msg += `📺 Total Seasons: ${data.totalSeasons}\n`;
        if (data.imdbID) msg += `🔗 IMDb: https://www.imdb.com/title/${data.imdbID}\n`;
        msg += `\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;

        if (data.Poster && data.Poster !== "N/A") {
          const poster = await fetchBuffer(data.Poster).catch(() => null);
          if (poster) {
            await sendImageOrText(sock, m.chat, poster, msg, m);
            m.react("✅");
            return;
          }
        }
        await m.reply(msg);
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
        const query = `query ($search: String) { Media (search: $search, type: ANIME) { id title { romaji english native } episodes duration status season seasonYear averageScore meanScore popularity favourites genres tags { name rank } description(asHtml: false) coverImage { large } bannerImage startDate { year month day } endDate { year month day } studios { nodes { name isAnimationStudio } } source format countryOfOrigin isAdult siteUrl nextAiringEpisode { episode airingAt } rankings { rank type context } } }`;
        const axios = require("axios");
        const res = await axios.post("https://graphql.anilist.co", { query, variables: { search: text } }, { timeout: 15000 });
        const anime = res.data?.data?.Media;
        if (!anime) return m.reply("❌ Anime not found.");

        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 🎌 *ANIME INFO* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `🎬 *${anime.title.english || anime.title.romaji}*\n`;
        if (anime.title.romaji && anime.title.english && anime.title.romaji !== anime.title.english) {
          msg += `🇯🇵 Romaji: ${anime.title.romaji}\n`;
        }
        if (anime.title.native) msg += `🈯 Native: ${anime.title.native}\n`;
        msg += `\n`;

        msg += `┌─── *Scores & Stats* ───\n`;
        if (anime.averageScore) msg += `│ ⭐ Average Score: ${anime.averageScore}/100\n`;
        if (anime.meanScore) msg += `│ 📊 Mean Score: ${anime.meanScore}/100\n`;
        if (anime.popularity) msg += `│ 📈 Popularity: #${anime.popularity.toLocaleString()}\n`;
        if (anime.favourites) msg += `│ ❤️ Favourites: ${anime.favourites.toLocaleString()}\n`;
        if (anime.rankings?.length) {
          anime.rankings.slice(0, 3).forEach(r => {
            msg += `│ 🏆 Rank #${r.rank} — ${r.context}\n`;
          });
        }
        msg += `└──────────────────\n\n`;

        msg += `┌─── *Details* ───\n`;
        msg += `│ 📺 Episodes: ${anime.episodes || "N/A"}\n`;
        if (anime.duration) msg += `│ ⏱️ Duration: ${anime.duration} min/ep\n`;
        msg += `│ 📊 Status: ${anime.status}\n`;
        if (anime.format) msg += `│ 📂 Format: ${anime.format}\n`;
        if (anime.source) msg += `│ 📖 Source: ${anime.source}\n`;
        if (anime.season) msg += `│ 🗓️ Season: ${anime.season} ${anime.seasonYear || ""}\n`;
        if (anime.startDate?.year) {
          msg += `│ 📅 Start: ${anime.startDate.day || "?"}/${anime.startDate.month || "?"}/${anime.startDate.year}\n`;
        }
        if (anime.endDate?.year) {
          msg += `│ 📅 End: ${anime.endDate.day || "?"}/${anime.endDate.month || "?"}/${anime.endDate.year}\n`;
        }
        if (anime.countryOfOrigin) msg += `│ 🌍 Country: ${anime.countryOfOrigin}\n`;
        if (anime.isAdult) msg += `│ 🔞 Adult: Yes\n`;
        msg += `└──────────────────\n\n`;

        const studios = anime.studios?.nodes?.filter(s => s.isAnimationStudio) || [];
        const producers = anime.studios?.nodes?.filter(s => !s.isAnimationStudio) || [];
        if (studios.length || producers.length) {
          msg += `┌─── *Studios* ───\n`;
          if (studios.length) msg += `│ 🏢 Studio: ${studios.map(s => s.name).join(", ")}\n`;
          if (producers.length) msg += `│ 🎬 Producers: ${producers.map(s => s.name).join(", ")}\n`;
          msg += `└──────────────────\n\n`;
        }

        if (anime.genres?.length) msg += `🎭 *Genres:* ${anime.genres.join(", ")}\n`;
        if (anime.tags?.length) {
          msg += `🏷️ *Tags:* ${anime.tags.map(t => `${t.name} (${t.rank}%)`).join(", ")}\n`;
        }

        if (anime.nextAiringEpisode) {
          const nextDate = new Date(anime.nextAiringEpisode.airingAt * 1000);
          msg += `\n📡 *Next Episode:* Episode ${anime.nextAiringEpisode.episode} — ${nextDate.toUTCString()}\n`;
        }

        if (anime.description) {
          const cleanDesc = anime.description.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n");
          msg += `\n📝 *Synopsis:*\n${cleanDesc}`;
        }

        if (anime.siteUrl) msg += `\n\n🔗 ${anime.siteUrl}`;
        msg += `\n\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;

        if (anime.coverImage?.large) {
          const cover = await fetchBuffer(anime.coverImage.large).catch(() => null);
          if (cover) {
            await sendImageOrText(sock, m.chat, cover, msg, m);
            m.react("✅");
            return;
          }
        }
        await m.reply(msg);
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
        const query = `query ($search: String) { Media (search: $search, type: MANGA) { id title { romaji english native } chapters volumes status averageScore meanScore popularity favourites genres tags { name rank } description(asHtml: false) coverImage { large } startDate { year month day } endDate { year month day } staff { nodes { name { full } } } source format countryOfOrigin isAdult siteUrl rankings { rank type context } } }`;
        const axios = require("axios");
        const res = await axios.post("https://graphql.anilist.co", { query, variables: { search: text } }, { timeout: 15000 });
        const manga = res.data?.data?.Media;
        if (!manga) return m.reply("❌ Manga not found.");

        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 📖 *MANGA INFO* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `📚 *${manga.title.english || manga.title.romaji}*\n`;
        if (manga.title.romaji && manga.title.english && manga.title.romaji !== manga.title.english) {
          msg += `🇯🇵 Romaji: ${manga.title.romaji}\n`;
        }
        if (manga.title.native) msg += `🈯 Native: ${manga.title.native}\n`;
        msg += `\n`;

        msg += `┌─── *Scores & Stats* ───\n`;
        if (manga.averageScore) msg += `│ ⭐ Average Score: ${manga.averageScore}/100\n`;
        if (manga.meanScore) msg += `│ 📊 Mean Score: ${manga.meanScore}/100\n`;
        if (manga.popularity) msg += `│ 📈 Popularity: #${manga.popularity.toLocaleString()}\n`;
        if (manga.favourites) msg += `│ ❤️ Favourites: ${manga.favourites.toLocaleString()}\n`;
        if (manga.rankings?.length) {
          manga.rankings.slice(0, 3).forEach(r => {
            msg += `│ 🏆 Rank #${r.rank} — ${r.context}\n`;
          });
        }
        msg += `└──────────────────\n\n`;

        msg += `┌─── *Details* ───\n`;
        msg += `│ 📚 Chapters: ${manga.chapters || "Ongoing"}\n`;
        msg += `│ 📕 Volumes: ${manga.volumes || "N/A"}\n`;
        msg += `│ 📊 Status: ${manga.status}\n`;
        if (manga.format) msg += `│ 📂 Format: ${manga.format}\n`;
        if (manga.source) msg += `│ 📖 Source: ${manga.source}\n`;
        if (manga.startDate?.year) {
          msg += `│ 📅 Start: ${manga.startDate.day || "?"}/${manga.startDate.month || "?"}/${manga.startDate.year}\n`;
        }
        if (manga.endDate?.year) {
          msg += `│ 📅 End: ${manga.endDate.day || "?"}/${manga.endDate.month || "?"}/${manga.endDate.year}\n`;
        }
        if (manga.countryOfOrigin) msg += `│ 🌍 Country: ${manga.countryOfOrigin}\n`;
        if (manga.isAdult) msg += `│ 🔞 Adult: Yes\n`;
        msg += `└──────────────────\n\n`;

        if (manga.staff?.nodes?.length) {
          msg += `✍️ *Staff:* ${manga.staff.nodes.slice(0, 5).map(s => s.name.full).join(", ")}\n`;
        }
        if (manga.genres?.length) msg += `🎭 *Genres:* ${manga.genres.join(", ")}\n`;
        if (manga.tags?.length) {
          msg += `🏷️ *Tags:* ${manga.tags.map(t => `${t.name} (${t.rank}%)`).join(", ")}\n`;
        }

        if (manga.description) {
          const cleanDesc = manga.description.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n");
          msg += `\n📝 *Synopsis:*\n${cleanDesc}`;
        }

        if (manga.siteUrl) msg += `\n\n🔗 ${manga.siteUrl}`;
        msg += `\n\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;

        if (manga.coverImage?.large) {
          const cover = await fetchBuffer(manga.coverImage.large).catch(() => null);
          if (cover) {
            await sendImageOrText(sock, m.chat, cover, msg, m);
            m.react("✅");
            return;
          }
        }
        await m.reply(msg);
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
        await sock.sendMessage(m.chat, { image: buffer, caption: `🖼️ *Wallpaper: ${text}*\n\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡` }, { quoted: { key: m.key, message: m.message } });
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
        const query = text || "world";
        let articles = [];

        const results = await Promise.allSettled([
          fetchJson(`https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&token=${process.env.GNEWS_API_KEY || ""}`),
          fetchJson(`https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(query)}&language=en&apiKey=${process.env.CURRENTS_API_KEY || ""}`),
          fetchJson(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent("https://news.google.com/rss/search?q=" + encodeURIComponent(query))}&count=10`),
        ]);

        if (results[0].status === "fulfilled" && results[0].value?.articles?.length) {
          articles = results[0].value.articles;
        }

        if (!articles.length && results[1].status === "fulfilled" && results[1].value?.news?.length) {
          articles = results[1].value.news.map(item => ({
            title: item.title,
            description: item.description || "",
            url: item.url,
            source: { name: item.author || "Currents" },
            author: item.author,
            publishedAt: item.published,
            category: Array.isArray(item.category) ? item.category.join(", ") : item.category,
          }));
        }

        if (!articles.length && results[2].status === "fulfilled" && results[2].value?.items?.length) {
          articles = results[2].value.items.map(item => ({
            title: item.title,
            description: item.description?.replace(/<[^>]+>/g, "").substring(0, 400) || "",
            url: item.link,
            source: { name: item.author || "Google News" },
            author: item.author,
            publishedAt: item.pubDate,
          }));
        }

        articles = articles.filter(a =>
          a.title && a.title !== "[Removed]" &&
          (!a.description || a.description !== "[Removed]") &&
          (!a.url || !a.url.includes("[Removed]"))
        );

        if (!articles.length) return m.reply("❌ No news found. Try a different search term.");

        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 📰 *LATEST NEWS* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `🔎 Topic: *${query}*\n`;
        msg += `📅 ${new Date().toLocaleDateString()}\n\n`;

        articles.slice(0, 5).forEach((a, i) => {
          msg += `┌─── *${i + 1}. ${a.title}* ───\n`;
          const sourceName = a.source?.name || a.source || "";
          if (sourceName) msg += `│ 📰 Source: ${sourceName}\n`;
          if (a.author && a.author !== "[Removed]") msg += `│ ✍️ Author: ${a.author}\n`;
          if (a.publishedAt) {
            const pubDate = new Date(a.publishedAt);
            msg += `│ 📅 Published: ${pubDate.toLocaleDateString()} ${pubDate.toLocaleTimeString()}\n`;
          }
          if (a.category) msg += `│ 📂 Category: ${a.category}\n`;
          if (a.description && a.description !== "[Removed]") {
            msg += `│ 📝 ${a.description}\n`;
          }
          if (a.content && a.content !== "[Removed]" && !a.description) {
            msg += `│ 📝 ${a.content}\n`;
          }
          if (a.url) msg += `│ 🔗 ${a.url}\n`;
          msg += `└──────────────────\n\n`;
        });

        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
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
        if (!data?.id) return m.reply("❌ Cryptocurrency not found. Use coin ID (e.g., bitcoin, ethereum, solana).");
        const md = data.market_data;
        const price = md?.current_price;

        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 💰 *CRYPTOCURRENCY* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `🪙 *${data.name}* (${data.symbol?.toUpperCase()})\n`;
        if (data.market_cap_rank) msg += `🏆 Market Cap Rank: #${data.market_cap_rank}\n`;
        msg += `\n`;

        msg += `┌─── *Current Price* ───\n`;
        msg += `│ 💵 USD: $${price?.usd?.toLocaleString() || "N/A"}\n`;
        msg += `│ 💶 EUR: €${price?.eur?.toLocaleString() || "N/A"}\n`;
        msg += `│ 💷 GBP: £${price?.gbp?.toLocaleString() || "N/A"}\n`;
        if (price?.btc) msg += `│ ₿ BTC: ${price.btc}\n`;
        msg += `└──────────────────\n\n`;

        msg += `┌─── *Price Changes* ───\n`;
        if (md?.price_change_percentage_1h_in_currency?.usd != null) {
          msg += `│ 📊 1h: ${md.price_change_percentage_1h_in_currency.usd.toFixed(2)}%\n`;
        }
        if (md?.price_change_percentage_24h != null) {
          msg += `│ 📈 24h: ${md.price_change_percentage_24h.toFixed(2)}%\n`;
        }
        if (md?.price_change_percentage_7d != null) {
          msg += `│ 📉 7d: ${md.price_change_percentage_7d.toFixed(2)}%\n`;
        }
        if (md?.price_change_percentage_30d != null) {
          msg += `│ 📊 30d: ${md.price_change_percentage_30d.toFixed(2)}%\n`;
        }
        if (md?.price_change_percentage_1y != null) {
          msg += `│ 📊 1y: ${md.price_change_percentage_1y.toFixed(2)}%\n`;
        }
        msg += `└──────────────────\n\n`;

        msg += `┌─── *Market Data* ───\n`;
        msg += `│ 💎 Market Cap: $${md?.market_cap?.usd?.toLocaleString() || "N/A"}\n`;
        msg += `│ 📊 24h Volume: $${md?.total_volume?.usd?.toLocaleString() || "N/A"}\n`;
        if (md?.circulating_supply) msg += `│ 🔄 Circulating: ${Math.round(md.circulating_supply).toLocaleString()}\n`;
        if (md?.total_supply) msg += `│ 📦 Total Supply: ${Math.round(md.total_supply).toLocaleString()}\n`;
        if (md?.max_supply) msg += `│ 🔒 Max Supply: ${Math.round(md.max_supply).toLocaleString()}\n`;
        msg += `└──────────────────\n\n`;

        if (md?.ath?.usd) {
          msg += `┌─── *All-Time Records* ───\n`;
          msg += `│ 🚀 ATH: $${md.ath.usd.toLocaleString()}`;
          if (md.ath_date?.usd) msg += ` (${new Date(md.ath_date.usd).toLocaleDateString()})`;
          msg += `\n`;
          if (md.ath_change_percentage?.usd != null) msg += `│    Change from ATH: ${md.ath_change_percentage.usd.toFixed(2)}%\n`;
          if (md?.atl?.usd != null) {
            msg += `│ 📉 ATL: $${md.atl.usd.toLocaleString()}`;
            if (md.atl_date?.usd) msg += ` (${new Date(md.atl_date.usd).toLocaleDateString()})`;
            msg += `\n`;
          }
          msg += `└──────────────────\n\n`;
        }

        if (data.description?.en) {
          const desc = data.description.en.replace(/<[^>]+>/g, "");
          msg += `📝 *About:*\n${desc}\n\n`;
        }

        if (data.links?.homepage?.[0]) msg += `🌐 Website: ${data.links.homepage[0]}\n`;
        if (data.links?.blockchain_site?.[0]) msg += `🔗 Explorer: ${data.links.blockchain_site[0]}\n`;

        msg += `\n_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;

        if (data.image?.large) {
          const coinImg = await fetchBuffer(data.image.large).catch(() => null);
          if (coinImg) {
            await sendImageOrText(sock, m.chat, coinImg, msg, m);
            m.react("✅");
            return;
          }
        }
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
        if (data?.success === false) return m.reply(`❌ ${data.message || "Invalid IP address"}`);

        let msg = `╔══════════════════════════╗\n`;
        msg += `║ 🌐 *IP LOOKUP* ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `📡 *${data.ip}*\n\n`;

        msg += `┌─── *Location* ───\n`;
        if (data.country) msg += `│ 🌍 Country: ${data.country}`;
        if (data.country_code) msg += ` (${data.country_code})`;
        if (data.country_flag) msg += ` ${data.country_flag}`;
        msg += `\n`;
        if (data.region) msg += `│ 📍 Region: ${data.region}\n`;
        if (data.city) msg += `│ 🏙️ City: ${data.city}\n`;
        if (data.latitude && data.longitude) msg += `│ 🗺️ Coordinates: ${data.latitude}, ${data.longitude}\n`;
        if (data.postal) msg += `│ 📮 Postal Code: ${data.postal}\n`;
        if (data.continent) msg += `│ 🌍 Continent: ${data.continent}\n`;
        msg += `└──────────────────\n\n`;

        msg += `┌─── *Network* ───\n`;
        if (data.isp) msg += `│ 🏢 ISP: ${data.isp}\n`;
        if (data.org) msg += `│ 🔧 Organization: ${data.org}\n`;
        if (data.asn) msg += `│ 📡 ASN: ${data.asn}\n`;
        if (data.type) msg += `│ 📂 Type: ${data.type}\n`;
        msg += `└──────────────────\n\n`;

        msg += `┌─── *Timezone* ───\n`;
        if (data.timezone) msg += `│ 🕐 Timezone: ${data.timezone}\n`;
        if (data.timezone_name) msg += `│ 📛 Name: ${data.timezone_name}\n`;
        if (data.timezone_gmt) msg += `│ 🌐 GMT Offset: ${data.timezone_gmt}\n`;
        if (data.currency) msg += `│ 💰 Currency: ${data.currency}\n`;
        if (data.currency_code) msg += `│ 💱 Currency Code: ${data.currency_code}\n`;
        if (data.country_phone) msg += `│ ☎️ Phone Code: +${data.country_phone}\n`;
        msg += `└──────────────────\n\n`;

        const flags = [];
        if (data.security) {
          if (data.security.proxy) flags.push("🔒 Proxy");
          if (data.security.vpn) flags.push("🛡️ VPN");
          if (data.security.tor) flags.push("🧅 Tor");
          if (data.security.hosting) flags.push("🖥️ Hosting");
          if (data.security.mobile) flags.push("📱 Mobile");
        }
        if (data.connection_type) msg += `📶 Connection: ${data.connection_type}\n`;
        if (flags.length) msg += `⚠️ *Flags:* ${flags.join(", ")}\n\n`;

        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
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
