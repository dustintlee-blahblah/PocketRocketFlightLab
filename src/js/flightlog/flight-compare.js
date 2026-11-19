/**
 * Flight vs prediction: a logged flight (its altimeter file, the readings off an altimeter's display, or just its
 * apogee) side by side with this design flown the way that flight was flown (its motor, delay, weight and weather):
 * the curves with their events marked, a table of each event and its error, what a charge before apogee or an
 * altimeter at its acceleration limit means for the comparison, and what the differences point at.
 */
import { esc } from "../core/helpers.js";
import { altAtLimit, altimeterById, altimeterName } from "./altimeters.js";
import { solveDragScale } from "./drag-calibration.js";
import { flAltis, flCtx, flDate, flFit, flList, flOpen, flPut, flSaveFlight } from "./flight-log.js";
import { simulate } from "../physics/simulate.js";
import { css, niceTicks, setupCanvas } from "../ui/charts.js";
import { fmt, fromDisp, toDisp, uname } from "../ui/units.js";

/**
 * The flight on show: f (the flight), draft (not saved yet), P (prediction), M (measured), view ("alt", "speed",
 * "all").
 */
let fcNow = null;
const FC_G = 9.80665;

/**
 * The prediction's events, from a full run of the flight's setup.
 * @param {object} R simulate's result
 * @returns {object} times s, heights m, speeds m/s, accelerations g
 */
function fcPredEvents(R) {
  const o = R.out,
    st = R.st;
  let iv = 0,
    pk = 0,
    sum = 0,
    dur = 0;
  for (let i = 0; i < o.t.length; i++) {
    if (o.t[i] <= st.tApo && o.vel[i] > o.vel[iv]) iv = i;
    if (o.t[i] <= st.tb && i) {
      const g = o.acc[i] / FC_G,
        dt = o.t[i] - o.t[i - 1];
      pk = Math.max(pk, g);
      sum += g * dt;
      dur += dt;
    }
  }
  const altAt = (t) => {
    let i = 1;
    while (i < o.t.length - 1 && o.t[i] < t) i++;
    const a = o.t[i - 1],
      b = o.t[i];
    return o.alt[i - 1] + ((o.alt[i] - o.alt[i - 1]) * (t - a)) / (b - a || 1);
  };
  return {
    burn: o.t[iv],
    vmax: st.maxV,
    peakG: pk,
    avgG: dur > 0 ? sum / dur : null,
    thrust: st.tb,
    tApo: st.tApo,
    apo: st.maxAlt,
    coast: st.tApo - st.tb,
    tEj: st.tDeploy ?? null,
    ap2e: st.tDeploy != null ? st.tDeploy - st.tApo : null,
    ejAlt: st.altDeploy ?? null,
    tMain: st.tMain ?? null,
    mainAlt: st.tMain != null ? altAt(st.tMain) : null,
    descHigh: st.drogueRate ?? st.mainRate ?? null,
    descLow: st.mainRate ?? null,
    dur: st.tLand ?? null,
  };
}
/**
 * The flight's setup flown: as flown (its own delay) and, when the motor's charge deploys, held to a full coast.
 * @param {object} f flight
 * @returns {object|null} {R, ev, free, freeTApo, bestDelay, c}
 */
function fcPredict(f) {
  const c = flCtx(f);
  if (!c) return null;
  const R = simulate(c.D, c.L, c.m, c.mb, { noRef: true });
  if (R.st.error) return null;
  let F = R.st;
  if ((c.D.deployMode || "apogee") === "motor") {
    const r2 = simulate({ ...c.D, ejDelay: 120 }, c.L, c.m, c.mb, { noRef: true });
    if (!r2.st.error) F = r2.st;
  }
  return { R, c, ev: fcPredEvents(R), free: F.maxAlt, freeTApo: F.tApo, bestDelay: F.tApo - R.st.tb };
}
/**
 * What was measured, from the flight's altimeter file, its display readings, or its apogee and top speed.
 * @param {object} f flight
 * @returns {object} as fcPredEvents, with src ("file", "readings", "apogee") and the file's curve and brand
 */
