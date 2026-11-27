#!/usr/bin/env node
/*
 * Imported drag profiles (Dustin, Nov 26, 2026): a Cd-against-Mach curve from RASAero II, OpenRocket or a table, to fly
 * with in place of the app's own drag and to compare with it.
 *   - the reader: RASAero II's Aero Plots CSV (zero-angle rows, coasting and burning curves, thinned without losing
 *     its shape), an OpenRocket simulation export (the ascent, straight flight, burning and coasting apart), plain
 *     tables (headings or none; commas, semicolons with decimal commas, spaces), and files it should refuse;
 *   - the flight: a flat profile flies exactly as the same fixed Cd does; more drag flies lower; a reference diameter
 *     scales it; switched off, the app's own drag flies;
 *   - a staged rocket: a fixed Cd and a profile for each airframe it flies as (the whole stack, the sustainer alone;
 *     three on a three-stage), each changing only its own part of the flight, saved in the app's own element,
 *     another program's overrides read as that program means them, and the editor's section for each;
 *   - kept with the design file (the app's own element) and read back, by the flight reader and the builder;
 *   - the block in the builder's Whole Rocket editor (import, the switch, remove, a bad file), the Wind Tunnel
 *     chart's third line, and the Results line;
 *   - the Whole Rocket Cd field's note for each case (calculated, overridden, a profile flown, both);
 *   - the fin fillet radius field, moved from Whole Rocket to each fin set's editor.
 *
 *   node build.js && node tests/drag-profile.js [--html other-build.html]
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
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-12);

// ---- files in each program's shape (made here: no one's design)
const cdOff = (M) => 0.45 + 0.25 * Math.exp(-(((M - 1.05) / 0.18) ** 2)) + 0.08 / (M + 0.2);
const cdOn = (M) => cdOff(M) - 0.03;
let ras =
  "Mach,Alpha,CD,CD Power-Off,CD Power-On,CA Power-Off,CA Power-On,CL,CN,CN Potential,CN Viscous,CNalpha (0 to 4 deg) (per rad),CP,CP (0 to 4 deg),Reynolds Number\n";
for (let i = 1; i <= 2500; i++) {
  const M = i / 100;
  for (const a of [0, 2])
    ras += `${M},${a},${cdOff(M) + a},${cdOff(M) + a},${cdOn(M) + a},${cdOff(M)},${cdOn(M)},0,0,0,0,12,90,90,${M * 6e7}\n`;
}
let ork =
  "# Flight simulation\n# Time (s),Altitude (m),Vertical velocity (m/s),Thrust (N),Mach number (​),Drag coefficient (​),Angle of attack (°)\n# Event LAUNCH occurred at t=0 seconds\n";
for (let i = 0; i <= 400; i++) {
  const t = i * 0.05,
    burn = t < 2,
    M = burn ? 0.6 * t : Math.max(0, 1.2 - 0.07 * (t - 2)),
    alt = burn ? 100 * t * t : 400 + 2000 * (1 - Math.exp(-(t - 2) / 6)),
    aoa = t > 17 ? 20 : 0.5;
  ork += `${t.toFixed(2)},${alt.toFixed(1)},${(M * 340).toFixed(1)},${burn ? 500 : 0},${M.toFixed(4)},${(burn ? cdOn(M) : cdOff(M)).toFixed(5)},${aoa}\n`;
  if (i === 40) ork += "# Event BURNOUT occurred at t=2 seconds\n";
}
// the descent: must not be read
for (let i = 1; i <= 50; i++) ork += `${(20 + i).toFixed(2)},${(2300 - 40 * i).toFixed(1)},-40,0,0.3,9.9,90\n`;

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 412, height: 860 }, hasTouch: true });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    window.PR_NO_ASK = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    sessionStorage.setItem("rfs-splash", "1");
  });
  await p.goto("file://" + html);
  await p.waitForFunction(() => typeof window.openExample === "function");

  // ---- the reader
  const parse = (text, name) =>
    p.evaluate(
      ([text, name]) => {
        try {
          return parseDragProfile(text, name);
        } catch (e) {
          return { error: e.message };
        }
      },
      [text, name || "f.csv"],
    );
  const at = (c, y, M) => {
    let i = 1;
    while (i < c.m.length - 1 && c.m[i] < M) i++;
    return y[i - 1] + ((y[i] - y[i - 1]) * (M - c.m[i - 1])) / (c.m[i] - c.m[i - 1]);
  };
  const r = await parse(ras, "rocket.csv");
  ok(
    "RASAero II: known, with both curves",
    r.src === "RASAero II" && Array.isArray(r.on) && r.name === "rocket.csv",
    r.error || r.src,
  );
  ok(
    "RASAero II: thinned to at most 160 points, Mach 0.01 to 25",
    r.m.length <= 160 && r.m.length > 20 && r.m[0] === 0.01 && r.m[r.m.length - 1] === 25,
    r.m.length,
  );
  let worst = 0;
  for (let M = 0.05; M < 5; M += 0.013)
    worst = Math.max(worst, Math.abs(at(r, r.off, M) - cdOff(M)), Math.abs(at(r, r.on, M) - cdOn(M)));
  ok("RASAero II: the zero-angle rows, and the shape kept within 0.003", worst < 0.003, worst);

  const o = await parse(ork, "sim.csv");
  ok(
    "OpenRocket: known, with burning and coasting curves",
    o.src === "OpenRocket" && Array.isArray(o.on) && /one flight/.test(o.note),
    o.error || o.src,
  );
  ok(
    "OpenRocket: the ascent's speeds only, to its top speed",
    o.m[0] >= 0.05 && o.m[o.m.length - 1] <= 1.21 && o.m[o.m.length - 1] > 1.15,
    [o.m[0], o.m[o.m.length - 1]],
  );
  ok(
    "OpenRocket: coasting Cd read (the descent and the tumble at the top left out)",
    Math.abs(at(o, o.off, 0.9) - cdOff(0.9)) < 0.01 && Math.max(...o.off) < 2,
    at(o, o.off, 0.9),
  );
  ok("OpenRocket: burning Cd read apart", Math.abs(at(o, o.on, 0.9) - cdOn(0.9)) < 0.01, at(o, o.on, 0.9));

  const t1 = await parse("Mach,Cd\n0.1,0.5\n0.5,0.45\n1.0,0.7\n2,0.5\n");
  ok(
    "a table with headings",
    t1.src === "Table" && t1.m.join() === "0.1,0.5,1,2" && t1.off.join() === "0.5,0.45,0.7,0.5" && t1.on === null,
    t1,
  );
  const t2 = await parse("0.1 0.5 0.47\n1.0\t0.7 0.66\n0.5 0.45 0.42\n");
  ok(
    "no headings, spaces, out of order, a third column for the motor burning",
    t2.m.join() === "0.1,0.5,1" && t2.on && t2.on.join() === "0.47,0.42,0.66",
    t2,
  );
  const t3 = await parse("Mach;CD power off;CD power on\n0,5;0,45;0,40\n1,0;0,70;0,65\n");
  ok(
    "semicolons with decimal commas, named columns",
    t3.m.join() === "0.5,1" && t3.off.join() === "0.45,0.7" && t3.on.join() === "0.4,0.65",
    t3,
  );
  const t4 = await parse("# from my CFD\nCd_on,Mach,Cd\n0.4,0.5,0.45\n0.65,1,0.7\n");
  ok(
    "columns in any order, by their headings; comment lines passed over",
    t4.m.join() === "0.5,1" && t4.off.join() === "0.45,0.7" && t4.on.join() === "0.4,0.65",
    t4,
  );
  for (const [what, text] of [
    ["an empty file", ""],
    ["one row", "Mach,Cd\n1,0.5\n"],
    ["words", "hello there\nthis is not a table\n"],
    ["one column", "0.1\n0.2\n0.3\n"],
  ])
    ok(`refused, with a reason: ${what}`, typeof (await parse(text)).error === "string", await parse(text));

  // ---- the flight
  await p.evaluate(async () => {
    const l = document.getElementById("legal");
    if (l) l.hidden = true;
    setUnits("imp");
    await openExample(2);
  });
  const fly = (settings) =>
    p.evaluate(async (settings) => {
      Object.assign(BLD.settings, { cdCurve: null, cdOverride: 0 }, settings);
      if (settings.cdOverride) BLD.settings.cdOverrideOn = true;
      else delete BLD.settings.cdOverrideOn;
      bldChanged(true);
      await runNow();
      const s = lastSim.st;
      return {
        apogee: s.apogee ?? s.maxAlt ?? s.apo,
        vmax: s.maxV,
        curve: !!aero(D).curve,
        cd: cdParts(aero(D), 100, atmosphere(L, 0)).cd,
        st: Object.keys(s).slice(0, 0),
      };
    }, settings);
  const flat = { src: "Table", name: "flat", m: [0, 5], off: [0.6, 0.6], on: null, refD: 0, use: true, note: "" };
  const own = await fly({});
  const fl = await fly({ cdCurve: flat });
  ok("the app's own drag flies when there is no profile", own.apogee > 0 && !own.curve, own);
  ok("a profile is flown: Cd read off it", fl.curve && near(fl.cd, 0.6, 1e-9), fl);
  const fx = await p.evaluate(async () => {
    // the same fixed Cd, by the design file's own override
    const A = aero({ ...D, cdCurve: null, cdOverride: 0.6 }),
      B = aero(D),
      atm = atmosphere(L, 0);
    return [50, 200, 400].map((v) => [cdParts(A, v, atm).cd, cdParts(B, v, atm).cd, cdParts(B, v, atm, 1e-3).cd]);
  });
  ok(
    "a flat profile is the same drag as that fixed Cd, burning or not",
    fx.every(([a, b, c]) => near(a, b, 1e-12) && near(a, c, 1e-12)),
    fx,
  );
  const hi = await fly({ cdCurve: { ...flat, off: [1.2, 1.2] } });
  ok("twice the Cd flies lower", hi.apogee < 0.9 * fl.apogee, [hi.apogee, fl.apogee]);
  const two = await fly({ cdCurve: { ...flat, m: [0, 0.2, 5], off: [0.6, 0.6, 0.6], on: [0.3, 0.3, 0.3] } });
  ok("the motor-burning curve is used while it burns (less drag, higher)", two.apogee > fl.apogee, [
    two.apogee,
    fl.apogee,
  ]);
  const dia = await p.evaluate(() => D.diameter);
  const ref = await fly({ cdCurve: { ...flat, refD: dia * 2 } });
  ok("a reference diameter twice the body's makes four times the Cd", near(ref.cd, 2.4, 1e-6), ref.cd);
  const off = await fly({ cdCurve: { ...flat, use: false } });
  ok("switched off, the app's own drag flies again", !off.curve && near(off.apogee, own.apogee, 1e-9), [
    off.apogee,
    own.apogee,
  ]);
  const ends = await p.evaluate(() => {
    const A = aero({ ...D, cdCurve: { m: [0.5, 1], off: [0.4, 0.8], on: null, refD: 0, use: true } }),
      atm = atmosphere(L, 0),
      cd = (M) => cdParts(A, M * atm.a, atm).cd;
    return [
      cd(0.1),
      cd(0.75),
      cd(3),
      !!aero({ ...D, twoStage: true, cdCurve: { m: [0.5, 1], off: [0.4, 0.8], use: true } }).curve,
    ];
  });
  ok(
    "straight lines between points, the end values outside them",
    near(ends[0], 0.4, 1e-9) && near(ends[1], 0.6, 1e-9) && near(ends[2], 0.8, 1e-9),
    ends,
  );
  ok("a staged design's own profile is the sustainer's", ends[3] === true, ends);

  // ---- a staged rocket: each airframe it flies as has its own fixed Cd and its own profile (Nov 27, 2026)
  const H128 = "a-5f4294d20002e9000000000d"; // AeroTech H128W, 29 mm
  const addStage = () =>
    p.evaluate((H128) => {
      bldRender();
      if (!document.querySelector('[data-stage="add"]')) document.querySelector(".bldaddtoggle").click();
      document.querySelector('[data-stage="add"]').click();
      setBoostId(H128);
    }, H128);
  // the drag of each airframe at Mach 0.3 and whether a profile gives it, and the flight
  const stg = (settings) =>
    p.evaluate(async (settings) => {
      const off = {};
      for (const x of ["", "2", "3"]) Object.assign(off, { ["cdCurve" + x]: null, ["cdOverride" + x]: 0 });
      Object.assign(BLD.settings, off, settings);
      for (const x of ["", "2", "3"])
        if (settings["cdOverride" + x]) BLD.settings["cdOverride" + x + "On"] = true;
        else delete BLD.settings["cdOverride" + x + "On"];
      bldChanged(true);
      await runNow();
      const atm = atmosphere(L, 0),
        at = (Dx) => {
          const A = aero(Dx);
          return { cd: cdParts(A, 0.3 * atm.a, atm).cd, curve: !!A.curve };
        };
      return {
        sus: at(D),
        stack: at(fullStack(D)),
        mid: D.threeStage ? at(stackDesign(D)) : null,
        apogee: lastSim.st.maxAlt,
        xml: bldToOrk(BLD, L),
      };
    }, settings);
  await addStage();
  const s0 = await stg({});
  ok(
    "two-stage, nothing set: both airframes on this app's model",
    !s0.sus.curve && !s0.stack.curve && s0.apogee > 0,
    s0.sus,
  );
  ok("the stack has more drag than the sustainer alone", s0.stack.cd > s0.sus.cd, [s0.stack.cd, s0.sus.cd]);
  ok("nothing of it written to the file", !/prflstackdrag|overridecd|prflcdcurve/.test(s0.xml));
  const sS = await stg({ cdOverride: 1.5 });
  ok(
    "a fixed Cd for the sustainer alone leaves the stack's drag as it was",
    near(sS.sus.cd, 1.5, 1e-9) && near(sS.stack.cd, s0.stack.cd, 1e-9) && sS.apogee < 0.9 * s0.apogee,
    [sS.sus.cd, sS.stack.cd, s0.stack.cd, sS.apogee, s0.apogee],
  );
  const sK = await stg({ cdOverride2: 1.5 });
  ok(
    "a fixed Cd for the whole stack leaves the sustainer's drag as it was",
    near(sK.stack.cd, 1.5, 1e-9) && near(sK.sus.cd, s0.sus.cd, 1e-9) && sK.apogee < s0.apogee,
    [sK.stack.cd, sK.sus.cd, s0.sus.cd, sK.apogee, s0.apogee],
  );
  ok("the two change the flight differently", !near(sK.apogee, sS.apogee, 1e-3), [sK.apogee, sS.apogee]);
  ok(
    "the stack's is written in the app's own element on the booster stage, the sustainer's not",
    /<prflstackdrag>\{&quot;cd&quot;:1\.5\}<\/prflstackdrag>/.test(sK.xml) && !/<overridecd>/.test(sK.xml),
    (sK.xml.match(/<prflstackdrag>[^<]*/) || [])[0],
  );
  const sP = await stg({ cdCurve2: flat });
  ok(
    "a profile for the whole stack: the stack reads its Cd off it, the sustainer does not",
    sP.stack.curve && near(sP.stack.cd, 0.6, 1e-9) && !sP.sus.curve && near(sP.sus.cd, s0.sus.cd, 1e-9),
    [sP.stack, sP.sus],
  );
  const sPf = await stg({ cdOverride2: 0.6 });
  ok("a flat stack profile flies as the same fixed stack Cd does", near(sP.apogee, sPf.apogee, 1e-9), [
    sP.apogee,
    sPf.apogee,
  ]);
  const sQ = await stg({ cdCurve: flat });
  ok(
    "a profile for the sustainer alone: only the sustainer reads it",
    sQ.sus.curve && near(sQ.sus.cd, 0.6, 1e-9) && !sQ.stack.curve && near(sQ.stack.cd, s0.stack.cd, 1e-9),
    [sQ.sus, sQ.stack],
  );
  const sB = await stg({ cdCurve: flat, cdCurve2: { ...flat, off: [0.9, 0.9], name: "stack" }, cdOverride2: 2 });
  ok(
    "a profile beats a fixed Cd on the same airframe; both airframes on profiles",
    near(sB.stack.cd, 0.9, 1e-9) && near(sB.sus.cd, 0.6, 1e-9),
    [sB.stack.cd, sB.sus.cd],
  );
  const back = await p.evaluate((xml) => {
    const d = parseOrk(xml),
      b = bldFromOrk(xml).settings,
      pick = (o) => [
        o.cdCurve && o.cdCurve.name,
        o.cdCurve2 && o.cdCurve2.name,
        o.cdOverride2,
        o.cdCurve3,
        o.cdOverride3,
      ];
    return {
      flight: pick(d.design),
      builder: pick(b),
      on: bldOvOn(b, "cdOverride2"),
      notes: (d.notes || []).join(" | "),
    };
  }, sB.xml);
  ok(
    "saved and read back, by the flight reader and the builder",
    JSON.stringify(back.flight) === JSON.stringify(["flat", "stack", 2, null, 0]) &&
      JSON.stringify(back.builder) === JSON.stringify(back.flight) &&
      back.on,
    back,
  );
  // another program's files
  const other = await p.evaluate((xml) => {
    const cd = (x) => {
      const d = parseOrk(x),
        b = bldFromOrk(x).settings;
      return {
        f: [d.design.cdOverride, d.design.cdOverride2],
        b: [b.cdOverride, b.cdOverride2],
        notes: (d.notes || []).join(" | "),
      };
    };
    const stages = xml.split("<stage>");
    return {
      n: stages.length - 1,
      // OpenRocket's override on the rocket itself, on the top stage, and on the booster stage
      rocket: cd(xml.replace("<subcomponents><stage>", "<overridecd>0.7</overridecd><subcomponents><stage>")),
      top: cd([stages[0], "<overridecd>0.7</overridecd>" + stages[1], stages[2]].join("<stage>")),
      low: cd([stages[0], stages[1], "<overridecd>0.7</overridecd>" + stages[2]].join("<stage>")),
    };
  }, s0.xml);
  ok("the saved file has its two stages", other.n === 2, other.n);
  ok(
    "OpenRocket's Cd override on the rocket itself is every airframe's",
    JSON.stringify(other.rocket.f) === "[0.7,0.7]" && JSON.stringify(other.rocket.b) === "[0.7,0.7]",
    other.rocket,
  );
  ok(
    "on the top stage it is the sustainer's only",
    JSON.stringify(other.top.f) === "[0.7,0]" && JSON.stringify(other.top.b) === "[0.7,0]",
    other.top,
  );
  ok(
    "on a lower stage it is passed over, and the notes say so",
    JSON.stringify(other.low.f) === "[0,0]" &&
      JSON.stringify(other.low.b) === "[0,0]" &&
      /lower stage/i.test(other.low.notes),
    other.low,
  );

  // the editor: a drag section for each airframe, in the order they fly
  await stg({});
  await p.evaluate(() => showTab("rocket"));
  await p.locator("#bldtree .bldrow.stage", { hasText: "Whole Rocket" }).first().click();
  await p.waitForTimeout(300);
  const ed = () =>
    p.evaluate(() => {
      const note = (id) => {
        const el = document.getElementById(id);
        return el ? el.closest(".fld").querySelector(".fldnote").textContent : null;
      };
      const heads = [...document.querySelectorAll("#bldedit .bldh, #bldeditor .bldh, .bldh")]
        .map((h) => h.textContent)
        .filter((t) => /^Drag: /.test(t));
      const a = document.getElementById("bf-cdOverride2"),
        b = document.getElementById("bf-cdOverride");
      return {
        heads,
        order: !!a && !!b && !!(a.compareDocumentPosition(b) & 4),
        blocks: ["dragprof", "dragprof2", "dragprof3"].map((id) => !!document.getElementById(id)),
        n1: note("bf-cdOverride"),
        n2: note("bf-cdOverride2"),
        n3: note("bf-cdOverride3"),
        none2: (document.getElementById("dragnone2") || {}).textContent || "",
        warn: [...document.querySelectorAll(".bldwarn, .fldwarn, .note.warn")].map((x) => x.textContent).join(" | "),
      };
    });
  const e0 = await ed();
  ok(
    "two-stage Whole Rocket: the stack's drag, then the sustainer's, each with a Cd and a profile block",
    e0.heads.length === 2 &&
      /whole stack, before separation/.test(e0.heads[0]) &&
      /sustainer alone/.test(e0.heads[1]) &&
      e0.order,
    e0.heads,
  );
  ok("no third airframe on a two-stage", e0.blocks[0] && e0.blocks[1] && !e0.blocks[2] && e0.n3 === null, e0.blocks);
  ok(
    "each Cd says which airframe this app's model calculated it for",
    /drag model, for the whole stack\./.test(e0.n2) && /drag model, for the sustainer alone\./.test(e0.n1),
    [e0.n2, e0.n1],
  );
  ok("the stack's import line asks for the stack's file", /for the whole stack/.test(e0.none2), e0.none2);
  fs.mkdirSync(path.join(os.tmpdir(), "dragprof-st"), { recursive: true });
  const stFile = path.join(os.tmpdir(), "dragprof-st", "stack.txt");
  fs.writeFileSync(stFile, "Mach Cd\n0.1 0.9\n3 0.9\n");
  await p.setInputFiles("#dragfile2", stFile);
  await p.waitForTimeout(800);
  const e1 = await ed();
  const d1 = await p.evaluate(() => ({
    two: BLD.settings.cdCurve2 && BLD.settings.cdCurve2.name,
    one: BLD.settings.cdCurve,
    stack: !!aero(fullStack(D)).curve,
    sus: !!aero(D).curve,
  }));
  ok(
    "a file imported in the stack's block is the stack's profile only",
    d1.two === "stack.txt" && d1.one === null && d1.stack && !d1.sus,
    d1,
  );
  ok(
    "its Cd field says the whole stack flies on the profile; the sustainer's still says calculated",
    /^The whole stack flies on the imported drag profile below \(Table\)/.test(e1.n2) &&
      /^Calculated from the design/.test(e1.n1),
    [e1.n2, e1.n1],
  );
  await p.evaluate(async () => {
    await runNow();
    showTab("results");
  });
  await p.waitForTimeout(300);
  const r1 = await p.evaluate(() => document.getElementById("dragref").textContent);
  ok(
    "the Results tab says which airframe flew on imported drag",
    /imported drag, not this app’s drag model, for the whole stack \(Table, stack\.txt\)\./.test(r1) &&
      !/sustainer alone \(/.test(r1),
    r1,
  );
  await p.evaluate(() => showTab("rocket"));
  await p.locator("#draguse2").uncheck();
  await p.waitForTimeout(500);
  ok("unticked, the stack flies on this app's model again", !(await p.evaluate(() => !!aero(fullStack(D)).curve)));
  await p.locator("#dragdel2").click();
  await p.waitForTimeout(500);
  ok("removed", (await p.evaluate(() => BLD.settings.cdCurve2)) === null);
  fs.rmSync(path.join(os.tmpdir(), "dragprof-st"), { recursive: true, force: true });

  // three stages: three airframes
  await addStage();
  await p.evaluate((H128) => setFirstId(H128), H128);
  const g0 = await stg({});
  const g3 = await stg({ cdOverride3: 1.5 });
  const g2 = await stg({ cdOverride2: 1.5 });
  ok(
    "three-stage: a fixed Cd for all three stages changes only that airframe",
    near(g3.stack.cd, 1.5, 1e-9) &&
      near(g3.mid.cd, g0.mid.cd, 1e-9) &&
      near(g3.sus.cd, g0.sus.cd, 1e-9) &&
      g3.apogee < g0.apogee,
    [g3.stack.cd, g3.mid.cd, g0.mid.cd, g3.sus.cd, g0.sus.cd],
  );
  ok(
    "and one for the upper two stages only theirs",
    near(g2.mid.cd, 1.5, 1e-9) &&
      near(g2.stack.cd, g0.stack.cd, 1e-9) &&
      near(g2.sus.cd, g0.sus.cd, 1e-9) &&
      g2.apogee < g0.apogee,
    [g2.mid.cd, g2.stack.cd, g0.stack.cd],
  );
  const g5 = await stg({ cdOverride3: 1.1, cdCurve2: flat, cdOverride: 0.8 });
  const back3 = await p.evaluate((xml) => {
    const d = parseOrk(xml).design,
      b = bldFromOrk(xml).settings,
      pick = (o) => [o.cdOverride, o.cdCurve2 && o.cdCurve2.name, o.cdOverride2, o.cdOverride3];
    return [pick(d), pick(b)];
  }, g5.xml);
  ok(
    "all three saved and read back",
    back3.every((x) => JSON.stringify(x) === JSON.stringify([0.8, "flat", 0, 1.1])),
    back3,
  );
  await stg({});
  await p.evaluate(() => showTab("rocket"));
  await p.locator("#bldtree .bldrow.stage", { hasText: "Whole Rocket" }).first().click();
  await p.waitForTimeout(300);
  const e3 = await ed();
  ok(
    "three-stage Whole Rocket: all three stages, the upper two, the sustainer alone",
    e3.heads.length === 3 &&
      /all three stages/.test(e3.heads[0]) &&
      /upper two stages/.test(e3.heads[1]) &&
      /sustainer alone, after the last separation/.test(e3.heads[2]) &&
      e3.blocks.every(Boolean),
    e3.heads,
  );
  // back to the single-stage example for the rest
  await p.evaluate(async () => {
    await openExample(2);
  });

  // ---- kept with the design file
  const kept = await p.evaluate((flat) => {
    BLD.settings.cdCurve = {
      ...flat,
      m: [0, 1, 5],
      off: [0.6, 0.7, 0.5],
      on: [0.55, 0.65, 0.45],
      refD: 0.1,
      note: "n",
    };
    bldChanged(true);
    const xml = bldToOrk(BLD, L);
    return {
      tag: /<prflcdcurve>/.test(xml),
      flight: parseOrk(xml).design.cdCurve,
      builder: bldFromOrk(xml).settings.cdCurve,
      want: BLD.settings.cdCurve,
      bad: readCdCurve('{"m":[1,0.5],"off":[1,1]}'),
      junk: readCdCurve("not json"),
    };
  }, flat);
  ok("saved in the design file in the app's own element", kept.tag);
  ok("read back by the flight reader", JSON.stringify(kept.flight) === JSON.stringify(kept.want), kept.flight);
  ok("read back by the builder", JSON.stringify(kept.builder) === JSON.stringify(kept.want), kept.builder);
  ok("a damaged one in a file is passed over", kept.bad === null && kept.junk === null, [kept.bad, kept.junk]);

  // ---- the Whole Rocket block, the Wind Tunnel's chart and the Results line
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dragprof-"));
  fs.writeFileSync(path.join(tmp, "rocket.csv"), ras);
  fs.writeFileSync(path.join(tmp, "notes.txt"), "hello there\nthis is not a table\n");
  fs.writeFileSync(path.join(tmp, "cfd.txt"), "Mach Cd\n0.3 0.5\n0.9 0.55\n1.1 0.8\n");
  await fly({});
  await p.evaluate(() => showTab("rocket"));
  await p.locator('[data-fold="wtbody"]').scrollIntoViewIfNeeded();
  await p.locator('[data-fold="wtbody"]').click();
  await p.waitForTimeout(500);
  // the block is in the builder's Whole Rocket editor, under the drag coefficients
  await p.locator("#bldtree .bldrow.stage", { hasText: "Whole Rocket" }).first().click();
  await p.waitForTimeout(300);
  const place = await p.evaluate(() => {
    const cd = document.getElementById("bf-cdOverride"),
      blk = document.getElementById("dragprof"),
      bl = document.getElementById("bf-blMode");
    return (
      !!cd &&
      !!blk &&
      !!(cd.compareDocumentPosition(blk) & 4) &&
      !!(bl.compareDocumentPosition(blk) & 4) &&
      !document.querySelector("#wtbody #dragprof")
    );
  });
  ok("the block is in Whole Rocket, after the drag coefficients (and not in the Wind Tunnel)", place);
  const ui = () =>
    p.evaluate(() => ({
      have: !!document.getElementById("draginfo"),
      info: (document.getElementById("draginfo") || {}).textContent || "",
      err: document.getElementById("dragerr").hidden ? "" : document.getElementById("dragerr").textContent,
      use: !!(document.getElementById("draguse") || {}).checked,
      refRow: !!document.getElementById("dragrefrow"),
      legend: document.getElementById("wtc-cd").textContent,
      curve: !!(D.cdCurve && aero(D).curve),
      src: D.cdCurve && D.cdCurve.src,
    }));
  const u0 = await ui();
  ok(
    "with no profile: only the import button, two lines on the chart",
    !u0.have && !/Imported profile|This app’s model/.test(u0.legend),
    u0,
  );
  await p.setInputFiles("#dragfile", path.join(tmp, "rocket.csv"));
  await p.waitForTimeout(800);
  const u1 = await ui();
  ok(
    "importing a RASAero II file: named, flown, and told",
    u1.have &&
      u1.use &&
      u1.curve &&
      /RASAero II, rocket\.csv: \d+ points, Mach 0\.01 to 25\.00, coasting and motor-burning/.test(u1.info),
    u1.info,
  );
  ok(
    "the chart gains this app's own model as a third line",
    /This app’s model/.test(u1.legend) && /imported drag profile/.test(u1.legend),
    u1.legend.slice(0, 200),
  );
  ok("no reference diameter asked of a RASAero II file", !u1.refRow);
  await p.locator("#draguse").uncheck();
  await p.waitForTimeout(500);
  const u2 = await ui();
  ok(
    "unticked: not flown, and the chart shows the profile as the third line",
    !u2.curve && !u2.use && /Imported profile/.test(u2.legend),
    u2.legend.slice(0, 200),
  );
  await p.locator("#draguse").check();
  await p.waitForTimeout(300);
  await p.evaluate(async () => {
    await runNow();
    showTab("results");
  });
  await p.waitForTimeout(300);
  const res = await p.evaluate(() => ({
    hidden: document.getElementById("dragref").hidden,
    txt: document.getElementById("dragref").textContent,
  }));
  ok(
    "the Results tab says the flight used it",
    !res.hidden && /imported drag profile \(RASAero II, rocket\.csv\)/.test(res.txt),
    res,
  );
  await p.evaluate(() => showTab("rocket"));
  await p.setInputFiles("#dragfile", path.join(tmp, "notes.txt"));
  await p.waitForTimeout(500);
  const u3 = await ui();
  ok(
    "a file that isn't a table: told why, and the profile in place is kept",
    /Couldn’t read a drag profile from notes\.txt/.test(u3.err) && u3.src === "RASAero II",
    u3.err,
  );
  await p.setInputFiles("#dragfile", path.join(tmp, "cfd.txt"));
  await p.waitForTimeout(800);
  const u4 = await ui();
  ok(
    "a CFD table replaces it, and its reference diameter can be given",
    u4.src === "Table" && u4.refRow && u4.err === "" && /one curve/.test(u4.info),
    u4,
  );
  await p.fill("#dragrefd", "8");
  await p.locator("#dragrefd").dispatchEvent("change");
  await p.waitForTimeout(500);
  ok(
    "the reference diameter is taken in the units shown (8 in)",
    near(await p.evaluate(() => D.cdCurve.refD), 0.2032, 1e-6),
    await p.evaluate(() => D.cdCurve.refD),
  );
  await p.locator("#dragdel").click();
  await p.waitForTimeout(500);
  const u5 = await ui();
  ok("Remove takes it off: the app's own drag again", !u5.have && !u5.curve && u5.src == null, u5);
  await p.evaluate(async () => {
    await runNow();
  });
  ok("and the Results line goes", await p.evaluate(() => document.getElementById("dragref").hidden));

  // ---- the Cd field says which drag the flights use (Nov 27, 2026)
  await p.evaluate(() => showTab("rocket"));
  await p.locator("#bldtree .bldrow.stage", { hasText: "Whole Rocket" }).first().click();
  await p.waitForTimeout(300);
  const cdNote = () =>
    p.evaluate(() => ({
      n: document.getElementById("bf-cdOverride").closest(".fld").querySelector(".fldnote").textContent,
      line: [...document.querySelectorAll(".bldfnote")]
        .map((e) => e.textContent)
        .filter((t) => /whole rocket’s drag/.test(t)),
    }));
  let cn = await cdNote();
  ok(
    "Cd field, nothing set: calculated by the app's drag model, shown at Mach 0.3",
    /Calculated from the design by this app’s drag model\. Shown at Mach 0\.3/.test(cn.n) && cn.line.length === 0,
    cn,
  );
  await p.locator("#bfo-cdOverride").evaluate((e) => e.click());
  await p.waitForTimeout(300);
  await p.fill("#bf-cdOverride", "0.6");
  await p.locator("#bf-cdOverride").dispatchEvent("change");
  await p.waitForTimeout(400);
  cn = await cdNote();
  ok(
    "Cd field, overridden: your value at every speed, with the app's own figure",
    /Your value: flights use this Cd at every speed\. This app’s own drag model gives [\d.]+ at Mach 0\.3/.test(cn.n),
    cn.n,
  );
  ok(
    "and a line says finish, other drag and boundary layer don't count",
    cn.line.length === 1 && /^Your fixed Cd/.test(cn.line[0]),
    cn.line,
  );
  await p.setInputFiles("#dragfile", path.join(tmp, "rocket.csv"));
  await p.waitForTimeout(800);
  cn = await cdNote();
  ok(
    "Cd field, overridden with a profile flown: the override is not used",
    /^Not used: flights use the imported drag profile below \(RASAero II\)\. Untick Fly with this profile/.test(cn.n) &&
      /^The imported drag profile/.test(cn.line[0] || ""),
    cn,
  );
  await p.locator("#bfo-cdOverride").evaluate((e) => e.click());
  await p.waitForTimeout(400);
  cn = await cdNote();
  const ownShown = await p.evaluate(() => {
    const A = aero({ ...D, cdOverride: 0, cdCurve: null }),
      atm = atmosphere(L, 0);
    return [document.getElementById("bf-cdOverride").value, cdParts(A, 0.3 * atm.a, atm).cd];
  });
  ok(
    "Cd field, profile flown: says so, and shows the app's own Cd (not the profile's)",
    /^Flights use the imported drag profile below \(RASAero II\), not this app’s drag model/.test(cn.n) &&
      Math.abs(+ownShown[0] - ownShown[1]) < 1e-3,
    [cn.n, ownShown],
  );
  await p.locator("#draguse").uncheck();
  await p.waitForTimeout(400);
  cn = await cdNote();
  ok(
    "Cd field, profile kept but not flown: calculated from the design again",
    /^Calculated from the design by this app’s drag model/.test(cn.n) && cn.line.length === 0,
    cn,
  );
  await p.locator("#dragdel").click();
  await p.waitForTimeout(400);

  // ---- the fin fillet radius is edited with a fin set, not under Whole Rocket (moved Nov 26, 2026)
  await p.evaluate(() => showTab("rocket"));
  ok("Whole Rocket no longer has the fin fillet radius", (await p.locator("#bf-finFillet").count()) === 0);
  await p.evaluate(() => {
    const fins = BLD.stages[0].parts.flatMap((q) => q.kids || []).find((k) => k.type === "fins");
    document.querySelector(`#bldtree [data-id="${fins.id}"]`).click();
  });
  await p.waitForTimeout(300);
  ok("a fin set's editor has it", (await p.locator("#bf-finFillet").count()) === 1);
  await p.fill("#bf-finFillet", "0.5");
  await p.locator("#bf-finFillet").dispatchEvent("change");
  await p.waitForTimeout(400);
  const fil = await p.evaluate(() => ({
    set: BLD.settings.finFillet,
    xml: /<filletradius>0\.0127<\/filletradius>/.test(bldToOrk(BLD, L)),
  }));
  ok(
    "typing 0.5 in there sets the rocket's fillet radius, saved on the fin set",
    Math.abs(fil.set - 0.0127) < 1e-9 && fil.xml,
    fil,
  );
  await p.fill("#bf-finFillet", "");
  await p.locator("#bf-finFillet").dispatchEvent("change");
  await p.waitForTimeout(300);
  ok("cleared, the file's own is left", await p.evaluate(() => BLD.settings.finFillet === undefined));

  ok("no page errors", errs.length === 0, errs);
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
