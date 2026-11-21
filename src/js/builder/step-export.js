/**
 * The rocket's outer surface as a STEP file (full size, in millimetres) for CFD and CAD: the body as revolved solids
 * (nose, tubes, transitions), the fins fused on and filleted, the base closed with a flat circular face so the
 * result is one watertight solid. Nothing inside the rocket is included.
 *
 * The solid modelling is done by OpenCascade (through replicad), which is loaded only when this is used: `buildStep`
 * takes the replicad module as an argument, so it runs in the app (where `step-kernel.js` provides it) and in the tests.
 */
import { finDxfOutline } from "./fin-dxf.js";
import { BLD_BUTTONS, bldLayout, bldLugKind, bldRailLug } from "./model.js";
import { finTeEdge } from "../core/units-and-fin-edges.js";
import { noseR, noseRTip, noseTip } from "../physics/geometry.js";
/** metres to the STEP file's millimetres */
const STEP_MM = 1000;
/** Samples along a curved nose or transition profile (a B-spline is fitted through them). */
const STEP_PROFILE_SAMPLES = 96;
/** Straight pieces in an elliptical fin's curved edge (under 0.02 mm off the true curve for any fin this app can fly). */
const STEP_ELLIPSE_PIECES = 72;
/** The same, when the fin's edges have a section cut along them (each piece is a cut: fewer, to keep the file and time small). */
const STEP_ELLIPSE_EDGE_PIECES = 36;
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
 * Where a launch lug or the rail buttons go round the body: halfway between two neighbouring fins, so they never sit
 * in a fin (and the rail clears the fins on both sides). Of the gaps between fins, the one nearest the part's own
 * direction; with no fins, the part's own direction.
 * @param {number[]} fins the angles the fins sit at, degrees
 * @param {number} dir the part's own direction, degrees
 * @returns {number} degrees
 */
