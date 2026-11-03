#!/usr/bin/env node
/*
 * Builds the single-file app from src/: src/index.html with each "@@include <file>" line replaced by that file's text.
 * The result is the page the Android app and the web version ship:
 *
 *   node build.js [output.html]        (default: web/pocket-rocket-flight-lab.html)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const SRC = path.join(__dirname, "src");
const out = path.resolve(process.argv[2] || path.join(__dirname, "web", "pocket-rocket-flight-lab.html"));
const page = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
const built = page.replace(/^@@include (\S+)\n/gm, (_, f) => fs.readFileSync(path.join(SRC, f), "utf8"));
fs.writeFileSync(out, built);
console.log(`built ${path.relative(process.cwd(), out) || out} (${(built.length / 1024).toFixed(0)} KB)`);
