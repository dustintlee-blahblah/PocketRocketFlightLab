/**
 * The save-message pop-up, and the open design's source file (SOURCE) and chosen motor configuration (ORK_CFG).
 */
/* ---------- centered pop-up for save messages (the Android app calls this too) ---------- */
let prToastT = null;
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
/* ---------- save the design back to its .ork / .rkt file ---------- */
/**
 * The file the open design came from: its name, format, text, extra zip entries and the design as opened (base),
 * used to save changes back into it. Kept on the device; null for a design not opened from a file.
 */
var SOURCE = null;
/* the motor configuration of an OpenRocket file to fly (configid), when the file has several: chosen on the Motor tab.
   null takes the one the file's own simulation used, or its default. */
var ORK_CFG = null;
try {
  SOURCE = JSON.parse(localStorage.getItem("rfs-source") || "null");
} catch (e) {
  SOURCE = null;
}
applyCal(); // this rocket's drag calibration, if it has one
/**
 * Sets SOURCE and keeps it on the device; if it's too big to store with its images, the design alone is stored.
 * @param {object|null} s
 */
function setSource(s) {
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
