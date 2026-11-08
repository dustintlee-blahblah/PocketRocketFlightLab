/**
 * Run state: saving the design after a change, the notes that follow it (recovery, inertia, drag table), marking the
 * results out of date, and the Launch button (checks, then a run).
 */
import { BLD, bldSave } from "../builder/builder-ui.js";
import { store } from "../core/storage.js";
import { FT } from "../core/units-and-fin-edges.js";
import { curBoost, curFirst, curMotor, D, L } from "../design/defaults.js";
import { renderSavePanel, renderTitle } from "../files/unsaved-changes.js";
import { flightMotor } from "../motors/clusters.js";
import { aero, cdParts } from "../physics/aerodynamics.js";
import { atmosphere } from "../physics/atmosphere.js";
import { airInertia } from "../physics/simulate.js";
import { isThree, stackDesign } from "../physics/staging.js";
import { drawProfile } from "./charts.js";
import { supNote } from "./donate.js";
import { showTab } from "./events.js";
import { FIELDS } from "./forms.js";
import { siteRender } from "./launch-sites.js";
import { showFitWarn, showMountWarn, showRailWarn } from "./launch-warnings.js";
import { motorFit, mountTooBig, s1View } from "./motor-tab.js";
import { lastSim, renderResults, runAll, setLastSim } from "./results.js";
import { fmt, fromDisp, uname } from "./units.js";
/**
 * Called after any edit: saves the design and launch conditions, marks the results out of date and refreshes the
 * notes and panels that depend on them.
 */
export function changed() {
  store.set("rfs-design", D);
  store.set("rfs-launch", L);
  markStale();
  siteRender();
  drawProfile();
  renderDragTable();
  renderInertiaNote();
  renderRecNote();
  renderSavePanel();
}
/**
 * Writes the note that says when the first parachute opens, from the deployment setting and the motor delay.
 */
export function renderRecNote() {
  const noteEl = document.getElementById("recnote");
  if (noteEl) {
    const first = D.recovery === "single" ? "The parachute" : "The drogue",
      mode = D.deployMode || "apogee",
      delay = Math.max(0, D.deployDelay || 0);
    const when =
      mode === "motor"
        ? D.ejDelay != null
          ? `opens when the motor’s ejection charge fires, ${(+D.ejDelay).toFixed(1)} s after ${D.twoStage ? "sustainer " : ""}burnout (Motor tab, Motor Delay)`
          : "is set to open at the motor ejection charge, but the motor is plugged (Motor tab, Motor Delay)"
        : mode === "timer"
          ? `opens ${delay.toFixed(1)} s after liftoff`
          : delay > 0
            ? `opens ${delay.toFixed(1)} s after apogee`
            : "opens at apogee";
    let txt =
      `${first} ${when}.` +
      (D.recovery === "single"
        ? " Drogue settings are turned off."
        : " The main opens at the set altitude. Set the drogue diameter to 0 to free-fall until the main opens.");
    if (mode === "motor") {
      const motor = curMotor(),
        soldDelays = (motor.delays || "").replace(/,?P$/i, "");
      txt +=
        soldDelays && soldDelays !== "0"
          ? ` The ${motor.cn || motor.name} is sold with ${soldDelays} s delays${/RMS|DMS|ProX|Loki/.test(motor.sys || "") ? "; reload delays can be shortened with a drilling tool" : ""}. The Results tab shows the ideal motor delay for apogee.`
          : ` The ${motor.cn || motor.name} has no ejection delay; use an altimeter instead.`;
    }
    noteEl.textContent = txt;
  }
}
/**
 * The key your design notes are kept under: the motor configuration in use.
 * @returns {string}
 */
const designNotesKey = () => (BLD && BLD.cfg) || "default";
/**
 * Puts your notes for the motor configuration in use into the Design notes box (not while you're typing in it).
 */
function renderDesignNotes() {
  const ta = document.getElementById("dnotes");
  if (!ta || document.activeElement === ta) return;
  ta.value = (BLD && BLD.notes && BLD.notes[designNotesKey()]) || "";
}
/**
 * Writes the note under the inertia field: the value used and where it comes from.
 */
