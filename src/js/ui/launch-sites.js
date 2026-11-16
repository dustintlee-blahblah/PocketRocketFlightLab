/**
 * Saved launch sites: each one keeps a field's own settings (location, elevation, rail, waiver, cone...), not the day's
 * weather. The chosen site stays in force when another rocket is opened.
 */
import { photoKey, sitePhotoDrop, sitePhotoReady } from "../animation/site-photo.js";
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import { L } from "../design/defaults.js";
import { downloadsNS } from "../report/pdf-report.js";
import { renderForms } from "./forms.js";
import { changed } from "./state.js";
import { fmt, uname } from "./units.js";
import { parseLatLon, prFetchText } from "../weather/forecast.js";
/* ---------- launch sites and field-day mode ---------- */
/**
 * The saved-sites manager's state: open, the site being renamed, the site waiting for delete confirmation.
 *
 * A field's own settings (not the day's weather: the height the wind is measured at goes with the wind reading)
 */
var SITEMGR = { open: false, edit: null, del: null, add: false, note: "" }; // the saved-sites manager (below)
/**
 * The launch-condition keys a site keeps (see the note above).
 */
const SITE_KEYS = [
  "elev",
  "lat",
  "lon",
  "waiver",
  "waiverRef",
  "recRadius",
  "flightType",
  "railType",
  "rail",
  "angle",
  "railMode",
  "railDir",
  "cone",
]; // every field under Launch site, Range and Launch pad
const SITE_DIFF_KEYS = SITE_KEYS.filter((k) => k !== "flightType"); // saved with the site, but changing it alone isn't an unsaved change
/**
 * The saved sites: [{name, v: {key: value}}].
 * @returns {object[]}
 */
const sitesGet = () => {
  const v = store.get("rfs-sites", []);
  return Array.isArray(v) ? v : [];
};
export let siteCur;
/* well-known launch fields, each added once to the saved sites (names you already use, and fields within about a
   mile of a site you've saved, are skipped; a field you delete doesn't come back). Coordinates and elevations are from
   each club's own site page where it gives them, or as flown from by the app's author; elev null: looked up from map
   data the first time the site is chosen. A field added to this list in a later build carries that list's number, so
   an app already in use picks up just the new ones. */
/** The number of the list below: raised each time fields are added to it. */
const SITE_PRESETS_VER = 2;
/**
 * Well-known launch fields: [name, latitude, longitude, elevation m or null, the list number it was added in (1 if
 * not given)].
 */
const SITE_PRESETS = [
  ["Argonia, KS (KLOUDBusters)", 37.170278, -97.736667, 384.0],
  ["Black Rock Desert, NV (AeroPac)", 40.870683, -119.10695, 1219.2],
  ["Bonneville Salt Flats, UT", 40.791281, -113.821553, 1316.7],
  ["Brothers, OR (OROC)", 43.799278, -120.650169, 1371.6],
  ["Church Hill, MD (MDRA Higgs Farm)", 39.078542, -75.876346, null],
  ["Clio, MI (Alkay Airport)", 43.14434, -83.796643, 217.6, 2],
  ["Frank Hunt Field, UT", 40.218224, -112.246072, 1542.9, 2],
  ["Jean Dry Lake, NV (Tripoli Vegas)", 35.786389, -115.25, 844.9],
  ["Lucerne Dry Lake, CA (ROC)", 34.495, -116.96, 868.7],
  ["Manchester, MI (JMRC)", 42.1802, -83.9498, 304.8, 2],
  ["Mojave Desert, CA (FAR)", 35.346945, -117.807858, 630.0, 2],
  ["Pueblo, CO (SCORE)", 38.155458, -104.808906, 1669.4],
  ["Seymour, TX (Tripoli North Texas)", 33.501037, -99.338722, null],
  ["Spaceport America, NM", 32.99028, -106.96972, 1400.6],
  ["Swan Falls, ID (Tripoli Idaho)", 43.2375, -116.324167, null],
  ["Tripoli Minnesota field, MN", 45.546058, -92.92464, null],
];
/**
 * Draws the site picker and its buttons.
 */
