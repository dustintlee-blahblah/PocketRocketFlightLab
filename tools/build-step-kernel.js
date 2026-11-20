#!/usr/bin/env node
/*
 * Builds the STEP export's solid modelling library, web/step-kernel.js (about 30 MB, replicad and OpenCascade with
 * its WebAssembly inside), from the packages in devDependencies. The app loads it only when the Rocket tab's STEP
 * button is used. It sits next to the page (web version) or in the Android app's assets (the Android build copies it).
 *
 *   node tools/build-step-kernel.js [output.js]        (default: web/step-kernel.js)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const root = path.join(__dirname, "..");
const out = path.resolve(process.argv[2] || path.join(root, "web", "step-kernel.js"));
fs.mkdirSync(path.dirname(out), { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(__dirname, "step-kernel", "entry.js")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  charset: "utf8",
  legalComments: "none",
  loader: { ".wasm": "binary" },
  // OpenCascade's loader names Node's modules in code that only runs under Node
  external: [
    "node:*",
    "fs",
    "path",
    "url",
    "module",
    "crypto",
    "os",
    "worker_threads",
    "perf_hooks",
    "child_process",
    "util",
  ],
  // OpenCascade's loader reads import.meta.url (to find its .wasm, which is inside here instead): the page's own address
  banner: { js: 'var __kernelUrl = (typeof location !== "undefined" && location.href) || "http://localhost/";' },
  define: { "import.meta.url": "__kernelUrl" },
  outfile: out,
  logLevel: "warning",
});
console.log(`built ${path.relative(process.cwd(), out) || out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
