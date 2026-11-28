import { cdParts, cnaPartsM, CROSS_K, radiusAt, smooth01 } from "./aerodynamics.js";
/*
 * Flight loads: the side force, shear force and bending moment along the airframe at one moment of the flight, and the
 * axial compression at the motor.
 *
 * The rocket in flight is a free body. At an angle of attack the air pushes sideways on the nose, the shoulders and
 * boattails, the body and the fins (the same normal forces the stability and the flight use: cnaParts and
 * normalForceAt in aerodynamics.js). Their sum accelerates the whole rocket sideways and their moment about the CG
 * turns it, and every part of the rocket's weight resists that motion (d'Alembert). The shear force at a station is
 * the air loads ahead of it less that resistance of the weight ahead of it; the bending moment is the shear summed
 * along the body. Both are zero at the nose tip and come back to zero at the tail, which checks the balance.
 * This is the quasi-static rigid-body method (a free-body balance with d'Alembert's inertia forces, as in any
 * structures text): the rocket is taken as rigid and already at the angle, so it leaves out the airframe's own
 * bending vibration and the overshoot of a sudden gust.
 *
 * What it leans on: each nose, shoulder and fin set's force acts at its own center of pressure (a point load); the
 * body's crossflow lift is spread along the body in proportion to its width; the weights are the parts' own, each
 * spread over its length. A weight the parts don't account for (a weight override) is spread evenly about the point
 * that keeps the CG where the design has it.
 */

const N_ST = 400; // stations along the rocket

/**
 * The rocket's weight along its length at one moment: kg in each of N_ST equal slices from the nose tip.
 * @param {object} D design (length, dryMass, cgEmpty, massPts, mountAft, motorOverhang)
 * @param {{len:number, totalMass:number, propMass:number}|null} m the motor
 * @param {number} burnt share of the propellant burnt, 0 to 1
 * @returns {{mass:Float64Array, len:number, dx:number, total:number, cg:number, inertia:number, motor:number[]|null,
 *   motorMass:number, fromParts:boolean}} len: nose tip to the aft end (the motor's, if it sticks out); cg from the nose tip;
 *   inertia about the cg; motor: where it sits [front, back]; fromParts: false when the design carries no parts'
 *   weights and its dry weight was spread evenly about its CG
 */
export function massLine(D, m, burnt = 0) {
  const xMot1 = (D.mountAft ?? D.length) + (D.motorOverhang || 0),
    len = Math.max(D.length, m ? xMot1 : 0),
    dx = len / N_ST,
    mass = new Float64Array(N_ST);
  /**
   * Spreads a weight evenly from a to b (or puts it in one slice when shorter than a slice).
   */
  const put = (kg, a, b) => {
    a = Math.max(0, Math.min(len, a));
    b = Math.max(0, Math.min(len, b));
    if (b - a < dx) {
      mass[Math.min(N_ST - 1, Math.floor((a + b) / 2 / dx))] += kg;
      return;
    }
    for (let j = Math.floor(a / dx); j < N_ST && j * dx < b; j++)
      mass[j] += (kg * Math.max(0, Math.min((j + 1) * dx, b) - Math.max(j * dx, a))) / (b - a);
  };
  const pts = (D.massPts || []).filter((q) => q.m > 0 && q.x >= 0 && q.x <= D.length + 1e-6),
    pm = pts.reduce((a, q) => a + q.m, 0),
    pmx = pts.reduce((a, q) => a + q.m * q.x, 0),
    dry = D.dryMass || 0,
    cgE = Math.max(0, Math.min(D.length, D.cgEmpty ?? D.length / 2));
  // the parts' weights; scaled down when the design weighs less than they add up to
  const k = pm > dry && pm > 0 ? dry / pm : 1;
  for (const q of pts) put(q.m * k, q.x - q.len / 2, q.x + q.len / 2);
  // weight the parts don't show: spread evenly about the point that puts the CG where the design has it
  const extra = dry - pm * k;
  if (extra > 1e-9) {
    const xe = Math.max(0, Math.min(D.length, (dry * cgE - pmx * k) / extra)),
      h = Math.min(xe, D.length - xe);
    put(extra, xe - h, xe + h);
  }
  let motor = null,
    motorMass = 0;
  if (m && m.totalMass > 0) {
    const ml = Math.min(m.len || 0.1, xMot1);
    motor = [xMot1 - ml, xMot1];
    motorMass = m.totalMass - (m.propMass || 0) * Math.max(0, Math.min(1, burnt));
    put(motorMass, motor[0], motor[1]);
  }
  let total = 0,
    mom = 0,
    inertia = 0;
  for (let j = 0; j < N_ST; j++) {
    total += mass[j];
    mom += mass[j] * (j + 0.5) * dx;
  }
  const cg = total > 0 ? mom / total : len / 2;
  for (let j = 0; j < N_ST; j++) inertia += mass[j] * (((j + 0.5) * dx - cg) ** 2 + (dx * dx) / 12);
  return { mass, len, dx, total, cg, inertia, motor, motorMass, fromParts: pm > 0 };
}
/**
 * The side forces of the air on the rocket at an angle of attack, part by part, as coefficients on A.Aref: the same
 * sum as normalForceAt().
 * @param {object} A aerodynamic model
 * @param {number} M Mach number
 * @param {number} deg angle of attack, degrees
 * @returns {{cn:number, x:number, fin?:boolean, spread?:boolean}[]} spread: the body's crossflow lift, acting along
 *   the body in proportion to its width rather than at x
 */