export function renderInertiaNote() {
  renderDesignNotes();
  const el = document.getElementById("inote");
  if (!el) return;
  const unit = uname("moi"),
    part = (label, I0, m0, m, len, src) =>
      I0 > 0
        ? `${label}turning inertia ${fmt(airInertia(I0, m0, m, len), "moi")} ${unit}${src === "file" ? ", calculated from the parts" : src === "typed" ? ", the value you entered" : ""}${m0 > 0 && Math.abs(m / m0 - 1) > 0.005 ? ", scaled to the weight above" : ""}.`
        : `${label}turning inertia estimated as ${fmt(airInertia(0, 0, m, len), "moi")} ${unit}, with the weight spread evenly along the airframe. Enter a measured or calculated value to replace it.`;
  el.textContent =
    part(D.twoStage ? "Sustainer " : "Airframe ", D.dryInertia, D.inertiaMass, D.dryMass, D.length, D.inertiaSource) +
    (D.twoStage ? " " + part("Booster ", D.bDryInertia, D.bInertiaMass, D.bDryMass, D.bLength, D.bInertiaSource) : "") +
    " It only affects how fast the rocket turns into the wind.";
}
/**
 * Fills the drag breakdown table (Cd and its friction, pressure and base parts at several Mach numbers).
 */
export function renderDragTable() {
  const el = document.getElementById("dragtable");
  if (!el) return;
  const A = aero(D),
    air0 = atmosphere(L, 0);
  const AS = D.twoStage ? aero(stackDesign(D)) : null;
  const rows = [0.1, 0.3, 0.5, 0.7, 0.9, 1.1, 1.5]
    .map((M) => {
      const p = cdParts(A, M * air0.a, air0);
      return `<tr><td>${M.toFixed(1)}</td><td><b>${p.cd.toFixed(3)}</b></td><td>${p.override ? "—" : p.friction.toFixed(3)}</td><td>${p.override ? "—" : p.pressure.toFixed(3)}</td><td>${p.override ? "—" : p.base.toFixed(3)}</td>${AS ? `<td>${cdParts(AS, M * air0.a, air0).cd.toFixed(3)}</td>` : ""}</tr>`;
    })
    .join("");
  const nCdo =
    (D.segments || []).filter((x) => x.cdo > 0).length +
    (D.finCdOverride > 0 ? 1 : 0) +
    (D.extraFins || []).filter((x) => x.cdo > 0).length +
    (D.railPreset === "custom" ? [...(D.buttons || []), ...(D.lugs || [])].filter((x) => x.cdo > 0).length : 0);
  const cdoNote = nCdo
    ? `<p class="note">${nCdo} part${nCdo > 1 ? "s use" : " uses"} a Cd override from the design file in place of the calculated drag.</p>`
    : "";
  el.innerHTML =
    cdoNote +
    `<table><thead><tr><th>Mach</th><th>${AS ? "Sustainer Cd" : "Cd"}</th><th>Friction</th><th>Pressure</th><th>Base</th>${AS ? "<th>Stack Cd</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>`;
}
/**
 * everRun: a run has happened this session; staleWhy: the reason shown while results are out of date.
 *
 * what changed since the last run, named for the tab it was changed on
 */
let everRun = false,
  staleWhy = "";
/**
 * Names what changed, from the tab that is showing.
 * @returns {string}
 */
function staleReason() {
  const v = (n) => !document.getElementById("v-" + n).hidden;
  return v("rocket")
    ? "The rocket changed"
    : v("motor")
      ? "The motor changed"
      : v("flight")
        ? "The launch conditions changed"
        : "Settings changed";
}
/**
 * Clears the results and shows that they are out of date, and why.
 */
export function markStale() {
  renderTitle();
  document.getElementById("runbar").classList.add("stale");
  const had = !!lastSim || everRun;
  if (lastSim || !staleWhy) staleWhy = staleReason();
  setLastSim(null);
  renderResults();
  {
    const em = document.getElementById("exportmsg");
    if (em) em.textContent = "";
  }
  document.querySelector("#runstat b").textContent = had ? staleWhy : "Not run yet";
  document.getElementById("runtime").textContent = had
    ? "Tap Launch to update the results"
    : "Set up your rocket, then tap Launch";
  document.getElementById("t-results").classList.toggle("dot", had);
  document.getElementById("flightemptytxt").textContent = had
    ? `${staleWhy} since the last run, so its results were cleared. Launch again to see the new results.`
    : "No results yet. Set up the rocket, motor and conditions, then tap Launch.";
  document.getElementById("emptylaunch").hidden = !had;
}
/**
 * Shows the results as up to date, with the motor and the time of the run.
 */
