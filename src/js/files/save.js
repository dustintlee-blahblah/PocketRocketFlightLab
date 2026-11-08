/**
 * The save-message pop-up, the open design's source file (SOURCE) and chosen motor configuration (ORK_CFG), and which
 * settings count as changes to the design file.
 */
import { applyCal } from "../flightlog/drag-calibration.js";
/* ---------- centered pop-up for save messages (the Android app calls this too) ---------- */
let prToastT = null;
/* ---------- save the design back to its .ork / .rkt file ---------- */
/**
 * The file the open design came from: its name, format, text, extra zip entries and the design as opened (base),
 * used to save changes back into it. Kept on the device; null for a design not opened from a file.
 */
export var SOURCE = null;
/* the motor configuration of an OpenRocket file to fly (configid), when the file has several: chosen on the Motor tab.
   null takes the one the file's own simulation used, or its default. */
export var ORK_CFG = null;
/* the stored run (simulation) chosen when the file was opened, as its index among the file's simulations: its motor
   configuration, launch conditions and results are used. Only set while the file is read. */
export var ORK_SIM = null;
// this rocket's drag calibration, if it has one
/**
 * Sets SOURCE and keeps it on the device; if it's too big to store with its images, the design alone is stored.
 * @param {object|null} s
 */
export function setSource(s) {
  SOURCE = s;
  try {
    if (s) localStorage.setItem("rfs-source", JSON.stringify(s));
    else localStorage.removeItem("rfs-source");
  } catch (e) {
    // too big to keep with its images: keep the design itself
    try {
      localStorage.setItem(
        "rfs-source",
        JSON.stringify({ ...s, extras: [], extrasDropped: (s.extras || []).length > 0 }),
      );
    } catch (_) {
      try {
        localStorage.removeItem("rfs-source");
      } catch (__) {}
    }
  }
}
/**
 * Design keys that are derived or file-only, so a difference in them isn't a change.
 */
export const SAVE_IGNORE = new Set([
  "dragScale",
  "mountDia",
  "bMountDia",
  "finPts",
  "bFinPts",
  "finPar",
  "bFinPar",
  "inertiaMass",
  "inertiaSource",
  "bInertiaMass",
  "bInertiaSource",
  "segments",
  "bSegments",
  "transitions",
  "orkApogee",
  "orkMotor",
  "refSource",
  "finFinish",
  "bFinFinish",
]);
/**
 * Range settings, which only feed the RSO Checklist (changing them keeps the results).
 */
export const RANGE_KEYS = [
  "waiver",
  "waiverRef",
  "recRadius",
  "cert",
  "flightType",
  "railType",
  "ceiling",
  "cloudLow",
  "cloudMid",
  "cloudHigh",
  "cloudProf",
  "vis",
  "precip",
  "dewC",
]; // read live by the RSO Checklist: changing them doesn't change the flight
/**
 * Launch keys a change in which isn't a change to the design file: the file now keeps every launch setting (STATE_ORK),
 * so only the note of whether the weather was fetched.
 */
export const SAVE_NOT = { common: ["wxSet"], ork: [] };

/**
 * Sets ORK_CFG (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setORK_CFG(v) {
  return (ORK_CFG = v);
}
/**
 * Sets ORK_SIM (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setORK_SIM(v) {
  return (ORK_SIM = v);
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  /**
   * Shows a short message in the centered pop-up for about two seconds. The Android app calls this too.
   * @param {string} msg
   * @returns {boolean} false if the page has no pop-up element
   */
  window.prToast = (msg) => {
    const el = document.getElementById("prtoast");
    if (!el) return false;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(prToastT);
    prToastT = setTimeout(() => el.classList.remove("show"), 2200);
    return true;
  };
  try {
    SOURCE = JSON.parse(localStorage.getItem("rfs-source") || "null");
  } catch (e) {
    SOURCE = null;
  }
  applyCal();
}
