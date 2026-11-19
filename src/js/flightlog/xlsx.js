/**
 * Altimeter file import (Excel .xlsx workbooks become CSV text for the altimeter reader; files shared from other apps
 * go straight into the log), the column-check box, log backups (JSON and CSV), the all-rockets flight list, and the
 * measured curves drawn over the chart.
 */
import { esc } from "../core/helpers.js";
import { D } from "../design/defaults.js";
import { parseOrk } from "../files/openrocket-import.js";
import { DESIGN_EXT, otherFormat, parseOther } from "../files/other-formats.js";
import { openRecent, recentList } from "../files/recent.js";
import { matchMotor } from "../files/rocksim-import.js";
import { SOURCE } from "../files/save.js";
import { inflate, unzipOrk } from "../files/unzip.js";
import { ALT_ACC, ALT_PRESS, altCompute, altParse } from "./altimeter-files.js";
import { fcOpen } from "./flight-compare.js";
import {
  altMode,
  altP,
  flAll,
  flAltBox,
  flAltis,
  flCls,
  flDate,
  flDiff,
  flEdit,
  flField,
  flKey,
  flLandTxt,
  flList,
  flMotorInfo,
  flMotorName,
  flOpen,
  flPct,
  flPredBox,
  flRealLand,
  flSaveAll,
  flShow,
  renderFlightLog,
  setAltMode,
  setAltP,
  setFlNow,
} from "./flight-log.js";
import { findMotor } from "../motors/clusters.js";
import { simulate } from "../physics/simulate.js";
import { downloadsNS } from "../report/pdf-report.js";
import { css, niceTicks, setupCanvas } from "../ui/charts.js";
import { lastSim, runAll } from "../ui/results.js";
import { fmt, fromDisp, toDisp, uname } from "../ui/units.js";
/* ---------- Excel (.xlsx) altimeter files: each worksheet becomes CSV text for the altimeter reader ---------- */
/**
 * The entries of a zip archive (from its central directory).
 * @param {ArrayBuffer} buf
 * @returns {{name:string, off:number, csize:number, method:number}[]}
 */
export function zipEntries(buf) {
  const u8 = new Uint8Array(buf),
    dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < n && p + 46 <= u8.length; i++) {
    const method = dv.getUint16(p + 10, true),
      csize = dv.getUint32(p + 20, true),
      nlen = dv.getUint16(p + 28, true),
      xlen = dv.getUint16(p + 30, true),
      clen = dv.getUint16(p + 32, true),
      off = dv.getUint32(p + 42, true);
    out.push({ name: new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen)), method, csize, off });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
/**
 * The unpacked bytes of one zip entry.
 * @param {ArrayBuffer} buf
 * @param {object} e entry
 * @returns {Promise<Uint8Array>}
 */
export async function zipData(buf, e) {
  const u8 = new Uint8Array(buf),
    dv = new DataView(buf),
    lnl = dv.getUint16(e.off + 26, true),
    lxl = dv.getUint16(e.off + 28, true);
  const d = u8.subarray(e.off + 30 + lnl + lxl, e.off + 30 + lnl + lxl + e.csize);
  return e.method === 0 ? d : await inflate(d, "deflate-raw");
}
/**
 * Unescapes XML text.
 */
const xmlTxt = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
/**
 * Each worksheet of an .xlsx workbook as CSV text.
 * @param {ArrayBuffer} buf
 * @returns {Promise<{name:string, text:string}[]|null>} null if the file is not a workbook
 */
async function xlsxSheets(buf) {
  const ents = zipEntries(buf),
    get = async (n) => {
      const e = ents.find((x) => x.name.toLowerCase() === n.toLowerCase());
      return e ? new TextDecoder().decode(await zipData(buf, e)) : null;
    };
  if (!ents.some((e) => /^xl\//i.test(e.name))) return null;
  const ss = [];
  {
    const t = await get("xl/sharedStrings.xml");
    if (t)
      for (const m of t.matchAll(/<si>([\s\S]*?)<\/si>/g))
        ss.push(xmlTxt([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
  }
  const rel = {};
  {
    const t = await get("xl/_rels/workbook.xml.rels");
    if (t)
      for (const m of t.matchAll(/<Relationship\b[^>]*>/g)) {
        const id = m[0].match(/\bId="([^"]+)"/),
          tg = m[0].match(/\bTarget="([^"]+)"/);
        if (id && tg) rel[id[1]] = tg[1];
      }
  }
  const list = [];
  {
    const t = await get("xl/workbook.xml");
    if (t)
      for (const m of t.matchAll(/<sheet\b[^>]*>/g)) {
        const nm = m[0].match(/\bname="([^"]*)"/),
          id = m[0].match(/\br:id="([^"]+)"/);
        if (id && rel[id[1]])
          list.push({ name: xmlTxt(nm ? nm[1] : "Sheet"), file: rel[id[1]].replace(/^\/?(xl\/)?/, "xl/") });
      }
  }
  if (!list.length)
    ents
      .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name))
      .forEach((e, i) => list.push({ name: "Sheet " + (i + 1), file: e.name }));
  /**
   * A cell reference's column number (A = 0).
   */
  const colN = (r) => {
    const m = /^([A-Z]+)/.exec(r || "");
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  };
  /**
   * Quotes a CSV field when needed.
   */
  const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const out = [];
  for (const s of list) {
    const x = await get(s.file);
    if (!x) continue;
    const lines = [];
    for (const r of x.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      let k = 0;
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = c[1],
          ref = at.match(/\br="([A-Z]+)\d*"/),
          t = (at.match(/\bt="([^"]+)"/) || [])[1],
          body = c[2] || "";
        const ci = ref ? colN(ref[1]) : k;
        k = ci + 1;
        let v = "";
        if (t === "s") {
          const m = body.match(/<v>([\s\S]*?)<\/v>/);
          v = m ? (ss[+m[1]] ?? "") : "";
        } else if (t === "inlineStr") {
          v = xmlTxt([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
        } else {
          const m = body.match(/<v>([\s\S]*?)<\/v>/);
          v = m ? xmlTxt(m[1]) : "";
        }
        cells[ci] = String(v).trim();
      }
      lines.push(Array.from(cells, (v) => q(v ?? "")).join(","));
    }
    out.push({ name: s.name, text: lines.join("\n") });
  }
  return out;
}
/**
 * Reads an altimeter file (text, CSV or the best worksheet of a workbook) and opens the column check.
 * @param {File} file
 * @param {string} mode "new" (a new flight) or "form" (the flight in the form)
 */
