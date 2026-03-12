# DESAM WABOT

A powerful, multi-device WhatsApp bot built with Node.js and Baileys. Features **200+ commands** across 19 plugin categories including AI, downloads, games, group management, religious content, sports, education, utilities, and much more.

Powered by **Desam Tech**

---

## Features

- Multi-device WhatsApp Web support
- 200+ commands with 400+ aliases
- Plugin-based architecture (easy to extend)
- Group management (welcome/goodbye, anti-link, anti-bad words, warnings)
- Privacy controls (anti-call, auto-read, status viewing)
- AI chatbot integration
- Media tools (stickers, image editing, video downloads)
- Religious content (Bible, Quran, Hadith, prayers)
- Sports data (live scores, fixtures, standings, player/team info)
- Education tools (periodic table, planets, spelling, grammar)
- Utility tools (currency converter, BMI, password generator, hashing)
- Owner-only admin commands (eval, shell, broadcast)
- PM2 ready for 24/7 deployment

---

## Quick Start

### Prerequisites

- Node.js 20+
- A WhatsApp session ID (generate at your DESAM WABOT dashboard)

### Installation

```bash
git clone https://github.com/Theo-Sam/WABot.git
cd WABot
npm install
```

### Configuration

```bash
cp .env.example .env
```

For production deployments, you can also start from `.env.production.example`.

Edit `.env` with your settings:

This build uses local SQLite only. The bot stores its database in `data/bot.db` by default and does not require any external database service.

| Variable           | Description                         | Default          |
| ------------------ | ----------------------------------- | ---------------- |
| `SESSION_ID`       | Your WhatsApp session ID (required) | -                |
| `SQLITE_PATH`      | Local SQLite database file path     | `./data/bot.db`  |
| `BOT_NAME`         | Bot display name                    | `Desam Tech Bot` |
| `PREFIX`           | Command prefix                      | `.`              |
| `OWNER_NUMBER`     | Your WhatsApp number                | -                |
| `MODE`             | `public` or `private`               | `public`         |
| `TIMEZONE`         | Timezone for time-based features    | `Africa/Accra`   |
| `AUTO_READ`        | Auto-read incoming messages         | `off`            |
| `AUTO_STATUS_VIEW` | Auto-view WhatsApp statuses         | `off`            |
| `ANTI_CALL`        | Reject incoming calls               | `on`             |
| `CHATBOT`          | Enable AI chatbot mode              | `off`            |

### Running

Note: this bot is a background worker process (not an HTTP server). On platforms like Render, Koyeb, Heroku, and DigitalOcean App Platform, deploy it as a `worker`, not a `web` service.

SQLite storage note: on a VPS or your own Docker host, `data/bot.db` persists normally on disk. On many managed platforms, local disk can be ephemeral, so the SQLite file may reset after rebuilds or full restarts.

**Direct:**

```bash
node index.js
```

**With PM2 (recommended for 24/7):**

```bash
npm install -g pm2
pm2 start index.js --name desam-bot
pm2 save
pm2 startup
```

### Deployment Tooling

Run the built-in deployment check:

```bash
npm run doctor
```

Backup and restore local SQLite/auth state:

```bash
npm run backup:state
npm run restore:state -- --from backups/state-YYYY-MM-DDTHH-MM-SS-sssZ
```

Exact host-by-host deployment instructions are in `DEPLOYMENT.md`.

---

## Command List

### Main (5 commands)

| Command                                   | Description             |
| ----------------------------------------- | ----------------------- |
| `.menu` / `.help` / `.commands` / `.list` | Show command menu       |
| `.ping`                                   | Check bot response time |
| `.info` / `.botinfo`                      | Bot information         |
| `.owner`                                  | Show owner contact      |
| `.alive`                                  | Check if bot is running |

### AI (10 commands)

