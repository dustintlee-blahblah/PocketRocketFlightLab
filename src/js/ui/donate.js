/* ---------- donations (Venmo) ----------
   A "Support the app" card in Settings is always there. Once, after someone has got real use from the app (their 10th
   launch, or their first saved flight report), a single line shows above the flight report; closing it or tapping
   through means it never shows again. Nothing pops up or gets in the way. */
const VENMO_URL = "https://venmo.com/u/PocketRocketFlightLab",
  PAYPAL_URL = "https://www.paypal.com/qrcodes/p2pqrc/6SFLPUHMKC9FY";
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
// the flight report shows the flier's profile; say so when this copy of the app has none
function profNoteRender() {
  const n = document.getElementById("exportprof");
  if (!n) return;
  n.hidden = !!(PROFILE.name || PROFILE.club || PROFILE.nar || PROFILE.tra || PROFILE.cert);
}
document.getElementById("exportprofbtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (window.prOpenProfile) window.prOpenProfile();
});
function supDone() {
  store.set("rfs-support", { done: true });
  const l = document.getElementById("supline");
  if (l) l.hidden = true;
}
function supRender() {
  const l = document.getElementById("supline");
  if (!l) return;
  const v = store.get("rfs-support", {});
  l.hidden = !lastSim || !!v.done || !((v.runs || 0) >= 10 || v.report);
}
function supNote(k) {
  const v = store.get("rfs-support", {});
  if (v.done) return;
  if (k === "run") v.runs = (v.runs || 0) + 1;
  else v[k] = true;
  store.set("rfs-support", v);
  supRender();
}
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
document.getElementById("runbtn").onclick = runNow;
document.getElementById("emptylaunch").onclick = runNow;
document.getElementById("simsave").onclick = async () => {
  if (!SOURCE) {
    prToast("Save the design to a file first (Rocket tab), then runs can be saved into it.");
    return;
  }
  const b = document.getElementById("simsave");
  b.disabled = true;
  try {
    const ok = await saveDesignFile(false, { addSim: true });
    const t = (document.getElementById("savemsg").textContent || "").trim();
    const sn = (window.prLastSimNote || "").trim();
    prToast(ok && /added/.test(sn) ? `Saved this run into ${SOURCE.name}.` : ok && sn ? sn : t || "Not saved.");
  } finally {
    b.disabled = !SOURCE;
  }
};
(function () {
  const KEY = "rfs-disclaimer-v2",
    LEGAL_VER = "2026-11-02",
    dlg = document.getElementById("legal"),
    chk = document.getElementById("legalchk"),
    ok = document.getElementById("legalok");
  let lastFocus = null;
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
  const close = () => {
    dlg.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };
  // "I agree" works only once the whole text has been scrolled through and the box is ticked
  const body = dlg.querySelector(".body"),
    hint = document.getElementById("legalhint");
  let readAll = false;
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
document.getElementById("exportbtn").onclick = exportPdf;
