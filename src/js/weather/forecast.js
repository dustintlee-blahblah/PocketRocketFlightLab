/**
 * The weather forecast for the site (see the note below), the site's coordinates, and directions to it.
 */
/* ---------- the weather forecast for the site: winds from the ground to about 100,000 ft ----------
   NOAA's GFS model through Open-Meteo: wind speed, direction and geopotential height (above sea level) on 44 pressure
   levels from 1000 hPa up to 10 hPa (about 31 km), plus the 10 m wind and 2 m temperature. Levels below the field are
   left out; the rest become the winds-aloft table, measured from the pad. */
/* the day's weather: once you've set it (typed into Ambient conditions or Winds aloft, or fetched a forecast), opening
   another rocket keeps it instead of taking the launch conditions saved in that file */
/**
 * The day's weather keys (see the note above).
 */
const WX_KEYS = [
  "tempAloft",
  "tempC",
  "dewC",
  "ceiling",
  "cloudLow",
  "cloudMid",
  "cloudHigh",
  "cloudProf",
  "vis",
  "precip",
  "pressure",
  "humidity",
  "wind",
  "windRef",
  "windProfile",
  "windDir",
  "turb",
  "aloft",
  "aloftSrc",
  "wxSet",
];
for (const id of ["g-ambient", "aloftpanel"]) {
  const el = document.getElementById(id);
  if (el) {
    /**
     * Marks the day's weather as set.
     */
    const set = () => {
      if (!L.wxSet) {
        L.wxSet = true;
        store.set("rfs-launch", L);
      }
    };
    /**
     * An edit in the weather fields sets the day's weather (typed cloud bands replace the forecast's levels).
     */
    const edit = (e) => {
      const t = e.target;
      if (t && t.matches("input,select") && !t.closest("#wxbox")) {
        set();
        if (/^f-cloud(Low|Mid|High)$/.test(t.id) && L.cloudProf) {
          L.cloudProf = null;
          store.set("rfs-launch", L);
        }
      }
    };
    el.addEventListener("input", edit);
    el.addEventListener("change", edit);
    el.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.closest("#aloftadd,#aloftclear,.arow .x")) set();
    });
  }
}
/**
 * The GFS pressure levels asked for, hPa.
 */
const WX_LEVELS = [
  1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700, 675, 650, 625, 600, 575, 550, 525, 500, 475, 450,
  425, 400, 375, 350, 325, 300, 275, 250, 225, 200, 175, 150, 125, 100, 70, 50, 40, 30, 20, 15, 10,
];
/**
 * Web requests waiting for the Android app's answer, by id.
 */
const PR_FETCH = {};
let prFetchN = 0;
/**
 * Fetches a URL as text (see the note above).
 * @param {string} url
 * @returns {Promise<string>}
 *
 * a web request: through the Android app when it's there (so it isn't held to the page's own network rules), else fetch()
 */
function prFetchText(url) {
  const A = window.PocketRocketApp;
  if (A && typeof A.fetchText === "function")
    return new Promise((res, rej) => {
      const id = "f" + ++prFetchN;
      PR_FETCH[id] = { res, rej };
      setTimeout(() => {
        if (PR_FETCH[id]) {
          delete PR_FETCH[id];
          rej(new Error("The weather service didn’t answer in time."));
        }
      }, 45000);
      A.fetchText(id, url);
    });
  return fetch(url).then((r) =>
    r.text().then((t) => {
      if (!r.ok) {
        let why = t;
        try {
          why = JSON.parse(t).reason || t;
        } catch (e) {}
        throw new Error(why || "HTTP " + r.status);
      }
      return t;
    }),
  );
}
window.prFetchDone = (id, ok, b64) => {
  const p = PR_FETCH[id];
  if (!p) return;
  delete PR_FETCH[id];
  let t = "";
  try {
    t = new TextDecoder().decode(Uint8Array.from(atob(b64 || ""), (c) => c.charCodeAt(0)));
  } catch (e) {
    t = "";
  }
  if (ok) p.res(t);
  else {
    let why = t;
    try {
      why = JSON.parse(t).reason || t;
    } catch (e) {}
    p.rej(new Error(why || "The request failed."));
  }
};
/**
 * Two-digit number.
 */