export function siteRender() {
  const sel = document.getElementById("sitesel");
  if (!sel) return;
  const S = sitesGet();
  if (siteCur && !S.some((x) => x.name === siteCur)) siteCur = "";
  sel.innerHTML =
    `<option value="">${S.length ? "Choose a saved site…" : "No saved sites yet"}</option>` +
    S.map((x) => `<option value="${esc(x.name)}"${x.name === siteCur ? " selected" : ""}>${esc(x.name)}</option>`).join(
      "",
    );
  sel.disabled = !S.length;
  {
    // always there: new sites are added from it
    document.getElementById("sitemanage").hidden = false;
  }
  if (SITEMGR.open) siteMgrRender();
  // the site's settings changed on this tab since it was chosen
  const x = S.find((x) => x.name === siteCur),
    msg = document.getElementById("sitemsg");
  if (x && msg && !msg.dataset.keep) {
    const b = siteBase(x),
      diff = SITE_DIFF_KEYS.some((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(L[k] ?? null));
    msg.innerHTML = diff
      ? `Changed from the saved ${esc(x.name)} settings. Tap Save Changes to keep them, or <button type="button" class="linkbtn" id="siterestore">go back to the saved ones</button>.`
      : "";
    const rb = document.getElementById("siterestore");
    if (rb) rb.onclick = () => siteApply(x.name);
  }
  siteBtnUpdate();
}
/**
 * The current values of the site keys. The chosen site stays in force when another rocket is opened (a design file
 * carries launch conditions of its own).
 * @returns {object}
 */
function siteSnap() {
  const v = {};
  for (const k of SITE_KEYS) v[k] = L[k] ?? null;
  return v;
}
/**
 * Records the site's settings as just chosen or saved, to tell later whether they changed.
 * @param {string} name
 */
function siteBaseSet(name) {
  store.set("rfs-site-base", { name, v: siteSnap() });
}
/**
 * The settings a site was chosen with (its saved values, filled in from when it was chosen).
 * @param {object} x site
 * @returns {object}
 */
function siteBase(x) {
  const b = store.get("rfs-site-base", null),
    v = {};
  for (const k of SITE_KEYS)
    v[k] = x.v[k] != null ? x.v[k] : b && b.name === x.name && k in b.v ? b.v[k] : (L[k] ?? null);
  if (!b || b.name !== x.name) store.set("rfs-site-base", { name: x.name, v });
  return v;
}
/**
 * Shows Save Changes only when there is something to save: the chosen site's settings were changed on this tab.
 */
function siteBtnUpdate() {
  const btn = document.getElementById("sitesave");
  if (!btn) return;
  const x = siteCur && sitesGet().find((s) => s.name === siteCur);
  let diff = false;
  if (x) {
    const b = siteBase(x);
    diff = SITE_DIFF_KEYS.some((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(L[k] ?? null));
  }
  btn.hidden = !diff;
}
/**
 * Which of your saved launch sites a set of launch settings is at: the one with this name, else one within about 100 m
 * and 10 m of elevation of its coordinates.
 * @param {string} name the site's name as saved, or ""
 * @param {object} l launch settings (lat, lon, elev)
 * @returns {string} the site's name, or "" if none matches
 */
export function siteFind(name, l) {
  const S = sitesGet();
  if (name && S.some((x) => x.name === name)) return name;
  if (!(isFinite(l.lat) && isFinite(l.lon))) return "";
  const near = S.find(
    (x) =>
      isFinite(x.v.lat) &&
      isFinite(x.v.lon) &&
      Math.abs(x.v.lat - l.lat) < 0.001 &&
      Math.abs(x.v.lon - l.lon) < 0.001 / Math.max(Math.cos((l.lat * Math.PI) / 180), 0.2) &&
      (x.v.elev == null || l.elev == null || Math.abs(x.v.elev - l.elev) < 10),
  );
  return near ? near.name : "";
}
/**
 * Puts the chosen site's settings back into L (after a design file brought its own).
 * @returns {string|null} the site's name
 */
export function siteKeep() {
  const x = siteCur && sitesGet().find((s) => s.name === siteCur);
  if (!x) return null;
  for (const k of SITE_KEYS) if (x.v[k] != null) L[k] = x.v[k];
  return x.name;
}
/**
 * Chooses a saved site and applies its settings.
 * @param {string} name
 */
function siteApply(name) {
  const x = sitesGet().find((s) => s.name === name);
  siteCur = name;
  store.set("rfs-site", siteCur);
  const m = document.getElementById("sitemsg");
  m.dataset.keep = "1";
  if (x) {
    for (const k of SITE_KEYS) if (x.v[k] !== undefined && x.v[k] !== null) L[k] = x.v[k];
    renderForms();
    changed();
    const set = SITE_KEYS.filter((k) => x.v[k] != null);
    m.textContent =
      set.length <= 3
        ? `Using ${name}: coordinates${x.v.elev != null ? " and field elevation" : ""} are set. Set the waiver and recovery area for the launch you’re going to, then Save Changes to keep them with it.`
        : `Using ${name}: field elevation, coordinates, waiver, recovery area and rail are set.`;
    siteBaseSet(name);
    if (x.v.elev == null && x.v.lat != null) siteElevLookup(x);
    // the site's aerial photo, for the 3D flight view
    sitePhotoReady(L.lat, L.lon);
  }
  siteRender();
  delete m.dataset.keep;
}
/**
 * Looks up the elevation of a site saved without one from map data (Open-Meteo's elevation service, 90 m terrain model;
 * see the note above) and keeps it with the site.
 * @param {object} x site
 */
async function siteElevLookup(x) {
  const m = document.getElementById("sitemsg");
  m.textContent = `Using ${x.name}. Looking up its field elevation…`;
  try {
    const j = JSON.parse(
      await prFetchText(
        `https://api.open-meteo.com/v1/elevation?latitude=${(+x.v.lat).toFixed(5)}&longitude=${(+x.v.lon).toFixed(5)}`,
      ),
    );
    const e = j && Array.isArray(j.elevation) ? +j.elevation[0] : NaN;
    if (!isFinite(e)) throw new Error("no elevation");
    const S = sitesGet().map((s) => (s.name === x.name ? { ...s, v: { ...s.v, elev: Math.round(e * 10) / 10 } } : s));
    store.set("rfs-sites", S);
    if (siteCur === x.name) {
      L.elev = Math.round(e * 10) / 10;
      siteBaseSet(x.name);
      renderForms();
      changed();
    }
    m.dataset.keep = "1";
    m.textContent = `Using ${x.name}: coordinates set, and field elevation ${fmt(e, "alt")} ${uname("alt")} from map data. Check it against the club’s figure if you have one.`;
    siteRender();
    delete m.dataset.keep;
  } catch (e) {
    m.dataset.keep = "1";
    m.textContent = `Using ${x.name}: coordinates set. Its field elevation couldn’t be looked up (it needs an internet connection), so the elevation under Range is still the one from before (${fmt(L.elev || 0, "alt")} ${uname("alt")}): enter this field’s and tap Save Changes.`;
    siteRender();
    delete m.dataset.keep;
  }
}
/**
 * Saves the current settings to the chosen site (Save Changes).
 */
function siteSave() {
  const name = siteCur,
    m = document.getElementById("sitemsg");
  if (!name || !sitesGet().some((x) => x.name === name)) return;
  const v = {};
  for (const k of SITE_KEYS) v[k] = L[k];
  const S = sitesGet().map((x) => (x.name === name ? { ...x, v } : x));
  store.set("rfs-sites", S);
  siteBaseSet(name);
  m.dataset.keep = "1";
  m.textContent = `Saved ${name}.`;
  siteRender();
  delete m.dataset.keep;
}
/**
 * Adds a site from the manager's Add site form: a name and, if given, coordinates. The rest of the site (waiver,
 * recovery area, rail) starts as today's settings; with coordinates other than today's its field elevation is left to
 * be looked up. The new site is then the one in use.
 * @param {string} name
 * @param {string} coord "latitude, longitude", or "" for a site without coordinates
 * @returns {string} "" if added, else what is wrong
 */
function siteAdd(name, coord) {
  name = (name || "").trim().slice(0, 40);
  if (!name) return "Type a name for the site.";
  if (sitesGet().some((s) => s.name.toLowerCase() === name.toLowerCase()))
    return `There's already a site called ${name}.`;
  const v = siteSnap();
  if (!coord.trim()) v.lat = v.lon = null;
  else {
    const r = parseLatLon(coord);
    if (!r)
      return "Couldn’t read the coordinates. Enter latitude, then longitude, separated by a comma, or leave them empty.";
    const moved = !(
      L.lat != null &&
      L.lon != null &&
      Math.abs(L.lat - r.lat) < 0.001 &&
      Math.abs(L.lon - r.lon) < 0.001
    );
    v.lat = r.lat;
    v.lon = r.lon;
    if (moved) v.elev = null; // another place: its own elevation, looked up when it is chosen
  }
  const S = sitesGet();
  S.push({ name, v });
  S.sort((a, b) => a.name.localeCompare(b.name));
  store.set("rfs-sites", S);
  SITEMGR.add = false;
  siteApply(name);
  return "";
}
/**
 * Saves every saved site as a file, to keep or to take to another device.
 */
async function sitesExport() {
  const S = sitesGet(),
    say = (t) => {
      SITEMGR.note = t;
      siteMgrRender();
    };
  if (!S.length) return say("There are no saved sites to export.");
  if (!downloadsNS) return say("Saving files isn’t available in this view.");
  const text = JSON.stringify(
    {
      app: "Pocket Rocket Flight Lab",
      kind: "launch-sites",
      version: 1,
      sites: S.map((x) => ({ name: x.name, v: x.v })),
    },
    null,
    1,
  );
  try {
    const res = await downloadsNS.save({
      filename: "pocket-rocket-launch-sites.json",
      data: new TextEncoder().encode(text).buffer,
    });
    say(
      res.status === "saved"
        ? `Saved ${S.length} site${S.length === 1 ? "" : "s"} as pocket-rocket-launch-sites.json.`
        : "Choose where to save the sites file.",
    );
  } catch (e) {
    say(e && e.code === "declined" ? "Save cancelled." : "Couldn’t save the sites file.");
  }
}
/**
 * Adds the sites in an exported file to the saved sites. A site with the name of one already saved replaces it; the
 * rest are added. Only a site's own settings are read from the file.
 * @param {File} file
 */
async function sitesImport(file) {
  const say = (t) => {
    SITEMGR.note = t;
    siteRender();
  };
  let list;
  try {
    const d = JSON.parse(await file.text());
    list = Array.isArray(d) ? d : d && Array.isArray(d.sites) ? d.sites : null;
  } catch (e) {
    list = null;
  }
  if (!list) return say("That isn’t a sites file exported from this app.");
  const S = sitesGet();
  let added = 0,
    updated = 0;
  for (const it of list.slice(0, 500)) {
    const name = it && typeof it.name === "string" ? it.name.trim().slice(0, 40) : "",
      src = it && it.v && typeof it.v === "object" ? it.v : null;
    if (!name || !src) continue;
    const v = {};
    for (const k of SITE_KEYS) {
      const x = src[k];
      if (x == null) continue;
      // numbers, short words and yes/no only: nothing else belongs in a site
      if ((typeof x === "number" && isFinite(x)) || typeof x === "boolean" || (typeof x === "string" && x.length <= 40))
        v[k] = x;
    }
    if (v.lat != null && !(typeof v.lat === "number" && Math.abs(v.lat) <= 90)) delete v.lat;
    if (v.lon != null && !(typeof v.lon === "number" && Math.abs(v.lon) <= 180)) delete v.lon;
    if (v.lat == null || v.lon == null) v.lat = v.lon = null;
    const i = S.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
    if (i >= 0) {
      S[i] = { name: S[i].name, v };
      updated++;
    } else {
      S.push({ name, v });
      added++;
    }
  }
  if (!added && !updated) return say("No sites were found in that file.");
  S.sort((a, b) => a.name.localeCompare(b.name));
  store.set("rfs-sites", S);
  say(
    `Imported ${added + updated} site${added + updated === 1 ? "" : "s"}: ${added} new${updated ? `, ${updated} replaced one of the same name` : ""}. Today’s settings weren’t changed.`,
  );
}
/* managing saved sites: add one, export or import them all, rename or delete each one. Deleting takes two steps
   (Delete, then confirm), so it can't happen by a stray tap */
/**
 * Opens or closes the saved-sites manager.
 * @param {boolean} open
 */
function siteMgrToggle(open) {
  SITEMGR.open = open;
  SITEMGR.edit = SITEMGR.del = null;
  SITEMGR.add = false;
  SITEMGR.note = "";
  const b = document.getElementById("sitemanage");
  b.setAttribute("aria-expanded", String(open));
  b.textContent = open ? "Done" : "Manage";
  document.getElementById("sitemgr").hidden = !open;
  if (open) siteMgrRender();
}
/**
 * Draws the saved-sites manager: rename or delete each site (deleting takes a confirmation).
 */
function siteMgrRender() {
  const box = document.getElementById("sitemgr"),
    S = sitesGet();
  if (!box) return;
  /**
   * A latitude or longitude as text.
   */
  const ll = (v) =>
    v.lat != null && v.lon != null ? `${(+v.lat).toFixed(4)}, ${(+v.lon).toFixed(4)}` : "no coordinates";
  // across the top: add a site, and take the whole list to a file and back
  let top = `<div class="stools"><button type="button" class="btn" data-t="add">Add site</button><button type="button" class="btn ghost" data-t="export">Export sites</button><label class="file btn ghost" for="siteimport">Import sites<input type="file" id="siteimport" accept=".json,application/json,text/plain"></label></div>`;
  if (SITEMGR.add)
    top += `<div class="sadd"><div class="fld"><label for="siteaddname">Site name</label><div class="in"><input id="siteaddname" type="text" maxlength="40" placeholder="Field name, e.g. Bonneville" autocomplete="off"></div></div><div class="fld"><label for="siteaddcoord">Latitude, longitude (optional)</label><div class="in"><input id="siteaddcoord" type="text" autocomplete="off" spellcheck="false" placeholder="40.218224, -112.246072" value="${L.lat != null && L.lon != null ? esc(`${(+L.lat).toFixed(6)}, ${(+L.lon).toFixed(6)}`) : ""}"></div></div><p class="note" style="margin:0">The waiver, recovery area and rail start as they are set now; change them under Range and tap Save Changes.</p><div class="sconf"><button type="button" class="btn" data-t="addsave">Add</button><button type="button" class="btn ghost" data-t="addcancel">Cancel</button><span class="serr" role="alert"></span></div></div>`;
  if (SITEMGR.note) top += `<p class="note snote" aria-live="polite">${esc(SITEMGR.note)}</p>`;
  if (!S.length) top += `<p class="note" style="margin:8px 0">No saved sites yet.</p>`;
  box.innerHTML =
    top +
    S.map((x, i) => {
      const cur = x.name === siteCur;
      let h = `<div class="srow" data-i="${i}"><div class="stop"><div style="min-width:0"><div class="snm">${esc(x.name)}</div><div class="smeta">${cur ? "In use · " : ""}${x.v.elev != null ? `${fmt(x.v.elev, "alt")} ${uname("alt")}` : "elevation not set"} · ${ll(x.v)}</div></div>`;
      h += `<div class="sact"><button type="button" class="btn ghost" data-a="ren">Rename</button><button type="button" class="btn ghost" data-a="del">Delete</button></div></div>`;
      if (SITEMGR.edit === x.name)
        h += `<div class="sconf"><input type="text" maxlength="40" class="sren" value="${esc(x.name)}" aria-label="New name for ${esc(x.name)}"><button type="button" class="btn" data-a="rsave">Save</button><button type="button" class="btn ghost" data-a="cancel">Cancel</button><p class="note serr" style="margin:0;width:100%"></p></div>`;
      if (SITEMGR.del === x.name)
        h += `<div class="sconf"><span>Delete <b>${esc(x.name)}</b>? This can’t be undone.</span><button type="button" class="btn danger" data-a="dyes">Delete</button><button type="button" class="btn ghost" data-a="cancel">Keep it</button></div>`;
      return h + `</div>`;
    }).join("");
  box.querySelectorAll("[data-t]").forEach(
    (b) =>
      (b.onclick = () => {
        const t = b.dataset.t;
        if (t === "export") return void sitesExport();
        SITEMGR.note = "";
        if (t === "add" || t === "addcancel") {
          SITEMGR.add = t === "add";
          SITEMGR.edit = SITEMGR.del = null;
          siteMgrRender();
          if (SITEMGR.add) document.getElementById("siteaddname").focus();
          return;
        }
        const err = siteAdd(
          document.getElementById("siteaddname").value,
          document.getElementById("siteaddcoord").value,
        );
        if (err) box.querySelector(".sadd .serr").textContent = err;
      }),
  );
  box.querySelectorAll(".sadd input").forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        box.querySelector('[data-t="addsave"]').click();
      }
    }),
  );
  {
    const imp = document.getElementById("siteimport");
    if (imp)
      imp.onchange = () => {
        const f = imp.files && imp.files[0];
        imp.value = "";
        if (f) sitesImport(f);
      };
  }
  box.querySelectorAll(".srow").forEach((row) => {
    const x = S[+row.dataset.i];
    row.querySelectorAll("[data-a]").forEach(
      (b) =>
        (b.onclick = () => {
          const a = b.dataset.a,
            m = document.getElementById("sitemsg");
          if (a === "ren") {
            SITEMGR.edit = x.name;
            SITEMGR.del = null;
            siteMgrRender();
            const inp = box.querySelector(".sren");
            if (inp) {
              inp.focus();
              inp.select();
            }
            return;
          }
          if (a === "del") {
            SITEMGR.del = x.name;
            SITEMGR.edit = null;
            siteMgrRender();
            return;
          }
          if (a === "cancel") {
            SITEMGR.edit = SITEMGR.del = null;
            siteMgrRender();
            return;
          }
          if (a === "dyes") {
            store.set(
              "rfs-sites",
              sitesGet().filter((s) => s.name !== x.name),
            );
            if (siteCur === x.name) {
              siteCur = "";
              store.set("rfs-site", "");
            }
            // its photo and terrain go with it, unless another saved site or today's settings are at the same place
            if (x.v.lat != null && x.v.lon != null) {
              const k = photoKey(x.v.lat, x.v.lon),
                same = (la, lo) => la != null && lo != null && photoKey(la, lo) === k;
              if (!same(L.lat, L.lon) && !sitesGet().some((s) => same(s.v.lat, s.v.lon)))
                sitePhotoDrop(x.v.lat, x.v.lon);
            }
            SITEMGR.del = null;
            m.dataset.keep = "1";
            m.textContent = `Deleted ${x.name}. Today's settings weren't changed.`;
            siteRender();
            delete m.dataset.keep;
            return;
          }
          if (a === "rsave") {
            const inp = row.querySelector(".sren"),
              err = row.querySelector(".serr"),
              nm = (inp.value || "").trim().slice(0, 40);
            if (!nm) {
              err.textContent = "Type a name.";
              inp.focus();
              return;
            }
            if (
              nm !== x.name &&
              sitesGet().some((s) => s.name.toLowerCase() === nm.toLowerCase() && s.name !== x.name)
            ) {
              err.textContent = `There's already a site called ${nm}.`;
              inp.focus();
              return;
            }
            const all = sitesGet()
              .map((s) => (s.name === x.name ? { ...s, name: nm } : s))
              .sort((a, b) => a.name.localeCompare(b.name));
            store.set("rfs-sites", all);
            if (siteCur === x.name) {
              siteCur = nm;
              store.set("rfs-site", siteCur);
              const b = store.get("rfs-site-base", null);
              if (b && b.name === x.name) store.set("rfs-site-base", { ...b, name: nm });
            }
            SITEMGR.edit = null;
            m.dataset.keep = "1";
            m.textContent = nm === x.name ? "" : `Renamed ${x.name} to ${nm}.`;
            siteRender();
            delete m.dataset.keep;
          }
        }),
    );
    const inp = row.querySelector(".sren");
    if (inp)
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          row.querySelector('[data-a="rsave"]').click();
        } else if (e.key === "Escape") {
          SITEMGR.edit = null;
          siteMgrRender();
        }
      });
  });
}

