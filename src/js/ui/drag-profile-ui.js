import { BLD, bldChanged, bldRender } from "../builder/builder-ui.js";
import { esc } from "../core/helpers.js";
import { D } from "../design/defaults.js";
import { parseDragProfile } from "../files/drag-profile.js";
import { lastSim } from "./results.js";
import { fmt, fromDisp, uname } from "./units.js";
/*
 * Imported drag profile: the block in the builder's Whole Rocket editor, under the drag coefficients, for bringing in
 * a Cd-against-Mach curve from RASAero II, OpenRocket or a table (files/drag-profile.js), flying with it or not, and
 * taking it off again; and the Results tab's line saying a flight used one. The Wind Tunnel charts it beside the
 * app's own model. The profile lives in the builder's settings and is saved with the design file.
 */

/**
 * The open design's imported profile, or null.
 * @returns {object|null}
 */
function profileNow() {
  return (BLD && BLD.settings && BLD.settings.cdCurve) || null;
}
/** What went wrong with the last file tried, shown in the block until the next try. */
let dragErr = "";
/** The block's help. */
const DRAG_INFO =
  "Fly the rocket on another program&rsquo;s drag in place of this app&rsquo;s own, and compare the two. Bring in the whole rocket&rsquo;s drag coefficient (Cd) against Mach number from: RASAero II (Aero Plots, then File, Export, To CSV File): its coasting and motor-burning curves at zero angle of attack. OpenRocket (a simulation&rsquo;s exported data with the Mach number and Drag coefficient columns; include Time, Altitude, Thrust and Angle of attack if you can): the drag over that flight&rsquo;s ascent, so it only reaches that flight&rsquo;s top speed. A CFD run or a spreadsheet: a text or CSV table with a Mach number column and a Cd column, and a third column for Cd with the motor burning if you have it. With Fly with this profile ticked, every flight uses the imported curve: straight lines between its points, and its first or last value outside the Mach numbers it covers. The Wind Tunnel&rsquo;s Drag coefficient chart shows it beside this app&rsquo;s own model either way. A profile&rsquo;s Cd is on a reference area: RASAero II and OpenRocket use the body&rsquo;s largest cross-section, as this app does. For a CFD table on another area, enter its reference diameter. The profile is saved with the design file. It is the other program&rsquo;s answer for one condition (RASAero II&rsquo;s export is at sea level), so it does not follow the air getting thinner with height the way this app&rsquo;s own model does, and it is not used for staged rockets. The accuracy range beside the apogee is this app&rsquo;s own and does not describe an imported profile.";
/**
 * Sets (or with null removes) the open design's imported profile, flies it again and draws the editor again.
 * @param {object|null} c
 */
function setProfile(c) {
  if (!BLD) return;
  BLD.settings.cdCurve = c;
  bldChanged(true);
  bldRender();
}
/**
 * The Whole Rocket editor's Imported drag profile block, under the drag coefficients.
 * @returns {string} HTML
 */
