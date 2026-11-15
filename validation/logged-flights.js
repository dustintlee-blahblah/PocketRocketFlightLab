#!/usr/bin/env node
/*
 * The app against weighed and logged hobby-rocket flights (validation/cases.js, LOGGED): the barometer's apogee, and
 * the drag coefficient the data logger's accelerometer measured in the coast.
 *
 *   node build.js && node validation/logged-flights.js [--html other-build.html]
 *
 * Each rocket is opened in the built app (headless Chromium) with the weight and CG the page gives plus the app's own
 * motor, and flown from its pad's pressure altitude at the flight's temperature and wind, twice: as its design file is
 * set up (polished, no rail buttons or lug), and with regular paint and a pair of 1010 rail buttons. Printed for each:
 * the apogee as a barometric altimeter would read it against the logger's, and the drag coefficient at the Mach number
 * of the coast measurement against the measured one; then the mean absolute error and bias of both set-ups.
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");
const { IN, FT, LB, MPH, flightOrk, LOGGED } = require("./cases.js");

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const html = path.resolve(opt("--html") || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));
const SETUPS = [
  ["as filed", { finish: "polished" }],
  ["painted, with rail buttons", { finish: "normal", rail: { d: 0.4, h: 0.38 } }],
];

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => (window.PR_EXPOSE = true));
  await p.goto("file://" + html);
  await p.waitForFunction(() => typeof window.simulate === "function" && typeof window.allMotors === "function");
  const rows = [];
  for (const f0 of LOGGED) {
    const mo = await p.evaluate(
      ({ name, mfr }) => {
        const m = allMotors().filter((x) => x.name === name && x.mfr === mfr);
        return m.length === 1 ? { totalMass: m[0].totalMass, len: m[0].len } : null;
      },
      { name: f0.motor, mfr: f0.mfr },
    );
    if (!mo) throw new Error(`${f0.title}: the app has no (or more than one) ${f0.mfr} ${f0.motor}`);
    const len = f0.nose.len + f0.parts.reduce((s, q) => s + q.len, 0),
      dry = f0.dry / 1000,
      W = dry + mo.totalMass,
      // the weight and CG of the whole rocket, as flightOrk takes them, from the page's figures without a motor
      w = W / LB,
      cg = (dry * f0.cgDry * IN + mo.totalMass * (len * IN - mo.len / 2)) / W / IN;
    const row = { f: f0, set: [] };
    for (const [, ch] of SETUPS) {
      const f = { ...f0, ...ch, w, cg };
      const app = await p.evaluate(
        async ({ xml, f, FT, MPH }) => {
          window.PR_NO_ASK = false;
          L = defaultLaunch();
          siteCur = "";
          if (!(await loadDesignXml(xml, f.title + ".ork", new TextEncoder().encode(xml).buffer, {})))
            return { err: "could not open" };
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
          const m = allMotors().find((x) => x.name === f.motor && x.mfr === f.mfr);
          const R = simulate(D, L, m, null, { noRef: true });
          if (R.st.error) return { err: R.st.error };
          // the drag coefficient at the coast measurement's Mach number, halfway up
          const atm = atmosphere(L, R.st.maxAlt / 2);
          return {
            baro: baroReading(L, R.st.maxAlt) / FT,
            liftMass: R.st.liftMass,
            mach: R.st.maxMach,
            cd: cdParts(aero(D), f.cd[0] * atm.a, atm).cd,
          };
        },
        { xml: flightOrk(f, mo), f, FT, MPH },
      );
      if (app.err) throw new Error(`${f0.title}: ${app.err}`);
      if (Math.abs(app.liftMass / W - 1) > 0.002)
        throw new Error(`${f0.title}: launch mass ${app.liftMass} kg, not ${W}`);
      row.set.push(app);
    }
    rows.push(row);
  }
  await browser.close();

  const pct = (a, m) => (100 * (a - m)) / m,
    sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(1) + "%";
  console.log(
    `flight | max Mach | apogee by barometer, ft | app ${SETUPS.map((s) => s[0]).join(" | app ")} || Cd in the coast at Mach | measured | app ${SETUPS.map((s) => s[0]).join(" | app ")}`,
  );
  for (const { f, set } of rows)
    console.log(
      `${f.title} | ${set[0].mach.toFixed(2)} | ${f.baro} | ${set.map((a) => `${a.baro.toFixed(0)}, ${sg(pct(a.baro, f.baro))}`).join(" | ")} || ${f.cd[0]} | ${f.cd[1].toFixed(3)} | ${set.map((a) => `${a.cd.toFixed(3)}, ${sg(pct(a.cd, f.cd[1]))}`).join(" | ")}`,
    );
  const sum = (e) =>
    `${(e.reduce((s, x) => s + Math.abs(x), 0) / e.length).toFixed(1)}% (bias ${sg(e.reduce((s, x) => s + x, 0) / e.length)})`;
  console.log(`\nmean absolute error (bias), ${rows.length} flights:`);
  SETUPS.forEach(([name], i) =>
    console.log(
      `  ${name.padEnd(28)} apogee ${sum(rows.map((r) => pct(r.set[i].baro, r.f.baro)))}   drag in the coast ${sum(rows.map((r) => pct(r.set[i].cd, r.f.cd[1])))}`,
    ),
  );
})();
