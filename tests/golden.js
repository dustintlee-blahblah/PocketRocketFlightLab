#!/usr/bin/env node
/*
 * Golden-output regression test for Pocket Rocket Flight Lab.
 *
 * Opens the built app in headless Chromium, flies a set of rocket design files under several conditions, and records
 * everything the app computes from them: flight results, the stability margin, RSO Checklist items, result flags, charge
 * and deployment timing, aerodynamic coefficients, the drag table, Monte Carlo dispersion, the text of the Results and
 * Motor tabs, and the .ork file the app would save. "record" writes that snapshot; "check" flies everything again and
 * reports any difference. Use it to prove that a change which should not alter behavior (formatting, comments,
 * refactoring) really doesn't.
 *
 *   node tests/golden.js record <snapshot.json> [--html app.html] [--fixtures dir1:dir2]
 *   node tests/golden.js check  <snapshot.json> [--html app.html] [--fixtures dir1:dir2]
 *
 * Design files (.ork, .rkt) are read from the fixture folders (default: $PR_FIXTURES), plus the app's built-in examples.
 * --no-fixtures flies the built-in examples only.
 *
 * After the design files it flies designs made in the builder, for what the examples don't have (stages, a cluster,
 * each rail guide, a protuberance on one side, canted fins, a file whose motor is missing or
 * ambiguous), and records the motor list and where each motor id of the earlier lists leads. A feature that changes
 * the flight gets a case there (the "built" list).
 *
 * tests/golden-snapshot.json is the committed snapshot of the built-in examples; `npm test` checks it, and
 * `npm run test:record` records it again after a change that is meant to alter results (say which in the commit).
 * Larger local snapshots with your own design files stay out of the repository.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const mode = args[0];
const snapFile = args[1];
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const html = path.resolve(opt("--html", path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html")));
const fixtureDirs = args.includes("--no-fixtures")
  ? []
  : (opt("--fixtures", process.env.PR_FIXTURES || "") || "").split(":").filter(Boolean);
const jspdf = path.join(__dirname, "..", "android", "app", "src", "main", "assets", "jspdf.umd.min.js");
if (!["record", "check"].includes(mode) || !snapFile) {
  console.error(
    "usage: node tests/golden.js record|check <snapshot.json> [--html app.html] [--fixtures dir1:dir2 | --no-fixtures]",
  );
  process.exit(2);
}

// the other motor each built-in example flies in its "motors" case, by id: a motor added to or dropped from the list
// then leaves these cases alone. (Your own design files take one three-quarters up the list of motors that fit.)
const OTHER_MOTOR = [
  "a-5f4294d20002e90000000801", // Big Bertha: AeroTech D2.3T
  "a-5f4294d20002e900000005ec", // Cesaroni 1951K1250
  "a-5f4294d20002e90000000057", // AeroTech J420R
  "a-5f4294d20002e90000000057",
  "a-5f4294d20002e90000000057",
];

// the design files to fly
const files = [];
for (const d of fixtureDirs)
  for (const f of fs.readdirSync(d).sort()) if (/\.(ork|rkt)$/i.test(f)) files.push(path.join(d, f));

/* ---- runs inside the page ---- */
// a deterministic page: seeded random numbers, a fixed clock and ids, so two runs give identical output
const INIT = `(()=>{window.PR_EXPOSE=true;let s=123456789;Math.random=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648;};window.PR_SEED=()=>{s=123456789;};
  const T0=Date.UTC(2026,10,1,18,0,0);const RD=Date;let tick=0;
  class FD extends RD{constructor(...a){if(a.length)super(...a);else super(T0+(tick++));}static now(){return T0+(tick++);}}
  window.Date=FD;let n=0;if(window.crypto)try{crypto.randomUUID=()=>"00000000-0000-4000-8000-"+String(++n).padStart(12,"0");}catch(e){}
  try{sessionStorage.setItem("rfs-splash","1");}catch(e){}})();`;

