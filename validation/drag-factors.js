#!/usr/bin/env node
/*
 * Where the apogee error of the measured flights sits (validation/cases.js, FLIGHTS): for each flight, the factor k
 * on the whole rocket's drag (Cd × k at every speed) that makes the app's apogee match the measurement, compared as
 * validation/flights.js compares it (barometric flights as the altimeter reads). 1 means the drag is right; above
 * 1, the rocket needs more drag than the model gives it.
 *
 *   node build.js && node validation/drag-factors.js
 *
 * Columns: k as entered; k with the placeholder wall replaced by 3 mm aluminium (the skin stays cooler, so friction
 * is higher); k with rounded fins flown as square ones. Then the averages for the rockets with rounded fins and
 * for the rest. Takes about three minutes.
 */
"use strict";
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const { IN, FT, MPH, flightOrk, FLIGHTS } = require("./cases.js");
const eng = fs.readFileSync(path.join(__dirname, "flight-motors.eng"), "utf8");
(async () => {
  const b = await chromium.launch(),
    p = await b.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => (window.PR_EXPOSE = true));
  await p.goto("file://" + path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));
  await p.waitForFunction(() => typeof window.simulate === "function");
  const motors = await p.evaluate(
    (eng) => parseEng(eng).map((m) => ({ name: m.name, mfr: m.mfr, totalMass: m.totalMass, len: m.len })),
    eng,
  );
  const out = [];
  for (const f of FLIGHTS) {
    const mo = motors.find((m) => m.name === f.motor && m.mfr === f.mfr);
    const edges = f.parts
      .filter((q) => q.fins)
      .map(
        (q) =>
          q.fins.edge +
          (q.fins.le > 0 || q.fins.te > 0 ? `(bevel ${q.fins.le || 0}/${q.fins.te || 0} on ${q.fins.t} in)` : ""),
      );
    const baroMeas = /barometric/.test(f.how);
    const row = {
      title: f.title,
      how: f.how,
      meas: f.meas,
      edges: edges.join(", "),
      tail: f.parts.some((q) => q.t === "tail" && q.d1 < q.d0),
    };
    for (const [variant, xml0] of [
      ["entered", flightOrk(f, mo)],
      [
        "square",
        flightOrk(f, mo).replace(/<crosssection>rounded<\/crosssection>/g, "<crosssection>square</crosssection>"),
      ],
    ]) {
      if (variant === "square" && !/rounded/.test(row.edges)) {
        row.square = null;
        continue;
      }
      const r = await p.evaluate(
        async ({ xml, eng, f, IN, FT, MPH, baroMeas }) => {
          window.PR_NO_ASK = false;
          L = defaultLaunch();
          siteCur = "";
          if (!(await loadDesignXml(xml, f.title + ".ork", new TextEncoder().encode(xml).buffer, {})))
            return { err: "open" };
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
          D.nozzleDia = f.noz > 0 ? f.noz * IN : 0;
          D.noseTip = f.nose.tip > 0 ? f.nose.tip * IN : 0;
          const m = parseEng(eng).find((x) => x.name === f.motor && x.mfr === f.mfr);
          m.id = "flight-" + m.name;
          const rep = (k, Dx) => {
            const st = simulate({ ...(Dx || D), dragScale: k }, L, m, null, { noRef: true }).st;
            return { ft: (baroMeas ? baroReading(L, st.maxAlt) : st.maxAlt) / FT, mach: st.maxMach };
          };
          const solve = (Dx) => {
            let lo = 0.3,
              hi = 3;
            for (let i = 0; i < 20; i++) {
              const k = (lo + hi) / 2;
              if (rep(k, Dx).ft > f.meas) lo = k;
              else hi = k;
            }
            return (lo + hi) / 2;
          };
          const at1 = rep(1);
          const wall = D.wall;
          return { k: solve(), app: at1.ft, mach: at1.mach, wall, kAl: solve({ ...D, wall: { t: 0.003, rho: 2700 } }) };
        },
        { xml: xml0, eng, f, IN, FT, MPH, baroMeas },
      );
      if (r.err) throw new Error(f.title + " " + r.err);
      if (variant === "entered") Object.assign(row, { k: r.k, app: r.app, mach: r.mach, wall: r.wall, kAl: r.kAl });
      else row.square = r.k;
    }
    out.push(row);
    process.stderr.write(".");
  }
  await b.close();
  out.sort((a, b) => a.mach - b.mach);
  const s = (x) => (x == null ? "    —" : x.toFixed(2).padStart(5));
  console.log("\nflight".padEnd(44) + " Mach  err%    k   k(Al) k(sq)  fins / how");
  for (const r of out)
    console.log(
      `${r.title.slice(0, 42).padEnd(42)} ${r.mach.toFixed(2)} ${((100 * (r.app - r.meas)) / r.meas).toFixed(1).padStart(5)} ${s(r.k)} ${s(r.kAl)} ${s(r.square)}  ${r.edges}${r.tail ? " +boattail" : ""} / ${r.how}`,
    );
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length,
    line = (name, sel, key = "k") =>
      sel.length &&
      console.log(
        `  ${name.padEnd(34)} ${String(sel.length).padStart(2)} flights   mean ${mean(sel.map((r) => r[key])).toFixed(2)}   ${Math.min(...sel.map((r) => r[key])).toFixed(2)} to ${Math.max(...sel.map((r) => r[key])).toFixed(2)}`,
      );
  const rd = out.filter((r) => /rounded/.test(r.edges)),
    ot = out.filter((r) => !/rounded/.test(r.edges));
  console.log("\ndrag factor needed:");
  line("rounded fins", rd);
  line("rounded fins, flown as square", rd, "square");
  line("other fins", ot);
  line(
    "other fins, above Mach 1.2",
    ot.filter((r) => r.mach >= 1.2),
  );
  line("all", out);
  line("all, 3 mm aluminium wall", out, "kAl");
})();
