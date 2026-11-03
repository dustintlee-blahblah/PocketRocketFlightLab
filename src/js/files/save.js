/* ---------- centered pop-up for save messages (the Android app calls this too) ---------- */
let prToastT = null;
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
