/**
 * The recovery plan on the Results tab: each charge as it would fire (each altimeter's and the motor's, and a chute
 * release opening), the flight flown again as if each of them failed, the time and drift under the drogue and the main
 * (and with the main set higher or lower), the main's opening load against its rated load, and the altimeter bay's
 * static ports. It reads the rocket's recovery configuration (builder/recovery-config.js): motor ejection, one
 * altimeter or two, with or without a chute release.
 */
import { recAltimeter } from "../builder/recovery-config.js";
import { esc } from "../core/helpers.js";
import { simulate } from "../physics/simulate.js";
import { lastSim } from "../ui/results.js";
import { fmt, uname } from "../ui/units.js";

/** the flight the plan was last worked out for, and the plan */
let recFor = null,
  recPlanNow = null;

/**
 * A value of one of a run's series at a time (straight-line between steps).
 * @param {object} o the run's series (simulate's out)
 * @param {string} k the series
 * @param {number} t time, s
 * @returns {number}
 */
function recAt(o, k, t) {
  let i = 1;
  while (i < o.t.length - 1 && o.t[i] < t) i++;
  const a = o.t[i - 1],
    b = o.t[i],
    f = Math.min(1, Math.max(0, (t - a) / (b - a || 1)));
  return o[k][i - 1] + (o[k][i] - o[k][i - 1]) * f;
}
/**
 * The run's speed through the air at a time: in free flight, from the airspeed series; under a chute (where that series
 * stops) it drifts with the wind, so its speed through the air is its fall.
 * @param {object} o the run's series
 * @param {number} t time, s
 * @returns {number}
 */
function recSpeed(o, t) {
  if (!o.va) return Math.abs(recAt(o, "vel", t));
  let i = 1;
  while (i < o.t.length - 1 && o.t[i] < t) i++;
  const a = o.va[i - 1],
    b = o.va[i];
  if (isFinite(a) && isFinite(b)) return recAt(o, "va", t);
  if (isFinite(a)) return a;
  return Math.abs(recAt(o, "vel", t));
}
/**
 * The time the run comes down through a height after apogee.
 * @param {object} R simulate's result
 * @param {number} h height, m
 * @returns {number|null}
 */
function recDownThrough(R, h) {
  const o = R.out,
    tA = R.st.tApo;
  if (tA == null) return null;
  for (let i = 1; i < o.t.length; i++) if (o.t[i] > tA && o.alt[i] <= h && o.alt[i - 1] > h) return o.t[i];
  return null;
}
/**
 * Where the run is over the ground at a time: downwind and across, m.
 * @param {object} R
 * @param {number} t
 * @returns {number[]}
 */
function recPos(R, t) {
  return [recAt(R.out, "drift", t), recAt(R.out, "cross", t)];
}
/**
 * How a run comes down: the first opening, the landing and the drift.
 * @param {object} st the run's summary
 * @returns {object}
 */
function recOutcome(st) {
  const land = st.vLandZ ?? null,
    open = st.tDeploy != null && !st.noChute;
  return {
    open,
    tRel: open && st.tApo != null ? st.tDeploy - st.tApo : null,
    alt: open ? st.altDeploy : null,
    v: open ? st.vDeploy : null,
    land,
    drift: st.drift != null ? Math.hypot(st.drift, st.driftY || 0) : null,
    shockG: st.shockM ? st.shockM.g : st.shockD ? st.shockD.g : null,
  };
}
/**
 * How safe an outcome is: good (lands at 20 ft/s or slower, opening below 100 ft/s), warn, or bad (lands faster than
 * 30 ft/s, or nothing opens).
 * @param {object} o recOutcome
 * @returns {string}
 */
function recGrade(o) {
  if (!o.open || o.land == null) return "bad";
  if (o.land > 9.14) return "bad";
  if (o.land > 6.1 || (o.v != null && o.v > 30.5)) return "warn";
  return "good";
}
/**
 * The flight's recovery set-up, from the design's recovery configuration (a design the builder made) or, without one
 * (or with "custom"), from how the flight itself deploys.
 * @param {object} D the design
 * @returns {{cfg:string, alts:object[], mainCharge:boolean, cr:boolean, crAlt:number, dual:boolean, alti:boolean}}
 *   cfg "motor", "one" or "two"; alts: each altimeter's apogee delay (s), main height (m), name and model
 */
