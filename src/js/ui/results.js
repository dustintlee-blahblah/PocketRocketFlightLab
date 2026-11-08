/**
 * Results: running the flight (with the wind table and Monte Carlo inputs), and the Results tab's tiles, staging
 * timeline and ejection charge list.
 */
import { animAt } from "../animation/animation.js";
import { esc } from "../core/helpers.js";
import { D, L, units } from "../design/defaults.js";
import { SOURCE } from "../files/save.js";
import { renderTitle } from "../files/unsaved-changes.js";
import { renderFlightLog } from "../flightlog/flight-log.js";
import { flightBoost, flightFirst, flightMotor } from "../motors/clusters.js";
import { stability } from "../physics/aerodynamics.js";
import { mcAuto, renderMC } from "../physics/monte-carlo.js";
import { noseWeightPlan } from "../physics/nose-weight.js";
import { simulate } from "../physics/simulate.js";
import { isThree, stackStability } from "../physics/staging.js";
import { downloadsNS } from "../report/pdf-report.js";
import { drawChart, drawProfile } from "./charts.js";
import { profNoteRender, supRender } from "./donate.js";
import { TGT_NAME } from "./motor-tab.js";
import { renderRSO, renderWindTable, resultFlags } from "./rso-checklist.js";
import { fmt, fromDisp, uname } from "./units.js";
/* ---------- rendering ---------- */
/**
 * The last run: {st, out, S, m, mb, D, L, windTable, ...}, or null when results are out of date.
 */
export let lastSim = null;
/**
 * Runs the flight for the current design, motors and conditions, plus the wind table, and shows the results.
 */
export function runAll() {
  const m = flightMotor(),
    mb = D.twoStage ? flightBoost() : null,
    S = stability(D, m),
    SS = mb ? stackStability(D, m, mb) : null;
  const { out, st } = simulate(D, L, m, mb);
  const winds = (units === "imp" ? [0, 5, 10, 15, 20] : [0, 2.5, 5, 7.5, 10]).map((v) => fromDisp(v, "wind"));
  const windTable = winds.map((w) => {
    const r = simulate(D, { ...L, wind: w }, m, mb, { noRef: true }).st;
    return {
      w,
      apo: r.maxAlt,
      drift: r.drift,
      driftY: r.driftY,
      landed: r.landed,
      error: r.error,
      powerTilt: r.powerTilt,
      pathAngle: r.pathAngle,
    };
  });
  lastSim = {
    out,
    st,
    m,
    mb,
    m1: isThree(D) && mb ? flightFirst() : null,
    S,
    SS,
    D: { ...D },
    L: { ...L },
    windTable,
    when: Date.now(),
  };
  renderResults();
  if (!st.error) mcAuto();
}
/**
 * Draws the Results tab from lastSim (or its empty state).
 */
