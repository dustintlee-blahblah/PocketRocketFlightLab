/**
 * The Wind Tunnel on the Rocket tab: the design in a test section at any speed from a crawl to Mach 6 and any angle of
 * attack, with its drag, normal force and center of pressure against Mach number. Every number comes from the same
 * aerodynamics the flight uses (aerodynamics.js); only the shock and pressure picture in the test section is drawn from
 * inviscid theory (flow-picture.js).
 */
import { esc } from "../core/helpers.js";
import { D, L } from "../design/defaults.js";
import { flightBoost, flightFirst, flightMotor } from "../motors/clusters.js";
import { aero, cdParts, cnaPartsM, normalForceAt, radiusAt, segR, stability } from "../physics/aerodynamics.js";
import { atmosphere } from "../physics/atmosphere.js";
import { dragModel } from "../physics/drag-model.js";
import { bodyPressures, obliqueShock } from "../physics/flow-picture.js";
import { flowScene } from "../physics/flow-streams.js";
import { noseRTip, noseTip } from "../physics/geometry.js";
import { nozzleEstimate } from "../physics/simulate.js";
import { fullStack, isThree, stackStability } from "../physics/staging.js";
import { downloadsNS } from "../report/pdf-report.js";
import { css, setupCanvas } from "./charts.js";
import { fmt, fromDisp, toDisp, uname } from "./units.js";

/** The last sweep over Mach number, for the charts, the readout and the CSV. */
let WT = null;
/** Whether the test section is animating. */
let animOn = false;
/** The last streamline picture worked out (for one speed, angle, design and canvas size). */
let sceneCache = { key: "", sc: null, at: 0, design: null };
/** The last flow picture worked out (it takes a moment at each Mach number). */
let flowCache = { key: "", ff: null };

/**
 * Whether the Wind Tunnel is open (and so worth drawing).
 * @returns {boolean}
 */
function wtOpen() {
  const b = document.getElementById("wtbody");
  return !!b && !b.hidden && !!b.offsetParent;
}
/**
 * The Mach numbers swept: closer together through the transonic range, where the drag changes fastest.
 * @param {number} mmax
 * @returns {number[]}
 */
function machGrid(mmax) {
  const out = [];
  const push = (m) => {
    if (m <= mmax + 1e-9) out.push(+m.toFixed(3));
  };
  for (let m = 0.02; m < 0.7; m += 0.02) push(m);
  for (let m = 0.7; m < 1.6; m += 0.01) push(m);
  for (let m = 1.6; m <= 6.0001; m += 0.05) push(m);
  return out;
}
/**
 * The design as one airframe (a staged rocket's whole stack at liftoff), its aerodynamics, CG and the air.
 * @returns {object}
 */
function wtSetup() {
  const Dx = D.twoStage ? fullStack(D) : D,
    A = aero(Dx);
  let cg = null;
  try {
    const m = flightMotor(),
      mb = D.twoStage ? flightBoost() : null;
    if (m) cg = (D.twoStage ? stackStability(D, m, mb) : stability(D, m)).cgL;
  } catch (e) {
    cg = null;
  }
  if (!(cg > 0)) cg = D.twoStage ? null : D.cgEmpty || null;
  const alt = Math.max(0, +document.getElementById("wtalt").dataset.si || 0),
    atm = atmosphere(L, alt);
  // the motor that burns at liftoff: its nozzle takes away part of the base
  let An = 0;
  try {
    An =
      D.nozzleDia > 0
        ? Math.PI * (D.nozzleDia / 2) ** 2
        : nozzleEstimate(isThree(D) ? flightFirst() : D.twoStage ? flightBoost() : flightMotor());
  } catch (e) {
    An = 0;
  }
  return { A, cg, atm, alt, An };
}
/**
 * Works out the coefficients across the Mach range.
 */
function wtCompute() {
  const S = wtSetup(),
    { A, atm, An } = S,
    mmax = +document.getElementById("wtmax").value || 2,
    nu = atm.mu / atm.rho,
    test = dragModel === "test"; // with the test drag model chosen, the released model's drag is worked out alongside
  const rows = machGrid(mmax).map((M) => {
    const v = M * atm.a,
      off = cdParts(A, v, atm, 0),
      on = cdParts(A, v, atm, An),
      C = cnaPartsM(A, M);
    return {
      M,
      v,
      Re: (v * A.L) / nu,
      off,
      on: on.cd,
      rel: test ? cdParts(A, v, atm, 0, "released") : null,
      relOn: test ? cdParts(A, v, atm, An, "released").cd : null,
      cn: C.cn,
      cnFin: C.cnFin,
      cnBody: C.cn - C.cnFin,
      cp: C.cp,
    };
  });
  WT = { ...S, rows, mmax, test };
}

/* ---------- charts: SVG lines with a crosshair readout ---------- */
/**
 * Round tick values covering a range.
 * @param {number} lo
 * @param {number} hi
 * @param {number} n about how many
 * @returns {number[]}
 */
function ticks(lo, hi, n) {
  const span = hi - lo || 1,
    mag = Math.pow(10, Math.floor(Math.log10(span / n))),
    step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= n) || 10 * mag,
    out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
/**
 * Draws a line chart (or stacked areas) into an element.
 * @param {HTMLElement} el
 * @param {object} cfg {title, desc, x, xLabel, yLabel, series:[{name, color, values, dash}], stacked, yMin, refY,
 *   refLabel, band, vline, fmtX(x), fmtY(v), extra(i)}
 */
