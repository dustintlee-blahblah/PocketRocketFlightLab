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

const IN = 0.0254;
const model = (tubeLen, finOffset) => `<?xml version="1.0" encoding="utf-8"?>
<openrocket version="1.9" creator="Pocket Rocket Flight Lab validation"><rocket><name>Arcas</name><subcomponents><stage><name>Stage</name><subcomponents>
<nosecone><name>Nose</name><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><length>${9.375 * IN}</length><thickness>0.002</thickness><shape>ogive</shape><shapeclipped>false</shapeclipped><shapeparameter>0.75</shapeparameter><aftradius>${1.125 * IN}</aftradius><aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength><aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped></nosecone>
<bodytube><name>Body</name><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><length>${tubeLen * IN}</length><thickness>0.002</thickness><radius>${1.125 * IN}</radius><subcomponents>
<trapezoidfinset><name>Fins</name><axialoffset method="top">${finOffset * IN}</axialoffset><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><fincount>4</fincount><rotation>0</rotation><thickness>${0.12 * IN}</thickness><crosssection>airfoil</crosssection><cant>0</cant><tabheight>0</tabheight><tablength>0</tablength><tabposition relativeto="front">0</tabposition><rootchord>${3.38 * IN}</rootchord><tipchord>${2.165 * IN}</tipchord><sweeplength>${1.214 * IN}</sweeplength><height>${2.103 * IN}</height></trapezoidfinset>
</subcomponents></bodytube>
<transition><name>Boattail</name><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><length>${1.46 * IN}</length><thickness>0.002</thickness><shape>conical</shape><shapeclipped>false</shapeclipped><shapeparameter>0</shapeparameter><foreradius>${1.125 * IN}</foreradius><aftradius>${0.735 * IN}</aftradius><foreshoulderradius>0</foreshoulderradius><foreshoulderlength>0</foreshoulderlength><foreshoulderthickness>0</foreshoulderthickness><foreshouldercapped>false</foreshouldercapped><aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength><aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped></transition>
</subcomponents></stage></subcomponents></rocket></openrocket>`;

// measured CP, % of body length from the nose tip, read from the reports' figures
const MEASURED = {
  short: {
    xml: model(30.115, 27.925),
    cp: {
      0.6: 75,
      0.7: 73.5,
      0.8: 72,
      0.85: 71,
      0.9: 71.5,
      1.5: 78,
      2: 74.5,
      2.5: 70.5,
      3: 67,
      3.5: 63.8,
      4: 61,
      4.6: 57.5,
    },
  },
  long: { xml: model(42.665, 40.475), cp: { 0.6: 76.5, 0.7: 75.7, 0.8: 75.5, 0.85: 75.8, 0.9: 75.8 } },
};

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
