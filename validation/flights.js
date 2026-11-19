#!/usr/bin/env node
/*
 * The app's apogee against measured flights (validation/cases.js, FLIGHTS), next to RASAero II's prediction for the
 * same flight:
 *
 *   node build.js && node validation/flights.js [--html other-build.html] [--verbose] [--csv out.csv]
 *     [--geometric] [--zero-finish smooth|normal] [--accuracy src/data/apogee-accuracy.js]
 *
 * Each rocket is opened in the built app (headless Chromium) as an OpenRocket design with its launch weight and CG,
 * flown on RASAero's own thrust curve for its motor (validation/flight-motors.eng), from its launch site's altitude and
 * temperature, off its rail at its angle, in the file's wind (taken as the same at every height). Printed: measured
 * apogee, RASAero II's and the app's, each one's error; then the mean absolute error and bias of both, overall and by
 * top speed. --html flies another build of the app (to compare before and after a change). --zero-finish flies the
 * rockets whose files say "Smooth (Zero Roughness)" (read as polished, 2 µm) with another OpenRocket finish instead:
 * smooth (smooth paint, 20 µm) or normal (regular paint, 60 µm), for VALIDATION.md's table of finishes.
 * --accuracy writes the app's apogee accuracy by speed band (where the measured apogee landed against the app's: the
 * mean and standard deviation, and Student's t multipliers for 1σ and 90% prediction intervals with that many flights)
 * to the data file the Results tab's ± and the waiver check use.
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
const accOut = opt("--accuracy");
const verbose = args.includes("--verbose");
const zeroFinish = opt("--zero-finish"); // another finish for the files' "zero roughness" rockets
if (zeroFinish && !/^(smooth|normal)$/.test(zeroFinish)) throw new Error("--zero-finish takes smooth or normal");
const geometric = args.includes("--geometric"); // compare true heights even where a barometric altimeter measured
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
      {
        xml: flightOrk(zeroFinish && f.finish === "polished" ? { ...f, finish: zeroFinish } : f, mo),
        eng,
        f,
        IN,
        FT,
        MPH,
      },
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
  // by how much each flight's source records (grade, cases.js)
  console.log("\nby grade (2: only the finish unrecorded; 3: the motor or the measurement in doubt as well):");
  for (const g of [1, 2, 3]) {
    const sel = rows.filter((r) => r.f.grade === g);
    if (sel.length)
      console.log(
        `  grade ${g}         ${String(sel.length).padStart(2)} flights   RASAero II ${sum(sel, (r) => r.ras)}   app ${sum(sel, (r) => r.app)}`,
      );
  }
  if (verbose) for (const { f } of rows) console.log(`  ${f.title}: ${f.file}`);
  if (accOut) {
    if (zeroFinish || geometric)
      throw new Error("--accuracy is written from the flights as they are, without --zero-finish or --geometric");
    fs.writeFileSync(accOut, accuracyModule(rows));
    console.log(`\nwrote ${accOut}`);
  }
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

/**
 * Student's t distribution: the probability below t with df degrees of freedom (Simpson's rule on the density).
 * @param {number} t
 * @param {number} df
 * @returns {number}
 */
function tCdf(t, df) {
  const lg = (x) => {
    // log gamma (Lanczos)
    const c = [
      76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155, 0.001208650973866179,
      -0.5395239384953e-5,
    ];
    let y = x,
      tmp = x + 5.5,
      ser = 1.000000000190015;
    tmp -= (x + 0.5) * Math.log(tmp);
    for (const v of c) ser += v / ++y;
    return -tmp + Math.log((2.5066282746310002 * ser) / x);
  };
  const k = Math.exp(lg((df + 1) / 2) - lg(df / 2)) / Math.sqrt(df * Math.PI),
    f = (x) => k * Math.pow(1 + (x * x) / df, -(df + 1) / 2),
    n = 2000,
    a = 0,
    h = (t - a) / n;
  let s = f(a) + f(t);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return 0.5 + (s * h) / 3;
}
/**
 * The t value with probability p below it.
 * @param {number} p
 * @param {number} df
 * @returns {number}
 */
function tInv(p, df) {
  let lo = 0,
    hi = 100;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (tCdf(m, df) < p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
/**
 * The data file of the app's apogee accuracy by speed band.
 * @param {object[]} rows the flights flown
 * @returns {string} the module's text
 */
function accuracyModule(rows) {
  const bands = [
    [0, 0.8],
    [0.8, 1.2],
    [1.2, 99],
  ].map(([lo, hi]) => {
    // where the measured apogee landed, as a fraction of the app's prediction (negative: lower than predicted)
    const r = rows.filter((x) => x.mach >= lo && x.mach < hi).map((x) => x.f.meas / x.app - 1),
      n = r.length,
      mean = r.reduce((s, x) => s + x, 0) / n,
      sd = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)),
      // a prediction interval for one more flight: t for n-1 degrees of freedom, widened by sqrt(1 + 1/n)
      w = Math.sqrt(1 + 1 / n),
      r4 = (x) => Math.round(x * 10000) / 10000;
    return {
      lo,
      hi,
      n,
      mean: r4(mean),
      sd: r4(sd),
      k68: r4(tInv(0.841345, n - 1) * w),
      k90: r4(tInv(0.95, n - 1) * w),
    };
  });
  return `/**
 * The app's apogee accuracy by top speed, from the measured flights in validation/cases.js (VALIDATION.md). Generated by
 * \`node validation/flights.js --accuracy src/data/apogee-accuracy.js\`; don't edit by hand.
 * For each band of Mach numbers: how many flights, the mean and standard deviation of where the measured apogee landed
 * as a fraction of the app's prediction (negative: lower than predicted), and the multipliers of the standard deviation
 * for 1σ (about 2 flights in 3) and 90% prediction intervals: Student's t for that many flights, times sqrt(1 + 1/n).
 */
export const APO_ACCURACY = ${JSON.stringify({ flights: rows.length, bands }, null, 2).replace(/"(\w+)":/g, "$1:")};
`;
}
