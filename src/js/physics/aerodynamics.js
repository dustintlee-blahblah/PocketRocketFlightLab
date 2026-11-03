/**
 * Aerodynamics: drag (component build-up) and stability (Barrowman normal force and center of pressure), with
 * Mach number effects, fin lift and roll terms.
 *
 * aero(D) turns a design into the geometry the rest of the code uses (body sections, fin sets, protuberances,
 * reference area); cdParts() gives the zero-angle drag at a speed; cnaParts()/cnaPartsM() the normal-force slope and
 * center of pressure; rollParts() the fin-cant roll forcing and roll damping; stability() the static margin.
 * Sources for each term are given where it is computed.
 */
/* ---------- aerodynamics: component drag buildup from the published aerospace literature (zero angle of attack) ----------
   Skin friction: Prandtl–Schlichting turbulent flat-plate law, boundary layer turbulent from the tip (Schlichting, Boundary-Layer Theory),
     fully rough plate law (White, Viscous Fluid Flow) blended in by roughness Reynolds number between Nikuradse's smooth (k+≈5)
     and fully rough (k+≈70) limits, compressibility factor (1+0.144M²)^-0.65 (adiabatic-wall approximation).
   Form factors: Hoerner, Fluid-Dynamic Drag (1965) — bodies 1+1.5(d/l)^1.5+7(d/l)^3, fin sections 1+2(t/c)+60(t/c)^4.
   Forebody pressure drag below the critical Mach number: Hoerner's shoulder-angle rule, 0.8·sin²(shoulder angle).
   Transonic and supersonic nose drag: free-flight and wind-tunnel measurements in NASA TR R-100 (Stoney, 1961), figs. 11–12.
   Supersonic drag of body flares and shoulders: Bonney's cone correlation, as presented by Fleeman (Tactical Missile Design, AIAA).
   Base drag (coasting and powered): Fleeman's base-pressure correlation.
   Boattail separation: attached below about 8° half-angle, fully separated above about 20° (Hoerner, ch. 3).
   Fin edges: stagnation pressure on blunt leading edges (isentropic below Mach 1, Rayleigh pitot above), sweep by the
     independence principle; Newtonian rounded edges; Ackeret thin-airfoil wave drag for sharp sections.
   Rail buttons and lugs: Hoerner protuberance drag (Newtonian cylinder above Mach 1), scaled by the 1/7-power turbulent
     boundary-layer profile.
   Tumbling: Allen–Perkins crossflow drag averaged over all pitch angles.
   Air viscosity: Sutherland's law. */
/**
 * Ratio of specific heats for air.
 */
const GAM = 1.4;
/**
 * Pressure coefficient at a stagnation point: isentropic below Mach 1, behind a normal shock (Rayleigh pitot
 * formula) above it.
 * @param {number} M Mach number
 * @returns {number}
 */
function stagCp(M) {
  // pressure coefficient at a stagnation point
  if (M < 0.05) return 1 + (M * M) / 4;
  if (M < 1) return (2 / (GAM * M * M)) * (Math.pow(1 + ((GAM - 1) / 2) * M * M, GAM / (GAM - 1)) - 1);
  const M2 = M * M,
    p02 =
      (Math.pow(((GAM + 1) ** 2 * M2) / (4 * GAM * M2 - 2 * (GAM - 1)), GAM / (GAM - 1)) * (1 - GAM + 2 * GAM * M2)) /
      (GAM + 1);
  return (2 / (GAM * M2)) * (p02 - 1);
}
/**
 * Base drag coefficient on the base area at Mach M (Fleeman's correlation).
 */
const baseCp = (M) => (M < 1 ? 0.12 + 0.13 * M * M : 0.25 / M); // Fleeman base-drag coefficient (based on base area)
/**
 * Smoothstep: 0 below 0, 1 above 1, an S-curve between. Used to blend models across a range.
 */
const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/**
 * Transonic blend weight: 0 below Mach 0.8, rising smoothly to 1 at Mach 1.
 */
const transonic = (M) => smooth01((M - 0.8) / 0.2); // 0 below Mach 0.8, 1 at Mach 1
/**
 * Supersonic wave drag of a cone (Bonney's correlation, as given by Fleeman).
 * @param {number} M Mach number
 * @param {number} sig cone half-angle, rad
 * @returns {number} drag coefficient on the cone's base area
 */
function bonneyCd(M, sig) {
  // cone wave drag, sig = half-angle in radians
  const d = (sig * 180) / Math.PI;
  return (0.083 + 0.096 / (M * M)) * Math.pow(d / 10, 1.69);
}
/* Nose pressure drag measured in free flight and wind tunnels, digitized from NASA TR R-100 (Stoney, 1961), fig. 12(a)
   for fineness-ratio-3 noses (CD based on base area) and fig. 12(b) for blunt noses and Mach numbers above 2.
   Other fineness ratios are scaled with fig. 11 (nose drag at Mach 1.4 against nose fineness): the report treats the
   effects of shape and fineness separately. Points are [Mach, CD]. A tangent ogive of fineness 3 is within 1–2% of the
   full parabola's profile, so ogives use that curve, blended toward the cone as the ogive becomes a secant ogive. */
