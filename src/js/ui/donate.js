/**
 * Donations (see the note below) and opening outside links.
 */
import { store } from "../core/storage.js";
import { PROFILE } from "../design/defaults.js";
import { lastSim } from "./results.js";
/* ---------- donations (Venmo) ----------
   A "Support the app" card in Settings is always there. Once, after someone has got real use from the app (their 10th
   launch, or their first saved flight report), a single line shows above the flight report; closing it or tapping
   through means it never shows again. Nothing pops up or gets in the way. */
const VENMO_URL = "https://venmo.com/u/PocketRocketFlightLab",
  PAYPAL_URL = "https://www.paypal.com/qrcodes/p2pqrc/6SFLPUHMKC9FY";
/**
 * Opens a link outside the app (through the Android app when there is one).
 * @param {string} url
 */
function openLink(url) {
  const A = window.PocketRocketApp;
  try {
    if (A && typeof A.openExternal === "function" && A.openExternal(url)) return;
  } catch (e) {}
  const w = window.open(url, "_blank", "noopener");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
/**
 * Shows the note that the flight report has no flyer profile, when there isn't one.
 *
 * the flight report shows the flier's profile; say so when this copy of the app has none
 */
export function profNoteRender() {
  const n = document.getElementById("exportprof");
  if (!n) return;
  n.hidden = !!(PROFILE.name || PROFILE.club || PROFILE.nar || PROFILE.tra || PROFILE.cert);
}
/**
 * Hides the support line for good.
 */
function supDone() {
  store.set("rfs-support", { done: true });
  const l = document.getElementById("supline");
  if (l) l.hidden = true;
}
/**
 * Shows the support line once the app has had real use (see the note above).
 */
export function supRender() {
  const l = document.getElementById("supline");
  if (!l) return;
  const v = store.get("rfs-support", {});
  l.hidden = !lastSim || !!v.done || !((v.runs || 0) >= 10 || v.report);
}
/**
 * Counts a launch or notes a saved report, for the support line.
 * @param {string} k "run", or another milestone
 */
export function supNote(k) {
  const v = store.get("rfs-support", {});
  if (v.done) return;
  if (k === "run") v.runs = (v.runs || 0) + 1;
  else v[k] = true;
  store.set("rfs-support", v);
  supRender();
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.getElementById("exportprofbtn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (window.prOpenProfile) window.prOpenProfile();
  });
  document.querySelectorAll("[data-venmo],[data-paypal]").forEach((b) =>
    b.addEventListener("click", () => {
      openLink(b.hasAttribute("data-paypal") ? PAYPAL_URL : VENMO_URL);
      if (b.closest("#supline")) supDone();
    }),
  );
  document.getElementById("supx").onclick = supDone;
  {
    const b = document.getElementById("s-supbtn"),
      p = document.getElementById("s-sup");
    b.onclick = () => {
      const o = p.hidden;
      p.hidden = !o;
      b.setAttribute("aria-expanded", String(o));
    };
  }
}
