#!/usr/bin/env node
/*
 * Takes the README's screenshots from the built page, on a phone-sized screen with the app's own fonts:
 *
 *   node build.js && node tools/screenshots.js        (writes docs/images/*.png)
 *
 * Each one opens a built-in example, launches it in still air, and captures one part of the app. The fonts come
 * from the copies bundled for the Android app, so no internet connection is needed.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const page = path.join(root, "web", "pocket-rocket-flight-lab.html");
const outDir = path.join(root, "docs", "images");
const fontDir = path.join(root, "android", "app", "src", "main", "assets", "fonts");
const fontCss = fs
  .readFileSync(path.join(root, "android", "app", "src", "main", "fontface.css"), "utf8")
  .replace(/url\("fonts\//g, `url("file://${fontDir}/`);

/** [file, example number, what to show] */
const SHOTS = [
  ["rocket-builder.png", 3, "rocket"],
  ["results.png", 3, "results"],
  ["flight-chart.png", 3, "chart"],
  ["checklist.png", 3, "checklist"],
  ["compare-motors.png", 1, "compare"],
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const [file, example, what] of SHOTS) {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await p.route(/^https?:/, (r) => r.abort());
    await p.addInitScript(() => {
      window.PR_EXPOSE = true;
      window.PR_NO_ASK = true;
      localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
      sessionStorage.setItem("rfs-splash", "1");
    });
    await p.goto("file://" + page);
    await p.addStyleTag({ content: fontCss });
    await p.waitForTimeout(1200);
    await p.evaluate(async (n) => {
      const legal = document.getElementById("legal");
      if (legal) legal.hidden = true;
      document.querySelectorAll(".splash, #splash").forEach((e) => e.remove());
      await openExample(n);
      L.wind = 2;
    }, example);
    await p.waitForTimeout(1200);
    await p.evaluate(() => runNow());
    await p.waitForTimeout(2500);
    await p.evaluate(async (what) => {
      const tab = { rocket: "rocket", results: "results", chart: "results", checklist: "results", compare: "motor" };
      showTab(tab[what]);
      // scroll a part of the page to just under the sticky tab bar
      const show = (el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64);
      if (what === "rocket")
        show(document.querySelector(".bldview").closest(".panel") || document.getElementById("bldcv"));
      else if (what === "chart") show(document.getElementById("chartpanel"));
      else if (what === "checklist") {
        const t = document.getElementById("rsotog");
        if (t.getAttribute("aria-expanded") !== "true") t.click();
        show(document.getElementById("rsopanel"));
      } else if (what === "compare") {
        document.getElementById("cmpgo").click();
        // until every motor has flown
        await new Promise((r) => setTimeout(r, 500));
        for (let i = 0; i < 240 && !document.getElementById("cmpstop").hidden; i++)
          await new Promise((r) => setTimeout(r, 500));
        show(document.getElementById("cmpgo"));
      } else window.scrollTo(0, 0);
    }, what);
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(outDir, file) });
    console.log("wrote docs/images/" + file);
    await p.close();
  }
  await browser.close();
})();
