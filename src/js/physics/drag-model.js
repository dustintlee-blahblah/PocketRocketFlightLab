/**
 * The parts of the drag model that have their own machinery: Van Driest II skin friction, and the skin temperature a
 * flight follows for it. The rest of the model is in aerodynamics.js (cdParts).
 *
 * The model follows the method choices recorded in the Missile DATCOM final report (Vukelich et al.,
 * AFWAL-TR-86-3091 Volume I, 1988; approved for public release) and the NACA and NASA reports it relies on. It
 * replaced the model of builds up to 287 in build 288 (the two could be switched in Settings until build 302; the
 * earlier model's code was removed in build 303). Where the code or saved data say "test", they mean this model: it
 * was the name it had while it was being built beside the earlier one, and a drag calibration saved since build 288
 * carries it (dm: "test"). What it changed from the earlier model:
 *
 *   1. Skin friction compressibility: Van Driest II (below), in place of (1 + 0.144 M²)^−0.65, at the skin's own
 *      temperature. A flight follows the skin as it heats (skinStep below); with no flight history (the Wind
 *      Tunnel, the validation cases) the skin is taken as fully heated, as in a wind tunnel run.
 *   2. Body base pressure: NASA TR R-100's flight-measured curve from Mach 0.5 to 2 (R100_BODY in aerodynamics.js),
 *      in place of Fleeman's correlation below Mach 1 and TN 3819's basic curve from 1 to 2. Above Mach 2, and for
 *      the fin correction and fin trailing edges, TN 3819.
 *   3. Nose wave drag above Mach 2: second-order shock-expansion (NACA Report 1328) from the exact cone solution
 *      (noseCdSE in aerodynamics.js), in place of the measured curves' extension and Newtonian blend.
 *   4. Boattails: TR R-100's equation 1, a wave drag term above Mach 1 and its base-diameter-ratio rule for the
 *      base pressure (at every speed), in place of TN 3819's boattail correction. The flow stays on boattails up
 *      to 15°, and the wave drag fades in from Mach 0.88 to 1 (NASA TN D-4013). From Mach 2.5 the wave drag is from
 *      wind-tunnel measurements instead (MIL-HDBK-762 figure 5-144).
 *   5. Wave drag of sharp-edged fins: linear theory for the fin's own outline and section by the supersonic area
 *      rule (finWave3D below; from build 342), in place of a normal-Mach form with a fitted sweep factor and a
 *      separate transonic bump. From build 288 to 341 it was thin-airfoil theory on the free-stream Mach number,
 *      held at its value where the Mach line reaches the leading edge while the edge is swept behind it. Checked
 *      against the wing drag measured in flight in NACA TN 3697, NASA TR R-100 figure 5 and NACA RM E50D28. Near Mach 1 a transonic peak, 5.7·(t/c)^(5/3) with the sweep factor
 *      fitted to the RM-10's fins, from the Arcas fins' measured drag (NASA TN D-4013), where it is the larger,
 *      scaled for the fin's aspect ratio by the trend of transonic similarity theory (MIL-HDBK-762 figure 5-130).
 */

