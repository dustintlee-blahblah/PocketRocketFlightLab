#!/usr/bin/env node
/*
 * Writes a release's description: .github/release-template.md filled in with the build's section of CHANGELOG.md.
 *
 *   node tools/release-notes.js <version> <build> [out.md]     (default: print it)
 *
 * Fails if CHANGELOG.md has no "## Build <build> (...)" section, so a release can't go out without its notes.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const [version, build, out] = process.argv.slice(2);
if (!version || !/^\d+$/.test(build || "")) {
  console.error("usage: node tools/release-notes.js <version> <build> [out.md]");
  process.exit(2);
}
const root = path.join(__dirname, "..");
const log = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const m = new RegExp(`^## Build ${build} \\(.*\\)\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(log);
if (!m || !m[1].trim()) {
  console.error(`CHANGELOG.md has no "## Build ${build} (date)" section with notes`);
  process.exit(1);
}
const notes = m[1].trim();
const text = fs
  .readFileSync(path.join(root, ".github", "release-template.md"), "utf8")
  .replace(/@NOTES@/g, () => notes)
  .replace(/@VERSION@/g, version)
  .replace(/@BUILD@/g, build);
if (out) fs.writeFileSync(out, text);
else process.stdout.write(text);
