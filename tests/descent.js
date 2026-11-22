#!/usr/bin/env node
/*
 * The descent's events fall where they should, and the same on every browser. Checks, on each built-in example in
 * still air and in wind, that
 *   - a main set to open at an altitude opens at that altitude (not up to a time step's fall below it);
 *   - the flight's results hardly move when the page's maths functions (sin, cos, exp, log, pow, atan2 and the rest)
 *     are nudged by one unit in the last place on a share of their calls, which is how one browser's maths library
 *     differs from another's. Before build 339 a tie in the step size under a filling canopy turned that into up to
 *     1.5% in landing speed and 0.5% in landing time.
 *   - a dropped booster's chute opens at its altitude or its delay, and its path ends at the touchdown.
 *
 *   node build.js && node tests/descent.js [--html other-build.html]
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

// runs in the page before the app: each maths function can return its neighbouring number on a share of its calls
const NUDGE = () => {
  const buf = new Float64Array(1),
    u = new BigUint64Array(buf.buffer);
  let s = 1;
  const P = (window.__nudge = { on: false, rate: 0.05, seed: (k) => (s = k) });
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const names = "sin cos tan exp log pow atan2 atan asin acos cbrt tanh sinh cosh log10 log2 expm1 log1p".split(" ");
  for (const k of names) {
    const f = Math[k];
    Math[k] = function (a, b) {
      const v = arguments.length > 1 ? f(a, b) : f(a);
      if (!P.on || !isFinite(v) || v === 0) return v;
      const r = rnd();
      if (r >= P.rate) return v;
      buf[0] = v;
      u[0] += r < P.rate / 2 ? 1n : -1n;
      return buf[0];
    };
  }
};

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(NUDGE);
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    window.PR_NO_ASK = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    sessionStorage.setItem("rfs-splash", "1");
  });
  await p.goto("file://" + html);
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    document.getElementById("legal").hidden = true;
  });

  // one flight of the open design; seed 0 flies it with the browser's own maths
  const fly = (seed) =>
    p.evaluate((seed) => {
      window.__nudge.on = seed > 0;
      window.__nudge.seed(seed);
      runAll();
      window.__nudge.on = false;
      const { st, out, D } = lastSim;
      // the altitude at the moment the main opened, read off the flight's own record
      let zMain = null;
      if (st.tMain != null) {
        const k = out.t.findIndex((x) => x >= st.tMain);
        if (k > 0) {
          const f = (st.tMain - out.t[k - 1]) / (out.t[k] - out.t[k - 1]);
          zMain = out.alt[k - 1] + f * (out.alt[k] - out.alt[k - 1]);
        }
      }
      const pick = {};
      for (const k of ["maxAlt", "maxV", "tApo", "tDeploy", "tMain", "tLand", "vLand", "vLandZ", "drift"])
        pick[k] = st[k];
      return { st: pick, zMain, mainAlt: D.recovery !== "single" ? D.mainAlt : null, error: st.error || null };
    }, seed);

  for (let i = 0; i < 5; i++)
    for (const wind of [0, 6]) {
      const name = `example ${i}, wind ${wind} m/s`;
      await p.evaluate(
        async ({ i, wind }) => {
          await openExample(i);
          L.wind = wind;
          L.angle = wind ? 5 : 0;
          L.turb = 0;
        },
        { i, wind },
      );
      const base = await fly(0);
      ok(`${name}: flies`, !base.error && base.st.tLand > 0, base.error);
      // a main held for an altitude: it opened after apogee, below it, so the altitude is what set the moment
      if (
        base.mainAlt != null &&
        base.zMain != null &&
        base.st.tMain > base.st.tApo + 0.5 &&
        base.st.maxAlt > base.mainAlt + 20
      )
        ok(
          `${name}: the main opens at its set altitude (${base.mainAlt.toFixed(1)} m)`,
          Math.abs(base.zMain - base.mainAlt) < 0.3,
          base.zMain,
        );
      ok(
        `${name}: the same flight twice gives the same results`,
        JSON.stringify((await fly(0)).st) === JSON.stringify(base.st),
      );
      for (const seed of [1, 2, 3]) {
        const n = await fly(seed);
        for (const [k, tol] of [
          ["maxAlt", 1e-9],
          ["maxV", 1e-9],
          ["tApo", 1e-9],
          ["tDeploy", 1e-9],
          ["tMain", 1e-6],
          ["tLand", 1e-6],
          ["vLand", 1e-6],
          ["vLandZ", 1e-6],
          ["drift", 1e-6],
        ]) {
          const a = base.st[k],
            b = n.st[k];
          if (a == null && b == null) continue;
          // drift in still air is near zero: compare it with the height flown
          const scale = k === "drift" ? Math.max(Math.abs(a), base.st.maxAlt * 0.01) : Math.abs(a);
          ok(`${name}, maths nudged (${seed}): ${k} holds`, Math.abs(a - b) <= tol * Math.max(scale, 1e-9), [a, b]);
        }
      }
    }

  // a dropped booster on its own chute: it opens at its altitude, or its delay after the booster's apogee, and lands at
  // the touchdown (before build 341 each fell at the end of whichever 0.05 s step came next)
  const booster = (set) =>
    p.evaluate((set) => {
      setL(defaultLaunch());
      bldNewDesign();
      setMotorId("a-5f4294d20002e900000007dd");
      L.wind = 3;
      L.turb = 0;
      bldRender();
      if (!document.querySelector('[data-stage="add"]')) document.querySelector(".bldaddtoggle").click();
      document.querySelector('[data-stage="add"]').click();
      setBoostId("a-5f4294d20002e9000000000d");
      bldChanged(true);
      bldApply();
      renderMotors();
      Object.assign(D, { bRecovery: "chute", bChuteDia: 0.45, bChuteCd: 0.8 }, set);
      runAll();
      const b = lastSim.st.booster,
        o = lastSim.out;
      return (
        b && {
          tApo: b.tApo,
          apogee: b.apogee,
          tDeploy: b.tDeploy,
          altDeploy: b.altDeploy,
          tLand: b.tLand,
          last: [o.bt[o.bt.length - 1], o.balt[o.balt.length - 1]],
          rising: o.bt.every((x, i) => !i || x > o.bt[i - 1]),
        }
      );
    }, set);
  const bAlt = await booster({ bChuteEv: "altitude", bChuteAlt: 40 });
  ok("booster: flies and comes down", !!bAlt && bAlt.tLand > bAlt.tApo && bAlt.apogee > 60, bAlt);
  if (bAlt) {
    ok("booster: a chute set for 40 m opens at 40 m", Math.abs(bAlt.altDeploy - 40) < 0.05, bAlt.altDeploy);
    ok(
      "booster: its path ends at the touchdown",
      Math.abs(bAlt.last[0] - bAlt.tLand) < 1e-9 && bAlt.last[1] === 0 && bAlt.rising,
      bAlt.last,
    );
  }
  const bDel = await booster({ bChuteEv: "apogee", bChuteDelay: 1.23 });
  if (bDel)
    ok(
      "booster: a chute set for 1.23 s after its apogee opens then",
      Math.abs(bDel.tDeploy - bDel.tApo - 1.23) < 1e-6,
      [bDel.tApo, bDel.tDeploy],
    );
  else ok("booster: flies with a delay", false);

  ok("no page errors", errs.length === 0, errs.slice(0, 3));
  await browser.close();
  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