| Command                 | Description          |
| ----------------------- | -------------------- |
| `.ai` / `.ask` / `.gpt` | Ask AI a question    |
| `.dalle` / `.imagine`   | Generate AI images   |
| `.gemini`               | Google Gemini AI     |
| `.llama`                | Meta Llama AI        |
| `.deepseek`             | DeepSeek AI          |
| `.blackbox`             | Blackbox AI          |
| `.copilot`              | Microsoft Copilot AI |
| `.claude`               | Claude AI            |
| `.bard`                 | Google Bard AI       |
| `.chatbot`              | Toggle chatbot mode  |

### Download (14 commands)

| Command               | Description                 |
| --------------------- | --------------------------- |
| `.play` / `.song`     | Download song from YouTube  |
| `.video` / `.mp4`     | Download video from YouTube |
| `.ytmp3`              | YouTube to MP3              |
| `.ytmp4`              | YouTube to MP4              |
| `.tiktok` / `.tt`     | Download TikTok video       |
| `.instagram` / `.ig`  | Download Instagram content  |
| `.twitter` / `.tweet` | Download Twitter media      |
| `.facebook` / `.fb`   | Download Facebook video     |
| `.mediafire` / `.mf`  | Download from MediaFire     |
| `.apk`                | Download APK files          |
| `.spotify`            | Download from Spotify       |
| `.soundcloud` / `.sc` | Download from SoundCloud    |
| `.pinterest` / `.pin` | Download Pinterest images   |
| `.gdrive`             | Download from Google Drive  |

### Sticker (3 commands)

| Command               | Description                         |
| --------------------- | ----------------------------------- |
| `.sticker` / `.s`     | Create sticker from image/video     |
| `.toimage` / `.toimg` | Convert sticker to image            |
| `.steal` / `.take`    | Steal sticker with custom pack name |

### Media (4 commands)

| Command                     | Description              |
| --------------------------- | ------------------------ |
| `.toaudio` / `.mp3`         | Extract audio from video |
| `.bass` / `.bassboost`      | Bass boost audio         |
| `.viewonce` / `.vo` / `.vv` | Re-send view once media  |
| `.crop`                     | Crop image               |

### Anime (15 commands)

| Command                        | Description                 |
| ------------------------------ | --------------------------- |
| `.anime`                       | Search anime info           |
| `.manga`                       | Search manga info           |
| `.waifu`                       | Random waifu image          |
| `.neko`                        | Random neko image           |
| `.shinobu`                     | Random shinobu image        |
| `.wallpaper` / `.animewp`      | Anime wallpaper             |
| `.quote` / `.animequote`       | Random anime quote          |
| `.character` / `.animechar`    | Search anime character      |
| `.schedule` / `.animeschedule` | Anime airing schedule       |
| `.top` / `.topanime`           | Top anime list              |
| `.random` / `.randomanime`     | Random anime recommendation |
| `.gif` / `.animegif`           | Random anime GIF            |
| `.couple`                      | Random anime couple         |
| `.meme` / `.animememe`         | Anime meme                  |
| `.fanart`                      | Anime fan art               |

### Search (13 commands)

| Command                             | Description             |
| ----------------------------------- | ----------------------- |
| `.google` / `.g`                    | Google search           |
| `.image` / `.img`                   | Image search            |
| `.youtube` / `.yt`                  | YouTube search          |
| `.wiki` / `.wikipedia`              | Wikipedia search        |
| `.weather` / `.w`                   | Weather information     |
| `.news`                             | Latest news             |
| `.lyrics`                           | Song lyrics search      |
| `.github` / `.gh`                   | GitHub user/repo search |
| `.movie`                            | Movie information       |
| `.define` / `.dictionary` / `.dict` | Word definition         |
| `.recipe`                           | Search recipes          |
| `.npm`                              | Search npm packages     |
| `.stackoverflow` / `.so`            | Search StackOverflow    |

### Games (14 commands)

