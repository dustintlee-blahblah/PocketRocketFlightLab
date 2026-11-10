#!/usr/bin/env node
/*
 * The app's apogee against measured flights (validation/cases.js, FLIGHTS), next to RASAero II's prediction for the
 * same flight:
 *
 *   node build.js && node validation/flights.js [--html other-build.html] [--model test] [--verbose] [--csv out.csv]
 *
 * Each rocket is opened in the built app (headless Chromium) as an OpenRocket design with its launch weight and CG,
 * flown on RASAero's own thrust curve for its motor (validation/flight-motors.eng), from its launch site's altitude and
 * temperature, off its rail at its angle, in the file's wind (taken as the same at every height). Printed: measured
 * apogee, RASAero II's and the app's, each one's error; then the mean absolute error and bias of both, overall and by
 * top speed. --html flies another build of the app (to compare before and after a change).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { IN, FT, LB, MPH, flightOrk, FLIGHTS } = require("./cases.js");

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const html = path.resolve(opt("--html") || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));
const csvOut = opt("--csv");
const verbose = args.includes("--verbose");
const geometric = args.includes("--geometric"); // compare true heights even where a barometric altimeter measured
const model = opt("--model"); // "test": fly the drag model in development (Settings, Drag model)
const eng = fs.readFileSync(path.join(__dirname, "flight-motors.eng"), "utf8");

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => (window.PR_EXPOSE = true));
  await p.goto("file://" + html);
  await p.waitForFunction(() => typeof window.simulate === "function" && typeof window.parseEng === "function");
  const motors = await p.evaluate(
    (eng) => parseEng(eng).map((m) => ({ name: m.name, mfr: m.mfr, totalMass: m.totalMass, len: m.len })),
    eng,
  );
  if (model) await p.evaluate((m) => setDragModel(m), model);
  const rows = [];
  for (const f of FLIGHTS) {
    const mo = motors.find((m) => m.name === f.motor && m.mfr === f.mfr);
    if (!mo) throw new Error(`no thrust curve for ${f.motor} (${f.mfr})`);
    const app = await p.evaluate(
      async ({ xml, eng, f, IN, FT, MPH }) => {
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
          wind: f.wind * MPH,
          windProfile: "constant",
          turb: 0,
        });
        D.nozzleDia = f.noz > 0 ? f.noz * IN : 0;
        D.noseTip = f.nose.tip > 0 ? f.nose.tip * IN : 0;
        const m = parseEng(eng).find((x) => x.name === f.motor && x.mfr === f.mfr);
        m.id = "flight-" + m.name;
        const R = simulate(D, L, m, null);
        return {
          baro: baroReading(L, R.st.maxAlt), // what a barometric altimeter would report at that apogee
          apogee: R.st.maxAlt,
          maxV: R.st.maxV,
          maxMach: R.st.maxMach,
          liftMass: R.st.liftMass,
          error: R.st.error || null,
        };
      },
      { xml: flightOrk(f, mo), eng, f, IN, FT, MPH },
    );
    if (app.err || app.error) throw new Error(`${f.title}: ${app.err || app.error}`);
    // the loaded rocket must weigh what the file says, or the comparison means nothing
    if (Math.abs(app.liftMass / (f.w * LB) - 1) > 0.002)
      throw new Error(`${f.title}: launch mass ${app.liftMass} kg, file says ${f.w * LB}`);
    // flights measured by barometric altimeter are compared with what the altimeter would read (--geometric: not)
    const baro = /barometric/.test(f.how) && !geometric ? app.baro / app.apogee : 1;
    rows.push({ f, app: (app.apogee / FT) * baro, ras: f.ras * baro, mach: app.maxMach });
  }
  await browser.close();

  const pct = (a, m) => (100 * (a - m)) / m,
    sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(1) + "%";
  rows.sort((a, b) => a.mach - b.mach);
  console.log("flight | max Mach | measured ft (how) | RASAero II ft, error | app ft, error");
  for (const { f, app, ras, mach } of rows)
    console.log(
      `${f.title} | ${mach.toFixed(2)} | ${f.meas} (${f.how}) | ${ras.toFixed(0)}, ${sg(pct(ras, f.meas))} | ${app.toFixed(0)}, ${sg(pct(app, f.meas))}`,
    );
  const sum = (sel, k) => {
    const e = sel.map((r) => pct(k(r), r.f.meas));
    return `${(e.reduce((s, x) => s + Math.abs(x), 0) / e.length).toFixed(1)}% (bias ${sg(e.reduce((s, x) => s + x, 0) / e.length)})`;
  };
  console.log("\nmean absolute error (bias):");
  for (const [label, lo, hi] of [
    ["all", 0, 99],
    ["below Mach 0.8", 0, 0.8],
    ["Mach 0.8–1.2", 0.8, 1.2],
    ["above Mach 1.2", 1.2, 99],
  ]) {
    const sel = rows.filter((r) => r.mach >= lo && r.mach < hi);
    if (sel.length)
      console.log(
        `  ${label.padEnd(15)} ${String(sel.length).padStart(2)} flights   RASAero II ${sum(sel, (r) => r.ras)}   app ${sum(sel, (r) => r.app)}`,
      );
  }
  if (verbose) for (const { f } of rows) console.log(`  ${f.title}: ${f.file}`);
  if (csvOut) {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    fs.writeFileSync(
      csvOut,
      "flight,max_mach,measured_ft,how,rasaero_ft,app_ft\n" +
        rows
          .map(({ f, app, ras, mach }) =>
            [q(f.title), mach.toFixed(3), f.meas, q(f.how), ras.toFixed(0), app.toFixed(0)].join(","),
          )
          .join("\n") +
        "\n",
    );
  }
})();
