// The STEP export, checked on the geometry it writes (no browser): for each rocket below the file reads back as ONE
// closed solid with the same volume it was built with, 24 in rockets are 609.6 mm long (full size, millimetres),
// the fin fillet adds material, fins that hang past the base keep the file whole, and a fin set on a boattail gives
// the warning instead of a broken file.
// usage: node tests/step-export.js
"use strict";
const path = require("path");
const os = require("os");
const fs = require("fs");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const out = path.join(os.tmpdir(), `step-test-${process.pid}.mjs`);
let bad = 0;
const ok = (c, msg) => {
  console.log(c ? "ok  " : "FAIL", msg);
  if (!c) bad++;
};

(async () => {
  const entry = `export { buildStep } from ${JSON.stringify(path.join(root, "src/js/builder/step-export.js"))};
export { bldDefault, bldNew } from ${JSON.stringify(path.join(root, "src/js/builder/model.js"))};`;
  await esbuild.build({
    stdin: { contents: entry, resolveDir: root },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: out,
    logLevel: "error",
  });
  const R = await import("replicad");
  const oc = await (
    await import("replicad-opencascadejs")
  ).default({
    locateFile: (f) => path.join(root, "node_modules/replicad-opencascadejs/dist", f),
  });
  R.setOC(oc);
  const { buildStep, bldDefault, bldNew } = await import(out);
  const make = (fillet, f) => {
    const m = bldDefault();
    m.settings.finFillet = fillet;
    const fin = m.stages[0].parts[1].kids.find((k) => k.type === "fins");
    if (f) f(fin, m);
    return m;
  };
  const run = async (label, m) => {
    const r = await buildStep(R, m);
    const sh = await R.importSTEP(new Blob([r.text]));
    ok((r.text.match(/MANIFOLD_SOLID_BREP/g) || []).length === 1, `${label}: one solid`);
    ok((r.text.match(/CLOSED_SHELL/g) || []).length === 1, `${label}: one closed shell`);
    ok(
      Math.abs(R.measureVolume(sh) - r.info.volume) < 1e-3 * r.info.volume,
      `${label}: reads back with the same volume`,
    );
    return r;
  };

  const a = await run("default 2 mm fillet", make(0.002));
  const b = await run("no fillet", make(0));
  ok(a.info.volume > b.info.volume, "the fillet adds material");
  ok(
    a.info.filletMethod !== "trimmed",
    "the fillet flows round the rounded fin edges onto the tube (" + a.info.filletMethod + ")",
  );
  for (const [shape, e] of [
    ["trapezoid", "beveled"],
    ["trapezoid", "airfoil"],
    ["elliptical", "beveled"],
    ["elliptical", "airfoil"],
    ["freeform", "beveled"],
    ["freeform", "doublewedge"],
  ]) {
    const r = await run(
      `${shape} ${e} with fillet`,
      make(0.002, (f) => {
        f.shape = shape;
        f.edge = e;
        f.t = 0.003;
        if (shape === "freeform") f.pts = "0,0\n0.05,0.06\n0.09,0.07\n0.11,0.04\n0.16,0.0\n";
      }),
    );
    ok(r.info.filletMethod !== "trimmed", `the fillet flows round ${shape} ${e} fin edges (${r.info.filletMethod})`);
  }
  // rounded fins ending flush with the tube's end, a 6 mm fillet; and a square leading edge with a tapered trailing one
  for (const [name, set] of [
    ["6 mm fillet, rounded fins flush with the base", (f) => (f.edge = "rounded")],
    ["tapered trailing edge", (f) => Object.assign(f, { edge: "square", edgeTE: "sharp" })],
  ]) {
    const r = await run(name, make(0.006, set));
    ok(r.info.filletMethod !== "trimmed", `${name}: the fillet follows the fin (${r.info.filletMethod})`);
  }
  // a big fillet (0.7 in) on thick, swept, bevelled fins still flows round the bevels and the edge
  {
    const r = await run(
      "0.7 in fillet, swept bevelled fins",
      make(0.0178, (f) => Object.assign(f, { edge: "beveled", t: 0.0048, sweep: 0.08, tip: 0.06 })),
    );
    ok(r.info.filletMethod !== "trimmed", `a 0.7 in fillet flows round swept bevelled fins (${r.info.filletMethod})`);
  }

  ok(
    Math.abs(a.info.volume - b.info.volume - 640) < 150,
    `2 mm fillet volume near 640 mm3 (${(a.info.volume - b.info.volume).toFixed(0)})`,
  );
  ok(a.info.length > 100 && a.info.length < 5000, `length in millimetres (${a.info.length.toFixed(1)})`);
  await run(
    "four elliptical fins",
    make(0.002, (f) => ((f.shape = "elliptical"), (f.n = 4))),
  );
  await run(
    "one fin",
    make(0.002, (f) => (f.n = 1)),
  );
  const over = await run(
    "fins hanging over the base",
    make(0.002, (f) => (f.pos = -0.07)),
  );
  ok(over.info.length >= a.info.length - 1e-6, "length includes the overhanging fins");
  await run(
    "von Karman nose",
    make(0.002, (f, m) => ((m.stages[0].parts[0].shape = "haack"), (m.stages[0].parts[0].param = 0))),
  );
  // edge sections on a 3 mm trapezoid fin set: each one removes about what the weight model says it does
  const slab = (e) =>
    run(
      `${e} edges`,
      make(0, (f) => ((f.t = 0.003), (f.edge = e), (f.n = 3))),
    );
  const sq = await slab("square");
  const cut = async (e, lo, hi) => {
    const r = await slab(e),
      d = sq.info.volume - r.info.volume;
    ok(d > lo && d < hi, `${e} edges take ${d.toFixed(0)} mm3 off the slabs (${lo}-${hi})`);
  };
  await cut("rounded", 300, 600);
  await cut("beveled", 11000, 14500);
  await cut("airfoil", 18000, 25000);
  await cut("doublewedge", 25000, 38000);
  const bev = make(0, (f) => ((f.t = 0.003), (f.edge = "beveled")));
  const thin = await buildStep(R, bev, { edgeFlat: 0.0005 }),
    thick = await buildStep(R, bev, { edgeFlat: 0.002 });
  ok(thin.info.volume < thick.info.volume, "a wider edge flat leaves more fin");
  const ellSq = await run(
    "elliptical fins",
    make(0, (f) => ((f.shape = "elliptical"), (f.t = 0.003), (f.edge = "square"))),
  );
  const ell = await run(
    "elliptical fins with bevels",
    make(0, (f) => ((f.shape = "elliptical"), (f.t = 0.003), (f.edge = "beveled"))),
  );
  const ellCut = ellSq.info.volume - ell.info.volume;
  ok(
    ell.info.warnings.length === 0 && ellCut > 17000 && ellCut < 24000,
    `elliptical bevels take ${ellCut.toFixed(0)} mm3 off the fins (17000-24000)`,
  );
  const pts = "0,0\n0.05,0.06\n0.09,0.07\n0.11,0.04\n0.16,0.0\n";
  const ffSq = await run(
    "free-form fins",
    make(0, (f) => Object.assign(f, { shape: "freeform", pts, t: 0.003, edge: "square" })),
  );
  const ff = await run(
    "free-form fins with bevels",
    make(0, (f) => Object.assign(f, { shape: "freeform", pts, t: 0.003, edge: "beveled" })),
  );
  ok(
    ff.info.warnings.length === 0 && ffSq.info.volume - ff.info.volume > 10000,
    "free-form bevels take material off the fins",
  );
  // parts that stand out from the body are in the file, each joined to it as one solid
  const tubeOf = (m) => m.stages[0].parts[1];
  const bare = (m) => (tubeOf(m).kids = tubeOf(m).kids.filter((k) => k.type !== "buttons"));
  const none = await run(
    "no rail buttons",
    make(0, (f, m) => bare(m)),
  );
  const withBtn = await run("rail buttons", make(0));
  ok(withBtn.info.volume - none.info.volume > 400, "the rail buttons add material");
  // the rail buttons stand halfway between two fins, whatever direction the file gave them
  for (const [n, rot] of [
    [3, 0],
    [4, 0],
    [4, 30],
  ]) {
    const set = (f, m) => ((f.n = n), (f.rot = rot), m);
    const a = await R.importSTEP(new Blob([(await buildStep(R, make(0, set))).text])),
      b = await R.importSTEP(
        new Blob([
          (
            await buildStep(
              R,
              make(0, (f, m) => (set(f, m), bare(m))),
            )
          ).text,
        ]),
      );
    const bb = a.cut(b).boundingBox,
      c = bb.center,
      ang = (((Math.atan2(c[2], c[1]) * 180) / Math.PI - rot + 720) % (360 / n)) - 180 / n;
    ok(Math.abs(ang) < 1, `rail buttons midway between ${n} fins at ${rot} deg (${ang.toFixed(2)} deg off)`);
  }
  const add = async (label, build) => {
    const r = await run(
      label,
      make(0, (f, m) => (bare(m), tubeOf(m).kids.push(build()))),
    );
    ok(
      r.info.volume > none.info.volume + 100,
      `${label} adds material (${(r.info.volume - none.info.volume).toFixed(0)} mm3)`,
    );
  };
  await add("launch lug", () => bldNew("lug", 0.0125));
  await add("rail lug", () => Object.assign(bldNew("lug", 0.0125), { kind: "r1515", dir: 90 }));
  for (const sh of ["bluff", "ramp", "round", "faired", "flyaway"])
    await add(`${sh} protuberance`, () => Object.assign(bldNew("bump", 0.0125), { shape: sh, ang: 45 }));
  fs.rmSync(out, { force: true });
  console.log(bad ? `${bad} FAILED` : "all passed");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
