import { BLD, bldChanged, bldRender } from "../builder/builder-ui.js";
import { esc } from "../core/helpers.js";
import { D } from "../design/defaults.js";
import { dragPhases, flownProfiles, parseDragProfile } from "../files/drag-profile.js";
import { profileAtSeaLevel, profileLength } from "../physics/aerodynamics.js";
import { stackDesign, stackDesign3 } from "../physics/staging.js";
import { lastSim } from "./results.js";
import { fmt, fromDisp, uname } from "./units.js";
/*
 * Imported drag profile: the block in the builder's Whole Rocket editor, under the drag coefficients, for bringing in
 * a Cd-against-Mach curve from RASAero II, OpenRocket or a table (files/drag-profile.js), flying with it or not, and
 * taking it off again; and the Results tab's line saying a flight used one. The Wind Tunnel charts it beside the
 * app's own model. The profile lives in the builder's settings and is saved with the design file.
 */

/**
 * The open design's imported profile for one of the airframes it flies as, or null.
 * @param {number} [slot] 1 the rocket (a staged rocket's sustainer alone), 2 with its booster, 3 all three stages
 * @returns {object|null}
 */
function profileNow(slot = 1) {
  return (BLD && BLD.settings && BLD.settings["cdCurve" + (slot > 1 ? slot : "")]) || null;
}
/**
 * The imported profile one of the open design's airframes flies on, or null: there is one, Fly with this profile is
 * ticked, and the rocket has that airframe.
 * @param {number} [slot]
 * @returns {object|null}
 */
export function dragProfileFlown(slot = 1) {
  const c = profileNow(slot);
  return c && c.use !== false && BLD.stages.length >= slot ? c : null;
}
/**
 * The length of one of the open design's airframes.
 * @param {number} slot
 * @returns {number} m, 0 when the design has no such airframe
 */
function slotLength(slot) {
  try {
    if (slot === 1) return D.length || 0;
    if (!D.twoStage) return 0;
    return (slot === 2 ? stackDesign(D) : stackDesign3(D)).length || 0;
  } catch (e) {
    return 0;
  }
}
/**
 * The imported center of pressure and normal force one of the open design's airframes flies on, or null.
 * @param {number} [slot]
 * @returns {object|null} the profile
 */
export function stabProfileFlown(slot = 1) {
  const c = profileNow(slot);
  return c && c.stab === true && c.cp && BLD.stages.length >= slot ? c : null;
}
/** What went wrong with the last file tried for each airframe, shown in its block until the next try. */
const dragErr = {};
/** The block's help. */
const DRAG_INFO =
  "Fly the rocket on another program&rsquo;s drag in place of this app&rsquo;s own, and compare the two. Bring in the whole rocket&rsquo;s drag coefficient (Cd) against Mach number from: RASAero II (Aero Plots, then File, Export, To CSV File): its coasting and motor-burning curves at zero angle of attack. OpenRocket (a simulation&rsquo;s exported data with the Mach number and Drag coefficient columns; include Time, Altitude, Thrust and Angle of attack if you can): the drag over that flight&rsquo;s ascent, so it only reaches that flight&rsquo;s top speed. A CFD run or a spreadsheet: a text or CSV table with a Mach number column and a Cd column, and a third column for Cd with the motor burning if you have it. With Fly with this profile ticked, every flight uses the imported curve: straight lines between its points, and its first or last value outside the Mach numbers it covers. The Wind Tunnel&rsquo;s Drag coefficient chart shows it beside this app&rsquo;s own model either way. A profile&rsquo;s Cd is on a reference area: RASAero II and OpenRocket use the body&rsquo;s largest cross-section, as this app does. For a CFD table on another area, enter its reference diameter. The profile is saved with the design file. It is the other program&rsquo;s answer for one condition (RASAero II&rsquo;s export is in sea-level air), so on its own it does not follow the air getting thinner with height the way this app&rsquo;s own model does. Adjust its drag for altitude (offered for a RASAero II file, whose Reynolds numbers say what air and what length of rocket it is for) adds this app&rsquo;s own skin friction in the air the rocket is flying through, less the same in sea-level air: the part of the drag that changes with height. It is off to start with: it has not yet been checked against a high-altitude flight worked out in RASAero II. A RASAero II file also carries the center of pressure and the normal force against Mach number. Tick Use its center of pressure and normal force to fly, and to show stability, on those in place of this app&rsquo;s own; the body&rsquo;s extra lift when the rocket is at an angle stays this app&rsquo;s. Below Mach 0.9 RASAero II&rsquo;s do not change with speed. A staged rocket flies as more than one airframe (the whole stack, then the sustainer alone), and each has its own drag: import a profile for each one you have, exported for that airframe; any without one flies on this app&rsquo;s model. The accuracy range beside the apogee is this app&rsquo;s own and does not describe an imported profile.";
