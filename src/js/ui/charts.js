/**
 * Drawing: the canvas helpers, the flight chart and its series buttons, the weathercocking cone view, fins drawn to
 * scale, and the rocket's side view.
 */
import { bldDraw } from "../builder/side-view.js";
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import { FIN_EDGES, IN } from "../core/units-and-fin-edges.js";
import { series, setSeries, units } from "../design/defaults.js";
import { flOverlay } from "../flightlog/xlsx.js";
import { finGeom } from "../physics/aerodynamics.js";
import { drawMCInto } from "../physics/monte-carlo.js";
import { lastSim } from "./results.js";
import { SERIES } from "./rso-checklist.js";
import { fmt, fromDisp, toDisp, uname } from "./units.js";
/**
 * Sizes a canvas for its displayed size and the screen's pixel ratio.
 * @param {HTMLCanvasElement} cv
 * @returns {{c:CanvasRenderingContext2D, W:number, H:number}} the context (scaled to CSS pixels) and size
 */
export function setupCanvas(cv) {
  const r = cv.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, r.width * dpr);
  cv.height = r.height * dpr;
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, W: r.width, H: r.height };
}
/**
 * A CSS custom property's value (theme colors).
 * @param {string} v property name, e.g. "--accent"
 * @returns {string}
 */
export function css(v) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}
/**
 * Round axis tick values (steps of 1, 2, 2.5 or 5 × a power of ten).
 * @param {number} min
 * @param {number} max
 * @param {number} [n=5] about how many ticks
 * @returns {number[]} tick values covering min to max
 */
export function niceTicks(min, max, n = 5) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= n) || 10 * mag;
  const lo = Math.floor(min / step) * step,
    hi = Math.ceil(max / step) * step;
  const t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(10));
  return t;
}
/**
 * Draws the chart's series buttons.
 */
export function renderSeries() {
  document.getElementById("series").innerHTML = Object.entries(SERIES)
    .map(([k, [n]]) => `<button data-s="${k}" aria-pressed="${k === series}">${n}</button>`)
    .join("");
  document.querySelectorAll("#series button").forEach(
    (b) =>
      (b.onclick = () => {
        setSeries(b.dataset.s);
        CHART_CUR.t = null;
        store.set("rfs-series", series);
        renderSeries();
        drawChart();
      }),
  );
}
/* the flight chart's read-out line: the time you touched (null for none), the run it's for, and how the last drawing
   mapped time to the screen (for turning a touch into a time) */
const CHART_CUR = { t: null, sim: null, geo: null };
/**
 * A value of a series at a time, read off straight between its samples (null outside them).
 * @param {number[]} ts times, increasing
 * @param {number[]} vs values
 * @param {number} t
 * @returns {number|null}
 */
function chartValAt(ts, vs, t) {
  if (!ts || ts.length < 2 || t < ts[0] || t > ts[ts.length - 1]) return null;
  let lo = 0,
    hi = ts.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    ts[m] <= t ? (lo = m) : (hi = m);
  }
  const a = vs[lo],
    b = vs[hi];
  if (!isFinite(a) || !isFinite(b)) return isFinite(a) ? a : isFinite(b) ? b : null;
  return ts[hi] > ts[lo] ? a + ((b - a) * (t - ts[lo])) / (ts[hi] - ts[lo]) : a;
}
/**
 * Draws the read-out line at the touched time, with each line's value where it crosses it.
 * @param {CanvasRenderingContext2D} c
 * @param {object} g the chart's layout: X, Y, W, H, pads, x1, and the lines [{ts, vs, color, fmt}]
 */
function drawChartCursor(c, g) {
  const t = CHART_CUR.t;
  if (t == null || t < 0 || t > g.x1) return;
  const x = g.X(t),
    top = g.padT,
    bot = g.H - g.padB;
  c.save();
  c.strokeStyle = css("--ink");
  c.globalAlpha = 0.7;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, top);
  c.lineTo(x, bot);
  c.stroke();
  c.globalAlpha = 1;
  c.font = "10px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  // the time, along the bottom
  c.textBaseline = "bottom";
  const left = x > g.W - 70;
  c.textAlign = left ? "right" : "left";
  c.fillStyle = css("--muted");
  c.fillText(`${t.toFixed(t < 10 ? 2 : 1)} s`, x + (left ? -4 : 4), bot - 2);
  // each line's value, beside where it crosses (kept apart and inside the plot)
  const marks = g.lines
    .map((L) => {
      const v = chartValAt(L.ts, L.vs, t);
      return v == null ? null : { y: g.Y(v), text: L.fmt(v), color: L.color };
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);
  let last = -Infinity;
  const panel = css("--panel");
  for (const m of marks) {
    c.fillStyle = m.color;
    c.beginPath();
    c.arc(x, m.y, 3.5, 0, 7);
    c.fill();
    const ty = Math.min(Math.max(m.y - 7, top + 6, last + 13), bot - 18);
    last = ty;
    const w = c.measureText(m.text).width;
    const tx = left ? x - 7 - w : x + 7;
    c.fillStyle = panel;
    c.globalAlpha = 0.85;
    c.fillRect(tx - 2, ty - 6, w + 4, 12);
    c.globalAlpha = 1;
    c.fillStyle = m.color;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(m.text, tx, ty);
  }
  c.restore();
}
/**
 * The events marked on the flight chart (burnout, apogee, chute, main, landing...).
 * @param {object} st flight summary
 * @returns {Array[]} [time, label]
 */
