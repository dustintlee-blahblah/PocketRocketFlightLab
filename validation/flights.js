#!/usr/bin/env node
/*
 * The app's apogee against measured flights (validation/cases.js, FLIGHTS), next to RASAero II's prediction for the
 * same flight:
 *
 *   node build.js && node validation/flights.js
 *
 * Each rocket is opened in the built app (headless Chromium) as an OpenRocket design with its launch weight and CG,
 * flown on RASAero's own thrust curve for its motor (validation/flight-motors.eng), from its launch site's altitude and
 * temperature, off its rail at its angle, in still air. Printed: measured apogee, RASAero II's and the app's, and each
 * one's error; then the mean absolute error of both.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { IN, FT, flightOrk, FLIGHTS } = require("./cases.js");

const eng = fs.readFileSync(path.join(__dirname, "flight-motors.eng"), "utf8");

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => (window.PR_EXPOSE = true));
  await p.goto("file://" + path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));
  await p.waitForFunction(() => typeof window.simulate === "function" && typeof window.parseEng === "function");
  const motors = await p.evaluate(
    (eng) => parseEng(eng).map((m) => ({ name: m.name, totalMass: m.totalMass, len: m.len })),
    eng,
  );
  const rows = [];
  for (const f of FLIGHTS) {
    const mo = motors.find((m) => m.name === f.motor);
    if (!mo) throw new Error("no thrust curve for " + f.motor);
    const xml = flightOrk(f, mo);
    const app = await p.evaluate(
      async ({ xml, eng, f, IN, FT }) => {
        window.PR_NO_ASK = false;
        L = defaultLaunch();
        siteCur = "";
        const buf = new TextEncoder().encode(xml).buffer;
        if (!(await loadDesignXml(xml, f.title + ".ork", buf, {}))) return { err: "could not open" };
        Object.assign(L, {
          elev: f.site * FT,
          tempC: ((f.tF - 32) * 5) / 9,
          dewC: null,
          pressure: 0,
          humidity: 0,
          rail: f.rod * FT,
          angle: f.angle,
          wind: 0,
          turb: 0,
        });
        D.nozzleDia = f.noz > 0 ? f.noz * IN : 0;
        const m = parseEng(eng).find((x) => x.name === f.motor);
        m.id = "flight-" + m.name;
        const R = simulate(D, L, m, null);
        return { apogee: R.st.maxAlt, maxV: R.st.maxV, maxMach: R.st.maxMach, error: R.st.error || null };
      },
      { xml, eng, f, IN, FT },
    );
    if (app.err || app.error) throw new Error(`${f.title}: ${app.err || app.error}`);
    rows.push({ f, app: app.apogee / FT, mach: app.maxMach });
  }
  await browser.close();

  const pct = (a, m) => (100 * (a - m)) / m,
    sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(1) + "%";
  console.log("flight | max Mach | measured ft (how) | RASAero II ft, error | app ft, error");
  for (const { f, app, mach } of rows)
    console.log(
      `${f.title} | ${mach != null ? mach.toFixed(2) : "?"} | ${f.meas} (${f.how}) | ${f.ras}, ${sg(pct(f.ras, f.meas))} | ${app.toFixed(0)}, ${sg(pct(app, f.meas))}`,
    );
  const mean = (k) => rows.reduce((s, r) => s + Math.abs(pct(k(r), r.f.meas)), 0) / rows.length,
    bias = (k) => rows.reduce((s, r) => s + pct(k(r), r.f.meas), 0) / rows.length;
  console.log(
    `\nmean absolute error: RASAero II ${mean((r) => r.f.ras).toFixed(1)}% (bias ${sg(bias((r) => r.f.ras))}), app ${mean((r) => r.app).toFixed(1)}% (bias ${sg(bias((r) => r.app))}), ${rows.length} flights`,
  );
})();
