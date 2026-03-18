const config = require("../config");
const { fetchJson, fetchBuffer, sendImageOrText, replyLongText } = require("../lib/helpers");

const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";

const LEAGUE_CATALOG = [
  {
    key: "premier league",
    display: "Premier League",
    espnCode: "eng.1",
    sportsDbCode: "PL",
    sportsDbId: "4328",
    aliases: ["premier league", "premier", "epl", "pl", "english league", "england"],
  },
  {
    key: "la liga",
    display: "La Liga",
    espnCode: "esp.1",
    sportsDbCode: "PD",
    sportsDbId: "4335",
    aliases: ["la liga", "laliga", "spanish league", "spain"],
  },
  {
    key: "bundesliga",
    display: "Bundesliga",
    espnCode: "ger.1",
    sportsDbCode: "BL1",
    sportsDbId: "4331",
    aliases: ["bundesliga", "german league", "germany"],
  },
  {
    key: "serie a",
    display: "Serie A",
    espnCode: "ita.1",
    sportsDbCode: "SA",
    sportsDbId: "4332",
    aliases: ["serie a", "seriea", "italian league", "italy"],
  },
  {
    key: "ligue 1",
    display: "Ligue 1",
    espnCode: "fra.1",
    sportsDbCode: "FL1",
    sportsDbId: "4334",
    aliases: ["ligue 1", "ligue1", "french league", "france"],
  },
  {
    key: "uefa europa league",
    display: "UEFA Europa League",
    espnCode: "uefa.europa",
    sportsDbCode: "EL",
    sportsDbId: "4481",
    aliases: ["europa league", "uel", "uefa europa", "europa"],
  },
  {
    key: "uefa conference league",
    display: "UEFA Conference League",
    espnCode: "uefa.europa.conf",
    sportsDbCode: "UECL",
    sportsDbId: "100819",
    aliases: ["conference league", "uecl", "uefa conference"],
  },
  {
    key: "eredvisie",
    display: "Eredivisie",
    espnCode: "ned.1",
    sportsDbCode: "DED",
    sportsDbId: "4337",
    aliases: ["eredvisie", "dutch league", "netherlands league", "holland league"],
  },
  {
    key: "primeira liga",
    display: "Primeira Liga",
    espnCode: "por.1",
    sportsDbCode: "PPL",
    sportsDbId: "4344",
    aliases: ["primeira liga", "portuguese league", "liga portugal", "portugal league"],
  },
  {
    key: "major league soccer",
    display: "Major League Soccer",
    espnCode: "usa.1",
    sportsDbCode: "MLS",
    sportsDbId: "4346",
    aliases: ["mls", "major league soccer", "usa league", "us league"],
  },
  {
    key: "brasileirao",
    display: "Brasileirao Serie A",
    espnCode: "bra.1",
    sportsDbCode: "BSA",
    sportsDbId: "4351",
    aliases: ["brasileirao", "brazil serie a", "brazilian league", "serie a brazil"],
  },
  {
    key: "argentina primera division",
    display: "Argentina Primera Division",
    espnCode: "arg.1",
    sportsDbCode: "AR1N",
    sportsDbId: "4406",
    aliases: ["argentina league", "primera division argentina", "argentina primera", "liga argentina"],
  },
  {
    key: "j1 league",
    display: "J1 League",
    espnCode: "jpn.1",
    sportsDbCode: "JPN1",
    sportsDbId: "4420",
    aliases: ["j1", "j1 league", "japan league", "j league"],
  },
  {
    key: "k league 1",
    display: "K League 1",
    espnCode: "kor.1",
    sportsDbCode: "KOR1",
    sportsDbId: "4767",
    aliases: ["k league", "k league 1", "korea league", "south korea league"],
  },
  {
    key: "a league",
    display: "A-League",
    espnCode: "aus.1",
    sportsDbCode: "AL",
    sportsDbId: "4356",
    aliases: ["a league", "a-league", "australia league", "australian league"],
  },
  {
    key: "south african premier division",
    display: "South African Premier Division",
    espnCode: "rsa.1",
    sportsDbCode: "SAPL",
    sportsDbId: "4798",
    aliases: ["psl", "south africa league", "south african league", "south african premier division"],
  },
  {
    key: "caf champions league",
    display: "CAF Champions League",
    espnCode: "caf.champions",
    sportsDbCode: "CAFCL",
    sportsDbId: "105521",
    aliases: ["caf champions league", "caf cl", "africa champions league"],
  },
  {
    key: "afc champions league",
    display: "AFC Champions League",
    espnCode: "afc.champions",
    sportsDbCode: "AFCCL",
    sportsDbId: "105552",
    aliases: ["afc champions league", "afc cl", "asia champions league"],
  },
  {
    key: "champions league",
    display: "UEFA Champions League",
    espnCode: "uefa.champions",
    sportsDbCode: "CL",
    sportsDbId: "4480",
    aliases: ["champions league", "ucl", "cl", "uefa champions"],
  },
];

