/**
 * Extra fin sets: fin sets besides the main one (canards, a second set of fins), for the sustainer and the booster,
 * with their editor cards in the quick form.
 */
/* ---------- extra fin sets ---------- */
/**
 * The fields of an extra fin set's card: [key, label, kind(, choices)].
 */
const XFIN_FIELDS = [
  ["n", "Number of fins", "int"],
  ["root", "Root chord", "len"],
  ["tip", "Tip chord", "len"],
  ["span", "Span (height)", "len"],
  ["sweep", "Leading-edge sweep", "len"],
  ["t", "Thickness", "small"],
  ["pos", "POS", "len"],
  [
    "edge",
    "Edge profile",
    "sel",
    [
      ["square", "Square"],
      ["rounded", "Rounded"],
      ["airfoil", "Airfoiled"],
    ],
  ],
];
/**
 * Where the sustainer's or booster's extra fin sets live: design key, card container, main fin set and stage length.
 * @param {boolean} booster
 * @returns {object}
 */
function xfinCtx(booster) {
  return booster
    ? {
        key: "bExtraFins",
        box: "bxfins",
        add: "baddfin",
        posLabel: "Root leading edge from booster front",
        stageLen: () => D.bLength,
        main: {
          n: D.bFinCount,
          root: D.bFinRoot,
          tip: D.bFinTip,
          span: D.bFinSpan,
          sweep: D.bFinSweep,
          t: D.bFinThick,
          edge: D.bFinEdge,
          aft: D.bFinAft,
        },
        front: 0,
      }
    : {
        key: "extraFins",
        box: "xfins",
        add: "addfin",
        posLabel: "Root leading edge from nose tip",
        stageLen: () => D.length,
        main: {
          n: D.finCount,
          root: D.finRoot,
          tip: D.finTip,
          span: D.finSpan,
          sweep: D.finSweep,
          t: D.finThick,
          edge: D.finEdge,
          aft: D.finAft,
        },
        front: D.noseLen || 0,
      };
}
/**
 * A new extra fin set sized from the main fins and placed ahead of them (or of the frontmost extra set).
 * @param {object} ctx from xfinCtx
 * @returns {object} fin set
 */
function newFinSet(ctx) {
  const mainFins = ctx.main,
    bodyLen = ctx.stageLen(),
    list = D[ctx.key] || [];
  const root = mainFins.root * 0.6,
    span = mainFins.span * 0.5;
  // place it ahead of the main fins, roughly mid-body, clear of the nose
  const mainLead = bodyLen - mainFins.aft - mainFins.root;
  let pos = Math.max(ctx.front + 0.02, Math.min(mainLead - root - 0.05, 0.45 * bodyLen));
  if (list.length) pos = Math.max(ctx.front + 0.02, Math.min(...list.map((f) => f.pos)) - root - 0.05);
  return {
    n: mainFins.n,
    root,
    tip: mainFins.tip * 0.6,
    span,
    sweep: mainFins.sweep * 0.6,
    t: mainFins.t,
    pos: Math.max(0, pos),
    edge: mainFins.edge,
  };
}
/**
 * A warning about a fin set's position (past the body's ends, on the nose, overlapping the main fins), or "".
 * @param {object} ctx from xfinCtx
 * @param {object} f fin set
 * @returns {string}
 */
function xfinWarn(ctx, f) {
  const bodyLen = ctx.stageLen(),
    mainFins = ctx.main,
    mainLead = bodyLen - mainFins.aft - mainFins.root;
  if (f.pos < 0 || f.pos + f.root > bodyLen + 1e-6)
    return "This fin set runs past the end of the body. Check its position.";
  if (f.pos < ctx.front - 1e-6 && !ctx.key.startsWith("b"))
    return "The root starts on the nose cone. Drag and stability use the body radius there, but check the position.";
  if (f.pos < mainLead + mainFins.root - 1e-6 && f.pos + f.root > mainLead + 1e-6 && f.n === mainFins.n)
    return "This set overlaps the main fins along the body. If they are really one fin, enter it as the main set instead.";
  return "";
}
/**
 * Builds the extra fin set cards for both stages from the design, then draws them.
 */