export function chartEvents(st) {
  const main = [st.tMain && st.tMain !== st.tApo && st.tMain !== st.tDeploy ? st.tMain : null, "Main"];
  const dep = [
    st.tDeploy != null && st.tApo != null && Math.abs(st.tDeploy - st.tApo) > 0.3 ? st.tDeploy : null,
    "Chute",
  ];
  if (!st.staged) return [[st.tb, "Burnout"], [st.tApo, "Apogee"], dep, main];
  const same = Math.abs(st.tIgn - st.tSep) < 0.05,
    same1 = st.three && Math.abs(st.tIgnMid - st.tSep1) < 0.05;
  return [
    ...(st.three
      ? [
          [st.tSep1, same1 ? "Staging 1" : "Separation 1"],
          [same1 || st.midAfterApogee ? null : st.tIgnMid, "Ignition 1"],
        ]
      : []),
    [st.tSep, same ? (st.three ? "Staging 2" : "Staging") : st.three ? "Separation 2" : "Separation"],
    [same || st.ignAfterApogee || st.ignLocked ? null : st.tIgn, "Ignition"],
    [st.ignAfterApogee || st.ignLocked ? null : st.tb, "Burnout"],
    [st.tApo, "Apogee"],
    dep,
    main,
  ];
}
/**
 * Draws the flight chart for the chosen series (or the cone or landing views).
 */