| Command                    | Description         |
| -------------------------- | ------------------- |
| `.trivia` / `.quiz`        | Trivia quiz         |
| `.riddle`                  | Random riddle       |
| `.joke` / `.jokes`         | Random joke         |
| `.8ball` / `.eightball`    | Magic 8-ball        |
| `.flip` / `.coinflip`      | Flip a coin         |
| `.roll` / `.dice`          | Roll dice           |
| `.rps`                     | Rock Paper Scissors |
| `.truth`                   | Truth question      |
| `.dare`                    | Dare challenge      |
| `.tod` / `.truthordare`    | Truth or Dare       |
| `.wouldyourather` / `.wyr` | Would you rather    |
| `.fact` / `.facts`         | Random fun facts    |
| `.hangman`                 | Hangman game        |
| `.math` / `.mathquiz`      | Math quiz           |

### Group Management (20 commands)

| Command                                | Description                    |
| -------------------------------------- | ------------------------------ |
| `.kick` / `.remove`                    | Remove member from group       |
| `.add`                                 | Add member to group            |
| `.promote`                             | Promote member to admin        |
| `.demote`                              | Demote admin to member         |
| `.mute` / `.close`                     | Close group (admins only chat) |
| `.unmute` / `.open`                    | Open group (everyone can chat) |
| `.setname` / `.gname`                  | Set group name                 |
| `.setdesc` / `.gdesc`                  | Set group description          |
| `.setpp` / `.gpp`                      | Set group profile picture      |
| `.welcome`                             | Toggle welcome messages        |
| `.goodbye` / `.bye`                    | Toggle goodbye messages        |
| `.antilink`                            | Toggle anti-link protection    |
| `.antibad` / `.antibadword`            | Toggle anti-bad words          |
| `.tagall` / `.everyone`                | Tag all members                |
| `.tagadmin` / `.admins` / `.listadmin` | Tag all admins                 |
| `.hidetag`                             | Hidden tag all members         |
| `.groupinfo` / `.ginfo`                | Show group information         |
| `.warn`                                | Warn a group member            |
| `.warnings` / `.warnlist`              | Check user warnings            |
| `.resetwarn` / `.clearwarn`            | Reset user warnings            |
| `.grouplist` / `.members`              | List all group members         |

### Tools (11 commands)

| Command                | Description                     |
| ---------------------- | ------------------------------- |
| `.translate` / `.tr`   | Translate text                  |
| `.tts` / `.say`        | Text to speech                  |
| `.shorten` / `.short`  | Shorten URL                     |
| `.qr` / `.qrcode`      | Generate QR code                |
| `.ocr` / `.readtext`   | Read text from image            |
| `.calc` / `.calculate` | Calculator                      |
| `.base64`              | Base64 encode/decode            |
| `.binary`              | Text to binary / binary to text |
| `.color` / `.hex`      | Color info from hex code        |
| `.ip` / `.ipinfo`      | IP address lookup               |
| `.uptime`              | Bot uptime                      |

### Utility (13 commands)

| Command                                | Description                 |
| -------------------------------------- | --------------------------- |
| `.currency` / `.convert` / `.exchange` | Currency converter          |
| `.country` / `.countryinfo`            | Country information         |
| `.bmi`                                 | BMI calculator              |
| `.age` / `.agecalc`                    | Age calculator              |
| `.password` / `.genpass` / `.passgen`  | Password generator          |
| `.uuid`                                | Generate UUID               |
| `.timestamp` / `.epoch` / `.unix`      | Unix timestamp              |
| `.hash`                                | Hash text (MD5/SHA1/SHA256) |
| `.whois` / `.domain`                   | Domain WHOIS lookup         |
| `.speedtest` / `.speed`                | Server speed info           |
| `.zodiac` / `.horoscope`               | Daily horoscope             |
| `.numberinfo` / `.numfact`             | Number fun facts            |
| `.color2` / `.randomcolor`             | Random color palette        |

### Converter (13 commands)

