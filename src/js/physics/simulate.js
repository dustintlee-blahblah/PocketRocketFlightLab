/**
 * The flight simulation: stage geometry, motor thrust curves, fin flutter, the airframe's turning inertia, and
 * simulate(), which flies a design from the pad to landing.
 *
 * simulate() integrates position, velocity, the rocket's axis and its pitch, yaw and roll rates (six degrees of
 * freedom) with a fourth-order Runge-Kutta step, through these phases: on the rail, free flight (powered and coasting,
 * tumbling if it goes unstable), and under drogue and main parachutes. It handles two and three stages (each lower
 * stage dropping off and flown down on its own by flyBooster), clusters and airstarts, wind with height and gusts,
 * the earth's rotation, motor charges and every deployment setting. Units are SI throughout (m, s, kg, N, rad).
 */
import { findMotor, flightFirst } from "../motors/clusters.js";
import {
  aero,
  cdParts,
  cnaPartsM,
  cpAtAoA,
  cpOf,
  cpWithBodyLift,
  CROSS_K,
  finLiftRatio,
  finSetsOf,
  pitchDamping,
  radiusAt,
  rollPartsM,
  skinHeating,
  smooth01,
} from "./aerodynamics.js";
import { atmosphere } from "./atmosphere.js";
import { dragModel, skinStep } from "./drag-model.js";
import { flutterSpeed } from "./flutter.js";
import { fill, fillStep, opening } from "./parachutes.js";
import { boosterDesign, fullStack, isThree, stackDesign, stackDesign3 } from "./staging.js";
import { coriolis, flightWind } from "./wind.js";
/**
 * A motor's thrust curve as functions of time from ignition.
 * A cluster (m.members) adds each motor's thrust and mass, each starting at its own ignition delay.
 * @param {object} m motor: t (s) and F (N) thrust-curve points, totalMass and propMass (kg); or a cluster
 * @returns {{tb:number, Itot:number, thrust:function(number):number, mass:function(number):number, peak:number}}
 *   burn time (s), total impulse (N·s), thrust (N) and motor mass (kg) at time t, and peak thrust (N). Propellant
 *   burns in proportion to the impulse delivered.
 */
function motorModel(m) {
  // a cluster: each motor's own thrust and burn, started at its own ignition time (an airstart starts later)
  if (m.members) {
    const parts = m.members.map((e) => ({ mm: motorModel(e.m), n: e.n, d: Math.max(0, +e.d || 0) }));
    const tb = Math.max(...parts.map((p) => p.mm.tb + p.d)),
      Itot = parts.reduce((a, p) => a + p.n * p.mm.Itot, 0);
    return {
      tb,
      Itot,
      thrust: (t) => parts.reduce((a, p) => a + p.n * p.mm.thrust(t - p.d), 0),
      mass: (t) => parts.reduce((a, p) => a + p.n * p.mm.mass(Math.max(0, t - p.d)), 0),
      peak: Math.max(...m.F),
    };
  }
  const tb = m.t[m.t.length - 1];
  const cum = [0];
  for (let i = 1; i < m.t.length; i++) cum.push(cum[i - 1] + ((m.t[i] - m.t[i - 1]) * (m.F[i] + m.F[i - 1])) / 2);
  const Itot = cum[cum.length - 1];
  const thrust = (t) => {
    if (t <= 0 || t >= tb) return 0;
    let i = 1;
    while (m.t[i] < t) i++;
    const f = (t - m.t[i - 1]) / (m.t[i] - m.t[i - 1] || 1);
    return m.F[i - 1] + f * (m.F[i] - m.F[i - 1]);
  };
  const impulse = (t) => {
    if (t <= 0) return 0;
    if (t >= tb) return Itot;
    let i = 1;
    while (m.t[i] < t) i++;
    const f = (t - m.t[i - 1]) / (m.t[i] - m.t[i - 1] || 1);
    const Ft = m.F[i - 1] + f * (m.F[i] - m.F[i - 1]);
    return cum[i - 1] + ((t - m.t[i - 1]) * (m.F[i - 1] + Ft)) / 2;
  };
  const mass = (t) => m.totalMass - m.propMass * Math.min(1, impulse(t) / Itot);
  return { tb, Itot, thrust, mass, peak: Math.max(...m.F) };
}
/**
 * Where the rocket's rail guides are, for rail friction: the aft guide's position and the gap to the front one.
 * From the design's rail buttons or lug, or typical spots (55% and 92% of the length).
 * @param {object} D design
 * @returns {{aft:number, gap:number}} m from the nose tip, m
 *
 * where the rail guides are: from the design's buttons or lugs, or typical button spots (55% and 92% of the length)
 */
function railGuides(D) {
  const L = D.length;
  if (D.railPreset === "custom" && (D.buttons || []).length > 1) {
    const xs = D.buttons.map((b) => b.x).sort((a, b) => a - b);
    return { aft: xs[xs.length - 1], gap: xs[xs.length - 1] - xs[0] };
  }
  if (D.railPreset === "custom" && (D.lugs || []).length) {
    const lg = D.lugs.reduce((a, b) => ((b.x || 0) > (a.x || 0) ? b : a));
    return { aft: (lg.x ?? 0.9 * L) + (lg.len || 0) / 2, gap: Math.max(lg.len || 0.05, 0.05) };
  }
  return { aft: 0.92 * L, gap: 0.37 * L };
}
/**
 * TIPOFF: pitch rate given to the rocket at rail exit (rad/s). TUMBLE_COS: the cosine of the angle of attack
 * past which the rocket is taken to be tumbling (0 = broadside).
 */
var TIPOFF = 0.1,
  TUMBLE_COS = 0; // pitch rate at rail exit (rad/s); cos of the angle of attack treated as tumbling
/* nozzle exit area: as entered, or estimated from each motor's average thrust. The throat is sized by F = Cf·Pc·At
   (Cf ≈ 1.4, chamber pressure ≈ 5 MPa, typical of hobby composite motors) and the exit by an expansion ratio of
   about 5, so Ae ≈ F_avg / 1.4 MN. It's capped at 45% of the motor diameter, the widest commercial reloads use. */
/**
 * One motor's nozzle exit area.
 * @param {object} mo motor
 * @returns {number} m²
 */
function nozOne(mo) {
  const t = mo.t || [],
    F = mo.F || [];
  let I = 0;
  for (let i = 1; i < t.length; i++) I += ((t[i] - t[i - 1]) * (F[i] + F[i - 1])) / 2;
  const tb = t.length ? t[t.length - 1] - t[0] : 0,
    dia = mo.dia || 0.029,
    cap = Math.PI * (0.225 * dia) ** 2;
  return tb > 0 && I > 0 ? Math.min(I / tb / 1.4e6, cap) : cap;
}
/**
 * The nozzle exit area of a stage's motor, or of all a cluster's motors together (estimated from the thrust).
 * @param {object|null} mm motor, or a cluster with members
 * @returns {number} m²
 */
export function nozzleEstimate(mm) {
  return mm ? (mm.members ? mm.members.reduce((a, e) => a + e.n * nozOne(e.m), 0) : nozOne(mm)) : 0;
}
/**
 * Fly a design from the pad to landing.
 *
 * @param {object} D design
 * @param {object} L launch conditions (site, weather, rail, wind, imperfections, Monte Carlo variations)
 * @param {object} m sustainer (or only) motor, or a cluster; see flightMotor()
 * @param {object|null} mb booster motor for two- and three-stage designs, else null
 * @param {object} [opts]
 * @param {object} [opts.mb1] first-stage motor of a three-stage design (defaults to the one chosen)
 * @param {boolean} [opts.noRef] skip the extra reference flight (with the chute held until apogee) used to judge
 *   deployment timing
 * @returns {{out:object, st:object}} out: the flight's time series (t, alt, vel, acc, thrust, drift, cross, pitch,
 *   aoa, va, ax, az, roll, and the dropped stages' paths); st: its events and summary (apogee, speeds, Mach, off-rail
 *   speed, stability through the flight, burnout, deployment and landing times, drift, charge times, warnings)
 */
