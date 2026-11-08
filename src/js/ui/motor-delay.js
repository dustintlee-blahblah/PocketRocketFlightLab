/**
 * The Motor tab's motor configuration picker (for OpenRocket files with several) and Motor Delay, the one ejection
 * delay setting for each stage (see the note below), with the side view that shows which stage is being chosen for.
 */
import { BLD, bldChanged } from "../builder/builder-ui.js";
import { bldMounts } from "../builder/model.js";
import { esc } from "../core/helpers.js";
import { allMotors, curBoost, curFirst, curMotor, D, motorTarget, setMotorTarget } from "../design/defaults.js";
import { loadDesignXml } from "../files/open-file.js";
import { SOURCE } from "../files/save.js";
import { findMotor } from "../motors/clusters.js";
import { aero, finOutline, radiusAt, segR } from "../physics/aerodynamics.js";
import { fullStack, isThree } from "../physics/staging.js";
import { setupCanvas } from "./charts.js";
import { mountFilter, renderMotors, setPickSlot, TGT_NAME, tgtFirst } from "./motor-tab.js";
import { lastSim } from "./results.js";
import { changed } from "./state.js";
/* ---------- motor configurations of an OpenRocket file (Motor tab) ---------- */
/**
 * The motor configurations in an OpenRocket file, with a label from their motors and delays.
 * @param {string} xml
 * @returns {{id:string, label:string, def:boolean}[]} def: the file's default configuration
 */
function orkConfigs(xml) {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml"),
      rocket = doc.getElementsByTagName("rocket")[0];
    if (!rocket) return [];
    const cfgs = [...rocket.children].filter((c) => c.tagName === "motorconfiguration"),
      motors = [...rocket.getElementsByTagName("motor")];
    return cfgs.map((c) => {
      const id = c.getAttribute("configid"),
        nm = (c.getElementsByTagName("name")[0]?.textContent || "").trim();
      const ms = motors
        .filter((m) => m.getAttribute("configid") === id)
        .map((m) => {
          const d = (m.getElementsByTagName("designation")[0]?.textContent || "").trim(),
            dl = (m.getElementsByTagName("delay")[0]?.textContent || "").trim().toLowerCase();
          return d ? `${d}-${!dl || dl === "none" || dl === "p" ? "P" : +parseFloat(dl).toFixed(1)}` : null;
        })
        .filter(Boolean);
      return {
        id,
        label: (nm && !/^[[{].*[\]}]$/.test(nm) ? nm + ": " : "") + (ms.length ? ms.join(" + ") : "no motor"),
        def: c.getAttribute("default") === "true",
      };
    });
  } catch (e) {
    return [];
  }
}
/**
 * Shows the configuration picker when the open .ork file has two or more configurations.
 */
export function cfgRender() {
  const pn = document.getElementById("cfgpanel");
  if (!pn) return;
  const list = SOURCE && SOURCE.format === "ork" && SOURCE.text ? orkConfigs(SOURCE.text) : [];
  pn.hidden = list.length < 2;
  if (pn.hidden) return;
  const cur = (BLD && BLD.cfg) || (SOURCE.src && SOURCE.src.cfg) || null,
    sel = document.getElementById("cfgsel");
  sel.innerHTML = list
    .map(
      (c) =>
        `<option value="${esc(c.id)}"${c.id === cur ? " selected" : ""}>${esc(c.label)}${c.def ? " (default)" : ""}</option>`,
    )
    .join("");
  document.getElementById("cfgnote").textContent =
    `${list.length} configurations in ${SOURCE.name || "the file"}. Choosing another reopens the rocket from the file with it; changes you haven't saved are replaced.`;
}
/* ---------- Motor Delay (Motor tab): the one ejection delay setting ----------
   It lives on the primary motor mount of the stage being chosen (the same mount bldSyncMotors puts the Motor tab's motor
   in), so it's saved with the design and read from OpenRocket and RockSim files; null is a plugged motor. */
/**
 * The stage Motor Delay is set for: the Motor tab's target.
 * @returns {string} "sustainer", "booster" or "first"
 */
export function mdTarget() {
  return tgtFirst() ? "first" : D.twoStage && motorTarget === "booster" ? "booster" : "sustainer";
}
/**
 * The builder mount that holds a stage's delay: its primary motor mount (null if there is no builder design).
 * @param {string} tg target
 * @returns {object|null}
 */
