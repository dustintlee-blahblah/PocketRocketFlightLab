#!/usr/bin/env node
/*
 * Builds the single-file app from src/: src/index.html with
 *   "@@include <file>"  replaced by that file's text (the stylesheet), and
 *   "@@bundle <file>"   replaced by that ES module and everything it imports, bundled into one script by esbuild.
 * The result is the page the Android app and the web version ship:
 *
 *   node build.js [output.html]        (default: web/pocket-rocket-flight-lab.html)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const SRC = path.join(__dirname, "src");
const out = path.resolve(process.argv[2] || path.join(__dirname, "web", "pocket-rocket-flight-lab.html"));
const page = fs.readFileSync(path.join(SRC, "index.html"), "utf8");

const bundle = (entry) => {
  const r = esbuild.buildSync({
    entryPoints: [path.join(SRC, entry)],
    bundle: true,
    format: "iife",
    target: "es2020",
    charset: "utf8",
    legalComments: "inline",
    write: false,
    logLevel: "warning",
  });
  const js = r.outputFiles[0].text;
  if (/<\/script/i.test(js))
    throw new Error(`${entry}: the bundle contains "</script", which would end the page's script`);
  return js;
};

const built = page
  .replace(/^@@include (\S+)\n/gm, (_, f) => fs.readFileSync(path.join(SRC, f), "utf8"))
  .replace(/^@@bundle (\S+)\n/gm, (_, f) => bundle(f));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, built);
console.log(`built ${path.relative(process.cwd(), out) || out} (${(built.length / 1024).toFixed(0)} KB)`);