export function drawChart() {
  if (!lastSim) return;
  const cv = document.getElementById("chart");
  cv.classList.toggle("tall", series === "land");
  const { c, W, H } = setupCanvas(cv);
  if (series === "cone") {
    drawConeChart(c, W, H);
    return;
  }
  if (series === "land") {
    drawMCInto(cv, c, W, H);
    return;
  }
  const { out, st } = lastSim;
  const [label, dim] = SERIES[series];
  let xs = out.t,
    ys = out[series].map((v) => toDisp(v, dim));
  // pitch: only until the first chute opens (after that the airframe just hangs under the chute)
  if (series === "pitch") {
    const tEnd = st.tDeploy ?? st.tLand;
    if (tEnd != null) {
      const k = xs.findIndex((t) => t > tEnd + 1e-9);
      if (k > 0) {
        xs = xs.slice(0, k);
        ys = ys.slice(0, k);
      }
    }
  }
  // angle of attack: from leaving the rail until the chute opens (or apogee, where the airspeed runs out)
  let aoaIx = null;
  if (series === "aoa") {
    const t0 = st.offRailT ?? 0,
      t1 = st.tDeploy ?? st.tApo ?? st.tLand ?? Infinity,
      ix = [];
    out.t.forEach((t, i) => {
      if (t >= t0 - 1e-9 && t <= t1 + 1e-9 && isFinite(out.aoa[i])) ix.push(i);
    });
    if (!ix.length) ix.push(0);
    aoaIx = ix;
    xs = ix.map((i) => out.t[i]);
    ys = ix.map((i) => (isFinite(out.aoa[i]) ? out.aoa[i] : 0));
  }
  if (series === "thrust" || series === "acc") {
    const tEnd = Math.max(st.tb * 1.3, (st.tApo || st.tb) * 0.25);
    const k = xs.findIndex((t) => t > tEnd);
    if (k > 0) {
      xs = xs.slice(0, k);
      ys = ys.slice(0, k);
    }
  }
  c.clearRect(0, 0, W, H);
  const padL = 48,
    padR = 10,
    padT = 10,
    padB = 26;
  const MEAS = typeof flOverlay === "function" ? flOverlay(series) : null,
    my = MEAS ? MEAS.flatMap((o) => o.y.filter(isFinite)) : [];
  const ymax = Math.max(...ys, ...my, 1e-6);
  let ymin = Math.min(0, ...ys, ...my);
  if (ymin < 0 && -ymin < 0.03 * ymax) ymin = 0;
  const yt = niceTicks(ymin, ymax, 4),
    xt = niceTicks(0, Math.max(xs[xs.length - 1] || 1, ...(MEAS ? MEAS.map((o) => o.t[o.t.length - 1]) : [0])), 5);
  const y0 = yt[0],
    y1 = yt[yt.length - 1],
    x1 = xt[xt.length - 1];
  /**
   * Time to screen x (and value to screen y).
   */
  const X = (t) => padL + (t / x1) * (W - padL - padR),
    Y = (v) => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);
  c.font = "11px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  c.fillStyle = css("--muted");
  c.strokeStyle = css("--grid");
  c.lineWidth = 1;
  c.textAlign = "right";
  c.textBaseline = "middle";
  yt.forEach((v) => {
    c.beginPath();
    c.moveTo(padL, Y(v));
    c.lineTo(W - padR, Y(v));
    c.stroke();
    c.fillText(Math.abs(v) >= 1000 ? v / 1000 + "k" : String(+v.toFixed(2)), padL - 6, Y(v));
  });
  c.textAlign = "center";
  c.textBaseline = "top";
  xt.forEach((t) => c.fillText(String(+t.toFixed(2)), X(t), H - padB + 6));
  c.textAlign = "left";
  c.fillText("s", W - padR - 8, H - padB + 6);
  if (CHART_CUR.sim !== lastSim) {
    CHART_CUR.sim = lastSim;
    CHART_CUR.t = null;
  }
  // the lines the read-out line reads values from, as they're drawn below
  const curDec = dim === "acc" ? 1 : series === "pitch" || series === "aoa" ? 1 : 0,
    curFmt = (v) =>
      series === "pitch" || series === "aoa"
        ? `${v.toFixed(1)}°`
        : `${(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(Math.max(curDec, Math.abs(v) < 10 ? 1 : 0))).replace(/^-0(\.0+)?$/, "0")} ${uname(dim)}`,
    curLines = [{ ts: xs, vs: ys, color: css("--accent"), fmt: curFmt }];
  // events
  const ev = chartEvents(st);
  c.setLineDash([3, 3]);
  c.strokeStyle = css("--muted");
  ev.forEach(([t, n]) => {
    if (t == null || t > x1) return;
    c.beginPath();
    c.moveTo(X(t), padT);
    c.lineTo(X(t), H - padB);
    c.stroke();
  });
  c.setLineDash([]);
  // area + line
  const acc = css("--accent");
  c.beginPath();
  xs.forEach((t, i) => (i ? c.lineTo(X(t), Y(ys[i])) : c.moveTo(X(t), Y(ys[i]))));
  c.lineTo(X(xs[xs.length - 1]), Y(Math.max(y0, 0)));
  c.lineTo(X(xs[0]), Y(Math.max(y0, 0)));
  c.closePath();
  c.globalAlpha = 0.35;
  c.fillStyle = css("--gulf");
  c.fill();
  c.globalAlpha = 1;
  c.beginPath();
  xs.forEach((t, i) => (i ? c.lineTo(X(t), Y(ys[i])) : c.moveTo(X(t), Y(ys[i]))));
  c.strokeStyle = acc;
  c.lineWidth = 2;
  c.stroke();
  // peak marker
  let im = 0;
  ys.forEach((v, i) => {
    if (series === "drift" ? Math.abs(v) > Math.abs(ys[im]) : v > ys[im]) im = i;
  });
  // angle of attack: the peak just off the rail (the crosswind's kick), and the largest at speed (half the top airspeed or more)
  let aoaFast = null;
  if (series === "aoa" && aoaIx) {
    const t0 = xs[0],
      vmax = Math.max(...aoaIx.map((i) => out.va[i]).filter(isFinite), 0);
    im = 0;
    xs.forEach((t, i) => {
      if (t <= t0 + 2 && ys[i] > ys[im]) im = i;
    });
    // at speed: once the first swing off the rail has passed (its first low point)
    let k0 = im + 1;
    while (k0 < ys.length - 1 && !(ys[k0] <= ys[k0 - 1] && ys[k0] <= ys[k0 + 1])) k0++;
    aoaFast = null;
    aoaIx.forEach((j, i) => {
      if (i > k0 && out.va[j] >= 0.5 * vmax && (aoaFast == null || ys[i] > ys[aoaFast])) aoaFast = i;
    });
  }
  if (series === "drift" && y0 < 0 && y1 > 0) {
    c.strokeStyle = css("--muted");
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(padL, Y(0));
    c.lineTo(W - padR, Y(0));
    c.stroke();
  }
  c.fillStyle = acc;
  c.beginPath();
  c.arc(X(xs[im]), Y(ys[im]), 4, 0, 7);
  c.fill();
  c.fillStyle = css("--ink");
  c.textBaseline = "bottom";
  c.textAlign = X(xs[im]) > W - 90 ? "right" : "left";
  // (the peak's label gives way to the read-out line's)
  if (CHART_CUR.t == null || CHART_CUR.sim !== lastSim)
    c.fillText(
      series === "drift"
        ? `${Math.abs(ys[im]).toFixed(0)} ${uname(dim)} ${ys[im] < 0 ? "downwind" : "upwind"}`
        : series === "pitch"
          ? `${ys[im].toFixed(1)}° max`
          : series === "aoa"
            ? `${ys[im].toFixed(1)}° off the rail`
            : `${ys[im].toFixed(dim === "acc" ? 1 : 0)} ${uname(dim)}`,
      X(xs[im]) + (c.textAlign === "left" ? 7 : -7),
      series === "drift" && ys[im] < 0 && Y(ys[im]) + 18 < H - padB
        ? Y(ys[im]) + 18
        : Y(ys[im]) - 3 > 14
          ? Y(ys[im]) - 3
          : Y(ys[im]) + 16,
    );
  let bLeg = "";
  if (MEAS) {
    const mc = css("--ink");
    MEAS.forEach((o, k) => {
      c.save();
      c.strokeStyle = mc;
      c.globalAlpha = k ? 0.6 : 1;
      c.lineWidth = 1.8;
      c.setLineDash(k ? [7, 4] : [2, 3]);
      c.beginPath();
      let pen = false;
      o.t.forEach((t, i) => {
        const v = o.y[i];
        if (!isFinite(v) || t < 0 || t > x1) {
          pen = false;
          return;
        }
        pen ? c.lineTo(X(t), Y(v)) : c.moveTo(X(t), Y(v));
        pen = true;
      });
      c.stroke();
      c.restore();
      // the altimeter's events: short ticks along the bottom, lettered
      c.save();
      c.fillStyle = mc;
      c.strokeStyle = mc;
      c.lineWidth = 1.5;
      c.textAlign = "center";
      c.textBaseline = "bottom";
      c.font = "bold 10px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
      let lastX = -99;
      o.ev.forEach(([t, l]) => {
        if (t < 0 || t > x1) return;
        const xx = X(t);
        c.beginPath();
        c.moveTo(xx, H - padB);
        c.lineTo(xx, H - padB - 7);
        c.stroke();
        if (xx - lastX >= 9) {
          c.fillText(l, xx, H - padB - 8);
          lastX = xx;
        }
      });
      c.restore();
      curLines.push({ ts: o.t, vs: o.y, color: mc, fmt: curFmt });
      bLeg += `<span style="--c:${mc}">${esc(o.label)}${o.ev.length ? " (" + o.ev.map((e) => e[1] + " " + e[0].toFixed(1) + " s").join(", ") + ")" : ""}</span>`;
    });
  }
  if (series === "alt" && out.balt && out.balt.length) {
    const bc = css("--gulf-ink");
    c.save();
    c.setLineDash([5, 4]);
    c.strokeStyle = bc;
    c.lineWidth = 1.6;
    c.beginPath();
    out.bt.forEach((t, i) => {
      if (t > x1) return;
      const yy = Y(toDisp(out.balt[i], "alt"));
      i ? c.lineTo(X(t), yy) : c.moveTo(X(t), yy);
    });
    c.stroke();
    c.restore();
    curLines.push({ ts: out.bt, vs: out.balt.map((v) => toDisp(v, "alt")), color: bc, fmt: curFmt });
    bLeg += `<span style="--c:${bc}">Booster altitude</span>`;
  }
  if (series === "alt" && out.b1alt && out.b1alt.length) {
    const bc = css("--muted");
    c.save();
    c.setLineDash([2, 4]);
    c.strokeStyle = bc;
    c.lineWidth = 1.6;
    c.beginPath();
    out.b1t.forEach((t, i) => {
      if (t > x1) return;
      const yy = Y(toDisp(out.b1alt[i], "alt"));
      i ? c.lineTo(X(t), yy) : c.moveTo(X(t), yy);
    });
    c.stroke();
    c.restore();
    curLines.push({ ts: out.b1t, vs: out.b1alt.map((v) => toDisp(v, "alt")), color: bc, fmt: curFmt });
    bLeg += `<span style="--c:${bc}">First-stage altitude</span>`;
  }
  if (series === "pitch") {
    const v = ys[ys.length - 1],
      xe = X(xs[xs.length - 1]),
      ye = Y(v);
    c.fillStyle = acc;
    c.beginPath();
    c.arc(xe, ye, 4, 0, 7);
    c.fill();
    bLeg = `<span style="--c:${acc}">${st.tDeploy != null ? "At chute deployment" : "At landing (no chute opened)"}: ${v.toFixed(1)}°</span>`;
  }
  if (series === "aoa") {
    const g = css("--ink");
    if (aoaFast != null && aoaFast !== im && ys[aoaFast] >= 1) {
      const xa = X(xs[aoaFast]),
        ya = Y(ys[aoaFast]);
      c.fillStyle = g;
      c.beginPath();
      c.arc(xa, ya, 4, 0, 7);
      c.fill();
      c.textAlign = xa > W - 120 ? "right" : "left";
      c.textBaseline = "bottom";
      c.fillText(`${ys[aoaFast].toFixed(1)}° at speed`, xa + (c.textAlign === "left" ? 7 : -7), Math.max(ya - 3, 14));
    }
    const end = st.tDeploy != null ? "the chute opens" : "it reaches apogee";
    bLeg =
      `<span style="--c:${acc}">Off the rail: ${ys[im].toFixed(1)}° peak${ys[im] > 15 ? " — high: the rocket left the rail slowly for this wind" : ys[im] > 10 ? " — on the high side for this wind" : ""}</span>` +
      (aoaFast != null
        ? `<span style="--c:${g}">At speed, after the first swing (half the top airspeed or more): up to ${ys[aoaFast].toFixed(1)}°</span>`
        : "") +
      `<span style="--c:var(--muted)">Should settle within a few swings. It can rise steeply near apogee as the airspeed runs out; that's normal. Ends when ${end}.</span>`;
  }
  if (series === "drift" && st.landed) {
    const v = ys[ys.length - 1],
      xe = X(xs[xs.length - 1]),
      ye = Y(v);
    c.fillStyle = acc;
    c.beginPath();
    c.arc(xe, ye, 4, 0, 7);
    c.fill();
    const cr = toDisp(Math.abs(out.cross[out.cross.length - 1] || 0), dim);
    bLeg = `<span style="--c:${acc}">Lands ${Math.abs(v).toFixed(0)} ${uname(dim)} ${v < 0 ? "downwind" : "upwind"}${cr >= Math.max(3, 0.1 * Math.abs(v)) ? `, ${cr.toFixed(0)} ${uname(dim)} crosswind` : ""}</span>`;
  }
  CHART_CUR.geo = { padL, padR, W, x1 };
  drawChartCursor(c, { X, Y, W, H, padT, padB, x1, lines: curLines });
  document.getElementById("chartlegend").innerHTML =
    `<span style="--c:${acc}">${series === "drift" ? "Drift (+ upwind, − downwind)" : series === "pitch" ? "Pitch from vertical" : series === "aoa" ? "Angle of attack" : label} (${uname(dim)}) vs time</span>` +
    bLeg +
    ev
      .filter((e) => e[0] != null && e[0] <= x1)
      .map((e) => `<span style="--c:var(--muted)">${e[1]} ${e[0].toFixed(1)} s</span>`)
      .join("");
}
/**
 * Writes the highest wind (from the wind sweep) that keeps the airframe inside the safety cone while the motor burns.
 */