function stepGuideAngle(fins, dir) {
  const a = [...new Set(fins.map((f) => Math.round((((f % 360) + 360) % 360) * 1e6) / 1e6))].sort((p, q) => p - q);
  if (!a.length) return dir;
  const gaps = a.map((f, i) => {
    const next = i + 1 < a.length ? a[i + 1] : a[0] + 360;
    return (f + next) / 2;
  });
  const off = (g) => {
    const d = (((g - dir) % 360) + 360) % 360;
    return Math.min(d, 360 - d);
  };
  return gaps.reduce((b, g) => (off(g) < off(b) - 1e-9 ? g : b), gaps[0]) % 360;
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
function stepFinSolid(R, k, xf, bodies, flat, grow = 0, arcs = true) {
  const P = finDxfOutline(k);
  if (P.length < 3) return null;
  const t = Math.max(+k.t || 0, 0.0002) * STEP_MM + 2 * grow;
  let pts = P.map(([x, y]) => [x * STEP_MM, y * STEP_MM]);
  if (k.shape === "elliptical") {
    // the outline comes as a fine polygon: thin it to STEP_ELLIPSE_PIECES pieces
    const n = pts.length - 1,
      step = Math.max(
        Math.round(
          n /
            ((k.edge || "square") !== "square" || finTeEdge(k.edgeTE) ? STEP_ELLIPSE_EDGE_PIECES : STEP_ELLIPSE_PIECES),
        ),
        1,
      );
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
  // the root goes a hair under the body's surface: the fin's faces are flat across its thickness but the body curves
  // away from them, so a root exactly on the surface would leave a sliver of step at its ends
  const dive = (x) => {
    const q = surf(x);
    return q > t ? q - Math.sqrt(q * q - (t / 2) * (t / 2)) + 0.02 : 0;
  };
  const M = pts.map((p) => [xf + p[0], surf(xf + p[0]) + p[1] - (p[1] === 0 ? dive(xf + p[0]) : 0)]);
  let solid = poly(M);
  // the edge sections; they keep an edge flat instead of a knife edge
  let edgesSkipped = false;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    area += (a[0] * b[1] - b[0] * a[1]) / 2;
  }
  const cMean =
    k.shape === "trapezoid"
      ? ((+k.root || 0) + (+k.tip || 0)) * 0.5 * STEP_MM
      : Math.abs(area) / Math.max(...pts.map((p) => p[1]), 1e-9);
  const edges = stepEdges(k, t, flat + 2 * grow, cMean);
  // the fat fin the trimmed fillets are cut with, and the fins under them, keep the polyline section
  if (grow || !arcs) for (const e of [edges.le, edges.te]) if (e) e.arc = e.nose = false;
  // an elliptical fin for the fillet: a true half-ellipse with its edge sections swept round it, so it has no creases
  let smoothEll = null;
  if (k.shape === "elliptical" && arcs && !grow) {
    try {
      smoothEll = stepEllipseFin(R, xa, xb, surf, dive, (+k.span || 0) * STEP_MM, t, edges);
    } catch (e) {
      smoothEll = null;
    }
  }
  // a free-form fin with an airfoil or double-wedge section: true chordwise sections up the span
  let lofted = null;
  if (k.shape === "freeform" && !grow && ri >= 0 && Math.abs(surf(xa) - surf(xb)) < 1e-6) {
    const xs = bodies.map((b) => b.x * STEP_MM).filter((x) => x > xa + 1e-6 && x < xb - 1e-6);
    if (xs.every((x) => Math.abs(surf(x) - surf(xa)) < 1e-6))
      try {
        // (the sections are drawn smooth whether or not the caller wants arcs: a loft has no polyline form)
        lofted = stepFreeformLoft(R, pts, xf, surf(xa) - dive(xa), t, stepEdges(k, t, flat, cMean));
      } catch (e) {
        lofted = null;
      }
  }
  if (smoothEll) solid = smoothEll;
  else if (lofted) solid = lofted;
  else if (edges.le || edges.te) {
    if (k.shape === "trapezoid") {
      const n = M.length;
      if (edges.le) solid = solid.intersect(stepEdgeBody(R, edges.le, M[0], M[1], 1, t));
      if (edges.te) solid = solid.intersect(stepEdgeBody(R, edges.te, M[n - 1], M[n - 2], -1, t));
    } else {
      try {
        const r = stepCurvedEdges(R, solid, M, ri, edges, t, k.shape === "elliptical" ? 0 : 0.25);
        solid = r.solid;
      } catch (e) {
        edgesSkipped = true;
      }
    }
  }
  // the block under the root, down to 40% of the body's radius, along the part of the root over the body
  const fa = Math.max(xa, span0),
    fb = Math.min(xb, span1);
  if (fb - fa > 1e-6) {
    const xs = [fa, ...bodies.map((b) => b.x * STEP_MM).filter((x) => x > fa + 1e-6 && x < fb - 1e-6), fb];
    const inner = Math.max(Math.min(...xs.map(surf)) * 0.4, 0.05);
    solid = solid.fuse(poly([...xs.map((x) => [x, surf(x) - dive(x)]), [fb, inner], [fa, inner]]));
  }
  // (the cuts and joins above can leave the fin as a compound holding the one solid: later joins need the solid itself)
  if ((solid.solids || []).length === 1) solid = solid.solids[0];
  return { solid, x0: fa, x1: fb, edgesSkipped };
}
/**
 * An elliptical fin drawn as a true half-ellipse on a straight body tube (not the many-sided outline), its edge
 * sections swept round the curve, leading over the leading half and trailing over the trailing half. With no creases
 * along its edges, OpenCascade can roll a fillet round its root. Null where the body under it is not straight or a
 * section can't be drawn smooth.
 * @param {object} R replicad
 * @param {number} xa start of the root, mm
 * @param {number} xb end of the root, mm
 * @param {function(number):number} surf body radius under the root, mm
 * @param {function(number):number} dive how far the root goes under the surface, mm
 * @param {number} span fin span, mm
 * @param {number} t fin thickness, mm
 * @param {{le:number[][]|null, te:number[][]|null}} edges stepEdges
 * @returns {object|null} the fin (without the block under its root)
 */
function stepEllipseFin(R, xa, xb, surf, dive, span, t, edges) {
  const xm = (xa + xb) / 2,
    a = (xb - xa) / 2,
    y0 = surf(xa) - dive(xa);
  if (!(a > 0 && span > 0) || Math.abs(surf(xb) - surf(xa)) > 1e-6 || Math.abs(surf(xm) - surf(xa)) > 1e-6) return null;
  let solid = R.draw([xa, y0])
    .halfEllipseTo([xb, y0], span, false)
    .close()
    .sketchOnPlane("XY", -t / 2)
    .extrude(t);
  const { le, te } = edges;
  if (!le && !te) return solid;
  const h2 = t / 2 + 1,
    H = h2 + 5;
  // the C-shaped cutter: everything outside the section, a little way in from the edge
  const cutter = (prof) => (pl) => {
    const sm = stepSmoothSection(prof, h2, 2);
    return stepDrawSection(
      R.draw([-3, H]).lineTo([-3, -H]).lineTo([sm.far, -H]).lineTo([sm.far, -h2]),
      sm.ops,
      (q) => q,
    )
      .lineTo([sm.far, H])
      .close()
      .sketchOnPlane(pl);
  };
  // a section deeper than the curve's tightest bend would fold the swept cutter over itself
  const bend = Math.min((a * a) / span, (span * span) / a);
  for (const p of [le, te]) {
    const sm = p && stepSmoothSection(p, h2, 2);
    if (p && !sm) return null;
    // too deep to sweep (an airfoil or double wedge reaches in to mid-chord): built from chordwise sections instead
    if (p && sm.far > 0.8 * bend) return stepEllipseLoft(R, xa, xb, y0, span, t, edges);
  }
  // the path runs a little below the root at each end, straight on, so the cutter reaches past the fin's bottom
  const sweep = (path, prof) => path.done().sketchOnPlane("XY").sweepSketch(cutter(prof));
  const same =
    le && te && JSON.stringify(le) === JSON.stringify(te) && JSON.stringify(le.nose) === JSON.stringify(te.nose);
  if (same) {
    solid = solid.cut(
      sweep(
        R.draw([xa, y0 - 2])
          .lineTo([xa, y0])
          .halfEllipseTo([xb, y0], span, false)
          .lineTo([xb, y0 - 2]),
        le,
      ),
    );
  } else {
    if (le)
      solid = solid.cut(
        sweep(
          R.draw([xa, y0 - 2])
            .lineTo([xa, y0])
            .ellipseTo([xm, y0 + span], a, span, 0, false, false),
          le,
        ),
      );
    if (te)
      solid = solid.cut(
        sweep(
          R.draw([xm, y0 + span])
            .ellipseTo([xb, y0], a, span, 0, false, false)
            .lineTo([xb, y0 - 2]),
          te,
        ),
      );
  }
  return solid;
}
/**
 * An elliptical fin whose edge sections reach far in (an airfoil or double wedge, thickest at mid-chord), as a loft
 * through chordwise sections up the span: each the leading section from the front and the trailing one from the back,
 * scaled to the chord at that height, smooth everywhere (round noses, the double wedge's ridge rounded off over a
 * couple of mm), and closing to a point at the tip. Null for sections it can't draw.
 * @param {object} R replicad
 * @param {number} xa start of the root, mm
 * @param {number} xb end of the root, mm
 * @param {number} y0 height of the root, mm
 * @param {number} span fin span, mm
 * @param {number} t fin thickness, mm
 * @param {{le:number[][]|null, te:number[][]|null}} edges stepEdges
 * @returns {object|null}
 */
function stepEllipseLoft(R, xa, xb, y0, span, t, edges) {
  const xm = (xa + xb) / 2,
    a = (xb - xa) / 2,
    sect = stepChordSection(R, t, edges),
    section = (y, cl) => sect(y, xm - cl / 2, cl);
  // stations: below the root (straight on), then closer together towards the tip, where the chord shrinks fastest
  const ys = [y0 - 2, y0],
    n = 24,
    top = Math.sqrt(1 - Math.pow(Math.max(6 * t, 4) / (2 * a), 2));
  for (let i = 1; i <= n; i++) ys.push(y0 + span * top * Math.sin(((i / n) * Math.PI) / 2));
  const sk = [];
  for (const y of ys) {
    const u = Math.min(Math.max((y - y0) / span, 0), 1),
      s = section(y, 2 * a * Math.sqrt(1 - u * u));
    if (!s) return null;
    sk.push(s);
  }
  return sk[0].loftWith(sk.slice(1), { endPoint: [xm, y0 + span, 0] });
}
/**
 * The drawing of one chordwise section of a fin whose edge sections reach far in: the leading section from the front
 * and the trailing one from the back, scaled to the chord at that height, smooth everywhere (round noses, the double
 * wedge's ridge rounded off over a couple of mm).
 * @param {object} R replicad
 * @param {number} t fin thickness, mm
 * @param {{le:number[][]|null, te:number[][]|null}} edges stepEdges
 * @returns {function(number, number, number):object|null} (height y, leading edge's x, chord) to a sketch on the
 *   plane at that height, or null for a section it can't draw
 */
function stepChordSection(R, t, edges, flatNose = false) {
  const h = t / 2;
  // one side of a section, from its edge (u = 0) in: the top half's nose and rise to full thickness
  const side = (prof, cl) => {
    if (!prof) return { nose: "square", top: [0, h], rise: [], full: 0 };
    if (prof.arc) return { nose: "arc", top: [h, h], rise: [], full: h };
    const m = prof.nose;
    if (!m) return null;
    const b = m.half ? cl / 2 : Math.min(m.b, cl / 2),
      cp = m.kind === "airfoil" ? [b / 2, h] : [b, h],
      sl = (cp[1] - m.hf) / cp[0],
      rn = m.hf / (Math.sqrt(1 + sl * sl) - sl),
      tx = (rn - sl * m.hf) / (1 + sl * sl),
      ty = m.hf + sl * tx;
    // a bladed edge's flat left square across, not rounded into a nose
    if (flatNose) {
      if (m.kind === "airfoil") return { nose: "square", top: [0, m.hf], rise: [["Q", [b, h], cp]], full: b };
      if (!m.half) return null;
      const e2 = Math.min(0.25 * b, 2);
      return { nose: "square", top: [0, m.hf], rise: [["L", [b - e2, h - sl * e2]]], full: b, ridge: [b, h] };
    }
    if (m.kind === "airfoil") return { nose: "tip", top: [tx, ty], rise: [["Q", [b, h], cp]], full: b };
    const e = Math.min(0.25 * b, 2);
    if (m.half) return { nose: "tip", top: [tx, ty], rise: [["L", [b - e, h - sl * e]]], full: b, ridge: [b, h] };
    return {
      nose: "tip",
      top: [tx, ty],
      rise: [
        ["L", [b - e, h - sl * e]],
        ["Q", [b + e, h], [b, h]],
      ],
      full: b + e,
    };
  };
  return (y, x0, cl) => {
    const L = side(edges.le, cl),
      T = side(edges.te, cl);
    if (!L || !T) return null;
    if (!!L.ridge !== !!T.ridge || (!L.ridge && L.full + T.full > cl + 1e-6)) return null;
    const // a point in (u from the leading edge, half-thickness) to the plane's (x, z): its y axis is -z
      PL = (p) => [x0 + p[0], -p[1]],
      PT = (p) => [x0 + cl - p[0], -p[1]],
      flip = (p) => [p[0], -p[1]];
    const ops = (d, list, P) => {
      for (const [op, p, c] of list) d = op === "L" ? d.lineTo(P(p)) : d.quadraticBezierCurveTo(P(p), P(c));
      return d;
    };
    // round or bladed: an arc through the edge's middle; square: straight across
    const nose = (d, S, to, P) => (S.nose === "square" ? d.lineTo(P(to)) : d.threePointsArcTo(P(to), P([0, 0])));
    // top from the leading nose to the trailing one, then the bottom back
    let d = R.draw(PL(L.top));
    d = ops(d, L.rise, PL);
    if (L.ridge) d = d.quadraticBezierCurveTo(PT(T.rise[0][1]), PL(L.ridge));
    else if (cl - T.full - L.full > 1e-6) d = d.lineTo(PT([T.full, h]));
    const back = (S) => {
      // a side's rise run backwards: the points it passes, from full thickness out to the nose top
      const pts = [S.top, ...S.rise.map((o) => o[1])];
      return S.rise.map((o, i) => [o[0], pts[i], o[2]]).reverse();
    };
    d = ops(d, back(T), PT);
    d = nose(d, T, flip(T.top), PT);
    d = ops(
      d,
      T.rise.map(([op, p, c]) => [op, flip(p), c && flip(c)]),
      PT,
    );
    if (T.ridge) d = d.quadraticBezierCurveTo(PL(flip(L.rise[0][1])), PT(flip(T.ridge)));
    else if (cl - T.full - L.full > 1e-6) d = d.lineTo(PL([L.full, -h]));
    d = ops(
      d,
      back(L).map(([op, p, c]) => [op, flip(p), c && flip(c)]),
      PL,
    );
    d = nose(d, L, L.top, PL);
    return d.close().sketchOnPlane(new R.Plane([0, y, 0], [1, 0, 0], [0, 1, 0]));
  };
}
/**
 * A free-form fin whose edge sections reach in to mid-chord (an airfoil or a double wedge), as a loft through true
 * chordwise sections: one at the root and one at the height of every corner of the outline, each scaled to the chord
 * there, joined by straight (ruled) surfaces, which is exact because the outline is straight between its corners.
 * Cutting a strip square to each outline edge instead (stepCurvedEdges) leaves a slab of full thickness with stepped
 * walls under the tip, where the strips of the leading and trailing edges don't reach. Null (the caller falls back to
 * the strips) when the outline isn't one leading edge going up and one trailing edge coming down, the body under the
 * root isn't straight, or a section can't be drawn.
 * @param {object} R replicad
 * @param {number[][]} pts the outline's corners from the root's front, mm (x along the root, y up the span)
 * @param {number} xf where the outline's x = 0 is, mm from the nose tip
 * @param {number} y0 height of the root, mm
 * @param {number} t fin thickness, mm
 * @param {{le:number[][]|null, te:number[][]|null}} edges stepEdges
 * @returns {object|null}
 */
function stepFreeformLoft(R, pts, xf, y0, t, edges) {
  if (!(edges.le && edges.le.nose && edges.le.nose.half && edges.te && edges.te.nose && edges.te.nose.half))
    return null;
  // the outline from the root's leading corner round to its trailing corner
  const n = pts.length;
  let lo = 0;
  for (let i = 1; i < n; i++) if (pts[i][1] < 1e-9 && pts[i][0] < pts[lo][0]) lo = i;
  if (pts[lo][1] > 1e-9) return null;
  let P = [];
  for (let i = 0; i < n; i++) P.push(pts[(lo + i) % n]);
  if (P[1][1] < 1e-9 && P[n - 1][1] > 1e-9) P = [P[0], ...P.slice(1).reverse()];
  const ymax = Math.max(...P.map((q) => q[1]));
  if (!(ymax > 4 * t)) return null;
  const up = [],
    down = [];
  let i = 0;
  for (; i < n; i++) {
    up.push(P[i]);
    if (P[i][1] > ymax - 1e-9) break;
  }
  for (let j = n - 1; j > i; j--) {
    down.push(P[j]);
    if (P[j][1] > ymax - 1e-9) break;
  }
  if (!down.length) down.push(P[i]);
  // everything between the two chains has to lie along the tip (a flat top); each chain climbs all the way
  const used = up.length + down.length - (down[down.length - 1] === P[i] ? 1 : 0);
  if (used < n) for (let j = i + 1; j < n - down.length; j++) if (P[j][1] < ymax - 1e-9) return null;
  const climbs = (C) => C.every((q, j) => j === 0 || q[1] > C[j - 1][1] + 1e-9);
  if (down[0][1] > 1e-9 || !climbs(up) || !climbs(down)) return null;
  const at = (C, y) => {
    for (let j = 1; j < C.length; j++)
      if (y <= C[j][1] + 1e-9) {
        const f = (y - C[j - 1][1]) / (C[j][1] - C[j - 1][1]);
        return C[j - 1][0] + f * (C[j][0] - C[j - 1][0]);
      }
    return C[C.length - 1][0];
  };
  const xle = (y) => at(up, y),
    xte = (y) => at(down, y),
    cmin = Math.max(6 * t, 4);
  if (!(xte(0) - xle(0) > cmin)) return null;
  // stations at the corners' heights, as far up as the chord is wide enough to draw; a pointed tip closes to a point
  let hs = [...new Set([...up, ...down].map((q) => +q[1].toFixed(6)))].sort((a, b) => a - b);
  const sect = stepChordSection(R, t, edges, true),
    sk = [];
  let end = null;
  for (let j = 0; j < hs.length; j++) {
    let y = hs[j];
    const c = xte(y) - xle(y);
    if (c < 0) return null;
    if (c < cmin) {
      // between the last full station and this one the chord narrows through cmin: stop there
      const ya = hs[j - 1],
        ca = xte(ya) - xle(ya);
      y = ya + ((ca - cmin) / (ca - c)) * (y - ya);
      if (y > ya + 1e-6) {
        const s = sect(y0 + y, xf + xle(y), xte(y) - xle(y));
        if (!s) return null;
        sk.push(s);
      }
      end = [xf + (xle(ymax) + xte(ymax)) / 2, y0 + ymax, 0];
      break;
    }
    if (j === 0) {
      // below the root, straight on, so the fin reaches into the body
      const s0 = sect(y0 - 2, xf + xle(0), c);
      if (!s0) return null;
      sk.push(s0);
    }
    const s = sect(y0 + y, xf + xle(y), c);
    if (!s) return null;
    sk.push(s);
  }
  if (sk.length < 2) return null;
  return sk[0].loftWith(sk.slice(1), end ? { ruled: true, endPoint: end } : { ruled: true });
}
/** The flat left on a sharp (bladed) fin edge instead of a knife edge a mesher cannot fill, m: about a sanded fin's. */
const STEP_EDGE_FLAT = 0.0003;
/** Segments in a rounded or airfoil edge's curve. */
const STEP_EDGE_PIECES = 6;
/**
 * How far in from a fin's edge its section reaches full thickness, and the thickness limit along the way, for one
 * end of the section. Mirrors the fin's weight model (finSectionShare): rounded is a half-round of radius t/2, a bevel
 * or taper is a wedge from the edge flat up to full thickness over its length, a double wedge peaks at mid-chord, an
 * airfoil is the biconvex (parabolic) section. A sharp edge stops at the edge flat instead of a knife edge.
 * @param {string} type "square", "rounded", "wedge", "doublewedge" or "airfoil"
 * @param {number} len bevel length (wedge), mm
 * @param {number} t fin thickness, mm
 * @param {number} flat edge flat (full thickness), mm
 * @param {number} c mean chord, mm
 * @returns {number[][]|null} [distance from the edge, half-thickness] points ending at full thickness; null if square
 */
function stepEdgeProfile(type, len, t, flat, c) {
  const h = t / 2,
    hf = Math.min(flat / 2, h);
  if (type === "rounded") {
    const P = [];
    for (let i = 0; i <= STEP_EDGE_PIECES; i++) {
      const a = (i / STEP_EDGE_PIECES) * (Math.PI / 2);
      P.push([h * (1 - Math.cos(a)), h * Math.sin(a)]);
    }
    // a true half-round (stepEdgeBody draws it as an arc, which OpenCascade can fillet along; a polyline it can't)
    P.arc = true;
    return P;
  }
  if (hf >= h * 0.999) return null;
  if (type === "wedge" || type === "doublewedge") {
    const b = Math.min(type === "doublewedge" ? c / 2 : len > 0 ? len : 0.2 * c, c / 2);
    if (!(b > 0)) return null;
    const P = [
      [0, hf],
      [b, h],
    ];
    // drawn smooth for the fillet: round nose, straight face, the crease into the full thickness rounded off
    P.nose = hf > 1e-6 ? { kind: "wedge", b, h, hf, half: b >= c / 2 - 1e-9 } : null;
    return P;
  }
  if (type === "airfoil") {
    const P = [];
    for (let i = 0; i <= STEP_EDGE_PIECES; i++) {
      const u = i / STEP_EDGE_PIECES;
      P.push([(u * c) / 2, hf + (h - hf) * (1 - (1 - u) * (1 - u))]);
    }
    // the section is a parabola: one quadratic Bezier, from the flat to full thickness at half chord
    P.nose = hf > 1e-6 ? { kind: "airfoil", b: c / 2, h, hf, half: true } : null;
    return P;
  }
  return null;
}
/**
 * A fin's leading and trailing edge sections, from its edge settings.
 * @param {object} k fin part of the builder
 * @param {number} t thickness, mm
 * @param {number} flat edge flat, mm
 * @param {number} c mean chord, mm
 * @returns {{le:number[][]|null, te:number[][]|null}}
 */
function stepEdges(k, t, flat, c) {
  const e = k.edge || "square",
    eTE = finTeEdge(k.edgeTE),
    kind = (x) => (x === "beveled" || x === "sharp" ? "wedge" : x),
    teKind = eTE || (e === "beveled" ? "wedge" : e === "airfoil" || e === "doublewedge" ? "wedge" : e),
    bl = (+k.bevLE || 0) * STEP_MM,
    bt = (+k.bevTE || 0) * STEP_MM;
  const le = stepEdgeProfile(kind(e), bl, t, flat, c);
  let te;
  if ((e === "airfoil" || e === "doublewedge") && !eTE) te = stepEdgeProfile(e, 0, t, flat, c);
  else te = stepEdgeProfile(kind(teKind === "wedge" ? "wedge" : teKind), bt, t, flat, c);
  return { le, te };
}
/**
 * An edge section drawn with smooth curves, for the fillet: OpenCascade can roll a fillet along a section without
 * creases, not along a polyline. A rounded edge is a true half-round; a bladed edge's flat is drawn as a round nose of
 * about its width, tangent to the faces, and its way to full thickness has no crease (a wedge's corner is rounded off
 * over a couple of mm, an airfoil's parabola is one quadratic Bezier). Null for a section that is drawn as a polyline.
 * @param {number[][]} prof stepEdgeProfile
 * @param {number} h2 half-thickness of the strip the section is drawn in, mm (more than the fin's)
 * @param {number} [deep] how far in past full thickness the path ends, mm
 * @returns {{far:number, ops:object[]}|null} the path from (far, -h2) round the edge to (far, h2), in (distance in
 *   from the edge, half-thickness)
 */
function stepSmoothSection(prof, h2, deep = 1000) {
  if (prof.arc) {
    const hh = prof[prof.length - 1][1],
      q = Math.SQRT1_2,
      far = hh + deep;
    return {
      far,
      ops: [
        ["L", [hh, -h2]],
        ["L", [hh, -hh]],
        ["A", [0, 0], [hh * (1 - q), -hh * q]],
        ["A", [hh, hh], [hh * (1 - q), hh * q]],
        ["L", [hh, h2]],
        ["L", [far, h2]],
      ],
    };
  }
  if (!prof.nose) return null;
  const { kind, b, h, hf } = prof.nose,
    // the face starts along the line from the flat towards the Bezier's control point (airfoil) or the wedge's corner
    cp = kind === "airfoil" ? [b / 2, h] : [b, h],
    sl = (cp[1] - hf) / cp[0],
    rn = hf / (Math.sqrt(1 + sl * sl) - sl),
    tx = (rn - sl * hf) / (1 + sl * sl),
    ty = hf + sl * tx,
    e = Math.min(0.25 * b, 2),
    end = kind === "airfoil" ? b : b + e,
    far = end + deep;
  const ops = [
    ["L", [end + 1, -h2]],
    ["L", [end, -h]],
  ];
  if (kind === "airfoil") ops.push(["Q", [tx, -ty], [cp[0], -cp[1]]]);
  else ops.push(["Q", [b - e, -(h - sl * e)], [b, -h]], ["L", [tx, -ty]]);
  ops.push(["A", [tx, ty], [0, 0]]);
  if (kind === "airfoil") ops.push(["Q", [b, h], cp]);
  else ops.push(["L", [b - e, h - sl * e]], ["Q", [b + e, h], [b, h]]);
  ops.push(["L", [end + 1, h2]], ["L", [far, h2]]);
  return { far, ops };
}
/**
 * Draws a stepSmoothSection path onto a drawing.
 * @param {object} d replicad drawing, at the path's start
 * @param {object[]} ops the path
 * @param {function(number[]):number[]} S maps a section point to the drawing's
 * @returns {object} the drawing
 */
function stepDrawSection(d, ops, S) {
  for (const [op, p, c] of ops)
    d =
      op === "L" ? d.lineTo(S(p)) : op === "Q" ? d.quadraticBezierCurveTo(S(p), S(c)) : d.threePointsArcTo(S(p), S(c));
  return d;
}
/**
 * How far in from the edge a section is within 10% of its full thickness.
 * @param {number[][]} pr stepEdgeProfile
 * @param {number} t thickness, mm
 * @returns {number} mm
 */
function stepFullIn(pr, t) {
  const h = t / 2;
  for (let i = 1; i < pr.length; i++)
    if (pr[i][1] >= 0.9 * h) {
      const a = pr[i - 1],
        b = pr[i];
      return a[0] + ((0.9 * h - a[1]) / Math.max(b[1] - a[1], 1e-9)) * (b[0] - a[0]);
    }
  return pr[pr.length - 1][0];
}
/**
 * The edge sections on a fin whose edges are curved or many-sided (elliptical, free-form): each straight piece of the
 * outline, except the root, cuts away what is above the section's profile in a strip along it (the section measured
 * square to the piece), leading pieces by the leading profile and trailing ones by the trailing profile. The strips
 * are extended past a concave corner so no wedge of full thickness is left there.
 * @param {object} R replicad
 * @param {object} solid the full-thickness plate
 * @param {number[][]} M the outline's corners, mm (x, y)
 * @param {number} ri index of the root's first corner, or -1
 * @param {{le:number[][]|null, te:number[][]|null}} edges stepEdges
 * @param {number} t thickness, mm
 * @param {number} thr a piece whose outward normal points less than this far along x (0 to 1) gets no section
 * @returns {{solid:object}}
 */
function stepCurvedEdges(R, solid, M, ri, edges, t, thr) {
  const n = M.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += M[i][0] * M[(i + 1) % n][1] - M[(i + 1) % n][0] * M[i][1];
  const ccw = area > 0;
  const seg = [];
  for (let i = 0; i < n; i++) {
    if (i === ri) continue;
    const a = M[i],
      b = M[(i + 1) % n],
      L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L],
      inward = ccw ? [-d[1], d[0]] : [d[1], -d[0]];
    seg.push({ i, a, b, L, d, inward, nx: -inward[0] });
  }
  const turn = (p, q) => {
    // the corner between two pieces: concave when the outline turns the other way from its overall direction
    const c = p.d[0] * q.d[1] - p.d[1] * q.d[0];
    return { concave: ccw ? c < 0 : c > 0, ang: Math.atan2(Math.abs(c), p.d[0] * q.d[0] + p.d[1] * q.d[1]) };
  };
  const h2 = t / 2 + 1;
  // one C-shaped cutter per piece: everything outside the section's outline
  const cutter = (prof, sd) => {
    const o = [sd.a[0] - sd.d[0] * sd.e0, sd.a[1] - sd.d[1] * sd.e0, 0];
    const pl = new R.Plane(o, [sd.inward[0], sd.inward[1], 0], [sd.d[0], sd.d[1], 0]);
    const smooth = stepSmoothSection(prof, h2);
    if (smooth) {
      const H = h2 + 5,
        S = (q) => q;
      return stepDrawSection(
        R.draw([-3, H]).lineTo([-3, -H]).lineTo([smooth.far, -H]).lineTo([smooth.far, -h2]),
        smooth.ops,
        S,
      )
        .lineTo([smooth.far, H])
        .close()
        .sketchOnPlane(pl)
        .extrude(sd.L + sd.e0 + sd.e1);
    }
    const last = prof[prof.length - 1],
      prev = prof[prof.length - 2] || [last[0] - 1, last[1]],
      m = last[0] > prev[0] ? (last[1] - prev[1]) / (last[0] - prev[0]) : 0;
    const top = [];
    if (prof[0][1] > 1e-9) top.push([-0.5, prof[0][1]]);
    top.push(...prof);
    top.push(m > 0.05 ? [last[0] + 1 / m, h2] : [last[0], h2]);
    const far = top[top.length - 1][0] + 1000,
      H = h2 + 5;
    top.push([far, h2]);
    const bottom = top.map(([x, z]) => [x, -z]);
    const P = [[-3, H], [-3, -H], [far, -H], ...bottom.reverse(), ...top, [far, H]].filter(
      (q, i, aa) => i === 0 || Math.abs(q[0] - aa[i - 1][0]) > 1e-9 || Math.abs(q[1] - aa[i - 1][1]) > 1e-9,
    );
    let d = R.draw(P[0]);
    for (let i = 1; i < P.length; i++) d = d.lineTo(P[i]);
    return d
      .close()
      .sketchOnPlane(pl)
      .extrude(sd.L + sd.e0 + sd.e1);
  };
  seg.forEach((sd) => {
    const prof = sd.nx < -thr ? edges.le : sd.nx > thr ? edges.te : null;
    if (!prof) return;
    const prev = seg.find((q) => q.i === (sd.i + n - 1) % n),
      next = seg.find((q) => q.i === (sd.i + 1) % n),
      sf = stepFullIn(prof, t);
    const ext = (q, first) => {
      if (!q) return 0;
      const c = first ? turn(q, sd) : turn(sd, q);
      return c.concave ? Math.min(sf * Math.tan(Math.min(c.ang, 1.4) / 2) + 0.5, 3 * sf) : 0;
    };
    sd.e0 = ext(prev, true);
    sd.e1 = ext(next, false);
    solid = solid.cut(cutter(prof, sd));
  });
  return { solid };
}
/**
 * The solid that keeps one edge's section: a prism of the section's outline (half-thickness against distance from
 * the edge) swept along the edge, so the section keeps the same length at every height up the fin. A fin is cut
 * to it with an intersection.
 * @param {object} R replicad
 * @param {number[][]} prof stepEdgeProfile
 * @param {number[]} p0 edge's first point [x, y], mm
 * @param {number[]} p1 edge's second point, mm
 * @param {number} side 1 for a leading edge (the chord lies at larger x), -1 for a trailing edge
 * @param {number} t fin thickness, mm
 * @returns {object} replicad solid
 */
