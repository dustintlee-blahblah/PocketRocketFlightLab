// The CAD export (STEP, and STL from the same solid), checked on the geometry it writes (no browser): for each rocket below the file reads back as ONE
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
  const entry = `export { buildStep, buildStl } from ${JSON.stringify(path.join(root, "src/js/builder/step-export.js"))};
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
  const { buildStep, buildStl, bldDefault, bldNew } = await import(out);
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
    // the same solid as an STL mesh: closed and holding the solid's volume (buildStl throws if not), a well-formed
    // binary file, and the fine mesh closer to the solid than the coarse one
    try {
      const c = buildStl(r.shape, "coarse", r.info.volume),
        f = buildStl(r.shape, "fine", r.info.volume),
        dv = new DataView(f.data);
      ok(
        c.triangles > 100 && f.triangles > c.triangles,
        `${label}: STL coarse ${c.triangles}, fine ${f.triangles} triangles`,
      );
      ok(
        dv.getUint32(80, true) === f.triangles && f.data.byteLength === 84 + 50 * f.triangles,
        `${label}: STL file well formed`,
      );
      // read back as another program would: points matched by the numbers in the file; no triangle without area,
      // and every edge used as often one way as the other (a closed surface)
      for (const [q, st] of [
        ["coarse", c],
        ["fine", f],
      ]) {
        const d = new DataView(st.data),
          ids = new Map(),
          E = new Map();
        let o = 84,
          flat = 0;
        for (let i = 0; i < st.triangles; i++, o += 50) {
          const v = [0, 1, 2].map((e) => {
            const k = [0, 1, 2].map((j) => d.getFloat32(o + 12 + 12 * e + 4 * j, true)).join(",");
            if (!ids.has(k)) ids.set(k, ids.size);
            return ids.get(k);
          });
          if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) flat++;
          for (const [x, y] of [
            [v[0], v[1]],
            [v[1], v[2]],
            [v[2], v[0]],
          ]) {
            const k = x < y ? x + "_" + y : y + "_" + x;
            E.set(k, (E.get(k) || 0) + (x < y ? 1 : -1));
          }
        }
        let holes = 0;
        for (const n of E.values()) if (n !== 0) holes++;
        ok(
          holes === 0 && flat === 0,
          `${label}: STL ${q} file is a closed surface (${holes} open edges, ${flat} flat triangles)`,
        );
      }
      ok(
        r.info.volume - f.volume < r.info.volume - c.volume && f.volume > 0.999 * r.info.volume,
        `${label}: STL fine mesh within 0.1% of the solid's volume`,
      );
    } catch (e) {
      ok(false, `${label}: STL (${e.message})`);
    }
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
  // a free-form fin with an airfoil or double-wedge section is built from true chordwise sections (not a strip cut
  // square to each edge, which left a slab of full thickness under the tip): what it removes from the slab is the
  // section's own share, whatever the outline. An airfoil with a 0.3 mm edge flat on a 3 mm fin keeps 70% of the slab
  // (two parabolas from the flat to full thickness at mid-chord), a double wedge 55%
  for (const [name, outline] of [
    ["pointed", pts],
    ["flat-topped", "0,0\n0.158,0.08\n0.195,0.08\n0.224,0.068\n0.252,0\n"],
  ]) {
    const P = outline
      .trim()
      .split("\n")
      .map((l) => l.split(",").map(Number));
    let A = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[(i + 1) % P.length];
      A += (P[i][0] * q[1] - q[0] * P[i][1]) / 2;
    }
    const slabs = 3 * 0.003 * Math.abs(A) * 1e9;
    const sqr = await run(
      `${name} free-form fins`,
      make(0, (f) => Object.assign(f, { shape: "freeform", pts: outline, t: 0.003, edge: "square", n: 3 })),
    );
    for (const [e, keep] of [
      ["airfoil", 0.7],
      ["doublewedge", 0.55],
    ]) {
      const r = await run(
        `${name} free-form ${e} fins`,
        make(0, (f) => Object.assign(f, { shape: "freeform", pts: outline, t: 0.003, edge: e, n: 3 })),
      );
      const took = (sqr.info.volume - r.info.volume) / slabs;
      ok(
        r.info.warnings.length === 0 && Math.abs(took - (1 - keep)) < 0.04,
        `${name} free-form ${e} fins keep ${((1 - took) * 100).toFixed(1)}% of the slab (${keep * 100}%: true chordwise sections)`,
      );
    }
  }
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
  // a short solid lug is a rail button drawn the old OpenRocket way: it comes out round (a base, a neck and a flange),
  // so it holds well under what a block of its length, width and height would; a long solid lug is still a block
  {
    const solidLug = (len) => Object.assign(bldNew("lug", 0.0125), { od: 0.0095, id_: 0, len, kind: "" });
    const vol = async (label, len) =>
      (
        await run(
          label,
          make(0, (f, m) => (bare(m), tubeOf(m).kids.push(solidLug(len)))),
        )
      ).info.volume - none.info.volume;
    const short = await vol("rail button drawn as a short solid lug", 0.0095),
      long = await vol("rail guide (a long solid lug)", 0.05);
    ok(short > 150 && short < 0.6 * 9.5 * 9.5 * 9.5, `a short solid lug is a round button (${short.toFixed(0)} mm3)`);
    ok(long > 0.8 * 50 * 9.5 * 9.5, `a long solid lug is a block (${long.toFixed(0)} mm3)`);
  }
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