export function coneWindNote() {
  const RL = lastSim.L,
    cone = RL.cone ?? 20,
    rows = lastSim.windTable.filter((r) => !r.error && r.powerTilt != null);
  if (!rows.length) return "";
  if (rows.every((r) => r.powerTilt <= cone))
    return `It stays inside the ${cone}° safety cone under power at every wind speed listed.`;
  if (rows[0].powerTilt > cone)
    return `It leaves the ${cone}° safety cone under power even in calm air: check the rail angle and stability.`;
  let wMax = rows[0].w;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1],
      b = rows[i];
    if (b.powerTilt > cone) {
      wMax = a.w + ((b.w - a.w) * (cone - a.powerTilt)) / Math.max(b.powerTilt - a.powerTilt, 1e-6);
      break;
    }
    wMax = b.w;
  }
  return `It stays inside the ${cone}° safety cone under power up to about ${fmt(wMax, "wind", 0)} ${uname("wind")} of wind (tilts outside the cone are in red).`;
}
/**
 * Draws the climb from the side to true scale, with the safety cone; wind blows left to right.
 * @param {CanvasRenderingContext2D} c
 * @param {number} W width, px
 * @param {number} H height, px
 */
function drawConeChart(c, W, H) {
  const { out, st, L: RL } = lastSim,
    coneDeg = RL.cone ?? 20,
    cone = (coneDeg * Math.PI) / 180;
  const tEnd = st.tDeploy ?? st.tApo ?? st.tLand;
  let n = out.t.findIndex((t) => t > tEnd + 1e-9);
  if (n < 0) n = out.t.length;
  const xs = out.drift.slice(0, n).map((v) => -v),
    zs = out.alt.slice(0, n);
  c.clearRect(0, 0, W, H);
  const padL = 48,
    padR = 12,
    padT = 12,
    padB = 26,
    PW = W - padL - padR,
    PH = H - padT - padB;
  const zMax = Math.max(...zs, 1),
    xAbs = Math.max(...xs.map(Math.abs), zMax * Math.tan(cone), 1e-3);
  const k = Math.max((zMax * 1.1) / PH, (2 * xAbs * 1.12) / PW); // metres per pixel, the same both ways
  const X0 = padL + PW / 2,
    X = (x) => X0 + x / k,
    Y = (z) => padT + PH - z / k,
    zTop = PH * k,
    xHalf = (PW / 2) * k;
  c.font = "11px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  c.strokeStyle = css("--grid");
  c.fillStyle = css("--muted");
  c.lineWidth = 1;
  c.textAlign = "right";
  c.textBaseline = "middle";
  niceTicks(0, toDisp(zTop, "alt"), 4).forEach((v) => {
    const z = fromDisp(v, "alt");
    if (z > zTop + 1e-6) return;
    c.beginPath();
    c.moveTo(padL, Y(z));
    c.lineTo(W - padR, Y(z));
    c.stroke();
    c.fillText(Math.abs(v) >= 1000 ? v / 1000 + "k" : String(+v.toFixed(1)), padL - 6, Y(z));
  });
  c.textAlign = "center";
  c.textBaseline = "top";
  const xr = toDisp(xHalf, "alt");
  niceTicks(-xr, xr, 4).forEach((v) => {
    const x = fromDisp(v, "alt");
    if (Math.abs(x) > xHalf + 1e-6) return;
    c.fillText(String(Math.abs(+v.toFixed(1))), X(x), H - padB + 6);
  });
  // the cone from the pad
  const good = css("--good"),
    ex = zTop * Math.tan(cone);
  c.save();
  c.beginPath();
  c.rect(padL, padT, PW, PH);
  c.clip();
  c.beginPath();
  c.moveTo(X0, Y(0));
  c.lineTo(X(-ex), Y(zTop));
  c.lineTo(X(ex), Y(zTop));
  c.closePath();
  c.globalAlpha = 0.13;
  c.fillStyle = good;
  c.fill();
  c.globalAlpha = 1;
  c.setLineDash([5, 4]);
  c.strokeStyle = good;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(X(-ex), Y(zTop));
  c.lineTo(X0, Y(0));
  c.lineTo(X(ex), Y(zTop));
  c.stroke();
  c.setLineDash([]);
  c.strokeStyle = css("--muted");
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(padL, Y(0));
  c.lineTo(W - padR, Y(0));
  c.stroke();
  // flight path: thicker while a motor burns
  const acc = css("--accent"),
    tb = st.tb ?? 0;
  c.strokeStyle = acc;
  c.lineCap = "round";
  for (const [w, a, b] of [
    [1.6, 0, n],
    [
      3.2,
      0,
      Math.max(
        1,
        out.t.findIndex((t) => t > tb),
      ),
    ],
  ]) {
    const end = b < 0 ? n : Math.min(b, n);
    c.lineWidth = w;
    c.beginPath();
    for (let i = a; i < end; i++) {
      i === a ? c.moveTo(X(xs[i]), Y(zs[i])) : c.lineTo(X(xs[i]), Y(zs[i]));
    }
    c.stroke();
  }
  /**
   * Draws a marker at a point of the flight path.
   */
  const dot = (i, col) => {
    if (i < 0 || i >= n) return;
    c.fillStyle = col;
    c.beginPath();
    c.arc(X(xs[i]), Y(zs[i]), 4, 0, 7);
    c.fill();
  };
  const ib = out.t.findIndex((t) => t >= tb - 1e-9),
    ie = n - 1;
  dot(ib, acc);
  dot(ie, css("--ink"));
  c.restore();
  c.fillStyle = css("--muted");
  c.textBaseline = "bottom";
  c.textAlign = "left";
  c.fillText("← upwind", padL + 4, Y(0) - 4);
  c.textAlign = "right";
  c.fillText("downwind →", W - padR - 4, Y(0) - 4);
  c.fillStyle = good;
  c.textAlign = "center";
  c.textBaseline = "bottom";
  c.fillText(`${coneDeg}° cone`, X0, Y(Math.min(zTop * 0.96, zTop)) + 14);
  const pt = st.powerTilt,
    inside = pt != null && pt <= coneDeg;
  document.getElementById("chartlegend").innerHTML =
    `<span style="--c:${good}">Safety cone ±${coneDeg}° (${uname("alt")}, true scale)</span>` +
    `<span style="--c:${acc}">Under power${pt != null ? `: up to ${pt.toFixed(0)}° from vertical, ${inside ? "inside" : "outside"} the cone` : ""}</span>` +
    `<span style="--c:var(--ink)">${st.tDeploy != null ? "Chute opens" : "Apogee"}${st.pathAngle != null ? `, ${st.pathAngle.toFixed(0)}° off vertical from the pad` : ""}</span>`;
}
/**
 * Draws a fin set to scale, with its dimensions, and writes its note.
 * @param {string} cvId canvas id
 * @param {string} noteId note element id
 * @param {object} FS fin set: n, a (root), b (tip), s (span), sw (sweep), t, aft, edge, pts...
 */