export function renderResults() {
  document.getElementById("flightempty").hidden = !!lastSim;
  document.getElementById("chartpanel").hidden = !lastSim;
  document.getElementById("animpanel").hidden = !lastSim;
  document.getElementById("windpanel").hidden = !lastSim;
  if (!lastSim) {
    const rp = document.getElementById("rsopanel");
    if (rp) rp.hidden = true;
  }
  {
    const mp = document.getElementById("mcpanel");
    if (mp) mp.hidden = !lastSim;
    if (typeof renderMC === "function") renderMC();
  }
  document.getElementById("exportwrap").hidden = !lastSim || !downloadsNS;
  if (typeof supRender === "function") supRender();
  if (typeof profNoteRender === "function") profNoteRender();
  {
    const r = document.getElementById("simsaverow");
    if (r) {
      r.hidden = !lastSim || !downloadsNS;
      const n = document.getElementById("simsavenote");
      if (n)
        n.textContent =
          SOURCE && SOURCE.format === "rkt"
            ? `Saves the design as ${SOURCE.name.replace(/\.rkt$/i, "")}.ork, an OpenRocket file, with this run in its simulations. The original .rkt isn’t changed.`
            : SOURCE
              ? `Adds this run to the simulations in ${SOURCE.name}, so OpenRocket shows its results next to its own. Any unsaved design changes are saved with it.`
              : "Save the design to a file first (Rocket tab), then runs can be saved into it.";
      const b = document.getElementById("simsave");
      if (b) b.disabled = !SOURCE;
    }
  }
  if (!lastSim) {
    document.getElementById("mchip").textContent = flightMotor().cn || flightMotor().name;
    document.getElementById("stats").hidden = true;
    document.getElementById("apogee").textContent = "—";
    document.getElementById("flags").innerHTML = "";
    document.getElementById("orkref").hidden = true;
    return;
  }
  document.getElementById("stats").hidden = false;
  const { st, m, S } = lastSim;
  const D = lastSim.D;
  renderTitle();
  document.getElementById("mchip").textContent = m.cn || m.name;
  document.getElementById("apogee").innerHTML = st.error
    ? "—"
    : `${fmt(st.maxAlt, "alt")}<small>${uname("alt")}</small>`;
  const SL = lastSim.SS || S;
  {
    const sp = document.getElementById("stagepanel");
    sp.hidden = !st.staged;
    if (st.staged) renderStaging(st, S);
  }
  {
    const sub = document.querySelector(".motorchip .sub");
    if (sub)
      sub.textContent = st.three ? "First stage → booster → sustainer" : st.staged ? "Booster → sustainer" : "Motor";
  }
  if (st.staged)
    document.getElementById("mchip").textContent =
      `${st.three && lastSim.m1 ? (lastSim.m1.cn || lastSim.m1.name) + " → " : ""}${lastSim.mb.cn || lastSim.mb.name} → ${m.cn || m.name}`;
  document.getElementById("stats").innerHTML = resultGroups(st, SL)
    .map(
      ([g, t]) =>
        `<div class="statgrp"><div class="stath">${g}</div><div class="stats">${t
          .map(([k, v, u]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}<i>${u}</i></div></div>`)
          .join("")}</div></div>`,
    )
    .join("");
  const flags = resultFlags(st, SL, m, D);
  renderWindTable();
  document.getElementById("flags").innerHTML = flags.map(([c, t]) => `<span class="flag ${c}">${t}</span>`).join("");
  renderRSO();
  const ref = document.getElementById("orkref");
  if (D.orkApogee) {
    ref.hidden = false;
    const diff = st.maxAlt ? ((st.maxAlt - D.orkApogee) / D.orkApogee) * 100 : 0;
    ref.textContent = `${D.refSource || "OpenRocket"} file reports ${fmt(D.orkApogee, "alt")} ${uname("alt")}${D.orkMotor ? " on " + D.orkMotor : ""}; this run is ${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%.`;
  } else ref.hidden = true;
  renderFlightLog();
  drawChart();
  drawProfile();
}

/**
 * A horizontal distance in miles or kilometers.
 * @param {number} x m
 * @param {number} [y=0] m
 * @returns {string}
 */
export function bigDist(x, y = 0) {
  const v = Math.hypot(x, y || 0);
  return units === "imp" ? `${(v / 1609.344).toFixed(2)} mi` : `${(v / 1000).toFixed(2)} km`;
}
/**
 * The 16-point compass name of a bearing.
 * @param {number} b degrees
 * @returns {string}
 */
export function compass(b) {
  return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][
    Math.round((((b % 360) + 360) % 360) / 22.5) % 16
  ];
}
/**
 * Where the rocket lands relative to the wind ("downwind", "upwind", "crosswind"), with its compass bearing.
 * @param {number} x downrange, m
 * @param {number} [y=0] crossrange, m
 * @returns {string}
 */
export function driftDir(x, y = 0) {
  // landing direction relative to the wind, with its compass bearing from the pad
  if (Math.hypot(x, y || 0) < 0.5) return "";
  const rel = (Math.atan2(-(y || 0), x) * 180) / Math.PI,
    LL = lastSim ? lastSim.L : L,
    brg = (LL.windDir ?? 270) + 180 + rel;
  if (!(LL.wind > 0.3)) return `toward ${compass(brg)}`;
  return `${Math.abs(rel) <= 30 ? "downwind" : Math.abs(rel) >= 150 ? "upwind" : "crosswind"} (${compass(brg)})`;
}
/* the Staging panel: the flight's sequence as a timeline, then one stage's figures at a time */
let stageView = null;
/**
 * Each stage's color in the staging timeline.
 */
const STAGE_COL = { first: "var(--muted)", booster: "var(--gulf-ink)", sustainer: "var(--accent)", all: "var(--ink)" };
/**
 * The flight's events in order (ignitions, burnouts, separations, apogees, charges, chutes, landings).
 * @param {object} st flight summary
 * @returns {{t:number, txt:string, who:string, off:number, alt:number}[]}
 */
function stageTimeline(st) {
  const RS = lastSim || {},
    altAt = (t) => (RS.out && RS.out.t.length ? Math.max(0, animAt(RS.out.t, RS.out.alt, t)) : null),
    ev = [];
  /**
   * Adds an event (t in seconds; off: shown offset from another time).
   */
  const add = (t, txt, who, off) => {
    if (t != null && isFinite(t)) ev.push({ t, txt, who, off });
  };
  add(0, `Liftoff on the ${st.three ? "first-stage" : "booster"} motor`, st.three ? "first" : "booster");
  if (st.offRailT != null) add(st.offRailT, "Leaves the rail", "all");
  if (st.three) {
    const same = Math.abs((st.tIgnMid ?? 0) - (st.tSep1 ?? 0)) < 0.05;
    add(
      st.tSep1,
      same && !st.midAfterApogee
        ? "First stage burns out and drops; booster lights"
        : "First stage burns out and drops",
      "first",
    );
    if (st.midAfterApogee) add(st.tApo, "Booster doesn’t light: past apogee", "booster", true);
    else if (!same) add(st.tIgnMid, "Booster lights", "booster");
  }
  const sameS = Math.abs((st.tIgn ?? 0) - (st.tSep ?? 0)) < 0.05,
    noS = st.ignAfterApogee || st.ignLocked;
  if (st.sep)
    add(
      st.sep.t,
      sameS && !noS ? "Booster burns out and drops; sustainer lights" : "Booster burns out and drops",
      "booster",
    );
  if (st.ignLocked)
    add(
      st.ignLocked.t,
      `Sustainer doesn’t light: ${st.ignLocked.why === "alt" ? "below the lockout height" : "tilted past the lockout"}`,
      "sustainer",
      true,
    );
  else if (st.ignAfterApogee && !st.midAfterApogee)
    add(st.tApo, "Sustainer doesn’t light: past apogee", "sustainer", true);
  else if (st.ign && !sameS) add(st.ign.t, "Sustainer lights", "sustainer");
  if (!noS && st.tb != null) add(st.tb, "Sustainer burns out", "sustainer");
  add(st.tApo, "Apogee", "all");
  if (st.tDeploy != null && !st.plugSkip) add(st.tDeploy, st.single ? "Chute opens" : "Drogue opens", "all");
  if (st.tMain != null && (st.tMain !== st.tDeploy || st.plugSkip)) add(st.tMain, "Main opens", "all");
  if (st.tLand != null) add(st.tLand, "Sustainer lands", "sustainer");
  return ev.sort((a, b) => a.t - b.t).map((e) => ({ ...e, alt: altAt(e.t) }));
}
/**
 * Draws the Staging panel: the timeline, then one stage's figures at a time.
 * @param {object} st
 * @param {object} S stability
 */
function renderStaging(st, S) {
  const tl = document.getElementById("stagetl");
  tl.innerHTML = stageTimeline(st)
    .map(
      (e) =>
        `<li class="${e.off ? "off" : ""}" style="--sc:${STAGE_COL[e.who] || "var(--muted)"}"><span class="t">${e.t.toFixed(e.t < 10 ? 2 : e.t < 100 ? 1 : 0)} s</span><span>${esc(e.txt)}</span><span class="a">${e.alt != null ? fmt(e.alt, "alt") + " " + uname("alt") : ""}</span></li>`,
    )
    .join("");
  const G = stageGroups(st, S),
    keys = Object.keys(G);
  if (!keys.includes(stageView)) stageView = keys[0];
  document.getElementById("stageseg").innerHTML = keys
    .map((k) => `<button type="button" data-k="${k}" aria-pressed="${k === stageView}">${TGT_NAME[k]}</button>`)
    .join("");
  document.querySelectorAll("#stageseg button").forEach(
    (b) =>
      (b.onclick = () => {
        stageView = b.dataset.k;
        renderStaging(st, S);
      }),
  );
  document.getElementById("stagestats").innerHTML = G[stageView]
    .map(([k, v, u]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}<i>${u}</i></div></div>`)
    .join("");
}
/**
 * The staging figures grouped by stage, in flight order.
 * @param {object} st
 * @param {object} SU the sustainer's stability after separation
 * @returns {object}
 *
 * the stage figures, grouped by stage in flight order
 */
