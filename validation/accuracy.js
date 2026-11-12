#!/usr/bin/env node
/*
 * How accurate the aerodynamic model is against every measured rocket in validation/cases.js, by speed band:
 *
 *   node build.js && node validation/accuracy.js [--model released] [--verbose] [--skin cold]
 *
 * For each case the app's model is built from the case's geometry and compared point by point: drag as a relative
 * error, the fins' added drag as a difference in Cd, the center of pressure as a difference in % of body length, the
 * normal-force slope as a relative error. "Drag less base" is the drag without the body's base drag, for wind-tunnel
 * models whose base pressure was corrected to free-stream pressure. The CP and slope are found the way a wind-tunnel balance finds them, from the
 * normal force and pitching moment over ±2° with the body's own lift included (as validation/arcas.js).
 *
 * The summary keeps "tuned" cases (a model constant was set while looking at them) apart from "check" cases (never
 * used to set anything): the check cases are the honest measure. Speed bands: subsonic below Mach 0.8, transonic
 * 0.8–1.2, supersonic 1.2–3, high supersonic 3–5.
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");
const { CASES } = require("./cases.js");

const verbose = process.argv.includes("--verbose");
// --model released scores the previous drag model (Settings, Drag model: Previous) instead of the current one
const model = process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : "";
const BANDS = [
  ["subsonic", 0, 0.8],
  ["transonic", 0.8, 1.2],
  ["supersonic", 1.2, 3],
  ["high supersonic", 3, 5.0001],
];
const KIND = {
  cd: { label: "drag", unit: "%", err: (a, m) => (100 * (a - m)) / m },
  cdFore: { label: "drag less base", unit: "%", err: (a, m) => (100 * (a - m)) / m },
  cdFins: { label: "fin drag", unit: " Cd", err: (a, m) => a - m },
  cdJet: { label: "drag the exhaust removes", unit: " Cd", err: (a, m) => a - m },
  cdFinsPressure: { label: "fin pressure drag", unit: " Cd", err: (a, m) => a - m },
  cdAftPressure: { label: "boattail pressure drag", unit: " Cd", err: (a, m) => a - m },
  cp: { label: "CP", unit: "% of length", err: (a, m) => 100 * (a - m) },
  cna: { label: "CNα", unit: "%", err: (a, m) => (100 * (a - m)) / m },
};

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => (window.PR_EXPOSE = true));
  await p.goto("file://" + path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));
  await p.waitForFunction(() => typeof window.cdParts === "function");
  if (model) await p.evaluate((m) => setDragModel(m), model);
  const results = await p.evaluate(
    ([cases, coldSkin]) => {
      const air = atmosphere({ ...defaultLaunch(), elev: 0, tempC: 15, pressure: 0, humidity: 0 }, 0),
        mu = (1.458e-6 * Math.pow(air.T, 1.5)) / (air.T + 110.4);
      const build = (xml, over) => {
        const D = Object.assign(defaultDesign(), parseOrk(xml).design, over || {});
        return { D, A: aero(D) };
      };
      // drag at a Mach number; with a Reynolds number given (on a length), the air's density is set to give it
      /* The skin's temperature (the test drag model's friction depends on it). Every case is scored with the skin
       fully heated (the adiabatic wall: 0, cdParts' default), which is right for a wind tunnel model. A free-flight
       model's skin is somewhere between that and the air's temperature: a few millimetres of metal at Mach 2 near the
       ground heats with a time constant of about five seconds, the length of the flight. --skin cold rescores the
       free-flight cases with the skin at the air's temperature (the convention Missile DATCOM's code uses), which
       bounds the effect: it adds up to 20% to the friction at Mach 2.3. */
      let skinT = 0;
      const cd = (m, M, Re, len, noz, noBase) => {
        const v = M * air.a,
          atm = Re ? { ...air, rho: (mu * Re) / (v * len) } : air;
        return cdParts(
          noBase ? { ...m.A, baseArea: 0 } : m.A,
          v,
          atm,
          noz ? Math.PI * (noz / 2) ** 2 : 0,
          undefined,
          skinT,
        ).cd;
      };
      // CP (share of length) and normal-force slope as a balance measures them, over ±2°
      const balance = (A, M) => {
        const C = cnaPartsM(A, M);
        let sN = 0,
          sM = 0,
          sA = 0;
        for (let i = -20; i <= 20; i++) {
          const a = ((i / 10) * Math.PI) / 180,
            lin = C.cn * Math.sin(a) * Math.cos(a),
            cross = ((CROSS_K * A.sideArea) / A.Aref) * Math.sin(a) * Math.abs(Math.sin(a));
          sN += (lin + cross) * a;
          sM += (lin * C.cp + cross * A.xPlan) * a;
          sA += a * a;
        }
        return { cp: sM / sN / A.L, cna: sN / sA };
      };
      return cases.map((c) => {
        const m = build(c.xml, c.design),
          b = c.xmlBody ? build(c.xmlBody) : null;
        skinT = coldSkin && c.tier === "free flight" ? air.T : 0;
        const app = c.pts.map(([M, , Re]) => {
          if (c.quantity === "cd") return cd(m, M, Re, m.D.length, c.nozzleDia);
          if (c.quantity === "cdFore") return cd(m, M, Re, m.D.length, 0, true);
          if (c.quantity === "cdFins") return cd(m, M, c.rePerM, 1) - cd(b, M, c.rePerM, 1);
          // what the motor's exhaust takes off the drag: coasting less thrusting
          if (c.quantity === "cdJet") return cd(m, M, Re, m.D.length, 0) - cd(m, M, Re, m.D.length, c.nozzleDia);
          if (c.quantity === "cdFinsPressure" || c.quantity === "cdAftPressure") {
            const pr = (x) => cdParts(x.A, M * air.a, air).pressure;
            return pr(m) - pr(b);
          }
          return balance(m.A, M)[c.quantity];
        });
        return { id: c.id, app };
      });
    },
    [CASES, process.argv.includes("--skin") && process.argv[process.argv.indexOf("--skin") + 1] === "cold"],
  );
  await browser.close();

  const rows = []; // {case, M, err}
  for (const c of CASES) {
    const app = results.find((r) => r.id === c.id).app,
      K = KIND[c.quantity];
    if (verbose) console.log(`\n${c.title}  [${c.tier}; ${c.role}]\n  Mach  reference    app   error`);
    c.pts.forEach(([M, meas], i) => {
      const e = K.err(app[i], meas);
      rows.push({ c, M, e });
      if (verbose) {
        const f = (v) => (c.quantity === "cp" ? (v * 100).toFixed(1) : v.toFixed(3));
        console.log(
          `  ${M.toFixed(2).padStart(5)}  ${f(meas).padStart(8)}  ${f(app[i]).padStart(6)}  ${(e >= 0 ? "+" : "") + e.toFixed(/^cd(Fins|Jet|Aft)/.test(c.quantity) ? 3 : 1)}`,
        );
      }
    });
  }
  const mean = (a) => a.reduce((s, x) => s + Math.abs(x), 0) / a.length,
    bias = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const fmt = (q, a) => {
    if (!a.length) return "".padEnd(19);
    const d = /^cd(Fins|Jet|Aft)/.test(q) ? 3 : 1;
    return `${mean(a).toFixed(d)} (${bias(a) >= 0 ? "+" : ""}${bias(a).toFixed(d)}) n=${a.length}`.padEnd(19);
  };
  console.log("\nMean absolute error (mean signed error in brackets), by speed band:\n");
  console.log(
    "cases".padEnd(8) +
      "quantity".padEnd(22) +
      BANDS.map(([n, lo, hi]) => `${n} ${lo}–${Math.min(hi, 5)}`.padEnd(19)).join(""),
  );
  for (const role of ["check", "tuned"])
    for (const q of Object.keys(KIND)) {
      const sel = rows.filter((r) => r.c.role === role && r.c.quantity === q);
      if (!sel.length) continue;
      console.log(
        role.padEnd(8) +
          `${KIND[q].label} (${KIND[q].unit.trim()})`.padEnd(22) +
          BANDS.map(([, lo, hi]) =>
            fmt(
              q,
              sel.filter((r) => r.M >= lo && r.M < hi).map((r) => r.e),
            ),
          ).join(""),
      );
    }
  console.log("\nCases:");
  for (const c of CASES) {
    const e = rows.filter((r) => r.c === c).map((r) => r.e);
    console.log(
      `  ${c.role.padEnd(6)} ${c.title} [${c.tier}]: ${mean(e).toFixed(/^cd(Fins|Jet|Aft)/.test(c.quantity) ? 3 : 1)}${KIND[c.quantity].unit} mean, ${bias(e) >= 0 ? "+" : ""}${bias(e).toFixed(/^cd(Fins|Jet|Aft)/.test(c.quantity) ? 3 : 1)} bias`,
    );
  }
})();