function renderExtraFins() {
  for (const booster of [false, true]) {
    const ctx = xfinCtx(booster),
      box = document.getElementById(ctx.box);
    if (!box) continue;
    const list = D[ctx.key] || (D[ctx.key] = []);
    box.innerHTML = "";
    list.forEach((f, i) => {
      const card = document.createElement("div");
      card.className = "xfin";
      card.innerHTML = `<div class="xh"><b>Fin set ${i + 2}</b><button type="button" aria-label="Remove fin set ${i + 2}">Remove</button></div><div class="grid"></div><canvas aria-label="Fin set ${i + 2} shape drawn to scale"></canvas><p class="note"></p>`;
      const g = card.querySelector(".grid");
      for (const [k, label, dim, opts] of XFIN_FIELDS) {
        const id = `x${booster ? "b" : ""}${i}-${k}`,
          wrap = document.createElement("div");
        wrap.className = "fld";
        let html = `<label for="${id}">${k === "pos" ? ctx.posLabel : label}</label><div class="in">`;
        if (dim === "sel")
          html +=
            `<select id="${id}">` +
            opts.map(([v, t]) => `<option value="${v}"${f[k] === v ? " selected" : ""}>${t}</option>`).join("") +
            `</select>`;
        else {
          const val =
            dim === "int"
              ? f[k]
              : +toDisp(f[k], dim).toFixed(
                  Math.max(DIMS[units][dim]?.[2] ?? 2, dim === "len" && units === "imp" ? 2 : 0),
                );
          html +=
            `<input id="${id}" type="number" inputmode="decimal" step="any" value="${val}">` +
            (dim !== "int" && uname(dim) ? `<span class="u">${uname(dim)}</span>` : "");
        }
        wrap.innerHTML = html + "</div>";
        g.appendChild(wrap);
        const el = wrap.querySelector("input,select");
        if (dim === "sel")
          el.addEventListener("change", () => {
            f[k] = el.value;
            changed();
          });
        else
          el.addEventListener("input", () => {
            const v = parseFloat(el.value);
            if (!isFinite(v)) return;
            f[k] = dim === "int" ? Math.max(1, Math.round(v)) : Math.max(0, fromDisp(v, dim));
            if (["root", "tip", "span", "sweep"].includes(k)) delete f.pts;
            changed();
          });
      }
      card.querySelector(".xh button").onclick = () => {
        list.splice(i, 1);
        renderExtraFins();
        changed();
      };
      box.appendChild(card);
    });
    const add = document.getElementById(ctx.add);
    if (add)
      add.onclick = () => {
        list.push(newFinSet(ctx));
        renderExtraFins();
        changed();
        const cards = box.querySelectorAll(".xfin");
        const last = cards[cards.length - 1];
        if (last && last.scrollIntoView) last.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
  }
  drawExtraFins();
}
/**
 * Draws each extra fin set's outline and writes its position note and any warning.
 */
function drawExtraFins() {
  for (const booster of [false, true]) {
    const ctx = xfinCtx(booster),
      box = document.getElementById(ctx.box);
    if (!box) continue;
    const cards = box.querySelectorAll(".xfin");
    (D[ctx.key] || []).forEach((f, i) => {
      const card = cards[i];
      if (!card) return;
      const canvas = card.querySelector("canvas"),
        note = card.querySelector(".note");
      canvas.id = canvas.id || `xfcv${booster ? "b" : ""}${i}`;
      note.id = note.id || `xfnote${booster ? "b" : ""}${i}`;
      drawFinsInto(canvas.id, note.id, {
        n: f.n,
        a: f.root,
        b: f.tip,
        s: f.span,
        sw: f.sweep,
        t: f.t,
        aft: 0,
        edge: f.edge,
        noTail: true,
        pts: f.pts,
      });
      const bodyLen = ctx.stageLen(),
        warn = xfinWarn(ctx, f);
      note.textContent +=
        ` Leading edge ${fmt(f.pos, "len")} ${uname("len")} from the ${booster ? "booster’s front" : "nose tip"}, trailing edge ${fmt(Math.max(bodyLen - f.pos - f.root, 0), "len")} ${uname("len")} ahead of the ${booster ? "booster " : ""}tail.` +
        (warn ? " " + warn : "");
    });
  }
}
