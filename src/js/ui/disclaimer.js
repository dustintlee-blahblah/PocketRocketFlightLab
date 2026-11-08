/**
 * The safety and liability disclaimer: it must be read to the end and agreed to once for each build and legal
 * version, and can be opened again from Settings or the footer. Also the About and licenses box.
 */
import { APP_BUILD } from "../core/start.js";
import { store } from "../core/storage.js";
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  (function () {
    const KEY = "rfs-disclaimer-v2",
      LEGAL_VER = "2026-11-02",
      dlg = document.getElementById("legal"),
      chk = document.getElementById("legalchk"),
      ok = document.getElementById("legalok");
    let lastFocus = null;
    /**
     * Opens the disclaimer (required: it must be read and agreed to before going on).
     */
    const open = (required) => {
      lastFocus = document.activeElement;
      dlg.hidden = false;
      dlg.dataset.required = required ? "1" : "";
      // once agreed to, the box stays ticked (and can't be unticked) until a new build asks again
      chk.checked = !required;
      chk.disabled = !required;
      ok.disabled = required;
      ok.textContent = required ? "I agree" : "Close";
      readAll = false;
      document.body.style.overflow = "hidden";
      body.scrollTop = 0;
      setTimeout(() => {
        update();
        (required ? body : ok).focus();
      }, 0);
    };
    /**
     * Closes the disclaimer and puts the focus back.
     */
    const close = () => {
      dlg.hidden = true;
      document.body.style.overflow = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    // "I agree" works only once the whole text has been scrolled through and the box is ticked
    const body = dlg.querySelector(".body"),
      hint = document.getElementById("legalhint");
    let readAll = false;
    /**
     * Enables "I agree" once the whole text has been read and the box is ticked.
     */
    const update = () => {
      if (dlg.dataset.required !== "1") {
        ok.disabled = false;
        hint.hidden = true;
        return;
      }
      // read to the end: scrolled to the bottom, or the acceptance box (the last thing in the text) fully in view
      {
        const acc = body.querySelector(".accept");
        if (
          !readAll &&
          (body.scrollTop + body.clientHeight >= body.scrollHeight - 6 ||
            (acc && acc.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 8))
        )
          readAll = true;
      }
      ok.disabled = !(readAll && chk.checked);
      hint.hidden = readAll && chk.checked;
      hint.textContent = readAll ? "Tick the box to continue." : "Scroll to the end, then tick the box to continue.";
    };
    body.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", () => {
      if (!dlg.hidden) update();
    });
    chk.addEventListener("change", () => {
      if (chk.checked) chk.disabled = true;
      update();
    }); // a tick can't be taken back
    ok.addEventListener("click", () => {
      if (!chk.checked) return;
      store.set(KEY, { accepted: true, when: new Date().toISOString(), build: APP_BUILD, version: LEGAL_VER });
      close();
    });
    document.getElementById("legalver").textContent = LEGAL_VER;
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !dlg.dataset.required) {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const f = [...dlg.querySelectorAll("button,input,[tabindex]")].filter((x) => !x.disabled);
        if (!f.length) return;
        const a = f[0],
          z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    });
    document.getElementById("showlegal").onclick = () => open(false);
    const ab = document.getElementById("about");
    let abFocus = null;
    /**
     * Closes the About box.
     */
    const abClose = () => {
      ab.hidden = true;
      document.body.style.overflow = "";
      if (abFocus && abFocus.focus) abFocus.focus();
    };
    document.getElementById("showabout").onclick = () => {
      abFocus = document.activeElement;
      document.getElementById("aboutver").textContent =
        "Version " + (document.querySelector(".vnum")?.textContent || "").replace(/^v/, "");
      ab.hidden = false;
      document.body.style.overflow = "hidden";
      setTimeout(() => document.getElementById("aboutclose").focus(), 0);
    };
    document.getElementById("aboutclose").onclick = abClose;
    ab.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        abClose();
      }
    });
    // each new build (a new version installed) asks for the agreement again before the app can be used
    const rec = store.get(KEY, null);
    if (!rec || !rec.accepted || String(rec.build || "") !== String(APP_BUILD) || rec.version !== LEGAL_VER) open(true);
  })();
}