function recSetup(D) {
  const R = D.rec || {},
    dual = D.recovery !== "single",
    alti = (D.deployMode || "apogee") === "apogee",
    known = R.cfg === "motor" || R.cfg === "one" || R.cfg === "two",
    cfg = known ? R.cfg : alti ? "one" : "motor",
    cr = known ? !!R.crOn : !!D.chuteRelease,
    alt = (k, who) => ({
      who,
      apo: +R[k + "Apo"] || 0,
      main: +R[k + "Main"] || 0,
      model: recAltimeter(R[k + "Model"]),
    });
  return {
    cfg,
    dual,
    alti,
    cr,
    crAlt: D.mainAlt,
    mainCharge: known ? !!R.mainCharge : dual && !D.chuteRelease,
    alts: !known
      ? alti
        ? [{ who: "Altimeter", apo: +D.deployDelay || 0, main: D.mainAlt, model: null }]
        : dual
          ? [{ who: "Altimeter", apo: null, main: D.mainAlt, model: null }]
          : []
      : cfg === "two"
        ? [alt("a1", "Altimeter 1"), alt("a2", "Altimeter 2")]
        : cfg === "one"
          ? [alt("a1", "Altimeter")]
          : [],
  };
}
/**
 * The design with no parachute at all: nothing opens.
 * @param {object} D
 * @returns {object}
 */
const recNone = (D) => ({ ...D, recovery: "single", mainDia: 0, mainCd: 0, drogueDia: 0, extraChutes: [] });
/**
 * The design with every altimeter failed: only the motor's charge is left, pushing on the compartment nearest the tail.
 * @param {object} D the design
 * @param {object} U recSetup
 * @returns {{D:object, note:string}}
 */
function recMotorOnly(D, U) {
  const dual = U.dual,
    aftMain = D.aftChute === "main" || !(D.drogueDia > 0);
  if (D.ejDelay == null) return { D: recNone(D), note: "plugged motor: nothing fires" };
  if (!dual) return { D: { ...D, deployMode: "motor" }, note: "the motor's charge deploys the chute" };
  if (aftMain && U.cr)
    return { D: { ...D }, note: "the motor's charge puts the chute out; the chute release still opens it" };
  return aftMain
    ? { D: { ...D, recovery: "single", deployMode: "motor" }, note: "the motor's charge pushes out the main" }
    : {
        D: { ...D, recovery: "single", mainDia: D.drogueDia, mainCd: D.drogueCd, deployMode: "motor" },
        note: "the motor's charge pushes out the drogue; the main stays packed",
      };
}
/**
 * The recovery plan for the last run: worked out once per run (a few more flights are flown for it).
 * @returns {object|null}
 */
