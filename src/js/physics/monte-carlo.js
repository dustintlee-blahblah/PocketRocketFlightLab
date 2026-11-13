/**
 * Landing dispersion (Monte Carlo): many flights with their inputs varied, their apogees and landing points, the
 * likely apogee range shown on the Results tab, and the landing-ellipse drawing.
 */
import { L, series, units } from "../design/defaults.js";
import { simulate } from "./simulate.js";
import { isThree } from "./staging.js";
import { css, drawChart, niceTicks } from "../ui/charts.js";
import { bigDist, compass, lastSim } from "../ui/results.js";
import { renderRSO } from "../ui/rso-checklist.js";
import { readFields } from "../ui/state.js";
import { fmt, fromDisp, speedAlso, toDisp, uname } from "../ui/units.js";
/* ---------- landing dispersion (Monte Carlo) ----------
   Each flight draws its inputs from normal distributions (seeded, so a run repeats): surface and aloft wind speed (scaled
   together) and direction (shifted together), motor impulse, rocket weight, drag, rail angle, and a thrust misalignment
   in a random direction. Landing points are turned into compass east/north so flights with different wind directions
   line up. The ellipses come from the covariance of the landing points (1σ and 2σ). */
/**
 * lastMC: the last dispersion run's results (apogee statistics, landing ellipses, the flights' points), tied to
 * the run of the simulation it was flown for (when). mcBusy/mcStop/mcAgain: a run in progress, a request to stop it,
 * and a request to start again once it stops.
 */
export let lastMC = null;
let mcBusy = false,
  mcStop = false,
  mcAgain = false;
/**
 * Start a dispersion run in the background after a simulation run (replacing one still going).
 */
export function mcAuto() {
  if (!lastSim) return;
  if (mcBusy) {
    mcStop = true;
    mcAgain = true;
    return;
  }
  setTimeout(() => {
    if (lastSim && !mcBusy) runMC();
  }, 80);
}
/**
 * A small seeded random-number generator (mulberry32), so a dispersion run repeats exactly.
 * @param {number} seed
 * @returns {{u:function():number, n:function():number}} u: uniform in [0, 1); n: standard normal (Box–Muller)
 */
function mcRng(seed) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    u,
    n: () => {
      let x = 0;
      while (x === 0) x = u();
      return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u());
    },
  };
}
/**
 * Fly the dispersion run for the last simulation: L.mcN flights, each with its wind, direction, impulse, weight,
 * drag, rail angle, thrust misalignment, roll, delay and chute drag drawn at random; then the apogee statistics and
 * the 68% and 95% landing ellipses. Yields to the page between flights so it stays responsive and can be cancelled.
 */