const NOSE_TR100 = {
  cone: [
    [0.8, 0.02],
    [0.9, 0.028],
    [0.95, 0.045],
    [1.0, 0.1],
    [1.04, 0.142],
    [1.08, 0.16],
    [1.15, 0.15],
    [1.24, 0.134],
    [1.44, 0.118],
    [1.7, 0.108],
    [2.0, 0.101],
  ],
  x34: [
    [0.85, 0],
    [0.9, 0.01],
    [0.95, 0.04],
    [1.0, 0.1],
    [1.05, 0.12],
    [1.2, 0.108],
    [1.44, 0.097],
    [1.8, 0.088],
    [2.0, 0.085],
    [2.8, 0.08],
    [3.6, 0.075],
  ],
  x12: [
    [0.9, 0],
    [0.93, 0.005],
    [0.985, 0.04],
    [1.02, 0.06],
    [1.08, 0.057],
    [1.2, 0.082],
    [1.25, 0.093],
    [1.6, 0.093],
    [2.0, 0.091],
  ],
  x14: [
    [0.9, 0],
    [1.0, 0.04],
    [1.1, 0.1],
    [1.2, 0.14],
    [1.4, 0.17],
    [1.6, 0.19],
    [2.0, 0.215],
    [2.4, 0.233],
    [2.8, 0.245],
    [3.2, 0.25],
    [3.6, 0.25],
  ],
  par: [
    [0.85, 0],
    [0.95, 0.024],
    [1.0, 0.067],
    [1.04, 0.091],
    [1.1, 0.112],
    [1.2, 0.12],
    [1.4, 0.111],
    [1.8, 0.106],
    [2.0, 0.106],
  ],
  par34: [
    [0.85, 0],
    [0.9, 0.01],
    [0.95, 0.046],
    [1.0, 0.098],
    [1.06, 0.126],
    [1.2, 0.11],
    [1.4, 0.089],
    [2.0, 0.087],
  ],
  par12: [
    [0.85, 0],
    [0.9, 0.012],
    [0.95, 0.05],
    [1.0, 0.095],
    [1.05, 0.11],
    [1.1, 0.112],
    [1.2, 0.11],
    [1.4, 0.092],
    [2.0, 0.088],
  ],
  vk: [
    [0.9, 0],
    [0.96, 0.002],
    [1.0, 0.021],
    [1.05, 0.063],
    [1.09, 0.072],
    [1.25, 0.075],
    [1.44, 0.087],
    [1.64, 0.088],
    [2.0, 0.077],
    [2.8, 0.073],
    [3.6, 0.07],
  ],
  lvh: [
    [0.9, 0],
    [0.96, 0.002],
    [1.0, 0.021],
    [1.05, 0.063],
    [1.08, 0.079],
    [1.25, 0.099],
    [1.44, 0.11],
    [2.0, 0.109],
    [2.8, 0.104],
    [3.6, 0.099],
  ],
  ell: [
    [0.9, 0],
    [1.0, 0.03],
    [1.1, 0.08],
    [1.2, 0.12],
    [1.3, 0.138],
    [1.6, 0.152],
    [2.0, 0.156],
    [2.8, 0.16],
    [3.6, 0.16],
  ],
};
/**
 * NASA TR R-100 fig. 11: nose pressure drag at Mach 1.4 against nose fineness (length/diameter), as
 * [fineness, CD]; finenessScale() normalizes it to fineness 3.
 *
 * fig. 11, Mach 1.4: nose pressure drag against nose fineness l/d (second-order theory and data), normalized at l/d = 3
 */
const NOSE_FINENESS = [
  [1, 0.5],
  [1.5, 0.36],
  [2, 0.215],
  [2.5, 0.15],
  [3, 0.108],
  [4, 0.068],
  [5, 0.047],
  [6, 0.036],
  [7, 0.029],
  [8, 0.024],
  [9, 0.021],
];
/**
 * Linear interpolation in a sorted [x, y] table, flat beyond its ends.
 * @param {number[][]} pts table rows [x, y]
 * @param {number} x
 * @returns {number}
 */
function tblAt(pts, x) {
  // linear interpolation, flat beyond the ends; past the last Mach point sharp shapes follow the x^3/4 trend
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++)
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1],
        [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  return pts[pts.length - 1][1];
}
/**
 * Nose pressure drag at a fineness ratio, relative to fineness 3 (NASA TR R-100 fig. 11, log–log
 * interpolation; beyond fineness 9 it falls as fineness^-1.5).
 * @param {number} f nose length / diameter
 * @returns {number} multiplier on a fineness-3 drag value
 */
function finenessScale(f) {
  const P = NOSE_FINENESS;
  f = Math.max(f, 1);
  if (f >= 9) return (P[P.length - 1][1] * Math.pow(f / 9, -1.5)) / 0.108;
  for (let i = 1; i < P.length; i++)
    if (f <= P[i][0]) {
      const [x0, y0] = P[i - 1],
        [x1, y1] = P[i];
      return (
        Math.exp(
          Math.log(y0) + ((Math.log(y1) - Math.log(y0)) * (Math.log(f) - Math.log(x0))) / (Math.log(x1) - Math.log(x0)),
        ) / 0.108
      );
    }
  return 1;
}
/**
 * A fineness-3 nose's pressure drag from the NOSE_TR100 curves, extended past the last measured Mach number
 * (cones by Bonney's correlation, other shapes by the trend of a similar measured shape).
 * @param {string} name curve name in NOSE_TR100
 * @param {number} M Mach number
 * @returns {number} CD on the base area
 */
function curveCd(name, M) {
  // fineness-3 curve, extended past its last Mach point
  const pts = NOSE_TR100[name],
    last = pts[pts.length - 1][0];
  if (M <= last) return tblAt(pts, M);
  const end = pts[pts.length - 1][1];
  if (name === "cone") return (end * bonneyCd(M, Math.atan(1 / 6))) / bonneyCd(last, Math.atan(1 / 6));
  if (name === "vk" || name === "lvh" || name === "ell" || name === "x14" || name === "x34")
    return name === "ell" || name === "x14" ? end : (end * tblAt(NOSE_TR100.vk, M)) / tblAt(NOSE_TR100.vk, last);
  return (end * tblAt(NOSE_TR100.x34, M)) / tblAt(NOSE_TR100.x34, last);
}
/**
 * Linear blend of a and b: a at w = 0, b at w = 1.
 */
const mix = (a, b, w) => a * (1 - w) + b * w;
/**
 * Pressure drag of a fineness-3 nose of any shape the app supports, interpolated between the measured shapes.
 * @param {string} shape nose shape (see noseR)
 * @param {number} param shape parameter
 * @param {number} M Mach number
 * @returns {number} CD on the base area (scale with finenessScale for other fineness ratios)
 */
function noseCdTR100(shape, param, M) {
  // fineness-3 value for any nose shape the app supports
  switch (shape) {
    case "conical":
      return curveCd("cone", M);
    case "ogive":
      return mix(curveCd("cone", M), curveCd("par", M), Math.min(Math.max(param, 0), 1));
    case "parabolic": {
      const k = Math.min(Math.max(param, 0), 1);
      return k <= 0.5
        ? mix(curveCd("cone", M), curveCd("par12", M), k / 0.5)
        : k <= 0.75
          ? mix(curveCd("par12", M), curveCd("par34", M), (k - 0.5) / 0.25)
          : mix(curveCd("par34", M), curveCd("par", M), (k - 0.75) / 0.25);
    }
    case "power": {
      const p = Math.min(Math.max(param, 0), 1);
      if (p < 0.25) return mix(0.8 * stagCp(M), curveCd("x14", M), p / 0.25); // flat face: 0.8·Cp,stag (fig. 11)
      return p <= 0.5
        ? mix(curveCd("x14", M), curveCd("x12", M), (p - 0.25) / 0.25)
        : p <= 0.75
          ? mix(curveCd("x12", M), curveCd("x34", M), (p - 0.5) / 0.25)
          : mix(curveCd("x34", M), curveCd("cone", M), (p - 0.75) / 0.25);
    }
    case "haack":
      return mix(curveCd("vk", M), curveCd("lvh", M), Math.min(Math.max(param, 0) * 3, 1));
    case "ellipsoid":
      return curveCd("ell", M);
  }
  return curveCd("par", M);
}
/**
 * Flat-plate skin-friction coefficient, with surface roughness and compressibility.
 * @param {number} Re Reynolds number on the surface's own length
 * @param {number} Lc that length, m
 * @param {number} k roughness height, m
 * @param {number} M Mach number
 * @param {string} mode "natural" for natural laminar-to-turbulent transition; otherwise turbulent from the start
 * @returns {number} Cf on the wetted area
 */
