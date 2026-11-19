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
  [
    "featherweight",
    "Featherweight",
    /featherweight|blue ?raven|\braven\b|syncsec|baro_press|fip(a)?\b|time@axial accel/im,
    "ft",
  ],
  ["eggtimer", "Eggtimer", /eggtimer|egg ?finder|quasar|quantum|\bfalt\b|\bfveloc\b/im, "ft"],
  ["missileworks", "Missile Works", /missile ?works|m-?dacs|\brrc ?[23]\b|rrc2\+|rrc2l|rrc3 ?(sport|plus)?/im, "ft"],
  ["apogee", "Apogee Components", /apogee ?components|apogee ?rockets|apogeerockets/im, "ft"],
  ["jolly", "Jolly Logic", /jolly ?logic|altimeter ?(one|two|three)\b/im, "ft"],
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
  const multi = altMultiRate(lines, brand, fname);
  if (multi) return multi;
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
 * Reads a Featherweight Interface Program export, where every channel has its own time column ("Time@Axial Accel (Gs)",
 * the channel, a flags column) and its own sample rate, into one table on the fastest channel's times.
 * @param {string[]} lines
 * @param {object} brand
 * @param {string} fname
 * @returns {object|null} as altParse, or null for any other file
 */
function altMultiRate(lines, brand, fname) {
  const hi = lines.findIndex((l) => (l.match(/Time@/g) || []).length >= 2);
  if (hi < 0 || hi > 40) return null;
  const hd = lines[hi].split(",").map((x) => x.trim()),
    ch = [];
  hd.forEach((n, i) => {
    if (n.startsWith("Time@") && hd[i + 1] != null) ch.push({ name: hd[i + 1], i, t: [], v: [] });
  });
  if (ch.length < 2) return null;
  for (let r = hi + 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    // an empty channel is written as two commas where the others have three fields
    const f = lines[r].replace(/,,/g, ",,,").split(",");
    for (const c of ch) {
      const t = f[c.i],
        v = f[c.i + 1];
      if (
        t !== "" &&
        v !== "" &&
        t != null &&
        v != null &&
        altNum(t) &&
        altNum(v) &&
        !(c.t.length && +t <= c.t[c.t.length - 1])
      ) {
        c.t.push(+t);
        c.v.push(+v);
      }
    }
  }
  const base = ch.reduce((a, b) => (b.t.length > a.t.length ? b : a));
  if (base.t.length < 8) return null;
  const step = Math.max(1, Math.ceil(base.t.length / 120000)),
    T = base.t.filter((_, k) => k % step === 0);
  const data = T.map((t) => [t]);
  for (const c of ch) {
    let j = 0;
    T.forEach((t, k) => {
      while (j < c.t.length - 2 && c.t[j + 1] < t) j++;
      const n = c.t.length;
      data[k].push(
        !n || t > c.t[n - 1] + 1 || t < c.t[0] - 1
          ? NaN
          : n === 1 || t <= c.t[j]
            ? c.v[j]
            : t >= c.t[j + 1]
              ? c.v[j + 1]
              : c.v[j] + ((c.v[j + 1] - c.v[j]) * (t - c.t[j])) / (c.t[j + 1] - c.t[j]),
      );
    });
  }
  const P = {
    brand: brand.id === "other" ? { id: "featherweight", name: "Featherweight", unit: "ft" } : brand,
    cols: ["Time", ...ch.map((c) => c.name)],
    data,
    raw: [],
    rate: (T.length - 1) / (T[T.length - 1] - T[0] || 1),
    preUnit: null,
    hasHeader: true,
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
  // the accelerometer along the rocket's axis, if the file has one
  const acc = find(
    [/^acceleration$|axial.?accel|accel.*axial/, /^accel(eration)?[ _]?[xz]?\b|^accel/, /accel/],
    /lat|gyro|max|peak|veloc|speed|alt|time|state|flag|temp/,
  );
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
    acc: acc === alt || acc === vel || acc === t ? -1 : acc,
    accUnit: "g",
  };
  if (map.acc >= 0) {
    const h = H[map.acc],
      v = col(map.acc).filter(isFinite),
      big = v.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
    map.accUnit = /\bmg\b|\(mg|_mg\b/.test(h)
      ? "mg"
      : /ft\/s|fps/.test(h)
        ? "ft/s2"
        : /m\/s|mps/.test(h)
          ? "m/s2"
          : /\bgs?\b|\(g|_g\b|g's/.test(h)
            ? "g"
            : P.brand.id === "altus"
              ? "m/s2"
              : big > 2000
                ? "mg"
                : big > 90
                  ? "m/s2"
                  : "g";
  }
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
   * Descent rates: just after apogee (drogue, or the only chute) and near the ground (main)
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
  // the apogee charge, where the file doesn't flag it: a sudden change in the deceleration near apogee (see altCharge)
  if (ev.drogue == null && ev.burn != null) {
    const c = altCharge(T, vel, tL, ev.burn, T[iA] - tL, landed ? T[iE] - tL : T[T.length - 1] - tL);
    if (c) {
      ev.drogue = c.t;
      ev.drogueEst = true;
    }
  }
  if (ev.drogue != null) ev.drogueAlt = h[idxAt(ev.drogue)];
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
  const coast = altCoast(P, map, { T, RI, h, tL, iA, i0 });
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
    coast,
  };
}
/**
 * The apogee charge, found from the curve when the file has no event flags. Coasting up, the rocket slows smoothly
 * (gravity and a drag that falls off with speed); a charge that fires before apogee splits it and opens a chute, so it
 * suddenly slows harder. Falling after apogee it speeds up at nearly 1 g until a chute opens and suddenly stops that.
 * The deceleration is compared just before and just after each moment from 1 s after burnout to 5 s after apogee, and
 * the biggest sudden change of at least 0.5 g counts as the charge, one before apogee first.
 * @param {number[]} T times, s
 * @param {number[]} vel vertical speeds, m/s
 * @param {number} tL liftoff time
 * @param {number} burn burnout, s after liftoff
 * @param {number} tApo apogee, s after liftoff
 * @param {number} tEnd the end of the useful record, s after liftoff
 * @returns {{t:number, jump:number}|null} the charge's time after liftoff and the change in g
 */
function altCharge(T, vel, tL, burn, tApo, tEnd) {
  const G = 9.80665,
    n = T.length;
  if (n < 20) return null;
  // the acceleration: a straight line fitted to the speed over ±0.25 s
  const acc = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let sx = 0,
      sy = 0,
      sxx = 0,
      sxy = 0,
      k = 0;
    for (let j = i; j >= 0 && T[j] >= T[i] - 0.25; j--)
      if (isFinite(vel[j])) {
        sx += T[j];
        sy += vel[j];
        sxx += T[j] * T[j];
        sxy += T[j] * vel[j];
        k++;
      }
    for (let j = i + 1; j < n && T[j] <= T[i] + 0.25; j++)
      if (isFinite(vel[j])) {
        sx += T[j];
        sy += vel[j];
        sxx += T[j] * T[j];
        sxy += T[j] * vel[j];
        k++;
      }
    const den = k * sxx - sx * sx;
    if (k >= 3 && den) acc[i] = (k * sxy - sx * sy) / den;
  }
  const mean = (a, b) => {
    let s = 0,
      k = 0;
    for (let j = 0; j < n; j++)
      if (T[j] - tL >= a && T[j] - tL <= b && isFinite(acc[j])) {
        s += acc[j];
        k++;
      }
    return k >= 2 ? s / k : NaN;
  };
  // a change climbing comes first (a charge before apogee); falling, the moment just around apogee is skipped, where a
  // chute already open turns its pull from down to up
  let up = null,
    down = null;
  const t0 = burn + 1.5,
    t1 = Math.min(tApo + 5, tEnd - 1);
  for (let i = 0; i < n; i++) {
    const t = T[i] - tL;
    if (t < t0 || t > t1 || (t > tApo - 0.2 && t < tApo + 0.6)) continue;
    const before = mean(t - 0.9, t - 0.15),
      after = mean(t + 0.15, t + 0.9);
    if (!isFinite(before) || !isFinite(after)) continue;
    if (t < tApo) {
      const jump = (before - after) / G;
      if (jump >= 0.5 && (!up || jump > up.jump)) up = { t, jump };
    } else {
      const jump = (after - before) / G;
      if (jump >= 0.5 && (!down || jump > down.jump)) down = { t, jump };
    }
  }
  return up || down;
}
/**
 * Accelerometer units: [name, m/s²].
 */
