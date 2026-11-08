/**
 * Compare motors: the rocket flown on every motor in the filtered list for the stage being chosen, as a sortable
 * table with each motor's apogee, speeds, stability and RSO result. Also the Motor tab's cluster panel.
 */
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import {
  boostId,
  curMotor,
  D,
  firstId,
  L,
  motorId,
  motorTarget,
  mstats,
  setBoostId,
  setFirstId,
  setMotorId,
  setMotorTarget,
  units,
} from "../design/defaults.js";
import { clusterOf, findMotor, flightBoost, flightFirst, flightMotor } from "../motors/clusters.js";
import { stability } from "../physics/aerodynamics.js";
import { simulate } from "../physics/simulate.js";
import { isThree, stackStability } from "../physics/staging.js";
import { drawProfile } from "./charts.js";
import {
  F,
  filterMotors,
  motorFit,
  pickSlot,
  renderMotors,
  saveFilter,
  setPickSlot,
  setShown,
  TGT_NAME,
  tgtB,
  tgtD,
  tgtFirst,
} from "./motor-tab.js";
import { lastSim, setLastSim } from "./results.js";
import { rsoChecks } from "./rso-checklist.js";
import { changed, markStale } from "./state.js";
import { fmt, uname } from "./units.js";
/* ---------- compare motors: the rocket flown on every motor in the filtered list, for the stage being chosen ---------- */
/**
 * Comparison state: rows, the inputs they were run for (key), sort column and direction, running, stop
 * requested, the row opened, and the target stage.
 */
export const CMP = { rows: null, key: null, sort: "I", dir: 1, running: false, stop: false, open: null, tgt: null };
/**
 * A key of everything the comparison depends on (design, conditions, target, filters), to tell when it's stale.
 * @returns {string}
 */
function cmpKey() {
  const t = motorTarget;
  return JSON.stringify([
    D,
    L,
    t,
    t === "sustainer" ? null : motorId,
    t === "booster" ? null : boostId,
    t === "first" ? null : firstId,
    units,
  ]);
}
/**
 * Flies the rocket on one motor (for the stage being chosen, with the others as selected).
 * @param {object} m motor
 * @returns {object} the row: motor, class, impulse, apogee, speeds, best delay, flags, RSO problems (bad)...
 */
function cmpFly(m) {
  const t = tgtFirst() ? "first" : D.twoStage && motorTarget === "booster" ? "booster" : "sustainer";
  const ms = t === "sustainer" ? clusterOf(m, D.extraMotors, D.mainOff ? 0 : D.mainDelay) : flightMotor(),
    mb = !D.twoStage
      ? null
      : t === "booster"
        ? clusterOf(m, D.bExtraMotors, D.bMainOff ? 0 : D.bMainDelay)
        : flightBoost();
  const m1 = isThree(D)
    ? t === "first"
      ? clusterOf(m, D.s1ExtraMotors, D.s1MainOff ? 0 : D.s1MainDelay)
      : flightFirst()
    : null;
  // each motor flies with the chute opening at apogee: a delay meant for another motor would cut its apogee short
  const Dx = {
    ...D,
    ejDelay: null,
    deployMode: D.deployMode === "motor" ? "apogee" : D.deployMode,
    deployDelay: D.deployMode === "motor" ? 0 : D.deployDelay,
  };
  const { st } = simulate(Dx, L, ms, mb, { noRef: true, mb1: m1 });
  const S = D.twoStage && mb ? stackStability(Dx, ms, mb, m1 || undefined) : stability(Dx, ms);
  let checks = [];
  const keep = lastSim;
  try {
    setLastSim({ mb, when: -1 });
    checks = rsoChecks(st, S, ms, Dx, L);
  } catch (e) {
    checks = [];
  } finally {
    setLastSim(keep);
  }
  const bad = checks.filter((c) => c.s === "bad"),
    warn = checks.filter((c) => c.s === "warn"),
    s = mstats(m);
  const delay = st.tApo != null && !st.ignAfterApogee && st.tb != null ? Math.max(0, st.tApo - st.tb) : null;
  return {
    id: m.id,
    name: m.cn || m.name,
    full: m.name,
    mfr: m.mfr,
    cls: s.cls,
    I: s.I,
    apo: st.error ? null : st.maxAlt,
    off: st.offRail,
    vmax: st.error ? null : st.maxV,
    mach: st.maxMach,
    delay,
    ttw: isFinite(st.avgTtw) ? st.avgTtw : null,
    err: st.error || null,
    bad,
    warn,
    rso: st.error ? 3 : bad.length ? 2 : warn.length ? 1 : 0,
  };
}
/**
 * Runs the comparison for every motor in the filtered list that fits, a few at a time so the page stays responsive.
 */