function wxPad(n) {
  return String(n).padStart(2, "0");
}
/**
 * The forecast time offered first: the next whole hour, local time, as "YYYY-MM-DDTHH:00".
 * @returns {string}
 */
function wxDefaultWhen() {
  const d = new Date(Date.now() + 3600e3);
  return `${d.getFullYear()}-${wxPad(d.getMonth() + 1)}-${wxPad(d.getDate())}T${wxPad(d.getHours())}:00`;
}
/* the site's coordinates in one field: "40.218224,-112.246072" as copied from a map app; also "40.2182 N 112.2461 W",
   degree signs, and degrees-minutes-seconds such as 40°13'05.6"N 112°14'45.9"W */
/**
 * Reads coordinates typed or pasted in one field (see the note above).
 * @param {string} t
 * @returns {{lat:number, lon:number}|null}
 */
function parseLatLon(t) {
  t = String(t || "")
    .trim()
    .replace(/[\u2212\u2013]/g, "-")
    .replace(/[()[\]]/g, " ");
  if (!t) return null;
  const parts = t.match(
    /-?\d+(?:\.\d+)?(?:\s*[°º:d]\s*\d+(?:\.\d+)?\s*['′m]?(?:\s*\d+(?:\.\d+)?\s*(?:"|″|''|s)?)?)?\s*[NSEWnsew]?/g,
  );
  if (!parts || parts.length !== 2) return null;
  /**
   * One coordinate (decimal or degrees-minutes-seconds, with its hemisphere).
   */
  const one = (s) => {
    const h = (s.match(/[NSEWnsew]\s*$/) || [""])[0].trim().toUpperCase(),
      n = s.match(/-?\d+(?:\.\d+)?/g).map(Number);
    let v = Math.abs(n[0]) + (n[1] || 0) / 60 + (n[2] || 0) / 3600;
    if (n[0] < 0 || /^\s*-/.test(s)) v = -v;
    if (h === "S" || h === "W") v = -Math.abs(v);
    if (n.slice(1).some((x) => x >= 60)) return null;
    return { v, h };
  };
  const a = one(parts[0]),
    b = one(parts[1]);
  if (!a || !b) return null;
  let lat = a.v,
    lon = b.v;
  if (a.h && "EW".includes(a.h) && (!b.h || "NS".includes(b.h))) [lat, lon] = [b.v, a.v]; // longitude written first
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
}
/**
 * Coordinates as "lat,lon" with up to 6 decimals.
 * @param {number} la
 * @param {number} lo
 * @returns {string}
 */
function fmtLatLon(la, lo) {
  const f = (v) => (+v).toFixed(6).replace(/\.?0+$/, "");
  return `${f(la)}, ${f(lo)}`;
}
/**
 * Shows the site's coordinates in their field (not while it's being typed in).
 */
function siteCoordRender() {
  const el = document.getElementById("sitecoord");
  if (!el || document.activeElement === el) return;
  const v = L.lat != null && L.lon != null ? fmtLatLon(L.lat, L.lon) : "";
  if (el.value !== v) {
    el.value = v;
    const m = document.getElementById("sitecoordmsg");
    if (m && m.style.color) {
      m.style.color = "";
      m.textContent = "Paste both from a map app, separated by a comma. North and east are positive.";
    }
  }
}
/**
 * Reads the coordinates field into the launch conditions.
 */
function siteCoordSet() {
  const el = document.getElementById("sitecoord"),
    m = document.getElementById("sitecoordmsg"),
    r = parseLatLon(el.value);
  if (!r) {
    m.textContent =
      "Couldn’t read that. Enter latitude, then longitude, separated by a comma, for example 40.218224, -112.246072.";
    m.style.color = "var(--bad)";
    return false;
  }
  m.style.color = "";
  L.lat = r.lat;
  L.lon = r.lon;
  el.value = fmtLatLon(r.lat, r.lon);
  m.textContent = `${Math.abs(r.lat).toFixed(5)}° ${r.lat >= 0 ? "N" : "S"}, ${Math.abs(r.lon).toFixed(5)}° ${r.lon >= 0 ? "E" : "W"}. North and east are positive.`;
  changed();
  if (typeof siteRender === "function") siteRender();
  wxSiteNote();
  return true;
}
{
  const el = document.getElementById("sitecoord");
  el.addEventListener("change", siteCoordSet);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      siteCoordSet();
      el.blur();
    }
  });
  el.addEventListener("paste", () =>
    setTimeout(() => {
      if (parseLatLon(el.value)) siteCoordSet();
    }, 0),
  );
}
/**
 * Opens directions to the site (see the note above).
 *
 * the site's coordinates handed to the map app: on Android a geo: link (the phone's default map app); in a browser,
 * Apple Maps on iPhone/iPad/Mac and Google Maps elsewhere, both opening with directions to the site
 */
