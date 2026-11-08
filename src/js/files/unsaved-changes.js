/**
 * Unsaved changes and the Save buttons: what counts as a change, the title asterisk, the prompt to save before the
 * file picker opens, the Save changes and Save a copy buttons, and naming a file on its first save.
 */
import { BLD, bldRender } from "../builder/builder-ui.js";
import { boostId, D, defaultDesign, defaultLaunch, L, motorId } from "../design/defaults.js";
import { SAVE_IGNORE, SAVE_NOT, SOURCE } from "./save.js";
import { saveDesignFile } from "./saved-simulation.js";
import { isAndroidApp } from "./zip.js";
import { DEFAULT_MOTOR } from "../motors/catalog-lookup.js";
import { drawProfile } from "../ui/charts.js";
/* ---------- unsaved changes: asked about before another file is opened ---------- */
/**
 * A snapshot of what the design file can hold (app-only settings don't count as changes).
 * @returns {string} JSON
 *
 * only what the design file can hold counts as a change (app-only settings like the safety cone don't)
 */
function designSnap(d, l, m, b) {
  const no = new Set([...SAVE_IGNORE, ...SAVE_NOT.common, ...SAVE_NOT.ork]);
  const pick = (o) =>
    Object.keys(o)
      .sort()
      .filter((k) => !no.has(k))
      .map((k) => [k, o[k]]);
  return "b2:" + JSON.stringify([BLD, pick(l), m, BLD && BLD.stages.length > 1 ? b : null]);
}
export var CLEAN = null;
/**
 * Takes the current design as saved.
 */
export function markClean() {
  CLEAN = designSnap(D, L, motorId, boostId);
  try {
    localStorage.setItem("rfs-clean2", CLEAN);
  } catch (e) {}
  renderSavePanel();
}
/**
 * True if the design differs from when it was last saved or opened.
 * @returns {boolean}
 */
export function isDirty() {
  const ref =
    CLEAN ??
    (SOURCE && SOURCE.base
      ? designSnap(SOURCE.base.D, SOURCE.base.L, SOURCE.base.motorId, SOURCE.base.boostId)
      : designSnap(defaultDesign(), defaultLaunch(), DEFAULT_MOTOR, boostId));
  return designSnap(D, L, motorId, boostId) !== ref;
}
/**
 * True if a design is open and has unsaved changes.
 * @returns {boolean}
 *
 * the rocket's name, with an asterisk while an opened .ork/.rkt has unsaved changes
 * a design that's open (from a file, or started here) with changes that aren't saved
 */
function designDirty() {
  return !document.documentElement.classList.contains("nodesign") && isDirty();
}
/**
 * Writes the rocket's name in the title, with an asterisk while there are unsaved changes.
 */
export function renderTitle() {
  const el = document.getElementById("rtitle");
  if (!el) return;
  const dirty = designDirty();
  el.textContent = D.name + (dirty ? " *" : "");
  el.title = dirty ? "Unsaved changes" : "";
  // the file name is its own thing: the rocket's name is set in the design tree, the file's name only when saving
  const f = document.getElementById("rfile");
  if (f) f.textContent = SOURCE && SOURCE.name ? `File: ${SOURCE.name}` : "File: not saved yet";
}
/**
 * Marks a rocket as open for the rest of this session (or none), and shows the design screens.
 * @param {boolean} on
 *
 * a rocket is open (from a file or entered by hand) for the rest of this session
 */
export function setActive(on) {
  try {
    on ? sessionStorage.setItem("rfs-active", "1") : sessionStorage.removeItem("rfs-active");
  } catch (e) {}
  document.documentElement.classList.toggle("nodesign", !on);
  if (on)
    requestAnimationFrame(() => {
      drawProfile();
    });
}
/**
 * Shows the Save changes button while there's something to save, worded for the file's format.
 */
export function renderSavePanel() {
  renderTitle();
  const b = document.getElementById("savefile");
  if (!b) return;
  // the Save changes button sits at the top of the tab and only shows while there's something to save
  b.hidden = !designDirty();
  b.title = !SOURCE
    ? "Save this new design"
    : SOURCE.format === "rkt"
      ? `Save as ${SOURCE.name.replace(/\.rkt$/i, "")}.ork`
      : `Save changes to ${SOURCE.name}`;
  b.textContent = SOURCE && SOURCE.format === "rkt" ? "Save as .ork" : "Save changes";
  const n = document.getElementById("rktnote");
  if (n) n.hidden = !(SOURCE && SOURCE.format === "rkt");
}
/**
 * Asks whether to write over the open design file or save a copy of it.
 * @param {string} name the file's name
 * @param {boolean} [failed] the file couldn't be written over: offers only a copy
 * @returns {Promise<"over"|"copy"|null>} null if cancelled
 */