function plateCf(Re, Lc, k, M, mode) {
  // flat-plate skin friction: turbulent (or natural transition), with roughness and compressibility
  // The boundary layer is taken as turbulent from the nose tip: on a real rocket the tip, joints, lugs and paint trip it early.
  // Roughness is measured against the component's own streamwise length (body length, or a fin's mean chord), as in
  // Raymer, Aircraft Design: each surface's boundary layer starts at its own leading edge.
  Re = Math.max(Re, 1e3);
  let smoothCf = 0.455 / Math.pow(Math.log10(Re), 2.58);
  // natural transition (very smooth surfaces): laminar Blasius flow ahead of Re ≈ 5×10⁵, then the Prandtl–Schlichting
  // mixed laminar–turbulent law, Cf = 0.455/(log Re)^2.58 − 1700/Re (Schlichting)
  if (mode === "natural")
    smoothCf = Re < 5e5 ? 1.328 / Math.sqrt(Re) : Math.max(smoothCf - 1700 / Re, 1.328 / Math.sqrt(Re));
  const roughCf = k > 0 && Lc > k ? Math.pow(1.89 + 1.62 * Math.log10(Lc / k), -2.5) : 0;
  // Nikuradse regimes: roughness has no effect below k+ ≈ 5 (hydraulically smooth) and full effect above k+ ≈ 70 (fully rough)
  const kPlus = k * (Re / Lc) * Math.sqrt(smoothCf / 2);
  const w = kPlus > 0 ? smooth01(Math.log(kPlus / 5) / Math.log(70 / 5)) : 0;
  return (smoothCf + w * Math.max(roughCf - smoothCf, 0)) * Math.pow(1 + 0.144 * M * M, -0.65);
}
/**
 * Drag coefficient of a short cylinder in crossflow (a rail button), on its frontal area.
 * @param {number} M Mach number
 * @returns {number}
 */
function cylinderCd(M) {
  // cylinder in crossflow (rail button): Hoerner's subsonic 1.2 scaled by stagnation pressure;
  // supersonic by modified Newtonian (2/3·Cp,max) plus base pressure, blended over Mach 1.0–1.3
  const sub = (m) => 1.2 * stagCp(Math.min(m, 1)),
    sup = (m) => (2 / 3) * stagCp(m) + baseCp(m);
  if (M <= 1) return sub(M);
  const t = smooth01((M - 1) / 0.3);
  return (1 - t) * sub(1) + t * sup(M);
}
/**
 * How much of the free-stream dynamic pressure a protuberance feels inside the body's boundary layer: the mean
 * (u/U)² over its height in a 1/7-power turbulent profile.
 * @param {number} h protuberance height, m
 * @param {number} x its distance from the nose tip (where the boundary layer starts), m
 * @param {number} v airspeed, m/s
 * @param {number} nu kinematic viscosity, m²/s
 * @returns {number} 0–1
 */
function blFactor(h, x, v, nu) {
  // mean (u/U)² over a protuberance of height h inside a 1/7-power turbulent boundary layer
  x = Math.max(x, 0.01);
  const del = 0.37 * x * Math.pow(Math.max((v * x) / nu, 1e3), -0.2);
  return h <= del ? (7 / 9) * Math.pow(h / del, 2 / 7) : 1 - ((2 / 9) * del) / h;
}
/**
 * Standard rail buttons, by rail size: outer and inner diameter, height, flange and base thickness (m).
 */
const RAIL_PRESETS = {
  // outer dia, inner dia, total height, flange, base (m)
  1010: { od: 0.0097, id: 0.008, h: 0.0097, fl: 0.002, bs: 0.002, label: "1010 buttons ×2" },
  1515: { od: 0.0157, id: 0.0081, h: 0.0127, fl: 0.0025, bs: 0.0025, label: "1515 buttons ×2" },
};
/**
 * Radius of a body section at a distance from its front: constant for a tube, the nose profile for a nose or
 * an expanding transition, the reversed profile for a shrinking transition (boattail).
 * @param {object} sg body section {kind, x, len, r1, r2, shape, param}
 * @param {number} x distance from the section's front, m
 * @returns {number} radius, m
 */
function segR(sg, x) {
  // radius of a body section at distance x from its front
  if (sg.kind === "tube" || Math.abs(sg.r2 - sg.r1) < 1e-9) return sg.r1;
  if (sg.r1 < sg.r2) return sg.r1 + noseR(sg.shape, sg.param, x, sg.r2 - sg.r1, sg.len);
  return sg.r2 + noseR(sg.shape, sg.param, sg.len - x, sg.r1 - sg.r2, sg.len);
}
/**
 * The body as a list of sections (nose, tubes, transitions) from the nose tip back. A design from a file or the
 * builder has them in D.segments; a quick-form design is built from its nose, body and tail cone fields.
 * @param {object} D design
 * @returns {object[]} sections {kind, x, len, r1, r2, shape, param}
 */
function bodySegments(D) {
  if (D.segments && D.segments.length) return D.segments;
  const R = D.diameter / 2,
    L = D.length,
    Ln = Math.min(D.noseLen, L),
    ns = noseSpec(D);
  const tl = Math.max(0, Math.min(D.tailLen || 0, L - Ln)),
    Rt = tl > 0 ? Math.max(0, (D.tailDia || D.diameter) / 2) : R;
  const segs = [{ kind: "nose", x: 0, len: Ln, r1: 0, r2: R, shape: ns.shape, param: ns.param }];
  if (L - Ln - tl > 0) segs.push({ kind: "tube", x: Ln, len: L - Ln - tl, r1: R, r2: R });
  if (tl > 0) segs.push({ kind: "trans", x: L - tl, len: tl, r1: R, r2: Rt, shape: "conical", param: 0 });
  return segs;
}
/**
 * Body radius at a distance from the nose tip.
 * @param {object} A aerodynamic model from aero()
 * @param {number} x m from the nose tip
 * @returns {number} m
 */