export async function altOpenFile(file, mode) {
  setAltMode(mode);
  try {
    const buf = await file.arrayBuffer(),
      u8 = new Uint8Array(buf);
    let P;
    if (u8[0] === 0xd0 && u8[1] === 0xcf) {
      prToast("That's an old-style Excel file (.xls). Save it as .xlsx or CSV and import that.");
      return;
    }
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
      const sh = await xlsxSheets(buf);
      if (!sh) {
        prToast("That's a zip file without a spreadsheet inside. Export the flight as CSV or .xlsx.");
        return;
      }
      if (!sh.length) {
        prToast("No worksheets were found in that file.");
        return;
      }
      const Ps = sh.map((s) => altParse(s.name + "\n" + s.text, file.name));
      /**
       * How flight-like a parsed sheet looks, to choose among a workbook's sheets.
       */
      const score = (P) =>
        P.error ? -1 : P.data.length * (P.map.alt >= 0 ? 1 : 0) * (P.map.t >= 0 ? 1.5 : 1) * (P.hasHeader ? 1.2 : 1);
      let best = 0;
      Ps.forEach((p, i) => {
        if (score(p) > score(Ps[best])) best = i;
      });
      if (score(Ps[best]) < 0) {
        prToast("None of the worksheets in that file has columns of flight data.");
        return;
      }
      const sheets = sh.map((s, i) => ({ name: s.name, P: Ps[i] }));
      Ps.forEach((p, i) => {
        if (!p.error) {
          p.sheets = sheets;
          p.sheet = i;
        }
      });
      P = Ps[best];
    } else P = altParse(new TextDecoder().decode(u8), file.name);
    if (P.error) {
      prToast(P.error);
      return;
    }
    setAltP(P);
    altShow();
  } catch (e) {
    prToast("Couldn't read that file.");
  }
}
/**
 * Opens an altimeter log chosen with Open design file: in the Flight Log, once a design is open.
 * @param {File} file
 */
export function altIncoming(file) {
  prPendingAlt = file;
  prIncomingGo();
}
/* a file shared to the app from another app (Featherweight UI, email, Drive…): straight into the flight log */
/**
 * A file shared to the app, waiting until the app is ready (disclaimer agreed, a design open).
 */
export var prPendingAlt = null;
/**
 * Opens a file shared to the app from another app in the flight log.
 */
export function prIncomingGo() {
  if (!prPendingAlt) return;
  const lg = document.getElementById("legal");
  if (lg && !lg.hidden) {
    setTimeout(prIncomingGo, 1000);
    return;
  }
  if (document.documentElement.classList.contains("nodesign")) {
    prToast("Open or build the rocket this flight belongs to; the shared file will import after you launch it.");
    return;
  }
  if (!lastSim) {
    try {
      runAll();
    } catch (e) {}
  }
  if (!lastSim) return;
  const f = prPendingAlt;
  prPendingAlt = null;
  const tb = document.getElementById("t-results");
  if (tb) tb.click();
  const fm = document.getElementById("flmodal");
  altOpenFile(f, fm && !fm.hidden && flEdit ? "form" : "new");
}

/**
 * Draws the column check: the columns found and their units, for the user to confirm.
 */
