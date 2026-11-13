/**
 * Tabs, page spacing for the launch bar, swiping between tabs, and the units switch.
 */
import { BLD, bldRender } from "../builder/builder-ui.js";
import { store } from "../core/storage.js";
import { setUnitsValue } from "../design/defaults.js";
import { drawMC } from "../physics/monte-carlo.js";
import { drawChart, drawProfile } from "./charts.js";
import { renderForms } from "./forms.js";
import { siteRender } from "./launch-sites.js";
import { renderMotors } from "./motor-tab.js";
import { renderResults } from "./results.js";
/* ---------- events ---------- */
/**
 * Shows one of the four tabs and draws what it needs.
 * @param {string} name "flight", "rocket", "motor" or "results"
 */
export function showTab(name) {
  ["flight", "rocket", "motor", "results"].forEach((n) => {
    document.getElementById("v-" + n).hidden = n !== name;
    document.getElementById("t-" + n).setAttribute("aria-selected", n === name);
  });
  if (name === "motor") renderMotors();
  if (name === "flight") siteRender();
  if (name === "rocket" && BLD) bldRender();
  requestAnimationFrame(() => {
    drawChart();
    drawProfile();
    if (name === "results" && typeof drawMC === "function") drawMC();
  });
}
/**
 * Switches between imperial and metric units and redraws.
 * @param {string} u "imp" or "met"
 */
export function setUnits(u) {
  setUnitsValue(u);
  store.set("rfs-units", u);
  for (const [id, v] of [
    ["u-imp", "imp"],
    ["u-met", "met"],
    ["s-imp", "imp"],
    ["s-met", "met"],
  ]) {
    const b = document.getElementById(id);
    if (b) b.setAttribute("aria-pressed", u === v);
  }
  renderForms();
  renderResults();
  if (!document.getElementById("v-motor").hidden) renderMotors();
  if (typeof BLD !== "undefined" && BLD && typeof bldRender === "function") bldRender();
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  ["flight", "rocket", "motor", "results"].forEach(
    (n) => (document.getElementById("t-" + n).onclick = () => showTab(n)),
  );
  /* the page keeps clear space at the bottom as tall as the launch bar really is (it grows with the phone's text size and gesture bar) */
  (function () {
    const rb = document.getElementById("runbar");
    if (!rb) return;
    /**
     * Sets the page's bottom space to the launch bar's real height.
     *
     * Measured from the top of the bar to the bottom of the screen, so anything below it (the phone's gesture bar) counts too.
     */
    const set = () => {
      const r = rb.getBoundingClientRect();
      if (!r.height) return;
      const h = Math.max(r.height, window.innerHeight - r.top);
      document.documentElement.style.setProperty("--runbar-h", Math.ceil(h) + "px");
    };
    set();
    if (window.ResizeObserver) new ResizeObserver(set).observe(rb);
    window.addEventListener("resize", set);
    window.addEventListener("load", set);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) set();
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(set);
    [300, 1000, 3000].forEach((ms) => setTimeout(set, ms));
  })();
  // the app's text size and fonts settle after the first layout
  /* swipe left or right across the screen to move between the four tabs (in their order across the top) */
  (function () {
    const ORDER = ["rocket", "motor", "flight", "results"];
    let sx = 0,
      sy = 0,
      st = 0,
      ok = false;
    /**
     * True where a swipe shouldn't change tabs (see the note above).
     *
     * Not while typing or dragging a slider, inside a table that scrolls sideways, or with a pop-up open.
     */
    const blocked = (t) => {
      if (!t.closest) return false;
      if (t.closest("input[type=range],textarea,.legal,.splash")) return true;
      if (document.documentElement.classList.contains("typing")) return true; // the keyboard is open
      const sc = t.closest(".dtab");
      if (sc && sc.scrollWidth > sc.clientWidth + 2) return true;
      return false;
    };
    /**
     * True while a pop-up is open.
     */
    const popup = () =>
      [...document.querySelectorAll(".modal,.animmodal,.legal,.splash")].some(
        (m) => !m.hidden && m.isConnected && getComputedStyle(m).display !== "none",
      );
    document.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1 || popup() || store.get("rfs-swipe", true) === false) {
          ok = false;
          return;
        }
        const p = e.touches[0];
        // ignore swipes that start at the very edge of the screen: those are the phone's own back gesture
        ok = p.clientX > 24 && p.clientX < window.innerWidth - 24 && !blocked(e.target);
        sx = p.clientX;
        sy = p.clientY;
        st = Date.now();
      },
      { passive: true },
    );
    document.addEventListener(
      "touchend",
      (e) => {
        if (!ok) return;
        ok = false;
        const p = e.changedTouches[0],
          dx = p.clientX - sx,
          dy = p.clientY - sy;
        if (Date.now() - st > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
        if (window.getSelection && String(window.getSelection()) !== "") return;
        const cur = ORDER.findIndex((n) => !document.getElementById("v-" + n).hidden),
          next = cur + (dx < 0 ? 1 : -1);
        if (cur < 0 || next < 0 || next >= ORDER.length) return;
        {
          const ae = document.activeElement;
          if (ae && ae !== document.body && ae.blur && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) ae.blur();
        }
        showTab(ORDER[next]);
        const v = document.getElementById("v-" + ORDER[next]);
        v.classList.remove("swipe-l", "swipe-r");
        void v.offsetWidth;
        v.classList.add(dx < 0 ? "swipe-l" : "swipe-r");
        document.getElementById("t-" + ORDER[next]).scrollIntoView({ block: "nearest" });
      },
      { passive: true },
    );
  })();
  document.getElementById("mchange").onclick = () => showTab("motor");
}
