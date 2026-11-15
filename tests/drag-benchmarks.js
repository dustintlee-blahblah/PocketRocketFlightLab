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
 * The cases' geometry and measurements are in validation/cases.js.
 *  - NACA RM A53D02 (James & Carros, 1953): free-flight total drag of a fin-stabilized body of fineness ratio 10
 *    (tangent-ogive nose, four trapezoidal fins swept 72° with 4% sections), Mach 0.6 to 10. Points from figure 11
 *    and table I; Reynolds number on the model length. Coefficients on the body's cross-section area.
 *  - NACA RM E50D28 (1950): RM-10 missile in the Lewis 8- by 6-foot tunnel, Mach 1.49 to 1.98: the drag the four
 *    60°-swept fins (circular-arc sections, 10% thick normal to the leading edge, taper ratio 1) add to the body (figure 8(d) minus figure 6), less the
 *    fins' measured base-pressure increase (figure 9). On the body's maximum cross-section area.
 *  - NASA TN D-8040 (Patel & Czarnecki, 1975), figure 15, and Hoerner, Fluid-Dynamic Drag, chapter V, figure 10: the
 *    drag of the face of a step facing the flow, on the step's area, at heights of 0.1 and 1 boundary-layer
 *    thicknesses: a 3.9 in body stepping up 75 in back from the nose, the pressure drag with the step less without.
 *    These are the curves the app's step drag is built from, so this guards the wiring, not the physics.
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
const { finnedOrk: ork, flightOrk, A53, A53_PTS, RM10, RM10_PTS } = require("../validation/cases.js");
// the step case: [Mach, step height over the boundary layer's thickness, the source's drag coefficient]
const STEP_X = 75 * 0.0254,
  STEP_RE = 3e7,
  STEP_DEL = 0.37 * STEP_X * Math.pow(STEP_RE, -0.2),
  STEP_PTS = [
    [0.5, 0.1, 0.161],
    [0.5, 1, 0.311],
    [1.61, 0.1, 0.315],
    [1.61, 1, 0.48],
    [2.2, 0.1, 0.227],
    [2.2, 1, 0.373],
  ];
const stepOrk = (hd) =>
  flightOrk(
    {
      title: "step",
      nose: { len: 20, shape: "ogive" },
      parts: [
        { t: "tube", len: 55, d: 3.9 },
        {
          t: "tube",
          len: 20,
          d: 3.9 + (2 * hd * STEP_DEL) / 0.0254,
          fins: { n: 3, cr: 8, ct: 3, s: 4, sw: 5, t: 0.125, loc: 8, edge: "beveled", le: 0.5, te: 0.3 },
        },
      ],
      finish: "smooth",
      w: 30,
      cg: 50,
    },
    { totalMass: 5, len: 0.5 },
  );

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
      out.a53 = cases.a53Pts.map(([M, meas, Re]) => [M, meas, cd(a, M, Re, a.D.length).cd]);
      const f = model(cases.rm10f),
        b = model(cases.rm10b);
      out.rm10 = cases.rm10Pts.map(([M, meas]) => [M, meas, cd(f, M, 4.5e6, 0.3048).cd - cd(b, M, 4.5e6, 0.3048).cd]);
      const flush = model(cases.steps[0]);
      out.step = cases.stepPts.map(([M, hd, meas]) => {
        const st = model(cases.steps[hd]),
          pa = (m) => cd(m, M, cases.stepRe, cases.stepX).pressure * m.A.Aref;
        return [M, meas, (pa(st) - pa(flush)) / (st.A.Aref - flush.A.Aref)];
      });
      return out;
    },
    {
      cases: {
        a53: ork(A53),
        a53Pts: A53_PTS,
        rm10f: ork(RM10(true)),
        rm10b: ork(RM10(false)),
        rm10Pts: RM10_PTS,
        steps: { 0: stepOrk(0), 0.1: stepOrk(0.1), 1: stepOrk(1) },
        stepPts: STEP_PTS,
        stepRe: STEP_RE,
        stepX: STEP_X,
      },
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
  report(
    "NASA TN D-8040 and Hoerner: the face of a step 0.1 and 1 boundary-layer thicknesses high",
    res.step,
    0.02,
    false,
  );
  process.exitCode = fail ? 1 : 0;
})();