function radiusAt(A, x) {
  for (const sg of A.segs) {
    if (x >= sg.x - 1e-9 && x <= sg.x + sg.len + 1e-9) return segR(sg, Math.min(Math.max(x - sg.x, 0), sg.len));
  }
  return A.R;
}
/**
 * All fin sets of a design in one form {n, a (root), b (tip), s (span), sw (sweep), t, xLead, edge, ...}:
 * D.finSets when the design has them, otherwise the main set from the quick-form fields plus any extra sets.
 * @param {object} D design
 * @returns {object[]}
 */
function finSetsOf(D) {
  if (D.finSets) return D.finSets;
  return [
    {
      n: D.finCount,
      mat: D.finMat,
      rho: D.finRho,
      a: D.finRoot,
      b: D.finTip,
      s: D.finSpan,
      sw: D.finSweep,
      t: D.finThick,
      xLead: D.length - D.finAft - D.finRoot,
      edge: D.finEdge,
      rs: D.finFinish ?? D.finish,
      cdo: D.finCdOverride || 0,
      pts: D.finPts || null,
      cant: D.finCant || 0,
    },
    ...xfinSets(D.extraFins, D.finFinish ?? D.finish),
  ];
}
/* extra fin sets: {n,root,tip,span,sweep,t,pos (root leading edge from the front of the stage),edge} */
/**
 * Extra fin sets in the common fin-set form used by finSetsOf().
 * @param {object[]} list extra fin sets
 * @param {string} rs surface finish
 * @returns {object[]}
 */
function xfinSets(list, rs) {
  return (list || []).map((f) => ({
    n: f.n,
    mat: f.mat,
    rho: f.rho,
    a: f.root,
    b: f.tip,
    s: f.span,
    sw: f.sweep,
    t: f.t,
    xLead: f.pos,
    edge: f.edge,
    rs,
    cdo: f.cdo || 0,
    pts: f.pts || null,
    cant: f.cant || 0,
  }));
}
/**
 * A fin's outline as [x along the root, y out from the body] points.
 * @param {object} f fin set
 * @returns {number[][]}
 *
 * a fin's outline for drawing: the shape from the design file when there is one, otherwise the trapezoid
 */
function finOutline(f) {
  return f.pts && f.pts.length > 2
    ? f.pts
    : [
        [0, 0],
        [f.sw, f.s],
        [f.sw + f.b, f.s],
        [f.a, 0],
      ];
}
/**
 * A fin's geometric properties from its outline, by thin spanwise strips.
 * @param {object} f fin set
 * @returns {{area:number, span:number, mac:number, xcp:number, cnX:number, edgeH:number, yMac:number, I1:number,
 *   I2:number}|null} area (m²), span, mean aerodynamic chord, the quarter-MAC point from the root leading edge (Barrowman's
 *   fin CP), the term X of Barrowman's lift formula, the leading-edge height weighted by cos² of its sweep, the MAC's
 *   spanwise station, and the first and second moments of area about the root; null for a degenerate outline
 *
 * fin properties from its outline, by thin spanwise strips: exact for any shape (a trapezoid gives Barrowman's closed forms).
 * Sweep angles are strip averages of the local mid-chord and leading-edge slopes (Barrowman 1967, applied strip by strip to any outline).
 */
function finGeom(f) {
  const ol = finOutline(f),
    span = Math.max(...ol.map((p) => p[1])),
    N = 240;
  const cut = (y) => {
    let lo = Infinity,
      hi = -Infinity;
    for (let i = 0; i < ol.length; i++) {
      const [xa, ya] = ol[i],
        [xb, yb] = ol[(i + 1) % ol.length];
      if ((ya - y) * (yb - y) <= 0 && ya !== yb) {
        const xx = xa + ((y - ya) / (yb - ya)) * (xb - xa);
        lo = Math.min(lo, xx);
        hi = Math.max(hi, xx);
      }
    }
    return hi >= lo ? [lo, hi] : null;
  };
  let A = 0,
    C2 = 0,
    QC = 0,
    cg = 0,
    cl = 0,
    ns = 0,
    prev = null,
    C2y = 0,
    I1 = 0,
    I2 = 0;
  const dy = span / N;
  for (let k = 0; k <= N; k++) {
    const y = Math.min(Math.max(k * dy, 1e-9 * span), span * (1 - 1e-9)),
      c = cut(y);
    if (c && prev) {
      const dm = (c[0] + c[1]) / 2 - (prev[0] + prev[1]) / 2,
        dl = c[0] - prev[0];
      cg += dy / Math.hypot(dm, dy);
      cl += dy / Math.hypot(dl, dy);
      ns++;
    }
    if (c && k < N) {
      const ym = (k + 0.5) * dy,
        cm = cut(ym);
      if (cm) {
        const ch = cm[1] - cm[0];
        A += ch * dy;
        C2 += ch * ch * dy;
        QC += ch * (cm[0] + ch / 4) * dy;
        C2y += ch * ch * ym * dy;
        I1 += ch * ym * dy;
        I2 += ch * ym * ym * dy;
      }
    }
    prev = c;
  }
  if (!(A > 0) || !ns) return null;
  const cosG = cg / ns,
    cosLead = cl / ns;
  // for roll: spanwise place of the mean aerodynamic chord, and the first and second moments of the fin area about its root
  return {
    area: A,
    span,
    mac: C2 / A,
    xcp: QC / A,
    cnX: (span * span) / (A * Math.max(cosG, 1e-6)),
    edgeH: span * cosLead * cosLead,
    yMac: C2 > 0 ? C2y / C2 : span / 3,
    I1,
    I2,
  };
}

/**
 * aero() results by design, so repeated calls for the same design are free.
 */
const aeroCache = new Map();
/**
 * The aerodynamic model of a design: everything the drag and stability code needs, worked out once.
 * @param {object} D design
 * @returns {object} segs (body sections with areas and volumes), R (max radius), Aref (reference area), L (length),
 *   fins (fin sets with their geometry), buttons, lugs, fore/aft (forebody and afterbody drag items), baseArea,
 *   sideArea and xPlan (planform area and its centroid), tumbleCdA, ffBody (body form factor), and the drag settings
 *   (override, scale, otherCd, blMode)
 */
