/**
 * The rocket's outer surface as a STEP file (full size, in millimetres) for CFD and CAD: the body as revolved solids
 * (nose, tubes, transitions), the fins fused on and filleted, the base closed with a flat circular face so the
 * result is one watertight solid. Nothing inside the rocket is included.
 *
 * The solid modelling is done by OpenCascade (through replicad), which is loaded only when this is used: `buildStep`
 * takes the replicad module as an argument, so it runs in the app (where `step-kernel.js` provides it) and in the tests.
 */
import { finDxfOutline } from "./fin-dxf.js";
import { BLD_BUTTONS, bldLayout, bldRailLug } from "./model.js";
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
function stepFinSolid(R, k, xf, bodies, flat, grow = 0) {
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
  const M = pts.map((p) => [xf + p[0], surf(xf + p[0]) + p[1]]);
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
  if (edges.le || edges.te) {
    if (k.shape === "trapezoid") {
      const n = M.length;
      if (edges.le) {
        solid = solid.intersect(stepEdgeBody(R, edges.le, M[0], M[1], 1, t));
      }
      if (edges.te) {
        solid = solid.intersect(stepEdgeBody(R, edges.te, M[n - 1], M[n - 2], -1, t));
      }
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
    solid = solid.fuse(poly([...xs.map((x) => [x, surf(x)]), [fb, inner], [fa, inner]]));
  }
  return { solid, x0: fa, x1: fb, edgesSkipped };
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
    return P;
  }
  if (hf >= h * 0.999) return null;
  if (type === "wedge" || type === "doublewedge") {
    const b = Math.min(type === "doublewedge" ? c / 2 : len > 0 ? len : 0.2 * c, c / 2);
    return b > 0
      ? [
          [0, hf],
          [b, h],
        ]
      : null;
  }
  if (type === "airfoil") {
    const P = [];
    for (let i = 0; i <= STEP_EDGE_PIECES; i++) {
      const u = i / STEP_EDGE_PIECES;
      P.push([(u * c) / 2, hf + (h - hf) * (1 - (1 - u) * (1 - u))]);
    }
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
    const o = [sd.a[0] - sd.d[0] * sd.e0, sd.a[1] - sd.d[1] * sd.e0, 0];
    const pl = new R.Plane(o, [sd.inward[0], sd.inward[1], 0], [sd.d[0], sd.d[1], 0]);
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
 * The parts that stand out from the body (launch lugs, rail buttons, protuberances), as solids that overlap the body
 * a little so they join it. Angles run around the body from the fin's zero direction, like the fins'.
 * @param {object} R replicad
 * @param {object[]} bodies layout bodies (bldLayout)
 * @param {string[]} warnings gets a line for any that could not be made
 * @returns {object[]} replicad solids
 */
function stepOuterParts(R, bodies, warnings) {
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
          if (rail) {
            out.push(turn(box(x0, len, rail.w * STEP_MM, q.lo - sink, q.hi + rail.h * STEP_MM), +k.dir || 0));
          } else {
            const ro = (k.od * STEP_MM) / 2,
              ri = ((k.id_ || 0) * STEP_MM) / 2,
              em = Math.min(0.15 * ro * 2, 0.6 * (ro - ri));
            out.push(turn(rod(x0, len, q.hi + ro - em, ro, ri), +k.dir || 0));
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
            out.push(turn(stack, +k.dir || 0));
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
      const f = stepFinSolid(R, s.k, s.x, bodies, flat);
      if (f && f.edgesSkipped) edgesSkipped = true;
      if (f) fins.push({ ...f, k: s.k, xf: s.x, ang: s.ang, t: Math.max(+s.k.t || 0, 0.0002) * STEP_MM });
    }
    for (const f of fins)
      for (const a of f.ang) host = host.fuse(a ? f.solid.clone().rotate(a, [0, 0, 0], [1, 0, 0]) : f.solid.clone());
    if (fins.length && fr > 0) {
      // the fillets are built directly (stepFilletWedge) where the body has one radius under the fins; on a taper
      // (a boattail) the joint isn't a straight line and they are left out, and the file says so
      if (isTubeHost(g)) {
        const rHost = bodies[g.parts[0]].r1 * STEP_MM;
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
  for (const o of stepOuterParts(R, bodies, warnings)) all = all.fuse(o);
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
