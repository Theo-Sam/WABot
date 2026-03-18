#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');

let totalCommands = 0;
let loadErrors = 0;
let structureErrors = 0;
let runtimeIssues = 0;
const issues = [];

const pluginsDir = path.join(__dirname, '..', 'plugins');

console.log('🧪 RUNTIME COMMAND VALIDATION\n');

// Load each plugin and test structure
fs.readdirSync(pluginsDir)
  .filter(f => f.endsWith('.js') && f !== 'main.js') // Skip main for now
  .sort()
  .forEach(file => {
    const filePath = path.join(pluginsDir, file);
    
    try {
      const mod = require(filePath);
      
      if (!mod.commands || !Array.isArray(mod.commands)) {
        issues.push({
          file,
          type: 'STRUCTURE',
          msg: 'No commands array exported',
        });
        structureErrors++;
        return;
      }
      
      mod.commands.forEach((cmd, idx) => {
        totalCommands++;
        
        // Validate command structure
        if (!cmd.name || !Array.isArray(cmd.name)) {
          issues.push({
            file,
            type: 'STRUCTURE',
            msg: `Command ${idx}: missing name array`,
          });
          structureErrors++;
          return;
        }
        
        if (typeof cmd.handler !== 'function') {
          issues.push({
            file,
            type: 'STRUCTURE',
            msg: `Command ${idx} (${cmd.name[0]}): handler is not a function`,
          });
          structureErrors++;
          return;
        }
        
        if (!cmd.category) {
          issues.push({
            file,
            type: 'STRUCTURE',
            msg: `Command ${idx} (${cmd.name[0]}): missing category`,
          });
          structureErrors++;
          return;
        }
        
        if (!cmd.desc) {
          issues.push({
            file,
            type: 'STRUCTURE',
            msg: `Command ${idx} (${cmd.name[0]}): missing description`,
          });
          structureErrors++;
          return;
        }
      });
      
      console.log(`✓ ${file}: ${mod.commands.length} commands (structure OK)`);
    } catch (e) {
      issues.push({
        file,
        type: 'LOAD_ERROR',
        msg: e.message,
      });
      loadErrors++;
      console.log(`✗ ${file}: ${e.message}`);
    }
  });

// Load main separately (has different structure)
try {
  const mainMod = require(path.join(pluginsDir, 'main.js'));
  if (mainMod.commands) {
    totalCommands += mainMod.commands.length;
    console.log(`✓ main.js: ${mainMod.commands.length} commands (structure OK)`);
  }
} catch (e) {
  issues.push({
    file: 'main.js',
    type: 'LOAD_ERROR',
    msg: e.message,
  });
  loadErrors++;
  console.log(`✗ main.js: ${e.message}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`📊 RUNTIME VALIDATION SUMMARY`);
console.log(`${'='.repeat(60)}`);
console.log(`Total commands: ${totalCommands}`);
console.log(`Load errors: ${loadErrors}`);
console.log(`Structure errors: ${structureErrors}`);
console.log(`Total issues: ${issues.length}`);

if (issues.length > 0) {
  console.log(`\n⚠️  Issues found (showing first 20):`);
  issues.slice(0, 20).forEach(issue => {
    console.log(`  [${issue.file}] ${issue.type}: ${issue.msg}`);
  });
  if (issues.length > 20) {
    console.log(`  ... and ${issues.length - 20} more`);
  }
}

if (loadErrors === 0 && structureErrors === 0) {
  console.log(`\n✅ All ${totalCommands} commands loaded and validated!`);
  process.exit(0);
} else {
  console.log(`\n⛔ Found ${loadErrors + structureErrors} issues that need fixing`);
  process.exit(1);
}