/* ---------- Van Driest II: compressible turbulent skin friction ----------
   Van Driest, E. R., "The Problem of Aerodynamic Heating", Aeronautical Engineering Review 15 (October 1956),
   pp. 26–41, as a transformation of the incompressible law (Hopkins and Inouye, AIAA Journal 9, 1971, who found it
   the most reliable of the theories they tested; Hopkins, NASA TN D-6945): the compressible Cf times Fc, at the
   Reynolds number times Fθ/Fc, obeys the incompressible law, with Fc = r·m/(sin⁻¹α + sin⁻¹β)² and Fθ = μe/μw. On the
   Kármán–Schoenherr mean-friction law (0.242/√Cf = log10(Re·Cf) when incompressible) and a power-law viscosity:
     0.242 (sin⁻¹α + sin⁻¹β) / (A √(Cf·Tw/Te)) = log10(Re·Cf) − n·log10(Tw/Te)
   with m = (γ − 1)/2·M², A = √(r·m·Te/Tw), B = (1 + r·m − Tw/Te)·Te/Tw, α = (2A² − B)/√(B² + 4A²), β = B/√(B² + 4A²),
   recovery factor r = 0.89, viscosity exponent n = 0.76. Tw is the wall (skin) temperature, Te the air's.
   (Van Driest's earlier form, J. Aeronautical Sciences 18, 1951, has (1 + 2n)/2 in place of n on the right. The two
   agree on a cold wall; on a fully heated one the earlier form gives 7% more friction at Mach 3 and 17% more at Mach
   4.6. This file used the earlier form until the Arcas wind-tunnel drag at Mach 3 to 4.6 (NASA TN D-4014) and the
   friction chart of MIL-HDBK-762, figure 5-134, both showed it too high.)
   The Missile DATCOM final report (section 3.1.1.1) chose Van Driest II for turbulent boundary layers at all speeds
   because it "includes the effects of wall temperature, Mach number, Reynolds number, and surface roughness".
   Only the ratio to the incompressible value is used here, applied to the smooth and rough flat-plate
   friction (plateCf in aerodynamics.js), so this term changes the Mach number and wall temperature effects and nothing else.
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
      tw = VD_N * Math.log10(F);
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

/* ---------- wave drag of a sharp-edged fin, from its own outline and section ----------
   Linear (thin-wing) theory for a wing that carries no lift, worked out numerically by the supersonic area rule
   (Jones, Theory of Wing-Body Drag at Supersonic Speeds, NACA Report 1284, 1956): the wave drag is the average, over
   every angle a Mach plane can be turned about the flight direction, of the drag a slender body would have with the
   areas that plane cuts from the wing as it moves along it (von Kármán's slender-body drag, by its sine series).
   For a flat wing a plane at the angle θ from the wing's own plane cuts it along the lines x − β·cos θ·y = constant,
   β = √(M² − 1), so the areas are the wing's thickness summed along those lines.
   The fin is taken as one half of a wing whose other half is its mirror image in the root, the body acting as a wall
   there (how NACA TN 3697 applies the theory to wings on a body).
   What it reproduces (tests/drag-benchmarks.js): thin-airfoil theory for an unswept wing, K·(t/c)²/β, within 1%;
   the chart of NACA TN 1449 (Harmon, 1947: untapered swept wings with biconvex sections), within 3% away from its
   peak and 3% to 8% under at the peak itself, where the Mach line lies along the leading edge and the theory has a
   cusp that the sums here round off; and the drag that six swept, tapered wings with 6% double-wedge sections
   added in flight at Mach 1.1 to 1.7 (NACA TN 3697, Pittel, 1956): within about 0.002 on the wing area on the
   four of aspect ratio 2 and the pointed one of aspect ratio 4, and 0.003 to 0.007 under from Mach 1.2 to 1.5 on
   the two tapered wings of aspect ratio 4, where the report finds the same of the theory. The rule this replaced
   (thin-airfoil theory, held at its value where the Mach line reaches the leading edge while the edge is swept
   behind it) was flat where those wings' drag rises, up to 0.008 off.
   Where it is least sure: just past the Mach number that puts the Mach line on a swept leading edge. The RM-10's
   60° fins have about half the theory's wave drag from Mach 2 to 2.6, in a tunnel and in flight (NACA RM E50D28,
   RM L55H02), though thinner 45° fins measure above it at Mach 2.5 and 3 (AERODYNAMICS.md, gap 10).
   The sections: a double wedge and an airfoil (a biconvex arc, the K = 16/3 section) keep the fin's thickness ratio
   along the span; a beveled plate keeps its thickness and its bevels' lengths, and where the chord is shorter than
   the two bevels together they meet and the plate thins, the slopes staying as they are.
   Each fin shape's drag is worked out once per Mach number on a grid of β and kept (as CD·β, which changes slowly),
   so only the first flight after a fin is changed waits for it. */
const FW_NY = 60, // strips along the span
  FW_NTH = 40, // Mach-plane angles
  FW_NX = 360, // points along the cut
  FW_NH = 120, // terms of the sine series
  FW_B0 = 0.4, // β grid: 0.05 apart from 0.4 to 2, then 0.25 apart to 4; CD·β is held past 4
  FW_KEEP = 32; // fin shapes remembered
const FW_GRID = (() => {
  const g = [];
  for (let i = 0; i <= 32; i++) g.push(FW_B0 + 0.05 * i);
  for (let i = 1; i <= 8; i++) g.push(2 + 0.25 * i);
  return g;
})();
let fwSin = null;
const fwTables = new Map();
/**
 * The chord and leading edge of a fin outline at the middle of each of n strips along its span.
 * @param {number[][]} ol outline points [x back from the root's leading edge, y out from the root], m
 * @param {number} n strips
 * @returns {{st:{y:number, x:number, c:number}[], dy:number}}
 */
function fwStations(ol, n) {
  const span = Math.max(...ol.map((p) => p[1])),
    st = [];
  for (let j = 0; j < n; j++) {
    const y = ((j + 0.5) * span) / n;
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
    if (hi - lo > 1e-9) st.push({ y, x: lo, c: hi - lo });
  }
  return { st, dy: span / n };
}
/**
 * Wave drag coefficient of a fin by the area rule at one β (the comment above).
 * @param {number[][]} ol the fin's outline, m
 * @param {{kind:string, tc?:number, t?:number, le?:number, te?:number}} sec the section: kind "dw" (double wedge) or
 *   "bi" (biconvex) with the thickness ratio tc; or "hex" (a plate with beveled edges) with its thickness t and the
 *   bevels' lengths le and te, m
 * @param {number} beta √(M² − 1)
 * @returns {number} CD on the fin's own area (one side's planform)
 */