function aero(D) {
  const key = JSON.stringify([
    D.blMode,
    D.finCant,
    D.dragScale,
    D.finCdOverride,
    D.finFinish,
    D.length,
    D.diameter,
    D.noseLen,
    D.noseShape,
    D.tailLen,
    D.tailDia,
    D.segments,
    D.finSets,
    D.extraFins,
    D.finPts,
    D.finCount,
    D.finRoot,
    D.finTip,
    D.finSpan,
    D.finSweep,
    D.finThick,
    D.finAft,
    D.finEdge,
    D.finish,
    D.railPreset,
    D.buttons,
    D.lugs,
    D.otherCd,
    D.cdOverride,
  ]);
  if (aeroCache.has(key)) return aeroCache.get(key);
  const segs = bodySegments(D).map((s) => ({ ...s }));
  const R = Math.max(...segs.map((s) => Math.max(s.r1, s.r2)), 1e-4),
    Aref = Math.PI * R * R;
  const L = Math.max(D.length, ...segs.map((s) => s.x + s.len));
  const fore = [],
    aft = []; // pressure-drag items: expanding sections and steps (fore), contracting sections and steps (aft)
  segs.forEach((sg, i) => {
    const N = sg.kind === "tube" ? 1 : 200;
    let wet = 0,
      vol = 0,
      prev = segR(sg, 0),
      kN = 0;
    for (let j = 1; j <= N; j++) {
      const x0 = ((j - 1) / N) * sg.len,
        x1 = (j / N) * sg.len,
        r = segR(sg, x1),
        ds = Math.hypot(x1 - x0, r - prev);
      wet += Math.PI * (prev + r) * ds;
      vol += (Math.PI * (x1 - x0) * (prev * prev + prev * r + r * r)) / 3;
      if (r > prev && ds > 0) kN += ((r - prev) / ds) ** 2 * Math.PI * (r * r - prev * prev); // sin²θ weighted by frontal area (Newtonian)
      prev = r;
    }
    sg.wet = wet;
    sg.vol = vol;
    sg.rs = sg.rs ?? D.finish;
    // step from the previous section (or a flat front face)
    const rPrev = i > 0 ? segs[i - 1].r2 : 0;
    if (sg.r1 > rPrev + 1e-6) fore.push({ seg: i, step: true, area: Math.PI * (sg.r1 * sg.r1 - rPrev * rPrev) });
    else if (sg.r1 < rPrev - 1e-6) aft.push({ seg: i, k: 1, area: Math.PI * (rPrev * rPrev - sg.r1 * sg.r1) });
    if (sg.kind === "tube" || Math.abs(sg.r2 - sg.r1) < 1e-6) return;
    const area = Math.PI * Math.abs(sg.r2 * sg.r2 - sg.r1 * sg.r1),
      dr = Math.abs(sg.r2 - sg.r1);
    if (sg.len < 0.001) {
      (sg.r2 > sg.r1 ? fore : aft).push(sg.r2 > sg.r1 ? { seg: i, step: true, area } : { seg: i, k: 1, area });
      return;
    }
    if (sg.r2 > sg.r1) {
      const e = sg.len * 1e-3,
        slope = (segR(sg, sg.len) - segR(sg, sg.len - e)) / e; // shoulder angle where it meets the next section
      const blunt = sg.r1 < 1e-6 && (sg.shape === "ellipsoid" || (sg.shape === "power" && sg.param < 0.5));
      fore.push({
        seg: i,
        step: false,
        area,
        sub: 0.8 * Math.sin(Math.atan(slope)) ** 2,
        sig: Math.atan(dr / sg.len),
        blunt,
        kN: area > 0 ? kN / area : 0,
        nose:
          i === 0 && sg.r1 < 1e-6
            ? {
                shape: sg.shape,
                param: sg.param,
                scale: finenessScale(sg.len / (2 * sg.r2)),
                fin: sg.len / (2 * sg.r2),
              }
            : null,
      });
    } else {
      const deg = (Math.atan(dr / sg.len) * 180) / Math.PI;
      aft.push({ seg: i, k: smooth01((deg - 8) / 12), area });
    }
  });
  const last = segs[segs.length - 1],
    baseArea = Math.PI * last.r2 * last.r2;
  const fins = finSetsOf(D)
    .filter((f) => f && f.n > 0 && f.a > 0 && f.s > 0)
    .map((f) => {
      const G = finGeom(f) || {
        area: ((f.a + f.b) / 2) * f.s,
        span: f.s,
        mac: f.a,
        xcp: f.a / 4,
        cnX: (2 * f.s) / (f.a + f.b),
        edgeH: f.s * Math.cos(Math.atan2(f.sw, f.s)) ** 2,
        yMac: (f.s * (f.a + 2 * f.b)) / (3 * (f.a + f.b || 1)),
        I1: (f.s * f.s * (f.a + 2 * f.b)) / 6,
        I2: (f.s ** 3 * (f.a + 3 * f.b)) / 12,
      };
      const area = G.area,
        mac = G.mac,
        tc = mac > 0 ? f.t / mac : 0,
        cosL = Math.sqrt(Math.max(G.edgeH, 0) / G.span);
      return {
        ...f,
        s: G.span,
        area,
        mac,
        lam: Math.acos(Math.min(1, cosL)),
        cosL,
        xcp: G.xcp,
        cnX: G.cnX,
        ff: 1 + 2 * tc + 60 * tc ** 4,
        tc,
        rs: f.rs ?? D.finish,
        yMac: G.yMac,
        I1: G.I1,
        I2: G.I2,
        cant: f.cant || 0,
      };
    });
  let buttons = [];
  if (D.railPreset === "custom")
    buttons = (D.buttons || []).map((b) => ({
      ...b,
      front: b.od * Math.max(b.h - (b.ih || 0), 0) + b.id * (b.ih || 0),
    }));
  else if (RAIL_PRESETS[D.railPreset]) {
    const P = RAIL_PRESETS[D.railPreset],
      w = Math.max(P.h - P.fl - P.bs, 0);
    buttons = [0.55 * L, 0.92 * L].map((x) => ({ x, h: P.h, front: P.od * (P.fl + P.bs) + P.id * w }));
  }
  const lugs = D.railPreset === "custom" ? D.lugs || [] : [];
  const nose = segs[0];
  // tumbling end over end: Allen–Perkins crossflow drag ∝ sin³α, mean over α = 4/(3π); roll-averaged fin projection 2/π per fin
  let sideArea = 0,
    sideMom = 0;
  for (const sg of segs) {
    const N = 40;
    for (let i = 0; i < N; i++) {
      const xm = ((i + 0.5) / N) * sg.len,
        da = (2 * segR(sg, xm) * sg.len) / N;
      sideArea += da;
      sideMom += da * (sg.x + xm);
    }
  }
  const xPlan = sideArea > 0 ? sideMom / sideArea : L / 2;
  const tumbleCdA =
    (4 / (3 * Math.PI)) *
    (1.2 * sideArea + 1.17 * (2 / Math.PI) * fins.reduce((a, f) => a + f.n * f.area, 0) + 0.8 * Aref);
  const fineness = L / (2 * R),
    ffBody = 1 + 1.5 / Math.pow(fineness, 1.5) + 7 / Math.pow(fineness, 3);
  const val = {
    blMode: D.blMode || "turb",
    segs,
    R,
    Aref,
    tumbleCdA,
    L,
    sideArea,
    xPlan,
    Ln: nose && nose.kind === "nose" ? nose.len : 0,
    fins,
    Rs: D.finish,
    buttons,
    lugs,
    otherCd: D.otherCd || 0,
    override: D.cdOverride || 0,
    scale: D.dragScale > 0 ? D.dragScale : 1,
    fore,
    aft,
    baseArea,
    ffBody,
    tailLen: segs.length > 1 && segs[segs.length - 1].kind === "trans" ? segs[segs.length - 1].len : 0,
    Rt: segs.length ? segs[segs.length - 1].r2 : R,
  };
  if (aeroCache.size > 40) aeroCache.clear();
  aeroCache.set(key, val);
  return val;
}
/**
 * Kinematic viscosity of the air (Sutherland's law for the dynamic viscosity).
 * @param {{T:number, rho:number}} atm the air, from atmosphere()
 * @returns {number} m²/s
 */