export function simulate(D, L, m, mb, opts = {}) {
  const g = 9.80665,
    staged = !!(D.twoStage && mb && D.bLength > 0);
  /* motor grain temperature: a warmer grain burns faster at higher pressure. Thrust scales by k = e^(0.002·ΔT) and the
     burn shortens by 1/k, keeping the total impulse (temperature sensitivity of burn rate, Sutton & Biblarz) */
  const kT = Math.exp(0.002 * (L.motorDT || 0)),
    kI = L.impScale > 0 ? L.impScale : 1; // kI: motor-to-motor impulse variation (Monte Carlo)
  const tempScale = (M) =>
    kT === 1 && kI === 1
      ? M
      : {
          ...M,
          Itot: M.Itot * kI,
          tb: M.tb / kT,
          peak: M.peak * kT * kI,
          thrust: (t) => kI * kT * M.thrust(kT * t),
          mass: (t) => M.mass(kT * t),
        };
  let MS = tempScale(motorModel(m));
  const MB = staged ? tempScale(motorModel(mb)) : null;
  /* three stages: the whole stack climbs on the first-stage motor, drops that stage at its burnout, and the booster lights
     midDelay later; from there it flies as a two-stage rocket, with every booster and sustainer time shifted by tOff */
  const mb1 = staged && isThree(D) ? (opts.mb1 !== undefined ? opts.mb1 : flightFirst(D)) : null,
    three = !!mb1,
    S1 = three ? { ...D, ...D.s1 } : null;
  const M1 = three ? tempScale(motorModel(mb1)) : null,
    t1Burn = three ? M1.tb : -1,
    tOff = three ? t1Burn + Math.max(0, D.midDelay || 0) : 0;
  // each lower stage separates its set delay after its motor burns out, or when the stage above lights, whichever comes first
  const t1Sep = three ? Math.min(t1Burn + Math.max(0, D.sep1Delay || 0), tOff) : -1;
  let midOK = true;
  // one motor of a cluster not lighting: the others' thrust only, the dud's full weight carried along, and the thrust
  // off-center by the dud's distance from the axis shared among the motors that lit
  const nClu = m && m.members ? m.members.reduce((a, e) => a + e.n, 0) : 1,
    cluFail = (L.clusterFail === true || L.clusterFail === "true") && nClu > 1;
  let cluOff = 0;
  if (cluFail) {
    const M0 = MS,
      f = (nClu - 1) / nClu,
      dud = m.totalMass / nClu;
    MS = {
      ...M0,
      Itot: M0.Itot * f,
      peak: M0.peak * f,
      thrust: (t) => M0.thrust(t) * f,
      mass: (t) => M0.mass(t) * f + dud,
    };
    const rm = (m.members[0].m.dia || 0.029) / 2;
    cluOff = Math.max(0, 0.9 * (D.diameter / 2 - rm - 0.003)) / (nClu - 1);
  }
  const Gs = aero(D),
    Gst = staged ? aero(stackDesign(D)) : Gs,
    Gst3 = three ? aero(stackDesign3(D)) : Gst;
  const nozEst = nozzleEstimate;
  const An = D.nozzleDia > 0 ? Math.PI * (D.nozzleDia / 2) ** 2 : nozEst(m),
    AnB = staged ? nozEst(mb) : 0,
    An1 = three ? nozEst(mb1) : 0;
  const tBurnB = staged ? tOff + MB.tb : -1,
    tIgn = staged ? tBurnB + Math.max(0, D.stageDelay || 0) : 0,
    tSep = staged ? Math.min(tBurnB + Math.max(0, D.sepDelay || 0), tIgn) : -1;
  let ignOK = true;
  const susEnd = () => tIgn + MS.tb;
  const stack1 = (t) => three && t < t1Sep - 1e-9;
  const stack = (t) => staged && (t < tSep - 1e-9 || !midOK); // a booster that never lit stays on
  const mbm = (t) => (midOK ? MB.mass(t - tOff) : mb.totalMass);
  /* side boosters (OpenRocket parallel stages): their motors burn as part of the cluster; at their separation they drop
     away with their structure, their motors and whatever those still hold, and their pods and fins stop adding lift and
     drag. Separation: at their motors' burnout or ejection charge, at launch, or never, plus the set delay (single-stage
     rockets; on a staged rocket they stay on). */
  const SB = staged
    ? []
    : (D.sideBoosters || []).map((b) => {
        const mot = (D.extraMotors || [])
          .filter((e) => e && e.sb === b.i && findMotor(e.id))
          .map((e) => ({
            mm: tempScale(motorModel(findMotor(e.id))),
            n: e.n || 1,
            d: +e.d || 0,
            ej: e.sbEj ?? e.ej,
          }));
        const tb = mot.length ? Math.max(...mot.map((x) => x.d + x.mm.tb)) : 0,
          ej =
            mot.length && mot.every((x) => x.ej != null)
              ? Math.min(...mot.map((x) => x.d + x.mm.tb + +x.ej))
              : Infinity;
        const ev = b.event || "burnout",
          t0 =
            ev === "never"
              ? Infinity
              : ev === "launch" || ev === "ignition" || ev === "upper_ignition"
                ? 0
                : ev === "ejection"
                  ? ej
                  : tb;
        return { ...b, mot, t: t0 + Math.max(0, +b.delay || 0) };
      });
  const sbOff = (t) => SB.filter((b) => t >= b.t - 1e-9);
  const sbThrust = (t) => sbOff(t).reduce((a, b) => a + b.mot.reduce((q, x) => q + x.n * x.mm.thrust(t - x.d), 0), 0);
  const sbMass = (t) =>
    sbOff(t).reduce((a, b) => a + b.mass + b.mot.reduce((q, x) => q + x.n * x.mm.mass(Math.max(0, t - x.d)), 0), 0);
  const thrust = (t) =>
    stack1(t)
      ? M1.thrust(t)
      : stack(t)
        ? midOK
          ? MB.thrust(t - tOff)
          : 0
        : ignOK
          ? MS.thrust(t - tIgn) - (SB.length ? sbThrust(t) : 0)
          : 0;
  const mass0 = (t) =>
    stack1(t)
      ? D.dryMass + m.totalMass + D.bDryMass + mb.totalMass + S1.bDryMass + M1.mass(t)
      : stack(t)
        ? D.dryMass + m.totalMass + D.bDryMass + mbm(t)
        : D.dryMass + (ignOK ? MS.mass(t - tIgn) : m.totalMass);
  const mass = (t) => (SB.length ? mass0(t) - sbMass(t) : mass0(t));
  const nozzleAt = (t) =>
    stack1(t)
      ? t < M1.tb
        ? An1
        : 0
      : stack(t)
        ? midOK && t > tOff && t < tOff + MB.tb
          ? AnB
          : 0
        : ignOK && t > tIgn && t < susEnd()
          ? An
          : 0;
  // after side boosters separate: the rocket without their pods, fins and tube fins
  const GsSep = new Map();
  const GsAt = (t) => {
    const off = sbOff(t);
    if (!off.length) return Gs;
    const key = off.map((b) => b.i).join(",");
    if (!GsSep.has(key)) {
      const gone = new Set(off.map((b) => b.i)),
        keep = (o) => o.sb == null || !gone.has(o.sb);
      GsSep.set(
        key,
        aero({
          ...D,
          finSets: finSetsOf(D).filter(keep),
          pods: (D.pods || []).filter(keep),
          tubeFins: (D.tubeFins || []).filter(keep),
        }),
      );
    }
    return GsSep.get(key);
  };
  const Gat = (t) => (stack1(t) ? Gst3 : stack(t) ? Gst : SB.length ? GsAt(t) : Gs);
  const th = (L.angle * Math.PI) / 180,
    windVec = flightWind(L);
  // axes: x downwind, y to the left of downwind, z up. The rail leans upwind, or toward a set compass direction.
  const relAz = ((L.railMode === "fixed" ? (L.railDir || 0) - ((L.windDir ?? 270) + 180) : 180) * Math.PI) / 180;
  const rx = Math.sin(th) * Math.cos(relAz),
    ry = -Math.sin(th) * Math.sin(relAz),
    rz = Math.cos(th);
  const { corX, corY, corZ } = coriolis(L);
  /* rising or sinking air (a thermal, or sink) during the descent: a steady vertical air speed, full strength from about
     30 m up to 2.5 km above the pad, fading to nothing at the ground and at 3.5 km */
  const thW = +L.thermalW || 0,
    draft = (z) => (thW ? thW * Math.min(1, Math.max(0, z / 30)) * Math.min(1, Math.max(0, (3500 - z) / 1000)) : 0);
  // a chute set to open at the motor ejection charge opens when the motor's delay (Motor tab) runs out: there's one delay
  const depMode = D.deployMode || "apogee",
    depDelay = depMode === "motor" ? Math.max(0, D.ejDelay ?? 0) : Math.max(0, D.deployDelay || 0);
  // a chute set to open at the motor ejection charge on a plugged motor never opens: the rocket falls ballistic (a dual
  // deploy main set to an altitude still opens there)
  /* every live charge in the sustainer (or only) stage: the main motor's delay after the stage burns out, and each separately
     mounted motor's own delay after its own burnout (outboard or pod motors, set under Motor Delay). A chute set to open at
     the motor ejection charge opens on the first of them, as OpenRocket does. Times are relative to the stage's ignition. */
  const XEJ = (D.extraMotors || [])
    .filter((e) => e && e.ej != null && +e.ej >= 0 && findMotor(e.id))
    .map((e) => {
      const xm = findMotor(e.id),
        tb = motorModel(xm).tb / kT;
      return { rel: (+e.d || 0) + tb + +e.ej, ej: +e.ej, name: xm.cn || xm.name, n: e.n || 1 };
    });
  const plugSkip = depMode === "motor" && D.ejDelay == null && !XEJ.length;
  const chargeTimes = () =>
    [...(D.ejDelay != null ? [susEnd() + D.ejDelay] : []), ...XEJ.map((e) => tIgn + e.rel)].sort((a, b) => a - b);
  const firstCharge = () => {
    const c = chargeTimes();
    return c.length ? c[0] : null;
  };
  const chuteA = (d, cd) => cd * Math.PI * (d / 2) ** 2;
  const dual = D.recovery !== "single",
    drogueDia = dual ? D.drogueDia : 0,
    mainAlt = dual ? D.mainAlt : Infinity;
  const CdAdrogue = chuteA(drogueDia, D.drogueCd),
    CdAmain = chuteA(D.mainDia, D.mainCd),
    noChute = !(CdAmain + CdAdrogue > 0);
  let railPrev = { d: 0, v: 0, t: 0 }, // the last step's place, speed and time on the rail
    openD = null,
    openM = null,
    prevPh = "rail";
  /* other chutes and streamers besides the drogue and main: each opens on its own event (apogee plus its delay, its
     altitude on the way down, the motor's ejection charge, or a timer from liftoff), fills like the others, and adds its drag */
  const XC = (D.extraChutes || [])
    .filter((c) => c && c.d > 0)
    .map((c) => ({
      cda: chuteA(c.d, c.cd || 0.8),
      d: c.d,
      ev: c.ev || "apogee",
      alt: c.alt || 0,
      dd: Math.max(0, c.dd || 0),
      open: null,
    }));
  const xcda = (t) => {
      let a = 0;
      for (const c of XC) if (c.open) a += c.cda * fill(c.open, t);
      return a;
    },
    XCtot = XC.reduce((a, c) => a + c.cda, 0);
  const chuteCdA = (ph, t) =>
    (ph === "main"
      ? CdAmain * fill(openM, t) + CdAdrogue * fill(openD, t) + 0.5 * Gs.Aref
      : ph === "drogue"
        ? CdAdrogue * fill(openD, t) + 0.5 * Gs.Aref
        : Gs.tumbleCdA) + xcda(t);
  let phase = "rail";
  /* pitch motion after rail exit: Barrowman normal force acting at the CP, body lift across the flow (Galejs) at larger angles,
     aerodynamic damping and jet damping (Mandell, Caporaso & Bengen, Topics in Advanced Model Rocketry, 1973).
     Moment of inertia: each airframe as a uniform rod, each motor as a uniform rod at its own position. */
  const GUIDES = railGuides(staged ? fullStack(D) : D); // where the rail guides are (on the whole stack), for the friction on the rail
  const airSp = (z, vx, vy, vz, t) => {
    const W = windVec(z, t);
    return Math.hypot(vx - W[0], vy - W[1], vz);
  };
  const thrMis = ((L.thrustMis || 0) * Math.PI) / 180,
    finMisR = ((L.finMis || 0) * Math.PI) / 180,
    cgOffM = L.cgOff || 0,
    IMPERF = !!(thrMis || finMisR || cgOffM || cluFail);
  const Lsus = D.length,
    xNs = (D.mountAft ?? Lsus) + D.motorOverhang,
    xMs = xNs - m.len / 2;
  const xNb = staged ? Lsus + (D.bMountAft ?? D.bLength) + (D.bOverhang || 0) : 0,
    xMb = staged ? xNb - mb.len / 2 : 0;
  const L12 = staged ? Lsus + D.bLength : 0,
    xN1 = three ? L12 + (S1.bMountAft ?? S1.bLength) + (S1.bOverhang || 0) : 0,
    xM1 = three ? xN1 - mb1.len / 2 : 0;
  /**
   * Mass properties at a time: CG (m from the nose tip), pitch moment of inertia about it (kg·m²), the
   * rate propellant is burning (kg/s) and the nozzle position, for whatever is still attached.
   */
  function inertia(t) {
    const it = [[D.dryMass, D.cgEmpty, airInertia(D.dryInertia, D.inertiaMass, D.dryMass, Lsus)]];
    if (stack(t)) {
      it.push(
        [m.totalMass, xMs, (m.totalMass * m.len * m.len) / 12],
        [D.bDryMass, Lsus + D.bCg, airInertia(D.bDryInertia, D.bInertiaMass, D.bDryMass, D.bLength)],
      );
      const mbt = stack1(t) ? mb.totalMass : mbm(t);
      it.push([mbt, xMb, (mbt * mb.len * mb.len) / 12]);
      if (stack1(t)) {
        const m1 = M1.mass(t);
        it.push(
          [S1.bDryMass, L12 + S1.bCg, airInertia(S1.bDryInertia, S1.bInertiaMass, S1.bDryMass, S1.bLength)],
          [m1, xM1, (m1 * mb1.len * mb1.len) / 12],
        );
      }
    } else {
      const mm = ignOK ? MS.mass(t - tIgn) : m.totalMass;
      it.push([mm, xMs, (mm * m.len * m.len) / 12]);
      // side boosters gone: their structure, and their motors (taken to sit where the cluster's do)
      for (const b of sbOff(t)) {
        it.push([-b.mass, b.cg, 0]);
        const mb = b.mot.reduce((q, x) => q + x.n * x.mm.mass(Math.max(0, t - x.d)), 0);
        if (mb > 0) it.push([-mb, xMs, 0]);
      }
    }
    const M = it.reduce((a, p) => a + p[0], 0),
      cg = it.reduce((a, p) => a + p[0] * p[1], 0) / M;
    const mdot = Math.max(0, (mass(t) - mass(t + 0.005)) / 0.005);
    return {
      cg,
      I: it.reduce((a, p) => a + p[2] + p[0] * (p[1] - cg) ** 2, 0),
      mdot,
      xN: stack1(t) ? xN1 : stack(t) ? xNb : xNs,
    };
  }
  /* roll (the sixth degree of freedom): fin cant drives it, the fins' own sweep through the air damps it,
     and the spin's angular momentum couples into pitch and yaw (gyroscopic precession) */
  const airRoll = (I, m0, R) => (I > 0 ? I : m0 * 0.5 * R * R); // without the parts list: a thin-walled tube's worth
  const IxxS = airRoll(D.rollInertia, D.dryMass, Gs.R),
    IxxB = staged ? airRoll(D.bRollInertia, D.bDryMass, D.bDiameter / 2) : 0,
    IxxC = three ? airRoll(S1.bRollInertia, S1.bDryMass, S1.bDiameter / 2) : 0;
  /**
   * Roll moment of inertia (kg·m²) of whatever is attached at time t.
   */
  function rollI(t) {
    const rm = (m.dia || 0.029) / 2;
    if (stack1(t)) {
      const rb = (mb.dia || 0.029) / 2,
        r1 = (mb1.dia || 0.029) / 2;
      return (
        IxxS + IxxB + IxxC + 0.5 * m.totalMass * rm * rm + 0.5 * mb.totalMass * rb * rb + 0.5 * M1.mass(t) * r1 * r1
      );
    }
    if (stack(t)) {
      const rb = (mb.dia || 0.029) / 2;
      return IxxS + IxxB + 0.5 * m.totalMass * rm * rm + 0.5 * mbm(t) * rb * rb;
    }
    return IxxS + 0.5 * (ignOK ? MS.mass(t - tIgn) : m.totalMass) * rm * rm;
  }
  /**
   * The equations of motion: the time derivative of the state s in phase ph ("rail", "flight", "drogue",
   * "main" or "free"). The state is [x, z, vx, vz, y, vy, bx, by, bz, wx, wy, wz, p, roll angle]: position (x
   * downrange, y crossrange, z up), velocity, the rocket's axis (unit vector), its pitch/yaw angular velocity, the roll
   * rate and roll angle. The last element of the returned array is the axial acceleration, for the readout.
   *
   * state: x, z, vx, vz, y, vy, rocket axis (bx, by, bz), pitch/yaw angular velocity (wx, wy, wz), roll rate p and roll angle
   */
  function deriv(t, s, ph) {
    const [x, z, vx, vz, y, vy, bx, by, bz, wx, wy, wz, p] = s,
      mm = mass(t),
      atm = atmosphere(L, Math.max(z, 0)),
      T0 = thrust(t),
      An_ = nozzleAt(t),
      T = T0 > 0 && An_ > 0 ? T0 + An_ * (101325 - atm.p) : T0;
    const G = Gat(t),
      g = 9.80665 * (6371000 / (6371000 + (L.elev || 0) + Math.max(z, 0))) ** 2; // gravity falls off with height above sea level
    if (ph === "rail") {
      const v = vx * rx + vy * ry + vz * rz;
      /* the air on the rail: the wind's part along the rail adds to (or takes from) the airspeed; its part across the rail
         meets the rocket at an angle, which pushes it sideways (Barrowman normal force plus body crossflow, as in flight) */
      const Wr = windVec(z, t),
        wa = Wr[0] * rx + Wr[1] * ry,
        va = v - wa,
        cx = Wr[0] - wa * rx,
        cy = Wr[1] - wa * ry,
        cz = -wa * rz,
        cm = Math.hypot(cx, cy, cz);
      const Fd =
        0.5 *
        atm.rho *
        va *
        Math.abs(va) *
        cdParts(G, Math.abs(va), atm, T > 0 ? An_ : 0, undefined, skin ? skin.T : 0).cd *
        G.Aref;
      /* rail-guide friction: coefficient 0.2 times the force on each guide. The guides carry the weight across a leaning
         rail and the crosswind's side force; each force is shared between the front and aft guide by where it acts
         (a force behind the aft guide loads the front guide the other way, as a lever). */
      let fr = 0;
      if (v > 0 || T > mm * g * rz) {
        const J = inertia(t),
          cg = J.cg,
          xa = GUIDES.aft,
          xf = GUIDES.aft - GUIDES.gap,
          gap = GUIDES.gap;
        const gw = [mm * g * rz * rx, mm * g * rz * ry, -mm * g + mm * g * rz * rz]; // the weight's part across the rail, at the CG
        let fw = [0, 0, 0],
          xN = cg;
        if (cm > 1e-3) {
          const vrel = Math.hypot(va, cm),
            al = Math.atan2(cm, va),
            sa = Math.sin(al),
            ca = Math.abs(Math.cos(al)),
            C = cnaPartsM(G, vrel / atm.a);
          const cL = C.cn * sa * ca,
            cX = ((CROSS_K * G.sideArea) / G.Aref) * sa * sa,
            Nf = 0.5 * atm.rho * vrel * vrel * G.Aref * (cL + cX);
          fw = [(Nf * cx) / cm, (Nf * cy) / cm, (Nf * cz) / cm];
          xN = cL + cX > 0 ? (cL * C.cp + cX * G.xPlan) / (cL + cX) : cg;
        }
        if (gap > 1e-3) {
          const sh = (F, x) => [F.map((f) => (f * (xa - x)) / gap), F.map((f) => (f * (x - xf)) / gap)];
          const [w1, w2] = sh(gw, cg),
            [n1, n2] = sh(fw, xN);
          fr =
            0.2 *
            (Math.hypot(w1[0] + n1[0], w1[1] + n1[1], w1[2] + n1[2]) +
              Math.hypot(w2[0] + n2[0], w2[1] + n2[1], w2[2] + n2[2]));
        } else fr = 0.2 * Math.hypot(gw[0] + fw[0], gw[1] + fw[1], gw[2] + fw[2]);
        st.railFric = Math.max(st.railFric || 0, fr);
      }
      let a = (T - Fd - fr) / mm - g * rz;
      if (v <= 0 && a < 0) a = 0;
      return [v * rx, v * rz, a * rx, a * rz, v * ry, a * ry, 0, 0, 0, 0, 0, 0, 0, 0, (T - Fd) / mm]; // the rail holds it from rolling
    }
    const W = windVec(z, t),
      vrx = vx - W[0],
      vry = vy - W[1],
      vrz = vz - (ph !== "flight" ? draft(z) : 0),
      vr = Math.hypot(vrx, vry, vrz);
    const ux = vr > 1e-6 ? vrx / vr : bx,
      uy = vr > 1e-6 ? vry / vr : by,
      uz = vr > 1e-6 ? vrz / vr : bz;
    if (ph === "flight" && tumbling) {
      /* tumbling end over end: broadside tumble drag along the airflow (Allen–Perkins crossflow drag);
         the spinning thrust averages out over each turn */
      const Fd = 0.5 * atm.rho * vr * vr * (G.tumbleCdA + xcda(t));
      return [
        vx,
        vz,
        (-Fd * ux) / mm + corX(vy, vz),
        (-Fd * uz) / mm - g + corZ(vx, vy),
        vy,
        (-Fd * uy) / mm + corY(vx, vz),
        wy * bz - wz * by,
        wz * bx - wx * bz,
        wx * by - wy * bx,
        0,
        0,
        0,
        0,
        p,
        Fd / mm,
      ];
    }
    if (ph === "flight") {
      const cd0 = cdParts(G, vr, atm, T > 0 ? An_ : 0, undefined, skin ? skin.T : 0).cd,
        q = 0.5 * atm.rho * vr * vr,
        C = cnaPartsM(G, vr / atm.a),
        J = inertia(t);
      const ca = Math.max(-1, Math.min(1, bx * ux + by * uy + bz * uz)),
        al = vr > 1 ? Math.acos(ca) : 0;
      // an unstable rocket (CP ahead of the CG) gets a negative moment here, so any small disturbance grows
      const sa = Math.sin(al);
      /* fins stall: past about 18° angle of attack their lift stops growing with angle, so the linear fin term fades to 60%
         by 35°; above that the fins act like flat plates (Hoerner), whose normal force the remaining term approximates */
      const ald = (al * 180) / Math.PI,
        ks = ald <= 18 ? 1 : ald >= 35 ? 0.6 : 1 - 0.4 * smooth01((ald - 18) / 17);
      /* the normal force always opposes the crossflow: sin α·|cos α|. (With sin α·cos α it reversed past 90°, which held a
         rocket falling tail first there as if that were stable: a stable rocket weathervanes into the flow and comes down
         nose first, through broadside on the way.) */
      /* past the stall the fins also act as flat plates across the flow (Hoerner, Cd ≈ 1.17 on the area they show, 2/π of
         each fin on average over roll, as in the tumbling drag), at the fins: what swings a rocket that has turned far
         from the flow, at apogee or falling, back nose first */
      /* tail first (past 90°) the body's own lift, made where its cross-section grows along the flow (the nose), changes sign:
         the nose is now at the back end of the flow, where the section shrinks. The fins lead, and still lift against the
         crossflow. */
      const sb = ca >= 0 ? 1 : -1,
        cnB = C.cn - C.cnFin,
        cnLin = (sb * cnB + ks * C.cnFin) * sa * Math.abs(ca),
        cnX = ((CROSS_K * G.sideArea) / G.Aref) * sa * sa,
        cnXf =
          ald <= 18
            ? 0
            : ((smooth01((ald - 18) / 17) * 1.17 * (2 / Math.PI) * G.fins.reduce((a, f) => a + f.n * f.area, 0)) /
                G.Aref) *
              sa *
              sa;
      const xFin = C.cnFin > 0 ? C.momFin / C.cnFin : G.L,
        xLin = cnB + ks * C.cnFin > 0 ? (C.cn * C.cp - (1 - ks) * C.momFin) / (cnB + ks * C.cnFin) : C.cp;
      const N = q * G.Aref * (cnLin + cnX + cnXf),
        FA = q * G.Aref * cd0 * ca;
      // normal force: across the body, along the crossflow
      const px = ux - ca * bx,
        py = uy - ca * by,
        pz = uz - ca * bz,
        pl = Math.hypot(px, py, pz);
      const nx = pl > 1e-9 ? -px / pl : 0,
        ny = pl > 1e-9 ? -py / pl : 0,
        nz = pl > 1e-9 ? -pz / pl : 0;
      // the restoring moment turns the axis toward the airflow, about k = b × u
      let kx = by * uz - bz * uy,
        ky = bz * ux - bx * uz,
        kz = bx * uy - by * ux;
      const kl = Math.hypot(kx, ky, kz);
      if (kl > 1e-12) {
        kx /= kl;
        ky /= kl;
        kz /= kl;
      } else {
        kx = ky = kz = 0;
      }
      const linM =
        sb > 0
          ? cnLin * (xLin - J.cg)
          : sa * Math.abs(ca) * (-(C.cn * C.cp - C.momFin - cnB * J.cg) + ks * (C.momFin - C.cnFin * J.cg));
      const Mp = q * G.Aref * (linM + cnX * (G.xPlan - J.cg) + cnXf * (xFin - J.cg));
      const C2 =
        0.5 * atm.rho * vr * G.Aref * C.parts.reduce((a, p) => a + p.cn * (p.x - J.cg) ** 2, 0) +
        J.mdot * (J.xN - J.cg) ** 2;
      // roll: fin cant against the fins' roll damping, about the rocket's axis
      const RP = rollPartsM(G, vr / atm.a),
        Ix = rollI(t),
        Mroll = q * G.Aref * (RP.force - (RP.damp * p) / Math.max(vr, 1));
      // imperfections, fixed to the airframe so they turn as it rolls: a reference direction d across the body at roll angle φ
      let ix = 0,
        iy = 0,
        iz = 0,
        fx = 0,
        fy = 0,
        fz = 0,
        Mr2 = 0;
      if (IMPERF) {
        const phi = s[13];
        let e1x = -by,
          e1y = bx,
          e1z = 0,
          el = Math.hypot(e1x, e1y);
        if (el < 1e-6) {
          e1x = 0;
          e1y = -bz;
          e1z = by;
          el = Math.hypot(e1y, e1z) || 1;
        }
        e1x /= el;
        e1y /= el;
        e1z /= el;
        const e2x = by * e1z - bz * e1y,
          e2y = bz * e1x - bx * e1z,
          e2z = bx * e1y - by * e1x,
          c = Math.cos(phi),
          sn = Math.sin(phi);
        const dx = c * e1x + sn * e2x,
          dy = c * e1y + sn * e2y,
          dz = c * e1z + sn * e2z; // d
        const qx = by * dz - bz * dy,
          qy = bz * dx - bx * dz,
          qz = bx * dy - by * dx; // b × d, also across the body
        const torque = (Fl, arm, vx_, vy_, vz_) => {
          const k2x = by * vz_ - bz * vy_,
            k2y = bz * vx_ - bx * vz_,
            k2z = bx * vy_ - by * vx_;
          ix -= arm * Fl * k2x;
          iy -= arm * Fl * k2y;
          iz -= arm * Fl * k2z;
        };
        if (T > 0 && thrMis) {
          const Fl = T * Math.sin(thrMis);
          fx += Fl * dx;
          fy += Fl * dy;
          fz += Fl * dz;
          torque(Fl, J.xN - J.cg, dx, dy, dz);
        } // tilted thrust at the nozzle
        if (T > 0 && cgOffM) {
          ix += cgOffM * T * (by * qz - bz * qy);
          iy += cgOffM * T * (bz * qx - bx * qz);
          iz += cgOffM * T * (bx * qy - by * qx);
        } // thrust line passing beside the CG
        if (T > 0 && cluFail && !stack(t)) {
          ix += cluOff * T * (by * dz - bz * dy);
          iy += cluOff * T * (bz * dx - bx * dz);
          iz += cluOff * T * (bx * dy - by * dx);
        }
        if (finMisR && G.fins.length) {
          const f = G.fins[0],
            rf = radiusAt(G, f.xLead + f.a / 2),
            fm = finLiftRatio(f, vr / atm.a),
            d0 = 2 * G.R;
          const cna1 = ((8 * (f.s / d0) ** 2) / (1 + Math.sqrt(1 + f.cnX ** 2))) * fm.k * (1 + rf / (f.s + rf)),
            Fn = q * G.Aref * cna1 * finMisR; // one crooked fin's own lift
          fx += Fn * qx;
          fy += Fn * qy;
          fz += Fn * qz;
          torque(Fn, f.xLead + f.xcp + fm.dx - J.cg, qx, qy, qz);
          Mr2 = Fn * (rf + (f.yMac ?? f.s / 3));
        }
      }
      // gyroscopic coupling: the spin's angular momentum Ix·p turns pitch into yaw and back (Euler's equations)
      const dbx = wy * bz - wz * by,
        dby = wz * bx - wx * bz,
        dbz = wx * by - wy * bx,
        gy = (Ix * p) / J.I;
      let ax = (Mp * kx - C2 * wx + ix) / J.I - gy * dbx,
        ay = (Mp * ky - C2 * wy + iy) / J.I - gy * dby,
        az = (Mp * kz - C2 * wz + iz) / J.I - gy * dbz;
      const ab = ax * bx + ay * by + az * bz;
      ax -= ab * bx;
      ay -= ab * by;
      az -= ab * bz;
      if (XC.length) {
        const Fe = 0.5 * atm.rho * vr * vr * xcda(t);
        fx -= Fe * ux;
        fy -= Fe * uy;
        fz -= Fe * uz;
      } // an extra chute already out pulls along the airflow
      return [
        vx,
        vz,
        ((T - FA) * bx + N * nx + fx) / mm + corX(vy, vz),
        ((T - FA) * bz + N * nz + fz) / mm - g + corZ(vx, vy),
        vy,
        ((T - FA) * by + N * ny + fy) / mm + corY(vx, vz),
        dbx,
        dby,
        dbz,
        ax,
        ay,
        az,
        (Mroll + Mr2) / Ix,
        p,
        (T - FA) / mm,
      ];
    }
    const CdA = chuteCdA(ph, t);
    const Fd = 0.5 * atm.rho * vr * vr * CdA;
    return [
      vx,
      vz,
      (-Fd * ux) / mm + corX(vy, vz),
      (-Fd * uz) / mm - g + corZ(vx, vy),
      vy,
      (-Fd * uy) / mm + corY(vx, vz),
      0,
      0,
      0,
      0,
      0,
      0,
      -2 * p,
      p,
      Fd / mm,
    ]; // under a chute the spin dies away
  }
  /**
   * Natural pitch frequency (rad/s) at a state, to keep the time step short enough.
   */
  function pitchRate(t, s) {
    // natural pitch frequency, to keep the time step small enough
    const [x, z, vx, vz, y, vy] = s,
      atm = atmosphere(L, Math.max(z, 0)),
      W = windVec(z, t),
      vr = Math.hypot(vx - W[0], vy - W[1], vz),
      G = Gat(t),
      C = cnaPartsM(G, vr / atm.a),
      J = inertia(t);
    return Math.sqrt(Math.max(0, (0.5 * atm.rho * vr * vr * G.Aref * C.cn * Math.abs(C.cp - J.cg)) / J.I));
  }
  const breaks = three ? [t1Sep, tOff, tSep, tIgn] : staged ? [tSep, tIgn] : [];
  const powered = (t) =>
    (three && t < t1Sep + 0.5) ||
    (staged && t >= tOff - 0.05 && t < tSep + 0.5) ||
    (ignOK && t >= tIgn - 0.05 && t < susEnd() + 0.5);
  /* the test drag model (drag-model.js): the skin's temperature, followed through the flight from the air temperature
     on the pad, since the friction depends on it. null with the released model, which doesn't use it. */
  const skinT0 = atmosphere(L, 0).T,
    skin = dragModel === "test" ? { T: skinT0, d: 0, max: skinT0 } : null;
  let t = 0,
    s = [0, 0, 0, 0, 0, 0, rx, ry, rz, 0, 0, 0, 0, L.rollStart || 0],
    tDep = depMode === "timer" ? depDelay : null,
    ejSeen = 0;
  const ejLives = [];
  const out = {
    t: [],
    alt: [],
    vel: [],
    acc: [],
    thrust: [],
    drift: [],
    cross: [],
    pitch: [],
    aoa: [],
    va: [],
    ax: [],
    az: [],
    roll: [],
  };
  const st = {
    maxAlt: 0,
    maxV: 0,
    maxMach: 0,
    maxAcc: 0,
    offRail: null,
    offRailT: null,
    burnAlt: null,
    tApo: null,
    tMain: null,
    tLand: null,
    drift: 0,
    landed: false,
    error: null,
    staged,
  };
  let lastRec = -1,
    acc = 0,
    boosterStart = null,
    firstStart = null,
    tumbling = false;
  /**
   * Adds the moment just reached to the flight's time series (out), for the charts, the animation and the report.
   */
  function recordSample(x, y, z, vx, vy, vz, tiltNow) {
    out.t.push(t);
    out.alt.push(z);
    out.vel.push(vz);
    out.acc.push(phase === "flight" || phase === "rail" ? acc : 0);
    out.thrust.push(thrust(t));
    out.drift.push(-x);
    out.cross.push(y);
    out.pitch.push(tiltNow);
    {
      // angle of attack: between the rocket's axis and the air flowing past it (its velocity less the wind), in free flight only
      let aoa = NaN,
        va = NaN;
      if (phase === "flight" && !tumbling) {
        const W = windVec(z, t),
          rx = vx - W[0],
          ry = vy - W[1];
        va = Math.hypot(rx, ry, vz);
        aoa =
          va > 0.5
            ? (Math.acos(Math.max(-1, Math.min(1, (s[6] * rx + s[7] * ry + s[8] * vz) / va))) * 180) / Math.PI
            : NaN;
      }
      out.aoa.push(aoa);
      out.va.push(va);
    }
    out.ax.push(s[6]);
    out.az.push(s[8]);
    out.roll.push(s[12]);
    lastRec = t; // drift: upwind positive, downwind negative
  }
  /**
   * The next time step: short on the rail and while a motor burns, short enough for the pitch and roll rates in flight,
   * and under a chute short of the drag's response time and of each canopy's filling.
   * @returns {number} s
   */
  function stepSize() {
    let dt = phase === "rail" || powered(t) ? 0.002 : phase === "flight" ? 0.01 : 0.2; // under a chute the motion is slow and smooth; the drag-response limit below still applies
    if (phase === "flight")
      dt = Math.min(
        dt,
        0.3 / Math.max(tumbling ? Math.hypot(s[9], s[10], s[11]) : pitchRate(t, s), 1),
        0.3 / Math.max(Math.abs(s[12]), 1),
      );
    else if (phase !== "rail") {
      // under a chute: keep the step short of the drag's response time, or a light rocket with a big chute opening fast blows up the integrator
      const CdA = (phase === "main" ? CdAmain + CdAdrogue : phase === "drogue" ? CdAdrogue : Gs.tumbleCdA) + XCtot,
        ms = D.dryMass + m.totalMass - m.propMass;
      for (const o of [openD, openM, ...XC.map((c) => c.open)])
        if (o && t < o.t + 2 * o.tf) dt = Math.min(dt, Math.max(o.tf / 10, 0.001)); // small steps while a canopy fills
      const W = windVec(s[1], t),
        lam =
          (atmosphere(L, Math.max(s[1], 0)).rho * CdA * Math.hypot(s[2] - W[0], s[3], s[5] - W[1])) /
          Math.max(ms, 1e-3);
      dt = Math.min(dt, Math.max(0.5 / Math.max(lam, 1e-6), 0.0005));
    }
    return dt;
  }
  // the state just reached, for the steps of the loop below
  let x = 0,
    z = 0,
    vx = 0,
    vz = 0,
    y = 0,
    vy = 0,
    sp = 0,
    atm = null,
    tiltNow = 0,
    dt = 0;
  /**
   * After each step: the canopies fill further, the axis is kept a unit vector at right angles to its spin, and a
   * rocket turned too far from the airflow to recover starts tumbling.
   */
  function afterStep() {
    if (openD || openM || XC.length) {
      const W = windVec(s[1], t),
        va = Math.hypot(s[2] - W[0], s[5] - W[1], s[3]);
      for (const o of [openD, openM, ...XC.map((c) => c.open)]) fillStep(o, t, va);
    }
    {
      const bl = Math.hypot(s[6], s[7], s[8]) || 1;
      s[6] /= bl;
      s[7] /= bl;
      s[8] /= bl;
      const wb = s[9] * s[6] + s[10] * s[7] + s[11] * s[8];
      s[9] -= wb * s[6];
      s[10] -= wb * s[7];
      s[11] -= wb * s[8];
    }
    if (phase === "flight" && !tumbling) {
      const W = windVec(s[1], t),
        vrx = s[2] - W[0],
        vry = s[5] - W[1],
        vrr = Math.hypot(vrx, vry, s[3]);
      if (st.tApo == null && vrr > 10 && (s[6] * vrx + s[7] * vry + s[8] * s[3]) / vrr < TUMBLE_COS) {
        // turned too far from the airflow to recover: tumbling (not the slow arc-over at apogee)
        tumbling = true;
        st.tumble = { t, alt: s[1], v: vrr, powered: thrust(t) > 0 };
        // keep it turning end over end at a plausible rate for the animation
        let w = Math.hypot(s[9], s[10], s[11]);
        const wl = Math.min(Math.max(w, Math.PI), 6 * Math.PI);
        if (w < 1e-6) {
          s[9] = 0;
          s[10] = wl;
          s[11] = 0;
        } else {
          s[9] *= wl / w;
          s[10] *= wl / w;
          s[11] *= wl / w;
        }
      }
    }
  }
  /**
   * On the way up: the fastest speed, Mach number and acceleration, the peak dynamic pressure and nose temperature,
   * the transonic window, and the angle of attack.
   */
  function trackAscent() {
    if (phase !== "drogue" && phase !== "main" && phase !== "free" && st.tApo == null) {
      st.maxV = Math.max(st.maxV, sp);
      st.maxMach = Math.max(st.maxMach, sp / atm.a);
      st.maxAcc = Math.max(st.maxAcc, acc);
      if (phase !== "rail") {
        const W = windVec(z, t),
          va = Math.hypot(vx - W[0], vy - W[1], vz),
          Mn = va / atm.a,
          q = 0.5 * atm.rho * va * va,
          T0 = atm.T * (1 + 0.2 * Mn * Mn);
        if (!st.maxQ || q > st.maxQ.q) st.maxQ = { q, t, alt: z, M: Mn };
        if (!st.maxT0 || T0 > st.maxT0.T) st.maxT0 = { T: T0, t, M: Mn, alt: z }; // stagnation temperature at the nose tip
        if (Mn >= 0.8) {
          if (st.mach08 == null) st.mach08 = t;
          st.mach08end = t;
        }
      } // transonic window, for altimeter Mach lockouts
      if (phase === "flight" && vz > 0 && !tumbling) {
        const W = windVec(z, t),
          vrx = vx - W[0],
          vry = vy - W[1],
          vrr = Math.hypot(vrx, vry, vz);
        if (vrr > 15) {
          const aoa =
            (Math.acos(Math.max(-1, Math.min(1, (s[6] * vrx + s[7] * vry + s[8] * vz) / vrr))) * 180) / Math.PI;
          st.maxAoA = Math.max(st.maxAoA || 0, aoa);
        }
      }
    }
  }
  /**
   * Staging, ignition and burnout as they come; the drogue leg's speed; the weathercocking cone; and when the motor's
   * charge fires.
   */
  function stagingEvents() {
    if (three && !st.sep1 && t >= t1Sep - 1e-9) {
      st.sep1 = { t, alt: z, v: sp, x };
      firstStart = { t, s: s.slice(), ej: S1.bEjDelay != null ? M1.tb + S1.bEjDelay : null };
      if (phase === "rail") st.error = "The first stage burns out before the rocket leaves the rail.";
    }
    if (three && midOK && !st.ignMid && t >= tOff - 1e-9) st.ignMid = { t, alt: z, v: sp, vz, tilt: tiltNow };
    // side boosters dropping away
    for (const b of SB)
      if (!b.done && t >= b.t - 1e-9) {
        b.done = true;
        (st.sbSep || (st.sbSep = [])).push({ t, alt: z, v: sp });
      }
    if (staged && midOK && !st.sep && t >= tSep - 1e-9) {
      st.sep = { t, alt: z, v: sp, x };
      boosterStart = { t, s: s.slice(), ej: D.bEjDelay != null && midOK ? tBurnB + D.bEjDelay : null };
      if (phase === "rail") st.error = "The booster burns out before the rocket leaves the rail.";
    }
    // sustainer ignition lockouts (as on staging altimeters): no ignition below a set height or past a set tilt
    if (staged && !st.ign && !st.ignLocked && ignOK && t >= tIgn - 1e-9) {
      const lowAlt = (L.ignMinAlt || 0) > 0 && z < L.ignMinAlt,
        tooTilted = (L.ignMaxTilt || 0) > 0 && tiltNow > L.ignMaxTilt;
      if (lowAlt || tooTilted) {
        ignOK = false;
        st.ignLocked = { t, alt: z, tilt: tiltNow, why: lowAlt ? "alt" : "tilt" };
        if (depMode === "motor") tDep = null;
      } else st.ign = { t, alt: z, v: sp, vz, tilt: tiltNow };
    }
    if (st.burnAlt === null && ignOK && t >= susEnd() - 1e-9) {
      st.burnAlt = z;
      st.burnTilt = tiltNow;
      // average acceleration to burnout: the speed gained over the time it took
      st.avgAccBurn = t > 0 ? sp / t : null;
    }
    // drogue descent: the fastest it falls (vertically) once the drogue is fully open, until the main opens; and the
    // fastest under the drogue at all, for when the main opens before the drogue has filled
    if (phase === "drogue") {
      if (-vz > (st.drogueAnyV || 0)) st.drogueAnyV = -vz;
      if (openD && openD.s >= openD.sf && -vz > (st.drogueMaxV || 0)) st.drogueMaxV = -vz;
    }
    // weathercocking cone: the airframe's tilt while a motor is burning, and how far off vertical the flight path is seen from the pad
    if (phase === "flight" && !tumbling && t <= susEnd() + 1e-9) st.powerTilt = Math.max(st.powerTilt || 0, tiltNow);
    if (phase === "flight" && st.tApo == null && z > Math.max(2 * L.rail, 15))
      st.pathAngle = Math.max(st.pathAngle || 0, (Math.atan2(Math.hypot(x, y), z) * 180) / Math.PI);
    if (depMode === "motor") {
      const fc = ignOK ? firstCharge() : null;
      tDep = fc != null ? fc + Math.max(0, D.ejChuteDelay || 0) : null;
    }
  }
  /**
   * On the rail: leaving it (with the tip-off as the front guide clears). Off it: apogee, the deployments and the
   * phase changes that follow.
   * @returns {boolean} true if the flight is over
   */
  function railOrFlight() {
    if (phase === "rail") {
      const dist = x * rx + y * ry + z * rz;
      if (dist >= L.rail) {
        phase = "flight";
        // the moment it reaches the end of the rail, inside this step: speed by constant acceleration over the step
        // (v² grows linearly with distance), time by the mean speed over the last bit
        const p = railPrev,
          f = dist > p.d ? Math.min(Math.max((L.rail - p.d) / (dist - p.d), 0), 1) : 1,
          vExit = Math.sqrt(Math.max(p.v * p.v + (sp * sp - p.v * p.v) * f, 0));
        st.offRail = vExit;
        st.offRailT = p.v + vExit > 1e-9 ? p.t + (2 * (L.rail - p.d)) / (p.v + vExit) : t;
        s[6] = rx;
        s[7] = ry;
        s[8] = rz;
        s[9] = s[11] = 0;
        s[10] = TIPOFF;
        // stability as it leaves the rail in this wind: the crosswind sets its angle of attack, and body lift moves the
        // CP forward with that angle; and how well it damps its wobble there
        {
          const W = windVec(z, t),
            ux = vExit * rx - W[0],
            uy = vExit * ry - W[1],
            uz = vExit * rz,
            va = Math.hypot(ux, uy, uz);
          if (va > 0.5) {
            const deg = (Math.acos(Math.max(-1, Math.min(1, (rx * ux + ry * uy + rz * uz) / va))) * 180) / Math.PI,
              GG = Gat(t),
              Mn = va / atm.a,
              J0 = inertia(t),
              cpA = cpAtAoA(GG, Math.min(deg, 17), Mn);
            st.railAoA = deg;
            st.railMargin = (cpA - J0.cg) / (2 * GG.R);
            st.railPct = ((cpA - J0.cg) / GG.L) * 100;
            st.dampRail = pitchDamping(cnaPartsM(GG, Mn), J0, atm.rho, va, GG.Aref);
          }
        }
        // on a leaning rail the front guide leaves first and the rocket pivots nose-down about the aft guide until it clears
        const lean = Math.sqrt(Math.max(1 - rz * rz, 0));
        if (lean > 0.005 && sp > 1) {
          const gd = GUIDES,
            J0 = inertia(t),
            arm = gd.aft - J0.cg;
          if (arm > 0 && gd.gap > 0) {
            const mm = mass(t),
              alp = (mm * 9.80665 * lean * arm) / (J0.I + mm * arm * arm),
              wTip = (alp * gd.gap) / sp;
            let ax = -ry,
              ay = rx;
            const al = Math.hypot(ax, ay) || 1; // ẑ × b: the axis the rocket droops about
            s[9] += (wTip * ax) / al;
            s[10] += (wTip * ay) / al;
            st.pivotTip = wTip;
          }
        }
      } else if (t > (three ? M1.tb : staged ? MB.tb : MS.tb) + 1) {
        st.error = "Thrust never exceeds weight. The rocket does not leave the rail.";
        return true;
      }
      if (phase === "rail") railPrev = { d: dist, v: sp, t };
    } else {
      if (st.tApo == null && vz < 0 && t > 0.2) {
        if (three && t < tOff) {
          midOK = false;
          st.midAfterApogee = true;
        }
        if (staged && (t < tIgn || !midOK)) {
          ignOK = false;
          st.ignAfterApogee = true;
          if (depMode === "motor") tDep = null;
        }
        st.tApo = t;
        st.maxAlt = z;
        st.xApo = x;
        st.windApo = Math.hypot(...windVec(z));
        st.vApo = sp;
        /* a perfectly straight climb in still air reaches apogee with the axis exactly along the fall line, a balance no
           real rocket holds: a small turn rate (about 3°/s) stands in for its asymmetries, so the falling rocket's own
           aerodynamics decide how it comes down */
        if (phase === "flight" && !tumbling && Math.hypot(s[9], s[10], s[11]) < 0.05) {
          const [bx_, by_, bz_] = [s[6], s[7], s[8]];
          let kx = 0,
            ky = bz_,
            kz = -by_,
            kl = Math.hypot(kx, ky, kz);
          if (kl < 1e-6) {
            kx = -bz_;
            ky = 0;
            kz = bx_;
            kl = Math.hypot(kx, kz) || 1;
          }
          s[9] += (0.05 * kx) / kl;
          s[10] += (0.05 * ky) / kl;
          s[11] += (0.05 * kz) / kl;
        }
        if (depMode === "apogee") tDep = t + depDelay;
      }
      /* the motor's delay charge fires. As in OpenRocket, it opens only the chutes set to open at the motor ejection charge
         (the first chute through tDep, others through their own events). A live charge that fires while a chute set to
         open some other way is still packed is recorded for a safety warning: in the real rocket it could blow that
         chute out early or damage the rocket. */
      if (ignOK && chargeTimes().some((tc, i) => !((ejSeen >> i) & 1) && t >= tc - 1e-9)) {
        const ct = chargeTimes();
        ct.forEach((tc, i) => {
          if (t >= tc - 1e-9) ejSeen |= 1 << i;
        });
        // the charge pushes on the compartment nearest the tail: what's packed there matters
        const aftMain = !dual || D.aftChute === "main" || !(drogueDia > 0);
        if (!noChute && depMode !== "motor") {
          if (phase === "flight")
            ejLives.push({
              t,
              alt: z,
              v: airSp(z, vx, vy, vz, t),
              packed: !dual ? "chute" : aftMain ? "main" : "drogue",
            });
          else if (dual && aftMain && (phase === "drogue" || phase === "free") && !(mainAlt >= z))
            ejLives.push({ t, alt: z, v: airSp(z, vx, vy, vz, t), packed: "main" });
        }
      }
      if (phase === "flight" && ((tDep != null && t >= tDep - 1e-9) || (noChute && st.tApo != null))) {
        // the first chute opens (or, with none, it starts tumbling at apogee)
        st.tDeploy = t;
        st.vDeploy = airSp(z, vx, vy, vz, t);
        st.altDeploy = z;
        if (noChute) {
          phase = "free";
          st.noChute = true;
        } // nothing to open: it tumbles down
        // the altimeter's main charge only fires on the way down: below the main altitude after apogee
        else if (mainAlt >= z && st.tApo != null) {
          phase = "main";
          st.tMain = t;
        } else phase = drogueDia > 0 ? "drogue" : "free";
      } else if (
        !noChute &&
        (phase === "drogue" || phase === "free" || (phase === "flight" && plugSkip && dual)) &&
        z <= mainAlt &&
        st.tApo != null
      ) {
        if (phase === "flight") {
          st.tDeploy = t;
          st.vDeploy = airSp(z, vx, vy, vz, t);
          st.altDeploy = z;
        } // a plugged motor's drogue never came out: the main is the first to open
        phase = "main";
        st.tMain = t;
      }
    }
    return false;
  }
  /**
   * Other chutes opening, phase changes, opening shocks, the highest point, and the stability and flutter margins
   * through the climb.
   */
  function chutesAndStats() {
    if (XC.length && phase !== "rail")
      for (const c of XC) {
        if (c.open) continue;
        const due =
          c.ev === "altitude"
            ? st.tApo != null && z <= c.alt
            : c.ev === "launch"
              ? t >= c.dd
              : c.ev === "ejection"
                ? ignOK && firstCharge() != null && t >= firstCharge() + c.dd
                : st.tApo != null && t >= st.tApo + c.dd;
        if (due) {
          const W = windVec(z, t),
            va = Math.hypot(vx - W[0], vy - W[1], vz);
          c.open = opening(t, va, c.d);
          (st.extraOpen || (st.extraOpen = [])).push({ t, alt: z, ev: c.ev });
        }
      }
    if (phase !== prevPh) {
      const W = windVec(z, t),
        va = Math.hypot(vx - W[0], vy - W[1], vz);
      if (phase === "drogue" && !openD) openD = opening(t, va, drogueDia);
      if (phase === "main" && !openM) openM = opening(t, va, D.mainDia);
      prevPh = phase;
    }
    // opening shock: the largest drag on the recovery harness while each canopy fills (and just after)
    if (phase === "drogue" || phase === "main") {
      const W = windVec(z, t),
        va = Math.hypot(vx - W[0], vy - W[1], vz),
        F = 0.5 * atm.rho * va * va * chuteCdA(phase, t),
        ml = D.dryMass + m.totalMass - m.propMass;
      for (const [o, k] of [
        [openD, "shockD"],
        [openM, "shockM"],
      ])
        if (o && t <= o.t + 3 * o.tf + 0.5 && (!st[k] || F > st[k].F))
          st[k] = { F, g: F / (ml * 9.80665), t, v: o.v, alt: z };
    }
    st.maxAlt = Math.max(st.maxAlt, z);
    if (z + (L.elev || 0) > 85000 && !st.rarefied) st.rarefied = { t, alt: z };
    if (phase === "flight" && !tumbling) {
      const pr = Math.abs(s[12]);
      st.maxRoll = Math.max(st.maxRoll || 0, pr);
      if (st.burnRoll == null && ignOK && t >= susEnd() - 1e-9) st.burnRoll = pr;
      // roll lock-in: the roll rate sitting at the pitch frequency, where any small trim or mass asymmetry is driven into a growing coning motion
      const wn = pitchRate(t, s),
        W = windVec(s[1], t),
        vrr = Math.hypot(s[2] - W[0], s[5] - W[1], s[3]);
      if (wn > 0.5 && pr > 0.5 && vrr > 15 && st.tApo == null) {
        const r = pr / wn;
        if (st.rollPrev != null && (st.rollPrev - 1) * (r - 1) <= 0 && !st.rollCross)
          st.rollCross = { t, alt: z, v: vrr, f: wn / (2 * Math.PI) };
        st.rollPrev = r;
        if (r > 0.85 && r < 1.15) {
          if (st.rollNear == null) st.rollNear = t;
          const dur = t - st.rollNear;
          if (dur > (st.rollLock ? st.rollLock.dur : 0))
            st.rollLock = { t: st.rollNear, dur, alt: z, v: vrr, f: wn / (2 * Math.PI) };
        } else st.rollNear = null;
      }
    }
    // stability through the climb: the CP moves with Mach number and the CG moves as propellant burns;
    // and fin flutter: the estimated flutter speed at this height against the airspeed
    if (phase === "flight" && !tumbling && st.tApo == null) {
      const W = windVec(s[1], t),
        vrr = Math.hypot(s[2] - W[0], s[5] - W[1], s[3]);
      if (vrr > 20) {
        const GG = Gat(t),
          Mn = vrr / atm.a,
          C = cnaPartsM(GG, Mn),
          J = inertia(t),
          mg = (cpWithBodyLift(GG, C.cn, C.cp) - J.cg) / (2 * GG.R);
        if (!st.minMargin || mg < st.minMargin.cal) st.minMargin = { cal: mg, M: Mn, t, alt: z };
        if (Mn >= (st.mMaxMach || 0)) {
          st.mMaxMach = Mn;
          st.marginAtMaxMach = mg;
          st.dampMax = pitchDamping(C, J, atm.rho, vrr, GG.Aref);
        }
        for (const f of GG.fins) {
          const fl = flutterSpeed(f, atm);
          if (fl) {
            const r = vrr / fl.vf;
            if (!st.flutter || r > st.flutter.ratio)
              st.flutter = { ratio: r, vf: fl.vf, v: vrr, t, alt: z, M: Mn, G: fl.G, est: fl.est, mat: fl.mat };
          }
        }
      }
    }
  }
  /**
   * Touchdown: the moment, place and speed it hit the ground (stepping back inside the last step).
   * @returns {boolean} true if the flight is over
   */
  function landing() {
    if (phase !== "rail" && z <= 0 && t > 0.5) {
      const back = vz < -1e-6 ? Math.min(z / vz, dt) : 0; // step back to the moment it touched the ground
      st.tLand = t - back;
      st.drift = x - vx * back;
      st.driftY = y - vy * back;
      // speed hitting the ground (over the ground, wind drift included, as OpenRocket's ground hit velocity), and its
      // vertical part
      st.vLand = Math.hypot(vx, vy, vz);
      st.vLandZ = Math.max(0, -vz);
      st.landed = true;
      if (st.tDeploy == null) st.noDeploy = true;
      return true;
    }
    return false;
  }
  while (t < 3600) {
    // up to an hour: a slow descent from very high apogees
    dt = stepSize();
    for (const bp of breaks) {
      if (t < bp - 1e-9 && t + dt > bp) dt = bp - t;
    }
    const step = rk4Step((tt, ss) => deriv(tt, ss, phase), t, s, dt);
    s = step.s;
    acc = step.k1[step.k1.length - 1];
    t += dt;
    afterStep();
    [x, z, vx, vz, y, vy] = s;
    sp = Math.hypot(vx, vy, vz);
    atm = atmosphere(L, Math.max(z, 0));
    if (skin && (phase === "rail" || phase === "flight")) {
      // heat (or cool) the skin over this step, at the step's end state
      const G = Gat(t),
        q = skinHeating(G, sp, atm, skin.T);
      skinStep(skin, G.skin, skinT0, t, dt, q.h, q.Taw);
      if (skin.T > skin.max) st.skinMax = skin.max = skin.T;
    }
    tiltNow = (Math.acos(Math.max(-1, Math.min(1, s[8]))) * 180) / Math.PI;
    trackAscent();
    stagingEvents();
    if (railOrFlight()) break;
    chutesAndStats();
    if (t - lastRec >= (powered(t) || phase === "rail" ? 0.01 : 0.05) - 1e-9)
      recordSample(x, y, z, vx, vy, vz, tiltNow);
    if (landing()) break;
  }
  const atm0 = atmosphere(L, 0),
    mLand = D.dryMass + m.totalMass - m.propMass;
  const term = (CdA, mm = mLand) => (CdA > 0 ? Math.sqrt((2 * mm * g) / (atm0.rho * CdA)) : null);
  st.drogueRate = drogueDia > 0 ? term(CdAdrogue) : null;
  st.single = !dual;
  st.mainRate = noChute && !XCtot ? null : term(CdAmain + CdAdrogue + XCtot);
  st.tumbleRate = term(Gs.tumbleCdA);
  st.noChute = noChute;
  // the sustainer's (or only) motor's ejection charge, if it lit and the charge fires before landing
  if (D.ejDelay != null && ignOK) {
    const te = susEnd() + D.ejDelay;
    if (st.tLand == null || te <= st.tLand + 1e-6) st.tEject = te;
  }
  if (ignOK && XEJ.length)
    st.tEjectX = XEJ.map((e) => ({ t: tIgn + e.rel, name: e.name, delay: e.ej, n: e.n })).filter(
      (e) => st.tLand == null || e.t <= st.tLand + 1e-6,
    );
  // a charge within 1.5 s of apogee, pushing on a drogue or single chute, is the usual motor backup: no warning
  for (const e of ejLives) {
    e.dt = st.tApo != null ? e.t - st.tApo : null;
    if (!(e.packed !== "main" && e.dt != null && Math.abs(e.dt) <= 1.5)) {
      st.ejLive = e;
      break;
    }
  }
  st.tb = staged ? susEnd() : MS.tb;
  st.landMass = mLand;
  st.depMode = depMode;
  st.depDelay = depDelay;
  if (plugSkip && !st.noChute) st.plugSkip = true;
  // the apogee the rocket would reach if nothing opened early: the reference for chute timing and the ideal delay
  st.tApoFree = st.tApo;
  if (!opts.noRef && (depMode !== "apogee" || depDelay > 0 || st.ejLive)) {
    const ref = simulate({ ...D, deployMode: "apogee", deployDelay: 0, ejDelay: null }, L, m, mb, { noRef: true }).st;
    st.tApoFree = ref.tApo;
    st.maxAltFree = ref.maxAlt;
  }
  st.liftMass =
    D.dryMass + m.totalMass + (staged ? D.bDryMass + mb.totalMass : 0) + (three ? S1.bDryMass + mb1.totalMass : 0);
  st.Itot = MS.Itot;
  const MT = three ? M1 : staged ? MB : MS;
  st.ttw = MT.peak / (st.liftMass * g);
  st.avgTtw = MT.Itot / MT.tb / (st.liftMass * g);
  st.cdLow = cdParts(Gs, 0.3 * atm0.a, atm0).cd;
  if (staged) {
    st.tSep = tSep;
    st.tIgn = tIgn;
    st.boosterTb = MB.tb;
    st.susTb = MS.tb;
    if (D.bEjDelay != null && midOK) st.tBEject = tOff + MB.tb + D.bEjDelay;
    st.cdStack = cdParts(Gst, 0.3 * atm0.a, atm0).cd;
    if (boosterStart) Object.assign(st, { booster: flyBooster(D, L, mb, boosterStart, windVec, out) });
    if (three) {
      st.three = true;
      st.tSep1 = t1Sep;
      st.firstTb = M1.tb;
      st.tIgnMid = tOff;
      st.midOK = midOK;
      st.cdStack3 = cdParts(Gst3, 0.3 * atm0.a, atm0).cd;
      if (S1.bEjDelay != null) st.tB1Eject = M1.tb + S1.bEjDelay;
      if (firstStart) st.first = flyBooster(S1, L, mb1, firstStart, windVec, out, "b1");
    }
  }
  return { out, st };
}
/**
 * One classic fourth-order Runge–Kutta step.
 * @param {function(number, number[]): number[]} f the derivative of the state at a time
 * @param {number} t
 * @param {number[]} s the state at t
 * @param {number} dt
 * @returns {{s: number[], k1: number[]}} the state at t + dt, and the derivative at the start
 */
