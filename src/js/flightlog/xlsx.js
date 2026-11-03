/* ---------- Excel (.xlsx) altimeter files: each worksheet becomes CSV text for the altimeter reader ---------- */
function zipEntries(buf) {
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
async function zipData(buf, e) {
  const u8 = new Uint8Array(buf),
    dv = new DataView(buf),
    lnl = dv.getUint16(e.off + 26, true),
    lxl = dv.getUint16(e.off + 28, true);
  const d = u8.subarray(e.off + 30 + lnl + lxl, e.off + 30 + lnl + lxl + e.csize);
  return e.method === 0 ? d : await inflate(d, "deflate-raw");
}
const xmlTxt = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
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
  const colN = (r) => {
    const m = /^([A-Z]+)/.exec(r || "");
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  };
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
async function altOpenFile(file, mode) {
  altMode = mode;
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
    altP = P;
    altShow();
  } catch (e) {
    prToast("Couldn't read that file.");
  }
}
/* a file shared to the app from another app (Featherweight UI, email, Drive…): straight into the flight log */
var prPendingAlt = null;
function prIncomingGo() {
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
  if (/\.(ork|rkt)$/i.test(name)) {
    prToast("To open a design, use Open .ork / .rkt on the Rocket tab.");
    return;
  }
  prPendingAlt = new File([u], name);
  prIncomingGo();
};
setTimeout(() => window.prIncoming(), 600);

function altShow() {
  const P = altP,
    m = P.map,
    opt = (sel, none) =>
      (none ? `<option value="-1"${sel < 0 ? " selected" : ""}>${none}</option>` : "") +
      P.cols.map((c, k) => `<option value="${k}"${k === sel ? " selected" : ""}>${esc(c)}</option>`).join("");
  document.getElementById("alttitle").textContent = `${P.brand.id === "other" ? "Altimeter" : P.brand.name} file`;
  document.getElementById("altmap").innerHTML = `
    <p class="note" style="margin:0 0 10px">${esc(P.fname)}: ${P.data.length} rows, ${P.cols.length} column${P.cols.length > 1 ? "s" : ""}. ${P.brand.id === "other" ? "The altimeter brand wasn't recognized, so check" : "Check"} the columns and units below against the curve.</p>
    <div class="flgrid">
      ${P.sheets && P.sheets.length > 1 ? `<div class="fld"><label for="alt-sh">Worksheet</label><div class="in"><select id="alt-sh">${P.sheets.map((x, i) => `<option value="${i}"${i === P.sheet ? " selected" : ""}${x.P.error ? " disabled" : ""}>${esc(x.name)}</option>`).join("")}</select></div></div><div class="flsp"></div>` : ""}
      <div class="fld"><label for="alt-t">Time column</label><div class="in"><select id="alt-t">${opt(m.t, "None: fixed sample rate")}</select></div></div>
      <div class="fld" id="alt-tuw"><label for="alt-tu">${m.t >= 0 ? "Time unit" : "Samples per second"}</label><div class="in">${m.t >= 0 ? `<select id="alt-tu"><option value="s"${m.tUnit === "s" ? " selected" : ""}>seconds</option><option value="ms"${m.tUnit === "ms" ? " selected" : ""}>milliseconds</option></select>` : `<input id="alt-rate" type="number" inputmode="decimal" step="any" value="${m.rate}">`}</div></div>
      <div class="fld"><label for="alt-a">Altitude or pressure column</label><div class="in"><select id="alt-a">${opt(m.alt)}</select></div></div>
      <div class="fld"><label for="alt-au">It holds</label><div class="in"><select id="alt-au">${[["ft", "altitude in feet"], ["m", "altitude in metres"], ...ALT_PRESS.map((p) => ["p:" + p[0], "pressure in " + p[0]])].map(([v, l]) => `<option value="${v}"${(m.isP ? "p:" + m.pUnit : m.aUnit) === v ? " selected" : ""}>${l}</option>`).join("")}</select></div></div>
      <div class="fld"><label for="alt-v">Velocity column</label><div class="in"><select id="alt-v">${opt(m.vel, "None: work it out from altitude")}</select></div></div>
      <div class="fld"><label for="alt-vu">Velocity unit</label><div class="in"><select id="alt-vu"${m.vel < 0 ? " disabled" : ""}><option value="ft"${m.vUnit === "ft" ? " selected" : ""}>ft/s</option><option value="m"${m.vUnit === "m" ? " selected" : ""}>m/s</option></select></div></div>
    </div>`;
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
  };
  {
    const sh = document.getElementById("alt-sh");
    if (sh)
      sh.onchange = () => {
        const np = P.sheets[+sh.value].P;
        if (np && !np.error) {
          altP = np;
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
          altPreview();
        }),
  );
  document.getElementById("altmodal").hidden = false;
  altPreview();
}
let altR = null;
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
document.getElementById("altcancel").onclick = () => {
  document.getElementById("altmodal").hidden = true;
  altP = null;
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
    map: {
      ...altP.map,
      cols: altP.map.t >= 0 ? [altP.cols[altP.map.t], altP.cols[altP.map.alt]] : [altP.cols[altP.map.alt]],
    },
  };
  document.getElementById("altmodal").hidden = true;
  // a date in the file name (2026-05-14, 20260514) is a good guess for the flight's date
  const dm = altP.fname.match(/(20\d\d)[-_.]?([01]\d)[-_.]?([0-3]\d)/);
  if (!(altMode === "form" && flEdit)) {
    flOpen(null);
    if (dm) document.getElementById("fl-date").value = `${dm[1]}-${dm[2]}-${dm[3]}`;
  }
  const first = !(flEdit.altis && flEdit.altis.length);
  flEdit.altis = [...(flEdit.altis || []), a];
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
  altP = null;
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
/* backups: the whole log as JSON (to bring back), or a CSV of the flights (for a spreadsheet) */
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
    flNow = {};
    renderFlightLog();
    prToast(add ? `Added ${add} flight${add > 1 ? "s" : ""} from the backup` : "Those flights are already here");
  };
}
/* every rocket's flights in one list, with totals by motor class */
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
function flImpOf(f) {
  if (f.impulse) return f.impulse;
  const m = f.motorId && findMotor(f.motorId);
  if (m) {
    const mi = flMotorInfo(m, f.boostId ? findMotor(f.boostId) : null);
    if (mi) return mi.I;
  }
  return null;
}
function flAllEntries() {
  const all = flAll(),
    out = [];
  for (const e of Object.values(all)) for (const f of e.flights || []) out.push([e.name || e.file || "Rocket", f]);
  return out.sort((a, b) => (b[1].date || "").localeCompare(a[1].date || ""));
}
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
// the measured curves over the chart's simulation (altitude or vertical velocity), one per altimeter
function flOverlay(ser) {
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