function fcMeasured(f) {
  const A = flAltis(f)[0] || null,
    Rd = f.readings && f.readings.alt ? f.readings : null,
    M = { src: A ? "file" : Rd ? "readings" : "apogee" };
  if (A) {
    const ev = A.ev || {};
    Object.assign(M, {
      brand: A.brand,
      burn: ev.burn,
      burnEst: ev.burnEst,
      vmax: A.vmax,
      vDer: A.vDer,
      tApo: A.tApo,
      apo: A.apo,
      tEj: ev.drogue,
      ejEst: ev.drogueEst,
      ejAlt: ev.drogueAlt,
      tMain: ev.main,
      mainEst: ev.mainEst,
      mainAlt: ev.mainAlt,
      descHigh: A.rateHigh,
      descLow: A.rateLow,
      dur: A.tLand,
      curve: A.curve,
    });
    if (M.tEj != null && M.tApo != null) M.ap2e = M.tEj - M.tApo;
  } else if (Rd) {
    M.alti = altimeterById(Rd.alt);
    for (const k of ["apo", "vmax", "thrust", "peakG", "avgG", "tApo", "coast", "ap2e", "ejAlt", "mainAlt", "dur"])
      if (Rd[k] != null && isFinite(Rd[k])) M[k] = Rd[k];
    if (Rd.desc != null) M.descLow = Rd.desc;
  } else {
    M.apo = f.apo;
    M.vmax = f.vmax;
  }
  if (!(M.apo > 0) && f.apo > 0) M.apo = f.apo;
  return M;
}
/**
 * Opens Flight vs prediction for a flight.
 * @param {object} f the flight
 * @param {boolean} [draft] not saved yet (from an imported file): offers Save to Flight Log
 */
export function fcOpen(f, draft) {
  const P = fcPredict(f);
  fcNow = { f, draft: !!draft, P, M: fcMeasured(f), view: "alt" };
  // shown first: the chart is sized from the window, which has no size while hidden
  document.getElementById("cmpmodal").hidden = false;
  fcRender();
  document.getElementById("cmpbody").scrollTop = 0;
}
/**
 * A difference: percent of the measured value, or seconds, with its colour.
 * @param {number} p predicted
 * @param {number} m measured
 * @param {string} kind "pct" or "s"
 * @returns {string} html
 */
function fcDiff(p, m, kind) {
  if (p == null || m == null || !isFinite(p) || !isFinite(m)) return "—";
  if (kind === "s") {
    const d = p - m,
      a = Math.abs(d);
    return `<b class="${a <= 0.5 ? "good" : a <= 1.5 ? "warn" : "bad"}">${a < 0.05 ? "" : d > 0 ? "+" : "−"}${a.toFixed(1)} s</b>`;
  }
  if (!m) return "—";
  const e = (100 * (p - m)) / Math.abs(m),
    a = Math.abs(e);
  return `<b class="${a <= 5 ? "good" : a <= 10 ? "warn" : "bad"}">${a < 0.05 ? "" : e > 0 ? "+" : "−"}${a.toFixed(1)}%</b>`;
}
/**
 * Draws Flight vs prediction.
 */
