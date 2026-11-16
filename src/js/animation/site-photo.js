/**
 * The launch site's aerial photo for the 3D flight view: two squares centred on the pad (a near, sharp one and a far,
 * coarse one) from the U.S. Geological Survey's imagery service (The National Map; public domain; United States only).
 * A site's photo is fetched once, when the 3D view first opens there with a connection, and kept on the device, so it
 * is there at the field without one.
 */
import { store } from "../core/storage.js";
import { prFetchBytes } from "../weather/forecast.js";
/** Half the width of each square on the ground, m, and the picture's size, px. */
const PHOTO_NEAR = 400,
  PHOTO_FAR = 6000,
  PHOTO_PX = 2048;
/**
 * The terrain's squares of ground heights, finest first: [half the square's width on the ground (m), heights along
 * each side]. The finest covers the field around the pad, the next the far photo, the last the skyline.
 */
const TERRAIN = [
  [800, 129],
  [6000, 193],
  [40000, 161],
];
/** The USGS elevation service's heights-of-an-area request (3D Elevation Program). */
const TERRAIN_URL = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage";
/** The USGS imagery service's picture-of-an-area request. */
const PHOTO_URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export";
/**
 * The photo in hand: the site it is of (key), its two pictures once they have arrived, and whether it is being fetched.
 */
const PHOTO = {
  key: null,
  near: null,
  far: null,
  nearHalf: PHOTO_NEAR,
  farHalf: PHOTO_FAR,
  busy: false,
  failed: false,
  fresh: false,
  terrain: null,
  flat: false,
};
/** Those to tell when a picture of the photo arrives. */
let photoWaiting = [];
/**
 * Whether the site photo is wanted (the 3D view's Site photo box; on until it is unticked).
 * @returns {boolean}
 */
export const sitePhotoOn = () => store.get("rfs-site-photo", true) !== false;
/**
 * The request for a square of ground around a place, in the web maps' own projection (Web Mercator), in which a small
 * square on the ground is a square in the picture: its half-width there is the ground's over the cosine of latitude.
 * @param {number} lat degrees
 * @param {number} lon degrees
 * @param {number} half half the square's width on the ground, m
 * @returns {string}
 */
function photoUrl(lat, lon, half) {
  const R = 6378137,
    x = (R * lon * Math.PI) / 180,
    y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
    h = half / Math.cos((lat * Math.PI) / 180);
  return `${PHOTO_URL}?bbox=${(x - h).toFixed(1)},${(y - h).toFixed(1)},${(x + h).toFixed(1)},${(y + h).toFixed(1)}&bboxSR=3857&imageSR=3857&size=${PHOTO_PX},${PHOTO_PX}&format=jpg&transparent=false&f=image`;
}
/**
 * The device's store of site photos (IndexedDB), or null where there is none.
 * @returns {Promise<IDBDatabase|null>}
 */
function photoDb() {
  return new Promise((res) => {
    try {
      const q = indexedDB.open("prfl-site-photo", 1);
      q.onupgradeneeded = () => q.result.createObjectStore("photo");
      q.onsuccess = () => res(q.result);
      q.onerror = () => res(null);
    } catch (e) {
      res(null);
    }
  });
}
/**
 * A site's saved pictures, if the device has them.
 * @param {string} key the site
 * @returns {Promise<{near:Uint8Array, far:Uint8Array}|null>}
 */
async function photoSaved(key) {
  const db = await photoDb();
  if (!db) return null;
  return new Promise((res) => {
    try {
      const q = db.transaction("photo").objectStore("photo").get(key);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    } catch (e) {
      res(null);
    }
  });
}
/**
 * Keeps a site's pictures and heights on the device. Every site's are kept (about 2 MB each), until its saved site
 * is deleted or the app's data is cleared.
 * @param {string} key the site
 * @param {{near:Uint8Array, far:Uint8Array, terrain?:Uint8Array[]}} rec
 */
async function photoKeep(key, rec) {
  const db = await photoDb();
  if (!db) return;
  try {
    db.transaction("photo", "readwrite")
      .objectStore("photo")
      .put({ ...rec, at: Date.now() }, key);
  } catch (e) {}
}
/**
 * Forgets a site's photo and terrain (its saved site has been deleted).
 * @param {number} lat degrees
 * @param {number} lon degrees
 */
