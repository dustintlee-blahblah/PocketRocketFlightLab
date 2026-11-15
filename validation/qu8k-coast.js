#!/usr/bin/env node
/*
 * The app's drag above Mach 2 against a flight: Qu8k's recorder (validation/cases.js, QU8K_COAST).
 *
 *   node build.js && node validation/qu8k-coast.js [--html other-build.html]
 *
 * In the coast an axial accelerometer reads the drag over the mass and nothing else, so each quarter second gives a
 * drag coefficient: reading × g × mass / (dynamic pressure × reference area), with the mass weighed after the flight,
 * the speed and height from integrating the same accelerometer from liftoff, and the air from the app's atmosphere at
 * that height. The app's coasting drag coefficient is worked out at the same speed and height. Printed second by
 * second and as a mean, for the sensor's zero as found in the near-vacuum coast and for an uncorrected zero, and for
 * two columns of air: as warm aloft as at the pad (what the app assumes from a pad temperature), and standard.
 *
 * The same integration gives the apogee the accelerometer implies for each zero, against the 121,478 ft reported.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { IN, FT, LB, flightOrk, FLIGHTS, QU8K_COAST: Q } = require("./cases.js");

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const html = path.resolve(opt("--html") || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));
const G = 9.80665;

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => (window.PR_EXPOSE = true));
  await p.goto("file://" + html);
  await p.waitForFunction(() => typeof window.simulate === "function" && typeof window.parseEng === "function");
  const f = FLIGHTS.find((x) => x.title === Q.title);
  const eng = fs.readFileSync(path.join(__dirname, "flight-motors.eng"), "utf8");
  const mo = await p.evaluate(
    ({ eng, f }) => {
      const m = parseEng(eng).find((x) => x.name === f.motor && x.mfr === f.mfr);
      return { totalMass: m.totalMass, len: m.len };
    },
    { eng, f },
  );
  const runs = [];
  for (const zero of [Q.zero, 0])
    for (const air of ["warm", "standard"]) {
      const rows = await p.evaluate(
        async ({ xml, f, Q, zero, air, IN, FT, G, mass }) => {
          L = defaultLaunch();
          siteCur = "";
          await loadDesignXml(xml, f.title + ".ork", new TextEncoder().encode(xml).buffer, {});
          const elev = f.site * FT;
          Object.assign(L, {
            elev,
            tempC: air === "warm" ? ((f.tF - 32) * 5) / 9 : 15 - 0.0065 * elev,
            dewC: null,
            pressure: 0,
            humidity: 0,
          });
          D.nozzleDia = 0;
          D.noseTip = f.nose.tip > 0 ? f.nose.tip * IN : 0;
          const A = aero(D),
            out = [];
          let v = 0,
            h = 0;
          for (let i = 0; i < Q.acc.length; i++) {
            // the middle of the quarter second: half a step of this reading, then the other half after the point
            const a = (Q.acc[i] - zero) * G,
              gg = G * Math.pow(6371000 / (6371000 + elev + h), 2);
            const vm = v + ((a - gg) * Q.dt) / 2,
              hm = h + (v * Q.dt) / 2,
              t = (i + 0.5) * Q.dt;
            if (t >= Q.from && t <= Q.to) {
              const atm = atmosphere(L, hm),
                c = cdParts(A, vm, atm, 0, 0);
              out.push([t, vm / atm.a, hm / FT, (-a * mass) / (0.5 * atm.rho * vm * vm * A.Aref), c.cd]);
            }
            h += v * Q.dt + ((a - gg) * Q.dt * Q.dt) / 2;
            v += (a - gg) * Q.dt;
          }
          return out;
        },
        { xml: flightOrk(f, mo), f, Q, zero, air, IN, FT, G, mass: Q.burnoutLb * LB },
      );
      runs.push({ zero, air, rows });
    }
  await browser.close();

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const main = runs[0];
  console.log(`${Q.title}: drag coefficient in the coast, sensor zero ${Q.zero} g, air as warm aloft as at the pad`);
  console.log("  t, s | Mach | height, ft | measured | app | app against measured");
  for (let i = 0; i + 3 < main.rows.length; i += 4) {
    const s = main.rows.slice(i, i + 4),
      av = (k) => mean(s.map((r) => r[k]));
    console.log(
      `  ${av(0).toFixed(1)} | ${av(1).toFixed(2)} | ${Math.round(av(2))} | ${av(3).toFixed(3)} | ${av(4).toFixed(3)} | ${(100 * (av(4) / av(3) - 1) >= 0 ? "+" : "") + (100 * (av(4) / av(3) - 1)).toFixed(0)}%`,
    );
  }
  console.log(
    "\nmean over the coast (Mach " +
      main.rows[main.rows.length - 1][1].toFixed(1) +
      " to " +
      main.rows[0][1].toFixed(1) +
      "):",
  );
  for (const r of runs) {
    const m = mean(r.rows.map((x) => x[3])),
      a = mean(r.rows.map((x) => x[4]));
    console.log(
      `  zero ${r.zero} g, ${r.air} air aloft: measured ${m.toFixed(3)}, app ${a.toFixed(3)}, ${(100 * (a / m - 1) >= 0 ? "+" : "") + (100 * (a / m - 1)).toFixed(1)}%`,
    );
  }
  // the apogee the accelerometer implies, by the report's own integration (reading less 1 g, flat-earth gravity)
  console.log(
    "\napogee by integrating the accelerometer to 40 s and coasting on without drag from there (the report, integrating\nthe whole record with no zero correction: 121,478 ft):",
  );
  for (const zero of [Q.zero, 0]) {
    let v = 0,
      h = 0;
    for (const r of Q.acc) {
      const a = (r - zero - 1) * G;
      h += v * Q.dt + (a * Q.dt * Q.dt) / 2;
      v += a * Q.dt;
    }
    console.log(`  zero ${zero} g: ${Math.round((h + (v * v) / (2 * G)) / FT).toLocaleString("en-US")} ft`);
  }
})();
