/**
 * The Motor tab: the motor list with its filters, the selected motors, and the motor tube size checks.
 */
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import {
  allMotors,
  boostId,
  curBoost,
  curFirst,
  curMotor,
  D,
  firstId,
  motorId,
  motorTarget,
  mstats,
  setBoostId,
  setFirstId,
  setMotorId,
  setMotorTarget,
  setUSER_MOTORS,
  USER_MOTORS,
} from "../design/defaults.js";
import { BRAND_SYS, BUILTIN_BRANDS, DEFAULT_MOTOR, SYS_ORDER } from "../motors/catalog-lookup.js";
import { SYS_LABEL } from "../motors/catalog.js";
import { findMotor, flightBoost, flightFirst, flightMotor } from "../motors/clusters.js";
import { motorStats } from "../motors/motor-files.js";
import { isThree } from "../physics/staging.js";
import { css, drawProfile, setupCanvas } from "./charts.js";
import { CMP, cmpRender, renderCluster } from "./compare-motors.js";
import { cfgRender, drawMtarget, mdMotor, mdRender, mdSnap, mdTarget } from "./motor-delay.js";
import { markStale } from "./state.js";
import { fmt, uname } from "./units.js";
/**
 * Draws a motor's thrust curve, small.
 * @param {HTMLCanvasElement} cv
 * @param {object} m motor
 */
function drawSpark(cv, m) {
  const { c, W, H } = setupCanvas(cv);
  c.clearRect(0, 0, W, H);
  const tb = m.t[m.t.length - 1],
    fm = Math.max(...m.F);
  c.beginPath();
  m.t.forEach((t, i) => {
    const x = 2 + (t / tb) * (W - 4),
      y = H - 2 - (m.F[i] / fm) * (H - 4);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  });
  c.strokeStyle = css("--accent");
  c.lineWidth = 1.5;
  c.stroke();
}

/**
 * The motor list's filters: brand, diameter (mm), system, search text and sparky ("all", "only" or "none").
 */
export let F;
let shown = 40;
/**
 * A motor's one-line summary: diameter, impulse, average thrust, burn time, delays...
 * @param {object} m motor
 * @param {object} s its stats
 * @returns {string}
 */
function motorMeta(m, s) {
  const bits = [
    `${Math.round(m.dia * 1000)} mm`,
    `${s.I.toFixed(0)} N·s`,
    `avg ${fmt(s.avg, "force", 0)} ${uname("force")}`,
    `${s.tb.toFixed(2)} s`,
    `${fmt(m.totalMass, "mass")} ${uname("mass")}`,
  ];
  if (m.case) bits.push(m.case);
  if (m.prop) bits.push(m.prop);
  if (m.delays) bits.push("delays " + m.delays);
  return bits.map(esc).join(" · ");
}
/**
 * The motors that pass the filters.
 * @param {number|null} dia mm
 * @param {string} sys motor system or "all"
 * @param {string} q search text
 * @param {string} [brand]
 * @param {string} [sparky]
 * @returns {object[]}
 *
 * sparky: "all", "only" (sparky motors only) or "none" (no sparky motors), from ThrustCurve's sparky flag
 */
export function filterMotors(dia, sys, q, brand = F.brand, sparky = F.sparky) {
  const qq = q.trim().toLowerCase().replace(/\s+/g, " ");
  return allMotors().filter(
    (m) =>
      (brand === "all" || m.brand === brand) &&
      (dia == null || Math.round(m.dia * 1000) === dia) &&
      (sys === "all" || m.sys === sys) &&
      (sparky === "all" || (sparky === "only") === !!m.sparky) &&
      (!qq ||
        [m.name, m.cn, m.prop, m.case, m.mfr, m.sys === "SU" ? "single use" : "", SYS_LABEL[m.sys]]
          .join(" ")
          .toLowerCase()
          .includes(qq)),
  );
}
/**
 * Draws the filter chips with the number of motors each would show.
 */