/**
 * Sets (or with null removes) an airframe's imported profile, flies it again and draws the editor again.
 * @param {number} slot
 * @param {object|null} c
 */
function setProfile(slot, c) {
  if (!BLD) return;
  BLD.settings["cdCurve" + (slot > 1 ? slot : "")] = c;
  bldChanged(true);
  bldRender();
}
/**
 * The Whole Rocket editor's Imported drag profile block for one airframe, under its drag coefficient.
 * @param {number} [slot]
 * @returns {string} HTML
 */
export function dragProfileHtml(slot = 1) {
  const c = profileNow(slot),
    x = slot > 1 ? String(slot) : "",
    ph = dragPhases(BLD.stages.length).find((q) => q.slot === slot) || dragPhases(1)[0],
    err = dragErr[slot] || "";
  let h =
    `${ph.head ? "" : `<div class="bldh">Imported drag profile</div>`}<div class="dragprof" id="dragprof${x}">` +
    `<div class="row" style="align-items:center"><label class="file btn ghost" for="dragfile${x}">${c ? "Import another" : "Import drag profile"}<input type="file" id="dragfile${x}" data-slot="${slot}" accept=".csv,.CSV,.txt,.TXT,.tsv,.dat,text/csv,text/plain"></label>` +
    `<button class="ib" type="button" data-title="Imported drag profile" data-info="${DRAG_INFO}" aria-label="About imported drag profiles">i</button></div>` +
    `<p class="note bad" id="dragerr${x}"${err ? "" : " hidden"}>${esc(err)}</p>`;
  if (!c)
    return (
      h +
      `<p class="note" id="dragnone${x}">Fly ${ph.head ? esc(ph.phase) : "the rocket"} on RASAero II’s, OpenRocket’s or a CFD run’s drag in place of this app’s: a file of Cd against Mach number${ph.head ? ` for ${esc(ph.phase)}` : ""}.</p></div>`
    );
  const span = `Mach ${c.m[0].toFixed(2)} to ${c.m[c.m.length - 1].toFixed(2)}`;
  h +=
    `<p class="note" id="draginfo${x}"><b>${esc(c.src)}</b>${c.name ? `, ${esc(c.name)}` : ""}: ${c.m.length} points, ${span}, ` +
    `${c.on ? "coasting and motor-burning curves" : "one curve (used with the motor burning too)"}` +
    `${c.cp ? "; center of pressure and normal force" : ""}.` +
    `${c.note ? " " + esc(c.note) : ""}</p>` +
    `<label class="partfit" id="draguserow${x}"><input type="checkbox" id="draguse${x}" data-slot="${slot}"${c.use !== false ? " checked" : ""}><span>Fly with this profile</span></label>`;
  // a file that says what air and what length of rocket it was worked out for (RASAero II's Reynolds numbers): its
  // drag can follow the altitude, and a file for another rocket shows
  if (c.re > 0) {
    const len = slotLength(slot),
      fits = profileAtSeaLevel(c, len);
    if (fits)
      h += `<label class="partfit" id="dragaltrow${x}"><input type="checkbox" id="dragalt${x}" data-slot="${slot}"${c.alt === true ? " checked" : ""}${c.use === false ? " disabled" : ""}><span>Adjust its drag for altitude</span></label>`;
    else if (len > 0)
      h += `<p class="note bad" id="draglen${x}">This file’s Reynolds numbers are for a rocket ${fmt(profileLength(c), "len", 1)} ${uname("len")} long; ${ph.head ? esc(ph.phase) : "this rocket"} is ${fmt(len, "len", 1)} ${uname("len")}. Check it was exported for this rocket.</p>`;
  }
  if (c.cp)
    h += `<label class="partfit" id="dragstabrow${x}"><input type="checkbox" id="dragstab${x}" data-slot="${slot}"${c.stab === true ? " checked" : ""}><span>Use its center of pressure and normal force</span></label>`;
  if (c.src === "Table")
    h +=
      `<div class="grid" id="dragrefrow${x}" style="margin-top:10px"><div class="fld"><div class="lh"><label for="dragrefd${x}">Its reference diameter</label></div>` +
      `<div class="in"><input id="dragrefd${x}" data-slot="${slot}" type="number" inputmode="decimal" step="any" placeholder="the rocket’s" value="${c.refD > 0 ? fmt(c.refD, "small").replace(/,/g, "") : ""}"><span class="u">${uname("small")}</span></div></div></div>`;
  return (
    h +
    `<div class="row" style="margin-top:10px"><button class="btn ghost" id="dragdel${x}" data-slot="${slot}" type="button">Remove profile</button></div></div>`
  );
}
/**
 * Connects the blocks' controls (the editor is drawn afresh each time).
 * @param {HTMLElement} el the editor
 */