export function dragProfileHtml() {
  const c = profileNow(),
    staged = !!D.twoStage;
  let h =
    `<div class="bldh">Imported drag profile</div><div class="dragprof" id="dragprof">` +
    `<div class="row" style="align-items:center"><label class="file btn ghost" for="dragfile">${c ? "Import another" : "Import drag profile"}<input type="file" id="dragfile" accept=".csv,.CSV,.txt,.TXT,.tsv,.dat,text/csv,text/plain"></label>` +
    `<button class="ib" type="button" data-title="Imported drag profile" data-info="${DRAG_INFO}" aria-label="About imported drag profiles">i</button></div>` +
    `<p class="note bad" id="dragerr"${dragErr ? "" : " hidden"}>${esc(dragErr)}</p>`;
  if (!c)
    return (
      h +
      `<p class="note" id="dragnone">Fly on RASAero II’s, OpenRocket’s or a CFD run’s drag in place of this app’s: a file of Cd against Mach number.</p></div>`
    );
  const span = `Mach ${c.m[0].toFixed(2)} to ${c.m[c.m.length - 1].toFixed(2)}`;
  h +=
    `<p class="note" id="draginfo"><b>${esc(c.src)}</b>${c.name ? `, ${esc(c.name)}` : ""}: ${c.m.length} points, ${span}, ` +
    `${c.on ? "coasting and motor-burning curves" : "one curve (used with the motor burning too)"}.` +
    `${c.note ? " " + esc(c.note) : ""}` +
    `${staged ? " <b>Not used: a profile is one airframe’s, and this rocket is staged.</b>" : ""}</p>` +
    `<label class="partfit" id="draguserow"><input type="checkbox" id="draguse"${c.use !== false ? " checked" : ""}${staged ? " disabled" : ""}><span>Fly with this profile</span></label>`;
  if (c.src === "Table")
    h +=
      `<div class="grid" id="dragrefrow" style="margin-top:10px"><div class="fld"><div class="lh"><label for="dragrefd">Its reference diameter</label></div>` +
      `<div class="in"><input id="dragrefd" type="number" inputmode="decimal" step="any" placeholder="the rocket’s" value="${c.refD > 0 ? fmt(c.refD, "small").replace(/,/g, "") : ""}"><span class="u">${uname("small")}</span></div></div></div>`;
  return (
    h +
    `<div class="row" style="margin-top:10px"><button class="btn ghost" id="dragdel" type="button">Remove profile</button></div></div>`
  );
}
/**
 * Connects the block's controls (the editor is drawn afresh each time).
 * @param {HTMLElement} el the editor
 */
export function wireDragProfile(el) {
  const file = el.querySelector("#dragfile");
  if (!file) return;
  file.addEventListener("change", async () => {
    const f = file.files && file.files[0];
    file.value = "";
    if (!f) return;
    dragErr = "";
    try {
      if (f.size > 20e6) throw new Error("That file is too large to be a drag table.");
      setProfile(parseDragProfile(await f.text(), f.name));
    } catch (e) {
      dragErr = `Couldn’t read a drag profile from ${f.name}: ${e && e.message ? e.message : "it isn’t a table this app knows."}`;
      bldRender();
    }
  });
  const on = (id, ev, fn) => {
    const x = el.querySelector(id);
    if (x) x.addEventListener(ev, fn);
  };
  on("#draguse", "change", (ev) => {
    const c = profileNow();
    if (c) setProfile({ ...c, use: ev.target.checked });
  });
  on("#dragrefd", "change", (ev) => {
    const c = profileNow(),
      v = ev.target.value === "" ? 0 : fromDisp(+ev.target.value, "small");
    if (c) setProfile({ ...c, refD: isFinite(v) && v > 0 && v < 10 ? v : 0 });
  });
  on("#dragdel", "click", () => {
    dragErr = "";
    setProfile(null);
  });
}
/**
 * Draws the Results tab's line saying the last flight flew on an imported profile.
 */
export function renderDragRef() {
  const el = document.getElementById("dragref");
  if (!el) return;
  const c = lastSim && !lastSim.D.twoStage && lastSim.D.cdCurve,
    on = !!c && c.use !== false && !lastSim.st.error;
  el.hidden = !on;
  if (!on) return;
  const top = lastSim.st.maxMach,
    past = top > c.m[c.m.length - 1] + 0.005;
  el.innerHTML =
    `Flown on an imported drag profile (<b>${esc(c.src)}</b>${c.name ? `, ${esc(c.name)}` : ""}), not this app’s drag model.` +
    (past
      ? ` <b>The flight reached Mach ${top.toFixed(2)}, past the profile’s last point at Mach ${c.m[c.m.length - 1].toFixed(2)}: its last Cd was held from there.</b>`
      : "") +
    " Change it under Whole Rocket on the Rocket tab.";
}
