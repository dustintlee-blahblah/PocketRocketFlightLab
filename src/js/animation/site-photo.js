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
 * Keeps a site's pictures on the device, and no more than four sites' in all (the oldest go).
 * @param {string} key the site
 * @param {{near:Uint8Array, far:Uint8Array}} rec
 */
async function photoKeep(key, rec) {
  const db = await photoDb();
  if (!db) return;
  try {
    const os = db.transaction("photo", "readwrite").objectStore("photo");
    os.put({ ...rec, at: Date.now() }, key);
    const all = os.getAllKeys();
    all.onsuccess = () => {
      const extra = all.result.filter((k) => k !== key);
      if (extra.length > 3)
        for (const k of extra.slice(0, extra.length - 3))
          db.transaction("photo", "readwrite").objectStore("photo").delete(k);
    };
  } catch (e) {}
}
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
 * The launch site's photo: what has arrived so far of its two pictures. The first call for a site starts getting it
 * (from the device if it was kept, otherwise from the USGS service), and onLoad is called as each picture arrives.
 * @param {number|null} lat launch site latitude, degrees (null: no site set)
 * @param {number|null} lon longitude
 * @param {function():void} [onLoad]
 * @returns {{near:object|null, far:object|null, nearHalf:number, farHalf:number}|null} null with no site, or with the
 *   site photo switched off
 */
export function sitePhoto(lat, lon, onLoad) {
  if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon) || !sitePhotoOn()) return null;
  const key = `${(+lat).toFixed(4)},${(+lon).toFixed(4)}`;
  if (PHOTO.key !== key) {
    Object.assign(PHOTO, { key, near: null, far: null, busy: false, failed: false, fresh: false });
    photoWaiting = [];
  }
  // whoever asks while it is on its way is told when it arrives
  if (onLoad && !PHOTO.failed && !(PHOTO.near && PHOTO.far) && !photoWaiting.includes(onLoad))
    photoWaiting.push(onLoad);
  if (!PHOTO.busy && !PHOTO.failed && !(PHOTO.near && PHOTO.far)) {
    PHOTO.busy = true;
    (async () => {
      try {
        let rec = await photoSaved(key);
        if (!rec || !rec.near || !rec.far) {
          const [near, far] = await Promise.all([
            prFetchBytes(photoUrl(lat, lon, PHOTO_NEAR)),
            prFetchBytes(photoUrl(lat, lon, PHOTO_FAR)),
          ]);
          rec = { near, far };
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
      } catch (e) {
        // no connection, no coverage or no store: plain ground, and no second try until the site changes
        if (PHOTO.key === key) PHOTO.failed = true;
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
  sitePhoto(lat, lon, () => {
    if (PHOTO.near && PHOTO.far && PHOTO.fresh) {
      PHOTO.fresh = false;
      if (window.prToast) window.prToast("Site photo saved for the 3D flight view.");
    }
  });
}
