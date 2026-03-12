const config = require("../config");
const { fetchJson, fetchBuffer } = require("../lib/helpers");

const commands = [
  {
    name: ["score", "livescore", "scores", "sc"],
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
          let msg = `⚽ *Live & Recent Scores (${data.leagues?.[0]?.name || "Matches"})*\n\n`;
          data.events.slice(0, 15).forEach((match) => {
            const status = match.status?.type?.shortDetail || "";
            const comp = match.competitions[0];
            const home = comp.competitors.find(c => c.homeAway === "home") || comp.competitors[0];
            const away = comp.competitors.find(c => c.homeAway === "away") || comp.competitors[1];

            const homeScore = home.score || "0";
            const awayScore = away.score || "0";

            msg += `🏟️ *${home.team?.shortDisplayName || home.team?.name}* ${homeScore} - ${awayScore} *${away.team?.shortDisplayName || away.team?.name}*\n`;
            msg += `   ⏰ ${status}\n\n`;
          });
          await m.reply(msg);
        } else {
          await m.reply(`⏳ No live matches right now, or the API is currently overloaded. Try again later!`);
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
          let msg = `📅 *Upcoming Fixtures*\n\n`;
          data.events.slice(0, 10).forEach((e) => {
            msg += `🏟️ ${e.strHomeTeam} vs ${e.strAwayTeam}\n`;
            msg += `   📅 ${e.dateEvent} ⏰ ${e.strTime || "TBD"}\n\n`;
          });
          await m.reply(msg);
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
        const data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${leagueId}&s=${season}`).catch(() => null);
        if (data?.table?.length) {
          const table = data.table;
          let msg = `🏆 *${table[0]?.strLeague || league} Standings*\n\n`;
          msg += `Pos | Team | P | W | D | L | Pts\n`;
          msg += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
          table.slice(0, 20).forEach((t) => {
            const name = (t.strTeam || "???").padEnd(12).substring(0, 12);
            msg += `${String(t.intRank).padStart(2)} | ${name} | ${t.intPlayed} | ${t.intWin} | ${t.intDraw} | ${t.intLoss} | ${t.intPoints}\n`;
          });
          await m.reply(msg);
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
        let msg = `⚽ *${p.strPlayer}*\n\n`;
        if (p.strNationality) msg += `🌍 Nationality: ${p.strNationality}\n`;
        if (p.strTeam) msg += `🏟️ Team: ${p.strTeam}\n`;
        if (p.strPosition) msg += `📌 Position: ${p.strPosition}\n`;
        if (p.dateBorn) msg += `🎂 Born: ${p.dateBorn}\n`;
        if (p.strBirthLocation) msg += `📍 Birth Place: ${p.strBirthLocation}\n`;
        if (p.strHeight) msg += `📏 Height: ${p.strHeight}\n`;
        if (p.strWeight) msg += `⚖️ Weight: ${p.strWeight}\n`;
        if (p.strNumber) msg += `🔢 Number: ${p.strNumber}\n`;
        if (p.strSigning) msg += `💰 Signing: ${p.strSigning}\n`;
        if (p.strDescriptionEN) {
          msg += `\n📝 ${p.strDescriptionEN.substring(0, 500)}`;
          if (p.strDescriptionEN.length > 500) msg += "...";
        }
        if (p.strThumb) {
          const imgBuf = await fetchBuffer(p.strThumb).catch(() => null);
          if (imgBuf) {
            await sock.sendMessage(m.chat, { image: imgBuf, caption: msg }, { quoted: { key: m.key, message: m.message } });
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
        let msg = `🏟️ *${t.strTeam}*\n\n`;
        if (t.strTeamAlternate) msg += `📛 Also known as: ${t.strTeamAlternate}\n`;
        if (t.intFormedYear) msg += `📅 Founded: ${t.intFormedYear}\n`;
        if (t.strCountry) msg += `🌍 Country: ${t.strCountry}\n`;
        if (t.strLeague) msg += `🏆 League: ${t.strLeague}\n`;
        if (t.strStadium) msg += `🏟️ Stadium: ${t.strStadium}\n`;
        if (t.intStadiumCapacity) msg += `👥 Capacity: ${parseInt(t.intStadiumCapacity).toLocaleString()}\n`;
        if (t.strManager) msg += `👨‍💼 Manager: ${t.strManager}\n`;
        if (t.strWebsite) msg += `🌐 Website: ${t.strWebsite}\n`;
        if (t.strDescriptionEN) {
          msg += `\n📝 ${t.strDescriptionEN.substring(0, 500)}`;
          if (t.strDescriptionEN.length > 500) msg += "...";
        }
        if (t.strBadge) {
          const imgBuf = await fetchBuffer(t.strBadge).catch(() => null);
          if (imgBuf) {
            await sock.sendMessage(m.chat, { image: imgBuf, caption: msg }, { quoted: { key: m.key, message: m.message } });
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
          let msg = `🏀 *Recent NBA Games*\n\n`;
          data.events.slice(0, 8).forEach((e) => {
            msg += `🏟️ ${e.strHomeTeam} ${e.intHomeScore || "?"} - ${e.intAwayScore || "?"} ${e.strAwayTeam}\n`;
            msg += `   📅 ${e.dateEvent}\n\n`;
          });
          await m.reply(msg);
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
