#!/usr/bin/env node
/*
 * Altimeter logs: flights made by the app itself, written out in the general shape of each altimeter maker's files
 * (no real logs are kept in the repository), then read back the way an imported log is. Checks that each is recognized,
 * that apogee, top speed and the charge come back where the flight put them (a charge before apogee included), that
 * Flight vs prediction opens for a log, for an altimeter's display readings and for a flight with just its apogee,
 * that a reading at an altimeter's acceleration limit is shown but not graded, and that a log picked with Open design
 * file goes to the Flight Log.
 *
 *   node build.js && node tests/altimeter-logs.js [--html other-build.html]
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const html = path.resolve(
  (args.includes("--html") && args[args.indexOf("--html") + 1]) ||
    path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"),
);
let fails = 0,
  checks = 0;
const ok = (what, cond, got) => {
  checks++;
  if (!cond) {
    fails++;
    console.log(`FAIL ${what}${got !== undefined ? `: ${JSON.stringify(got)}` : ""}`);
  }
};

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    window.PR_NO_ASK = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02", build: "x" }));
    sessionStorage.setItem("rfs-splash", "1");
  });
  await p.goto("file://" + html);
  await p.waitForFunction(() => typeof window.openExample === "function" && typeof window.altParse === "function");
  await p.evaluate(() => {
    const d = document.getElementById("legal");
    if (d) d.hidden = true;
  });
  // the LOC IV X2 on its H motor, its chute opened by the motor's charge
  await p.evaluate(async () => {
    await openExample(2);
    D.deployMode = "motor";
    runNow();
  });
  await p.waitForTimeout(800);

  // each maker's shape: a header and columns; the flight is written at 20 samples a second
  const logs = await p.evaluate(() => {
    const FT = 0.3048;
    const fly = (delay) => {
      const D2 = { ...D, deployMode: "motor", ejDelay: delay };
      return simulate(D2, L, flightMotor(), null, { noRef: true });
    };
    const at = (o, k, t) => {
      let i = 1;
      while (i < o.t.length - 1 && o.t[i] < t) i++;
      const f = Math.min(1, Math.max(0, (t - o.t[i - 1]) / (o.t[i] - o.t[i - 1] || 1)));
      return o[k][i - 1] + (o[k][i] - o[k][i - 1]) * f;
    };
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
    const write = (R, head, row, dt = 0.05, tEnd = 70) => {
      let s = head + "\n";
      for (let t = 0; t <= tEnd; t += dt) s += row(t, R.out, R.st) + "\n";
      return s;
    };
    const A = (o, t) => at(o, "alt", t),
      V = (o, t) => at(o, "vel", t),
      G = (o, t) => at(o, "acc", t) / 9.80665;
    const early = fly(3),
      normal = fly(Math.max(1, Math.round(fly(99).st.tApo - fly(99).st.tb))),
      out = [];
    const sts = (R) => ({
      apo: R.st.maxAlt,
      vmax: R.st.maxV,
      tApo: R.st.tApo,
      tDep: R.st.tDeploy,
    });
    out.push({
      name: "eggtimer_quantum_flight3.csv",
      brand: "eggtimer",
      truth: sts(early),
      text: write(
        early,
        "T,Alt,Veloc,KAlt,KVeloc,LDA,BurnT,LowV,Apogee,N-O,CHA,CHB",
        (t, o) =>
          `${Math.round(t * 1000)},${Math.round(A(o, t) / FT + rnd() * 2)},${Math.round(V(o, t) / FT)},${Math.round(A(o, t) / FT)},${Math.round(V(o, t) / FT)},0,0,0,0,0,0,0`,
      ),
    });
    out.push({
      name: "flight-1.csv",
      brand: "perfectflite",
      truth: sts(normal),
      text: write(
        normal,
        "PerfectFlite StratoLoggerCF data, 20 samples/second\nTime (s),Altitude (ft),Velocity (ft/s),Temp (F),Voltage (V)",
        (t, o) => `${t.toFixed(2)},${Math.round(A(o, t) / FT + rnd() * 2)},${Math.round(V(o, t) / FT)},70,9.1`,
      ),
    });
    out.push({
      name: "rrc3_flight.csv",
      brand: "missileworks",
      truth: sts(early),
      text: write(
        early,
        "Missile Works RRC3 mDACS export\nTime,Altitude,Velocity",
        (t, o) => `${t.toFixed(2)},${Math.round(A(o, t) / FT + rnd() * 2)},${Math.round(V(o, t) / FT)}`,
      ),
    });
    out.push({
      name: "telemetrum-flight-0007.csv",
      brand: "altus",
      truth: sts(normal),
      text: write(
        normal,
        "version,serial,flight,call,time,clock,rssi,lqi,state,state_name,acceleration,pressure,altitude,height,speed",
        (t, o, st) =>
          `2,4321,7,N0CALL,${t.toFixed(2)},0,0,0,${t < st.tb ? 3 : t < st.tApo ? 4 : 6},${t < st.tb ? "boost" : t < st.tApo ? "coast" : "drogue"},${(G(o, t) * 9.80665).toFixed(1)},0,${(A(o, t) + 1300).toFixed(1)},${(A(o, t) + rnd() * 0.6).toFixed(1)},${V(o, t).toFixed(1)}`,
      ),
    });
    out.push({
      name: "BlueRaven_flight.csv",
      brand: "featherweight",
      truth: sts(normal),
      text: write(
        normal,
        "Featherweight Blue Raven\nFlight_Time_(s),Baro_Altitude_AGL_(feet),Velocity_Up,Axial Accel (Gs)",
        (t, o) =>
          `${t.toFixed(3)},${(A(o, t) / FT + rnd()).toFixed(1)},${(V(o, t) / FT).toFixed(1)},${G(o, t).toFixed(2)}`,
      ),
    });
    out.push({
      name: "AltimeterThree flight.csv",
      brand: "jolly",
      truth: sts(early),
      text: write(
        early,
        "Jolly Logic AltimeterThree\nTime (s),Altitude (ft)",
        (t, o) => `${t.toFixed(2)},${Math.round(A(o, t) / FT + rnd() * 2)}`,
      ),
    });
    return out;
  });

  for (const L0 of logs) {
    const r = await p.evaluate(({ text, name }) => {
      const P = altParse(text, name);
      if (P.error) return { err: P.error };
      const C = altCompute(P, P.map);
      if (C.error) return { err: C.error };
      return { brand: P.brand.id, apo: C.apo, vmax: C.vmax, tApo: C.tApo, drogue: C.ev.drogue, est: C.ev.drogueEst };
    }, L0);
    const w = L0.name;
    ok(`${w}: read`, !r.err, r.err);
    if (r.err) continue;
    ok(`${w}: recognized as ${L0.brand}`, r.brand === L0.brand, r.brand);
    ok(`${w}: apogee within 1%`, Math.abs(r.apo / L0.truth.apo - 1) < 0.01, [r.apo, L0.truth.apo]);
    ok(`${w}: top speed within 3%`, Math.abs(r.vmax / L0.truth.vmax - 1) < 0.03, [r.vmax, L0.truth.vmax]);
    const early = L0.truth.tDep < L0.truth.tApo - 0.5;
    if (early) {
      ok(`${w}: charge before apogee found`, r.drogue != null && r.drogue < r.tApo, [r.drogue, r.tApo]);
      ok(`${w}: charge within 0.8 s`, r.drogue != null && Math.abs(r.drogue - L0.truth.tDep) < 0.8, [
        r.drogue,
        L0.truth.tDep,
      ]);
    } else ok(`${w}: no charge before apogee`, r.drogue == null || r.drogue > r.tApo - 0.3, [r.drogue, r.tApo]);
  }

  // the log screen and Flight vs prediction, from the Flight Log's import
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-alt-"));
  const egg = path.join(dir, logs[0].name);
  fs.writeFileSync(egg, logs[0].text);
  await p.evaluate(() => {
    showTab("results");
    flSaveAll({});
    renderFlightLog();
  });
  await p.setInputFiles("#flaltfile", egg);
  await p.waitForTimeout(1500);
  let m = await p.evaluate(() => ({
    open: !document.getElementById("altmodal").hidden,
    title: document.getElementById("alttitle").textContent,
    who: document.querySelectorAll("#altwho .whoopt").length,
    flight: !!document.getElementById("af-delay"),
    btn: document.getElementById("altok").textContent,
  }));
  ok("log screen opens", m.open && m.title === "Altimeter log", m);
  ok("log screen: which rocket flew it", m.who >= 2, m.who);
  ok("log screen: the flight's details", m.flight && m.btn === "Compare", m);
  await p.fill("#af-delay", "3 s");
  await p.click("#altok");
  await p.waitForTimeout(1500);
  m = await p.evaluate(() => ({
    open: !document.getElementById("cmpmodal").hidden,
    rows: [...document.querySelectorAll(".cmpt tbody tr td:first-child")].map((x) => x.textContent),
    early: [...document.querySelectorAll(".cmpban b")].some((b) => /before apogee/.test(b.textContent)),
    chart: !!document.getElementById("cmpcv"),
    save: !!document.querySelector('#cmpbtns [data-c="save"]'),
  }));
  ok("Flight vs prediction opens", m.open, m);
  ok("Flight vs prediction: chart", m.chart);
  ok(
    "Flight vs prediction: events",
    ["Burnout", "Top speed", "Charge", "Highest point"].every((x) => m.rows.includes(x)),
    m.rows,
  );
  ok("Flight vs prediction: charge before apogee", m.early);
  for (const v of ["speed", "all", "alt"]) await p.click(`.cmpseg [data-v="${v}"]`);
  await p.click('#cmpbtns [data-c="save"]');
  await p.waitForTimeout(800);
  m = await p.evaluate(() => ({ n: flList().length, cal: !!document.querySelector('#cmpbtns [data-c="cal"]') }));
  ok("saved to the Flight Log", m.n === 1 && m.cal, m);
  await p.click('#cmpbtns [data-c="close"]');

  // an altimeter's display readings, at its acceleration limit
  await p.evaluate(() => flOpen(null));
  await p.click('#flform [data-tab="readings"]');
  await p.selectOption("#fl-alti", "jl-two");
  await p.dispatchEvent("#fl-alti", "change");
  const tr = logs[0].truth;
  await p.fill("#fr-apo", String(Math.round(tr.apo / 0.3048)));
  await p.fill("#fr-vmax", String(Math.round((tr.vmax / 0.3048) * 0.85)));
  await p.selectOption("#fr-vu", "ft/s");
  await p.dispatchEvent("#fr-vu", "change");
  await p.fill("#fr-peakG", "23.0");
  await p.dispatchEvent("#fr-peakG", "input");
  await p.waitForTimeout(300);
  m = await p.evaluate(() => !document.getElementById("fr-lim").hidden);
  ok("display readings: limit warning", m);
  await p.click("#flsave");
  await p.waitForTimeout(800);
  m = await p.evaluate(() => {
    const f = flList().find((x) => x.readings);
    return f ? { alt: f.readings.alt, apo: f.apo, vmax: f.vmax, vu: f.readings.vUnit } : null;
  });
  ok("display readings saved", m && m.alt === "jl-two" && m.apo > 0 && m.vu === "ft/s", m);
  await p.evaluate(() => fcOpen(flList().find((x) => x.readings)));
  m = await p.evaluate(() =>
    [...document.querySelectorAll(".cmpt tbody tr")].map((r) => [
      r.cells[0].textContent,
      r.className,
      r.cells[3].textContent,
    ]),
  );
  ok(
    "readings at the limit aren't graded",
    m.some((r) => r[0] === "Top speed" && r[1] === "ng" && r[2] === "limit"),
    m,
  );
  await p.click('#cmpbtns [data-c="close"]');

  // a flight with just its apogee
  await p.evaluate(() => {
    flOpen(null);
  });
  await p.click('#flform [data-tab="apo"]');
  await p.fill("#fl-apo", String(Math.round(tr.apo / 0.3048)));
  await p.click("#flsave");
  await p.waitForTimeout(800);
  m = await p.evaluate(() => {
    const f = flList().find((x) => !x.readings && !(x.altis && x.altis.length));
    if (!f) return null;
    fcOpen(f);
    return [...document.querySelectorAll(".cmpt tbody tr td:first-child")].map((x) => x.textContent);
  });
  ok("apogee only compares", m && m.includes("Apogee"), m);
  await p.click('#cmpbtns [data-c="close"]');

  // a log picked with Open design file goes to the Flight Log
  await p.evaluate(() => showTab("rocket"));
  await p.setInputFiles("#orkfile", egg);
  await p.waitForTimeout(1500);
  m = await p.evaluate(() => ({ alt: !document.getElementById("altmodal").hidden, name: D.name }));
  ok("Open design file: a log opens in the Flight Log", m.alt, m);
  await p.evaluate(() => (document.getElementById("altmodal").hidden = true));

  ok("no page errors", !errs.length, errs);
  fs.rmSync(dir, { recursive: true, force: true });
  await browser.close();
  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