function stageGroups(st, SU) {
  const T = stageTiles(st, SU),
    by = (...names) => T.filter((r) => names.some((n) => r[0].startsWith(n)));
  const g = {};
  if (st.three) g.first = by("First-stage", "Speed at first-stage", "Booster ignition");
  g.booster = by(
    "Separation altitude",
    "Booster separation",
    "Speed at separation",
    "Booster apogee",
    "Booster landing",
    "Booster descent",
  );
  if (st.three) g.booster = [...T.filter((r) => /^Booster ignition/.test(r[0])), ...g.booster];
  g.sustainer = by(
    "Ignition delay",
    "Sustainer ignition",
    "Speed at sustainer",
    "Tilt at sustainer",
    "Sustainer stability",
  );
  if (st.three) g.first = g.first.filter((r) => !/^Booster ignition/.test(r[0]));
  for (const k of Object.keys(g)) if (!g[k].length) delete g[k];
  return g;
}
/**
 * The staging figures: [label, value, unit] tiles.
 * @param {object} st
 * @param {object} SU
 * @returns {Array[]}
 */
function stageTiles(st, SU) {
  const b = st.booster || {};
  const same = Math.abs((st.tIgn ?? 0) - (st.tSep ?? 0)) < 0.05;
  return [
    ...(st.three ? firstTiles(st) : []),
    [
      st.three ? "Booster separation altitude" : "Separation altitude",
      st.sep ? fmt(st.sep.alt, "alt") : "—",
      uname("alt") + (st.sep ? ` · ${st.sep.t.toFixed(2)} s` : ""),
    ],
    ["Speed at separation", st.sep ? fmt(st.sep.v, "speed") : "—", uname("speed")],
    [
      same ? "Ignition delay" : "Sustainer ignition altitude",
      same ? "0.0" : st.ign ? fmt(st.ign.alt, "alt") : "—",
      same ? "s · at separation" : uname("alt") + (st.ign ? ` · ${st.ign.t.toFixed(2)} s` : ""),
    ],
    ["Speed at sustainer ignition", st.ign ? fmt(st.ign.v, "speed") : "—", uname("speed")],
    ["Tilt at sustainer ignition", st.ign ? st.ign.tilt.toFixed(1) : "—", "° from vertical"],
    ["Sustainer stability alone", SU.marginL.toFixed(2), "cal"],
    ["Booster apogee", b.apogee != null ? fmt(b.apogee, "alt") : "—", uname("alt")],
    [
      `Booster landing${b.drift != null && driftDir(b.drift, b.driftY) ? ", " + driftDir(b.drift, b.driftY) : ""}`,
      b.drift != null ? fmt(Math.hypot(b.drift, b.driftY || 0), "alt") : "—",
      b.drift != null ? `${uname("alt")} · ${bigDist(b.drift, b.driftY)}` : "",
    ],
    [
      b.chute ? "Booster descent (chute)" : "Booster descent (free fall)",
      b.rate ? fmt(b.rate, "speed") : "—",
      uname("speed"),
    ],
  ];
}
/**
 * A three-stage rocket's first-stage figures.
 * @param {object} st
 * @returns {Array[]}
 *
 * a three-stage rocket: the first stage's own drop, and the booster lighting after it
 */
