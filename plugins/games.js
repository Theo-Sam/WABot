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

const commands = [
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

module.exports = { commands };