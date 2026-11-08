#!/usr/bin/env node
/*
 * Checks the app's center of pressure against wind-tunnel measurements of the Arcas sounding rocket:
 *
 *   node build.js && node validation/arcas.js
 *
 * The measurements (the CP as a share of body length, at small angles of attack):
 *   NASA TN D-4013 (1967), figures 11 and 12: two models, a short and a long body, Mach 0.6 to 0.9
 *   NASA TN D-4014 (1967), figure 7: the short model, Mach 1.5 to 4.6
 * The models are built from the reports' dimensions: a 9.375 in tangent-ogive-like nose (fitted to the reports'
 * coordinates: ogive, shape parameter 0.75), a 2.25 in body, four trapezoidal fins, and a conical boattail.
 *
 * The app's CP at each Mach number is found the way a wind-tunnel balance finds it: the slope of the pitching moment
 * against the slope of the normal force over angles of attack from -2 to +2 degrees, with the body's own lift
 * (CROSS_K) included. Printed: each Mach number's measured and predicted CP, and the root-mean-square error.
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");

// the models and the measured CP (validation/cases.js)
const { ARCAS: MEASURED } = require("./cases.js");

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => (window.PR_EXPOSE = true));
  await p.goto("file://" + path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));
  await p.waitForFunction(() => typeof window.aero === "function");
  const errors = [];
  for (const [name, m] of Object.entries(MEASURED)) {
    const rows = await p.evaluate(
      ([xml, machs]) => {
        const A = aero(parseOrk(xml).design);
        return machs.map((M) => {
          const C = cnaPartsM(A, M);
          let sN = 0,
            sM = 0;
          for (let i = -20; i <= 20; i++) {
            const a = ((i / 10) * Math.PI) / 180,
              lin = C.cn * Math.sin(a) * Math.cos(a),
              cross = ((CROSS_K * A.sideArea) / A.Aref) * Math.sin(a) * Math.abs(Math.sin(a));
            sN += (lin + cross) * a;
            sM += (lin * C.cp + cross * A.xPlan) * a;
          }
          return { M, cp: (100 * (sM / sN)) / A.L };
        });
      },
      [
        m.xml,
        Object.keys(m.cp)
          .map(Number)
          .sort((a, b) => a - b),
      ],
    );
    console.log(`${name} model: Mach | measured CP | app CP (% of body length) | difference`);
    for (const r of rows) {
      const d = r.cp - m.cp[r.M];
      errors.push(d);
      console.log(
        `  ${r.M.toFixed(2)} | ${m.cp[r.M].toFixed(1)} | ${r.cp.toFixed(1)} | ${d >= 0 ? "+" : ""}${d.toFixed(1)}`,
      );
    }
  }
  await browser.close();
  const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  console.log(`\nRMS error over ${errors.length} points: ${rms.toFixed(1)}% of body length`);
})();
