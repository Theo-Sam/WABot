const config = require("../config");
const { fetchJson, fetchBuffer, sendImageOrText, replyLongText } = require("../lib/helpers");

const commands = [
  {
    name: ["score", "livescore", "scores"],
    category: "sports",
    desc: "Get live football scores",
    handler: async (sock, m, { text }) => {
      m.react("⚽");
      try {
        const league = text?.toLowerCase() || "premier league";
        const leagueMap = {
          "premier league": "eng.1", "pl": "eng.1", "epl": "eng.1",
          "la liga": "esp.1", "laliga": "esp.1",
          "bundesliga": "ger.1",
          "serie a": "ita.1", "seriea": "ita.1",
          "ligue 1": "fra.1", "ligue1": "fra.1",
          "champions league": "uefa.champions", "ucl": "uefa.champions", "cl": "uefa.champions"
        };
        const code = leagueMap[league] || "eng.1";
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard`;

        const data = await fetchJson(url).catch(() => null);
        if (data?.events?.length) {
          let msg = `⚽ *LIVE & RECENT SCORES*\n\n`;
          msg += `🏆 ${data.leagues?.[0]?.name || league}\n`;
          if (data.leagues?.[0]?.season?.displayName) msg += `📅 Season: ${data.leagues[0].season.displayName}\n`;
          msg += `\n`;
          data.events.forEach((match) => {
            const status = match.status?.type?.shortDetail || "";
            const statusState = match.status?.type?.state || "";
            const comp = match.competitions[0];
            const home = comp.competitors.find(c => c.homeAway === "home") || comp.competitors[0];
            const away = comp.competitors.find(c => c.homeAway === "away") || comp.competitors[1];
            const homeScore = home.score || "0";
            const awayScore = away.score || "0";
            const stateIcon = statusState === "in" ? "🟢" : statusState === "post" ? "🏁" : "⏳";

            msg += `${stateIcon} *${home.team?.shortDisplayName || home.team?.name}* ${homeScore} — *${away.team?.shortDisplayName || away.team?.name}* ${awayScore}\n`;
            msg += `⏰ ${status}\n`;
            if (comp.venue?.fullName) msg += `🏟️ ${comp.venue.fullName}\n`;
            msg += `\n`;
          });
          msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
          await replyLongText(m, msg);
        } else {
          await m.reply(`⏳ No live matches right now for "${league}". Try again later!\n\n💡 Available: premier league, la liga, bundesliga, serie a, ligue 1, champions league`);
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Football Scores API is currently overloaded.");
      }
    },
  },
  {
    name: ["fixtures", "upcoming", "fix"],
    category: "sports",
    desc: "Get upcoming football fixtures",
    handler: async (sock, m, { text }) => {
      m.react("⚽");
      try {
        const league = text?.toLowerCase() || "premier league";
        const leagueMap = {
          "premier league": "PL", "pl": "PL", "epl": "PL",
          "la liga": "PD", "laliga": "PD",
          "bundesliga": "BL1",
          "serie a": "SA", "seriea": "SA",
          "ligue 1": "FL1", "ligue1": "FL1",
          "champions league": "CL", "ucl": "CL", "cl": "CL",
        };
        const code = leagueMap[league] || "PL";
        const leagueIdMap = { "PL": "4328", "PD": "4335", "BL1": "4331", "SA": "4332", "FL1": "4334", "CL": "4480" };
        const leagueId = leagueIdMap[code] || "4328";
        const data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${leagueId}`).catch(() => null);
        if (data?.events?.length) {
          let msg = `📅 *UPCOMING FIXTURES*\n\n`;
          msg += `🏆 League: ${data.events[0]?.strLeague || league}\n\n`;
          data.events.forEach((e, i) => {
            msg += `*Match ${i + 1}*\n`;
            msg += `🏠 ${e.strHomeTeam} vs 🛫 ${e.strAwayTeam}\n`;
            msg += `📅 ${e.dateEvent} ⏰ ${e.strTime || "TBD"}\n`;
            if (e.strVenue) msg += `🏟️ ${e.strVenue}\n`;
            if (e.strThumb) msg += `🎫 Round: ${e.intRound || "N/A"}\n`;
            msg += `\n`;
          });
          msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
          await replyLongText(m, msg);
        } else {
          await m.reply(`📅 No upcoming fixtures found for "${league}".`);
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Fixtures API is currently overloaded.");
      }
    },
  },
  {
    name: ["standings", "table", "league", "std"],
    category: "sports",
    desc: "Get league standings",
    handler: async (sock, m, { text }) => {
      m.react("⚽");
      try {
        const league = text?.toLowerCase() || "premier league";
        const leagueMap = {
          "premier league": "PL", "pl": "PL", "epl": "PL",
          "la liga": "PD", "laliga": "PD",
          "bundesliga": "BL1",
          "serie a": "SA", "seriea": "SA",
          "ligue 1": "FL1", "ligue1": "FL1",
        };
        const code = leagueMap[league] || "PL";
        const leagueIdMap = { "PL": "4328", "PD": "4335", "BL1": "4331", "SA": "4332", "FL1": "4334", "CL": "4480" };
        const leagueId = leagueIdMap[code] || "4328";
        const date = new Date();
        const startYear = date.getMonth() < 7 ? date.getFullYear() - 1 : date.getFullYear();
        const season = `${startYear}-${startYear + 1}`;
        let data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${leagueId}&s=${season}`).catch(() => null);
        if (!data?.table?.length || data.table.length < 10) {
          const fallback = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${leagueId}`).catch(() => null);
          if (fallback?.table?.length) data = fallback;
        }
        if (data?.table?.length) {
          const table = data.table;
          let msg = `🏆 *LEAGUE STANDINGS*\n\n`;
          msg += `🏆 ${table[0]?.strLeague || league}\n`;
          msg += `📅 Season: ${season}\n\n`;
          msg += `*# Team | P W D L | Pts*\n`;
          table.forEach((t) => {
            const name = t.strTeam || "???";
            const pos = String(t.intRank).padStart(2);
            msg += `${pos}. ${name} | ${t.intPlayed} ${t.intWin} ${t.intDraw} ${t.intLoss} | *${t.intPoints}*\n`;
          });
          msg += `\n`;
          msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
          await replyLongText(m, msg);
        } else {
          await m.reply(`❌ Standings not found for "${league}". Try: premier league, la liga, bundesliga, serie a, ligue 1`);
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Standings API is currently overloaded.");
      }
    },
  },
  {
    name: ["player", "playerinfo", "ply"],
    category: "sports",
    desc: "Search football player info",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}player <player name>`);
      m.react("⚽");
      try {
        const data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(text)}`);
        if (!data?.player?.[0]) return m.reply("❌ Player not found.");
        const p = data.player[0];

        let msg = `⚽ *PLAYER PROFILE*\n\n`;
        msg += `🌟 *${p.strPlayer}*\n`;
        if (p.strTeam) msg += `🏟️ Current Team: ${p.strTeam}\n`;
        msg += `\n`;

        msg += `*Personal Info*\n`;
        if (p.strNationality) {
          const flagMap = { "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Spain": "🇪🇸", "France": "🇫🇷", "Germany": "🇩🇪", "Italy": "🇮🇹", "Brazil": "🇧🇷", "Argentina": "🇦🇷", "Portugal": "🇵🇹", "Netherlands": "🇳🇱", "Belgium": "🇧🇪", "Croatia": "🇭🇷", "Uruguay": "🇺🇾", "Colombia": "🇨🇴", "Mexico": "🇲🇽", "Japan": "🇯🇵", "South Korea": "🇰🇷", "USA": "🇺🇸", "Ghana": "🇬🇭", "Nigeria": "🇳🇬", "Cameroon": "🇨🇲", "Senegal": "🇸🇳", "Egypt": "🇪🇬", "Morocco": "🇲🇦", "Algeria": "🇩🇿", "Poland": "🇵🇱", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "Sweden": "🇸🇪", "Denmark": "🇩🇰", "Norway": "🇳🇴", "Austria": "🇦🇹", "Switzerland": "🇨🇭", "Serbia": "🇷🇸", "Turkey": "🇹🇷", "Australia": "🇦🇺", "Canada": "🇨🇦", "Chile": "🇨🇱", "Ecuador": "🇪🇨", "Peru": "🇵🇪", "Paraguay": "🇵🇾", "Venezuela": "🇻🇪", "Ivory Coast": "🇨🇮", "Tunisia": "🇹🇳", "DR Congo": "🇨🇩", "Mali": "🇲🇱", "Guinea": "🇬🇳", "Burkina Faso": "🇧🇫", "South Africa": "🇿🇦", "China PR": "🇨🇳", "India": "🇮🇳", "Iran": "🇮🇷", "Iraq": "🇮🇶", "Saudi Arabia": "🇸🇦", "Russia": "🇷🇺", "Ukraine": "🇺🇦", "Czech Republic": "🇨🇿", "Romania": "🇷🇴", "Hungary": "🇭🇺", "Greece": "🇬🇷", "Republic of Ireland": "🇮🇪", "Northern Ireland": "🇬🇧", "Finland": "🇫🇮", "Iceland": "🇮🇸", "Jamaica": "🇯🇲", "Costa Rica": "🇨🇷" };
          const flag = flagMap[p.strNationality] || "🌍";
          msg += `${flag} Nationality: ${p.strNationality}\n`;
        }
        if (p.dateBorn) {
          const birthDate = new Date(p.dateBorn);
          const age = Math.floor((Date.now() - birthDate.getTime()) / 31557600000);
          msg += `🎂 Born: ${p.dateBorn} (Age: ${age})\n`;
        }
        if (p.strBirthLocation) msg += `📍 Birth Place: ${p.strBirthLocation}\n`;
        if (p.strGender) msg += `👤 Gender: ${p.strGender}\n`;
        if (p.strHeight) msg += `📏 Height: ${p.strHeight}\n`;
        if (p.strWeight) msg += `⚖️ Weight: ${p.strWeight}\n`;
        if (p.strEthnicity) msg += `🏷️ Ethnicity: ${p.strEthnicity}\n`;
        if (p.strCollege) msg += `🎓 College: ${p.strCollege}\n`;
        msg += `\n`;

        msg += `*Career Info*\n`;
        if (p.strSport) msg += `🏅 Sport: ${p.strSport}\n`;
        if (p.strPosition) msg += `📌 Position: ${p.strPosition}\n`;
        if (p.strNumber) msg += `🔢 Shirt Number: ${p.strNumber}\n`;
        if (p.dateSigned) msg += `📅 Signed: ${p.dateSigned}\n`;
        if (p.strSigning) msg += `💰 Signing Fee: ${p.strSigning}\n`;
        if (p.strWage) msg += `💵 Wage: ${p.strWage}\n`;
        if (p.strKit) msg += `👕 Kit Number: ${p.strKit}\n`;
        if (p.strAgent) msg += `🤝 Agent: ${p.strAgent}\n`;
        if (p.strOutfitter) msg += `👟 Outfitter: ${p.strOutfitter}\n`;
        if (p.dateBorn) {
          const debut = p.dateSigned ? new Date(p.dateSigned) : null;
          const born = new Date(p.dateBorn);
          const startYear = debut ? debut.getFullYear() : born.getFullYear() + 18;
          const currentYear = new Date().getFullYear();
          if (p.strStatus === "Retired" || !p.strTeam) {
            msg += `📊 Career Span: ~${startYear} - retired\n`;
          } else {
            msg += `📊 Years Active: ~${currentYear - startYear} years (since ~${startYear})\n`;
          }
        }
        msg += `\n`;

        if (p.strLocked || p.strCreativeCommons) {
          msg += `*Honors & Achievements*\n`;
          if (p.strLocked) msg += `🏆 ${p.strLocked}\n`;
          msg += `\n`;
        }

        if (p.strFormerTeam) {
          msg += `*Former Teams*\n`;
          msg += `${p.strFormerTeam}\n\n`;
        }

        const socials = [];
        if (p.strFacebook) socials.push(`📘 Facebook: ${p.strFacebook}`);
        if (p.strTwitter) socials.push(`🐦 Twitter: ${p.strTwitter}`);
        if (p.strInstagram) socials.push(`📸 Instagram: ${p.strInstagram}`);
        if (p.strYoutube) socials.push(`▶️ YouTube: ${p.strYoutube}`);
        if (p.strWebsite) socials.push(`🌐 Website: ${p.strWebsite}`);
        if (socials.length) {
          msg += `*Social Media*\n`;
          msg += socials.join("\n") + "\n";
          msg += `\n`;
        }

        if (p.strDescriptionEN) {
          msg += `📝 *Biography:*\n${p.strDescriptionEN}\n\n`;
        }

        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;

        if (p.strThumb || p.strCutout) {
          const imgUrl = p.strCutout || p.strThumb;
          const imgBuf = await fetchBuffer(imgUrl).catch(() => null);
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
        await m.reply("⏳ The Player Info API is currently overloaded.");
      }
    },
  },
  {
    name: ["team", "teaminfo", "club", "tm"],
    category: "sports",
    desc: "Search football team info",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}team <team name>`);
      m.react("⚽");
      try {
        const data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(text)}`);
        if (!data?.teams?.[0]) return m.reply("❌ Team not found.");
        const t = data.teams[0];

        let msg = `🏟️ *TEAM PROFILE*\n\n`;
        msg += `🏟️ *${t.strTeam}*\n`;
        if (t.strTeamAlternate) msg += `📛 Also known as: ${t.strTeamAlternate}\n`;
        msg += `\n`;

        msg += `*Club Details*\n`;
        if (t.intFormedYear) msg += `📅 Founded: ${t.intFormedYear}\n`;
        if (t.strSport) msg += `🏅 Sport: ${t.strSport}\n`;
        if (t.strCountry) msg += `🌍 Country: ${t.strCountry}\n`;
        if (t.strLeague) msg += `🏆 League: ${t.strLeague}\n`;
        if (t.strLeague2) msg += `🏆 League 2: ${t.strLeague2}\n`;
        if (t.strDivision) msg += `📊 Division: ${t.strDivision}\n`;
        if (t.strManager) msg += `👨‍💼 Manager: ${t.strManager}\n`;
        if (t.strKeywords) msg += `🏷️ Keywords: ${t.strKeywords}\n`;
        msg += `\n`;

        if (t.strStadium) {
          msg += `*Stadium*\n`;
          msg += `🏟️ Name: ${t.strStadium}\n`;
          if (t.intStadiumCapacity) msg += `👥 Capacity: ${parseInt(t.intStadiumCapacity).toLocaleString()}\n`;
          if (t.strStadiumLocation) msg += `📍 Location: ${t.strStadiumLocation}\n`;
          if (t.strStadiumDescription) {
            msg += `📝 ${t.strStadiumDescription.substring(0, 300)}\n`;
          }
          msg += `\n`;
        }

        if (t.strColour1 || t.strColour2) {
          msg += `🎨 *Team Colors:* ${t.strColour1 || ""}${t.strColour2 ? ", " + t.strColour2 : ""}${t.strColour3 ? ", " + t.strColour3 : ""}\n`;
        }

        const socials = [];
        if (t.strWebsite) socials.push(`🌐 Website: ${t.strWebsite}`);
        if (t.strFacebook) socials.push(`📘 Facebook: ${t.strFacebook}`);
        if (t.strTwitter) socials.push(`🐦 Twitter: ${t.strTwitter}`);
        if (t.strInstagram) socials.push(`📸 Instagram: ${t.strInstagram}`);
        if (t.strYoutube) socials.push(`▶️ YouTube: ${t.strYoutube}`);
        if (socials.length) {
          msg += `\n*Social Media*\n`;
          msg += socials.join("\n") + "\n";
          msg += `\n`;
        }

        if (t.strDescriptionEN) {
          msg += `📝 *About:*\n${t.strDescriptionEN.substring(0, 3000)}`;
          if (t.strDescriptionEN.length > 3000) msg += "\n_(truncated)_";
          msg += `\n\n`;
        }

        msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;

        if (t.strBadge) {
          const imgBuf = await fetchBuffer(t.strBadge).catch(() => null);
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
        await m.reply("⏳ The Team Info API is currently overloaded.");
      }
    },
  },
  {
    name: ["nba", "basketball"],
    category: "sports",
    desc: "Get NBA scores/info",
    handler: async (sock, m) => {
      m.react("🏀");
      try {
        const data = await fetchJson("https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=4387").catch(() => null);
        if (data?.events?.length) {
          let msg = `🏀 *RECENT NBA GAMES*\n\n`;
          data.events.forEach((e, i) => {
            msg += `*Game ${i + 1}*\n`;
            msg += `🏠 ${e.strHomeTeam} *${e.intHomeScore || "?"}*\n`;
            msg += `🛫 ${e.strAwayTeam} *${e.intAwayScore || "?"}*\n`;
            msg += `📅 ${e.dateEvent}\n`;
            if (e.strVenue) msg += `🏟️ ${e.strVenue}\n`;
            if (e.intRound) msg += `🔢 Round: ${e.intRound}\n`;
            msg += `\n`;
          });
          msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
          await replyLongText(m, msg);
        } else {
          await m.reply("🏀 No recent NBA games found.");
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The NBA API is currently overloaded.");
      }
    },
  },
];

module.exports = { commands };
