/**
 * Saved launch sites: each one keeps a field's own settings (location, elevation, rail, waiver, cone...), not the day's
 * weather. The chosen site stays in force when another rocket is opened.
 */
/* ---------- launch sites and field-day mode ---------- */
/**
 * The saved-sites manager's state: open, the site being renamed, the site waiting for delete confirmation.
 *
 * a field's own settings (not the day's weather: the height the wind is measured at goes with the wind reading)
 */
var SITEMGR = { open: false, edit: null, del: null }; // the saved-sites manager (below)
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
let siteCur = store.get("rfs-site", "");
/* well-known launch fields, added once to the saved sites (names you already use, and fields within about a mile of a
   site you've saved, are skipped; a field you delete doesn't come back). Coordinates and elevations are from each club's
   own site page where it gives them; elev null: looked up from map data the first time the site is chosen. */
/**
 * Well-known launch fields: [name, latitude, longitude, elevation m or null].
 */
const SITE_PRESETS = [
  ["Argonia, KS (KLOUDBusters)", 37.170278, -97.736667, 384.0],
  ["Black Rock Desert, NV (AeroPac)", 40.870683, -119.10695, 1219.2],
  ["Bonneville Salt Flats, UT", 40.791281, -113.821553, 1316.7],
  ["Brothers, OR (OROC)", 43.799278, -120.650169, 1371.6],
  ["Church Hill, MD (MDRA Higgs Farm)", 39.078542, -75.876346, null],
  ["Jean Dry Lake, NV (Tripoli Vegas)", 35.786389, -115.25, 844.9],
  ["Lucerne Dry Lake, CA (ROC)", 34.495, -116.96, 868.7],
  ["Pueblo, CO (SCORE)", 38.155458, -104.808906, 1669.4],
  ["Seymour, TX (Tripoli North Texas)", 33.501037, -99.338722, null],
  ["Spaceport America, NM", 32.99028, -106.96972, 1400.6],
  ["Swan Falls, ID (Tripoli Idaho)", 43.2375, -116.324167, null],
  ["Tripoli Minnesota field, MN", 45.546058, -92.92464, null],
];
/**
 * Adds the preset fields to the saved sites once.
 */
(function sitePresetsAdd() {
  if (store.get("rfs-site-presets", 0) >= 1) return;
  const S = (() => {
      const v = store.get("rfs-sites", []);
      return Array.isArray(v) ? v : [];
    })(),
    near = (a, b) => a.lat != null && a.lon != null && Math.abs(a.lat - b[1]) < 0.015 && Math.abs(a.lon - b[2]) < 0.02;
  for (const P of SITE_PRESETS) {
    if (S.some((x) => x.name.toLowerCase() === P[0].toLowerCase() || near(x.v || {}, P))) continue;
    S.push({ name: P[0], v: { elev: P[3], lat: P[1], lon: P[2] }, preset: true });
  }
  S.sort((a, b) => a.name.localeCompare(b.name));
  store.set("rfs-sites", S);
  store.set("rfs-site-presets", 1);
})();
/**
 * Draws the site picker and its buttons.
 */
