/**
 * The drag model switch: "released" (the model every build so far has shipped) or "test" (a second model, built term
 * by term from public sources so the two can be compared on the same rocket, motor and air).
 *
 * The test model follows the method choices recorded in the Missile DATCOM final report (Vukelich et al., AFWAL-TR-86-3091
 * Volume I, 1988; approved for public release) and the NACA and NASA reports it relies on. Terms move over one at a
 * time; any term not yet moved is computed exactly as the released model computes it. The terms moved so far:
 *
 *   1. Skin friction compressibility: Van Driest II (below), in place of the released (1 + 0.144 M²)^−0.65, at the
 *      skin's own temperature. A flight follows the skin as it heats (skinStep below); with no flight history (the
 *      Wind Tunnel, the validation cases) the skin is taken as fully heated, as in a wind tunnel run.
 *   2. Body base pressure: NASA TR R-100's flight-measured curve from Mach 0.5 to 2 (R100_BODY in aerodynamics.js),
 *      in place of Fleeman's correlation below Mach 1 and TN 3819's basic curve from 1 to 2. Above Mach 2, and for
 *      the boattail and fin corrections and fin trailing edges, TN 3819 as released.
 *   3. Nose wave drag above Mach 2: second-order shock-expansion (NACA Report 1328) from the exact cone solution, in
 *      place of the released curves' extension and Newtonian blend (noseCdSE in aerodynamics.js).
 *   4. Boattails above Mach 1: TR R-100's equation 1, a wave drag term the released model doesn't have and its
 *      base-diameter-ratio rule for the base pressure, in place of TN 3819's boattail correction.
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
   recovery factor r = 0.89, viscosity exponent n = 0.76. Tw is the wall (skin) temperature, Te the air's.
   The Missile DATCOM final report (section 3.1.1.1) chose this method for turbulent boundary layers at all speeds
   because it "includes the effects of wall temperature, Mach number, Reynolds number, and surface roughness".
   Only the ratio to the incompressible value is used here, applied to the released model's smooth and rough
   flat-plate friction, so this term changes the Mach number and wall temperature effects and nothing else.
   The wall temperature runs from the air's (a skin that has had no time to heat: Tw/Te = 1) to the adiabatic wall
   temperature Te·(1 + r·m), which a skin reaches when it has been at speed long enough (a wind tunnel model). The
   ratio is tabulated against how far the skin has got between the two, θ = (Tw − Te)/(Taw − Te), held to 0–1: a
   skin hotter than the adiabatic wall (a rocket slowing down after a fast burn) counts as fully heated. */
/** Turbulent recovery factor: the adiabatic wall is at Te·(1 + VD_R·0.2·M²). */
export const VD_R = 0.89;
const VD_N = 0.76;
/**
 * Mean flat-plate skin friction by Van Driest II, solved for Cf by bisection.
 * @param {number} M Mach number
 * @param {number} Re Reynolds number on the plate's length
 * @param {number} F wall over air temperature, Tw/Te
 * @returns {number} Cf
 */
