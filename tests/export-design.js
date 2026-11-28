/**
 * Export (Dustin, Nov 27, 2026): the Rocket tab's Export button writes the open design as an OpenRocket, RASAero II or
 * RockSim file under a name typed in, and leaves the open design and its own file as they are. Checked here:
 *   - the button sits after Open New Design; Save a copy and Export CAD offer nothing of it;
 *   - the box: three formats, OpenRocket chosen to start, the file ending follows the format, a name is needed;
 *   - each format saves a file of that name and kind, says so (and what the format leaves out), and changes nothing
 *     in the open design;
 *   - the OpenRocket file opens again as the same rocket with the same flight;
 *   - the RockSim file (files/rocksim-export.js), read back by the app's own RockSim reader: the five examples and
 *     two- and three-stage rockets come back with the same length, diameter, weight and CG, fins and sections; a
 *     design with one of every kind of part keeps its weight within 0.5% and says what RockSim cannot hold;
 *   - what RockSim keeps beside the parts (seen in RockSim 11 on Nov 27, 2026): a weight for every stage once one is
 *     overridden, a fixed Cd for each airframe, each parachute's deployment, and a simulation with the motors in their
 *     mounts and the launch conditions; all of it read back by the app's reader into the same flight;
 *   - the RockSim file's layout: version 4, parts in millimetres and grams, a free-form fin's outline from the
 *     trailing edge round, serial numbers that count up.
 * (The RASAero II file's contents are checked in tests/rasaero.js.)
 * usage: node tests/export-design.js [page.html]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const html = path.resolve(process.argv[2] || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));

let checks = 0;
const fails = [];
const ok = (what, cond, got) => {
  checks++;
  if (!cond) fails.push(`${what}${got === undefined ? "" : ": " + JSON.stringify(got)}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1e-9, Math.abs(b));

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 412, height: 860 }, acceptDownloads: true });
  p.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    window.PR_NO_ASK = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    sessionStorage.setItem("rfs-splash", "1");
  });
  await p.goto("file://" + html);
  await p.waitForFunction(() => typeof window.openExample === "function");
  const open = (ex) =>
    p.evaluate(async (ex) => {
      const l = document.getElementById("legal");
      if (l) l.hidden = true;
      await openExample(ex);
      showTab("rocket");
    }, ex);

  // ---- the RockSim file, read back by the app's own reader
  const rkt = (setup) =>
    p.evaluate(async (setup) => {
      const l = document.getElementById("legal");
      if (l) l.hidden = true;
      await openExample(setup.ex);
      for (let i = 0; i < (setup.stages || 0); i++) {
        bldRender();
        if (!document.querySelector('[data-stage="add"]')) document.querySelector(".bldaddtoggle").click();
        document.querySelector('[data-stage="add"]').click();
      }
      if (setup.every) {
        // one of every kind of part, each as the builder first adds it
        const tube = BLD.stages[0].parts.find((q) => q.type === "tube"),
          R = tube.od / 2;
        for (const t of setup.every) tube.kids.push(bldNew(t, R));
        BLD.stages[0].parts.push(bldNew("transition", R));
        BLD.stages[0].parts.push(bldNew("tube", R * 0.7));
        // (its example's weight and CG overrides off: every part's own weight is what the file must carry)
        delete BLD.stages[0].known;
        delete BLD.stages[0].knownCg;
      }
      if (setup.stages || setup.every) bldChanged(true);
      const ork = bldToOrk(BLD, L),
        { text, notes } = orkToRkt(ork),
        pick = (r) => {
          const d = r.design;
          return {
            L: d.length,
            d: d.diameter,
            dry: d.dryMass,
            cg: d.cgEmpty,
            segs: bodySegments(d).map((g) => [g.kind, +g.len.toFixed(5), +(2 * g.r2).toFixed(5)]),
            fins: finSetsOf(d).map((f) => [f.n, +f.a.toFixed(5), +f.s.toFixed(5), +f.xLead.toFixed(5), f.edge]),
            area: finSetsOf(d).map((f) => +finGeom(f).area.toFixed(7)),
            chutes: [d.mainDia, d.drogueDia].map((v) => +(+v || 0).toFixed(4)),
          };
        };
      return { own: pick(parseOrk(ork)), back: pick(parseRkt(text)), text, notes, ork };
    }, setup);
  const sameShape = (t, r, mTol) => {
    ok(`${t}: length`, near(r.back.L, r.own.L, 1e-6), [r.back.L, r.own.L]);
    ok(`${t}: diameter`, near(r.back.d, r.own.d, 1e-6), [r.back.d, r.own.d]);
    ok(`${t}: weight without motors`, near(r.back.dry, r.own.dry, mTol), [r.back.dry, r.own.dry]);
    ok(`${t}: the body's sections`, JSON.stringify(r.back.segs) === JSON.stringify(r.own.segs), r.back.segs);
    ok(`${t}: the fin sets`, JSON.stringify(r.back.fins) === JSON.stringify(r.own.fins), [r.back.fins, r.own.fins]);
    ok(`${t}: the fins' area`, JSON.stringify(r.back.area) === JSON.stringify(r.own.area), [r.back.area, r.own.area]);
    ok(
      `${t}: motors and launch conditions are said to be left to RockSim`,
      /Not in the file: motors/.test(r.notes.join(" ")),
    );
  };
  let exA = null;
  for (const ex of [0, 1, 2, 3, 4]) {
    const r = await rkt({ ex }),
      t = `example ${ex} as a RockSim file`;
    if (ex === 0) exA = r;
    sameShape(t, r, 1e-6);
    ok(`${t}: CG without motors`, near(r.back.cg, r.own.cg, 1e-5), [r.back.cg, r.own.cg]);
    ok(`${t}: the parachutes' sizes`, JSON.stringify(r.back.chutes) === JSON.stringify(r.own.chutes), r.back.chutes);
  }
  for (const stages of [1, 2]) {
    const r = await rkt({ ex: 2, stages }),
      t = `a ${stages + 1}-stage rocket as a RockSim file`;
    sameShape(t, r, 1e-6);
    ok(`${t}: CG without motors`, near(r.back.cg, r.own.cg, 1e-5), [r.back.cg, r.own.cg]);
    ok(
      `${t}: its stages`,
      new RegExp(`<StageCount>${stages + 1}</StageCount>`).test(r.text) &&
        /<Stage2Parts><BodyTube>/.test(r.text) &&
        (stages > 1 ? /<Stage1Parts><BodyTube>/ : /<Stage1Parts\/>/).test(r.text),
    );
    ok(
      `${t}: with a weight override on one stage, every stage's weight is written (RockSim's switch is all or nothing)`,
      /<UseKnownMass>1</.test(r.text) &&
        /<Stage3Mass>[1-9]/.test(r.text) &&
        /<Stage2Mass>[1-9]/.test(r.text) &&
        (stages > 1 ? /<Stage1Mass>[1-9]/ : /<Stage1Mass>0\.</).test(r.text) &&
        /<Stage32CG>[1-9]/.test(r.text) &&
        /<Stage2CGAlone>[1-9]/.test(r.text),
      (r.text.match(/<Stage3Mass>.*?<CPCalcFlags>/) || [])[0],
    );
  }
  const all = await rkt({
    ex: 2,
    every: [
      "inner",
      "ring",
      "bulkhead",
      "coupler",
      "lug",
      "buttons",
      "chute",
      "streamer",
      "cord",
      "mass",
      "bump",
      "fins",
    ],
  });
  sameShape("one of every kind of part as a RockSim file", all, 5e-3);
  for (const tag of [
    "NoseCone",
    "BodyTube",
    "Transition",
    "FinSet",
    "CustomFinSet",
    "Ring",
    "LaunchLug",
    "Parachute",
    "Streamer",
    "MassObject",
  ])
    ok(`one of every kind of part: a ${tag} is written`, all.text.includes(`<${tag}>`));
  ok(
    "rings say what they are: centering ring, bulkhead, coupler",
    ["0", "1", "4"].every((c) => all.text.includes(`<UsageCode>${c}</UsageCode>`)),
  );
  // sizes left to fit the tube. OpenRocket 24.12 (seen Nov 27, 2026) takes the word "auto" alone for a ring's,
  // bulkhead's or coupler's radius and turns down "auto" with a number after it ("Invalid parameter encountered,
  // ignoring"); the RockSim file gets the tube's bore worked out
  {
    const rings = all.ork.match(/<(centeringring|bulkhead|tubecoupler)>.*?<\/\1>/gs) || [],
      radii = rings.flatMap((r) => r.match(/<(?:outer|inner)radius>[^<]*/g) || []);
    ok(
      "rings left to fit their tube are written to OpenRocket as “auto”",
      radii.some((r) => /radius>auto$/.test(r)),
      radii,
    );
    ok("and never as “auto” with a number after it", !radii.some((r) => /auto\s+\S/.test(r)), radii);
    const ods = [...all.text.matchAll(/<Ring>.*?<OD>([\d.]+)<\/OD><ID>([\d.]+)<\/ID>/gs)].map((m) => [+m[1], +m[2]]);
    ok("every ring in the RockSim file has a size", ods.length >= 3 && ods.every(([od, id]) => od > 0 && id < od), ods);
  }
  ok(
    "an inner tube is a body tube marked inside",
    /<IsInsideTube>1</.test(all.text) && /<IsMotorMount>1</.test(all.text),
  );
  ok("a shock cord is a mass object of its kind, with its weight", /<TypeCode>1</.test(all.text));
  ok(
    "what RockSim cannot hold is said: rail buttons, protuberance drag",
    /Rail buttons were written as launch lugs/.test(all.notes.join(" ")) &&
      /Protuberances were written as weights/.test(all.notes.join(" ")),
    all.notes,
  );
  // the layout
  ok(
    "version 4, with the design inside",
    /^<RockSimDocument><FileVersion>4<\/FileVersion><DesignInformation><RocketDesign><Name>/.test(exA.text),
  );
  const serials = [...exA.text.matchAll(/<SerialNo>(\d+)</g)].map((m) => +m[1]);
  ok(
    "serial numbers count up from 1, and the last is given",
    serials.every((v, i) => v === i + 1) && exA.text.includes(`<LastSerialNumber>${serials.length}</LastSerialNumber>`),
    serials,
  );
  const ptl = (/<PointList>([^<]*)</.exec(exA.text) || [])[1] || "";
  const pts = ptl
    .split("|")
    .filter(Boolean)
    .map((q) => q.split(",").map(Number));
  ok(
    "a free-form fin's outline runs from the trailing edge of the root round to its leading edge, in millimetres",
    pts.length > 3 &&
      pts[0][0] > 50 &&
      pts[0][1] === 0 &&
      pts[pts.length - 1][0] === 0 &&
      pts[pts.length - 1][1] === 0 &&
      ptl.endsWith("|"),
    ptl,
  );
  ok(
    "lengths in millimetres (the Big Bertha's nose)",
    /<NoseCone>.*?<Len>79\.375<\/Len>/.test(exA.text),
    (/<Len>[^<]*/.exec(exA.text) || [])[0],
  );

  // ---- what RockSim keeps beside the parts: fixed Cd, deployment, motors and launch conditions; all of it read back
  const whole = (setup) =>
    p.evaluate(async (setup) => {
      await openExample(setup.ex);
      for (let i = 0; i < (setup.stages || 0); i++) {
        bldRender();
        if (!document.querySelector('[data-stage="add"]')) document.querySelector(".bldaddtoggle").click();
        document.querySelector('[data-stage="add"]').click();
        setBoostId("a-5f4294d20002e9000000000d");
      }
      if (setup.cd)
        Object.assign(BLD.settings, { cdOverride: 0.55, cdOverrideOn: true, cdOverride2: 0.66, cdOverride2On: true });
      if (setup.cd1) Object.assign(BLD.settings, { cdOverride: 0.55, cdOverrideOn: true });
      if (setup.stages || setup.cd || setup.cd1) bldChanged(true);
      await runNow();
      const now = () => ({
        apogee: lastSim.st.maxAlt,
        motor: motorId,
        boost: D.twoStage ? boostId : null,
        mode: D.deployMode,
        rec: D.recovery,
        mainAlt: D.mainAlt,
        cd: [D.cdOverride, D.cdOverride2].map((v) => +(+v || 0).toFixed(4)),
        dry: +D.dryMass.toFixed(5),
        rail: +L.rail.toFixed(4),
        wind: +L.wind.toFixed(3),
        tempC: +L.tempC.toFixed(1),
      });
      const own = now(),
        { text, notes } = orkToRkt(bldToOrk(BLD, L), rktExportInfo());
      const opened = await loadDesignXml(text, "back.rkt", new TextEncoder().encode(text).buffer, {
        pick: { kind: "run", i: 0 },
      });
      await runNow();
      return { own, back: now(), opened, text, notes };
    }, setup);
  for (const [name, setup] of [
    ["a dual-deploy rocket", { ex: 3 }],
    ["a motor-ejection rocket", { ex: 0 }],
    ["a two-stage rocket with a fixed Cd for each airframe", { ex: 2, stages: 1, cd: true }],
  ]) {
    const r = await whole(setup),
      { apogee: a0, ...o } = r.own,
      { apogee: a1, ...k } = r.back;
    ok(`${name}, as a RockSim file with its simulation: this app opens it`, r.opened === true);
    ok(
      `${name}: the same motors, recovery, fixed Cd, weight and launch conditions come back`,
      JSON.stringify(k) === JSON.stringify(o),
      [o, k],
    );
    ok(`${name}: and the same flight`, near(a1, a0, 1e-3), [a0, a1]);
    ok(
      `${name}: the simulation is said to be in the file, not yet run`,
      /simulation that hasn’t been run/.test(r.notes.join(" ")),
    );
    if (setup.ex === 3)
      ok(
        "dual deploy: the main opens at its altitude and the drogue at apogee, by each parachute's serial number",
        /<SimulationEventList><SimulationEvent><PartSerialNo>\d+<\/PartSerialNo><Type>5<\/Type><DeployAltitude>152\.4</.test(
          r.text,
        ) && /<Type>4<\/Type><DeployAltitude>0\.</.test(r.text),
        (r.text.match(/<SimulationEventList>.*?<\/SimulationEventList>/) || [])[0],
      );
    if (setup.ex === 3)
      ok(
        "the motor under its full designation and RockSim's name for its maker, in its mount, plugged",
        /<Stage3Engines><EngineSet><EngineCount>1<\/EngineCount><EngineCode>H148R<\/EngineCode>.*?<EngineMfg>Aerotech<\/EngineMfg>.*?<MountSerialNo>\d+<\/MountSerialNo><EjectionDelay>-1\.</.test(
          r.text,
        ),
        (r.text.match(/<Stage3Engines>.*?<\/Stage3Engines>/) || [])[0],
      );
    if (setup.stages)
      ok(
        "two-stage: fixed Cd on, one for each airframe; the booster's motor has the ejection delay RockSim stages on",
        /<CalculateCD>0<\/CalculateCD><FixedCd>0\.55<\/FixedCd><FixedCd2>0\.66<\/FixedCd2>/.test(r.text) &&
          /<Stage2Engines><EngineSet>.*?<EngineCode>H128W<.*?<EjectionDelay>0<\/EjectionDelay>/.test(r.text),
        (r.text.match(/<CalculateCD>.*?<StageCount>/) || [])[0],
      );
  }
  const mixed = await whole({ ex: 2, stages: 1, cd1: true });
  ok(
    "a fixed Cd on one airframe only: RockSim's single switch is said, and the other gets this app's own figure",
    /<CalculateCD>0</.test(mixed.text) &&
      /<FixedCd2>0\.[1-9]/.test(mixed.text) &&
      /one switch for fixed Cd/.test(mixed.notes.join(" ")),
    mixed.notes,
  );
  const none = await whole({ ex: 2 });
  ok("no fixed Cd: RockSim is left calculating its own", /<CalculateCD>1</.test(none.text));

  // ---- the Export box
  await open(2);
  await p.waitForTimeout(400);
  ok(
    "Export sits right after Open New Design",
    await p.evaluate(
      () => document.getElementById("newdesign").nextElementSibling === document.getElementById("exportdesign"),
    ),
  );
  await p.locator("#savecopy").click();
  ok("Save a copy offers no other format", (await p.locator("#namebox select").count()) === 0);
  await p.locator("#namecancel").click();
  await p.locator("#bldstep").click();
  ok("Export CAD offers CAD formats only", (await p.locator('#cadmodal [data-cad="cdx1"]').count()) === 0);
  await p.locator("#cadcancel").click();
  const state = () => p.evaluate(() => [document.getElementById("rfile").textContent, JSON.stringify(BLD), isDirty()]);
  const before = await state();
  await p.locator("#exportdesign").click();
  ok(
    "the box offers OpenRocket, RASAero II and RockSim, OpenRocket chosen",
    JSON.stringify(
      await p.evaluate(() =>
        [...document.querySelectorAll("#exportfmts [data-fmt]")].map((b) => [
          b.dataset.fmt,
          b.getAttribute("aria-checked"),
        ]),
      ),
    ) ===
      JSON.stringify([
        ["ork", "true"],
        ["cdx1", "false"],
        ["rkt", "false"],
      ]),
  );
  ok("the file name starts as the design's", (await p.locator("#exportname").inputValue()).length > 0);
  await p.locator("#exportname").fill("");
  await p.locator("#exportok").click();
  ok(
    "a name is needed",
    /Type a file name/.test(await p.locator("#exporterr").textContent()) && !(await p.locator("#exportbox").isHidden()),
  );
  await p.locator("#exportcancel").click();
  const files = {};
  for (const [fmt, ext, app] of [
    ["rkt", ".rkt", "RockSim"],
    ["cdx1", ".CDX1", "RASAero II"],
    ["ork", ".ork", "OpenRocket"],
  ]) {
    await p.locator("#exportdesign").click();
    await p.locator(`#exportfmts [data-fmt="${fmt}"]`).click();
    ok(`${app}: the ending shown follows the format`, (await p.locator("#exportext").textContent()) === ext);
    await p.locator("#exportname").fill("export test");
    const dl = p.waitForEvent("download", { timeout: 20000 }).catch(() => null);
    await p.locator("#exportok").click();
    const d = await dl;
    ok(
      `${app}: a file of that name and kind is saved`,
      !!d && d.suggestedFilename() === "export test" + ext,
      d && d.suggestedFilename(),
    );
    if (d) files[fmt] = fs.readFileSync(await d.path());
    await p.waitForTimeout(500);
    const said = await p.evaluate(() => document.getElementById("savemsg").textContent);
    ok(
      `${app}: the page says it was exported for ${app}, and that the open design is unchanged`,
      new RegExp(`Exported export test\\${ext} for ${app}`).test(said) && /design open here is unchanged/.test(said),
      said.slice(0, 160),
    );
    if (fmt === "cdx1")
      ok(`${app}: and lists what the file leaves out`, /Not in the file/.test(said), said.slice(-200));
    if (fmt === "rkt")
      ok(
        `${app}: and says its simulation is there to run`,
        /simulation that hasn’t been run/.test(said),
        said.slice(-200),
      );
    ok(
      `${app}: the open design, its file and its unsaved state are as they were`,
      JSON.stringify(await state()) === JSON.stringify(before),
    );
  }
  ok("the RockSim file is one", !!files.rkt && /^<RockSimDocument>/.test(files.rkt.toString("utf8")));
  ok("the RASAero II file is one", !!files.cdx1 && /^<RASAeroDocument>/.test(files.cdx1.toString("utf8")));
  // the OpenRocket file opens again as the same rocket with the same flight
  const fly = () =>
    p.evaluate(async () => {
      await runNow();
      return [lastSim.st.maxAlt, D.length, D.dryMass, motorId];
    });
  const f0 = await fly();
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "export-"));
  fs.writeFileSync(path.join(tmp, "export test.ork"), files.ork || Buffer.alloc(0));
  await p.evaluate(async () => {
    await openExample(0);
    showTab("rocket");
  });
  await p.setInputFiles("#orkfile", path.join(tmp, "export test.ork"));
  await p.waitForTimeout(2500);
  const f1 = await fly();
  ok(
    "the OpenRocket file opens again with the same flight",
    f1.every((v, i) => (typeof v === "number" ? near(v, f0[i], 1e-6) : v === f0[i])),
    [f0, f1],
  );
  fs.rmSync(tmp, { recursive: true, force: true });

  await browser.close();
  console.log(fails.length ? fails.join("\n") : "");
  console.log(`${checks} checks, ${fails.length} failed`);
  process.exitCode = fails.length ? 1 : 0;
})();