function altShow() {
  const P = altP,
    m = P.map,
    opt = (sel, none) =>
      (none ? `<option value="-1"${sel < 0 ? " selected" : ""}>${none}</option>` : "") +
      P.cols.map((c, k) => `<option value="${k}"${k === sel ? " selected" : ""}>${esc(c)}</option>`).join("");
  const known = P.brand.id !== "other",
    sure = known && P.hasHeader && m.t >= 0 && m.alt >= 0,
    tt = m.t >= 0 ? P.data.map((r) => r[m.t]).filter(isFinite) : [],
    span =
      tt.length > 1 ? (tt[tt.length - 1] - tt[0]) * (m.tUnit === "ms" ? 0.001 : 1) : P.data.length / (m.rate || 10),
    used = [m.t, m.alt, m.vel, m.acc].filter((k) => k >= 0).map((k) => P.cols[k]);
  document.getElementById("alttitle").textContent =
    altMode === "new" ? "Altimeter log" : `${known ? P.brand.name : "Altimeter"} file`;
  document.getElementById("altmap").innerHTML = `
    <p class="note" style="margin:0 0 6px">${esc(P.fname)}</p>
    <div class="altchips"><span class="chip${known ? " ok" : ""}">${known ? "✓ " + esc(P.brand.name) : "Brand not recognized"}</span><span class="chip">${span.toFixed(0)} s · ${P.data.length} rows</span><span class="chip">${["altitude", m.vel >= 0 ? "velocity" : "", m.acc >= 0 ? "acceleration" : "", /lat/i.test(P.cols.join(" ")) ? "GPS" : ""].filter(Boolean).join(" · ")}</span></div>
    <p class="note" style="margin:0 0 8px">Columns: ${used.map(esc).join(", ")}. <button type="button" class="linkbtn" id="altcolbtn" aria-expanded="${!sure}">${sure ? "Change" : "Hide"}</button></p>
    <div class="flgrid" id="altcols"${sure ? " hidden" : ""}>
      ${P.sheets && P.sheets.length > 1 ? `<div class="fld"><label for="alt-sh">Worksheet</label><div class="in"><select id="alt-sh">${P.sheets.map((x, i) => `<option value="${i}"${i === P.sheet ? " selected" : ""}${x.P.error ? " disabled" : ""}>${esc(x.name)}</option>`).join("")}</select></div></div><div class="flsp"></div>` : ""}
      <div class="fld"><label for="alt-t">Time column</label><div class="in"><select id="alt-t">${opt(m.t, "None: fixed sample rate")}</select></div></div>
      <div class="fld" id="alt-tuw"><label for="alt-tu">${m.t >= 0 ? "Time unit" : "Samples per second"}</label><div class="in">${m.t >= 0 ? `<select id="alt-tu"><option value="s"${m.tUnit === "s" ? " selected" : ""}>seconds</option><option value="ms"${m.tUnit === "ms" ? " selected" : ""}>milliseconds</option></select>` : `<input id="alt-rate" type="number" inputmode="decimal" step="any" value="${m.rate}">`}</div></div>
      <div class="fld"><label for="alt-a">Altitude or pressure column</label><div class="in"><select id="alt-a">${opt(m.alt)}</select></div></div>
      <div class="fld"><label for="alt-au">It holds</label><div class="in"><select id="alt-au">${[["ft", "altitude in feet"], ["m", "altitude in metres"], ...ALT_PRESS.map((p) => ["p:" + p[0], "pressure in " + p[0]])].map(([v, l]) => `<option value="${v}"${(m.isP ? "p:" + m.pUnit : m.aUnit) === v ? " selected" : ""}>${l}</option>`).join("")}</select></div></div>
      <div class="fld"><label for="alt-v">Velocity column</label><div class="in"><select id="alt-v">${opt(m.vel, "None: work it out from altitude")}</select></div></div>
      <div class="fld"><label for="alt-vu">Velocity unit</label><div class="in"><select id="alt-vu"${m.vel < 0 ? " disabled" : ""}><option value="ft"${m.vUnit === "ft" ? " selected" : ""}>ft/s</option><option value="m"${m.vUnit === "m" ? " selected" : ""}>m/s</option></select></div></div>
      <div class="fld"><label for="alt-acc">Acceleration column (along the rocket)</label><div class="in"><select id="alt-acc">${opt(m.acc, "None")}</select></div></div>
      <div class="fld"><label for="alt-accu">Acceleration unit</label><div class="in"><select id="alt-accu"${m.acc < 0 ? " disabled" : ""}>${ALT_ACC.map(([u]) => `<option value="${u}"${m.accUnit === u ? " selected" : ""}>${u === "m/s2" ? "m/s²" : u === "ft/s2" ? "ft/s²" : u}</option>`).join("")}</select></div></div>
    </div>`;
  /**
   * Reads the column choices back from the box.
   */
  const rd = () => {
    const g = (id) => document.getElementById(id);
    m.t = +g("alt-t").value;
    m.alt = +g("alt-a").value;
    m.vel = +g("alt-v").value;
    const au = g("alt-au").value;
    m.isP = au.startsWith("p:");
    if (m.isP) m.pUnit = au.slice(2);
    else m.aUnit = au;
    if (g("alt-tu")) m.tUnit = g("alt-tu").value;
    if (g("alt-rate")) m.rate = parseFloat(g("alt-rate").value) || m.rate;
    m.vUnit = g("alt-vu").value;
    m.acc = +g("alt-acc").value;
    m.accUnit = g("alt-accu").value;
  };
  {
    const sh = document.getElementById("alt-sh");
    if (sh)
      sh.onchange = () => {
        const np = P.sheets[+sh.value].P;
        if (np && !np.error) {
          setAltP(np);
          altShow();
        }
      };
  }
  document.querySelectorAll("#altmap select:not(#alt-sh),#altmap input").forEach(
    (e) =>
      (e.onchange = e.oninput =
        () => {
          const was = m.t;
          rd();
          if (was < 0 !== m.t < 0) {
            altShow();
            return;
          }
          document.getElementById("alt-vu").disabled = m.vel < 0;
          document.getElementById("alt-accu").disabled = m.acc < 0;
          altPreview();
        }),
  );
  document.getElementById("altcolbtn").onclick = (e) => {
    const g = document.getElementById("altcols"),
      open = g.hidden;
    g.hidden = !open;
    e.target.textContent = open ? "Hide" : "Change";
    e.target.setAttribute("aria-expanded", open);
  };
  document.getElementById("altok").textContent = altMode === "new" ? "Compare" : "Use this data";
  document.getElementById("altmodal").hidden = false;
  altPreview();
  altWho();
}
/**
 * The rocket chosen in the altimeter log screen: "cur" (the design open now), "r:<id>" (a recent file) or "other".
 */
let altWhoSel = "cur";
/**
 * Whether a design's prediction fits the log: its top speed within 12% and its burnout within 0.6 s.
 * @param {object} r the log's figures (altCompute)
 * @param {number} v predicted top speed, m/s
 * @param {number} b predicted burnout, s
 * @param {string} mn the motor's name
 * @returns {string} html
 */
