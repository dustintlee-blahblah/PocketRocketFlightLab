#!/usr/bin/env node
/*
 * Drag benchmarks: the app's zero-lift drag model against published wind-tunnel and free-flight measurements.
 *
 *   node tests/drag-benchmarks.js [--html web/pocket-rocket-flight-lab.html] [--set NAME=value ...]
 *
 * Each case builds the tested model as an OpenRocket design, flies the app's drag model at the test's Mach and
 * Reynolds numbers, and compares with the measured drag coefficient. --set overrides a page global (a model
 * constant) for trying out a change. Exits with 1 if a case's mean absolute error goes past its limit.
 *
 * Cases:
 *  - NACA RM A53D02 (James & Carros, 1953): free-flight total drag of a fin-stabilized body of fineness ratio 10
 *    (tangent-ogive nose, four trapezoidal fins swept 72° with 4% sections), Mach 0.6 to 10. Points from figure 11
 *    and table I; Reynolds number on the model length. Coefficients on the body's cross-section area.
 *  - NACA RM E50D28 (1950): RM-10 missile in the Lewis 8- by 6-foot tunnel, Mach 1.49 to 1.98: the drag the four
 *    60°-swept fins (10% circular-arc sections, taper ratio 1) add to the body (figure 8(d) minus figure 6), less the
 *    fins' measured base-pressure increase (figure 9). On the body's maximum cross-section area.
 */
