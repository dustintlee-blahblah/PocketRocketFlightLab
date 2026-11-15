// Drag from an altimeter's accelerometer, and the drag hints: flies the app's own new design with its drag raised by a
// known factor, writes that flight out as an altimeter file (time, barometric height, axial acceleration with a zero
// offset), imports it as a logged flight and calibrates to it. The calibration must come from the coast and give the
// factor back. A second file whose accelerometer reads 15% low must be refused (the boost no longer agrees with the
// rocket's weight and motor) and the calibration fall back to the apogee. Then: a design opened with a polished finish
// and no rail buttons shows both hints, and each button makes its change.
// usage: node tests/coast.js [page.html]     (default page: web/pocket-rocket-flight-lab.html)
"use strict";
const path = require("path");
const { chromium } = require("playwright");
(async () => {
  const file = process.argv[2] || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html");
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 412, height: 900 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await p.route(/^https?:/, (r) => r.abort());
  p.on(
    "console",
    (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push("console: " + m.text()),
  );
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
  });
  await p.goto("file://" + path.resolve(file));
  await p.waitForFunction(() => typeof window.simulate === "function");
  await p.evaluate(() => {
    const d = document.getElementById("legal");
    if (d) d.hidden = true;
  });
  const fails = [];
  const check = (ok, what) => {
    console.log((ok ? "ok    " : "FAIL  ") + what);
    if (!ok) fails.push(what);
  };
  /* the flight, logged from a file made from the app's own flight with drag × factor; gain scales the accelerometer */
  const logged = async (factor, gain) =>
    p.evaluate(
      async ({ factor, gain }) => {
        bldNewDesign();
        Object.assign(L, { wind: 0, angle: 0, turb: 0, windProfile: "constant" });
        runAll();
        const m = lastSim.m,
          o = simulate({ ...lastSim.D, dragScale: factor }, lastSim.L, m, null, { noRef: true }).out,
          G = 9.80665,
          rows = ["time,height_m,accel_g"];
        let iA = 0;
        o.alt.forEach((h, i) => {
          if (h > o.alt[iA]) iA = i;
        });
        for (let t = -1; t < 0; t += 0.02) rows.push(`${t.toFixed(3)},0,${(gain * 1 + 0.03).toFixed(4)}`);
        // every sample to 4 s past apogee; the accelerometer reads thrust less drag over mass (gravity doesn't show)
        for (let i = 0; i < o.t.length && o.t[i] < o.t[iA] + 4; i++)
          rows.push(
            `${o.t[i].toFixed(4)},${baroReading(lastSim.L, o.alt[i]).toFixed(2)},${((gain * (o.acc[i] + G)) / G + 0.03).toFixed(4)}`,
          );
        const P = altParse(rows.join("\n"), "synthetic.csv");
        if (P.error) return { err: P.error };
        const R = altCompute(P, P.map);
        if (R.error) return { err: R.error };
        const id = flId();
        flPut([
          {
            id,
            made: Date.now(),
            date: "2026-01-01",
            motor: m.name,
            motorId: m.id,
            apo: R.apo,
            pred: lastSim.st.maxAlt,
            altis: [{ brand: "Test", apo: R.apo, tApo: R.tApo, curve: R.curve, ev: R.ev, coast: R.coast }],
          },
        ]);
        calSet(null);
        runAll();
        document.querySelector(`.flrow[data-id="${id}"] input[data-fl="cal"]`).click();
        for (let i = 0; i < 100 && !(calGet() && calGet().k); i++) await new Promise((r) => setTimeout(r, 100));
        const c = calGet() || {};
        return {
          map: P.map,
          coast: R.coast && { n: R.coast.n, why: R.coast.why, zero: R.coast.zero },
          k: c.k,
          how: c.how || "apogee",
          row: document.querySelector(`.flrow[data-id="${id}"]`).textContent.replace(/\s+/g, " "),
          cal: document.getElementById("flcalst").textContent,
        };
      },
      { factor, gain },
    );
  const good = await logged(1.25, 1);
  check(!good.err, "the file imports" + (good.err ? ": " + good.err : ""));
  check(good.map && good.map.acc === 2 && good.map.accUnit === "g", "the acceleration column and its unit are found");
  check(good.coast && !good.coast.why && good.coast.n >= 12, "the coast is read from it");
  check(good.how === "coast", "the calibration comes from the coast");
  check(Math.abs(good.k - 1.25) < 0.03, `it gives the drag factor back: ×${good.k && good.k.toFixed(3)} for ×1.25`);
  check(/measured in the coast/.test(good.row) && /measured in the coast/.test(good.cal), "the log says so");
  const low = await logged(1.25, 0.85);
  check(low.how === "apogee", "an accelerometer reading 15% low is not used for the calibration");
  check(
    /weighed \d+% more/.test(low.row),
    "and the log says why: " + (low.row.match(/The accelerometer.*?\./) || [""])[0],
  );
  check(Math.abs(low.k - 1.25) < 0.03, `the apogee calibration still gives ×${low.k && low.k.toFixed(3)}`);
  /* the drag hints */
  const hints = await p.evaluate(async () => {
    calSet(null);
    flPut([]);
    bldNewDesign();
    BLD.settings.finish = "polished";
    for (const st of BLD.stages)
      for (const q of st.parts) q.kids = (q.kids || []).filter((k) => k.type !== "buttons" && k.type !== "lug");
    bldChanged(true);
    // fast enough for the finish to matter
    Object.assign(L, { wind: 0, angle: 0 });
    runAll();
    const txt = () => [...document.querySelectorAll("#draghints .draghint")].map((d) => d.dataset.hint);
    const out = { first: txt(), finish0: lastSim.D.finish, rail0: lastSim.D.railPreset, apo0: lastSim.st.maxAlt };
    const fb = document.querySelector('#draghints .draghint[data-hint="finish"] button:nth-child(2)');
    if (fb) fb.click();
    out.finish1 = lastSim.D.finish;
    out.afterFinish = txt();
    const gb = document.querySelector('#draghints .draghint[data-hint="guides"] button');
    if (gb) gb.click();
    out.rail1 = lastSim.D.railPreset;
    out.afterGuides = txt();
    out.apo1 = lastSim.st.maxAlt;
    return out;
  });
  check(hints.rail0 === "none" && hints.first.includes("guides"), "no rail buttons or lug: the hint shows");
  if (hints.first.includes("finish")) {
    check(hints.finish1 === 60e-6 && !hints.afterFinish.includes("finish"), "regular paint is set in one tap");
  } else console.log("      (the new design is too slow for its finish to matter: no finish hint)");
  check(hints.rail1 === "custom" && !hints.afterGuides.includes("guides"), "rail buttons are added in one tap");
  check(hints.apo1 < hints.apo0, "and the apogee comes down");
  check(!errs.length, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join("; ") : ""));
  await b.close();
  if (fails.length) {
    console.log(`FAIL: ${fails.length} check(s)`);
    process.exit(1);
  }
  console.log("PASS");
})();
