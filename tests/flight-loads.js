#!/usr/bin/env node
/*
 * Flight loads (Dustin, Nov 26, 2026): the shear force and bending moment along the rocket.
 *   - the method against closed forms: a uniform free rod pushed sideways at one end bends most 2/3 of the way
 *     along, by 4·F·L/27; pushed at its middle it only moves sideways, bending F·L/8 there;
 *   - the balance closes on a real design (shear and bending back to zero at the tail), the side forces add up to
 *     the flight's own normal force, and the weights add up to the rocket's weight and CG;
 *   - the Results tab's panel: starts folded with its summary, opens, follows the moment and the angle of attack
 *     chosen (a gust, a set angle, as flown), and shows in the units chosen;
 *   - a coupler in the builder is marked; a staged rocket is told it isn't covered; the Wind Tunnel shows the figure.
 *
 *   node build.js && node tests/flight-loads.js [--html other-build.html]
 */
"use strict";
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

  // ---- the method against closed forms
  const rod = await p.evaluate(() => {
    const Lr = 2,
      F = 10,
      D = { length: Lr, dryMass: 3, cgEmpty: 1, massPts: [{ m: 3, x: 1, len: 2 }], motorOverhang: 0 },
      W = massLine(D, null),
      end = shearAndBending(W, [{ F, x: Lr - 1e-9 }]),
      mid = shearAndBending(W, [{ F, x: Lr / 2 }]);
    return {
      total: W.total,
      cg: W.cg,
      inertia: W.inertia,
      end: { peak: end.peak, res: end.residual, tail: end.shear[end.shear.length - 1] },
      mid: { peak: mid.peak, res: mid.residual, turn: mid.turn, lat: mid.lat },
    };
  });
  ok(
    "a uniform rod's weight, CG and inertia (M·L²/12)",
    near(rod.total, 3, 1e-9) && near(rod.cg, 1, 1e-9) && near(rod.inertia, 1, 1e-4),
    rod,
  );
  ok("pushed at one end: peak bending 4·F·L/27", near(Math.abs(rod.end.peak.moment), (4 * 10 * 2) / 27, 0.01), rod.end);
  ok("pushed at one end: the peak is 2/3 of the way to that end", near(rod.end.peak.x, 4 / 3, 0.01), rod.end);
  ok(
    "pushed at one end: shear and bending close at the far end",
    Math.abs(rod.end.tail) < 1e-9 && rod.end.res < 1e-3,
    rod.end,
  );
  ok(
    "pushed at the middle: no turning, bending F·L/8 at the middle",
    Math.abs(rod.mid.turn) < 1e-6 &&
      near(Math.abs(rod.mid.peak.moment), (10 * 2) / 8, 0.01) &&
      near(rod.mid.peak.x, 1, 0.01),
    rod.mid,
  );

  // ---- a real design
  await p.evaluate(async () => {
    const l = document.getElementById("legal");
    if (l) l.hidden = true;
    setUnits("imp");
    await openExample(2);
    await runNow();
    showTab("results");
  });
  await p.waitForTimeout(400);
  const st0 = await p.evaluate(() => ({
    panel: !document.getElementById("loadspanel").hidden,
    folded: document.getElementById("loadsbody").hidden,
    sum: document.getElementById("loadsfold").textContent,
    after: document.getElementById("chartpanel").nextElementSibling.id,
  }));
  ok("the panel is on the Results tab, right under Flight Performance", st0.panel && st0.after === "loadspanel", st0);
  ok(
    "it starts folded, with the peak bending beside its title",
    st0.folded && /peak bending [\d.,]+ lbf·in/.test(st0.sum),
    st0,
  );
  await p.locator('[data-fold="loadsbody"]').click();
  await p.waitForTimeout(200);
  const read = () =>
    p.evaluate(() => {
      const { R, c, aoa } = loadsLast,
        A = aero(lastSim.D),
        N = normalForceAt(A, c.M, aoa),
        m = lastSim.m;
      return {
        open: !document.getElementById("loadsbody").hidden,
        sum: document.getElementById("loadsfold").textContent,
        cond: document.getElementById("loadscond").textContent,
        tiles: document.getElementById("loadstiles").textContent,
        svg: document.querySelectorAll("#loadsfig svg path").length,
        res: R.residual,
        tailShear: R.shear[R.shear.length - 1] / (Math.abs(R.peakShear.shear) || 1),
        side: R.side,
        sideWant: R.q * A.Aref * N.cn,
        cp: R.cp,
        cpWant: N.cp,
        peak: R.peak,
        len: R.W.len,
        total: R.W.total,
        totalWant: lastSim.D.dryMass + m.totalMass - m.propMass * c.burnt,
        cg: R.W.cg,
        cgWant: stability(lastSim.D, m),
        burnt: c.burnt,
        aoa,
        t: c.t,
        v: c.v,
        flown: c.flown,
        thrust: R.axial.thrust,
        comp: R.axial.compression,
        fromParts: R.W.fromParts,
      };
    });
  const a = await read();
  ok("it opens, and the summary beside the title goes", a.open && a.sum === "", a.sum);
  ok("it draws the rocket, the forces and both traces", a.svg >= 6, a.svg);
  ok("the balance closes: shear and bending back to zero at the tail", a.res < 2e-3 && Math.abs(a.tailShear) < 1e-6, [
    a.res,
    a.tailShear,
  ]);
  ok("the side forces add up to the flight's normal force", near(a.side, a.sideWant, 1e-6), [a.side, a.sideWant]);
  ok("and act where the flight's center of pressure is at that angle", near(a.cp, a.cpWant, 0.01), [a.cp, a.cpWant]);
  ok("the weights add up to the rocket with the propellant left", near(a.total, a.totalWant, 1e-6), [
    a.total,
    a.totalWant,
  ]);
  ok(
    "and balance between the liftoff and burnout CGs",
    a.cg <= a.cgWant.cgL + 0.004 && a.cg >= a.cgWant.cgB - 0.004 && a.fromParts,
    [a.cg, a.cgWant.cgL, a.cgWant.cgB],
  );
  ok(
    "the peak is inside the rocket, between the nose and the fins",
    a.peak.x > 0.2 * a.len && a.peak.x < 0.9 * a.len,
    a.peak,
  );
  ok(
    "the gust's angle is the gust speed against the rocket's speed (20 ft/s)",
    near(a.aoa, (Math.atan(6.096 / a.v) * 180) / Math.PI, 1e-6),
    [a.aoa, a.v],
  );
  ok(
    "the condition is told, in the units chosen",
    /peak dynamic pressure/.test(a.cond) && /ft\/s/.test(a.cond) && /lbf·in/.test(a.tiles),
    a.cond,
  );
  ok(
    "while the motor burns, the airframe at the motor is in compression",
    a.thrust > 0 && a.comp > 0 && a.comp < a.thrust,
    [a.thrust, a.comp],
  );

  // a set angle: twice the angle, about twice the bending
  await p.selectOption("#loadsang", "set");
  ok("choosing a set angle shows its field", await p.evaluate(() => !document.getElementById("loadsdegfld").hidden));
  await p.fill("#loadsdeg", "2");
  await p.waitForTimeout(100);
  const s2 = await read();
  await p.fill("#loadsdeg", "4");
  await p.waitForTimeout(100);
  const s4 = await read();
  ok("the set angle is used", s2.aoa === 2 && s4.aoa === 4, [s2.aoa, s4.aoa]);
  ok(
    "twice the angle gives about twice the bending",
    s4.peak.moment / s2.peak.moment > 1.9 && s4.peak.moment / s2.peak.moment < 2.3,
    s4.peak.moment / s2.peak.moment,
  );
  await p.fill("#loadsdeg", "99");
  await p.waitForTimeout(100);
  ok("an angle past 30° is held at 30°", (await read()).aoa === 30);
  await p.selectOption("#loadsang", "flown");
  await p.waitForTimeout(100);
  const fl = await read();
  ok(
    "as flown uses the flight's own angle at that moment",
    near(fl.aoa, fl.flown, 1e-9) && /As it flew \(/.test(await p.locator("#loadsang").innerText()),
    [fl.aoa, fl.flown],
  );
  ok("the angle field goes again", await p.evaluate(() => document.getElementById("loadsdegfld").hidden));

  // the moment of the flight
  await p.selectOption("#loadsang", "g1");
  await p.selectOption("#loadswhen", "burn");
  await p.waitForTimeout(100);
  const b = await read();
  ok(
    "burnout: the motor is out, the propellant gone, and it is later than peak dynamic pressure",
    b.thrust === 0 && b.burnt === 1 && /burnout/.test(b.cond),
    [b.thrust, b.burnt, b.t],
  );
  await p.selectOption("#loadswhen", "mach");
  await p.waitForTimeout(100);
  const mx = await read();
  ok(
    "top speed: no moment of the flight is faster",
    /top speed/.test(mx.cond) && mx.v >= a.v - 1e-9 && mx.v >= b.v - 1e-9,
    [mx.v, a.v, b.v],
  );
  await p.selectOption("#loadswhen", "q");

  // metric
  await p.evaluate(() => setUnits("met"));
  await p.waitForTimeout(200);
  const mt = await read();
  ok(
    "in metric: N·m, and the gust is 6 m/s",
    /N·m/.test(mt.tiles) &&
      /Gust, 6(\.0)? m\/s/.test(await p.locator("#loadsang").innerText()) &&
      near(mt.aoa, (Math.atan(6 / mt.v) * 180) / Math.PI, 1e-6),
    mt.tiles,
  );
  await p.evaluate(() => setUnits("imp"));

  // the choices are kept
  ok(
    "the choices are kept",
    await p.evaluate(() => JSON.parse(localStorage.getItem("rfs-loads") || "{}").when === "q"),
  );

  // ---- a coupler in the builder is marked, and its weight is on the line
  const cpl = await p.evaluate(async () => {
    const tube = BLD.stages[0].parts.find((q) => q.type === "tube");
    tube.kids.push({ ...bldNew("coupler", tube.od / 2), pos: 0.1 });
    bldChanged(true);
    await runNow();
    return {
      joints: lastSim.D.joints,
      bands: document.querySelectorAll("#loadsfig svg text").length,
      txt: document.getElementById("loadsfig").textContent,
    };
  });
  ok("a coupler is marked on the figure", cpl.joints.length === 1 && /coupler/.test(cpl.txt), cpl.joints);

  // ---- a design with no parts' weights: spread about its CG, and said so
  const bare = await p.evaluate(() => {
    const Dx = { ...lastSim.D, massPts: null },
      W = massLine(Dx, lastSim.m, 0),
      st = stability(Dx, lastSim.m);
    return { fromParts: W.fromParts, cg: W.cg, cgL: st.cgL, total: W.total, want: Dx.dryMass + lastSim.m.totalMass };
  });
  ok(
    "without parts' weights the dry weight is spread about its CG",
    !bare.fromParts && near(bare.cg, bare.cgL, 0.01) && near(bare.total, bare.want, 1e-6),
    bare,
  );

  // ---- a staged rocket: said, not drawn
  const staged = await p.evaluate(
    () =>
      loadsUnsupported({ twoStage: true }) + "|" + loadsUnsupported({ extraMotors: [{}] }) + "|" + loadsUnsupported({}),
  );
  ok(
    "staged and clustered rockets are told they aren't covered",
    /staged/.test(staged) && /clustered/.test(staged) && /\|$/.test(staged),
    staged,
  );

  // ---- the Wind Tunnel shows the same figure for its sliders
  await p.evaluate(() => showTab("rocket"));
  await p.locator('[data-fold="wtbody"]').scrollIntoViewIfNeeded();
  await p.locator('[data-fold="wtbody"]').click();
  await p.waitForTimeout(600);
  ok("Wind Tunnel at 0°: asks for an angle", /Tilt the rocket/.test(await p.locator("#wtc-loads").innerText()));
  await p.evaluate(() => {
    const s = document.getElementById("wtaoa");
    s.value = "6";
    s.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await p.waitForTimeout(200);
  const wt = await p.evaluate(() => ({
    txt: document.getElementById("wtc-loads").textContent,
    paths: document.querySelectorAll("#wtc-loads svg path").length,
  }));
  ok(
    "Wind Tunnel at 6°: the figure with its peak bending",
    /peak bending [\d.,]+ lbf·in/.test(wt.txt) && wt.paths >= 6,
    wt.txt.slice(0, 160),
  );

  ok("no page errors", errs.length === 0, errs);
  await browser.close();
  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