function firstTiles(st) {
  const f = st.first || {},
    same = Math.abs((st.tIgnMid ?? 0) - (st.tSep1 ?? 0)) < 0.05;
  return [
    [
      "First-stage separation",
      st.sep1 ? fmt(st.sep1.alt, "alt") : "—",
      uname("alt") + (st.sep1 ? ` · ${st.sep1.t.toFixed(2)} s` : ""),
    ],
    ["Speed at first-stage separation", st.sep1 ? fmt(st.sep1.v, "speed") : "—", uname("speed")],
    [
      same ? "Booster ignition delay" : "Booster ignition altitude",
      st.midAfterApogee ? "Not lit" : same ? "0.0" : st.ignMid ? fmt(st.ignMid.alt, "alt") : "—",
      st.midAfterApogee
        ? "past apogee"
        : same
          ? "s · at separation"
          : uname("alt") + (st.ignMid ? ` · ${st.ignMid.t.toFixed(2)} s` : ""),
    ],
    ["First-stage apogee", f.apogee != null ? fmt(f.apogee, "alt") : "—", uname("alt")],
    [
      `First-stage landing${f.drift != null && driftDir(f.drift, f.driftY) ? ", " + driftDir(f.drift, f.driftY) : ""}`,
      f.drift != null ? fmt(Math.hypot(f.drift, f.driftY || 0), "alt") : "—",
      f.drift != null ? `${uname("alt")} · ${bigDist(f.drift, f.driftY)}` : "",
    ],
    [
      f.chute ? "First-stage descent (chute)" : "First-stage descent (free fall)",
      f.rate ? fmt(f.rate, "speed") : "—",
      uname("speed"),
    ],
  ];
}
// every ejection charge in the flight, in order: the motors' delay charges, and the altimeter, timer or apogee charge for each chute
/* a live motor charge that fires while a chute set to open some other way (apogee, altitude, timer) is still packed: the
   simulation follows the design, as OpenRocket does, but in the real rocket the charge could blow that chute out early or
   damage the rocket */