function renderFilters() {
  const brands = BUILTIN_BRANDS.slice().concat(
    [...new Set(USER_MOTORS.map((m) => m.brand))].filter((b) => !BRAND_SYS[b]).sort(),
  );
  const upSys = (b) =>
    USER_MOTORS.some((m) => m.sys === "Imported" && (b === "all" || m.brand === b)) ? ["Imported"] : [];
  const sysOf = (b) =>
    b === "all"
      ? SYS_ORDER.filter((y) => Object.values(BRAND_SYS).some((l) => l.includes(y))).concat(upSys("all"))
      : BRAND_SYS[b]
        ? BRAND_SYS[b].concat(upSys(b))
        : [...new Set(USER_MOTORS.filter((m) => m.brand === b).map((m) => m.sys))];
  if (F.brand !== "all" && !brands.includes(F.brand)) F.brand = "all";
  const bc = (b) => filterMotors(F.dia, F.sys, F.q, b).length;
  document.getElementById("fbrand").innerHTML =
    `<button data-b="all" aria-pressed="${F.brand === "all"}">All<span class="ct">${bc("all")}</span></button>` +
    brands
      .map(
        (b) =>
          `<button data-b="${esc(b)}" aria-pressed="${F.brand === b}">${esc(b)}<span class="ct">${bc(b)}</span></button>`,
      )
      .join("");
  document.querySelectorAll("#fbrand button").forEach(
    (b) =>
      (b.onclick = () => {
        F.brand = b.dataset.b;
        if (F.sys !== "all" && !sysOf(F.brand).includes(F.sys)) F.sys = "all";
        shown = 40;
        saveFilter();
        renderMotors();
      }),
  );
  const dias = [
    ...new Set(
      allMotors()
        .filter((m) => F.brand === "all" || m.brand === F.brand)
        .map((m) => Math.round(m.dia * 1000)),
    ),
  ].sort((a, b) => a - b);
  const sysList = sysOf(F.brand);
  if (F.dia != null && !dias.includes(F.dia)) F.dia = null;
  if (F.sys !== "all" && !sysList.includes(F.sys)) F.sys = "all";
  const dc = (d) => filterMotors(d, F.sys, F.q).length,
    sc = (y) => filterMotors(F.dia, y, F.q).length;
  document.getElementById("fdia").innerHTML =
    `<button data-d="all" aria-pressed="${F.dia == null}">All<span class="ct">${dc(null)}</span></button>` +
    dias
      .map(
        (d) => `<button data-d="${d}" aria-pressed="${F.dia === d}">${d} mm<span class="ct">${dc(d)}</span></button>`,
      )
      .join("");
  document.getElementById("fsys").innerHTML =
    `<button data-y="all" aria-pressed="${F.sys === "all"}">All<span class="ct">${sc("all")}</span></button>` +
    sysList
      .map(
        (y) =>
          `<button data-y="${y}" aria-pressed="${F.sys === y}">${SYS_LABEL[y]}<span class="ct">${sc(y)}</span></button>`,
      )
      .join("");
  document.querySelectorAll("#fdia button").forEach(
    (b) =>
      (b.onclick = () => {
        F.dia = b.dataset.d === "all" ? null : +b.dataset.d;
        shown = 40;
        saveFilter();
        renderMotors();
      }),
  );
  document.querySelectorAll("#fsys button").forEach(
    (b) =>
      (b.onclick = () => {
        F.sys = b.dataset.y;
        shown = 40;
        saveFilter();
        renderMotors();
      }),
  );
  if (!["all", "only", "none"].includes(F.sparky)) F.sparky = "all";
  const kc = (k) => filterMotors(F.dia, F.sys, F.q, F.brand, k).length;
  document.getElementById("fspark").innerHTML = [
    ["all", "All"],
    ["only", "Sparky only"],
    ["none", "No sparky"],
  ]
    .map(
      ([k, l]) =>
        `<button data-k="${k}" aria-pressed="${F.sparky === k}">${l}<span class="ct">${kc(k)}</span></button>`,
    )
    .join("");
  document.querySelectorAll("#fspark button").forEach(
    (b) =>
      (b.onclick = () => {
        F.sparky = b.dataset.k;
        shown = 40;
        saveFilter();
        renderMotors();
      }),
  );
  const fs = document.getElementById("fsearch");
  if (fs.value !== F.q) fs.value = F.q;
}
/**
 * Keeps the filters on the device.
 */
export function saveFilter() {
  store.set("rfs-filter", F);
}
export let pickSlot = -1; // -1: choosing the main motor; otherwise the index of the extra motor being chosen
/* ---------- motor tube size ---------- */
const MOTOR_SIZES = [13, 18, 24, 29, 38, 54, 75, 98, 132, 152, 161]; // standard motor diameters, mm, up to the largest motors in the list
/**
 * The motor size a mount takes: the largest standard motor that slides into its inside diameter.
 * @param {number} d inside diameter, m
 * @returns {number|null} mm
 *
 * the motor size a mount takes: the largest standard motor that slides into its inside diameter
 */