function altFit(r, v, b, mn) {
  const ok = r.vmax > 0 && Math.abs(v / r.vmax - 1) <= 0.12 && (r.ev.burn == null || Math.abs(b - r.ev.burn) <= 0.6);
  return ok
    ? `<span class="fit">Fits: ${r.ev.burn != null ? `burnout at ${r.ev.burn.toFixed(1)} s and ` : ""}${fmt(r.vmax, "speed")} ${uname("speed")} match the ${esc(mn)}.</span>`
    : `<span class="nofit">On its ${esc(mn)} it reaches ${fmt(v, "speed")} ${uname("speed")}; this log shows ${fmt(r.vmax, "speed")}.</span>`;
}
/**
 * The burnout (the time of the top speed) and top speed of a run.
 * @param {object} R simulate's result
 * @returns {{v:number, b:number}}
 */
function altRunFit(R) {
  const o = R.out;
  let iv = 0;
  for (let i = 0; i < o.t.length; i++) if (o.t[i] <= R.st.tApo && o.vel[i] > o.vel[iv]) iv = i;
  return { v: R.st.maxV, b: o.t[iv] };
}
/**
 * Which rocket flew it, and the flight's details (a new flight only): the design open now, recent design files, or
 * another one; each with whether its prediction fits the log.
 */
