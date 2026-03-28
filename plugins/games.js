const config = require("../config");
const { pickNonRepeating, fetchJson } = require("../lib/helpers");

let _opentdbToken = null;
let _opentdbTokenExpiry = 0;

async function acquireOpentdbToken() {
  if (_opentdbToken && Date.now() < _opentdbTokenExpiry) return _opentdbToken;
  try {
    const res = await fetchJson("https://opentdb.com/api_token.php?command=request", { timeout: 10000 });
    if (res?.token) {
      _opentdbToken = res.token;
      _opentdbTokenExpiry = Date.now() + 6 * 3600 * 1000;
      return res.token;
    }
  } catch {}
  _opentdbToken = null;
  return null;
}

const tttGames = new Map();

class TicTacToe {
  constructor(player1, player2) {
    this.board = [" ", " ", " ", " ", " ", " ", " ", " ", " "];
    this.players = [player1, player2];
    this.symbols = ["❌", "⭕"];
    this.currentTurn = 0;
    this.winner = null;
    this.draw = false;
  }
  display() {
    const b = this.board.map((c, i) => c === " " ? `${i + 1}️⃣` : c);
    return `${b[0]}│${b[1]}│${b[2]}\n─┼─┼─\n${b[3]}│${b[4]}│${b[5]}\n─┼─┼─\n${b[6]}│${b[7]}│${b[8]}`;
  }
  play(pos, player) {
    if (this.winner || this.draw) return "Game over";
    if (player !== this.players[this.currentTurn]) return "Not your turn";
    const idx = pos - 1;
    if (idx < 0 || idx > 8 || this.board[idx] !== " ") return "Invalid move";
    this.board[idx] = this.symbols[this.currentTurn];
    if (this.checkWin()) { this.winner = player; return "win"; }
    if (this.board.every((c) => c !== " ")) { this.draw = true; return "draw"; }
    this.currentTurn = 1 - this.currentTurn;
    return "ok";
  }
  checkWin() {
    const w = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    return w.some(([a, b, c]) => this.board[a] !== " " && this.board[a] === this.board[b] && this.board[b] === this.board[c]);
  }
}

const truthQuestions = [
  "What's your most embarrassing moment?", "What's the biggest lie you've ever told?",
  "What's your biggest fear?", "What's the weirdest dream you've had?",
  "Who was your first crush?", "What's something you've never told anyone?",
  "What's the worst thing you've done?", "What's your guilty pleasure?",
  "If you could change one thing about yourself, what would it be?",
  "What's the most childish thing you still do?", "What secret talent do you have?",
  "What's the longest you've gone without showering?", "What's your biggest insecurity?",
  "Who do you secretly find attractive in this group?", "What's the worst date you've been on?",
  "What's the most embarrassing thing in your search history?", "What's a secret you kept from your parents?",
  "If you could swap lives with someone for a day, who would it be?",
  "What's the most trouble you've gotten into?", "What's your weirdest habit?",
  "What's one thing you pretend to like but actually don't?",
  "Which app do you waste the most time on?",
  "What's your most regrettable impulse buy?",
  "What rumor about you is actually true?",
  "What's one goal you keep postponing?",
  "What's the most awkward DM you've ever sent?",
  "What's your most irrational fear?",
  "What's one thing you'd never post publicly?",
];

const dareActions = [
  "Send a voice note singing your favorite song!", "Change your profile picture for 1 hour!",
  "Text your crush right now!", "Do 20 push-ups and send a video!",
  "Post something embarrassing on your status!", "Send a selfie without any filter!",
  "Talk in an accent for the next 10 messages!", "Let someone in the group text from your phone!",
  "Share the last photo in your gallery!", "Call someone random and say 'I love you'!",
  "Don't use emojis for the next hour!", "Send your most recent photo!",
  "Record yourself doing a funny dance!", "Share your screen time report!",
  "Set your status to something embarrassing for 30 minutes!", "Send the 5th photo in your gallery!",
  "Type a message with your eyes closed!", "Rate everyone in this group out of 10!",
  "Share the last YouTube video you watched!", "Do your best impression of a celebrity!",
  "Use only voice notes for your next 3 messages!",
  "Send a one-line rap about your day!",
  "Let the group choose your next status caption!",
  "Describe your mood using only 3 emojis!",
  "Say something nice about each person who replies next!",
  "Send a selfie in black-and-white mode!",
  "Write a mini poem in 20 seconds!",
  "Post your current battery percentage in chat!",
];

const wouldYouRatherOptions = [
  ["be able to fly", "be invisible"],
  ["live in the past", "live in the future"],
  ["be rich and unhappy", "be poor and happy"],
  ["have no internet", "have no friends"],
  ["never eat pizza again", "never eat chocolate again"],
  ["be famous", "be the best friend of a famous person"],
  ["always be cold", "always be hot"],
  ["have super strength", "have super speed"],
  ["live without music", "live without movies"],
  ["be the funniest person in the room", "be the smartest person in the room"],
  ["have unlimited money", "unlimited knowledge"],
  ["travel to space", "travel to the bottom of the ocean"],
  ["speak all languages", "play all instruments"],
  ["live forever", "live a short but perfect life"],
  ["be able to read minds", "be able to see the future"],
  ["lose all your old memories", "never make new memories"],
  ["work your dream job for low pay", "work a boring job for high pay"],
  ["have free travel forever", "have free food forever"],
  ["be respected by everyone", "be loved by everyone"],
  ["always know when someone is lying", "always make people trust you"],
  ["give up music", "give up movies"],
];