function mountClass(d) {
  if (!(d > 0)) return null;
  const mm = d * 1000;
  let c = null;
  for (const s of MOTOR_SIZES) if (s <= mm + 0.6) c = s;
  return c;
}
/**
 * The mount size in use: chosen on the Rocket tab, or from the design file.
 * @param {object} Dx design
 * @param {boolean} booster
 * @returns {{cls:number, src:string}|null} mm, and "chosen" or "file"
 *
 * the mount size in use: the one chosen on the Rocket tab, or the one from the design file
 */
function mountSize(Dx, booster) {
  const sel = booster ? Dx.bMountSel : Dx.mountSel;
  if (sel != null && sel !== "file" && +sel > 0) return { cls: +sel, src: "chosen" };
  const c = mountClass(booster ? Dx.bMountDia : Dx.mountDia);
  return c ? { cls: c, src: "file" } : null;
}
/**
 * A stand-in motor that fits the mount (see the note above).
 * @param {object} Dx design
 * @param {boolean} booster
 * @param {object} [want] the file's motor
 * @returns {object|null}
 *
 * a stand-in when a file's motor isn't in the list and the motor already selected doesn't fit the mount:
 * a motor of the mount's size, in the file motor's impulse class if there is one (else a middling one)
 */
export function fitStandIn(Dx, booster, want) {
  const cur = findMotor(booster ? boostId : motorId),
    f = motorFit(cur, Dx, booster);
  if (!f || f.status === "ok") return null;
  const list = allMotors().filter((m) => Math.abs(Math.round(m.dia * 1000) - f.mount) <= 1);
  if (!list.length) return null;
  const cls = String((want && want.designation) || "")
      .trim()
      .toUpperCase()
      .match(/^(\d*)([A-O])/),
    I = (m) => motorStats(m).I;
  let target;
  if (cls) {
    const k = cls[2].charCodeAt(0) - 65;
    target = 0.75 * 2.5 * Math.pow(2, k);
  } // the middle of the class (A is 1.26–2.5 N·s; each letter doubles)
  else {
    const s = list.map(I).sort((a, b) => a - b);
    target = s[Math.floor(s.length / 2)];
  }
  return list.slice().sort((a, b) => Math.abs(Math.log(I(a) / target)) - Math.abs(Math.log(I(b) / target)))[0];
}
/**
 * How a motor fits the mount in use.
 * @param {object} m motor
 * @param {object} Dx design
 * @param {boolean} booster
 * @returns {{mount:number, motor:number, src:string, status:string}|null} status "ok", "big" or "small"
 */
export function motorFit(m, Dx, booster) {
  const ms = mountSize(Dx, booster);
  if (!ms || !m) return null;
  const md = Math.round(m.dia * 1000),
    cls = ms.cls;
  // within a millimetre counts as the same size (a 76 mm motor goes in a 75 mm mount)
  return { mount: cls, motor: md, src: ms.src, status: md > cls + 1 ? "big" : md < cls - 1 ? "small" : "ok" };
}
/**
 * A chosen mount bigger than the body it sits in.
 * @param {object} Dx design
 * @param {boolean} booster
 * @returns {{cls:number, body:number}|null} mm
 *
 * a chosen mount bigger than the body it sits in
 */
export function mountTooBig(Dx, booster) {
  const ms = mountSize(Dx, booster);
  if (!ms || ms.src !== "chosen") return null;
  const body = (booster ? Dx.bDiameter : Dx.diameter) * 1000;
  // the mount tube (about 4% plus 2 mm over the motor) has to fit inside the body tube (about 3 mm under its outside)
  return ms.cls * 1.04 + 2 > body - 3 ? { cls: ms.cls, body } : null;
}
/**
 * Writes the motor mount size note under Design notes (and warns when the mount is bigger than the body).
 */