export const ALT_ACC = [
  ["g", 9.80665],
  ["m/s2", 1],
  ["ft/s2", 0.3048],
  ["mg", 0.00980665],
];
/**
 * What the accelerometer along the rocket's axis recorded between burnout and apogee, kept small enough to store with
 * the flight: in the coast it reads the drag deceleration directly (gravity acts on the sensor and the rocket alike),
 * so with the rocket's weight it gives the drag, whatever the motor did. The zero is the reading just before apogee,
 * where there is next to no drag; the speed is the accelerometer's own, added up from liftoff with gravity taken off,
 * as for a flight straight up.
 * @param {object} P from altParse
 * @param {object} map column choices and units
 * @param {object} F the flight as altCompute found it: times T, their rows RI, heights h, liftoff time tL, apogee index
 *   iA, liftoff index i0
 * @returns {object|null} {zero, vz, hz, t, a, v, h (the coast, in steps), bt, ba, bv, bh, bdt (the burn, in steps), hIn,
 *   tb, n}: m, s, m/s, m/s² as read (drag negative); hIn is the height the accelerometer makes of the climb; or
 *   {why} when the column can't be used; or null with no accelerometer column
 */
function altCoast(P, map, F) {
  if (!(map.acc >= 0)) return null;
  const G = 9.80665,
    kA = (ALT_ACC.find((u) => u[0] === map.accUnit) || ALT_ACC[0])[1],
    { T, RI, h, tL, iA, i0 } = F,
    n = T.length;
  let a = RI.map((ri) => P.data[ri][map.acc] * kA);
  if (a.filter(isFinite).length < 0.8 * n) return { why: "the acceleration column has gaps" };
  for (let i = 0; i < n; i++) if (!isFinite(a[i])) a[i] = i ? a[i - 1] : 0;
  const med = (v) => (v.length ? v.slice().sort((x, y) => x - y)[v.length >> 1] : NaN),
    mean = (lo, hi) => {
      let s = 0,
        k = 0;
      for (let i = lo; i < hi && i < n; i++) {
        s += a[i];
        k++;
      }
      return k ? s / k : NaN;
    },
    at = (t) => {
      let k = 0;
      while (k < n - 1 && T[k] < t) k++;
      return k;
    };
  // on the pad: the first samples, before the climb
  const padEnd = Math.max(3, at(tL - 0.3));
  let p0 = med(a.slice(0, padEnd));
  // the sensor's sense: thrust must read positive
  const bEnd = at(tL + Math.min(1, Math.max(0.3, (T[iA] - tL) / 6)));
  if (mean(i0, Math.max(bEnd, i0 + 2)) - p0 < 0) {
    a = a.map((x) => -x);
    p0 = -p0;
  }
  // with gravity on the pad (reads +1 g) or with it taken off (reads 0)
  if (Math.abs(p0 - G) >= 0.35 * G && Math.abs(p0) >= 0.35 * G)
    return { why: "it doesn't read 0 or 1 g on the pad (the recording may start after liftoff)" };
  const off = Math.abs(p0 - G) < 0.35 * G ? 0 : G;
  a = a.map((x) => x + off);
  // liftoff and burnout from the accelerometer itself
  let iL = -1;
  for (let i = Math.max(0, at(tL - 2)); i < Math.min(n - 3, at(tL + 1.5)); i++)
    if (a[i] > 2.5 * G && a[i + 1] > 2 * G && a[i + 2] > 2 * G) {
      iL = i;
      break;
    }
  if (iL < 0) return { why: "no thrust was found in the acceleration column" };
  const dtm = (T[n - 1] - T[0]) / (n - 1),
    w = Math.max(1, Math.round(0.1 / dtm));
  let iB = -1;
  for (let i = at(T[iL] + 0.25); i < iA - w; i++)
    if (mean(i, i + w) < 0) {
      iB = i;
      break;
    }
  if (iB < 0) return { why: "no coast was found in the acceleration column" };
  const tA = T[iA],
    z0 = at(tA - 1.6),
    z1 = at(tA - 0.4);
  if (tA - T[iB] < 3 || z1 - z0 < 2) return { why: "the coast is too short" };
  const zero = mean(z0, z1);
  // speed and height by adding up the accelerometer, for a flight straight up
  const v = new Array(n).fill(0),
    hI = new Array(n).fill(0);
  for (let i = iL + 1; i < n; i++) {
    const d = T[i] - T[i - 1];
    v[i] = v[i - 1] + (a[i - 1] - zero - G) * d;
    hI[i] = hI[i - 1] + v[i - 1] * d;
  }
  const r3 = (x) => +x.toFixed(3),
    r1 = (x) => +x.toFixed(1);
  const steps = (ta, tb, max) => {
    const o = { t: [], a: [], v: [], h: [] },
      dt = Math.max((tb - ta) / max, dtm);
    for (let t = ta; t < tb - 1e-9; t += dt) {
      const i = at(t),
        j = Math.max(i + 1, at(t + dt));
      o.t.push(r3((T[i] + T[Math.min(j, n - 1)]) / 2 - T[iL]));
      o.a.push(r3(mean(i, j)));
      o.v.push(r1(v[Math.min(n - 1, (i + j) >> 1)]));
      o.h.push(r1(h[Math.min(n - 1, (i + j) >> 1)]));
    }
    return { ...o, dt };
  };
  const C = steps(T[iB] + 0.35, tA - 1.6, 120),
    B = steps(T[iL], T[iB], 40);
  if (C.t.length < 12) return { why: "too few samples in the coast" };
  let vz = 0;
  for (let i = z0; i < z1; i++) vz += v[i] / (z1 - z0);
  return {
    zero: r3(zero),
    vz: r1(vz),
    hz: r1(h[(z0 + z1) >> 1]),
    t: C.t,
    a: C.a,
    v: C.v,
    h: C.h,
    bt: B.t,
    ba: B.a,
    bv: B.v,
    bh: B.h,
    bdt: r3(B.dt),
    hIn: r1(hI[iA]),
    tb: r3(T[iB] - T[iL]),
    n: C.t.length,
  };
}
