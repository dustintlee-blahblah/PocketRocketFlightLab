#!/usr/bin/env node
/*
 * Rewrites the import lines of every module in src/ from what each module actually uses, so code can be moved between
 * modules (or a module split in two) without fixing imports by hand:
 *
 *   node tools/relink.js            rewrite src/js/**.js and src/data/*.js
 *   node tools/relink.js --check    report what would change; write nothing (exits 1 if anything would)
 *
 * For each module it
 *   - imports, by name, every top-level name it uses that another module declares;
 *   - adds `export` to a declaration another module uses;
 *   - turns an assignment to another module's variable into a call to that variable's setter (setName, or
 *     setNameValue if setName is taken), adding the setter to the variable's own module when it has none.
 * src/js/main.js is left alone: it imports every module by path (add a new module there if it has a start()).
 * Output is formatted with Prettier, as `npm run format` would.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const prettier = require("prettier");

const check = process.argv.includes("--check");
const root = path.join(__dirname, "..");
const SRC = path.join(root, "src");
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js") && p !== path.join(SRC, "js", "main.js")) files.push(p);
  }
};
walk(SRC);

const src = {},
  ast = {};
const def = new Map(); // top-level name -> file
for (const f of files) {
  src[f] = fs.readFileSync(f, "utf8");
  ast[f] = parser.parse(src[f], { sourceType: "module" });
  traverse(ast[f], {
    Program(p) {
      for (const [n, b] of Object.entries(p.scope.bindings)) {
        if (b.kind === "module") continue; // an import
        if (n === "start") continue; // each module's own start-up, called only by main.js
        if (def.has(n)) throw new Error(`${n} is declared in both ${def.get(n)} and ${f}`);
        def.set(n, f);
      }
      p.stop();
    },
  });
}
const setterOf = (n) => {
  const base = "set" + n[0].toUpperCase() + n.slice(1);
  // an existing setter function in the variable's own module that assigns it, or a new name
  for (const nm of [base + "Value", base])
    if (
      def.get(nm) === def.get(n) &&
      new RegExp(`function ${nm}\\(v\\)\\s*\\{\\s*return \\(${n} = v\\);`).test(src[def.get(n)])
    )
      return { name: nm, exists: true };
  return { name: def.has(base) ? base + "Value" : base, exists: false };
};

const uses = new Map(), // file -> Set(names from other modules)
  assigns = new Map(); // file -> [{name, start, end, rs, re}]
const usedElsewhere = new Set(),
  needSetter = new Set();
for (const f of files) {
  uses.set(f, new Set());
  assigns.set(f, []);
  traverse(ast[f], {
    Identifier(p) {
      const n = p.node.name;
      if (!def.has(n) || def.get(n) === f) return;
      const b = p.scope.getBinding(n);
      if (b && b.kind !== "module") return; // a local of the same name
      if (p.parentPath.isImportSpecifier()) return;
      const par = p.parentPath;
      const isAssign = par.isAssignmentExpression() && p.key === "left";
      if (par.isUpdateExpression()) throw new Error(`${f}: ${n}++/-- on another module's variable`);
      if (!(p.isReferencedIdentifier() || isAssign)) return;
      uses.get(f).add(n);
      usedElsewhere.add(n);
      if (isAssign) {
        if (par.node.operator !== "=") throw new Error(`${f}: ${n} ${par.node.operator} on another module's variable`);
        needSetter.add(n);
        assigns.get(f).push({
          name: n,
          start: par.node.start,
          rs: par.node.right.start,
          re: par.node.right.end,
          end: par.node.end,
        });
      }
    },
  });
}
const setters = new Map([...needSetter].map((n) => [n, setterOf(n)]));
for (const { name } of setters.values()) usedElsewhere.add(name);

const rel = (from, to) => {
  const r = path.relative(path.dirname(from), to).split(path.sep).join("/");
  return r.startsWith(".") ? r : "./" + r;
};
let changedFiles = 0;
(async () => {
  for (const f of files) {
    let s = src[f];
    const edits = [];
    // drop the old imports (all are of the app's own modules)
    for (const st of ast[f].program.body)
      if (st.type === "ImportDeclaration") edits.push([st.start, st.end + (s[st.end] === "\n" ? 1 : 0), ""]);
    // export what other modules use
    for (const st of ast[f].program.body) {
      if (st.type === "ExportNamedDeclaration" || st.type === "ImportDeclaration") continue;
      let names = [];
      if (st.type === "FunctionDeclaration" || st.type === "ClassDeclaration") names = [st.id.name];
      else if (st.type === "VariableDeclaration")
        names = st.declarations.flatMap((d) => (d.id.type === "Identifier" ? [d.id.name] : []));
      if (names.some((n) => usedElsewhere.has(n))) edits.push([st.start, st.start, "export "]);
    }
    // assignments to other modules' variables -> setter calls
    for (const a of assigns.get(f)) {
      edits.push([a.start, a.rs, setters.get(a.name).name + "("]);
      edits.push([a.re, a.end, ")"]);
    }
    edits.sort((x, y) => y[0] - x[0] || y[1] - x[1]);
    for (const [a, b, t] of edits) s = s.slice(0, a) + t + s.slice(b);
    // setters this module's variables need
    const add = [...setters].filter(([n, st]) => def.get(n) === f && !st.exists);
    if (add.length) {
      const at = s.search(/\n\/\*\*\n \* Start-up: /);
      const text = add
        .map(
          ([n, st]) =>
            `/**\n * Sets ${n} (for other modules: an imported binding can't be assigned).\n * @param {*} v\n */\nexport function ${st.name}(v) {\n  return (${n} = v);\n}\n`,
        )
        .join("");
      s = at >= 0 ? s.slice(0, at + 1) + text + s.slice(at + 1) : s.replace(/\n*$/, "\n") + text;
    }
    // the imports, one line per module
    const need = new Map();
    for (const n of uses.get(f)) {
      const g = def.get(n);
      if (!need.has(g)) need.set(g, new Set());
      need.get(g).add(n);
    }
    for (const a of assigns.get(f)) need.get(def.get(a.name)).add(setters.get(a.name).name);
    const lines = [...need.keys()]
      .sort((a, b) => (path.relative(SRC, a) < path.relative(SRC, b) ? -1 : 1))
      .map(
        (g) =>
          `import { ${[...need.get(g)].sort((a, b) => a.localeCompare(b, "en")).join(", ")} } from "${rel(f, g)}";`,
      );
    if (lines.length) {
      const lead = /^\/\*\*[\s\S]*?\*\/\n/.exec(s);
      const at = lead ? lead[0].length : 0;
      s = s.slice(0, at) + lines.join("\n") + "\n" + s.slice(at);
    }
    // formatted as `npm run format` would (generated data, which Prettier ignores, is left as it is)
    if (!(await prettier.getFileInfo(f, { ignorePath: path.join(root, ".prettierignore") })).ignored)
      s = await prettier.format(s, { ...(await prettier.resolveConfig(f)), filepath: f });
    if (s !== src[f]) {
      changedFiles++;
      if (check) console.log("would change " + path.relative(root, f));
      else fs.writeFileSync(f, s);
    }
  }
  console.log(`${changedFiles} module(s) ${check ? "would change" : "rewritten"}`);
  if (check && changedFiles) process.exitCode = 1;
})();
