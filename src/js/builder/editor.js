/**
 * The Rocket tab's parts editor: the parts tree, adding parts, and the editor for the selected part (its fields, how
 * they're drawn and wired up, and the fin shape editor).
 */
import { BLD, BLD_ROOT, bldChanged, bldFind, bldRender, bldSel, setBldSel } from "./builder-ui.js";
import { bldCalcOv, bldCalcPartMass } from "./derive.js";
import { BLD_SHAPES, BLD_SIZES, bldFields, bldRootFields, bldStageFields } from "./fields.js";
import {
  BLD_BODY,
  BLD_BULK,
  BLD_BUTTONS,
  BLD_FINISH,
  BLD_LINE,
  BLD_LUG_KINDS,
  BLD_NAMES,
  BLD_ROD_LUG,
  BLD_SURF,
  bldBodyR,
  bldId,
  bldLayout,
  bldLugKind,
  bldMountMM,
  bldMounts,
  bldNew,
  bldOvOn,
  bldPts,
  bldRailLug,
  bldRodFor,
} from "./model.js";
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import {
  allMotors,
  boostId,
  firstId,
  motorId,
  setBoostId,
  setFirstId,
  setMotorId,
  setMotorTarget,
  units,
} from "../design/defaults.js";
import { renderTitle } from "../files/unsaved-changes.js";
import { findMotor } from "../motors/clusters.js";
import { motorStats } from "../motors/motor-files.js";
import { drawFinsInto } from "../ui/charts.js";
import { showTab } from "../ui/events.js";
import { bldInfo, infoBtn } from "../ui/field-help.js";
import { mdStock } from "../ui/motor-delay.js";
import { mountFilter, renderMotors } from "../ui/motor-tab.js";
import { DIMS, fmt, fromDisp, toDisp, uname } from "../ui/units.js";
/**
 * Draws the fin being edited to scale, with its distance to the end of its tube.
 */
export function bldDrawFinEdit() {
  const cv = document.getElementById("bldfinview");
  if (!cv) return;
  const f = bldSel ? bldFind(bldSel) : null;
  if (!f || !f.p || f.p.type !== "fins") return;
  const k = f.p,
    lay = bldLayout(BLD),
    body = lay.bodies.find((b) => b.p === f.parent),
    kk = body && body.kids.find((e) => e.k === k);
  const FS = {
    n: k.n,
    t: k.t,
    cant: k.cant || 0,
    edge: k.edge || "square",
    edgeTE: k.edgeTE || "",
    tailName: f.parent && f.parent.type === "tube" ? "tube end" : "aft end",
    aft: body && kk ? body.x + body.len - (kk.x + kk.len) : 0,
  };
  if (k.shape === "freeform") {
    const P = bldPts(k).pts;
    FS.pts = P;
    FS.a = P.length ? Math.max(...P.map((p) => p[0])) - Math.min(...P.map((p) => p[0])) : 0;
    FS.s = Math.max(0, ...P.map((p) => p[1]));
    FS.b = 0;
    FS.sw = 0;
    FS.showPts = true;
    FS.note =
      " Free-form: the numbered corners are the outline points above, in order. Root and span are measured from them.";
  } else if (k.shape === "elliptical") {
    const N = 60,
      a = k.root,
      sp = k.span;
    FS.pts = [];
    for (let i = 0; i <= N; i++) {
      const th = Math.PI * (1 - i / N);
      FS.pts.push([(a / 2) * (1 + Math.cos(th)), sp * Math.sin(th)]);
    }
    FS.a = a;
    FS.s = sp;
    FS.b = 0;
    FS.sw = 0;
    FS.note = " Elliptical: the root chord and span set the shape.";
  } else {
    FS.a = k.root;
    FS.b = k.tip;
    FS.s = k.span;
    FS.sw = k.sweep;
  }
  drawFinsInto("bldfinview", "bldfinnote", FS);
}
/**
 * A one-line size summary of a part, for the tree.
 * @param {object} p part
 * @returns {string}
 */
const bldSum = (p) => {
  const L_ = (v) => `${fmt(v, "len")} ${uname("len")}`;
  switch (p.type) {
    case "nose":
      return `${(BLD_SHAPES.find((s) => s[0] === p.shape) || ["", p.shape])[1]}, ${L_(p.len)}`;
    case "tube":
      return `${L_(p.len)} × ${L_(p.od)}${p.mm ? " · motor mount" : ""}`;
    case "transition":
      return `${L_(p.dia1)} → ${L_(p.dia2)}`;
    case "fins":
      return `${p.n} × ${p.shape === "freeform" ? "free-form" : p.shape}`;
    case "mount":
      return `${bldMountMM(p)} mm`;
    case "inner":
      return `${bldMountMM(p)} mm`;
    case "chute":
      return L_(p.dia);
    case "mass":
      return `${fmt(p.mass, "smass")} ${uname("smass")}`;
    case "bump":
      return `${fmt(p.w, "small")} × ${fmt(p.h, "small")} ${uname("small")}`;
    case "buttons":
      return `${p.n} × ${p.size === "custom" ? "from file" : p.size}`;
    case "raw":
      return "kept from the file";
    default:
      return "";
  }
};
/**
 * Draws the parts tree: the rocket, its stages and their parts.
 */
