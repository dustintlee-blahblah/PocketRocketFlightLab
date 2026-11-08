/**
 * Reading altimeter files (see the note below): the columns, their units, and the flight's figures (apogee, speeds,
 * descent rates, events) worked out from them.
 */
/* ---------- altimeter files: Featherweight, Altus Metrum, Eggtimer, PerfectFlite or any text/CSV log ----------
   The file's columns are found from its own header: a time column, an altitude (or pressure) column and, if there is one,
   a velocity column. The units come from the header or the brand's usual units, and everything is shown for checking first. */
/**
 * Altimeter makers: [id, name, how to recognize their files, their usual altitude unit].
 */
const ALT_BRANDS = [
  [
    "altus",
    "Altus Metrum",
    /altos|altus ?metrum|telemetrum|telemega|telemini|easymini|easymega|easytimer|micropeak|^#?\s*version\s*,\s*serial/im,
    "m",
  ],
  ["featherweight", "Featherweight", /featherweight|blue ?raven|\braven\b|syncsec|baro_press|fip(a)?\b/im, "ft"],
  ["eggtimer", "Eggtimer", /eggtimer|egg ?finder|quasar|quantum|\bfalt\b|\bfveloc\b/im, "ft"],
  ["missileworks", "Missile Works", /missile ?works|m-?dacs|\brrc ?[23]\b|rrc2\+|rrc2l|rrc3 ?(sport|plus)?/im, "ft"],
  ["apogee", "Apogee Components", /apogee ?components|apogee ?rockets|apogeerockets/im, "ft"],
  ["perfectflite", "PerfectFlite", /perfect ?flite|stratologger|pnut|sl ?100|alt ?15k|\.pf2\b|mav?\b.*perfect/im, "ft"],
];
/**
 * The altimeter maker, from a file's first lines and name.
 * @param {string} head
 * @param {string} fname
 * @returns {{id:string, name:string, unit:string}}
 */
function altBrand(head, fname) {
  const s = (fname || "") + "\n" + head;
  for (const b of ALT_BRANDS) if (b[2].test(s)) return { id: b[0], name: b[1], unit: b[3] };
  if (/\.pf2$/i.test(fname || "")) return { id: "perfectflite", name: "PerfectFlite", unit: "ft" };
  return { id: "other", name: "Altimeter", unit: "ft" };
}
/**
 * True if text is a plain number.
 */
const altNum = (s) => s !== "" && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s);
/**
 * Splits a line into fields (a space delimiter means any run of whitespace; quotes are stripped).
 * @param {string} l
 * @param {string} d delimiter
 * @returns {string[]}
 */
function altSplit(l, d) {
  return d === " " ? l.trim().split(/\s+/) : l.split(d).map((x) => x.trim().replace(/^"(.*)"$/, "$1"));
}
/**
 * Reads an altimeter file into a table, with a first guess at which columns are which.
 * @param {string} text
 * @param {string} fname
 * @returns {object} {brand, cols, data, raw, rate, preUnit, hasHeader, fname, map}, or {error}
 */
