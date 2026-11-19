/**
 * The Learn page: chapters in three levels (learn-content.js), picked at the top and remembered, reached from Settings
 * and from the "Learn more" line in the help boxes of a few key fields.
 */
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import { openLink } from "./donate.js";
import { learnChapters } from "./learn-content.js";

let learnFocus = null;
/**
 * The Learn page's levels: the chapters' group, its label on the switch, who it is for, and the mark beside its
 * chapters (a number to read in order, or a symbol).
 */
const LEARN_LEVELS = [
  ["Getting started", "Getting started", "New to rocketry, or to simulators: start here, in order.", "n"],
  [
    "Mid & high power",
    "Mid & high power",
    "For H to K motors and up: certification, waivers, electronics and going fast. Examples are 38–54 mm rockets.",
    "◆",
  ],
  [
    "Technical",
    "Technical",
    "The physics and the numbers: methods, equations, sources and how well it matches real flights.",
    "+",
  ],
];
/**
 * The level picked (remembered between visits), as a chapter group.
 * @returns {string}
 */
function learnLevel() {
  const v = store.get("rfs-learn-level");
  return LEARN_LEVELS.some((l) => l[0] === v) ? v : LEARN_LEVELS[0][0];
}
/**
 * Shows the list of chapters for the level picked, or one chapter.
 * @param {string|null} id the chapter's id, or null for the list
 */
function learnShow(id) {
  const dlg = document.getElementById("learn"),
    head = dlg.querySelector(".head"),
    body = dlg.querySelector(".body"),
    foot = dlg.querySelector(".foot"),
    all = learnChapters(),
    c = all.find((x) => x.id === id);
  if (!c) {
    const lv = learnLevel(),
      L = LEARN_LEVELS.find((l) => l[0] === lv);
    head.innerHTML = `<h2 id="learn-title">Learn</h2><p>How rockets fly, and how this sim works.</p>
      <div class="cmpseg learnlv" role="tablist" aria-label="Level">${LEARN_LEVELS.map(
        ([g, label]) =>
          `<button type="button" role="tab" data-lv="${esc(g)}" aria-selected="${g === lv}"${g === lv ? ' class="on"' : ""}>${esc(label)}</button>`,
      ).join("")}</div>`;
    let n = 0;
    body.innerHTML =
      `<p class="note lvnote">${esc(L[2])}</p>` +
      all
        .filter((x) => x.group === lv)
        .map(
          (x) =>
            `<button type="button" class="ch${L[3] === "n" ? "" : " deep"}" data-ch="${x.id}"><span class="n" aria-hidden="true">${L[3] === "n" ? ++n : L[3]}</span><span><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></span></button>`,
        )
        .join("");
    foot.innerHTML = `<button class="btn" type="button" data-close>Close</button>`;
  } else {
    const L = LEARN_LEVELS.find((l) => l[0] === c.group) || LEARN_LEVELS[0],
      same = all.filter((x) => x.group === c.group),
      i = same.indexOf(c),
      num = L[3] === "n" ? `${i + 1}. ` : "",
      prev = same[i - 1],
      next = same[i + 1];
    // a chapter opened from a help box shows its own level when you go back to the list
    store.set("rfs-learn-level", c.group);
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
    const lv = t.closest("[data-lv]");
    if (lv) {
      store.set("rfs-learn-level", lv.dataset.lv);
      return learnShow(null);
    }
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
