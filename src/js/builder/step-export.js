/**
 * The rocket's outer surface as a STEP file (full size, in millimetres) for CFD and CAD: the body as revolved solids
 * (nose, tubes, transitions), the fins fused on and filleted, the base closed with a flat circular face so the
 * result is one watertight solid. Nothing inside the rocket is included.
 *
 * The solid modelling is done by OpenCascade (through replicad), which is loaded only when this is used: `buildStep`
 * takes the replicad module as an argument, so it runs in the app (where `step-kernel.js` provides it) and in the tests.
 */
import { finDxfOutline } from "./fin-dxf.js";
import { bldLayout } from "./model.js";
import { noseR, noseRTip, noseTip } from "../physics/geometry.js";
/** metres to the STEP file's millimetres */
const STEP_MM = 1000;
/** Samples along a curved nose or transition profile (a B-spline is fitted through them). */
const STEP_PROFILE_SAMPLES = 96;
/** Straight pieces in an elliptical fin's curved edge (under 0.02 mm off the true curve for any fin this app can fly). */
const STEP_ELLIPSE_PIECES = 72;
/**
 * The radius of a layout body at a distance from its front.
 * @param {object} b layout body (bldLayout)
 * @param {number} t distance from the body's front, m
 * @param {object|null} tip the nose's rounded tip (noseTip), if it has one
 * @returns {number} m
 */
function stepBodyR(b, t, tip) {
  t = Math.min(Math.max(t, 0), b.len);
  if (b.p.type === "tube") return b.r1;
  if (b.p.type === "nose") return noseRTip(b.p.shape, b.p.param, t, b.r2, b.len, tip);
  if (Math.abs(b.r2 - b.r1) < 1e-9) return b.r1;
  return b.r2 >= b.r1
    ? b.r1 + (b.r2 - b.r1) * noseR(b.p.shape, b.p.param, t, 1, b.len)
    : b.r2 + (b.r1 - b.r2) * noseR(b.p.shape, b.p.param, b.len - t, 1, b.len);
}
/**
 * The rocket's outside radius (mm) at a distance from the nose tip.
 * @param {object[]} bodies layout bodies, with `tip` set on noses
 * @param {number} x mm from the nose tip
 * @returns {number} mm
 */
function stepRadiusAt(bodies, x) {
  const xm = x / STEP_MM;
  const b = bodies.find((q) => xm >= q.x - 1e-9 && xm <= q.x + q.len + 1e-9) || bodies[xm < 0 ? 0 : bodies.length - 1];
  return stepBodyR(b, xm - b.x, b.tip) * STEP_MM;
}
/**
 * Where the seam of a revolved body goes: the angle farthest from every fin, so no fin sits on the seam (the fillet
 * fails there).
 * @param {number[]} fins the angles the fins sit at, degrees
 * @returns {number} degrees
 */
