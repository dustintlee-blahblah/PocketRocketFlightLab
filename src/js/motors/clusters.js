/**
 * Motor clusters and airstarts: the motors of one stage combined into a single motor object whose thrust curve is the
 * sum of theirs, each shifted by its own ignition delay.
 */
import { OLD_MOTOR_IDS } from "../../data/old-motor-ids.js";
import { allMotors, curBoost, curFirst, curMotor, D } from "../design/defaults.js";
/* ---------- motor clusters: the motors in a stage add their thrust; an extra motor can light a set time after the
   main one (an airstart), so its thrust curve starts that much later ---------- */
/**
 * Built cluster motors by their makeup key, so the same cluster keeps the same object (and cached stats).
 */
const clusterCache = new Map();
/**
 * A motor by id, from the catalog or the uploaded motors; older catalog ids are mapped to the current ones.
 * @param {string} id
 * @returns {object|null}
 */
export function findMotor(id) {
  id = OLD_MOTOR_IDS[id] || id;
  return allMotors().find((m) => m.id === id) || null;
}
/**
 * Combines a main motor with extra motors into one cluster motor (or returns the main motor if there are none).
 * Identical motors lit at the same time are counted together.
 * @param {object} main the main mount's motor
 * @param {{id:string, n:number, d:number}[]} extras extra motors: id, count and delay after the first ignition (s)
 * @param {number} [mainD=0] the main motor's own ignition delay, s
 * @returns {object} a motor object; a cluster also has members, count, cluster: true and airstart
 */
export function clusterOf(main, extras, mainD = 0) {
  // extras: [{id, n, d}] in addition to the main motor; d: seconds after the first motor lights
  const extraList = (extras || [])
    .map((e) => ({ m: findMotor(e.id), n: Math.max(1, Math.round(e.n || 1)), d: Math.max(0, +e.d || 0) }))
    .filter((e) => e.m);
  if (!extraList.length) return main;
  const members = [{ m: main, n: 1, d: Math.max(0, +mainD || 0) }];
  for (const e of extraList) {
    const same = members.find((x) => x.m.id === e.m.id && Math.abs(x.d - e.d) < 1e-6);
    if (same) same.n += e.n;
    else members.push({ ...e });
  }
  const key = members.map((e) => e.m.id + "*" + e.n + (e.d ? "@" + e.d : "")).join("|");
  if (clusterCache.has(key)) return clusterCache.get(key);
  const thrustAt = (m, t) => {
    const T = m.t;
    if (t <= T[0] || t >= T[T.length - 1]) return t === T[0] ? m.F[0] : 0;
    let i = 1;
    while (T[i] < t) i++;
    const frac = (t - T[i - 1]) / (T[i] - T[i - 1] || 1);
    return m.F[i - 1] + frac * (m.F[i] - m.F[i - 1]);
  };
  // every curve's own time points, shifted by its motor's ignition delay
  const t = [...new Set(members.flatMap((e) => e.m.t.map((x) => +(x + e.d).toFixed(6))))].sort((a, b) => a - b);
  const F = t.map((x) => members.reduce((a, e) => a + (x >= e.d - 1e-9 ? e.n * thrustAt(e.m, x - e.d) : 0), 0));
  const late = members.filter((e) => e.d > 0);
  const totalMass = members.reduce((a, e) => a + e.n * e.m.totalMass, 0),
    propMass = members.reduce((a, e) => a + e.n * e.m.propMass, 0);
  const count = members.reduce((a, e) => a + e.n, 0),
    label = (e, k) => (e.n > 1 ? e.n + "× " : "") + (k === "cn" ? e.m.cn || e.m.name : e.m.name);
  const mfrs = [...new Set(members.map((e) => e.m.mfr))];
  const cluster = {
    id: "cluster:" + key,
    name: members.map((e) => label(e, "name")).join(" + "),
    cn: members.map((e) => label(e, "cn")).join(" + "),
    brand: main.brand,
    mfr: mfrs.length === 1 ? mfrs[0] : "Mixed",
    dia: Math.max(...members.map((e) => e.m.dia)),
    len: members.reduce((a, e) => a + e.n * e.m.totalMass * e.m.len, 0) / totalMass, // mass-weighted, so the cluster's CG lands where the motors' combined CG is
    delays: "",
    case:
      `Cluster of ${count} motors` +
      (late.length ? `, ${late.map((e) => `${e.n}× ${e.m.cn || e.m.name} lit ${e.d} s later`).join(", ")}` : ""),
    prop: [...new Set(members.map((e) => e.m.prop).filter(Boolean))].join(", "),
    sys: main.sys,
    totalMass,
    propMass,
    t,
    F,
    members,
    cluster: true,
    count,
    airstart: late.length > 0,
  };
  if (clusterCache.size > 50) clusterCache.clear();
  clusterCache.set(key, cluster);
  return cluster;
}
/**
 * The motors one stage flies on. If the main mount is set never to light, the first extra motor takes its place.
 * @param {object} main the stage's main motor
 * @param {object[]} extras the stage's extra motors
 * @param {number} mainD the main motor's ignition delay, s
 * @param {boolean} mainOff the main mount never lights
 * @returns {object} motor object
 *
 * a stage's motors as flown: the main mount's motor (unless that mount is set never to light, or lights late) with the others
 */
function flightOf(main, extras, mainD, mainOff) {
  const extraList = (extras || []).filter((e) => e && findMotor(e.id));
  if (mainOff && extraList.length) {
    const [e0, ...rest] = extraList;
    return clusterOf(findMotor(e0.id), [...(e0.n > 1 ? [{ ...e0, n: e0.n - 1 }] : []), ...rest], e0.d);
  }
  return clusterOf(main, extras, mainD);
}
/**
 * The sustainer's (or a single stage's) motors as flown.
 * @returns {object} motor object
 */
export function flightMotor() {
  return flightOf(curMotor(), D.extraMotors, D.mainDelay, D.mainOff);
}
/**
 * The booster's motors as flown.
 * @returns {object} motor object
 */
export function flightBoost() {
  return flightOf(curBoost(), D.bExtraMotors, D.bMainDelay, D.bMainOff);
}
/**
 * A three-stage rocket's first-stage motors as flown.
 * @param {object} [Dx=D] design
 * @returns {object} motor object
 */
export function flightFirst(Dx = D) {
  return flightOf(curFirst(), Dx && Dx.s1ExtraMotors, Dx && Dx.s1MainDelay, Dx && Dx.s1MainOff);
}