/**
 * The warning for a live motor charge that fires while a chute set to open another way is still packed.
 * @param {object} st
 * @param {string} [stage] the stage's name
 * @returns {Array} a result flag
 */
export function ejLiveFlag(st, stage) {
  const e = st.ejLive,
    what =
      (stage ? stage + "’s " : "") + (e.packed === "main" ? "main" : e.packed === "drogue" ? "drogue" : "parachute"),
    apo = stage ? "its apogee" : "apogee";
  const when =
    e.dt == null
      ? `before ${apo}`
      : Math.abs(e.dt) < 0.1
        ? `at ${apo}`
        : e.dt < 0
          ? `${(-e.dt).toFixed(1)} s before ${apo}`
          : `${e.dt.toFixed(1)} s after ${apo}`;
  const fast = e.v > 30 || (e.packed === "main" && e.dt != null && e.dt > 0);
  return [
    fast ? "bad" : "warn",
    `The ${stage ? stage + " " : ""}motor’s ejection charge fires ${when} (${fmt(e.alt, "alt")} ${uname("alt")}, ${fmt(e.v, "speed")} ${uname("speed")}) while the ${what} is still packed${e.packed === "main" ? " for its lower altitude" : ""}. The simulation opens it as the design sets it, but a live charge can blow it out early or damage the rocket. Use a plugged motor if an altimeter handles deployment, or set the chute to open at the motor ejection charge with a delay near the ideal.`,
  ];
}
/**
 * Every ejection charge in the flight, in order: the motors' delay charges, and the altimeter, timer or apogee
 * charge for each chute.
 * @param {object} st
 * @param {object} D design
 * @param {object} outs the flight's time histories
 * @returns {object[]}
 */
