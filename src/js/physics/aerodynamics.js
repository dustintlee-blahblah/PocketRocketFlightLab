/**
 * Aerodynamics: drag (component build-up) and stability (Barrowman normal force and center of pressure), with
 * Mach number effects, fin lift and roll terms.
 *
 * aero(D) turns a design into the geometry the rest of the code uses (body sections, fin sets, protuberances,
 * reference area); cdParts() gives the zero-angle drag at a speed; cnaParts()/cnaPartsM() the normal-force slope and
 * center of pressure; rollParts() the fin-cant roll forcing and roll damping; stability() the static margin.
 * Sources for each term are given where it is computed.
 */
import { FIN_SWEEP_N, finBlunt, finSweepRatio, finTransonicCd, finWaveK } from "../core/units-and-fin-edges.js";
import { dragModel, heatCoef, vanDriestRatio, VD_R, wallThermal } from "./drag-model.js";
import { bodyPressures } from "./flow-picture.js";
import { noseR, noseSpec, noseTip } from "./geometry.js";
/* ---------- aerodynamics: component drag buildup from the published aerospace literature (zero angle of attack) ----------
   Skin friction: Prandtl–Schlichting turbulent flat-plate law, boundary layer turbulent from the tip (Schlichting, Boundary-Layer Theory),
     fully rough plate law (White, Viscous Fluid Flow) blended in by roughness Reynolds number between Nikuradse's smooth (k+≈5)
     and fully rough (k+≈70) limits, compressibility factor (1+0.144M²)^-0.65 (adiabatic-wall approximation).
   Form factors: Hoerner, Fluid-Dynamic Drag (1965) — bodies 1+1.5(d/l)^1.5+7(d/l)^3, fin sections 1+2(t/c)+60(t/c)^4.
   Forebody pressure drag below the critical Mach number: Hoerner's shoulder-angle rule, 0.8·sin²(shoulder angle).
   Transonic and supersonic nose drag: free-flight and wind-tunnel measurements in NASA TR R-100 (Stoney, 1961), figs. 11–12.
   Supersonic drag of body flares and shoulders: Bonney's cone correlation, as presented by Fleeman (Tactical Missile Design, AIAA).
   Base drag (coasting and powered): Fleeman's base-pressure correlation below Mach 1; above it NACA TN 3819 (Love,
     1957): body base pressure, boattails, fins near the base, and blunt fin trailing edges, from measurements.
   Boattail separation: attached below about 8° half-angle, fully separated above about 20° (Hoerner, ch. 3).
   Fin edges: stagnation pressure on blunt leading edges (isentropic below Mach 1, Rayleigh pitot above), sweep by the
     independence principle; Newtonian rounded edges; Ackeret thin-airfoil wave drag for sharp sections. Blunt trailing
     edges (square and rounded) below Mach 1: Hoerner's two-dimensional base drag, 0.135/∛C_f (ch. 3).
   Rail buttons and lugs: Hoerner protuberance drag (Newtonian cylinder above Mach 1), scaled by the 1/7-power turbulent
     boundary-layer profile.
   Other protuberances (cameras, switch boxes, shrouds): Hoerner's coefficients for three-dimensional protuberances
     (ch. 5, figure 13; a sloped-front box from his steps on a wall, figure 10), scaled the same way.
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
 * Pressure drag of a rounded (hemispherical) nose tip, on its own frontal area. Below about Mach 0.8 a rounded tip
 * costs nothing (the flow stays attached round it; Hoerner, Fluid-Dynamic Drag); from there it rises through
 * the transonic range to modified Newtonian theory, Cp,max/2 for a hemisphere (Lees), reached by Mach 1.3. A blunted
 * nose's drag is then the sharp nose's over the rest of its frontal area plus this over the tip's, as DATCOM builds a
 * spherically blunted cone.
 * @param {number} M Mach number
 * @returns {number}
 */
function tipCapCd(M) {
  return M <= 0.8 ? 0 : (stagCp(M) / 2) * smooth01((M - 0.8) / 0.5);
}
/**
 * Base drag coefficient on the base area at Mach M (Fleeman's correlation). Kept for protuberances in crossflow
 * (rail buttons); the rocket's own bases use the TN 3819 curves below.
 */
/* Transonic peak of a fin's wave drag over (t/c)^(5/3), against aspect ratio × (t/c)^(1/3): MIL-HDBK-762 figure 5-130
   (rectangular fins), the highest point of each curve. Used for its trend only (see the fins in cdParts). */
const FIN_PEAK_AR = [
  [0, 0],
  [0.25, 0.55],
  [0.5, 1.15],
  [1, 2.1],
  [1.5, 2.65],
  [2, 3.0],
  [3, 3.25],
];
const fleemanBase = (M) => (M < 1 ? 0.12 + 0.13 * M * M : 0.25 / M);
/* ---------- base pressure: NACA TN 3819 (Love, 1957) above Mach 1, Fleeman below ----------
   Body base (no fins, no boattail): the "basic curve of present analysis" of fig. 18, digitized, as −Cp,base.
   Blunt fin trailing edges (two-dimensional bases): fig. 5, the estimate from Pr + 0.06 that matches the experimental
   compilations. Below Mach 1 the report has no data, so Fleeman's subsonic 0.12 + 0.13M² is kept, blended into the
   TN 3819 curves between Mach 0.95 and 1.2.
   Boattails: the report's method, the effective two-dimensional expansion angle at the base δe (taken here from the
   fig. 18 curve by Prandtl–Meyer) reduced by K·β, K = 0.85 + 0.15·h/D, conditions ahead of the base taken as free
   stream (the report's Mo ≈ M∞ form).
   Fins near the base: the free-flight finned-model increment of fig. 35 (t/c = 0.10, unswept, 4 fins, trailing edges at
   the base, exposed span 1.25 body diameters), scaled to other fins by thickness (fig. 33: increment ∝ (t/c)^0.8), sweep
   (cos²Λ on t/c, which with the span ratio reproduces the RM-10 increments of fig. 34 within 0.004), fin count (N/4)
   and span, and faded as the trailing edges move ahead of the base (fig. 32: the region of influence reaches about
   one chord at Mach 1.5 and two at Mach 2, growing with Mach number). Past Mach 3 the increment shrinks in proportion
   to the body-alone base suction (the report: fin effects lessen as Mach number rises).
   Ported from the Wind Tunnel tool (v2.1), where these were checked against RM A53D02 (mean error 17.0% → 14.4%). */
const TN3819_BODY = [
  [1.0, 0.186],
  [1.2, 0.185],
  [1.4, 0.179],
  [1.6, 0.171],
  [1.8, 0.16],
  [2.0, 0.1485],
  [2.2, 0.1375],
  [2.4, 0.125],
  [2.6, 0.115],
  [2.8, 0.106],
  [3.0, 0.098],
  [3.2, 0.091],
  [3.4, 0.0827],
  [3.6, 0.076],
  [3.8, 0.07],
  [4.0, 0.0657],
  [4.4, 0.0577],
  [4.8, 0.05],
  [5.0, 0.0463],
  [5.4, 0.041],
  [5.8, 0.037],
  [6.0, 0.035],
  [7.0, 0.027],
  [8.0, 0.022],
];
const TN3819_2D = [
  [1.0, 0.5],
  [1.2, 0.45],
  [1.4, 0.364],
  [1.6, 0.318],
  [1.8, 0.274],
  [2.0, 0.226],
  [2.2, 0.2],
  [2.4, 0.172],
  [2.6, 0.148],
  [2.8, 0.13],
  [3.0, 0.116],
  [3.4, 0.088],
  [4.0, 0.065],
];
/* fig. 35: free-flight finned model minus the body-alone curve (t/c = 0.10, x/c = 0, unswept) */
const TN3819_FIN = [
  [1.0, 0.115],
  [1.2, 0.101],
  [1.4, 0.098],
  [1.6, 0.099],
  [1.7, 0.098],
  [1.8, 0.06],
  [2.0, 0.044],
  [2.2, 0.033],
  [2.4, 0.027],
  [2.6, 0.017],
  [3.0, 0.018],
];
/* The test drag model's body base pressure (drag-model.js), as −Cp,base: NASA TR R-100 (Stoney, 1961), fig. 3, the
   three-dimensional curve for a cylindrical afterbody with a turbulent boundary layer, from free-flight
   measurements, Mach 0.5 to 2. The Missile DATCOM final report (section 3.1.1.8) takes cylinder base drag from this
   report. The figure draws a band (the scatter of the flight data); these are its middle, digitized: nearly level
   at 0.136 below Mach 0.9, a sharp rise through Mach 1 to a peak of 0.214 at Mach 1.05, then falling to meet
   TN 3819's curve at Mach 2, which carries on above. The band is about ±0.013 wide below Mach 1 and ±0.025 at the
   peak, and the report warns the curve is least sure at subsonic speeds. Below Mach 0.5, where the figure stops,
   its Mach 0.5 value is held. */
const R100_BODY = [
  [0.5, 0.136],
  [0.8, 0.135],
  [0.9, 0.137],
  [0.95, 0.147],
  [0.975, 0.165],
  [1.0, 0.2025],
  [1.05, 0.214],
  [1.1, 0.203],
  [1.15, 0.199],
  [1.2, 0.197],
  [1.25, 0.192],
  [1.5, 0.18],
  [1.75, 0.165],
  [2.0, 0.1495],
  ...TN3819_BODY.filter((p) => p[0] > 2.1),
];
/**
 * Weight of the TN 3819 (supersonic) base pressures against Fleeman's subsonic correlation: 0 below Mach 0.95, 1 above 1.2.
 * @param {number} M
 * @returns {number}
 */