export function drawFinsInto(cvId, noteId, FS) {
  const cv = document.getElementById(cvId);
  if (!cv || !cv.getBoundingClientRect().width) return;
  const { c, W, H } = setupCanvas(cv);
  c.clearRect(0, 0, W, H);
  const a = FS.a,
    b = FS.b,
    s = FS.s,
    sw = FS.sw,
    aft = Math.max(FS.aft, 0);
  const note = document.getElementById(noteId);
  if (!(a > 0 && s > 0)) {
    note.textContent = "Enter a root chord and span to see the fin.";
    return;
  }
  const ptsOK = FS.pts && FS.pts.length > 2;
  const xmin = ptsOK ? Math.min(0, ...FS.pts.map((p) => p[0])) : Math.min(0, sw),
    xmax = ptsOK ? Math.max(a + aft, ...FS.pts.map((p) => p[0])) : Math.max(a, sw + b, a + aft);
  const padL = 14,
    padR = 36,
    padT = 50,
    padB = 48;
  const sc = Math.min((W - padL - padR) / (xmax - xmin), (H - padT - padB) / s);
  const ox = padL + (W - padL - padR - (xmax - xmin) * sc) / 2 - xmin * sc,
    oy = H - padB;
  const X = (x) => ox + x * sc,
    Y = (y) => oy - y * sc;
  const ink = css("--ink"),
    muted = css("--muted"),
    acc = css("--accent"),
    field = css("--field");
  const mono = "11px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  const u = uname("len");
  // body tube surface and tail end
  c.fillStyle = field;
  c.fillRect(6, oy, W - 12, 10);
  c.strokeStyle = muted;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(6, oy + 0.5);
  c.lineTo(FS.noTail ? W - 6 : X(a + aft), oy + 0.5);
  c.stroke();
  if (!FS.noTail) {
    c.setLineDash([3, 3]);
    c.beginPath();
    c.moveTo(X(a + aft), oy - 10);
    c.lineTo(X(a + aft), oy + 12);
    c.stroke();
    c.setLineDash([]);
  }
  // fin outline, to scale
  if (ptsOK) {
    // the fin's own outline from the design file
    c.beginPath();
    FS.pts.forEach(([px, py], i) => (i ? c.lineTo(X(px), Y(py)) : c.moveTo(X(px), Y(py))));
    c.closePath();
    c.globalAlpha = 0.18;
    c.fillStyle = acc;
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = acc;
    c.lineWidth = 2;
    c.lineJoin = "round";
    c.stroke();
  } else {
    c.beginPath();
    c.moveTo(X(0), Y(0));
    c.lineTo(X(sw), Y(s));
    c.lineTo(X(sw + b), Y(s));
    c.lineTo(X(a), Y(0));
    c.closePath();
    c.globalAlpha = 0.18;
    c.fillStyle = acc;
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = acc;
    c.lineWidth = 2;
    c.lineJoin = "round";
    c.stroke();
  }
  // free-form: number each outline point, in the order they're listed
  if (ptsOK && FS.showPts) {
    c.font = mono;
    FS.pts.forEach(([px, py], i) => {
      c.fillStyle = acc;
      c.beginPath();
      c.arc(X(px), Y(py), 3.5, 0, 7);
      c.fill();
      c.fillStyle = ink;
      c.textAlign = "center";
      c.textBaseline = py > 1e-9 ? "bottom" : "top";
      c.fillText(
        String(i + 1),
        X(px) + (i === 0 ? -8 : i === FS.pts.length - 1 ? 8 : 0),
        py > 1e-9 ? Y(py) - 6 : Y(py) + 3,
      );
    });
  }
  // dimension helpers
  c.font = mono;
  c.lineWidth = 1;
  c.strokeStyle = muted;
  /**
   * Draws a horizontal dimension line with its label.
   */
  const dimH = (x1, x2, y, label, below, minPx = 0) => {
    if (Math.abs(X(x2) - X(x1)) < 2) return;
    c.beginPath();
    c.moveTo(X(x1), y);
    c.lineTo(X(x2), y);
    [x1, x2].forEach((x) => {
      c.moveTo(X(x), y - 4);
      c.lineTo(X(x), y + 4);
    });
    c.stroke();
    if (Math.abs(X(x2) - X(x1)) < minPx) return;
    c.fillStyle = ink;
    c.textAlign = "center";
    c.textBaseline = below ? "top" : "bottom";
    const mid = Math.min(
      Math.max((X(x1) + X(x2)) / 2, c.measureText(label).width / 2 + 4),
      W - c.measureText(label).width / 2 - 4,
    );
    c.fillText(label, mid, below ? y + 4 : y - 4);
  };
  dimH(0, a, oy + 18, `Root ${fmt(a, "len")} ${u}`, true);
  if (aft > 1e-6) dimH(a, a + aft, oy + 18, `${fmt(aft, "len")} to ${FS.tailName || "tail"}`, true, 90);
  if (!ptsOK) dimH(sw, sw + b, Y(s) - 10, `Tip ${fmt(b, "len")} ${u}`, false);
  if (!ptsOK && Math.abs(sw) > 1e-6) {
    c.setLineDash([2, 3]);
    c.beginPath();
    c.moveTo(X(0), Y(0) - 2);
    c.lineTo(X(0), Y(s) - 30);
    c.moveTo(X(sw), Y(s) - 2);
    c.lineTo(X(sw), Y(s) - 30);
    c.stroke();
    c.setLineDash([]);
    dimH(0, sw, Y(s) - 30, `Sweep ${fmt(sw, "len")} ${u}`, false);
  }
  const sx = Math.min(X(ptsOK ? Math.max(...FS.pts.map((p) => p[0])) : Math.max(a, sw + b)) + 14, W - padR + 14);
  c.beginPath();
  c.moveTo(sx, Y(0));
  c.lineTo(sx, Y(s));
  c.moveTo(sx - 4, Y(0));
  c.lineTo(sx + 4, Y(0));
  c.moveTo(sx - 4, Y(s));
  c.lineTo(sx + 4, Y(s));
  c.stroke();
  c.save();
  c.translate(sx + 5, (Y(0) + Y(s)) / 2);
  c.rotate(Math.PI / 2);
  c.fillStyle = ink;
  c.textAlign = "center";
  c.textBaseline = "bottom";
  c.fillText(`Span ${fmt(s, "len")} ${u}`, 0, 0);
  c.restore();
  const area = ptsOK ? (finGeom({ pts: FS.pts }) || { area: ((a + b) / 2) * s }).area : ((a + b) / 2) * s,
    ai = units === "imp" ? area / (IN * IN) : area * 1e4;
  note.textContent =
    `Drawn to scale. ${FS.n} fins, each ${ai.toFixed(1)} ${units === "imp" ? "sq in" : "cm²"}, ${fmt(FS.t, "small")} ${uname("small")} thick with ${(FIN_EDGES.find((x) => x[0] === FS.edge) || [0, FS.edge])[1].replace(/ \(.*\)$/, "").toLowerCase()} edges${FS.edgeTE ? ` and a ${FS.edgeTE === "sharp" ? "tapered" : FS.edgeTE} trailing edge` : ""}${aft > 1e-6 ? `; trailing edge ${fmt(aft, "len")} ${u} from the ${FS.tailName || "tail"}` : ""}.` +
    (FS.cant ? ` Canted ${(+FS.cant).toFixed(1)}°, which spins the rocket.` : "") +
    (ptsOK && FS.note != null
      ? FS.note
      : ptsOK
        ? " The shape comes from your design file, and drag and stability are calculated from it directly. Root, tip, span and sweep above describe a trapezoid with the same area, span and lift point; changing any of them replaces the file's shape with that trapezoid."
        : "");
}
/**
 * Draws the rocket's side view (the builder's side view and stability readout).
 */