function recPlan() {
  if (!lastSim || lastSim.st.error) return null;
  if (recFor === lastSim) return recPlanNow;
  const { D: D0, L: L0, m, mb, st } = lastSim,
    R0 = { out: lastSim.out, st },
    rec = D0.rec || {},
    U = recSetup(D0),
    { dual, alti, cfg } = U,
    fly = (D2) => {
      const r = simulate(D2, L0, m, mb, { noRef: true });
      return r.st.error ? null : r;
    };
  const P = {
    dual,
    alti,
    rec,
    cfg,
    U,
    charges: [],
    cases: [],
    notes: [],
    legs: null,
    mains: [],
    load: null,
    ports: null,
  };
  const hasDrogue = dual && D0.drogueDia > 0;
  // each charge as it would fire, on the flight as set
  if (st.tApo != null) {
    const add = (who, what, t, model) => {
      if (t == null || !(t > 0) || (st.tLand != null && t > st.tLand)) return;
      const vz = recAt(R0.out, "vel", t),
        va = recSpeed(R0.out, t);
      P.charges.push({ who, what, t, rel: t - st.tApo, alt: recAt(R0.out, "alt", t), vz, va, model });
    };
    // what the first charge puts out: the drogue; the one chute; the chute, bundled in its release; or (a main with
    // no drogue) nothing but the two halves
    const first = hasDrogue ? "drogue" : !dual ? "chute" : U.cr && !U.mainCharge ? "chute, bundled" : "separation",
      mainWhat = U.cr ? "main, bundled" : "main";
    for (const a of U.alts) {
      const name = a.model ? `${a.model.brand} ${a.model.name}` : "";
      if (a.apo != null) add(a.who, first, st.tApo + a.apo, name);
      // with the motor's charge first, a dual deploy's main is still the altimeter's
      if (U.mainCharge) add(a.who, mainWhat, recDownThrough(R0, a.main), name);
    }
    if (st.tEject != null)
      add(
        "Motor",
        dual ? (D0.aftChute === "main" || !hasDrogue ? (U.cr ? "chute, bundled" : "main") : "drogue") : "chute",
        st.tEject,
      );
    if (U.cr)
      add("Chute release", hasDrogue || U.mainCharge ? "main opens" : "chute opens", recDownThrough(R0, U.crAlt));
    P.charges.sort((a, b) => a.t - b.t);
    // what the chosen altimeters can do
    for (const a of U.alts) {
      const M = a.model;
      if (!M) continue;
      const nm = `${M.brand} ${M.name}`;
      if (M.fires === "apogee" && U.mainCharge)
        P.notes.push({
          bad: true,
          t: `The ${nm} fires an apogee charge only: it can't fire the main charge. Choose another altimeter for the main, or use a chute release.`,
        });
      if (M.accG > 0 && st.maxAcc > M.accG * 9.80665)
        P.notes.push({
          t: `This flight peaks at ${(st.maxAcc / 9.80665).toFixed(0)} g, past the ${nm}'s ${M.accG} g accelerometer.`,
        });
      if (M.maxAlt > 0 && st.apogee > M.maxAlt * 0.3048)
        P.notes.push({
          t: `This flight goes higher than the ${nm} reads (${fmt(M.maxAlt * 0.3048, "alt")} ${uname("alt")}).`,
        });
    }
  }
  // the flight as set, then with each charge failing
  P.cases.push({ name: "As set", note: "every charge works", o: recOutcome(st) });
  const tryCase = (name, note, D2) => {
    const r = D2 && fly(D2);
    if (r) P.cases.push({ name, note, o: recOutcome(r.st) });
  };
  if (cfg === "two")
    U.alts.forEach((a, i) => {
      const o = U.alts[1 - i];
      tryCase(`${a.who} fails`, `${o.who.toLowerCase()} does it`, {
        ...D0,
        deployMode: "apogee",
        deployDelay: o.apo,
        mainAlt: U.mainCharge ? (U.cr ? Math.min(o.main, +rec.crAlt || o.main) : o.main) : D0.mainAlt,
      });
    });
  if (alti && U.alts.length) {
    const mo = recMotorOnly(D0, U);
    tryCase(cfg === "two" ? "Both altimeters fail" : "Altimeter fails", mo.note, mo.D);
  } else if (cfg === "motor" && D0.ejDelay != null) tryCase("Motor charge fails", "nothing else fires", recNone(D0));
  if (U.cr)
    tryCase(
      "Chute release stays shut",
      hasDrogue ? "it comes down under the drogue alone" : "the chute stays bundled",
      hasDrogue ? { ...D0, recovery: "single", mainDia: D0.drogueDia, mainCd: D0.drogueCd } : recNone(D0),
    );
  // time and drift under each chute
  if (st.tDeploy != null && st.tLand != null) {
    const p0 = recPos(R0, st.tDeploy),
      pL = recPos(R0, st.tLand),
      tm = dual && st.tMain != null ? st.tMain : null,
      pm = tm != null ? recPos(R0, tm) : null,
      d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    P.legs = {
      drogue: tm != null ? { t: tm - st.tDeploy, d: d(p0, pm) } : null,
      main: tm != null ? { t: st.tLand - tm, d: d(pm, pL) } : { t: st.tLand - st.tDeploy, d: d(p0, pL) },
      total: Math.hypot(pL[0], pL[1]),
    };
  }
  // the main set higher or lower: 500, 750 and 1,000 ft, and the height set
  if (dual && st.tLand != null) {
    const hs = [152.4, 228.6, 304.8].filter((h) => Math.abs(h - D0.mainAlt) > 10);
    for (const h of [D0.mainAlt, ...hs].sort((a, b) => a - b)) {
      const r = h === D0.mainAlt ? R0 : fly({ ...D0, mainAlt: h });
      if (!r || r.st.drift == null) continue;
      P.mains.push({
        h,
        set: h === D0.mainAlt,
        drift: Math.hypot(r.st.drift, r.st.driftY || 0),
        land: r.st.vLandZ,
        t: r.st.tLand,
      });
    }
  }
  // the main's opening load against its rated load
  if (st.shockM && st.shockM.F > 0) P.load = { g: st.shockM.g, F: st.shockM.F, rating: +rec.mainRating || 0 };
  // static ports: PerfectFlite's rule, from the bay's diameter and length in inches
  if (+rec.bayLen > 0) {
    const din = (+rec.bayDia > 0 ? +rec.bayDia : D0.diameter) / 0.0254,
      lin = +rec.bayLen / 0.0254;
    P.ports = {
      dia: din * 0.0254,
      len: lin * 0.0254,
      one: din * din * lin * 0.0016 * 0.0254,
      four: din * din * lin * 0.0008 * 0.0254,
    };
  }
  recFor = lastSim;
  recPlanNow = P;
  return P;
}
/**
 * True when one altimeter is all there is: no second altimeter, and no motor charge.
 * @param {object} P recPlan
 * @returns {boolean}
 */