function kinVisc(atm) {
  const mu = (1.458e-6 * Math.pow(atm.T, 1.5)) / (atm.T + 110.4);
  return mu / atm.rho;
} // Sutherland's law
/**
 * Zero-angle drag coefficient of the rocket at a speed, split into friction, pressure and base drag.
 * @param {object} A aerodynamic model from aero()
 * @param {number} v airspeed, m/s
 * @param {object} atm the air, from atmosphere()
 * @param {number} [nozzleArea=0] nozzle exit area while a motor burns, m² (its exhaust fills that much of the base)
 * @returns {{cd:number, friction:number, pressure:number, base:number}} coefficients on A.Aref
 */
function cdParts(A, v, atm, nozzleArea = 0) {
  // a fixed Cd for the whole rocket (from the design file): used as it is, scaled by any calibration to a real flight
  if (A.override > 0) return { cd: A.override * (A.scale || 1), friction: 0, pressure: 0, base: 0, override: true };
  v = Math.max(v, 0.01);
  const M = v / atm.a,
    nu = kinVisc(atm),
    q0 = stagCp(M),
    cb = baseCp(M),
    S = A.Aref;
  /* where the transonic drag rise starts depends on the shape. Bodies: the transonic similarity rule (Oswatitsch) says
     flows over slender bodies match when (1 − M²) scales with (d/l)^(2/3), so a slender body's drag rise comes later than
     a stubby one's: the measured fineness-3 curves are read at an equivalent Mach number, 1 − M_eq² = (1 − M²)·(l/d ÷ 3)^(2/3).
     Fins: the drag-divergence Mach number of a section falls with thickness, about M_dd = 0.96 − 1.5·(t/c) (NACA 0006 ≈ 0.87,
     NACA 0012 ≈ 0.78), and the rise is complete a little past Mach 1. */
  const mEq = (m, f) => (m >= 1 ? m : Math.sqrt(Math.max(0, 1 - (1 - m * m) * Math.pow(Math.max(f, 0.5) / 3, 2 / 3))));
  const bodyFin = A.L / (2 * A.R),
    tr = transonic(mEq(M, bodyFin));
  // skin friction with form factors
  let friction = 0;
  let ovr = 0;
  const skip = (it) => A.segs[it.seg] && A.segs[it.seg].cdo > 0; // per-part Cd overrides from the design file
  for (const sg of A.segs) {
    if (sg.cdo > 0) {
      ovr += sg.cdo;
      continue;
    }
    friction += plateCf((v * A.L) / nu, A.L, sg.rs, M, A.blMode) * sg.wet;
  }
  friction *= A.ffBody;
  for (const f of A.fins) {
    if (f.cdo > 0) {
      ovr += f.cdo;
      continue;
    }
    friction += f.n * plateCf((v * f.mac) / nu, f.mac, f.rs, M, A.blMode) * 2 * f.area * f.ff;
  }
  friction /= S;
  // pressure and wave drag
  let pressure = 0,
    base = 0;
  for (const it of A.fore) {
    if (skip(it)) continue;
    if (it.step) {
      pressure += (0.8 * q0 * it.area) / S;
      continue;
    }
    const wave = (m) => (it.blunt ? stagCp(m) * it.kN : bonneyCd(m, it.sig));
    if (it.nose) {
      let cdn = Math.max(it.sub, noseCdTR100(it.nose.shape, it.nose.param, mEq(M, it.nose.fin)) * it.nose.scale);
      // beyond the measured data, blend from Mach 4 to 6 into modified Newtonian theory: Cp,max·sin²θ over the nose (Lees)
      if (M > 4) cdn = mix(cdn, stagCp(M) * it.kN, smooth01((M - 4) / 2));
      pressure += (cdn * it.area) / S;
      continue;
    } // measured nose drag (NASA TR R-100)
    pressure += ((M < 1 ? (1 - tr) * it.sub + tr * wave(1) : wave(M)) * it.area) / S;
  }
  for (const it of A.aft) {
    if (!skip(it)) base += (it.k * cb * it.area) / S;
  }
  if (A.baseArea > 0) base += (cb * Math.max(A.baseArea - Math.min(nozzleArea, A.baseArea), 0)) / S;
  for (const f of A.fins) {
    if (f.cdo > 0) continue;
    const Mn = M * f.cosL,
      c2 = f.cosL * f.cosL,
      edge = (f.n * f.s * f.t) / S,
      Mdd = Math.max(0.6, 0.96 - 1.5 * f.tc),
      trF = smooth01((Mn - Mdd) / (1.06 - Mdd));
    if (f.edge === "square") {
      pressure += 0.8 * stagCp(Mn) * c2 * edge;
      base += cb * edge;
    } else if (f.edge === "rounded") {
      pressure += (2 / 3) * stagCp(Mn) * trF * c2 * edge;
      base += 0.5 * cb * edge;
    } else {
      const beta = Math.max(Math.sqrt(Math.max(Mn * Mn - 1, 0)), 0.4);
      pressure += (((trF * finWaveK(f.edge) * f.tc * f.tc) / beta) * c2 * f.n * f.area) / S;
    }
    if (!finBlunt(f.edge)) pressure += (finTransonicCd(M, f.tc, f.cosL) * f.n * f.area) / S;
  }
  for (const bt of A.buttons)
    if (bt.cdo > 0) ovr += bt.cdo;
    else pressure += (cylinderCd(M) * blFactor(bt.h, bt.x, v, nu) * bt.front) / S;
  for (const lg of A.lugs) {
    if (lg.cdo > 0) {
      ovr += lg.cdo;
      continue;
    }
    const n = lg.n || 1,
      h = 2 * lg.ro,
      F = blFactor(h, lg.x ?? A.L / 2, v, nu),
      ann = Math.PI * (lg.ro * lg.ro - lg.ri * lg.ri),
      ai = Math.PI * lg.ri * lg.ri;
    let inner = 0;
    if (ai > 1e-12) {
      const Re = Math.max((v * 2 * lg.ri) / nu, 1);
      const fd = Re < 2300 ? 64 / Re : 0.316 / Math.pow(Re, 0.25);
      inner = ((fd * lg.len) / (2 * lg.ri)) * ai;
    }
    pressure += (n * F * (0.8 * q0 * ann + inner)) / S;
    base += (n * F * cb * ann) / S;
  }
  pressure += A.otherCd + ovr;
  const k = A.scale || 1; // drag calibrated from a real flight of this rocket
  return { cd: (friction + pressure + base) * k, friction: friction * k, pressure: pressure * k, base: base * k };
}
/* fin lift with Mach number. Subsonic: Diederich's formula with Prandtl–Glauert compressibility, the form Barrowman (1967)
   uses, CNα ∝ 1/(1 + √(1 + (β·X)²)), β = √(1 − M²). Supersonic: the linear-theory form (Ackeret) with the tip-loss factor
   (1 − 1/(2·AR·β)) for a finite panel, β = √(M² − 1). Ackeret's 2-D value is 4/β; fins on a body lose part of that at
   supersonic speed, so an earlier version used a cautious 2.5/β. Against NASA wind-tunnel data for the Arcas sounding
   rocket (TN D-4014, Mach 1.5–4.63, two body lengths), the full 4/β puts the center of pressure within 2% of body length
   of the measured one at every Mach number, where 2.5/β put it 6–19% too far forward. Those fins are thin with sharp
   (double-wedge) edges, which is what the theory assumes. Blunt edges were expected to lose some of it, but NASA TM X-653
   (Ames, Mach 0.6–5.8) measured fins with round leading edges giving as much or more lift than the same fins with sharp
   edges at every supersonic Mach number, so rounded edges get 4/β too (the app still comes out a little conservative
   against that data). There is no data for square edges, so they keep the cautious 2.5/β, which errs toward a lower
   stability margin. (OpenRocket's supersonic margins come out lower than 4/β.) Subsonic and supersonic are blended across Mach 0.9–1.5. The fin's center of pressure moves
   from a quarter of the mean chord toward Barrowman's supersonic location, x/c = (AR·β − 0.67)/(2·AR·β − 1). */