function stepEdgeBody(R, prof, p0, p1, side, t) {
  const dy = p1[1] - p0[1],
    dx = p1[0] - p0[0],
    L = Math.hypot(dx, dy),
    ext = 5,
    v = [dx / L, dy / L, 0],
    o = [p0[0] - v[0] * ext, p0[1] - v[1] * ext, 0],
    top = [],
    h2 = t / 2 + 1;
  const last = prof[prof.length - 1],
    prev = prof[prof.length - 2] || [last[0] - 1, last[1]],
    m = last[0] > prev[0] ? (last[1] - prev[1]) / (last[0] - prev[0]) : 0;
  if (prof[0][1] > 1e-9) top.push([-0.5, prof[0][1]]);
  top.push(...prof);
  // past the full thickness the cutter stays clear of the fin's faces, by the section's own slope or a step
  if (m > 1e-6) top.push([last[0] + 1 / m, h2]);
  else top.push([last[0], h2]);
  top.push([top[top.length - 1][0] + 1000, h2]);
  const pts = [...top, ...[...top].reverse().map(([s, z]) => [s, -z])].filter(
    (q, i, a) => i === 0 || Math.abs(q[0] - a[i - 1][0]) > 1e-9 || Math.abs(q[1] - a[i - 1][1]) > 1e-9,
  );
  const pl = new R.Plane([o[0], o[1], 0], [1, 0, 0], [0, 1, 0]);
  const smooth = stepSmoothSection(prof, h2);
  if (smooth) {
    const S = (q) => [side * q[0], q[1]];
    return stepDrawSection(R.draw(S([smooth.far, -h2])), smooth.ops, S)
      .close()
      .sketchOnPlane(pl)
      .extrude(L + 2 * ext, { extrusionDirection: v });
  }
  let d = R.draw([side * pts[0][0], pts[0][1]]);
  for (let i = 1; i < pts.length; i++) d = d.lineTo([side * pts[i][0], pts[i][1]]);
  return d
    .close()
    .sketchOnPlane(pl)
    .extrude(L + 2 * ext, { extrusionDirection: v });
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
    uc = Math.sqrt(d * d - vc * vc);
  // where the fillet circle touches the body and where it touches the fin; its middle, for the arc
  const tb = [(uc * r) / d, (vc * r) / d],
    a1 = -Math.PI / 2,
    a2 = Math.atan2(-vc, -uc),
    am = (a1 + a2) / 2, // both between -180° and -90°: no wrapping
    mid = [uc + rho * Math.cos(am), vc + rho * Math.sin(am)];
  const S = (p) => [p[0], p[1] * side];
  // in to the fin's mid-plane: where a bevel thins the fin, the fillet (trimmed to the bevel by the caller) still meets it
  const wedge = R.draw(S([r * 0.9, 0]))
    .lineTo(S([uc, 0]))
    .lineTo(S([uc, h]))
    .threePointsArcTo(S(tb), S(mid))
    .lineTo(S([tb[0] * 0.9, tb[1] * 0.9]))
    .close();
  return wedge.sketchOnPlane("YZ", x0).extrude(x1 - x0);
}
/**
 * The parts that stand out from the body (launch lugs, rail buttons, protuberances), as solids that overlap the body
 * a little so they join it. Angles run around the body from the fin's zero direction, like the fins'.
 * @param {object} R replicad
 * @param {object[]} bodies layout bodies (bldLayout)
 * @param {string[]} warnings gets a line for any that could not be made
 * @param {number[]} [fins] the fins' angles, degrees: lugs and rail buttons go halfway between two of them
 * @returns {object[]} replicad solids
 */