async function altWho() {
  const who = document.getElementById("altwho"),
    fl = document.getElementById("altflight");
  if (altMode !== "new" || !lastSim) {
    who.innerHTML = fl.innerHTML = "";
    return;
  }
  altWhoSel = "cur";
  const r = altR && !altR.error ? altR : null,
    cur = altRunFit(lastSim),
    mn = flMotorName(lastSim.m, lastSim.mb);
  const opt = (v, title, sub) =>
    `<label class="whoopt${v === altWhoSel ? " sel" : ""}"><input type="radio" name="altwho" value="${esc(v)}"${v === altWhoSel ? " checked" : ""}><span><b>${title}</b><span class="sub" data-sub="${esc(v)}">${sub}</span></span></label>`;
  let rec = [];
  try {
    rec = (await recentList()).filter((e) => !(SOURCE && SOURCE.recentId === e.id) && e.data).slice(0, 3);
  } catch (e) {}
  who.innerHTML =
    `<div class="subh" style="margin-top:12px">Which rocket flew it?</div>` +
    opt("cur", `${esc(D.name || "This design")} · open now`, r ? altFit(r, cur.v, cur.b, mn) : "") +
    rec.map((e) => opt("r:" + e.id, `${esc(e.rocket || e.name)} · recent`, "Checking…")).join("") +
    opt("other", "Another design…", "Open a design file or a recent file first; the log comes back once it's open.");
  who.querySelectorAll("input[name=altwho]").forEach(
    (i) =>
      (i.onchange = () => {
        altWhoSel = i.value;
        who.querySelectorAll(".whoopt").forEach((l) => l.classList.toggle("sel", l.contains(i)));
        fl.hidden = altWhoSel !== "cur";
      }),
  );
  // the flight's details, for the design open now
  const L0 = lastSim.L,
    dm = (altP.fname || "").match(/(20\d\d)[-_.]?([01]\d)[-_.]?([0-3]\d)/),
    today = new Date(),
    iso = new Date(today.getTime() - today.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  fl.hidden = false;
  fl.innerHTML = `<div class="subh" style="margin-top:12px">The flight</div>
    <div class="flgrid fl2">
      <div class="fld"><label>Motor</label><div class="in"><input type="text" value="${esc(mn)}" readonly title="Change it on the Motor tab"></div></div>
      <div class="fld"><label for="af-delay">Delay</label><div class="in"><input id="af-delay" type="text" value="${lastSim.D.ejDelay != null && (lastSim.D.deployMode || "apogee") === "motor" ? lastSim.D.ejDelay + " s" : ""}" placeholder="e.g. 10 s"></div></div>
      <div class="fld"><label for="af-date">Date${dm ? " · from the file name" : ""}</label><div class="in"><input id="af-date" type="date" value="${dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : iso}"></div></div>
      ${flField("af-mass", "Liftoff weight, with motor", "mass", null, 2, "Design: " + fmt(lastSim.D.dryMass + lastSim.m.totalMass, "mass"))}
      ${flField("af-elev", "Field elevation", "alt", L0.elev)}
      ${flField("af-wind", "Wind", "wind", L0.wind)}
    </div>
    <p class="note" style="margin:6px 0 0">Weather and field come from the Range tab; change them here for this flight. The motor is the one on the Motor tab.</p>`;
  // the recent designs: open each, fly it on its own motor, and say whether it fits
  for (const e of rec) {
    let txt = "";
    try {
      const xml = await unzipOrk(e.data),
        pr = otherFormat(xml) ? parseOther(xml, e.name) : parseOrk(xml),
        mo = pr.motor ? matchMotor(pr.motor) : null;
      if (mo && r) {
        const R = simulate(pr.design, lastSim.L, mo, null, { noRef: true });
        if (!R.st.error) {
          const q = altRunFit(R);
          txt = altFit(r, q.v, q.b, mo.cn || mo.name);
        }
      }
    } catch (err) {}
    const el = who.querySelector(`[data-sub="r:${e.id}"]`);
    if (el) el.innerHTML = txt || "Opened earlier on this device.";
  }
}
/**
 * A log waiting for its rocket to be opened: {a (the altimeter's figures), key (the design open when it was chosen)}.
 */
export let altWaiting = null;
/**
 * Opens Flight vs prediction for a log once its rocket is open and has been launched.
 */
export function altWaitingGo() {
  if (!altWaiting || flKey() === altWaiting.key || document.documentElement.classList.contains("nodesign")) return;
  if (!lastSim) {
    try {
      runAll();
    } catch (e) {}
  }
  if (!lastSim) return;
  const a = altWaiting.a;
  altWaiting = null;
  const tb = document.getElementById("t-results");
  if (tb) tb.click();
  fcOpen(altDraft(a, {}), true);
}
/**
 * A new flight for the open design, from an altimeter's figures and the details entered.
 * @param {object} a the altimeter's figures
 * @param {object} v details: delay, date, mass, elev, wind
 * @returns {object} the flight, not saved yet
 */
function altDraft(a, v) {
  const today = new Date(),
    iso = new Date(today.getTime() - today.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  return {
    date: v.date || iso,
    motor: flMotorName(lastSim.m, lastSim.mb),
    motorId: lastSim.m.id,
    boostId: lastSim.mb ? lastSim.mb.id : null,
    delay:
      v.delay ??
      (lastSim.D.ejDelay != null && (lastSim.D.deployMode || "apogee") === "motor" ? lastSim.D.ejDelay + " s" : ""),
    wind: v.wind ?? lastSim.L.wind,
    windDir: lastSim.L.windDir,
    tempC: lastSim.L.tempC,
    elev: v.elev ?? lastSim.L.elev,
    mass: v.mass ?? null,
    apo: a.apo,
    vmax: a.vmax,
    landDist: a.land ? a.land.dist : null,
    landBrg: a.land ? a.land.brg : null,
    altis: [a],
  };
}
/**
 * The figures worked out from the file with the columns as chosen.
 */
let altR = null;
/**
 * Works out and shows the file's figures and a small altitude chart for checking.
 */
function altPreview() {
  altR = altCompute(altP, altP.map);
  const out = document.getElementById("altout"),
    ok = document.getElementById("altok");
  const cv = document.getElementById("altcv");
  if (altR.error) {
    out.innerHTML = `<p class="bad" style="margin:0">${esc(altR.error)}</p>`;
    ok.disabled = true;
    cv.hidden = true;
    return;
  }
  ok.disabled = false;
  cv.hidden = false;
  const r = altR,
    su = uname("speed"),
    ev = r.ev || {};
  const evs = [
    ev.burn != null ? `burnout ${ev.burnEst ? "≈" : ""}${ev.burn.toFixed(1)} s` : "",
    ev.drogue != null ? `apogee charge ${ev.drogue.toFixed(1)} s` : "",
    ev.main != null
      ? `main ${ev.mainEst ? "≈" : ""}${ev.main.toFixed(1)} s at ${fmt(ev.mainAlt, "alt")} ${uname("alt")}`
      : "",
  ].filter(Boolean);
  out.innerHTML =
    `<div class="flnum"><span>Apogee <b>${fmt(r.apo, "alt")} ${uname("alt")}</b> at ${r.tApo.toFixed(1)} s</span><span>Top speed <b>${fmt(r.vmax, "speed")} ${su}</b>${r.vDer ? " (from altitude)" : ""}</span>${r.rateHigh != null ? `<span>Descent ${fmt(r.rateHigh, "speed")} ${su} after apogee</span>` : ""}${r.rateLow != null ? `<span>${fmt(r.rateLow, "speed")} ${su} near the ground</span>` : ""}${r.tLand != null ? `<span>Landed at ${r.tLand.toFixed(0)} s</span>` : ""}</div>` +
    (evs.length
      ? `<p class="note" style="margin:6px 0 0">Events: ${evs.join(", ")}.${ev.burnEst || ev.mainEst ? " ≈ means worked out from the curve." : ""}</p>`
      : "") +
    (r.land
      ? `<p class="note" style="margin:6px 0 0">GPS: landed ${flLandTxt(flRealLand({ landDist: r.land.dist, landBrg: r.land.brg }))} from the pad.</p>`
      : "") +
    (r.vDer
      ? `<p class="note" style="margin:6px 0 0">A speed worked out from a barometric altitude reads low near burnout; an accelerometer's velocity column is better when the file has one.</p>`
      : "") +
    (r.coast
      ? `<p class="note" style="margin:6px 0 0">${r.coast.why ? `Accelerometer: not usable for measuring drag (${esc(r.coast.why)}).` : `Accelerometer: ${r.coast.n} readings of the coast, burnout at ${r.coast.tb.toFixed(1)} s. Once the flight is saved with its weight and motor, the log shows the drag this measures.`}</p>`
      : "") +
    (r.warn.length ? `<p class="note warn" style="margin:6px 0 0">${r.warn.map(esc).join(" ")}</p>` : "");
  // preview: the altitude curve, with the simulation for comparison
  const { c, W, H } = setupCanvas(cv);
  c.clearRect(0, 0, W, H);
  const C = r.curve,
    sim = lastSim ? lastSim.out : null,
    padL = 44,
    padR = 8,
    padT = 8,
    padB = 20;
  const tMax = Math.max(C.t[C.t.length - 1], sim ? sim.t[sim.t.length - 1] : 0),
    hMax = Math.max(...C.h, sim ? lastSim.st.maxAlt : 0) * 1.05;
  const X = (t) => padL + (Math.max(0, t) / tMax) * (W - padL - padR),
    Y = (h) => padT + (1 - h / hMax) * (H - padT - padB);
  c.font = "10px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  c.fillStyle = css("--muted");
  c.strokeStyle = css("--grid");
  c.lineWidth = 1;
  niceTicks(0, toDisp(hMax, "alt"), 3).forEach((v) => {
    const y = Y(fromDisp(v, "alt"));
    if (y < padT - 1) return;
    c.beginPath();
    c.moveTo(padL, y);
    c.lineTo(W - padR, y);
    c.stroke();
    c.textAlign = "right";
    c.textBaseline = "middle";
    c.fillText(Math.abs(v) >= 1000 ? v / 1000 + "k" : String(v), padL - 5, y);
  });
  c.textAlign = "center";
  c.textBaseline = "top";
  niceTicks(0, tMax, 4).forEach((t) => {
    if (t <= tMax) c.fillText(String(t), X(t), H - padB + 4);
  });
  if (sim) {
    c.strokeStyle = css("--accent");
    c.lineWidth = 1.6;
    c.globalAlpha = 0.7;
    c.beginPath();
    sim.t.forEach((t, i) => (i ? c.lineTo(X(t), Y(sim.alt[i])) : c.moveTo(X(t), Y(sim.alt[i]))));
    c.stroke();
    c.globalAlpha = 1;
  }
  c.strokeStyle = css("--ink");
  c.lineWidth = 1.6;
  c.beginPath();
  C.t.forEach((t, i) => (i ? c.lineTo(X(t), Y(C.h[i])) : c.moveTo(X(t), Y(C.h[i]))));
  c.stroke();
  document.getElementById("altleg").innerHTML =
    `<span style="--c:${css("--ink")}">Altimeter</span>${sim ? `<span style="--c:${css("--accent")}">This run's prediction</span>` : ""}`;
}
/* backups: the whole log as JSON (to bring back), or a CSV of the flights (for a spreadsheet) */
/**
 * Saves a text file (downloads, Android app or browser).
 * @param {string} name
 * @param {string} text
 */
async function flDownload(name, text) {
  const data = new TextEncoder().encode(text).buffer;
  try {
    if (downloadsNS) {
      const res = await downloadsNS.save({ filename: name, data });
      if (!window.PocketRocketApp) prToast(res && res.status === "delivered" ? "Saved " + name : "Saved");
      return;
    }
  } catch (e) {}
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: name.endsWith(".csv") ? "text/csv" : "application/json" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  } catch (e) {
    prToast("Couldn't save the file.");
  }
}
/**
 * The flights as CSV, one row each.
 * @param {Array[]} entries [rocket name, flight]
 * @returns {string}
 */
function flCsv(entries) {
  const q = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    },
    nm = (v, dim, dec) => (v != null && isFinite(v) ? +toDisp(v, dim).toFixed(dec) : "");
  const au = uname("alt"),
    su = uname("speed");
  const rows = [
    [
      "Rocket",
      "Date",
      "Place",
      "Motor",
      "Class",
      "Total impulse (N·s)",
      "Delay",
      `Liftoff weight (${uname("mass")})`,
      `Wind (${uname("wind")})`,
      "Wind from (°)",
      `Temperature (${uname("temp")})`,
      `Field elevation (${au})`,
      `Real apogee (${au})`,
      `Predicted apogee (${au})`,
      "Difference (%)",
      `Real top speed (${su})`,
      "Burnout (s)",
      "Time to apogee (s)",
      "Ideal delay (s)",
      "Apogee charge (s)",
      "Main (s)",
      `Main altitude (${au})`,
      `Descent after apogee (${su})`,
      `Descent near the ground (${su})`,
      `Landed from pad (${au})`,
      "Landing direction (°)",
      "Altimeters",
      "Altimeter apogees",
      "Notes",
    ],
  ];
  entries.forEach(([rk, f]) => {
    const d = flDiff(f.apo, f.pred),
      A = flAltis(f),
      a = A[0] || {},
      ev = a.ev || {};
    rows.push([
      rk,
      f.date,
      f.place,
      f.motor,
      f.cls || "",
      f.impulse ? f.impulse.toFixed(0) : "",
      f.delay,
      nm(f.mass, "mass", 2),
      nm(f.wind, "wind", 1),
      f.windDir != null ? Math.round(f.windDir) : "",
      nm(f.tempC, "temp", 0),
      nm(f.elev, "alt", 0),
      nm(f.apo, "alt", 0),
      nm(f.pred, "alt", 0),
      d != null ? d.toFixed(1) : "",
      nm(f.vmax, "speed", 0),
      ev.burn != null ? ev.burn.toFixed(2) : "",
      a.tApo != null ? a.tApo.toFixed(2) : "",
      ev.burn != null && a.tApo != null ? (a.tApo - ev.burn).toFixed(1) : "",
      ev.drogue != null ? ev.drogue.toFixed(2) : "",
      ev.main != null ? ev.main.toFixed(1) : "",
      nm(ev.mainAlt, "alt", 0),
      nm(a.rateHigh, "speed", 1),
      nm(a.rateLow, "speed", 1),
      nm(f.landDist, "alt", 0),
      f.landBrg != null ? Math.round(f.landBrg) : "",
      A.map((x) => x.brand).join(" + "),
      A.map((x) => nm(x.apo, "alt", 0)).join(" / "),
      f.notes,
    ]);
  });
  return rows.map((r) => r.map(q).join(",")).join("\r\n");
}
/* every rocket's flights in one list, with totals by motor class */
/**
 * A logged flight's motor class.
 * @param {object} f
 * @returns {string}
 */
