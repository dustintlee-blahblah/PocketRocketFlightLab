#!/usr/bin/env node
/*
 * The Rocket tab's Open Recent list closes the way a menu does (Dustin, Nov 24, 2026). With real taps at phone size:
 *   - the Open Recent button opens it and a second tap closes it;
 *   - picking an example (or a recent file) closes it, and that design opens;
 *   - the × that takes a file off the list leaves it open;
 *   - a tap outside it closes it, and the tap still does its own job (another tab opens);
 *   - leaving the Rocket tab, Escape, and the Android Back button (window.prBack) close it.
 *
 *   node build.js && node tests/recent-menu.js [--html other-build.html]
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const html = path.resolve(
  (args.includes("--html") && args[args.indexOf("--html") + 1]) ||
    path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"),
);
let fails = 0,
  checks = 0;
const ok = (what, cond, got) => {
  checks++;
  if (!cond) {
    fails++;
    console.log(`FAIL ${what}${got !== undefined ? `: ${JSON.stringify(got)}` : ""}`);
  }
};

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 412, height: 860 }, hasTouch: true });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    window.PR_NO_ASK = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    sessionStorage.setItem("rfs-splash", "1");
  });
  await p.goto("file://" + html);
  await p.waitForFunction(() => typeof window.openExample === "function");
  await p.evaluate(async () => {
    const l = document.getElementById("legal");
    if (l) l.hidden = true;
    await openExample(0);
    // a recent file to remove, so the × can be tried
    await recentPut({ id: "test-recent", name: "test.ork", rocket: "Test rocket", when: Date.now(), data: null });
    await renderRecent();
    showTab("rocket");
  });
  await p.waitForTimeout(300);
  const open = () => p.evaluate(() => !document.getElementById("recentdrop").hidden);
  const expanded = () => p.evaluate(() => document.getElementById("recentbtn").getAttribute("aria-expanded"));
  const tapBtn = async () => {
    await p.locator("#recentbtn").scrollIntoViewIfNeeded();
    await p.locator("#recentbtn").click();
    await p.waitForTimeout(150);
  };

  // opens the list for the next check (and fails that check if it was already open: each case starts from shut)
  const openList = async (why) => {
    const was = await open();
    if (!was) await tapBtn();
    ok(`list shut before "${why}", and opens`, !was && (await open()));
  };
  await tapBtn();
  ok("Open Recent opens the list", (await open()) && (await expanded()) === "true");
  await tapBtn();
  ok("a second tap on Open Recent closes it", !(await open()) && (await expanded()) === "false");

  // the × keeps it open
  await openList("the ×");
  await p.locator('#recentlist2 [data-del="test-recent"]').click();
  await p.waitForTimeout(300);
  ok(
    "the × takes the file off and leaves the list open",
    (await open()) && (await p.locator('#recentlist2 [data-del="test-recent"]').count()) === 0,
  );

  // picking an example closes it and opens that design
  const before = await p.evaluate(() => D.name);
  const ex = p.locator("#exlist2 [data-ex]").nth(1);
  const exName = await ex.innerText();
  await ex.click();
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => D.name);
  ok("picking an example closes the list", !(await open()) && (await expanded()) === "false");
  ok("and opens that example", after !== before, { before, after, exName });

  // a tap outside closes it, and the tap still works (here: another tab)
  await openList("a tap outside");
  await p.locator("#t-motor").click();
  await p.waitForTimeout(300);
  ok("a tap outside (the Motor tab) closes the list", !(await open()));
  ok(
    "and still does its own job (the Motor tab opens)",
    await p.evaluate(() => !document.getElementById("v-motor").hidden),
  );

  // a tap on the page itself
  await p.evaluate(() => showTab("rocket"));
  await openList("a tap on the page");
  await p.locator("#rtitle").click();
  await p.waitForTimeout(150);
  ok("a tap on the page beside it closes the list", !(await open()));

  // leaving the Rocket tab another way
  await openList("leaving the tab");
  await p.evaluate(() => showTab("results"));
  ok("leaving the Rocket tab closes the list", !(await open()));

  // Escape
  await p.evaluate(() => showTab("rocket"));
  await openList("Escape");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(100);
  ok("Escape closes the list", !(await open()));

  // Android Back: closes the list and says it handled Back (so the app stays open)
  await openList("Back");
  const handled = await p.evaluate(() => window.prBack());
  ok("Back closes the list", !(await open()) && handled === true, handled);
  const again = await p.evaluate(() => window.prBack());
  ok("with the list shut, Back is left to the app", again === false, again);

  ok("no page errors", errs.length === 0, errs);
  await browser.close();
  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
