/**
 * The builder's parts catalog: makers' tubes, nose cones, transitions, couplers, rings, bulkheads, lugs, parachutes and
 * streamers (data/parts-catalog.js), the picker that lists them for the part being edited, and filling a part in
 * from one. A part filled in from the catalog remembers its maker and part number (p.cat) and stays editable.
 */
import { PARTS_DB } from "../../data/parts-catalog.js";
import { BLD, bldChanged, bldFind, bldSel } from "./builder-ui.js";
import { bldAdd } from "./editor.js";
import { BLD_BODY, BLD_NAMES, bldRodFor } from "./model.js";
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import { fmt, uname } from "../ui/units.js";
/**
 * Which catalog list a builder part type is filled from (a motor mount and an inner tube are body tubes).
 */
const PART_KIND = {
  tube: "tube",
  mount: "tube",
  inner: "tube",
  nose: "nose",
  transition: "transition",
  coupler: "coupler",
  ring: "ring",
  bulkhead: "bulkhead",
  lug: "lug",
  chute: "chute",
  streamer: "streamer",
};
/**
 * What each list is called in the picker's title.
 */
const PART_TITLE = {
  tube: "Body tubes",
  nose: "Nose cones",
  transition: "Transitions",
  coupler: "Couplers",
  ring: "Centering rings",
  bulkhead: "Bulkheads",
  lug: "Launch lugs",
  chute: "Parachutes",
  streamer: "Streamers",
};
/**
 * The shape parameter a catalog shape starts with (the catalog doesn't list one).
 */
const PART_PARAM = { ogive: 1, parabolic: 1, power: 0.5, haack: 0, conical: 0, ellipsoid: 0 };
/** The part types cut from stock tube: they keep their own length when the stock is long enough. */
const TUBES = { tube: 1, mount: 1, inner: 1 };
/** The most parts the picker lists at once. */
const PART_MAX = 150;
let partCache = null;
/**
 * The catalog list a part can be filled from, or undefined if the catalog has none for it.
 * @param {object} p builder part
 * @returns {string|undefined}
 */
export const partKind = (p) => (p ? PART_KIND[p.type] : undefined);
/**
 * One list of the catalog, unpacked: each part with its maker, part number, description, material and sizes (m, kg).
 * @param {string} kind a catalog list
 * @returns {object[]}
 */
function partList(kind) {
  partCache = partCache || {};
  if (partCache[kind]) return partCache[kind];
  const mm = (x) => x / 1000;
  return (partCache[kind] = PARTS_DB[kind].map((r) => {
    const m = r[3] >= 0 ? PARTS_DB.mt[r[3]] : null,
      e = { mk: PARTS_DB.mk[r[0]], pn: r[1], desc: r[2], mat: m ? m[0] : "", dens: m ? m[1] : 0 },
      v = r.slice(4);
    if (kind === "tube" || kind === "coupler" || kind === "ring" || kind === "lug")
      Object.assign(e, { od: mm(v[0]), id: mm(v[1]), len: mm(v[2]) });
    else if (kind === "bulkhead") Object.assign(e, { od: mm(v[0]), len: mm(v[1]) });
    else if (kind === "nose")
      Object.assign(e, {
        shape: v[0],
        od: mm(v[1]),
        len: mm(v[2]),
        shD: mm(v[3]),
        shLen: mm(v[4]),
        wall: mm(v[5]),
        filled: !!v[6],
        mass: mm(v[7]),
      });
    else if (kind === "transition")
      Object.assign(e, {
        shape: v[0],
        d1: mm(v[1]),
        d2: mm(v[2]),
        len: mm(v[3]),
        sh1D: mm(v[4]),
        sh1Len: mm(v[5]),
        sh2D: mm(v[6]),
        sh2Len: mm(v[7]),
        wall: mm(v[8]),
        filled: !!v[9],
        mass: mm(v[10]),
      });
    else if (kind === "chute")
      Object.assign(e, {
        od: mm(v[0]),
        cd: v[1],
        lines: v[2],
        lineLen: mm(v[3]),
        mass: mm(v[4]),
        packLen: mm(v[5]),
        packD: mm(v[6]),
      });
    else Object.assign(e, { len: mm(v[0]), width: mm(v[1]) });
    e.s = `${e.mk} ${e.pn} ${e.desc}`.toLowerCase();
    return e;
  }));
}
/**
 * The builder fields a catalog part sets on a part of a type.
 * @param {string} kind the catalog list
 * @param {object} e catalog part, from partList
 * @returns {object}
 */
