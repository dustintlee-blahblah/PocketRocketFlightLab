#!/usr/bin/env node
/*
 * The app's drag from Mach 2.1 down against a flight: Proto's recorder (validation/cases.js, PROTO_COAST).
 *
 *   node build.js && node validation/proto-coast.js [--html other-build.html]
 *
 * In the coast, and in the nose-first fall after the recovery failed, the accelerometer reads the drag over the mass,
 * so each stretch gives a drag coefficient: drag deceleration × mass / (dynamic pressure × reference area), with the
 * burnout mass worked out from the burn, the GPS speed and height, and the air from the app's atmosphere. The app's
 * coasting drag coefficient is worked out at the same speed and height for the shape measured from a photograph.
 * Printed for smooth paint and for a polished finish (the upper body was painted, the lower was the bare motor
 * case), with the air aloft as warm as at the pad and standard.
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");
const { FT, flightOrk, PROTO_COAST: P } = require("./cases.js");

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const html = path.resolve(opt("--html") || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => (window.PR_EXPOSE = true));
  await p.goto("file://" + html);
  await p.waitForFunction(() => typeof window.simulate === "function");
  const runs = [];
  for (const finish of ["smooth", "polished"])
    for (const air of ["warm", "standard"]) {
      const xml = flightOrk({ ...P.design, finish }, { totalMass: 12, len: 1.2 });
      const rows = await p.evaluate(
        async ({ xml, P, air, FT }) => {
          L = defaultLaunch();
          siteCur = "";
          await loadDesignXml(xml, "proto.ork", new TextEncoder().encode(xml).buffer, {});
          const elev = P.site * FT;
          Object.assign(L, {
            elev,
            tempC: air === "warm" ? ((P.tF - 32) * 5) / 9 : 15 - 0.0065 * elev,
            dewC: null,
            pressure: 0,
            humidity: 0,
          });
          const A = aero(D);
          return P.rows.map(([t, h, v, dg]) => {
            const atm = atmosphere(L, h * FT),
              V = v * FT;
            return [
              t,
              V / atm.a,
              h,
              (dg * 9.80665 * P.burnoutKg) / (0.5 * atm.rho * V * V * A.Aref),
              cdParts(A, V, atm, 0, 0).cd,
            ];
          });
        },
        { xml, P, air, FT },
      );
      runs.push({ finish, air, rows });
    }
  await browser.close();
  const pct = (x) => (x >= 0 ? "+" : "") + (100 * x).toFixed(0) + "%";
  const main = runs[1];
  console.log(`${P.title}: drag coefficient, smooth paint, standard air aloft, burnout mass ${P.burnoutKg} kg`);
  console.log("  t, s | Mach | height, ft | measured | app | app against measured");
  for (const [t, M, h, m, a] of main.rows)
    console.log(
      `  ${t} | ${M.toFixed(2)} | ${h} | ${m.toFixed(3)} | ${a.toFixed(3)} | ${pct(a / m - 1)}${t > 45 ? "   (falling)" : ""}`,
    );
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  console.log("\nmean error (bias) of the app:");
  for (const r of runs) {
    const band = (f) => {
      const e = r.rows.filter(f).map((x) => x[4] / x[3] - 1);
      return `${(100 * mean(e.map(Math.abs))).toFixed(1)}% (${pct(mean(e))})`;
    };
    console.log(
      `  ${r.finish}, ${r.air} air aloft: coast above Mach 1.2 ${band((x) => x[0] < 45 && x[1] >= 1.2)}, Mach 0.75–1.2 ${band((x) => x[0] < 45 && x[1] < 1.2 && x[1] >= 0.75)}, falling at Mach 0.6–0.95 ${band((x) => x[0] > 45)}`,
    );
  }
})();