const tn3819W = (M) => smooth01((M - 0.95) / 0.25);
/**
 * −Cp at the base of a body without fins or boattail, on the base area.
 * @param {number} M Mach number
 * @param {boolean} [test] the test drag model: TR R-100's flight-measured curve at every speed (R100_BODY)
 * @returns {number}
 */
function baseCpBody(M, test = false) {
  if (test) return Math.min(tblAt(R100_BODY, M), 0.95 / (0.7 * Math.max(M, 1) ** 2));
  const sub = 0.12 + 0.13 * Math.min(M, 1) * Math.min(M, 1),
    w = tn3819W(M);
  if (w <= 0) return sub;
  const sup = Math.min(tblAt(TN3819_BODY, Math.max(M, 1)), 0.95 / (0.7 * Math.max(M, 1) ** 2));
  return sub * (1 - w) + sup * w;
}
/**
 * −Cp at a blunt two-dimensional base (a square or rounded fin trailing edge), on its frontal area.
 * @param {number} M Mach number
 * @returns {number}
 */
function baseCp2D(M) {
  const sub = 0.12 + 0.13 * Math.min(M, 1) * Math.min(M, 1),
    w = tn3819W(M);
  if (w <= 0) return sub;
  const m = Math.max(M, 1),
    vac = 1 / (0.7 * m * m),
    sup = m <= 4 ? tblAt(TN3819_2D, m) : Math.min(0.73 * vac, baseCpBody(m));
  return sub * (1 - w) + Math.min(sup, 0.95 * vac) * w;
}
/**
 * Pressure ratio p/p∞ after a Prandtl–Meyer turn of `turn` radians from free stream at Mach M (expansion if > 0).
 * @param {number} M
 * @param {number} turn rad
 * @returns {number}
 */
function pmPressureRatio(M, turn) {
  const nu = (m) => {
    const b = Math.sqrt(Math.max(m * m - 1, 0));
    return Math.sqrt(6) * Math.atan(b / Math.sqrt(6)) - Math.atan(b);
  };
  if (!(turn > 0)) return 1;
  const target = nu(M) + turn;
  let lo = 1,
    hi = 100;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (nu(m) < target) lo = m;
    else hi = m;
  }
  const M2 = (lo + hi) / 2;
  return Math.pow((1 + 0.2 * M * M) / (1 + 0.2 * M2 * M2), 3.5);
}
/**
 * −Cp over the rocket's own base (TN 3819 above Mach 1): the body curve, corrected for a boattail ending at the base,
 * plus the fins' added suction, limited to 95% of vacuum.
 * @param {{bt:number, hD:number, fins:{g:number, xc:number}[]}} B base geometry from aero(): boattail half-angle (rad)
 *   ending at the base, base over maximum diameter, and each fin set's base-influence terms (tn3819FinTerm)
 * @param {number} M Mach number
 * @param {boolean} [test] the test drag model: the body curve is TR R-100's (R100_BODY) at every speed, with the same
 *   boattail and fin corrections above Mach 1
 * @returns {number}
 */
function baseCpRocket(B, M, test = false) {
  const w = tn3819W(M),
    sub = test ? baseCpBody(M, true) : 0.12 + 0.13 * Math.min(M, 1) * Math.min(M, 1);
  /* The test drag model's boattail rule (below): the body curve's pressure times base radius / maximum radius, at
     every speed. Below Mach 1 that is also the form of Hoerner's base drag rule, (base diameter / diameter)³; TR
     R-100 warns it can still be too high there (boattailed bases can read above free-stream pressure). */
  const btK = test && B && B.attT > 0 ? 1 - B.attT * (1 - Math.min(Math.max(B.hD, 0), 1)) : 1;
  if (w <= 0 || !B) return w <= 0 ? sub * btK : baseCpBody(M, test);
  const m = Math.max(M, 1),
    q = 0.7 * m * m;
  let cp = tblAt(test ? R100_BODY : TN3819_BODY, m);
  /* The boattail relief below works by taking the boattail's angle off the turn the flow makes at the base. Near Mach 1
     that turn is only a few degrees, so any boattail would cancel it; flight data say otherwise: the RM-10's 4.8°
     afterbody (NACA TN 3320, full-scale free flight) keeps a base pressure coefficient of about 0.11 from Mach 1.2 to
     2.8, against the method's 0 at Mach 1.2. So the relief fades in from Mach 1.5 to 2.0, where it agrees with that
     flight once the fins' share is added, and below Mach 1.5 the base keeps the body curve. */
  const btW = smooth01((m - 1.5) / 0.5);
  /* The test drag model: TR R-100's equation 1 for a conical afterbody takes the cylinder's base drag times (base
     radius / maximum radius)³: on the base's own area, the body curve's pressure times that ratio. "A purely empirical
     approximation for the effect of base diameter ratio on the base pressure", from flight data on bodies with
     afterbodies, so it needs no fade-in below Mach 2: on the RM-10 (base 0.6 of the maximum) it gives 0.12 at Mach
     1.2, where TN 3320 measured about 0.11 in flight. Only the attached share of a steep tail cone counts. */
  if (test) {
    cp *= btK;
  } else if (B.bt > 0 && btW > 0) {
    const cp0 = cp;
    // δe from the body curve: the Prandtl–Meyer turn that gives the body-alone base pressure
    const pb = 1 - cp * q;
    let lo = 0,
      hi = 1.2;
    for (let i = 0; i < 50; i++) {
      const t = (lo + hi) / 2;
      if (pmPressureRatio(m, t) > pb) lo = t;
      else hi = t;
    }
    const de = (lo + hi) / 2,
      K = 0.85 + 0.15 * Math.min(Math.max(B.hD, 0), 1),
      d = Math.max(de - K * B.bt, 0);
    cp = cp0 * (1 - btW) + ((1 - pmPressureRatio(m, d)) / q) * btW;
  }
  let fin = 0;
  const ref = m <= 3 ? tblAt(TN3819_FIN, m) : (tblAt(TN3819_FIN, 3) * tblAt(TN3819_BODY, m)) / tblAt(TN3819_BODY, 3),
    reach = Math.min(Math.max(1 + 2 * (m - 1.5), 1), 3);
  for (const f of B.fins) {
    const fx = f.xc <= 0 ? 1 : Math.max(0, 1 - f.xc / reach) ** 2;
    fin += ref * f.g * fx;
  }
  const sup = Math.min(cp + fin, 0.95 / q);
  return sub * btK * (1 - w) + sup * w;
}
/**
 * The base-pressure terms of one fin set for baseCpRocket (TN 3819, figs. 32–35).
 * @param {object} f fin set (from aero()): n, s (span), t (thickness), mac, cosL, a (root chord), xLead
 * @param {number} L rocket length, m
 * @param {number} dBody body diameter at the fins, m
 * @returns {{g:number, xc:number}} size factor, and how far the trailing edges sit ahead of the base in root chords
 */
function tn3819FinTerm(f, L, dBody) {
  const tc = f.mac > 0 ? f.t / f.mac : 0,
    gt = Math.pow(Math.max((tc * f.cosL * f.cosL) / 0.1, 0), 0.8),
    gs = Math.min(f.s / (1.25 * Math.max(dBody, 1e-6)), 1.5);
  return { g: gt * (f.n / 4) * gs, xc: (L - (f.xLead + f.a)) / Math.max(f.a, 1e-6) };
}
/**
 * Smoothstep: 0 below 0, 1 above 1, an S-curve between. Used to blend models across a range.
 */
export const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
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
/* ---------- the test drag model's nose wave drag above Mach 2 (drag-model.js) ----------
   The pressure along the nose by the second-order shock-expansion method (Syvertson and Dennis, NACA Report 1328),
   started from the exact Taylor–Maccoll cone solution at the tip (NACA Report 1135; flow-picture.js, which the Wind
   Tunnel's picture already uses), summed over the nose's frontal area. For a cone this is the exact cone pressure.
   The Missile DATCOM final report (section 3.1.1.4) chose this method for supersonic body wave drag, and found it
   reads about 20% high below Mach 2 and fails near Mach 1.4, where the flow behind the nose shock goes subsonic; so
   the released model's measured curves (TR R-100) are kept to Mach 2 and this takes over by Mach 2.5. Report 1328
   checks the method for Mach number over nose fineness ratio from about 0.4 to 2; past that it tends to the
   tangent-cone pressures, which is where Newtonian theory also goes.
   A nose's drag coefficient on its own base area depends only on its shape and fineness, so it is worked out once
   per shape on a Mach grid (the cone solutions take a moment) and interpolated. */
const NOSE_SE_M0 = 2,
  NOSE_SE_DM = 0.25,
  NOSE_SE_N = 33; // Mach 2 to 10
const noseSeCache = new Map();
/**
 * A sharp nose's pressure drag coefficient on its base area at Mach 2, 2.25 ... 10, by second-order shock-expansion.
 * @param {string} shape nose shape (noseR)
 * @param {number} param its shape parameter
 * @param {number} fin fineness ratio, length over base diameter
 * @returns {(number|null)[]} null where the shock stands off the tip or the method gives no answer
 */