"use strict";
const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/npm-tools/node_modules/playwright"));
}
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const html = path.resolve(opt("--html", path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html")));
const sets = [];
args.forEach((a, i) => {
  if (a === "--set") sets.push(args[i + 1].split("="));
});
const IN = 0.0254;

/** An OpenRocket design: an ogive nose, a body tube and one trapezoidal fin set at the aft end (sizes in inches). */
function ork(o) {
  const m = '<material type="bulk" density="2800">Aluminum</material>';
  return `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.9" creator="drag-benchmarks"><rocket><name>${o.name}</name><id>r</id>
<motorconfiguration configid="c" default="true"><stage number="0" active="true"/></motorconfiguration>
<referencetype>maximum</referencetype><subcomponents><stage><name>Stage</name><id>s</id><subcomponents>
<nosecone><name>nose</name><id>n</id><finish>${o.finish}</finish>${m}<length>${o.nose * IN}</length>
<thickness>${o.r * IN}</thickness><shape>ogive</shape><shapeclipped>false</shapeclipped><shapeparameter>1</shapeparameter>
<aftradius>${o.r * IN}</aftradius><aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength>
<aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped></nosecone>
<bodytube><name>body</name><id>b</id><finish>${o.finish}</finish>${m}<length>${o.body * IN}</length>
<thickness>${o.r * IN}</thickness><radius>${o.r * IN}</radius><subcomponents>
<trapezoidfinset><name>fins</name><id>f</id><axialoffset method="bottom">0</axialoffset><finish>${o.finish}</finish>${m}
<fincount>4</fincount><rotation>0</rotation><thickness>${o.t * IN}</thickness><crosssection>${o.edge}</crosssection>
<cant>0</cant><rootchord>${o.cr * IN}</rootchord><tipchord>${o.ct * IN}</tipchord><sweeplength>${o.sw * IN}</sweeplength>
<height>${o.s * IN}</height></trapezoidfinset></subcomponents></bodytube></subcomponents></stage></subcomponents>
</rocket></openrocket>`;
}

const A53 = {
  name: "RM A53D02",
  finish: "polished",
  nose: 1.0,
  body: 1.5,
  r: 0.125,
  cr: 0.75,
  ct: 0.375,
  sw: 0.375,
  s: 0.125,
  t: 0.04 * 0.5625, // 4% of the mean chord (the sections taper in thickness to keep 4%)
  edge: "airfoil",
};
// [Mach, Reynolds number (millions, on the model length), measured Cd]
const A53_PTS = [
  [0.598, 0.86, 0.36],
  [0.901, 1.28, 0.365],
  [1.06, 1.54, 0.535],
  [1.32, 1.9, 0.515],
  [1.48, 2.1, 0.475],
  [1.58, 2.3, 0.45],
  [1.95, 2.9, 0.45],
  [2.09, 3.2, 0.425],
  [2.3, 3.5, 0.39],
  [2.56, 3.8, 0.38],
  [2.91, 4.3, 0.325],
  [3.29, 4.9, 0.3],
  [3.99, 6.6, 0.24],
  [4.57, 7.5, 0.2],
];
// RM-10 fins: root chord 8.75 in from station 64.5 to the base, leading edge swept 60°, taper ratio 1; the body as a
// 6-in ogive and cylinder of the same length (only the fins' increment is compared). Reynolds number 4.5 million per ft.
const RM10 = (fins) => ({
  name: "RM-10",
  finish: "smooth",
  nose: 45,
  body: 28.25,
  r: 3,
  cr: fins ? 8.75 : 0.01,
  ct: fins ? 8.75 : 0.01,
  sw: fins ? 9.07 : 0,
  s: fins ? 9.07 / Math.tan((60 * Math.PI) / 180) : 0.001,
  t: fins ? 0.875 : 0.0001,
  edge: "airfoil",
});
// [Mach, fin increment measured: body + 4 fins minus body alone, less the fins' base-pressure increase]
const RM10_PTS = [
  [1.49, 0.255 - 0.157 - 0.007],
  [1.59, 0.255 - 0.155 - 0.005],
  [1.78, 0.255 - 0.151 - 0.006],
  [1.98, 0.255 - 0.149 - 0.004],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route(/^https?:/, (r) => r.abort());
  await page.addInitScript(() => (window.PR_EXPOSE = true)); // the app's names as globals
  await page.goto("file://" + html);
  await page.waitForFunction(() => typeof cdParts === "function");
  const res = await page.evaluate(
    ({ cases, sets }) => {
      for (const [k, v] of sets) window[k] = isNaN(+v) ? v : +v;
      const L0 = atmosphere(defaultLaunch(), 0);
      const mu = (1.458e-6 * Math.pow(L0.T, 1.5)) / (L0.T + 110.4);
      const model = (xml) => {
        const D = Object.assign(defaultDesign(), parseOrk(xml).design);
        return { D, A: aero(D) };
      };
      // drag at a Mach number, with the air's density set to give the wanted Reynolds number on a length
      const cd = (m, M, Re, len) => {
        const v = M * L0.a;
        return cdParts(m.A, v, { ...L0, rho: (mu * Re) / (v * len) }, 0);
      };
      const out = {};
      const a = model(cases.a53);
      out.a53 = cases.a53Pts.map(([M, R, meas]) => [M, meas, cd(a, M, R * 1e6, a.D.length).cd]);
      const f = model(cases.rm10f),
        b = model(cases.rm10b);
      out.rm10 = cases.rm10Pts.map(([M, meas]) => [M, meas, cd(f, M, 4.5e6, 0.3048).cd - cd(b, M, 4.5e6, 0.3048).cd]);
      return out;
    },
    {
      cases: { a53: ork(A53), a53Pts: A53_PTS, rm10f: ork(RM10(true)), rm10b: ork(RM10(false)), rm10Pts: RM10_PTS },
      sets,
    },
  );
  await browser.close();
  let fail = false;
  const report = (title, rows, limit, rel) => {
    console.log(`\n${title}\n  Mach  measured    app   error`);
    let sum = 0;
    for (const [M, meas, app] of rows) {
      const e = rel ? (app - meas) / meas : app - meas;
      sum += Math.abs(e);
      console.log(
        `  ${M.toFixed(2).padStart(5)}  ${meas.toFixed(3).padStart(7)}  ${app.toFixed(3).padStart(6)}  ${rel ? (e * 100).toFixed(0).padStart(4) + "%" : (e >= 0 ? "+" : "") + e.toFixed(3)}`,
      );
    }
    const mean = sum / rows.length;
    const ok = mean <= limit;
    if (!ok) fail = true;
    console.log(
      `  mean ${rel ? "absolute error " + (mean * 100).toFixed(1) + "%" : "absolute error " + mean.toFixed(3)} (limit ${rel ? limit * 100 + "%" : limit}) ${ok ? "OK" : "FAIL"}`,
    );
  };
  // the app reads about 20% low between Mach 2 and 3.3 here: its supersonic base drag (0.25/M, as OpenRocket's) is below
  // this report's finned-body base pressure data; the limit guards against it getting worse
  report("NACA RM A53D02: total drag, fineness-10 body with 72°-swept fins", res.a53, 0.2, true);
  report("NACA RM E50D28: drag added by the RM-10's 60°-swept fins", res.rm10, 0.03, false);
  process.exitCode = fail ? 1 : 0;
})();
