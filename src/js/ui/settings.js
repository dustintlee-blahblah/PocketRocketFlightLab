/**
 * The settings menu (units, appearance, app colors, swipe, disclaimer and About), and redrawing the drawings when the
 * screen size or the theme changes.
 */
import { store } from "../core/storage.js";
import { PROFILE, units } from "../design/defaults.js";
import { renderResults } from "./results.js";
import { renderRSO } from "./rso-checklist.js";
import { drawChart, drawProfile } from "./charts.js";
import { renderMotors } from "./motor-tab.js";
import { setUnits } from "./events.js";
import { BLD, bldRender } from "../builder/builder-ui.js";
import { profNoteRender } from "./donate.js";
import { drawMC } from "../physics/monte-carlo.js";
let rt = null;
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  /* ---------- settings menu (gear, top right): units, appearance, swipe, disclaimer and About ---------- */
  (function () {
    const btn = document.getElementById("gearbtn"),
      menu = document.getElementById("setmenu");
    if (!btn || !menu) return;
    /**
     * Opens or closes the settings menu.
     */
    const open = (on) => {
      menu.hidden = !on;
      btn.setAttribute("aria-expanded", on);
      if (on) sync();
    };
    window.prSettingsOpen = () => !menu.hidden;
    window.prSettingsClose = () => open(false);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      open(menu.hidden);
    });
    document.addEventListener("click", (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) open(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) {
        open(false);
        btn.focus();
      }
    });
    document.getElementById("s-imp").onclick = () => setUnits("imp");
    document.getElementById("s-met").onclick = () => setUnits("met");
    /**
     * Follows the phone's light or dark setting, or always uses one.
     *
     * appearance: follow the phone, or always light or dark
     */
    const applyTheme = (t) => {
      if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
      else document.documentElement.removeAttribute("data-theme");
      window.prColors(store.get("rfs-accent", null) || "", store.get("rfs-accent2", null) || "");
      try {
        renderResults();
        if (typeof BLD !== "undefined" && BLD) bldRender();
        drawChart();
        drawProfile();
        if (typeof drawMC === "function") drawMC();
      } catch (_) {}
    };
    menu.querySelectorAll("[data-theme-set]").forEach(
      (b) =>
        (b.onclick = () => {
          store.set("rfs-theme", b.dataset.themeSet);
          applyTheme(b.dataset.themeSet);
          sync();
        }),
    );
    const sw = document.getElementById("s-swipe");
    sw.onchange = () => {
      store.set("rfs-swipe", sw.checked);
    };
    /**
     * Redraws the canvases after a color change.
     *
     * App Color: the main colour and the accent colour, each a preset swatch or any colour from the picker
     */
    const redraw = () => {
      try {
        renderResults();
        if (typeof BLD !== "undefined" && BLD) bldRender();
        drawChart();
        drawProfile();
        if (typeof drawMC === "function") drawMC();
        if (!document.getElementById("v-motor").hidden) renderMotors();
      } catch (_) {}
    };
    /**
     * Applies the saved main and accent colors.
     */
    const colors = () => window.prColors(store.get("rfs-accent", null) || "", store.get("rfs-accent2", null) || "");
    /**
     * Saves and applies one app color (a preset swatch or any color).
     */
    const setCol = (key, hex) => {
      store.set(key, hex || null);
      colors();
      redraw();
      sync();
    };
    menu.querySelectorAll("[data-main]").forEach((b) => (b.onclick = () => setCol("rfs-accent", b.dataset.main)));
    menu.querySelectorAll("[data-acc]").forEach((b) => (b.onclick = () => setCol("rfs-accent2", b.dataset.acc)));
    const pickM = document.getElementById("s-main"),
      pickA = document.getElementById("s-acc");
    pickM.addEventListener("input", () => setCol("rfs-accent", pickM.value));
    pickA.addEventListener("input", () => setCol("rfs-accent2", pickA.value));
    document.getElementById("s-colreset").onclick = () => {
      store.set("rfs-accent", null);
      store.set("rfs-accent2", null);
      colors();
      redraw();
      sync();
    };
    // profile: the flier's name, club, membership numbers and certification level
    {
      const pb = document.getElementById("s-profbtn"),
        pp = document.getElementById("s-prof"),
        F = { name: "p-name", club: "p-club", nar: "p-nar", tra: "p-tra", cert: "p-cert" };
      const sum = () => {
        document.getElementById("s-profsum").textContent = [
          PROFILE.name,
          PROFILE.cert ? (PROFILE.cert === "none" ? "" : PROFILE.cert) : "",
        ]
          .filter(Boolean)
          .join(" · ");
      };
      for (const [k, id] of Object.entries(F)) {
        const el = document.getElementById(id);
        el.value = PROFILE[k] || "";
        el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
          PROFILE[k] = el.value.trim();
          store.set("rfs-profile", PROFILE);
          sum();
          if (k === "cert") {
            try {
              renderRSO();
            } catch (e) {}
          }
        });
      }
      sum();
      pb.onclick = () => {
        pp.hidden = !pp.hidden;
        pb.setAttribute("aria-expanded", !pp.hidden);
      };
      // straight to the profile, from the note on the flight report
      window.prOpenProfile = () => {
        open(true);
        pp.hidden = false;
        pb.setAttribute("aria-expanded", true);
        setTimeout(() => {
          const n = document.getElementById("p-name");
          if (n) {
            n.focus();
            n.scrollIntoView({ block: "center" });
          }
        }, 60);
      };
      for (const id of Object.values(F))
        document.getElementById(id).addEventListener("change", () => {
          try {
            profNoteRender();
          } catch (e) {}
        });
    }
    const cb = document.getElementById("s-colorbtn"),
      cp = document.getElementById("s-colors");
    cb.onclick = () => {
      cp.hidden = !cp.hidden;
      cb.setAttribute("aria-expanded", !cp.hidden);
    };
    // the colours are adjusted a little for dark backgrounds, so follow the phone's light/dark switch
    if (window.matchMedia)
      matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
        colors();
        redraw();
      });
    document.getElementById("s-legal").onclick = () => {
      open(false);
      document.getElementById("showlegal").click();
    };
    document.getElementById("s-about").onclick = () => {
      open(false);
      document.getElementById("showabout").click();
    };
    /**
     * Shows the current settings in the menu.
     */
    function sync() {
      for (const [key, attr, pick, def] of [
        ["rfs-accent", "main", pickM, "#D9501C"],
        ["rfs-accent2", "acc", pickA, "#8FCBEB"],
      ]) {
        const a = (store.get(key, null) || "").toUpperCase();
        let hit = false;
        menu.querySelectorAll(`[data-${attr}]`).forEach((b) => {
          const on = (b.dataset[attr] || "").toUpperCase() === a;
          b.setAttribute("aria-pressed", on);
          hit = hit || on;
        });
        const sc = pick.closest(".swcustom");
        sc.setAttribute("aria-pressed", !hit && !!a);
        sc.style.background = a && !hit ? a : "";
        pick.value = a || def;
      }
      const t = store.get("rfs-theme", "auto");
      menu
        .querySelectorAll("[data-theme-set]")
        .forEach((b) => b.setAttribute("aria-pressed", b.dataset.themeSet === t));
      document.getElementById("s-imp").setAttribute("aria-pressed", units === "imp");
      document.getElementById("s-met").setAttribute("aria-pressed", units === "met");
      sw.checked = store.get("rfs-swipe", true) !== false;
    }
    applyTheme(store.get("rfs-theme", "auto"));
    sync();
  })();
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      drawChart();
      drawProfile();
    }, 100);
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    drawChart();
    drawProfile();
  });
  new MutationObserver(() => {
    drawChart();
    drawProfile();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