function recNoBackup(P) {
  return P.alti && P.cfg === "one" && P.charges.every((c) => c.who !== "Motor");
}
/**
 * Draws the recovery plan on the Results tab.
 */
export function renderRecovery() {
  const pan = document.getElementById("recpanel");
  if (!pan) return;
  const st = lastSim && lastSim.st;
  if (!st || st.error || st.noChute) {
    pan.hidden = true;
    return;
  }
  pan.hidden = false;
  const body = document.getElementById("recbody");
  // the extra flights take a moment: draw once they're done
  if (recFor !== lastSim) body.innerHTML = `<p class="note">Working out the recovery plan…</p>`;
  const me = lastSim;
  setTimeout(() => {
    if (lastSim !== me) return;
    const P = recPlan();
    if (P) body.innerHTML = recHtml(P);
  }, 0);
}
/**
 * The recovery plan's HTML.
 * @param {object} P recPlan
 * @returns {string}
 */
function recHtml(P) {
  // a number and its unit stay on one line (\u00a0); the tables wrap between values to fit a narrow phone
  const A = (v) => (v != null && isFinite(v) ? `${fmt(v, "alt")}\u00a0${uname("alt")}` : "—"),
    V = (v) => (v != null && isFinite(v) ? `${fmt(v, "speed")}\u00a0${uname("speed")}` : "—"),
    S = (v) => (v != null && isFinite(v) ? `${v.toFixed(1)}\u00a0s` : "—"),
    rel = (r) => (r == null ? "" : `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}\u00a0s`),
    tag = { good: "OK", warn: "Check", bad: "Unsafe" };
  let h = "";
  if (P.charges.length) {
    h += `<div class="subh">The charges, in order</div><div class="tblwrap"><table class="cmpt rect"><thead><tr><th>Charge</th><th>After apogee</th><th>Height</th><th>Speed</th></tr></thead><tbody>${P.charges
      .map(
        (c) =>
          `<tr><td>${esc(c.what[0].toUpperCase() + c.what.slice(1))}<small>${esc(c.who)}${c.model ? `, ${esc(c.model)}` : ""}</small></td><td>${rel(c.rel)}</td><td>${A(c.alt)}</td><td>${V(c.va)}${c.vz > 0.5 ? "<small>climbing</small>" : ""}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;
    const early = P.charges.find((c) => c.rel < -0.5 && c.who !== "Chute release");
    if (early)
      h += `<p class="note cmpnote">The ${esc(early.who.toLowerCase())}'s ${esc(early.what)} charge fires ${Math.abs(early.rel).toFixed(1)} s before apogee, while the rocket is still climbing.</p>`;
    if (recNoBackup(P))
      h += `<div class="cmpban warn"><b>No backup charge.</b>One altimeter and a plugged motor: if the altimeter fails, nothing opens. Add a second altimeter (the builder: Recovery, in the Design Tree), or fly a motor with a delay set to fire after apogee.</div>`;
    for (const n of P.notes)
      h += n.bad ? `<div class="cmpban warn">${esc(n.t)}</div>` : `<p class="note cmpnote">${esc(n.t)}</p>`;
  }
  if (P.cases.length) {
    h += `<div class="subh">If a charge fails</div><div class="tblwrap"><table class="cmpt rect"><thead><tr><th>Case</th><th>First opens</th><th>Lands at</th><th>Drift</th></tr></thead><tbody>${P.cases
      .map((c) => {
        const g = recGrade(c.o);
        return `<tr><td>${esc(c.name)}<small>${esc(c.note)}</small></td><td>${c.o.open ? `${rel(c.o.tRel)}<br>${A(c.o.alt)}, ${V(c.o.v)}` : "nothing opens"}</td><td>${V(c.o.land)}<br><b class="${g}">${tag[g]}</b></td><td>${A(c.o.drift)}</td></tr>`;
      })
      .join("")}</tbody></table></div>`;
    const worst = P.cases.slice(1).find((c) => recGrade(c.o) === "bad");
    if (worst)
      h += `<p class="note cmpnote">${esc(worst.name)}: ${worst.o.open ? `it lands at ${V(worst.o.land)}, too fast to land undamaged` : "nothing opens and it falls ballistic"}. ${P.cfg !== "one" ? "" : "A second altimeter on its own battery and switch covers this. "}</p>`;
  }
  if (P.legs) {
    const L = P.legs;
    h += `<div class="subh">Time and drift under each chute</div><div class="stats">${
      L.drogue
        ? `<div class="stat"><div class="k">Under the drogue</div><div class="v">${S(L.drogue.t)}<i></i></div><div class="note">${A(L.drogue.d)} of drift</div></div>`
        : ""
    }<div class="stat"><div class="k">Under the ${L.drogue ? "main" : "chute"}</div><div class="v">${S(L.main.t)}<i></i></div><div class="note">${A(L.main.d)} of drift</div></div><div class="stat"><div class="k">Lands from the pad</div><div class="v">${fmt(L.total, "alt")}<i>${uname("alt")}</i></div></div></div>`;
  }
  if (P.mains.length > 1)
    h += `<div class="tblwrap"><table class="cmpt rect"><thead><tr><th>Main opens at</th><th>Time down</th><th>Lands from the pad</th></tr></thead><tbody>${P.mains
      .map(
        (x) =>
          `<tr${x.set ? ' class="set"' : ""}><td>${A(x.h)}${x.set ? " (set)" : ""}</td><td>${S(x.t)}</td><td>${A(x.drift)}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;
  if (P.load) {
    const r = P.load.rating,
      pct = r > 0 ? P.load.F / r : null,
      g = pct == null ? "" : pct > 1 ? "bad" : pct > 0.5 ? "warn" : "good";
    h += `<div class="subh">The ${P.dual ? "main" : "chute"}'s opening load</div><p class="note" style="margin:0">${P.load.g.toFixed(0)} g on the rocket at its descent weight, about ${fmt(P.load.F, "force")} ${uname("force")}${
      r > 0
        ? `: <b class="${g}">${Math.round(pct * 100)}%</b> of the ${fmt(r, "force")} ${uname("force")} the chute and harness are rated to. ${pct > 1 ? "Over the rating: use a stronger harness, or slow the opening (a larger drogue, or a slower-opening or reefed main)." : pct > 0.5 ? "Over half the rating: a faster opening than predicted (a gust, a late charge) could reach it." : "Under half the rating."}`
        : ". Enter the chute and harness's rated load (the builder: Recovery, in the Design Tree) to compare."
    }</p>`;
  }
  if (P.ports)
    h += `<div class="subh">Static ports</div><p class="note" style="margin:0">For a ${fmt(P.ports.dia, "len")} ${uname("len")} by ${fmt(P.ports.len, "len")} ${uname("len")} bay: one hole of ${fmt(P.ports.one, "small")} ${uname("small")}, or four of ${fmt(P.ports.four, "small")} ${uname("small")} spaced evenly around it (PerfectFlite's rule; follow your own altimeter maker's if it gives one).</p>`;
  else if (P.alti)
    h += `<p class="note">Enter the altimeter bay's length (the builder: Recovery, in the Design Tree) for its static port size.</p>`;
  return h;
}
/**
 * The recovery plan as plain text for the flight report: blocks with a title, and a table (head and rows) or lines of
 * text. The same figures as the Results tab's panel.
 * @returns {object[]|null} [{title, head?, rows?, lines?}], or null when the flight has no chute
 */