| Command              | Description          |
| -------------------- | -------------------- |
| `.tomp3`             | Video to MP3         |
| `.tomp4`             | Convert to MP4       |
| `.togif`             | Video/sticker to GIF |
| `.tovideo`           | GIF to video         |
| `.resize`            | Resize image         |
| `.compress`          | Compress image       |
| `.blur`              | Blur image           |
| `.grayscale` / `.bw` | Convert to grayscale |
| `.invert`            | Invert image colors  |
| `.flip`              | Flip image           |
| `.mirror`            | Mirror image         |
| `.rotate`            | Rotate image         |
| `.circle`            | Circle crop image    |

### Privacy (18 commands)

| Command                  | Description                  |
| ------------------------ | ---------------------------- |
| `.anticall`              | Toggle anti-call             |
| `.autoread`              | Toggle auto-read             |
| `.autostatusview`        | Toggle auto status view      |
| `.autobio`               | Toggle auto bio update       |
| `.block`                 | Block a user                 |
| `.unblock`               | Unblock a user               |
| `.blocklist`             | Show blocked users           |
| `.disappear`             | Toggle disappearing messages |
| `.presence`              | Set presence (online/typing) |
| `.setbio` / `.bio`       | Set bot bio                  |
| `.setname` / `.name`     | Set bot display name         |
| `.setpp` / `.pp`         | Set bot profile picture      |
| `.getpp` / `.dp`         | Get profile picture          |
| `.status` / `.setstatus` | Set WhatsApp status          |
| `.readall`               | Read all unread messages     |
| `.clearall`              | Clear all chats              |
| `.archiveall`            | Archive all chats            |
| `.unarchiveall`          | Unarchive all chats          |

### Reactions (17 commands)

| Command   | Description        |
| --------- | ------------------ |
| `.react`  | React to a message |
| `.hug`    | Hug someone        |
| `.slap`   | Slap someone       |
| `.punch`  | Punch someone      |
| `.kiss`   | Kiss someone       |
| `.pat`    | Pat someone        |
| `.cuddle` | Cuddle someone     |
| `.wave`   | Wave at someone    |
| `.poke`   | Poke someone       |
| `.dance`  | Dance              |
| `.cry`    | Cry                |
| `.blush`  | Blush              |
| `.smile`  | Smile              |
| `.happy`  | Happy              |
| `.wink`   | Wink               |
| `.kill`   | Kill someone       |
| `.bite`   | Bite someone       |

### Misc (24 commands)

| Command                     | Description                 |
| --------------------------- | --------------------------- |
| `.fancy` / `.fancytext`     | Convert to fancy text       |
| `.emojimix`                 | Mix two emojis              |
| `.quote` / `.quotemsg`      | Quote a message as image    |
| `.pair`                     | Pair text items together    |
| `.ship`                     | Ship two people             |
| `.rate`                     | Rate something              |
| `.pp` / `.pfp`              | Get user profile picture    |
| `.walink` / `.chatlink`     | Generate WhatsApp chat link |
| `.count` / `.msgcount`      | Message count in group      |
| `.afk`                      | Set AFK status              |
| `.remind` / `.reminder`     | Set a reminder              |
| `.poll`                     | Create a poll               |
| `.forward` / `.fwd`         | Forward a message           |
| `.copy` / `.c`              | Copy message text           |
| `.tag`                      | Tag specific users          |
| `.report`                   | Report a message            |
| `.feedback`                 | Send feedback               |
| `.invite` / `.grouplink`    | Get group invite link       |
| `.revoke`                   | Revoke group invite link    |
| `.qotd`                     | Quote of the day            |
| `.pickup` / `.pickupline`   | Random pickup line          |
| `.insult`                   | Random (playful) insult     |
| `.compliment`               | Random compliment           |
| `.motivation` / `.motivate` | Motivational quote          |

### Religious (5 commands)

