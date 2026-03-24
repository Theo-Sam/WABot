const config = require("../config");
const { fetchJson } = require("../lib/helpers");

// ─── Per-chat question history ────────────────────────────────────────────────
// Map<"chatId:category", Set<questionText>>
// Ensures no question repeats in a chat until the entire pool is exhausted, then resets.
const chatHistory = new Map();

function _key(chatId, category) { return `${chatId}:${category}`; }

function _getUsed(chatId, category) {
  const k = _key(chatId, category);
  if (!chatHistory.has(k)) chatHistory.set(k, new Set());
  return chatHistory.get(k);
}

function _isUsed(chatId, category, question) {
  return _getUsed(chatId, category).has(question.trim());
}

function _markUsed(chatId, category, question) {
  _getUsed(chatId, category).add(question.trim());
}

function _resetHistory(chatId, category) {
  chatHistory.delete(_key(chatId, category));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function decodeHtml(str) {
  return String(str || "")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D").replace(/&rsquo;/g, "\u2019").replace(/&lsquo;/g, "\u2018")
    .replace(/&#[0-9]+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1))));
}

// Pick a question this chat hasn't seen. If all used, reset history and pick fresh.
function pickFresh(questions, chatId, category) {
  const pool = shuffle(questions);
  const fresh = pool.find((q) => !_isUsed(chatId, category, q.question));
  if (fresh) return fresh;
  _resetHistory(chatId, category);
  return pool[0];
}

// ─── Football/soccer keyword filter ──────────────────────────────────────────
// opentdb category 21 = ALL sports. We must filter to football-only questions.
const FOOTBALL_KEYWORDS = /\b(football|soccer|FIFA|UEFA|Premier\s*League|Champions\s*League|FA\s*Cup|World\s*Cup|Euro\s*\d{4}|AFCON|Copa\s*America|Copa\s*del\s*Rey|Bundesliga|Serie\s*A|La\s*Liga|Ligue\s*1|Eredivisie|MLS|Ballon\s*d.Or|hat.trick|penalty|offside|goalkeeper|striker|midfielder|winger|free\s*kick|corner\s*kick|yellow\s*card|red\s*card|dribble|header|manager|coach|footballer|EPL|Champions|Europa\s*League|World\s*Cup|Messi|Ronaldo|Pelé|Maradona|Neymar|Mbappé|Haaland|Salah|Arsenal|Chelsea|Liverpool|Man\s*(United|City|Utd)|Barcelona|Real\s*Madrid|Bayern|Juventus|PSG|Inter\s*Milan|AC\s*Milan|Dortmund|Atletico|Ajax|Spurs|Tottenham|Newcastle|Everton|Villa|West\s*Ham)\b/i;

function isFootballQuestion(q) {
  const text = `${q.question} ${q.answer} ${(q.wrong || []).join(' ')}`;
  return FOOTBALL_KEYWORDS.test(text);
}

// ─── opentdb fetch ────────────────────────────────────────────────────────────
// Category IDs: 12=Music 17=Science&Nature 21=Sports 22=Geography 23=History
// filterFn: optional function(q) => boolean to filter API results (e.g. football-only)
async function fetchOpentdb(categoryId, amount = 10, filterFn = null) {
  try {
    // Fetch more when filtering, so we have enough after the filter is applied
    const fetchAmount = filterFn ? Math.min(50, amount * 5) : amount;
    const data = await fetchJson(
      `https://opentdb.com/api.php?amount=${fetchAmount}&category=${categoryId}&type=multiple`,
      { timeout: 9000 }
    );
    if (data?.response_code !== 0 || !data?.results?.length) return [];
    let results = data.results.map((q) => ({
      question: decodeHtml(q.question),
      answer: decodeHtml(q.correct_answer),
      wrong: q.incorrect_answers.map(decodeHtml),
      fact: `Category: ${decodeHtml(q.category)} | Difficulty: ${q.difficulty}`,
    }));
    if (filterFn) results = results.filter(filterFn);
    return results;
  } catch {
    return [];
  }
}

// ─── Core quiz engine ─────────────────────────────────────────────────────────
async function runQuiz(sock, m, { opentdbCategory, apiFilter, fallbackPool, label, emoji, category, revealSec = 20 }) {
  let question = null;

  // 1. Try opentdb API (with optional filter for categories like Sports)
  if (opentdbCategory) {
    const apiQuestions = await fetchOpentdb(opentdbCategory, 10, apiFilter || null);
    if (apiQuestions.length > 0) {
      const fresh = apiQuestions.find((q) => !_isUsed(m.chat, category, q.question));
      if (fresh) {
        question = fresh;
      }
    }
  }

  // 2. Fallback to hardcoded pool
  if (!question) {
    question = pickFresh(fallbackPool, m.chat, category);
  }

  // Mark as used for this chat
  _markUsed(m.chat, category, question.question);

  // Build 4 shuffled options
  const correct = question.answer;
  const wrongs = shuffle(question.wrong).slice(0, 3);
  const options = shuffle([correct, ...wrongs]);
  const labels = ["A", "B", "C", "D"];
  const correctLabel = labels[options.indexOf(correct)];

  let msg = `${emoji} *${label}*\n\n`;
  msg += `❓ *${question.question}*\n\n`;
  options.forEach((opt, i) => { msg += `${labels[i]}) ${opt}\n`; });
  msg += `\n_Answer reveals in ${revealSec} seconds — reply with the letter!_`;

  await m.reply(msg);

  setTimeout(async () => {
    let reveal = `✅ The correct answer was: *${correctLabel}) ${correct}*`;
    if (question.fact) reveal += `\n\n💡 ${question.fact}`;
    await sock.sendMessage(m.chat, { text: reveal });
  }, revealSec * 1000);
}

// ─── BIBLE QUIZ fallback pool (hardcoded — no reliable public Bible API) ──────
const biblePool = [
  { question: "Who was the first man created by God?", answer: "Adam", wrong: ["Noah", "Abraham", "Moses"], fact: "Genesis 2:7" },
  { question: "How many days did God take to create the world?", answer: "6 days", wrong: ["7 days", "3 days", "10 days"], fact: "Genesis 1 — He rested on the 7th day." },
  { question: "Who was swallowed by a great fish for 3 days?", answer: "Jonah", wrong: ["Elijah", "Daniel", "Ezekiel"], fact: "Jonah 1:17" },
  { question: "How many commandments did God give Moses?", answer: "10", wrong: ["7", "12", "15"], fact: "Exodus 20 — The Ten Commandments." },
  { question: "Who was the mother of Jesus?", answer: "Mary", wrong: ["Martha", "Elizabeth", "Hannah"], fact: "Luke 1:30-31" },
  { question: "Which disciple betrayed Jesus?", answer: "Judas Iscariot", wrong: ["Peter", "Thomas", "Philip"], fact: "Matthew 26:14-16" },
  { question: "In which city was Jesus born?", answer: "Bethlehem", wrong: ["Jerusalem", "Nazareth", "Capernaum"], fact: "Luke 2:4-7" },
  { question: "Who parted the Red Sea?", answer: "Moses", wrong: ["Joshua", "Elijah", "Aaron"], fact: "Exodus 14:21" },
  { question: "What was the name of Abraham's son of promise?", answer: "Isaac", wrong: ["Ishmael", "Jacob", "Joseph"], fact: "Genesis 17:19" },
  { question: "How many sons did Jacob have?", answer: "12", wrong: ["10", "11", "13"], fact: "These became the 12 tribes of Israel." },
  { question: "Who wrote most of the Psalms?", answer: "David", wrong: ["Solomon", "Moses", "Asaph"], fact: "About 73 of the 150 Psalms are attributed to David." },
  { question: "What giant did David kill with a sling and stone?", answer: "Goliath", wrong: ["Saul", "Absalom", "Sheba"], fact: "1 Samuel 17:50" },
  { question: "How many books are in the New Testament?", answer: "27", wrong: ["26", "28", "39"], fact: "The NT has 27 books; the OT has 39." },
  { question: "How many books are in the Old Testament?", answer: "39", wrong: ["27", "36", "40"], fact: "66 books total in the Protestant Bible." },
  { question: "Who was the first king of Israel?", answer: "Saul", wrong: ["David", "Solomon", "Samuel"], fact: "1 Samuel 10:24" },
  { question: "Who built the ark?", answer: "Noah", wrong: ["Moses", "Abraham", "Lot"], fact: "Genesis 6:14-22" },
  { question: "How many days and nights did it rain during the great flood?", answer: "40", wrong: ["30", "7", "14"], fact: "Genesis 7:12" },
  { question: "What miracle did Jesus do first according to John's Gospel?", answer: "Turned water into wine", wrong: ["Healed a blind man", "Fed 5000", "Raised Lazarus"], fact: "John 2:1-11 — at the wedding in Cana." },
  { question: "On what mountain did Moses receive the Ten Commandments?", answer: "Mount Sinai", wrong: ["Mount Zion", "Mount Carmel", "Mount Hermon"], fact: "Exodus 19-20" },
  { question: "Who was thrown into the lions' den?", answer: "Daniel", wrong: ["Shadrach", "Joseph", "Elijah"], fact: "Daniel 6:16" },
  { question: "Who were the three men thrown into the fiery furnace?", answer: "Shadrach, Meshach and Abednego", wrong: ["Daniel, Ezra and Nehemiah", "Peter, James and John", "Abraham, Isaac and Jacob"], fact: "Daniel 3:19-25" },
  { question: "How many loaves of bread did Jesus use to feed the 5000?", answer: "5", wrong: ["7", "10", "12"], fact: "John 6:9 — 5 loaves and 2 fish." },
  { question: "Who was the first martyr in the early church?", answer: "Stephen", wrong: ["James", "Philip", "Barnabas"], fact: "Acts 7:59-60" },
  { question: "What was Paul's name before his conversion?", answer: "Saul", wrong: ["Simon", "Seth", "Samuel"], fact: "Acts 9:1 — He was Saul of Tarsus." },
  { question: "How many plagues did God send on Egypt?", answer: "10", wrong: ["7", "9", "12"], fact: "Exodus 7-11 — culminating with the death of firstborn." },
  { question: "Who was the longest-living person in the Bible?", answer: "Methuselah", wrong: ["Noah", "Adam", "Enoch"], fact: "Genesis 5:27 — He lived 969 years." },
  { question: "What did Samson's strength come from?", answer: "His hair", wrong: ["His sword", "His faith", "His ring"], fact: "Judges 16:17 — He was a Nazirite." },
  { question: "Which book of the Bible has the most chapters?", answer: "Psalms", wrong: ["Isaiah", "Jeremiah", "Genesis"], fact: "Psalms has 150 chapters." },
  { question: "Who wrote the book of Revelation?", answer: "John", wrong: ["Paul", "Peter", "James"], fact: "Revelation 1:1 — John the Apostle, exiled on Patmos." },
  { question: "Which apostle walked on water toward Jesus?", answer: "Peter", wrong: ["John", "Andrew", "James"], fact: "Matthew 14:29" },
  { question: "What is the shortest verse in the Bible?", answer: "Jesus wept", wrong: ["Amen", "Rejoice", "Pray always"], fact: "John 11:35 — two words in English." },
  { question: "Who replaced Judas as the 12th apostle?", answer: "Matthias", wrong: ["Barnabas", "Timothy", "Silas"], fact: "Acts 1:26" },
  { question: "In which book is the story of the Good Samaritan?", answer: "Luke", wrong: ["Matthew", "Mark", "John"], fact: "Luke 10:30-37" },
  { question: "Who was Ruth's mother-in-law?", answer: "Naomi", wrong: ["Orpah", "Abigail", "Deborah"], fact: "Ruth 1:4" },
  { question: "Which tribe was Paul from?", answer: "Benjamin", wrong: ["Judah", "Levi", "Dan"], fact: "Philippians 3:5 — 'of the tribe of Benjamin'" },
  { question: "What does 'Emmanuel' mean?", answer: "God with us", wrong: ["God saves", "Lord of lords", "Prince of Peace"], fact: "Matthew 1:23 — fulfilling Isaiah 7:14." },
  { question: "How many people were saved in Noah's ark?", answer: "8", wrong: ["4", "6", "10"], fact: "1 Peter 3:20 — Noah and his family." },
  { question: "What river was Jesus baptized in?", answer: "Jordan River", wrong: ["Nile", "Euphrates", "Galilee"], fact: "Matthew 3:13 — by John the Baptist." },
  { question: "Who hid the two spies Joshua sent to Jericho?", answer: "Rahab", wrong: ["Deborah", "Jael", "Rebekah"], fact: "Joshua 2:1-6" },
  { question: "Who was the wisest king of Israel?", answer: "Solomon", wrong: ["David", "Hezekiah", "Josiah"], fact: "1 Kings 4:31 — given wisdom by God." },
  { question: "What was Peter's occupation before following Jesus?", answer: "Fisherman", wrong: ["Carpenter", "Tax collector", "Shepherd"], fact: "Matthew 4:18" },
  { question: "What was Matthew's occupation before following Jesus?", answer: "Tax collector", wrong: ["Fisherman", "Carpenter", "Soldier"], fact: "Matthew 9:9" },
  { question: "Who carried the cross for Jesus on the way to Golgotha?", answer: "Simon of Cyrene", wrong: ["John", "Barabbas", "Nicodemus"], fact: "Mark 15:21" },
  { question: "Which prophet called fire down from heaven on the prophets of Baal?", answer: "Elijah", wrong: ["Elisha", "Isaiah", "Jeremiah"], fact: "1 Kings 18:38" },
  { question: "What did the prodigal son ask his father for?", answer: "His inheritance", wrong: ["Food", "A job", "Forgiveness first"], fact: "Luke 15:12" },
  { question: "Who was the first person to see Jesus after the resurrection?", answer: "Mary Magdalene", wrong: ["Mary the mother of Jesus", "Peter", "John"], fact: "John 20:14-16" },
  { question: "How long did Jesus fast in the wilderness?", answer: "40 days and nights", wrong: ["7 days", "30 days", "3 days"], fact: "Matthew 4:2" },
  { question: "Which woman judge led Israel to victory over Sisera?", answer: "Deborah", wrong: ["Jael", "Miriam", "Esther"], fact: "Judges 4:4-9" },
  { question: "What are the first four words of the Bible?", answer: "In the beginning God", wrong: ["God created the heavens", "In the beginning was", "The earth was formless"], fact: "Genesis 1:1" },
  { question: "How many disciples did Jesus send out in pairs as recorded in Luke 10?", answer: "70", wrong: ["12", "24", "42"], fact: "Luke 10:1 — Jesus sent out 70 (or 72 in some manuscripts)." },
  { question: "What did God create on the fourth day?", answer: "Sun, moon and stars", wrong: ["Sky and seas", "Plants and trees", "Birds and fish"], fact: "Genesis 1:14-19" },
];

// ─── FOOTBALL fallback pool ───────────────────────────────────────────────────
const footballPool = [
  { question: "Which country has won the most FIFA World Cups?", answer: "Brazil", wrong: ["Germany", "Italy", "Argentina"], fact: "Brazil has won 5 World Cups (1958, 62, 70, 94, 2002)." },
  { question: "Who won the 2022 FIFA World Cup?", answer: "Argentina", wrong: ["France", "Brazil", "Germany"], fact: "Argentina beat France on penalties in Qatar." },
  { question: "Which club has won the most UEFA Champions League titles?", answer: "Real Madrid", wrong: ["Barcelona", "AC Milan", "Bayern Munich"], fact: "Real Madrid have won 15 UCL titles as of 2024." },
  { question: "Who is the all-time top scorer in the FIFA World Cup?", answer: "Miroslav Klose", wrong: ["Ronaldo", "Gerd Müller", "Just Fontaine"], fact: "Miroslav Klose scored 16 World Cup goals for Germany." },
  { question: "Who won the Ballon d'Or the most times?", answer: "Lionel Messi", wrong: ["Cristiano Ronaldo", "Ronaldinho", "Rivaldo"], fact: "Messi has won 8 Ballon d'Or awards as of 2023." },
  { question: "Which country hosted the first FIFA World Cup in 1930?", answer: "Uruguay", wrong: ["Argentina", "Brazil", "Italy"], fact: "Uruguay also won the first World Cup." },
  { question: "Who is nicknamed 'The Egyptian King'?", answer: "Mohamed Salah", wrong: ["Karim Benzema", "Sadio Mané", "Hakim Ziyech"], fact: "Mohamed Salah is Liverpool's prolific Egyptian forward." },
  { question: "Which team is known as 'The Red Devils'?", answer: "Manchester United", wrong: ["Liverpool", "Arsenal", "AC Milan"], fact: "Man Utd have had this nickname since the 1960s." },
  { question: "Which player scored the famous 'Hand of God' goal?", answer: "Diego Maradona", wrong: ["Pelé", "Johan Cruyff", "Ronaldo"], fact: "Maradona scored it against England in the 1986 World Cup." },
  { question: "Which stadium is the home of Barcelona?", answer: "Camp Nou", wrong: ["Santiago Bernabéu", "Allianz Arena", "Anfield"], fact: "Camp Nou is the largest stadium in Europe." },
  { question: "Who holds the record for most Premier League goals scored?", answer: "Alan Shearer", wrong: ["Wayne Rooney", "Andrew Cole", "Frank Lampard"], fact: "Alan Shearer scored 260 Premier League goals." },
  { question: "Which country hosted the 2010 FIFA World Cup?", answer: "South Africa", wrong: ["Nigeria", "Egypt", "Zimbabwe"], fact: "It was the first World Cup held on African soil." },
  { question: "Who scored the winning goal in the 2010 World Cup final?", answer: "Andrés Iniesta", wrong: ["David Villa", "Fernando Torres", "Xavi"], fact: "Iniesta's extra-time goal for Spain beat the Netherlands 1-0." },
  { question: "Which club is known as 'The Old Lady'?", answer: "Juventus", wrong: ["Inter Milan", "AC Milan", "Roma"], fact: "La Vecchia Signora is Juventus' iconic nickname." },
  { question: "Which African team reached the World Cup semi-finals in 2022?", answer: "Morocco", wrong: ["Senegal", "Ghana", "Cameroon"], fact: "Morocco beat Spain and Portugal before losing to France." },
  { question: "What is a hat-trick in football?", answer: "3 goals by one player in a match", wrong: ["3 assists", "3 yellow cards", "3 consecutive wins"], fact: "The term originated in cricket." },
  { question: "Who is Real Madrid's all-time top scorer?", answer: "Cristiano Ronaldo", wrong: ["Raúl", "Karim Benzema", "Alfredo Di Stéfano"], fact: "Ronaldo scored 450 goals in all competitions for Madrid." },
  { question: "Who was the top scorer at the 2018 FIFA World Cup?", answer: "Harry Kane", wrong: ["Kylian Mbappé", "Romelu Lukaku", "Antoine Griezmann"], fact: "Kane scored 6 goals to win the Golden Boot." },
  { question: "Who scored a goal in the World Cup final aged 17 in 1958?", answer: "Pelé", wrong: ["Ronaldo", "Maradona", "Eusébio"], fact: "Pelé became the youngest ever World Cup final scorer." },
  { question: "Which country won Euro 2020 (played in 2021)?", answer: "Italy", wrong: ["England", "Spain", "France"], fact: "Italy beat England on penalties at Wembley." },
  { question: "Who is known as 'The Special One'?", answer: "José Mourinho", wrong: ["Pep Guardiola", "Jürgen Klopp", "Carlo Ancelotti"], fact: "Mourinho coined the phrase after joining Chelsea in 2004." },
  { question: "Which Ghanaian legend played for Barcelona and Chelsea?", answer: "Michael Essien", wrong: ["Asamoah Gyan", "Marcel Desailly", "Sulley Muntari"], fact: "Essien was known as 'The Bison' at Chelsea." },
  { question: "Which club has won the most English Premier League titles?", answer: "Manchester United", wrong: ["Liverpool", "Arsenal", "Chelsea"], fact: "Man Utd have won 20 league titles including 13 under Sir Alex Ferguson." },
  { question: "Who holds the record for most international goals in history?", answer: "Cristiano Ronaldo", wrong: ["Lionel Messi", "Ali Daei", "Miroslav Klose"], fact: "Ronaldo has surpassed 130 international goals for Portugal." },
  { question: "Which player won the Golden Ball at the 2022 World Cup?", answer: "Lionel Messi", wrong: ["Kylian Mbappé", "Emi Martínez", "Antoine Griezmann"], fact: "Messi also won the Golden Boot with 7 goals and 3 assists." },
  { question: "What does 'VAR' stand for in football?", answer: "Video Assistant Referee", wrong: ["Video Action Review", "Video Assistant Review", "Virtual Assistant Referee"], fact: "VAR was introduced in the 2018 World Cup." },
  { question: "What is the name of Ghana's national football team?", answer: "Black Stars", wrong: ["Elephants", "Eagles", "Lions"], fact: "Ghana's team is known as the Black Stars." },
  { question: "Which English club is known as 'The Gunners'?", answer: "Arsenal", wrong: ["Tottenham", "Chelsea", "West Ham"], fact: "Arsenal's nickname comes from their history at the Royal Arsenal." },
  { question: "Which club does Erling Haaland currently play for?", answer: "Manchester City", wrong: ["Borussia Dortmund", "Real Madrid", "Bayern Munich"], fact: "Haaland moved to Man City in 2022 from Dortmund." },
  { question: "Which country did Pelé represent?", answer: "Brazil", wrong: ["Argentina", "Portugal", "Colombia"], fact: "Pelé won 3 World Cups with Brazil (1958, 62, 70)." },
];

// ─── GEOGRAPHY fallback pool ──────────────────────────────────────────────────
const geographyPool = [
  { question: "What is the capital of Ghana?", answer: "Accra", wrong: ["Kumasi", "Tamale", "Cape Coast"], fact: "Accra has been Ghana's capital since independence in 1957." },
  { question: "Which is the largest country in Africa by area?", answer: "Algeria", wrong: ["Sudan", "Democratic Republic of Congo", "Libya"], fact: "Algeria is 2.38 million km²." },
  { question: "What is the capital of Nigeria?", answer: "Abuja", wrong: ["Lagos", "Kano", "Ibadan"], fact: "Abuja became Nigeria's capital in 1991, replacing Lagos." },
  { question: "Which river is the longest in the world?", answer: "Nile", wrong: ["Amazon", "Yangtze", "Mississippi"], fact: "The Nile is approximately 6,650 km long." },
  { question: "Which is the smallest country in the world?", answer: "Vatican City", wrong: ["Monaco", "San Marino", "Nauru"], fact: "Vatican City covers just 0.44 km²." },
  { question: "Which continent is Egypt in?", answer: "Africa", wrong: ["Asia", "Middle East", "Europe"], fact: "Egypt is in North Africa, though it borders Asia via the Sinai Peninsula." },
  { question: "What is the largest ocean in the world?", answer: "Pacific Ocean", wrong: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean"], fact: "The Pacific covers over 165 million km²." },
  { question: "What is the capital of Brazil?", answer: "Brasília", wrong: ["Rio de Janeiro", "São Paulo", "Salvador"], fact: "Brasília became Brazil's capital in 1960." },
  { question: "Which mountain is the tallest in the world?", answer: "Mount Everest", wrong: ["K2", "Kangchenjunga", "Kilimanjaro"], fact: "Everest is 8,848.86 metres above sea level." },
  { question: "What is the capital of Kenya?", answer: "Nairobi", wrong: ["Mombasa", "Kisumu", "Nakuru"], fact: "Nairobi was founded in 1899 during British colonialism." },
  { question: "Which African country has the most ancient pyramids?", answer: "Sudan", wrong: ["Egypt", "Libya", "Ethiopia"], fact: "Sudan has over 200 ancient pyramids, more than Egypt." },
  { question: "What is the capital of Australia?", answer: "Canberra", wrong: ["Sydney", "Melbourne", "Brisbane"], fact: "Canberra was built as a compromise between Sydney and Melbourne." },
  { question: "Which is the most populous country in the world?", answer: "India", wrong: ["China", "USA", "Indonesia"], fact: "India surpassed China as the most populous nation in 2023." },
  { question: "What is the official language of Brazil?", answer: "Portuguese", wrong: ["Spanish", "Brazilian", "English"], fact: "Brazil is the only Portuguese-speaking country in South America." },
  { question: "Which desert is the largest in the world?", answer: "Antarctica (cold desert)", wrong: ["Sahara", "Arabian", "Gobi"], fact: "The Sahara is the largest hot desert; Antarctica is bigger overall." },
  { question: "What is the capital of South Africa?", answer: "Pretoria (executive capital)", wrong: ["Cape Town", "Johannesburg", "Durban"], fact: "South Africa has three capitals: Pretoria (executive), Cape Town (legislative), Bloemfontein (judicial)." },
  { question: "Which country has the most lakes in the world?", answer: "Canada", wrong: ["Russia", "USA", "Finland"], fact: "Canada has over 2 million lakes — more than any other country." },
  { question: "Which sea is the saltiest in the world?", answer: "Dead Sea", wrong: ["Red Sea", "Mediterranean Sea", "Caspian Sea"], fact: "The Dead Sea is about 10 times saltier than the ocean." },
  { question: "What is the longest wall in the world?", answer: "Great Wall of China", wrong: ["Hadrian's Wall", "Berlin Wall", "India-Pakistan barrier"], fact: "The Great Wall stretches over 21,000 km." },
  { question: "Which country has the most time zones?", answer: "France", wrong: ["Russia", "USA", "China"], fact: "France (including overseas territories) has 12 time zones." },
];

// ─── SCIENCE fallback pool ────────────────────────────────────────────────────
const sciencePool = [
  { question: "What is the chemical symbol for water?", answer: "H₂O", wrong: ["HO₂", "H₂O₂", "HO"], fact: "Water: 2 hydrogen atoms bonded to 1 oxygen atom." },
  { question: "How many bones are in the adult human body?", answer: "206", wrong: ["208", "210", "198"], fact: "Babies are born with about 270 bones that fuse over time." },
  { question: "What planet is known as the Red Planet?", answer: "Mars", wrong: ["Venus", "Jupiter", "Mercury"], fact: "Mars appears red because of iron oxide (rust) on its surface." },
  { question: "What is the powerhouse of the cell?", answer: "Mitochondria", wrong: ["Nucleus", "Ribosome", "Golgi apparatus"], fact: "Mitochondria produce ATP through cellular respiration." },
  { question: "Which gas makes up most of Earth's atmosphere?", answer: "Nitrogen", wrong: ["Oxygen", "Carbon dioxide", "Argon"], fact: "Nitrogen makes up about 78%; oxygen about 21%." },
  { question: "What is the chemical symbol for gold?", answer: "Au", wrong: ["Go", "Gd", "Ag"], fact: "Au comes from the Latin word 'Aurum'." },
  { question: "How many chromosomes do humans have?", answer: "46", wrong: ["48", "44", "23"], fact: "Humans have 23 pairs of chromosomes." },
  { question: "What is the hardest natural substance on Earth?", answer: "Diamond", wrong: ["Steel", "Quartz", "Corundum"], fact: "Diamond scores 10 on the Mohs hardness scale." },
  { question: "How long does it take Earth to orbit the Sun?", answer: "365.25 days", wrong: ["365 days", "366 days", "360 days"], fact: "The 0.25 extra days are why we have leap years every 4 years." },
  { question: "What is the chemical formula for table salt?", answer: "NaCl", wrong: ["KCl", "NaF", "CaCl₂"], fact: "Sodium chloride (NaCl) is the most common salt." },
  { question: "Which planet has the most moons?", answer: "Saturn", wrong: ["Jupiter", "Uranus", "Neptune"], fact: "Saturn has 146 confirmed moons as of 2023." },
  { question: "What is the pH of pure water?", answer: "7", wrong: ["6", "8", "5"], fact: "pH 7 is neutral — below is acidic, above is basic/alkaline." },
  { question: "Which vitamin is produced when the body is exposed to sunlight?", answer: "Vitamin D", wrong: ["Vitamin A", "Vitamin C", "Vitamin B12"], fact: "Vitamin D helps absorb calcium and keeps bones strong." },
  { question: "What is the nearest star to Earth besides the Sun?", answer: "Proxima Centauri", wrong: ["Sirius", "Alpha Centauri A", "Betelgeuse"], fact: "Proxima Centauri is 4.24 light-years away." },
  { question: "What gas do plants absorb during photosynthesis?", answer: "Carbon dioxide (CO₂)", wrong: ["Oxygen", "Nitrogen", "Hydrogen"], fact: "Plants convert CO₂ and water into glucose using sunlight." },
  { question: "How many chambers does the human heart have?", answer: "4", wrong: ["2", "3", "6"], fact: "Two atria and two ventricles make up the four chambers." },
  { question: "What is the speed of sound in air (approx)?", answer: "343 m/s", wrong: ["300 m/s", "500 m/s", "1000 m/s"], fact: "Speed of sound varies with temperature; 343 m/s is at 20°C." },
  { question: "Which element has the atomic number 1?", answer: "Hydrogen", wrong: ["Helium", "Lithium", "Carbon"], fact: "Hydrogen is the lightest and most abundant element in the universe." },
  { question: "What type of rock is formed from cooled magma?", answer: "Igneous rock", wrong: ["Sedimentary rock", "Metamorphic rock", "Limestone"], fact: "Examples include granite and basalt." },
  { question: "What is the name of the force that opposes motion between surfaces?", answer: "Friction", wrong: ["Gravity", "Tension", "Inertia"], fact: "Friction can be reduced with lubricants or smooth surfaces." },
];

// ─── HISTORY fallback pool ────────────────────────────────────────────────────
const historyPool = [
  { question: "Who was the first President of the United States?", answer: "George Washington", wrong: ["Thomas Jefferson", "John Adams", "Benjamin Franklin"], fact: "Washington served two terms from 1789 to 1797." },
  { question: "In which year did World War II end?", answer: "1945", wrong: ["1944", "1946", "1943"], fact: "WWII ended with Japan's surrender on September 2, 1945." },
  { question: "Who was the first person to walk on the moon?", answer: "Neil Armstrong", wrong: ["Buzz Aldrin", "Yuri Gagarin", "John Glenn"], fact: "Armstrong stepped on the moon on July 20, 1969 (Apollo 11)." },
  { question: "In which year did Ghana gain independence?", answer: "1957", wrong: ["1960", "1963", "1954"], fact: "Ghana was the first sub-Saharan African country to gain independence." },
  { question: "Who was the leader of Nazi Germany?", answer: "Adolf Hitler", wrong: ["Heinrich Himmler", "Hermann Göring", "Joseph Goebbels"], fact: "Hitler led the Nazi Party and Germany from 1933 to 1945." },
  { question: "Who was the first African to win the Nobel Peace Prize?", answer: "Albert Luthuli", wrong: ["Nelson Mandela", "Desmond Tutu", "Wangari Maathai"], fact: "Albert Luthuli won in 1960 for leading non-violent opposition to apartheid." },
  { question: "In which year did Nelson Mandela become President of South Africa?", answer: "1994", wrong: ["1990", "1993", "1996"], fact: "Mandela was inaugurated on May 10, 1994 after South Africa's first free elections." },
  { question: "In which year did the Berlin Wall fall?", answer: "1989", wrong: ["1991", "1987", "1990"], fact: "The wall fell on November 9, 1989, ending the division of Germany." },
  { question: "Who was the first woman to win a Nobel Prize?", answer: "Marie Curie", wrong: ["Rosalind Franklin", "Florence Nightingale", "Jane Addams"], fact: "Curie won in Physics (1903) and Chemistry (1911)." },
  { question: "What was the name of the ship that sank in 1912 after hitting an iceberg?", answer: "Titanic", wrong: ["Lusitania", "Britannic", "Bismarck"], fact: "The RMS Titanic sank on April 15, 1912 in the North Atlantic." },
  { question: "Which country did Christopher Columbus sail for on his 1492 voyage?", answer: "Spain", wrong: ["Portugal", "England", "Italy"], fact: "Columbus was Italian but sailed under the Spanish crown." },
  { question: "Which African country was never colonized by Europeans?", answer: "Ethiopia", wrong: ["Liberia", "Egypt", "Morocco"], fact: "Ethiopia defeated Italy at the Battle of Adwa in 1896." },
  { question: "In which year was the United Nations founded?", answer: "1945", wrong: ["1944", "1946", "1919"], fact: "The UN was founded on October 24, 1945 after WWII." },
  { question: "Who was the first man to travel to space?", answer: "Yuri Gagarin", wrong: ["Neil Armstrong", "Alan Shepard", "John Glenn"], fact: "Gagarin orbited Earth on April 12, 1961 aboard Vostok 1." },
  { question: "What ancient civilization built Machu Picchu?", answer: "Inca", wrong: ["Aztec", "Maya", "Olmec"], fact: "Machu Picchu was built by the Inca Empire around 1450 AD." },
  { question: "Which empire was the largest in history by land area?", answer: "British Empire", wrong: ["Mongol Empire", "Roman Empire", "Ottoman Empire"], fact: "The British Empire covered 24% of Earth's land area at its peak." },
  { question: "Who built the Great Pyramids of Giza?", answer: "Ancient Egyptians", wrong: ["Nubians", "Romans", "Persians"], fact: "Built as tombs for pharaohs during the Old Kingdom period." },
  { question: "In which country did the French Revolution begin?", answer: "France", wrong: ["England", "Germany", "Italy"], fact: "The French Revolution began in 1789 and reshaped Europe." },
  { question: "Who was assassinated in 1963 in Dallas, Texas?", answer: "John F. Kennedy", wrong: ["Abraham Lincoln", "Martin Luther King Jr.", "Robert Kennedy"], fact: "JFK was assassinated on November 22, 1963." },
  { question: "Which war was fought between the North and South American states?", answer: "The American Civil War", wrong: ["The Revolutionary War", "The War of 1812", "The Spanish-American War"], fact: "The Civil War (1861-1865) was fought over slavery and states' rights." },
];

// ─── MUSIC fallback pool ──────────────────────────────────────────────────────
const musicPool = [
  { question: "Who is known as the 'King of Pop'?", answer: "Michael Jackson", wrong: ["Elvis Presley", "Prince", "James Brown"], fact: "Michael Jackson sold over 400 million records worldwide." },
  { question: "Which country does Afrobeats music originate from?", answer: "Nigeria", wrong: ["Ghana", "Cameroon", "South Africa"], fact: "Afrobeats grew from Lagos in the 2000s." },
  { question: "Who is known as the 'King of Reggae'?", answer: "Bob Marley", wrong: ["Peter Tosh", "Jimmy Cliff", "Bunny Wailer"], fact: "Bob Marley's album 'Legend' is one of the best-selling of all time." },
  { question: "Which group had a hit with 'Bohemian Rhapsody'?", answer: "Queen", wrong: ["The Beatles", "Led Zeppelin", "The Rolling Stones"], fact: "Released in 1975, it remains one of the most loved rock songs ever." },
  { question: "What is the name of Burna Boy's Grammy-winning album?", answer: "Twice as Tall", wrong: ["African Giant", "Outside", "On a Spaceship"], fact: "Twice as Tall won Best Global Music Album at the 2021 Grammys." },
  { question: "Which artist is known as 'Afrobeats to the World'?", answer: "Wizkid", wrong: ["Davido", "Burna Boy", "Tekno"], fact: "Wizkid's collaboration with Drake ('One Dance') broke streaming records." },
  { question: "How many strings does a standard guitar have?", answer: "6", wrong: ["5", "7", "4"], fact: "Standard tuning is E-A-D-G-B-E from low to high." },
  { question: "Who sang 'Shape of You'?", answer: "Ed Sheeran", wrong: ["Justin Bieber", "Sam Smith", "Charlie Puth"], fact: "Released in 2017, it became one of Spotify's most-streamed songs." },
  { question: "What genre is Amapiano?", answer: "South African electronic music", wrong: ["Nigerian Afrobeats", "Ghanaian Highlife", "Congolese Soukous"], fact: "Amapiano blends deep house, jazz, and lounge music from South Africa." },
  { question: "Who is the lead vocalist of Coldplay?", answer: "Chris Martin", wrong: ["Bono", "Thom Yorke", "Matt Bellamy"], fact: "Coldplay are one of the world's best-selling music artists." },
  { question: "Which Beyoncé album features 'Crazy in Love'?", answer: "Dangerously in Love", wrong: ["Lemonade", "B'Day", "4"], fact: "Released in 2003, it was her debut solo album." },
  { question: "Who composed the symphony 'Ode to Joy'?", answer: "Ludwig van Beethoven", wrong: ["Wolfgang Amadeus Mozart", "Johann Sebastian Bach", "Franz Schubert"], fact: "Beethoven composed it while completely deaf — his 9th Symphony." },
  { question: "Which decade did hip-hop originate?", answer: "1970s", wrong: ["1960s", "1980s", "1990s"], fact: "Hip-hop started in the Bronx, New York around 1973." },
  { question: "Which Ghanaian music legend is known as the 'Highlife King'?", answer: "Nana Ampadu", wrong: ["Kojo Antwi", "Pat Thomas", "Amakye Dede"], fact: "Nana Ampadu founded the African Brothers Band in 1963." },
  { question: "Which musical instrument is featured prominently in Jazz?", answer: "Saxophone", wrong: ["Violin", "Guitar", "Flute"], fact: "The saxophone was invented by Adolphe Sax in the 1840s." },
  { question: "What nationality is global music icon Shakira?", answer: "Colombian", wrong: ["Venezuelan", "Mexican", "Brazilian"], fact: "Shakira is from Barranquilla, Colombia." },
  { question: "Which Nigerian artist is known as 'The African Giant'?", answer: "Burna Boy", wrong: ["Wizkid", "Davido", "Flavour"], fact: "Burna Boy's documentary and song both go by this title." },
  { question: "Who is known as the 'Queen of Afropop' in Ghana?", answer: "Efya", wrong: ["MzVee", "Becca", "Adina"], fact: "Efya (Jane Awindor) is one of Ghana's most celebrated vocalists." },
  { question: "What does 'DJ' stand for?", answer: "Disc Jockey", wrong: ["Digital Jockey", "Dance Jockey", "Digital Jukebox"], fact: "DJs originally worked with vinyl records on turntables." },
  { question: "Which artist released the album 'Thriller' in 1982?", answer: "Michael Jackson", wrong: ["Prince", "George Michael", "Whitney Houston"], fact: "Thriller is the best-selling album of all time with 66+ million copies sold." },
];

// ─── COMMANDS ─────────────────────────────────────────────────────────────────
const commands = [
  {
    name: ["biblequiz", "bquiz", "bq", "biblequestion"],
    category: "games",
    desc: "Bible knowledge quiz — fresh question, no repeats per chat",
    handler: async (sock, m) => {
      await runQuiz(sock, m, {
        opentdbCategory: null,
        fallbackPool: biblePool,
        label: "Bible Quiz",
        emoji: "📖",
        category: "biblequiz",
      });
    },
  },
  {
    name: ["footballquiz", "fquiz", "fq", "soccerquiz", "footballtrivia"],
    category: "games",
    desc: "Football trivia — API + fallback, no repeats per chat",
    handler: async (sock, m) => {
      await runQuiz(sock, m, {
        opentdbCategory: 21,
        apiFilter: isFootballQuestion,
        fallbackPool: footballPool,
        label: "Football Quiz",
        emoji: "⚽",
        category: "footballquiz",
      });
    },
  },
  {
    name: ["geoquiz", "geographyquiz", "countryquiz", "capitalquiz"],
    category: "games",
    desc: "Geography quiz — API + fallback, no repeats per chat",
    handler: async (sock, m) => {
      await runQuiz(sock, m, {
        opentdbCategory: 22,
        fallbackPool: geographyPool,
        label: "Geography Quiz",
        emoji: "🌍",
        category: "geoquiz",
      });
    },
  },
  {
    name: ["sciencequiz", "sciquiz", "squiz"],
    category: "games",
    desc: "Science trivia — API + fallback, no repeats per chat",
    handler: async (sock, m) => {
      await runQuiz(sock, m, {
        opentdbCategory: 17,
        fallbackPool: sciencePool,
        label: "Science Quiz",
        emoji: "🔬",
        category: "sciencequiz",
      });
    },
  },
  {
    name: ["historyquiz", "hquiz", "hq"],
    category: "games",
    desc: "History trivia — API + fallback, no repeats per chat",
    handler: async (sock, m) => {
      await runQuiz(sock, m, {
        opentdbCategory: 23,
        fallbackPool: historyPool,
        label: "History Quiz",
        emoji: "🏛️",
        category: "historyquiz",
      });
    },
  },
  {
    name: ["musicquiz", "mquiz", "mq", "songquiz"],
    category: "games",
    desc: "Music trivia — API + fallback, no repeats per chat",
    handler: async (sock, m) => {
      await runQuiz(sock, m, {
        opentdbCategory: 12,
        fallbackPool: musicPool,
        label: "Music Quiz",
        emoji: "🎵",
        category: "musicquiz",
      });
    },
  },
  {
    name: ["randomquiz", "rquiz", "mixquiz"],
    category: "games",
    desc: "Random quiz from any category — no repeats per chat",
    handler: async (sock, m) => {
      const all = [
        { opentdbCategory: null, fallbackPool: biblePool, label: "Bible Quiz", emoji: "📖", category: "biblequiz" },
        { opentdbCategory: 21, apiFilter: isFootballQuestion, fallbackPool: footballPool, label: "Football Quiz", emoji: "⚽", category: "footballquiz" },
        { opentdbCategory: 22, fallbackPool: geographyPool, label: "Geography Quiz", emoji: "🌍", category: "geoquiz" },
        { opentdbCategory: 17, fallbackPool: sciencePool, label: "Science Quiz", emoji: "🔬", category: "sciencequiz" },
        { opentdbCategory: 23, fallbackPool: historyPool, label: "History Quiz", emoji: "🏛️", category: "historyquiz" },
        { opentdbCategory: 12, fallbackPool: musicPool, label: "Music Quiz", emoji: "🎵", category: "musicquiz" },
      ];
      await runQuiz(sock, m, all[Math.floor(Math.random() * all.length)]);
    },
  },
];

module.exports = { commands };
