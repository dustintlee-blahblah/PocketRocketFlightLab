/**
 * The Flight Log (see the note below): logging real flights, comparing them with the prediction, and fitting the drag
 * calibration to them.
 */
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import { D, series, setSeries } from "../design/defaults.js";
import { SOURCE } from "../files/save.js";
import { ALT_READINGS, altAtLimit, altimeterById, altimeterName, ALTIMETERS } from "./altimeters.js";
import { applyCal, calGet, calKeyOld, calSet, calStale, solveDragScale } from "./drag-calibration.js";
import { fcOpen } from "./flight-compare.js";
import { altOpenFile, altWaiting, altWaitingGo, prIncomingGo, prPendingAlt } from "./xlsx.js";
import { findMotor, flightFirst } from "../motors/clusters.js";
import { motorStats } from "../motors/motor-files.js";
import { aero, cdParts } from "../physics/aerodynamics.js";
import { atmosphere, baroReading } from "../physics/atmosphere.js";
import { lastMC, MC_K68, MC_K95 } from "../physics/monte-carlo.js";
import { simulate } from "../physics/simulate.js";
import { isThree } from "../physics/staging.js";
import { drawChart, renderSeries } from "../ui/charts.js";
import { lastSim, runAll } from "../ui/results.js";
import { impulseLetter } from "../ui/rso-checklist.js";
import { fmt, fromDisp, toDisp, uname } from "../ui/units.js";
/* ---------- Flight Log: each design's real flights, kept on this device ----------
   A design is known by the id inside its file (RockSim GUID or OpenRocket rocket id), or else by its file and rocket name. */
/**
 * FL_STORE: the storage key; flShow: the flight whose details are open; flEdit: the flight in the form; flNow:
 * per-design caches.
 */
export var flShow = null,
  flEdit = null;
var FL_STORE = "rfs-flightlog",
  flNow = {};
/**
 * The open design's log key: the id inside its file, or else its file and rocket names.
 * @returns {string}
 */
export function flKey() {
  const s = (SOURCE && SOURCE.text) || "";
  let id = null;
  if (s) {
    if (SOURCE.format === "rkt") {
      const m = s.match(/<GUID>\s*([^<\s]+)\s*<\/GUID>/i);
      if (m) id = "guid:" + m[1];
    } else {
      const m = s.match(/<rocket>\s*(?:<name>[^<]*<\/name>\s*)?<id>\s*([^<\s]+)\s*<\/id>/i);
      if (m) id = "orid:" + m[1];
    }
  }
  return id || "file:" + calKeyOld();
}
/**
 * Every design's log entry, by key.
 * @returns {object}
 */
export function flAll() {
  return store.get(FL_STORE, {});
}
/**
 * The open design's flights.
 * @returns {object[]}
 */
export function flList() {
  const e = flAll()[flKey()];
  return e && e.flights ? e.flights : [];
}
/**
 * Saves all logs (warns when the device is out of space).
 * @param {object} all
 * @returns {boolean} saved
 */
export function flSaveAll(all) {
  try {
    localStorage.setItem(FL_STORE, JSON.stringify(all));
    return true;
  } catch (e) {
    prToast("Not enough space on this device to keep that. Export a backup and delete some flights.");
    return false;
  }
}
/** flights you deleted, so opening a design file that still carries them doesn't bring them back */
const FL_DELETED = "rfs-fl-deleted";
/**
 * The ids of flights you deleted.
 * @returns {Set<string>}
 */
export function flDeleted() {
  try {
    const a = JSON.parse(localStorage.getItem(FL_DELETED) || "[]");
    return new Set(Array.isArray(a) ? a : []);
  } catch (e) {
    return new Set();
  }
}
/**
 * Remembers a deleted flight's id (the newest 2000 are kept).
 * @param {string} id
 */
function flMarkDeleted(id) {
  try {
    const a = [...flDeleted()].filter((x) => x !== id);
    a.push(id);
    localStorage.setItem(FL_DELETED, JSON.stringify(a.slice(-2000)));
  } catch (e) {}
}
/**
 * Saves the open design's flights (an empty list removes its entry).
 * @param {object[]} list
 * @returns {boolean}
 */
export function flPut(list) {
  const all = flAll(),
    k = flKey();
  if (list.length) all[k] = { name: D.name || "", file: (SOURCE && SOURCE.name) || "", flights: list };
  else delete all[k];
  return flSaveAll(all);
}
/**
 * A new flight id.
 * @returns {string}
 */