export function bldRenderTree() {
  const el = document.getElementById("bldtree");
  if (!el) return;
  let h = "";
  const multi = BLD.stages.length > 1;
  h += `<button class="bldrow stage${bldSel === BLD_ROOT ? " on" : ""}" data-id="${BLD_ROOT}"><b>ROCKET</b><span>TOP LEVEL</span></button>`;
  BLD.stages.forEach((st, si) => {
    if (multi)
      h += `<button class="bldrow stage${bldSel === st.id ? " on" : ""}" data-id="${st.id}"><b>${esc(st.name)}</b><span>stage ${si + 1}</span></button>`;
    st.parts.forEach((p) => {
      h += `<button class="bldrow${bldSel === p.id ? " on" : ""}" data-id="${p.id}"><b>${esc(p.name)}</b><span>${esc(bldSum(p))}</span></button>`;
      for (const k of p.kids || [])
        h += `<button class="bldrow kid${bldSel === k.id ? " on" : ""}" data-id="${k.id}"><b>${esc(k.name)}</b><span>${esc(bldSum(k))}</span></button>`;
    });
  });
  el.innerHTML = h;
  el.querySelectorAll(".bldrow").forEach(
    (b) =>
      (b.onclick = () => {
        setBldSel(b.dataset.id);
        bldRender();
      }),
  );
}
let bldAddOpen = false;
/**
 * Which Motor tab target a builder stage is: sustainer (top), booster, or a three-stage rocket's first stage.
 * @param {number} si stage index
 * @returns {string}
 */
const bldTgt = (si) => (!(si > 0) ? "sustainer" : BLD && BLD.stages.length === 3 && si === 2 ? "first" : "booster");
/**
 * Points the Motor tab at the motor size of a mount being edited.
 * @param {object} p mount part
 */
function bldMountFilterFor(p) {
  const f = p && bldFind(p.id);
  if (!f) return;
  setMotorTarget(bldTgt(f.si));
  if (typeof mountFilter === "function") mountFilter();
  if (typeof renderMotors === "function") renderMotors();
}
/**
 * Draws the buttons for the parts that can be added where the selection is.
 */
export function bldRenderAdd() {
  const el = document.getElementById("bldadd");
  if (!el) return;
  const f = bldSel ? bldFind(bldSel) : null;
  const body = f && f.p ? f.parent || f.p : null,
    si = f && f.si != null ? f.si : 0,
    hasNose = BLD.stages[0].parts.some((p) => p.type === "nose");
  const title = `Add a body part${body ? ` / Add to ${esc(body.name)}` : ""}`;
  if (!bldAddOpen) {
    el.innerHTML = `<button type="button" class="bldaddtoggle" aria-expanded="false"><span>＋ ${title}</span><span aria-hidden="true">▸</span></button>`;
    el.querySelector(".bldaddtoggle").onclick = () => {
      bldAddOpen = true;
      bldRenderAdd();
    };
    return;
  }
  let h = `<button type="button" class="bldaddtoggle" aria-expanded="true"><span>${title}</span><span aria-hidden="true">▾</span></button><div class="bldh">Add a body part${BLD.stages.length > 1 ? ` to ${esc(BLD.stages[si].name)}` : ""}</div><div class="bldadds">`;
  if (!hasNose && si === 0) h += `<button class="btn ghost" data-add="nose">Nose cone</button>`;
  h += `<button class="btn ghost" data-add="tube">Body tube</button><button class="btn ghost" data-add="transition">Transition</button></div>`;
  if (body)
    h += `<div class="bldh">Add to ${esc(body.name)}</div><div class="bldadds">${["fins", "mount", "inner", "ring", "bulkhead", "coupler", "lug", "buttons", "flyaway", "chute", "streamer", "cord", "mass", "bump"].map((t) => `<button class="btn ghost" data-add="${t}">${t === "flyaway" ? "Fly-away rail guide" : BLD_NAMES[t]}</button>`).join("")}</div>`;
  else
    h += `<p class="note" style="margin:6px 0 0">Select a body part to add fins, a motor mount, recovery and other parts to it.</p>`;
  {
    const n = BLD.stages.length;
    h += `<div class="bldadds" style="margin-top:12px">${n < 3 ? `<button class="btn ghost" data-stage="add">Add a ${n < 2 ? "booster" : "first"} stage</button>` : ""}${n > 1 ? `<button class="btn ghost" data-stage="del">Remove the ${n > 2 ? "first" : "booster"} stage</button>` : ""}</div>`;
  }
  el.innerHTML = h;
  el.querySelector(".bldaddtoggle").onclick = () => {
    bldAddOpen = false;
    bldRenderAdd();
  };
  // the section folds up again once a part is added
  el.querySelectorAll("[data-add]").forEach(
    (b) =>
      (b.onclick = () => {
        bldAddOpen = false;
        bldAdd(b.dataset.add);
      }),
  );
  el.querySelectorAll("[data-stage]").forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.stage === "add") {
          const third = BLD.stages.length === 2,
            above = BLD.stages[BLD.stages.length - 1],
            last = above.parts.slice(-1)[0],
            R = last ? bldBodyR(last) : 0.0333,
            nm = third ? "First stage" : "Booster";
          const t = { ...bldNew("tube", R), name: nm + " tube", len: R * 10 },
            m = { ...bldNew("mount", R), name: nm + " motor mount" };
          t.kids = [
            { ...bldNew("fins", R), name: nm + " fins", span: R * 2.6 },
            m,
            { ...bldNew("ring", R), name: "Aft centering ring", pos: 0.003 },
            { ...bldNew("ring", R), name: "Forward centering ring", pos: 0.185 },
          ];
          BLD.stages.push({ id: bldId(), name: nm, sepDelay: 0, parts: [t] });
          above.ignDelay = above.ignDelay || 0;
          if (BLD.stages[0].name === "Stage") BLD.stages[0].name = "Sustainer";
          setBldSel(t.id);
          if (third) {
            if (!findMotor(firstId) || Math.abs(findMotor(firstId).dia - findMotor(boostId)?.dia) > 0.002) {
              setFirstId(boostId);
              store.set("rfs-b1motor", firstId);
            }
          } else if (!findMotor(boostId) || Math.abs(findMotor(boostId).dia - findMotor(motorId)?.dia) > 0.002) {
            setBoostId(motorId);
            store.set("rfs-bmotor", boostId);
          }
        } else {
          BLD.stages.length = BLD.stages.length - 1;
          setBldSel(BLD.stages[0].parts[0]?.id || BLD_ROOT);
        }
        bldAddOpen = false;
        bldChanged(true);
      }),
  );
}
/**
 * Adds a part: a body part after the selection, or an attached part on the selected body part.
 * @param {string} type
 */