function stepOuterParts(R, bodies, warnings, fins = []) {
  const out = [],
    sink = 0.5;
  const turn = (s, a) => (a ? s.rotate(a, [0, 0, 0], [1, 0, 0]) : s);
  const span = (x0, x1) => {
    const rs = [x0, (x0 + x1) / 2, x1].map((x) => stepRadiusAt(bodies, x));
    return { lo: Math.min(...rs), hi: Math.max(...rs) };
  };
  const rod = (x0, len, y, ro, ri) => {
    let d = R.drawCircle(ro).translate(y, 0);
    if (ri > 0.01) d = d.cut(R.drawCircle(ri).translate(y, 0));
    return d.sketchOnPlane("YZ", x0).extrude(len);
  };
  const box = (x0, len, w, y0, y1) =>
    R.draw([y0, -w / 2])
      .lineTo([y1, -w / 2])
      .lineTo([y1, w / 2])
      .lineTo([y0, w / 2])
      .close()
      .sketchOnPlane("YZ", x0)
      .extrude(len);
  const prism = (pp, w) => {
    let d = R.draw(pp[0]);
    for (let i = 1; i < pp.length; i++) d = d.lineTo(pp[i]);
    return d
      .close()
      .sketchOnPlane("XY", -w / 2)
      .extrude(w);
  };
  const post = (x, y, r, h) => R.makeCylinder(r, h, [x, y, 0], [0, 1, 0]);
  for (const b of bodies)
    for (const c of b.kids) {
      const k = c.k,
        x0 = c.x * STEP_MM,
        len = c.len * STEP_MM;
      if (k.type !== "lug" && k.type !== "buttons" && k.type !== "bump") continue;
      try {
        if (k.type === "lug") {
          const q = span(x0, x0 + len),
            rail = bldRailLug(k);
          if (!(len > 0)) continue;
          if (rail && len <= 1.6 * rail.w * STEP_MM) {
            // a solid lug about as long as it is wide is a rail button (older OpenRocket designs draw buttons that
            // way): round, of the lug's own length across and height, with a button's base, neck and flange in the
            // proportions of the rail's standard button
            const B = BLD_BUTTONS[bldLugKind(k).slice(1)] || BLD_BUTTONS["1010"],
              xc = x0 + len / 2,
              y = stepRadiusAt(bodies, xc),
              ro = len / 2,
              hh = rail.h * STEP_MM,
              base = (B.bs / B.h) * hh,
              fl = (B.fl / B.h) * hh,
              rn = (B.id / B.od) * ro;
            const stack = post(xc, y - sink, ro, base + sink)
              .fuse(post(xc, y + base - 0.05, rn, hh - base - fl + 0.1))
              .fuse(post(xc, y + hh - fl, ro, fl));
            out.push(turn(stack, stepGuideAngle(fins, +k.dir || 0)));
          } else if (rail) {
            // a longer one is a rail guide: a block the width and height of the rail's slot
            out.push(
              turn(
                box(x0, len, rail.w * STEP_MM, q.lo - sink, q.hi + rail.h * STEP_MM),
                stepGuideAngle(fins, +k.dir || 0),
              ),
            );
          } else {
            const ro = (k.od * STEP_MM) / 2,
              ri = ((k.id_ || 0) * STEP_MM) / 2,
              em = Math.min(0.15 * ro * 2, 0.6 * (ro - ri));
            out.push(turn(rod(x0, len, q.hi + ro - em, ro, ri), stepGuideAngle(fins, +k.dir || 0)));
          }
        } else if (k.type === "buttons") {
          const P = k.size === "custom" && k.dims ? k.dims : BLD_BUTTONS[k.size] || BLD_BUTTONS["1010"];
          for (let i = 0; i < Math.max(Math.floor(k.n), 1); i++) {
            const xc = x0 + 5 + i * k.sep * STEP_MM,
              y = stepRadiusAt(bodies, xc),
              ro = (P.od * STEP_MM) / 2,
              rn = (P.id * STEP_MM) / 2,
              base = P.bs * STEP_MM,
              fl = P.fl * STEP_MM,
              hh = P.h * STEP_MM;
            const stack = post(xc, y - sink, ro, base + sink)
              .fuse(post(xc, y + base - 0.05, rn, hh - base - fl + 0.1))
              .fuse(post(xc, y + hh - fl, ro, fl));
            out.push(turn(stack, stepGuideAngle(fins, +k.dir || 0)));
          }
        } else {
          const q = span(x0, x0 + len),
            w = (k.w || 0) * STEP_MM,
            h = (k.h || 0) * STEP_MM,
            y0 = q.lo - sink;
          if (!(len > 0) || !(h > 0)) continue;
          let s;
          if (k.shape === "flyaway") s = R.makeCylinder(q.hi + h, len, [x0, 0, 0], [1, 0, 0]);
          else if (k.shape === "round") s = post(x0 + len / 2, y0, w / 2, q.hi + h - y0);
          else if (k.shape === "ramp")
            s = prism(
              [
                [x0, y0],
                [x0 + len, y0],
                [x0 + len, q.hi + h],
                [x0 + Math.min(len * 0.5, h * 3), q.hi + h],
                [x0, q.hi],
              ],
              w,
            );
          else if (k.shape === "faired") {
            const P = [
              [x0 + len, y0],
              [x0, y0],
            ];
            for (let i = 0; i <= 24; i++) {
              const a = (Math.PI * i) / 24;
              P.push([x0 + (len / 2) * (1 - Math.cos(a)), q.hi + h * Math.sin(a)]);
            }
            s = prism(P, w);
          } else s = box(x0, len, w, y0, q.hi + h);
          out.push(turn(s, +k.ang || 0));
        }
      } catch (e) {
        warnings.push(`${k.name || k.type} could not be added to the file (${(e && e.message) || "shape error"}).`);
      }
    }
  return out;
}
/**
 * The glue fillets of one fin on a straight body tube, built to follow the fin's own section: a loft through
 * cross-sections along the root, each a round fillet tangent to the tube and to the fin's side where it touches it.
 * The fillet is full size where the fin is full thickness and narrows with the fin along a bevel or an airfoil's nose,
 * so it hugs the bevel down to the edge and ends there with the fin (as a modeller's fillet does), instead of standing
 * out past the edge or burying it. The fin's thickness is read from the finished fin itself, so this works for any
 * outline and edge section, swept edges included.
 * @param {object} R replicad
 * @param {{solid:object, x0:number, x1:number, t:number}} fin the fin at angle 0 (stepFinSolid), t its thickness, mm
 * @param {number} r tube radius, mm
 * @param {number} rho fillet radius, mm
 * @param {number} xa start of the tube, mm
 * @param {number} xb end of the tube, mm
 * @returns {{sides:object[], over:number[][]}|null} the two sides' fillets and the x ranges past the tube's ends to cut
 *   off once they are joined on; null if they can't be made
 */