function siteDirections() {
  const la = +(L.lat ?? NaN),
    lo = +(L.lon ?? NaN),
    m = document.getElementById("sitecoordmsg");
  if (!isFinite(la) || !isFinite(lo)) {
    m.textContent = "Enter the site’s latitude and longitude first.";
    return;
  }
  const ll = `${la.toFixed(6)},${lo.toFixed(6)}`,
    label = (() => {
      try {
        return siteCur || "Launch site";
      } catch (e) {
        return "Launch site";
      }
    })();
  const A = window.PocketRocketApp;
  if (A && typeof A.openExternal === "function") {
    if (A.openExternal(`geo:${ll}?q=${ll}(${encodeURIComponent(label)})`)) return;
  }
  const apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent || "");
  const url = apple
    ? `https://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(label)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
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
document.getElementById("sitedir").onclick = siteDirections;
/**
 * Writes the forecast box's note about the site's location.
 */
function wxSiteNote() {
  siteCoordRender();
  const el = document.getElementById("wxsite");
  if (!el) return;
  const la = L.lat,
    lo = L.lon;
  if (la == null || lo == null) {
    el.textContent = "Enter the launch site’s latitude and longitude under Launch site to get a forecast.";
    const w = document.getElementById("wxwhen");
    if (w && !w.value) w.value = wxDefaultWhen();
    return;
  }
  el.textContent = `For ${Math.abs(la).toFixed(3)}° ${la >= 0 ? "N" : "S"}, ${Math.abs(lo).toFixed(3)}° ${lo >= 0 ? "E" : "W"}, field elevation ${fmt(L.elev || 0, "alt")} ${uname("alt")} (set under Launch site${(() => {
    try {
      return siteCur ? `; site: ${siteCur}` : "";
    } catch (e) {
      return "";
    }
  })()}).`;
  const w = document.getElementById("wxwhen");
  if (w && !w.value) w.value = wxDefaultWhen();
}
/* where the weather comes from, by date (all through Open-Meteo, CC BY 4.0):
   - from two days ago to 16 days ahead: the GFS forecast, with its pressure levels (winds aloft);
   - back to 23 March 2021: the archive of past GFS forecasts (Open-Meteo's historical forecast API), also with levels;
   - back to 1940: the ERA5 reanalysis (Copernicus), ground-level weather only, so no winds aloft. */
const WX_HIST_FROM = "2021-03-23",
  WX_ERA5_FROM = "1940-01-01",
  WX_AHEAD = 16;
/**
 * Which weather source covers a date.
 * @param {string} date the launch date, YYYY-MM-DD
 * @param {string} today today's date, YYYY-MM-DD
 * @returns {{kind:string, name:string}|{error:string}} kind "forecast", "history" or "era5"
 */
function wxSource(date, today) {
  const days = (Date.parse(date) - Date.parse(today)) / 864e5;
  if (!isFinite(days)) return { error: "Choose the launch date and time first." };
  if (days > WX_AHEAD) return { error: `Forecasts only reach ${WX_AHEAD} days ahead. Choose a date before then.` };
  if (days >= -2) return { kind: "forecast", name: "GFS forecast" };
  if (date >= WX_HIST_FROM) return { kind: "history", name: "GFS archive" };
  if (date >= WX_ERA5_FROM) return { kind: "era5", name: "ERA5 reanalysis" };
  return { error: "Weather records here start in 1940. Choose a later date." };
}
/**
 * The hourly fields asked for from a source: the ground-level weather, plus every level's wind, height, cloud cover and
 * temperature where the source has levels.
 * @param {string} kind from wxSource
 * @returns {string[]}
 */
function wxVars(kind) {
  const ground = [
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "surface_pressure",
  ];
  if (kind === "era5") return ground;
  return [
    ...ground,
    "visibility",
    "precipitation_probability",
    ...WX_LEVELS.flatMap((p) => [
      `wind_speed_${p}hPa`,
      `wind_direction_${p}hPa`,
      `geopotential_height_${p}hPa`,
      `cloud_cover_${p}hPa`,
      `temperature_${p}hPa`,
    ]),
  ];
}
/**
 * The Open-Meteo request for the site and day from a source.
 * @param {number} lat
 * @param {number} lon
 * @param {string} date YYYY-MM-DD
 * @param {string} [kind="forecast"] from wxSource
 * @param {string[]} [vars] the hourly fields (wxVars by default)
 * @returns {string}
 */
function wxUrl(lat, lon, date, kind = "forecast", vars = wxVars(kind)) {
  const base =
    kind === "era5"
      ? "https://archive-api.open-meteo.com/v1/archive?"
      : kind === "history"
        ? "https://historical-forecast-api.open-meteo.com/v1/forecast?models=gfs_seamless&"
        : "https://api.open-meteo.com/v1/gfs?";
  return `${base}latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=${vars.join(",")}&wind_speed_unit=ms&temperature_unit=celsius&timezone=auto&start_date=${date}&end_date=${date}`;
}
/**
 * Fetches a source's hourly weather for the day. A field the source doesn't offer makes the service refuse the whole
 * request and name it, so it's dropped and the request sent again.
 * @returns {Promise<object>} the service's JSON
 */
async function wxGet(lat, lon, date, kind) {
  let vars = wxVars(kind);
  for (let n = 0; n < 12; n++) {
    let txt, j;
    try {
      txt = await prFetchText(wxUrl(lat, lon, date, kind, vars));
    } catch (e) {
      const m = /invalid String value (\w+)/.exec(String((e && e.message) || e));
      if (m && vars.includes(m[1])) {
        vars = vars.filter((v) => v !== m[1]);
        continue;
      }
      throw e;
    }
    try {
      j = JSON.parse(txt);
    } catch (e) {
      throw new Error("The weather service sent something unexpected.");
    }
    if (j && j.error) {
      const m = /invalid String value (\w+)/.exec(j.reason || "");
      if (m && vars.includes(m[1])) {
        vars = vars.filter((v) => v !== m[1]);
        continue;
      }
      throw new Error(j.reason || "The weather service couldn’t answer.");
    }
    return j;
  }
  throw new Error("The weather service couldn’t answer.");
}
/**
 * The forecast for one hour as winds-aloft rows above the pad, plus the surface weather (pure: tested on its own).
 * @param {object} j the service's JSON
 * @param {string} key the hour, "YYYY-MM-DDTHH:00"
 * @param {number} elev the field's elevation, m
 * @returns {object} rows, temperatures aloft, cloud cover by level and band, visibility, precipitation chance,
 *   surface wind, gusts, temperature, humidity, pressure and the model's elevation
 * @throws {Error} if the reply is malformed or lacks that hour
 *
 * the forecast's levels for one hour, as winds-aloft rows above the pad (pure: tested on its own)
 */
function wxRows(j, key, elev) {
  const H = j && j.hourly;
  if (!H || !Array.isArray(H.time)) throw new Error("The weather service sent something unexpected.");
  const i = H.time.indexOf(key);
  if (i < 0) throw new Error("That hour isn’t in the weather record.");
  /**
   * One hourly field at the hour (null if missing).
   */
  const val = (k) => {
    const a = H[k];
    const x = a ? a[i] : null;
    return x == null || !isFinite(x) ? null : +x;
  };
  const rows = [];
  for (const p of WX_LEVELS) {
    const gh = val(`geopotential_height_${p}hPa`),
      sp = val(`wind_speed_${p}hPa`),
      dr = val(`wind_direction_${p}hPa`);
    if (gh == null || sp == null || dr == null) continue;
    const agl = gh - elev;
    if (agl < 30) continue; // under the field, or within the surface layer
    rows.push({ alt: Math.round(agl), speed: +sp.toFixed(2), dir: Math.round(((dr % 360) + 360) % 360) });
  }
  rows.sort((a, b) => a.alt - b.alt);
  const out = [];
  for (const r of rows) if (!out.length || r.alt > out[out.length - 1].alt + 5) out.push(r);
  // temperature at each level above the field
  const temps = [];
  for (const p of WX_LEVELS) {
    const gh = val(`geopotential_height_${p}hPa`),
      tc = val(`temperature_${p}hPa`);
    if (gh == null || tc == null) continue;
    const agl = gh - elev;
    if (agl >= 30) temps.push({ z: Math.round(agl), T: +tc.toFixed(1) });
  }
  temps.sort((a, b) => a.z - b.z);
  /* cloud base: the lowest level above the pad whose layer cloud cover reaches about a quarter of the sky (25%; thinner
     cover is mostly noise in the model), placed where the cover crosses that line between it and the level below; null
     when no level gets there (clear) */
  let ceil = null,
    haveCloud = false,
    prof = null;
  {
    const cl = [];
    for (const p of WX_LEVELS) {
      const gh = val(`geopotential_height_${p}hPa`),
        cc = val(`cloud_cover_${p}hPa`);
      if (gh == null || cc == null) continue;
      haveCloud = true;
      const agl = gh - elev;
      if (agl >= 0) cl.push({ z: agl, c: cc });
    }
    cl.sort((a, b) => a.z - b.z);
    const T = 25;
    prof = cl.map((r) => ({ z: Math.round(r.z), c: Math.round(r.c) }));
    for (let i = 0; i < cl.length; i++)
      if (cl[i].c >= T) {
        const a = i > 0 ? cl[i - 1] : null;
        ceil = a && a.c < T ? a.z + ((cl[i].z - a.z) * (T - a.c)) / (cl[i].c - a.c) : cl[i].z;
        break;
      }
  }
  return {
    rows: out,
    temps,
    ceil,
    haveCloud,
    td: val("dew_point_2m"),
    cl: val("cloud_cover_low"),
    cm: val("cloud_cover_mid"),
    ch: val("cloud_cover_high"),
    vis: val("visibility"),
    prof,
    pp: val("precipitation_probability"),
    ws: val("wind_speed_10m"),
    wd: val("wind_direction_10m"),
    wg: val("wind_gusts_10m"),
    t2: val("temperature_2m"),
    rh: val("relative_humidity_2m"),
    ps: val("surface_pressure"),
    elev: isFinite(j.elevation) ? +j.elevation : null,
  };
}
/**
 * Get weather: fetches the weather for the chosen hour from the source that covers its date (wxSource) and fills the
 * launch conditions and, where the source has them, the winds aloft.
 */
async function wxFetch() {
  const msg = document.getElementById("wxmsg"),
    btn = document.getElementById("wxgo"),
    wv = document.getElementById("wxwhen").value || wxDefaultWhen();
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})/.exec(wv);
  if (!m) {
    msg.textContent = "Choose the launch date and time first.";
    return;
  }
  const lat = +(L.lat ?? NaN),
    lon = +(L.lon ?? NaN);
  if (!isFinite(lat) || Math.abs(lat) > 90 || !isFinite(lon) || Math.abs(lon) > 180) {
    msg.textContent = "Enter the site’s latitude and longitude under Launch site first.";
    return;
  }
  const date = m[1],
    key = `${date}T${m[2]}:00`,
    src = wxSource(date, wxDefaultWhen().slice(0, 10));
  if (src.error) {
    msg.textContent = src.error;
    return;
  }
  btn.disabled = true;
  msg.textContent = src.kind === "forecast" ? "Getting the forecast…" : "Getting the weather for that day…";
  try {
    const j = await wxGet(lat, lon, date, src.kind);
    const W = wxRows(j, key, L.elev || 0);
    const when = new Date(`${date}T${m[2]}:00`).toLocaleString([], {
      year: src.kind === "forecast" ? undefined : "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    L.wxSet = true;
    aloftOpen = false;
    // no levels from this source, date or place: the winds-aloft table is cleared, and the wind above the ground comes
    // from the ground wind and the wind profile
    const noAloft = !W.rows.length;
    if (noAloft) {
      L.aloft = [];
      L.aloftSrc = "";
      L.tempAloft = null;
      L.cloudProf = null;
    } else {
      L.aloft = W.rows;
      L.tempAloft = W.temps && W.temps.length ? W.temps : null;
      L.aloftSrc = `${src.name} for ${when}, site time`;
    }
    // every Ambient conditions field: the forecast's values at 2 m (temperature, humidity) and 10 m (wind) above the ground
    const set = [];
    if (W.t2 != null) {
      L.tempC = +W.t2.toFixed(1);
      set.push(`${Math.round(toDisp(W.t2, "temp"))} ${uname("temp")}`);
    }
    if (W.ps != null) {
      // the forecast's ground pressure is at its own terrain height: carried to the field's elevation (hypsometric equation)
      const T = (W.t2 != null ? W.t2 : L.tempC) + 273.15,
        dz = (L.elev || 0) - (W.elev != null ? W.elev : L.elev || 0);
      L.pressure = Math.round(W.ps * 100 * Math.exp((-9.80665 * dz) / (287.05 * T)));
      set.push(`${fmt(L.pressure, "press")} ${uname("press")}`);
    }
    if (W.rh != null) {
      L.humidity = Math.min(1, Math.max(0, W.rh / 100));
      set.push(`${Math.round(W.rh)}% humidity`);
    }
    if (W.ws != null && W.wd != null) {
      L.wind = W.ws;
      L.windDir = Math.round(W.wd);
      L.windRef = 10;
      set.push(`wind ${fmt(W.ws, "wind")} ${uname("wind")} from the ${compass(W.wd)} measured at 33 ft`);
    }
    if (W.td != null) {
      L.dewC = +W.td.toFixed(1);
      set.push(`dew point ${Math.round(toDisp(W.td, "temp"))} ${uname("temp")}`);
    }
    if (W.haveCloud) {
      L.ceiling = W.ceil != null ? Math.round(W.ceil) : 0;
      set.push(
        W.ceil != null
          ? `cloud base ${fmt(W.ceil, "alt")} ${uname("alt")} above the pad`
          : "clear skies (no cloud base)",
      );
    }
    {
      /**
       * Percent to a fraction 0–1.
       */
      const f = (v) => Math.min(1, Math.max(0, v / 100));
      if (W.cl != null) L.cloudLow = f(W.cl);
      if (W.cm != null) L.cloudMid = f(W.cm);
      if (W.ch != null) L.cloudHigh = f(W.ch);
      if (W.cl != null || W.cm != null || W.ch != null)
        set.push(
          `cloud cover ${Math.round(W.cl || 0)}% low, ${Math.round(W.cm || 0)}% mid, ${Math.round(W.ch || 0)}% high`,
        );
      L.cloudProf = W.prof && W.prof.length ? W.prof : null;
      if (W.vis != null) {
        L.vis = Math.max(0, W.vis);
        set.push(`visibility ${fmt(W.vis, "vis")} ${uname("vis")}`);
      }
    }
    if (W.pp != null) {
      L.precip = Math.min(1, Math.max(0, W.pp / 100));
      set.push(`${Math.round(W.pp)}% chance of precipitation`);
    }
    // gustiness as an RMS fraction of the mean wind: peak gusts run about three times that above the mean
    if (W.wg != null && W.ws != null) {
      L.turb = W.ws > 0.5 ? +Math.min(0.5, Math.max(0, (W.wg / W.ws - 1) / 3)).toFixed(2) : 0;
      set.push(`${Math.round(L.turb * 100)}% gustiness (gusts to ${fmt(W.wg, "wind")} ${uname("wind")})`);
    }
    const gtxt = set.length ? ` Ambient conditions: ${set.join(", ")}.` : "";
    // fields this source doesn't have keep what they had
    const kept = [
      W.vis == null && "visibility",
      W.pp == null && "chance of precipitation",
      !W.haveCloud && "cloud base",
    ].filter(Boolean);
    const ktxt = kept.length ? ` Not in this record, so left as they were: ${kept.join(", ")}.` : "";
    let note = "";
    if (W.elev != null && Math.abs(W.elev - (L.elev || 0)) > 150)
      note = ` The forecast’s ground here is ${fmt(W.elev, "alt")} ${uname("alt")} above sea level but your field elevation is ${fmt(L.elev || 0, "alt")} ${uname("alt")}: check both, and the coordinates.`;
    if (noAloft) msg.textContent = `${src.name} for ${when}: no winds aloft.${gtxt}${ktxt}${note}`;
    else {
      const top = W.rows[W.rows.length - 1],
        fast = W.rows.reduce((a, r) => (r.speed > a.speed ? r : a), W.rows[0]);
      msg.textContent = `${src.name}: filled ${W.rows.length} levels, ${fmt(W.rows[0].alt, "alt")} to ${fmt(top.alt, "alt")} ${uname("alt")} above the pad, for ${when}. Strongest: ${fmt(fast.speed, "wind")} ${uname("wind")} from the ${compass(fast.dir)} at ${fmt(fast.alt, "alt")} ${uname("alt")}.${gtxt}${ktxt}${note}`;
    }
    renderForms();
    changed();
    renderAloft();
    if (noAloft)
      showInfo(
        "No winds aloft for this date",
        src.kind === "era5"
          ? `Winds aloft are only on record here from ${new Date(WX_HIST_FROM + "T12:00").toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" })} on. The ground-level weather for ${when} has been filled in from the ERA5 reanalysis, and the Winds aloft table has been cleared: the wind above the ground will be estimated from the ground wind and the wind profile. You can type in winds aloft by hand.`
          : `The weather service had no winds aloft for this place and time. The ground-level weather has been filled in, and the Winds aloft table has been cleared: the wind above the ground will be estimated from the ground wind and the wind profile. You can type in winds aloft by hand.`,
      );
  } catch (e) {
    const off = typeof navigator !== "undefined" && navigator.onLine === false;
    msg.textContent = off
      ? "No internet connection. Connect and try again, or type the winds in by hand under Winds aloft."
      : `Couldn’t get the weather: ${String((e && e.message) || e)
          .replace(/^TypeError: /, "")
          .slice(
            0,
            200,
          )}. ${/fetch|network|load/i.test(String((e && e.message) || e)) ? "This view may not be allowed to go online (the Android app and a regular browser are). " : ""}You can still type the winds in by hand under Winds aloft.`;
  } finally {
    btn.disabled = false;
  }
}
document.getElementById("wxgo").onclick = wxFetch;
document.getElementById("aloftclear").onclick = () => {
  L.aloft = [];
  L.aloftSrc = "";
  L.tempAloft = null;
  changed();
  renderAloft();
  document.getElementById("aloftmsg").textContent = "";
};