export function altParse(text, fname) {
  text = String(text || "").replace(/^\uFEFF/, "");
  const lines = text.split(/\r\n|\n|\r/);
  // eslint-disable-next-line no-control-regex -- a binary file has control characters
  if (/[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 4000)))
    return {
      error:
        "This looks like a binary file. Export the flight as a CSV or text file from the altimeter's own program, then import that.",
    };
  const brand = altBrand(lines.slice(0, 80).join("\n"), fname);
  let best = null;
  for (const d of [",", "\t", ";", " "]) {
    let run = [];
    const runs = [];
    lines.forEach((l, i) => {
      if (!l.trim()) return;
      const f = altSplit(l, d),
        nn = f.filter(altNum).length,
        ok = l.trim()[0] !== "#" && nn >= 1 && nn >= f.length * 0.5;
      if (ok) run.push([i, f.length]);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    });
    if (run.length) runs.push(run);
    for (const r of runs) {
      const cnt = {};
      r.forEach(([, n]) => (cnt[n] = (cnt[n] || 0) + 1));
      const n = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || b - a)[0],
        rows = r.filter((x) => x[1] === n).map((x) => x[0]);
      const score = rows.length * (n >= 2 ? 2 : 1) + (d === " " ? 0 : 0.5);
      if (rows.length >= 8 && (!best || score > best.score)) best = { d, n, rows, score };
    }
  }
  if (!best) return { error: "No columns of numbers were found in this file." };
  const { d, n, rows } = best;
  // the header: the nearest line above the numbers with the same number of fields, mostly words
  let header = null;
  for (let i = rows[0] - 1; i >= Math.max(0, rows[0] - 40); i--) {
    const raw = lines[i].replace(/^\s*#\s*/, "");
    if (!raw.trim()) continue;
    const f = altSplit(raw, d);
    if (f.length >= n && f.length <= n + 1 && f.filter((x) => x && !altNum(x)).length >= Math.max(1, f.length * 0.5)) {
      header = f.slice(0, n);
      break;
    }
  }
  const cols = Array.from({ length: n }, (_, k) => (header && header[k] ? header[k] : `Column ${k + 1}`));
  const data = rows.map((i) => altSplit(lines[i], d).map((x) => (altNum(x) ? +x : NaN)));
  const pre = lines.slice(0, rows[0]).join("\n");
  const rm = pre.match(/(\d+(?:\.\d+)?)\s*(?:samples?\s*(?:\/|per)\s*s(?:ec(?:ond)?)?|sps|hz)\b/i);
  const P = {
    brand,
    cols,
    data,
    raw: rows.map((i) => altSplit(lines[i], d)),
    rate: rm ? +rm[1] : brand.id === "perfectflite" ? 20 : 10,
    preUnit: /\bmeters?\b|\bmetres?\b/i.test(pre) ? "m" : /\bfeet\b|\bft\b/i.test(pre) ? "ft" : null,
    hasHeader: !!header,
    fname: fname || "",
  };
  P.map = altGuess(P);
  return P;
}
/**
 * Pressure units: [name, Pa].
 */
export const ALT_PRESS = [
  ["atm", 101325],
  ["hPa", 100],
  ["kPa", 1000],
  ["Pa", 1],
  ["psi", 6894.757],
  ["inHg", 3386.389],
];
/**
 * The unit a column header names, if any.
 * @param {string} h header
 * @param {string} kind "time", "alt", "vel" or "press"
 * @returns {string|null}
 */