function sideForceParts(A, M, deg) {
  // where each part's force acts is this app's own, also when the flight uses an imported center of pressure (that
  // gives the total and where it acts, not how it is shared along the rocket)
  const C = cnaPartsM(A.stab ? A.own() : A, M),
    al = (deg * Math.PI) / 180,
    sa = Math.sin(al),
    ca = Math.abs(Math.cos(al)),
    ks = deg <= 18 ? 1 : deg >= 35 ? 0.6 : 1 - 0.4 * smooth01((deg - 18) / 17),
    out = C.parts.map((p) => ({ cn: p.cn * sa * ca * (p.fin ? ks : 1), x: p.x, fin: !!p.fin }));
  const cnX = ((CROSS_K * A.sideArea) / A.Aref) * sa * sa;
  if (cnX > 0) out.push({ cn: cnX, x: A.xPlan, spread: true });
  if (deg > 18 && C.cnFin > 0) {
    const cnXf =
      ((smooth01((deg - 18) / 17) * 1.17 * (2 / Math.PI) * A.fins.reduce((t, f) => t + f.n * f.area, 0)) / A.Aref) *
      sa *
      sa;
    out.push({ cn: cnXf, x: C.momFin / C.cnFin, fin: true });
  }
  return out;
}
/**
 * Shear force and bending moment along a free body from side forces and its weight (the comment at the top).
 * @param {{mass:Float64Array, len:number, dx:number, total:number, cg:number, inertia:number}} W massLine()
 * @param {{F:number, x:number, w?:Float64Array}[]} forces side forces, N, each at x (m from the nose tip) or, with
 *   w, shared among the slices by those weights
 * @returns {{x:number[], shear:number[], moment:number[], side:number, cp:number, lat:number, turn:number,
 *   peak:{moment:number, x:number}, peakShear:{shear:number, x:number}, residual:number}} at each slice's aft end:
 *   shear (N) and bending moment (N·m); the total side force and where it acts; the sideways acceleration (m/s²) and
 *   turning acceleration (rad/s²) it gives; the largest bending moment and shear and where; and the bending left
 *   at the tail as a share of the peak (0 when the balance closes)
 */