export function chargeEvents(st, D, outs) {
  const out = [],
    tDep = st.tDeploy,
    noDrogue = !st.single && !(D.drogueDia > 0),
    mainAtDep = st.single || (st.tMain != null && tDep != null && st.tMain <= tDep + 1e-6);
  if (st.tEject != null)
    out.push({
      t: st.tEject,
      name: `${st.staged ? "Sustainer motor" : "Motor"} delay charge`,
      motor: true,
      delay: D.ejDelay ?? 0,
    });
  for (const x of st.tEjectX || [])
    if (st.tEject == null || Math.abs(x.t - st.tEject) > 0.05)
      out.push({ t: x.t, name: `${x.name}${x.n > 1 ? ` (${x.n}×)` : ""} delay charge`, motor: true, delay: x.delay });
  if (st.tBEject != null)
    out.push({ t: st.tBEject, name: "Booster motor delay charge", motor: true, delay: D.bEjDelay ?? 0, booster: true });
  if (st.tB1Eject != null)
    out.push({
      t: st.tB1Eject,
      name: "First-stage motor delay charge",
      motor: true,
      delay: (D.s1 && D.s1.bEjDelay) || 0,
      booster: true,
    });
  if (st.noChute || (st.depMode === "motor" && !st.plugSkip)) return out.sort((a, b) => a.t - b.t); // no chutes, or the chute rides on the motor's charge
  // the altimeter or timer charges still fire when they're due, even when the motor's charge already put a chute out
  const tFirst = tDep;
  const first = st.single
    ? st.depMode === "timer"
      ? "Timer charge"
      : "Apogee charge"
    : noDrogue
      ? "Apogee charge"
      : "Drogue charge";
  if (tFirst != null && (st.tLand == null || tFirst <= st.tLand))
    out.push({ t: tFirst, name: st.single || !mainAtDep ? first : "Main charge" });
  if (!st.single) {
    // the main charge: when the rocket comes down through the main altitude (or at apogee, if it never got that high)
    const tm = !mainAtDep ? st.tMain : null;
    if (tm != null) out.push({ t: tm, name: "Main charge" });
  }
  return out.sort((a, b) => a.t - b.t);
}
/**
 * The main results tiles in groups of related ones: [title, [[label, value, unit], …]].
 * @param {object} st
 * @param {object} S
 * @returns {Array[]}
 */
/**
 * The nose weight plan for this flight (noseWeightPlan), worked out once per run.
 * @param {object} st flight summary
 * @param {object} S stability at liftoff
 * @returns {object|null}
 */
export function nosePlan(st, S) {
  if (st._nw !== undefined) return st._nw;
  const RS = lastSim || {};
  let p;
  try {
    p = RS.D && !st.error ? noseWeightPlan(RS.D, S, st, RS.L, RS.m, RS.mb) : null;
  } catch (e) {
    p = null;
  }
  Object.defineProperty(st, "_nw", { value: p, enumerable: false, writable: true });
  return p;
}
/**
 * A nose weight in words: "45 g of nose weight", or that nose weight alone can't do it.
 * @param {number} w kg
 * @returns {string}
 */
