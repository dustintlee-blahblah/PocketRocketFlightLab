/* ---------- drag calibration ----------
   One drag multiplier for this rocket, fitted to the logged flights marked "Use for calibration" (see the Flight Log),
   kept on this device with the design's flight log. */
var CAL_STORE = "rfs-cal";
// before the flight log, a calibration was kept under the file and rocket names
function calKeyOld() {
  return `${(SOURCE && SOURCE.name) || ""}|${D.name || ""}`;
}
function calKey() {
  return flKey();
}
function calGet() {
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
function calSet(v) {
  const m = store.get(CAL_STORE, {}),
    k = calKey();
  if (v) m[k] = v;
  else delete m[k];
  store.set(CAL_STORE, m);
}
function applyCal() {
  const c = calGet();
  D.dragScale = c && c.k > 0 ? c.k : 1;
}
// the drag multiplier that makes a run reach the measured apogee (apogee falls as drag rises, so bisect)
function solveDragScale(target, ctx) {
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
