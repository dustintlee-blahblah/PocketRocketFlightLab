/**
 * Recently opened files, kept on this device (IndexedDB) so they can be opened again with one tap.
 */
/* ---------- recently opened files: kept on this device so they can be opened again with one tap ---------- */
const RECENT_MAX = 10;
let recentDb = null;
/**
 * Opens (once) the recent-files database.
 * @returns {Promise<IDBDatabase>}
 */
function recentOpenDb() {
  if (!recentDb)
    recentDb = new Promise((res, rej) => {
      try {
        const r = indexedDB.open("rfs-recent", 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains("files")) r.result.createObjectStore("files", { keyPath: "id" });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) {
        rej(e);
      }
    });
  return recentDb;
}
/**
 * Runs one request on the files store and resolves with its result.
 * @param {IDBTransactionMode} mode
 * @param {function(IDBObjectStore):IDBRequest} fn
 * @returns {Promise<*>}
 */
async function recentReq(mode, fn) {
  const db = await recentOpenDb();
  return new Promise((res, rej) => {
    const t = db.transaction("files", mode),
      st = t.objectStore("files");
    let out;
    const q = fn(st);
    if (q)
      q.onsuccess = () => {
        out = q.result;
      };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
/**
 * Every recent file, newest first ([] if storage is unavailable).
 * @returns {Promise<object[]>}
 */
async function recentList() {
  try {
    return ((await recentReq("readonly", (st) => st.getAll())) || []).sort((a, b) => b.when - a.when);
  } catch (e) {
    return [];
  }
}
/**
 * One recent file by id, or null.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function recentGet(id) {
  try {
    return await recentReq("readonly", (st) => st.get(id));
  } catch (e) {
    return null;
  }
}
/**
 * Removes a recent file.
 * @param {string} id
 */
async function recentDel(id) {
  try {
    await recentReq("readwrite", (st) => st.delete(id));
  } catch (e) {}
}
/**
 * Stores a recent file entry and drops the oldest past the list's limit.
 * @param {object} e entry {id, name, uri, rocket, when, data}
 */
async function recentPut(e) {
  try {
    await recentReq("readwrite", (st) => st.put(e));
    const all = await recentList();
    for (const x of all.slice(RECENT_MAX)) await recentDel(x.id);
  } catch (err) {}
}
/**
 * In the Android app, the place on the phone of the file just opened or saved ("" in a browser).
 * @returns {string}
 */
const recentAppUri = () => {
  try {
    const A = window.PocketRocketApp;
    return A && A.getSource ? String(A.getSource() || "") : "";
  } catch (e) {
    return "";
  }
};
/**
 * Adds a file just opened from the picker, or moves the same file to the top.
 * @param {ArrayBuffer} buf file contents
 * @param {string} name file name
 *
 * a file just opened from the picker; the same file (by its place on the phone, or by name in the browser) moves to the top
 */
async function recentAdd(buf, name) {
  const uri = recentAppUri(),
    id = uri || "name:" + name;
  const e = { id, name, uri, rocket: D.name || "", when: Date.now(), data: buf.slice(0) };
  await recentPut(e);
  if (SOURCE) setSource({ ...SOURCE, recentId: id });
  renderRecent();
}
/**
 * After Save changes: updates the entry to follow the file that was written.
 * @param {Uint8Array} bytes
 * @param {string} fname
 *
 * after Save changes: the entry follows the file that was written
 */
async function recentSaved(bytes, fname) {
  const old = SOURCE && SOURCE.recentId ? await recentGet(SOURCE.recentId) : null,
    uri = recentAppUri();
  const id = uri || "name:" + fname;
  if (old && old.id !== id) await recentDel(old.id);
  await recentPut({
    id,
    name: fname,
    uri,
    rocket: D.name || "",
    when: Date.now(),
    data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  if (SOURCE) setSource({ ...SOURCE, recentId: id });
  renderRecent();
}
/**
 * When a file was opened, in words ("Today 3:05 PM", "Yesterday", a date).
 * @param {number} t time, ms
 * @returns {string}
 */
function recentWhen(t) {
  const d = new Date(t),
    now = new Date(),
    days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  const tm = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return days === 0
    ? `Today ${tm}`
    : days === 1
      ? `Yesterday ${tm}`
      : days < 7
        ? d.toLocaleDateString([], { weekday: "long" })
        : d.toLocaleDateString([], {
            month: "short",
            day: "numeric",
            year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
          });
}
/**
 * Draws the recent files lists.
 */
async function renderRecent() {
  const list = await recentList(),
    cur = SOURCE && SOURCE.recentId;
  const html = (items) =>
    items
      .map(
        (e) =>
          `<div class="ritem"><button class="ropen" type="button" data-id="${esc(e.id)}"><b>${esc(e.rocket || e.name)}</b><small>${esc(e.name)} · ${esc(recentWhen(e.when))}</small></button><button class="rdel" type="button" data-del="${esc(e.id)}" aria-label="Remove ${esc(e.name)} from the list" title="Remove from list">×</button></div>`,
      )
      .join("");
  const w = document.getElementById("recentwrap"),
    l1 = document.getElementById("recentlist"),
    l2 = document.getElementById("recentlist2"),
    btn = document.getElementById("recentbtn"),
    drop = document.getElementById("recentdrop");
  if (!w) return;
  w.hidden = !list.length;
  l1.innerHTML = html(list);
  const others = list.filter((e) => e.id !== cur);
  l2.innerHTML = html(others);
  l2.hidden = !others.length;
  btn.hidden = !others.length && !EXAMPLES.length;
  if (btn.hidden) {
    drop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }
}
