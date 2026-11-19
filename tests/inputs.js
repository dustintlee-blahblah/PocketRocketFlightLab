// Inputs drive the outputs the way physics says, through the inputs a person uses (typing in the field, then Launch):
//   - the Range tab: field elevation, temperature, air pressure, humidity, wind, rail length and angle, thrust and fin
//     misalignment, the waiver ceiling, the recovery radius and the safety cone, and the Monte Carlo count;
//   - the Motor tab: a bigger motor in the same mount, and the ejection delay;
//   - the builder: added weight, fin span, the parachute's size, the body's length.
// Each change is made from the same starting design and compared with it: higher, lower, more, less, or a check on the
// Results tab turning from pass to warning. The direction is the test, not the amount, so a change in the physics
// that keeps the right direction still passes; the regression test (golden.js) watches the amounts.
// Then every Range-tab number field is given 0, a negative number, a huge number and nothing (the field takes no
// letters): the app must
// not throw, and the Results tab must show no "NaN", "undefined" or "Infinity" and an apogee or a plain message.
// usage: node tests/inputs.js [page.html]
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const file = process.argv[2] || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html");
let checks = 0;
const fails = [];
const ok = (what, cond, got) => {
  checks++;
  if (!cond) fails.push(`${what}${got !== undefined ? ` (got ${JSON.stringify(got)})` : ""}`);
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 412, height: 900 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    window.PR_NO_ASK = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    sessionStorage.setItem("rfs-splash", "1");
  });
  await p.goto("file://" + path.resolve(file));
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const d = document.getElementById("legal");
    if (d) d.hidden = true;
  });

  // the starting design: an example with a dual-deploy recovery, flown in still air from a level rail
  const EX = await p.evaluate(() => EXAMPLES.length - 1);
  const start = async () => {
    await p.evaluate((i) => {
      openExample(i);
      if (!document.getElementById("recentconfirm").hidden) document.getElementById("recentdiscard").click();
    }, EX);
    await p.waitForTimeout(1000);
    await p.evaluate(() => {
      // the landing-dispersion run after each Launch kept to its fewest flights (10): it is not what's tested here
      Object.assign(L, { wind: 0, angle: 0, thrustMis: 0, finMis: 0, cgOff: 0, turb: 0, mcN: 10 });
      renderForms();
    });
  };
  // Launch, then what the Results tab and the flight say
  const fly = async () => {
    await p.evaluate(() => document.getElementById("runbtn").click());
    await p.waitForTimeout(700);
    return p.evaluate(() => {
      const st = lastSim.st,
        // the RSO checklist as the Results tab shows it
        rso = [...document.querySelectorAll("#rsolist .rso")].map((d) => ({
          s: d.classList.contains("bad") ? "bad" : d.classList.contains("warn") ? "warn" : "good",
          label: d.querySelector("b").textContent,
        }));
      return {
        apo: st.maxAlt,
        drift: Math.hypot(st.drift || 0, st.driftY || 0),
        vRail: st.offRail,
        roll: st.maxRoll || 0,
        tilt: st.maxTilt != null ? st.maxTilt : null,
        land: st.vLandZ,
        tDeploy: st.tDeploy,
        stab: lastSim.S ? lastSim.S.marginL : null,
        mass: st.liftMass,
        bad: rso.filter((c) => c.s !== "good").map((c) => c.label),
        mcN: window.lastMC ? lastMC.n || (lastMC.apos && lastMC.apos.length) || null : null,
      };
    });
  };
  // type into a Range-tab field (in the units it shows) and leave it, as a person would
  const type = async (key, text) => {
    const sel = "#f-" + key;
    // the tab the field is on (most are on Range; the imperfections are with the rocket)
    await p.evaluate((s) => {
      const v = document.querySelector(s)?.closest("section.view");
      showTab(v ? v.id.slice(2) : "flight");
    }, sel);
    if (!(await p.$(sel))) throw new Error("no field " + sel);
    // a field in a folded panel: open the panel, with its own button
    await p.evaluate((s) => {
      for (let e = document.querySelector(s); e; e = e.parentElement)
        if (e.hidden && e.id) document.querySelector(`[aria-controls="${e.id}"]`)?.click();
      document.querySelector(s).scrollIntoView();
    }, sel);
    await p.fill(sel, String(text), { timeout: 3000 });
    await p.press(sel, "Tab", { timeout: 3000 });
  };
  // one input from two values: the second flight compared with the first
  const effect = async (what, key, from, to, test) => {
    try {
      await start();
      await type(key, from);
      const A = await fly();
      await type(key, to);
      const B = await fly();
      const r = test(A, B);
      ok(what, r === true, r === true ? undefined : { from: A, to: B });
    } catch (e) {
      ok(what, false, e.message.split("\n")[0]);
    }
  };
  const more = (k) => (A, B) => B[k] > A[k] || { [k]: [A[k], B[k]] };
  const less = (k) => (A, B) => B[k] < A[k] || { [k]: [A[k], B[k]] };

  // ---- the Range tab (imperial units, the app's default)
  await effect("a higher field: higher apogee above it (thinner air)", "elev", 0, 6000, more("apo"));
  await effect("a hotter day: higher apogee", "tempC", 30, 100, more("apo"));
  await effect("lower air pressure: higher apogee", "pressure", 30.2, 25.5, more("apo"));
  await effect(
    "humid air (lighter): apogee no lower",
    "humidity",
    0,
    100,
    (A, B) => B.apo >= A.apo || { apo: [A.apo, B.apo] },
  );
  await effect("wind: more drift", "wind", 0, 20, more("drift"));
  await effect("wind: lower apogee (it turns into the wind)", "wind", 0, 20, less("apo"));
  await effect("a longer rail: faster off it", "rail", 4, 12, more("vRail"));
  await effect("a tilted rail: lower apogee", "angle", 0, 15, less("apo"));
  await effect("a tilted rail: more drift", "angle", 0, 15, more("drift"));
  await effect(
    "thrust misalignment: apogee no higher",
    "thrustMis",
    0,
    3,
    (A, B) => B.apo <= A.apo || { apo: [A.apo, B.apo] },
  );
  await effect("a misaligned fin: it rolls", "finMis", 0, 2, more("roll"));
  await effect(
    "a waiver below the apogee: the checklist warns",
    "waiver",
    99999,
    500,
    (A, B) => B.bad.length > A.bad.length || { bad: [A.bad, B.bad] },
  );
  await effect(
    "a small recovery area: the checklist warns",
    "recRadius",
    10,
    0.005,
    (A, B) => B.bad.length > A.bad.length || { bad: [A.bad, B.bad] },
  );

  // ---- the Motor tab: a bigger motor in the same mount, found with the tab's search and picked from its list
  try {
    await start();
    const A = await fly();
    const want = await p.evaluate(() => {
      const m = lastSim.m,
        s0 = mstats(m),
        c = allMotors()
          .filter((x) => x.builtin && Math.abs((x.dia || 0) - (m.dia || 0)) < 5e-4)
          .map((x) => [x, mstats(x)])
          .filter(([, s]) => s.I > s0.I * 1.4 && s.I < s0.I * 2.5)
          .sort((x, y) => x[1].I - y[1].I)[0];
      return c ? c[0].cn || c[0].name : null;
    });
    if (!want) ok("Motor tab: a bigger motor of the same size to try", false);
    else {
      await p.evaluate(() => {
        showTab("motor");
        const f = document.querySelector('[aria-controls="fltbody"]');
        if (f && f.getAttribute("aria-expanded") !== "true") f.click();
      });
      await p.fill("#fsearch", want);
      await p.waitForTimeout(500);
      const clicked = await p.evaluate((want) => {
        const r = [...document.querySelectorAll("#motorlist .mot")].find((x) =>
          x.querySelector(".nm").textContent.startsWith(want),
        );
        if (r) r.click();
        return !!r;
      }, want);
      ok(`Motor tab: ${want} found by searching`, clicked);
      await p.fill("#fsearch", "");
      const B = await fly();
      ok(`a bigger motor (${want}): higher apogee`, B.apo > A.apo, [A.apo, B.apo]);
      ok(`a bigger motor (${want}): heavier at liftoff`, B.mass > A.mass, [A.mass, B.mass]);
    }
  } catch (e) {
    ok("Motor tab: a bigger motor", false, e.message.split("\n")[0]);
  }

  // ---- the builder: through the editor's own fields
  const part = async (re, key, scale) => {
    await p.evaluate(() => showTab("rocket"));
    const row = await p.evaluate((re) => {
      const r = [...document.querySelectorAll("#bldtree .bldrow")].find((x) => new RegExp(re, "i").test(x.textContent));
      if (!r) return null;
      r.click();
      return r.textContent.trim().slice(0, 30);
    }, re);
    if (!row) throw new Error("no part like " + re);
    const sel = "#bf-" + key;
    await p.waitForSelector(sel, { timeout: 3000 });
    const v = parseFloat(await p.inputValue(sel));
    await p.fill(sel, String(+(v * scale).toPrecision(4)));
    await p.press(sel, "Tab");
    await p.waitForTimeout(300);
  };
  // a new design from the builder: its parts' weights come from their sizes and materials (an example's file may give
  // fixed weights, which sizes then don't change)
  const fresh = async () => {
    await p.evaluate(() => {
      showTab("rocket");
      document.getElementById("newdesign").click();
      // the open design was changed: discard the changes (the test's own)
      if (!document.getElementById("recentconfirm").hidden) document.getElementById("recentdiscard").click();
    });
    await p.waitForTimeout(800);
  };
  const build = async (what, re, key, scale, test) => {
    try {
      await fresh();
      const A = await fly();
      await part(re, key, scale);
      const B = await fly();
      const r = test(A, B);
      ok(what, r === true, r === true ? undefined : { from: A, to: B });
    } catch (e) {
      ok(what, false, e.message.split("\n")[0]);
    }
  };
  await build("a bigger parachute: slower landing", "^parachute", "dia", 1.5, less("land"));
  await build("longer fins: more stable", "fin set", "span", 1.3, more("stab"));
  await build("longer fins: heavier", "fin set", "span", 1.3, more("mass"));
  await build("a longer body: heavier", "^body tube", "len", 1.3, more("mass"));
  await build("a longer body: lower apogee", "^body tube", "len", 1.3, less("apo"));
  await build("a thicker body wall: lower apogee", "^body tube", "wall", 2.5, less("apo"));
  await build("a longer nose: CG moves forward, more stable", "^nose cone", "len", 1.5, more("stab"));

  // ---- strange values in every Range-tab number field: no crash, nothing broken on Results
  await start();
  const keys = await p.evaluate(() => {
    showTab("flight");
    return (
      [...document.querySelectorAll("#v-flight input[id^=f-]")]
        // (the sustainer's lockouts are only shown for a two-stage rocket)
        .filter(
          (i) => i.type !== "checkbox" && i.type !== "radio" && i.type !== "hidden" && !i.closest("#stagelockpanel"),
        )
        .map((i) => i.id.slice(2))
    );
  });
  ok("Range tab: number fields to try", keys.length >= 15, keys.length);
  // a value past what the simulation takes is held at the end of the range, and the field shows it
  await type("wind", "1000");
  const held = await p.evaluate(() => +document.getElementById("f-wind").value);
  ok("Range: a 1000 mph wind is held at the most the simulation takes", held > 50 && held < 200, held);
  await start();
  for (const k of keys) {
    process.stdout.write(".");
    // a field switched off by another setting (the rail's direction when it turns into the wind) can't be typed in
    if (await p.evaluate((k) => document.getElementById("f-" + k)?.disabled, k)) continue;
    for (const v of ["0", "-5", "1e9", ""]) {
      const before = errs.length;
      try {
        await type(k, v);
        await p.evaluate(() => document.getElementById("runbtn").click());
        await p.waitForTimeout(250);
        const r = await p.evaluate(() => {
          showTab("results");
          const t = document.getElementById("v-results").innerText;
          return {
            broken: (t.match(/.{0,25}\b(NaN|undefined|Infinity)\b.{0,25}/) || [])[0] || null,
            apo: document.getElementById("apogee").textContent,
          };
        });
        ok(`Range "${k}" = "${v}": Results show no NaN, undefined or Infinity`, !r.broken, r.broken);
        ok(`Range "${k}" = "${v}": no page error`, errs.length === before, errs.slice(before));
        const shown = parseFloat(String(r.apo).replace(/,/g, ""));
        ok(`Range "${k}" = "${v}": a believable apogee (or none)`, !(shown > 2e6), r.apo);
      } catch (e) {
        ok(`Range "${k}" = "${v}"`, false, e.message.split("\n")[0]);
      }
    }
    await start();
  }

  await b.close();
  console.log(`\n${checks} checks, ${fails.length} failed`);
  if (fails.length) {
    console.log("  " + fails.join("\n  "));
    process.exit(1);
  }
})();