function noseSeTable(shape, param, fin) {
  const key = `${shape}|${(+param || 0).toFixed(4)}|${fin.toFixed(3)}`;
  if (noseSeCache.has(key)) return noseSeCache.get(key);
  const N = 80,
    L = 2 * fin, // base radius 1
    P = [];
  for (let i = 0; i <= N; i++) {
    const x = (L * i) / N;
    P.push({ x, r: noseR(shape, param, x, 1, L) });
  }
  const rAt = (x) => noseR(shape, param, x, 1, L),
    tab = [];
  for (let j = 0; j < NOSE_SE_N; j++) {
    let cd = null;
    try {
      const bp = bodyPressures(P, NOSE_SE_M0 + j * NOSE_SE_DM);
      if (!bp.detached && bp.cps.length) {
        cd = 0;
        for (const c of bp.cps) cd += c.cp * (rAt(c.x1) ** 2 - rAt(c.x0) ** 2);
        if (!isFinite(cd) || cd <= 0) cd = null;
      }
    } catch (e) {
      cd = null;
    }
    tab.push(cd);
  }
  if (noseSeCache.size > 60) noseSeCache.clear();
  noseSeCache.set(key, tab);
  return tab;
}
/**
 * A sharp nose's pressure drag coefficient on its base area above Mach 2, by second-order shock-expansion.
 * @param {{shape:string, param:number, fin:number}} nose
 * @param {number} M Mach number
 * @returns {number|null} null when the method has no answer there (the caller keeps the released model's value)
 */
function noseCdSE(nose, M) {
  const tab = noseSeTable(nose.shape, nose.param, nose.fin),
    x = Math.min(Math.max((M - NOSE_SE_M0) / NOSE_SE_DM, 0), NOSE_SE_N - 1.000001),
    i = Math.floor(x),
    a = tab[i],
    b = tab[i + 1];
  return a == null || b == null ? null : a + (b - a) * (x - i);
}
/**
 * Flat-plate skin-friction coefficient, with surface roughness and compressibility.
 * @param {number} Re Reynolds number on the surface's own length
 * @param {number} Lc that length, m
 * @param {number} k roughness height, m
 * @param {number} M Mach number
 * @param {string} mode "natural" for natural laminar-to-turbulent transition; otherwise turbulent from the start
 * @param {number} [wall] the test drag model (drag-model.js): the wall's temperature over the air's, Tw/Te, for
 *   Van Driest II compressibility in place of the released factor. 0 or left out: the released model.
 * @returns {number} Cf on the wetted area
 */