function normalizeLeagueText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let sportsDbLeagueCache = null;
let sportsDbLeagueCacheAt = 0;

async function getSportsDbSoccerLeagues() {
  const now = Date.now();
  if (sportsDbLeagueCache && now - sportsDbLeagueCacheAt < 30 * 60 * 1000) {
    return sportsDbLeagueCache;
  }

  const data = await fetchJson(`${SPORTSDB_BASE}/all_leagues.php`).catch(() => null);
  const leagues = Array.isArray(data?.leagues)
    ? data.leagues
        .filter((row) => String(row?.strSport || "").toLowerCase() === "soccer")
        .map((row) => ({
          sportsDbId: String(row.idLeague || "").trim(),
          display: String(row.strLeague || "").trim(),
          altDisplay: String(row.strLeagueAlternate || "").trim(),
        }))
        .filter((row) => row.sportsDbId && row.display)
    : [];

  sportsDbLeagueCache = leagues;
  sportsDbLeagueCacheAt = now;
  return leagues;
}

async function searchSportsDbLeague(text) {
  const cleaned = normalizeLeagueText(text);
  if (!cleaned) return null;

  const indexed = await getSportsDbSoccerLeagues();
  let best = null;
  for (const row of indexed) {
    const n1 = normalizeLeagueText(row.display);
    const n2 = normalizeLeagueText(row.altDisplay);
    if (n1 === cleaned || (n2 && n2 === cleaned)) {
      return {
        key: n1 || cleaned,
        display: row.display,
        sportsDbId: row.sportsDbId,
        espnCode: null,
        aliases: [n1, n2].filter(Boolean),
      };
    }
    const score = Math.max(
      n1.includes(cleaned) ? cleaned.length : 0,
      cleaned.includes(n1) ? n1.length : 0,
      n2 && n2.includes(cleaned) ? cleaned.length - 1 : 0,
      n2 && cleaned.includes(n2) ? n2.length - 1 : 0
    );
    if (score > 3 && (!best || score > best.score)) {
      best = { score, row };
    }
  }

  if (best?.row) {
    return {
      key: normalizeLeagueText(best.row.display),
      display: best.row.display,
      sportsDbId: best.row.sportsDbId,
      espnCode: null,
      aliases: [normalizeLeagueText(best.row.display), normalizeLeagueText(best.row.altDisplay)].filter(Boolean),
    };
  }

  const direct = await fetchJson(`${SPORTSDB_BASE}/search_all_leagues.php?l=${encodeURIComponent(text)}`).catch(() => null);
  const found = (direct?.countries || []).find((row) => String(row?.strSport || "").toLowerCase() === "soccer");
  if (!found?.idLeague) {
    const byCountry = await fetchJson(`${SPORTSDB_BASE}/search_all_leagues.php?c=${encodeURIComponent(text)}`).catch(() => null);
    const countryFound = (byCountry?.countries || []).find((row) => String(row?.strSport || "").toLowerCase() === "soccer");
    if (!countryFound?.idLeague) return null;
    return {
      key: normalizeLeagueText(countryFound.strLeague),
      display: countryFound.strLeague,
      sportsDbId: String(countryFound.idLeague),
      espnCode: null,
      aliases: [normalizeLeagueText(countryFound.strLeague), normalizeLeagueText(countryFound.strLeagueAlternate)].filter(Boolean),
    };
  }
  return {
    key: normalizeLeagueText(found.strLeague),
    display: found.strLeague,
    sportsDbId: String(found.idLeague),
    espnCode: null,
    aliases: [normalizeLeagueText(found.strLeague), normalizeLeagueText(found.strLeagueAlternate)].filter(Boolean),
  };
}