function mdHost(tg) {
  if (!BLD || !BLD.stages || !BLD.stages.length) return null;
  const mounted = BLD.stages.filter((st) => bldMounts(st).length);
  if (BLD.stages.length > 1 && mounted.length === 1) return tg === "sustainer" ? bldMounts(mounted[0])[0] : null;
  const st =
    tg === "sustainer"
      ? BLD.stages[0]
      : tg === "first"
        ? BLD.stages[2]
        : BLD.stages.length === 3 && mounted.length === 3
          ? BLD.stages[1]
          : BLD.stages[BLD.stages.length - 1];
  return st ? bldMounts(st)[0] || null : null;
}
/**
 * A target's selected motor.
 * @param {string} tg
 * @returns {object}
 */
export function mdMotor(tg) {
  return tg === "first" ? curFirst() : tg === "booster" ? curBoost() : curMotor();
}
/**
 * A target's ejection delay: seconds after burnout (0 = at burnout), or null for plugged.
 * @param {string} tg
 * @returns {number|null}
 *
 * null is plugged; 0 is a charge at burnout
 */
function mdGet(tg) {
  const h = mdHost(tg),
    v = h ? h.delay : tg === "first" ? D.s1 && D.s1.bEjDelay : tg === "booster" ? D.bEjDelay : D.ejDelay;
  return v == null || !(+v >= 0) ? null : +v;
}
/**
 * Sets a target's ejection delay (rounded to 0.1 s; null = plugged) and refreshes.
 * @param {string} tg
 * @param {number|null} v
 */
export function mdSet(tg, v) {
  v = v == null || !isFinite(v) ? null : Math.max(0, Math.round(v * 10) / 10);
  const h = mdHost(tg);
  if (h) {
    if (mdGet(tg) === v && (h.delay == null) === (v == null)) return;
    h.delay = v;
    bldChanged(true);
  } else {
    if (tg === "first") {
      if (D.s1) D.s1.bEjDelay = v;
    } else if (tg === "booster") D.bEjDelay = v;
    else D.ejDelay = v;
    changed();
  }
  mdRender();
}
/**
 * The delays a motor is sold with, and whether it comes plugged (see the note above).
 * @param {object} m motor
 * @returns {{list:number[], plugged:boolean}}
 *
 * the delays a motor is sold with, in seconds, and whether it comes plugged. 0 s is a real charge at burnout (booster
 * motors use it to separate stages or light the next motor), kept apart from plugged (no charge), as OpenRocket does;
 * catalog placeholders of 60 s or more are left out
 */
export function mdStock(m) {
  const p = String((m && m.delays) || "")
    .split(/[-,\s]+/)
    .filter(Boolean);
  return {
    list: [...new Set(p.map(Number).filter((x) => isFinite(x) && x >= 0 && x < 60))].sort((a, b) => a - b),
    plugged: p.some((x) => /^p$/i.test(x)),
  };
}
/**
 * After a motor change: moves a stock delay to the nearest one the new motor offers (see the note above).
 * @param {string} tg
 * @param {object} oldM
 * @param {object} newM
 *
 * a new motor: a stock delay of the old motor moves to the nearest one the new motor offers; plugged and custom times stay
 */
export function mdSnap(tg, oldM, newM) {
  if (!oldM || !newM || oldM.id === newM.id) return;
  const v = mdGet(tg);
  if (v == null) return;
  const a = mdStock(oldM).list,
    b = mdStock(newM).list;
  if (!b.length || b.includes(v) || (a.length && !a.includes(v))) return;
  const near = b.reduce((x, y) => (Math.abs(y - v) < Math.abs(x - v) ? y : x), b[0]);
  mdSet(tg, near);
  prToast(`Motor delay set to ${near} s: the ${newM.cn || newM.name} doesn’t come with a ${v} s delay.`);
}
/**
 * Draws Motor Delay: the stock delays, plugged and custom, with the best delay from the last run.
 */
