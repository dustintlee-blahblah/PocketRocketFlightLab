#!/usr/bin/env node
/*
 * Builds the STEP export's solid modelling library, web/step-kernel.js (about 10 MB, replicad and OpenCascade with
 * its WebAssembly inside), from the packages in devDependencies. The app loads it only when the Rocket tab's Export
 * CAD button is used. It sits next to the page (web version) or in the Android app's assets (the Android build copies
 * it).
 *
 * The WebAssembly (23 MB) goes in gzipped (7 MB; 31 MB to 10 MB as text in the script): tools/step-kernel/entry.js
 * unpacks it in the browser with DecompressionStream before starting it. Nothing is fetched: it is all in the one
 * file.
 *
 *   node tools/build-step-kernel.js [output.js]        (default: web/step-kernel.js)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const esbuild = require("esbuild");
const root = path.join(__dirname, "..");
const out = path.resolve(process.argv[2] || path.join(root, "web", "step-kernel.js"));
fs.mkdirSync(path.dirname(out), { recursive: true });
/** Puts the WebAssembly in gzipped (the same bytes every build: Node's gzip writes no time or file name). */
const gzipWasm = {
  name: "gzip-wasm",
  setup(build) {
    build.onLoad({ filter: /\.wasm$/ }, (a) => ({
      contents: zlib.gzipSync(fs.readFileSync(a.path), { level: 9 }),
      loader: "binary",
    }));
  },
};
esbuild
  .build({
    entryPoints: [path.join(__dirname, "step-kernel", "entry.js")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: true,
    charset: "utf8",
    legalComments: "none",
    plugins: [gzipWasm],
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
  })
  .then(() =>
    console.log(
      `built ${path.relative(process.cwd(), out) || out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`,
    ),
  )
  .catch(() => process.exit(1));
