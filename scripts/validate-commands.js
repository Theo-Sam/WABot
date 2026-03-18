#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

let totalCommands = 0;
let totalErrors = 0;
const errors = [];
const warnings = [];

const pluginsDir = path.join(__dirname, '..', 'plugins');
const libDir = path.join(__dirname, '..', 'lib');

console.log('🔍 COMMAND VALIDATION REPORT\n');

fs.readdirSync(pluginsDir)
  .filter(f => f.endsWith('.js'))
  .sort()
  .forEach(file => {
    const filePath = path.join(pluginsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check syntax
    try {
      new Function(content);
    } catch (e) {
      errors.push({
        file,
        severity: 'CRITICAL',
        msg: `Syntax error: ${e.message}`,
      });
      totalErrors++;
      return;
    }

    // Parse command definitions
    let commandCount = 0;
    const cmdRegex = /\{\s*name:\s*\[\s*"([^"]+)"(?:\s*,\s*"[^"]*")*\s*\],([^}]*?)handler:\s*async\s*\(/g;
    const nameMatches = content.match(/name:\s*\[\s*"[^"]+"\s*(?:,\s*"[^"]+"\s*)*\]/g) || [];
    commandCount = nameMatches.length;
    totalCommands += commandCount;

    // Check for missing imports
    const importedModules = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
    const definedImports = {};
    
    importedModules.forEach(imp => {
      const match = imp.match(/require\(['"]([^'"]+)['"]\)/);
      const module = match[1];
      
      // Check if helper modules exist
      if (module.startsWith('../lib/')) {
        const modPath = path.join(libDir, module.replace('../lib/', '') + '.js');
        if (!fs.existsSync(modPath)) {
          errors.push({
            file,
            severity: 'ERROR',
            msg: `Missing library: ${module}`,
          });
          totalErrors++;
        }
      }
    });

    // Check for axios usage (should use postJson/postBuffer instead)
    if (content.includes('axios.post(')) {
      const matches = content.match(/axios\.post\([^)]+\)/g) || [];
      warnings.push({
        file,
        severity: 'WARNING',
        msg: `${matches.length} direct axios.post calls found - should use postJson helper for JSON`,
      });
    }

    // Check for handler function signatures
    const cmdMatches = content.match(/handler:\s*(?:async\s+)?\(sock,\s*m(?:,\s*\{\s*(?:text|args)\s*\})?\)\s*=>/g) || [];
    if (cmdMatches.length !== commandCount) {
      // Some handlers might have different signatures, just warn
      if (cmdMatches.length > 0 && cmdMatches.length < commandCount) {
        warnings.push({
          file,
          severity: 'WARNING',
          msg: `Found ${cmdMatches.length}/${commandCount} standard handlers`,
        });
      }
    }

    // Check for dangerous patterns
    if (content.includes('eval(')) {
      errors.push({
        file,
        severity: 'CRITICAL',
        msg: 'Found eval() - security risk',
      });
      totalErrors++;
    }

    // Check for missing error handling in fetch calls
    const fetchCalls = (content.match(/fetchJson\(|fetchBuffer\(|postJson\(|postBuffer\(/g) || []).length;
    const errorHandlers = (content.match(/\.catch\(|try\s*\{/g) || []).length;
    if (fetchCalls > 0 && errorHandlers < fetchCalls * 0.3) {
      warnings.push({
        file,
        severity: 'WARNING',
        msg: `${fetchCalls} API calls but only ${errorHandlers} error handlers - may not fail gracefully`,
      });
    }

    console.log(`✓ ${file}: ${commandCount} commands`);
  });

// Print summary
console.log(`\n${'='.repeat(60)}`);
console.log(`📊 SUMMARY`);
console.log(`${'='.repeat(60)}`);
console.log(`Total commands: ${totalCommands}`);
console.log(`Total errors: ${totalErrors}`);
console.log(`Total warnings: ${warnings.length}`);

if (errors.length > 0) {
  console.log(`\n❌ ERRORS (${errors.length}):`);
  errors.forEach(e => {
    console.log(`\n  [${e.file}] ${e.severity}: ${e.msg}`);
  });
}

if (warnings.length > 0) {
  console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
  warnings.slice(0, 10).forEach(w => {
    console.log(`\n  [${w.file}] ${w.severity}: ${w.msg}`);
  });
  if (warnings.length > 10) {
    console.log(`\n  ... and ${warnings.length - 10} more warnings`);
  }
}

if (totalErrors === 0) {
  console.log(`\n✅ All ${totalCommands} commands validated successfully!`);
  process.exit(0);
} else {
  console.log(`\n⛔ Found ${totalErrors} critical errors that need fixing`);
  process.exit(1);
}