export function mdRender() {
  const sel = document.getElementById("mdsel");
  if (!sel) return;
  const tg = mdTarget(),
    m = mdMotor(tg),
    v = mdGet(tg),
    sk = mdStock(m),
    two = !!D.twoStage;
  const custom = v != null && !sk.list.includes(v);
  sel.innerHTML =
    sk.list.map((x) => `<option value="${x}">${x} s${x === 0 ? " (fires at burnout)" : ""}</option>`).join("") +
    `<option value="P">Plugged (no ejection charge)</option><option value="C">Custom time…</option>`;
  sel.value = v == null ? "P" : custom ? "C" : String(v);
  document.getElementById("mdlab").textContent = two ? `${TGT_NAME[tg]} motor ejection delay` : "Ejection delay";
  const cf = document.getElementById("mdcustf"),
    ci = document.getElementById("mdcust");
  cf.hidden = !(custom || sel.dataset.custom === "1");
  if (!cf.hidden && document.activeElement !== ci) ci.value = v == null ? "" : v;
  const nm = m.cn || m.name,
    stock = sk.list.length
      ? `The ${nm} is sold with ${sk.list.join(", ")} s delays${sk.plugged ? " or plugged" : ""}${/RMS|DMS|ProX|Loki/.test(m.sys || "") ? "; reload delays can be drilled shorter" : ""}.`
      : sk.plugged
        ? `The ${nm} comes plugged (no ejection charge).`
        : "";
  /**
   * The delay that would fire the charge at apogee in the last run.
   */
  const ideal = (() => {
    try {
      const st = lastSim && lastSim.st;
      if (!st || tg !== "sustainer" || lastSim.m.id !== m.id) return null;
      const t = st.tApoFree ?? st.tApo;
      return t != null && st.tb != null ? t - st.tb : null;
    } catch (e) {
      return null;
    }
  })();
  document.getElementById("mdnote").textContent =
    `${v == null ? "Plugged: no ejection charge fires." : `The charge fires ${v} s after ${two && tg === "sustainer" ? "sustainer " : ""}burnout.`} ${stock}${ideal != null ? ` Ideal for the last simulated flight: ${ideal.toFixed(1)} s.` : ""}`;
  mdRenderExtra(tg);
}
/* separately mounted motors in the same stage (outboard or pod motors, each in its own mount): each has its own delay,
   fired after its own burnout. The main mount's cluster shares the main delay. */
/**
 * The other motor mounts of the stage that have their own motor (see the note above).
 * @param {string} tg
 * @returns {object[]}
 */
function mdExtraMounts(tg) {
  const h = mdHost(tg);
  if (!h || !BLD) return [];
  const st = BLD.stages.find((st) => bldMounts(st).includes(h));
  return st ? bldMounts(st).filter((k) => k !== h && k.motor) : [];
}
/**
 * Draws a delay picker for each of the stage's other mounts.
 * @param {string} tg
 */
