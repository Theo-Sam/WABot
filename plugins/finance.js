const config = require("../config");

function fmtMoney(n, sym = "") {
  return sym + Number(n.toFixed(2)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const commands = [
  {
    name: ["tip", "tipcalc"],
    category: "tools",
    desc: "Calculate tip and total for a bill",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}tip <bill amount> [tip%] [people]\nExample: ${config.PREFIX}tip 50 15 3`);
      const parts = text.trim().split(/\s+/);
      const bill = parseFloat(parts[0]);
      const tipPct = parseFloat(parts[1] || "15");
      const people = parseInt(parts[2] || "1");
      if (isNaN(bill) || bill <= 0) return m.reply("❌ Enter a valid bill amount.");
      if (isNaN(tipPct) || tipPct < 0) return m.reply("❌ Enter a valid tip percentage.");
      if (isNaN(people) || people < 1) return m.reply("❌ Enter a valid number of people.");
      const tipAmt = bill * tipPct / 100;
      const total = bill + tipAmt;
      const perPerson = total / people;
      const tipPP = tipAmt / people;
      let msg = `💰 *Tip Calculator*\n\n`;
      msg += `Bill:       ${fmtMoney(bill)}\n`;
      msg += `Tip (${tipPct}%):  ${fmtMoney(tipAmt)}\n`;
      msg += `Total:      ${fmtMoney(total)}\n`;
      if (people > 1) {
        msg += `\n👥 Split ${people} ways:\n`;
        msg += `Per person: ${fmtMoney(perPerson)}\n`;
        msg += `Tip/person: ${fmtMoney(tipPP)}\n`;
      }
      msg += `\n_${config.BOT_NAME}_`;
      return m.reply(msg);
    },
  },
  {
    name: ["split", "billsplit", "splitbill"],
    category: "tools",
    desc: "Split a bill equally among people",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}split <total amount> <number of people>\nExample: ${config.PREFIX}split 120 4`);
      const parts = text.trim().split(/\s+/);
      const total = parseFloat(parts[0]);
      const people = parseInt(parts[1]);
      if (isNaN(total) || total <= 0) return m.reply("❌ Enter a valid total amount.");
      if (isNaN(people) || people < 2) return m.reply("❌ Enter at least 2 people.");
      const each = total / people;
      const rounded = Math.ceil(each * 100) / 100;
      let msg = `🍽️ *Bill Splitter*\n\n`;
      msg += `Total:       ${fmtMoney(total)}\n`;
      msg += `People:      ${people}\n`;
      msg += `Each pays:   ${fmtMoney(each)}\n`;
      msg += `Rounded up:  ${fmtMoney(rounded)}\n`;
      msg += `\n_${config.BOT_NAME}_`;
      return m.reply(msg);
    },
  },
  {
    name: ["compound", "interest", "ci"],
    category: "tools",
    desc: "Calculate compound interest",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}compound <principal> <annual rate%> <years> [compounds/year]\nExample: ${config.PREFIX}compound 10000 8 10 12`);
      const parts = text.trim().split(/\s+/);
      const P = parseFloat(parts[0]);
      const r = parseFloat(parts[1]) / 100;
      const t = parseFloat(parts[2]);
      const n = parseFloat(parts[3] || "12");
      if ([P, r, t, n].some(isNaN) || P <= 0 || r < 0 || t <= 0 || n < 1) return m.reply("❌ Invalid values. Example: .compound 10000 8 10 12");
      const A = P * Math.pow(1 + r / n, n * t);
      const earned = A - P;
      const total_simple = P * (1 + r * t);
      const nMap = { 12: "Monthly", 4: "Quarterly", 2: "Semi-annually", 1: "Annually", 365: "Daily" };
      const freq = nMap[n] || `${n}x/year`;
      let msg = `📈 *Compound Interest*\n\n`;
      msg += `Principal:    ${fmtMoney(P)}\n`;
      msg += `Annual rate:  ${(r * 100).toFixed(2)}%\n`;
      msg += `Duration:     ${t} year${t !== 1 ? "s" : ""}\n`;
      msg += `Compounding:  ${freq}\n\n`;
      msg += `Interest:     ${fmtMoney(earned)}\n`;
      msg += `Final amount: *${fmtMoney(A)}*\n\n`;
      msg += `📊 vs Simple interest: ${fmtMoney(total_simple - P)} (${fmtMoney(total_simple)})\n`;
      msg += `💡 Extra from compounding: ${fmtMoney(A - total_simple)}\n\n`;
      msg += `_${config.BOT_NAME}_`;
      return m.reply(msg);
    },
  },
  {
    name: ["loan", "mortgage", "emi"],
    category: "tools",
    desc: "Calculate loan/mortgage monthly payment",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}loan <amount> <annual rate%> <years>\nExample: ${config.PREFIX}loan 200000 6.5 30`);
      const parts = text.trim().split(/\s+/);
      const P = parseFloat(parts[0]);
      const annualRate = parseFloat(parts[1]);
      const years = parseFloat(parts[2]);
      if ([P, annualRate, years].some(isNaN) || P <= 0 || annualRate < 0 || years <= 0) return m.reply("❌ Invalid values. Example: .loan 200000 6.5 30");
      const r = annualRate / 100 / 12;
      const n = years * 12;
      let monthly;
      if (r === 0) {
        monthly = P / n;
      } else {
        monthly = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
      }
      const totalPaid = monthly * n;
      const totalInterest = totalPaid - P;
      let msg = `🏦 *Loan Calculator*\n\n`;
      msg += `Loan amount:    ${fmtMoney(P)}\n`;
      msg += `Annual rate:    ${annualRate}%\n`;
      msg += `Term:           ${years} year${years !== 1 ? "s" : ""} (${n} months)\n\n`;
      msg += `Monthly payment: *${fmtMoney(monthly)}*\n`;
      msg += `Total paid:      ${fmtMoney(totalPaid)}\n`;
      msg += `Total interest:  ${fmtMoney(totalInterest)}\n`;
      msg += `Interest ratio:  ${(totalInterest / P * 100).toFixed(1)}%\n\n`;
      msg += `_${config.BOT_NAME}_`;
      return m.reply(msg);
    },
  },
  {
    name: ["savings", "savingsgoal", "savecalc"],
    category: "tools",
    desc: "Calculate how long to reach a savings goal",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}savings <goal> <monthly saving> [annual interest%]\nExample: ${config.PREFIX}savings 50000 500 5`);
      const parts = text.trim().split(/\s+/);
      const goal = parseFloat(parts[0]);
      const monthly = parseFloat(parts[1]);
      const rate = parseFloat(parts[2] || "0") / 100 / 12;
      if ([goal, monthly].some(isNaN) || goal <= 0 || monthly <= 0) return m.reply("❌ Invalid values.");
      if (monthly >= goal) {
        return m.reply(`💰 *Savings Calculator*\n\nYou can reach your goal of ${fmtMoney(goal)} in *1 month* saving ${fmtMoney(monthly)}/month!\n\n_${config.BOT_NAME}_`);
      }
      let months, totalInterest = 0;
      if (rate === 0) {
        months = Math.ceil(goal / monthly);
      } else {
        let balance = 0;
        months = 0;
        while (balance < goal && months < 1200) {
          balance = balance * (1 + rate) + monthly;
          totalInterest += balance - monthly - (balance - monthly) / (1 + rate) * (1 + rate) + (balance - monthly) / (1 + rate) * rate;
          months++;
        }
        totalInterest = balance - monthly * months;
      }
      const years = Math.floor(months / 12);
      const remMonths = months % 12;
      let msg = `💰 *Savings Calculator*\n\n`;
      msg += `Goal:           ${fmtMoney(goal)}\n`;
      msg += `Monthly saving: ${fmtMoney(monthly)}\n`;
      msg += `Interest rate:  ${parseFloat(parts[2] || "0")}% p.a.\n\n`;
      msg += `Time needed: *${years > 0 ? `${years} year${years !== 1 ? "s" : ""} ` : ""}${remMonths > 0 ? `${remMonths} month${remMonths !== 1 ? "s" : ""}` : ""}*\n`;
      msg += `Total saved:    ${fmtMoney(monthly * months)}\n`;
      if (totalInterest > 0.01) msg += `Interest earned: ${fmtMoney(totalInterest)}\n`;
      msg += `\n_${config.BOT_NAME}_`;
      return m.reply(msg);
    },
  },
  {
    name: ["tax", "taxcalc"],
    category: "tools",
    desc: "Calculate income tax amount",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}tax <income> <tax rate%>\nExample: ${config.PREFIX}tax 75000 25`);
      const parts = text.trim().split(/\s+/);
      const income = parseFloat(parts[0]);
      const rate = parseFloat(parts[1]);
      if (isNaN(income) || income <= 0 || isNaN(rate) || rate < 0 || rate > 100) return m.reply("❌ Invalid values. Income must be positive, rate 0-100.");
      const taxAmt = income * rate / 100;
      const netIncome = income - taxAmt;
      const monthly = netIncome / 12;
      let msg = `💸 *Tax Calculator*\n\n`;
      msg += `Gross income:  ${fmtMoney(income)}\n`;
      msg += `Tax rate:      ${rate}%\n`;
      msg += `Tax amount:    ${fmtMoney(taxAmt)}\n`;
      msg += `Net income:    *${fmtMoney(netIncome)}*\n`;
      msg += `Monthly take-home: ${fmtMoney(monthly)}\n\n`;
      msg += `_Note: This is a simplified flat-rate calculation._\n_${config.BOT_NAME}_`;
      return m.reply(msg);
    },
  },
  {
    name: ["discount", "sale", "priceoff"],
    category: "tools",
    desc: "Calculate discounted price",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}discount <original price> <discount%>\nExample: ${config.PREFIX}discount 250 30`);
      const parts = text.trim().split(/\s+/);
      const price = parseFloat(parts[0]);
      const disc = parseFloat(parts[1]);
      if (isNaN(price) || price <= 0 || isNaN(disc) || disc < 0 || disc > 100) return m.reply("❌ Enter a valid price and discount %.");
      const saved = price * disc / 100;
      const final = price - saved;
      let msg = `🏷️ *Discount Calculator*\n\n`;
      msg += `Original price: ${fmtMoney(price)}\n`;
      msg += `Discount:       ${disc}% off\n`;
      msg += `You save:       *${fmtMoney(saved)}*\n`;
      msg += `Final price:    *${fmtMoney(final)}*\n\n`;
      msg += `_${config.BOT_NAME}_`;
      return m.reply(msg);
    },
  },
  {
    name: ["percentage", "percent", "pct"],
    category: "tools",
    desc: "Percentage calculator (multiple modes)",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(
        `Usage:\n` +
        `${config.PREFIX}percentage what% of 200 is 50\n` +
        `${config.PREFIX}percentage 30% of 150\n` +
        `${config.PREFIX}percentage increase 100 to 150\n` +
        `${config.PREFIX}percentage decrease 200 from 160`
      );
      const t = text.toLowerCase().trim();
      const ofMatch = t.match(/^([\d.]+)%\s+of\s+([\d.]+)/);
      const whatMatch = t.match(/what(%|\s*percent).*of\s+([\d.]+).*is\s+([\d.]+)/i);
      const increaseMatch = t.match(/increase\s+([\d.]+)\s+to\s+([\d.]+)/i);
      const decreaseMatch = t.match(/decrease\s+([\d.]+)\s+from\s+([\d.]+)/i);
      if (ofMatch) {
        const pct = parseFloat(ofMatch[1]);
        const total = parseFloat(ofMatch[2]);
        const result = total * pct / 100;
        return m.reply(`📊 *${pct}% of ${total} = *${result.toFixed(2)}*`);
      }
      if (whatMatch) {
        const total = parseFloat(whatMatch[2]);
        const part = parseFloat(whatMatch[3]);
        const pct = part / total * 100;
        return m.reply(`📊 *${part} is *${pct.toFixed(2)}%* of ${total}`);
      }
      if (increaseMatch) {
        const from = parseFloat(increaseMatch[1]);
        const to = parseFloat(increaseMatch[2]);
        const pct = (to - from) / from * 100;
        return m.reply(`📊 *Increase from ${from} to ${to} = *+${pct.toFixed(2)}%*`);
      }
      if (decreaseMatch) {
        const from = parseFloat(decreaseMatch[1]);
        const to = parseFloat(decreaseMatch[2]);
        const pct = (from - to) / from * 100;
        return m.reply(`📊 *Decrease from ${from} to ${to} = *-${pct.toFixed(2)}%*`);
      }
      return m.reply(
        `Usage:\n` +
        `${config.PREFIX}percentage 30% of 150\n` +
        `${config.PREFIX}percentage increase 100 to 150\n` +
        `${config.PREFIX}percentage decrease 200 from 160`
      );
    },
  },
  {
    name: ["inflation", "purchasingpower"],
    category: "tools",
    desc: "Calculate inflation-adjusted purchasing power",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}inflation <amount> <start year> <end year> [avg inflation%]\nExample: ${config.PREFIX}inflation 1000 2000 2024 3.5`);
      const parts = text.trim().split(/\s+/);
      const amount = parseFloat(parts[0]);
      const fromYear = parseInt(parts[1]);
      const toYear = parseInt(parts[2]);
      const rate = parseFloat(parts[3] || "3.5") / 100;
      if ([amount, fromYear, toYear, rate].some(isNaN)) return m.reply("❌ Invalid values.");
      const years = toYear - fromYear;
      if (Math.abs(years) > 200) return m.reply("❌ Year range too large.");
      const adjusted = amount * Math.pow(1 + rate, years);
      const real = amount / Math.pow(1 + rate, years);
      let msg = `📉 *Inflation Calculator*\n\n`;
      msg += `Amount:       ${fmtMoney(amount)} (${fromYear})\n`;
      msg += `Avg inflation: ${(rate * 100).toFixed(1)}% per year\n`;
      msg += `Years:        ${Math.abs(years)} (${fromYear} → ${toYear})\n\n`;
      if (years > 0) {
        msg += `Equivalent in ${toYear}: *${fmtMoney(adjusted)}*\n`;
        msg += `Purchasing power lost: ${fmtMoney(adjusted - amount)}\n`;
      } else {
        msg += `Equivalent in ${toYear}: *${fmtMoney(real)}*\n`;
        msg += `Purchasing power gained: ${fmtMoney(amount - real)}\n`;
      }
      msg += `\n_${config.BOT_NAME}_`;
      return m.reply(msg);
    },
  },
  {
    name: ["unitconv", "convert2", "uc"],
    category: "tools",
    desc: "Convert units (length, weight, temp, speed)",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(
        `Usage: ${config.PREFIX}unitconv <value> <from> <to>\n\n` +
        `*Length:* km, m, cm, mm, mi, yd, ft, in\n` +
        `*Weight:* kg, g, mg, lb, oz, ton\n` +
        `*Temp:* c, f, k\n` +
        `*Speed:* kmh, mph, ms, knots\n` +
        `*Volume:* l, ml, gal, qt, pt, cup, floz\n\n` +
        `Example: ${config.PREFIX}unitconv 100 km mi`
      );
      const parts = text.trim().split(/\s+/);
      if (parts.length < 3) return m.reply(`Usage: ${config.PREFIX}unitconv <value> <from> <to>`);
      const val = parseFloat(parts[0]);
      const from = parts[1].toLowerCase();
      const to = parts[2].toLowerCase();
      if (isNaN(val)) return m.reply("❌ Enter a valid number.");
      const toMeters = { km:1000, m:1, cm:0.01, mm:0.001, mi:1609.344, yd:0.9144, ft:0.3048, in:0.0254 };
      const toKg = { kg:1, g:0.001, mg:0.000001, lb:0.453592, oz:0.0283495, ton:1000 };
      const toL = { l:1, ml:0.001, gal:3.78541, qt:0.946353, pt:0.473176, cup:0.236588, floz:0.0295735 };
      const toMs = { kmh:1/3.6, mph:0.44704, ms:1, knots:0.514444 };
      let result;
      let unit = "";
      if (toMeters[from] && toMeters[to]) {
        result = val * toMeters[from] / toMeters[to];
        unit = to;
      } else if (toKg[from] && toKg[to]) {
        result = val * toKg[from] / toKg[to];
        unit = to;
      } else if (toL[from] && toL[to]) {
        result = val * toL[from] / toL[to];
        unit = to;
      } else if (toMs[from] && toMs[to]) {
        result = val * toMs[from] / toMs[to];
        unit = to;
      } else if ((from === "c" || from === "f" || from === "k") && (to === "c" || to === "f" || to === "k")) {
        let celsius;
        if (from === "c") celsius = val;
        else if (from === "f") celsius = (val - 32) * 5 / 9;
        else celsius = val - 273.15;
        if (to === "c") { result = celsius; unit = "°C"; }
        else if (to === "f") { result = celsius * 9 / 5 + 32; unit = "°F"; }
        else { result = celsius + 273.15; unit = "K"; }
      } else {
        return m.reply(`❌ Cannot convert *${from}* to *${to}*. Check the supported units.`);
      }
      const fmt = Math.abs(result) < 0.001 ? result.toExponential(4) : result < 10000 ? parseFloat(result.toFixed(6)).toString() : result.toFixed(2);
      return m.reply(`📏 *Unit Converter*\n\n${val} ${from} = *${fmt} ${unit}*\n\n_${config.BOT_NAME}_`);
    },
  },
  {
    name: ["profit", "profitloss", "pl"],
    category: "tools",
    desc: "Calculate profit or loss on a trade/investment",
    handler: async (sock, m, { text }) => {
      if (!text) return m.reply(`Usage: ${config.PREFIX}profit <buy price> <sell price> [quantity]\nExample: ${config.PREFIX}profit 100 150 10`);
      const parts = text.trim().split(/\s+/);
      const buy = parseFloat(parts[0]);
      const sell = parseFloat(parts[1]);
      const qty = parseFloat(parts[2] || "1");
      if (isNaN(buy) || isNaN(sell) || buy <= 0) return m.reply("❌ Enter valid buy and sell prices.");
      const diff = sell - buy;
      const pct = (diff / buy) * 100;
      const total = diff * qty;
      const isProfit = diff >= 0;
      let msg = `${isProfit ? "📈" : "📉"} *Profit & Loss*\n\n`;
      msg += `Buy price:    ${fmtMoney(buy)}\n`;
      msg += `Sell price:   ${fmtMoney(sell)}\n`;
      if (qty !== 1) msg += `Quantity:     ${qty}\n`;
      msg += `\nChange:       ${isProfit ? "+" : ""}${fmtMoney(diff)} (${isProfit ? "+" : ""}${pct.toFixed(2)}%)\n`;
      if (qty !== 1) msg += `Total ${isProfit ? "profit" : "loss"}: *${isProfit ? "+" : ""}${fmtMoney(total)}*\n`;
      else msg += `Result: *${isProfit ? "Profit" : "Loss"} of ${fmtMoney(Math.abs(diff))}*\n`;
      msg += `\n_${config.BOT_NAME}_`;
      return m.reply(msg);
    },
  },
];

module.exports = { commands };
