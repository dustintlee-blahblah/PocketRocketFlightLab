/**
 * Recently opened files, kept on this device (IndexedDB) so they can be opened again with one tap: the list, opening
 * one, and the Android app's report of where a new design was saved. Also the prompt to save unsaved changes before
 * the open design is closed (confirmUnsaved), which opening a recent file, an example or a new design goes through.
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
/**
 * Opens a recent file again from its stored copy.
 * @param {string} id
 */
async function openRecent(id) {
  const rep = document.getElementById("orkreport"),
    e = await recentGet(id);
  if (!e) {
    renderRecent();
    return;
  }
  // on the phone, read the file itself so changes made in another app show up; the copy kept here is the fallback
  let buf = null,
    live = false;
  const A = window.PocketRocketApp;
  if (e.uri && A && A.readUri) {
    try {
      const b = A.readUri(e.uri);
      if (b) {
        const u = b64ToU8(b);
        buf = u.buffer;
        live = true;
      }
    } catch (_) {}
  }
  if (!buf) buf = e.data;
  if (!buf) {
    rep.innerHTML = `<div class="report err">${esc(e.name)} can’t be opened any more. Open it again with Open .ork / .rkt.</div>`;
    return;
  }
  try {
    const xml = await unzipOrk(buf);
    if (await openDesignAsk(xml, e.name, buf, { recent: { ...e, live } })) {
      await recentPut({ ...e, when: Date.now(), rocket: D.name || e.rocket, data: live ? buf.slice(0) : e.data });
      if (SOURCE) setSource({ ...SOURCE, recentId: e.id });
      if (e.uri && !live)
        rep
          .querySelector(".report")
          ?.insertAdjacentHTML(
            "beforeend",
            `<div class="note" style="margin-top:6px">The original file couldn’t be read, so this is the copy kept from when you last opened it. Save changes will ask where to save.</div>`,
          );
      document.getElementById("recentdrop").hidden = true;
      document.getElementById("recentbtn").setAttribute("aria-expanded", "false");
      renderRecent();
      window.scrollTo({ top: 0 });
    }
  } catch (err) {
    rep.innerHTML = `<div class="report err">${esc(err.message || String(err))}</div>`;
  }
}
/**
 * Runs an action that closes the open design, first offering to save unsaved changes (set up below).
 * @param {function} act
 * @param {string} [what] what the action does, for the prompt
 */
let confirmUnsaved = (act) => act();
{
  const box = document.getElementById("recentconfirm"),
    txt = document.getElementById("recenttxt"),
    bs = document.getElementById("recentsave"),
    dc = document.getElementById("recentdiscard");
  let pending = null;
  // before the open design is closed (another file, a new design): offer to save its changes first
  confirmUnsaved = (act, what) => {
    if (document.documentElement.classList.contains("nodesign") || !isDirty()) {
      act();
      return;
    }
    pending = act;
    txt.textContent = `You have unsaved changes to ${SOURCE ? SOURCE.name : D.name || "this design"}. Save them before ${what || "opening another file"}?`;
    bs.textContent = SOURCE ? "Save changes" : "Save as .ork file";
    bs.hidden = false;
    dc.textContent = "Discard changes";
    box.hidden = false;
    bs.focus();
  };
  const click = (ev) => {
    const d = ev.target.closest("[data-del]"),
      o = ev.target.closest("[data-id]");
    if (d) {
      recentDel(d.dataset.del).then(renderRecent);
      return;
    }
    if (!o) return;
    const id = o.dataset.id;
    confirmUnsaved(() => openRecent(id));
  };
  bs.onclick = async () => {
    const ok = await saveDesignFile(!SOURCE);
    if (ok) {
      box.hidden = true;
      const a = pending;
      pending = null;
      if (a) a();
    } else txt.textContent = "The changes weren’t saved. Save again, discard them, or cancel.";
  };
  dc.onclick = () => {
    box.hidden = true;
    const a = pending;
    pending = null;
    if (a) a();
  };
  document.getElementById("recentcancel").onclick = () => {
    box.hidden = true;
  };
  document.getElementById("recentlist").addEventListener("click", click);
  document.getElementById("recentlist2").addEventListener("click", click);
  document.getElementById("recentbtn").onclick = () => {
    const d = document.getElementById("recentdrop");
    d.hidden = !d.hidden;
    document.getElementById("recentbtn").setAttribute("aria-expanded", String(!d.hidden));
  };
}
// the Android app reports the place on the phone a new design was saved to
window.prSavedAs = async (uri) => {
  if (!uri || !SOURCE) return;
  const old = SOURCE.recentId ? await recentGet(SOURCE.recentId) : null;
  if (old && old.id !== uri) await recentDel(old.id);
  await recentPut({
    ...(old || { name: SOURCE.name, rocket: D.name || "", data: null }),
    id: uri,
    uri,
    when: Date.now(),
  });
  setSource({ ...SOURCE, recentId: uri });
  renderRecent();
};
setTimeout(renderRecent, 0);
