/**
 * The Learn page: short chapters on how rockets fly and how this app works them out (learn-content.js), reached from
 * Settings and from the "Learn more" line in the help boxes of a few key fields.
 */
import { esc } from "../core/helpers.js";
import { openLink } from "./donate.js";
import { learnChapters } from "./learn-content.js";

let learnFocus = null;
/**
 * Shows the list of chapters, or one chapter.
 * @param {string|null} id the chapter's id, or null for the list
 */
function learnShow(id) {
  const dlg = document.getElementById("learn"),
    head = dlg.querySelector(".head"),
    body = dlg.querySelector(".body"),
    foot = dlg.querySelector(".foot"),
    all = learnChapters(),
    i = all.findIndex((c) => c.id === id);
  if (i < 0) {
    head.innerHTML = `<h2 id="learn-title">Learn</h2><p>How rockets fly, and how this app works them out.</p>`;
    let grp = "",
      n = 0,
      h = "";
    for (const c of all) {
      if (c.group !== grp) {
        grp = c.group;
        h += `<div class="grp">${esc(grp)}</div>`;
      }
      const basic = c.group === all[0].group;
      h += `<button type="button" class="ch${basic ? "" : " deep"}" data-ch="${c.id}"><span class="n" aria-hidden="true">${basic ? ++n : "+"}</span><span><b>${esc(c.title)}</b><span>${esc(c.sub)}</span></span></button>`;
    }
    body.innerHTML = h;
    foot.innerHTML = `<button class="btn" type="button" data-close>Close</button>`;
  } else {
    const c = all[i],
      basic = c.group === all[0].group,
      num = basic ? `${i + 1}. ` : "",
      prev = all[i - 1],
      next = all[i + 1];
    head.innerHTML = `<button type="button" class="linkbtn crumb" data-ch="">‹ Learn · ${esc(c.group)}</button><h2 id="learn-title">${num}${esc(c.title)}</h2>`;
    body.innerHTML = c.html;
    foot.innerHTML = `<div class="row mrow lnav">${prev ? `<button class="btn ghost" type="button" data-ch="${prev.id}">‹ ${esc(prev.title)}</button>` : "<span></span>"}${next ? `<button class="btn" type="button" data-ch="${next.id}">${esc(next.title)} ›</button>` : `<button class="btn" type="button" data-close>Close</button>`}</div>`;
  }
  body.scrollTop = 0;
  body.focus();
}
/**
 * Opens the Learn page, at a chapter or at the list.
 * @param {string} [id] the chapter's id
 */
export function learnOpen(id) {
  const dlg = document.getElementById("learn");
  if (dlg.hidden) learnFocus = document.activeElement;
  dlg.hidden = false;
  document.body.style.overflow = "hidden";
  learnShow(id || null);
}
/**
 * Closes the Learn page and puts the focus back.
 */
export function learnClose() {
  document.getElementById("learn").hidden = true;
  document.body.style.overflow = "";
  if (learnFocus && learnFocus.focus) learnFocus.focus();
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  const dlg = document.getElementById("learn");
  dlg.addEventListener("click", (e) => {
    const t = e.target;
    if (t === dlg || t.closest("[data-close]")) return learnClose();
    const ch = t.closest("[data-ch]");
    if (ch) return learnShow(ch.dataset.ch || null);
    // outside links open in the browser (the Android app hands them on)
    const a = t.closest("a[href^='http']");
    if (a) {
      e.preventDefault();
      openLink(a.href);
    }
  });
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      learnClose();
    }
  });
}
