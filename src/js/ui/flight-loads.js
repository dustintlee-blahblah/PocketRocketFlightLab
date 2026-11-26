import { store } from "../core/storage.js";
import { L, units } from "../design/defaults.js";
import { aero, finOutline, radiusAt } from "../physics/aerodynamics.js";
import { atmosphere } from "../physics/atmosphere.js";
import { flightLoads } from "../physics/loads.js";
import { nozzleEstimate } from "../physics/simulate.js";
import { lastSim } from "./results.js";
import { fmt, uname } from "./units.js";
/*
 * Flight loads on the Results tab: the side force, shear force and bending moment along the rocket at a moment of the
 * last flight (peak dynamic pressure, burnout or top speed) and an angle of attack (a side gust, a set angle, or the
 * angle it flew at), with the axial compression at the motor. The figure is shared with the Wind Tunnel, which shows
 * it for the speed and angle on its sliders. The method is physics/loads.js.
 */

/** Side gusts offered, m/s: round numbers in the units shown. */
const GUSTS = { imp: [3.048, 6.096, 9.144], met: [3, 6, 9] };
/** The choices kept between visits. */
let PICK = { when: "q", ang: "g1", deg: 5 };

/**
 * Why the loads aren't worked out for a design, or "" when they are.
 * @param {object} D design
 * @returns {string}
 */
export function loadsUnsupported(D) {
  if (D.twoStage) return "Flight loads aren’t worked out for staged rockets yet.";
  if ((D.extraMotors || []).length || (D.sideBoosters || []).length)
    return "Flight loads aren’t worked out for clustered motors or side boosters yet.";
  return "";
}
/**
 * A drawing of the loads along the rocket: its outline with the air's side forces, the CG and CP, the motor and any
 * couplers, then the shear force and the bending moment under it on the same length scale.
 * @param {object} R flightLoads()
 * @param {object} A the aerodynamic model
 * @param {object} D design (for its couplers)
 * @returns {string} SVG
 */
