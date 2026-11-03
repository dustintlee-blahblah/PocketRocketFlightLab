// Lists top-level names (functions, const/let/var, classes) in src/js that nothing references: not another file and
// not the page itself (inline handlers). The files share one global scope, so ESLint cannot check this.
// usage: node tools/unused-globals.js [src]   (exits 1 if any are found)
const fs = require("fs"),
  path = require("path");
const parser = require("@babel/parser"),
  traverse = require("@babel/traverse").default;
const root = process.argv[2] || path.join(__dirname, "..", "src");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const order = [...html.matchAll(/@@include\s+(\S+)/g)].map((m) => m[1]).filter((f) => f.endsWith(".js"));
const decl = new Map(),
  refs = new Map();
const bump = (n) => refs.set(n, (refs.get(n) || 0) + 1);
for (const f of order) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  const ast = parser.parse(src, { sourceType: "script", allowReturnOutsideFunction: true });
  traverse(ast, {
    Program(p) {
      for (const [n, b] of Object.entries(p.scope.bindings))
        decl.set(n, { f, line: b.path.node.loc.start.line, kind: b.kind });
    },
    Identifier(p) {
      if (p.isReferencedIdentifier() || (p.parentPath.isAssignmentExpression() && p.key === "left")) {
        const b = p.scope.getBinding(p.node.name);
        // a reference that resolves to the top-level binding (or to none: another file's global)
        if (!b || b.scope.block.type === "Program") {
          // skip the declaration itself
          if (b && b.identifier === p.node) return;
          bump(p.node.name);
        }
      }
    },
  });
}
// references from the page outside the scripts (inline handlers, element attributes)
const htmlNoScripts = html.replace(/@@include[^\n]*/g, "");
for (const n of decl.keys()) {
  const re = new RegExp("\\b" + n.replace(/\$/g, "\\$") + "\\b");
  if (re.test(htmlNoScripts)) bump(n);
}
const out = [...decl].filter(([n]) => !refs.get(n)).map(([n, d]) => `${d.f}:${d.line} ${d.kind} ${n}`);
console.log(out.join("\n") || "none");
if (out.length) process.exitCode = 1;