function stepLoftFillet(R, fin, r, rho, xa, xb) {
  const hFull = fin.t / 2,
    mesh = fin.solid.mesh({ tolerance: 0.02, angularTolerance: 0.3 }),
    V = mesh.vertices,
    T = mesh.triangles;
  // the fin's half-thickness at (x, y): the highest of its skin's triangles over that point; in strips along x
  const x0 = fin.x0 - 1,
    strips = Array.from({ length: Math.ceil(fin.x1 - fin.x0 + 2) + 1 }, () => []);
  for (let i = 0; i < T.length; i += 3) {
    const xs = [V[3 * T[i]], V[3 * T[i + 1]], V[3 * T[i + 2]]],
      lo = Math.max(0, Math.floor(Math.min(...xs) - x0)),
      hi = Math.min(strips.length - 1, Math.floor(Math.max(...xs) - x0));
    for (let b = lo; b <= hi; b++) strips[b].push(i);
  }
  const half = (x, y) => {
    const strip = strips[Math.floor(x - x0)];
    let best = 0;
    if (!strip) return 0;
    for (const i of strip) {
      const a = 3 * T[i],
        b = 3 * T[i + 1],
        c = 3 * T[i + 2],
        den = (V[b + 1] - V[c + 1]) * (V[a] - V[c]) + (V[c] - V[b]) * (V[a + 1] - V[c + 1]);
      if (Math.abs(den) < 1e-12) continue;
      const w0 = ((V[b + 1] - V[c + 1]) * (x - V[c]) + (V[c] - V[b]) * (y - V[c + 1])) / den,
        w1 = ((V[c + 1] - V[a + 1]) * (x - V[c]) + (V[a] - V[c]) * (y - V[c + 1])) / den,
        w2 = 1 - w0 - w1;
      if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
      best = Math.max(best, w0 * V[a + 2] + w1 * V[b + 2] + w2 * V[c + 2]);
    }
    return best;
  };
  // one station's fillet: where it touches the tube and the fin, and the arc's middle, in (y, z) on the +z side
  const station = (x) => {
    const h0 = half(x, r + 0.05);
    if (!(h0 > 0.02)) return null;
    // no taller than the fin is at this station (behind a swept leading edge the fin starts low and the fillet with it)
    let lo = r + 0.05,
      hi = r + 1.5 * rho + 1;
    if (half(x, hi) > 0.01) lo = hi;
    else
      for (let i = 0; i < 14; i++) {
        const md = (lo + hi) / 2;
        if (half(x, md) > 0.01) lo = md;
        else hi = md;
      }
    let rad = Math.min(rho * Math.min(1, h0 / hFull), 0.7 * (lo - r));
    if (!(rad > 0.03)) return null;
    for (let shrink = 0; shrink < 6; shrink++, rad *= 0.6) {
      let yq = r + rad,
        out = null;
      for (let it = 0; it < 6; it++) {
        const hp = half(x, yq);
        if (!(hp > 0.01)) {
          out = null;
          break;
        }
        const up = half(x, yq + 0.2),
          dn = half(x, yq - 0.2),
          sl = up > 0 && dn > 0 ? Math.max(-1, Math.min(1, (up - dn) / 0.4)) : 0,
          L = Math.hypot(1, sl),
          d = [1 / L, sl / L],
          n = [-sl / L, 1 / L],
          B = [yq + rad * n[0], hp + rad * n[1]],
          bd = B[0] * d[0] + B[1] * d[1],
          disc = bd * bd - (B[0] * B[0] + B[1] * B[1]) + (r + rad) * (r + rad);
        if (!(disc >= 0)) {
          out = null;
          break;
        }
        const u = -bd + Math.sqrt(disc),
          C = [B[0] + u * d[0], B[1] + u * d[1]],
          tf = [C[0] - rad * n[0], C[1] - rad * n[1]],
          tb = [(C[0] * r) / (r + rad), (C[1] * r) / (r + rad)],
          m = [tb[0] + tf[0] - 2 * C[0], tb[1] + tf[1] - 2 * C[1]],
          ml = Math.hypot(m[0], m[1]);
        // The arc is not left exactly tangent to the tube and the fin (OpenCascade can't join surfaces that only
        // touch): its centre is moved a hair towards the corner, so it crosses both at about 3 degrees, and it runs on
        // a little way inside each.
        const eps = 0.0015 * rad,
          Cx = [C[0] + (eps * m[0]) / ml, C[1] + (eps * m[1]) / ml],
          ab = Math.atan2(tb[1] - C[1], tb[0] - C[0]),
          af = Math.atan2(tf[1] - C[1], tf[0] - C[0]),
          turn = Math.sin(af - ab) > 0 ? 1 : -1,
          more = Math.sqrt(2 * 0.0015) + 0.08,
          at = (q) => [Cx[0] + rad * Math.cos(q), Cx[1] + rad * Math.sin(q)];
        out = {
          tb,
          tf,
          pb: at(ab - turn * more),
          pf: at(af + turn * more),
          mid: [Cx[0] + (rad * m[0]) / ml, Cx[1] + (rad * m[1]) / ml],
        };
        if (Math.abs(tf[0] - yq) < 1e-3) break;
        yq = tf[0];
      }
      if (out && out.tf[0] > r * 0.99 && out.tf[1] < out.tb[1]) return out;
    }
    return null;
  };
  // stations along the root, closer together towards its ends, where the edges' sections are
  const n = 40,
    st = [];
  for (let i = 0; i <= n; i++) {
    // (the fin is measured a hair inside its ends, but the end sections sit exactly on them: an end flush with the
    // tube's lies in the same plane, not a micron off it)
    const x = fin.x0 + (fin.x1 - fin.x0) * ((1 - Math.cos((Math.PI * i) / n)) / 2),
      q = station(Math.min(Math.max(x, fin.x0 + 1e-3), fin.x1 - 1e-3));
    st.push(q && { x, ...q });
  }
  // the longest unbroken run of them
  let run = [],
    cur = [];
  for (const q of [...st, null]) {
    if (q) cur.push(q);
    else {
      if (cur.length > run.length) run = cur;
      cur = [];
    }
  }
  if (run.length < 3) return null;
  // an end flush with the tube's end: the fillet is made to run 2 mm past it, and the caller cuts it back to the end
  // once it is on the tube, since an end face made in the same plane as the tube's doesn't join reliably
  const over = [];
  if (run[0].x < xa + 0.01) {
    run.unshift({ ...run[0], x: xa - 2 });
    over.push([xa - 3, xa]);
  }
  if (run[run.length - 1].x > xb - 0.01) {
    run.push({ ...run[run.length - 1], x: xb + 2 });
    over.push([xb, xb + 3]);
  }
  const sideSolid = (sg) => {
    const S = (p) => [p[0], sg * p[1]];
    const sk = run.map((q) => {
      // the arc, then round well inside the fin and the tube (sides close under their skins don't join reliably)
      const zi = 0.3 * q.pf[1],
        k = (r - 0.5) / Math.hypot(q.pb[0], q.pb[1]);
      return R.draw(S(q.pb))
        .threePointsArcTo(S(q.pf), S(q.mid))
        .lineTo(S([q.pf[0], zi]))
        .lineTo(S([Math.sqrt((r - 0.5) * (r - 0.5) - zi * zi), zi]))
        .lineTo(S([q.pb[0] * k, q.pb[1] * k]))
        .close()
        .sketchOnPlane("YZ", q.x);
    });
    return sk[0].loftWith(sk.slice(1), { ruled: true });
  };
  const a = sideSolid(1),
    b = sideSolid(-1);
  if (!(Math.abs(R.measureVolume(a)) > 0) || !(Math.abs(R.measureVolume(b)) > 0)) return null;
  return { sides: [a, b], over };
}
/**
 * Whether OpenCascade's own checker finds a shape sound (faces closed up, no overlaps).
 * @param {object} R replicad
 * @param {object} shape
 * @returns {boolean} true if sound (or the checker isn't there)
 */