function flClassOf(f) {
  if (f.cls) return f.cls;
  const m = f.motorId && findMotor(f.motorId);
  if (m) {
    const mi = flMotorInfo(m, f.boostId ? findMotor(f.boostId) : null);
    if (mi) return mi.cls;
  }
  const c = String(f.motor || "")
    .toUpperCase()
    .match(/(?:^|[^A-Z])([A-O])\d/);
  return c ? c[1] : "?";
}
/**
 * A logged flight's total impulse.
 * @param {object} f
 * @returns {number} N·s
 */
function flImpOf(f) {
  if (f.impulse) return f.impulse;
  const m = f.motorId && findMotor(f.motorId);
  if (m) {
    const mi = flMotorInfo(m, f.boostId ? findMotor(f.boostId) : null);
    if (mi) return mi.I;
  }
  return null;
}
/**
 * Every rocket's flights, newest first.
 * @returns {Array[]} [rocket name, flight]
 */
function flAllEntries() {
  const all = flAll(),
    out = [];
  for (const e of Object.values(all)) for (const f of e.flights || []) out.push([e.name || e.file || "Rocket", f]);
  return out.sort((a, b) => (b[1].date || "").localeCompare(a[1].date || ""));
}
/**
 * Draws the all-rockets flight list with totals by motor class.
 */