const riddles = [
  { q: "What has keys but no locks?", a: "A piano" },
  { q: "What has a head and a tail but no body?", a: "A coin" },
  { q: "What gets wetter the more it dries?", a: "A towel" },
  { q: "What can you break without touching it?", a: "A promise" },
  { q: "What goes up but never comes down?", a: "Your age" },
  { q: "What has many teeth but can't bite?", a: "A comb" },
  { q: "What can travel around the world while staying in a corner?", a: "A stamp" },
  { q: "What has one eye but can't see?", a: "A needle" },
  { q: "What has hands but can't clap?", a: "A clock" },
  { q: "What can you hold without touching it?", a: "A conversation" },
  { q: "What is full of holes but still holds water?", a: "A sponge" },
  { q: "What runs but never walks?", a: "Water" },
  { q: "What is always coming but never arrives?", a: "Tomorrow" },
  { q: "What has a neck but no head?", a: "A bottle" },
  { q: "What can be cracked, made, told, and played?", a: "A joke" },
  { q: "The more you take, the more you leave behind. What am I?", a: "Footsteps" },
  { q: "What has cities, but no houses; forests, but no trees; and water, but no fish?", a: "A map" },
  { q: "What can fill a room but takes up no space?", a: "Light" },
];

const baseCommands = [
  {
    name: ["tictactoe", "ttt"],
    category: "fun",
    desc: "Play Tic Tac Toe",
    handler: async (sock, m, { args }) => {
      const sub = args[0];
      if (!sub) {
        const target = m.mentions[0];
        if (!target) return m.usageReply("ttt @player", "ttt @player", [], "Use .ttt <1-9> to make a move during a game");
        const gameId = m.isGroup ? m.chat : [m.sender, target].sort().join("-");
        if (tttGames.has(gameId)) return m.reply("A game is already in progress! Use .ttt end to finish it.");
        const game = new TicTacToe(m.sender, target);
        tttGames.set(gameId, game);
        await sock.sendMessage(m.chat, {
          text: `🎮 *Tic Tac Toe*\n\n${game.display()}\n\n❌ @${m.sender.split("@")[0]}\n⭕ @${target.split("@")[0]}\n\n❌'s turn! Type ${config.PREFIX}ttt <1-9>`,
          mentions: [m.sender, target],
        });
        return;
      }
      if (sub === "end" || sub === "quit") {
        const gameId = m.isGroup ? m.chat : [...tttGames.keys()].find((k) => k.includes(m.sender)) || "";
        if (tttGames.has(gameId)) {
          tttGames.delete(gameId);
          return m.reply("🎮 Game ended!");
        }
        return m.reply("No active game found.");
      }
      const pos = parseInt(sub);
      if (pos >= 1 && pos <= 9) {
        const gameId = m.isGroup ? m.chat : [...tttGames.keys()].find((k) => k.includes(m.sender)) || "";
        const game = tttGames.get(gameId);
        if (!game) return m.reply("No active game! Start one with .ttt @player");
        const result = game.play(pos, m.sender);
        if (result === "Not your turn") return m.reply("⏳ It's not your turn!");
        if (result === "Invalid move") return m.reply("❌ Invalid move! Choose an empty spot (1-9).");
        if (result === "win") {
          tttGames.delete(gameId);
          return sock.sendMessage(m.chat, {
            text: `🎮 *Tic Tac Toe*\n\n${game.display()}\n\n🏆 @${m.sender.split("@")[0]} wins!`,
            mentions: game.players,
          });
        }
        if (result === "draw") {
          tttGames.delete(gameId);
          return sock.sendMessage(m.chat, {
            text: `🎮 *Tic Tac Toe*\n\n${game.display()}\n\n🤝 It's a draw!`,
            mentions: game.players,
          });
        }
        const nextPlayer = game.players[game.currentTurn];
        return sock.sendMessage(m.chat, {
          text: `🎮 *Tic Tac Toe*\n\n${game.display()}\n\n${game.symbols[game.currentTurn]} @${nextPlayer.split("@")[0]}'s turn!`,
          mentions: game.players,
        });
      }
    },
  },
  {
    name: ["truth"],
    category: "fun",
    desc: "Get a truth question",
    handler: async (sock, m) => {
      const q = pickNonRepeating(truthQuestions, `${m.chat}:truth`, { maxHistory: 8 });
      await m.reply(`🤔 *Truth Challenge*\n\n${q}\n\n_Reply honestly or type ${config.PREFIX}dare for a challenge._`);
    },
  },
  {
    name: ["dare"],
    category: "fun",
    desc: "Get a dare challenge",
    handler: async (sock, m) => {
      const d = pickNonRepeating(dareActions, `${m.chat}:dare`, { maxHistory: 8 });
      await m.reply(`😈 *Dare Challenge*\n\n${d}\n\n_Type ${config.PREFIX}truth for a question instead._`);
    },
  },
  {
    name: ["tod", "truthordare"],
    category: "fun",
    desc: "Random truth or dare",
    handler: async (sock, m) => {
      const mode = pickNonRepeating(["truth", "dare"], `${m.chat}:tod-mode`, { maxHistory: 1 });
      if (mode === "truth") {
        const q = pickNonRepeating(truthQuestions, `${m.chat}:truth`, { maxHistory: 8 });
        await m.reply(`🤔 *Truth Challenge*\n\n${q}`);
      } else {
        const d = pickNonRepeating(dareActions, `${m.chat}:dare`, { maxHistory: 8 });
        await m.reply(`😈 *Dare Challenge*\n\n${d}`);
      }
    },
  },
  {
    name: ["wyr", "wouldyourather"],
    category: "fun",
    desc: "Would you rather",
    handler: async (sock, m) => {
      const opt = pickNonRepeating(wouldYouRatherOptions, `${m.chat}:wyr`, { maxHistory: 8 });
      await m.reply(`🤔 *Would You Rather*\n\nA) ${opt[0]}\n\nB) ${opt[1]}\n\n_Vote with A or B in chat._`);
    },
  },
  {
    name: ["trivia", "quiz"],
    category: "fun",
    desc: "Answer a trivia question",
    handler: async (sock, m) => {
      m.react("🧠");
      try {
        const token = await acquireOpentdbToken();
        const apiUrl = token
          ? `https://opentdb.com/api.php?amount=1&type=multiple&token=${token}`
          : "https://opentdb.com/api.php?amount=1&type=multiple";
        let data = await fetchJson(apiUrl);
        if (data?.response_code === 4) {
          _opentdbToken = null;
          _opentdbTokenExpiry = 0;
          data = await fetchJson("https://opentdb.com/api.php?amount=1&type=multiple");
        }
        if (!data?.results?.[0]) return m.errorReply("Failed to get trivia. Please try again.");
        const q = data.results[0];
        const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
        const answers = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5).map(decode);
        const correct = decode(q.correct_answer);
        const labels = ["A", "B", "C", "D"];
        let msg = `🧠 *Trivia* (${decode(q.category)})\n`;
        msg += `Difficulty: ${q.difficulty}\n\n`;
        msg += `❓ ${decode(q.question)}\n\n`;
        answers.forEach((a, i) => { msg += `${labels[i]}) ${a}\n`; });
        msg += `\n_Reply with the letter of your answer!_`;
        await m.reply(msg);
        setTimeout(async () => {
          const idx = answers.indexOf(correct);
          await sock.sendMessage(m.chat, { text: `✅ The correct answer was: *${labels[idx]}) ${correct}*` });
        }, 15000);
      } catch {
        m.react("❌");
        return m.apiErrorReply("Trivia");
      }
    },
  },
  {
    name: ["riddle"],
    category: "fun",
    desc: "Get a riddle",
    handler: async (sock, m) => {
      const r = pickNonRepeating(riddles, `${m.chat}:riddle`, { maxHistory: 8 });
      await m.reply(`🧩 *Riddle*\n\n${r.q}\n\n_Answer will be revealed in 15 seconds..._`);
      setTimeout(async () => {
        await sock.sendMessage(m.chat, { text: `✅ Answer: *${r.a}*` });
      }, 15000);
    },
  },
  {
    name: ["rps", "rockpaperscissors"],
    category: "fun",
    desc: "Play Rock Paper Scissors",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("rps rock/paper/scissors");
      const choices = ["rock", "paper", "scissors"];
      const emojis = { rock: "🪨", paper: "📄", scissors: "✂️" };
      const userChoice = text.toLowerCase();
      if (!choices.includes(userChoice)) return m.reply("Choose: rock, paper, or scissors");
      const botChoice = choices[Math.floor(Math.random() * 3)];
      let result;
      if (userChoice === botChoice) result = "🤝 It's a tie!";
      else if ((userChoice === "rock" && botChoice === "scissors") || (userChoice === "paper" && botChoice === "rock") || (userChoice === "scissors" && botChoice === "paper")) result = "🎉 You win!";
      else result = "😔 You lose!";
      await m.reply(`🎮 *Rock Paper Scissors*\n\nYou: ${emojis[userChoice]} ${userChoice}\nBot: ${emojis[botChoice]} ${botChoice}\n\n${result}`);
    },
  },
  {
    name: ["slot", "slots"],
    category: "fun",
    desc: "Play slot machine",
    handler: async (sock, m) => {
      const symbols = ["🍎", "🍊", "🍋", "🍇", "🍒", "💎", "7️⃣", "⭐"];
      const r = () => symbols[Math.floor(Math.random() * symbols.length)];
      const s1 = r(), s2 = r(), s3 = r();
      let result = "";
      if (s1 === s2 && s2 === s3) result = "🎉 JACKPOT! All three match!";
      else if (s1 === s2 || s2 === s3 || s1 === s3) result = "😊 Two matched! Close one!";
      else result = "😔 No match. Try again!";
      await m.reply(`🎰 *Slot Machine*\n\n${s1}  ${s2}  ${s3}\n\n${result}`);
    },
  },
  {
    name: ["pickone", "choose", "random"],
    category: "fun",
    desc: "Pick random item from list",
    handler: async (sock, m, { text }) => {
      if (!text || !text.includes(",")) return m.usageReply("choose option1, option2, option3");
      const options = text.split(",").map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) return m.reply("Provide at least 2 options separated by commas.");
      const picked = pickNonRepeating(options, `${m.chat}:pickone:${options.join("|").toLowerCase()}`, { maxHistory: Math.min(3, options.length - 1) });
      await m.reply(`🎲 *Random Pick*\n\nOptions: ${options.join(", ")}\n\n🎯 I choose: *${picked}*`);
    },
  },
  {
    name: ["lovemeter", "love", "ship"],
    category: "fun",
    desc: "Love meter between two people",
    handler: async (sock, m) => {
      if (m.mentions.length < 2) return m.reply(`Tag two people! ${config.PREFIX}love @person1 @person2`);
      const percentage = Math.floor(Math.random() * 101);
      let hearts = "";
      if (percentage >= 80) hearts = "💕💕💕💕💕";
      else if (percentage >= 60) hearts = "💕💕💕💕";
      else if (percentage >= 40) hearts = "💕💕💕";
      else if (percentage >= 20) hearts = "💕💕";
      else hearts = "💔";
      const bar = "█".repeat(Math.floor(percentage / 10)) + "░".repeat(10 - Math.floor(percentage / 10));
      await sock.sendMessage(m.chat, {
        text: `💘 *Love Meter*\n\n@${m.mentions[0].split("@")[0]} ❤️ @${m.mentions[1].split("@")[0]}\n\n[${bar}] ${percentage}%\n${hearts}\n\n${percentage >= 80 ? "Perfect match! 🎉" : percentage >= 50 ? "There's something there! 😊" : "Maybe just friends... 😅"}`,
        mentions: m.mentions,
      });
    },
  },
  {
    name: ["rate", "howgood"],
    category: "fun",
    desc: "Rate something",
    handler: async (sock, m, { text }) => {
      if (!text) return m.usageReply("rate <something>");
      const rating = Math.floor(Math.random() * 11);
      const stars = "⭐".repeat(Math.min(rating, 5)) + "☆".repeat(Math.max(0, 5 - rating));
      await m.reply(`📊 *Rating*\n\n"${text}"\n\n${stars}\nScore: *${rating}/10*`);
    },
  },
  {
    name: ["hack"],
    category: "fun",
    desc: "Fake hacking prank",
    handler: async (sock, m) => {
      const target = m.mentions[0] || m.quoted?.sender;
      const name = target ? `@${target.split("@")[0]}` : "target";
      const mentions = target ? [target] : [];
      const steps = [
        `🔓 Initiating hack on ${name}...`,
        `📡 Connecting to ${name}'s device...`,
        `🔍 Scanning ports... 80, 443, 8080 open`,
        `📂 Accessing files... Found 1,247 files`,
        `📸 Downloading gallery... 69% complete`,
        `💬 Reading messages... Found secrets 👀`,
        `🔑 Extracting passwords...`,
        `✅ Hack complete! Just kidding 😂\n\n_This is just a prank. ${config.BOT_NAME} doesn't hack anyone!_`,
      ];
      let msg = "";
      for (const step of steps) {
        msg += step + "\n";
      }
      await sock.sendMessage(m.chat, { text: msg, mentions });
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SPELLING CHALLENGE GAME
// ═══════════════════════════════════════════════════════════════════════════

// ── General English: commonly misspelled words ─────────────────────────────
const SPELL_GENERAL = [
  { word:"accommodate",   wrong:"accomodate",    hint:"To provide space or lodgings for someone" },
  { word:"acquaintance",  wrong:"acquaintence",  hint:"A person one knows but not closely" },
  { word:"address",       wrong:"adress",        hint:"Where you live; or to speak to someone" },
  { word:"amateur",       wrong:"amiture",       hint:"Someone who does something without pay" },
  { word:"apparent",      wrong:"aparent",       hint:"Clearly visible or obvious" },
  { word:"argument",      wrong:"arguement",     hint:"A disagreement or a reason given in debate" },
  { word:"beginning",     wrong:"begining",      hint:"The start of something" },
  { word:"believe",       wrong:"beleive",       hint:"To accept something as true" },
  { word:"bizarre",       wrong:"bizzare",       hint:"Very strange or unusual" },
  { word:"calendar",      wrong:"calander",      hint:"A chart showing days, weeks and months" },
  { word:"category",      wrong:"catagory",      hint:"A class or division of things" },
  { word:"cemetery",      wrong:"cemetary",      hint:"A place where the dead are buried" },
  { word:"colleague",     wrong:"collegue",      hint:"A person you work with" },
  { word:"commitment",    wrong:"committment",   hint:"Dedication to a cause or activity" },
  { word:"conceive",      wrong:"concieve",      hint:"To form an idea or become pregnant" },
  { word:"conscience",    wrong:"consciense",    hint:"An inner sense of right and wrong" },
  { word:"conscious",     wrong:"concious",      hint:"Aware of one's surroundings" },
  { word:"consensus",     wrong:"concensus",     hint:"General agreement among a group" },
  { word:"definitely",    wrong:"definately",    hint:"Without doubt; certainly" },
  { word:"dilemma",       wrong:"dilema",        hint:"A difficult choice between two things" },
  { word:"embarrass",     wrong:"embarass",      hint:"To make someone feel awkward or ashamed" },
  { word:"environment",   wrong:"enviroment",    hint:"The natural world around us" },
  { word:"existence",     wrong:"existance",     hint:"The fact of being alive or real" },
  { word:"familiar",      wrong:"familier",      hint:"Well known; often seen or experienced" },
  { word:"fascinate",     wrong:"fasinate",      hint:"To attract and hold attention strongly" },
  { word:"February",      wrong:"Febuary",       hint:"The second month of the year" },
  { word:"foreign",       wrong:"foriegn",       hint:"Relating to another country" },
  { word:"gauge",         wrong:"guage",         hint:"A tool for measuring; also to estimate" },
  { word:"government",    wrong:"goverment",     hint:"The group that rules a country" },
  { word:"grammar",       wrong:"grammer",       hint:"Rules for how a language is used" },
  { word:"guarantee",     wrong:"garantee",      hint:"A formal promise or assurance" },
  { word:"height",        wrong:"hieght",        hint:"How tall someone or something is" },
  { word:"immediately",   wrong:"imediatly",     hint:"Right now; without delay" },
  { word:"independent",   wrong:"independant",   hint:"Not relying on others; free" },
  { word:"intelligence",  wrong:"inteligence",   hint:"The ability to learn and understand" },
  { word:"knowledge",     wrong:"knowlege",      hint:"Facts and information acquired through experience" },
  { word:"lieutenant",    wrong:"leutenant",     hint:"A military officer rank" },
  { word:"lightning",     wrong:"lightening",    hint:"Flash of light during a storm (not lightening)" },
  { word:"maintenance",   wrong:"maintainance",  hint:"The process of keeping something in good condition" },
  { word:"marriage",      wrong:"marrige",       hint:"The legal union of two people" },
  { word:"millennium",    wrong:"millenium",     hint:"A period of one thousand years" },
  { word:"miniature",     wrong:"miniture",      hint:"A very small version of something" },
  { word:"misspell",      wrong:"mispell",       hint:"To spell a word incorrectly — ironic!" },
  { word:"necessary",     wrong:"necesary",      hint:"Needed; required; essential" },
  { word:"neighbor",      wrong:"nieghbor",      hint:"Someone who lives nearby" },
  { word:"occurrence",    wrong:"occurence",     hint:"An event that happens; an incident" },
  { word:"parliament",    wrong:"parliment",     hint:"A legislative body of a country" },
  { word:"persevere",     wrong:"perservere",    hint:"To continue despite difficulty" },
  { word:"phenomenon",    wrong:"phenominon",    hint:"An observable fact or event" },
  { word:"piece",         wrong:"peice",         hint:"A part of something; a slice" },
  { word:"possession",    wrong:"posession",     hint:"Something owned; the act of having" },
  { word:"privilege",     wrong:"priviledge",    hint:"A special right or advantage" },
  { word:"pronunciation", wrong:"pronounciation",hint:"The way a word is spoken" },
  { word:"questionnaire", wrong:"questionaire",  hint:"A set of written questions for gathering information" },
  { word:"receive",       wrong:"recieve",       hint:"To get or accept something given" },
  { word:"recommend",     wrong:"recomend",      hint:"To suggest something as good" },
  { word:"restaurant",    wrong:"resturant",     hint:"A place where you go to eat" },
  { word:"rhythm",        wrong:"rythm",         hint:"A regular repeated pattern of sound or movement" },
  { word:"schedule",      wrong:"shedule",       hint:"A plan for carrying out a process" },
  { word:"scissors",      wrong:"sissors",       hint:"A cutting tool with two blades" },
  { word:"separate",      wrong:"seperate",      hint:"To divide or keep apart" },
  { word:"sergeant",      wrong:"sargeant",      hint:"A police or military rank" },
  { word:"similar",       wrong:"similiar",      hint:"Nearly the same but not identical" },
  { word:"sincerely",     wrong:"sincerly",      hint:"Genuinely; honestly" },
  { word:"successful",    wrong:"succesful",     hint:"Achieving the desired result" },
  { word:"surprise",      wrong:"suprise",       hint:"Something unexpected; to astonish" },
  { word:"temperature",   wrong:"temperture",    hint:"How hot or cold something is" },
  { word:"tomorrow",      wrong:"tommorrow",     hint:"The day after today" },
  { word:"unnecessary",   wrong:"unnecesary",    hint:"Not needed; avoidable" },
  { word:"vacuum",        wrong:"vaccum",        hint:"A space with no air; also a cleaning machine" },
  { word:"Wednesday",     wrong:"Wensday",       hint:"The day between Tuesday and Thursday" },
  { word:"weird",         wrong:"wierd",         hint:"Strange or unusual — 'i before e' exception!" },
  { word:"whether",       wrong:"wether",        hint:"Used to introduce alternatives; not the weather!" },
  { word:"conscience",    wrong:"consience",     hint:"Your moral sense of right and wrong" },
  { word:"discipline",    wrong:"disipline",     hint:"Training to follow rules; a field of study" },
  { word:"eligible",      wrong:"eligable",      hint:"Qualified or suitable to be chosen" },
  { word:"exaggerate",    wrong:"exagerate",     hint:"To make something seem bigger than it is" },
  { word:"excellent",     wrong:"excelent",      hint:"Extremely good; outstanding" },
  { word:"exercise",      wrong:"exersise",      hint:"Physical activity; to practice" },
  { word:"experience",    wrong:"experiance",    hint:"Practical contact with facts or events" },
  { word:"February",      wrong:"Febuary",       hint:"Second month of the year" },
  { word:"necessary",     wrong:"neccesary",     hint:"Something that cannot be done without" },
  { word:"opportunity",   wrong:"oppurtunity",   hint:"A chance to do something beneficial" },
  { word:"parliament",    wrong:"parliment",     hint:"A country's law-making body" },
  { word:"particularly",  wrong:"particulary",   hint:"Especially; to a specific degree" },
  { word:"relevant",      wrong:"relevent",      hint:"Closely connected to the matter at hand" },
  { word:"resistance",    wrong:"resistence",    hint:"The refusal to accept something; opposing force" },
  { word:"stomach",       wrong:"stomache",      hint:"The organ in your body that digests food" },
  { word:"twelfth",       wrong:"twelth",        hint:"The number twelve in ordinal form" },
  { word:"unfortunately", wrong:"unfortunatly",  hint:"Sadly; regrettably" },
  { word:"vegetable",     wrong:"vegatable",     hint:"A plant-based food like carrots or broccoli" },
  { word:"visible",       wrong:"visable",       hint:"Able to be seen" },
  { word:"volunteer",     wrong:"volunter",      hint:"Someone who works without being paid" },
];

// ── Bible People: names that are commonly misspelled ──────────────────────
const SPELL_BIBLE_PEOPLE = [
  { word:"Nebuchadnezzar", wrong:"Nebucadnezzar",  hint:"King of Babylon who conquered Jerusalem",        ref:"Daniel 1:1" },
  { word:"Methuselah",     wrong:"Methusaleh",      hint:"The oldest man in the Bible — lived 969 years",  ref:"Genesis 5:27" },
  { word:"Bartholomew",    wrong:"Bartholomow",     hint:"One of the 12 apostles of Jesus",                ref:"Matthew 10:3" },
  { word:"Nicodemus",      wrong:"Nicodemous",      hint:"The Pharisee who came to Jesus by night",        ref:"John 3:1" },
  { word:"Zacchaeus",      wrong:"Zachaeus",        hint:"Short tax collector who climbed a sycamore tree", ref:"Luke 19:2" },
  { word:"Jehoshaphat",    wrong:"Jehoshapat",      hint:"Righteous king of Judah",                        ref:"1 Kings 22:41" },
  { word:"Habakkuk",       wrong:"Habakuk",         hint:"Minor prophet who questioned God about injustice", ref:"Habakkuk 1:1" },
  { word:"Zechariah",      wrong:"Zachariah",       hint:"Prophet who saw eight visions in one night",     ref:"Zechariah 1:1" },
  { word:"Zephaniah",      wrong:"Zefaniah",        hint:"Minor prophet who spoke of the Day of the LORD", ref:"Zephaniah 1:1" },
  { word:"Obadiah",        wrong:"Obediah",         hint:"Prophet who wrote the shortest book in the OT",  ref:"Obadiah 1:1" },
  { word:"Haggai",         wrong:"Haggi",           hint:"Prophet who urged rebuilding of the temple",     ref:"Haggai 1:1" },
  { word:"Zerubbabel",     wrong:"Zerababel",       hint:"Led the first group of exiles back from Babylon", ref:"Ezra 2:2" },
  { word:"Melchizedek",    wrong:"Melchisedek",     hint:"Priest of God Most High who blessed Abraham",    ref:"Genesis 14:18" },
  { word:"Mephibosheth",   wrong:"Mephibsosheth",   hint:"Jonathan's son; David showed him kindness",      ref:"2 Samuel 9:6" },
  { word:"Bathsheba",      wrong:"Bathsheeba",      hint:"Wife of Uriah; later queen mother of Solomon",   ref:"2 Samuel 11:3" },
  { word:"Jephthah",       wrong:"Jephtha",         hint:"Judge of Israel who made a rash vow",            ref:"Judges 11:1" },
  { word:"Jeremiah",       wrong:"Jerimiah",        hint:"The weeping prophet of the Old Testament",       ref:"Jeremiah 1:1" },
  { word:"Nehemiah",       wrong:"Nehimiah",        hint:"Rebuilt the walls of Jerusalem in 52 days",      ref:"Nehemiah 1:1" },
  { word:"Hezekiah",       wrong:"Hezikiah",        hint:"King of Judah; God healed him and added 15 years", ref:"2 Kings 20:1" },
  { word:"Ezekiel",        wrong:"Ezeikiel",        hint:"Prophet who saw the valley of dry bones",        ref:"Ezekiel 37:1" },
  { word:"Isaiah",         wrong:"Isiah",           hint:"The Messianic prophet; wrote 66 chapters",       ref:"Isaiah 1:1" },
  { word:"Malachi",        wrong:"Malaki",          hint:"Last prophet of the Old Testament",              ref:"Malachi 1:1" },
  { word:"Barnabas",       wrong:"Barnabus",        hint:"Companion of Paul on his first missionary journey", ref:"Acts 13:2" },
  { word:"Cornelius",      wrong:"Corneilius",      hint:"First Gentile to receive the Holy Spirit",       ref:"Acts 10:1" },
  { word:"Philemon",       wrong:"Philamon",        hint:"Slave owner who received a personal letter from Paul", ref:"Philemon 1:1" },
  { word:"Onesimus",       wrong:"Onesemous",       hint:"Runaway slave Paul sent back with a letter",     ref:"Philemon 1:10" },
  { word:"Tychicus",       wrong:"Tichicus",        hint:"Paul's messenger who delivered letters to the churches", ref:"Ephesians 6:21" },
  { word:"Aquila",         wrong:"Aquilla",         hint:"Tentmaker who worked with Paul and Priscilla",   ref:"Acts 18:2" },
  { word:"Priscilla",      wrong:"Prescilla",       hint:"Aquila's wife; taught Apollos the way of God",   ref:"Acts 18:26" },
  { word:"Apollos",        wrong:"Appollos",        hint:"Eloquent Alexandrian who powerfully preached Christ", ref:"Acts 18:24" },
  { word:"Barabbas",       wrong:"Barabas",         hint:"Criminal released instead of Jesus by Pilate",   ref:"Matthew 27:16" },
  { word:"Gamaliel",       wrong:"Gamliel",         hint:"Respected Pharisee and teacher of Paul",         ref:"Acts 22:3" },
  { word:"Abimelech",      wrong:"Abimilech",       hint:"King of Gerar who dealt with Abraham and Isaac", ref:"Genesis 20:2" },
  { word:"Naomi",          wrong:"Naomy",           hint:"Ruth's mother-in-law who returned to Bethlehem", ref:"Ruth 1:2" },
  { word:"Gideon",         wrong:"Gedeon",          hint:"Judge who defeated the Midianites with 300 men", ref:"Judges 7:7" },
  { word:"Rahab",          wrong:"Rahab",           hint:"Innkeeper of Jericho who hid the Israelite spies", ref:"Joshua 2:1" },
  { word:"Deborah",        wrong:"Debora",          hint:"Female judge and prophetess of Israel",           ref:"Judges 4:4" },
  { word:"Abigail",        wrong:"Abigale",         hint:"Wise woman who prevented David from shedding blood", ref:"1 Samuel 25:3" },
  { word:"Jehoshaphat",    wrong:"Jehoshapah",      hint:"King who sent Levites to teach God's law",       ref:"2 Chronicles 17:7" },
  { word:"Epaphroditus",   wrong:"Epaphrodites",    hint:"Brought gifts from Philippi to Paul in prison",  ref:"Philippians 2:25" },
];

// ── Bible Books: book names that people misspell ───────────────────────────
const SPELL_BIBLE_BOOKS = [
  { word:"Ecclesiastes",   wrong:"Eclesiastes",   hint:"OT book containing 'Vanity of vanities, all is vanity'",     ref:"Old Testament" },
  { word:"Thessalonians",  wrong:"Thesalonians",  hint:"Paul's letter to the church in Thessalonica",                ref:"New Testament" },
  { word:"Corinthians",    wrong:"Corintheans",   hint:"Paul's letter to the church in Corinth",                     ref:"New Testament" },
  { word:"Deuteronomy",    wrong:"Deutronomy",    hint:"Fifth book of the Bible; Moses' farewell speeches",          ref:"Old Testament" },
  { word:"Philippians",    wrong:"Phillipians",   hint:"Paul's joyful letter written from prison",                   ref:"New Testament" },
  { word:"Leviticus",      wrong:"Levitcus",      hint:"Third book of Moses; contains ceremonial laws",              ref:"Old Testament" },
  { word:"Galatians",      wrong:"Galations",     hint:"Paul's letter defending justification by faith alone",       ref:"New Testament" },
  { word:"Chronicles",     wrong:"Cronicles",     hint:"Two historical books of the OT",                            ref:"Old Testament" },
  { word:"Lamentations",   wrong:"Lamentaions",   hint:"Jeremiah's lament over the fall of Jerusalem",              ref:"Old Testament" },
  { word:"Colossians",     wrong:"Colosians",     hint:"Paul's letter warning against hollow philosophy",            ref:"New Testament" },
  { word:"Ephesians",      wrong:"Epheseans",     hint:"Paul's letter about the church as the body of Christ",      ref:"New Testament" },
  { word:"Habakkuk",       wrong:"Habakuk",       hint:"OT minor prophet who wrestled with God's justice",           ref:"Old Testament" },
  { word:"Zephaniah",      wrong:"Zefaniah",      hint:"OT minor prophet who warned of the Day of the LORD",         ref:"Old Testament" },
  { word:"Proverbs",       wrong:"Proverbes",     hint:"Wisdom book filled with sayings attributed to Solomon",      ref:"Old Testament" },
  { word:"Nehemiah",       wrong:"Nehimiah",      hint:"OT book about rebuilding Jerusalem's walls",                 ref:"Old Testament" },
  { word:"Revelation",     wrong:"Reveleation",   hint:"Last book of the Bible; John's vision of the end times",    ref:"New Testament" },
  { word:"Zechariah",      wrong:"Zachariah",     hint:"OT book with 14 chapters of messianic prophecy",            ref:"Old Testament" },
  { word:"Obadiah",        wrong:"Obediah",       hint:"Shortest book in the Old Testament",                        ref:"Old Testament" },
  { word:"Malachi",        wrong:"Malaki",        hint:"Last book of the Old Testament",                            ref:"Old Testament" },
  { word:"Ecclesiastes",   wrong:"Eclesiastes",   hint:"OT book that ends: 'Fear God and keep His commandments'",   ref:"Ecclesiastes 12:13" },
];

// ── Bible Places: locations commonly misspelled ────────────────────────────
const SPELL_BIBLE_PLACES = [
  { word:"Bethlehem",      wrong:"Bethlehim",     hint:"City of David; where Jesus was born",                       ref:"Luke 2:4" },
  { word:"Gethsemane",     wrong:"Gethsemani",    hint:"Garden where Jesus prayed before his arrest",               ref:"Matthew 26:36" },
  { word:"Golgotha",       wrong:"Golgatha",      hint:"The Place of the Skull; where Jesus was crucified",         ref:"John 19:17" },
  { word:"Jerusalem",      wrong:"Jeruselem",     hint:"The Holy City; capital of the Israelite kingdom",           ref:"2 Samuel 5:7" },
  { word:"Capernaum",      wrong:"Caperneum",     hint:"City where Jesus based his Galilean ministry",              ref:"Matthew 4:13" },
  { word:"Jericho",        wrong:"Jirecho",       hint:"City whose walls fell when trumpets were blown",            ref:"Joshua 6:20" },
  { word:"Babylon",        wrong:"Babelon",       hint:"Ancient empire where the Jews were taken captive",          ref:"Daniel 1:1" },
  { word:"Canaan",         wrong:"Cannan",        hint:"The Promised Land given to Abraham's descendants",          ref:"Genesis 12:7" },
  { word:"Nineveh",        wrong:"Niniveh",       hint:"Capital of Assyria; where Jonah was sent to preach",        ref:"Jonah 1:2" },
  { word:"Ephesus",        wrong:"Epheseus",      hint:"Major city where Paul spent 3 years; home of Artemis",      ref:"Acts 19:1" },
  { word:"Corinth",        wrong:"Cornith",       hint:"Greek port city where Paul planted a church",               ref:"Acts 18:1" },
  { word:"Philippi",       wrong:"Phillippi",     hint:"First city in Europe where Paul preached the gospel",       ref:"Acts 16:12" },
  { word:"Antioch",        wrong:"Anteoch",       hint:"City where followers of Jesus were first called Christians", ref:"Acts 11:26" },
  { word:"Caesarea",       wrong:"Caesaria",      hint:"Roman city where Paul was imprisoned before going to Rome", ref:"Acts 23:33" },
  { word:"Colossae",       wrong:"Collosae",      hint:"City in Asia Minor; Paul wrote a letter to its church",     ref:"Colossians 1:2" },
  { word:"Thessalonica",   wrong:"Thesalonica",   hint:"Macedonian city where Paul preached for three weeks",       ref:"Acts 17:1" },
  { word:"Galatia",        wrong:"Gallatia",      hint:"Roman province in Asia Minor; Paul planted churches here",  ref:"Acts 16:6" },
  { word:"Samaria",        wrong:"Sameria",       hint:"Region between Judea and Galilee; Jesus spoke to a woman there", ref:"John 4:4" },
  { word:"Nazareth",       wrong:"Nazreth",       hint:"Hometown of Jesus; where He grew up",                       ref:"Luke 4:16" },
  { word:"Mesopotamia",    wrong:"Mesopotomia",   hint:"Land between the Tigris and Euphrates; Abraham's origin",   ref:"Acts 7:2" },
];

// Active sessions: chatId → { word, wrong, hint, ref, type, timeout }
const spellingSessions = new Map();

// ── Pick a fresh word from a pool (avoids repeats in the same chat) ─────────
const spellingHistory = new Map(); // chatId:type → Set<word>
function pickSpellingWord(pool, chatId, type) {
  const key = `${chatId}:${type}`;
  if (!spellingHistory.has(key)) spellingHistory.set(key, new Set());
  const used = spellingHistory.get(key);
  const fresh = pool.filter(w => !used.has(w.word));
  const source = fresh.length > 0 ? fresh : pool; // reset when exhausted
  if (fresh.length === 0) spellingHistory.set(key, new Set());
  const pick = source[Math.floor(Math.random() * source.length)];
  spellingHistory.get(key).add(pick.word);
  return pick;
}

// ── Start a spelling challenge ───────────────────────────────────────────────
async function startSpellingGame(sock, m, pool, label, emoji, type, revealSec = 30) {
  if (spellingSessions.has(m.chat)) {
    const cur = spellingSessions.get(m.chat);
    return m.reply(
      `⏳ A spelling game is already active!\n\n` +
      `${emoji} *Correct this:* \`${cur.wrong}\`\n` +
      `${cur.hint ? `💡 ${cur.hint}\n` : ""}` +
      `\nType *${config.PREFIX}spellhint* for a hint or *${config.PREFIX}spellstop* to end it.`
    );
  }
  const item = pickSpellingWord(pool, m.chat, type);
  const revealTimeout = setTimeout(async () => {
    spellingSessions.delete(m.chat);
    await sock.sendMessage(m.chat, {
      text:
        `⏰ *Time's up! Nobody got it.*\n\n` +
        `✅ The correct spelling was: *${item.word}*` +
        (item.hint ? `\n💡 ${item.hint}` : "") +
        (item.ref  ? `\n📖 ${item.ref}`  : ""),
    }).catch(() => {});
  }, revealSec * 1000);
  spellingSessions.set(m.chat, { ...item, timeout: revealTimeout, type });
  await m.reply(
    `${emoji} *${label}*\n\n` +
    `🔤 Correct this misspelling:\n*\`${item.wrong}\`*\n\n` +
    (item.hint ? `💡 *Hint:* ${item.hint}\n\n` : "") +
    `⏱️ You have *${revealSec} seconds!*\n` +
    `_Type the correct spelling — first one right wins! 🏆_`
  );
}

// ── Check a message body against the active game ────────────────────────────
function checkSpellingAnswer(sock, m, body) {
  const session = spellingSessions.get(m.chat);
  if (!session) return;
  const guess  = body.trim().toLowerCase();
  const correct = session.word.toLowerCase();
  if (guess !== correct) return;
  clearTimeout(session.timeout);
  spellingSessions.delete(m.chat);
  sock.sendMessage(m.chat, {
    text:
      `🎉 *Correct!* @${m.sender.split("@")[0]} got it!\n\n` +
      `✅ *${session.word}*` +
      (session.hint ? `\n💡 ${session.hint}` : "") +
      (session.ref  ? `\n📖 ${session.ref}`  : ""),
    mentions: [m.sender],
  }).catch(() => {});
}

const spellingCommands = [
  {
    name: ["spell", "spelling", "spellchallenge"],
    category: "fun",
    desc: "Spelling challenge — correct the misspelled English word",
    handler: (sock, m) =>
      startSpellingGame(sock, m, SPELL_GENERAL, "Spelling Challenge", "🔤", "general", 30),
  },
  {
    name: ["bspell", "biblespell", "bibleword"],
    category: "fun",
    desc: "Bible spelling challenge — all Bible words (people, books & places)",
    handler: (sock, m) =>
      startSpellingGame(
        sock, m,
        [...SPELL_BIBLE_PEOPLE, ...SPELL_BIBLE_BOOKS, ...SPELL_BIBLE_PLACES],
        "Bible Spelling Challenge", "📖", "bible", 35
      ),
  },
  {
    name: ["biblepeople", "bpeople", "biblenames"],
    category: "fun",
    desc: "Bible names spelling challenge",
    handler: (sock, m) =>
      startSpellingGame(sock, m, SPELL_BIBLE_PEOPLE, "Bible Names Challenge", "🙏", "bpeople", 35),
  },
  {
    name: ["bibleplaces", "bplaces"],
    category: "fun",
    desc: "Bible places spelling challenge",
    handler: (sock, m) =>
      startSpellingGame(sock, m, SPELL_BIBLE_PLACES, "Bible Places Challenge", "🗺️", "bplaces", 35),
  },
  {
    name: ["biblebooks", "bbooks"],
    category: "fun",
    desc: "Bible book names spelling challenge",
    handler: (sock, m) =>
      startSpellingGame(sock, m, SPELL_BIBLE_BOOKS, "Bible Books Challenge", "📚", "bbooks", 35),
  },
  {
    name: ["spellstop", "sspell"],
    category: "fun",
    desc: "Stop the active spelling game and reveal the answer",
    handler: async (sock, m) => {
      const session = spellingSessions.get(m.chat);
      if (!session) return m.reply("❌ No active spelling game. Start one with .spell or .bspell");
      clearTimeout(session.timeout);
      spellingSessions.delete(m.chat);
      await m.reply(
        `🛑 *Game stopped!*\n\n` +
        `✅ The answer was: *${session.word}*` +
        (session.hint ? `\n💡 ${session.hint}` : "") +
        (session.ref  ? `\n📖 ${session.ref}`  : "")
      );
    },
  },
  {
    name: ["spellhint", "shint"],
    category: "fun",
    desc: "Get an extra hint for the active spelling game",
    handler: async (sock, m) => {
      const session = spellingSessions.get(m.chat);
      if (!session) return m.reply("❌ No active spelling game. Start one with .spell or .bspell");
      const word = session.word;
      // Show first letter, last letter and length (e.g. B _ _ _ _ _ h for Bethlehem)
      const skeleton = word.length <= 3
        ? word[0] + "_".repeat(word.length - 1)
        : word[0] + " _ ".repeat(word.length - 2) + word[word.length - 1];
      await m.reply(
        `💡 *Spelling Hint*\n\n` +
        `🔤 Word: \`${session.wrong}\`\n` +
        `📏 Length: *${word.length} letters*\n` +
        `🔡 Pattern: \`${skeleton}\`\n` +
        (session.hint ? `📝 Clue: ${session.hint}` : "")
      );
    },
  },
];

const commands = [...baseCommands, ...spellingCommands];
module.exports = { commands, checkSpellingAnswer };