/**
 * Sets siteCur (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setSiteCur(v) {
  return (siteCur = v);
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  siteCur = store.get("rfs-site", "");
  /**
   * Adds the preset fields to the saved sites, each once.
   */
  (function sitePresetsAdd() {
    const have = store.get("rfs-site-presets", 0) || 0;
    if (have >= SITE_PRESETS_VER) return;
    const S = (() => {
        const v = store.get("rfs-sites", []);
        return Array.isArray(v) ? v : [];
      })(),
      near = (a, b) =>
        a.lat != null && a.lon != null && Math.abs(a.lat - b[1]) < 0.015 && Math.abs(a.lon - b[2]) < 0.02;
    for (const P of SITE_PRESETS) {
      if ((P[4] || 1) <= have) continue; // offered before: there already, or deleted since
      if (S.some((x) => x.name.toLowerCase() === P[0].toLowerCase() || near(x.v || {}, P))) continue;
      S.push({ name: P[0], v: { elev: P[3], lat: P[1], lon: P[2] }, preset: true });
    }
    S.sort((a, b) => a.name.localeCompare(b.name));
    store.set("rfs-sites", S);
    store.set("rfs-site-presets", SITE_PRESETS_VER);
  })();
  document.getElementById("sitesel").onchange = (e) => {
    if (e.target.value) siteApply(e.target.value);
    else {
      siteCur = "";
      store.set("rfs-site", "");
      siteRender();
    }
  };
  document.getElementById("sitesave").onclick = siteSave;
  try {
    siteRender();
  } catch (e) {
    siteBtnUpdate();
  }
  document.getElementById("sitemanage").onclick = () => siteMgrToggle(!SITEMGR.open);
}