// the parts list behind the Rocket tab: kept between visits; rebuilt from the open file when an older version saved none
(function initBuilder() {
  try {
    BLD = JSON.parse(localStorage.getItem("rfs-builder") || "null");
  } catch (e) {
    BLD = null;
  }
  if (!(BLD && BLD.stages && BLD.stages.length && BLD.settings)) {
    BLD = null;
    if (SOURCE && SOURCE.text) {
      try {
        const isR = SOURCE.format === "rkt",
          r = isR ? parseRkt(SOURCE.text) : parseOrk(SOURCE.text);
        BLD = bldFromOrk(isR ? r.orkXml : SOURCE.text, { ...r, rkt: isR });
        BLD.name = D.name || BLD.name;
      } catch (e) {
        BLD = null;
      }
    }
    if (!BLD) BLD = bldDefault();
    bldSave();
  }
  if (SOURCE && SOURCE.base && !SOURCE.base.M) setSource({ ...SOURCE, base: { ...SOURCE.base, M: jclone(BLD) } });
  bldSel = BLD_ROOT;
  try {
    bldDerive();
  } catch (e) {}
  if (!(CLEAN || "").startsWith("b2:")) markClean();
  bldRender();
})();
setTimeout(renderDragTable, 0);
renderForms();
renderSeries();
setUnits(units);
document.getElementById("runbar").classList.add("stale");
document.querySelector("#runstat b").textContent = "Not run yet";
document.getElementById("runtime").textContent = "Set up your rocket, then tap Launch";
requestAnimationFrame(() => {
  drawProfile();
  renderDragTable();
});
if (typeof module !== "undefined")
  module.exports = {
    simulate,
    stability,
    parseOrk,
    parseEng,
    BUILTIN,
    defaultDesign,
    defaultLaunch,
    cdAt,
    atmosphere,
    motorStats,
  };