function stepValid(R, shape) {
  try {
    const oc = R.getOC(),
      chk = new oc.BRepCheck_Analyzer(shape.wrapped, true, false),
      ok = chk.IsValid_2();
    chk.delete();
    return ok;
  } catch (e) {
    return true;
  }
}
/**
 * The glue fillets where the fins meet a straight body tube, made by OpenCascade's own fillet on the finished fin and
 * tube: the fillet runs round the fin's whole root, wrapping the leading and trailing edges and blending into the
 * tube. The tube is made longer than the real one while this is done, so a fin that ends flush with the base still
 * has tube to roll the fillet onto, and cut back to the real length afterwards. Returns null when OpenCascade can't
 * do it for this shape, so the caller can use the simpler trimmed fillets instead.
 * @param {object} R replicad
 * @param {object[]} bodies layout bodies (bldLayout)
 * @param {object[]} fins the fin sets (stepFinSolid's result with k, xf and ang)
 * @param {object} host the tube(s) with the fins fused on, before the fillet
 * @param {number} r tube radius, mm
 * @param {number} rho fillet radius, mm
 * @param {number} xa start of the tube(s), mm
 * @param {number} xb end of the tube(s), mm
 * @param {number} seam angle of the tube's seam, degrees
 * @param {number} flat edge flat, mm
 * @param {number} expect the fillet volume to expect, mm3 (a result far from it is a failed fillet)
 * @returns {Promise<object|null>}
 */
async function stepOcFillet(R, bodies, fins, host, r, rho, xa, xb, seam, flat, expect) {
  const ext = Math.max(12, 4 * rho),
    bx = bodies.map((b) => ({ ...b }));
  bx[0].x -= ext / STEP_MM;
  bx[0].len += ext / STEP_MM;
  bx[bx.length - 1].len += ext / STEP_MM;
  let local = R.makeCylinder(r, xb - xa + 2 * ext, [xa - ext, 0, 0], [1, 0, 0]);
  // OpenCascade puts the tube's seam at some angle: turn it to the one used for the rest of the rocket
  const sl = local.edges.find((e) => {
    const a = e.startPoint,
      b = e.endPoint;
    return Math.abs(a.x - b.x) > 1 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
  });
  if (sl)
    local = local.rotate(seam - (Math.atan2(sl.startPoint.z, sl.startPoint.y) * 180) / Math.PI, [0, 0, 0], [1, 0, 0]);
  const span = [Infinity, -Infinity];
  for (const f of fins) {
    const g = stepFinSolid(R, f.k, f.xf, bx, flat);
    if (!g) continue;
    span[0] = Math.min(span[0], g.x0);
    span[1] = Math.max(span[1], g.x1);
    for (const a of f.ang) local = local.fuse(a ? g.solid.clone().rotate(a, [0, 0, 0], [1, 0, 0]) : g.solid.clone());
  }
  const onTube = (p) => Math.abs(Math.hypot(p.y, p.z) - r) < 0.02;
  const pick = (e) => {
    const a = e.startPoint,
      m = e.pointAt(0.5),
      b = e.endPoint;
    if (!onTube(a) || !onTube(m) || !onTube(b)) return null;
    if (m.x < span[0] - 0.5 || m.x > span[1] + 0.5) return null;
    // the tube's seam is not a fin joint
    const ang = (Math.atan2(m.z, m.y) * 180) / Math.PI,
      dA = Math.abs(((ang - seam + 540) % 360) - 180);
    if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && dA < 0.5) return null;
    return rho;
  };
  let out = local.fillet(pick);
  // (a fillet can come back as a compound holding the one solid; the cuts and joins below need the solid itself)
  if ((out.solids || []).length === 1) out = out.solids[0];
  // back to the real tube: cut off the extra length (and the fillet on it), then put the fins' overhang back
  const cap = rho + 0.5;
  out = out
    .cut(R.makeCylinder(r + cap, ext + 1, [xb, 0, 0], [1, 0, 0]))
    .cut(R.makeCylinder(r + cap, ext + 1, [xa - ext - 1, 0, 0], [1, 0, 0]));
  // (only what was cut off: fusing a whole fin back onto itself can confuse OpenCascade)
  for (const f of fins) {
    const bb = f.solid.boundingBox.bounds;
    for (const [hit, x0] of [
      [bb[1][0] > xb + 1e-6, xb],
      [bb[0][0] < xa - 1e-6, xa - ext - 1],
    ]) {
      if (!hit) continue;
      const piece = f.solid.clone().intersect(R.makeCylinder(r + cap, ext + 1, [x0, 0, 0], [1, 0, 0]));
      for (const a of f.ang) out = out.fuse(a ? piece.clone().rotate(a, [0, 0, 0], [1, 0, 0]) : piece.clone());
    }
  }
  const v0 = R.measureVolume(host);
  // OpenCascade sometimes leaves a fresh fillet slightly off (it measures, and writes, a little differently from what it
  // holds), though the faces are right: written to STEP and read back, the solid is clean, so judge and keep that
  if ((out.solids || []).length === 1) out = out.solids[0];
  try {
    const blob = R.exportSTEP([{ shape: out, name: "fillet" }], { unit: "mm", modelUnit: "mm" }),
      sol = (await R.importSTEP(new Blob([await blob.text()]))).solids || [];
    if (sol.length === 1) out = sol[0];
  } catch (e) {
    // keep the solid as it is: the finished file is checked again
  }
  const d = R.measureVolume(out) - v0;
  const valid = stepValid(R, out);
  return valid && d > 0.3 * expect && d < 2.5 * expect ? out : null;
}
/**
 * How finely the STL's triangles follow the curved surfaces: the furthest a triangle may lie from the true surface
 * (mm), and the most its direction may turn from one triangle to the next (degrees). Fine keeps the surface within
 * 0.02 mm and shows no facets; coarse has a few times fewer triangles.
 */