export function renderMountNote() {
  const el = document.getElementById("mountsizenote");
  if (!el) return;
  const ms = mountSize(D, false),
    tb = mountTooBig(D, false);
  el.hidden = !ms;
  if (ms) {
    el.style.color = tb ? "var(--bad)" : "";
    el.textContent = tb
      ? `⚠ A ${tb.cls} mm motor mount doesn't fit inside this ${fmt(D.diameter, "small")} ${uname("small")} body tube. Choose a smaller mount in the design tree; LAUNCH is blocked until you do.`
      : ms.src === "chosen"
        ? `Motor mount set to ${ms.cls} mm${mountClass(D.mountDia) ? ` (the design file has ${mountClass(D.mountDia)} mm)` : ""}. ${ms.cls} mm motors fly without a fit warning, and the Motor tab lists them first.`
        : `Motor mount from the design file: ${ms.cls} mm. The Motor tab lists ${ms.cls} mm motors first; change the motor mount in the design tree to fly a different size.`;
  }
}
// show motors that fit the mount first on the Motor tab
// the first stage of a three-stage rocket, seen through the booster's field names (for its motor mount)
export const s1View = (Dx) => ({
  ...Dx,
  ...Dx.s1,
  bMountSel: Dx.s1 && Dx.s1.mountSel != null ? Dx.s1.mountSel : "file",
});
/**
 * Which stage the Motor tab is choosing for: tgtFirst (a three-stage rocket's first stage), tgtB (a booster
 * mount), tgtD (the design, or the first stage's view of it).
 */
export const tgtFirst = () => isThree(D) && motorTarget === "first",
  tgtB = () => tgtFirst() || (!!D.twoStage && motorTarget === "booster"),
  tgtD = () => (tgtFirst() ? s1View(D) : D);
/**
 * Names of the Motor tab's targets.
 */
export const TGT_NAME = { first: "First stage", booster: "Booster", sustainer: "Sustainer" };
/**
 * Sets the diameter filter to the mount size of the stage being chosen for.
 */
export function mountFilter() {
  const ms = mountSize(tgtD(), tgtB());
  if (!ms) return;
  F.dia = allMotors().some((m) => Math.round(m.dia * 1000) === ms.cls) ? ms.cls : null;
  F.brand = "all";
  saveFilter();
}
/**
 * Draws the Motor tab: the stage picker, the selected motors, the extra motors and the motor list.
 */
