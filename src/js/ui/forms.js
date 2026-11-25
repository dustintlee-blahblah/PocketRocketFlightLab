/**
 * The forms: the field lists (launch conditions, range settings, imperfections and the dispersion spreads) and
 * drawing them (renderForms). The rocket itself is edited in the parts builder on the Rocket tab.
 */
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import { D, L, units } from "../design/defaults.js";
import { RANGE_KEYS } from "../files/save.js";
import { renderSavePanel, renderTitle } from "../files/unsaved-changes.js";
import { bpRender } from "../recovery/ejection-charge.js";
import { fieldInfo, infoBtn } from "./field-help.js";
import { siteRender } from "./launch-sites.js";
import { renderMountNote } from "./motor-tab.js";
import { mcFoldSum, mtSummary, renderRSO } from "./rso-checklist.js";
import { changed, renderInertiaNote, renderRecNote } from "./state.js";
import { DIMS, fromDisp, toDisp, uname } from "./units.js";
import { renderAloft } from "../weather/winds-aloft.js";
/* ---------- forms ---------- */
/**
 * Form fields by group element id: [key, label, dimension, object ("L": all of them are launch settings), decimals,
 * options].
 */
export const FIELDS = {
  "g-stagelock": [
    ["ignMinAlt", "Lowest height to light the sustainer", "alt", "L"],
    ["ignMaxTilt", "Most tilt to light the sustainer", "deg", "L", 0],
  ],
  "g-mc": [
    ["mcN", "Number of flights", "int", "L"],
    ["mcWind", "Wind speed", "pct", "L", 0],
    ["mcDir", "Wind direction", "deg", "L", 0],
    ["mcImp", "Motor impulse", "pct", "L", 1],
    ["mcMass", "Rocket weight", "pct", "L", 1],
    ["mcBal", "Balance (CG against CP), share of length", "pct", "L", 1],
    ["mcCd", "Drag", "pct", "L", 0],
    ["mcAngle", "Rail angle", "deg", "L", 1],
    ["mcMis", "Thrust misalignment", "deg", "L", 2],
    ["mcDelay", "Ejection delay", "pct", "L", 0],
    ["mcChute", "Parachute drag", "pct", "L", 0],
    ["mcThermal", "Up and down drafts", "wind", "L", 1],
  ],
  "g-imperf": [
    ["thrustMis", "Thrust misalignment", "deg", "L", 2],
    ["finMis", "One fin misaligned by", "deg", "L", 2],
    ["cgOff", "CG off the centerline by", "small", "L"],
    [
      "clusterFail",
      "One cluster motor fails to light",
      "sel",
      "L",
      null,
      [
        ["false", "No"],
        ["true", "Yes"],
      ],
    ],
  ],
  "g-range": [
    ["elev", "Field elevation", "alt", "L"],
    ["waiver", "Waiver ceiling", "alt", "L"],
    [
      "waiverRef",
      "Ceiling measured from",
      "sel",
      "L",
      null,
      [
        ["agl", "Ground (AGL)"],
        ["msl", "Sea level (MSL)"],
      ],
    ],
    ["recRadius", "Recovery area radius", "dist", "L"],
  ],
  "g-launch": [
    [
      "railType",
      "Rail or rod type",
      "sel",
      "L",
      null,
      [
        ["", "Not set"],
        ["rod18", "1/8 in rod"],
        ["rod316", "3/16 in rod"],
        ["rod14", "1/4 in rod"],
        ["rod516", "5/16 in rod"],
        ["rod38", "3/8 in rod"],
        ["rod12", "1/2 in rod"],
        ["r1010", "1010 rail"],
        ["r1515", "1515 rail"],
        ["tower", "Launch tower"],
        ["other", "Other"],
      ],
    ],
    ["rail", "Rail length", "alt", "L", 1],
    ["angle", "Rail angle from vertical", "deg", "L"],
    [
      "railMode",
      "Rail leans",
      "sel",
      "L",
      null,
      [
        ["into", "Into the wind"],
        ["fixed", "Toward a set direction"],
      ],
    ],
    ["railDir", "Rail leans toward", "deg", "L", 0],
    ["cone", "Safety cone", "deg", "L", 0],
    [
      "flightType",
      "Flight type",
      "sel",
      "L",
      null,
      [
        ["standard", "Standard"],
        ["cert", "Certification flight"],
        ["first", "First flight"],
        ["headsup", "Heads-up"],
      ],
    ],
  ],
  "g-ambient": [
    ["tempC", "Temperature", "temp", "L"],
    ["pressure", "Air pressure at the pad", "press", "L"],
    ["humidity", "Relative humidity", "pct", "L", 0],
    ["dewC", "Dew point", "temp", "L", 1],
    ["wind", "Wind speed at the pad", "wind", "L"],
    ["windRef", "Wind measured at height", "alt", "L", 1],
    [
      "windProfile",
      "Wind with altitude",
      "sel",
      "L",
      null,
      [
        ["typical", "Increases, typical day (1/7 power)"],
        ["shear", "Increases, calm morning or evening (0.25 power)"],
        ["constant", "Same at all altitudes"],
      ],
    ],
    ["windDir", "Wind blowing from", "deg", "L", 0],
    ["turb", "Gustiness", "pct", "L", 0],
    ["ceiling", "Cloud base elevation (0 = clear)", "alt", "L", 0],
    ["cloudLow", "Low cloud cover", "pct", "L", 0],
    ["cloudMid", "Mid-level cloud cover", "pct", "L", 0],
    ["cloudHigh", "High cloud cover", "pct", "L", 0],
    ["vis", "Visibility (0 = not set)", "vis", "L"],
    ["precip", "Chance of precipitation", "pct", "L", 0],
  ],
  "g-motortemp": [["motorDT", "Motor temperature above air", "dtemp", "L", 0]],
};
/**
 * The range each Range-tab number can take, in the app's own units (metres, °C, pascals, fractions for %). A value
 * typed outside it is held at the nearer end and the field shows what is used: a rocket can't launch from 1,000 km up
 * or in a 1,000 mph wind, and simulating one only gives a misleading answer. The ends are wide: the highest launch
 * sites and the hardest weather a club would fly in, with room to spare.
 */