function fcRender() {
  const { f, P, M } = fcNow,
    au = uname("alt"),
    su = uname("speed"),
    A = (v) => (v != null && isFinite(v) ? `${fmt(v, "alt")} ${au}` : "—"),
    V = (v) => (v != null && isFinite(v) ? `${fmt(v, "speed")} ${su}` : "—"),
    S = (v) => (v != null && isFinite(v) ? `${v.toFixed(1)} s` : "—"),
    Gs = (v) => (v != null && isFinite(v) ? `${v.toFixed(1)} g` : "—");
  document.getElementById("cmpsub").textContent = [
    f.motor ? `${f.motor}${f.delay ? `, ${f.delay} delay` : ""}` : "",
    flDate(f.date) || "",
    M.src === "file" ? M.brand || "" : M.src === "readings" ? altimeterName(M.alti) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const body = document.getElementById("cmpbody");
  if (!P) {
    body.innerHTML = `<p class="note">This device doesn't have this flight's motor${f.motor ? ` (${esc(f.motor)})` : ""}, so the flight can't be flown again to compare. Upload the motor on the Motor tab, then edit the flight and choose it.</p>`;
    fcButtons();
    return;
  }
  const E = P.ev,
    early = M.ap2e != null && M.ap2e < -0.3,
    late = M.ap2e != null && M.ap2e > 1.5,
    alti = M.alti || null,
    lim = alti ? altAtLimit(alti, M.peakG, E.peakG) : false,
    hasCurve = M.src === "file" && M.curve && M.curve.t && M.curve.t.length > 4;
  let h = "";
  if (hasCurve)
    h += `<div class="cmpseg" role="tablist">${[
      ["alt", "Altitude"],
      ["speed", "Speed"],
      ["all", "Whole flight"],
    ]
      .map(
        ([k, l]) =>
          `<button type="button" role="tab" data-v="${k}" aria-selected="${fcNow.view === k}"${fcNow.view === k ? ' class="on"' : ""}>${l}</button>`,
      )
      .join("")}</div>
    <div class="legend cmpleg"><span style="--c:${css("--ink")}">Altimeter</span><span class="dash" style="--c:${css("--accent")}">Predicted</span><span class="sym">▲ burnout ◆ charge ● apogee</span></div>
    <canvas id="cmpcv" aria-label="The altimeter's curve and the prediction, with the events marked"></canvas>`;
  if (early) {
    const delayKnown = isFinite(parseFloat(f.delay));
    h += `<div class="cmpban warn"><b>The charge fired before apogee.</b>It fired ${Math.abs(M.ap2e).toFixed(1)} s before the highest point${M.ejAlt != null ? `, at ${A(M.ejAlt)}` : ""}, while the rocket was still climbing, so the highest point isn't a full apogee${delayKnown ? "" : "; enter the delay flown so the prediction fires its charge at the same time"}. On a full coast the prediction is ${A(P.free)}; the best delay was about ${Math.max(0, Math.round(P.bestDelay))} s.</div>`;
  } else if (late)
    h += `<div class="cmpban info"><b>The charge fired ${M.ap2e.toFixed(1)} s after apogee.</b>The rocket was falling by then, which is harder on the recovery; the best delay was about ${Math.max(0, Math.round(P.bestDelay))} s.</div>`;
  if (lim)
    h += `<div class="cmpban warn"><b>Peak acceleration is at the altimeter's limit.</b>The ${esc(altimeterName(alti))} reads up to about ${alti.accG} g${E.peakG > alti.accG ? ` and this flight pulls about ${E.peakG.toFixed(0)} g, so its top speed and accelerations read low` : `; it read ${M.peakG} g, so its top speed and accelerations may read low`}. They're kept with the flight but not compared.</div>`;
  if (M.ejEst || M.burnEst || M.mainEst)
    h += `<p class="note cmpnote">≈ marks an event worked out from the altitude curve; the file doesn't flag it.</p>`;
  // the table: each reading the flight has, against the prediction
  const rows = [];
  const row = (label, meas, pred, diff, off) => rows.push({ label, meas, pred, diff: off ? off : diff, ng: !!off });
  const ap = early ? "Highest point" : "Apogee";
  if (M.burn != null) row("Burnout", (M.burnEst ? "≈" : "") + S(M.burn), S(E.burn), fcDiff(E.burn, M.burn, "s"));
  if (M.thrust != null) row("Thrust time", S(M.thrust), S(E.thrust), fcDiff(E.thrust, M.thrust, "s"));
  if (M.vmax > 0)
    row(
      "Top speed",
      V(M.vmax) + (M.vDer ? "<small>from altitude</small>" : ""),
      V(E.vmax),
      fcDiff(E.vmax, M.vmax),
      lim ? "limit" : "",
    );
  if (M.peakG != null) row("Peak accel.", Gs(M.peakG), Gs(E.peakG), fcDiff(E.peakG, M.peakG), lim ? "limit" : "");
  if (M.avgG != null) row("Average accel.", Gs(M.avgG), Gs(E.avgG), fcDiff(E.avgG, M.avgG), lim ? "limit" : "");
  if (M.coast != null) row("Coast to apogee", S(M.coast), S(E.coast), fcDiff(E.coast, M.coast, "s"));
  if (M.tEj != null || M.ejAlt != null || M.ap2e != null)
    row(
      "Charge",
      [
        M.tEj != null
          ? (M.ejEst ? "≈" : "") + S(M.tEj)
          : M.ap2e != null
            ? `${M.ap2e > 0 ? "+" : M.ap2e < 0 ? "−" : ""}${Math.abs(M.ap2e).toFixed(1)} s`
            : "",
        M.ejAlt != null ? A(M.ejAlt) : "",
      ]
        .filter(Boolean)
        .join("<br>"),
      [
        M.tEj != null
          ? S(E.tEj)
          : E.ap2e != null
            ? `${E.ap2e > 0 ? "+" : E.ap2e < 0 ? "−" : ""}${Math.abs(E.ap2e).toFixed(1)} s`
            : "—",
        M.ejAlt != null ? A(E.ejAlt) : "",
      ]
        .filter(Boolean)
        .join("<br>"),
      [
        M.tEj != null ? fcDiff(E.tEj, M.tEj, "s") : M.ap2e != null ? fcDiff(E.ap2e, M.ap2e, "s") : "",
        M.ejAlt != null ? fcDiff(E.ejAlt, M.ejAlt) : "",
      ]
        .filter(Boolean)
        .join("<br>"),
    );
  if (M.apo > 0)
    row(
      ap,
      (M.tApo != null ? S(M.tApo) + "<br>" : "") + A(M.apo),
      (M.tApo != null ? S(E.tApo) + "<br>" : "") + A(E.apo),
      (M.tApo != null ? fcDiff(E.tApo, M.tApo, "s") + "<br>" : "") + fcDiff(E.apo, M.apo),
    );
  if (M.mainAlt != null)
    row(
      "Main",
      (M.tMain != null ? (M.mainEst ? "≈" : "") + S(M.tMain) + "<br>" : "") + A(M.mainAlt),
      (M.tMain != null ? S(E.tMain) + "<br>" : "") + A(E.mainAlt),
      (M.tMain != null ? fcDiff(E.tMain, M.tMain, "s") + "<br>" : "") + fcDiff(E.mainAlt, M.mainAlt),
    );
  if (M.descHigh != null && M.descLow == null)
    row("Descent", V(M.descHigh), V(E.descHigh), fcDiff(E.descHigh, M.descHigh));
  if (M.descLow != null) row("Descent", V(M.descLow), V(E.descLow), fcDiff(E.descLow, M.descLow));
  if (M.dur != null)
    row(M.src === "file" ? "Landing" : "Flight duration", S(M.dur), S(E.dur), fcDiff(E.dur, M.dur, "s"));
  else if (M.src === "file") row("Landing", "after the log ends", S(E.dur), "—", "—");
  h += `<table class="cmpt"><thead><tr><th>Event</th><th>${M.src === "file" ? "Altimeter" : "Flight"}</th><th>Predicted</th><th>Diff</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr${r.ng ? ' class="ng"' : ""}><td>${r.label}</td><td>${r.meas}</td><td>${r.pred}</td><td>${r.diff}</td></tr>`,
    )
    .join("")}</tbody></table>`;
  h += `<div class="cmpban info" id="cmpmodel"><b>What this says about the model.</b>${fcReading(M, E, lim, early)}</div>`;
  body.innerHTML = h;
  body.querySelectorAll(".cmpseg [data-v]").forEach(
    (b) =>
      (b.onclick = () => {
        fcNow.view = b.dataset.v;
        fcRender();
      }),
  );
  if (hasCurve) fcDraw();
  fcButtons();
  fcCalNote();
}
/**
 * What the differences point at: the boost (motor and weight) first, then the coast (drag).
 * @param {object} M measured
 * @param {object} E predicted
 * @param {boolean} lim the altimeter's acceleration readings are at its limit
 * @param {boolean} early the charge fired before apogee
 * @returns {string} html
 */
function fcReading(M, E, lim, early) {
  const vErr = M.vmax > 0 && !lim && !M.vDer ? (E.vmax - M.vmax) / M.vmax : null,
    p = (x) => `${Math.abs(x * 100).toFixed(1)}%`,
    cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  // with a charge before apogee, the clean coast ends at the charge: compare there
  const useEj = early && M.ejAlt > 0 && E.ejAlt > 0,
    aErr = useEj ? (E.ejAlt - M.ejAlt) / M.ejAlt : M.apo > 0 ? (E.apo - M.apo) / M.apo : null,
    where = useEj ? "the height where the charge fired" : early ? "the highest point" : "the apogee";
  if (aErr == null) return "There's no apogee to compare.";
  if (vErr != null && Math.abs(vErr) > 0.05)
    return `The top speed is ${p(vErr)} ${vErr > 0 ? "higher" : "lower"} than the altimeter's. Drag hardly changes the boost, so look at the weight (weigh the rocket and enter it with the flight) or the motor first.`;
  const boost =
    vErr != null ? `The boost matches (top speed within ${p(vErr)}), so the motor and weight look right; ` : "";
  const how = useEj
    ? " The coast is compared up to the charge, where it ends cleanly; after it, the height depends on how the rocket came apart."
    : early
      ? " After an early charge the height depends on how the rocket came apart, so this says little about the drag."
      : "";
  if (Math.abs(aErr) <= 0.03) return cap(`${boost}the prediction is within ${p(aErr)} at ${where}.${how}`);
  return cap(
    `${boost}the prediction is ${p(aErr)} ${aErr > 0 ? "high" : "low"} at ${where}${
      early && !useEj
        ? "."
        : aErr > 0
          ? ", so the coast loses more height than predicted, which points at more drag than estimated (finish, rail buttons, fin edges)."
          : ", so the coast keeps more height than predicted, which points at less drag than estimated."
    }${how}${early ? "" : '<span id="cmpk"></span>'}`,
  );
}
/**
 * Adds the drag multiplier a calibration to this flight would use (worked out after the screen is drawn).
 */
