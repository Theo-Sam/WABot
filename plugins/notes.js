const config = require("../config");
const { addNote, getNote, deleteNote, listNotes } = require("../lib/database");

const commands = [
  {
    name: ["addnote", "savenote"],
    category: "notes",
    desc: "Save a note with a name",
    group: true,
    admin: true,
    handler: async (sock, m, { args, text }) => {
      if (args.length < 2) {
        return m.usageReply("addnote <name> <content>");
      }
      const name = args[0].toLowerCase();
      const content = args.slice(1).join(" ");
      if (!/^[a-z0-9_-]{2,40}$/i.test(name)) {
        return m.reply("❌ Note name must be 2-40 characters and use letters, numbers, _ or - only.");
      }
      if (content.length < 2) {
        return m.reply("❌ Note content is too short.");
      }
      m.react("⏳");
      try {
        addNote(m.chat, name, content, m.sender);
        await m.reply(`✅ Note *${name}* saved.\n📝 Length: ${content.length} characters`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.errorReply("Failed to save note. Please try again.");
      }
    },
  },
  {
    name: ["getnote", "note"],
    category: "notes",
    desc: "Retrieve a note by name",
    group: true,
    handler: async (sock, m, { args }) => {
      if (!args[0]) {
        return m.usageReply("note <name>");
      }
      const name = args[0].toLowerCase();
      m.react("⏳");
      try {
        const note = getNote(m.chat, name);
        if (!note) {
          m.react("❌");
          return m.reply(`❌ Note *${name}* not found.\nUse ${config.PREFIX}notes to list saved notes.`);
        }
        const author = note.created_by ? `@${note.created_by.split("@")[0]}` : "Unknown";
        const created = note.created_at ? new Date(note.created_at).toLocaleString() : "Unknown";
        await sock.sendMessage(m.chat, {
          text: `📝 *${name}*\n\n${note.content}\n\n👤 Saved by: ${author}\n🕒 Saved at: ${created}`,
          mentions: note.created_by ? [note.created_by] : [],
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to retrieve note.");
      }
    },
  },
  {
    name: ["delnote", "deletenote"],
    category: "notes",
    desc: "Delete a saved note",
    group: true,
    admin: true,
    handler: async (sock, m, { args }) => {
      if (!args[0]) {
        return m.usageReply("delnote <name>");
      }
      const name = args[0].toLowerCase();
      m.react("⏳");
      try {
        const existed = getNote(m.chat, name);
        if (!existed) {
          m.react("❌");
          return m.reply(`❌ Note *${name}* does not exist.`);
        }
        deleteNote(m.chat, name);
        await m.reply(`✅ Note *${name}* deleted.`);
        m.react("✅");
      } catch {
        m.react("❌");
        return m.errorReply("Failed to delete note. Please try again.");
      }
    },
  },
  {
    name: ["notes", "listnotes"],
    category: "notes",
    desc: "List all saved notes",
    group: true,
    handler: async (sock, m) => {
      m.react("⏳");
      try {
        const notes = listNotes(m.chat);
        if (!notes || notes.length === 0) {
          m.react("❌");
          return m.reply("📭 No notes saved in this group.");
        }
        let msg = `📝 *Saved Notes (${notes.length})*\n\n`;
        msg += notes.map((n, i) => {
          const owner = n.created_by ? `@${n.created_by.split("@")[0]}` : "unknown";
          return `${i + 1}. *${n.name}* — ${owner}`;
        }).join("\n");
        msg += `\n\nUse ${config.PREFIX}note <name> to view a note.`;
        await sock.sendMessage(m.chat, {
          text: msg,
          mentions: notes.filter((n) => !!n.created_by).map((n) => n.created_by),
        }, { quoted: { key: m.key, message: m.message } });
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to list notes.");
      }
    },
  },
];

module.exports = { commands };