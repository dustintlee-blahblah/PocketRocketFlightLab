/**
 * The Rocket tab's parts builder: the parts tree, the editor for the selected part, the side view of the rocket,
 * undo and redo, the New design button, and turning the parts into the flight design (see the note below).
 */
import { bldDerive } from "./derive.js";
import { bldDrawFinEdit, bldRenderAdd, bldRenderEdit, bldRenderTree } from "./editor.js";
import { bldDefault, bldMounts } from "./model.js";
import { bldDraw, bldPick, bldStatsToggle } from "./side-view.js";
import { bldHistNote, bldHistSync, bldUndoStep, bldUndoUI } from "./undo.js";
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import { allMotors, boostId, firstId, motorId, setMotorId, setMotorTarget } from "../design/defaults.js";
import { confirmUnsaved } from "../files/recent.js";
import { setSource } from "../files/save.js";
import { markClean, setActive } from "../files/unsaved-changes.js";
import { findMotor } from "../motors/clusters.js";
import { motorStats } from "../motors/motor-files.js";
import { bpRender } from "../recovery/ejection-charge.js";
import { mountFilter, renderMotors } from "../ui/motor-tab.js";
import { changed } from "../ui/state.js";
/* ---------- Rocket tab: the parts builder ----------
   The parts list (BLD) is the design. The flight code's summary (D) is worked out from it every time it
   changes, by writing the parts as an OpenRocket file and reading that back. */
/**
 * BLD: the builder model (the design's parts); bldSel: the selected part's id; bldT: the debounce timer for typing;
 * bldNewSure: when New design was last tapped.
 */
export var BLD = null,
  bldSel = null;
var bldT = null;
export const BLD_ROOT = "__rocket";
/**
 * Finds a part (or stage, or the rocket) by id, with where it sits.
 * @param {string} id
 * @returns {object|null} {p, si, pi, st, parent, ki} for a part, {stage, si} for a stage, {root} for the rocket
 */
export function bldFind(id) {
  if (id === BLD_ROOT) return { root: true };
  for (const [si, st] of BLD.stages.entries()) {
    if (st.id === id) return { stage: st, si };
    for (const [pi, p] of st.parts.entries()) {
      if (p.id === id) return { p, si, pi, st, parent: null };
      const ki = (p.kids || []).findIndex((k) => k.id === id);
      if (ki >= 0) return { p: p.kids[ki], si, pi, ki, st, parent: p };
    }
  }
  return null;
}
/**
 * Keeps the builder model on the device.
 */
export function bldSave() {
  try {
    localStorage.setItem("rfs-builder", JSON.stringify(BLD));
  } catch (e) {}
}
/**
 * Puts the motors chosen on the Motor tab into each stage's primary motor mount.
 *
 * the primary motor mount of each stage holds the motor chosen on the Motor tab
 */
export function bldSyncMotors() {
  if (!BLD) return;
  /**
   * Sets a stage's primary mount's motor, unless it's held by a choice already made there.
   */
  const put = (st, m, hold) => {
    const k = bldMounts(st)[0];
    if (!k || !m || st.noMotor) return;
    if (hold && m.id === hold) return;
    if (m.dia > k.od - 2 * (k.wall || 0) + 0.0006 && k.od > 0) return; // a motor that can't go in this mount isn't written into the design
    if (m && (!k.motor || k.motor.name !== m.name || (k.motor.mfr || "") !== (m.mfr || m.brand || "")))
      k.motor = { id: m.id, mfr: m.mfr || m.brand || "", name: m.name, dia: m.dia, len: m.len };
    else if (m && k.motor) k.motor.id = m.id;
  };
  const h = BLD.hold || [];
  // a design where only one stage has a motor mount (a payload section on top): the motor goes in that stage
  const mounted = BLD.stages.filter((st) => bldMounts(st).length && !st.noMotor);
  if (BLD.stages.length > 1 && mounted.length === 1) {
    put(mounted[0], findMotor(motorId), h[0]);
    return;
  }
  put(BLD.stages[0], findMotor(motorId), h[0]);
  // three stages: sustainer, booster (the middle one), first stage
  if (BLD.stages.length === 3 && mounted.length === 3) {
    put(BLD.stages[1], findMotor(boostId), h[1]);
    put(BLD.stages[2], findMotor(firstId), h[2]);
  } else if (BLD.stages.length > 1) put(BLD.stages[BLD.stages.length - 1], findMotor(boostId), h[1]);
}
/**
 * bldDerive, with any error shown in the builder.
 */