export function askOverwrite(name, failed = false) {
  const box = document.getElementById("overask"),
    yes = document.getElementById("overyes"),
    cp = document.getElementById("overcopy"),
    no = document.getElementById("overno");
  document.getElementById("overttl").textContent = failed ? "Couldn’t write over the file" : "Save changes";
  document.getElementById("overtxt").textContent = failed
    ? `${name} couldn’t be written over: the app isn’t allowed to change it any more (this happens with a file opened from another app, or after it was moved or deleted). Save a copy under a new name instead? To write over the original, open it again with Open .ork / .rkt, then save.`
    : `Write over ${name}, or save a copy under a new name? The copy is what stays open.`;
  yes.hidden = failed;
  box.hidden = false;
  (failed ? cp : yes).focus();
  return new Promise((res) => {
    const done = (v) => {
      box.hidden = true;
      yes.onclick = cp.onclick = no.onclick = box.onclick = null;
      document.removeEventListener("keydown", onKey);
      res(v);
    };
    /**
     * Escape cancels.
     */
    const onKey = (e) => {
      if (e.key === "Escape") done(null);
    };
    document.addEventListener("keydown", onKey);
    yes.onclick = () => done("over");
    cp.onclick = () => done("copy");
    no.onclick = () => done(null);
    box.onclick = (e) => {
      if (e.target === box) done(null);
    };
  });
}
let nameMode = "first",
  nameExtra = {};
/**
 * Asks for a file name: for a new design's first save, or for a copy.
 * @param {string} mode "first" or "copy"
 * @param {object} [extra] more options for saveDesignFile (addSim to save the last run into the copy too)
 */
export function askName(mode, extra = {}) {
  nameMode = mode;
  nameExtra = extra;
  const box = document.getElementById("namebox"),
    inp = document.getElementById("savename");
  document.getElementById("nametxt").innerHTML =
    mode === "copy"
      ? `<b>Save a copy</b><br><span class="note">Type a file name for the copy. It’s saved as an OpenRocket (.ork) file, and the copy is what stays open. The rocket’s name doesn’t change.</span>`
      : `<b>Name the file</b><br><span class="note">It’s saved as an OpenRocket (.ork) file with this name. The rocket’s name doesn’t change; set it in the design tree.</span>`;
  document.getElementById("nameok").textContent = mode === "copy" ? "Save copy" : "Save";
  inp.value =
    mode === "copy"
      ? (((SOURCE && SOURCE.name) || "").replace(/\.(ork|rkt)$/i, "") + " copy").trim()
      : BLD && BLD.name && BLD.name !== "My rocket"
        ? BLD.name
        : "";
  document.getElementById("nameerr").textContent = "";
  box.hidden = false;
  inp.focus();
  inp.select();
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  try {
    CLEAN = localStorage.getItem("rfs-clean2");
  } catch (e) {}
  {
    let bypass = false;
    const inp = document.getElementById("orkfile"),
      box = document.getElementById("openconfirm"),
      txt = document.getElementById("opentxt"),
      bs = document.getElementById("opensave");
    // the picker opens from a real tap on a label tied to the file input (programmatic clicks are blocked in some views)
    const pick = () => {
      bypass = true;
      box.hidden = true;
    };
    const pk = document.getElementById("openpick"),
      dc = document.getElementById("opendiscard");
    inp.addEventListener("click", (e) => {
      if (bypass) {
        bypass = false;
        return;
      }
      if (document.documentElement.classList.contains("nodesign") || !isDirty()) return;
      e.preventDefault();
      const nm = SOURCE ? SOURCE.name : D.name || "this design";
      txt.textContent = `You have unsaved changes to ${nm}. Save them before opening another file?`;
      bs.textContent = SOURCE ? "Save changes" : "Save as .ork file";
      bs.hidden = false;
      pk.hidden = true;
      dc.hidden = false;
      bs.onclick = async () => {
        const ok = await saveDesignFile(!SOURCE);
        if (ok) {
          txt.textContent = "Saved. Now choose the file to open.";
          bs.hidden = true;
          dc.hidden = true;
          pk.hidden = false;
        } else txt.textContent = "The changes weren’t saved. Save again, discard them, or cancel.";
      };
      document.getElementById("resetconfirm").hidden = true;
      box.hidden = false;
      bs.focus();
    });
    pk.addEventListener("click", pick);
    dc.addEventListener("click", pick);
    document.getElementById("opencancel").onclick = () => {
      box.hidden = true;
    };
  }
  document.getElementById("savefile").onclick = async () => {
    if (SOURCE) {
      // an .ork file in the Android app is written over in place: ask first, or save a copy
      if (SOURCE.format === "ork" && isAndroidApp()) {
        const a = await askOverwrite(SOURCE.name);
        if (a === "over") saveDesignFile(false);
        else if (a === "copy") askName("copy");
        return;
      }
      saveDesignFile(false);
      return;
    }
    // a new design is named on its first save
    askName("first");
  };
  document.getElementById("savecopy").onclick = () => askName(SOURCE ? "copy" : "first");
  {
    const box = document.getElementById("namebox"),
      inp = document.getElementById("savename");
    const go = async () => {
      const nm = inp.value.trim().replace(/\.(ork|rkt)$/i, "");
      if (!nm) {
        document.getElementById("nameerr").textContent = "Type a file name.";
        inp.focus();
        return;
      }
      box.hidden = true;
      await saveDesignFile(
        false,
        nameMode === "copy" && SOURCE ? { ...nameExtra, copyName: nm } : { ...nameExtra, name: nm },
      );
      bldRender();
    };
    document.getElementById("nameok").onclick = go;
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go();
      } else if (e.key === "Escape") {
        box.hidden = true;
      }
    });
    document.getElementById("namecancel").onclick = () => {
      box.hidden = true;
    };
  }
  renderSavePanel();
}
