/**
 * Winds aloft: a table of heights, speeds and directions typed in by hand (or filled from the forecast).
 */
import { esc } from "../core/helpers.js";
import { L } from "../design/defaults.js";
import { changed } from "../ui/state.js";
import { fmt, fromDisp, toDisp, uname } from "../ui/units.js";
import { wxSiteNote } from "./forecast.js";
/* ---------- winds aloft: a table of heights, speeds and directions, typed in by hand ---------- */
/**
 * The winds-aloft table is unfolded.
 */
var aloftOpen = false;
/**
 * Draws the winds-aloft rows and the temperature-aloft note.
 */
export function renderAloft() {
  const box = document.getElementById("aloftlist");
  if (!box) return;
  {
    const tn = document.getElementById("taloftnote"),
      TA = L.tempAloft || [];
    if (tn) {
      tn.hidden = !TA.length;
      if (TA.length) {
        const top = TA[TA.length - 1];
        tn.textContent = `Air temperatures from the forecast are used up to ${fmt(top.z, "alt")} ${uname("alt")} (${Math.round(toDisp(top.T, "temp"))} ${uname("temp")} there), for the air's density and the speed of sound. Above that, and without a forecast, the standard atmosphere is used. Clear removes them with the winds.`;
      }
    }
  }
  const rows = L.aloft || [];
  wxSiteNote();
  // a long table (a forecast fills 30–40 levels) folds to a one-line summary
  if (rows.length > 8 && !aloftOpen) {
    const top = Math.max(...rows.map((r) => r.alt)),
      fast = rows.reduce((a, r) => (r.speed > a.speed ? r : a), rows[0]);
    box.innerHTML = `<div class="aloftsum"><span class="note" style="margin:0">${rows.length} levels to ${fmt(top, "alt")} ${uname("alt")}; strongest ${fmt(fast.speed, "wind")} ${uname("wind")} at ${fmt(fast.alt, "alt")} ${uname("alt")}${L.aloftSrc ? `. ${esc(L.aloftSrc)}` : ""}.</span><button class="btn ghost" type="button" id="aloftshow">Show all levels</button></div>`;
    document.getElementById("aloftshow").onclick = () => {
      aloftOpen = true;
      renderAloft();
    };
    return;
  }
  box.innerHTML =
    (rows.length > 8
      ? `<div class="aloftsum"><span class="note" style="margin:0">${rows.length} levels${L.aloftSrc ? `. ${esc(L.aloftSrc)}` : ""}</span><button class="btn ghost" type="button" id="aloftshow">Hide levels</button></div>`
      : "") +
    (rows.length
      ? `<div class="ahead"><span>Height above pad (${uname("alt")})</span><span>Speed (${uname("wind")})</span><span>From (compass °)</span><span></span></div>` +
        rows
          .map(
            (
              r,
              i,
            ) => `<div class="arow" data-i="${i}"><div class="fld"><div class="in"><input type="number" inputmode="decimal" step="any" data-k="alt" value="${+toDisp(r.alt, "alt").toFixed(0)}" aria-label="Height above pad"></div></div>
      <div class="fld"><div class="in"><input type="number" inputmode="decimal" step="any" data-k="speed" value="${+toDisp(r.speed, "wind").toFixed(1)}" aria-label="Wind speed"></div></div>
      <div class="fld"><div class="in"><input type="number" inputmode="decimal" step="any" data-k="dir" value="${+(+r.dir).toFixed(0)}" aria-label="Wind from, compass degrees"></div></div>
      <button class="x" type="button" aria-label="Remove this level">×</button></div>`,
          )
          .join("")
      : "");
  {
    const b = document.getElementById("aloftshow");
    if (b)
      b.onclick = () => {
        aloftOpen = false;
        renderAloft();
      };
  }
  box.querySelectorAll(".arow").forEach((row) => {
    const i = +row.dataset.i;
    row.querySelectorAll("input").forEach((inp) =>
      inp.addEventListener("input", () => {
        const v = parseFloat(inp.value);
        if (!isFinite(v)) return;
        const k = inp.dataset.k;
        L.aloft[i][k] =
          k === "alt" ? fromDisp(v, "alt") : k === "speed" ? fromDisp(v, "wind") : ((v % 360) + 360) % 360;
        L.aloftSrc = "";
        changed();
      }),
    );
    row.querySelector(".x").onclick = () => {
      L.aloft.splice(i, 1);
      L.aloftSrc = "";
      changed();
      renderAloft();
    };
  });
}

/**
 * Sets aloftOpen (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setAloftOpen(v) {
  return (aloftOpen = v);
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.getElementById("aloftadd").onclick = () => {
    L.aloft = L.aloft || [];
    const last = L.aloft[L.aloft.length - 1];
    L.aloft.push(
      last
        ? { alt: last.alt + 1000, speed: last.speed, dir: last.dir }
        : { alt: 1000, speed: Math.max(L.wind * 1.5, 5), dir: L.windDir ?? 270 },
    );
    L.aloftSrc = "";
    aloftOpen = true;
    changed();
    renderAloft();
  };
}