function siteRender() {
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
    const mb = document.getElementById("sitemanage");
    mb.hidden = !S.length;
    if (!S.length && SITEMGR.open) siteMgrToggle(false);
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
 * The current values of the site keys.
 * @returns {object}
 *
 * the chosen site stays in force when another rocket is opened (a design file carries launch conditions of its own)
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
 * Shows Save Changes only when there's something to save (see the note above).
 *
 * Save Changes shows only when there is something to save: the chosen site's settings were changed, or a name was typed for a new site
 */
function siteBtnUpdate() {
  const btn = document.getElementById("sitesave"),
    inp = document.getElementById("sitename");
  if (!btn || !inp) return;
  const x = siteCur && sitesGet().find((s) => s.name === siteCur);
  let diff = false;
  if (x) {
    const b = siteBase(x);
    diff = SITE_DIFF_KEYS.some((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(L[k] ?? null));
  }
  btn.hidden = !(diff || inp.value.trim());
}
/**
 * Puts the chosen site's settings back into L (after a design file brought its own).
 * @returns {string|null} the site's name
 */
function siteKeep() {
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
  }
  siteRender();
  delete m.dataset.keep;
}
/**
 * Looks up a site's elevation from map data (see the note above) and keeps it with the site.
 * @param {object} x site
 *
 * a site saved without an elevation: looked up from map data (Open-Meteo's elevation service, 90 m terrain model) and kept with the site
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
    m.textContent = `Using ${x.name}: coordinates set. Its field elevation couldn’t be looked up (it needs an internet connection), so enter it under Range and tap Save Changes.`;
    siteRender();
    delete m.dataset.keep;
  }
}
/**
 * Saves the current settings as the typed site name (a new site, or the chosen one updated).
 */
function siteSave() {
  const inp = document.getElementById("sitename"),
    name = (inp.value || siteCur || "").trim().slice(0, 40),
    m = document.getElementById("sitemsg");
  if (!name) {
    m.textContent = "Type a name for this field first.";
    inp.focus();
    return;
  }
  const S = sitesGet().filter((x) => x.name !== name),
    v = {};
  for (const k of SITE_KEYS) v[k] = L[k];
  S.push({ name, v });
  S.sort((a, b) => a.name.localeCompare(b.name));
  store.set("rfs-sites", S);
  siteCur = name;
  store.set("rfs-site", siteCur);
  siteBaseSet(name);
  inp.value = "";
  m.dataset.keep = "1";
  m.textContent = `Saved ${name}.`;
  siteRender();
  delete m.dataset.keep;
}
document.getElementById("sitesel").onchange = (e) => {
  if (e.target.value) siteApply(e.target.value);
  else {
    siteCur = "";
    store.set("rfs-site", "");
    siteRender();
  }
};
document.getElementById("sitesave").onclick = siteSave;
document.getElementById("sitename").addEventListener("input", siteBtnUpdate);
try {
  siteRender();
} catch (e) {
  siteBtnUpdate();
}
document.getElementById("sitename").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    siteSave();
  }
});
/* managing saved sites: rename or delete each one. Deleting takes two steps (Delete, then confirm), so it can't happen by a stray tap */
/**
 * Opens or closes the saved-sites manager.
 * @param {boolean} open
 */
function siteMgrToggle(open) {
  SITEMGR.open = open;
  SITEMGR.edit = SITEMGR.del = null;
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
  if (!S.length) {
    box.innerHTML = `<p class="note" style="margin:8px 0">No saved sites.</p>`;
    return;
  }
  /**
   * A latitude or longitude as text.
   */
  const ll = (v) =>
    v.lat != null && v.lon != null ? `${(+v.lat).toFixed(4)}, ${(+v.lon).toFixed(4)}` : "no coordinates";
  box.innerHTML = S.map((x, i) => {
    const cur = x.name === siteCur;
    let h = `<div class="srow" data-i="${i}"><div class="stop"><div style="min-width:0"><div class="snm">${esc(x.name)}</div><div class="smeta">${cur ? "In use · " : ""}${x.v.elev != null ? `${fmt(x.v.elev, "alt")} ${uname("alt")}` : "elevation not set"} · ${ll(x.v)}</div></div>`;
    h += `<div class="sact"><button type="button" class="btn ghost" data-a="ren">Rename</button><button type="button" class="btn ghost" data-a="del">Delete</button></div></div>`;
    if (SITEMGR.edit === x.name)
      h += `<div class="sconf"><input type="text" maxlength="40" class="sren" value="${esc(x.name)}" aria-label="New name for ${esc(x.name)}"><button type="button" class="btn" data-a="rsave">Save</button><button type="button" class="btn ghost" data-a="cancel">Cancel</button><p class="note serr" style="margin:0;width:100%"></p></div>`;
    if (SITEMGR.del === x.name)
      h += `<div class="sconf"><span>Delete <b>${esc(x.name)}</b>? This can’t be undone.</span><button type="button" class="btn danger" data-a="dyes">Delete</button><button type="button" class="btn ghost" data-a="cancel">Keep it</button></div>`;
    return h + `</div>`;
  }).join("");
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
document.getElementById("sitemanage").onclick = () => siteMgrToggle(!SITEMGR.open);