const FIN_SUB_M = 0.9,
  FIN_SUP_M = 1.5,
  FIN_SUP_K_SHARP = 4,
  FIN_SUP_K_BLUNT = 2.5;
/**
 * The supersonic fin lift constant for a fin set's edge shape (FIN_SUP_K_SHARP or FIN_SUP_K_BLUNT).
 */
const finSupK = (f) => (f.edge === "square" ? FIN_SUP_K_BLUNT : FIN_SUP_K_SHARP);
/**
 * A fin set's normal-force slope at a Mach number relative to its incompressible value, and how far its center
 * of pressure moves aft.
 * @param {object} f fin set (from aero())
 * @param {number} M Mach number
 * @returns {{k:number, dx:number}} slope ratio, and CP shift aft (m)
 */
function finLiftRatio(f, M) {
  // fin normal-force slope at Mach M over its incompressible value, and the fin CP shift aft (m)
  const X = f.cnX,
    base = 1 + Math.sqrt(1 + X * X),
    AR = (2 * f.s * f.s) / Math.max(f.area, 1e-9);
  const sub = (m) => {
    const b = Math.sqrt(Math.max(1 - m * m, 0));
    return base / (1 + Math.sqrt(1 + (b * X) ** 2));
  };
  // supersonic slope per fin area 4/β·(1 − 1/(2ARβ)); the incompressible slope per fin area is 2π·AR/(2 + √(4 + (2X)²))
  const sup = (m) => {
    const b = Math.sqrt(m * m - 1),
      inc = (2 * Math.PI * AR) / (2 + Math.sqrt(4 + 4 * X * X));
    return ((finSupK(f) / b) * Math.max(0.5, 1 - 1 / (2 * AR * b))) / inc;
  };
  const cpS = (m) => {
    const ab = AR * Math.sqrt(m * m - 1);
    return f.mac * (Math.max(0.25, Math.min(0.5, (ab - 0.67) / (2 * ab - 1))) - 0.25);
  };
  if (M <= FIN_SUB_M) return { k: sub(M), dx: 0 };
  if (M >= FIN_SUP_M) return { k: sup(M), dx: cpS(M) };
  const w = smooth01((M - FIN_SUB_M) / (FIN_SUP_M - FIN_SUB_M));
  return { k: sub(FIN_SUB_M) * (1 - w) + sup(FIN_SUP_M) * w, dx: cpS(FIN_SUP_M) * w };
}
/**
 * Two-dimensional lift slope of a fin strip at a Mach number, relative to 2π (Prandtl–Glauert below Mach 1,
 * Ackeret above, blended between). Used for roll damping.
 * @param {number} M
 * @returns {number}
 *
 * 2-D lift slope of a fin strip against its incompressible 2π, for roll damping
 */
function stripLiftRatio(M) {
  const sub = (m) => 1 / Math.sqrt(1 - m * m),
    sup = (m) => 4 / Math.sqrt(m * m - 1) / (2 * Math.PI);
  if (M <= FIN_SUB_M) return sub(M);
  if (M >= FIN_SUP_M) return sup(M);
  const w = smooth01((M - FIN_SUB_M) / (FIN_SUP_M - FIN_SUB_M));
  return sub(FIN_SUB_M) * (1 - w) + sup(FIN_SUP_M) * w;
}
/**
 * cnaParts() cached per design in 0.01-Mach steps.
 * @param {object} A aerodynamic model
 * @param {number} M Mach number
 * @returns {object} see cnaParts
 *
 * the normal-force parts at a given Mach number, cached in steps of 0.01 Mach
 */
function cnaPartsM(A, M) {
  A._cnM = A._cnM || new Map();
  const key = Math.round(Math.max(M, 0) * 100);
  if (A._cnM.has(key)) return A._cnM.get(key);
  const r = cnaParts(A, key / 100);
  if (A._cnM.size > 800) A._cnM.clear();
  A._cnM.set(key, r);
  return r;
}
/**
 * rollParts() cached per design in 0.01-Mach steps.
 * @param {object} A aerodynamic model
 * @param {number} M Mach number
 * @returns {object} see rollParts
 */