function bldAdd(type) {
  const f = bldSel ? bldFind(bldSel) : null,
    si = f && f.si != null ? f.si : 0,
    st = BLD.stages[si];
  if (BLD_BODY.includes(type)) {
    const at = f && f.p && !f.parent ? f.pi + 1 : f && f.parent ? f.pi + 1 : st.parts.length,
      prev = st.parts[at - 1],
      R = prev ? (prev.type === "nose" ? prev.dia / 2 : prev.type === "tube" ? prev.od / 2 : prev.dia2 / 2) : 0.0333;
    const p = bldNew(type, R);
    if (type === "nose") st.parts.unshift(p);
    else st.parts.splice(at, 0, p);
    setBldSel(p.id);
  } else if (type === "flyaway") {
    /* a fly-away rail guide: a cage around the body that rides the rail and falls away at its end. It is kept as a
       protuberance of shape "flyaway" (its weight and drag count only on the rail), placed just above the fins: on
       the selected body tube if it has fins, otherwise on the stage's body tube that does */
    const sel = f && f.p ? f.parent || f.p : null,
      hasFins = (q) => q && (q.kids || []).some((k) => k.type === "fins"),
      body = hasFins(sel)
        ? sel
        : st.parts.find(hasFins) || sel || st.parts.find((p) => p.type === "tube") || st.parts[0];
    if (!body) return;
    const k = {
      ...bldNew("bump", bldBodyR(body)),
      name: "Fly-away rail guide",
      shape: "flyaway",
      h: 0.02,
      len: 0.06,
      mass: 0.1,
    };
    body.kids = body.kids || [];
    body.kids.push(k);
    const b = bldLayout(BLD).bodies.find((q) => q.p === body),
      fn = b && b.kids.find((q) => q.k.type === "fins");
    if (fn) {
      k.ref = "top";
      k.pos = Math.max(fn.x - b.x - k.len, 0);
    }
    setBldSel(k.id);
  } else {
    const body = f && f.p ? f.parent || f.p : st.parts.find((p) => p.type === "tube") || st.parts[0];
    if (!body) return;
    const k = bldNew(type, bldBodyR(body));
    if (type === "ring" || type === "bulkhead" || type === "coupler") k.od = 0;
    if (type === "mount" && BLD.stages.indexOf(st) === 0 && !bldMounts(st).length) {
      const m = findMotor(motorId);
      if (m && Math.abs(m.dia - (k.od - 2 * k.wall)) < 0.002)
        k.motor = { id: m.id, mfr: m.mfr || m.brand, name: m.name, dia: m.dia, len: m.len };
    }
    body.kids = body.kids || [];
    body.kids.push(k);
    setBldSel(k.id);
  }
  bldChanged(true);
}
/**
 * Draws the editor for the selected part, stage or rocket.
 */
