/**
 * Unit constants (inch, foot, pound in SI) and the fin edge types with their drag helpers.
 */
export const IN = 0.0254,
  FT = 0.3048,
  LB = 0.45359237;
/* fin edge (cross-section) types. Square and rounded edges are blunt; the rest have sharp edges. Supersonic wave drag of a
   thin sharp-edged section from linear theory, Cd = K·(t/c)²/β with K from its slopes (Ackeret: K = 4/c·∫(dy/dx)²dx·c²/t²):
   double wedge (diamond) K = 4; biconvex (circular-arc) airfoil K = 16/3; a flat plate beveled over 20% of the chord at
   each edge K = 2/0.2 = 10. Below Mach 1 the sharp types are all streamlined: no leading-edge or trailing-edge base drag. */
/* Sweeping a fin's leading edge back delays and weakens its transonic drag rise. By simple sweep theory the shocks
   follow the Mach number normal to the leading edge, M·cos Λ (Λ = leading-edge sweep), so the sweep ratio is
   r = cos Λ / cos 30° (1 for the Arcas sounding rocket's 30° fins, NASA TN D-4013, where the rise was measured, and
   for anything swept less). The rise also weakens faster than the infinite swept wing's cos³Λ, as low-aspect-ratio
   fins relieve the flow around their tips: it is scaled by r⁵, fitted to the RM-10 missile's 60°-swept, 10%-thick
   fins (NACA RM E50D28, Mach 1.49–1.98: the fins add 0.09–0.10 to the drag, about half of it skin friction). That
   leaves almost nothing for fins swept 70° or more, as measured on NASA TM X-653's 70° fins (Mach 0.6–5.8) and NACA
   RM A53D02's 72° fins (free flight, Mach 0.6–10, no rise between Mach 1.3 and 3). Between 30° and 60° the scaling
   is interpolated, not measured. cdParts() in aerodynamics.js uses it for the sharp-edged fins' transonic peak; the
   tests/drag-benchmarks.js script checks these cases. */
/**
 * FIN_SWEEP_N: the power of the sweep ratio that weakens the fins' transonic drag rise (see the note above).
 * finSweepRatio: cos Λ / cos 30°, at most 1.
 */
export var FIN_SWEEP_N = 5;
export const finSweepRatio = (cosL) => Math.min(1, Math.max(cosL, 0) / 0.866);
/**
 * Fin edge profiles offered in the forms: [value, label].
 */
export const FIN_EDGES = [
  ["square", "Square"],
  ["rounded", "Rounded"],
  ["airfoil", "Airfoil (streamlined)"],
  ["beveled", "Beveled (tapered leading and trailing edges)"],
  ["doublewedge", "Double wedge (diamond)"],
];
/**
 * Trailing edges that can be set apart from the fin's section: [value, label]. "" means the trailing edge is the
 * section's own (a square fin's is square, an airfoil's sharp).
 */
export const FIN_TE_EDGES = [
  ["", "Same as the leading edge"],
  ["square", "Square"],
  ["rounded", "Rounded"],
  ["sharp", "Tapered to a sharp edge"],
];
/**
 * A trailing edge value from a file or a saved design, or "" (the section's own) if it isn't one of FIN_TE_EDGES.
 * @param {string} e
 * @returns {string}
 */
export const finTeEdge = (e) => (e && FIN_TE_EDGES.some((x) => x[0] === e) ? e : "");
/**
 * Wave-drag constant K of a sharp edge type in Cd = K·(t/c)²/β (double wedge 4, beveled 10, airfoil 16/3).
 * @param {string} e edge type
 * @returns {number}
 */
export const finWaveK = (e) => (e === "doublewedge" ? 4 : e === "beveled" ? 10 : 16 / 3);
/**
 * The share of a slab (chord × thickness) a fin's cross-section fills, from its edges, for its weight. Each end of the
 * section takes away what it shapes off the slab:
 *   - square: nothing;
 *   - rounded (a half-round end): t²/2 − πt²/8 = (4 − π)/8·t²;
 *   - beveled or tapered to a sharp edge over a length b: the two wedges cut off, b·t/2;
 * and two whole sections:
 *   - double wedge: ½;
 *   - airfoil: ⅔, the biconvex (parabolic-arc) section its wave drag K = 16/3 stands for (finWaveK).
 * A bevel with no length given is 20% of the chord, the drag model's default. A leading-edge radius on a sharp section
 * adds back a sliver (under 1% of a fin) and is left out.
 * @param {string} edge the section (FIN_EDGES)
 * @param {string} edgeTE the trailing edge set apart from it ("" for the section's own)
 * @param {number} t thickness, m
 * @param {number} c mean chord, m
 * @param {number} [bevLE] leading bevel length, m
 * @param {number} [bevTE] trailing bevel length, m
 * @returns {number} 0.5 to 1
 */
export function finSectionShare(edge, edgeTE, t, c, bevLE = 0, bevTE = 0) {
  if (!(t > 0) || !(c > 0)) return 1;
  if (edge === "doublewedge" && !edgeTE) return 0.5;
  if (edge === "airfoil" && !edgeTE) return 2 / 3;
  const round = ((4 - Math.PI) / 8) * t * t,
    wedge = (b) => (Math.min(b > 0 ? b : 0.2 * c, c / 2) * t) / 2,
    end = (e, b) => (e === "rounded" ? round : e === "beveled" || e === "sharp" ? wedge(b) : 0);
  // a sharp section (airfoil, double wedge) with its own trailing edge: its front half as the section, its back as set
  const front = edge === "airfoil" ? (t * c) / 6 : edge === "doublewedge" ? (t * c) / 4 : end(edge, bevLE),
    te = edgeTE || (edge === "beveled" ? "beveled" : edge === "airfoil" || edge === "doublewedge" ? "sharp" : edge),
    back = end(te, te === "beveled" || te === "sharp" ? bevTE : 0);
  return Math.max(0.5, 1 - (front + back) / (t * c));
}