const FIELD_LIMITS = {
  ignMinAlt: [0, 100000],
  ignMaxTilt: [0, 90],
  mcN: [10, 1000],
  mcWind: [0, 1],
  mcDir: [0, 180],
  mcImp: [0, 0.5],
  mcMass: [0, 0.5],
  mcBal: [0, 0.5],
  mcCd: [0, 1],
  mcAngle: [0, 30],
  mcMis: [0, 10],
  mcDelay: [0, 1],
  mcChute: [0, 1],
  mcThermal: [0, 10],
  thrustMis: [0, 10],
  finMis: [0, 10],
  cgOff: [0, 0.1],
  elev: [-500, 6000],
  waiver: [0, 200000],
  recRadius: [0, 100000],
  rail: [0.1, 50],
  angle: [0, 45],
  railDir: [-360, 720],
  cone: [0, 90],
  tempC: [-50, 60],
  pressure: [40000, 110000],
  humidity: [0, 1],
  dewC: [-80, 60],
  wind: [0, 45],
  windRef: [0.5, 1000],
  windDir: [-360, 720],
  turb: [0, 1],
  ceiling: [0, 20000],
  cloudLow: [0, 1],
  cloudMid: [0, 1],
  cloudHigh: [0, 1],
  vis: [0, 200000],
  precip: [0, 1],
  motorDT: [-60, 60],
};
/**
 * Draws every form group in FIELDS with the current values and units, and the notes that go with them.
 */