function partValues(kind, e) {
  const v = {};
  if (kind === "tube" || kind === "coupler") Object.assign(v, { od: e.od, wall: (e.od - e.id) / 2, len: e.len });
  else if (kind === "ring") Object.assign(v, { od: e.od, id_: e.id, len: e.len });
  else if (kind === "bulkhead") Object.assign(v, { od: e.od, len: e.len });
  else if (kind === "lug") Object.assign(v, { od: e.od, id_: e.id, len: e.len, kind: bldRodFor(e.id) });
  else if (kind === "nose")
    Object.assign(v, {
      shape: e.shape,
      param: PART_PARAM[e.shape] || 0,
      len: e.len,
      dia: e.od,
      tipR: 0,
      shLen: e.shLen,
      shR: e.shD > 0 && e.shLen > 0 ? e.shD / 2 : 0,
      filled: e.filled,
      ...(e.wall > 0 ? { wall: e.wall } : {}),
    });
  else if (kind === "transition")
    Object.assign(v, {
      shape: e.shape,
      param: PART_PARAM[e.shape] || 0,
      len: e.len,
      dia1: e.d1,
      dia2: e.d2,
      sh1Len: e.sh1Len,
      sh1R: e.sh1D > 0 && e.sh1Len > 0 ? e.sh1D / 2 : 0,
      sh2Len: e.sh2Len,
      sh2R: e.sh2D > 0 && e.sh2Len > 0 ? e.sh2D / 2 : 0,
      filled: e.filled,
      ...(e.wall > 0 ? { wall: e.wall } : {}),
    });
  else if (kind === "chute")
    Object.assign(v, {
      dia: e.od,
      ...(e.cd > 0 ? { cd: e.cd } : {}),
      ...(e.lines > 0 ? { lines: e.lines } : {}),
      ...(e.lineLen > 0 ? { lineLen: e.lineLen } : {}),
      ...(e.packLen > 0 ? { packLen: e.packLen } : {}),
      ...(e.packD > 0 ? { packR: e.packD / 2, packAuto: false } : {}),
    });
  else Object.assign(v, { len: e.len, width: e.width });
  if (e.mat && e.dens > 0) Object.assign(v, { mat: e.mat, dens: e.dens });
  return v;
}
/**
 * The catalog part a builder part is labelled as, if the catalog has it.
 * @param {object} p builder part
 * @returns {object|null}
 */
function partFind(p) {
  const kind = partKind(p);
  if (!kind || !p.cat || !p.cat.pn) return null;
  const mk = (p.cat.mk || "").toLowerCase(),
    pn = p.cat.pn.toLowerCase();
  return partList(kind).find((e) => e.pn.toLowerCase() === pn && e.mk.toLowerCase() === mk) || null;
}
/**
 * Whether a part labelled with a catalog part still has that part's sizes (true also when the catalog doesn't have the
 * part, as with a label from a design file: there is nothing to compare).
 * @param {object} p builder part
 * @returns {boolean}
 */
export function partAsListed(p) {
  const e = partFind(p);
  if (!e) return true;
  const v = partValues(partKind(p), e);
  // a tube cut from the stock length is still that tube
  return ["od", "wall", ...(p.type in TUBES ? [] : ["len"]), "id_", "dia", "dia1", "dia2", "shape", "width"].every(
    (k) => !(k in v) || (typeof v[k] === "number" ? Math.abs(v[k] - (p[k] || 0)) < 2e-5 : v[k] === p[k]),
  );
}
/**
 * Fills a builder part in from a catalog part: its sizes, material and listed weight; its position, name (unless it
 * still has its starting name) and everything the catalog doesn't cover are left alone.
 * @param {object} p builder part
 * @param {object} e catalog part, from partList
 * @param {boolean} [fresh] the part was just added: it takes the library part's length too
 */
function partApply(p, e, fresh) {
  const was = p.cat ? `${p.cat.mk} ${p.cat.pn}`.trim() : null,
    v = partValues(partKind(p), e);
  // tube is sold in stock lengths and cut: the part keeps its length when the stock is at least that long
  if (!fresh && p.type in TUBES && p.len > 0 && p.len <= e.len + 1e-6) delete v.len;
  Object.assign(p, v);
  // a listed weight (nose cones, transitions, parachutes) is the part's weight; without one it is worked out as usual
  if (e.mass > 0) Object.assign(p, { known: e.mass, knownOn: true });
  else Object.assign(p, { known: 0, knownOn: false });
  // a balance point set for the part this one replaces doesn't carry over
  if (p.knownCgOn !== undefined || p.knownCg > 0) p.knownCgOn = false;
  delete p.knownCalc;
  delete p.knownAll;
  if (p.name === BLD_NAMES[p.type] || p.name === was) p.name = `${e.mk} ${e.pn}`;
  p.cat = { mk: e.mk, pn: e.pn };
}
/**
 * The diameter a part of a type has to match to fit a place in the design, and what that is, or null when nothing
 * fixes it.
 * @param {string} type builder part type
 * @param {{prev?:object, next?:object, parent?:object, motor?:object}} at the body parts before and after it (a body
 *   part), or the body part it is on (any other part), and the motor a mount holds
 * @returns {{d:number, key:string, inside?:boolean, motor?:boolean, text:string}|null}
 */
