/**
 * The drag model switch: "released" (the model every build so far has shipped) or "test" (a second model, built term
 * by term from public sources so the two can be compared on the same rocket, motor and air).
 *
 * The test model follows the method choices recorded in the Missile DATCOM final report (Vukelich et al., AFWAL-TR-86-3091
 * Volume I, 1988; approved for public release) and the NACA and NASA reports it relies on. Terms move over one at a
 * time; any term not yet moved is computed exactly as the released model computes it. The terms moved so far:
 *
 *   1. Skin friction compressibility: Van Driest II (below), in place of the released (1 + 0.144 M²)^−0.65.
 *
 * cdParts() in aerodynamics.js reads the setting; the Wind Tunnel asks for both models by name to draw them together.
 */

/** The drag model the flight uses: "released" or "test". */
export let dragModel = "released";
/**
 * Chooses the drag model.
 * @param {string} m "released" or "test"; anything else means "released"
 */
export function setDragModel(m) {
  dragModel = m === "test" ? "test" : "released";
}

/* ---------- Van Driest II: compressible turbulent skin friction ----------
   Van Driest, E. R., "Turbulent Boundary Layer in Compressible Fluids", J. Aeronautical Sciences 18 (March 1951),
   pp. 145–160, in the mean-friction form built on the Kármán–Schoenherr law (0.242/√Cf = log10(Re·Cf) when
   incompressible):
     0.242 (sin⁻¹α + sin⁻¹β) / (A √(Cf·Tw/Te)) = log10(Re·Cf) − ((1 + 2n)/2) log10(Tw/Te)
   with m = (γ − 1)/2·M², A = √(r·m·Te/Tw), B = (1 + r·m − Tw/Te)·Te/Tw, α = (2A² − B)/√(B² + 4A²), β = B/√(B² + 4A²),
   recovery factor r = 0.89, viscosity exponent n = 0.76.
   The Missile DATCOM final report (section 3.1.1.1) chose this method for turbulent boundary layers at all speeds, and
   its code takes the wall at the free-stream temperature ("In the computer code the free stream temperature is used as
   the wall temperature"). A hobby rocket's skin is in the air for seconds and has the heat capacity to stay near the
   ambient temperature, so the test model does the same: Tw/Te = 1.
   Only the ratio to the incompressible value is used here, applied to the released model's smooth and rough
   flat-plate friction, so this term changes the Mach number effect and nothing else. */
const VD_R = 0.89,
  VD_N = 0.76,
  VD_TW = 1; // wall over free-stream temperature (Missile DATCOM's choice)
/**
 * Mean flat-plate skin friction by Van Driest II, solved for Cf by bisection.
 * @param {number} M Mach number
 * @param {number} Re Reynolds number on the plate's length
 * @returns {number} Cf
 */
function vanDriestCf(M, Re) {
  const m = 0.2 * M * M,
    F = VD_TW;
  let f;
  if (m < 1e-4) f = (cf) => 0.242 / Math.sqrt(cf) - Math.log10(Re * cf);
  else {
    const A = Math.sqrt((VD_R * m) / F),
      B = (1 + VD_R * m - F) / F,
      den = Math.sqrt(B * B + 4 * A * A),
      S = Math.asin((2 * A * A - B) / den) + Math.asin(B / den),
      tw = ((1 + 2 * VD_N) / 2) * Math.log10(F);
    f = (cf) => (0.242 * S) / (A * Math.sqrt(cf * F)) - Math.log10(Re * cf) + tw;
  }
  let lo = 1e-5,
    hi = 0.05;
  for (let i = 0; i < 60; i++) {
    const c = (lo + hi) / 2;
    if (f(c) > 0) lo = c;
    else hi = c;
  }
  return (lo + hi) / 2;
}
/* The ratio is tabulated once, on Mach 0–12 every 0.1 and log10(Re) 3–10 every 0.25, and read by bilinear
   interpolation: solving at every call would be too slow inside a flight. */
const VD_M = 0.1,
  VD_LR0 = 3,
  VD_LR = 0.25,
  VD_NM = 121,
  VD_NR = 29;
let vdTable = null;
/**
 * Fills the Van Driest II ratio table.
 * @returns {Float64Array}
 */
function vdBuild() {
  const t = new Float64Array(VD_NM * VD_NR);
  for (let j = 0; j < VD_NR; j++) {
    const Re = Math.pow(10, VD_LR0 + j * VD_LR),
      c0 = vanDriestCf(0, Re);
    for (let i = 0; i < VD_NM; i++) t[i * VD_NR + j] = vanDriestCf(i * VD_M, Re) / c0;
  }
  return t;
}
/**
 * Compressible over incompressible turbulent skin friction (Van Driest II, wall at free-stream temperature).
 * @param {number} M Mach number
 * @param {number} Re Reynolds number on the surface's length
 * @returns {number} a factor below 1, falling with Mach number
 */
export function vanDriestRatio(M, Re) {
  if (!vdTable) vdTable = vdBuild();
  const x = Math.min(Math.max(M / VD_M, 0), VD_NM - 1.000001),
    y = Math.min(Math.max((Math.log10(Math.max(Re, 1)) - VD_LR0) / VD_LR, 0), VD_NR - 1.000001),
    i = Math.floor(x),
    j = Math.floor(y),
    u = x - i,
    w = y - j,
    t = vdTable,
    a = t[i * VD_NR + j],
    b = t[(i + 1) * VD_NR + j],
    c = t[i * VD_NR + j + 1],
    d = t[(i + 1) * VD_NR + j + 1];
  return (a * (1 - u) + b * u) * (1 - w) + (c * (1 - u) + d * u) * w;
}