export function renderForms() {
  if (typeof mtSummary === "function") setTimeout(mtSummary, 0);
  try {
    bpRender();
  } catch (e) {}
  renderInertiaNote();
  renderTitle();
  renderRecNote();
  for (const [gid, list] of Object.entries(FIELDS)) {
    const g = document.getElementById(gid);
    g.innerHTML = "";
    for (const [k, lab, dim, , decOverride, opts] of list) {
      const O = L,
        id = "f-" + k;
      const wrap = document.createElement("div");
      wrap.className = "fld";
      // the rail's lean direction only applies to a rail set to lean a fixed way
      const off = L.railMode !== "fixed" && k === "railDir";
      if (off) wrap.classList.add("off");
      let html = `<div class="lh"><label for="${id}">${lab}</label>${infoBtn(lab, fieldInfo(k), k === "windProfile" ? "weather" : "")}</div><div class="in">`;
      if (dim === "sel") {
        html +=
          `<select id="${id}">` +
          opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("") +
          `</select>`;
      } else {
        // pressure and humidity left unset show blank (standard air, dry) rather than a 0 that reads like a measurement
        const blank = (k === "pressure" || k === "humidity") && !(O[k] > 0),
          ph = k === "pressure" ? "Standard" : k === "humidity" || k === "dewC" ? "Not set" : "";
        const val =
          O[k] == null || blank
            ? ""
            : dim === "int"
              ? O[k]
              : +toDisp(O[k], dim).toFixed(
                  decOverride ??
                    (dim === "temp"
                      ? 1
                      : Math.max(DIMS[units][dim]?.[2] ?? 2, dim === "len" && units === "imp" ? 2 : 0)),
                );
        html +=
          `<input id="${id}" type="number" inputmode="decimal" step="any" value="${val}"${ph ? ` placeholder="${ph}"` : ""}>` +
          (dim !== "int" && uname(dim) ? `<span class="u">${uname(dim)}</span>` : "");
      }
      wrap.innerHTML = html + "</div>";
      g.appendChild(wrap);
      const el = wrap.querySelector("input,select");
      if (off) el.disabled = true;
      if (dim === "sel") {
        const cur = String(O[k]);
        const match = [...el.options].find(
          (o) =>
            o.value === cur ||
            (o.value !== "" && !isNaN(+o.value) && !isNaN(+cur) && Math.abs(+o.value - +cur) < 1e-12),
        );
        if (match) el.value = match.value;
        el.addEventListener("change", () => {
          if (RANGE_KEYS.includes(k)) {
            L[k] = el.value;
            store.set("rfs-launch", L);
            el.dataset.shown = el.value;
            renderRSO();
            siteRender();
            return;
          }
          O[k] = k === "clusterFail" ? el.value === "true" : isNaN(+el.value) ? el.value : +el.value;
          if (k === "railMode") renderForms();
          changed();
        });
      } else {
        // leaving the field: a value held at the end of its range shows what is used, and says so
        el.addEventListener("change", () => {
          const v = parseFloat(el.value),
            lim = FIELD_LIMITS[k];
          if (!lim || !isFinite(v) || dim === "int" || O[k] == null) return;
          const raw = fromDisp(v, dim);
          if (raw >= lim[0] - 1e-9 && raw <= lim[1] + 1e-9) return;
          el.value = +toDisp(O[k], dim).toFixed(dim === "temp" ? 1 : (DIMS[units][dim]?.[2] ?? 2));
          el.dataset.shown = el.value;
          if (window.prToast)
            prToast(
              `${lab}: ${el.value} ${dim === "pct" ? "%" : uname(dim)} is the ${raw > lim[1] ? "most" : "least"} the simulation takes.`,
            );
        });
        el.addEventListener("input", () => {
          const v = parseFloat(el.value);
          if (el.value.trim() === "" && ["pressure", "humidity", "dewC"].includes(k)) {
            O[k] = k === "dewC" ? null : 0;
            el.dataset.shown = "";
            changed();
            return;
          } // cleared: back to standard air
          if (!isFinite(v)) return;
          O[k] = dim === "int" ? Math.max(1, Math.round(v)) : fromDisp(v, dim);
          const lim = FIELD_LIMITS[k];
          if (lim && !(k === "pressure" && O[k] === 0)) O[k] = Math.min(lim[1], Math.max(lim[0], O[k]));
          // the dispersion spreads don't change the flight itself: keep the results, just remember the setting
          if (RANGE_KEYS.includes(k)) {
            store.set("rfs-launch", L);
            el.dataset.shown = el.value;
            renderRSO();
            siteRender();
            return;
          }
          changed();
        });
      }
      el.dataset.shown = el.value;
    }
  }
  renderSavePanel();
  renderMountNote();
  if (typeof renderAloft === "function") renderAloft();
  mcFoldSum();
  {
    const sp = document.getElementById("stagelockpanel");
    if (sp) sp.hidden = !D.twoStage;
  }
}
