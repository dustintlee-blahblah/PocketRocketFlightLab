#!/usr/bin/env node
/*
 * Checks that loading a module only defines things (see ARCHITECTURE.md): at the top level of every module in src/,
 * nothing runs that uses another module, because modules can load in any order. Code that does belongs in the
 * module's start(). Allowed at the top level: imports, function and class declarations, `export function start()`,
 * and variables whose initial value uses another module's name only inside a function (an arrow function stored in a
 * constant is fine; calling one at load is not), and that call none of the module's own functions at load.
 * usage: node tools/check-module-tops.js   (exits 1 on a problem)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const root = path.join(__dirname, "..");
const SRC = path.join(root, "src");
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js") && p !== path.join(SRC, "js", "main.js")) files.push(p);
  }
};
walk(SRC);
const problems = [];
for (const f of files) {
  const ast = parser.parse(fs.readFileSync(f, "utf8"), { sourceType: "module" });
  traverse(ast, {
    Program(p) {
      for (const st of p.get("body")) {
        const d = st.isExportNamedDeclaration() && st.node.declaration ? st.get("declaration") : st;
        if (st.isImportDeclaration() || d.isFunctionDeclaration() || d.isClassDeclaration()) continue;
        if (!d.isVariableDeclaration()) {
          problems.push(
            `${path.relative(root, f)}:${st.node.loc.start.line} a statement runs at load (move it into start())`,
          );
          continue;
        }
        d.traverse({
          Function(q) {
            q.skip(); // defined, not run
          },
          "CallExpression|NewExpression"(q) {
            // a call to one of the module's own functions could reach other modules
            const c = q.node.callee;
            if (c.type === "Identifier" && q.scope.getBinding(c.name))
              problems.push(`${path.relative(root, f)}:${q.node.loc.start.line} ${c.name}() is called at load`);
          },
          Identifier(q) {
            if (!q.isReferencedIdentifier()) return;
            const b = q.scope.getBinding(q.node.name);
            if (b && b.kind === "module")
              problems.push(
                `${path.relative(root, f)}:${q.node.loc.start.line} ${q.node.name}, from another module, is used at load`,
              );
          },
        });
      }
      p.stop();
    },
  });
}
console.log(problems.join("\n") || "none");
if (problems.length) process.exitCode = 1;