export function noseWeightText(w) {
  return isFinite(w)
    ? `${fmt(w, "smass")} ${uname("smass")} of nose weight`
    : "more than nose weight alone can give (larger fins or a longer body)";
}
function resultGroups(st, S) {
  const RS = lastSim || {},
    altAt = (t) => (RS.out && RS.out.t.length ? Math.max(0, animAt(RS.out.t, RS.out.alt, t)) : null),
    spd = (v) => (v != null ? fmt(v, "speed") : "—");
  const speed = [
    ["Max ascent velocity", fmt(st.maxV, "speed"), uname("speed")],
    ["Max Mach", st.maxMach.toFixed(2), ""],
    ["Off-rail velocity", st.offRail ? fmt(st.offRail, "speed") : "—", uname("speed")],
    ["Max acceleration", fmt(st.maxAcc, "acc"), "g"],
    [
      st.staged ? "Average acceleration, to sustainer burnout" : "Average acceleration, to burnout",
      st.avgAccBurn != null ? fmt(st.avgAccBurn, "acc") : "—",
      "g",
    ],
    ...(st.maxQ
      ? [["Max dynamic pressure", fmt(st.maxQ.q, "qpress"), `${uname("qpress")} · Mach ${st.maxQ.M.toFixed(2)}`]]
      : []),
    ...(st.maxT0 && st.maxMach >= 1
      ? [
          [
            "Nose-tip air temperature",
            fmt(st.maxT0.T - 273.15, "temp", 0),
            `${uname("temp")} · stagnation, Mach ${st.maxT0.M.toFixed(1)}`,
          ],
        ]
      : []),
  ];
  const ascent = [
    ["Liftoff weight", fmt(st.liftMass, "mass"), uname("mass")],
    ["Thrust-to-weight (avg)", st.avgTtw.toFixed(1), ": 1"],
    [
      st.staged ? "Sustainer burnout altitude" : "Burnout altitude",
      st.burnAlt != null ? fmt(st.burnAlt, "alt") : "—",
      uname("alt"),
    ],
    ["Time to apogee", st.tApo ? st.tApo.toFixed(1) : "—", "s"],
    [
      st.staged ? "Ideal sustainer motor delay for apogee" : "Ideal motor delay for apogee",
      (st.tApoFree ?? st.tApo) && !st.ignAfterApogee ? Math.max(0, (st.tApoFree ?? st.tApo) - st.tb).toFixed(1) : "—",
      "s",
    ],
  ];
  const stability = [
    [
      st.staged ? "Stack stability at liftoff" : "Stability at liftoff",
      S.marginL.toFixed(2),
      (S.pctL != null ? `cal · ${S.pctL.toFixed(0)}% of length` : "cal") +
        (S.unc ? ` · uncertainty margin ${(S.marginL - S.unc).toFixed(1)}–${(S.marginL + S.unc).toFixed(1)}` : ""),
    ],
    // nose weight to reach 1 caliber, 10% of the length and 1 caliber leaving the rail in this wind
    ...(() => {
      const p = nosePlan(st, S);
      if (!p || !(p.need > 0)) return [];
      const why = [p.cal > 0 && "1 cal", p.pct > 0 && "10% of length", p.rail > 0 && "1 cal leaving the rail"]
        .filter(Boolean)
        .join(", ");
      return [
        [
          "Nose weight to add",
          isFinite(p.need) ? fmt(p.need, "smass") : "—",
          isFinite(p.need)
            ? `${uname("smass")} at mid-nose · for ${why}${p.apoCost != null ? ` · apogee ${p.apoCost >= 0 ? "−" : "+"}${fmt(Math.abs(p.apoCost), "alt")} ${uname("alt")}${p.apoCost < 0 ? " (flies straighter)" : ""}` : ""}`
            : "nose weight alone can't reach it: larger fins",
        ],
      ];
    })(),
    // leaving the rail in this wind: tilted to the airflow by the crosswind, so body lift has moved the CP forward
    ...(st.railMargin != null && !st.error
      ? [
          [
            "Stability leaving the rail",
            st.railMargin.toFixed(2),
            `cal · at ${st.railAoA.toFixed(0)}° in this wind · ${st.railPct.toFixed(0)}% of length`,
          ],
        ]
      : []),
    // how well it damps its wobble (about 0.05–0.3 is the usual guide)
    ...((st.dampMax || st.dampRail) && !st.tumble
      ? [
          [
            "Damping ratio",
            (st.dampMax || st.dampRail).zeta.toFixed(2),
            `${st.dampMax ? `at max speed, ${st.dampMax.hz.toFixed(1)} Hz` : "leaving the rail"}${st.dampMax && st.dampRail ? ` · ${st.dampRail.zeta.toFixed(2)} leaving the rail` : ""}`,
          ],
        ]
      : []),
    // the CP moves with Mach number and the CG with burning propellant: the lowest margin on the way up
    ...(st.minMargin
      ? [
          st.minMargin.cal < S.marginL
            ? ["Lowest stability in flight", st.minMargin.cal.toFixed(2), `cal · Mach ${st.minMargin.M.toFixed(2)}`]
            : ["Lowest stability in flight", S.marginL.toFixed(2), "cal · at liftoff"],
        ]
      : []),
    [
      "Max angle of attack",
      st.tumble ? "Tumbles" : st.maxAoA != null ? st.maxAoA.toFixed(1) : "0.0",
      st.tumble ? "" : "°",
    ],
    // roll, when the fins are canted (or anything else spins it)
    ...(st.maxRoll > 0.05
      ? [
          [
            "Max roll rate",
            ((st.maxRoll * 60) / (2 * Math.PI)).toFixed(0),
            `rpm · ${(st.maxRoll / (2 * Math.PI)).toFixed(1)} rev/s`,
          ],
        ]
      : []),
    ...(st.flutter && st.maxMach > 0.5
      ? [
          [
            "Fin flutter speed (est.)",
            fmt(st.flutter.vf, "speed"),
            `${uname("speed")} · airspeed peaks at ${Math.round(st.flutter.ratio * 100)}% of it`,
          ],
        ]
      : []),
    [
      "Cd at Mach 0.3",
      st.cdLow.toFixed(3),
      lastSim && lastSim.D.dragScale > 0 && lastSim.D.dragScale !== 1 ? " calibrated" : "",
    ],
  ];
  const recovery = [
    // when each charge fires (none for a plugged motor with no chute charges)
    ...(RS.D ? chargeEvents(st, RS.D, RS.out) : []).map((c) => {
      const a = c.booster ? null : altAt(c.t);
      return [
        `${c.name} fires`,
        c.t.toFixed(1),
        `s${c.motor ? ` · ${+c.delay.toFixed(1)} s delay` : ""}${a != null ? ` · ${fmt(a, "alt")} ${uname("alt")}` : ""}`,
      ];
    }),
    ...(st.single ? [["Speed at deployment", spd(st.vDeploy ?? st.vApo), uname("speed")]] : []),
    ...(st.shockD
      ? [["Drogue opening load", fmt(st.shockD.F, "force", 0), `${uname("force")} · ${st.shockD.g.toFixed(0)} g`]]
      : []),
    ...(st.shockM
      ? [
          [
            st.single ? "Chute opening load" : "Main opening load",
            fmt(st.shockM.F, "force", 0),
            `${uname("force")} · ${st.shockM.g.toFixed(0)} g`,
          ],
        ]
      : []),
  ];
  const descent = [
    ...(st.single
      ? [
          [
            st.noChute ? "Descent rate, tumbling" : "Descent rate",
            st.noChute ? (st.tumbleRate ? spd(st.tumbleRate) : "—") : st.mainRate ? spd(st.mainRate) : "—",
            uname("speed"),
          ],
        ]
      : [
          // the fastest it falls once the drogue is fully open (until the main opens)
          ["Drogue descent velocity", spd(st.drogueMaxV ?? st.drogueAnyV ?? st.drogueRate), uname("speed")],
          ["Main descent", st.mainRate ? spd(st.mainRate) : "—", uname("speed")],
        ]),
    [
      "Landing velocity",
      st.landed && st.vLand != null ? spd(st.vLand) : "—",
      `${uname("speed")}${st.landed && st.vLandZ != null && fmt(st.vLandZ, "speed") !== fmt(st.vLand, "speed") ? ` · ${fmt(st.vLandZ, "speed")} vertical` : ""}`,
    ],
    ["Flight time", st.tLand ? st.tLand.toFixed(0) : "—", "s"],
    [
      `Landing distance${driftDir(st.drift, st.driftY) ? ", " + driftDir(st.drift, st.driftY) : ""}`,
      fmt(Math.hypot(st.drift, st.driftY || 0), "alt"),
      `${uname("alt")} · ${bigDist(st.drift, st.driftY)}`,
    ],
  ];
  return [
    ["Speed and acceleration", speed],
    ["Ascent", ascent],
    ["Stability", stability],
    ["Recovery", recovery],
    ["Descent and landing", descent],
  ].filter(([, t]) => t.length);
}
/**
 * The main results tiles, all groups in order: [label, value, unit].
 * @param {object} st
 * @param {object} S
 * @returns {Array[]}
 */
export function resultTiles(st, S) {
  return resultGroups(st, S).flatMap(([, t]) => t);
}

/**
 * Sets lastSim (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setLastSim(v) {
  return (lastSim = v);
}