function flAllOpen() {
  const E = flAllEntries(),
    box = document.getElementById("flallbody");
  if (!E.length) {
    box.innerHTML = `<p class="note">No flights logged yet.</p>`;
  } else {
    const byC = {},
      LT = "ABCDEFGHIJKLMNOP?";
    let I = 0,
      In = 0;
    E.forEach(([, f]) => {
      const c = flClassOf(f);
      byC[c] = (byC[c] || 0) + 1;
      const i = flImpOf(f);
      if (i) {
        I += i;
        In++;
      }
    });
    const rockets = new Set(E.map((e) => e[0])).size,
      au = uname("alt");
    box.innerHTML = `<p class="flsum">${E.length} flight${E.length > 1 ? "s" : ""} of ${rockets} rocket${rockets > 1 ? "s" : ""}${In ? `, ${Math.round(I).toLocaleString()} N·s in total${In < E.length ? ` (${E.length - In} without a known motor not counted)` : ""}` : ""}.</p>
      <div class="flcls">${Object.keys(byC)
        .sort((a, b) => LT.indexOf(a) - LT.indexOf(b))
        .map((c) => `<span><b>${c === "?" ? "Unknown" : c}</b> ×${byC[c]}</span>`)
        .join("")}</div>
      <div class="dtab"><table><thead><tr><th>Date</th><th>Rocket</th><th>Motor</th><th>Apogee (${au})</th><th>Diff.</th></tr></thead><tbody>
      ${E.map(([rk, f]) => {
        const d = flDiff(f.apo, f.pred);
        return `<tr><td>${esc(f.date || "")}</td><td style="text-align:left">${esc(rk)}</td><td style="text-align:left">${esc(f.motor || "")}</td><td>${f.apo > 0 ? fmt(f.apo, "alt") : "—"}</td><td class="${d != null ? flCls(d) : ""}">${flPct(d)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }
  document.getElementById("flallmodal").hidden = false;
}
/**
 * The measured curves to draw over the chart (altitude or vertical velocity), one per altimeter.
 * @param {string} ser series
 * @returns {object[]|null}
 */
export function flOverlay(ser) {
  if (!flShow || (ser !== "alt" && ser !== "vel")) return null;
  const f = flList().find((x) => x.id === flShow);
  if (!f) return null;
  const A = flAltis(f).filter((a) => a.curve);
  if (!A.length) return null;
  const dim = ser === "alt" ? "alt" : "speed";
  return A.map((a, k) => {
    const C = a.curve;
    let v;
    if (ser === "alt") v = C.h;
    else if (C.v && C.v.some((x) => x != null)) v = C.v.map((x) => (x == null ? NaN : x));
    else
      v = C.t.map((t, i) => {
        let p = i,
          q = i;
        while (p > 0 && C.t[i] - C.t[p] < 0.15) p--;
        while (q < C.t.length - 1 && C.t[q] - C.t[i] < 0.15) q++;
        return q > p ? (C.h[q] - C.h[p]) / (C.t[q] - C.t[p]) : 0;
      });
    const ev = a.ev || {};
    return {
      t: C.t,
      y: v.map((x) => (isFinite(x) ? toDisp(x, dim) : NaN)),
      label: `${A.length > 1 ? a.brand : "Real flight"} ${flDate(f.date) || ""}`.trim(),
      ev:
        k === 0
          ? [
              [ev.burn, "B"],
              [a.tApo, "A"],
              [ev.drogue, "D"],
              [ev.main, "M"],
            ].filter((e) => e[0] != null)
          : [],
    };
  });
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  window.prIncoming = function () {
    const A = window.PocketRocketApp;
    if (!A || !A.takeIncoming) return;
    const s = A.takeIncoming();
    if (!s) return;
    const k = s.indexOf("\n"),
      name = s.slice(0, k),
      b = atob(s.slice(k + 1)),
      u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    if (DESIGN_EXT.test(name)) {
      prToast("To open a design, use Open design file on the Rocket tab.");
      return;
    }
    prPendingAlt = new File([u], name);
    prIncomingGo();
  };
  setTimeout(() => window.prIncoming(), 600);
  document.getElementById("altcancel").onclick = () => {
    document.getElementById("altmodal").hidden = true;
    setAltP(null);
  };
  document.getElementById("altok").onclick = () => {
    if (!altR || altR.error) return;
    const r = altR;
    const a = {
      brand: altP.brand.id === "other" ? "Altimeter" : altP.brand.name,
      file: altP.fname,
      samples: r.samples,
      apo: r.apo,
      vmax: r.vmax > 0 ? r.vmax : null,
      vDer: r.vDer,
      tApo: r.tApo,
      tLand: r.tLand,
      rateHigh: r.rateHigh,
      rateLow: r.rateLow,
      curve: r.curve,
      ev: r.ev,
      land: r.land,
      ...(r.coast && !r.coast.why ? { coast: r.coast } : {}),
      map: {
        ...altP.map,
        cols: altP.map.t >= 0 ? [altP.cols[altP.map.t], altP.cols[altP.map.alt]] : [altP.cols[altP.map.alt]],
      },
    };
    document.getElementById("altmodal").hidden = true;
    if (altMode === "new") {
      if (altWhoSel === "cur") {
        const g = (id, dim) => {
          const e = document.getElementById(id),
            x = e ? parseFloat(e.value) : NaN;
          return isFinite(x) ? fromDisp(x, dim) : undefined;
        };
        fcOpen(
          altDraft(a, {
            delay: document.getElementById("af-delay").value.trim(),
            date: document.getElementById("af-date").value,
            mass: g("af-mass", "mass"),
            elev: g("af-elev", "alt"),
            wind: g("af-wind", "wind"),
          }),
          true,
        );
      } else {
        altWaiting = { a, key: flKey() };
        if (altWhoSel.startsWith("r:")) openRecent(altWhoSel.slice(2));
        else {
          const tb = document.getElementById("t-rocket");
          if (tb) tb.click();
          prToast("Open the rocket that flew it; the log comes back once it's open and launched.");
        }
      }
      setAltP(null);
      return;
    }
    // a date in the file name (2026-05-14, 20260514) is a good guess for the flight's date
    const dm = altP.fname.match(/(20\d\d)[-_.]?([01]\d)[-_.]?([0-3]\d)/);
    if (!(altMode === "form" && flEdit)) {
      flOpen(null);
      if (dm) document.getElementById("fl-date").value = `${dm[1]}-${dm[2]}-${dm[3]}`;
    }
    const first = !(flEdit.altis && flEdit.altis.length);
    flEdit.altis = [...(flEdit.altis || []), a];
    /**
     * Fills a form field from the file's figures.
     */
    const set = (id, v, dim) => {
      const e = document.getElementById(id);
      if (e && v != null && isFinite(v) && (first || !e.value)) e.value = +toDisp(v, dim).toFixed(0);
    };
    set("fl-apo", r.apo, "alt");
    if (r.vmax > 0 && !r.vDer) set("fl-vmax", r.vmax, "speed");
    else if (r.vmax > 0) set("fl-vmax", r.vmax, "speed");
    if (r.land) {
      set("fl-ldist", r.land.dist, "alt");
      const lb = document.getElementById("fl-lbrg");
      if (lb && (first || !lb.value)) lb.value = Math.round(r.land.brg);
    }
    flAltBox();
    flPredBox();
    setAltP(null);
  };
  document.getElementById("fladd").onclick = () => flOpen(null);
  {
    const inp = document.getElementById("flaltfile");
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      inp.value = "";
      if (f) altOpenFile(f, "new");
    };
  }
  document.getElementById("flexp").onclick = () => {
    const all = flAll(),
      n = Object.values(all).reduce((a, e) => a + (e.flights || []).length, 0);
    if (!n) {
      prToast("No flights logged yet.");
      return;
    }
    flDownload(
      `flight-log-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(
        {
          app: "Pocket Rocket Flight Lab",
          kind: "flight-log",
          version: 2,
          exported: new Date().toISOString(),
          designs: all,
        },
        null,
        1,
      ),
    );
  };
  document.getElementById("flcsv").onclick = () => {
    const list = flList();
    if (!list.length) {
      prToast("No flights logged for this rocket yet.");
      return;
    }
    flDownload(
      `${(D.name || "rocket").replace(/[\\/:*?"<>|]+/g, "-")} flights.csv`,
      flCsv(
        list
          .slice()
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
          .map((f) => [D.name || "", f]),
      ),
    );
  };
  {
    const inp = document.getElementById("flimp");
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      inp.value = "";
      if (!f) return;
      let j;
      try {
        j = JSON.parse(await f.text());
      } catch (e) {
        prToast("That isn't a flight log backup (a .json file exported from here).");
        return;
      }
      if (!j || j.kind !== "flight-log" || !j.designs) {
        prToast("That isn't a flight log backup (a .json file exported from here).");
        return;
      }
      const all = flAll();
      let add = 0;
      for (const [k, e] of Object.entries(j.designs)) {
        if (!e || !Array.isArray(e.flights)) continue;
        const cur = all[k] || { name: e.name, file: e.file, flights: [] };
        for (const fl of e.flights) {
          if (fl && fl.id && !cur.flights.some((x) => x.id === fl.id)) {
            cur.flights.push(fl);
            add++;
          }
        }
        all[k] = cur;
      }
      if (!flSaveAll(all)) return;
      setFlNow({});
      renderFlightLog();
      prToast(add ? `Added ${add} flight${add > 1 ? "s" : ""} from the backup` : "Those flights are already here");
    };
  }
  document.getElementById("flallbtn").onclick = flAllOpen;
  document.getElementById("flallclose").onclick = () => {
    document.getElementById("flallmodal").hidden = true;
  };
  document.getElementById("flallcsv").onclick = () => {
    const E = flAllEntries();
    if (!E.length) {
      prToast("No flights logged yet.");
      return;
    }
    flDownload(`all flights ${new Date().toISOString().slice(0, 10)}.csv`, flCsv(E.slice().reverse()));
  };
}