function lineChart(el, cfg) {
  const W = 560,
    H = 250,
    m = { l: 50, r: 12, t: 10, b: 36 },
    X = cfg.x,
    ser = cfg.series;
  let stacks = null;
  if (cfg.stacked) {
    stacks = [];
    const acc = X.map(() => 0);
    for (const s of ser) {
      const lo = acc.slice();
      s.values.forEach((v, i) => (acc[i] += Math.max(v, 0)));
      stacks.push({ lo, hi: acc.slice() });
    }
  }
  let y0 = cfg.yMin != null ? cfg.yMin : Infinity,
    y1 = -Infinity;
  for (const a of stacks ? stacks.map((s) => s.hi) : ser.map((s) => s.values))
    for (const v of a)
      if (isFinite(v)) {
        y1 = Math.max(y1, v);
        y0 = Math.min(y0, v);
      }
  if (cfg.refY != null && isFinite(cfg.refY)) {
    y1 = Math.max(y1, cfg.refY);
    y0 = Math.min(y0, cfg.refY);
  }
  if (!isFinite(y0) || !isFinite(y1)) {
    el.innerHTML = "";
    return;
  }
  if (cfg.yMin == null) y0 -= (y1 - y0) * 0.08 || 1;
  y1 += (y1 - y0) * 0.06 || 1;
  const yt = ticks(y0, y1, 5);
  y0 = Math.min(y0, yt[0]);
  y1 = Math.max(y1, yt[yt.length - 1]);
  const x0 = X[0],
    x1 = X[X.length - 1],
    sx = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r),
    sy = (v) => m.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  const grid = css("--grid"),
    mut = css("--muted"),
    ink = css("--ink"),
    acc = css("--accent");
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title)}">`;
  for (const v of yt)
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="${grid}"/><text x="${m.l - 6}" y="${sy(v) + 4}" text-anchor="end" font-size="11" fill="${mut}">${cfg.fmtY ? cfg.fmtY(v) : +v.toFixed(3)}</text>`;
  for (const v of ticks(x0, x1, 7))
    svg += `<text x="${sx(v)}" y="${H - m.b + 15}" text-anchor="middle" font-size="11" fill="${mut}">${v}</text>`;
  svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="${mut}" stroke-opacity=".5"/>`;
  svg += `<text x="${(m.l + W - m.r) / 2}" y="${H - 3}" text-anchor="middle" font-size="11" fill="${mut}">${esc(cfg.xLabel)}</text>`;
  svg += `<text x="12" y="${(m.t + H - m.b) / 2}" text-anchor="middle" font-size="11" fill="${mut}" transform="rotate(-90 12 ${(m.t + H - m.b) / 2})">${esc(cfg.yLabel)}</text>`;
  if (cfg.band) {
    const [a, b] = cfg.band.map((v) => Math.min(Math.max(v, x0), x1));
    if (b > a)
      svg += `<rect x="${sx(a)}" y="${m.t}" width="${sx(b) - sx(a)}" height="${H - m.t - m.b}" fill="${ink}" opacity=".04"/><text x="${(sx(a) + sx(b)) / 2}" y="${m.t + 12}" text-anchor="middle" font-size="10" fill="${mut}">transonic</text>`;
  }
  if (cfg.refY != null && isFinite(cfg.refY))
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(cfg.refY)}" y2="${sy(cfg.refY)}" stroke="${mut}" stroke-dasharray="4 4" stroke-width="1.5"/>`;
  ser.forEach((s, k) => {
    if (stacks) {
      let d = "";
      X.forEach((x, i) => (d += (i ? "L" : "M") + sx(x).toFixed(1) + "," + sy(stacks[k].hi[i]).toFixed(1)));
      for (let i = X.length - 1; i >= 0; i--) d += "L" + sx(X[i]).toFixed(1) + "," + sy(stacks[k].lo[i]).toFixed(1);
      svg += `<path d="${d}Z" fill="${s.color}" fill-opacity=".8" stroke="${css("--panel")}" stroke-width="1"/>`;
    } else {
      let d = "",
        pen = false;
      X.forEach((x, i) => {
        const v = s.values[i];
        if (!isFinite(v)) {
          pen = false;
          return;
        }
        d += (pen ? "L" : "M") + sx(x).toFixed(1) + "," + sy(v).toFixed(1);
        pen = true;
      });
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"${s.dash ? ' stroke-dasharray="6 4"' : ""}/>`;
    }
  });
  svg += `<line class="wtv" y1="${m.t}" y2="${H - m.b}" stroke="${acc}" opacity=".6"/><g class="wth" display="none"><line y1="${m.t}" y2="${H - m.b}" stroke="${mut}"/>${ser.map((s) => `<circle r="4" fill="${s.color}" stroke="${css("--panel")}" stroke-width="2"/>`).join("")}</g><rect class="wthit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;
  const legend =
    ser.length > 1 || cfg.refLabel
      ? `<div class="wtleg">${ser.map((s) => `<span><i style="background:${s.color}"${s.dash ? ' class="dash"' : ""}></i>${esc(s.name)}</span>`).join("")}${cfg.refLabel ? `<span><i class="dash" style="color:${mut}"></i>${esc(cfg.refLabel)}</span>` : ""}</div>`
      : "";
  el.innerHTML = `<div class="wtct">${esc(cfg.title)}</div>${cfg.desc ? `<div class="note wtcd">${esc(cfg.desc)}</div>` : ""}${legend}${svg}<div class="wttip" hidden></div>`;
  const sv = el.querySelector("svg"),
    vl = sv.querySelector(".wtv"),
    hov = sv.querySelector(".wth"),
    tip = el.querySelector(".wttip");
  const setV = (v) => {
    if (v == null || v < x0 || v > x1) vl.setAttribute("display", "none");
    else {
      vl.removeAttribute("display");
      vl.setAttribute("x1", sx(v));
      vl.setAttribute("x2", sx(v));
    }
  };
  setV(cfg.vline);
  const move = (ev) => {
    const r = sv.getBoundingClientRect(),
      xv = x0 + ((((ev.clientX - r.left) / r.width) * W - m.l) / (W - m.l - m.r)) * (x1 - x0);
    let i = 0,
      best = Infinity;
    X.forEach((x, k) => {
      if (Math.abs(x - xv) < best) {
        best = Math.abs(x - xv);
        i = k;
      }
    });
    hov.removeAttribute("display");
    const ln = hov.querySelector("line");
    ln.setAttribute("x1", sx(X[i]));
    ln.setAttribute("x2", sx(X[i]));
    hov.querySelectorAll("circle").forEach((c, k) => {
      const v = stacks ? stacks[k].hi[i] : ser[k].values[i];
      if (isFinite(v)) {
        c.setAttribute("cx", sx(X[i]));
        c.setAttribute("cy", sy(v));
        c.removeAttribute("display");
      } else c.setAttribute("display", "none");
    });
    tip.innerHTML =
      `<b>${cfg.fmtX ? cfg.fmtX(X[i], i) : X[i]}</b>` +
      ser
        .map(
          (s) =>
            `<div><i style="background:${s.color}"></i><span>${esc(s.name)}</span><b>${cfg.fmtY ? cfg.fmtY(s.values[i]) : (+s.values[i]).toFixed(3)}</b></div>`,
        )
        .join("") +
      (cfg.extra ? cfg.extra(i) : "");
    tip.hidden = false;
    const er = el.getBoundingClientRect();
    tip.style.left = Math.max(4, Math.min(ev.clientX - er.left + 12, er.width - tip.offsetWidth - 4)) + "px";
    tip.style.top = Math.max(ev.clientY - er.top - tip.offsetHeight - 10, 4) + "px";
  };
  const hit = sv.querySelector(".wthit");
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => {
    hov.setAttribute("display", "none");
    tip.hidden = true;
  });
  el._setV = setV;
}

/* ---------- the readout ---------- */
/**
 * The chosen speed and angle of attack.
 * @returns {{M:number, aoa:number}}
 */
function sel() {
  return {
    M: Math.max(+document.getElementById("wtmach").value || 0, 0.01),
    aoa: +document.getElementById("wtaoa").value || 0,
  };
}
/**
 * Fills the tiles for the chosen speed and angle, moves the charts' markers and redraws the test section.
 */
function wtReadout() {
  if (!WT) return;
  const { M, aoa } = sel(),
    { A, atm, cg, An } = WT,
    v = M * atm.a,
    q = 0.5 * atm.rho * v * v,
    off = cdParts(A, v, atm, 0),
    on = cdParts(A, v, atm, An),
    C = cnaPartsM(A, M),
    N = normalForceAt(A, M, aoa),
    al = (aoa * Math.PI) / 180,
    cdA = off.cd * Math.cos(al) ** 2 + N.cn * Math.sin(al),
    d = 2 * A.R;
  document.getElementById("wtmachv").textContent = `Mach ${M.toFixed(2)} · ${fmt(v, "speed")} ${uname("speed")}`;
  document.getElementById("wtaoav").textContent = `${aoa.toFixed(1)}°`;
  const stab = cg != null ? (C.cp - cg) / d : null;
  const tile = (k, val, u) =>
    `<div class="stat"><div class="k">${k}</div><div class="v">${val}<i>${u || ""}</i></div></div>`;
  // with the test drag model chosen: the released model's coasting Cd at this speed, and how far the test model is from it
  const rel = WT.test && !off.override ? cdParts(A, v, atm, 0, "released").cd : null;
  document.getElementById("wttiles").innerHTML = [
    tile(rel != null ? "Cd coasting, test" : "Cd coasting", off.cd.toFixed(3)),
    ...(rel != null
      ? [
          tile(
            "Cd coasting, released",
            rel.toFixed(3),
            `test ${off.cd >= rel ? "+" : "−"}${Math.abs((off.cd / rel - 1) * 100).toFixed(1)}%`,
          ),
        ]
      : []),
    tile(rel != null ? "Cd motor burning, test" : "Cd motor burning", on.cd.toFixed(3)),
    tile("Drag force", fmt(q * A.Aref * off.cd, "force"), uname("force")),
    tile("CNα", C.cn.toFixed(2), "per rad"),
    tile("CP from tip", fmt(C.cp, "len"), uname("len")),
    tile("Stability", stab == null ? "—" : stab.toFixed(2), stab == null ? "choose a motor" : "cal"),
    tile(`CN at ${aoa.toFixed(1)}°`, N.cn.toFixed(3)),
    tile(`Cd at ${aoa.toFixed(1)}°`, cdA.toFixed(3)),
    tile("Reynolds number", ((v * A.L) / (atm.mu / atm.rho) / 1e6).toFixed(2) + "M", "on the length"),
  ].join("");
  document.getElementById("wtregime").textContent =
    M < 0.8 ? "Subsonic" : M < 1.2 ? "Transonic" : M < 4 ? "Supersonic" : "Hypersonic edge";
  for (const id of ["wtc-cd", "wtc-parts", "wtc-cna", "wtc-cp"]) {
    const el = document.getElementById(id);
    if (el && el._setV) el._setV(M);
  }
  const ea = document.getElementById("wtc-aoa");
  if (ea && ea._setV) ea._setV(aoa);
  wtTunnel();
}
/**
 * Draws the normal force against angle of attack at the chosen speed.
 */
function wtAoaChart() {
  if (!WT) return;
  const { M, aoa } = sel(),
    al = [];
  for (let a = 0; a <= 40.001; a += 0.5) al.push(+a.toFixed(1));
  const c = al.map((a) => normalForceAt(WT.A, M, a));
  lineChart(document.getElementById("wtc-aoa"), {
    title: "Normal force against angle of attack",
    desc: `At Mach ${M.toFixed(2)}. The body adds crossflow lift as it tilts; the fins stall from about 18°.`,
    x: al,
    xLabel: "Angle of attack (°)",
    yLabel: "CN",
    yMin: 0,
    series: [
      { name: "Total", color: css("--accent"), values: c.map((r) => r.cn) },
      { name: "Fins", color: css("--cg"), values: c.map((r) => r.cnFins) },
      { name: "Body", color: css("--good"), values: c.map((r) => r.cnBody) },
    ],
    vline: aoa,
    fmtX: (x) => `${x}°`,
    fmtY: (v) => (+v).toFixed(3),
  });
}
/**
 * Draws the charts against Mach number.
 */
function wtCharts() {
  const R = WT.rows,
    X = R.map((r) => r.M),
    { M } = sel(),
    band = [0.8, 1.2],
    fx = (x, i) => `Mach ${x.toFixed(2)} · ${fmt(R[i].v, "speed")} ${uname("speed")}`,
    ov = R.some((r) => r.off.override);
  const cmp = WT.test && !ov; // the test drag model, drawn over the released one
  lineChart(document.getElementById("wtc-cd"), {
    title: cmp ? "Drag coefficient: test model against released" : "Drag coefficient",
    desc: ov
      ? "The design file sets a fixed Cd, so it doesn't change with speed."
      : cmp
        ? "At zero angle of attack. The test drag model (chosen in Settings) against the released one, coasting and with the motor burning (dashed). The test model’s skin is taken as fully heated here; a flight follows it as it warms."
        : "At zero angle of attack. Dashed: with the motor burning, its nozzle filling part of the base.",
    x: X,
    xLabel: "Mach",
    yLabel: "Cd",
    yMin: 0,
    band,
    series: [
      { name: cmp ? "Test, coasting" : "Coasting", color: css("--accent"), values: R.map((r) => r.off.cd) },
      { name: cmp ? "Test, burning" : "Motor burning", color: css("--cg"), dash: true, values: R.map((r) => r.on) },
      ...(cmp
        ? [
            { name: "Released, coasting", color: css("--muted"), values: R.map((r) => r.rel.cd) },
            { name: "Released, burning", color: css("--muted"), dash: true, values: R.map((r) => r.relOn) },
          ]
        : []),
    ],
    vline: M,
    fmtX: fx,
  });
  lineChart(document.getElementById("wtc-parts"), {
    title: "Where the drag comes from",
    desc: "Coasting Cd, split by source and stacked.",
    x: X,
    xLabel: "Mach",
    yLabel: "Cd",
    yMin: 0,
    stacked: true,
    series: [
      { name: "Skin friction", color: css("--cg"), values: R.map((r) => r.off.friction || 0) },
      { name: "Pressure and wave", color: css("--accent"), values: R.map((r) => r.off.pressure || 0) },
      { name: "Base", color: css("--warn"), values: R.map((r) => r.off.base || 0) },
    ],
    vline: M,
    fmtX: fx,
  });
  lineChart(document.getElementById("wtc-cna"), {
    title: "Normal-force slope CNα",
    desc: "Per radian, at small angles of attack.",
    x: X,
    xLabel: "Mach",
    yLabel: "CNα (per rad)",
    yMin: 0,
    band,
    series: [
      { name: "Total", color: css("--accent"), values: R.map((r) => r.cn) },
      { name: "Fins", color: css("--cg"), values: R.map((r) => r.cnFin) },
      { name: "Body", color: css("--good"), values: R.map((r) => r.cnBody) },
    ],
    vline: M,
    fmtX: fx,
    fmtY: (v) => (+v).toFixed(2),
  });
  const cg = WT.cg,
    d = 2 * WT.A.R;
  lineChart(document.getElementById("wtc-cp"), {
    title: "Center of pressure",
    desc:
      cg != null
        ? "From the nose tip. Dashed: the CG at liftoff with the motor in."
        : "From the nose tip. Choose a motor to see the CG and stability.",
    x: X,
    xLabel: "Mach",
    yLabel: `CP from tip (${uname("len")})`,
    band,
    series: [{ name: "CP", color: css("--bad"), values: R.map((r) => toDisp(r.cp, "len")) }],
    refY: cg != null ? toDisp(cg, "len") : null,
    refLabel: cg != null ? "CG" : null,
    vline: M,
    fmtX: fx,
    fmtY: (v) => (+v).toFixed(units2()),
    extra: (i) => (cg != null ? `<div><span>Stability</span><b>${((R[i].cp - cg) / d).toFixed(2)} cal</b></div>` : ""),
  });
  wtAoaChart();
}
/**
 * Decimal places for lengths in the display units.
 * @returns {number}
 */
function units2() {
  return uname("len") === "mm" ? 0 : 2;
}

/* ---------- the test section ---------- */
/**
 * The body's outline from the nose tip, with a rounded tip if it has one.
 * @param {object} A aerodynamic model
 * @returns {{x:number, r:number}[]}
 */
function outline(A) {
  const P = [];
  A.segs.forEach((sg, i) => {
    const tip = i === 0 && sg.kind === "nose" && sg.tip > 0 ? noseTip(sg.shape, sg.param, sg.r2, sg.len, sg.tip) : null,
      N = sg.kind === "tube" ? 1 : 60,
      s0 = tip ? tip.xs : 0;
    if (P.length && Math.abs(P[P.length - 1].r - segR(sg, 0)) > 1e-6) P.push({ x: sg.x, r: segR(sg, 0) });
    for (let k = i === 0 ? 0 : 1; k <= N; k++) {
      const u = sg.kind === "tube" ? k / N : (k / N) ** 2,
        x = s0 + (sg.len - s0) * u;
      P.push({
        x: sg.x + x,
        r: tip ? noseRTip(sg.shape, sg.param, x, sg.r2, sg.len, tip) : segR(sg, x),
      });
    }
  });
  return P;
}
/**
 * The shocks and surface pressures at Mach M (worked out once per speed and design).
 * @param {object} A
 * @param {number} M
 * @param {{x:number, r:number}[]} P outline
 * @returns {object}
 */
function flowAt(A, M, P) {
  const key = M.toFixed(2) + "|" + A.L + "|" + P.length + "|" + A.R;
  if (flowCache.key === key) return flowCache.ff;
  let ff = null;
  try {
    // the picture starts at the tip; a rounded tip stands its shock off
    const P0 = P[0].x > 0 || P[0].r > 0 ? [{ x: P[0].x, r: 0 }, ...P] : P;
    ff = bodyPressures(P0, M);
    ff.fins = A.fins.map((f) => {
      const Mn = M * (f.cosL || 1),
        sharp = ["airfoil", "doublewedge", "wedge", "beveled", "bevel"].includes(f.edge);
      if (!sharp || Mn <= 1) return { attached: false };
      const th = Math.atan((f.edge === "airfoil" ? 2 : 1) * (f.tc || 0.05));
      const s = obliqueShock(Mn, th);
      return s ? { attached: true, beta: s.beta } : { attached: false };
    });
  } catch (e) {
    ff = null;
  }
  flowCache = { key, ff };
  return ff;
}
/**
 * The streamline picture for this speed and angle, cached.
 * @param {object} A aerodynamic model
 * @param {{x:number, r:number}[]} P outline
 * @param {number} M
 * @param {number} aoa degrees
 * @param {object|null} ff the shock picture above Mach 1
 * @param {{W:number, H:number, sc:number, ox:number, oy:number, pivot:number, al:number}} v how the body sits on the canvas
 * @returns {object|null}
 */
function sceneAt(A, P, M, aoa, ff, v) {
  const key = [M.toFixed(2), aoa.toFixed(1), A.L, A.R, P.length, v.W, v.H, WT.alt].join("|"),
    now = performance.now();
  if (sceneCache.key === key) return sceneCache.sc;
  // while a slider is being dragged, keep the last picture and work out a new one at most five times a second (the
  // animation redraws, so the picture catches up as soon as the slider stops)
  if (sceneCache.sc && sceneCache.design === WT.A && now - sceneCache.at < 200) return sceneCache.sc;
  let sc = null;
  try {
    // the canvas's corners in the body's axes
    const ca = Math.cos(v.al),
      sa = Math.sin(v.al),
      pts = [
        [0, 0],
        [v.W, 0],
        [0, v.H],
        [v.W, v.H],
      ].map(([X, Y]) => {
        const qx = X - v.ox - v.pivot * v.sc,
          qy = Y - v.oy;
        return [(qx * ca - qy * sa + v.pivot * v.sc) / v.sc, (qx * sa + qy * ca) / v.sc];
      }),
      box = {
        x0: Math.min(...pts.map((q) => q[0])),
        x1: Math.max(...pts.map((q) => q[0])),
        y0: Math.min(...pts.map((q) => q[1])),
        y1: Math.max(...pts.map((q) => q[1])),
      },
      P0 = P[0].x > 0 || P[0].r > 0 ? [{ x: P[0].x, r: 0 }, ...P] : P,
      atm = WT.atm;
    sc = flowScene(P0, A, {
      M,
      aoa,
      V: Math.max(M, 0.01) * atm.a,
      nu: atm.mu / atm.rho,
      shock: ff && ff.shockAngle && !ff.detached ? ff.shockAngle : 0,
      box,
      n: v.W < 520 ? 30 : 40,
    });
  } catch (e) {
    sc = null;
  }
  sceneCache = { key, sc, at: performance.now(), design: WT.A };
  return sc;
}
/**
 * Draws the streamlines, with marks moving along them at the flow's local speed.
 * @param {CanvasRenderingContext2D} c in the body's axes, scaled by sc
 * @param {object} scn
 * @param {number} sc pixels per metre
 * @param {number} now ms
 * @param {number} M
 */
function drawStreams(c, scn, sc, now, M) {
  const mut = css("--muted"),
    ink = css("--ink"),
    run = (now * (0.05 + 0.04 * Math.min(M, 3))) % 40;
  c.lineWidth = 1;
  for (const ln of scn.lines) {
    c.strokeStyle = mut;
    c.globalAlpha = 0.35;
    c.beginPath();
    ln.forEach((p, i) => (i ? c.lineTo(p[0] * sc, p[1] * sc) : c.moveTo(p[0] * sc, p[1] * sc)));
    c.stroke();
    // short dashes running along the line show the direction and, crowding together, where the flow slows
    c.strokeStyle = ink;
    c.globalAlpha = 0.5;
    c.setLineDash([5, 35]);
    c.lineDashOffset = -run;
    c.stroke();
    c.setLineDash([]);
  }
  c.globalAlpha = 1;
}
/**
 * Draws the boundary layer (laminar smooth, turbulent ruffled, drawn far thicker than life), the separated regions as
 * turning eddies, and where the flow divides on the nose and reattaches behind a step.
 * @param {CanvasRenderingContext2D} c in the body's axes
 * @param {object} scn
 * @param {number} sc pixels per metre
 * @param {number} now ms
 * @param {object} A
 */
function drawLayer(c, scn, sc, now, A) {
  const lamC = css("--good"),
    turC = css("--gulf-ink"),
    sepC = css("--warn"),
    x0 = scn.stag[0],
    L = scn.L,
    dMax = Math.max(scn.delta(L), 1e-9),
    E = Math.max(1, Math.min(80, (0.3 * A.R) / dMax)),
    tt = now / 1000,
    leeSep = scn.seps.find((q) => q.kind === "lee");
  // the boundary layer on each side, up to where the flow leaves the body
  for (const side of [-1, 1]) {
    const stop = leeSep && side === leeSep.side ? leeSep.x0 : L,
      N = 140;
    let started = false;
    c.lineWidth = 1.3;
    // laminar: a smooth edge
    c.strokeStyle = lamC;
    c.globalAlpha = 0.9;
    c.beginPath();
    for (let k = 0; k <= N; k++) {
      const x = x0 + ((Math.min(scn.xtr, stop) - x0) * k) / N,
        y = side * (scn.rOf(x) + E * scn.delta(x));
      started ? c.lineTo(x * sc, y * sc) : (c.moveTo(x * sc, y * sc), (started = true));
    }
    if (scn.xtr > x0) c.stroke();
    // turbulent: a ruffled edge that keeps changing, with eddies inside it
    if (scn.xtr < stop) {
      c.strokeStyle = turC;
      for (const [f, al] of [
        [1, 0.9],
        [0.55, 0.45],
      ]) {
        c.globalAlpha = al;
        c.beginPath();
        for (let k = 0; k <= N; k++) {
          const x = scn.xtr + ((stop - scn.xtr) * k) / N,
            d = E * scn.delta(x),
            lam = Math.max(d * 2.2, 2 / sc),
            w = 0.16 * Math.sin((x / lam) * 2 * Math.PI - tt * 9 + f * 3) + 0.08 * Math.sin((x / lam) * 5.3 - tt * 13),
            y = side * (scn.rOf(x) + d * f * (1 + w));
          k ? c.lineTo(x * sc, y * sc) : c.moveTo(x * sc, y * sc);
        }
        c.stroke();
      }
      // where it changes over
      if (scn.xtr > x0 + 1e-6) {
        c.strokeStyle = turC;
        c.globalAlpha = 0.9;
        c.beginPath();
        c.moveTo(scn.xtr * sc, side * scn.rOf(scn.xtr) * sc);
        c.lineTo(scn.xtr * sc, side * (scn.rOf(scn.xtr) + E * scn.delta(scn.xtr) * 1.6) * sc);
        c.stroke();
      }
    }
  }
  // separated regions: turning eddies, shed downstream
  c.lineWidth = 1.4;
  for (const q of scn.seps) {
    const sides = q.side ? [q.side] : [-1, 1],
      len = Math.max(q.x1 - q.x0, 1e-6),
      hh = Math.max(q.h, 1e-6),
      n = Math.max(1, Math.min(7, Math.round(len / (hh * 1.4)))),
      drift = q.kind === "corner" ? 0 : (tt * 0.25) % 1;
    for (const side of sides) {
      // the region, faintly
      c.fillStyle = sepC;
      c.globalAlpha = 0.1;
      c.beginPath();
      const M = 30,
        base = (x) => (q.kind === "wake" ? 0 : scn.rOf(Math.min(x, L))),
        top = (x) =>
          q.kind === "wake"
            ? hh * (1 - 0.6 * ((x - q.x0) / len))
            : scn.rOf(Math.min(x, L)) +
              hh * (q.kind === "lee" || q.kind === "stall" ? 0.4 + (0.6 * (x - q.x0)) / len : 1);
      for (let k = 0; k <= M; k++) {
        const x = q.x0 + (len * k) / M;
        k ? c.lineTo(x * sc, side * top(x) * sc) : c.moveTo(x * sc, side * top(x) * sc);
      }
      for (let k = M; k >= 0; k--) {
        const x = q.x0 + (len * k) / M;
        c.lineTo(x * sc, side * base(x) * sc);
      }
      c.closePath();
      c.fill();
      // the eddies: each a curl turning with the flow over it
      c.strokeStyle = sepC;
      c.globalAlpha = 0.95;
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5 + drift) / n;
        if (u > 1) continue;
        const x = q.x0 + len * u,
          lo = base(x),
          hi = top(x),
          ry = Math.max((hi - lo) * 0.4, 1.5 / sc),
          rx = Math.min(ry, len / n / 2),
          cy = side * (lo + (hi - lo) / 2),
          spin = side * tt * 4 + k;
        c.beginPath();
        for (let j = 0; j <= 26; j++) {
          const a = spin + side * j * 0.24,
            f = 1 - j / 34;
          const px = (x + rx * f * Math.cos(a)) * sc,
            py = (cy + ry * f * Math.sin(a)) * sc;
          j ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.stroke();
      }
      // where the flow leaves the surface
      if (q.kind !== "corner" && q.kind !== "wake") {
        const xs = q.x0 * sc,
          ys = side * scn.rOf(Math.min(q.x0, L)) * sc;
        c.beginPath();
        c.moveTo(xs - 3, ys - 3);
        c.lineTo(xs + 3, ys + 3);
        c.moveTo(xs - 3, ys + 3);
        c.lineTo(xs + 3, ys - 3);
        c.stroke();
      }
    }
  }
  // the flow divides at the nose and reattaches behind steps
  c.globalAlpha = 1;
  c.fillStyle = lamC;
  c.beginPath();
  c.arc(scn.stag[0] * sc, scn.stag[1] * sc, 3.5, 0, 2 * Math.PI);
  c.fill();
  c.strokeStyle = lamC;
  c.lineWidth = 1.5;
  for (const [x, r] of scn.reattach)
    for (const side of [-1, 1]) {
      c.beginPath();
      c.arc(x * sc, side * r * sc, 3.5, 0, 2 * Math.PI);
      c.stroke();
    }
}
/**
 * Draws the test section: the rocket at its angle of attack in moving flow, with shocks, Mach waves and surface
 * pressure above Mach 1, and the CP and CG.
 * @param {number} [t] animation time
 */
function wtTunnel(t) {
  const cv = document.getElementById("wtcv");
  if (!WT || !cv || !wtOpen()) return;
  const { c, W, H } = setupCanvas(cv),
    { A, cg } = WT,
    { M, aoa } = sel(),
    al = (aoa * Math.PI) / 180,
    ink = css("--ink"),
    mut = css("--muted");
  c.clearRect(0, 0, W, H);
  c.fillStyle = css("--field");
  c.fillRect(0, 0, W, H);
  const fins = A.fins.map((f) => ({ ...f, rr: f.rb != null ? f.rb : radiusAt(A, f.xLead + f.a / 2) })),
    halfH = Math.max(A.R, ...fins.map((f) => f.rr + f.s)),
    sc = Math.min((W * 0.74) / A.L, (H * 0.36) / halfH),
    ox = W * 0.13,
    oy = H / 2;
  const pivot = cg != null ? cg : A.L / 2;
  c.save();
  c.translate(ox + pivot * sc, oy);
  c.rotate(-al);
  c.translate(-pivot * sc, 0);
  const P = outline(A),
    now = t || performance.now();
  let ff = M > 1.05 ? flowAt(A, M, P) : null;
  // streamlines, worked out once per speed, angle, design and size, then animated
  const scn = sceneAt(A, P, M, aoa, ff, { W, H, sc, ox, oy, pivot, al });
  if (scn) drawStreams(c, scn, sc, now, M);
  if (M > 1.05) {
    const mu = Math.asin(1 / M),
      far = W * 1.3,
      bad = css("--bad");
    if (ff) {
      c.strokeStyle = bad;
      c.lineWidth = 1.5;
      c.globalAlpha = 0.9;
      if (ff.shockAngle && !ff.detached) {
        const b = ff.shockAngle,
          x0 = P[0].x * sc;
        c.beginPath();
        c.moveTo(x0, 0);
        c.lineTo(x0 + far * Math.cos(b), -far * Math.sin(b));
        c.moveTo(x0, 0);
        c.lineTo(x0 + far * Math.cos(b), far * Math.sin(b));
        c.stroke();
      } else {
        // a bow shock standing off a blunt tip
        const r0 = A.R * sc,
          st = Math.max(4, (r0 * 0.8) / (M * M - 0.9)),
          x0 = P[0].x * sc;
        c.beginPath();
        for (let k = -1; k <= 1.0001; k += 0.05) {
          const yy = k * H,
            xx = x0 - st + ((yy * yy) / (2 * (r0 * 3 + 4))) * Math.tan(Math.PI / 2 - Math.max(mu, 0.2)) * 0.15;
          k === -1 ? c.moveTo(xx, yy) : c.lineTo(xx, yy);
        }
        c.stroke();
      }
      // fin leading-edge shocks
      c.globalAlpha = 0.7;
      c.lineWidth = 1.2;
      fins.forEach((f, k) => {
        const s = ff.fins && ff.fins[k],
          ang = s && s.attached ? s.beta : Math.max(mu * 1.15, 0.35);
        for (const sg of [1, -1]) {
          const x0 = f.xLead * sc,
            y0 = sg * f.rr * sc;
          c.beginPath();
          c.moveTo(x0, y0);
          c.lineTo(x0 + far * Math.cos(ang), y0 + sg * far * Math.sin(ang));
          c.stroke();
        }
      });
    }
    // Mach waves from the nose shoulder and the fins
    c.strokeStyle = mut;
    c.globalAlpha = 0.5;
    c.lineWidth = 1;
    c.setLineDash([4, 4]);
    const marks = [A.segs[0] ? A.segs[0].x + A.segs[0].len : 0, ...fins.map((f) => f.xLead)];
    for (const xm of marks) {
      const r = radiusAt(A, xm) * sc;
      for (const s of [1, -1]) {
        c.beginPath();
        c.moveTo(xm * sc, s * r);
        c.lineTo(xm * sc + far * Math.cos(mu), s * (r + far * Math.sin(mu)));
        c.stroke();
      }
    }
    c.setLineDash([]);
    c.globalAlpha = 1;
  }
  // fins above and below, then the body
  c.fillStyle = mut;
  c.globalAlpha = 0.55;
  for (const f of fins)
    for (const s of [1, -1]) {
      c.beginPath();
      c.moveTo(f.xLead * sc, s * f.rr * sc);
      c.lineTo((f.xLead + (f.sw || 0)) * sc, s * (f.rr + f.s) * sc);
      c.lineTo((f.xLead + (f.sw || 0) + (f.b || 0)) * sc, s * (f.rr + f.s) * sc);
      c.lineTo((f.xLead + f.a) * sc, s * f.rr * sc);
      c.closePath();
      c.fill();
    }
  c.globalAlpha = 1;
  c.beginPath();
  P.forEach((p, i) => (i ? c.lineTo(p.x * sc, -p.r * sc) : c.moveTo(p.x * sc, -p.r * sc)));
  for (let i = P.length - 1; i >= 0; i--) c.lineTo(P[i].x * sc, P[i].r * sc);
  c.closePath();
  c.fillStyle = css("--panel");
  c.fill();
  c.strokeStyle = ink;
  c.lineWidth = 1.4;
  c.stroke();
  // surface pressure: red where the flow presses on the body, blue where it pulls
  if (ff && ff.cps) {
    const cmax = Math.max(0.05, ...ff.cps.map((p) => Math.abs(p.cp))),
      pos = css("--bad"),
      neg = css("--cg");
    c.lineWidth = 3.5;
    c.lineCap = "round";
    for (const p of ff.cps) {
      const a = Math.min(1, Math.abs(p.cp) / cmax);
      if (a < 0.04) continue;
      c.strokeStyle = p.cp > 0 ? pos : neg;
      c.globalAlpha = 0.25 + 0.75 * a;
      for (const s of [1, -1]) {
        c.beginPath();
        c.moveTo(p.x0 * sc, s * radiusAt(A, p.x0) * sc);
        c.lineTo(p.x1 * sc, s * radiusAt(A, p.x1) * sc);
        c.stroke();
      }
    }
    c.lineCap = "butt";
    c.globalAlpha = 1;
  }
  if (scn) drawLayer(c, scn, sc, now, A);
  // CP at this angle and the CG
  const N = normalForceAt(A, M, aoa),
    mark = (x, kind) => {
      const px = x * sc;
      c.lineWidth = 1.5;
      if (kind === "cg") {
        c.strokeStyle = css("--cg");
        c.fillStyle = css("--cg");
        c.beginPath();
        c.arc(px, 0, 6, 0, 2 * Math.PI);
        c.fillStyle = css("--panel");
        c.fill();
        c.stroke();
        c.fillStyle = css("--cg");
        for (const [a0, a1] of [
          [-Math.PI / 2, 0],
          [Math.PI / 2, Math.PI],
        ]) {
          c.beginPath();
          c.moveTo(px, 0);
          c.arc(px, 0, 6, a0, a1);
          c.closePath();
          c.fill();
        }
      } else {
        c.strokeStyle = css("--bad");
        c.fillStyle = css("--bad");
        c.beginPath();
        c.arc(px, 0, 6, 0, 2 * Math.PI);
        c.fillStyle = css("--panel");
        c.fill();
        c.stroke();
        c.fillStyle = css("--bad");
        c.beginPath();
        c.arc(px, 0, 2.2, 0, 2 * Math.PI);
        c.fill();
      }
    };
  mark(aoa > 0 ? N.cp : cnaPartsM(A, M).cp, "cp");
  if (cg != null) mark(cg, "cg");
  c.restore();
  c.font = `500 10px ${css("--f-body") || "sans-serif"}`;
  c.fillStyle = mut;
  c.textAlign = "right";
  c.fillText(
    M > 1.05
      ? W < 520
        ? "red: shocks, compression · blue: suction"
        : "red: shocks and compression · blue: suction · dashed: Mach waves"
      : "flow →",
    W - 8,
    H - 8,
  );
  const leg = document.getElementById("wtflowleg");
  if (leg && scn) {
    const lam =
      scn.xtr >= scn.L - 1e-9
        ? "all of it"
        : scn.xtr <= P[0].x + 0.01 * scn.L
          ? "none"
          : fmt(scn.xtr, "len", units2()) + " " + uname("len");
    const want = `${lam}|${scn.seps.map((q) => q.kind).join(",")}`;
    if (leg.dataset.k !== want) {
      leg.dataset.k = want;
      const kinds = new Set(scn.seps.map((q) => q.kind)),
        sep = [
          kinds.has("wake") && "base wake",
          kinds.has("boattail") && "boattail",
          kinds.has("step") && "behind a step",
          kinds.has("lee") && "lee side",
          kinds.has("stall") && "fins stalled",
        ].filter(Boolean);
      document.getElementById("wtflowsum").textContent =
        `Laminar from the tip: ${lam}${sep.length ? " · separated: " + sep.join(", ") : ""}`;
    }
  }
  c.textAlign = "start";
}
/**
 * Keeps the flow streaks moving while the Wind Tunnel is open.
 * @param {number} t
 */
function anim(t) {
  if (!wtOpen() || document.hidden) {
    animOn = false;
    return;
  }
  wtTunnel(t);
  requestAnimationFrame(anim);
}

/* ---------- export ---------- */
/**
 * The sweep as CSV, in SI units.
 * @returns {string}
 */
function csvText() {
  const { A, atm, alt } = WT;
  let s = `# Pocket Rocket Flight Lab wind tunnel: ${(D.name || "rocket").replace(/\n/g, " ")}\n# reference area ${A.Aref.toExponential(5)} m^2 (diameter ${(2 * A.R).toFixed(5)} m), length ${A.L.toFixed(4)} m, ${alt.toFixed(0)} m above the pad, air ${(atm.T - 273.15).toFixed(1)} C\n`;
  if (WT.test) s += "# drag: TEST model (the cd_ columns); the released model's drag is in the cd_released_ columns\n";
  s +=
    "mach,velocity_m_s,reynolds,cd_coasting,cd_friction,cd_pressure,cd_base,cd_motor_burning,cn_alpha_per_rad,cn_alpha_fins,cn_alpha_body,cp_from_tip_m" +
    (WT.test
      ? ",cd_released_coasting,cd_released_friction,cd_released_pressure,cd_released_base,cd_released_motor_burning"
      : "") +
    "\n";
  for (const r of WT.rows)
    s +=
      [
        r.M,
        r.v.toFixed(2),
        r.Re.toExponential(4),
        r.off.cd.toFixed(5),
        (r.off.friction || 0).toFixed(5),
        (r.off.pressure || 0).toFixed(5),
        (r.off.base || 0).toFixed(5),
        r.on.toFixed(5),
        r.cn.toFixed(4),
        r.cnFin.toFixed(4),
        r.cnBody.toFixed(4),
        r.cp.toFixed(5),
        ...(WT.test
          ? [
              r.rel.cd.toFixed(5),
              (r.rel.friction || 0).toFixed(5),
              (r.rel.pressure || 0).toFixed(5),
              (r.rel.base || 0).toFixed(5),
              r.relOn.toFixed(5),
            ]
          : []),
      ].join(",") + "\n";
  return s;
}
/**
 * Saves the sweep as a CSV file.
 */