function mdRenderExtra(tg) {
  const box = document.getElementById("mdx");
  if (!box) return;
  const list = mdExtraMounts(tg);
  if (!list.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML =
    `<div class="bldh" style="margin-top:12px">Other motor mounts in this stage</div>` +
    list
      .map((k, i) => {
        const m = findMotor(k.motor.id) || allMotors().find((x) => x.name === k.motor.name),
          sk = mdStock(m),
          v = k.delay == null || !(+k.delay >= 0) ? null : +k.delay,
          cust = v != null && !sk.list.includes(v);
        return `<div class="grid" data-mi="${i}"><div class="fld"><label>${esc(k.name || "Motor mount")}: ${esc(m ? m.cn || m.name : k.motor.name)}${k.cluster && k.cluster !== "single" ? ` (${esc(k.cluster)})` : ""}</label><div class="in"><select class="mdxsel">${sk.list.map((x) => `<option value="${x}"${!cust && v === x ? " selected" : ""}>${x} s${x === 0 ? " (fires at burnout)" : ""}</option>`).join("")}<option value="P"${v == null ? " selected" : ""}>Plugged (no ejection charge)</option><option value="C"${cust ? " selected" : ""}>Custom time…</option></select></div></div>
      <div class="fld"${cust ? "" : " hidden"}><label>Custom delay</label><div class="in"><input class="mdxcust" type="number" inputmode="decimal" step="0.1" min="0" value="${cust ? v : ""}"><span class="u">s</span></div></div></div>`;
      })
      .join("") +
    `<p class="note">Each fires its own delay after its own burnout. A chute set to open at the motor ejection charge opens on the first charge in the stage.</p>`;
  box.querySelectorAll("[data-mi]").forEach((row) => {
    const k = list[+row.dataset.mi],
      sel = row.querySelector(".mdxsel"),
      ci = row.querySelector(".mdxcust");
    /**
     * Sets one extra mount's delay.
     */
    const put = (v) => {
      v = v == null || !isFinite(v) ? null : Math.max(0, Math.round(v * 10) / 10);
      if ((k.delay ?? null) === v) return;
      k.delay = v;
      bldChanged(true);
      mdRender();
    };
    sel.onchange = () => {
      if (sel.value === "C") {
        ci.closest(".fld").hidden = false;
        ci.focus();
        return;
      }
      put(sel.value === "P" ? null : parseFloat(sel.value));
    };
    ci.onchange = () => {
      const x = parseFloat(ci.value);
      if (isFinite(x) && x >= 0) put(x);
    };
  });
}
/**
 * Where each stage sits along the stack, for the side view.
 * @returns {Array[]} [target, from, to] in m from the nose tip
 *
 * the Motor tab's side view of the stages, with the one being chosen shaded
 */
function mtargetRanges() {
  const L0 = D.length,
    L1 = L0 + (D.bLength || 0);
  const r = [
    ["sustainer", 0, L0],
    ["booster", L0, L1],
  ];
  if (isThree(D)) r.push(["first", L1, L1 + D.s1.bLength]);
  return r;
}
/**
 * Draws the Motor tab's side view of the stages, with the one being chosen for shaded.
 */
export function drawMtarget() {
  const cv = document.getElementById("mtargetcv");
  if (!cv || !D.twoStage || !cv.getBoundingClientRect().width) return;
  const { c, W, H } = setupCanvas(cv);
  c.clearRect(0, 0, W, H);
  let A;
  try {
    A = aero(fullStack(D));
  } catch (e) {
    return;
  }
  const span = A.R + Math.max(0, ...A.fins.map((f) => f.s)),
    Lr = A.L || A.segs.reduce((a, g) => Math.max(a, g.x + g.len), 0);
  const sc = Math.min((W - 8) / Lr, (H - 18) / (2 * span)),
    ox = (W - Lr * sc) / 2,
    oy = (H - 14) / 2 + 1,
    X = (v) => ox + v * sc,
    Y = (v) => oy - v * sc;
  const cs = getComputedStyle(document.documentElement),
    col = (k) => cs.getPropertyValue(k).trim(),
    acc = col("--accent"),
    ink = col("--ink"),
    mut = col("--muted");
  for (const [k, a, b] of mtargetRanges()) {
    const on = k === motorTarget;
    if (on) {
      c.fillStyle = acc + "22";
      c.fillRect(X(a), 0, (b - a) * sc, H - 13);
    }
    c.font = `${on ? 700 : 500} 10px sans-serif`;
    c.textAlign = "center";
    c.fillStyle = on ? acc : mut;
    c.fillText(TGT_NAME[k], X((a + b) / 2), H - 2);
  }
  c.fillStyle = col("--field");
  c.strokeStyle = ink;
  c.lineWidth = 1;
  for (const f of A.fins) {
    const rf = radiusAt(A, f.xLead + f.a / 2),
      ol = finOutline(f);
    for (const sgn of [1, -1]) {
      c.beginPath();
      ol.forEach(([px, py], i) => {
        const xx = X(f.xLead + px),
          yy = Y(sgn * (rf + py));
        i ? c.lineTo(xx, yy) : c.moveTo(xx, yy);
      });
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
  const pts = [];
  for (const g of A.segs) {
    const n = g.kind === "tube" ? 1 : 20;
    for (let i = 0; i <= n; i++) {
      const xx = (i / n) * g.len;
      pts.push([g.x + xx, segR(g, xx)]);
    }
  }
  c.beginPath();
  pts.forEach(([a, b], i) => (i ? c.lineTo(X(a), Y(b)) : c.moveTo(X(a), Y(b))));
  for (let i = pts.length - 1; i >= 0; i--) c.lineTo(X(pts[i][0]), Y(-pts[i][1]));
  c.closePath();
  c.fill();
  c.stroke();
  for (const [k, a] of mtargetRanges().slice(1)) {
    c.setLineDash([2, 2]);
    c.strokeStyle = mut;
    c.beginPath();
    c.moveTo(X(a), Y(span));
    c.lineTo(X(a), Y(-span));
    c.stroke();
    c.setLineDash([]);
  }
  cv.onclick = (ev) => {
    const r = cv.getBoundingClientRect(),
      x = (ev.clientX - r.left - ox) / sc,
      hit = mtargetRanges().find(([, a, b]) => x >= a && x < b);
    if (hit && hit[0] !== motorTarget) {
      setMotorTarget(hit[0]);
      setPickSlot(-1);
      mountFilter();
      renderMotors();
    }
  };
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.getElementById("cfgsel").addEventListener("change", async (e) => {
    const id = e.target.value;
    if (!SOURCE || !SOURCE.text) return;
    const ok = await loadDesignXml(SOURCE.text, SOURCE.name, null, { cfg: id });
    if (ok !== false) {
      prToast("Motor configuration changed.");
      cfgRender();
    }
  });
  {
    const sel = document.getElementById("mdsel"),
      ci = document.getElementById("mdcust"),
      cf = document.getElementById("mdcustf");
    sel.addEventListener("change", () => {
      const tg = mdTarget();
      if (sel.value === "C") {
        sel.dataset.custom = "1";
        cf.hidden = false;
        const v = mdGet(tg);
        ci.value = v == null ? "" : v;
        ci.focus();
        return;
      }
      sel.dataset.custom = "";
      mdSet(tg, sel.value === "P" ? null : parseFloat(sel.value));
    });
    ci.addEventListener("change", () => {
      const x = parseFloat(ci.value);
      if (!isFinite(x) || x < 0) return;
      sel.dataset.custom = "1";
      mdSet(mdTarget(), x);
    });
  }
}