function rk4Step(f, t, s, dt) {
  const k1 = f(t, s);
  const s2 = s.map((v, i) => v + (k1[i] * dt) / 2),
    k2 = f(t + dt / 2, s2);
  const s3 = s.map((v, i) => v + (k2[i] * dt) / 2),
    k3 = f(t + dt / 2, s3);
  const s4 = s.map((v, i) => v + k3[i] * dt),
    k4 = f(t + dt, s4);
  return { s: s.map((v, i) => v + (dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) / 6), k1 };
}
/**
 * Fly a dropped stage down on its own from separation: a point mass with drag (nose first if it's stable,
 * tumbling if not) and its parachute on its own deployment setting.
 * @param {object} D the stage's design (the booster fields of a design, or the first stage's)
 * @param {object} L launch conditions
 * @param {object} mb its motor
 * @param {object} start separation: t, state s, and ej (time its motor's charge fires, or null)
 * @param {function} windVec the wind at a height and time, from the main flight
 * @param {object} out the main flight's time series, to which its path is added under key+"t", key+"alt", key+"xp"
 * @param {string} [key="b"] "b" for the booster, "b1" for the first stage
 * @returns {object} its apogee, landing time and place, descent rate, deployment time, mass, stability and any live
 *   charge that fired while its chute was packed (ejLive)
 */