export function finWaveAt(ol, sec, beta) {
  const { st, dy } = fwStations(ol, FW_NY),
    ns = st.length,
    nx = FW_NX,
    nh = FW_NH,
    dphi = Math.PI / nx;
  if (!ns) return 0;
  if (!fwSin) {
    fwSin = new Float64Array(nh * nx);
    for (let n = 1; n <= nh; n++) for (let i = 0; i < nx; i++) fwSin[(n - 1) * nx + i] = Math.sin(n * (i + 0.5) * dphi);
  }
  const T = new Float64Array(ns),
    fa = new Float64Array(ns),
    fb = new Float64Array(ns),
    bi = sec.kind === "bi";
  let area = 0;
  for (let j = 0; j < ns; j++) {
    const c = st[j].c;
    area += c * dy;
    if (sec.kind === "hex") {
      const a = sec.le / c,
        b = sec.te / c,
        k = a + b > 1 ? 1 / (a + b) : 1;
      T[j] = sec.t * k;
      fa[j] = a * k;
      fb[j] = b * k;
    } else {
      T[j] = sec.tc * c;
      fa[j] = fb[j] = 0.5;
    }
  }
  const S = new Float64Array(nx),
    Sp = new Float64Array(nx);
  let tot = 0;
  for (let it = 0; it < FW_NTH; it++) {
    // The drag has a logarithmic peak where the cut lines lie along the flight direction (θ = 90°): the angles are
    // spaced as the square of an even spacing from there, which takes the peak out of the sum
    const w = (it + 0.5) / FW_NTH,
      k = beta * Math.sin((Math.PI / 2) * w * w);
    let x0 = Infinity,
      x1 = -Infinity;
    for (let j = 0; j < ns; j++) {
      const s = st[j];
      x0 = Math.min(x0, s.x - k * s.y);
      x1 = Math.max(x1, s.x + s.c + k * s.y);
    }
    const L = x1 - x0;
    for (let i = 0; i < nx; i++) {
      const X = x0 + (L / 2) * (1 - Math.cos((i + 0.5) * dphi));
      let a = 0;
      for (let j = 0; j < ns; j++) {
        const s = st[j];
        // the fin and its mirror image
        for (let sg = -1; sg <= 1; sg += 2) {
          const u = (X + sg * k * s.y - s.x) / s.c;
          if (u > 0 && u < 1) a += T[j] * (bi ? 4 * u * (1 - u) : Math.min(1, u / fa[j], (1 - u) / fb[j]));
        }
      }
      S[i] = a * dy;
    }
    // S′(x)/L = Σ Aₙ·sin nφ with x = (L/2)(1 − cos φ); the drag over q is (π·L²/4)·Σ n·Aₙ²
    for (let i = 0; i < nx; i++) {
      const lo = i > 0 ? S[i - 1] : 0,
        hi = i < nx - 1 ? S[i + 1] : 0,
        d = i > 0 && i < nx - 1 ? 2 * dphi : 1.5 * dphi;
      Sp[i] = (hi - lo) / d / ((L / 2) * Math.sin((i + 0.5) * dphi)) / L;
    }
    let sum = 0;
    for (let n = 1; n <= nh; n++) {
      let A = 0;
      const o = (n - 1) * nx;
      for (let i = 0; i < nx; i++) A += fwSin[o + i] * Sp[i];
      A *= (2 / Math.PI) * dphi;
      sum += n * A * A;
    }
    tot += 2 * w * ((Math.PI * L * L) / 4) * sum;
  }
  return tot / FW_NTH / (2 * area);
}
/**
 * A fin's wave drag coefficient from the kept table for its shape, worked out where it is first asked for.
 * @param {{key:string, ol:number[][], sec:object, tab?:Float64Array}} w the fin's shape (A.fins[i].wave from aero())
 * @param {number} beta √(M² − 1); taken as 0.4 below that
 * @returns {number} CD on the fin's own area
 */
export function finWave3D(w, beta) {
  if (!w.tab) {
    let t = fwTables.get(w.key);
    if (!t) {
      if (fwTables.size >= FW_KEEP) fwTables.delete(fwTables.keys().next().value);
      t = new Float64Array(FW_GRID.length).fill(NaN);
      fwTables.set(w.key, t);
    }
    w.tab = t;
  }
  const G = FW_GRID,
    b = Math.min(Math.max(beta, G[0]), G[G.length - 1]),
    at = (i) => (Number.isNaN(w.tab[i]) ? (w.tab[i] = finWaveAt(w.ol, w.sec, G[i]) * G[i]) : w.tab[i]);
  let i = b < 2 ? Math.floor((b - FW_B0) / 0.05 + 1e-9) : 32 + Math.floor((b - 2) / 0.25 + 1e-9);
  i = Math.min(Math.max(i, 0), G.length - 2);
  const u = (b - G[i]) / (G[i + 1] - G[i]),
    v0 = at(i),
    cdb = u > 1e-9 ? v0 + (at(i + 1) - v0) * u : v0;
  return cdb / Math.max(beta, G[0]);
}
