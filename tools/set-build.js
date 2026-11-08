#!/usr/bin/env node
/*
 * Sets the build number everywhere it appears: the app's APP_BUILD, the splash screen and the Android versionCode.
 *
 *   node tools/set-build.js 279
 *
 * Then add the build's notes at the top of RELEASE_NOTES.md, commit ("Build 279"), and tag the commit
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
console.log(`build ${n} set; release tag: v${version}-build${n}`);