export async function runMC() {
  if (mcBusy || !lastSim) return;
  readFields();
  const { D: SD, L: SL, m, mb } = lastSim,
    N = Math.max(10, Math.min(1000, Math.round(L.mcN || 100))),
    R = mcRng(12345);
  const msg = document.getElementById("mcmsg"),
    prog = document.getElementById("mcprog"),
    w = lastSim.when;
  mcBusy = true;
  mcStop = false;
  prog.hidden = false;
  drawMC();
  document.getElementById("mccancel").hidden = false;
  msg.textContent = `Flying ${N} dispersion flights…`;
  const pts = [];
  const t0 = performance.now();
  // the whole rocket's length, and how far the airframe's CG must move to move the liftoff CG by one unit
  const balLen = SD.length + (SD.twoStage ? SD.bLength || 0 : 0) + (isThree(SD) && SD.s1 ? SD.s1.bLength || 0 : 0),
    balLift =
      SD.dryMass +
      m.totalMass +
      (SD.twoStage && mb ? (SD.bDryMass || 0) + mb.totalMass : 0) +
      (isThree(SD) && SD.s1 && lastSim.m1 ? (SD.s1.bDryMass || 0) + lastSim.m1.totalMass : 0),
    balK = SD.dryMass > 0 ? balLift / SD.dryMass : 1;
  try {
    for (let i = 0; i < N; i++) {
      if (mcStop || !lastSim || lastSim.when !== w) break;
      const kw = Math.max(0, 1 + (L.mcWind || 0) * R.n()),
        dd = (L.mcDir || 0) * R.n();
      const Li = {
        ...SL,
        wind: SL.wind * kw,
        windDir: ((((SL.windDir ?? 270) + dd) % 360) + 360) % 360,
        aloft: (SL.aloft || []).map((r) => ({ ...r, speed: r.speed * kw, dir: (((r.dir + dd) % 360) + 360) % 360 })),
        angle: Math.max(0, SL.angle + (L.mcAngle || 0) * R.n()),
        impScale: Math.max(0.5, 1 + (L.mcImp || 0) * R.n()),
        thrustMis: Math.hypot(SL.thrustMis || 0, (L.mcMis || 0) * R.n()),
        rollStart: 2 * Math.PI * R.u(),
        turb: SL.turb,
        thermalW: (L.mcThermal || 0) * R.n(),
      };
      // balance: the CG against the CP, off by a share of the length (moving the airframe's CG so the whole rocket's moves by it)
      const balShift = (L.mcBal || 0) * balLen * R.n() * balK;
      const Di = {
        ...SD,
        cgEmpty: SD.cgEmpty + balShift,
        dryMass: SD.dryMass * Math.max(0.5, 1 + (L.mcMass || 0) * R.n()),
        dragScale: (SD.dragScale > 0 ? SD.dragScale : 1) * Math.max(0.5, 1 + (L.mcCd || 0) * R.n()),
      };
      // the motor's delay grain burns a little long or short; each canopy's drag varies
      {
        const kd = Math.max(0.5, 1 + (L.mcDelay || 0) * R.n());
        if (Di.ejDelay != null) Di.ejDelay *= kd;
        if (Di.extraMotors) Di.extraMotors = Di.extraMotors.map((e) => (e.ej != null ? { ...e, ej: e.ej * kd } : e));
        if (Di.bEjDelay != null) Di.bEjDelay *= Math.max(0.5, 1 + (L.mcDelay || 0) * R.n());
        const kc = () => Math.max(0.5, 1 + (L.mcChute || 0) * R.n());
        Di.mainCd = (Di.mainCd || 0) * kc();
        Di.drogueCd = (Di.drogueCd || 0) * kc();
        if (Di.extraChutes) Di.extraChutes = Di.extraChutes.map((c) => ({ ...c, cd: (c.cd || 0.8) * kc() }));
      }
      const st = simulate(Di, Li, m, mb, { noRef: true }).st;
      const h = ((((Li.windDir ?? 270) + 180) % 360) * Math.PI) / 180,
        x = st.drift || 0,
        y = st.driftY || 0;
      pts.push({
        e: x * Math.sin(h) - y * Math.cos(h),
        n: x * Math.cos(h) + y * Math.sin(h),
        apo: st.maxAlt,
        landed: st.landed,
        tumble: !!st.tumble,
        minMargin: st.tumble ? -Infinity : st.minMargin ? st.minMargin.cal : null,
      });
      if (i % 3 === 2 || i === N - 1) {
        msg.textContent = `Flying ${i + 1} of ${N}…`;
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } finally {
    mcBusy = false;
    document.getElementById("mccancel").hidden = true;
    if (mcAgain) {
      mcAgain = false;
      setTimeout(() => {
        if (lastSim && !mcBusy) runMC();
      }, 0);
    }
  }
  // a newer run of the simulation (or cleared results) replaces this one
  if (!lastSim || lastSim.when !== w) return;
  if (mcStop || pts.length < 5) {
    msg.textContent = "Dispersion cancelled. Tap Launch to run it again.";
    return;
  }
  const n = pts.length,
    mean = (a) => a.reduce((x, y) => x + y, 0) / a.length,
    sd = (a, mu) => Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / Math.max(1, a.length - 1));
  const apos = pts.map((p) => p.apo).sort((a, b) => a - b),
    am = mean(apos),
    as = sd(apos, am),
    pc = (q) => apos[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))];
  const me = mean(pts.map((p) => p.e)),
    mn = mean(pts.map((p) => p.n));
  let cee = 0,
    cnn = 0,
    cen = 0;
  for (const p of pts) {
    cee += (p.e - me) ** 2;
    cnn += (p.n - mn) ** 2;
    cen += (p.e - me) * (p.n - mn);
  }
  cee /= n - 1;
  cnn /= n - 1;
  cen /= n - 1;
  const tr = (cee + cnn) / 2,
    det = Math.sqrt(Math.max(((cee - cnn) / 2) ** 2 + cen * cen, 0)),
    l1 = tr + det,
    l2 = Math.max(tr - det, 0),
    ang = 0.5 * Math.atan2(2 * cen, cee - cnn); // major axis angle from east
  const far = Math.max(...pts.map((p) => Math.hypot(p.e, p.n)));
  // how many of the simulated landings actually fell inside the 68% and 95% ellipses
  {
    const a1 = Math.sqrt(l1) || 1e-9,
      b1 = Math.sqrt(l2) || 1e-9,
      ca = Math.cos(ang),
      sa = Math.sin(ang);
    let i68 = 0,
      i95 = 0;
    for (const q of pts) {
      const de = q.e - me,
        dn = q.n - mn,
        u = de * ca + dn * sa,
        v = -de * sa + dn * ca,
        d2 = (u / a1) ** 2 + (v / b1) ** 2;
      if (d2 <= MC_K68 * MC_K68) i68++;
      if (d2 <= MC_K95 * MC_K95) i95++;
    }
    var in68 = i68 / pts.length,
      in95 = i95 / pts.length;
  }
  lastMC = {
    in68,
    in95,
    n,
    am,
    as,
    p05: pc(0.05),
    p95: pc(0.95),
    min: apos[0],
    max: apos[n - 1],
    me,
    mn,
    a1: Math.sqrt(l1),
    b1: Math.sqrt(l2),
    ang,
    far,
    pts,
    tumbles: pts.filter((p) => p.tumble).length,
    // the lowest stability in flight, at the worst 5% of flights
    minMargin5: (() => {
      const v = pts
        .map((p) => p.minMargin)
        .filter((x) => x != null)
        .sort((a, b) => a - b);
      return v.length ? v[Math.floor(0.05 * (v.length - 1))] : null;
    })(),
    when: w,
    secs: (performance.now() - t0) / 1000,
  };
  msg.textContent = `${n} flights in ${lastMC.secs.toFixed(0)} s.`;
  renderMC();
  renderRSO();
}
/**
 * Compass bearing (0–180°) of an axis given as an angle from east, counterclockwise.
 * @param {number} angE rad
 * @returns {number} degrees
 */
