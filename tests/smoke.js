// UI smoke test: opens the built page, goes through the tabs and the main controls (an example rocket, a launch, the
// builder, a new design, undo and redo, the menus, the short-rail warning), and fails on any page error. Then it looks
// at each screen: the things that should be on it are there (the Motor tab's filters and list, the builder's parts,
// add-a-part list, editor and drawing, the Range tab's fields, the Results tab's figures, chart and checklist). A
// screen that is quietly empty is as broken as one that throws an error.
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
  // ---- what each screen should be showing
  await step("example again", () => openExample(0));
  await p.waitForTimeout(1200);
  await step("launch3", () => runNow());
  await p.waitForTimeout(1500);
  const need = (what, got, min) => {
    if (!(got >= min)) errs.push(`screen: ${what}: expected at least ${min}, found ${got}`);
  };
  const look = async (name, fn) => {
    try {
      return await p.evaluate(fn);
    } catch (e) {
      errs.push(`screen: ${name}: ${e.message.split("\n")[0]}`);
      return {};
    }
  };
  // a canvas with something drawn on it: more than a couple of different colours
  await p.evaluate(() => {
    window.inked = (id) => {
      const c = document.getElementById(id);
      if (!c || !c.width || !c.height) return 0;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return seen.size;
    };
    window.count = (sel) => document.querySelectorAll(sel).length;
  });
  await step("screen motor", 'showTab("motor")');
  let m = await look("motor tab", () => {
    // every size, so every maker's chip shows
    const all = [...document.querySelectorAll("#fdia button")].find((b) => /^All/.test(b.textContent));
    if (all) all.click();
    return {
      makers: count("#fbrand button"),
      sizes: count("#fdia button"),
      list: count("#motorlist .nm"),
      catalog: allMotors().length,
      brands: new Set(allMotors().map((x) => x.brand)).size,
    };
  });
  need("Motor tab: manufacturer filter buttons", m.makers, 5);
  need("Motor tab: manufacturer filter has a button for every maker", m.makers, m.brands + 1);
  need("Motor tab: diameter filter buttons", m.sizes, 4);
  need("Motor tab: motors in the catalog", m.catalog, 1000);
  need("Motor tab: motors listed", m.list, 20);
  await step("pick a maker", () => document.querySelectorAll("#fbrand button")[1].click());
  m = await look("motor tab, one maker", () => ({ systems: count("#fsys button"), list: count("#motorlist .nm") }));
  need("Motor tab: motor system buttons for a maker", m.systems, 2);
  need("Motor tab: that maker's motors listed", m.list, 5);
  await step("all makers", () => document.querySelectorAll("#fbrand button")[0].click());
  await step("screen rocket", 'showTab("rocket")');
  await step("add list", () => {
    if (!count("#bldadd [data-add]")) document.querySelector(".bldaddtoggle").click();
  });
  await step("pick fins", () =>
    [...document.querySelectorAll("#bldtree .bldrow")].find((r) => /fin/i.test(r.textContent))?.click(),
  );
  m = await look("rocket tab", () => ({
    tree: count("#bldtree .bldrow"),
    add: count("#bldadd [data-add]"),
    fields: count("#bldedit [id^=bf-]"),
    help: count("#bldedit .info, #bldedit [data-help], #bldedit .helpbtn"),
    drawing: inked("bldcv"),
  }));
  need("Rocket tab: parts in the tree", m.tree, 4);
  need("Rocket tab: add-a-part buttons", m.add, 15);
  need("Rocket tab: fields in the fin editor", m.fields, 8);
  need("Rocket tab: side view drawn", m.drawing, 3);
  await step("screen range", 'showTab("flight")');
  m = await look("range tab", () => ({
    groups: Object.keys(FIELDS).map((g) => [
      g,
      document.getElementById(g) ? document.getElementById(g).children.length : 0,
    ]),
    railTypes: count("#f-railType option"),
  }));
  for (const [g, n] of m.groups || []) need(`Range tab: fields in "${g}"`, n, 1);
  need("Range tab: rail and rod types", m.railTypes, 10);
  await step("screen results", 'showTab("results")');
  m = await look("results tab", () => ({
    groups: count("#stats .statgrp"),
    tiles: count("#stats .stat"),
    empty: [...document.querySelectorAll("#stats .stat .v")].filter((e) => !e.textContent.trim()).length,
    mph: count("#stats .stat .also"),
    chart: inked("chart"),
    series: count("#series button"),
    checklist: count("#rsolist .rso"),
    windRows: count("#windtable tr"),
    log: document.getElementById("flpanel") ? 1 : 0,
    apogee: lastSim ? lastSim.st.maxAlt : 0,
  }));
  need("Results tab: groups of figures", m.groups, 5);
  need("Results tab: figures", m.tiles, 25);
  need("Results tab: figures with a value (none blank)", -m.empty, 0);
  need("Results tab: speeds with mph or km/h under them", m.mph, 3);
  need("Results tab: flight chart drawn", m.chart, 4);
  need("Results tab: chart series buttons", m.series, 3);
  need("Results tab: RSO checklist items", m.checklist, 8);
  need("Results tab: drift-by-wind table rows", m.windRows, 4);
  need("Results tab: flight log panel", m.log, 1);
  need("Results tab: an apogee", m.apogee, 10);
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