export async function sitePhotoDrop(lat, lon) {
  if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) return;
  const key = photoKey(lat, lon);
  if (PHOTO.key === key && !PHOTO.busy) PHOTO.key = null;
  const db = await photoDb();
  if (!db) return;
  try {
    db.transaction("photo", "readwrite").objectStore("photo").delete(key);
  } catch (e) {}
}
/**
 * The name a site's photo is kept under: its coordinates to four decimal places (about 11 m).
 * @param {number} lat degrees
 * @param {number} lon degrees
 * @returns {string}
 */
export const photoKey = (lat, lon) => `${(+lat).toFixed(4)},${(+lon).toFixed(4)}`;
/**
 * A JPEG's bytes as a picture the graphics card can take.
 * @param {Uint8Array} bytes
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
function photoDecode(bytes) {
  const blob = new Blob([bytes], { type: "image/jpeg" });
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  return new Promise((res, rej) => {
    const im = new Image(),
      u = URL.createObjectURL(blob);
    im.onload = () => {
      URL.revokeObjectURL(u);
      res(im);
    };
    im.onerror = () => rej(new Error("not a picture"));
    im.src = u;
  });
}
/**
 * The request for a square of ground heights around a place (USGS 3D Elevation Program): n by n heights in metres, as
 * plain numbers (32-bit floats, row by row from the north).
 * @param {number} lat degrees
 * @param {number} lon degrees
 * @param {number} half half the square's width on the ground, m
 * @param {number} n heights along each side
 * @returns {string}
 */
function terrainUrl(lat, lon, half, n) {
  const R = 6378137,
    x = (R * lon * Math.PI) / 180,
    y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
    h = half / Math.cos((lat * Math.PI) / 180);
  return `${TERRAIN_URL}?bbox=${(x - h).toFixed(1)},${(y - h).toFixed(1)},${(x + h).toFixed(1)},${(y + h).toFixed(1)}&bboxSR=3857&imageSR=3857&size=${n},${n}&format=bsq&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image`;
}
/**
 * The terrain's squares of heights from the service's bytes, measured from the pad's own height (the middle of the
 * finest square), so the pad is at zero. A height the service has none for (sea, outside its cover) counts as the
 * pad's.
 * @param {Uint8Array[]} raw one answer for each square of TERRAIN
 * @returns {{half:number, n:number, h:Float32Array}[]}
 */
function terrainDecode(raw) {
  const sq = raw.map((b, k) => {
    const [half, n] = TERRAIN[k];
    if (!b || b.length < n * n * 4) throw new Error("no heights");
    const dv = new DataView(b.buffer, b.byteOffset, n * n * 4),
      h = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) h[i] = dv.getFloat32(i * 4, true);
    return { half, n, h };
  });
  const a = sq[0],
    pad = a.h[((a.n - 1) / 2) * a.n + (a.n - 1) / 2];
  if (!isFinite(pad) || Math.abs(pad) > 9000) throw new Error("no heights");
  for (const q of sq)
    for (let i = 0; i < q.h.length; i++) q.h[i] = isFinite(q.h[i]) && Math.abs(q.h[i]) < 9000 ? q.h[i] - pad : 0;
  return sq;
}
/**
 * The launch site's photo and terrain: what has arrived so far. The first call for a site starts getting them (from
 * the device if they were kept, otherwise from the USGS services), the photo first; onLoad is called as each part
 * arrives.
 * @param {number|null} lat launch site latitude, degrees (null: no site set)
 * @param {number|null} lon longitude
 * @param {function():void} [onLoad]
 * @returns {{near:object|null, far:object|null, nearHalf:number, farHalf:number, terrain:object[]|null}|null} null
 *   with no site, or with the site photo switched off
 */
