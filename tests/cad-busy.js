#!/usr/bin/env node
/*
 * Export CAD says it's working (Dustin, Nov 24, 2026): with real taps at phone size, choosing STEP in the Export CAD
 * box shows the "Exporting STEP file…" box (painted before the building starts, which holds the page for a while), the
 * box is gone when the file is saved, and the file is a STEP file; a browser without DecompressionStream (which unpacks
 * the library) is told it is too old. Needs web/step-kernel.js next to the page.
 *
 *   node build.js && node tests/cad-busy.js [--html other-build.html]
 */
"use strict";
const fs = require("fs");
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
  if (!fs.existsSync(path.join(path.dirname(html), "step-kernel.js"))) {
    console.log(`step-kernel.js isn't next to ${html}; skipped`);
    process.exit(0);
  }
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 412, height: 860 }, hasTouch: true, acceptDownloads: true });
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
    showTab("rocket");
  });
  await p.waitForTimeout(500);
  ok("the progress box starts hidden", await p.evaluate(() => document.getElementById("cadbusy").hidden));

  await p.locator("#bldstep").click();
  const dl = p.waitForEvent("download", { timeout: 300000 }).catch(() => null);
  await p.locator('#cadmodal [data-cad="step"]').click();
  // shown at once, before the work starts
  const shown = await p
    .waitForFunction(() => !document.getElementById("cadbusy").hidden, null, { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  ok("choosing STEP shows the progress box at once", shown);
  ok(
    "it names the format and says it can take a minute or two",
    await p.evaluate(
      () =>
        /STEP/.test(document.getElementById("cadbusytitle").textContent) &&
        /minute or two/.test(document.getElementById("cadbusytxt").textContent),
    ),
  );
  const d = await dl;
  ok("the STEP file is saved", !!d && /\.step$/.test(d.suggestedFilename()), d && d.suggestedFilename());
  await p.waitForTimeout(300);
  ok("the progress box is gone when it's saved", await p.evaluate(() => document.getElementById("cadbusy").hidden));
  ok(
    "the result is told under the Design Tree",
    await p.evaluate(() => /Full size/.test(document.getElementById("bldstepmsg").textContent)),
    await p.evaluate(() => document.getElementById("bldstepmsg").textContent),
  );
  ok("no page errors", errs.length === 0, errs);

  // a browser too old to unpack the library (no DecompressionStream) is told so, and the box goes
  const old = await browser.newPage({ viewport: { width: 412, height: 860 }, hasTouch: true });
  await old.route(/^https?:/, (r) => r.abort());
  await old.addInitScript(() => {
    window.PR_EXPOSE = true;
    window.PR_NO_ASK = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    sessionStorage.setItem("rfs-splash", "1");
  });
  await old.goto("file://" + html);
  await old.waitForFunction(() => typeof window.openExample === "function");
  await old.evaluate(async () => {
    const l = document.getElementById("legal");
    if (l) l.hidden = true;
    await openExample(0);
    showTab("rocket");
    // (after the example is open: opening a design file needs it too)
    delete window.DecompressionStream;
  });
  await old.waitForTimeout(500);
  await old.locator("#bldstep").click();
  await old.locator('#cadmodal [data-cad="step"]').click();
  await old
    .waitForFunction(() => /too old/.test(document.getElementById("bldstepmsg").textContent), null, { timeout: 60000 })
    .catch(() => null);
  ok(
    "a browser that can't unpack the library is told so",
    await old.evaluate(() =>
      /too old to unpack the CAD library/.test(document.getElementById("bldstepmsg").textContent),
    ),
    await old.evaluate(() => document.getElementById("bldstepmsg").textContent),
  );
  ok("and the progress box is gone", await old.evaluate(() => document.getElementById("cadbusy").hidden));
  await browser.close();
  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