export function shearAndBending(W, forces) {
  const n = W.mass.length,
    dx = W.dx,
    air = new Float64Array(n);
  let side = 0,
    mom = 0;
  for (const f of forces) {
    if (f.w) {
      const tw = f.w.reduce((a, v) => a + v, 0) || 1;
      for (let j = 0; j < n; j++) air[j] += (f.F * f.w[j]) / tw;
    } else {
      // shared between the two slices whose middles it lies between, so it acts exactly at x
      const u = Math.max(0, Math.min(n - 1, f.x / dx - 0.5)),
        j = Math.min(n - 2, Math.floor(u));
      air[j] += f.F * (1 - (u - j));
      air[j + 1] += f.F * (u - j);
    }
  }
  // (the forces as placed in the slices, so the balance closes exactly)
  for (let j = 0; j < n; j++) {
    side += air[j];
    mom += air[j] * ((j + 0.5) * dx - W.cg);
  }
  const lat = W.total > 0 ? side / W.total : 0,
    turn = W.inertia > 0 ? mom / W.inertia : 0,
    x = [0],
    shear = [0],
    moment = [0];
  let V = 0,
    Mb = 0,
    peak = { moment: 0, x: 0 },
    peakShear = { shear: 0, x: 0 };
  for (let j = 0; j < n; j++) {
    const xm = (j + 0.5) * dx,
      dV = air[j] - W.mass[j] * (lat + turn * (xm - W.cg));
    // a slice's own load acts at its middle
    Mb += V * dx + (dV * dx) / 2;
    V += dV;
    x.push((j + 1) * dx);
    shear.push(V);
    moment.push(Mb);
    if (Math.abs(Mb) > Math.abs(peak.moment)) peak = { moment: Mb, x: (j + 1) * dx };
    if (Math.abs(V) > Math.abs(peakShear.shear)) peakShear = { shear: V, x: (j + 1) * dx };
  }
  return {
    x,
    shear,
    moment,
    side,
    cp: side !== 0 ? W.cg + mom / side : W.cg,
    lat,
    turn,
    peak,
    peakShear,
    residual: peak.moment !== 0 ? Math.abs(Mb / peak.moment) : 0,
  };
}
/**
 * The loads on a design at one flight condition.
 * @param {object} D design
 * @param {object} A its aerodynamic model (aero(D))
 * @param {object|null} m the motor
 * @param {{M:number, v:number, atm:object, aoa:number, burnt?:number, thrust?:number, nozzleArea?:number}} c Mach
 *   number, airspeed (m/s), the air there (rho, a, mu, T), angle of attack (degrees), the share of the propellant
 *   burnt, the thrust (N) and the nozzle's exit area while it burns
 * @returns {object} shearAndBending()'s result with q (Pa), the weights (W), the side forces in newtons (forces),
 *   and axial: {thrust, drag, accel (m/s², along the body, gravity apart), compression (N, in the airframe where
 *   the motor pushes on it)}
 */
export function flightLoads(D, A, m, c) {
  const W = massLine(D, m, c.burnt || 0),
    q = 0.5 * c.atm.rho * c.v * c.v,
    qA = q * A.Aref,
    // the body's width along its length, for the crossflow lift
    wid = new Float64Array(W.mass.length);
  for (let j = 0; j < wid.length; j++) wid[j] = (j + 0.5) * W.dx <= A.L ? radiusAt(A, (j + 0.5) * W.dx) : 0;
  const forces = sideForceParts(A, c.M, c.aoa).map((p) => ({
    F: qA * p.cn,
    x: p.x,
    fin: p.fin,
    ...(p.spread ? { w: wid } : {}),
  }));
  const R = shearAndBending(W, forces);
  // along the body: thrust less drag accelerates the whole rocket. The motor pushes on the airframe at its aft
  // end (the thrust ring or retainer), so the tube there carries everything but the motor: that weight's share of
  // the acceleration plus the drag on the airframe (the base's suction pulls on the tail and compresses nothing)
  const cd = cdParts(A, c.v, c.atm, c.thrust > 0 ? c.nozzleArea || 0 : 0),
    drag = qA * cd.cd,
    thrust = c.thrust || 0,
    accel = W.total > 0 ? (thrust - drag) / W.total : 0,
    compression = Math.max(0, (W.total - W.motorMass) * accel + qA * (cd.cd - cd.base));
  return { ...R, q, W, forces, axial: { thrust, drag, accel, compression } };
}