function partFit(type, at) {
  const kind = PART_KIND[type],
    dia = (d) => `${fmt(d, "small")} ${uname("small")}`;
  const front = (q) => (q.type === "tube" ? q.od : q.type === "transition" ? q.dia1 : q.dia),
    aft = (q) => (q.type === "tube" ? q.od : q.type === "transition" ? q.dia2 : q.dia);
  if (!at.parent) {
    const { prev, next } = at;
    if (kind === "nose") return next ? { d: front(next), key: "od", text: `match the ${dia(front(next))} body` } : null;
    if (kind === "transition")
      return prev
        ? { d: aft(prev), key: "d1", text: `start at the ${dia(aft(prev))} body` }
        : next
          ? { d: front(next), key: "d2", text: `end at the ${dia(front(next))} body` }
          : null;
    const nb = prev || next;
    return nb
      ? { d: prev ? aft(prev) : front(next), key: "od", text: `match the ${dia(prev ? aft(prev) : front(next))} body` }
      : null;
  }
  // a mount that holds a motor: tube the motor slides into
  if (type === "mount" && at.motor && at.motor.dia > 0)
    return { d: at.motor.dia, key: "id", motor: true, text: `hold the ${Math.round(at.motor.dia * 1000)} mm motor` };
  if (at.parent.type !== "tube" || !["tube", "coupler", "ring", "bulkhead"].includes(kind)) return null;
  const inner = at.parent.od - 2 * at.parent.wall;
  if (!(inner > 0)) return null;
  return kind === "tube"
    ? { d: inner, key: "od", inside: true, text: `go inside the ${dia(inner)} tube` }
    : { d: inner, key: "od", text: `fit the inside of the ${dia(inner)} tube` };
}
/**
 * One line of a catalog part's sizes, in the display units.
 * @param {string} kind the catalog list
 * @param {object} e catalog part
 * @returns {string}
 */
function partSizes(kind, e) {
  const s = (x) => `${fmt(x, "small")} ${uname("small")}`,
    l = (x) => `${fmt(x, "len")} ${uname("len")}`;
  switch (kind) {
    case "tube":
    case "coupler":
      return `${s(e.od)} outside · ${s(e.id)} inside · ${l(e.len)} long`;
    case "ring":
      return `${s(e.od)} outside · ${s(e.id)} hole · ${s(e.len)} thick`;
    case "bulkhead":
      return `${s(e.od)} across · ${s(e.len)} thick`;
    case "lug":
      return `${s(e.id)} inside · ${l(e.len)} long`;
    case "nose":
      return `${e.shape} · ${s(e.od)} across · ${l(e.len)} long`;
    case "transition":
      return `${e.shape} · ${s(e.d1)} to ${s(e.d2)} · ${l(e.len)} long`;
    case "chute":
      return `${l(e.od)} across`;
    default:
      return `${l(e.len)} × ${s(e.width)}`;
  }
}
/**
 * The library window: a searchable list of one kind of part, by maker, narrowed to what fits. It works two ways. For
 * an existing part (id given) it lists that part's kind, and picking one fills the part in. With no id it adds a part:
 * the kind is chosen in the window, and picking one adds it where the builder's own add button would (a body part
 * after the selection, any other part on the selected body part), filled in from the library.
 * @param {string} [id] the builder part to fill in; none to add a part
 */