function altColUnit(h, kind) {
  h = h.toLowerCase();
  if (kind === "time")
    return /\bms\b|msec|millis|\(ms\)|_ms\b/.test(h) ? "ms" : /\bs\b|sec|\(s\)|_s\b/.test(h) ? "s" : null;
  if (kind === "alt")
    return /\bft\b|feet|\(ft|_ft|ft\)|\bfeet\b/.test(h) ? "ft" : /\(m\)|\bm\b|meter|metre|_m\b/.test(h) ? "m" : null;
  if (kind === "vel")
    return /ft\/s|fps|ft\/sec|feet|_ft|\bft\b/.test(h) ? "ft" : /m\/s|mps|meter|metre|_m\b|\(m/.test(h) ? "m" : null;
  if (kind === "press") {
    for (const [u] of ALT_PRESS)
      if (new RegExp("\\b" + u.toLowerCase() + "\\b|\\(" + u.toLowerCase() + "|_" + u.toLowerCase()).test(h)) return u;
    if (/mbar|millibar/.test(h)) return "hPa";
    return null;
  }
  return null;
}
/**
 * Guesses the time, altitude (or pressure) and velocity columns and their units.
 * @param {object} P from altParse
 * @returns {object} map {t, alt, vel, isP, tUnit, aUnit, vUnit, pUnit, rate}: column indexes (-1 for none) and units
 */
function altGuess(P) {
  const H = P.cols.map((h) => h.toLowerCase()),
    n = H.length,
    col = (k) => P.data.map((r) => r[k]);
  /**
   * The first column whose header matches one of the patterns (and none of the excluded ones).
   */
  const find = (res, not) => {
    for (const re of res) {
      const k = H.findIndex((h) => re.test(h) && !(not && not.test(h)));
      if (k >= 0) return k;
    }
    return -1;
  };
  /**
   * True for a column that only rises (a time column).
   */
  const monotone = (k) => {
    const v = col(k).filter(isFinite);
    if (v.length < 5) return false;
    let up = 0;
    for (let i = 1; i < v.length; i++) if (v[i] > v[i - 1]) up++;
    return up >= 0.95 * (v.length - 1);
  };
  /**
   * A column's range.
   */
  const spread = (k) => {
    const v = col(k).filter(isFinite);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  let t = find(
    [/^(t|time|secs?|seconds|elapsed)\b/, /flight.?time|time.?since|syncsec|^time/, /time|sec/],
    /clock|date|utc|gps|local|hour|min/,
  );
  if (t < 0 || !monotone(t)) {
    t = -1;
    for (let k = 0; k < n; k++)
      if (monotone(k) && spread(k) > 0) {
        t = k;
        break;
      }
  }
  let alt = find(
    [/height|\bagl\b/, /^alt\b|^alt[ _(]|^altitude/, /^f?alt/, /alt/],
    /gps|max|press|state|apogee|deploy/,
  );
  let press = -1;
  if (alt < 0) press = find([/press|baro|mbar|hpa|\batm\b/], /speed|vel|temp|state|flag|liftoff|apogee/);
  if (alt < 0 && press < 0) {
    const c = [...Array(n).keys()].filter((k) => k !== t && spread(k) > 0).sort((a, b) => spread(b) - spread(a));
    alt = c.length ? c[0] : -1;
  }
  let vel = find(
    [/^speed|_speed$|^speed/, /^f?veloc|^vel|velocity/, /speed/],
    /wind|gps|max|ground|horiz|down.?range|cross/,
  );
  if (vel === alt || vel === t) vel = -1;
  const map = {
    t,
    alt: alt >= 0 ? alt : press,
    isP: alt < 0 && press >= 0,
    vel,
    tUnit: "s",
    aUnit: P.preUnit || P.brand.unit,
    vUnit: null,
    pUnit: "atm",
    rate: P.rate,
  };
  if (t >= 0) {
    map.tUnit = altColUnit(P.cols[t], "time") || "s";
    const v = col(t).filter(isFinite),
      dt = [];
    for (let i = 1; i < v.length; i++) if (v[i] > v[i - 1]) dt.push(v[i] - v[i - 1]);
    dt.sort((a, b) => a - b);
    if (map.tUnit === "s" && dt.length && dt[dt.length >> 1] >= 2 && !altColUnit(P.cols[t], "time")) map.tUnit = "ms";
  }
  if (map.alt >= 0) {
    if (map.isP) {
      map.pUnit = altColUnit(P.cols[map.alt], "press");
      if (!map.pUnit) {
        const v = col(map.alt)
            .filter(isFinite)
            .sort((a, b) => a - b),
          m = v[v.length >> 1];
        map.pUnit = m < 2 ? "atm" : m < 22 ? "psi" : m < 45 ? "inHg" : m < 150 ? "kPa" : m < 2000 ? "hPa" : "Pa";
      }
    } else map.aUnit = altColUnit(P.cols[map.alt], "alt") || map.aUnit;
  }
  map.vUnit = vel >= 0 ? altColUnit(P.cols[vel], "vel") || map.aUnit : map.aUnit;
  return map;
}
/**
 * Median of three, to drop single-sample spikes (an ejection charge's pressure blip).
 * @param {number[]} a
 * @returns {number[]}
 *
 * median of three, to drop single-sample spikes (an ejection charge's pressure blip)
 */
function altMed3(a) {
  return a.map((v, i) => (i && i < a.length - 1 ? [a[i - 1], v, a[i + 1]].sort((x, y) => x - y)[1] : v));
}
/**
 * The flight's figures from the file's columns.
 * @param {object} P from altParse
 * @param {object} map column choices and units
 * @returns {object} {apo, vmax, vDer, tApo, tLand, rateHigh, rateLow, samples, rate, curve, ev, land, warn}, or {error}
 */
export function altCompute(P, map) {
  if (!P || !map || map.alt < 0) return { error: "Choose the altitude column." };
  const FTm = 0.3048,
    aK = map.aUnit === "ft" ? FTm : 1,
    vK = map.vUnit === "ft" ? FTm : 1,
    tK = map.tUnit === "ms" ? 0.001 : 1;
  let T = [],
    Hh = [],
    V = [],
    RI = [];
  const pK = (ALT_PRESS.find((p) => p[0] === map.pUnit) || ALT_PRESS[0])[1];
  P.data.forEach((r, i) => {
    const a = r[map.alt];
    if (!isFinite(a)) return;
    const t = map.t >= 0 ? r[map.t] * tK : i / (map.rate > 0 ? map.rate : 10);
    if (!isFinite(t)) return;
    if (T.length && t <= T[T.length - 1]) return;
    T.push(t);
    RI.push(i);
    Hh.push(map.isP ? a * pK : a * aK);
    V.push(map.vel >= 0 && isFinite(r[map.vel]) ? r[map.vel] * vK : NaN);
  });
  if (T.length < 8) return { error: "Too few samples to read a flight." };
  if (map.isP) {
    const p0 = [...Hh.slice(0, Math.min(10, Hh.length))].sort((a, b) => a - b)[Math.min(10, Hh.length) >> 1];
    if (!(p0 > 0)) return { error: "The pressure column doesn't look like pressure." };
    /**
     * Height from pressure (standard atmosphere).
     */
    const hs = (p) => 44330.8 * (1 - Math.pow(p / 101325, 0.1902632)),
      z0 = hs(p0);
    Hh = Hh.map((p) => (p > 0 ? hs(p) - z0 : NaN));
  }
  const S = altMed3(Hh);
  const head = S.slice(0, Math.max(3, Math.min(10, S.length >> 4)))
      .slice()
      .sort((a, b) => a - b),
    b0 = head[head.length >> 1];
  const range = Math.max(...S.filter(isFinite)) - b0;
  if (!(range > 3))
    return { error: "No climb was found in the altitude column. Check that the right column is chosen." };
  let iL = S.findIndex((h) => h - b0 > Math.max(6, 0.02 * range));
  if (iL < 0) iL = 0;
  // ground level: the samples on the pad before the climb
  const pad = [];
  for (let i = 0; i < iL; i++) if (T[i] < T[iL] - 0.3) pad.push(S[i]);
  const g0 = pad.length ? pad.slice().sort((a, b) => a - b)[pad.length >> 1] : b0;
  const h = S.map((v) => v - g0),
    raw = Hh.map((v) => v - g0);
  let i0 = iL;
  while (i0 > 0 && h[i0 - 1] > 0.3) i0--;
  if (i0 > 0) i0--;
  const tL = T[i0];
  let iA = i0;
  for (let i = i0; i < h.length; i++) if (h[i] > h[iA]) iA = i;
  const apo = h[iA];
  let iE = h.length - 1;
  for (let i = iA + 1; i < h.length; i++)
    if (h[i] <= Math.max(3, 0.01 * apo)) {
      iE = i;
      break;
    }
  const landed = iE < h.length - 1 || h[h.length - 1] <= Math.max(3, 0.01 * apo);
  // speed: the file's own velocity column, or the climb rate worked out from the altitude
  const hasV = V.some(isFinite);
  let vel = V,
    vDer = false;
  if (!hasV) {
    vDer = true;
    vel = T.map((t, i) => {
      let sx = 0,
        sy = 0,
        sxx = 0,
        sxy = 0,
        k = 0;
      for (let j = i; j >= 0 && T[j] >= t - 0.15; j--) {
        sx += T[j];
        sy += h[j];
        sxx += T[j] * T[j];
        sxy += T[j] * h[j];
        k++;
      }
      for (let j = i + 1; j < T.length && T[j] <= t + 0.15; j++) {
        sx += T[j];
        sy += h[j];
        sxx += T[j] * T[j];
        sxy += T[j] * h[j];
        k++;
      }
      if (k < 3) {
        const a = Math.max(0, i - 1),
          b = Math.min(T.length - 1, i + 1);
        return (h[b] - h[a]) / (T[b] - T[a] || 1);
      }
      const den = k * sxx - sx * sx;
      return den ? (k * sxy - sx * sy) / den : 0;
    });
  }
  let vmax = 0;
  for (let i = i0; i <= iA; i++) if (isFinite(vel[i]) && vel[i] > vmax) vmax = vel[i];
  /**
   * The first sample from an index at or below a height.
   *
   * descent rates: just after apogee (drogue, or the only chute) and near the ground (main)
   */
  const cross = (lvl, from) => {
    for (let i = from; i <= iE; i++) if (h[i] <= lvl) return i;
    return -1;
  };
  /**
   * The descent rate between two samples (null if less than 2 s apart).
   */
  const rate = (a, b) => (a >= 0 && b > a && T[b] - T[a] >= 2 ? (h[a] - h[b]) / (T[b] - T[a]) : null);
  const iH1 = cross(apo * 0.85, iA),
    iH2 = cross(apo * 0.55, iA),
    lowTop = Math.min(150, apo * 0.3),
    iL1 = cross(lowTop, iA);
  const rateHigh = rate(iH1, iH2),
    rateLow = landed ? rate(iL1, iE) : null;
  // a light curve to keep: at most ~500 points from the pad to landing, apogee included
  const a0 = Math.max(0, i0 - 2),
    a1 = Math.min(h.length - 1, iE + 2),
    step = Math.max(1, Math.ceil((a1 - a0 + 1) / 500));
  const C = { t: [], h: [], v: [] };
  const push = (i) => {
    C.t.push(+(T[i] - tL).toFixed(3));
    C.h.push(+raw[i].toFixed(1));
    C.v.push(hasV && isFinite(V[i]) ? +V[i].toFixed(1) : null);
  };
  for (let i = a0; i <= a1; i += step) {
    if (iA > i && iA < i + step) {
      push(i);
      push(iA);
    } else push(i);
  }
  if (!hasV) C.v = null;
  // flight events: from the file's own event flags or flight states where it has them, otherwise worked out from the curve
  const H = P.cols.map((c) => c.toLowerCase()),
    ev = { burn: null, burnEst: true, drogue: null, main: null, mainEst: true, mainAlt: null };
  const at = (i) => T[i] - tL,
    idxAt = (t) => {
      let k = 0;
      while (k < T.length - 1 && T[k] - tL < t) k++;
      return k;
    };
  const sn = H.findIndex((h) => /^state.?name$/.test(h));
  if (sn >= 0) {
    let prev = "";
    for (let i = 0; i < T.length; i++) {
      const v = String((P.raw[RI[i]] || [])[sn] || "").toLowerCase();
      if (v !== prev) {
        if (v === "coast" && ev.burn == null) {
          ev.burn = at(i);
          ev.burnEst = false;
        }
        if (v === "drogue" && ev.drogue == null) ev.drogue = at(i);
        if (v === "main" && ev.main == null) {
          ev.main = at(i);
          ev.mainEst = false;
        }
        prev = v;
      }
    }
  }
  H.forEach((hd, k) => {
    if (/volt|curr|cont|batt|temp|press|alt|veloc|speed|accel|time|sync/.test(hd)) return;
    const kind = /burnout|^coast/.test(hd)
      ? "burn"
      : /(apo|drogue).*(fire|deploy)|^drogue$/.test(hd)
        ? "drogue"
        : /main.*(fire|deploy)|^main$/.test(hd)
          ? "main"
          : null;
    if (!kind) return;
    const vals = RI.map((i) => P.data[i][k]);
    if (vals.some((v) => isFinite(v) && (v < 0 || v > 10))) return;
    let i0f = -1;
    for (let i = 1; i < vals.length; i++)
      if (vals[i] > 0 && !(vals[i - 1] > 0)) {
        i0f = i;
        break;
      }
    if (i0f < 0 || !(vals[0] === 0 || vals[0] === undefined || !isFinite(vals[0]))) return;
    if (kind === "burn" && ev.burn == null) {
      ev.burn = at(i0f);
      ev.burnEst = false;
    }
    if (kind === "drogue" && ev.drogue == null) ev.drogue = at(i0f);
    if (kind === "main" && ev.main == null) {
      ev.main = at(i0f);
      ev.mainEst = false;
    }
  });
  if (ev.burn == null) {
    let ib = i0;
    for (let i = i0; i <= iA; i++) if (isFinite(vel[i]) && vel[i] > (vel[ib] || -1e9)) ib = i;
    if (ib > i0) ev.burn = at(ib);
  }
  // the main opening: where the descent slows most sharply, if it slows by a lot
  if (ev.main == null && landed) {
    const dr = (i) => {
      let a = i,
        b = i;
      while (a > 0 && T[i] - T[a] < 0.75) a--;
      while (b < T.length - 1 && T[b] - T[i] < 0.75) b++;
      return b > a ? (h[a] - h[b]) / (T[b] - T[a]) : 0;
    };
    let bi = -1,
      bd = 0;
    for (let i = iA; i <= iE; i++) {
      if (T[i] < T[iA] + 2 || T[i] > T[iE] - 1) continue;
      const j = idxAt(at(i) - 1.5),
        k2 = idxAt(at(i) + 1.5);
      const d = dr(j) - dr(k2);
      if (d > bd) {
        bd = d;
        bi = i;
      }
    }
    if (bi >= 0) {
      const before = dr(idxAt(at(bi) - 1.5));
      if (bd > Math.max(5, 0.4 * before)) ev.main = at(bi);
    }
  }
  if (ev.main != null) {
    ev.mainAlt = h[idxAt(ev.main)];
  }
  // GPS: the landing spot from the pad's position, where the file has latitude and longitude
  let land = null;
  {
    const la = H.findIndex((h) => /^(gps.?)?lat(itude)?\b|^lat$/.test(h)),
      lo = H.findIndex((h) => /^(gps.?)?(lon|lng)(gitude)?\b|^lon$/.test(h));
    if (la >= 0 && lo >= 0) {
      const fix = [];
      RI.forEach((ri, i) => {
        const a = P.data[ri][la],
          b = P.data[ri][lo];
        if (isFinite(a) && isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && (a || b)) fix.push([i, a, b]);
      });
      const pre = fix.filter((f) => f[0] <= i0),
        post = fix.filter((f) => f[0] >= iE);
      if (fix.length >= 2 && (pre.length || fix[0][0] <= iA)) {
        const md = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
        const p0 = pre.length ? [md(pre.map((f) => f[1])), md(pre.map((f) => f[2]))] : [fix[0][1], fix[0][2]];
        const q = (post.length ? post : fix)[(post.length ? post : fix).length - 1],
          dn = (q[1] - p0[0]) * 111320,
          de = (q[2] - p0[1]) * 111320 * Math.cos((p0[0] * Math.PI) / 180);
        land = { dist: Math.hypot(de, dn), brg: ((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360 };
      }
    }
  }
  const warn = [];
  if (T[T.length - 1] - T[0] > 4 * 3600) warn.push("The time column covers more than four hours; check its units.");
  if (!landed) warn.push("The recording ends before landing.");
  if (vmax > 1500) warn.push("The top speed looks too high; check the velocity column's units.");
  return {
    apo,
    vmax,
    vDer,
    tApo: T[iA] - tL,
    tLand: landed ? T[iE] - tL : null,
    rateHigh,
    rateLow,
    samples: T.length,
    rate: (T.length - 1) / (T[T.length - 1] - T[0]),
    curve: C,
    ev,
    land,
    warn,
  };
}
