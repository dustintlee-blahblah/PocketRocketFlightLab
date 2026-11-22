#!/usr/bin/env node
/**
 * Measures a fin as the CAD export makes it: builds the rocket's solid, meshes it, and reads the fin's thickness off
 * the mesh, so the shape can be looked at and not only trusted. A closed solid with the right volume can still be the
 * wrong shape (a slab left under a tip, a ridge along a fillet, a fin cut off above a boattail were all found this way).
 *
 *   node tools/fin-sections.js --ork design.ork            a design file (opened by the built page, in a browser)
 *   node tools/fin-sections.js --model model.json          a builder model (JSON.stringify(BLD) from the page)
 *   node tools/fin-sections.js --example 4                 one of the app's examples, by its place in the list
 *     --fillet 17.78     set the fin fillet radius, mm (default: the design's)
 *     --out DIR          where the picture goes (default test-results/fin-sections)
 *     --stl              also write the fine STL there
 *
 * Prints, at five heights up the fin, where its leading and trailing edges are, its greatest thickness and where
 * along the chord that is; and writes fin-sections.svg: the thickness over the fin seen from the side (the fillet
 * and the body show as the thick band along the root) and the cross-sections along the airflow at those heights.
 * Design files stay outside the repository: give a path to one.
 */
"use strict";
/* global window, document, openExample, openDesignAsk, unzipOrk, BLD */
const path = require("path");
const os = require("os");
const fs = require("fs");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = (k, d = null) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(opt("--out", path.join(root, "test-results", "fin-sections")));

/**
 * The builder model of a design file or an example, read by the built page.
 * @param {{ork?:string, example?:number}} what
 * @returns {Promise<object>}
 */
async function modelFromPage(what) {
  const { chromium } = require("playwright");
  const page = path.join(root, "web", "pocket-rocket-flight-lab.html");
  if (!fs.existsSync(page)) throw new Error("Build the page first: node build.js");
  const b = await chromium.launch();
  try {
    const p = await b.newPage();
    await p.addInitScript(() => {
      window.PR_EXPOSE = true;
      window.PR_NO_ASK = true;
      localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
      sessionStorage.setItem("rfs-splash", "1");
    });
    await p.goto("file://" + page);
    await p.waitForTimeout(1200);
    await p.evaluate(() => (document.getElementById("legal").hidden = true));
    if (what.ork) {
      const b64 = fs.readFileSync(what.ork).toString("base64");
      await p.evaluate(
        async ([b64, name]) => {
          const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          await openDesignAsk(await unzipOrk(u.buffer), name, u.buffer);
        },
        [b64, path.basename(what.ork)],
      );
    } else await p.evaluate((i) => openExample(i), what.example);
    await p.waitForTimeout(800);
    return JSON.parse(await p.evaluate(() => JSON.stringify(BLD)));
  } finally {
    await b.close();
  }
}

/** A colour from dark blue (0) through green to yellow (1). */
const colour = (u) => {
  const S = [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ];
  const q = Math.min(Math.max(u, 0), 1) * (S.length - 1),
    i = Math.min(Math.floor(q), S.length - 2),
    f = q - i;
  return `rgb(${S[i].map((c, k) => Math.round(c + f * (S[i + 1][k] - c))).join(",")})`;
};

