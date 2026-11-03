/**
 * The example rockets: the lists, and opening one as its own copy.
 */
/**
 * Draws the example rockets lists.
 */
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
/**
 * Opens an example rocket like a file, as its own copy (Save changes saves a new .ork).
 * @param {number} i index in EXAMPLES
 *
 * an example opens like a file: its own copy, so nothing you change touches the example (Save changes saves a new .ork)
 */
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
