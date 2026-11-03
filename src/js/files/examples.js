function renderExamples() {
  const h = EXAMPLES.map(
    (e, i) =>
      `<div class="ritem"><button class="ropen" type="button" data-ex="${i}"><b>${esc(e.title)}</b><small class="exb">${esc(e.blurb)}</small></button></div>`,
  ).join("");
  for (const id of ["exlist", "exlist2"]) {
    const l = document.getElementById(id);
    if (l) l.innerHTML = h;
  }
}
// an example opens like a file: its own copy, so nothing you change touches the example (Save changes saves a new .ork)
async function openExample(i) {
  const e = EXAMPLES[i],
    rep = document.getElementById("orkreport");
  if (!e) return;
  try {
    const buf = (await inflate(b64ToU8(e.gz), "gzip")).buffer.slice(0),
      xml = await unzipOrk(buf);
    if (await loadDesignXml(xml, e.file, buf, { example: true })) {
      if (e.name && (!D.name || /^RockSim rocket$/i.test(D.name))) {
        D.name = e.name;
        if (BLD) {
          BLD.name = e.name;
          bldSave();
        }
        try {
          bldRender();
          renderForms();
        } catch (_) {}
        rep.querySelectorAll(".rpt, .report b").forEach((x) => {
          x.textContent = x.textContent.replace(/RockSim rocket/g, e.name);
        });
      }
      const drop = document.getElementById("recentdrop");
      if (drop) {
        drop.hidden = true;
        document.getElementById("recentbtn").setAttribute("aria-expanded", "false");
      }
      renderRecent();
      window.scrollTo({ top: 0 });
    }
  } catch (err) {
    rep.innerHTML = `<div class="report err">${esc(err.message || String(err))}</div>`;
  }
}
{
  const click = (ev) => {
    const o = ev.target.closest("[data-ex]");
    if (!o) return;
    const i = +o.dataset.ex;
    confirmUnsaved(() => openExample(i), "opening an example");
  };
  document.getElementById("exlist").addEventListener("click", click);
  document.getElementById("exlist2").addEventListener("click", click);
}
renderExamples();
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
    if (await loadDesignXml(xml, e.name, buf, { recent: { ...e, live } })) {
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
setTimeout(renderRecent, 0);
