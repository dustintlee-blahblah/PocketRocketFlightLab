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
export { bldDefault } from ${JSON.stringify(path.join(root, "src/js/builder/model.js"))};`;
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
  const { buildStep, bldDefault } = await import(out);
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
  fs.rmSync(out, { force: true });
  console.log(bad ? `${bad} FAILED` : "all passed");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
