#!/usr/bin/env node
/*
 * The recovery configuration (builder, Whole rocket, Recovery): motor ejection, one altimeter, two altimeters, each
 * with or without a chute release. Checks that
 *   - every example opens as the configuration its parachutes imply, with its parachutes unchanged;
 *   - choosing a configuration gives each parachute the opening event that goes with it, and changing an altimeter's
 *     delay or main height moves the flight (with two altimeters the first to fire does the work);
 *   - the Recovery Plan lists each configuration's charges and flies the flight again as if each failed;
 *   - an altimeter that fires at apogee only is flagged when a main charge is needed;
 *   - the builder shows the right fields (a parachute has a role, not its own opening setting);
 *   - the configuration survives Save a copy and reopening, and an earlier build's backup altimeter becomes the second
 *     altimeter.
 *
 *   node build.js && node tests/recovery.js [--html other-build.html]
 */
"use strict";
const fs = require("fs");
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const p = await ctx.newPage();
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
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    document.getElementById("legal").hidden = true;
    // the top stage's parachutes, as the flight will read them
    window.chutes = () => {
      const C = [];
      const w = (l) => {
        for (const q of l || []) {
          if (q.type === "chute" || q.type === "streamer")
            C.push({
              role: q.role || "only",
              deploy: q.deploy,
              alt: q.alt || 0,
              delay: q.delay || 0,
              rel: !!q.release,
            });
          w(q.kids);
        }
      };
      w(BLD.stages[0].parts);
      return C;
    };
    // sets recovery settings, flies, and reads the flight and its Recovery Plan
    window.fly = async (set) => {
      Object.assign(BLD.settings, set);
      bldApply();
      runNow();
      showTab("results");
      await new Promise((r) => setTimeout(r, 900));
      const st = lastSim.st,
        body = document.getElementById("recbody");
      return {
        chutes: chutes(),
        tDeploy: st.tDeploy != null && st.tApo != null ? +(st.tDeploy - st.tApo).toFixed(2) : null,
        tMain: st.tMain ?? null,
        mainAt: st.altMain != null ? st.altMain : null,
        land: st.vLandZ,
        D: { recovery: D.recovery, deployMode: D.deployMode, deployDelay: D.deployDelay, mainAlt: D.mainAlt },
        charges: [...body.querySelectorAll("table")[0].querySelectorAll("tbody tr")].map((r) => ({
          what: r.cells[0].childNodes[0].textContent,
          who: r.cells[0].querySelector("small").textContent,
          after: parseFloat(r.cells[1].textContent.replace("−", "-")),
          h: parseFloat(r.cells[2].textContent.replace(/,/g, "")),
        })),
        cases: [...body.querySelectorAll("table")[1].querySelectorAll("tbody tr")].map((r) => ({
          name: r.cells[0].childNodes[0].textContent,
          opens: !/nothing opens/.test(r.cells[1].textContent),
          grade: r.cells[2].querySelector("b").textContent,
        })),
        bans: [...body.querySelectorAll(".cmpban")].map((b) => b.textContent),
        text: body.textContent,
      };
    };
  });

  // every example: the configuration its parachutes imply, and nothing changed by working it out
  const ex = await p.evaluate(async () => {
    const out = [];
    for (let i = 0; i < EXAMPLES.length; i++) {
      await openExample(i);
      await new Promise((r) => setTimeout(r, 400));
      const before = JSON.stringify(chutes());
      bldApply();
      out.push({
        name: BLD.name,
        cfg: BLD.settings.recCfg,
        n: chutes().length,
        same: before === JSON.stringify(chutes()),
      });
    }
    return out;
  });
  for (const e of ex) {
    ok(`${e.name}: a configuration is worked out`, ["motor", "one", "two", "custom"].includes(e.cfg), e);
    ok(`${e.name}: its parachutes are unchanged`, e.same, e);
  }
  ok(
    "examples: a motor-ejection one and an altimeter one",
    ex.some((e) => e.cfg === "motor") && ex.some((e) => e.cfg === "one"),
    ex,
  );

  // ---- a dual-deploy rocket (drogue and main) ----
  const dualI = ex.findIndex((e) => e.cfg === "one" && e.n >= 2);
  ok("examples: one with a drogue and a main", dualI >= 0, ex);
  await p.evaluate((i) => openExample(i), dualI);
  await p.waitForTimeout(600);
  const by = (r, role) => r.chutes.find((c) => c.role === role);

  // one altimeter
  let r = await p.evaluate(() =>
    fly({ recCfg: "one", a1Apo: 0, a1Main: 152.4, crOn: false, a1Model: "", a2Model: "" }),
  );
  const base = r;
  ok(
    "one altimeter: drogue at apogee, main at 500 ft",
    by(r, "drogue").deploy === "apogee" &&
      by(r, "main").deploy === "altitude" &&
      Math.abs(by(r, "main").alt - 152.4) < 0.01,
    r.chutes,
  );
  ok(
    "one altimeter: charges are the altimeter's",
    r.charges.length >= 2 &&
      r.charges.every((c) => /^(Altimeter|Motor)/.test(c.who)) &&
      r.charges.some((c) => c.what === "Drogue") &&
      r.charges.some((c) => c.what === "Main"),
    r.charges,
  );
  ok(
    "one altimeter: flown as if it failed",
    r.cases.some((c) => c.name === "Altimeter fails") && !r.cases.some((c) => /Altimeter [12]/.test(c.name)),
    r.cases,
  );
  r = await p.evaluate(() => fly({ a1Apo: 2, a1Main: 91.44 }));
  ok(
    "one altimeter: a 2 s apogee delay opens the drogue 2 s after apogee",
    Math.abs(r.tDeploy - 2) < 0.2 && by(r, "drogue").delay === 2,
    [r.tDeploy, r.chutes],
  );
  ok(
    "one altimeter: the main opens at its new height (300 ft)",
    Math.abs(r.D.mainAlt - 91.44) < 0.01 && Math.abs(by(r, "main").alt - 91.44) < 0.01,
    [r.D, r.chutes],
  );
  ok(
    "one altimeter: the main charge is listed near 300 ft",
    r.charges.some((c) => c.what === "Main" && Math.abs(c.h - 300) < 40),
    r.charges,
  );

  // an altimeter that fires at apogee only can't fire the main
  r = await p.evaluate(() => fly({ a1Model: "et-apogee" }));
  ok(
    "apogee-only altimeter with a main charge: flagged",
    r.bans.some((b) => /apogee charge only/.test(b)),
    r.bans,
  );
  r = await p.evaluate(() => fly({ a1Model: "mw-rrc3s" }));
  ok(
    "a dual-deploy altimeter: not flagged, and named in the plan",
    !r.bans.some((b) => /apogee charge only/.test(b)) && r.charges.some((c) => /RRC3/.test(c.who)),
    [r.bans, r.charges],
  );

  // two altimeters: each has its own charges; the first to fire does the work
  r = await p.evaluate(() => fly({ recCfg: "two", a1Model: "", a1Apo: 0, a1Main: 152.4, a2Apo: 1.5, a2Main: 121.92 }));
  ok(
    "two altimeters: four altimeter charges",
    r.charges.filter((c) => /^Altimeter 1/.test(c.who)).length === 2 &&
      r.charges.filter((c) => /^Altimeter 2/.test(c.who)).length === 2,
    r.charges,
  );
  ok(
    "two altimeters: altimeter 2's apogee charge is 1.5 s after apogee",
    r.charges.some((c) => /^Altimeter 2/.test(c.who) && c.what === "Drogue" && Math.abs(c.after - 1.5) < 0.15),
    r.charges,
  );
  ok(
    "two altimeters: flown as if each failed, and both",
    ["Altimeter 1 fails", "Altimeter 2 fails", "Both altimeters fail"].every((n) => r.cases.some((c) => c.name === n)),
    r.cases,
  );
  ok(
    "two altimeters: the flight uses the first to fire (apogee, 500 ft)",
    by(r, "drogue").delay === 0 && Math.abs(by(r, "main").alt - 152.4) < 0.01,
    r.chutes,
  );
  r = await p.evaluate(() => fly({ a1Apo: 3, a1Main: 100, a2Apo: 1, a2Main: 250 }));
  ok(
    "two altimeters: when the second fires first, the flight follows it",
    by(r, "drogue").delay === 1 && Math.abs(by(r, "main").alt - 250) < 0.01 && Math.abs(r.tDeploy - 1) < 0.2,
    [r.tDeploy, r.chutes],
  );

  // a chute release on the main, with altimeters
  r = await p.evaluate(() => fly({ recCfg: "one", a1Apo: 0, a1Main: 152.4, crOn: true, crAlt: 91.44 }));
  ok(
    "chute release: the main is held to 300 ft",
    by(r, "main").rel && Math.abs(by(r, "main").alt - 91.44) < 0.01 && Math.abs(r.D.mainAlt - 91.44) < 0.01,
    [r.chutes, r.D],
  );
  ok(
    "chute release: its opening is listed",
    r.charges.some((c) => c.who === "Chute release" && Math.abs(c.h - 300) < 40),
    r.charges,
  );
  ok(
    "chute release: flown as if it stayed shut",
    r.cases.some((c) => c.name === "Chute release stays shut"),
    r.cases,
  );
  ok("chute release: lands as softly as without it", Math.abs(r.land - base.land) < 0.3, [r.land, base.land]);

  // motor ejection
  r = await p.evaluate(() => {
    // a motor with a delay, so its charge fires
    const mm = bldMounts(BLD.stages[0])[0];
    window.__delay = mm.delay;
    mm.delay = 8;
    return fly({ recCfg: "motor", crOn: false });
  });
  ok(
    "motor ejection: every parachute opens at the motor's charge",
    r.chutes.every((c) => c.deploy === "ejection"),
    r.chutes,
  );
  ok(
    "motor ejection: the only charge is the motor's",
    r.charges.length >= 1 && r.charges.every((c) => c.who === "Motor"),
    r.charges,
  );
  ok(
    "motor ejection: flown as if the charge failed (nothing opens)",
    r.cases.some((c) => c.name === "Motor charge fails" && !c.opens && c.grade === "Unsafe"),
    r.cases,
  );
  r = await p.evaluate(() => fly({ crOn: true, crAlt: 121.92 }));
  ok(
    "motor ejection with a chute release: the main is held to 400 ft",
    by(r, "main").rel && by(r, "main").deploy === "altitude" && by(r, "drogue").deploy === "ejection",
    r.chutes,
  );
  ok(
    "motor ejection with a chute release: its opening is listed",
    r.charges.some((c) => c.who === "Chute release"),
    r.charges,
  );

  // custom: nothing is changed, and each parachute shows its own setting
  const before = JSON.stringify(r.chutes.map((c) => [c.deploy, c.alt, c.delay, c.rel]));
  r = await p.evaluate(() => fly({ recCfg: "custom" }));
  ok(
    "custom: the parachutes keep their settings",
    JSON.stringify(r.chutes.map((c) => [c.deploy, c.alt, c.delay, c.rel])) === before,
    r.chutes,
  );

  // the builder's fields
  const fields = async (cfg, extra = {}) =>
    p.evaluate(
      async ([cfg, extra]) => {
        Object.assign(BLD.settings, { recCfg: cfg, crOn: false, ...extra });
        bldApply();
        showTab("rocket");
        document.querySelector('.bldrow[data-id="__recovery"]').click();
        await new Promise((r) => setTimeout(r, 250));
        const ids = [...document.querySelectorAll("#bldedit [id^=bf-]")].map((e) => e.id.slice(3)),
          recRow = document.querySelector('.bldrow[data-id="__recovery"]'),
          rowText = recRow.textContent,
          rowFirst = recRow === document.querySelector(".bldunder").firstElementChild,
          heads = [...document.querySelectorAll("#bldedit .bldh")].map((e) => e.textContent),
          opts = [...document.querySelectorAll("#bf-recCfg option")].map((o) => o.textContent);
        // a parachute's own fields
        const row = [...document.querySelectorAll("#bldtree .bldrow")].find(
          (r) => /parachute|chute|drogue|main/i.test(r.textContent) && !r.classList.contains("stage"),
        );
        if (row) row.click();
        await new Promise((r) => setTimeout(r, 250));
        return {
          ids,
          rowText,
          rowFirst,
          heads,
          opts,
          chute: [...document.querySelectorAll("#bldedit [id^=bf-]")].map((e) => e.id.slice(3)),
          note: [...document.querySelectorAll("#bldedit p.note")].map((e) => e.textContent).join(" | "),
        };
      },
      [cfg, extra],
    );
  let f = await fields("motor");
  // Recovery is a row of the Design Tree, first under Whole Rocket, with the configuration beside its name
  ok(
    "builder: Recovery is its own row, first under Whole Rocket, and says the configuration",
    f.rowFirst &&
      /^Recovery/.test(f.rowText) &&
      /Motor ejection/.test(f.rowText) &&
      f.ids.includes("recCfg") &&
      f.ids.includes("bayLen") &&
      !f.ids.includes("finish"),
    f,
  );
  ok(
    "builder: the three configurations, then Custom",
    f.opts.length === 4 &&
      f.opts[0] === "Motor ejection" &&
      f.opts[1] === "One altimeter" &&
      f.opts[2] === "Two altimeters" &&
      /^Custom/.test(f.opts[3]),
    f.opts,
  );
  ok(
    "builder, motor ejection: no altimeter fields, a chute release",
    !f.ids.some((k) => /^a[12]/.test(k)) &&
      f.ids.includes("crOn") &&
      f.heads.includes("Recovery") &&
      f.heads.includes("Chute release"),
    f,
  );
  ok(
    "builder, motor ejection: a parachute has a role, not its own opening",
    f.chute.includes("role") && !f.chute.includes("deploy"),
    f.chute,
  );
  f = await fields("one");
  ok(
    "builder, one altimeter: its model, apogee delay and main height",
    ["a1Model", "a1Apo", "a1Main", "crOn"].every((k) => f.ids.includes(k)) &&
      !f.ids.some((k) => /^a2/.test(k)) &&
      f.heads.includes("Altimeter"),
    f,
  );
  f = await fields("two");
  ok(
    "builder, two altimeters: both, each with its own settings",
    ["a1Model", "a1Apo", "a1Main", "a2Model", "a2Apo", "a2Main"].every((k) => f.ids.includes(k)) &&
      f.heads.includes("Altimeter 1") &&
      f.heads.includes("Altimeter 2"),
    f,
  );
  f = await fields("one", { crOn: true });
  ok("builder, chute release: its opening height", f.ids.includes("crAlt"), f.ids);
  f = await fields("custom");
  ok(
    "builder, custom: no altimeter or release fields; a parachute has its own opening",
    !f.ids.some((k) => /^a[12]|^cr/.test(k)) && f.chute.includes("deploy") && !f.chute.includes("role"),
    f,
  );
  // the row says what is set, and Whole Rocket no longer holds the recovery fields
  const row = await p.evaluate(async () => {
    Object.assign(BLD.settings, { recCfg: "two", crOn: true });
    bldApply();
    bldRender();
    const text = document.querySelector('.bldrow[data-id="__recovery"] span').textContent;
    document.querySelector('.bldrow[data-id="__rocket"]').click();
    await new Promise((r) => setTimeout(r, 250));
    const whole = [...document.querySelectorAll("#bldedit [id^=bf-]")].map((e) => e.id.slice(3));
    Object.assign(BLD.settings, { crOn: false });
    return { text, whole };
  });
  ok(
    "builder: the Recovery row reads Two altimeters with a chute release",
    /Two altimeters/.test(row.text) && /release/.test(row.text),
    row.text,
  );
  ok(
    "builder: Whole Rocket has the rocket's own fields, not recovery's",
    row.whole.includes("finish") &&
      row.whole.includes("name") &&
      !row.whole.some((k) => /^rec|^a[12]|^cr|^bay|^mainRating/.test(k)),
    row.whole,
  );
  const models = await p.evaluate(async () => {
    Object.assign(BLD.settings, { recCfg: "one" });
    bldApply();
    document.querySelector('.bldrow[data-id="__recovery"]').click();
    await new Promise((r) => setTimeout(r, 250));
    return [...document.querySelectorAll("#bf-a1Model option")].map((o) => o.textContent);
  });
  ok(
    "builder: the altimeter list has the ones that fire charges, not the recorders",
    models[0] === "Any altimeter" &&
      models.some((m) => /RRC3/.test(m)) &&
      models.some((m) => /StratoLogger/.test(m)) &&
      !models.some((m) => /AltimeterOne|AltimeterTwo|AltimeterThree|Chute Release/.test(m)),
    models,
  );

  // Save a copy and reopen: the configuration comes back
  await p.evaluate(() =>
    fly({
      recCfg: "two",
      a1Model: "pf-slcf",
      a1Apo: 0,
      a1Main: 213.36,
      a2Model: "mw-rrc2p",
      a2Apo: 1,
      a2Main: 182.88,
      crOn: false,
    }),
  );
  const [dl] = await Promise.all([
    p.waitForEvent("download", { timeout: 20000 }),
    p.evaluate(() => void saveDesignFile(false, { name: "recovery-test" })),
  ]);
  const b64 = fs.readFileSync(await dl.path()).toString("base64");
  await p.evaluate(() => openExample(0));
  await p.waitForTimeout(500);
  const back = await p.evaluate(async (b64) => {
    const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      xml = await unzipOrk(u.buffer);
    await openDesignAsk(xml, "recovery-test.ork", u.buffer);
    await new Promise((r) => setTimeout(r, 500));
    const S = BLD.settings;
    return {
      cfg: S.recCfg,
      a1Model: S.a1Model,
      a1Main: S.a1Main,
      a2Model: S.a2Model,
      a2Apo: S.a2Apo,
      a2Main: S.a2Main,
      chutes: chutes(),
    };
  }, b64);
  ok(
    "saved and reopened: two altimeters with their models and settings",
    back.cfg === "two" &&
      back.a1Model === "pf-slcf" &&
      back.a2Model === "mw-rrc2p" &&
      Math.abs(back.a1Main - 213.36) < 0.01 &&
      back.a2Apo === 1 &&
      Math.abs(back.a2Main - 182.88) < 0.01,
    back,
  );
  ok(
    "saved and reopened: the parachutes as saved",
    back.chutes.some((c) => c.deploy === "altitude" && Math.abs(c.alt - 213.36) < 0.01) &&
      back.chutes.some((c) => c.deploy === "apogee"),
    back.chutes,
  );

  // an earlier build's backup altimeter becomes the second altimeter
  const old = await p.evaluate(async () => {
    Object.assign(BLD.settings, { recCfg: "one", a1Apo: 0, a1Main: 152.4, crOn: false });
    bldApply();
    const S = BLD.settings;
    delete S.recCfg;
    for (const k of ["a1Apo", "a1Main", "a2Apo", "a2Main", "a1Model", "a2Model", "crOn", "crAlt", "recSolo"])
      delete S[k];
    Object.assign(S, { bakOn: true, bakDelay: 2, bakMainDrop: 30.48 });
    const r = await fly({});
    return {
      cfg: S.recCfg,
      a1Apo: S.a1Apo,
      a1Main: S.a1Main,
      a2Apo: S.a2Apo,
      a2Main: S.a2Main,
      bak: S.bakOn,
      cases: r.cases,
      chutes: r.chutes,
    };
  });
  ok(
    "an earlier build's backup altimeter: two altimeters, 2 s and 100 ft lower",
    old.cfg === "two" && old.a2Apo === 2 && Math.abs(old.a2Main - (152.4 - 30.48)) < 0.01 && old.bak === undefined,
    old,
  );
  ok(
    "an earlier build's backup altimeter: the flight is unchanged",
    old.chutes.some((c) => c.deploy === "apogee" && c.delay === 0) &&
      old.chutes.some((c) => c.deploy === "altitude" && Math.abs(c.alt - 152.4) < 0.01),
    old.chutes,
  );

  // ---- a rocket with one parachute ----
  // (the last of them: the first is a small model that tops out under 100 ft)
  const oneI = ex.map((e) => e.cfg === "motor" && e.n === 1).lastIndexOf(true);
  ok("examples: one with a single parachute on motor ejection", oneI >= 0, ex);
  await p.evaluate((i) => openExample(i), oneI);
  await p.waitForTimeout(600);
  r = await p.evaluate(() => fly({}));
  ok(
    "one parachute, motor ejection: it opens at the motor's charge",
    r.chutes.length === 1 && r.chutes[0].deploy === "ejection" && r.D.deployMode === "motor",
    [r.chutes, r.D],
  );
  r = await p.evaluate(() => fly({ recCfg: "one", a1Apo: 1, recSolo: "apogee" }));
  ok(
    "one parachute, one altimeter: it opens at the apogee charge, 1 s after apogee",
    r.chutes[0].deploy === "apogee" &&
      r.chutes[0].delay === 1 &&
      r.D.deployMode === "apogee" &&
      Math.abs(r.tDeploy - 1) < 0.2,
    [r.chutes, r.D, r.tDeploy],
  );
  ok("one parachute, one altimeter: no main charge listed", !r.charges.some((c) => /^Main/.test(c.what)), r.charges);
  r = await p.evaluate(() => fly({ recSolo: "main", a1Main: 91.44 }));
  ok(
    "one parachute at the main charge: no drogue, opens at 300 ft",
    r.chutes[0].deploy === "altitude" &&
      Math.abs(r.chutes[0].alt - 91.44) < 0.01 &&
      r.D.recovery === "dual" &&
      r.charges.some((c) => c.what === "Separation") &&
      r.charges.some((c) => /^Main/.test(c.what)),
    [r.chutes, r.D, r.charges],
  );
  r = await p.evaluate(() => fly({ recSolo: "apogee", crOn: true, crAlt: 91.44 }));
  ok(
    "one parachute, altimeter and chute release: bundled out at apogee, opens at 300 ft",
    r.chutes[0].rel &&
      Math.abs(r.chutes[0].alt - 91.44) < 0.01 &&
      r.charges.some((c) => c.who === "Chute release") &&
      r.charges.some((c) => /bundled/.test(c.what)),
    [r.chutes, r.charges],
  );
  f = await fields("one");
  ok(
    "builder, one parachute: where it opens is asked, and the parachute has no role field",
    f.ids.includes("recSolo") &&
      !f.ids.includes("a1Main") &&
      !f.chute.includes("role") &&
      !f.chute.includes("deploy") &&
      /Recovery/.test(f.note),
    f,
  );
  f = await fields("one", { recSolo: "main" });
  ok("builder, one parachute at the main charge: the main height shows", f.ids.includes("a1Main"), f.ids);

  ok("no page errors", errs.length === 0, errs);
  console.log(`${checks} checks, ${fails} failed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.log("FAIL " + e.message);
  process.exit(1);
});