function vanDriestCf(M, Re, F) {
  const m = 0.2 * M * M;
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
/* The ratio is tabulated once, on Mach 0–12 every 0.1, log10(Re) 3–10 every 0.25 and θ = 0, ¼, ½, ¾, 1, and read by
   linear interpolation: solving at every call would be too slow inside a flight. */
const VD_M = 0.1,
  VD_LR0 = 3,
  VD_LR = 0.25,
  VD_NM = 121,
  VD_NR = 29,
  VD_NT = 5;
let vdTable = null;
/**
 * Fills the Van Driest II ratio table.
 * @returns {Float64Array}
 */
function vdBuild() {
  const t = new Float64Array(VD_NM * VD_NR * VD_NT);
  for (let j = 0; j < VD_NR; j++) {
    const Re = Math.pow(10, VD_LR0 + j * VD_LR),
      c0 = vanDriestCf(0, Re, 1);
    for (let i = 0; i < VD_NM; i++) {
      const M = i * VD_M,
        rm = VD_R * 0.2 * M * M;
      for (let k = 0; k < VD_NT; k++)
        t[(i * VD_NR + j) * VD_NT + k] = vanDriestCf(M, Re, 1 + (k / (VD_NT - 1)) * rm) / c0;
    }
  }
  return t;
}
/**
 * Compressible over incompressible turbulent skin friction (Van Driest II) at a wall temperature.
 * @param {number} M Mach number
 * @param {number} Re Reynolds number on the surface's length
 * @param {number} [F] wall over air temperature, Tw/Te; left out, the adiabatic wall (a fully heated skin)
 * @returns {number} a factor below 1, falling with Mach number; a cooler wall gives more friction
 */
export function vanDriestRatio(M, Re, F) {
  if (!vdTable) vdTable = vdBuild();
  const rm = VD_R * 0.2 * M * M,
    th = F > 0 && rm > 1e-9 ? Math.min(Math.max((F - 1) / rm, 0), 1) : 1,
    x = Math.min(Math.max(M / VD_M, 0), VD_NM - 1.000001),
    y = Math.min(Math.max((Math.log10(Math.max(Re, 1)) - VD_LR0) / VD_LR, 0), VD_NR - 1.000001),
    z = Math.min(th * (VD_NT - 1), VD_NT - 1.000001),
    i = Math.floor(x),
    j = Math.floor(y),
    k = Math.floor(z),
    u = x - i,
    w = y - j,
    q = z - k,
    t = vdTable,
    at = (ii, jj, kk) => t[(ii * VD_NR + jj) * VD_NT + kk],
    plane = (kk) =>
      (at(i, j, kk) * (1 - u) + at(i + 1, j, kk) * u) * (1 - w) +
      (at(i, j + 1, kk) * (1 - u) + at(i + 1, j + 1, kk) * u) * w;
  return plane(k) * (1 - q) + plane(k + 1) * q;
}

/* ---------- the skin's temperature through a flight ----------
   The skin starts at the air temperature on the pad and is heated (or cooled) by the boundary layer at
     q = h·(Taw − Tw),   h = St·ρ·V·cp,   St = (Cf/2)·Pr^(−2/3)
   the Reynolds–Colburn analogy between friction and heat transfer for a turbulent boundary layer (any heat transfer
   text, e.g. Incropera and DeWitt, Fundamentals of Heat and Mass Transfer), with the same Cf the drag uses, Pr = 0.71
   and cp = 1005 J/kg·K for air, Taw the adiabatic wall temperature above.
   One temperature stands for the whole skin. The heat goes into a layer of the wall: all of it for a thin metal skin,
   but a composite, paper or plastic wall conducts so slowly that in a flight of seconds only its outer part warms.
   The depth that takes part is the one that stores the same heat for the same surface temperature rise as a thick
   solid heated at a steady rate (Carslaw and Jaeger, Conduction of Heat in Solids): √(π·α·t)/2 after a time t, α the
   wall's thermal diffusivity, up to the wall's own thickness. As the layer deepens the newly reached material, still
   at the pad temperature, is mixed in.
   What this leaves out: the motor's heat from inside, radiation, the fins' thinner sections and the much hotter
   stagnation regions at the nose tip and fin leading edges. It is the temperature the friction sees, averaged over
   the skin, not a check on what the airframe survives. */
const AIR_CP = 1005,
  PR23 = Math.pow(0.71, -2 / 3);
/**
 * A wall material's heat capacity and thermal diffusivity from its density, by class: the builder's materials carry
 * a density only. Typical handbook values, rounded: steel and titanium; aluminium; fiberglass and carbon laminates
 * (through the thickness); paper, phenolic, wood and plastics.
 * @param {number} rho density, kg/m³
 * @returns {{c:number, alpha:number}} specific heat J/kg·K, diffusivity m²/s
 */
export function wallThermal(rho) {
  if (rho >= 3500) return { c: 500, alpha: 7e-6 };
  if (rho >= 2400) return { c: 900, alpha: 6e-5 };
  if (rho >= 1400) return { c: 1050, alpha: 2.5e-7 };
  return { c: 1400, alpha: 1.2e-7 };
}
/**
 * Advances the skin temperature over one time step of a flight.
 * @param {{T:number, d:number}} sk the skin's state: temperature (K) and the depth of wall taking part (m); changed in place
 * @param {{t:number, rhoC:number, alpha:number}} wall the airframe's wall: thickness m, heat capacity per volume
 *   J/m³·K, diffusivity m²/s (A.skin from aero())
 * @param {number} T0 the temperature the wall started at, K
 * @param {number} time seconds since liftoff, at the end of the step
 * @param {number} dt the step, s
 * @param {number} h heat transfer coefficient, W/m²·K
 * @param {number} Taw adiabatic wall temperature, K
 */
export function skinStep(sk, wall, T0, time, dt, h, Taw) {
  const d = Math.min(wall.t, Math.max(Math.sqrt(Math.PI * wall.alpha * Math.max(time, 0)) / 2, 1e-4));
  if (d > sk.d) {
    sk.T = (sk.T * sk.d + T0 * (d - sk.d)) / d; // material newly reached is still at the starting temperature
    sk.d = d;
  }
  // exact for a constant h and Taw over the step, so it can't overshoot whatever the step
  sk.T = Taw + (sk.T - Taw) * Math.exp((-h * dt) / (wall.rhoC * sk.d));
}
/**
 * Heat transfer coefficient from a friction coefficient (Reynolds–Colburn analogy).
 * @param {number} cf skin friction coefficient
 * @param {number} rho air density, kg/m³
 * @param {number} v airspeed, m/s
 * @returns {number} W/m²·K
 */
export const heatCoef = (cf, rho, v) => (cf / 2) * PR23 * rho * v * AIR_CP;