// everything the app computes for the loaded design, as plain data
async function snapshot(page, label) {
  return page.evaluate(async (label) => {
    const r = (v) => (typeof v === "number" ? (isFinite(v) ? +v.toPrecision(12) : String(v)) : v);
    const flat = (o, depth = 0) => {
      if (o == null || typeof o !== "object") return r(o);
      if (Array.isArray(o))
        return o.length > 60
          ? {
              n: o.length,
              h: JSON.stringify(o.map(r)).length,
              s: o.filter((_, i) => i % Math.ceil(o.length / 30) === 0).map((x) => flat(x, depth + 1)),
            }
          : o.map((x) => flat(x, depth + 1));
      if (depth > 3) return "…";
      const out = {};
      for (const k of Object.keys(o).sort()) if (typeof o[k] !== "function") out[k] = flat(o[k], depth + 1);
      return out;
    };
    // ids and run times differ between runs: masked
    const mask = (t) =>
      String(t)
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "UUID")
        .replace(/(\d+ flights in )\d+( s)/g, "$1N$2");
    const res = { label };
    try {
      runAll();
      const { st, out, S, m, D: RD, L: RL } = lastSim;
      res.st = flat(st);
      res.out = flat(out);
      res.S = flat(S);
      res.motor = [m.id, m.name, m.tb, m.Itot];
      res.rso = rsoChecks(st, S, m, RD, RL).map((c) => [c.s, c.label, c.val, c.why]);
      res.flags = resultFlags(st, S, m, RD);
      res.charges = chargeEvents(st, RD, out).map((e) => [e.name, r(e.t)]);
      const A = aero(RD);
      res.aero = [0.3, 0.8, 0.95, 1.2, 2, 3].map((M) => {
        const C = cnaPartsM(A, M),
          atm = atmosphere(RL, 0),
          d = cdParts(A, M * atm.a, atm, 0);
        return [M, r(C.cn), r(C.cp), r(d.cd), r(d.friction), r(d.pressure), r(d.base)];
      });
      res.windTable = flat(lastSim.windTable);
      res.mdnote = document.getElementById("mdnote") ? document.getElementById("mdnote").textContent : null;
      if (BLD) {
        const x = mask(bldToOrk(BLD, L));
        res.ork = x.length + ":" + x.slice(0, 6000);
      }
      L.mcN = 20;
      await runMC();
      res.mc = lastMC ? flat({ ...lastMC, secs: 0, when: 0 }) : null;
      // read after the Monte Carlo run, so the tab's dispersion panel is this case's and not the one before's
      {
        // without the two hidden notes that keep an earlier flight's text (the Staging panel of a staged flight, and
        // what the design file's own simulation reported), so a case doesn't carry the case before it
        const v = document.getElementById("v-results").cloneNode(true);
        v.querySelectorAll("#stagepanel[hidden], #orkref[hidden]").forEach((e) => e.remove());
        res.results = mask(v.innerText).slice(0, 20000);
      }
      // what opening or building the design reported, the other stages' motors, and the rail-guide check on each pad
      res.report = mask(document.getElementById("orkreport").textContent.replace(/\s+/g, " ").trim()).slice(0, 4000);
      res.stageMotors = [RD.twoStage ? curBoost().id : null, RD.s1 ? curFirst().id : null];
      res.guide = ["", "tower", "rod18", "rod316", "rod14", "r1010", "r1515"].map((rt) => [
        rt,
        padGuideCheck(rt, true),
      ]);
    } catch (e) {
      res.error = String((e && e.stack) || e).slice(0, 500);
    }
    return res;
  }, label);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(/jspdf\.umd\.min\.js$/, (route) =>
    route.fulfill({ path: jspdf, contentType: "application/javascript" }),
  );
  await page.addInitScript(INIT);
  await page.goto("file://" + html);
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      /* private mode */
    }
    const d = document.getElementById("legal");
    if (d) d.hidden = true;
  });

  const results = {};
  const fly = async (key, setup) => {
    await page.evaluate(setup.fn, setup.arg);
    results[key] = await snapshot(page, key);
    process.stdout.write(".");
  };
  // open a design file, or a built-in example by index
  const open = async (src) =>
    page.evaluate(async (src) => {
      if (src.example != null) {
        window.PR_NO_ASK = true; // open the example as the file says, without asking which run
        await openExample(src.example);
        return;
      }
      const u = Uint8Array.from(atob(src.b64), (c) => c.charCodeAt(0));
      const xml = await unzipOrk(u.buffer);
      await loadDesignXml(xml, src.name, u.buffer);
      renderMotors();
    }, src);
  const sources = [
    ...files.map((f) => ({
      key: path.basename(f),
      name: path.basename(f),
      b64: fs.readFileSync(f).toString("base64"),
    })),
    ...[0, 1, 2, 3, 4].map((i) => ({ key: "example-" + i, example: i, other: OTHER_MOTOR[i] })),
  ];
  for (const src of sources) {
    try {
      await open(src);
    } catch (e) {
      results[src.key] = { error: "open: " + e };
      continue;
    }
    const base = {
      fn: (a) => {
        L.wind = a.w;
        L.angle = a.a;
        L.turb = a.t;
      },
      arg: null,
    };
    await fly(src.key + "|calm", { ...base, arg: { w: 0, a: 0, t: 0 } });
    await fly(src.key + "|wind", { ...base, arg: { w: 6, a: 5, t: 0.15 } });
    // two other motors that fit, and each delay setting
    await fly(src.key + "|motors", {
      fn: (other) => {
        L.wind = 3;
        L.angle = 3;
        L.turb = 0;
        const cur = curMotor(),
          fit = allMotors()
            .filter((x) => Math.abs(x.dia - cur.dia) < 0.001)
            .sort((a, b) => mstats(a).I - mstats(b).I || (a.id < b.id ? -1 : 1));
        const m = (other && findMotor(other)) || fit[Math.floor(fit.length * 0.75)];
        if (m) {
          motorId = m.id;
          renderMotors();
        }
      },
      arg: src.other || null,
    });
    for (const dl of [null, 0, 4, 9.5])
      await fly(src.key + "|delay=" + dl, {
        fn: (v) => {
          mdSet("sustainer", v);
        },
        arg: dl,
      });
    // a saved file, opened again
    await fly(src.key + "|reopen", {
      fn: async () => {
        const x = bldToOrk(BLD, L);
        await loadDesignXml(x, "again.ork", null);
        renderMotors();
      },
      arg: null,
    });
  }

  /* ---- designs made in the builder ----
     What the built-in examples don't have: stages, a cluster, each kind of rail guide, a protuberance off to one
     side, canted fins, fins with a trailing edge unlike the leading one, and a file whose motor isn't in the list or
     fits several. Each starts from the builder's new design with its motors named by id. They run after the
     examples, and each starts the random numbers again, so adding or changing one moves no other case. (The example
     cases above share one run of random numbers, as they always have: a change to one example's dispersion run
     moves the ones after it.) */
  const G80 = "a-5f4294d20002e900000007dd", // AeroTech G80T, 29 mm
    H128 = "a-5f4294d20002e9000000000d"; // AeroTech H128W, 29 mm
  await page.evaluate(
    ([G80, H128]) => {
      const G = (window.G = {});
      G.tube = () => BLD.stages[0].parts.find((q) => q.type === "tube");
      G.kid = (t) => G.tube().kids.find((k) => k.type === t);
      /** the new design on a G80T in a light wind, changed by f, then made the design that flies */
      G.start = (f) => {
        window.PR_NO_ASK = true;
        // its own random numbers and launch settings, so no case here depends on the ones before it
        PR_SEED();
        setL(defaultLaunch());
        bldNewDesign();
        setMotorId(G80);
        L.wind = 3;
        L.angle = 0;
        L.turb = 0;
        L.railType = "r1010";
        if (f) f();
        bldChanged(true);
        bldApply();
        renderMotors();
      };
      /** swaps the rail buttons for another rail guide */
      G.guide = (part) => {
        const t = G.tube();
        t.kids = t.kids.filter((k) => k.type !== "buttons");
        t.kids.push(part);
      };
      /** the builder's own Add a stage button */
      G.addStage = () => {
        bldRender();
        if (!document.querySelector('[data-stage="add"]')) document.querySelector(".bldaddtoggle").click();
        document.querySelector('[data-stage="add"]').click();
      };
      G.H128 = H128;
    },
    [G80, H128],
  );
  const R = 0.0333;
  const built = [
    ["new", () => G.start()],
    [
      "fly-away-guide",
      (R) => G.start(() => G.guide({ ...bldNew("bump", R), shape: "flyaway", h: 0.02, len: 0.06, mass: 0.1 })),
    ],
    [
      "rod-lug",
      (R) =>
        G.start(() => {
          G.guide({ ...bldNew("lug", R), kind: "rod14", id_: 0.0072, od: 0.0081 });
          L.railType = "rod14";
        }),
    ],
    [
      "rail-lug",
      (R) =>
        G.start(() => {
          G.guide({ ...bldNew("lug", R), kind: "r1515", id_: 0, od: 0.0127, w: 0.0157, mat: "Delrin" });
          L.railType = "r1515";
        }),
    ],
    [
      "side-protuberance",
      (R) => G.start(() => G.tube().kids.push({ ...bldNew("bump", R), w: 0.04, h: 0.05, len: 0.1, mass: 0.06 })),
    ],
    ["canted-fins", () => G.start(() => (G.kid("fins").cant = 2))],
    // a sharp leading edge with a square back, and a rounded front tapered at the back
    [
      "fins-airfoil-square-back",
      () => G.start(() => Object.assign(G.kid("fins"), { edge: "airfoil", edgeTE: "square" })),
    ],
    [
      "fins-rounded-tapered-back",
      () => G.start(() => Object.assign(G.kid("fins"), { edge: "rounded", edgeTE: "sharp", bevTE: 0.02 })),
    ],
    ["cluster", () => G.start(() => (G.kid("mount").cluster = "double"))],
    [
      "two-stage",
      () =>
        G.start(() => {
          G.addStage();
          setBoostId(G.H128);
          BLD.stages[0].ignDelay = 0.5;
        }),
    ],
    [
      "three-stage",
      () =>
        G.start(() => {
          G.addStage();
          G.addStage();
          setBoostId(G.H128);
          setFirstId(G.H128);
        }),
    ],
  ];
  for (const [key, fn] of built) {
    await fly("builder|" + key, { fn, arg: R });
    if (key === "two-stage")
      await fly("builder|two-stage|reopen", {
        fn: async () => {
          await loadDesignXml(bldToOrk(BLD, L), "again.ork", null);
          renderMotors();
        },
        arg: null,
      });
  }
  // the new design's file with another motor named in it: one that isn't in the list (a stand-in flies, and says so),
  // and a name two makers share, with no maker given (the report says which was chosen)
  for (const [key, mfr, name] of [
    ["motor-not-in-list", "<manufacturer>AeroTech</manufacturer>", "Z999"],
    ["motor-name-shared", "", "F50T"],
  ])
    await fly("builder|" + key, {
      fn: async ([mfr, name]) => {
        G.start();
        const x = bldToOrk(BLD, L)
          .replace(/<manufacturer>[^<]*<\/manufacturer>/g, mfr)
          .replace(/<designation>[^<]*<\/designation>/g, `<designation>${name}</designation>`);
        await loadDesignXml(x, "motor.ork", null);
        renderMotors();
      },
      arg: [mfr, name],
    });
  // the motor list itself, and where each motor id of the lists before it leads
  {
    const c = await page.evaluate(() => ({
      motors: allMotors()
        .filter((m) => m.builtin)
        .map((m) => [m.id, m.brand, m.name, Math.round(m.dia * 1e4), +mstats(m).I.toPrecision(6)]),
      old: Object.entries(OLD_MOTOR_IDS).map(([k, v]) => [k, v, !!findMotor(v)]),
    }));
    const h = (o) => crypto.createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 16);
    const makers = {};
    for (const m of c.motors) makers[m[1]] = (makers[m[1]] || 0) + 1;
    results["motor-list"] = {
      label: "motor-list",
      count: c.motors.length,
      makers,
      motors: h(c.motors),
      oldIds: c.old.length,
      oldIdsLost: c.old.filter((o) => !o[2]).map((o) => o[0]),
      oldIdMap: h(c.old),
    };
  }
  await browser.close();
  results.__errors = errors;
  console.log("");

  if (mode === "record") {
    fs.writeFileSync(snapFile, JSON.stringify(results, null, 1) + "\n");
    console.log(
      `recorded ${Object.keys(results).length - 1} cases to ${snapFile}${errors.length ? `, with ${errors.length} page errors` : ""}`,
    );
    return;
  }
  const before = JSON.parse(fs.readFileSync(snapFile, "utf8"));
  let bad = 0;
  const diff = (a, b, p) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p + "." + k);
      return;
    }
    if (bad++ < 40) {
      let i = 0;
      const sa = JSON.stringify(a) || "",
        sb = JSON.stringify(b) || "";
      while (i < sa.length && sa[i] === sb[i]) i++;
      const j = Math.max(0, i - 60);
      console.log(`DIFF ${p}\n   was: …${sa.slice(j, i + 120)}\n   now: …${sb.slice(j, i + 120)}`);
    }
  };
  for (const k of new Set([...Object.keys(before), ...Object.keys(results)])) diff(before[k], results[k], k);
  const h = (o) => crypto.createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 12);
  console.log(
    bad ? `FAIL: ${bad} differences` : `PASS: ${Object.keys(results).length - 1} cases identical (${h(results)})`,
  );
  process.exit(bad ? 1 : 0);
})();