async function resolveLeague(text) {
  const cleaned = normalizeLeagueText(text);
  const fallback = LEAGUE_CATALOG[0];
  if (!cleaned) return fallback;

  const idMatch = cleaned.match(/^(?:id\s*)?(\d{3,7})$/);
  if (idMatch) {
    return {
      key: `id:${idMatch[1]}`,
      display: `League ID ${idMatch[1]}`,
      sportsDbId: idMatch[1],
      espnCode: null,
      aliases: [],
    };
  }

  const byExact = LEAGUE_CATALOG.find((league) =>
    league.aliases.some((alias) => cleaned === alias)
  );
  if (byExact) return byExact;

  const candidates = [];
  for (const league of LEAGUE_CATALOG) {
    for (const alias of league.aliases) {
      if (cleaned.includes(alias)) {
        candidates.push({ league, score: alias.length });
      }
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].league;
  }

  const dynamic = await searchSportsDbLeague(cleaned);
  if (dynamic) return dynamic;

  return fallback;
}

async function buildSportsDbScoreFallback(league) {
  if (!league?.sportsDbId) return [];
  const [recent, upcoming] = await Promise.all([
    fetchJson(`${SPORTSDB_BASE}/eventspastleague.php?id=${league.sportsDbId}`).catch(() => null),
    fetchJson(`${SPORTSDB_BASE}/eventsnextleague.php?id=${league.sportsDbId}`).catch(() => null),
  ]);

  const recentEvents = (recent?.events || []).slice(0, 10).map((e) => ({
    state: "post",
    home: e.strHomeTeam,
    away: e.strAwayTeam,
    homeScore: e.intHomeScore ?? "-",
    awayScore: e.intAwayScore ?? "-",
    status: e.dateEvent || "Finished",
    venue: e.strVenue || "",
  }));

  const upcomingEvents = (upcoming?.events || []).slice(0, 10).map((e) => ({
    state: "pre",
    home: e.strHomeTeam,
    away: e.strAwayTeam,
    homeScore: "-",
    awayScore: "-",
    status: `${e.dateEvent || "TBD"} ${e.strTime || ""}`.trim(),
    venue: e.strVenue || "",
  }));

  return [...recentEvents, ...upcomingEvents];
}

function flattenEspnStandings(data) {
  const items = [];

  function fromEntry(entry) {
    const team = entry?.team || {};
    const statMap = {};
    for (const stat of entry?.stats || []) {
      if (!stat?.name) continue;
      statMap[String(stat.name).toLowerCase()] = stat;
    }

    const getNum = (name, fallbackName = "") => {
      const found = statMap[name] || (fallbackName ? statMap[fallbackName] : null);
      const raw = found?.value ?? found?.displayValue;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) ? n : 0;
    };

    items.push({
      rank: getNum("rank", "standings"),
      teamName: team?.shortDisplayName || team?.displayName || team?.name || "Unknown",
      played: getNum("gamesplayed", "played"),
      win: getNum("wins", "win"),
      draw: getNum("ties", "draw"),
      loss: getNum("losses", "loss"),
      points: getNum("points", "pts"),
    });
  }

  for (const child of data?.children || []) {
    for (const standing of child?.standings?.entries || []) {
      fromEntry(standing);
    }
  }
  for (const standing of data?.standings?.entries || []) {
    fromEntry(standing);
  }

  return items
    .filter((entry) => entry.teamName && (entry.played > 0 || entry.rank > 0))
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
}

