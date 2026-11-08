// UI smoke test: opens the built page, goes through the tabs and the main controls (an example rocket, a launch, the
// builder, a new design, undo and redo, the menus, the short-rail warning), and fails on any page error.
// usage: node tests/smoke.js [page.html] [screenshot-prefix]     (default page: web/pocket-rocket-flight-lab.html)
"use strict";
const path = require("path");
const { chromium } = require("playwright");
(async () => {
  const [fileArg, shot] = process.argv.slice(2);
  const file = fileArg || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html");
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 412, height: 900 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  // the page's fonts and PDF library come from the internet; the test runs without it
  await p.route(/^https?:/, (r) => r.abort());
  p.on(
    "console",
    (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push("console: " + m.text()),
  );
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
  });
  await p.goto("file://" + path.resolve(file));
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const d = document.getElementById("legal");
    if (d) d.hidden = true;
    document.body.style.overflow = "";
  });
  const step = async (name, fn) => {
    try {
      await p.evaluate(fn);
      await p.waitForTimeout(400);
    } catch (e) {
      errs.push(name + ": " + e.message);
    }
  };
  await step("example", () => {
    window.PR_NO_ASK = true;
    return openExample(0);
  });
  await p.waitForTimeout(1500);
  for (const t of ["rocket", "motor", "flight", "results"]) await step("tab " + t, `showTab("${t}")`);
  await step("tab flight", 'showTab("flight")');
  await step("rail field", () => {
    const el = document.getElementById("f-rail");
    el.value = "10";
    el.dispatchEvent(new Event("input"));
  });
  await step("railMode", () => {
    const el = document.getElementById("f-railMode");
    el.value = "fixed";
    el.dispatchEvent(new Event("change"));
  });
  await step("launch", () => document.getElementById("runbtn").click());
  await p.waitForTimeout(1500);
  if (shot) await p.screenshot({ path: shot + "-results.png", fullPage: false });
  await step("tab rocket", 'showTab("rocket")');
  await step("pick part", () => document.querySelector("#bldtree .bldrow:not(.stage)")?.click());
  await step("fin part", () =>
    [...document.querySelectorAll("#bldtree .bldrow")].find((r) => /fin/i.test(r.textContent))?.click(),
  );
  if (shot) await p.screenshot({ path: shot + "-rocket.png", fullPage: false });
  await step("motor tab", 'showTab("motor")');
  await step("new design", () => bldNewDesign());
  await step("launch2", () => runNow());
  await p.waitForTimeout(1200);
  for (const [n, id] of [
    ["undo", "bldundo"],
    ["redo", "bldredo"],
    ["reset", "resetbtn"],
    ["reset no", "resetno"],
    ["new", "newdesign"],
    ["recent", "recentbtn"],
    ["settings", "gearbtn"],
    ["legal", "showlegal"],
  ])
    await step(n, `document.getElementById("${id}").click()`);
  await p.waitForTimeout(1500);
  await step("legal close", () => {
    const d = document.getElementById("legal");
    d.hidden = true;
  });
  await step("rail warn", () => {
    L.rail = 0.3;
    runNow();
  });
  await step("rail fix", () => document.getElementById("railfix").click());
  await step("tab results", 'showTab("results")');
  const info = await p.evaluate(() => ({
    apo: lastSim && Math.round(lastSim.st.maxAlt),
    forms: Object.keys(FIELDS).map((g) => [g, document.getElementById(g)?.children.length]),
    mountnote: document.getElementById("mountsizenote").textContent.slice(0, 80),
    title: document.getElementById("rtitle")?.textContent,
  }));
  console.log(JSON.stringify(info));
  console.log(errs.length ? errs.join("\n") : "no errors");
  await b.close();
  process.exitCode = errs.length ? 1 : 0;
})();