async function cmpRun() {
  if (CMP.running) return;
  const items = filterMotors(F.dia, F.sys, F.q)
    .filter((m) => {
      const f = motorFit(m, tgtD(), tgtB());
      return !f || f.status !== "big";
    })
    .slice(0, 200);
  const msg = document.getElementById("cmpmsg");
  if (!items.length) {
    msg.textContent = "No motors in the list below. Change the filters, then try again.";
    return;
  }
  CMP.running = true;
  CMP.stop = false;
  CMP.rows = [];
  CMP.sort = "I";
  CMP.dir = 1;
  CMP.open = null;
  CMP.key = cmpKey();
  CMP.tgt = motorTarget;
  document.getElementById("cmpgo").disabled = true;
  document.getElementById("cmpstop").hidden = false;
  const t0 = performance.now();
  for (let i = 0; i < items.length; i++) {
    if (CMP.stop) break;
    try {
      CMP.rows.push(cmpFly(items[i]));
    } catch (e) {
      CMP.rows.push({
        id: items[i].id,
        name: items[i].cn || items[i].name,
        full: items[i].name,
        cls: mstats(items[i]).cls,
        I: mstats(items[i]).I,
        err: String(e.message || e),
        bad: [],
        warn: [],
        rso: 3,
      });
    }
    if (i % 3 === 2 || i === items.length - 1) {
      msg.textContent = `Flying ${i + 1} of ${items.length}…`;
      cmpRender();
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  CMP.running = false;
  document.getElementById("cmpgo").disabled = false;
  document.getElementById("cmpstop").hidden = true;
  const n = CMP.rows.length;
  msg.textContent = `${CMP.stop ? "Stopped after" : "Flew"} ${n} motor${n > 1 ? "s" : ""} in ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
  cmpRender();
}
/**
 * Draws the comparison table.
 */
export function cmpRender() {
  const w = document.getElementById("cmpwrap"),
    note = document.getElementById("cmpnote");
  if (!w) return;
  cmpSum();
  const two = !!D.twoStage,
    lab = two ? (TGT_NAME[motorTarget] || "Sustainer").toLowerCase() + " " : "";
  const n = filterMotors(F.dia, F.sys, F.q).length;
  document.getElementById("cmpgo").textContent =
    `Compare ${n} motor${n === 1 ? "" : "s"}${two ? " for the " + lab.trim() : ""}`;
  document.getElementById("cmpgo").disabled = CMP.running || !n;
  const valid = CMP.rows && CMP.rows.length && (CMP.running || CMP.key === cmpKey());
  if (CMP.rows && CMP.rows.length && !valid && !CMP.running) {
    note.textContent =
      "The rocket, conditions or other motors changed since this comparison. Compare again to update it.";
  } else
    note.textContent = `Fly the rocket on every motor in the list below${two ? ` as the ${lab}motor` : ""} and see them side by side.`;
  if (!CMP.rows || !CMP.rows.length) {
    w.hidden = true;
    return;
  }
  w.hidden = false;
  w.style.opacity = valid ? "" : "0.5";
  const cur = tgtFirst() ? firstId : two && motorTarget === "booster" ? boostId : motorId;
  const K = {
    ttw: (r) => r.ttw ?? -1,
    name: (r) => r.name,
    mach: (r) => r.mach ?? -1,
    apo: (r) => r.apo ?? -1,
    off: (r) => r.off ?? -1,
    vmax: (r) => r.vmax ?? -1,
    delay: (r) => r.delay ?? 1e9,
    rso: (r) => r.rso * 100 + r.bad.length * 10 + r.warn.length,
    I: (r) => r.I ?? 0,
  };
  const rows = CMP.rows.slice().sort((a, b) => {
    const x = K[CMP.sort](a),
      y = K[CMP.sort](b);
    return (
      (typeof x === "string" ? x.localeCompare(y) : x - y) * CMP.dir ||
      (a.I ?? 0) - (b.I ?? 0) ||
      String(a.name).localeCompare(String(b.name))
    );
  });
  const H = [
    ["I", "Motor"],
    ["apo", `Apogee`],
    ["off", `Off rail`],
    ["ttw", "Thrust/weight"],
  ];
  let h = `<table class="cmpt"><thead><tr>${H.map(([k, l]) => `<th data-k="${k}"${CMP.sort === k ? ` aria-sort="${CMP.dir < 0 ? "descending" : "ascending"}"` : ""}>${l}</th>`).join("")}</tr></thead><tbody>`;
  for (const r of rows) {
    h += `<tr class="mrow${r.id === cur ? " cur" : ""}" data-id="${esc(r.id)}" aria-expanded="${CMP.open === r.id}"><td>${esc(r.name)}<span class="cl">${r.cls} · ${r.I.toFixed(0)} N·s</span></td>
      <td>${r.apo != null ? fmt(r.apo, "alt") : "—"}<span class="cl">${uname("alt")}</span></td><td>${r.off != null ? fmt(r.off, "speed") : "—"}<span class="cl">${uname("speed")}</span></td><td class="${r.ttw == null ? "" : r.ttw < 3 ? "ng" : r.ttw < 5 ? "wn" : ""}">${r.ttw != null ? r.ttw.toFixed(1) : "—"}<span class="cl">: 1 average</span></td></tr>`;
    if (CMP.open === r.id) {
      const items = [
        ...r.bad.map((c) => `<li class="ng">${esc(c.label)}: ${esc(c.val)}. ${esc(c.why || "")}</li>`),
        ...r.warn.map((c) => `<li class="wn">${esc(c.label)}: ${esc(c.val)}. ${esc(c.why || "")}</li>`),
      ];
      h += `<tr class="det"><td colspan="4"><b>${esc(r.mfr || "")} ${esc(r.full)}</b>${r.err ? ` · ${esc(r.err)}` : ` · max speed ${fmt(r.vmax, "speed")} ${uname("speed")} (Mach ${(r.mach || 0).toFixed(2)}); best ejection delay ${r.delay != null ? r.delay.toFixed(1) + " s" : "—"}`}${items.length ? `<ul>${items.join("")}</ul>` : `<p style="margin:4px 0 8px">Nothing on the RSO checklist fails or needs a caution.</p>`}
        ${r.id === cur ? `<p style="margin:0 0 6px"><b>This is the motor selected now.</b></p>` : `<button class="btn" type="button" data-use="${esc(r.id)}" style="margin:0 0 6px">Fly this motor</button>`}</td></tr>`;
    }
  }
  w.innerHTML = h + `</tbody></table>`;
  w.querySelectorAll("th").forEach(
    (th) =>
      (th.onclick = () => {
        const k = th.dataset.k;
        if (CMP.sort === k) CMP.dir = -CMP.dir;
        else {
          CMP.sort = k;
          CMP.dir = k === "name" || k === "I" || k === "delay" || k === "rso" ? 1 : -1;
        }
        cmpRender();
      }),
  );
  w.querySelectorAll("tr.mrow").forEach(
    (tr) =>
      (tr.onclick = () => {
        CMP.open = CMP.open === tr.dataset.id ? null : tr.dataset.id;
        cmpRender();
      }),
  );
  w.querySelectorAll("[data-use]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const id = b.dataset.use;
        if (CMP.tgt === "first" && isThree(D)) {
          setFirstId(id);
          store.set("rfs-b1motor", firstId);
        } else if (CMP.tgt === "booster" && D.twoStage) {
          setBoostId(id);
          store.set("rfs-bmotor", boostId);
        } else {
          setMotorId(id);
          store.set("rfs-motor", motorId);
        }
        setPickSlot(-1);
        setMotorTarget(CMP.tgt || motorTarget);
        CMP.key = cmpKey();
        renderMotors();
        markStale();
        drawProfile();
      }),
  );
}
/**
 * Opens or folds the comparison section (remembered).
 * @param {boolean} open
 *
 * the section folds up; whether it's open is remembered
 */
function cmpFold(open) {
  const t = document.getElementById("cmptog");
  t.setAttribute("aria-expanded", String(open));
  document.getElementById("cmpbody").hidden = !open;
  t.textContent = open ? "Hide" : "Show";
  store.set("rfs-cmpopen", open);
  cmpSum();
}
/**
 * Writes the folded comparison's one-line summary.
 */
function cmpSum() {
  const el = document.getElementById("cmpsum");
  if (!el) return;
  const open = document.getElementById("cmptog").getAttribute("aria-expanded") === "true";
  el.textContent = !open && CMP.running ? "running…" : "";
}
/**
 * Draws the Motor tab's cluster panel: the main motor and each extra motor with its count and delay.
 * @param {boolean} two the stage being chosen for is part of a staged rocket
 * @param {object[]} xlist the stage's extra motors
 * @param {object} mainM the main motor
 */
export function renderCluster(two, xlist, mainM) {
  const sel = document.getElementById("selmotor"),
    box = document.getElementById("cluster");
  sel.classList.toggle("on", xlist.length > 0 && pickSlot < 0);
  const old = sel.querySelector(".chg");
  if (old) old.remove();
  if (xlist.length) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chg";
    b.setAttribute("aria-pressed", pickSlot < 0);
    b.textContent = pickSlot < 0 ? "Choose below" : "Change";
    b.onclick = () => {
      setPickSlot(-1);
      renderMotors();
    };
    sel.firstElementChild.appendChild(b);
  }
  box.innerHTML = "";
  xlist.forEach((e, i) => {
    const m = findMotor(e.id),
      s = m ? mstats(m) : null;
    const row = document.createElement("div");
    row.className = "cm" + (pickSlot === i ? " on" : "");
    row.innerHTML = `<div style="min-width:0"><div class="nm"></div><div class="sub"></div></div><div class="acts"><label>Count <input type="number" min="1" step="1" inputmode="numeric"></label><label class="air">Lights <input class="ad" type="number" min="0" step="0.1" inputmode="decimal"> s later</label><button type="button" data-a="choose"></button><button type="button" data-a="remove">Remove</button></div>`;
    row.querySelector(".nm").textContent = m ? m.cn || m.name : "";
    row.querySelector(".sub").textContent = m
      ? `${m.cn && m.cn !== m.name ? m.name + " · " : ""}${m.mfr} · ${s.cls} class · ${s.I.toFixed(0)} N·s`
      : "Pick a motor from the list below.";
    const inp = row.querySelector("input");
    inp.value = Math.max(1, e.n | 0);
    inp.id = `clcount${i}`;
    inp.setAttribute("aria-label", `Number of motor ${i + 2}`);
    inp.addEventListener("change", () => {
      const v = Math.max(1, Math.round(+inp.value || 1));
      e.n = v;
      inp.value = v;
      changed();
      renderMotors();
    });
    // an airstart: this motor lights this long after the main motor (0: together)
    const ad = row.querySelector(".ad");
    ad.value = +(+e.d || 0).toFixed(2);
    ad.id = `clair${i}`;
    ad.setAttribute("aria-label", `Seconds after the main motor that motor ${i + 2} lights`);
    ad.addEventListener("change", () => {
      const v = Math.max(0, Math.min(60, +ad.value || 0));
      e.d = v;
      e.dUser = true;
      ad.value = +v.toFixed(2);
      changed();
      renderMotors();
    });
    const ch = row.querySelector('[data-a="choose"]');
    ch.setAttribute("aria-pressed", pickSlot === i);
    ch.textContent = pickSlot === i ? "Choose below" : "Change";
    ch.onclick = () => {
      setPickSlot(i);
      renderMotors();
    };
    row.querySelector('[data-a="remove"]').onclick = () => {
      xlist.splice(i, 1);
      setPickSlot(-1);
      changed();
      renderMotors();
    };
    box.appendChild(row);
  });
  if (xlist.length) {
    const c = clusterOf(mainM, xlist),
      s = mstats(c);
    const p = document.createElement("p");
    p.className = "clsum";
    const lt = (c.members || []).filter((x) => x.d > 0);
    const nLate = lt.reduce((a, x) => a + x.n, 0);
    p.textContent = `${c.count} motors${lt.length ? `; ${lt.map((x) => `${x.n}× ${x.m.cn || x.m.name} light${x.n > 1 ? "" : "s"} ${x.d} s after the main motor`).join(", ")}${c.count - nLate > 1 ? `, the other ${c.count - nLate} together` : ""}` : " light together"}: ${s.I.toFixed(0)} N·s total (${s.cls} class), ${s.Fmax.toFixed(0)} N peak thrust, ${fmt(c.totalMass, "mass")} ${uname("mass")} of motors. ${pickSlot >= 0 ? `Pick motor ${pickSlot + 2} from the list below.` : "Pick the main motor from the list below."}`;
    if (c.cluster) box.appendChild(p);
  }
  const add = document.getElementById("addmotor");
  add.textContent = `+ Add a motor${two ? " to the " + (TGT_NAME[motorTarget] || "Sustainer").toLowerCase() : ""}`;
  add.onclick = () => {
    xlist.push({ id: null, n: 1 });
    setPickSlot(xlist.length - 1);
    changed();
    renderMotors();
  };
}
let fsT = null;
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.getElementById("cmpgo").onclick = cmpRun;
  /* the message under the Rocket tab's buttons (what was opened, motors, import notes) starts folded to one line;
     errors stay open. Every way of writing it is caught here, including notes added to it afterwards. */
  {
    const box = document.getElementById("orkreport");
    /**
     * Folds or unfolds the message under the Rocket tab's buttons (see the note above).
     */
    const fold = () => {
      for (const r of box.querySelectorAll(".report:not(.err)")) {
        let body = r.querySelector(":scope>.rpbody");
        if (!body) {
          const b = r.querySelector(":scope>b"),
            title = b ? b.textContent.trim() : r.textContent.trim().split(/(?<=\.)\s/)[0] || "Details";
          const head = document.createElement("div");
          head.className = "rphead";
          head.innerHTML = `<span class="rpt"></span><button type="button" class="rsomore foldbtn" aria-expanded="false">Details</button>`;
          head.querySelector(".rpt").textContent = title;
          body = document.createElement("div");
          body.className = "rpbody";
          body.hidden = true;
          while (r.firstChild) body.appendChild(r.firstChild);
          r.appendChild(head);
          r.appendChild(body);
          const btn = head.querySelector("button");
          btn.onclick = () => {
            const o = btn.getAttribute("aria-expanded") !== "true";
            btn.setAttribute("aria-expanded", String(o));
            body.hidden = !o;
            btn.textContent = o ? "Hide" : "Details";
          };
        } else
          for (const n of [...r.childNodes])
            if (!(n.classList && (n.classList.contains("rphead") || n.classList.contains("rpbody"))))
              body.appendChild(n);
      }
    };
    new MutationObserver(fold).observe(box, { childList: true, subtree: true });
  }
  document.getElementById("cmptog").onclick = () =>
    cmpFold(document.getElementById("cmptog").getAttribute("aria-expanded") !== "true");
  cmpFold(!!store.get("rfs-cmpopen", false));
  document.getElementById("cmpstop").onclick = () => {
    CMP.stop = true;
  };
  document.getElementById("fsearch").addEventListener("input", (e) => {
    clearTimeout(fsT);
    fsT = setTimeout(() => {
      F.q = e.target.value;
      setShown(40);
      saveFilter();
      renderMotors();
    }, 150);
  });
  if (F.dia == null && !store.get("rfs-filter", null)) F.dia = Math.round(curMotor().dia * 1000);
}