export function flId() {
  return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
/**
 * The motors flown, as text ("booster → sustainer").
 * @param {object} m
 * @param {object} [mb]
 * @returns {string}
 */
export function flMotorName(m, mb) {
  return mb ? `${mb.cn || mb.name} → ${m.cn || m.name}` : m.cn || m.name;
}
/**
 * How far a measured value is from the prediction, %.
 * @param {number} a measured
 * @param {number} pred predicted
 * @returns {number|null}
 */
export function flDiff(a, pred) {
  return a > 0 && pred > 0 ? ((a - pred) / pred) * 100 : null;
}
/**
 * good (under 5%), warn (under 10%) or bad, for a difference.
 * @param {number} d %
 * @returns {string}
 */
export function flCls(d) {
  const a = Math.abs(d);
  return a < 5 ? "good" : a < 10 ? "warn" : "bad";
}
/**
 * A difference as "+3.2%".
 * @param {number|null} d
 * @returns {string}
 */
export function flPct(d) {
  return d == null ? "" : `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%`;
}
/**
 * A flight's date (YYYY-MM-DD) in the local format.
 * @param {string} s
 * @returns {string}
 */
export function flDate(s) {
  if (!s) return "";
  const d = new Date(s + "T12:00:00");
  return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
/**
 * The 16 compass points.
 */
const FL_PTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
/**
 * The compass point of a bearing.
 * @param {number} deg
 * @returns {string}
 */
function flCompass(deg) {
  return FL_PTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
/**
 * A typed direction (compass point or degrees) as degrees.
 * @param {string} s
 * @returns {number|null}
 */
function flParseDir(s) {
  s = String(s || "")
    .trim()
    .toUpperCase();
  if (!s) return null;
  const k = FL_PTS.indexOf(s);
  if (k >= 0) return k * 22.5;
  const v = parseFloat(s);
  return isFinite(v) ? ((v % 360) + 360) % 360 : null;
}
/**
 * The altimeter files kept with a flight (older entries kept just one).
 * @param {object} f flight
 * @returns {object[]}
 */
export function flAltis(f) {
  if (f.altis) return f.altis;
  if (f.alti)
    return [
      {
        ...f.alti,
        apo: f.apo,
        vmax: f.vmax,
        tApo: f.tApo,
        tLand: f.tLand,
        rateHigh: f.rateHigh,
        rateLow: f.rateLow,
        curve: f.curve,
      },
    ];
  return [];
}
/**
 * The motors flown: total impulse and class, the way the certification check counts them.
 * @param {object} m
 * @param {object} [mb]
 * @returns {{I:number, cls:string}|null}
 */
export function flMotorInfo(m, mb) {
  if (!m) return null;
  const expand = (x) => (!x ? [] : x.cluster && x.members ? x.members.flatMap((e) => Array(e.n).fill(e.m)) : [x]),
    ms = [...expand(m), ...expand(mb)];
  const LT = "ABCDEFGHIJKLMNOP",
    lab = (x) => {
      const c = String(x.cn || x.name || "")
        .trim()
        .toUpperCase()
        .match(/^\d*([A-O])\d/);
      return c ? c[1] : impulseLetter(motorStats(x).I);
    };
  const I = ms.reduce((a, x) => a + motorStats(x).I, 0),
    top = ms.reduce((a, x) => (LT.indexOf(lab(x)) > LT.indexOf(a) ? lab(x) : a), "A");
  return { I, cls: ms.length > 1 ? (LT.indexOf(impulseLetter(I)) > LT.indexOf(top) ? impulseLetter(I) : top) : top };
}
/**
 * The liftoff mass of a design on its motors.
 * @param {object} Dd design
 * @param {object} m
 * @param {object} [mb]
 * @returns {number} kg
 */
function flLiftMass(Dd, m, mb) {
  return (
    Dd.dryMass +
    m.totalMass +
    (mb ? (Dd.bDryMass || 0) + mb.totalMass : 0) +
    (mb && isThree(Dd) ? (Dd.s1.bDryMass || 0) + flightFirst(Dd).totalMass : 0)
  );
}
/**
 * The current design set up as the logged flight was flown (its conditions, weight and motors, if this device still
 * has them).
 * @param {object} f flight
 * @returns {{D:object, L:object, m:object, mb:object}|null}
 */
export function flCtx(f) {
  if (!lastSim) return null;
  const m = (f.motorId && findMotor(f.motorId)) || null,
    mb = f.boostId ? findMotor(f.boostId) : null;
  if (!m || (f.boostId && !mb)) return null;
  const L2 = { ...lastSim.L };
  if (f.wind != null) L2.wind = f.wind;
  if (f.tempC != null) L2.tempC = f.tempC;
  if (f.elev != null) L2.elev = f.elev;
  if (f.windDir != null) L2.windDir = f.windDir;
  const mbF = lastSim.D.twoStage ? mb : null;
  let D2 = lastSim.D;
  if (f.mass > 0) {
    const dm = f.mass - flLiftMass(lastSim.D, m, mbF);
    D2 = { ...lastSim.D, dryMass: Math.max(0.005, lastSim.D.dryMass + dm) };
  }
  // the delay flown, where the motor's charge opens the chute: a charge before apogee cuts the climb short
  const dl = parseFloat(f.delay);
  if (isFinite(dl) && dl >= 0 && (D2.deployMode || "apogee") === "motor") D2 = { ...D2, ejDelay: dl };
  return { D: D2, L: L2, m, mb: mbF };
}
/**
 * Flies a flight's setup, optionally with a drag multiplier.
 * @param {object} c from flCtx
 * @param {number} [k] drag multiplier
 * @returns {object|null} flight summary
 */
function flSim(c, k) {
  try {
    const r = simulate(k ? { ...c.D, dragScale: k } : c.D, c.L, c.m, c.mb, { noRef: true }).st;
    return r.error ? null : r;
  } catch (e) {
    return null;
  }
}
/**
 * The drag an altimeter's accelerometer measured in a flight's coast (see altCoast), as a multiple of this design's
 * estimated drag (uncalibrated) at the same speeds and heights: least squares through zero of the deceleration read
 * against the deceleration the estimate gives for the flight's weight, below Mach 0.8 where there are enough readings.
 * Two checks say whether to trust it: the launch weight the boost implies with the motor's rated impulse, and the
 * height the accelerometer makes of the climb against the barometer's.
 * @param {object} f flight
 * @param {object} c from flCtx
 * @returns {object|null} {k, n, m0, m1 (Mach range), mass (boost-implied weight over the entered one, less 1), apo
 *   (accelerometer height over barometer height, less 1), ok, why}, or null without accelerometer data
 */
function flCoast(f, c) {
  const a = flAltis(f).find((x) => x.coast && x.coast.t && x.coast.t.length >= 12);
  if (!a || !c || c.mb || !(a.apo > 0)) return null;
  const C = a.coast,
    Dd = { ...c.D, dragScale: 1 },
    Ad = aero(Dd),
    lift = flLiftMass(Dd, c.m, null),
    mc = lift - (c.m.propMass || 0);
  if (!(mc > 0)) return null;
  // the barometer's height (standard atmosphere) to the true height in the day's air
  const top = Math.max(a.apo, C.hIn, 10) * 1.3,
    zs = [],
    is = [];
  for (let i = 0; i <= 60; i++) {
    zs.push((top * i) / 60);
    is.push(baroReading(c.L, zs[i]));
  }
  const tru = (ind) => {
    let i = 1;
    while (i < 60 && is[i] < ind) i++;
    return zs[i - 1] + ((zs[i] - zs[i - 1]) * (ind - is[i - 1])) / (is[i] - is[i - 1] || 1);
  };
  /**
   * The deceleration the estimate gives at a speed and (barometer) height, and the Mach number.
   */
  const X = (v, h) => {
    const atm = atmosphere(c.L, Math.max(tru(h), 0)),
      vv = Math.max(v, 0.5);
    return [(0.5 * atm.rho * vv * vv * cdParts(Ad, vv, atm).cd * Ad.Aref) / mc, vv / atm.a];
  };
  const pts = C.t.map((_, i) => (C.v[i] > 8 ? [...X(C.v[i], C.h[i]), C.a[i]] : null)).filter(Boolean),
    sub = pts.filter((p) => p[1] < 0.8),
    use = sub.length >= 8 ? sub : pts,
    xz = X(C.vz, C.hz)[0];
  if (use.length < 8) return null;
  let k = 1,
    off = C.zero;
  for (let it = 0; it < 6; it++) {
    off = C.zero + k * xz; // the little drag left where the zero was read
    let sxy = 0,
      sxx = 0;
    for (const [x, , y] of use) {
      sxy += x * -(y - off);
      sxx += x * x;
    }
    k = sxx > 0 ? sxy / sxx : NaN;
  }
  if (!isFinite(k)) return null;
  let tot = 0;
  C.bt.forEach((_, i) => {
    tot += (C.ba[i] - off + k * X(C.bv[i], C.bh[i])[0]) * C.bdt;
  });
  const I = motorStats(c.m).I,
    mass = tot > 0 ? (I / tot + (c.m.propMass || 0) / 2) / lift - 1 : NaN,
    apo = C.hIn / tru(a.apo) - 1,
    ms = use.map((p) => p[1]);
  const why = !(k > 0.3 && k < 3)
    ? "the reading doesn't look like drag"
    : !(Math.abs(mass) <= 0.12)
      ? `the boost says the rocket weighed ${Math.abs(mass * 100).toFixed(0)}% ${mass > 0 ? "more" : "less"} than entered (or the motor gave that much ${mass > 0 ? "less" : "more"}), so the accelerometer, the weight or the motor is off`
      : !(Math.abs(apo) <= 0.08)
        ? `the accelerometer makes the climb ${Math.abs(apo * 100).toFixed(0)}% ${apo > 0 ? "higher" : "lower"} than the barometer, so the flight wasn't straight enough or the sensor drifted`
        : "";
  return { k, n: use.length, m0: Math.min(...ms), m1: Math.max(...ms), mass, apo, ok: !why, why };
}
/**
 * The prediction for a logged flight now.
 * @param {object} f
 * @returns {object|null} flight summary
 */
function flPredict(f) {
  const c = flCtx(f);
  return c ? flSim(c) : null;
}
/**
 * A landing spot as east/north meters from the pad: simulated (drift along the wind) or real (distance and bearing).
 * @param {object} st flight summary
 * @param {number} windDir degrees, the direction the wind blows from
 * @returns {{e:number, n:number}}
 */
function flSimLand(st, windDir) {
  const h = ((((windDir ?? 270) + 180) % 360) * Math.PI) / 180,
    x = st.drift || 0,
    y = st.driftY || 0;
  return { e: x * Math.sin(h) - y * Math.cos(h), n: x * Math.cos(h) + y * Math.sin(h) };
}
/**
 * A logged landing spot as east/north meters from the pad (from its distance and bearing).
 * @param {object} f
 * @returns {{e:number, n:number}|null}
 */
export function flRealLand(f) {
  if (!(f.landDist >= 0) || f.landBrg == null) return null;
  const b = (f.landBrg * Math.PI) / 180;
  return { e: f.landDist * Math.sin(b), n: f.landDist * Math.cos(b) };
}
/**
 * A landing spot as distance and compass point.
 * @param {{e:number, n:number}} p
 * @returns {string}
 */
export function flLandTxt(p) {
  const d = Math.hypot(p.e, p.n);
  return `${fmt(d, "alt")} ${uname("alt")}${d > 0.5 ? " " + flCompass((Math.atan2(p.e, p.n) * 180) / Math.PI) : ""}`;
}
/**
 * Whether a landing is inside the last dispersion run's ellipses (only when that run's wind matches the flight's).
 * @param {object} f flight
 * @param {{e:number, n:number}} p landing spot
 * @returns {string|null}
 */
function flInMC(f, p) {
  if (!lastMC || !lastSim || lastMC.when !== lastSim.when || !p) return null;
  const L0 = lastSim.L,
    dw = Math.abs((((((f.windDir ?? L0.windDir) - (L0.windDir ?? 270)) % 360) + 540) % 360) - 180);
  if (f.wind != null && Math.abs(f.wind - L0.wind) > Math.max(0.9, 0.2 * L0.wind)) return null;
  if (dw > 20) return null;
  const M = lastMC,
    ca = Math.cos(M.ang),
    sa = Math.sin(M.ang),
    de = p.e - M.me,
    dn = p.n - M.mn,
    u = de * ca + dn * sa,
    v = -de * sa + dn * ca,
    d2 = (u / (M.a1 || 1e-9)) ** 2 + (v / (M.b1 || 1e-9)) ** 2;
  return d2 <= MC_K68 * MC_K68
    ? "inside the 68% ellipse"
    : d2 <= MC_K95 * MC_K95
      ? "inside the 95% ellipse"
      : "outside the 95% ellipse";
}
/**
 * Draws the Flight Log: each flight against its prediction, the calibration line and the buttons.
 */
export function renderFlightLog() {
  const pn = document.getElementById("flpanel");
  if (!pn) return;
  if (prPendingAlt && lastSim) setTimeout(prIncomingGo, 50);
  if (altWaiting) setTimeout(altWaitingGo, 50);
  if (!lastSim || document.documentElement.classList.contains("nodesign")) {
    pn.hidden = true;
    return;
  }
  pn.hidden = false;
  const list = flList()
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.made || 0) - (a.made || 0));
  const el = document.getElementById("fllist"),
    au = uname("alt");
  renderFlCal(list);
  if (!list.length) {
    el.innerHTML = `<p class="note" style="margin:0 0 10px">No flights logged for ${esc(D.name || "this rocket")} yet. Log a flight by hand (or from what your altimeter's display shows), or import the file from your altimeter (Featherweight, Altus Metrum, Eggtimer, PerfectFlite, Missile Works, Jolly Logic, Apogee Components or any CSV/text log).</p>`;
    return;
  }
  // the current design's prediction for each flight (worked out once per run)
  const stamp = lastSim.when;
  if (flNow.when !== stamp) flNow = { when: stamp };
  list.slice(0, 12).forEach((f) => {
    if (!(f.id in flNow)) {
      const c = flCtx(f),
        r = c ? flSim(c) : null;
      let coast = null;
      try {
        coast = c ? flCoast(f, c) : null;
      } catch (e) {}
      flNow[f.id] = r
        ? { apo: r.maxAlt, land: r.landed ? flSimLand(r, f.windDir ?? lastSim.L.windDir) : null, coast }
        : null;
    }
  });
  const ds = list.map((f) => flDiff(f.apo, f.pred)).filter((d) => d != null),
    avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
  const ns = list.map((f) => (flNow[f.id] ? flDiff(f.apo, flNow[f.id].apo) : null)).filter((d) => d != null),
    avgN = ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
  el.innerHTML =
    `<p class="flsum">${list.length} flight${list.length > 1 ? "s" : ""}${avgN != null ? `. Real flights average <b class="${flCls(avgN)}">${flPct(avgN)}</b> from what this design predicts now` : avg != null ? `. Real flights average <b class="${flCls(avg)}">${flPct(avg)}</b> from the predictions when they were logged` : ""}.</p>` +
    list
      .map((f) => {
        const d = flDiff(f.apo, f.pred),
          now = flNow[f.id],
          dn = now ? flDiff(f.apo, now.apo) : null,
          A = flAltis(f),
          rl = flRealLand(f);
        const alts =
          A.length > 1
            ? (() => {
                const v = A.map((a) => a.apo).filter((x) => x > 0),
                  sp = v.length > 1 ? ((Math.max(...v) - Math.min(...v)) / Math.min(...v)) * 100 : null;
                return `<div class="flalt">${A.map((a) => `${esc(a.brand)} ${a.apo > 0 ? fmt(a.apo, "alt") + " " + au : "—"}`).join(" · ")}${sp != null ? ` · <b class="${flCls(sp)}">${sp.toFixed(1)}% apart</b>` : ""}</div>`;
              })()
            : "";
        const a0 = A[0];
        let landTxt = "";
        if (rl) {
          const sp = now && now.land,
            mc = flInMC(f, rl);
          landTxt = `<div class="flalt">Landed ${flLandTxt(rl)} from the pad${sp ? `; predicted ${flLandTxt(sp)}, ${fmt(Math.hypot(rl.e - sp.e, rl.n - sp.n), "alt")} ${au} apart` : ""}${mc ? `; ${mc} of the dispersion run` : ""}.</div>`;
        }
        return `<div class="flrow${flShow === f.id ? " on" : ""}" data-id="${esc(f.id)}">
      <div class="flhd"><b>${esc(flDate(f.date) || "No date")}</b>${f.motor ? ` · ${esc(f.motor)}${f.delay ? ` (${esc(f.delay)})` : ""}` : ""}${f.place ? ` · ${esc(f.place)}` : ""}</div>
      <div class="flnum"><span>Real <b>${f.apo > 0 ? fmt(f.apo, "alt") + " " + au : "—"}</b></span>${f.pred > 0 ? `<span>Predicted ${fmt(f.pred, "alt")} ${au} <b class="${flCls(d)}">${flPct(d)}</b></span>` : ""}${dn != null && Math.abs(now.apo - f.pred) > 0.5 ? `<span>Now ${fmt(now.apo, "alt")} ${au} <b class="${flCls(dn)}">${flPct(dn)}</b></span>` : ""}${f.vmax > 0 ? `<span>Top speed ${fmt(f.vmax, "speed")} ${uname("speed")}</span>` : ""}${f.mass > 0 ? `<span>${fmt(f.mass, "mass")} ${uname("mass")} at liftoff</span>` : ""}</div>
      ${alts}${!A.length && f.readings && f.readings.alt ? `<div class="flalt">${esc(altimeterName(altimeterById(f.readings.alt)))} readings</div>` : ""}${A.length === 1 ? `<div class="flalt">${esc(a0.brand || "Altimeter")} data${a0.rateHigh != null ? ` · ${fmt(a0.rateHigh, "speed")} ${uname("speed")} under drogue` : ""}${a0.rateLow != null ? ` · ${fmt(a0.rateLow, "speed")} ${uname("speed")} near the ground` : ""}</div>` : ""}
      ${landTxt}${
        now && now.coast
          ? `<div class="flalt">${now.coast.ok ? `Drag measured in the coast by the accelerometer: <b>×${now.coast.k.toFixed(2)}</b> this design's estimate (Mach ${now.coast.m0.toFixed(2)}–${now.coast.m1.toFixed(2)}), whatever the motor did.` : `The accelerometer's coast isn't used to measure drag: ${esc(now.coast.why)}.`}</div>`
          : ""
      }
      ${f.notes ? `<div class="flnote">${esc(f.notes)}</div>` : ""}
      <div class="flact">${f.apo > 0 || A.length ? `<button class="btn" type="button" data-fl="cmp">Compare</button>` : ""}${A.some((a) => a.curve) ? `<button class="btn ghost" type="button" data-fl="show">${flShow === f.id ? "Hide from chart" : "Show on chart"}</button>` : ""}${
        f.apo > 0
          ? (() => {
              const ok = !!flCtx(f);
              return `<label class="flcalchk${ok ? "" : " off"}"${ok ? "" : ` title="This device doesn't have this flight's motor"`}><input type="checkbox" data-fl="cal"${f.cal ? " checked" : ""}${ok && !flFitBusy ? "" : " disabled"}> Use for calibration${ok ? "" : " (motor not on this device)"}</label>`;
            })()
          : ""
      }<button class="btn ghost" type="button" data-fl="edit">Edit</button><button class="btn ghost" type="button" data-fl="del">Delete</button></div></div>`;
      })
      .join("");
  el.querySelectorAll(".flrow [data-fl]").forEach((b) => {
    if (b.type === "checkbox") b.onchange = () => flAct(b.closest(".flrow").dataset.id, "cal", b);
    else b.onclick = () => flAct(b.closest(".flrow").dataset.id, b.dataset.fl, b);
  });
}
/**
 * A flight's buttons: show, edit, delete, use for calibration...
 * @param {string} id flight id
 * @param {string} what action
 * @param {HTMLElement} btn
 */
function flAct(id, what, btn) {
  const list = flList(),
    f = list.find((x) => x.id === id);
  if (!f) return;
  if (what === "show") {
    flShow = flShow === id ? null : id;
    if (flShow && series !== "alt" && series !== "vel") {
      setSeries("alt");
      renderSeries();
    }
    renderFlightLog();
    drawChart();
    if (flShow) document.getElementById("chartpanel").scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (what === "cmp") fcOpen(f);
  else if (what === "edit") flOpen(f);
  else if (what === "del") {
    if (btn.dataset.sure !== "1") {
      btn.dataset.sure = "1";
      btn.textContent = "Tap again to delete";
      btn.classList.add("danger");
      setTimeout(() => {
        if (btn.isConnected) {
          btn.dataset.sure = "";
          btn.textContent = "Delete";
          btn.classList.remove("danger");
        }
      }, 3500);
      return;
    }
    if (flShow === id) flShow = null;
    flPut(list.filter((x) => x.id !== id));
    flMarkDeleted(id);
    renderFlightLog();
    drawChart();
    prToast("Flight deleted");
    if (f.cal) flFit();
  } else if (what === "cal") {
    flPut(list.map((x) => (x.id === id ? { ...x, cal: !!btn.checked } : x)));
    flFit();
  }
}
/* calibration from the flight log: the drag multiplier fitted to the flights ticked "Use for calibration"
   (one flight: matched exactly; several: the multiplier that leaves them, on average, neither high nor low) */
/**
 * A fit is running; another was asked for while it ran; its message.
 */
let flFitBusy = false,
  flFitAgain = false,
  flFitMsg = "";
/**
 * Today's date in the local format.
 */
const flToday = () => new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
/**
 * Fits the drag multiplier to the ticked flights (see the note above) and saves it.
 */
export async function flFit() {
  if (!lastSim) return;
  if (flFitBusy) {
    flFitAgain = true;
    return;
  }
  const picked = flList().filter((f) => f.cal && f.apo > 0),
    use = picked.map((f) => ({ f, c: flCtx(f) })).filter((x) => x.c),
    skip = picked.length - use.length;
  const old = calGet();
  if (!picked.length) {
    if (old && (old.flights || !old.apo)) {
      calSet(null);
      applyCal();
      store.set("rfs-design", D);
      flFitMsg = "";
      runAll();
      prToast("Calibration removed");
    } else renderFlightLog();
    return;
  }
  if (lastSim.st.error || lastSim.st.tumble) {
    flFitMsg = "This run doesn’t fly normally, so it can’t be used to calibrate drag. Fix the warning first.";
    renderFlightLog();
    return;
  }
  if (!use.length) {
    flFitMsg = `The ticked flight${picked.length > 1 ? "s need their motors" : " needs its motor"} on this device to calibrate.`;
    renderFlightLog();
    return;
  }
  flFitBusy = true;
  flFitMsg = "Calibrating…";
  renderFlightLog();
  /**
   * Lets the page update between runs.
   */
  const tick = () => new Promise((r) => setTimeout(r, 0));
  try {
    let k = null,
      how = null,
      spread = 0;
    // flights whose altimeter measured the drag in the coast (see flCoast): that, not the apogee, when they all did
    const co = use.map((x) => {
      try {
        return flCoast(x.f, x.c);
      } catch (e) {
        return null;
      }
    });
    if (co.every((r) => r && r.ok)) {
      const lg = co.map((r) => Math.log(r.k)),
        mu = lg.reduce((a, b) => a + b, 0) / lg.length;
      k = Math.exp(mu);
      spread = Math.sqrt(lg.reduce((a, b) => a + (b - mu) ** 2, 0) / lg.length) * 100;
      how = "coast";
    } else if (use.length === 1) {
      await tick();
      const sol = solveDragScale(use[0].f.apo, use[0].c);
      if (sol.out) {
        flFitMsg = `Even ${sol.out === "high" ? "half" : "twice"} the estimated drag only reaches ${fmt(sol.lim, "alt")} ${uname("alt")}, so drag can’t explain the difference. Check that flight’s weight, motor and conditions.`;
        return;
      }
      k = sol.k;
    } else {
      const g = async (kk) => {
        let s = 0;
        for (const x of use) {
          const r = flSim(x.c, kk);
          if (!r) return NaN;
          s += Math.log(r.maxAlt / x.f.apo);
          await tick();
        }
        return s / use.length;
      };
      let lo = 0.5,
        hi = 2;
      const gLo = await g(lo),
        gHi = await g(hi);
      if (!isFinite(gLo) || !isFinite(gHi)) {
        flFitMsg =
          "One of the ticked flights doesn’t fly normally with this design, so the flights can’t be used together.";
        return;
      }
      if (gLo < 0 || gHi > 0) {
        flFitMsg = `Even ${gLo < 0 ? "half" : "twice"} the estimated drag can’t match these flights on average. Check their weights, motors and conditions.`;
        return;
      }
      for (let i = 0; i < 12; i++) {
        const mid = Math.sqrt(lo * hi),
          v = await g(mid);
        flFitMsg = `Calibrating… ${Math.round(((i + 1) / 12) * 100)}%`;
        const st = document.getElementById("flcalst");
        if (st) st.textContent = flFitMsg;
        if (v > 0) lo = mid;
        else hi = mid;
      }
      k = Math.sqrt(lo * hi);
    }
    const res = use.map((x) => {
        const r = flSim(x.c, k);
        return r ? r.maxAlt / x.f.apo - 1 : 0;
      }),
      rms = how ? spread : Math.sqrt(res.reduce((a, b) => a + b * b, 0) / res.length) * 100;
    calSet({
      k,
      flights: use.map((x) => x.f.id),
      n: use.length,
      rms,
      ...(how ? { how } : {}),
      skipped: skip,
      date: flToday(),
      dm: "test", // fitted with the current drag model (see calStale); the name is the one saved since build 288
    });
    flFitMsg = "";
    applyCal();
    store.set("rfs-design", D);
    runAll();
    const pct = (k - 1) * 100;
    if (Math.abs(pct) > 30) {
      // a large change: a window that stays until OK is pressed (a toast goes by before it can be read)
      const box = document.getElementById("calwarn");
      document.getElementById("calwarntxt").textContent =
        `Calibrated: drag ×${k.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%). That's a large change, so double-check the weights, motors and conditions.`;
      document.getElementById("calwarnok").onclick = () => {
        box.hidden = true;
      };
      box.hidden = false;
      document.getElementById("calwarnok").focus();
    } else prToast(`Calibrated: drag ×${k.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`);
  } finally {
    flFitBusy = false;
    renderFlightLog();
    if (flFitAgain) {
      flFitAgain = false;
      setTimeout(flFit, 0);
    }
  }
}
/**
 * Draws the calibration line at the top of the log (older calibrations are brought into the log's way).
 * @param {object[]} list flights
 */
function renderFlCal(list) {
  const el = document.getElementById("flcal");
  if (!el) return;
  let c = calGet();
  if (c && !c.flights) {
    // from "Calibrate to this" (one flight) or "Calibrate to all flights" in earlier builds: those flights are ticked
    const ids = c.flight
      ? list.filter((f) => f.id === c.flight).map((f) => f.id)
      : c.multi
        ? list.filter((f) => f.apo > 0 && flCtx(f)).map((f) => f.id)
        : [];
    if (ids.length) {
      const L2 = flList().map((f) => (ids.includes(f.id) ? { ...f, cal: true } : f));
      flPut(L2);
      c = { ...c, flights: ids, n: ids.length };
      calSet(c);
      list = L2;
    }
  }
  const k = c && c.k > 0 ? c.k : null,
    stale = calStale(c), // fitted with the other drag model: kept, but not in use until it is refitted
    pct = k ? (k - 1) * 100 : 0,
    busy = flFitBusy || /^Calibrating/.test(flFitMsg);
  let h = "";
  if (k && stale)
    h =
      `<span id="flcalst"><b>Calibration not in use.</b> This rocket’s drag calibration (×${k.toFixed(2)}) was fitted with the previous drag model (builds before 288), so flights run without it. ${c.flights ? "Refit it to use your logged flights with this model." : "Remove it, then tick “Use for calibration” on a logged flight to fit a new one."}</span>` +
      (c.flights ? `<button class="btn ghost" type="button" id="flrefit">Refit</button>` : "") +
      `<button class="btn ghost" type="button" id="flcalrm">Remove</button>`;
  else if (k && c.flights)
    h =
      `<span id="flcalst">Drag calibrated <b>×${k.toFixed(2)}</b> (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%) from ${c.how === "coast" ? `the drag ${c.n > 1 ? `${c.n} flights' accelerometers measured in the coast, which agree within ±${(c.rms || 0).toFixed(1)}%` : "1 flight's accelerometer measured in the coast"}` : c.n > 1 ? `${c.n} flights, which fit within ±${(c.rms || 0).toFixed(1)}%` : "1 flight"}${c.skipped ? ` (${c.skipped} ticked flight${c.skipped > 1 ? "s" : ""} skipped: motor not on this device)` : ""}.</span>` +
      `<button class="btn ghost" type="button" id="flrefit">Refit</button><button class="btn ghost" type="button" id="flcalrm">Remove</button>`;
  else if (k)
    h =
      `<span id="flcalst">Drag calibrated <b>×${k.toFixed(2)}</b> (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%) from a ${fmt(c.apo, "alt")} ${uname("alt")} flight${c.motor ? " on " + esc(c.motor) : ""}${c.date ? ", " + esc(c.date) : ""}, entered before the flight log.</span>` +
      `<button class="btn ghost" type="button" id="fllegacy">Add it to the log</button><button class="btn ghost" type="button" id="flcalrm">Remove</button>`;
  else
    h = `<span id="flcalst">${list.some((f) => f.apo > 0) ? "Not calibrated. Tick “Use for calibration” on the flights you trust to scale the drag to them." : "Not calibrated. Log a flight with its real apogee to calibrate the drag to it."}</span>`;
  if (flFitMsg) h += `<div class="${busy ? "note" : "bad"}" style="flex-basis:100%;margin:0">${esc(flFitMsg)}</div>`;
  el.innerHTML = h;
  const rf = document.getElementById("flrefit");
  if (rf) {
    rf.disabled = busy;
    rf.onclick = () => flFit();
  }
  const rm = document.getElementById("flcalrm");
  if (rm)
    rm.onclick = () => {
      calSet(null);
      flPut(flList().map((f) => (f.cal ? { ...f, cal: false } : f)));
      applyCal();
      store.set("rfs-design", D);
      flFitMsg = "";
      runAll();
      prToast("Calibration removed");
    };
  const lg = document.getElementById("fllegacy");
  if (lg)
    lg.onclick = () => {
      const d = new Date(c.date),
        iso = isNaN(d)
          ? new Date().toISOString().slice(0, 10)
          : new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      const same = lastSim && flMotorName(lastSim.m, lastSim.mb) === c.motor;
      const f = {
        id: flId(),
        made: Date.now(),
        date: iso,
        motor: c.motor || "",
        motorId: same ? lastSim.m.id : null,
        boostId: same && lastSim.mb ? lastSim.mb.id : null,
        apo: c.apo,
        pred: null,
        cal: true,
        notes: "From the calibration entered before the flight log.",
      };
      flPut([...flList(), f]);
      calSet({ ...c, flights: [f.id], n: 1 });
      renderFlightLog();
      prToast("Added to the flight log");
    };
}
/* the flight form */
/**
 * The HTML of one number field in the flight form.
 * @returns {string}
 */
export function flField(id, lab, dim, val, dec, ph) {
  const u = dim ? uname(dim) : "";
  return `<div class="fld"><label for="${id}">${lab}</label><div class="in"><input id="${id}" type="number" inputmode="decimal" step="any"${ph ? ` placeholder="${esc(ph)}"` : ""} value="${val != null && isFinite(val) ? (dim ? +toDisp(val, dim).toFixed(dec ?? (dim === "alt" ? 0 : 1)) : val) : ""}">${u ? `<span class="u">${u}</span>` : ""}</div></div>`;
}
/**
 * Opens the flight form, for a new flight or to edit one.
 * @param {object} [f]
 */
export function flOpen(f) {
  if (!lastSim) return;
  const today = new Date(),
    iso = new Date(today.getTime() - today.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const n = f
    ? { ...f, altis: flAltis(f) }
    : {
        date: iso,
        motor: flMotorName(lastSim.m, lastSim.mb),
        motorId: lastSim.m.id,
        boostId: lastSim.mb ? lastSim.mb.id : null,
        delay: lastSim.D.ejDelay != null ? lastSim.D.ejDelay + " s" : "",
        wind: lastSim.L.wind,
        windDir: lastSim.L.windDir,
        tempC: lastSim.L.tempC,
        elev: lastSim.L.elev,
        altis: [],
      };
  delete n.alti;
  flEdit = n;
  const dm = flCtx({ motorId: n.motorId, boostId: n.boostId }),
    designW = dm ? flLiftMass(dm.D, dm.m, dm.mb) : null;
  document.getElementById("fltitle").textContent = f ? "Edit flight" : "Log a flight";
  document.getElementById("flform").innerHTML = `
    <div class="cmpseg fltabs" role="tablist">${[
      ["file", "Log file"],
      ["readings", "Display readings"],
      ["apo", "Apogee only"],
    ]
      .map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}</button>`)
      .join("")}</div>
    <div class="flaltbox" id="fl-altbox"></div>
    <div id="fl-read"></div>
    <div class="flgrid" id="fl-apov">
      ${flField("fl-apo", "Real apogee, above the pad", "alt", n.apo)}
      ${flField("fl-vmax", "Real top speed", "speed", n.vmax, 0)}
    </div>
    <div class="flgrid" style="margin-top:10px">
      <div class="fld"><label for="fl-date">Date</label><div class="in"><input id="fl-date" type="date" value="${esc(n.date || "")}"></div></div>
      <div class="fld"><label for="fl-place">Place</label><div class="in"><input id="fl-place" type="text" value="${esc(n.place || "")}" placeholder="Launch site"></div></div>
      <div class="fld"><label for="fl-motor">Motor</label><div class="in"><input id="fl-motor" type="text" value="${esc(n.motor || "")}"></div></div>
      <div class="fld"><label for="fl-delay">Delay</label><div class="in"><input id="fl-delay" type="text" value="${esc(n.delay || "")}" placeholder="e.g. 10 s"></div></div>
      ${flField("fl-mass", "Liftoff weight, with motor", "mass", n.mass, 2, designW ? "Design: " + fmt(designW, "mass") : "")}
      ${flField("fl-temp", "Temperature", "temp", n.tempC, 0)}
      ${flField("fl-wind", "Wind", "wind", n.wind)}
      <div class="fld"><label for="fl-wdir">Wind from</label><div class="in"><input id="fl-wdir" type="text" value="${n.windDir != null ? Math.round(n.windDir) : ""}" placeholder="° or NW"><span class="u">°</span></div></div>
      ${flField("fl-elev", "Field elevation", "alt", n.elev)}
      <div class="flsp"></div>
      ${flField("fl-ldist", "Landed this far from the pad", "alt", n.landDist)}
      <div class="fld"><label for="fl-lbrg">In this direction</label><div class="in"><input id="fl-lbrg" type="text" value="${n.landBrg != null ? Math.round(n.landBrg) : ""}" placeholder="° or SE"><span class="u">°</span></div></div>
    </div>
    <div class="fld" style="margin-top:8px"><label for="fl-notes">Notes</label><textarea id="fl-notes" rows="2">${esc(n.notes || "")}</textarea></div>`;
  flAltBox();
  flReadBox(n.readings && n.readings.alt ? n.readings.alt : store.get("rfs-altimeter") || "jl-two", n.readings);
  document.querySelectorAll("#flform .fltabs [data-tab]").forEach((b) => (b.onclick = () => flSetTab(b.dataset.tab)));
  flSetTab(n.readings && n.readings.alt ? "readings" : n.altis && n.altis.length ? "file" : "apo");
  const motorTxt = document.getElementById("fl-motor");
  motorTxt.oninput = () => {
    flEdit.motorId = null;
    flEdit.boostId = null;
    flPredBox();
  };
  ["fl-wind", "fl-temp", "fl-elev", "fl-mass", "fl-wdir"].forEach(
    (i) => (document.getElementById(i).oninput = () => flPredBox()),
  );
  document.getElementById("flres").hidden = true;
  flPredBox();
  document.getElementById("flmodal").hidden = false;
}
/**
 * Draws the altimeter files attached in the form.
 */
export function flAltBox() {
  const b = document.getElementById("fl-altbox");
  if (!b) return;
  const A = flEdit.altis || [];
  b.innerHTML =
    A.map(
      (a, i) =>
        `<div class="flaltf"><span><b>${esc(a.brand)}</b>${a.file ? ` <i>${esc(a.file)}</i>` : ""}: ${a.apo > 0 ? fmt(a.apo, "alt") + " " + uname("alt") : ""}${a.tApo != null ? ` at ${a.tApo.toFixed(1)} s` : ""}${a.land ? `, GPS landing ${flLandTxt(flRealLand({ landDist: a.land.dist, landBrg: a.land.brg }))}` : ""}.</span><button class="btn ghost" type="button" data-rm="${i}">Remove</button></div>`,
    ).join("") +
    `<div class="flaltf"><span>${A.length ? "Flew a second altimeter? Add its file to compare the two." : "Have the altimeter's file? Importing it fills in the apogee, top speed and events, and shows the real curve on the chart."}</span><label class="file btn ghost" for="fl-altin">${A.length ? "Add another altimeter file" : "Import altimeter file"}<input type="file" id="fl-altin"></label></div>`;
  b.querySelectorAll("[data-rm]").forEach(
    (x) =>
      (x.onclick = () => {
        flEdit.altis.splice(+x.dataset.rm, 1);
        flAltBox();
      }),
  );
  const inp = document.getElementById("fl-altin");
  if (inp)
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      inp.value = "";
      if (f) altOpenFile(f, "form");
    };
}
/**
 * The tab open in the flight form: "file" (an altimeter's log file), "readings" (read off its display or beeps) or
 * "apo" (just the apogee and top speed).
 */
let flTab = "apo";
/**
 * Opens a tab of the flight form.
 * @param {string} t
 */
function flSetTab(t) {
  flTab = t;
  document.querySelectorAll("#flform .fltabs [data-tab]").forEach((b) => {
    const on = b.dataset.tab === t;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on);
  });
  document.getElementById("fl-altbox").hidden = t !== "file";
  document.getElementById("fl-read").hidden = t !== "readings";
  document.getElementById("fl-apov").hidden = t === "readings";
  flPredBox();
}
/**
 * Speed units an altimeter can show: [name, m/s].
 */
const FL_SPEEDS = [
  ["ft/s", 0.3048],
  ["mph", 0.44704],
  ["m/s", 1],
  ["km/h", 1 / 3.6],
];
/**
 * Draws the Display readings tab for an altimeter: the readings it gives, in its order.
 * @param {string} id altimeter id
 * @param {object} [R] readings saved with the flight (SI)
 */
function flReadBox(id, R) {
  const box = document.getElementById("fl-read"),
    a = altimeterById(id),
    vu = (R && R.vUnit) || a.speedUnit || (uname("speed") === "m/s" ? "m/s" : "ft/s"),
    vk = (FL_SPEEDS.find((x) => x[0] === vu) || FL_SPEEDS[0])[1];
  const brands = [...new Set(ALTIMETERS.map((x) => x.brand))];
  const val = (k, dim) => {
    const v = R && R.alt === id ? R[k] : null;
    if (v == null || !isFinite(v)) return "";
    return dim === "alt" ? +toDisp(v, "alt").toFixed(0) : dim === "speed" ? +(v / vk).toFixed(0) : +v.toFixed(2);
  };
  const lim =
    a.accG > 0
      ? `its accelerometer reads up to about ${a.accG} g along the rocket`
      : a.accG === null
        ? "it has no accelerometer"
        : "its accelerometer's range isn't published";
  box.innerHTML = `
    <div class="fld"><label for="fl-alti">Altimeter</label><div class="in"><select id="fl-alti">${brands
      .map(
        (b) =>
          `<optgroup label="${esc(b || "Other")}">${ALTIMETERS.filter((x) => x.brand === b)
            .map((x) => `<option value="${x.id}"${x.id === a.id ? " selected" : ""}>${esc(x.name)}</option>`)
            .join("")}</optgroup>`,
      )
      .join("")}</select></div></div>
    <p class="note" style="margin:4px 0 8px">Readings from ${esc(a.how)}; ${lim}.</p>
    <div class="flgrid fl2">${ALT_READINGS.filter(([k]) => a.readings.includes(k))
      .map(([k, l, dim]) =>
        dim === "alt" || dim === "speed"
          ? `<div class="fld"><label for="fr-${k}">${l}</label><div class="in"><input id="fr-${k}" type="number" inputmode="decimal" step="any" value="${val(k, dim)}"><span class="u">${dim === "alt" ? uname("alt") : vu}</span></div></div>`
          : `<div class="fld"><label for="fr-${k}">${l}${k === "ap2e" ? " (− before apogee)" : ""}</label><div class="in"><input id="fr-${k}" type="number" inputmode="decimal" step="any" value="${val(k, dim)}"><span class="u">${dim}</span></div></div>`,
      )
      .join("")}${
      a.readings.includes("vmax")
        ? `<div class="fld"><label for="fr-vu">Speed unit on the altimeter</label><div class="in"><select id="fr-vu">${FL_SPEEDS.map(([u]) => `<option${u === vu ? " selected" : ""}>${u}</option>`).join("")}</select></div></div>`
        : ""
    }</div>
    <div class="cmpban warn" id="fr-lim" hidden></div>`;
  document.getElementById("fl-alti").onchange = (e) => {
    store.set("rfs-altimeter", e.target.value);
    flReadBox(e.target.value, flReadReadings().readings);
  };
  const vs = document.getElementById("fr-vu");
  if (vs)
    vs.onchange = () => {
      const r = flReadReadings(vu).readings;
      r.vUnit = vs.value;
      flReadBox(id, r);
    };
  box.querySelectorAll("input").forEach((i) => (i.oninput = () => flReadLimit()));
  flReadLimit();
}
/**
 * Reads the Display readings tab into SI.
 * @param {string} [unitWas] the speed unit the boxes were drawn in (when the unit is being changed)
 * @returns {{apo:number|null, vmax:number|null, readings:object}}
 */
function flReadReadings(unitWas) {
  const sel = document.getElementById("fl-alti");
  if (!sel) return { apo: null, vmax: null, readings: null };
  const a = altimeterById(sel.value),
    vs = document.getElementById("fr-vu"),
    vu = unitWas || (vs ? vs.value : a.speedUnit || "ft/s"),
    vk = (FL_SPEEDS.find((x) => x[0] === vu) || FL_SPEEDS[0])[1],
    R = { alt: a.id, vUnit: vu };
  for (const [k, , dim] of ALT_READINGS) {
    const e = document.getElementById("fr-" + k);
    if (!e) continue;
    const v = parseFloat(e.value);
    if (!isFinite(v)) continue;
    R[k] = dim === "alt" ? fromDisp(v, "alt") : dim === "speed" ? v * vk : v;
  }
  return { apo: R.apo ?? null, vmax: R.vmax ?? null, readings: R };
}
/**
 * Warns when the altimeter's acceleration readings are at its limit for this flight.
 */
function flReadLimit() {
  const w = document.getElementById("fr-lim");
  if (!w) return;
  const R = flReadReadings().readings,
    a = altimeterById(R.alt),
    st = flEdit ? flPredict({ ...flEdit, ...flRead() }) : null,
    pg = st && st.maxAcc ? st.maxAcc / 9.80665 : null,
    on = altAtLimit(a, R.peakG ?? null, pg);
  w.hidden = !on;
  if (on)
    w.innerHTML = `<b>Acceleration at the altimeter's limit.</b>The ${esc(altimeterName(a))} reads up to about ${a.accG} g${pg > a.accG ? ` and this flight pulls about ${pg.toFixed(0)} g` : R.peakG != null ? ` and it read ${R.peakG} g` : ""}, so its top speed and accelerations ${pg > a.accG ? "read" : "may read"} low. They're kept with the flight but not compared.`;
}
/**
 * Reads the flight form.
 * @returns {object} flight fields
 */
function flRead() {
  /**
   * A number field in SI (null if empty).
   */
  const g = (id, dim) => {
    const v = parseFloat(document.getElementById(id).value);
    return isFinite(v) ? (dim ? fromDisp(v, dim) : v) : null;
  };
  return {
    date: document.getElementById("fl-date").value,
    place: document.getElementById("fl-place").value.trim(),
    motor: document.getElementById("fl-motor").value.trim(),
    delay: document.getElementById("fl-delay").value.trim(),
    mass: g("fl-mass", "mass"),
    wind: g("fl-wind", "wind"),
    windDir: flParseDir(document.getElementById("fl-wdir").value),
    tempC: g("fl-temp", "temp"),
    elev: g("fl-elev", "alt"),
    ...(flTab === "readings"
      ? flReadReadings()
      : { apo: g("fl-apo", "alt"), vmax: g("fl-vmax", "speed"), readings: null }),
    landDist: g("fl-ldist", "alt"),
    landBrg: flParseDir(document.getElementById("fl-lbrg").value),
    notes: document.getElementById("fl-notes").value.trim(),
  };
}
/**
 * Writes the prediction for the flight in the form.
 */
export function flPredBox() {
  const p = document.getElementById("flpred");
  if (!p || !flEdit) return;
  if (flEdit.pred > 0 && flEdit.made) {
    p.textContent = `Predicted when logged: ${fmt(flEdit.pred, "alt")} ${uname("alt")}.`;
    return;
  }
  const f = { ...flEdit, ...flRead(), motorId: flEdit.motorId, boostId: flEdit.boostId },
    r = flPredict(f);
  p.textContent = r
    ? `This design predicts ${fmt(r.maxAlt, "alt")} ${uname("alt")} for this weight and these conditions. That's saved with the flight.`
    : `This device doesn't have that motor, so the current run's prediction (${fmt(lastSim.st.maxAlt, "alt")} ${uname("alt")}) is saved with the flight.`;
}
/**
 * After logging a flight, asks whether to use it for the calibration.
 * @param {string} id
 */
function flAskCal(id) {
  const el = document.getElementById("flprompt");
  if (!el) return;
  el.innerHTML = `<span>Use this flight to calibrate the drag?</span><button class="btn" type="button" id="flaskyes">Calibrate</button><button class="btn ghost" type="button" id="flaskno">Not now</button>`;
  el.hidden = false;
  document.getElementById("flaskyes").onclick = () => {
    el.hidden = true;
    flPut(flList().map((x) => (x.id === id ? { ...x, cal: true } : x)));
    flFit();
  };
  document.getElementById("flaskno").onclick = () => {
    el.hidden = true;
  };
}
/* altimeter files */
/**
 * The altimeter file being imported, and whether it's for a new flight or the one in the form.
 */
export let altP = null,
  altMode = "new";

/**
 * Sets flNow (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setFlNow(v) {
  return (flNow = v);
}
/**
 * Sets altMode (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setAltMode(v) {
  return (altMode = v);
}
/**
 * Sets altP (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setAltP(v) {
  return (altP = v);
}
/**
 * Saves a flight to the log (a new one gets its prediction, made now, and an id), then asks about calibrating to it.
 * @param {object} f the flight
 * @returns {object|null} the flight as saved, or null if it couldn't be saved
 */
export function flSaveFlight(f) {
  delete f.alti;
  delete f.curve;
  delete f.tApo;
  delete f.tLand;
  delete f.rateHigh;
  delete f.rateLow;
  const wasNew = !f.made;
  if (!f.made) {
    const st = flPredict(f);
    f.pred = st ? st.maxAlt : lastSim.st.maxAlt;
    f.predV = st ? st.maxV : lastSim.st.maxV;
    f.dragScale = lastSim.D.dragScale || 1;
    f.made = Date.now();
    f.id = flId();
  }
  {
    const m = f.motorId && findMotor(f.motorId),
      mb = f.boostId && findMotor(f.boostId),
      mi = m ? flMotorInfo(m, lastSim.D.twoStage ? mb : null) : null;
    if (mi) {
      f.impulse = mi.I;
      f.cls = mi.cls;
    }
  }
  const list = flList().filter((x) => x.id !== f.id);
  list.push(f);
  if (!flPut(list)) return null;
  delete flNow[f.id];
  renderFlightLog();
  drawChart();
  const d = flDiff(f.apo, f.pred);
  prToast(d != null ? `Flight logged: ${flPct(d)} from the prediction` : "Flight logged");
  // a ticked flight that changed: the calibration follows it; a new flight: offer to calibrate to it
  if (!wasNew && f.cal) flFit();
  else if (wasNew && f.apo > 0 && flCtx(f)) flAskCal(f.id);
  return f;
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.getElementById("flcancel").onclick = () => {
    document.getElementById("flmodal").hidden = true;
    flEdit = null;
  };
  document.getElementById("flsave").onclick = () => {
    const v = flRead(),
      r = document.getElementById("flres");
    if (!(v.apo > 0) && !(flEdit.altis && flEdit.altis.length)) {
      r.textContent =
        flTab === "readings"
          ? "Enter the altimeter's max altitude."
          : "Enter the real apogee, or import the altimeter's file.";
      r.className = "bad";
      r.hidden = false;
      return;
    }
    if (!(v.apo > 0)) v.apo = flEdit.altis[0].apo;
    if (flSaveFlight({ ...flEdit, ...v })) {
      document.getElementById("flmodal").hidden = true;
      flEdit = null;
    }
  };
}
