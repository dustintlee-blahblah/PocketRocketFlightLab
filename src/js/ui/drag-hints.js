/**
 * Drag hints (see the note below): what in the open design usually makes its predicted drag too low.
 */
import { BLD, bldChanged } from "../builder/builder-ui.js";
import { BLD_FINISH, bldLen, bldNew } from "../builder/model.js";
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import { flKey } from "../flightlog/flight-log.js";
import { aero, cdParts } from "../physics/aerodynamics.js";
import { atmosphere } from "../physics/atmosphere.js";
import { lastSim, runAll } from "./results.js";
/* ---------- drag hints ----------
   Shown under the results when the design has a polished (or smoother) finish, or no rail buttons or launch lug.
   Measured flights of ordinary hobby rockets whose files were set up that way came out 4–20% below the predicted
   apogee (VALIDATION.md, the weighed and logged flights): the model was not wrong so much as told the rocket was
   smoother and cleaner than it was. Each hint says what the change is worth on this flight and makes it in one tap;
   "Keep" hides it for this design. */
/**
 * The storage key of the hints turned off, by design.
 */
const HINT_STORE = "rfs-draghints";
/**
 * The open design's hints that have been turned off.
 * @returns {object} {finish?:true, guides?:true}
 */
function hintsOff() {
  return (store.get(HINT_STORE, {}) || {})[flKey()] || {};
}
/**
 * Turns one of the open design's hints off.
 * @param {string} which "finish" or "guides"
 */
function hintOff(which) {
  const m = store.get(HINT_STORE, {}) || {},
    k = flKey();
  m[k] = { ...(m[k] || {}), [which]: true };
  store.set(HINT_STORE, m);
}
/**
 * The drag coefficient of the last run's design at most of its top speed, with a change made to it.
 * @param {object} ch fields to change in the design
 * @returns {number}
 */
function hintCd(ch) {
  const { D: Dd, L: Ld, st } = lastSim,
    atm = atmosphere(Ld, Math.max(st.burnAlt || 0, 0));
  return cdParts(aero({ ...Dd, ...ch }), Math.max(0.8 * st.maxV, 5), atm).cd;
}
/**
 * The hints for the last run: [id, text, [button label, action][]].
 * @returns {Array[]}
 */
function dragHints() {
  if (!lastSim || lastSim.st.error || !BLD || !(lastSim.st.maxV > 0)) return [];
  const Dd = lastSim.D,
    off = hintsOff(),
    out = [],
    pct = (x) => `${x >= 0.095 ? Math.round(x * 100) : (x * 100).toFixed(1)}%`;
  try {
    if (!off.finish && Dd.finish <= 2.5e-6) {
      const rough = (r) => ({ finish: r, finFinish: r, ...(Dd.bFinFinish != null ? { bFinFinish: r } : {}) }),
        c0 = hintCd({}),
        p20 = hintCd(rough(20e-6)) / c0 - 1,
        p60 = hintCd(rough(60e-6)) / c0 - 1;
      // a slow rocket's drag doesn't depend on its finish: nothing to say
      if (p60 >= 0.02)
        out.push([
          "finish",
          `The finish is set to polished or smoother. A painted rocket is rougher, and at this flight's speed that counts: regular paint (60 µm, the usual choice for a painted rocket) gives ${pct(p60)} more drag; smooth paint (20 µm, glossy and wet-sanded) ${p20 < 0.005 ? "about the same as polished" : pct(p20) + " more"}. Choose the one the rocket really has.`,
          [
            ["Regular paint", () => hintFinish("normal")],
            ["Smooth paint", () => hintFinish("smooth")],
            ["Keep polished", () => hintKeep("finish")],
          ],
        ]);
    }
    if (!off.guides && Dd.railPreset === "none" && !lastSim.st.staged) {
      const small = 2 * aero(Dd).R < 0.04,
        p = small ? null : hintCd({ railPreset: "1010" }) / hintCd({}) - 1;
      out.push([
        "guides",
        `This design has no rail buttons or launch lug, so their drag isn't counted${p != null && p >= 0.005 ? ` (a pair of 1010 rail buttons adds about ${pct(p)})` : ""}. Add what the rocket flies with.`,
        [
          [small ? "Add a launch lug" : "Add rail buttons", () => hintGuides(small ? "lug" : "buttons")],
          ["It has none", () => hintKeep("guides")],
        ],
      ]);
    }
  } catch (e) {}
  return out;
}
/**
 * Sets every part's finish (as the builder's "Finish for every part" does) and flies again.
 * @param {string} name finish name
 */
function hintFinish(name) {
  BLD.settings.finish = name;
  for (const st of BLD.stages)
    for (const q of st.parts) {
      delete q.finish;
      for (const c of q.kids || []) delete c.finish;
    }
  bldChanged(true);
  runAll();
  prToast(`Finish set to ${(BLD_FINISH.find((f) => f[0] === name) || [0, name])[1]}`);
}
/**
 * Adds rail buttons or a launch lug to the sustainer's longest body tube and flies again.
 * @param {string} type "buttons" or "lug"
 */
function hintGuides(type) {
  const tubes = BLD.stages[0].parts.filter((q) => q.type === "tube");
  if (!tubes.length) return;
  const tube = tubes.reduce((a, b) => (bldLen(b) > bldLen(a) ? b : a)),
    k = bldNew(type, aero(lastSim.D).R);
  if (type === "buttons") k.sep = Math.min(k.sep, Math.max(0.05, bldLen(tube) - 0.08));
  tube.kids = [...(tube.kids || []), k];
  bldChanged(true);
  runAll();
  prToast(type === "buttons" ? "Rail buttons added" : "Launch lug added");
}
/**
 * Hides a hint for this design.
 * @param {string} which
 */
function hintKeep(which) {
  hintOff(which);
  renderDragHints();
}
/**
 * Draws the hints under the results.
 */
export function renderDragHints() {
  const el = document.getElementById("draghints");
  if (!el) return;
  const H = dragHints();
  el.hidden = !H.length;
  el.innerHTML = H.map(
    ([id, text, btns]) =>
      `<div class="draghint" data-hint="${id}"><p class="note">${esc(text)}</p><div class="flact">${btns.map(([lab], i) => `<button class="btn ghost" type="button" data-i="${i}">${esc(lab)}</button>`).join("")}</div></div>`,
  ).join("");
  H.forEach(([id, , btns]) =>
    el
      .querySelectorAll(`.draghint[data-hint="${id}"] button`)
      .forEach((b) => (b.onclick = () => btns[+b.dataset.i][1]())),
  );
}