(async () => {
  let model;
  if (opt("--model")) model = JSON.parse(fs.readFileSync(opt("--model"), "utf8"));
  else if (opt("--ork")) model = await modelFromPage({ ork: opt("--ork") });
  else if (opt("--example") != null) model = await modelFromPage({ example: +opt("--example") });
  else {
    console.error(
      "usage: node tools/fin-sections.js --ork FILE | --model FILE.json | --example N [--fillet MM] [--out DIR] [--stl]",
    );
    process.exit(2);
  }
  if (opt("--fillet") != null) (model.settings = model.settings || {}).finFillet = +opt("--fillet") / 1000;
  let fins = null;
  const walk = (l) => {
    for (const q of l || []) {
      if (q.type === "fins" && !fins) fins = q;
      walk(q.kids);
    }
  };
  for (const s of model.stages) walk(s.parts);
  if (!fins) throw new Error("This design has no fins.");
  const t = Math.max(+fins.t || 0, 0.0002) * 1000;

  // the exporter and its kernel, as tests/step-export.js loads them
  const esbuild = require("esbuild");
  const bundle = path.join(os.tmpdir(), `fin-sections-${process.pid}.mjs`);
  await esbuild.build({
    stdin: {
      contents: `export { buildStep, buildStl } from ${JSON.stringify(path.join(root, "src/js/builder/step-export.js"))};`,
      resolveDir: root,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundle,
    logLevel: "error",
  });
  const R = await import("replicad");
  const oc = await (
    await import("replicad-opencascadejs")
  ).default({ locateFile: (f) => path.join(root, "node_modules/replicad-opencascadejs/dist", f) });
  R.setOC(oc);
  const { buildStep, buildStl } = await import(bundle);
  const log = console.log;
  console.log = () => {}; // (OpenCascade's own chatter while it writes the STEP file)
  let r;
  try {
    r = await buildStep(R, model);
  } finally {
    console.log = log;
    fs.rmSync(bundle, { force: true });
  }
  const stl = buildStl(r.shape, "fine", r.info.volume);
  fs.mkdirSync(OUT, { recursive: true });
  if (args.includes("--stl")) fs.writeFileSync(path.join(OUT, "fin-sections.stl"), Buffer.from(stl.data));

  // the mesh's triangles, from the STL (so what is measured is what the file holds)
  const dv = new DataView(stl.data),
    n = dv.getUint32(80, true),
    T = new Float64Array(9 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) T[9 * i + k] = dv.getFloat32(84 + 50 * i + 12 + 4 * k, true);
  // the fin to measure: the one whose tip is the point furthest from the centreline; turned to stand along +y
  let far = 0,
    ang = 0;
  for (let i = 0; i < T.length; i += 3) {
    const q = Math.hypot(T[i + 1], T[i + 2]);
    if (q > far) {
      far = q;
      ang = Math.atan2(T[i + 2], T[i + 1]);
    }
  }
  let sy = 0,
    sz = 0;
  for (let i = 0; i < T.length; i += 3) {
    const q = Math.hypot(T[i + 1], T[i + 2]),
      a = Math.atan2(T[i + 2], T[i + 1]);
    if (q > 0.7 * far && Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang))) < 0.3) {
      sy += T[i + 1];
      sz += T[i + 2];
    }
  }
  ang = Math.atan2(sz, sy);
  const c = Math.cos(-ang),
    s = Math.sin(-ang);
  for (let i = 0; i < T.length; i += 3) {
    const y = T[i + 1],
      z = T[i + 2];
    T[i + 1] = y * c - z * s;
    T[i + 2] = y * s + z * c;
  }
  // the fin's box: the triangles near the plane z = 0 that reach beyond the body
  const span = (+fins.span || 0) * 1000 || far * 0.5,
    yTop = far,
    yBot = Math.max(far - span - Math.max(8, 0.25 * span), 0);
  let x0 = Infinity,
    x1 = -Infinity;
  for (let i = 0; i < T.length; i += 9) {
    const ys = [T[i + 1], T[i + 4], T[i + 7]],
      zs = [T[i + 2], T[i + 5], T[i + 8]];
    if (Math.max(...ys) < far - span * 0.9 || Math.max(...zs.map(Math.abs)) > 3 * t + 2) continue;
    x0 = Math.min(x0, T[i], T[i + 3], T[i + 6]);
    x1 = Math.max(x1, T[i], T[i + 3], T[i + 6]);
  }
  x0 -= 2;
  x1 += 2;
  // triangles by column of x, then the solid's thickness through z = 0 at a point: between the nearest skins either side
  const NX = 360,
    cols = Array.from({ length: NX }, () => []);
  for (let i = 0; i < T.length; i += 9) {
    const lo = Math.min(T[i], T[i + 3], T[i + 6]),
      hi = Math.max(T[i], T[i + 3], T[i + 6]);
    if (hi < x0 || lo > x1) continue;
    for (
      let b = Math.max(0, Math.floor(((lo - x0) / (x1 - x0)) * NX));
      b <= Math.min(NX - 1, Math.floor(((hi - x0) / (x1 - x0)) * NX));
      b++
    )
      cols[b].push(i);
  }
  const CAP = 8 * t;
  const thick = (x, y) => {
    let up = Infinity,
      dn = -Infinity;
    for (const i of cols[Math.min(NX - 1, Math.max(0, Math.floor(((x - x0) / (x1 - x0)) * NX)))]) {
      const ax = T[i],
        ay = T[i + 1],
        bx = T[i + 3],
        by = T[i + 4],
        cx = T[i + 6],
        cy = T[i + 7],
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-12) continue;
      const w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den,
        w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den,
        w2 = 1 - w0 - w1;
      if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
      const z = w0 * T[i + 2] + w1 * T[i + 5] + w2 * T[i + 8];
      if (z >= 0) up = Math.min(up, z);
      else dn = Math.max(dn, z);
    }
    return isFinite(up) && isFinite(dn) ? Math.min(up - dn, CAP) : 0;
  };
  const NY = Math.max(40, Math.round((NX * (yTop - yBot)) / (x1 - x0))),
    dx = (x1 - x0) / NX,
    dy = (yTop - yBot) / NY,
    G = [];
  for (let j = 0; j < NY; j++) {
    const row = [];
    for (let i = 0; i < NX; i++) row.push(thick(x0 + (i + 0.5) * dx, yBot + (j + 0.5) * dy));
    G.push(row);
  }
  // the root: just above the highest row that is mostly body (the solid many fin-thicknesses through)
  let jRoot = 0;
  for (let j = NY - 1; j >= 0; j--) {
    const hit = G[j].filter((v) => v > 0);
    if (hit.length && hit.filter((v) => v >= CAP - 1e-9).length > 0.5 * hit.length) {
      jRoot = j + 1;
      break;
    }
  }
  const yRoot = yBot + jRoot * dy,
    heights = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => yRoot + f * (yTop - yRoot));
  const sections = heights.map((y) => {
    const pts = [];
    for (let i = 0; i < 4 * NX; i++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / (4 * NX),
        v = thick(x, y);
      if (v > 0) pts.push([x, v]);
    }
    if (!pts.length) return { y, pts };
    const max = Math.max(...pts.map((q) => q[1])),
      top = pts.filter((q) => q[1] > max - 0.01);
    return { y, pts, le: pts[0][0], te: pts[pts.length - 1][0], max, at: (top[0][0] + top[top.length - 1][0]) / 2 };
  });
  console.log(
    `${model.name || "Rocket"}: ${fins.name || "fins"}, ${fins.shape || "trapezoid"} outline, ${fins.edge || "square"} edges, ${t.toFixed(2)} mm thick`,
  );
  console.log(
    `solid ${r.info.volume.toFixed(0)} mm3, ${r.info.faces} faces${r.info.fillet ? `, ${r.info.fillet.toFixed(2)} mm fillets (${r.info.filletMethod})` : ""}; STL ${stl.triangles} triangles${r.info.warnings.length ? "; " + r.info.warnings.join(" ") : ""}`,
  );
  console.log("height above root  chord   greatest thickness   thickest at (share of chord from the leading edge)");
  for (const q of sections)
    if (q.pts.length)
      console.log(
        `${(q.y - yRoot).toFixed(1).padStart(10)} mm ${(q.te - q.le).toFixed(1).padStart(8)} mm ${q.max.toFixed(2).padStart(12)} mm ${(((q.at - q.le) / (q.te - q.le)) * 100).toFixed(0).padStart(14)}%`,
      );

  // the picture
  const W = 1100,
    m = 60,
    sc = (W - 2 * m) / (x1 - x0),
    H1 = (yTop - yBot) * sc,
    EX = 8,
    tDraw = Math.min(Math.max(t, ...sections.map((q) => q.max || 0)), 4 * t),
    H2 = tDraw * EX * sc + 30,
    Hh = m + H1 + 70 + H2 + m,
    X = (x) => m + (x - x0) * sc,
    Y = (y) => m + H1 - (y - yBot) * sc,
    o = [];
  o.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh.toFixed(0)}" font-family="system-ui, sans-serif" font-size="13">`,
  );
  o.push(`<rect width="100%" height="100%" fill="#fff"/>`);
  o.push(
    `<text x="${m}" y="26" font-size="16" font-weight="600">${(model.name || "Rocket").replace(/[<&]/g, "")}: fin thickness as exported (mm; ${t.toFixed(2)} mm fin, yellow at ${(1.05 * t).toFixed(2)} mm and over)</text>`,
  );
  // (cells of one colour in a row are drawn as one bar)
  const lvl = (v) => (v > 0 ? Math.round(Math.min(v / (1.05 * t), 1) * 48) : -1);
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX;) {
      const q = lvl(G[j][i]);
      let e = i + 1;
      while (e < NX && lvl(G[j][e]) === q) e++;
      if (q >= 0)
        o.push(
          `<rect x="${X(x0 + i * dx).toFixed(1)}" y="${Y(yBot + (j + 1) * dy).toFixed(1)}" width="${((e - i) * dx * sc + 0.4).toFixed(1)}" height="${(dy * sc + 0.4).toFixed(1)}" fill="${colour(q / 48)}"/>`,
        );
      i = e;
    }
  sections.forEach((q, k) => {
    o.push(
      `<line x1="${m}" x2="${W - m}" y1="${Y(q.y).toFixed(1)}" y2="${Y(q.y).toFixed(1)}" stroke="hsl(${k * 70},70%,45%)" stroke-dasharray="4 4"/>`,
    );
    o.push(
      `<text x="${W - m + 4}" y="${(Y(q.y) + 4).toFixed(1)}" fill="hsl(${k * 70},70%,35%)">${(q.y - yRoot).toFixed(0)}</text>`,
    );
  });
  const yc = m + H1 + 70 + H2 / 2;
  o.push(
    `<text x="${m}" y="${(m + H1 + 46).toFixed(0)}" font-weight="600">Cross-sections along the airflow at the dashed heights (mm above the root); thickness drawn ${EX} times</text>`,
  );
  sections.forEach((q, k) => {
    if (!q.pts.length) return;
    const topL = q.pts.map(([x, v]) => `${X(x).toFixed(1)},${(yc - (Math.min(v, tDraw) / 2) * EX * sc).toFixed(1)}`),
      bot = [...q.pts]
        .reverse()
        .map(([x, v]) => `${X(x).toFixed(1)},${(yc + (Math.min(v, tDraw) / 2) * EX * sc).toFixed(1)}`);
    o.push(
      `<polygon points="${[...topL, ...bot].join(" ")}" fill="none" stroke="hsl(${k * 70},70%,45%)" stroke-width="1.4"/>`,
    );
  });
  o.push(
    `<text x="${m}" y="${(Hh - 16).toFixed(0)}" fill="#555">${(x1 - x0 - 4).toFixed(0)} mm along the root, leading edge at the left</text>`,
  );
  o.push("</svg>");
  fs.writeFileSync(path.join(OUT, "fin-sections.svg"), o.join("\n"));
  console.log(`picture: ${path.join(OUT, "fin-sections.svg")}`);
  process.exit(0);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