export function loadsFigure(R, A, D) {
  const W = 400,
    ml = 14,
    mr = 14,
    len = R.W.len,
    sx = (x) => ml + (x / len) * (W - ml - mr),
    yR = 74, // the rocket's axis
    fins = A.fins.map((f) => ({ ...f, rr: f.rb != null ? f.rb : radiusAt(A, f.xLead + f.a / 2) })),
    maxR = Math.max(A.R, ...fins.map((f) => f.rr + Math.max(...finOutline(f).map((q) => q[1])))),
    sr = Math.min((W - ml - mr) / len, 34 / maxR),
    f1 = (v, dim) => `${fmt(v, dim)} ${uname(dim)}`;
  let s = `<svg viewBox="0 0 ${W} 396" role="img" aria-label="Side forces on the rocket, with the shear force and bending moment along its length">`;
  // couplers and the motor: bands through the plots
  const band = (a, b, label) => {
    const x0 = sx(Math.max(0, a)),
      x1 = sx(Math.min(len, b));
    return `<rect x="${x0.toFixed(1)}" y="128" width="${Math.max(1, x1 - x0).toFixed(1)}" height="240" fill="var(--ink)" opacity=".05"/><text x="${((x0 + x1) / 2).toFixed(1)}" y="378" text-anchor="middle" font-size="10" fill="var(--muted)">${label}</text>`;
  };
  for (const j of D.joints || []) s += band(j.x - j.len / 2, j.x + j.len / 2, "coupler");
  if (R.W.motor) s += band(R.W.motor[0], R.W.motor[1], "motor");
  // the rocket
  let top = "",
    bot = "";
  for (let i = 0; i <= 120; i++) {
    const x = (A.L * i) / 120,
      r = radiusAt(A, x) * sr;
    top += `${i ? "L" : "M"}${sx(x).toFixed(1)},${(yR - r).toFixed(1)}`;
    bot = `L${sx(x).toFixed(1)},${(yR + r).toFixed(1)}` + bot;
  }
  s += `<path d="${top}${bot}Z" fill="var(--field)" stroke="var(--muted)" stroke-width="1"/>`;
  for (const f of fins)
    for (const sg of [1, -1])
      s += `<path d="${finOutline(f)
        .map(
          ([px, py], i) => `${i ? "L" : "M"}${sx(f.xLead + px).toFixed(1)},${(yR - sg * (f.rr + py) * sr).toFixed(1)}`,
        )
        .join("")}Z" fill="var(--field)" stroke="var(--muted)" stroke-width="1"/>`;
  // the side forces: an arrow for each that acts at a point, longest for the largest
  const pts = R.forces.filter((f) => !f.w && Math.abs(f.F) > 0),
    fmax = Math.max(1e-9, ...pts.map((f) => Math.abs(f.F)));
  let lastLabel = -1e9;
  for (const f of pts.slice().sort((a, b) => a.x - b.x)) {
    if (Math.abs(f.F) < 0.02 * fmax) continue;
    const x = sx(Math.min(f.x, len)),
      h = 8 + 26 * (Math.abs(f.F) / fmax),
      y0 = yR - (f.fin ? 36 : radiusAt(A, Math.min(f.x, A.L)) * sr + 2),
      up = f.F > 0 ? 1 : -1,
      ya = up > 0 ? y0 : y0 - h,
      yb = up > 0 ? y0 - h : y0;
    s += `<line x1="${x.toFixed(1)}" y1="${ya.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yb.toFixed(1)}" stroke="var(--accent)" stroke-width="2"/><path d="M${(x - 4).toFixed(1)},${(yb + up * 6).toFixed(1)}L${x.toFixed(1)},${yb.toFixed(1)}L${(x + 4).toFixed(1)},${(yb + up * 6).toFixed(1)}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
    if (Math.abs(f.F) >= 0.12 * fmax && x - lastLabel > 70) {
      const right = x < W - 110;
      s += `<text x="${(x + (right ? 7 : -7)).toFixed(1)}" y="${(y0 - h + 4).toFixed(1)}" text-anchor="${right ? "start" : "end"}" font-size="11" fill="var(--accent)">${f1(Math.abs(f.F), "force")}</text>`;
      lastLabel = x;
    }
  }
  // CG and CP
  const xg = sx(R.W.cg),
    xp = sx(Math.min(Math.max(R.cp, 0), len));
  s += `<circle cx="${xg.toFixed(1)}" cy="${yR}" r="5" fill="var(--panel)" stroke="var(--cg)" stroke-width="1.5"/><path d="M${(xg - 5).toFixed(1)},${yR}h10M${xg.toFixed(1)},${yR - 5}v10" stroke="var(--cg)" stroke-width="1.2"/><text x="${xg.toFixed(1)}" y="${yR + 50}" text-anchor="middle" font-size="11" fill="var(--cg)">CG</text>`;
  if (R.side !== 0)
    s += `<circle cx="${xp.toFixed(1)}" cy="${yR}" r="4" fill="var(--bad)"/><text x="${xp.toFixed(1)}" y="${yR + 50}" text-anchor="middle" font-size="11" fill="var(--bad)">CP</text>`;
  // the two traces
  const trace = (vals, yMid, half, dim, label, fill) => {
    const vm = Math.max(1e-12, ...vals.map(Math.abs)),
      y = (v) => yMid - (v / vm) * half,
      d = vals.map((v, i) => `${i ? "L" : "M"}${sx(R.x[i]).toFixed(1)},${y(v).toFixed(1)}`).join("");
    let hi = 0,
      lo = 0;
    vals.forEach((v, i) => {
      if (v > vals[hi]) hi = i;
      if (v < vals[lo]) lo = i;
    });
    let o = `<text x="${ml}" y="${yMid - half - 8}" font-size="11" fill="var(--muted)">${label} (${uname(dim)})</text><line x1="${ml}" x2="${W - mr}" y1="${yMid}" y2="${yMid}" stroke="var(--muted)" stroke-opacity=".5"/>`;
    if (fill) o += `<path d="${d}L${sx(len).toFixed(1)},${yMid}L${ml},${yMid}Z" fill="var(--good)" opacity=".12"/>`;
    o += `<path d="${d}" fill="none" stroke="var(--good)" stroke-width="2" stroke-linejoin="round"/>`;
    for (const [i, sg] of [
      [hi, -1],
      [lo, 1],
    ]) {
      if (Math.abs(vals[i]) < 0.05 * vm) continue;
      const x = sx(R.x[i]),
        right = x < W - 120;
      o += `<circle cx="${x.toFixed(1)}" cy="${y(vals[i]).toFixed(1)}" r="3" fill="var(--good)"/><text x="${(x + (right ? 7 : -7)).toFixed(1)}" y="${(y(vals[i]) + (sg < 0 ? -5 : 13)).toFixed(1)}" text-anchor="${right ? "start" : "end"}" font-size="11" fill="var(--ink)">${fmt(Math.abs(vals[i]), dim)} at ${f1(R.x[i], "len")}</text>`;
    }
    return o;
  };
  s += trace(R.shear, 190, 34, "force", "Shear force", false);
  s += trace(R.moment, 310, 44, "moment", "Bending moment", true);
  s += `<text x="${ml}" y="392" font-size="10" fill="var(--muted)">nose tip</text><text x="${W - mr}" y="392" text-anchor="end" font-size="10" fill="var(--muted)">${f1(len, "len")}</text>`;
  return s + "</svg>";
}
/**
 * The moment of the last flight the loads are worked out at.
 * @param {string} when "q" (peak dynamic pressure), "burn" (burnout) or "mach" (top speed)
 * @returns {{k:number, t:number, v:number, M:number, alt:number, atm:object, thrust:number, burnt:number,
 *   flown:number, label:string}|null}
 */
function loadsMoment(when) {
  const { out, st, m } = lastSim,
    n = out.t.length;
  let k = -1;
  if (when === "burn") {
    for (let i = n - 1; i >= 0; i--)
      if (out.thrust[i] > 0) {
        k = Math.min(n - 1, i + 1);
        break;
      }
  } else if (when === "mach") {
    let best = -1;
    for (let i = 0; i < n; i++)
      if (out.va[i] > best && !(st.tApo != null && out.t[i] > st.tApo)) {
        best = out.va[i];
        k = i;
      }
  } else if (st.maxQ) k = out.t.findIndex((t) => t >= st.maxQ.t);
  if (k < 0 || !(out.va[k] > 0)) return null;
  const alt = Math.max(0, out.alt[k]),
    atm = atmosphere(lastSim.L || L, alt),
    v = out.va[k];
  let I = 0,
    It = 0;
  for (let j = 1; j < m.t.length; j++) {
    const d = ((m.t[j] - m.t[j - 1]) * (m.F[j] + m.F[j - 1])) / 2;
    It += d;
    if (m.t[j] <= out.t[k]) I += d;
  }
  return {
    k,
    t: out.t[k],
    v,
    M: v / atm.a,
    alt,
    atm,
    thrust: Math.max(0, out.thrust[k] || 0),
    burnt: when === "burn" ? 1 : It > 0 ? I / It : 1,
    flown: isFinite(out.aoa[k]) ? out.aoa[k] : 0,
    label: when === "burn" ? "burnout" : when === "mach" ? "top speed" : "peak dynamic pressure",
  };
}
/**
 * The angle of attack chosen, in degrees, for a moment of the flight.
 * @param {{v:number, flown:number}} c
 * @returns {number}
 */
function loadsAngle(c) {
  if (PICK.ang === "set") return Math.max(0, Math.min(30, +PICK.deg || 0));
  if (PICK.ang === "flown") return c.flown;
  const g = GUSTS[units][+PICK.ang.slice(1)] ?? GUSTS[units][1];
  return (Math.atan(g / c.v) * 180) / Math.PI;
}
/**
 * Draws the Flight loads panel from the last flight.
 */
export function renderLoads() {
  const panel = document.getElementById("loadspanel");
  if (!panel) return;
  const ok = !!lastSim && !lastSim.st.error;
  panel.hidden = !ok;
  if (!ok) return;
  const D = lastSim.D,
    why = loadsUnsupported(D) || (lastSim.st.staged ? loadsUnsupported({ twoStage: true }) : ""),
    body = document.getElementById("loadsbody"),
    sum = document.getElementById("loadsfold"),
    note = document.getElementById("loadsnote"),
    c = why ? null : loadsMoment(PICK.when);
  document.getElementById("loadsctl").hidden = !!why;
  document.getElementById("loadsfig").hidden = !!why;
  document.getElementById("loadstiles").hidden = !!why;
  document.getElementById("loadscond").hidden = !!why;
  if (why || !c) {
    sum.textContent = "";
    note.textContent = why || "The flight has no free-flight moment to work the loads out at.";
    if (!why) document.getElementById("loadsfig").innerHTML = document.getElementById("loadstiles").innerHTML = "";
    return;
  }
  // the gusts in the units shown
  const sel = document.getElementById("loadsang");
  GUSTS[units].forEach((g, i) => {
    sel.querySelector(`[value="g${i}"]`).textContent = `Gust, ${fmt(g, "speed")} ${uname("speed")}`;
  });
  sel.querySelector('[value="flown"]').textContent = `As it flew (${c.flown.toFixed(1)}°)`;
  const aoa = loadsAngle(c),
    A = aero(D),
    An = D.nozzleDia > 0 ? Math.PI * (D.nozzleDia / 2) ** 2 : nozzleEstimate(lastSim.m),
    R = flightLoads(D, A, lastSim.m, { ...c, aoa, nozzleArea: An });
  loadsLast = { R, c, aoa };
  const f1 = (v, dim) => `${fmt(v, dim)} ${uname(dim)}`;
  sum.textContent = body.hidden ? `peak bending ${f1(Math.abs(R.peak.moment), "moment")}` : "";
  document.getElementById("loadscond").textContent =
    `At ${c.label}: ${c.t.toFixed(2)} s, Mach ${c.M.toFixed(2)}, ${f1(c.v, "speed")}, ${f1(c.alt, "alt")} up, dynamic pressure ${fmt(R.q, "qpress", 2)} ${uname("qpress")}. Angle of attack ${aoa.toFixed(1)}°.`;
  const tile = (k, v, u, sub) =>
    `<div class="stat"><div class="k">${k}</div><div class="v">${v}<i>${u}</i></div>${sub ? `<div class="k also">${sub}</div>` : ""}</div>`;
  document.getElementById("loadstiles").innerHTML = [
    tile(
      "Peak bending",
      fmt(Math.abs(R.peak.moment), "moment"),
      uname("moment"),
      `${f1(R.peak.x, "len")} from the tip`,
    ),
    tile(
      "Peak shear",
      fmt(Math.abs(R.peakShear.shear), "force"),
      uname("force"),
      `${f1(R.peakShear.x, "len")} from the tip`,
    ),
    tile("Side force", fmt(Math.abs(R.side), "force"), uname("force"), `${(R.lat / 9.80665).toFixed(2)} g sideways`),
    tile(
      "Axial compression",
      fmt(R.axial.compression, "force"),
      uname("force"),
      R.axial.thrust > 0 ? "at the motor’s thrust ring" : "motor out: drag only",
    ),
  ].join("");
  document.getElementById("loadsfig").innerHTML = loadsFigure(R, A, D);
  note.textContent =
    (R.W.fromParts
      ? ""
      : "This design carries no parts’ weights (open it from its file or build it in the builder for those), so its weight is spread evenly about its CG. ") +
    "Loads only: whether a tube, coupler or fin can carry them depends on its material and how it’s built. The rocket is taken as rigid and already at the angle.";
}
/** The last loads drawn, for the tests: {R, c, aoa}. */
export let loadsLast = null;

/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  PICK = { ...PICK, ...store.get("rfs-loads", {}) };
  const when = document.getElementById("loadswhen"),
    ang = document.getElementById("loadsang"),
    deg = document.getElementById("loadsdeg"),
    degF = document.getElementById("loadsdegfld");
  if (!when) return;
  if (![...when.options].some((o) => o.value === PICK.when)) PICK.when = "q";
  if (![...ang.options].some((o) => o.value === PICK.ang)) PICK.ang = "g1";
  when.value = PICK.when;
  ang.value = PICK.ang;
  deg.value = PICK.deg;
  degF.hidden = PICK.ang !== "set";
  const changed = () => {
    PICK.when = when.value;
    PICK.ang = ang.value;
    const d = +deg.value;
    if (isFinite(d) && deg.value !== "") PICK.deg = Math.max(0, Math.min(30, d));
    degF.hidden = PICK.ang !== "set";
    store.set("rfs-loads", PICK);
    renderLoads();
  };
  when.onchange = ang.onchange = changed;
  deg.oninput = changed;
  deg.onchange = () => {
    deg.value = PICK.deg;
  };
  document.querySelector('[data-fold="loadsbody"]').addEventListener("click", () => renderLoads());
}
