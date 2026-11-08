#!/usr/bin/env node
// Lists exports of the app's modules that nothing uses: no module imports them, and the tests don't call them (the
// tests, validation scripts and tools reach the app's names through window.__pr; see src/js/main.js). ESLint checks names within a module; this
// checks across them.
// usage: node tools/unused-exports.js   (exits 1 if any are found)
"use strict";
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");

const root = path.join(__dirname, "..");
const SRC = path.join(root, "src");
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) files.push(p);
  }
};
walk(SRC);

const exported = []; // [name, file, line]
const imported = new Set();
for (const f of files) {
  const ast = parser.parse(fs.readFileSync(f, "utf8"), { sourceType: "module" });
  for (const st of ast.program.body) {
    if (st.type === "ImportDeclaration")
      for (const sp of st.specifiers) imported.add(sp.imported ? sp.imported.name : "*");
    if (st.type !== "ExportNamedDeclaration" || !st.declaration) continue;
    const d = st.declaration;
    const names =
      d.type === "VariableDeclaration"
        ? d.declarations.flatMap((x) => (x.id.type === "Identifier" ? [x.id.name] : []))
        : d.id
          ? [d.id.name]
          : [];
    for (const n of names) exported.push([n, path.relative(root, f), st.loc.start.line]);
  }
}
// what the tests use from the page
const tests = ["tests", "validation", "tools"]
  .flatMap((d) =>
    fs
      .readdirSync(path.join(root, d))
      .filter((f) => f.endsWith(".js"))
      .map((f) => fs.readFileSync(path.join(root, d, f), "utf8")),
  )
  .join("\n");
const used = (n) =>
  imported.has(n) ||
  n === "start" || // each module's start-up, called by main.js
  new RegExp(`\\b${n.replace(/\$/g, "\\$")}\\b`).test(tests);
const out = exported.filter(([n]) => !used(n)).map(([n, f, l]) => `${f}:${l} ${n}`);
console.log(out.join("\n") || "none");
if (out.length) process.exitCode = 1;
