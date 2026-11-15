#!/usr/bin/env node
/*
 * How the drag coefficient changes with height in a supersonic coast: four tracked two-stage flights
 * (validation/cases.js, KATE_COASTS) against the app.
 *
 *   node build.js && node validation/coast-trend.js [--html other-build.html]
 *
 * The flights give the drag deceleration, speed and height through each sustainer's coast, but not its weight or
 * shape, so only the change along the coast can be compared: the drag deceleration over the dynamic pressure, as a
 * ratio to its first point. The app's side is the coasting drag coefficient of a stand-in sustainer (a 4 in body 100
 * in long with a 5:1 von Kármán nose and four beveled fins, smooth paint) at each point's Mach number and height,
 * also as a ratio to its first point. A boundary layer that turned laminar in the thin air would show as the flights
 * rising less than the app. Printed for air aloft as warm as at the pad and for standard air aloft.
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");
const { FT, flightOrk, KATE_COASTS } = require("./cases.js");

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const html = path.resolve(opt("--html") || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));
const STAND_IN = {
  title: "stand-in sustainer",
  nose: { len: 20, shape: "vonkarman" },
  parts: [
    {
      t: "tube",
      len: 80,
      d: 4,
      fins: { n: 4, cr: 10, ct: 3, s: 4, sw: 7, t: 0.19, loc: 10.5, edge: "beveled", le: 0.6, te: 0.4 },
    },
  ],
  finish: "smooth",
  w: 40,
  cg: 60,
};

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => (window.PR_EXPOSE = true));
  await p.goto("file://" + html);
  await p.waitForFunction(() => typeof window.simulate === "function");
  const xml = flightOrk(STAND_IN, { totalMass: 8, len: 1 });
  const res = await p.evaluate(
    async ({ xml, FT, flights }) => {
      L = defaultLaunch();
      siteCur = "";
      await loadDesignXml(xml, "stand-in.ork", new TextEncoder().encode(xml).buffer, {});
      const out = [];
      for (const f of flights)
        for (const air of ["warm", "standard"]) {
          const elev = f.site * FT;
          Object.assign(L, {
            elev,
            tempC: air === "warm" ? ((f.tF - 32) * 5) / 9 : 15 - 0.0065 * elev,
            dewC: null,
            pressure: 0,
            humidity: 0,
          });
          const A = aero(D);
          out.push({
            title: f.title,
            air,
            rows: f.rows.map(([t, h, v, dg]) => {
              const atm = atmosphere(L, h * FT),
                V = v * FT;
              return [t, V / atm.a, h, (dg * 9.80665) / (0.5 * atm.rho * V * V), cdParts(A, V, atm, 0, 0).cd];
            }),
          });
        }
      return out;
    },
    { xml, FT, flights: KATE_COASTS },
  );
  await browser.close();
  const ends = [];
  for (const r of res) {
    const k0 = r.rows[0][3],
      c0 = r.rows[0][4];
    console.log(`\n${r.title}, ${r.air} air aloft`);
    console.log("  t, s | Mach | height, ft | flight, ratio to its first point | app | app against flight");
    for (const [t, M, h, k, cd] of r.rows) {
      const fr = k / k0,
        ar = cd / c0;
      console.log(
        `  ${t} | ${M.toFixed(2)} | ${h} | ${fr.toFixed(2)} | ${ar.toFixed(2)} | ${(100 * (ar / fr - 1) >= 0 ? "+" : "") + (100 * (ar / fr - 1)).toFixed(0)}%`,
      );
    }
    const last = r.rows[r.rows.length - 1];
    ends.push([r.air, last[4] / c0 / (last[3] / k0) - 1]);
  }
  console.log("\nthe app's rise over each coast against the flight's, mean of the four:");
  for (const air of ["warm", "standard"]) {
    const e = ends.filter((x) => x[0] === air).map((x) => x[1]);
    console.log(
      `  ${air} air aloft: ${(100 * (e.reduce((a, b) => a + b, 0) / e.length) >= 0 ? "+" : "") + (100 * (e.reduce((a, b) => a + b, 0) / e.length)).toFixed(0)}%`,
    );
  }
})();