async function wtCsv() {
  if (!WT) return;
  const name = (D.name || "rocket").replace(/[\\/:*?"<>|]+/g, "-").trim() + " wind tunnel.csv",
    text = csvText();
  try {
    if (downloadsNS) {
      await downloadsNS.save({ filename: name, data: new TextEncoder().encode(text).buffer });
      if (window.prToast && !window.PocketRocketApp) window.prToast("Saved " + name);
      return;
    }
  } catch (e) {}
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/**
 * Brings the Wind Tunnel up to date with the design, if it's open.
 */
export function wtRefresh() {
  if (!wtOpen()) return;
  const mx = +document.getElementById("wtmax").value || 2,
    ms = document.getElementById("wtmach");
  ms.max = mx;
  if (+ms.value > mx) ms.value = mx;
  try {
    wtCompute();
    wtCharts();
    wtReadout();
  } catch (e) {
    document.getElementById("wttiles").innerHTML = `<p class="note">${esc(e.message || String(e))}</p>`;
  }
  if (!animOn) {
    animOn = true;
    requestAnimationFrame(anim);
  }
}
/**
 * Start-up: wires the controls.
 */
export function start() {
  const alt = document.getElementById("wtalt");
  if (!alt) return;
  const showAlt = () => {
    alt.value = +toDisp(+alt.dataset.si || 0, "alt").toFixed(0);
    document.getElementById("wtaltu").textContent = uname("alt");
  };
  alt.dataset.si = "0";
  showAlt();
  alt.addEventListener("change", () => {
    const v = parseFloat(alt.value);
    alt.dataset.si = String(isFinite(v) && v > 0 ? fromDisp(v, "alt") : 0);
    wtRefresh();
  });
  document.getElementById("wtmax").addEventListener("change", wtRefresh);
  const mach = document.getElementById("wtmach"),
    aoa = document.getElementById("wtaoa");
  mach.addEventListener("input", wtReadout);
  mach.addEventListener("change", wtAoaChart);
  aoa.addEventListener("input", wtReadout);
  document.getElementById("wtcsvbtn").addEventListener("click", wtCsv);
  // opening it works it out; the fold button itself shows and hides it
  document.querySelector('[data-fold="wtbody"]').addEventListener("click", () =>
    setTimeout(() => {
      showAlt();
      wtRefresh();
    }, 0),
  );
  let rt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(wtRefresh, 150);
  });
}