export function wireDragProfile(el) {
  el.querySelectorAll("input[type=file][id^=dragfile]").forEach((file) => {
    const slot = +file.dataset.slot || 1;
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      file.value = "";
      if (!f) return;
      dragErr[slot] = "";
      try {
        if (f.size > 20e6) throw new Error("That file is too large to be a drag table.");
        setProfile(slot, parseDragProfile(await f.text(), f.name));
      } catch (e) {
        dragErr[slot] =
          `Couldn’t read a drag profile from ${f.name}: ${e && e.message ? e.message : "it isn’t a table this app knows."}`;
        bldRender();
      }
    });
  });
  const on = (sel, ev, fn) =>
    el.querySelectorAll(sel).forEach((x) => x.addEventListener(ev, (e) => fn(e, +x.dataset.slot || 1)));
  on("[id^=draguse][data-slot]", "change", (ev, slot) => {
    const c = profileNow(slot);
    if (c) setProfile(slot, { ...c, use: ev.target.checked });
  });
  on("[id^=dragalt][data-slot]", "change", (ev, slot) => {
    const c = profileNow(slot);
    if (c) setProfile(slot, { ...c, alt: ev.target.checked });
  });
  on("[id^=dragstab][data-slot]", "change", (ev, slot) => {
    const c = profileNow(slot);
    if (c) setProfile(slot, { ...c, stab: ev.target.checked });
  });
  on("[id^=dragrefd][data-slot]", "change", (ev, slot) => {
    const c = profileNow(slot),
      v = ev.target.value === "" ? 0 : fromDisp(+ev.target.value, "small");
    if (c) setProfile(slot, { ...c, refD: isFinite(v) && v > 0 && v < 10 ? v : 0 });
  });
  on("[id^=dragdel][data-slot]", "click", (ev, slot) => {
    dragErr[slot] = "";
    setProfile(slot, null);
  });
}
/**
 * Draws the Results tab's line saying the last flight flew on an imported profile (or, staged, which of its airframes
 * did).
 */
export function renderDragRef() {
  const el = document.getElementById("dragref");
  if (!el) return;
  const used = lastSim && !lastSim.st.error ? flownProfiles(lastSim.D) : [],
    stabs = lastSim && !lastSim.st.error ? flownProfiles(lastSim.D, "stab") : [],
    alts = used.filter((u) => u.c.alt === true && u.c.re > 0);
  el.hidden = !used.length && !stabs.length;
  if (el.hidden) return;
  const name = (c) => `<b>${esc(c.src)}</b>${c.name ? `, ${esc(c.name)}` : ""}`,
    staged = !!lastSim.D.twoStage,
    // the top speed is the last airframe's: the rocket's own, or the sustainer's
    own = used.find((u) => u.slot === 1),
    top = lastSim.st.maxMach,
    past = own && top > own.c.m[own.c.m.length - 1] + 0.005;
  el.innerHTML =
    (!used.length
      ? ""
      : staged
        ? `Flown on imported drag, not this app’s drag model, for ${used.map((u) => `${esc(u.phase)} (${name(u.c)})`).join("; ")}.`
        : `Flown on an imported drag profile (${name(used[0].c)}), not this app’s drag model.`) +
    (past
      ? ` <b>The flight reached Mach ${top.toFixed(2)}, past ${staged ? "the sustainer’s" : "the"} profile’s last point at Mach ${own.c.m[own.c.m.length - 1].toFixed(2)}: its last Cd was held from there.</b>`
      : "") +
    (alts.length
      ? ` Its drag was adjusted for altitude${staged ? ` (${alts.map((u) => esc(u.phase)).join("; ")})` : ""}.`
      : "") +
    (stabs.length
      ? ` The center of pressure and normal force were ${stabs.map((u) => `${name(u.c)}’s${staged ? ` for ${esc(u.phase)}` : ""}`).join("; ")}, not this app’s.`
      : "") +
    " Change it under Whole Rocket on the Rocket tab.";
}
