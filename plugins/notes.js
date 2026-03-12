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
        return m.reply(`Usage: ${config.PREFIX}addnote <name> <content>`);
      }
      const name = args[0].toLowerCase();
      const content = args.slice(1).join(" ");
      m.react("⏳");
      try {
        addNote(m.chat, name, content, m.sender);
        await m.reply(`✅ Note *${name}* saved successfully!`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to save note.");
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
        return m.reply(`Usage: ${config.PREFIX}note <name>`);
      }
      const name = args[0].toLowerCase();
      m.react("⏳");
      try {
        const note = getNote(m.chat, name);
        if (!note) {
          m.react("❌");
          return m.reply("❌ Note not found.");
        }
        await m.reply(`📝 *${name}*\n\n${note.content}`);
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
        return m.reply(`Usage: ${config.PREFIX}delnote <name>`);
      }
      const name = args[0].toLowerCase();
      m.react("⏳");
      try {
        deleteNote(m.chat, name);
        await m.reply(`✅ Note *${name}* deleted!`);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to delete note.");
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
        msg += notes.map((n, i) => `${i + 1}. *${n.name}*`).join("\n");
        msg += `\n\nUse ${config.PREFIX}note <name> to view a note.`;
        await m.reply(msg);
        m.react("✅");
      } catch {
        m.react("❌");
        await m.reply("❌ Failed to list notes.");
      }
    },
  },
];

module.exports = { commands };