function fcCalNote() {
  const el = document.getElementById("cmpk"),
    { P, M } = fcNow;
  if (!el || !P || !(M.apo > 0)) return;
  const me = fcNow;
  setTimeout(() => {
    if (fcNow !== me || !el.isConnected) return;
    const r = solveDragScale(M.apo, P.c);
    if (r.k) el.textContent = ` Calibrating to this flight would scale the drag by about ×${r.k.toFixed(2)}.`;
  }, 30);
}
/**
 * The buttons: Save to Flight Log for a flight not saved yet, or Use for calibration for a saved one.
 */
function fcButtons() {
  const { f, draft, P } = fcNow,
    b = document.getElementById("cmpbtns");
  b.innerHTML = draft
    ? `<button class="btn" type="button" data-c="save">Save to Flight Log</button><button class="btn ghost" type="button" data-c="edit">Edit details</button><button class="btn ghost" type="button" data-c="close">Cancel</button>`
    : `${P && f.apo > 0 ? `<button class="btn ghost" type="button" data-c="cal">${f.cal ? "Stop using for calibration" : "Calibrate drag"}</button>` : ""}<button class="btn ghost" type="button" data-c="edit">Edit</button><button class="btn" type="button" data-c="close">Close</button>`;
  b.querySelectorAll("[data-c]").forEach((x) => (x.onclick = () => fcAct(x.dataset.c)));
}
/**
 * A button on Flight vs prediction.
 * @param {string} what save, edit, cal or close
 */
