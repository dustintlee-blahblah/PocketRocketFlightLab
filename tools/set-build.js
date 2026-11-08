#!/usr/bin/env node
/*
 * Sets the build number everywhere it appears: the app's APP_BUILD, the splash screen, the Android versionCode, and
 * package.json's version (<versionName>.<build>, e.g. 1.0.279).
 *
 *   node tools/set-build.js 279
 *
 * Then add "## Build 279 (date)" with its changes at the top of CHANGELOG.md, commit ("Build 279"), and tag the commit
 * v<versionName>-build279 to publish the release (see .github/workflows/release.yml).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const n = process.argv[2];
if (!/^[1-9]\d*$/.test(n || "")) {
  console.error("usage: node tools/set-build.js <build number>");
  process.exit(2);
}
const root = path.join(__dirname, "..");
const edits = [
  ["src/js/core/start.js", /const APP_BUILD = "\d+";/, `const APP_BUILD = "${n}";`],
  ["src/index.html", /<span id="spbuild">\d+<\/span>/, `<span id="spbuild">${n}</span>`],
  ["android/app/build.gradle", /versionCode \d+/, `versionCode ${n}`],
];
for (const [file, re, to] of edits) {
  const p = path.join(root, file);
  const s = fs.readFileSync(p, "utf8");
  if (!re.test(s)) {
    console.error(`${file}: build number not found`);
    process.exit(1);
  }
  fs.writeFileSync(p, s.replace(re, to));
}
const version = /versionName "([^"]+)"/.exec(fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8"))[1];
// npm's version: the app version plus the build number (package.json and the lockfile's copy of it)
const semver = `${version.split(".").concat(["0", "0"]).slice(0, 2).join(".")}.${n}`;
for (const file of ["package.json", "package-lock.json"]) {
  const p = path.join(root, file);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.version = semver;
  if (j.packages && j.packages[""]) j.packages[""].version = semver;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}
console.log(`build ${n} set (package version ${semver}); release tag: v${version}-build${n}`);
