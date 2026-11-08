/**
 * Undo and redo for the rocket builder: a snapshot of the parts before each change (typing into one field counts as
 * one change), and the Undo and Redo buttons.
 */
import { BLD, BLD_ROOT, bldApply, bldFind, bldRender, bldSave, bldSel, setBLD, setBldSel } from "./builder-ui.js";
import { mountFilter, renderMotors } from "../ui/motor-tab.js";
/* undo and redo for builder changes: a snapshot before each change; typing into one field counts as one change */
/**
 * Undo history: snapshots before each change (typing into one field counts as one change).
 */
const BLD_UNDO = { ref: null, cur: null, past: [], future: [], t: 0, key: null, max: 40 };
/**
 * A snapshot of the builder model (without the ejection charge settings).
 */
const bldSnap = () => JSON.stringify(BLD, (k, v) => (k === "bp" ? undefined : v));
/**
 * Starts a fresh history when another design is opened.
 */
export function bldHistSync() {
  if (!BLD) return;
  if (BLD_UNDO.ref !== BLD) {
    BLD_UNDO.ref = BLD;
    BLD_UNDO.cur = bldSnap();
    BLD_UNDO.past = [];
    BLD_UNDO.future = [];
    BLD_UNDO.key = null;
  }
}
/**
 * Records a change in the history (typing in the same field within a moment joins the last change).
 * @param {boolean} full the change is complete (not mid-typing)
 */
export function bldHistNote(full) {
  if (!BLD) return;
  if (BLD_UNDO.ref !== BLD) {
    bldHistSync();
    return;
  }
  const now = bldSnap();
  if (now === BLD_UNDO.cur) return;
  const t = Date.now(),
    same = !full && BLD_UNDO.key === bldSel && t - BLD_UNDO.t < 1200 && BLD_UNDO.past.length;
  if (!same) {
    BLD_UNDO.past.push(BLD_UNDO.cur);
    if (BLD_UNDO.past.length > BLD_UNDO.max) BLD_UNDO.past.shift();
  }
  BLD_UNDO.cur = now;
  BLD_UNDO.future = [];
  BLD_UNDO.t = t;
  BLD_UNDO.key = full ? null : bldSel;
  bldUndoUI();
}
/**
 * Undo (-1) or redo (+1).
 * @param {number} dir
 */
export function bldUndoStep(dir) {
  bldHistSync();
  const from = dir < 0 ? BLD_UNDO.past : BLD_UNDO.future,
    to = dir < 0 ? BLD_UNDO.future : BLD_UNDO.past;
  if (!from.length) return;
  to.push(BLD_UNDO.cur);
  BLD_UNDO.cur = from.pop();
  {
    const keep = BLD.bp;
    setBLD(JSON.parse(BLD_UNDO.cur));
    if (keep) BLD.bp = keep;
  }
  BLD_UNDO.ref = BLD;
  BLD_UNDO.key = null;
  if (!bldSel || !bldFind(bldSel)) setBldSel(BLD_ROOT);
  bldSave();
  bldApply();
  bldRender();
  if (typeof renderMotors === "function") {
    mountFilter();
    renderMotors();
  }
}
/**
 * Enables the Undo and Redo buttons when there's something to undo or redo.
 */
export function bldUndoUI() {
  const u = document.getElementById("bldundo"),
    r = document.getElementById("bldredo");
  if (!u) return;
  u.disabled = !(BLD && BLD_UNDO.ref === BLD && BLD_UNDO.past.length);
  r.disabled = !(BLD && BLD_UNDO.ref === BLD && BLD_UNDO.future.length);
}