export function mcBearing(angE) {
  // the compass bearing of an axis given as an angle from east (counterclockwise)
  return (((90 - (angE * 180) / Math.PI) % 180) + 180) % 180;
}
/* the likely apogee range: the flight-to-flight spread from the dispersion run (motor, delay, weight, drag, wind, rail),
   combined (root-sum-square) with an allowance for the model itself. The model allowances are judgment figures from how
   amateur rocket simulators generally compare with real flights, as 90% half-widths: 6% for a weighed rocket below Mach 0.8;
   12% low and 7% high when the weight and CG are only estimated (built rockets usually come out heavier); 3% once the drag
   has been calibrated to one of your own flights; plus 5% at Mach 0.8 or faster, where drag is least certain. */
/**
 * The likely apogee range: the dispersion run's spread combined with an allowance for the model itself.
 * @param {object} st the flight's summary (from simulate)
 * @param {object} D design
 * @returns {object|null} lo and hi (m), the percentages and what went into them; null without a valid flight
 */
export function apoRange(st, D) {
  if (!st || st.error || !(st.maxAlt > 0)) return null;
  const cal = D.dragScale > 0 && Math.abs(D.dragScale - 1) > 1e-6,
    est = D.massKnown === false,
    fast = (st.maxMach || 0) >= 0.8;
  let mLo = cal ? 0.03 : est ? 0.12 : 0.06,
    mHi = cal ? 0.03 : est ? 0.07 : 0.06;
  if (fast) {
    mLo = Math.hypot(mLo, 0.05);
    mHi = Math.hypot(mHi, 0.05);
  }
  const mc = lastMC && lastSim && lastMC.when === lastSim.when && lastMC.am > 0 ? lastMC : null;
  const cLo = mc ? Math.max(0, (mc.am - mc.p05) / mc.am) : 0,
    cHi = mc ? Math.max(0, (mc.p95 - mc.am) / mc.am) : 0;
  const lo = Math.hypot(mLo, cLo),
    hi = Math.hypot(mHi, cHi),
    A = st.maxAlt;
  return { lo: A * (1 - lo), hi: A * (1 + hi), loPct: lo, hiPct: hi, mLo, mHi, cLo, cHi, mc: !!mc, cal, est, fast };
}
/**
 * An end of the apogee range in the units shown, rounded: to 10 above 1,000, otherwise to 1.
 * @param {number} v m
 * @returns {string}
 */