function stepSeamAngle(fins) {
  if (!fins.length) return 0;
  let best = 0,
    bestD = -1;
  for (let a = 0; a < 360; a += 0.5) {
    // the nearest fin, going round the axis the short way
    const d = Math.min(
      ...fins.map((f) => {
        const diff = (((a - f) % 360) + 360) % 360;
        return Math.min(diff, 360 - diff);
      }),
    );
    if (d > bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}
/**
 * One body part (nose, tube or transition) as a solid of revolution about the x axis, in mm.
 * @param {object} R replicad
 * @param {object} b layout body
 * @returns {object|null} a replicad solid, null for a part with no size
 */
function stepPartSolid(R, b) {
  const x0 = b.x * STEP_MM,
    L = b.len * STEP_MM;
  if (!(L > 0)) return null;
  const isNose = b.p.type === "nose",
    straight =
      b.p.type === "tube" ||
      Math.abs(b.r2 - b.r1) < 1e-9 ||
      b.p.shape === "conical" ||
      (isNose && b.p.shape === "ogive" && !(b.p.param > 1e-3));
  // a rounded nose tip starts the profile at the front of its sphere
  const t0 = isNose && b.tip ? b.tip.xs : 0;
  const pts = [];
  if (straight && !(isNose && b.tip)) {
    pts.push([x0, stepBodyR(b, 0, b.tip) * STEP_MM], [x0 + L, stepBodyR(b, b.len, b.tip) * STEP_MM]);
  } else {
    // dense near both ends, where the curve bends most
    for (let i = 0; i <= STEP_PROFILE_SAMPLES; i++) {
      const u = (1 - Math.cos((Math.PI * i) / STEP_PROFILE_SAMPLES)) / 2,
        t = t0 + (b.len - t0) * u;
      pts.push([x0 + t * STEP_MM, stepBodyR(b, t, b.tip) * STEP_MM]);
    }
  }
  const first = pts[0],
    last = pts[pts.length - 1];
  // counter-clockwise in the (x, radius) plane, so the revolved solid comes out the right way round (a solid turned
  // inside out can't be filleted): along the axis, up the aft end, back along the profile, down the front end
  const edges = [];
  const line = (a, c) => {
    if (Math.hypot(c[0] - a[0], c[1] - a[1]) > 1e-9) edges.push(R.makeLine([a[0], a[1], 0], [c[0], c[1], 0]));
  };
  line([first[0], 0], [last[0], 0]);
  line([last[0], 0], last);
  if (pts.length === 2) line(last, first);
  else
    edges.push(
      R.makeBSplineApproximation(pts.map((p) => [p[0], p[1], 0]).reverse(), {
        tolerance: 1e-4,
        smoothing: null,
        degMax: 8,
        degMin: 3,
      }),
    );
  line(first, [first[0], 0]);
  const face = R.makeFace(R.assembleWire(edges));
  return R.revolution(face, [0, 0, 0], [1, 0, 0], 360);
}
/**
 * One fin of a fin set as a solid in the plane through the axis (pointing up the y axis): the fin standing on the
 * body's surface, with a block under its root, inside the body, that joins the two. Where the root runs past the
 * body's end (fins that hang over the base) there is no block: the fin simply ends there.
 * @param {object} R replicad
 * @param {object} k the fin part of the builder
 * @param {number} xf where the fin's root leading edge is, mm from the nose tip
 * @param {object[]} bodies layout bodies
 * @returns {{solid:object, x0:number, x1:number}|null} the solid and the x range of its root that lies on the body, mm
 */
function stepFinSolid(R, k, xf, bodies) {
  const P = finDxfOutline(k);
  if (P.length < 3) return null;
  const t = Math.max(+k.t || 0, 0.0002) * STEP_MM;
  let pts = P.map(([x, y]) => [x * STEP_MM, y * STEP_MM]);
  if (k.shape === "elliptical") {
    // the outline comes as a fine polygon: thin it to STEP_ELLIPSE_PIECES pieces
    const n = pts.length - 1,
      step = Math.max(Math.round(n / STEP_ELLIPSE_PIECES), 1);
    pts = pts.filter((_, i) => i % step === 0 || i === n);
  }
  // the root edge: two neighbouring corners on y = 0 (the last and first for a polygon that starts on the root)
  let ri = -1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    if (Math.abs(a[1]) < 1e-9 && Math.abs(b[1]) < 1e-9 && Math.abs(a[0] - b[0]) > 1e-9) {
      ri = i;
      break;
    }
  }
  const rootA = ri >= 0 ? pts[ri] : [0, 0],
    rootB = ri >= 0 ? pts[(ri + 1) % pts.length] : [Math.max(...pts.map((p) => p[0])), 0],
    xa = xf + Math.min(rootA[0], rootB[0]),
    xb = xf + Math.max(rootA[0], rootB[0]);
  // the fin stands on the body: its y is measured from the body's surface under the root
  const surf = (x) => stepRadiusAt(bodies, Math.min(Math.max(x, xa), xb));
  const last = bodies[bodies.length - 1],
    span0 = bodies[0].x * STEP_MM,
    span1 = (last.x + last.len) * STEP_MM;
  const poly = (pp) => {
    let d = R.draw(pp[0]);
    for (let i = 1; i < pp.length; i++) d = d.lineTo(pp[i]);
    return d
      .close()
      .sketchOnPlane("XY", -t / 2)
      .extrude(t);
  };
  let solid = poly(pts.map((p) => [xf + p[0], surf(xf + p[0]) + p[1]]));
  // the block under the root, down to 40% of the body's radius, along the part of the root over the body
  const fa = Math.max(xa, span0),
    fb = Math.min(xb, span1);
  if (fb - fa > 1e-6) {
    const xs = [fa, ...bodies.map((b) => b.x * STEP_MM).filter((x) => x > fa + 1e-6 && x < fb - 1e-6), fb];
    const inner = Math.max(Math.min(...xs.map(surf)) * 0.4, 0.05);
    solid = solid.fuse(poly([...xs.map((x) => [x, surf(x)]), [fb, inner], [fa, inner]]));
  }
  return { solid, x0: fa, x1: fb };
}
/**
 * The glue fillet along one side of a fin, on a body of constant radius, as a solid: the curved wedge between the fin's
 * side, the body and a circle of the fillet's radius touching both, extruded along the root. Made directly instead of
 * with OpenCascade's fillet, which fails at swept, pointed or curved fin ends; it ends square at the root's ends.
 * It reaches a little into the fin and the body, so it joins them by an ordinary overlap.
 * @param {object} R replicad
 * @param {number} r the body's radius, mm
 * @param {number} h half the fin's thickness, mm
 * @param {number} rho the fillet's radius, mm
 * @param {number} x0 where the root starts, mm from the nose tip
 * @param {number} x1 where the root ends, mm
 * @param {number} side 1 for the fin's +z side, -1 for its -z side
 * @returns {object|null} a solid, null when the sizes don't make a fillet
 */
function stepFilletWedge(R, r, h, rho, x0, x1, side) {
  if (!(rho > 0) || !(r > h) || !(x1 - x0 > 1e-6)) return null;
  const d = r + rho,
    vc = h + rho,
    uc = Math.sqrt(d * d - vc * vc),
    e = Math.min(h * 0.5, 0.3);
  // where the fillet circle touches the body and where it touches the fin; its middle, for the arc
  const tb = [(uc * r) / d, (vc * r) / d],
    a1 = -Math.PI / 2,
    a2 = Math.atan2(-vc, -uc),
    am = (a1 + a2) / 2, // both between -180° and -90°: no wrapping
    mid = [uc + rho * Math.cos(am), vc + rho * Math.sin(am)];
  const S = (p) => [p[0], p[1] * side];
  const wedge = R.draw(S([r * 0.9, h - e]))
    .lineTo(S([uc, h - e]))
    .lineTo(S([uc, h]))
    .threePointsArcTo(S(tb), S(mid))
    .lineTo(S([tb[0] * 0.9, tb[1] * 0.9]))
    .close();
  return wedge.sketchOnPlane("YZ", x0).extrude(x1 - x0);
}
/**
 * The rocket's outside as one solid, as a STEP file.
 * @param {object} R the replicad module, with OpenCascade set up (setOC)
 * @param {object} model the builder model (BLD)
 * @param {{fillet?:number}} [opts] fillet radius in metres (default: the model's fin fillet radius)
 * @returns {Promise<{text:string, info:{volume:number, faces:number, length:number, finSets:number, fillet:number,
 *   warnings:string[]}}>}
 */
export async function buildStep(R, model, opts = {}) {
  const lay = bldLayout(model),
    bodies = lay.bodies.filter((b) => b.len > 0);
  if (!bodies.length) throw new Error("The rocket has no body parts yet.");
  const warnings = [];
  for (const b of bodies)
    if (b.p.type === "nose")
      b.tip = +b.p.tipR > 0 ? noseTip(b.p.shape, b.p.param, b.r2, b.len, Math.min(+b.p.tipR, b.r2)) : null;
  const fr = (opts.fillet != null ? +opts.fillet : +(model.settings && model.settings.finFillet)) * STEP_MM || 0;
  // the fin sets: what body parts each covers, and the angles of its fins
  const sets = [];
  bodies.forEach((b) =>
    b.kids
      .filter((c) => c.k.type === "fins" && c.k.n >= 1)
      .forEach((c) => {
        const xa = c.x * STEP_MM,
          xb = (c.x + c.len) * STEP_MM,
          idx = bodies
            .map((q, i) => i)
            .filter((i) => bodies[i].x * STEP_MM < xb - 1e-6 && (bodies[i].x + bodies[i].len) * STEP_MM > xa + 1e-6);
        const ang = Array.from(
          { length: Math.floor(c.k.n) },
          (_, i) => (+c.k.rot || 0) + (i * 360) / Math.floor(c.k.n),
        );
        if (idx.length) sets.push({ k: c.k, x: xa, idx, ang });
      }),
  );
  const seam = stepSeamAngle(sets.flatMap((s) => s.ang));
  let solids = bodies.map((b) => {
    const s = stepPartSolid(R, b);
    return s ? s.rotate(seam, [0, 0, 0], [1, 0, 0]) : null;
  });
  // fin sets that share a body part are built on the same piece
  const grp = bodies.map((_, i) => i);
  const find = (i) => (grp[i] === i ? i : (grp[i] = find(grp[i])));
  for (const s of sets) for (const i of s.idx) grp[find(i)] = find(s.idx[0]);
  const groups = new Map();
  bodies.forEach((_, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, { parts: [], sets: [] });
    groups.get(g).parts.push(i);
  });
  for (const s of sets) groups.get(find(s.idx[0])).sets.push(s);
  // two body parts that meet at the same radius share a whole flat face: OpenCascade can join them on it directly
  const fusePart = (a, b, i) =>
    Math.abs(bodies[i - 1].r2 - bodies[i].r1) < 1e-9 ? a.fuse(b, { optimisation: "commonFace" }) : a.fuse(b);
  const isTubeHost = (g) =>
    g.parts
      .map((i) => bodies[i])
      .every((b) => Math.abs(b.r1 - b.r2) < 1e-9 && Math.abs(b.r1 - bodies[g.parts[0]].r1) < 1e-9);
  const pieces = [];
  let filletDone = 0,
    taperedSkipped = false;
  for (const g of [...groups.values()].sort((a, b) => a.parts[0] - b.parts[0])) {
    let host = null;
    for (const i of g.parts) if (solids[i]) host = host ? fusePart(host, solids[i], i) : solids[i];
    if (!host) continue;
    const fins = [];
    for (const s of g.sets) {
      const f = stepFinSolid(R, s.k, s.x, bodies);
      if (f) fins.push({ ...f, ang: s.ang, t: Math.max(+s.k.t || 0, 0.0002) * STEP_MM });
    }
    for (const f of fins)
      for (const a of f.ang) host = host.fuse(a ? f.solid.clone().rotate(a, [0, 0, 0], [1, 0, 0]) : f.solid.clone());
    if (fins.length && fr > 0) {
      // the fillets are built directly (stepFilletWedge) where the body has one radius under the fins; on a taper
      // (a boattail) the joint isn't a straight line and they are left out, and the file says so
      if (isTubeHost(g)) {
        const rHost = bodies[g.parts[0]].r1 * STEP_MM;
        for (const f of fins)
          for (const a of f.ang)
            for (const side of [1, -1]) {
              const w = stepFilletWedge(R, rHost, f.t / 2, fr, f.x0, f.x1, side);
              if (w) host = host.fuse(a ? w.rotate(a, [0, 0, 0], [1, 0, 0]) : w);
            }
        filletDone += g.sets.length;
      } else taperedSkipped = true;
    }
    pieces.push(host);
  }
  if (taperedSkipped)
    warnings.push(
      "Fins on a tapered section (a boattail) are in the file without fillets: they are only made on straight body tubes.",
    );
  let all = pieces[0];
  for (let i = 1; i < pieces.length; i++) all = all.fuse(pieces[i]);
  const volume = R.measureVolume(all);
  if (!(volume > 0)) throw new Error("The solid came out empty or inside out; the shape has a problem.");
  const blob = R.exportSTEP([{ shape: all, name: model.name || "Rocket" }], { unit: "mm", modelUnit: "mm" });
  const text = await blob.text();
  return {
    text,
    info: {
      volume,
      faces: all.faces.length,
      length: all.boundingBox.bounds[1][0],
      finSets: sets.length,
      fillet: filletDone ? fr : 0,
      warnings,
    },
  };
}