function markFresh() {
  everRun = true;
  staleWhy = "";
  document.getElementById("runbar").classList.remove("stale");
  document.getElementById("t-results").classList.remove("dot");
  document.querySelector("#runstat b").textContent = "Results up to date";
  const m = flightMotor();
  document.getElementById("runtime").textContent =
    `${D.name} on ${m.cn || m.name}, run at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
  document.querySelectorAll(".is-stale").forEach((p) => p.classList.remove("is-stale"));
  {
    const em = document.getElementById("exportmsg");
    if (em) em.textContent = "";
  }
}
/**
 * Copies the launch-condition fields into L (a field left as shown keeps its exact value), then saves.
 */
export function readFields() {
  for (const list of Object.values(FIELDS))
    for (const [k, , dim] of list) {
      const O = L,
        el = document.getElementById("f-" + k);
      if (!el || el.disabled) continue;
      // a field left as shown keeps its exact value (the box only shows a rounded copy)
      if (el.dataset.shown != null && el.value === el.dataset.shown) continue;
      if (dim === "sel") {
        O[k] = k === "clusterFail" ? el.value === "true" : isNaN(+el.value) ? el.value : +el.value;
        continue;
      }
      const v = parseFloat(el.value);
      if (!isFinite(v)) continue;
      O[k] = dim === "int" ? Math.max(1, Math.round(v)) : fromDisp(v, dim);
    }
  store.set("rfs-design", D);
  store.set("rfs-launch", L);
}
/**
 * The Launch button: reads the fields, checks the rail length, that every stage has a motor that lights and that
 * each motor fits its mount, then runs the simulation and shows the results.
 */
export function runNow() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (document.documentElement.classList.contains("nodesign")) {
    showTab("rocket");
    prToast("Open a rocket file first.");
    return;
  }
  readFields();
  // a rail this short is almost always a units mix-up; don't fly it
  if (!(L.rail >= 2.5 * FT)) {
    showRailWarn();
    return;
  }
  // a stage whose motor mounts are all set never to light can't fly
  {
    const none = [
      [D.mainOff && !(D.extraMotors || []).length, D.twoStage ? "sustainer" : "rocket"],
      [D.twoStage && D.bMainOff && !(D.bExtraMotors || []).length, "booster"],
      [isThree(D) && D.s1MainOff && !(D.s1ExtraMotors || []).length, "first stage"],
    ].find((x) => x[0]);
    if (none) {
      document.getElementById("fitwarntxt").textContent =
        `Every motor mount in the ${none[1]} is set never to light, so it has no motor to fly. In the builder, set a motor mount's Lights to At liftoff.`;
      const fixBtn = document.getElementById("fitfix");
      fixBtn.textContent = "Open the builder";
      fixBtn.onclick = () => {
        document.getElementById("fitwarn").hidden = true;
        showTab("rocket");
      };
      document.getElementById("fitwarn").hidden = false;
      fixBtn.focus();
      return;
    }
  }
  // a motor that can't physically go in the mount isn't flown
  for (const [b, stg] of [[false, "sustainer"], ...(D.twoStage ? [[true, "booster"]] : [])]) {
    const tooBig = mountTooBig(D, b);
    if (tooBig) {
      showMountWarn(tooBig, D.twoStage ? stg : null, b);
      return;
    }
  }
  for (const [mm, b, stg, Dx] of [
    [curMotor(), false, "sustainer", D],
    ...(D.twoStage ? [[curBoost(), true, "booster", D]] : []),
    ...(isThree(D) ? [[curFirst(), true, "first", s1View(D)]] : []),
  ]) {
    const fit = motorFit(mm, Dx, b);
    if (fit && fit.status === "big") {
      showFitWarn(mm, fit, D.twoStage ? stg : null);
      return;
    }
  }
  runAll();
  markFresh();
  if (typeof supNote === "function") supNote("run");
  if (document.getElementById("v-results").hidden) showTab("results");
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  {
    const ta = document.getElementById("dnotes");
    if (ta)
      ta.addEventListener("input", () => {
        if (!BLD) return;
        const k = designNotesKey(),
          n = { ...(BLD.notes || {}) };
        if (ta.value.trim()) n[k] = ta.value;
        else delete n[k];
        BLD.notes = Object.keys(n).length ? n : undefined;
        if (!BLD.notes) delete BLD.notes;
        bldSave();
        renderSavePanel();
      });
  }
  // the Launch buttons (the launch bar, and the one on the empty Results tab)
  document.getElementById("runbtn").onclick = runNow;
  document.getElementById("emptylaunch").onclick = runNow;
}