export function drawProfile() {
  if (typeof bldDraw === "function") bldDraw();
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  // touch (or click, or drag) the flight chart to read its values at a time; touch the line again to clear it
  {
    const cv = document.getElementById("chart");
    let down = null;
    const tAt = (e) => {
      const g = CHART_CUR.geo,
        r = cv.getBoundingClientRect();
      if (!g) return null;
      const t = ((e.clientX - r.left - g.padL) / (g.W - g.padL - g.padR)) * g.x1;
      return Math.min(Math.max(t, 0), g.x1);
    };
    const isTime = () => lastSim && series !== "cone" && series !== "land";
    cv.addEventListener("pointerdown", (e) => {
      if (!isTime() || !CHART_CUR.geo) return;
      const t = tAt(e),
        g = CHART_CUR.geo,
        px = (dt) => (Math.abs(dt) / g.x1) * (g.W - g.padL - g.padR);
      down = { x: e.clientX, y: e.clientY, clear: CHART_CUR.t != null && px(t - CHART_CUR.t) < 10, moved: false };
      if (!down.clear) {
        CHART_CUR.t = t;
        drawChart();
      }
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (err) {}
    });
    cv.addEventListener("pointermove", (e) => {
      if (!down) return;
      if (Math.abs(e.clientX - down.x) > 4) down.moved = true;
      if (down.moved) {
        CHART_CUR.t = tAt(e);
        drawChart();
      }
    });
    const up = () => {
      if (down && down.clear && !down.moved) {
        CHART_CUR.t = null;
        drawChart();
      }
      down = null;
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", () => (down = null));
  }
}