export function bldRenderEdit() {
  const el = document.getElementById("bldedit");
  if (!el) return;
  const f = bldSel ? bldFind(bldSel) : null;
  if (!f) {
    el.innerHTML = `<p class="note">Select a part to change it.</p>`;
    return;
  }
  if (f.root) {
    let h = `<div class="bldh">Whole rocket</div><div class="grid">`;
    for (const [key, label, kind, dim, obj, opts] of bldRootFields()) {
      const O = obj || BLD;
      h += bldFieldHtml(
        {
          key,
          label,
          kind,
          dim,
          opts,
          on: kind === "ovr" ? bldOvOn(O, key) : undefined,
          armed: kind === "ovr" && O[key + "On"] === true,
          calc: kind === "ovr" ? bldCalcOv(key, 0) : undefined,
        },
        O[key] ?? (key === "finish" ? BLD.settings.finish : key === "blMode" ? "turb" : undefined),
      );
    }
    el.innerHTML = h + `</div>`;
    bldWire(el, null, "root");
    return;
  }
  if (f.stage) {
    const st = f.stage;
    let h = `<div class="bldh">${esc(st.name)}</div><div class="grid">`;
    for (const [key, label, kind, dim, obj, alias] of bldStageFields(st, f.si))
      h += bldFieldHtml(
        {
          key,
          label,
          kind,
          dim,
          on: kind === "ovr" ? bldOvOn(obj || st, obj ? alias : key) : undefined,
          armed: kind === "ovr" && (obj || st)[(obj ? alias : key) + "On"] === true,
          calc: kind === "ovr" ? bldCalcOv(obj ? alias : key, f.si) : undefined,
        },
        obj ? obj[alias] : st[key],
      );
    el.innerHTML = h + `</div>`;
    bldWire(el, st, "stage", f.si);
    return;
  }
  const p = f.p,
    fields = bldFields(p),
    body = !f.parent;
  let h = `<div class="bldh">${esc(p.type === "bump" && p.shape === "flyaway" ? "Fly-away rail guide" : BLD_NAMES[p.type])}${p.type === "raw" ? ` (${esc(p.tag)})` : ""}</div>`;
  // the motor itself is chosen on the Motor tab; the mount shows which one it holds
  {
    const host = p.type === "mount" ? p : p.type === "tube" && p.mm ? p.mm : null;
    if (host) {
      const f = bldFind(p.id),
        st = BLD.stages[f ? f.si : 0],
        primary = st && bldMounts(st)[0] === host;
      h += `<p class="note" style="margin:0 0 10px">Motor: <b>${esc(host.motor ? (host.motor.mfr ? host.motor.mfr + " " : "") + host.motor.name : "none")}</b>${primary ? ` · <a href="#" data-gomotor="1">choose it on the Motor tab</a>` : " · from the file"}</p>`;
    }
  }
  if (p.type === "raw")
    h += `<p class="note" style="margin:0 0 10px">This part came from the file and the builder can’t change its shape, but it still counts in the weight, balance and drag, and it’s kept when you save. You can rename or move it.</p>`;
  h += `<div class="grid">`;
  for (const [key, label, kind, opt] of fields) {
    const val =
      key === "isMount"
        ? !!p.mm
        : key === "mmMotor"
          ? p.mm && p.mm.motor
          : key === "mmDelay"
            ? p.mm && p.mm.delay
            : key === "mmOverhang"
              ? p.mm && p.mm.overhang
              : key === "kind" && p.type === "lug"
                ? bldLugKind(p) // a lug from a file that doesn't say: its type read from its size
                : key === "w" && p.type === "lug"
                  ? (bldRailLug(p) || {}).w
                  : p[key];
    h += bldFieldHtml(
      {
        key,
        label,
        kind,
        dim: typeof opt === "string" ? opt : null,
        opts: Array.isArray(opt) ? opt : null,
        p,
        parent: f.parent,
        on: kind === "ovr" ? bldOvOn(p, key) : undefined,
        armed: kind === "ovr" && p[key + "On"] === true,
        calc: kind === "ovr" && key === "known" ? bldCalcPartMass(p.id) : undefined,
      },
      val,
    );
  }
  h += `</div><div class="row" style="margin-top:12px;gap:8px">${body ? `<button class="btn ghost" data-act="up">Move forward</button><button class="btn ghost" data-act="down">Move aft</button>` : ""}<button class="btn ghost" data-act="dup">Duplicate</button><button class="btn ghost" data-act="del">Delete</button></div>`;
  if (p.type === "fins")
    h += `<canvas id="bldfinview" aria-label="This fin drawn to scale, with the sizes that set its shape"></canvas><p class="note" id="bldfinnote"></p>`;
  el.innerHTML = h;
  bldWire(el, p, "part");
  if (p.type === "fins") requestAnimationFrame(bldDrawFinEdit);
  el.querySelector("[data-gomotor]")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof mountFilter === "function") {
      setMotorTarget(bldTgt(f.si));
      mountFilter();
    }
    if (typeof renderMotors === "function") renderMotors();
    showTab("motor");
    window.scrollTo({ top: 0 });
  });
  el.querySelectorAll("[data-act]").forEach(
    (b) =>
      (b.onclick = () => {
        const st = BLD.stages[f.si];
        if (b.dataset.act === "del") {
          if (f.parent) {
            f.parent.kids.splice(f.ki, 1);
            setBldSel(f.parent.id);
          } else {
            st.parts.splice(f.pi, 1);
            setBldSel(st.parts[Math.max(0, f.pi - 1)]?.id || BLD_ROOT);
          }
        } else if (b.dataset.act === "dup") {
          const c = JSON.parse(JSON.stringify(p));
          const reid = (x) => {
            x.id = bldId();
            (x.kids || []).forEach(reid);
          };
          reid(c);
          c.name += " copy";
          if (f.parent) f.parent.kids.splice(f.ki + 1, 0, c);
          else st.parts.splice(f.pi + 1, 0, c);
          setBldSel(c.id);
        } else {
          const j = f.pi + (b.dataset.act === "up" ? -1 : 1);
          if (j < 0 || j >= st.parts.length) return;
          [st.parts[f.pi], st.parts[j]] = [st.parts[j], st.parts[f.pi]];
        }
        bldChanged(true);
      }),
  );
}
/**
 * The HTML of one editor field.
 * @param {object} F field {key, label, kind, dim}
 * @param {*} val its value
 * @returns {string}
 */