const commands = [
  {
    name: ["score", "livescore", "scores"],
    category: "sports",
    desc: "Get live football scores",
    handler: async (sock, m, { text }) => {
      m.react("⚽");
      try {
        const league = await resolveLeague(text);
        const url = league.espnCode
          ? `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/scoreboard`
          : "";

        const data = url ? await fetchJson(url).catch(() => null) : null;
        if (data?.events?.length) {
          let msg = `⚽ *LIVE & RECENT SCORES*\n\n`;
          msg += `🏆 ${data.leagues?.[0]?.name || league.display}\n`;
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
          const fallbackEvents = await buildSportsDbScoreFallback(league);
          if (fallbackEvents.length) {
            let msg = `⚽ *LEAGUE MATCHES*\n\n`;
            msg += `🏆 ${league.display}\n\n`;
            for (const match of fallbackEvents) {
              const stateIcon = match.state === "in" ? "🟢" : match.state === "post" ? "🏁" : "⏳";
              msg += `${stateIcon} *${match.home}* ${match.homeScore} — *${match.away}* ${match.awayScore}\n`;
              msg += `⏰ ${match.status || "TBD"}\n`;
              if (match.venue) msg += `🏟️ ${match.venue}\n`;
              msg += `\n`;
            }
            msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
            await replyLongText(m, msg);
          } else {
            await m.reply(`⏳ No matches found for "${league.display}" right now.\n\n💡 You can also use a league ID, e.g. ${config.PREFIX}league 4328`);
          }
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
        const league = await resolveLeague(text);
        const espnData = league.espnCode
          ? await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/scoreboard`).catch(() => null)
          : null;
        const espnEvents = (espnData?.events || []).filter((match) => {
          const state = match?.status?.type?.state;
          return state === "pre" || state === "in";
        });

        let events = [];
        if (espnEvents.length) {
          events = espnEvents.slice(0, 20).map((match) => {
            const comp = match?.competitions?.[0] || {};
            const home = (comp.competitors || []).find((c) => c.homeAway === "home") || (comp.competitors || [])[0] || {};
            const away = (comp.competitors || []).find((c) => c.homeAway === "away") || (comp.competitors || [])[1] || {};
            return {
              strLeague: espnData?.leagues?.[0]?.name || league.display,
              strHomeTeam: home?.team?.shortDisplayName || home?.team?.displayName || "Home",
              strAwayTeam: away?.team?.shortDisplayName || away?.team?.displayName || "Away",
              dateEvent: match?.date ? new Date(match.date).toISOString().slice(0, 10) : "TBD",
              strTime: match?.date ? new Date(match.date).toISOString().slice(11, 16) : "TBD",
              strVenue: comp?.venue?.fullName || "",
              intRound: comp?.type?.abbreviation || comp?.type?.shortDetail || "",
            };
          });
        }

        if (!events.length) {
          const data = await fetchJson(`${SPORTSDB_BASE}/eventsnextleague.php?id=${league.sportsDbId}`).catch(() => null);
          events = data?.events || [];
        }

        if (events.length) {
          let msg = `📅 *UPCOMING FIXTURES*\n\n`;
          msg += `🏆 League: ${events[0]?.strLeague || league.display}\n\n`;
          events.slice(0, 20).forEach((e, i) => {
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
          await m.reply(`📅 No upcoming fixtures found for "${league.display}".`);
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
        const league = await resolveLeague(text);
        const date = new Date();
        const startYear = date.getMonth() < 7 ? date.getFullYear() - 1 : date.getFullYear();
        const season = `${startYear}-${startYear + 1}`;
        const espnStandingRaw = league.espnCode
          ? await fetchJson(`https://site.api.espn.com/apis/v2/sports/soccer/${league.espnCode}/standings`).catch(() => null)
          : null;
        let table = flattenEspnStandings(espnStandingRaw);

        if (!table.length || table.length < 10) {
          let data = await fetchJson(`${SPORTSDB_BASE}/lookuptable.php?l=${league.sportsDbId}&s=${season}`).catch(() => null);
          if (!data?.table?.length || data.table.length < 10) {
            const fallback = await fetchJson(`${SPORTSDB_BASE}/lookuptable.php?l=${league.sportsDbId}`).catch(() => null);
            if (fallback?.table?.length) data = fallback;
          }
          table = (data?.table || []).map((t) => ({
            rank: Number.parseInt(t.intRank, 10) || 0,
            teamName: t.strTeam || "???",
            played: Number.parseInt(t.intPlayed, 10) || 0,
            win: Number.parseInt(t.intWin, 10) || 0,
            draw: Number.parseInt(t.intDraw, 10) || 0,
            loss: Number.parseInt(t.intLoss, 10) || 0,
            points: Number.parseInt(t.intPoints, 10) || 0,
            leagueName: t.strLeague,
          }));
        }

        if (table.length) {
          let msg = `🏆 *LEAGUE STANDINGS*\n\n`;
          msg += `🏆 ${table[0]?.leagueName || espnStandingRaw?.name || league.display}\n`;
          msg += `📅 Season: ${season}\n\n`;
          msg += `*# Team | P W D L | Pts*\n`;
          table.forEach((t) => {
            const name = t.teamName || "???";
            const pos = String(t.rank || 0).padStart(2);
            msg += `${pos}. ${name} | ${t.played} ${t.win} ${t.draw} ${t.loss} | *${t.points}*\n`;
          });
          msg += `\n`;
          msg += `_${config.BOT_NAME} | Powered by Desam Tech_ ⚡`;
          await replyLongText(m, msg);
        } else {
          await m.reply(`❌ Standings not found for "${league.display}". Try: premier league, la liga, bundesliga, serie a, ligue 1`);
        }
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("⏳ The Standings API is currently overloaded.");
      }
    },
  },
  {
    name: ["leagues", "findleague", "leaguefind"],
    category: "sports",
    desc: "Search football leagues worldwide",
    handler: async (sock, m, { text }) => {
      const query = normalizeLeagueText(text);
      if (!query) {
        const sample = LEAGUE_CATALOG.slice(0, 15).map((l, i) => `${i + 1}. ${l.display}`).join("\n");
        return m.reply(`🌍 *League Search*\n\nUsage: ${config.PREFIX}leagues <league name>\nExample: ${config.PREFIX}leagues egypt\n\nPopular leagues:\n${sample}`);
      }

      m.react("⚽");
      try {
        const all = await getSportsDbSoccerLeagues();
        let matches = all.filter((row) => {
          const n1 = normalizeLeagueText(row.display);
          const n2 = normalizeLeagueText(row.altDisplay);
          return n1.includes(query) || query.includes(n1) || (n2 && (n2.includes(query) || query.includes(n2)));
        }).slice(0, 50);

        if (!matches.length) {
          const countryData = await fetchJson(`${SPORTSDB_BASE}/search_all_leagues.php?c=${encodeURIComponent(text)}`).catch(() => null);
          matches = (countryData?.countries || [])
            .filter((row) => String(row?.strSport || "").toLowerCase() === "soccer")
            .map((row) => ({
              sportsDbId: String(row.idLeague || "").trim(),
              display: String(row.strLeague || "").trim(),
              altDisplay: String(row.strLeagueAlternate || "").trim(),
            }))
            .filter((row) => row.sportsDbId && row.display)
            .slice(0, 50);
        }

        if (!matches.length) {
          return m.reply(`❌ No leagues found for "${text}".`);
        }

        let msg = `🌍 *Leagues Found*\n\n`;
        for (const [idx, league] of matches.entries()) {
          msg += `${idx + 1}. *${league.display}*\n`;
          if (league.altDisplay) msg += `   aka: ${league.altDisplay}\n`;
          msg += `   id: ${league.sportsDbId}\n`;
        }
        msg += `\nUse the ID with commands, e.g. ${config.PREFIX}league ${matches[0].sportsDbId}`;
        await replyLongText(m, msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Could not search leagues right now.");
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