function flyBooster(D, L, mb, start, windVec, out, key = "b") {
  const g = 9.80665,
    GB = aero(boosterDesign(D)),
    mBo = D.bDryMass + mb.totalMass - mb.propMass;
  const caseMass = mb.totalMass - mb.propMass,
    xCase = D.bLength + (D.bOverhang || 0) - mb.len / 2;
  const cgB = (D.bDryMass * D.bCg + caseMass * xCase) / mBo,
    cpB = cpOf(GB);
  const stable = (cpB - cgB) / (2 * GB.R) > 0.5;
  const chute = D.bRecovery === "chute" && D.bChuteDia > 0 ? D.bChuteCd * Math.PI * (D.bChuteDia / 2) ** 2 : 0;
  let t = start.t,
    s = start.s.slice(0, 6),
    ph = "coast",
    apo = s[1],
    tApo = null,
    tDep = null;
  // the stage's chute opens on its own event: apogee plus a delay, an altitude on the way down, the motor's ejection charge, or a timer
  const ev = D.bChuteEv || "apogee",
    dd = Math.max(0, D.bChuteDelay || 0),
    dAlt = D.bChuteAlt || 0;
  const due = () =>
    ev === "altitude"
      ? tApo != null && s[1] <= dAlt
      : ev === "launch"
        ? t >= dd
        : ev === "ejection"
          ? start.ej != null && t >= start.ej + dd
          : tApo != null && t >= tApo + dd;
  // the earth's rotation (Coriolis), as for the main flight
  const OM = 7.2921159e-5,
    latR = ((L.lat ?? 40) * Math.PI) / 180,
    hdg = ((((L.windDir ?? 270) + 180) % 360) * Math.PI) / 180;
  const Ox = OM * Math.cos(latR) * Math.cos(hdg),
    Oy = OM * Math.cos(latR) * Math.sin(hdg),
    Oz = OM * Math.sin(latR);
  const OT = (out[key + "t"] = []),
    OA = (out[key + "alt"] = []),
    OX = (out[key + "xp"] = []);
  const f = (ss, p, tt) => {
    const [x, z, vx, vz, y, vy] = ss,
      atm = atmosphere(L, Math.max(z, 0)),
      W = windVec(z, tt),
      vrx = vx - W[0],
      vry = vy - W[1],
      vr = Math.hypot(vrx, vry, vz);
    const CdA =
      p === "chute"
        ? chute || GB.tumbleCdA
        : p === "coast"
          ? stable
            ? cdParts(GB, vr, atm).cd * GB.Aref
            : GB.tumbleCdA
          : GB.tumbleCdA;
    const Fd = 0.5 * atm.rho * vr * vr * CdA,
      dx = vr > 1e-6 ? vrx / vr : 0,
      dy = vr > 1e-6 ? vry / vr : 0,
      dz = vr > 1e-6 ? vz / vr : 0;
    const gz = g * (6371000 / (6371000 + Math.max(z, 0))) ** 2;
    return [
      vx,
      vz,
      (-Fd * dx) / mBo - 2 * (Oy * vz - Oz * vy),
      (-Fd * dz) / mBo - gz - 2 * (Ox * vy - Oy * vx),
      vy,
      (-Fd * dy) / mBo - 2 * (Oz * vx - Ox * vz),
    ];
  };
  let last = -1,
    ejB = false,
    liveB = null;
  while (t < start.t + 3600) {
    let dt = ph === "coast" ? 0.01 : 0.05;
    if (ph === "chute" && chute) {
      const atm = atmosphere(L, Math.max(s[1], 0)),
        v = Math.hypot(s[2], s[3], s[5]);
      dt = Math.min(dt, Math.max((0.5 * mBo) / (atm.rho * chute * Math.max(v, 1)), 0.002));
    }
    const k1 = f(s, ph, t),
      k2 = f(
        s.map((v, i) => v + (k1[i] * dt) / 2),
        ph,
        t + dt / 2,
      ),
      k3 = f(
        s.map((v, i) => v + (k2[i] * dt) / 2),
        ph,
        t + dt / 2,
      ),
      k4 = f(
        s.map((v, i) => v + k3[i] * dt),
        ph,
        t + dt,
      );
    s = s.map((v, i) => v + (dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) / 6);
    t += dt;
    if (ph === "coast" && s[3] < 0) {
      ph = "down";
      tApo = t;
    }
    // the booster's own delay charge firing while its chute, set to open some other way, is still packed
    if (!ejB && start.ej != null && t >= start.ej) {
      ejB = true;
      if (chute && ph !== "chute" && ev !== "ejection") liveB = { t, alt: s[1], v: Math.hypot(s[2], s[3], s[5]) };
    }
    if (ph !== "chute" && chute && due()) {
      ph = "chute";
      tDep = t;
    }
    apo = Math.max(apo, s[1]);
    if (t - last >= 0.1) {
      OT.push(t);
      OA.push(Math.max(s[1], 0));
      OX.push(s[0]);
      last = t;
    }
    if (s[1] <= 0) {
      OT.push(t);
      OA.push(0);
      OX.push(s[0]);
      break;
    }
  }
  const atm0 = atmosphere(L, 0);
  // a charge within 1.5 s of the booster's own apogee is the usual backup: no warning
  if (liveB) {
    liveB.dt = tApo != null ? liveB.t - tApo : null;
    liveB.packed = "chute";
    if (liveB.dt != null && Math.abs(liveB.dt) <= 1.5) liveB = null;
  }
  return {
    apogee: apo,
    tApo,
    tLand: t,
    drift: s[0],
    driftY: s[4],
    rate: Math.sqrt((2 * mBo * g) / (atm0.rho * (chute || GB.tumbleCdA))),
    chute: chute > 0,
    tDeploy: tDep,
    mass: mBo,
    stable,
    margin: (cpB - cgB) / (2 * GB.R),
    ejLive: liveB,
  };
}
/* airframe turning inertia (pitch moment of inertia about its own CG, without motors): from the design file or typed in,
   scaled with the weight if that changes later; otherwise the weight spread evenly along the airframe */
/**
 * Airframe pitch moment of inertia about its own CG, without motors (see the note above).
 * @param {number} I0 inertia from the design file or typed in (0 if none), kg·m²
 * @param {number} m0 dry mass that I0 was given for, kg
 * @param {number} m current dry mass, kg
 * @param {number} len airframe length, m
 * @returns {number} kg·m²
 */
export function airInertia(I0, m0, m, len) {
  return I0 > 0 ? I0 * (m0 > 0 ? m / m0 : 1) : (m * len * len) / 12;
}
