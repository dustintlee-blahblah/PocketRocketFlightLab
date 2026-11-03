/**
 * Unit constants (inch, foot, pound in SI) and the fin edge types with their drag helpers.
 */
const IN = 0.0254,
  FT = 0.3048,
  LB = 0.45359237;
/* fin edge (cross-section) types. Square and rounded edges are blunt; the rest have sharp edges. Supersonic wave drag of a
   thin sharp-edged section from linear theory, Cd = K·(t/c)²/β with K from its slopes (Ackeret: K = 4/c·∫(dy/dx)²dx·c²/t²):
   double wedge (diamond) K = 4; biconvex (circular-arc) airfoil K = 16/3; a flat plate beveled over 20% of the chord at
   each edge K = 2/0.2 = 10. Below Mach 1 the sharp types are all streamlined: no leading-edge or trailing-edge base drag. */
/* the fins' transonic drag rise. Thin-airfoil theory only applies once the flow is fully supersonic; between about Mach 0.85
   and 1.5 shocks stand on the fin surfaces and the drag of a fin set rises far above it. NASA wind-tunnel data for the
   Arcas sounding rocket (TN D-4013, fins on against fins off, two body lengths; TN D-4014 above Mach 1.5) shows the four
   double-wedge fins' drag rising by about 0.29 (on the body's reference area) from Mach 0.85 to a peak just past Mach 1,
   then falling back by Mach 1.3 with a tail that fades out by about Mach 3. Per unit fin planform area that is
   finTransonicCd, scaled with thickness by transonic similarity (wave drag ∝ (t/c)^(5/3), von Kármán) from the Arcas
   fins' 4.3%. Nothing changes below Mach 0.85. This is for sharp-edged sections (airfoil, beveled, double wedge), the
   kind measured: square and rounded edges have their own blunt-edge drag model above, which already rises through Mach 1,
   and adding this to them would count the same shocks twice.
   Sweeping the leading edge back delays and weakens the rise. By simple sweep theory the shocks follow the Mach number
   normal to the leading edge, M·cos Λ (Λ = leading-edge sweep), so the Mach number is scaled by r = cos Λ / cos 30°
   (1 for the Arcas fins' 30°, and for anything swept less). The rise also weakens faster than the infinite swept wing's
   cos³Λ, as low-aspect-ratio fins relieve the flow around their tips: it is scaled by r⁵, fitted to the RM-10 missile's
   60°-swept, 10%-thick fins (NACA RM E50D28, Mach 1.49–1.98: the fins add 0.09–0.10 to the drag, about half of it skin
   friction). That keeps the Arcas calibration as it was, and leaves almost nothing for fins swept 70° or more, as measured
   on NASA TM X-653's 70° fins (Mach 0.6–5.8) and NACA RM A53D02's 72° fins (free flight, Mach 0.6–10, no rise between
   Mach 1.3 and 3). The supersonic thin-airfoil term below gets the same r⁵ while the leading edge is subsonic
   (M·cos Λ < 1) and its full value once it is supersonic. Between 30° and 60° the scaling is interpolated, not measured.
   The tests/drag-benchmarks.js script checks these cases. */
/**
 * Added transonic drag of a sharp-edged fin set, per unit fin planform area (see the notes above).
 * @param {number} M free-stream Mach number
 * @param {number} tc fin thickness-to-chord ratio (capped at 12%)
 * @param {number} [cosL=1] cosine of the leading-edge sweep angle
 * @returns {number} drag coefficient on fin planform area (0 below Mach 0.85)
 */
function finTransonicCd(M, tc, cosL = 1) {
  const r = finSweepRatio(cosL);
  M *= r;
  if (M <= 0.85 || !(tc > 0)) return 0;
  const g =
    M < 1.02 ? smooth01((M - 0.85) / 0.15) : 0.75 * Math.exp(-(M - 1.02) / 0.2) + 0.25 * Math.exp(-(M - 1.02) / 0.8);
  return 9.36 * Math.pow(Math.min(tc, 0.12), 5 / 3) * g * Math.pow(r, FIN_SWEEP_N);
}
/**
 * FIN_SWEEP_N: the power of the sweep ratio that weakens the fins' transonic drag rise (see the notes above).
 * finSweepRatio: cos Λ / cos 30°, at most 1.
 */
var FIN_SWEEP_N = 5;
const finSweepRatio = (cosL) => Math.min(1, Math.max(cosL, 0) / 0.866);
/**
 * Fin edge profiles offered in the forms: [value, label].
 */
const FIN_EDGES = [
  ["square", "Square"],
  ["rounded", "Rounded"],
  ["airfoil", "Airfoil (streamlined)"],
  ["beveled", "Beveled (tapered leading and trailing edges)"],
  ["doublewedge", "Double wedge (diamond)"],
];
/**
 * Wave-drag constant K of a sharp edge type in Cd = K·(t/c)²/β (double wedge 4, beveled 10, airfoil 16/3).
 * @param {string} e edge type
 * @returns {number}
 */
const finWaveK = (e) => (e === "doublewedge" ? 4 : e === "beveled" ? 10 : 16 / 3);
/**
 * True for the blunt edge types (square, rounded), which use the blunt-edge drag model.
 * @param {string} e edge type
 * @returns {boolean}
 */
const finBlunt = (e) => e === "square" || e === "rounded";