export function renderMotors() {
  const two = !!D.twoStage,
    three = isThree(D);
  if (!two) setMotorTarget("sustainer");
  if (!three && motorTarget === "first") setMotorTarget("booster");
  const xkey = tgtFirst() ? "s1ExtraMotors" : two && motorTarget === "booster" ? "bExtraMotors" : "extraMotors",
    xlist = D[xkey] || (D[xkey] = []);
  if (pickSlot >= xlist.length) pickSlot = -1;
  const tp = document.getElementById("mtargetp");
  tp.hidden = !two;
  if (two) {
    const sm = flightMotor(),
      bm = flightBoost();
    document.getElementById("mtarget").innerHTML = [
      ...(three ? [["first", "First stage", flightFirst()]] : []),
      ["booster", "Booster", bm],
      ["sustainer", "Sustainer", sm],
    ]
      .map(
        ([k, l, mm]) =>
          `<button data-t="${k}" aria-pressed="${motorTarget === k}">${l}<span class="ct">${esc(mm.cn || mm.name)}</span></button>`,
      )
      .join("");
    document.querySelectorAll("#mtarget button").forEach(
      (b) =>
        (b.onclick = () => {
          setMotorTarget(b.dataset.t);
          pickSlot = -1;
          mountFilter();
          renderMotors();
        }),
    );
  }
  const tgtLab = TGT_NAME[motorTarget] || "Sustainer";
  document.getElementById("selmotorlabel").textContent =
    (two ? tgtLab + " " : "") + (xlist.length ? (two ? "main motor" : "Main motor") : two ? "motor" : "Selected motor");
  const mainM = tgtFirst() ? curFirst() : two && motorTarget === "booster" ? curBoost() : curMotor();
  const selId = pickSlot >= 0 && xlist[pickSlot] ? xlist[pickSlot].id : mainM.id;
  {
    const fit = motorFit(mainM, tgtD(), tgtB()),
      mn = document.getElementById("mountnote");
    if (mn) {
      mn.hidden = !fit;
      if (fit) {
        const src = fit.src === "chosen" ? "you chose on the Rocket tab" : "from your design file";
        mn.textContent =
          fit.status === "ok"
            ? `Fits the ${fit.mount} mm ${two ? tgtLab.toLowerCase() + " " : ""}motor mount ${src}.`
            : fit.status === "big"
              ? `⚠ Too big: this ${fit.motor} mm motor won't fit the ${fit.mount} mm motor mount ${src}.`
              : `⚠ This ${fit.motor} mm motor is smaller than the ${fit.mount} mm motor mount ${src}; it needs a motor adapter.`;
        mn.style.color = fit.status === "ok" ? "" : fit.status === "big" ? "var(--bad)" : "var(--warn)";
      }
    }
  }
  const cur = mainM,
    cs = mstats(cur);
  const sel = document.getElementById("selmotor");
  sel.innerHTML = `<div style="min-width:0"><div class="nm">${esc(cur.cn || cur.name)}</div><div class="sub" style="margin-top:2px">${cur.cn && cur.cn !== cur.name ? esc(cur.name) + " · " : ""}${esc(cur.mfr)} · ${esc(SYS_LABEL[cur.sys] || "")} · ${cs.cls} class</div><div class="meta" style="font:400 .78rem var(--f-mono);color:var(--muted);margin-top:4px;overflow-wrap:anywhere">${motorMeta(cur, cs)}</div></div><canvas></canvas>`;
  drawSpark(sel.querySelector("canvas"), cur);
  renderCluster(two, xlist, mainM);
  renderFilters();
  const items = filterMotors(F.dia, F.sys, F.q).sort((a, b) => mstats(a).I - mstats(b).I);
  document.getElementById("fcount").textContent = items.length
    ? `${items.length} motor${items.length === 1 ? "" : "s"}, sorted by total impulse`
    : "No motors match. Clear the search or pick another diameter or system.";
  const list = document.getElementById("motorlist");
  list.innerHTML = "";
  items.slice(0, shown).forEach((m) => {
    const s = mstats(m);
    const el = document.createElement("div");
    el.className = "mot";
    el.setAttribute("role", "radio");
    el.tabIndex = 0;
    el.setAttribute("aria-checked", m.id === selId);
    el.innerHTML = `<span class="dot"></span><div style="min-width:0"><div class="nm">${esc(m.cn || m.name)}${m.cn && m.cn !== m.name ? `<span class="sub" style="font:500 .78rem var(--f-mono);margin-left:6px">${esc(m.name)}</span>` : ""}${F.brand === "all" ? `<span class="tag">${esc(m.brand === "Cesaroni" ? "CTI" : m.brand === "AeroTech" ? "AT" : m.brand)}</span>` : ""}${m.builtin ? "" : '<span class="tag">Uploaded</span>'}${m.sparky ? '<span class="tag">Sparky</span>' : ""}${m.builtin ? "" : `<button class="del" data-id="${esc(m.id)}">Remove</button>`}</div>
      <div class="meta">${motorMeta(m, s)}</div></div><canvas></canvas>`;
    const pick = () => {
      const tg0 = mdTarget(),
        old = pickSlot >= 0 ? null : mdMotor(tg0);
      if (pickSlot >= 0 && xlist[pickSlot]) {
        xlist[pickSlot].id = m.id;
        store.set("rfs-design", D);
      } else if (tgtFirst()) {
        setFirstId(m.id);
        store.set("rfs-b1motor", firstId);
      } else if (two && motorTarget === "booster") {
        setBoostId(m.id);
        store.set("rfs-bmotor", boostId);
      } else {
        setMotorId(m.id);
        store.set("rfs-motor", motorId);
      }
      if (old) mdSnap(tg0, old, m);
      renderMotors();
      markStale();
      drawProfile();
    };
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("del")) return;
      pick();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        pick();
      }
    });
    list.appendChild(el);
    drawSpark(el.querySelector("canvas"), m);
  });
  const more = document.getElementById("moremotors");
  more.hidden = items.length <= shown;
  more.textContent = `Show ${Math.min(40, items.length - shown)} more of ${items.length - shown}`;
  list.querySelectorAll(".del").forEach(
    (b) =>
      (b.onclick = () => {
        setUSER_MOTORS(USER_MOTORS.filter((m) => m.id !== b.dataset.id));
        store.set("rfs-motors", USER_MOTORS);
        if (motorId === b.dataset.id) setMotorId(DEFAULT_MOTOR);
        store.set("rfs-motor", motorId);
        renderMotors();
        markStale();
      }),
  );
  mdRender();
  cfgRender();
  drawMtarget();
  if (CMP.rows && CMP.tgt !== motorTarget && !CMP.running) {
    CMP.rows = null;
    document.getElementById("cmpmsg").textContent = "";
  }
  cmpRender();
}

/**
 * Sets pickSlot (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setPickSlot(v) {
  return (pickSlot = v);
}
/**
 * Sets shown (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setShown(v) {
  return (shown = v);
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  F = Object.assign({ brand: "all", dia: null, sys: "all", q: "", sparky: "all" }, store.get("rfs-filter", {}));
  document.getElementById("moremotors").onclick = () => {
    shown += 40;
    renderMotors();
  };
}