function fcAct(what) {
  const { f } = fcNow;
  if (what === "close") return fcClose();
  if (what === "edit") {
    fcClose();
    flOpen(f);
    return;
  }
  if (what === "save") {
    const saved = flSaveFlight({ ...f });
    if (saved) {
      fcNow.f = saved;
      fcNow.draft = false;
      fcButtons();
    }
    return;
  }
  if (what === "cal") {
    const on = !f.cal;
    flPut(flList().map((x) => (x.id === f.id ? { ...x, cal: on } : x)));
    fcNow.f = { ...f, cal: on };
    fcButtons();
    flFit();
  }
}
/**
 * Closes Flight vs prediction.
 */
function fcClose() {
  document.getElementById("cmpmodal").hidden = true;
  fcNow = null;
}
/**
 * Draws the curves: the altimeter's (solid) and the prediction's (dashed), with burnout, the charge and apogee marked on
 * both.
 */
function fcDraw() {
  const cv = document.getElementById("cmpcv");
  if (!cv) return;
  const { c, W, H } = setupCanvas(cv),
    { M, P, view } = fcNow,
    C = M.curve,
    o = P.R.out,
    E = P.ev,
    speed = view === "speed",
    tEnd =
      view === "all"
        ? Math.max(C.t[C.t.length - 1], E.dur || 0)
        : Math.max(M.tApo || 0, E.tApo || 0, M.tEj || 0, E.tEj || 0) * 1.12 + 1;
  const mv = C.v
    ? C.v
    : C.t.map((t, i) => {
        const a = Math.max(0, i - 2),
          b = Math.min(C.t.length - 1, i + 2);
        return (C.h[b] - C.h[a]) / (C.t[b] - C.t[a] || 1);
      });
  const yM = speed ? mv : C.h,
    yP = speed ? o.vel : o.alt;
  let yMax = 0,
    yMin = 0;
  C.t.forEach((t, i) => {
    if (t <= tEnd && isFinite(yM[i])) {
      yMax = Math.max(yMax, yM[i]);
      yMin = Math.min(yMin, yM[i]);
    }
  });
  o.t.forEach((t, i) => {
    if (t <= tEnd) {
      yMax = Math.max(yMax, yP[i]);
      yMin = Math.min(yMin, yP[i]);
    }
  });
  const dim = speed ? "speed" : "alt",
    padL = 44,
    padR = 10,
    padT = 10,
    padB = 22;
  yMax *= 1.06;
  if (speed) yMin *= 1.06;
  const X = (t) => padL + (Math.max(0, t) / tEnd) * (W - padL - padR),
    Y = (v) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - padT - padB);
  c.clearRect(0, 0, W, H);
  c.font = "10px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  c.fillStyle = css("--muted");
  c.strokeStyle = css("--grid");
  c.lineWidth = 1;
  niceTicks(toDisp(yMin, dim), toDisp(yMax, dim), 4).forEach((v) => {
    const y = Y(fromDisp(v, dim));
    if (y < padT - 1 || y > H - padB + 1) return;
    c.beginPath();
    c.moveTo(padL, y);
    c.lineTo(W - padR, y);
    c.stroke();
    c.textAlign = "right";
    c.textBaseline = "middle";
    c.fillText(Math.abs(v) >= 1000 ? v / 1000 + "k" : String(v), padL - 5, y);
  });
  c.textAlign = "center";
  c.textBaseline = "top";
  niceTicks(0, tEnd, 5).forEach((t) => {
    if (t <= tEnd) c.fillText(String(t), X(t), H - padB + 5);
  });
  const line = (ts, ys, col, dash) => {
    c.strokeStyle = col;
    c.lineWidth = 1.8;
    c.setLineDash(dash ? [5, 4] : []);
    c.beginPath();
    let on = false;
    ts.forEach((t, i) => {
      if (t > tEnd || !isFinite(ys[i])) return;
      if (on) c.lineTo(X(t), Y(ys[i]));
      else {
        c.moveTo(X(t), Y(ys[i]));
        on = true;
      }
    });
    c.stroke();
    c.setLineDash([]);
  };
  line(o.t, yP, css("--accent"), true);
  line(C.t, yM, css("--ink"), false);
  // the events, on each curve
  const at = (ts, ys, t) => {
    let i = 1;
    while (i < ts.length - 1 && ts[i] < t) i++;
    const a = ts[i - 1],
      b = ts[i];
    return ys[i - 1] + ((ys[i] - ys[i - 1]) * (t - a)) / (b - a || 1);
  };
  const mark = (t, v, col, shape) => {
    if (t == null || !isFinite(t) || t > tEnd || !isFinite(v)) return;
    const x = X(t),
      y = Y(v);
    c.fillStyle = col;
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.beginPath();
    if (shape === "tri") {
      c.moveTo(x, y - 6);
      c.lineTo(x + 6, y + 5);
      c.lineTo(x - 6, y + 5);
      c.closePath();
      c.fill();
    } else if (shape === "dia") {
      c.moveTo(x, y - 6);
      c.lineTo(x + 6, y);
      c.lineTo(x, y + 6);
      c.lineTo(x - 6, y);
      c.closePath();
      c.fillStyle = css("--panel");
      c.fill();
      c.stroke();
    } else {
      c.arc(x, y, 4.5, 0, 2 * Math.PI);
      c.fill();
    }
  };
  const ink = css("--ink"),
    acc = css("--accent");
  mark(E.burn, at(o.t, yP, E.burn), acc, "tri");
  mark(E.tEj, at(o.t, yP, E.tEj), acc, "dia");
  mark(E.tApo, at(o.t, yP, E.tApo), acc, "dot");
  mark(M.burn, at(C.t, yM, M.burn), ink, "tri");
  mark(M.tEj, at(C.t, yM, M.tEj), ink, "dia");
  mark(M.tApo, at(C.t, yM, M.tApo), ink, "dot");
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  const m = document.getElementById("cmpmodal");
  m.addEventListener("click", (e) => {
    if (e.target === m) fcClose();
  });
  m.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fcClose();
  });
  window.addEventListener("resize", () => {
    if (fcNow && !m.hidden && document.getElementById("cmpcv")) fcDraw();
  });
}