export function partPick(id) {
  const swap = id ? bldFind(id) : null;
  if (id && (!swap || !swap.p || !partKind(swap.p))) return;
  // where an added part goes: as bldAdd places it
  const sel = bldSel ? bldFind(bldSel) : null,
    si = sel && sel.si != null ? sel.si : 0,
    st = BLD.stages[si],
    body = sel && sel.p ? sel.parent || sel.p : st.parts.find((q) => q.type === "tube") || st.parts[0] || null,
    after = sel && sel.p ? sel.pi + 1 : st.parts.length;
  /**
   * The place a part of a type takes (see partFit).
   */
  const place = (type) => {
    if (swap)
      return swap.parent
        ? { parent: swap.parent, motor: swap.p.motor }
        : { prev: BLD.stages[swap.si].parts[swap.pi - 1], next: BLD.stages[swap.si].parts[swap.pi + 1] };
    if (type === "nose") return { next: st.parts[0] };
    if (BLD_BODY.includes(type)) return { prev: st.parts[after - 1], next: st.parts[after] };
    return { parent: body };
  };
  const types = swap
    ? [swap.p.type]
    : [
        "tube",
        ...(si === 0 && !st.parts.some((q) => q.type === "nose") ? ["nose"] : []),
        "transition",
        ...(body ? ["mount", "inner", "coupler", "ring", "bulkhead", "lug", "chute", "streamer"] : []),
      ];
  const box = document.getElementById("partpick"),
    kindSel = document.getElementById("partkind"),
    q = document.getElementById("partq"),
    mk = document.getElementById("partmk"),
    fitBox = document.getElementById("partfit"),
    list = document.getElementById("partlist"),
    count = document.getElementById("partcount");
  document.getElementById("partkindrow").hidden = !!swap;
  kindSel.innerHTML = types.map((t) => `<option value="${t}">${esc(BLD_NAMES[t])}</option>`).join("");
  let type, kind, all, fit;
  let shown = [];
  const fits = (e) => {
    const tol = Math.max(0.0008, 0.012 * fit.d);
    if (fit.motor) return e.id >= fit.d - 0.0002 && e.id <= fit.d + 0.002;
    return fit.inside ? e[fit.key] < fit.d - 0.0005 : Math.abs(e[fit.key] - fit.d) <= tol;
  };
  /**
   * Lists the parts that match the search, the maker and the fit.
   */
  const draw = () => {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean),
      maker = mk.value;
    const hits = all.filter(
      (e) => (!maker || e.mk === maker) && (!fit || !fitBox.checked || fits(e)) && words.every((w) => e.s.includes(w)),
    );
    shown = hits.slice(0, PART_MAX);
    list.innerHTML = shown.length
      ? shown
          .map(
            (e, i) =>
              `<button type="button" class="partitem" data-i="${i}"><b>${esc(e.pn)}</b><span class="note">${esc(e.mk)} · ${esc(partSizes(kind, e))}</span>${e.desc ? `<span class="note">${esc(e.desc)}</span>` : ""}</button>`,
          )
          .join("")
      : `<p class="note" style="margin:12px">Nothing matches. ${fit && fitBox.checked ? "Untick the fit box to see every size." : "Try fewer words or another maker."}</p>`;
    list.scrollTop = 0;
    count.textContent =
      hits.length > shown.length
        ? `Showing the first ${shown.length} of ${hits.length.toLocaleString()}. Search or pick a maker to narrow the list.`
        : `${hits.length.toLocaleString()} part${hits.length === 1 ? "" : "s"}`;
  };
  /**
   * Sets the window up for the kind of part chosen: its list, its makers and what fits.
   */
  const setKind = () => {
    type = kindSel.value;
    kind = PART_KIND[type];
    all = partList(kind);
    fit = partFit(type, place(type));
    document.getElementById("partttl").textContent = swap
      ? `${PART_TITLE[kind]} from the library`
      : `Add a part from the library${body && !BLD_BODY.includes(type) ? ` to ${body.name}` : ""}`;
    const makers = [...new Set(all.map((e) => e.mk))].sort((a, b) => a.localeCompare(b)),
      last = store.get("rfs-part-maker", "");
    mk.innerHTML =
      `<option value="">All makers</option>` +
      makers.map((m) => `<option${m === last ? " selected" : ""}>${esc(m)}</option>`).join("");
    document.getElementById("partfitrow").hidden = !fit;
    fitBox.checked = !!fit;
    if (fit) document.getElementById("partfittxt").textContent = `Only parts that ${fit.text}`;
    document.getElementById("partnote").hidden = !(swap && type in TUBES);
    draw();
  };
  const done = () => {
    box.hidden = true;
    q.oninput = mk.onchange = fitBox.onchange = kindSel.onchange = list.onclick = box.onclick = null;
    document.getElementById("partcancel").onclick = null;
    document.removeEventListener("keydown", onKey);
  };
  /**
   * Escape closes the window.
   */
  const onKey = (ev) => {
    if (ev.key === "Escape") done();
  };
  q.value = "";
  q.oninput = draw;
  fitBox.onchange = draw;
  kindSel.onchange = setKind;
  mk.onchange = () => {
    store.set("rfs-part-maker", mk.value);
    draw();
  };
  list.onclick = (ev) => {
    const b = ev.target.closest(".partitem");
    if (!b) return;
    const e = shown[+b.dataset.i];
    done();
    if (!e) return;
    if (!swap) {
      // a new part takes the library part whole, its length too
      bldAdd(type, (p) => partApply(p, e, true));
      return;
    }
    const now = bldFind(id);
    if (!now || !now.p) return;
    partApply(now.p, e);
    bldChanged(true);
  };
  document.getElementById("partcancel").onclick = done;
  box.onclick = (ev) => {
    if (ev.target === box) done();
  };
  document.addEventListener("keydown", onKey);
  setKind();
  box.hidden = false;
}