export function apoRound(v) {
  const d = toDisp(v, "alt"),
    q = Math.abs(d) >= 1000 ? 10 : 1;
  return (Math.round(d / q) * q).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
/**
 * Show the dispersion run's results (statistics and the landing map) on the Results tab.
 */
export function renderMC() {
  const out = document.getElementById("mcout");
  if (!out) return;
  if (!lastMC || !lastSim || lastMC.when !== lastSim.when) {
    out.hidden = true;
    return;
  }
  out.hidden = false;
  const M = lastMC;
  try {
    renderRSO();
  } catch (e) {}
  const dist = Math.hypot(M.me, M.mn),
    brg = ((Math.atan2(M.me, M.mn) * 180) / Math.PI + 360) % 360;
  const tile = (k, v, u) =>
    `<div class="stat"><div class="k">${k}</div><div class="v">${v}<i>${u || ""}</i></div>${speedAlso(v, u)}</div>`;
  document.getElementById("mcstats").innerHTML =
    tile("Apogee, average", fmt(M.am, "alt"), `${uname("alt")} ± ${fmt(M.as, "alt")}`) +
    tile("Apogee, 90% range", `${fmt(M.p05, "alt")}–${fmt(M.p95, "alt")}`, uname("alt")) +
    tile("Average landing spot", fmt(dist, "alt"), `${uname("alt")} toward ${compass(brg)}`) +
    tile(
      "Landing ellipse (95%)",
      `${fmt(2 * MC_K95 * M.a1, "alt")} × ${fmt(2 * MC_K95 * M.b1, "alt")}`,
      `${uname("alt")}, long axis ${compass(mcBearing(M.ang))}–${compass(mcBearing(M.ang) + 180)}`,
    ) +
    tile("Farthest landing", fmt(M.far, "alt"), `${uname("alt")} · ${bigDist(M.far, 0)}`) +
    tile("Chance of tumbling", `${+((100 * M.tumbles) / M.n).toFixed(1)}`, `% · ${M.tumbles} of ${M.n} flights`) +
    (M.minMargin5 != null
      ? tile(
          "Lowest stability, worst 5%",
          isFinite(M.minMargin5) ? M.minMargin5.toFixed(2) : "Tumbles",
          isFinite(M.minMargin5) ? "cal" : "",
        )
      : "");
  document.getElementById("mcnote").textContent =
    `The landing bullseye is the Landing view of the Flight Performance chart above. Its inner ellipse is drawn to hold 68% of landings and the outer one 95% (in this run, ${Math.round(M.in68 * 100)}% and ${Math.round(M.in95 * 100)}% of the ${M.n} landings fell inside them). It's seen from above with north up; the dot in the cross is the pad. Varied: wind speed ±${Math.round((L.mcWind || 0) * 100)}%, wind direction ±${L.mcDir || 0}°, impulse ±${+((L.mcImp || 0) * 100).toFixed(1)}%, weight ±${+((L.mcMass || 0) * 100).toFixed(1)}%, balance ±${+((L.mcBal || 0) * 100).toFixed(1)}% of length, drag ±${Math.round((L.mcCd || 0) * 100)}%, rail angle ±${L.mcAngle || 0}°, thrust misalignment ${L.mcMis || 0}° (1σ).`;
  drawMC();
}
/**
 * Draw the landing map on the Results tab's canvas.
 */
export function drawMC() {
  if (typeof series !== "undefined" && series === "land") drawChart();
}
/**
 * Draw the landing map: the pad, every flight's landing point, the 68% and 95% ellipses and a scale, on any
 * canvas (the Results tab, or the PDF report's image).
 * @param {HTMLCanvasElement} cv
 * @param {CanvasRenderingContext2D} c
 * @param {number} W width, px
 * @param {number} H height, px
 */
export function drawMCInto(cv, c, W, H) {
  c.clearRect(0, 0, W, H);
  const leg = document.getElementById("chartlegend");
  const M = lastMC && lastSim && lastMC.when === lastSim.when ? lastMC : null;
  if (!M) {
    c.fillStyle = css("--muted");
    c.font = "13px " + css("--f-body").split(",")[0].replace(/"/g, "") + ", sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(mcBusy ? "Flying the dispersion flights…" : "Tap Launch to run the landing dispersion.", W / 2, H / 2);
    if (leg)
      leg.innerHTML = `<span style="--c:var(--muted)">Landing points from the dispersion run, seen from above</span>`;
    return;
  }
  if (leg)
    leg.innerHTML = `<span style="--c:${css("--accent")}">${M.n} landings${M.tumbles ? ` (${M.tumbles} tumbled, in red)` : ""}</span><span style="--c:${css("--ink")}">68% ellipse</span><span style="--c:${css("--muted")}">95% ellipse</span><span style="--c:${css("--ink")}">Pad</span><span style="--c:var(--muted)">North up</span>`;
  const ext =
    Math.max(
      ...M.pts.map((p) => Math.max(Math.abs(p.e), Math.abs(p.n))),
      1.08 * MC_K95 * M.a1 + Math.hypot(M.me, M.mn),
      50,
    ) * 1.12;
  const k = Math.min(W, H) / 2 / ext,
    X = (e) => W / 2 + e * k,
    Y = (nn) => H / 2 - nn * k;
  c.strokeStyle = css("--grid");
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, H / 2);
  c.lineTo(W, H / 2);
  c.moveTo(W / 2, 0);
  c.lineTo(W / 2, H);
  c.stroke();
  // range rings
  // the rings are marked in miles (km) once the average landing spot is more than a mile (km) from the pad
  const rd = Math.hypot(M.me, M.mn) > (units === "imp" ? 1609.344 : 1000) ? "dist" : "alt";
  const ring = niceTicks(0, toDisp(ext, rd), 3).filter((v) => v > 0);
  c.font = "10px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  c.fillStyle = css("--muted");
  for (const v of ring) {
    const r = fromDisp(v, rd) * k;
    c.beginPath();
    c.arc(W / 2, H / 2, r, 0, 7);
    c.stroke();
    c.fillText(
      `${rd === "alt" && v >= 1000 ? v / 1000 + "k" : +v.toFixed(2)} ${uname(rd)}`,
      W / 2 + r * 0.71 + 3,
      H / 2 - r * 0.71 - 3,
    );
  }
  c.fillStyle = css("--ink");
  c.font = "600 11px " + css("--f-body").split(",")[0].replace(/"/g, "") + ", sans-serif";
  c.textAlign = "center";
  c.fillText("N", W / 2, 12);
  // ellipses
  const ell = (sig, col) => {
    c.save();
    c.translate(X(M.me), Y(M.mn));
    c.rotate(-M.ang);
    c.beginPath();
    c.ellipse(0, 0, Math.max(sig * M.a1 * k, 1), Math.max(sig * M.b1 * k, 1), 0, 0, 7);
    c.strokeStyle = col;
    c.lineWidth = 1.6;
    c.stroke();
    c.restore();
  };
  const acc = css("--accent");
  for (const p of M.pts) {
    c.fillStyle = p.tumble ? css("--bad") || "#c53030" : acc;
    c.globalAlpha = 0.55;
    c.beginPath();
    c.arc(X(p.e), Y(p.n), 2.2, 0, 7);
    c.fill();
  }
  c.globalAlpha = 1;
  ell(MC_K68, css("--ink"));
  ell(MC_K95, css("--muted"));
  c.fillStyle = css("--ink");
  c.beginPath();
  c.arc(W / 2, H / 2, 3.5, 0, 7);
  c.fill();
}

/* landing ellipses: for landing points spread in two directions, an ellipse k standard deviations out holds 1 − e^(−k²/2) of them,
   so the 68% and 95% ellipses are 1.51 and 2.45 standard deviations out (not 1 and 2, which hold only 39% and 86%) */
/**
 * How many standard deviations out the 68% and 95% landing ellipses are, for points spread in two directions.
 */
export const MC_K68 = Math.sqrt(-2 * Math.log(1 - 0.68)),
  MC_K95 = Math.sqrt(-2 * Math.log(1 - 0.95));
/**
 * The farthest point of the 95% landing ellipse from the pad.
 * @param {object} M dispersion results (me, mn: mean east and north; a1, b1: the ellipse's 1σ axes; ang: its angle)
 * @returns {number} m
 */
export function mcFar95(M) {
  let f = 0;
  for (let i = 0; i < 72; i++) {
    const th = (i / 72) * 2 * Math.PI,
      ex = MC_K95 * M.a1 * Math.cos(th),
      ny = MC_K95 * M.b1 * Math.sin(th);
    f = Math.max(
      f,
      Math.hypot(
        M.me + ex * Math.cos(M.ang) - ny * Math.sin(M.ang),
        M.mn + ex * Math.sin(M.ang) + ny * Math.cos(M.ang),
      ),
    );
  }
  return f;
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.getElementById("mccancel").onclick = () => {
    mcStop = true;
  };
}