const STL_MESH = {
  fine: { tolerance: 0.02, angle: 5 },
  coarse: { tolerance: 0.2, angle: 20 },
};
/** Points of an STL mesh closer together than this are one point, mm. */
const STL_WELD = 0.01;
/**
 * The solid buildStep made, as a binary STL file: the same full-size shape in millimetres, as triangles. The mesh must
 * be closed (every edge walked as often one way as the other) and enclose the solid's volume, or it throws.
 * @param {object} shape buildStep's shape
 * @param {"fine"|"coarse"} quality
 * @param {number} volume the solid's volume, mm³ (buildStep's info.volume)
 * @returns {{data:ArrayBuffer, triangles:number, volume:number}}
 */
export function buildStl(shape, quality, volume) {
  const q = STL_MESH[quality] || STL_MESH.coarse,
    m = shape.mesh({ tolerance: q.tolerance, angularTolerance: (q.angle * Math.PI) / 180 }),
    V = m.vertices,
    T = m.triangles;
  // faces are meshed one by one, so a point on the seam between two faces is there once for each: the same point is
  // found by its coordinates as the file holds them (32-bit numbers, which is all an STL keeps: about 0.00006 mm at
  // 1 m), so the mesh is judged exactly as a program reading the file will see it
  const ids = new Map(),
    vid = new Int32Array(V.length / 3);
  for (let i = 0; i < vid.length; i++) {
    const k = `${Math.fround(V[3 * i])},${Math.fround(V[3 * i + 1])},${Math.fround(V[3 * i + 2])}`;
    let id = ids.get(k);
    if (id === undefined) ids.set(k, (id = ids.size));
    vid[i] = id;
  }
  // Where slivers of faces meet (a fin's edge flat running into a fillet's end at the tube's end), the mesher can put
  // the two faces' points a few thousandths of a millimetre apart along their shared edge, which leaves hairline
  // cracks. Points closer than STL_WELD (well under the mesh's own tolerance, and far under the 0.3 mm edge flat, the
  // smallest thing in the solid) are one point: each takes the first of its group's coordinates, in the file too.
  const P = new Float64Array(3 * ids.size);
  {
    const first = new Int32Array(ids.size).fill(-1);
    for (let i = 0; i < vid.length; i++) if (first[vid[i]] < 0) first[vid[i]] = i;
    const cell = (v) => Math.floor(v / STL_WELD),
      grid = new Map(),
      rep = new Int32Array(ids.size);
    for (let j = 0; j < ids.size; j++) {
      const x = V[3 * first[j]],
        y = V[3 * first[j] + 1],
        z = V[3 * first[j] + 2],
        cx = cell(x),
        cy = cell(y),
        cz = cell(z);
      let r = -1;
      for (let a = -1; a <= 1 && r < 0; a++)
        for (let b = -1; b <= 1 && r < 0; b++)
          for (let c = -1; c <= 1 && r < 0; c++)
            for (const q of grid.get(`${cx + a},${cy + b},${cz + c}`) || [])
              if (Math.hypot(P[3 * q] - x, P[3 * q + 1] - y, P[3 * q + 2] - z) < STL_WELD) {
                r = q;
                break;
              }
      if (r < 0) {
        r = j;
        P[3 * j] = x;
        P[3 * j + 1] = y;
        P[3 * j + 2] = z;
        const k = `${cx},${cy},${cz}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(j);
      }
      rep[j] = r;
    }
    for (let i = 0; i < vid.length; i++) vid[i] = rep[vid[i]];
  }
  let keep = [];
  for (let t = 0; t < T.length; t += 3) {
    const a = vid[T[t]],
      b = vid[T[t + 1]],
      c = vid[T[t + 2]];
    // a triangle whose corners are one point (a nose tip's fan, a seam) has no area: left out
    if (a !== b && b !== c && a !== c) keep.push(t);
  }
  // Where a fin thins to nothing (the tip of an elliptical airfoil fin), its two faces land on the same points and
  // leave pairs of the same triangle facing opposite ways: flaps of no thickness, taken out in pairs
  {
    const key = (t, flip) => {
      const a = vid[T[t]],
        b = vid[T[t + (flip ? 2 : 1)]],
        c = vid[T[t + (flip ? 1 : 2)]];
      // the same triangle, whichever corner it starts from
      return a < b && a < c ? `${a},${b},${c}` : b < c ? `${b},${c},${a}` : `${c},${a},${b}`;
    };
    const seen = new Map();
    for (const t of keep) {
      const k = key(t, false);
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(t);
    }
    const gone = new Set();
    for (const t of keep) {
      if (gone.has(t)) continue;
      const opp = (seen.get(key(t, true)) || []).find((x) => !gone.has(x) && x !== t);
      if (opp !== undefined) {
        gone.add(t);
        gone.add(opp);
      }
    }
    if (gone.size) keep = keep.filter((t) => !gone.has(t));
  }
  // closed: every edge is walked as often one way as the other (once each, except where the surface pinches to a
  // line, at such a tip)
  const edges = new Map();
  for (const t of keep)
    for (let e = 0; e < 3; e++) {
      const a = vid[T[t + e]],
        b = vid[T[t + ((e + 1) % 3)]],
        k = a < b ? a * ids.size + b : b * ids.size + a;
      edges.set(k, (edges.get(k) || 0) + (a < b ? 1 : -1));
    }
  let open = 0;
  for (const v of edges.values()) if (v !== 0) open++;
  const buf = new ArrayBuffer(84 + 50 * keep.length),
    dv = new DataView(buf);
  new Uint8Array(buf).set(new TextEncoder().encode("Pocket Rocket Flight Lab, millimetres").slice(0, 79));
  dv.setUint32(80, keep.length, true);
  let o = 84,
    vol = 0;
  for (const t of keep) {
    const p = [0, 1, 2].map((e) => [P[3 * vid[T[t + e]]], P[3 * vid[T[t + e]] + 1], P[3 * vid[T[t + e]] + 2]]),
      u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]],
      w = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]],
      n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]],
      len = Math.hypot(n[0], n[1], n[2]) || 1;
    vol += (p[0][0] * n[0] + p[0][1] * n[1] + p[0][2] * n[2]) / 6;
    for (let i = 0; i < 3; i++) dv.setFloat32(o + 4 * i, n[i] / len, true);
    for (let e = 0; e < 3; e++) for (let i = 0; i < 3; i++) dv.setFloat32(o + 12 + 12 * e + 4 * i, p[e][i], true);
    o += 50;
  }
  if (open) throw new Error(`The mesh did not close (${open} open edges).`);
  // facets cut the corners of curved surfaces, so the mesh holds a little less than the solid: never more than 2%
  if (!(vol > 0.98 * volume && vol < 1.005 * volume))
    throw new Error("The mesh does not enclose the solid (its volume is off).");
  return { data: buf, triangles: keep.length, volume: vol };
}
/**
 * The rocket's outside as one solid, as a STEP file.
 * @param {object} R the replicad module, with OpenCascade set up (setOC)
 * @param {object} model the builder model (BLD)
 * @param {{fillet?:number, edgeFlat?:number, plainFillets?:boolean}} [opts] fillet radius in metres (default: the
 *   model's fin fillet radius); plainFillets skips OpenCascade's fillet
 * @returns {Promise<{text:string, shape:object, info:{volume:number, faces:number, length:number, finSets:number,
 *   fillet:number, warnings:string[]}}>} the file's text, the solid itself (for buildStl) and what was made
 */
export async function buildStep(R, model, opts = {}) {
  if (opts.plainFillets) return stepBuild(R, model, opts);
  // the fillets are made the best way that gives a sound file: OpenCascade's own fillet or the section-following
  // ones; then the section-following ones alone, on the plain fins and then on the smooth-edged ones; then the plain
  // trimmed fillets
  for (const o of [opts, { ...opts, noOcFillet: true }, { ...opts, noOcFillet: true, otherFins: true }]) {
    try {
      const r = await stepBuild(R, model, o);
      if (r && r.info.filletMethod !== "trimmed") return r;
    } catch (e) {
      // OpenCascade's fillet can leave a solid the later joins choke on: on to the next way
    }
  }
  return stepBuild(R, model, { ...opts, plainFillets: true });
}
/** buildStep's work (see there). */
async function stepBuild(R, model, opts = {}) {
  const lay = bldLayout(model),
    bodies = lay.bodies.filter((b) => b.len > 0);
  if (!bodies.length) throw new Error("The rocket has no body parts yet.");
  const warnings = [];
  for (const b of bodies)
    if (b.p.type === "nose")
      b.tip = +b.p.tipR > 0 ? noseTip(b.p.shape, b.p.param, b.r2, b.len, Math.min(+b.p.tipR, b.r2)) : null;
  const flat = (opts.edgeFlat != null ? +opts.edgeFlat : STEP_EDGE_FLAT) * STEP_MM;
  let edgesSkipped = false;
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
  // the seam keeps clear of the fins and of the lugs and rail buttons between them
  const finAng = sets.flatMap((s) => s.ang),
    guides = bodies.flatMap((b) =>
      b.kids
        .filter((c) => c.k.type === "lug" || c.k.type === "buttons")
        .map((c) => stepGuideAngle(finAng, +c.k.dir || 0)),
    );
  const seam = stepSeamAngle([...finAng, ...guides]);
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
  let filletMethod = "",
    filletDone = 0,
    taperedSkipped = false;
  for (const g of [...groups.values()].sort((a, b) => a.parts[0] - b.parts[0])) {
    let host = null;
    for (const i of g.parts) if (solids[i]) host = host ? fusePart(host, solids[i], i) : solids[i];
    if (!host) continue;
    const base = host;
    let fins = [];
    // the fins on the body: with the rounded edges as true arcs (what OpenCascade's fillet needs), or as polylines
    const finned = (arcs) => {
      fins = [];
      for (const s of g.sets) {
        const f = stepFinSolid(R, s.k, s.x, bodies, flat, 0, arcs);
        if (f && f.edgesSkipped) edgesSkipped = true;
        if (f) fins.push({ ...f, k: s.k, xf: s.x, ang: s.ang, t: Math.max(+s.k.t || 0, 0.0002) * STEP_MM });
      }
      let h = base;
      for (const f of fins)
        for (const a of f.ang) h = h.fuse(a ? f.solid.clone().rotate(a, [0, 0, 0], [1, 0, 0]) : f.solid.clone());
      return h;
    };
    host = finned(fr > 0 && isTubeHost(g));
    if (fins.length && fr > 0) {
      // the fillets are built directly (stepFilletWedge) where the body has one radius under the fins; on a taper
      // (a boattail) the joint isn't a straight line and they are left out, and the file says so
      if (isTubeHost(g)) {
        const rHost = bodies[g.parts[0]].r1 * STEP_MM;
        const xa = bodies[g.parts[0]].x * STEP_MM,
          xb = (bodies[g.parts[g.parts.length - 1]].x + bodies[g.parts[g.parts.length - 1]].len) * STEP_MM,
          expect = fins.reduce((q, f) => q + f.ang.length * 2 * (1 - Math.PI / 4) * fr * fr * (f.x1 - f.x0), 0);
        // Fins with a bladed edge (bevel, wedge, airfoil) get fillets that follow the fin's section (stepLoftFillet).
        // Square and rounded fins get OpenCascade's own fillet, which runs round the fin's ends, and the section-
        // following ones if that fails.
        const bladed = fins.some((f) => {
          const e = stepEdges(f.k, f.t, flat, 1);
          return [e.le, e.te].some((q) => q && !q.arc);
        });
        const lofted = async () => {
          // each fin gets its two fillets first (a small join), then the finished fins go on the tube
          // (first on the fins with their plain edges, a 0.3 mm flat on a bladed one and a many-sided round one: the
          // smooth sections made for OpenCascade's fillet don't always join to the tube soundly, except on an elliptical
          // airfoil fin, where it is the other way round; opts.otherFins tries the other kind when the first fails)
          const smooth = fins.some((f) => f.k.shape === "elliptical" && f.k.edge === "airfoil");
          host = finned(opts.otherFins ? !smooth : smooth);
          let h = base;
          const v0 = R.measureVolume(host);
          for (const f of fins) {
            const made = stepLoftFillet(R, f, rHost, fr, xa, xb);
            if (!made) return null;
            let ff = f.solid.clone().fuse(made.sides[0]).fuse(made.sides[1]);
            if ((ff.solids || []).length === 1) ff = ff.solids[0];
            for (const a of f.ang) h = h.fuse(a ? ff.clone().rotate(a, [0, 0, 0], [1, 0, 0]) : ff.clone());
            for (const [p, q] of made.over) {
              const w = 2 * (rHost + fr);
              h = h.cut(R.makeBox([p, -w, -w], [q, w, w]));
            }
          }
          if ((h.solids || []).length === 1) h = h.solids[0];
          const d = R.measureVolume(h) - v0;
          return stepValid(R, h) && d > 0.02 * expect && d < 2.5 * expect ? h : null;
        };
        let oc = null,
          how = "OpenCascade";
        for (const way of opts.plainFillets ? [] : bladed || opts.noOcFillet ? ["lofted"] : ["OpenCascade", "lofted"]) {
          try {
            oc =
              way === "lofted"
                ? await lofted()
                : await stepOcFillet(R, bodies, fins, host, rHost, fr, xa, xb, seam, flat, expect);
          } catch (e) {
            oc = null;
          }
          how = way;
          if (oc) break;
        }
        if (oc) {
          host = oc;
          filletMethod = how;
        } else {
          filletMethod = filletMethod || "trimmed";
          host = finned(false);
          for (const f of fins) {
            // both sides' fillets along the whole root, then trimmed to the fin made thicker by the fillet radius all
            // round (its planform and its edge sections): they end flush with the fin's edges and fade out along a
            // rounded or beveled one instead of standing out past it
            let w = null;
            for (const side of [1, -1]) {
              const q = stepFilletWedge(R, rHost, f.t / 2, fr, f.x0, f.x1, side);
              if (q) w = w ? w.fuse(q) : q;
            }
            const fat = stepFinSolid(R, f.k, f.xf, bodies, flat, fr);
            if (w && fat) w = w.intersect(fat.solid);
            if (w) for (const a of f.ang) host = host.fuse(a ? w.clone().rotate(a, [0, 0, 0], [1, 0, 0]) : w.clone());
          }
        }
        filletDone += g.sets.length;
      } else taperedSkipped = true;
    }
    pieces.push(host);
  }
  if (edgesSkipped)
    warnings.push(
      "The edge shape of a fin could not be made, so that fin is in the file as a flat plate at full thickness.",
    );
  if (taperedSkipped)
    warnings.push(
      "Fins on a tapered section (a boattail) are in the file without fillets: they are only made on straight body tubes.",
    );
  let all = pieces[0];
  for (let i = 1; i < pieces.length; i++) all = all.fuse(pieces[i]);
  // (a join that OpenCascade gets wrong can drop a whole piece)
  if (!(R.measureVolume(all) > 0.999 * Math.max(...pieces.map((q) => R.measureVolume(q)))))
    throw new Error("The parts of the rocket could not be joined into one solid.");
  for (const o of stepOuterParts(
    R,
    bodies,
    warnings,
    sets.flatMap((s) => s.ang),
  ))
    all = all.fuse(o);
  let volume = R.measureVolume(all);
  if (!(volume > 0)) throw new Error("The solid came out empty or inside out; the shape has a problem.");
  const write = async (shape) =>
    (await R.exportSTEP([{ shape, name: model.name || "Rocket" }], { unit: "mm", modelUnit: "mm" })).text();
  let text = await write(all);
  // OpenCascade's fillet can leave a solid that reads back from the file a little differently from what it held (a big
  // fillet round a bladed edge's narrow nose, say). Then what was read back is the rocket: it must be sound and read
  // back the same when written again, or the plain fillets are used instead
  if (filletMethod && filletMethod !== "trimmed" && !opts.plainFillets) {
    const same = (a, b) => Math.abs(a - b) < 2e-6 * Math.max(a, b);
    let ok = false;
    try {
      let back = await R.importSTEP(new Blob([text])),
        vb = R.measureVolume(back);
      if (same(vb, volume)) ok = true;
      else if (Math.abs(vb - volume) < 0.002 * volume && stepValid(R, back)) {
        const t2 = await write(back),
          v2 = R.measureVolume(await R.importSTEP(new Blob([t2])));
        if (same(v2, vb)) {
          ok = true;
          all = back;
          volume = vb;
          text = t2;
        }
      }
    } catch (e) {
      ok = false;
    }
    if (!ok) return null;
  }
  return {
    text,
    shape: all,
    info: {
      volume,
      faces: all.faces.length,
      length: all.boundingBox.bounds[1][0],
      finSets: sets.length,
      fillet: filletDone ? fr : 0,
      filletMethod,
      warnings,
    },
  };
}