function rollPartsM(A, M) {
  A._rpM = A._rpM || new Map();
  const key = Math.round(Math.max(M, 0) * 100);
  if (A._rpM.has(key)) return A._rpM.get(key);
  const r = rollParts(A, key / 100);
  if (A._rpM.size > 800) A._rpM.clear();
  A._rpM.set(key, r);
  return r;
}
/**
 * Normal-force slope of each component (Barrowman) and where it acts, at a Mach number.
 * @param {object} A aerodynamic model from aero()
 * @param {number} [M=0] Mach number
 * @returns {{parts:{cn:number, x:number, fin?:boolean}[], cn:number, cp:number, cnFin:number, momFin:number,
 *   finPlan:number}} each part's CNα (per radian, on A.Aref) and position (m from the nose tip); the total CNα and
 *   center of pressure; the fins' share of CNα and of its moment; and the fins' planform area term
 */
function cnaParts(A, M = 0) {
  // Barrowman normal-force slope (per radian) of each component and where it acts, at Mach M
  const d = 2 * A.R,
    parts = [];
  for (const sg of A.segs) {
    const A1 = Math.PI * sg.r1 * sg.r1,
      A2 = Math.PI * sg.r2 * sg.r2;
    if (Math.abs(A2 - A1) < 1e-12) continue;
    const c = (2 * (A2 - A1)) / A.Aref,
      xp = sg.x + (sg.len * A2 - sg.vol) / (A2 - A1);
    parts.push({ cn: c, x: isFinite(xp) ? xp : sg.x + sg.len / 2 });
  }
  for (const f of A.fins) {
    const { a, s, n } = f,
      xb = f.xLead,
      rf = radiusAt(A, xb + a / 2);
    const fm = finLiftRatio(f, M),
      cnf = (((1 + rf / (s + rf)) * (4 * n * (s / d) ** 2)) / (1 + Math.sqrt(1 + f.cnX ** 2))) * fm.k;
    parts.push({ cn: cnf, x: xb + f.xcp + fm.dx, fin: true });
  }
  const cn = parts.reduce((t, p) => t + p.cn, 0),
    fp = parts.filter((p) => p.fin);
  return {
    parts,
    cn,
    cp: cn > 0 ? parts.reduce((t, p) => t + p.cn * p.x, 0) / cn : A.L / 2,
    cnFin: fp.reduce((t, p) => t + p.cn, 0),
    momFin: fp.reduce((t, p) => t + p.cn * p.x, 0),
    finPlan: A.fins.reduce((t, f) => t + (f.n * f.area) / Math.PI, 0),
  };
}
/**
 * Fin-cant roll forcing and roll damping of all fin sets, at a Mach number. The roll moment is
 * q·Aref·(force − damp·p/V), with p the roll rate.
 * @param {object} A aerodynamic model
 * @param {number} [M=0] Mach number
 * @returns {{force:number, damp:number}}
 *
 * each fin set's roll terms: moment = q·Aref·(force − damp·p/V). A fin's own normal-force slope CNα1 = 8(s/d)²/(1+√(1+X²))
 * (the set's Barrowman slope is N/2 of it); cant tilts each fin's chord, and spinning at p meets each strip at an angle p·r/V
 */
function rollParts(A, M = 0) {
  const d = 2 * A.R;
  let force = 0,
    damp = 0;
  const strip = stripLiftRatio(M);
  for (const f of A.fins) {
    const rf = radiusAt(A, f.xLead + f.a / 2),
      cna1 = ((8 * (f.s / d) ** 2) / (1 + Math.sqrt(1 + f.cnX ** 2))) * finLiftRatio(f, M).k;
    // with the body's interference factor (1 + r/(s + r)), as for the fins' normal force
    force += ((f.n * cna1 * (1 + rf / (f.s + rf)) * (f.cant || 0) * Math.PI) / 180) * (rf + (f.yMac ?? f.s / 3));
    // damping by strip theory: each spanwise strip of fin as a 2-D thin-airfoil section, lift slope 2π (Barrowman 1967; Anderson, Fundamentals of Aerodynamics)
    damp +=
      (strip *
        f.n *
        2 *
        Math.PI *
        (f.area > 0 ? f.area * rf * rf + 2 * rf * (f.I1 || 0) + (f.I2 || 0) : f.a * f.s * (rf + f.s / 2) ** 2)) /
      A.Aref;
  }
  return { force, damp };
}
/**
 * Subsonic (low-speed) center of pressure by Barrowman's method.
 * @param {object} A aerodynamic model
 * @returns {number} m from the nose tip
 */
function cpOf(A) {
  const d = 2 * A.R;
  let CN = 0,
    CNx = 0;
  for (const sg of A.segs) {
    const A1 = Math.PI * sg.r1 * sg.r1,
      A2 = Math.PI * sg.r2 * sg.r2;
    if (Math.abs(A2 - A1) < 1e-12) continue;
    const c = (2 * (A2 - A1)) / A.Aref,
      xp = sg.x + (sg.len * A2 - sg.vol) / (A2 - A1);
    CN += c;
    CNx += c * (isFinite(xp) ? xp : sg.x + sg.len / 2);
  }
  for (const f of A.fins) {
    const { a, s, n } = f,
      xb = f.xLead,
      rf = radiusAt(A, xb + a / 2);
    const cnf = ((1 + rf / (s + rf)) * (4 * n * (s / d) ** 2)) / (1 + Math.sqrt(1 + f.cnX ** 2));
    const xf = xb + f.xcp;
    CN += cnf;
    CNx += cnf * xf;
  }
  return CN > 0 ? CNx / CN : A.L / 2;
}
/**
 * Static stability with a motor: the center of pressure, the CG at liftoff and at burnout, and the margins.
 * @param {object} D design
 * @param {object} m motor (with len, totalMass, propMass)
 * @returns {{cp:number, cgL:number, cgB:number, marginL:number, marginB:number}} positions in m from the nose tip;
 *   margins in calibers (body diameters)
 */
function stability(D, m) {
  const A = aero(D),
    d = 2 * A.R,
    cp = cpOf(A);
  const mx = (D.mountAft ?? D.length) + D.motorOverhang - m.len / 2;
  const cgL = (D.dryMass * D.cgEmpty + m.totalMass * mx) / (D.dryMass + m.totalMass);
  const mb = m.totalMass - m.propMass;
  const cgB = (D.dryMass * D.cgEmpty + mb * mx) / (D.dryMass + mb);
  return { cp, cgL, cgB, marginL: (cp - cgL) / d, marginB: (cp - cgB) / d };
}
