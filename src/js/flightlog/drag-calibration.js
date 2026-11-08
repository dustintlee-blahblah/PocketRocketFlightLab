/**
 * Drag calibration (see the note below).
 */
import { store } from "../core/storage.js";
import { D } from "../design/defaults.js";
import { SOURCE } from "../files/save.js";
import { flKey } from "./flight-log.js";
import { simulate } from "../physics/simulate.js";
import { lastSim } from "../ui/results.js";
/* ---------- drag calibration ----------
   One drag multiplier for this rocket, fitted to the logged flights marked "Use for calibration" (see the Flight Log),
   kept on this device with the design's flight log. */
/**
 * The storage key of the calibrations, by design.
 */
export var CAL_STORE = "rfs-cal";
/**
 * The key a calibration was kept under before the flight log (file and rocket names).
 * @returns {string}
 *
 * before the flight log, a calibration was kept under the file and rocket names
 */
export function calKeyOld() {
  return `${(SOURCE && SOURCE.name) || ""}|${D.name || ""}`;
}
/**
 * The open design's calibration key (the same as its flight log's).
 * @returns {string}
 */
export function calKey() {
  return flKey();
}
/**
 * The open design's calibration (moved from its old key if needed), or null.
 * @returns {{k:number}|null} k: the drag multiplier
 */
export function calGet() {
  const m = store.get(CAL_STORE, {}),
    k = calKey();
  if (m[k]) return m[k];
  const o = calKeyOld();
  if (m[o] && o !== k) {
    m[k] = m[o];
    delete m[o];
    store.set(CAL_STORE, m);
    return m[k];
  }
  return null;
}
/**
 * Saves (or with null, removes) the open design's calibration.
 * @param {object|null} v
 */
export function calSet(v) {
  const m = store.get(CAL_STORE, {}),
    k = calKey();
  if (v) m[k] = v;
  else delete m[k];
  store.set(CAL_STORE, m);
}
/**
 * Sets the design's drag multiplier from its calibration (1 without one).
 */
export function applyCal() {
  const c = calGet();
  D.dragScale = c && c.k > 0 ? c.k : 1;
}
/**
 * The drag multiplier (0.5–2) that makes a run reach a measured apogee (apogee falls as drag rises, so bisect).
 * @param {number} target apogee, m
 * @param {object} [ctx] the run's {D, L, m, mb} (the last run by default)
 * @returns {{k:number}|{out:string, lim:number}} k, or out "high"/"low" with the apogee reached at the limit
 *
 * the drag multiplier that makes a run reach the measured apogee (apogee falls as drag rises, so bisect)
 */
export function solveDragScale(target, ctx) {
  const { D: SD, L: SL, m, mb } = ctx || lastSim,
    apo = (k) => simulate({ ...SD, dragScale: k }, SL, m, mb, { noRef: true }).st.maxAlt;
  let lo = 0.5,
    hi = 2;
  const aLo = apo(lo),
    aHi = apo(hi);
  if (target > aLo) return { out: "high", lim: aLo };
  if (target < aHi) return { out: "low", lim: aHi };
  for (let i = 0; i < 14; i++) {
    const mid = Math.sqrt(lo * hi);
    if (apo(mid) > target) lo = mid;
    else hi = mid;
  }
  return { k: Math.sqrt(lo * hi) };
}