export function sitePhoto(lat, lon, onLoad) {
  if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon) || !sitePhotoOn()) return null;
  const key = photoKey(lat, lon);
  if (PHOTO.key !== key) {
    Object.assign(PHOTO, {
      key,
      near: null,
      far: null,
      terrain: null,
      flat: false,
      busy: false,
      failed: false,
      fresh: false,
    });
    photoWaiting = [];
  }
  const done = () => PHOTO.near && PHOTO.far && (PHOTO.terrain || PHOTO.flat);
  // whoever asks while it is on its way is told when it arrives
  if (onLoad && !PHOTO.failed && !done() && !photoWaiting.includes(onLoad)) photoWaiting.push(onLoad);
  if (!PHOTO.busy && !PHOTO.failed && !done()) {
    PHOTO.busy = true;
    (async () => {
      try {
        let rec = (await photoSaved(key)) || {};
        if (!rec.near || !rec.far) {
          const [near, far] = await Promise.all([
            prFetchBytes(photoUrl(lat, lon, PHOTO_NEAR)),
            prFetchBytes(photoUrl(lat, lon, PHOTO_FAR)),
          ]);
          rec = { ...rec, near, far };
          // only a real picture is kept: the service answers a failed request with a page of text
          await Promise.all([photoDecode(near), photoDecode(far)]);
          photoKeep(key, rec);
          if (PHOTO.key === key) PHOTO.fresh = true; // just fetched, not from the device's store
        }
        for (const k of ["far", "near"]) {
          const img = await photoDecode(rec[k]);
          if (PHOTO.key !== key) return;
          PHOTO[k] = img;
          for (const f of photoWaiting.slice()) f();
        }
        // the terrain under it: without it (no cover, no connection) the photo lies on flat ground
        try {
          let T = rec.terrain ? terrainDecode(rec.terrain) : null;
          if (!T) {
            const raw = await Promise.all(TERRAIN.map(([half, n]) => prFetchBytes(terrainUrl(lat, lon, half, n))));
            T = terrainDecode(raw);
            photoKeep(key, { ...rec, terrain: raw });
            if (PHOTO.key === key) PHOTO.fresh = true;
          }
          if (PHOTO.key !== key) return;
          PHOTO.terrain = T;
        } catch (e) {
          if (PHOTO.key === key) PHOTO.flat = true;
        }
        if (PHOTO.key === key) for (const f of photoWaiting.slice()) f();
      } catch (e) {
        // no connection or no answer: plain ground for now; tried again when the site is chosen or the 3D view opens
        if (PHOTO.key === key) {
          PHOTO.failed = true;
          for (const f of photoWaiting.slice()) f();
        }
      } finally {
        if (PHOTO.key === key) {
          photoWaiting = [];
          PHOTO.busy = false;
        }
      }
    })();
  }
  return PHOTO;
}
/**
 * Gets a launch site's photo ready ahead of time, when the site is chosen or its coordinates are typed on the Range
 * tab: fetched and kept on the device while there is a connection, so the 3D view has it at the field. Says so once
 * it has just been fetched.
 * @param {number|null} lat degrees
 * @param {number|null} lon degrees
 */
export function sitePhotoReady(lat, lon) {
  sitePhotoAgain();
  const say = (t) => window.prToast && window.prToast(t);
  sitePhoto(lat, lon, () => {
    if (PHOTO.failed) say("The site photo couldn’t be fetched. It will be tried again when the 3D view opens.");
    else if (PHOTO.near && PHOTO.far && (PHOTO.terrain || PHOTO.flat) && PHOTO.fresh) {
      PHOTO.fresh = false;
      say(
        PHOTO.terrain
          ? "Site photo and terrain saved for the 3D flight view."
          : "Site photo saved for the 3D flight view. The terrain couldn’t be fetched; it will be tried again.",
      );
    }
  });
}
/**
 * Lets a photo or terrain that couldn't be fetched be tried again (when a site is chosen, or the 3D view opens): one
 * failure is remembered only until then.
 */
export function sitePhotoAgain() {
  if (PHOTO.busy) return;
  PHOTO.failed = false;
  if (!PHOTO.terrain) PHOTO.flat = false;
}
/**
 * Where the site photo stands, for the 3D view's note: "" (nothing to say: none wanted, or all there), "loading",
 * "failed" (no photo could be fetched) or "flat" (the photo is there but its terrain could not be fetched).
 * @param {number|null} lat degrees
 * @param {number|null} lon degrees
 * @returns {string}
 */
export function sitePhotoState(lat, lon) {
  if (lat == null || lon == null || !sitePhotoOn() || PHOTO.key !== photoKey(lat, lon)) return "";
  return PHOTO.failed ? "failed" : PHOTO.busy ? "loading" : PHOTO.flat && !PHOTO.terrain ? "flat" : "";
}