| Command                      | Description                  |
| ---------------------------- | ---------------------------- |
| `.bible` / `.verse`          | Get Bible verse by reference |
| `.dailyverse` / `.votd`      | Verse of the day             |
| `.quran` / `.ayah`           | Get Quran verse              |
| `.hadith`                    | Random hadith                |
| `.pray` / `.prayer` / `.dua` | Prayer/dua of the day        |

### Sports (6 commands)

| Command                             | Description          |
| ----------------------------------- | -------------------- |
| `.score` / `.livescore` / `.scores` | Live football scores |
| `.fixtures` / `.upcoming`           | Upcoming fixtures    |
| `.standings` / `.table` / `.league` | League standings     |
| `.player` / `.playerinfo`           | Player info lookup   |
| `.team` / `.teaminfo` / `.club`     | Team info lookup     |
| `.nba` / `.basketball`              | NBA scores/info      |

### Education (8 commands)

| Command                                | Description              |
| -------------------------------------- | ------------------------ |
| `.element` / `.periodic` / `.atom`     | Periodic table lookup    |
| `.planet` / `.space` / `.solar`        | Planet/solar system info |
| `.spell` / `.spellcheck`               | Spell check              |
| `.synonym` / `.synonyms`               | Find synonyms            |
| `.antonym` / `.antonyms` / `.opposite` | Find antonyms            |
| `.rhyme` / `.rhymes`                   | Find rhyming words       |
| `.grammar`                             | Grammar check via AI     |
| `.wordoftheday` / `.wotd`              | Word of the day          |

### Owner (14 commands)

| Command                     | Description                    |
| --------------------------- | ------------------------------ |
| `.broadcast` / `.bc`        | Broadcast message to all chats |
| `.ban`                      | Ban a user from using the bot  |
| `.unban`                    | Unban a user                   |
| `.banlist`                  | Show banned users              |
| `.mode`                     | Switch public/private mode     |
| `.setprefix`                | Change command prefix          |
| `.restart` / `.reboot`      | Restart the bot                |
| `.shutdown` / `.exit`       | Shutdown the bot               |
| `.system` / `.sysinfo`      | System information             |
| `.jid`                      | Get JID of chat/user           |
| `.eval` / `.exec` / `.run`  | Execute JavaScript code        |
| `.shell` / `.bash` / `.cmd` | Execute shell command          |
| `.listplugins` / `.plugins` | List loaded plugins            |

---

## Project Structure

```
WABot/
├── index.js              # Entry point
├── config.js             # Bot configuration
├── package.json
├── .env.example          # Environment template
├── lib/
│   ├── connection.js     # WhatsApp connection handler
│   ├── handler.js        # Message handler & plugin loader
│   └── helpers.js        # Utility functions
└── plugins/
    ├── ai.js             # AI commands
    ├── anime.js          # Anime commands
    ├── converter.js      # Media conversion
    ├── download.js       # Download commands
    ├── education.js      # Education tools
    ├── games.js          # Games & fun
    ├── group.js          # Group management
    ├── main.js           # Core commands
    ├── media.js          # Media tools
    ├── misc.js           # Miscellaneous
    ├── owner.js          # Owner commands
    ├── privacy.js        # Privacy controls
    ├── reactions.js      # Reaction commands
    ├── religious.js      # Religious content
    ├── search.js         # Search commands
    ├── sports.js         # Sports data
    ├── sticker.js        # Sticker tools
    ├── tools.js          # General tools
    └── utility.js        # Utility commands
```

## VPS Deployment

1. SSH into your VPS (Ubuntu 20.04+ recommended)
2. Install Node.js 18+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
3. Clone and setup:
   ```bash
   git clone https://github.com/Theo-Sam/WABot.git
   cd WABot
   npm install
   cp .env.example .env
   nano .env  # Add your SESSION_ID and settings
   ```
4. Start with PM2:
   ```bash
   npm install -g pm2
   pm2 start index.js --name desam-bot
   pm2 save
   pm2 startup
   ```

---

## License

MIT License - Powered by Desam Tech