function plateCf(Re, Lc, k, M, mode, wall = 0) {
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
  const comp = wall > 0 ? vanDriestRatio(M, Re, wall) : Math.pow(1 + 0.144 * M * M, -0.65);
  return (smoothCf + w * Math.max(roughCf - smoothCf, 0)) * comp;
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
    sup = (m) => (2 / 3) * stagCp(m) + fleemanBase(m);
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
 * Drag coefficients of protuberances on a wall, on their frontal area and the mean dynamic pressure the boundary layer
 * leaves them: Hoerner, Fluid-Dynamic Drag, chapter V, figure 13 ("independent" coefficients of three-dimensional
 * protuberances). bluff: a box or plate about as long as it is tall (a, 1.20; the text gives 1.0 to 1.3 for square
 * plates). long: a box more than twice as long as tall (b, 0.74). round: an upright cylinder or bolt (e and f, 0.80 and
 * 0.76). faired: a streamlined blister (g, 0.07).
 * ramp: a long box with its front face sloped and its back square. Hoerner has no such box measured; it is built from
 * his long blunt box (b, 0.74) and his steps on a wall (ch. V, figure 10: a square step facing the flow 0.40, the same
 * step beveled at 60°, about 30° to the surface, 0.11, and a square step facing away from the flow 0.22). The box's
 * drag is taken as split between its front and back as the two square steps split it, and the sloped front keeps
 * 0.11/0.40 of its share: 0.74 × (0.11 + 0.22) / (0.40 + 0.22) = 0.39.
 */
const BUMP_CD = { bluff: 1.2, long: 0.74, round: 0.78, faired: 0.07, ramp: 0.39, flyaway: 1.2 }; // a fly-away rail guide: a blunt block, there only on the rail
/**
 * Drag coefficient of a protuberance, on its frontal area, before the boundary-layer factor (blFactor: Hoerner's
 * effective dynamic pressure, 0.75·(h/δ)^(1/3), is the same thing within a few percent). Below Mach 1 Hoerner's
 * value. Above Mach 1 a blunt shape follows the rail button's rise (cylinderCd, by stagnation pressure and
 * modified Newtonian: about 1.3 at Mach 1.5 for the blunt box), which Hoerner's free-flight values at Mach 1 to 2
 * bracket (ch. XX, p. 20-14: 0.75 for a forward-facing step plus 0.45 for a rear-facing one, 0.8 for blunt rings,
 * 2.0 for round rivet heads, which he calls high). There is no such data for a faired one: it takes the larger of that and the Newtonian pressure on a front
 * face that climbs to its height over half its length, 2·sin²θ. A sloped-front box stays a share of the long blunt
 * box at every speed: 0.39/0.74 below Mach 1, and above it the share Hoerner's free-flight steps give, a rear-facing
 * step (0.45) plus modified Newtonian pressure on a 30° front (Cp,max·sin²30°) against a forward-facing step (0.75)
 * plus the same rear one (0.70 of the long box at Mach 1.5), blended over Mach 1 to 1.3.
 * @param {{shape:string, h:number, len:number}} b protuberance
 * @param {number} M Mach number
 * @returns {number}
 */
function bumpCd(b, M) {
  const c = (BUMP_CD[b.shape] * cylinderCd(M)) / 1.2;
  if (b.shape === "ramp") {
    const sub = BUMP_CD.ramp / BUMP_CD.long,
      sup = (0.45 + stagCp(M) * 0.25) / (0.75 + 0.45),
      t = M > 1 ? smooth01((M - 1) / 0.3) : 0;
    return ((BUMP_CD.long * cylinderCd(M)) / 1.2) * ((1 - t) * sub + t * sup);
  }
  if (b.shape !== "faired" || M <= 1) return c;
  const s = Math.sin(Math.atan2(b.h, Math.max(b.len / 2, 1e-6)));
  return Math.max(c, smooth01((M - 1) / 0.3) * 2 * s * s);
}
/**
 * A fly-away rail guide's weight and drag while the rocket is on the rail (it lets go as the rocket leaves, so the
 * flight carries neither): the guides' total weight, and their drag area at this airspeed (the blunt box's
 * coefficient on width × height, in the boundary layer where they sit).
 * @param {object} A from aero()
 * @param {number} v airspeed (m/s)
 * @param {object} atm from atmosphere()
 * @returns {{mass:number, cdA:number}} kg, m²
 */
export function flyaway(A, v, atm) {
  let mass = 0,
    cdA = 0;
  for (const b of A.bumps || [])
    if (b.fly) {
      mass += b.mass || 0;
      cdA += bumpCd(b, v / atm.a) * blFactor(b.h, b.x, v, kinVisc(atm)) * b.front;
    }
  return { mass, cdA };
}
/**
 * The sideways pull of protuberances that sit on one side of the body. Each is taken as a uniform block: its weight
 * and its drag act at the middle of its height, at body radius + h/2 from the centerline, at its angle around the body.
 * Returns the two sums the flight needs, as components along the body's two cross axes (angle 0 and 90°):
 * mr, weight × distance (kg·m; divided by the rocket's mass it is how far the CG sits off the centerline), and
 * dr, drag area × distance (m³; times the dynamic pressure it is the drag's turning moment about the centerline).
 * Items placed evenly around the body cancel. Fly-away rail guides are left out: they are gone in flight.
 * @param {object} A from aero()
 * @param {number} v airspeed (m/s)
 * @param {object} atm from atmosphere()
 * @returns {{mr:number[], dr:number[]}|null} null when there is nothing off the centerline
 */
export function bumpSide(A, v, atm) {
  let any = false;
  const mr = [0, 0],
    dr = [0, 0];
  for (const b of A.bumps || []) {
    if (b.fly) continue;
    any = true;
    const r = radiusAt(A, b.x) + b.h / 2,
      c = Math.cos(b.ang || 0),
      s = Math.sin(b.ang || 0),
      cdA = bumpCd(b, v / atm.a) * blFactor(b.h, b.x, v, kinVisc(atm)) * b.front;
    mr[0] += b.mass * r * c;
    mr[1] += b.mass * r * s;
    dr[0] += cdA * r * c;
    dr[1] += cdA * r * s;
  }
  return any ? { mr, dr } : null;
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
export function segR(sg, x) {
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
export function bodySegments(D) {
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
 * Body radius at a distance from the nose tip, from a list of sections.
 * @param {object[]} segs
 * @param {number} x m
 * @param {number} R radius beyond the sections
 * @returns {number}
 */
function radiusAtSegs(segs, x, R) {
  for (const sg of segs) {
    if (x >= sg.x - 1e-9 && x <= sg.x + sg.len + 1e-9) return segR(sg, Math.min(Math.max(x - sg.x, 0), sg.len));
  }
  return R;
}
/**
 * Body radius at a distance from the nose tip.
 * @param {object} A aerodynamic model from aero()
 * @param {number} x m from the nose tip
 * @returns {number} m
 */
export function radiusAt(A, x) {
  return radiusAtSegs(A.segs, x, A.R);
}
/**
 * All fin sets of a design in one form {n, a (root), b (tip), s (span), sw (sweep), t, xLead, edge, ...}:
 * D.finSets when the design has them, otherwise the main set from the quick-form fields plus any extra sets.
 * @param {object} D design
 * @returns {object[]}
 */
export function finSetsOf(D) {
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
      bevLE: D.finBevLE || 0,
      bevTE: D.finBevTE || 0,
      rs: D.finFinish ?? D.finish,
      cdo: D.finCdOverride || 0,
      pts: D.finPts || null,
      cant: D.finCant || 0,
      par: D.finPar || 0,
      ...(D.finPod != null ? { pod: D.finPod, rb: D.finRb, sb: D.finSb } : {}),
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
export function xfinSets(list, rs) {
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
    bevLE: f.bevLE || 0,
    bevTE: f.bevTE || 0,
    rs,
    cdo: f.cdo || 0,
    pts: f.pts || null,
    cant: f.cant || 0,
    par: f.par || 0,
    ...(f.pod != null ? { pod: f.pod, rb: f.rb, sb: f.sb } : {}),
  }));
}
/**
 * A fin's outline as [x along the root, y out from the body] points.
 * @param {object} f fin set
 * @returns {number[][]}
 *
 * a fin's outline for drawing: the shape from the design file when there is one, otherwise the trapezoid
 */
export function finOutline(f) {
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
export function finGeom(f) {
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
export function aero(D) {
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
    D.finBevLE,
    D.finBevTE,
    D.finish,
    D.railPreset,
    D.buttons,
    D.lugs,
    D.bumps,
    D.otherCd,
    D.cdOverride,
    D.pods,
    D.tubeFins,
    D.noseTip,
    D.wall,
  ]);
  if (aeroCache.has(key)) return aeroCache.get(key);
  const segs = bodySegments(D).map((s) => ({ ...s }));
  // a rounded nose tip, no bigger than the nose's base
  if (D.noseTip > 0 && segs[0] && segs[0].kind === "nose" && segs[0].r1 < 1e-9)
    segs[0].tip = Math.min(D.noseTip, segs[0].r2);
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
                // a rounded tip: the share of the nose's frontal area it makes blunter than the shape already is
                tipF: (() => {
                  const tp = sg.tip > 0 ? noseTip(sg.shape, sg.param, sg.r2, sg.len, sg.tip) : null;
                  return tp ? Math.min(1, (tp.rt * tp.rt - tp.rNat * tp.rNat) / (sg.r2 * sg.r2)) : 0;
                })(),
              }
            : null,
      });
    } else {
      const deg = (Math.atan(dr / sg.len) * 180) / Math.PI;
      // kT: the test drag model keeps the flow on boattails up to 15° (see baseB.attT)
      aft.push({ seg: i, k: smooth01((deg - 8) / 12), kT: smooth01((deg - 15) / 10), area });
    }
  });
  const last = segs[segs.length - 1],
    baseArea = Math.PI * last.r2 * last.r2;
  /* fin-fin interference: more than four fins around the body at one station shield each other, so each set's lift is
     scaled by the count of all fins on the same body overlapping it along its length (Barrowman's 3- and 4-fin results don't cover more;
     factors as in OpenRocket: 5 fins 0.948, 6 0.913, 7 0.854, 8 0.81, more 0.75) */
  const finInterK = (n) => (n <= 4 ? 1 : n === 5 ? 0.948 : n === 6 ? 0.913 : n === 7 ? 0.854 : n === 8 ? 0.81 : 0.75);
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
  for (const f of fins) {
    const a0 = f.xLead,
      a1 = f.xLead + f.a;
    // fins on the same body only (pods carry their own)
    const n = fins
      .filter((g) => (g.par || 0) === (f.par || 0) && g.xLead < a1 - 0.005 && g.xLead + g.a > a0 + 0.005)
      .reduce((t, g) => t + g.n, 0);
    f.kff = finInterK(Math.max(n, f.n));
  }
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
  // protuberances on the outside of the body: frontal area, height, and where the boundary layer reaches them
  const bumps = (D.bumps || [])
    .filter((b) => b.w > 0 && b.h > 0)
    .map((b) => ({
      x: b.x,
      h: b.h,
      len: b.len || 0,
      front: b.w * b.h,
      shape: BUMP_CD[b.shape] != null ? b.shape : "bluff",
      mass: b.mass || 0,
      ang: ((b.ang || 0) * Math.PI) / 180,
      ...(b.shape === "flyaway" ? { fly: true } : {}),
    }));
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
  const pods = (D.pods || []).map((pd) => podAero(pd, D.finish)).filter(Boolean);
  for (const pd of pods) {
    sideArea += pd.k * pd.sideArea;
    sideMom += pd.k * pd.sideArea * pd.xPlan;
  }
  const xPlanAll = sideArea > 0 ? sideMom / sideArea : xPlan;
  const tumbleAll = tumbleCdA + (4 / (3 * Math.PI)) * 1.2 * pods.reduce((a, pd) => a + pd.k * pd.sideArea, 0);
  const tubeFins = (D.tubeFins || []).map((tf) => tubeFinAero(tf, Aref, D.finish)).filter(Boolean);
  const val = {
    blMode: D.blMode || "turb",
    segs,
    R,
    Aref,
    tumbleCdA: tumbleAll,
    L,
    sideArea,
    xPlan: xPlanAll,
    pods,
    tubeFins,
    Ln: nose && nose.kind === "nose" ? nose.len : 0,
    fins,
    Rs: D.finish,
    buttons,
    lugs,
    bumps,
    otherCd: D.otherCd || 0,
    override: D.cdOverride || 0,
    scale: D.dragScale > 0 ? D.dragScale : 1,
    fore,
    aft,
    baseArea,
    // the base's shape for its pressure above Mach 1 (TN 3819): a boattail ending at the base, and the fins near it
    baseB: (() => {
      const ls = segs[segs.length - 1],
        bt = ls && ls.kind === "trans" && ls.r2 < ls.r1 && ls.len > 0 ? Math.atan((ls.r1 - ls.r2) / ls.len) : 0;
      return {
        /* TN 3819's boattail effect is for flow that follows the boattail. Steeper than about 8° the flow starts to
           leave it (Hoerner's rule above, fully separated by 20°, where the step counts as base instead), so only the
           attached share of the angle turns the flow: a separated tail cone gives no relief at the base. */
        bt: bt * (1 - smooth01((bt * (180 / Math.PI) - 8) / 12)),
        hD: ls ? ls.r2 / R : 1,
        // for the test drag model's boattail (TR R-100, equation 1): its whole angle in degrees, the share of the
        // flow that stays attached to it, and its start over the body's maximum radius
        btDeg: bt * (180 / Math.PI),
        att: bt > 0 ? 1 - smooth01((bt * (180 / Math.PI) - 8) / 12) : 0,
        /* The test drag model's attached share: full up to 15°, none past 25°. TR R-100 checked its afterbody
           equation against flight data for slopes up to 15°, and the Arcas model's 15° boattail (NASA TN D-4013)
           keeps its base at or above free-stream pressure below Mach 0.95, which a separated tail cone could not. */
        attT: bt > 0 ? 1 - smooth01((bt * (180 / Math.PI) - 15) / 10) : 0,
        fins: fins
          .filter((f) => f.pod == null)
          .map((f) => tn3819FinTerm(f, L, 2 * radiusAtSegs(segs, f.xLead + f.a, R))),
      };
    })(),
    ffBody,
    skin: skinWall(D.wall),
    tailLen: segs.length > 1 && segs[segs.length - 1].kind === "trans" ? segs[segs.length - 1].len : 0,
    Rt: segs.length ? segs[segs.length - 1].r2 : R,
  };
  if (aeroCache.size > 40) aeroCache.clear();
  aeroCache.set(key, val);
  return val;
}
/**
 * A pod's or side booster's body (OpenRocket pod sets and parallel stages, RockSim external pods), for its lift and
 * drag: its sections worked out as the rocket's own are (wetted area, volume, the steps and slopes that cause pressure
 * drag), its base, and its side outline. Each copy of the pod adds the same again (k), as OpenRocket counts them.
 * @param {object} pd pod from the design: {count, segs, sb}
 * @param {number} finish surface roughness, m
 * @returns {object|null}
 */
