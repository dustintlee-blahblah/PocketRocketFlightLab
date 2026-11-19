#!/usr/bin/env node
/*
 * The app against flights that flyers shared with their design files (VALIDATION.md, "shared by flyers"). The design
 * files stay out of this repository: put them in a folder of your own and point the script at it.
 *
 *   node build.js && node validation/shared-flights.js --dir <folder> [--html other-build.html]
 *   (or set PR_SHARED to the folder)
 *
 * Each file is opened in the built app with the settings saved in it (as the flyer set it up), with the motor, ejection
 * delay and launch conditions of the flight where the file doesn't already hold them, and flown once. Printed for each:
 * the apogee against the measured one where the flight reached apogee, the top speed and peak acceleration against the
 * altimeter's (an altimeter that reached its acceleration limit reads both low, so those are shown but not graded), and
 * the altitude at ejection where the charge fired before apogee.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const FT = 0.3048;
const G0 = 9.80665;
const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const html = path.resolve(opt("--html") || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));
const dir = opt("--dir") || process.env.PR_SHARED;

/* What was measured. Units: ft, ft/s, g, s. limitG: the altimeter's acceleration limit, when the flight reached it.
   early: the charge fired before apogee, so the highest altitude logged isn't a full apogee and isn't graded. */
const SHARED = [
  {
    title: "CT Concept 98, Cesaroni 6251M1400",
    file: "CT-Concept98-External-Fincan.ork",
    measured: { apogee: 17400, source: "GPS, about" },
  },
  {
    title: "Estes Partizon, AeroTech I205W",
    file: "Partizon.ork",
    motor: "HP-I205W",
    delay: 10, // fits the altimeter's timing: the charge 0.9 s before apogee
    measured: { apogee: 4263, ejectAlt: 4213, ejectToApogee: -0.9, coast: 10.8, vmax: 905, peakG: 23.0, limitG: 23 },
  },
  {
    title: "Estes Ascender, AeroTech H135W",
    file: "Ascender.ork",
    motor: "HP-H135W",
    delay: 6, // the motor's shortest delay, which fits the ejection altitude
    launch: { elev: 844.9056, tempC: 21.667, wind: 1.743456, windDir: 175, pressure: 0, humidity: 0 },
    measured: { top: 4030, early: true, ejectAlt: 3943, ejectToApogee: -2, vmax: 880, peakG: 22.9 },
  },
];

(async () => {
  if (!dir) {
    console.error("Give the folder of shared design files: --dir <folder> (or PR_SHARED).");
    process.exit(2);
  }
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    window.PR_NO_ASK = true;
    sessionStorage.setItem("rfs-splash", "1");
  });
  await p.goto("file://" + html);
  await p.waitForFunction(() => typeof window.simulate === "function" && typeof window.loadDesignXml === "function");
  const rows = [];
  for (const f of SHARED) {
    const fp = path.join(dir, f.file);
    if (!fs.existsSync(fp)) {
      console.log(`${f.title}: ${f.file} isn't in ${dir}, skipped`);
      continue;
    }
    const r = await p.evaluate(
      async ({ b64, f, G0 }) => {
        const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const buf = u8.buffer,
          xml = await unzipOrk(buf);
        L = defaultLaunch();
        siteCur = "";
        if (!(await loadDesignXml(xml, f.file, buf, { pick: { kind: "saved" } }))) return { err: "could not open" };
        if (f.launch) Object.assign(L, f.launch);
        let m = flightMotor();
        if (f.motor) {
          const c = allMotors().filter((x) => x.name === f.motor);
          if (c.length !== 1) return { err: `the app has ${c.length} motors named ${f.motor}` };
          m = c[0];
        }
        if (f.delay != null) D.ejDelay = f.delay;
        const R = simulate(D, L, m, null, { noRef: true });
        if (R.st.error) return { err: R.st.error };
        // the same flight with the charge held until well past apogee: how high it would have gone
        const dl = D.ejDelay;
        D.ejDelay = 60;
        const free = simulate(D, L, m, null, { noRef: true }).st.maxAlt;
        D.ejDelay = dl;
        const o = R.out;
        let peak = 0;
        for (let i = 0; i < o.t.length && o.t[i] <= R.st.tb + 0.05; i++) peak = Math.max(peak, o.acc[i] / G0);
        return {
          motor: m.name,
          apogee: R.st.maxAlt,
          apogeeFree: free,
          vmax: R.st.maxV,
          mach: R.st.maxMach,
          peakG: peak,
          tb: R.st.tb,
          tApo: R.st.tApo,
          ejectAlt: R.st.altDeploy,
          tEject: R.st.tDeploy,
          massKnown: D.massKnown !== false,
        };
      },
      { b64: fs.readFileSync(fp).toString("base64"), f, G0 },
    );
    if (r.err) throw new Error(`${f.title}: ${r.err}`);
    rows.push({ f, r });
  }
  await browser.close();

  const pct = (a, m) => (100 * (a - m)) / m,
    sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(1) + "%",
    ft = (v) => Math.round(v / FT).toLocaleString("en-US");
  const graded = [];
  for (const { f, r } of rows) {
    const M = f.measured,
      out = [`${f.title} (Mach ${r.mach.toFixed(2)}${r.massKnown ? "" : ", weight estimated from the parts"})`];
    if (M.apogee) {
      const e = pct(r.apogee / FT, M.apogee);
      graded.push(e);
      out.push(
        `  apogee: measured ${M.apogee.toLocaleString("en-US")} ft (${M.source || "altimeter"}), app ${ft(r.apogee)} ft, ${sg(e)}`,
      );
    }
    if (M.early)
      out.push(
        `  charge before apogee: highest logged ${M.top.toLocaleString("en-US")} ft, app ${ft(r.apogee)} ft with the ${f.delay} s delay, ${sg(pct(r.apogee / FT, M.top))} (not graded); ${ft(r.apogeeFree)} ft without the early charge`,
      );
    if (M.ejectAlt != null && r.ejectAlt != null)
      out.push(
        `  ejection: measured ${M.ejectAlt.toLocaleString("en-US")} ft, ${M.ejectToApogee} s from apogee; app ${ft(r.ejectAlt)} ft, ${(r.tEject - r.tApo).toFixed(1)} s from apogee`,
      );
    if (M.coast != null) out.push(`  coast to apogee: measured ${M.coast} s, app ${(r.tApo - r.tb).toFixed(1)} s`);
    if (M.vmax != null) {
      const lim = M.limitG && r.peakG > M.limitG;
      out.push(
        `  top speed: measured ${M.vmax} ft/s, app ${Math.round(r.vmax / FT)} ft/s, ${sg(pct(r.vmax / FT, M.vmax))}${lim ? " (the altimeter hit its limit, so it reads low)" : ""}`,
      );
      out.push(
        `  peak acceleration: measured ${M.peakG} g, app ${r.peakG.toFixed(1)} g${lim ? ` (limit ${M.limitG} g)` : ""}`,
      );
    }
    console.log(out.join("\n"));
  }
  if (graded.length)
    console.log(
      `\napogee, ${graded.length} graded flights: mean absolute error ${(graded.reduce((s, x) => s + Math.abs(x), 0) / graded.length).toFixed(1)}%, bias ${sg(graded.reduce((s, x) => s + x, 0) / graded.length)}`,
    );
})();