export function recPlanText() {
  const st = lastSim && lastSim.st;
  if (!st || st.error || st.noChute) return null;
  const P = recPlan();
  if (!P) return null;
  const A = (v) => (v != null && isFinite(v) ? `${fmt(v, "alt")} ${uname("alt")}` : "-"),
    V = (v) => (v != null && isFinite(v) ? `${fmt(v, "speed")} ${uname("speed")}` : "-"),
    S = (v) => (v != null && isFinite(v) ? `${v.toFixed(1)} s` : "-"),
    rel = (r) => (r == null ? "" : `${r >= 0 ? "+" : "-"}${Math.abs(r).toFixed(1)} s`),
    tag = { good: "OK", warn: "Check", bad: "Unsafe" },
    out = [];
  if (P.charges.length) {
    const lines = [];
    const early = P.charges.find((c) => c.rel < -0.5 && c.who !== "Chute release");
    if (early)
      lines.push(
        `The ${early.who.toLowerCase()}'s ${early.what} charge fires ${Math.abs(early.rel).toFixed(1)} s before apogee, while the rocket is still climbing.`,
      );
    if (recNoBackup(P))
      lines.push("No backup charge: one altimeter and a plugged motor. If the altimeter fails, nothing opens.");
    for (const n of P.notes) lines.push(n.t);
    out.push({
      title: "The charges, in order",
      head: ["Charge", "After apogee", "Height", "Speed"],
      rows: P.charges.map((c) => [
        `${c.what[0].toUpperCase() + c.what.slice(1)} (${c.who.toLowerCase()}${c.model ? `, ${c.model}` : ""})`,
        rel(c.rel),
        A(c.alt),
        V(c.va) + (c.vz > 0.5 ? ", climbing" : ""),
      ]),
      lines,
    });
  }
  if (P.cases.length)
    out.push({
      title: "If a charge fails",
      head: ["Case", "First opens", "Lands at", "Drift"],
      rows: P.cases.map((c) => [
        `${c.name}: ${c.note}`,
        c.o.open ? `${rel(c.o.tRel)}, ${A(c.o.alt)}, ${V(c.o.v)}` : "nothing opens",
        `${V(c.o.land)} (${tag[recGrade(c.o)]})`,
        A(c.o.drift),
      ]),
      grades: P.cases.map((c) => recGrade(c.o)),
    });
  if (P.legs) {
    const L = P.legs,
      rows = [];
    if (L.drogue) rows.push(["Under the drogue", S(L.drogue.t), A(L.drogue.d)]);
    rows.push([`Under the ${L.drogue ? "main" : "chute"}`, S(L.main.t), A(L.main.d)]);
    rows.push(["Lands from the pad", "", A(L.total)]);
    out.push({ title: "Time and drift under each chute", head: ["", "Time", "Drift"], rows });
  }
  if (P.mains.length > 1)
    out.push({
      title: "The main opening higher or lower",
      head: ["Main opens at", "Time down", "Lands from the pad"],
      rows: P.mains.map((x) => [A(x.h) + (x.set ? " (set)" : ""), S(x.t), A(x.drift)]),
    });
  const lines = [];
  if (P.load) {
    const r = P.load.rating,
      pct = r > 0 ? P.load.F / r : null;
    lines.push(
      `${P.dual ? "Main" : "Chute"} opening load: ${P.load.g.toFixed(0)} g at the descent weight, about ${fmt(P.load.F, "force")} ${uname("force")}` +
        (r > 0
          ? `, ${Math.round(pct * 100)}% of the ${fmt(r, "force")} ${uname("force")} rating.`
          : " (no rating entered)."),
    );
  }
  if (P.ports)
    lines.push(
      `Static ports for a ${fmt(P.ports.dia, "len")} by ${fmt(P.ports.len, "len")} ${uname("len")} bay: one hole of ${fmt(P.ports.one, "small")} ${uname("small")}, or four of ${fmt(P.ports.four, "small")} ${uname("small")} (PerfectFlite's rule).`,
    );
  if (lines.length) out.push({ title: "Opening load and static ports", lines });
  return out;
}