function bldFieldHtml(F, val) {
  const id = "bf-" + F.key,
    wide = F.kind === "pts" || F.kind === "motor" || F.kind === "pos" || F.kind === "check" || F.kind === "ovr";
  let inp = "";
  const num = (v, dim) =>
    v == null || v === "" || !isFinite(v)
      ? ""
      : +toDisp(+v, dim).toFixed(
          dim === "none"
            ? 4
            : dim === "moi"
              ? 3
              : Math.max(
                  DIMS[units][dim]?.[2] ?? 2,
                  dim === "len" && units === "imp" ? 2 : dim === "small" && units === "met" ? 2 : 0,
                ),
        ) + 0;
  switch (F.kind) {
    case "text":
      inp = `<div class="in"><input id="${id}" type="text" value="${esc(val ?? "")}"></div>`;
      break;
    case "int":
      inp = `<div class="in"><input id="${id}" type="number" inputmode="numeric" step="1" min="1" value="${val ?? 1}"></div>`;
      break;
    case "num": {
      const dim = F.dim || "none",
        blankable = ["delay", "mmDelay", "knownCg"].includes(F.key),
        v = blankable && (val == null || val === "") ? "" : num(val ?? 0, dim);
      // a value the app works out (turning inertia) fills the field until one is typed
      const calc = F.calc != null && !(+val > 0);
      inp = `<div class="in"><input id="${id}" type="number" inputmode="decimal" step="any" value="${calc ? num(F.calc, dim) : v}">${uname(dim) ? `<span class="u">${uname(dim)}</span>` : ""}</div>`;
      if (F.calc != null)
        inp += `<div class="note fldnote">${calc ? "Calculated from the parts. Type a measured value to replace it." : `Your value. Clear the field to use the calculated ${num(F.calc, dim)} ${esc(uname(dim))}.`}</div>`;
      break;
    }
    case "check":
      inp = `<label class="chk"><input id="${id}" type="checkbox" ${val ? "checked" : ""}> <span>${esc(F.label)}</span></label>`;
      break;
    case "ovr": {
      // a value worked out from the design, or your own when the Override switch is on. Switched on with nothing to
      // start from (a calculated weight of 0), the box opens empty for your value.
      const dim = F.dim || "none",
        hasCalc = F.calc != null && isFinite(F.calc),
        open = F.on || F.armed,
        shown = F.on ? num(val, dim) : F.armed ? "" : hasCalc ? num(F.calc, dim) : "";
      inp = `<div class="ovrow"><div class="in"><input id="${id}" type="number" inputmode="decimal" step="any" value="${shown}" ${open ? "" : "disabled"} placeholder="${F.on ? "" : F.armed ? "your value" : "calculated"}">${uname(dim) ? `<span class="u">${uname(dim)}</span>` : ""}</div><label class="ovsw"><input id="bfo-${F.key}" type="checkbox" ${open ? "checked" : ""}><span class="ovtrack" aria-hidden="true"></span><span>Override</span></label></div>`;
      const rs = F.p && F.p.knownCalc && F.key === "known",
        calcTxt = hasCalc ? ` This app calculates ${num(F.calc, dim)} ${esc(uname(dim))}.` : "";
      const note = F.on
        ? (rs ? "RockSim’s calculated weight, from the design file." : "Your value.") + calcTxt
        : F.armed
          ? "Enter your value." + calcTxt
          : "Calculated from the design.";
      inp += `<div class="note fldnote">${note}</div>`;
      break;
    }
    case "sel":
      inp = `<div class="in"><select id="${id}">${F.opts.map(([k, l]) => `<option value="${esc(k)}" ${String(val) === String(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
      break;
    case "finish":
      inp = `<div class="in"><select id="${id}">${val ? "" : `<option value="" selected>As set on each part</option>`}${BLD_FINISH.map(([k, l]) => `<option value="${k}" ${val === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
      break;
    case "bulk":
    case "surf":
    case "line": {
      const list = F.kind === "bulk" ? BLD_BULK : F.kind === "surf" ? BLD_SURF : BLD_LINE,
        std = list.some((x) => x[0] === val);
      inp = `<div class="in"><select id="${id}">${std ? "" : `<option value="${esc(val || "")}" selected>${esc(val || "From file")} (from file)</option>`}${list.map(([nm]) => `<option ${nm === val ? "selected" : ""}>${esc(nm)}</option>`).join("")}</select></div>`;
      break;
    }
    case "pts": {
      const t = String(val || "")
        .split(/[\n;]+/)
        .map((l) =>
          l
            .split(/[ ,\t]+/)
            .filter(Boolean)
            .map(Number),
        )
        .filter((a) => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]))
        .map((a) => `${num(a[0], "len")}, ${num(a[1], "len")}`)
        .join("\n");
      inp = `<div class="in"><textarea id="${id}" rows="6" spellcheck="false" placeholder="0, 0\n${num(0.1, "len")}, ${num(0.08, "len")}\n${num(0.15, "len")}, ${num(0.08, "len")}\n${num(0.15, "len")}, 0">${esc(t)}</textarea></div>`;
      break;
    }
    case "size": {
      const mm = bldMountMM(F.p),
        opts = BLD_SIZES.map((s) => `<option value="${s}" ${s === mm ? "selected" : ""}>${s} mm</option>`).join("");
      inp = `<div class="in"><select id="${id}">${BLD_SIZES.includes(mm) ? "" : `<option value="" selected>${mm} mm (custom)</option>`}${opts}</select></div>`;
      break;
    }
    case "motor": {
      const host = F.key === "mmMotor" ? F.p : F.p,
        inner = F.key === "mmMotor" ? host.od - 2 * host.wall : host.od - 2 * host.wall,
        list = allMotors()
          .filter((m) => m.dia <= inner + 0.0005 && m.dia >= inner - 0.004)
          .sort((a, b) => a.dia - b.dia || motorStats(a).I - motorStats(b).I);
      const cur = val && ((val.id && findMotor(val.id)) || list.find((m) => m.name === val.name)),
        extra =
          val && !cur ? `<option value="__file" selected>${esc(val.name)} (from file, not in your list)</option>` : "";
      inp = `<div class="in"><select id="${id}"><option value="">None yet</option>${extra}${list.map((m) => `<option value="${esc(m.id)}" ${cur && cur.id === m.id ? "selected" : ""}>${esc((m.cn && m.cn !== m.name ? m.cn + " " : "") + m.name)} · ${Math.round(m.dia * 1000)} mm · ${esc((m.brand || m.mfr || "") + (m.builtin ? "" : ", uploaded"))}</option>`).join("")}</select></div>`;
      break;
    }
    case "pos": {
      inp = `<div class="row" style="gap:6px;flex-wrap:nowrap"><div class="in" style="flex:1.4"><select id="bf-ref"><option value="bottom" ${F.p.ref !== "top" ? "selected" : ""}>From aft end</option><option value="top" ${F.p.ref === "top" ? "selected" : ""}>From front</option></select></div><div class="in" style="flex:1"><input id="${id}" type="number" inputmode="decimal" step="any" value="${num(val, "len")}"><span class="u">${uname("len")}</span></div></div>`;
      break;
    }
  }
  const label = F.kind === "pos" ? `Position on ${F.parent ? F.parent.name : "the body"}` : F.label;
  const ib = infoBtn(F.kind === "pos" ? "Position" : label, bldInfo(F));
  return F.kind === "check"
    ? `<div class="fld wide"><div class="chkrow">${inp}${ib}</div></div>`
    : `<div class="fld${wide ? " wide" : ""}"><div class="lh"><label for="${id}">${esc(label)}</label>${ib}</div>${inp}</div>`;
}
/**
 * Connects the editor's inputs to the part they edit.
 * @param {HTMLElement} el editor
 * @param {object} p part, stage or rocket
 * @param {string} mode "root", "stage" or "part"
 * @param {number} si stage index
 */
function bldWire(el, p, mode, si) {
  const spec = mode === "root" ? bldRootFields() : mode === "stage" ? bldStageFields(p, si) : bldFields(p);
  el.querySelectorAll("[id^=bf-]").forEach((inp) => {
    const key = inp.id.slice(3);
    const ev = inp.tagName === "SELECT" || inp.type === "checkbox" ? "change" : "input";
    inp.addEventListener(ev, () => {
      const f = spec.find((x) => x[0] === key) || (key === "ref" ? ["ref", "", "ref"] : null);
      if (!f) return;
      const kind = f[2],
        dim = typeof f[3] === "string" ? f[3] : "none";
      // where the value lives: the part, the stage, or the rocket-wide settings
      let O = p,
        k = key;
      if (mode === "root") {
        O = f[4] || BLD;
        if (key === "finish") O = BLD.settings;
      }
      if (mode === "stage" && f[4]) {
        O = f[4];
        k = f[5];
      }
      let full = false;
      if (key === "ref") {
        p.ref = inp.value;
      } else if (kind === "text") {
        O[k] = inp.value;
        if (mode === "root" && key === "name") renderTitle();
      } else if (kind === "int") {
        const v = parseInt(inp.value, 10);
        if (v >= 1) O[k] = Math.min(v, 24);
      } else if (kind === "check") {
        if (key === "isMount") {
          p.mm = inp.checked ? { overhang: 0.006, motor: null, delay: null, ign: "automatic", ignDelay: 0 } : null;
          if (inp.checked) {
            const m = findMotor(motorId);
            if (m && Math.abs(m.dia - (p.od - 2 * p.wall)) < 0.002)
              p.mm.motor = { id: m.id, mfr: m.mfr || m.brand, name: m.name, dia: m.dia, len: m.len };
          }
        } else O[k] = inp.checked;
        full = true;
      } else if (kind === "sel") {
        O[k] = inp.value;
        full = ["shape", "deploy", "size", "cluster", "ign", "edge", "edgeTE", "kind"].includes(key); // "edge": beveled fins show their bevel lengths; "kind": a rail lug has no diameters
        // a nose or transition takes its new shape's usual parameter (as OpenRocket does): a tangent ogive, a full
        // parabola, a half-power series, a von Kármán. Kept from the old shape it can mean a plain cone (an ogive or
        // parabola at 0, a power series at 1), so the new shape would look like nothing had changed.
        if (key === "shape" && p && (p.type === "nose" || p.type === "transition")) {
          const usual = { ogive: 1, parabolic: 1, power: 0.5, haack: 0 }[inp.value];
          if (usual != null) p.param = usual;
        }
        // choosing a lug type: a rail lug is a plastic slider (Delrin); a rod lug gets the usual size for its rod when
        // it is too small to slide over it. A lug still under a default name is named after its type
        if (key === "kind" && p && p.type === "lug") {
          const R = BLD_ROD_LUG[inp.value];
          if (R) {
            if (p.mat === "Delrin") p.mat = "Cardboard";
            // too small for the rod, or big enough for the next larger rod and so loose on this one
            if (bldRodFor(p.id_) !== inp.value) Object.assign(p, { id_: R.id, od: R.od });
          } else {
            // a rail slider the size of that rail's button
            const P = BLD_BUTTONS[inp.value.slice(1)];
            Object.assign(p, { mat: "Delrin", od: P.h, id_: 0, w: P.od });
          }
          if (!p.name || /^launch lug( \(.*\))?$/i.test(p.name) || /^launch lug - /i.test(p.name))
            p.name = `Launch lug (${(BLD_LUG_KINDS.find((x) => x[0] === inp.value) || [])[1]})`;
        }
        // a fly-away rail guide sits just above the fins: choosing that shape puts it there (on a body with fins)
        if (key === "shape" && p && p.type === "bump" && inp.value === "flyaway") {
          const b = bldLayout(BLD).bodies.find((q) => (q.p.kids || []).includes(p)),
            f = b && b.kids.find((q) => q.k.type === "fins");
          if (f) {
            p.ref = "top";
            p.pos = Math.max(f.x - b.x - (p.len || 0), 0);
          }
        }
        // switching fins to free-form starts from the outline they had, so there's a shape to edit
        if (key === "shape" && p && p.type === "fins" && inp.value === "freeform" && !bldPts(p).pts.length) {
          const r = p.root || 0.1,
            sp = p.span || 0.05,
            sw = p.sweep || 0,
            tp = p.tip || 0;
          p.pts = [
            [0, 0],
            [sw, sp],
            [sw + tp, sp],
            [r, 0],
          ]
            .map(([x, y]) => `${+x.toFixed(6)},${+y.toFixed(6)}`)
            .join("\n");
        }
      } else if (kind === "finish") {
        BLD.settings.finish = inp.value || null;
        if (inp.value)
          for (const st of BLD.stages)
            for (const q of st.parts) {
              delete q.finish;
              for (const c of q.kids || []) delete c.finish;
            }
        full = true;
      } else if (kind === "bulk" || kind === "surf" || kind === "line") {
        const list = kind === "bulk" ? BLD_BULK : kind === "surf" ? BLD_SURF : BLD_LINE;
        if (list.some((x) => x[0] === inp.value)) {
          O[k] = inp.value;
          delete O.dens;
        }
      } else if (kind === "pts") {
        p.pts = inp.value
          .split(/\n+/)
          .map((l) =>
            l
              .split(/[ ,\t]+/)
              .filter(Boolean)
              .map(Number),
          )
          .filter((a) => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]))
          .map((a) => `${fromDisp(a[0], "len")},${fromDisp(a[1], "len")}`)
          .join("\n");
      } else if (kind === "size") {
        const s = parseInt(inp.value, 10);
        if (s > 0) {
          p.od = s / 1000 + 2 * p.wall + 0.0004;
          if (p.motor && Math.abs(p.motor.dia - s / 1000) > 0.0015) p.motor = null;
          full = true;
        }
      } else if (kind === "motor") {
        if (inp.value === "__file") return;
        const m = findMotor(inp.value),
          host = key === "mmMotor" ? p.mm : p;
        const hadM = host.motor
          ? findMotor(host.motor.id) || allMotors().find((x) => x.name === host.motor.name)
          : null;
        host.motor = m ? { id: m.id, mfr: m.mfr || m.brand, name: m.name, dia: m.dia, len: m.len } : null;
        // the delay (set on the Motor tab): a new mount's first motor gets its middle stock delay; a stock delay of the
        // previous motor moves to the nearest one this motor offers; plugged and custom times stay
        if (m) {
          const b = mdStock(m).list.filter((x) => x > 0);
          if (!hadM && host.delay == null) {
            if (b.length) host.delay = b[Math.floor(b.length / 2)];
          } else if (
            hadM &&
            host.delay != null &&
            b.length &&
            !b.includes(+host.delay) &&
            mdStock(hadM).list.includes(+host.delay)
          )
            host.delay = b.reduce((x, y) => (Math.abs(y - host.delay) < Math.abs(x - host.delay) ? y : x), b[0]);
        }
        // the stage's main mount flies the motor the Motor tab shows
        const f2 = bldFind(p.id),
          st = BLD.stages[f2 ? f2.si : 0],
          isPrimary = bldMounts(st)[0] === host;
        if (m && isPrimary) {
          const tg = bldTgt(BLD.stages.indexOf(st));
          if (tg === "sustainer") {
            setMotorId(m.id);
            store.set("rfs-motor", motorId);
          } else if (tg === "first") {
            setFirstId(m.id);
            store.set("rfs-b1motor", firstId);
          } else {
            setBoostId(m.id);
            store.set("rfs-bmotor", boostId);
          }
          if (typeof mountFilter === "function") {
            setMotorTarget(tg);
            mountFilter();
          }
          if (typeof renderMotors === "function") renderMotors();
        }
        full = true;
      } else if (kind === "num" || kind === "pos" || kind === "ovr") {
        const raw = inp.value.trim();
        const blank = raw === "";
        if (blank && kind === "ovr") {
          if (k === "knownCg" || k === "cdo") delete O[k];
          else O[k] = 0;
        } else if (blank && ["dryInertia", "inertia"].includes(key)) {
          // cleared: back to the calculated value (shown once typing is done)
          O[k] = 0;
        } else if (blank && (key === "delay" || key === "mmDelay")) {
          (key === "mmDelay" ? p.mm : O).delay = null;
        } else if (blank && key === "knownCg") {
          delete O.knownCg;
        } else {
          const v = parseFloat(raw);
          if (!isFinite(v)) return;
          const val = fromDisp(v, kind === "pos" ? "len" : dim);
          if (key === "mmDelay") p.mm.delay = val;
          else if (key === "mmOverhang") p.mm.overhang = val;
          else {
            O[k] = val;
            if (k === "packLen" || k === "packR" || k === "len") delete O.packAuto;
            if (kind === "num" && !["pos", "param", "cant", "knownCg"].includes(key) && O[k] < 0) O[k] = 0;
            // values no rocket has, which a slip of the finger can type and which break or freeze the flight:
            // a shape parameter outside 0 to 1, fins canted more than 15° (OpenRocket's limit too), a canopy drag
            // coefficient above 10, a nose with no length (the flight comes out as not a number)
            if (key === "param") O[k] = Math.min(Math.max(O[k], 0), 1);
            else if (key === "cant") O[k] = Math.min(Math.max(O[k], -15), 15);
            else if (key === "cd" && p && (p.type === "chute" || p.type === "streamer")) O[k] = Math.min(O[k], 10);
            else if (key === "len" && p && p.type === "nose" && !(O[k] > 0)) O[k] = 0.001;
          }
        }
      }
      // RockSim's own weight for a part no longer fits once the part changes; typing a weight makes it a measured one
      if (
        p &&
        p.knownCalc &&
        mode !== "root" &&
        mode !== "stage" &&
        !["name", "pos", "ref", "known", "knownAll"].includes(key)
      ) {
        p.known = 0;
        delete p.knownCg;
        delete p.knownCalc;
        full = true;
      } else if (p && key === "known") delete p.knownCalc;
      bldChanged(full);
      if (kind === "size") bldMountFilterFor(p);
    });
    // fields that change what else is shown redraw the panel once typing is done, so the keyboard stays open while typing
    if (
      ev === "input" &&
      ((key === "od" && p && p.type === "mount") || key === "known" || key === "dryInertia" || key === "inertia")
    )
      inp.addEventListener("change", () => {
        bldChanged(true);
        if (key === "od") bldMountFilterFor(p);
      });
    if (ev === "input" && p && p.type === "tube" && p.mm && (key === "od" || key === "wall"))
      inp.addEventListener("change", () => bldMountFilterFor(p));
  });
  // the Override switches: on uses the value in the field (starting from the calculated one), off the calculated value
  el.querySelectorAll("[id^=bfo-]").forEach((sw) => {
    const key = sw.id.slice(4),
      f = spec.find((x) => x[0] === key);
    if (!f) return;
    sw.addEventListener("change", () => {
      let O = p,
        k = key;
      if (mode === "root") O = f[4] || BLD;
      if (mode === "stage" && f[4]) {
        O = f[4];
        k = f[5];
      }
      if (sw.checked) {
        O[k + "On"] = true;
        if (!bldOvOn(O, k)) {
          const c = mode === "part" ? (k === "known" ? bldCalcPartMass(p.id) : undefined) : bldCalcOv(k, si || 0);
          if (c != null && isFinite(c) && (c > 0 || k === "knownCg" || k === "cdo")) O[k] = c;
          if (k === "known") delete O.knownCalc;
        }
      } else O[k + "On"] = false;
      bldChanged(true);
    });
  });
}