export function bldApply() {
  try {
    bldDerive();
    document.getElementById("bldmsg").innerHTML = "";
  } catch (e) {
    document.getElementById("bldmsg").innerHTML = `<div class="report err">${esc(e.message || String(e))}</div>`;
  }
  changed();
}
/**
 * After a builder edit: saves, records history, and (for a complete change) rebuilds the design and redraws.
 * @param {boolean} full
 */
export function bldChanged(full) {
  bldSave();
  bldHistNote(full);
  if (full) {
    bldApply();
    bldRender();
  } else {
    bldDrawFinEdit();
    clearTimeout(bldT);
    bldT = setTimeout(() => {
      bldApply();
      bldRenderTree();
    }, 140);
  }
}
/**
 * Redraws the whole builder: tree, add buttons, editor, side view and undo state.
 */
export function bldRender() {
  try {
    bpRender();
  } catch (e) {}
  if (!BLD) return;
  bldSyncMotors();
  bldHistSync();
  bldUndoUI();
  bldRenderTree();
  bldRenderAdd();
  bldRenderEdit();
  bldDraw();
}
/**
 * Starts a new design from scratch: a basic flyable rocket with a 29 mm motor.
 *
 * a new design from scratch: a basic flyable rocket to change
 */
export function bldNewDesign() {
  BLD = bldDefault();
  bldSel = BLD.stages[0].parts[0].id;
  const fit = allMotors()
    .filter((m) => Math.abs(m.dia - 0.029) < 0.0008)
    .sort((a, b) => Math.abs(motorStats(a).I - 120) - Math.abs(motorStats(b).I - 120))[0];
  if (fit) {
    setMotorId(fit.id);
    store.set("rfs-motor", motorId);
  }
  setSource(null);
  bldSave();
  bldDerive();
  // a new design has no file yet: Save changes must not write into the file opened before
  try {
    const A = window.PocketRocketApp;
    if (A && A.clearSource) A.clearSource();
  } catch (_) {}
  document.getElementById("orkreport").innerHTML =
    `<div class="report">Started a new design from a basic rocket: nose cone, body tube, three fins, a 29 mm motor mount and a parachute. Select any part below to change it, or add parts to it.</div>`;
  setActive(true);
  markClean();
  bldRender();
  changed();
  if (typeof renderMotors === "function") {
    setMotorTarget("sustainer");
    mountFilter();
    renderMotors();
  }
}

/**
 * Sets BLD (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setBLD(v) {
  return (BLD = v);
}
/**
 * Sets bldSel (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setBldSel(v) {
  return (bldSel = v);
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || (e.key.toLowerCase() !== "z" && e.key.toLowerCase() !== "y")) return;
    const tg = e.target && e.target.tagName;
    if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT") return;
    if (document.getElementById("v-rocket").hidden || !BLD) return;
    e.preventDefault();
    bldUndoStep(e.key.toLowerCase() === "y" || e.shiftKey ? 1 : -1);
  });
  document.getElementById("bldcv").addEventListener("click", bldPick);
  document.getElementById("bldstats").addEventListener("click", bldStatsToggle);
  document.getElementById("bldstats").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      bldStatsToggle();
    }
  });
  window.addEventListener("resize", () => {
    if (BLD) {
      bldDraw();
      bldDrawFinEdit();
    }
  });
  // the Rocket tab's New design, Undo and Redo buttons
  document.getElementById("handdesign").onclick = bldNewDesign;
  document.getElementById("bldundo").onclick = () => bldUndoStep(-1);
  document.getElementById("bldredo").onclick = () => bldUndoStep(1);
  document.getElementById("newdesign").onclick = () => {
    // starting over closes the open design: offer to save its changes first
    confirmUnsaved(() => {
      document.getElementById("savemsg").innerHTML = "";
      bldNewDesign();
      window.scrollTo({ top: 0 });
    }, "starting a new design");
  };
}