function podAero(pd, finish) {
  const segs = (pd.segs || []).filter((sg) => sg.len > 0).map((sg) => ({ ...sg }));
  if (!segs.length) return null;
  segs.sort((a, b) => a.x - b.x);
  const fore = [],
    aft = [];
  let sideArea = 0,
    sideMom = 0;
  segs.forEach((sg, i) => {
    const N = sg.kind === "tube" ? 1 : 100;
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
      if (r > prev && ds > 0) kN += ((r - prev) / ds) ** 2 * Math.PI * (r * r - prev * prev);
      sideArea += (prev + r) * (x1 - x0);
      sideMom += (prev + r) * (x1 - x0) * (sg.x + (x0 + x1) / 2);
      prev = r;
    }
    sg.wet = wet;
    sg.vol = vol;
    sg.rs = sg.rs ?? finish;
    const rPrev = i > 0 ? segs[i - 1].r2 : 0;
    if (sg.r1 > rPrev + 1e-6) fore.push({ seg: i, step: true, area: Math.PI * (sg.r1 * sg.r1 - rPrev * rPrev) });
    else if (sg.r1 < rPrev - 1e-6) aft.push({ seg: i, k: 1, area: Math.PI * (rPrev * rPrev - sg.r1 * sg.r1) });
    if (sg.kind === "tube" || Math.abs(sg.r2 - sg.r1) < 1e-6) return;
    const area = Math.PI * Math.abs(sg.r2 * sg.r2 - sg.r1 * sg.r1),
      dr = Math.abs(sg.r2 - sg.r1);
    if (sg.r2 > sg.r1) {
      const e = sg.len * 1e-3,
        slope = (segR(sg, sg.len) - segR(sg, sg.len - e)) / e;
      fore.push({
        seg: i,
        step: false,
        area,
        sub: 0.8 * Math.sin(Math.atan(slope)) ** 2,
        sig: Math.atan(dr / sg.len),
        blunt: sg.r1 < 1e-6 && (sg.shape === "ellipsoid" || (sg.shape === "power" && sg.param < 0.5)),
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
    } else aft.push({ seg: i, k: smooth01(((Math.atan(dr / sg.len) * 180) / Math.PI - 8) / 12), area });
  });
  const x0 = segs[0].x,
    L = segs[segs.length - 1].x + segs[segs.length - 1].len - x0,
    R = Math.max(...segs.map((sg) => Math.max(sg.r1, sg.r2)), 1e-4),
    f = L / (2 * R);
  return {
    k: pd.count || 1,
    sb: pd.sb ?? null,
    segs,
    fore,
    aft,
    baseArea: Math.PI * segs[segs.length - 1].r2 ** 2,
    L,
    R,
    ffBody: 1 + 1.5 / Math.pow(f, 1.5) + 7 / Math.pow(f, 3),
    sideArea,
    xPlan: sideArea > 0 ? sideMom / sideArea : x0 + L / 2,
  };
}
/**
 * A set of tube fins (short open tubes around the body), as OpenRocket models them (TubeFinSetCalc): each tube's lift
 * from Ribner's ring-airfoil result ("The ring airfoil in nonaxial flow", J. Aeronautical Sciences 14(9), 1947,
 * equation 5), CNα = 2π²·r·c·A′/(1 + A′) with A′ = (2/π)·(2r/c), acting at a quarter of the chord at low speed; its
 * outside surface less the strip the body hides, for skin friction; and its front face, the flow through it, and the
 * wedge-shaped gap where it meets the body, for pressure drag.
 * @param {object} tf tube fin set from the design: {n, len, ro, ri, x, rb}
 * @param {number} Aref reference area, m²
 * @param {number} finish surface roughness, m
 * @returns {object|null}
 */
function tubeFinAero(tf, Aref, finish) {
  const { n, len: c, ro, ri, rb } = tf;
  if (!(n > 0 && c > 0 && ro > 0.001)) return null;
  const ar = (2 * ri) / c,
    arp = (2 * ar) / Math.PI,
    cna1 = (2 * (arp / (1 + arp)) * Math.PI * Math.PI * ri * c) / Aref;
  // where a tube touches the body: the gap between them, and the strip of each it hides
  const d = Math.sqrt(Math.max((rb + ro) ** 2 - ro * ro, 0)),
    th1 = Math.acos(ro / (ro + rb || 1)),
    th2 = Math.PI / 2 - th1;
  const gap = Math.max(d * ro - ro * ro * th1 - rb * rb * th2, 0),
    wet = Math.max(c * 2 * (Math.PI - th1) * ro - c * 2 * th2 * rb, 0);
  return {
    n,
    x: tf.x,
    c,
    ro,
    ri,
    rb,
    ar,
    cna1,
    wet,
    gap,
    front: Math.PI * (ro * ro - ri * ri),
    inner: Math.PI * ri * ri,
    rs: tf.rs ?? finish,
    cdo: tf.cdo || 0,
    pod: tf.pod ?? null,
    sb: tf.sb ?? null,
  };
}
/**
 * A tube fin's center of pressure as a share of its chord: a quarter of the chord up to Mach 0.9, moving to the
 * supersonic location x/c = (AR·β − 0.67)/(2·AR·β − 1) by Mach 1.5, as for flat fins.
 * @param {object} t tube fin set from aero()
 * @param {number} M Mach number
 * @returns {number}
 */
function tubeFinCp(t, M) {
  if (M <= FIN_SUB_M) return 0.25;
  const arb = t.ar * Math.sqrt(Math.max(Math.max(M, FIN_SUP_M) ** 2 - 1, 0)),
    sup = arb > 1 ? Math.min(Math.max((arb - 0.67) / (2 * arb - 1), 0.25), 0.5) : 0.25;
  return 0.25 + (sup - 0.25) * smooth01((M - FIN_SUB_M) / (FIN_SUP_M - FIN_SUB_M));
}
/**
 * The normal-force slope of every pod's nose and transitions, and of every tube fin set, with where each acts.
 * @param {object} A aerodynamic model
 * @param {number} M Mach number
 * @returns {{cn:number, x:number, fin?:boolean}[]}
 */
function extraCnParts(A, M) {
  const parts = [];
  for (const pd of A.pods || [])
    for (const sg of pd.segs) {
      const A1 = Math.PI * sg.r1 * sg.r1,
        A2 = Math.PI * sg.r2 * sg.r2;
      if (Math.abs(A2 - A1) < 1e-12) continue;
      const xp = sg.x + (sg.len * A2 - sg.vol) / (A2 - A1);
      parts.push({ cn: (pd.k * 2 * (A2 - A1)) / A.Aref, x: isFinite(xp) ? xp : sg.x + sg.len / 2 });
    }
  for (const t of A.tubeFins || []) parts.push({ cn: t.n * t.cna1, x: t.x + tubeFinCp(t, M) * t.c, fin: true });
  return parts;
}
/**
 * Kinematic viscosity of the air (Sutherland's law for the dynamic viscosity).
 * @param {{T:number, rho:number}} atm the air, from atmosphere()
 * @returns {number} m²/s
 */
/**
 * The airframe's wall for the skin's heating in flight (the test drag model): thickness, heat capacity per volume and
 * thermal diffusivity. A design without a wall on file (entered by its outline, or saved before walls were kept)
 * counts as 2 mm of a paper or plastic tube.
 * @param {{t:number, rho:number}} [wall] the body's wall from the design file: thickness m, density kg/m³
 * @returns {{t:number, rhoC:number, alpha:number}}
 */
function skinWall(wall) {
  const t = wall && wall.t > 0 ? wall.t : 0.002,
    rho = wall && wall.rho > 0 ? wall.rho : 1300,
    th = wallThermal(rho);
  return { t, rhoC: rho * th.c, alpha: th.alpha };
}
/**
 * How fast the air heats the skin (the test drag model, drag-model.js): the heat transfer coefficient from the body's
 * own friction at the skin's temperature, and the adiabatic wall temperature the skin is heading for.
 * @param {object} A aerodynamic model from aero()
 * @param {number} v airspeed, m/s
 * @param {object} atm the air, from atmosphere()
 * @param {number} skinT the skin's temperature, K
 * @returns {{h:number, Taw:number}} W/m²·K, K
 */
export function skinHeating(A, v, atm, skinT) {
  v = Math.max(v, 0.01);
  const M = v / atm.a,
    cf = plateCf((v * A.L) / kinVisc(atm), A.L, A.segs[0] ? A.segs[0].rs : 0, M, A.blMode, skinT / atm.T);
  return { h: heatCoef(cf, atm.rho, v), Taw: atm.T * (1 + VD_R * 0.2 * M * M) };
}
function kinVisc(atm) {
  const mu = (1.458e-6 * Math.pow(atm.T, 1.5)) / (atm.T + 110.4);
  return mu / atm.rho;
} // Sutherland's law
/* Base drag of a blunt fin trailing edge. A fin's flat trailing edge is a two-dimensional base: its wake sheds vortices
   in a regular (periodic) street, which pulls the base pressure far lower than behind the rocket's round,
   three-dimensional base. Hoerner (Fluid-Dynamic Drag, ch. 3) correlates both against the friction drag of what lies
   ahead of the base, referred to the base area: 3-D C_Db = 0.029/√C_f, 2-D C_Db = 0.135/∛C_f. For a fin, the friction
   ahead of its trailing edge on that edge's area is C_f·2·chord/thickness (both faces). Below Mach 1 the edge takes the
   larger of the 2-D value and the two-dimensional base coefficient; across Mach 0.95–1.2 Hoerner's value fades out
   as that coefficient blends into NACA TN 3819's measured two-dimensional base pressure (fig. 5), which governs above. */
/* Checked against NACA TN 2074 (Smith & Schaefer, 1950): NACA 0012 sections cut off square at the rear, trailing
   edges 0.68, 1.40 and 4.01% of chord, Reynolds number 6 million. With the 0012's own drag as the friction ahead, the
   formula gives the measured base drag of the 0.68% edge, and reads 29% and 20% low for the 1.40% and 4.01% edges;
   the body correlation it replaces (0.12) read 60% low on the thickest. */
const FIN_TE_2D = true;
/* rounded trailing edges: the flow still breaks away from a rounded edge, but a little later and into a slightly
   narrower wake. NASA TN D-6637 (Prust & Helon, 1972) measured round and square trailing edges of the same thickness
   (11% of the throat width) on turbine stator blades: the round edge added 0.9 points of loss over a sharp edge, the
   square about 1.4 below 0.7 of critical velocity and 1.15 at 0.8, so a round edge keeps about 0.64–0.78 of a square
   edge's loss. 0.7 is the middle of that range (the earlier 0.5 had no published source). */
const FIN_ROUND_TE = 0.7;
/**
 * Base drag coefficient of a blunt fin trailing edge, on the edge's area (span × thickness).
 * @param {number} M Mach number
 * @param {number} cb the body's base drag coefficient at M
 * @param {number} cf the fin's friction coefficient on its wetted area (with form factor)
 * @param {object} f fin set (mac: mean aerodynamic chord, t: thickness)
 * @returns {number}
 */
function finTeCp(M, cb, cf, f) {
  const w = tn3819W(M);
  if (!FIN_TE_2D || w >= 1 || !(cf > 0) || !(f.t > 0)) return cb;
  const cfx = (cf * 2 * f.mac) / f.t;
  return Math.max(cb, (0.135 / Math.cbrt(cfx)) * (1 - w));
}
/* Wave drag of a beveled fin from its bevel lengths. Ackeret's thin-airfoil theory for a flat plate whose leading and
   trailing edges are beveled over fractions e1 and e3 of the chord gives Cd = (t/c)²/β · (1/e1 + 1/e3) (a double wedge,
   e1 = e3 = 0.5, gives the familiar 4; the default 20% bevels give 10). A short bevel is a steep wedge, where linear
   theory overstates the drag, so each bevel is held to at most what a flat edge of the same thickness costs: the
   leading bevel no more than a square leading edge (0.8 of stagnation pressure on its face), the trailing bevel no
   more than a blunt two-dimensional base. Without bevel lengths the section keeps the 20% bevels. */
/**
 * Supersonic wave-drag constant K of a fin set's section, in Cd = K·(t/c)²/β.
 * @param {object} f fin set (edge, tc, mac, and for beveled fins bevLE and bevTE in m)
 * @param {number} Mn Mach number normal to the leading edge
 * @param {number} beta √(Mn² − 1), at least 0.4
 * @param {number} cb2 two-dimensional base pressure coefficient at this Mach number
 * @returns {number}
 */
function finK(f, Mn, beta, cb2) {
  if (f.edge !== "beveled" || !(f.bevLE > 0 || f.bevTE > 0) || !(f.mac > 0) || !(f.tc > 0)) return finWaveK(f.edge);
  const e1 = Math.min(0.5, Math.max(f.bevLE > 0 ? f.bevLE / f.mac : 0.2, f.tc / (0.8 * stagCp(Mn) * beta))),
    e3 = Math.min(0.5, Math.max(f.bevTE > 0 ? f.bevTE / f.mac : 0.2, f.tc / (Math.max(cb2, 0.05) * beta)));
  return 1 / e1 + 1 / e3;
}
/**
 * Zero-angle drag coefficient of the rocket at a speed, split into friction, pressure and base drag.
 * @param {object} A aerodynamic model from aero()
 * @param {number} v airspeed, m/s
 * @param {object} atm the air, from atmosphere()
 * @param {number} [nozzleArea=0] nozzle exit area while a motor burns, m² (its exhaust fills that much of the base)
 * @param {string} [model] "released" or "test" (drag-model.js); by default the one chosen in Settings
 * @param {number} [skinT] the test model: the skin's temperature, K (a flight follows it, skinHeating() below). Left
 *   out, the skin is fully heated (the adiabatic wall), as on a wind tunnel model.
 * @returns {{cd:number, friction:number, pressure:number, base:number}} coefficients on A.Aref
 */
export function cdParts(A, v, atm, nozzleArea = 0, model = dragModel, skinT = 0) {
  // a fixed Cd for the whole rocket (from the design file): used as it is, scaled by any calibration to a real flight
  if (A.override > 0) return { cd: A.override * (A.scale || 1), friction: 0, pressure: 0, base: 0, override: true };
  v = Math.max(v, 0.01);
  const M = v / atm.a,
    nu = kinVisc(atm),
    q0 = stagCp(M),
    tm = model === "test", // the test drag model's terms (drag-model.js); everything else is the released model
    cb = baseCpBody(M, tm),
    cb2 = baseCp2D(M),
    cbBase = baseCpRocket(A.baseB, M, tm),
    S = A.Aref,
    // the test model's friction (drag-model.js) takes the wall's temperature over the air's; 0 means the released model
    vd = tm ? (skinT > 0 ? skinT / atm.T : 1 + VD_R * 0.2 * M * M) : 0;
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
  const finCf = new Map(); // each fin set's friction coefficient on its wetted area (for its trailing-edge base drag)
  let ovr = 0;
  const skip = (it) => A.segs[it.seg] && A.segs[it.seg].cdo > 0; // per-part Cd overrides from the design file
  for (const sg of A.segs) {
    if (sg.cdo > 0) {
      ovr += sg.cdo;
      continue;
    }
    friction += plateCf((v * A.L) / nu, A.L, sg.rs, M, A.blMode, vd) * sg.wet;
  }
  friction *= A.ffBody;
  for (const f of A.fins) {
    if (f.cdo > 0) {
      ovr += f.cdo;
      continue;
    }
    const cfF = plateCf((v * f.mac) / nu, f.mac, f.rs, M, A.blMode, vd) * f.ff;
    friction += f.n * cfF * 2 * f.area;
    finCf.set(f, cfF);
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
      // the test drag model: second-order shock-expansion from Mach 2 (fully by 2.5), for noses that come to a point
      if (tm && M > NOSE_SE_M0 && !it.blunt) {
        const se = noseCdSE(it.nose, M);
        if (se != null) cdn = mix(cdn, se, smooth01((M - NOSE_SE_M0) / 0.5));
      }
      if (it.nose.tipF > 0) cdn = (1 - it.nose.tipF) * cdn + it.nose.tipF * tipCapCd(M);
      pressure += (cdn * it.area) / S;
      continue;
    } // measured nose drag (NASA TR R-100)
    pressure += ((M < 1 ? (1 - tr) * it.sub + tr * wave(1) : wave(M)) * it.area) / S;
  }
  for (const it of A.aft) {
    if (!skip(it)) base += ((tm && it.kT != null ? it.kT : it.k) * cb * it.area) / S;
  }
  if (A.baseArea > 0) base += (cbBase * Math.max(A.baseArea - Math.min(nozzleArea, A.baseArea), 0)) / S;
  /* The test drag model: the pressure (wave) drag of a boattail ending at the base, above Mach 1. TR R-100's
     equation 1 for conical afterbodies: (0.0010·θ + 0.00071·θ²)/M · [1 − (base radius / maximum radius)^n] on the
     maximum cross-section, θ the afterbody's slope in degrees, n = 4 below Mach 3.5 and 3 above. Its first part
     approximates the second-order theory of NACA TN 2972 (Jack) and was checked against flight data for slopes under
     15°; the report warns against using it below Mach 1, so it fades in through the transonic drag rise, from Mach
     0.88 to 1 (the Arcas model's 15° boattail, NASA TN D-4013 with its fins off, gains about 0.15 of pressure drag
     over that range and holds it to Mach 1.2; this gives 0.14 at Mach 1 and 0.12 at 1.2). Only the attached share
     of a steeper cone counts (the rest is already base area, above). The released model has no such term.
     The report's flight data stop near Mach 2. From Mach 2.5 the drag is taken from wind-tunnel measurements of
     conical boattails behind a cylinder at Mach 2.5 and 3.5 (Rubin, Brazzel and Henderson, US Army Missile Command
     RD-TR-70-5, as MIL-HDBK-762 figure 5-144 gives them: slopes of 4.3° to 9.5°, bases 0.73 and 0.82 of the
     diameter), which run two to five times equation 1 there. They follow linear theory's 2·tan θ/β acting on the
     area the boattail takes away, 1 − (base radius / maximum radius)², less a share that grows with the slope:
     × (1.15 − 0.058·θ), 0.90 at 4.3° and 0.60 at 9.5°, within 0.004 of all eight measurements (the handbook's own
     theory chart, figure 5-122, is this without the reduction, up to 1.5 times the measurements; TR R-100 also
     found theory overestimating as slopes near 15°). The two are blended from Mach 2 to 2.5, so each is used where
     it was measured. */
  if (tm && M > 0.88 && A.baseB && A.baseB.attT > 0) {
    const B = A.baseB,
      th = Math.min(B.btDeg, 15),
      h = Math.min(Math.max(B.hD, 0), 1),
      eq1 =
        ((smooth01((M - 0.88) / 0.12) * (0.001 * th + 0.00071 * th * th)) / Math.max(M, 1)) *
        (1 - Math.pow(h, M < 3.5 ? 4 : 3)),
      wHi = smooth01((M - 2) / 0.5),
      lin =
        wHi > 0
          ? ((2 * Math.tan((th * Math.PI) / 180)) / Math.sqrt(M * M - 1)) *
            (1 - h * h) *
            Math.min(Math.max(1.15 - 0.058 * th, 0.3), 1)
          : 0;
    pressure += (B.attT * mix(eq1, lin, wHi) * Math.PI * A.R * A.R) / S;
  }
  for (const f of A.fins) {
    if (f.cdo > 0) continue;
    const Mn = M * f.cosL,
      c2 = f.cosL * f.cosL,
      edge = (f.n * f.s * f.t) / S,
      Mdd = Math.max(0.6, 0.96 - 1.5 * f.tc),
      trF = smooth01((Mn - Mdd) / (1.06 - Mdd));
    if (f.edge === "square") {
      /* The test drag model below the drag rise: 0.4 of stagnation pressure, what a blunt leading edge adds over a
         rounded one on long rectangular sections tested between walls (Hoerner, Fluid-Dynamic Drag, ch. III, figure
         22: the flow closes again on the sides once the section is 2.5 thicknesses long). The 0.8 is a flat face
         in three-dimensional flow, kept above Mach 1 and in the released model. Hoerner's figure 23 also shows a
         corner radius of 0.2 of the thickness is enough to lose the penalty, which is why a rounded leading edge has
         none below Mach 1. */
      pressure += (tm ? 0.4 + 0.4 * trF : 0.8) * stagCp(Mn) * c2 * edge;
      base += finTeCp(M, cb2, finCf.get(f), f) * edge;
    } else if (f.edge === "rounded") {
      pressure += (2 / 3) * stagCp(Mn) * trF * c2 * edge;
      base += FIN_ROUND_TE * finTeCp(M, cb2, finCf.get(f), f) * edge;
    } else if (tm) {
      /* The test drag model: wave drag of sharp-edged fins by thin-airfoil theory on the free stream, K·(t/c)²/β on
         the fin's area (K from the section: finK). While the leading edge is swept behind the Mach line (β < tan Λ)
         the drag stays at the value it has when the Mach line reaches the edge, K·(t/c)²·cot Λ, and β is never taken
         under 0.4, where linear theory overshoots (the released model's floor). It rises from the section's
         drag-divergence Mach number to Mach 1.05, where Missile DATCOM's fin method also puts the full value. There
         is no separate transonic bump. Checked against the measured pressure drag of 45° untapered fins 2.8% thick
         (NASA TR R-100 figure 5: 0.0037 on the fin area from Mach 1.05 to 3; this gives 0.0046 falling to 0.0016)
         and the RM-10's 60° fins (NACA RM E50D28). */
      const tanL = Math.sqrt(Math.max(1 - c2, 0)) / Math.max(f.cosL, 1e-6),
        bEff = Math.max(Math.sqrt(Math.max(M * M - 1, 0)), tanL, 0.4),
        rise = smooth01((M - Mdd) / (1.05 - Mdd));
      /* Near Mach 1 thin-airfoil theory is too low for fins with little sweep: by transonic similarity the drag there
         goes as (t/c)^(5/3). The peak is 5.7·(t/c)^(5/3) times the fifth power of cos Λ / cos 30° (the released
         model's sweep rule), from the drag the Arcas model's 30° fins add (NASA TN D-4013, fins on minus fins off,
         less their friction: 0.03 on the fin area from Mach 0.95 to 1.05, back to the linear value by Mach 1.2);
         the 45° fins of TR R-100 figure 5 peak at 0.0055, and this gives 0.0057. Sweep past 30° also delays the
         rise (those 45° fins show none below Mach 0.97). The larger of the two terms is used.
         Both of those fins have about the same slenderness, aspect ratio × (t/c)^(1/3) = 0.54 and 0.61 (aspect
         ratio of two panels joined at the root, 2·span²/area). Transonic similarity theory makes the peak depend on
         that number: MIL-HDBK-762 figure 5-130 (rectangular fins) has peaks of 0.55, 1.15, 2.1, 2.65, 3.0 and 3.25
         times (t/c)^(5/3) at 0.25, 0.5, 1, 1.5, 2 and 3. The measurements run several times the chart's level, so
         only its trend is used: the peak is scaled by the chart's value over its value at 0.55, where it was
         measured. A stubby fin (aspect ratio 0.8, 3% thick) gets 0.4 of the peak, a long one (3, 5% thick) 1.7. */
      const lin = (rise * finK(f, Math.max(M, 1.05), bEff, cb2) * f.tc * f.tc) / bEff,
        peak =
          5.7 *
          Math.pow(Math.min(f.tc, 0.12), 5 / 3) *
          (tblAt(FIN_PEAK_AR, Math.min(((2 * f.s * f.s) / f.area) * Math.cbrt(Math.min(f.tc, 0.12)), 3)) /
            tblAt(FIN_PEAK_AR, 0.55)) *
          Math.pow(finSweepRatio(f.cosL), FIN_SWEEP_N) *
          smooth01((M - Math.min((Mdd - 0.03) / Math.sqrt(finSweepRatio(f.cosL)), 0.98)) / 0.09) *
          (M > 1.05 ? Math.exp(-(M - 1.05) / 0.2) : 1);
      pressure += (Math.max(lin, peak) * f.n * f.area) / S;
    } else {
      const beta = Math.max(Math.sqrt(Math.max(Mn * Mn - 1, 0)), 0.4),
        kS = Math.pow(finSweepRatio(f.cosL), FIN_SWEEP_N),
        subLE = kS + (1 - kS) * smooth01((Mn - 1) / 0.1); // a subsonic leading edge weakens it (see finTransonicCd)
      pressure += (((trF * subLE * finK(f, Mn, beta, cb2) * f.tc * f.tc) / beta) * c2 * f.n * f.area) / S;
    }
    if (!tm && !finBlunt(f.edge)) pressure += (finTransonicCd(M, f.tc, f.cosL) * f.n * f.area) / S;
  }
  // pods and side boosters: each copy's skin friction (with its own form factor), nose and transition pressure drag, and base
  for (const pd of A.pods || []) {
    const trP = transonic(mEq(M, pd.L / (2 * pd.R)));
    let fr = 0;
    for (const sg of pd.segs) fr += plateCf((v * pd.L) / nu, pd.L, sg.rs, M, A.blMode, vd) * sg.wet;
    friction += (pd.k * fr * pd.ffBody) / S;
    for (const it of pd.fore) {
      let cd;
      if (it.step) cd = 0.8 * q0;
      else if (it.nose) {
        cd = Math.max(it.sub, noseCdTR100(it.nose.shape, it.nose.param, mEq(M, it.nose.fin)) * it.nose.scale);
        if (M > 4) cd = mix(cd, stagCp(M) * it.kN, smooth01((M - 4) / 2));
      } else {
        const wave = (m) => (it.blunt ? stagCp(m) * it.kN : bonneyCd(m, it.sig));
        cd = M < 1 ? (1 - trP) * it.sub + trP * wave(1) : wave(M);
      }
      pressure += (pd.k * cd * it.area) / S;
    }
    for (const it of pd.aft) base += (pd.k * it.k * cb * it.area) / S;
    base += (pd.k * cb * pd.baseArea) / S;
  }
  // tube fins (OpenRocket's TubeFinSetCalc): friction on each tube's outside; the flow through it (Darcy–Weisbach, with the
  // Swamee–Jain friction factor); 0.7 of the stagnation and base pressure on its front face; and both on the gap at the body
  for (const t of A.tubeFins || []) {
    if (t.cdo > 0) {
      ovr += t.cdo;
      continue;
    }
    friction += (t.n * plateCf((v * t.c) / nu, t.c, t.rs, M, A.blMode, vd) * t.wet) / S;
    let inner = 0;
    if (t.inner > 1e-10) {
      const Re = Math.max((v * 2 * t.ri) / nu, 1),
        fd = 0.25 / Math.log10((t.rs || 0) / (3.7 * 2 * t.ri) + 5.74 / Math.pow(Re, 0.9)) ** 2;
      inner = ((fd * t.c) / (2 * t.ri)) * t.inner;
    }
    pressure += (t.n * (inner + 0.7 * (q0 + cb) * t.front + (q0 + cb) * t.gap)) / S;
  }
  for (const bt of A.buttons)
    if (bt.cdo > 0) ovr += bt.cdo;
    else pressure += (cylinderCd(M) * blFactor(bt.h, bt.x, v, nu) * bt.front) / S;
  for (const b of A.bumps || []) if (!b.fly) pressure += (bumpCd(b, M) * blFactor(b.h, b.x, v, nu) * b.front) / S; // a fly-away guide is gone in flight
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
export function finLiftRatio(f, M) {
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
export function cnaPartsM(A, M) {
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
export function rollPartsM(A, M) {
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
      rf = f.rb != null ? f.rb : radiusAt(A, xb + a / 2);
    const fm = finLiftRatio(f, M),
      cnf = (((1 + rf / (s + rf)) * (4 * n * (s / d) ** 2)) / (1 + Math.sqrt(1 + f.cnX ** 2))) * fm.k * (f.kff || 1);
    parts.push({ cn: cnf, x: xb + f.xcp + fm.dx, fin: true });
  }
  parts.push(...extraCnParts(A, M));
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
    const rf = f.rb != null ? f.rb : radiusAt(A, f.xLead + f.a / 2),
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
  // tube fins: each tube's lift, at its distance from the axis, resists the spin as OpenRocket's model has it
  for (const t of A.tubeFins || []) damp += t.n * t.cna1 * (t.rb + t.ro) ** 2;
  return { force, damp };
}
/* the static center of pressure, as a wind tunnel measures it: from the slope of the normal force and pitching moment over
   small angles (±2°), not at exactly 0°. Over that range the body's lift across the flow, K·(planform/reference area)·
   sin α·|sin α|, adds a slope of K·(planform/reference area)·¾·2° acting at the middle of the side outline. Barrowman
   leaves it out. Against the Arcas sounding rocket's measured center of pressure (NASA TN D-4013, Mach 0.6–0.9, two body
   lengths, and TN D-4014, Mach 1.5–4.6), including it brings the error from 3.0% to 2.3% of body length overall (below
   Mach 1, where Barrowman sits aft of the measurements, from 3.6% to 2.5%; above, from 1.5% to 1.8%). It matters most on
   long, thin rockets, and moves their CP forward: the margins it gives are a little lower and safer. */
const STATIC_AOA = (2 * Math.PI) / 180;
/* how far off the static CP estimate may be, as one standard deviation in body lengths: the RMS error of the center of
   pressure against the Arcas measurements above (2.3% of body length). The margin's uncertainty margin is ± this. */
export const CP_UNC = 0.023;
/**
 * Adds the body's small-angle lift (see above) to a normal-force slope and where it acts.
 * @param {object} A aerodynamic model
 * @param {number} cn normal-force slope without it (per radian)
 * @param {number} cp where that acts, m from the nose tip
 * @returns {number} the center of pressure with it, m from the nose tip
 */
export function cpWithBodyLift(A, cn, cp) {
  const add = ((CROSS_K * (A.sideArea || 0)) / A.Aref) * 0.75 * STATIC_AOA;
  return cn + add > 0 && A.xPlan != null ? (cn * cp + add * A.xPlan) / (cn + add) : cp;
}
/**
 * Static center of pressure at low speed: Barrowman's method and the body's small-angle lift.
 * @param {object} A aerodynamic model
 * @returns {number} m from the nose tip
 */
export function cpOf(A) {
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
      rf = f.rb != null ? f.rb : radiusAt(A, xb + a / 2);
    const cnf = (((1 + rf / (s + rf)) * (4 * n * (s / d) ** 2)) / (1 + Math.sqrt(1 + f.cnX ** 2))) * (f.kff || 1);
    const xf = xb + f.xcp;
    CN += cnf;
    CNx += cnf * xf;
  }
  for (const p of extraCnParts(A, 0)) {
    CN += p.cn;
    CNx += p.cn * p.x;
  }
  return CN > 0 ? cpWithBodyLift(A, CN, CNx / CN) : A.L / 2;
}
/** body lift across the flow: CN = K·(planform area / reference area)·sin²α, with Galejs's K = 1.1 (as OpenRocket
    uses; the Allen–Perkins cylinder value η·Cdc ≈ 0.78 moves the CP forward less as the rocket tilts) */
export const CROSS_K = 1.1;
/**
 * The center of pressure at an angle of attack, as the flight works it out: Barrowman's normal force (sin α·cos α)
 * plus the body's crossflow lift (sin²α), which acts at the middle of the body's side outline. On a long rocket that's
 * ahead of the Barrowman CP, so the CP moves forward as the rocket tilts. Below the fins' stall (about 18°).
 * @param {object} A aerodynamic model
 * @param {number} deg angle of attack, degrees
 * @param {number} [M] Mach number
 * @returns {number} m from the nose tip
 */
export function cpAtAoA(A, deg, M = 0) {
  const C = cnaPartsM(A, M),
    a = (deg * Math.PI) / 180,
    lin = C.cn * Math.sin(a) * Math.cos(a),
    x = ((CROSS_K * A.sideArea) / A.Aref) * Math.sin(a) ** 2;
  return lin + x > 0 ? (lin * C.cp + x * A.xPlan) / (lin + x) : C.cp;
}
/**
 * Normal force at an angle of attack (nose into the flow, 0–90°), as the flight works it out: Barrowman's slope
 * (sin α·cos α), the fins stalling from 18° to 35° (their linear lift fading to 60%) and then acting as flat plates
 * across the flow (Hoerner, Cd ≈ 1.17 on 2/π of their area), and the body's crossflow lift (Allen–Perkins, K·sin²α).
 * @param {object} A aerodynamic model
 * @param {number} M Mach number
 * @param {number} deg angle of attack, degrees
 * @returns {{cn:number, cnBody:number, cnFins:number, cp:number}} normal-force coefficients on A.Aref, and where the
 *   total acts (m from the nose tip)
 */
export function normalForceAt(A, M, deg) {
  const C = cnaPartsM(A, M),
    al = (deg * Math.PI) / 180,
    sa = Math.sin(al),
    ca = Math.cos(al),
    ks = deg <= 18 ? 1 : deg >= 35 ? 0.6 : 1 - 0.4 * smooth01((deg - 18) / 17),
    cnB = C.cn - C.cnFin,
    linB = cnB * sa * Math.abs(ca),
    linF = ks * C.cnFin * sa * Math.abs(ca),
    cnX = ((CROSS_K * A.sideArea) / A.Aref) * sa * sa,
    cnXf =
      deg <= 18
        ? 0
        : ((smooth01((deg - 18) / 17) * 1.17 * (2 / Math.PI) * A.fins.reduce((t, f) => t + f.n * f.area, 0)) / A.Aref) *
          sa *
          sa,
    xFin = C.cnFin > 0 ? C.momFin / C.cnFin : A.L,
    xB = cnB > 0 ? (C.cn * C.cp - C.momFin) / cnB : C.cp,
    cn = linB + linF + cnX + cnXf;
  return {
    cn,
    cnBody: linB + cnX,
    cnFins: linF + cnXf,
    cp: cn > 0 ? (linB * xB + linF * xFin + cnX * A.xPlan + cnXf * xFin) / cn : C.cp,
  };
}
/**
 * How well the rocket damps its own wobble: the damping ratio of its pitch oscillation and the oscillation's frequency
 * (Barrowman; Mandell, Caporaso & Bengen, Topics in Advanced Model Rocketry). The corrective moment coefficient is
 * C1 = ½ρV²·A·CNα·(Xcp − Xcg); the damping moment coefficient C2 = ½ρV·A·Σ CNα,i·(Xi − Xcg)² from the airflow, plus
 * ṁ·(Xnozzle − Xcg)² from the exhaust while the motor burns. Damping ratio ζ = C2 ÷ (2·√(C1·I)). The airflow part
 * doesn't change with speed (V cancels); the exhaust part adds most at low speed. About 0.05–0.3 is the usual guide:
 * below that the rocket keeps oscillating after a gust, above it it's slow to turn back.
 * @param {{cn:number, cp:number, parts:object[]}} C normal-force slopes and where they act (cnaParts)
 * @param {{cg:number, I:number, mdot?:number, xN?:number}} J CG (m from the nose tip), pitch inertia (kg·m²),
 *   propellant burn rate (kg/s) and nozzle position (m)
 * @param {number} rho air density, kg/m³
 * @param {number} v airspeed, m/s
 * @param {number} Aref reference area, m²
 * @returns {{zeta:number, hz:number}|null} null when the rocket isn't statically stable
 */
export function pitchDamping(C, J, rho, v, Aref) {
  const C1 = 0.5 * rho * v * v * Aref * C.cn * (C.cp - J.cg);
  if (!(C1 > 0) || !(J.I > 0)) return null;
  const C2 =
    0.5 * rho * v * Aref * C.parts.reduce((a, p) => a + p.cn * (p.x - J.cg) ** 2, 0) +
    (J.mdot || 0) * ((J.xN ?? J.cg) - J.cg) ** 2;
  return { zeta: C2 / (2 * Math.sqrt(C1 * J.I)), hz: Math.sqrt(C1 / J.I) / (2 * Math.PI) };
}
/**
 * Static stability with a motor: the center of pressure, the CG at liftoff and at burnout, and the margins.
 * @param {object} D design
 * @param {object} m motor (with len, totalMass, propMass)
 * @returns {{cp:number, cgL:number, cgB:number, marginL:number, marginB:number}} positions in m from the nose tip;
 *   margins in calibers (body diameters)
 */
export function stability(D, m) {
  const A = aero(D),
    d = 2 * A.R,
    cp = cpOf(A);
  const mx = (D.mountAft ?? D.length) + D.motorOverhang - m.len / 2;
  const cgL = (D.dryMass * D.cgEmpty + m.totalMass * mx) / (D.dryMass + m.totalMass);
  const mb = m.totalMass - m.propMass;
  const cgB = (D.dryMass * D.cgEmpty + mb * mx) / (D.dryMass + mb);
  return {
    cp,
    cgL,
    cgB,
    marginL: (cp - cgL) / d,
    marginB: (cp - cgB) / d,
    marginL5: (cpAtAoA(A, 5) - cgL) / d,
    marginL10: (cpAtAoA(A, 10) - cgL) / d,
    pctL: ((cp - cgL) / A.L) * 100,
    unc: (CP_UNC * A.L) / d,
    d,
    L: A.L,
  };
}
