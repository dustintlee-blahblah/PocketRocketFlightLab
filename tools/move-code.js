#!/usr/bin/env node
/*
 * Moves top-level declarations (with their comments) from one module to another, keeping their order:
 *
 *   node tools/move-code.js <from.js> <to.js> name1 name2 ...  [--header "What the new module holds."]
 *
 * <to.js> is created when missing, with the --header text as its doc comment, or appended to. Afterwards run
 * `node tools/relink.js` (imports and exports), then `npm run format`. Paths are relative to the repository.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");

const args = process.argv.slice(2);
const hi = args.indexOf("--header");
const header = hi >= 0 ? args.splice(hi, 2)[1] : null;
const [fromRel, toRel, ...names] = args;
if (!fromRel || !toRel || !names.length) {
  console.error('usage: node tools/move-code.js <from.js> <to.js> name... [--header "..."]');
  process.exit(2);
}
const root = path.join(__dirname, "..");
const from = path.join(root, fromRel),
  to = path.join(root, toRel);
let s = fs.readFileSync(from, "utf8");
const ast = parser.parse(s, { sourceType: "module" });
const want = new Set(names);
const pieces = [];
for (const st of ast.program.body) {
  const d = st.type === "ExportNamedDeclaration" && st.declaration ? st.declaration : st;
  const own =
    d.type === "VariableDeclaration"
      ? d.declarations.map((x) => (x.id.type === "Identifier" ? x.id.name : null))
      : d.id
        ? [d.id.name]
        : [];
  const hit = own.filter((n) => want.has(n));
  if (!hit.length) continue;
  if (hit.length !== own.length) throw new Error(`${own.join(", ")} are declared together: move all or none`);
  // the statement with its leading comments, up to the end of its line
  const lc = (st.leadingComments || []).filter((c) => c.start >= (pieces.length ? 0 : 0));
  const start = lc.length ? lc[0].start : st.start;
  const end = st.end + (s[st.end] === "\n" ? 1 : 0);
  pieces.push({ start, end, names: hit });
  hit.forEach((n) => want.delete(n));
}
if (want.size) throw new Error(`not found at the top level of ${fromRel}: ${[...want].join(", ")}`);
// a comment can lead two statements only once: keep pieces from overlapping
pieces.sort((a, b) => a.start - b.start);
for (let i = 1; i < pieces.length; i++) pieces[i].start = Math.max(pieces[i].start, pieces[i - 1].end);
const text = pieces.map((p) => s.slice(p.start, p.end).replace(/\n*$/, "\n")).join("");
for (const p of [...pieces].reverse()) s = s.slice(0, p.start) + s.slice(p.end);
fs.writeFileSync(from, s);
let t;
if (fs.existsSync(to)) t = fs.readFileSync(to, "utf8").replace(/\n*$/, "\n") + text;
else {
  if (!header) throw new Error(`${toRel} is new: give its --header`);
  const doc = header.replace(/(.{1,116})(\s+|$)/g, " * $1\n");
  t = `/**\n${doc} */\n` + text;
}
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.writeFileSync(to, t);
console.log(`moved ${pieces.length} declaration(s) from ${fromRel} to ${toRel}`);
