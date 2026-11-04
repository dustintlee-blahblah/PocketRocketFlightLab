/**
 * A run written into the design file as a saved simulation (see the note below).
 */
/* ---------- a run written into the design file as a saved simulation ----------
   OpenRocket: a new <simulation> with its results summary, events and time history (OpenRocket opens it as a finished simulation).
   (A design opened from a RockSim file is saved as an .ork first; RockSim files are only read.) Runs saved from here are named "Pocket Rocket: …", so the app
   never takes them as the other program's own prediction when the file is opened again. */
/**
 * The name prefix of simulations saved from this app.
 */
const PR_SIM_TAG = "Pocket Rocket";
/**
 * A fresh run of the design for saving, without the file's own reference figures.
 * @returns {object} {st, out, m, mb}
 */
function simFresh() {
  const m = flightMotor(),
    mb = D.twoStage ? flightBoost() : null;
  const r = simulate(D, L, m, mb, { noRef: true });
  return { ...r, m, mb };
}
/**
 * The saved simulation's name: "Pocket Rocket: <motor>, <local date and time>", so each run saved has its own.
 * @param {object} R run
 * @returns {string}
 */
function simName(R) {
  const d = new Date(),
    p = (x) => String(x).padStart(2, "0");
  return `${PR_SIM_TAG}: ${flMotorName(R.m, R.mb)}, ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/**
 * A number as OpenRocket writes it (NaN, exponent or 6 significant digits).
 */
const simN = (v) => {
  if (v == null || !isFinite(v)) return "NaN";
  const a = Math.abs(v);
  return a !== 0 && (a < 1e-3 || a >= 1e7) ? (+v).toExponential(3) : String(+(+v).toPrecision(6));
};
/**
 * A random version-4 UUID.
 * @returns {string}
 */
function simUuid() {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++)
    s += i === 8 || i === 13 || i === 18 || i === 23 ? "-" : i === 14 ? "4" : h[Math.floor(Math.random() * 16)];
  return s;
}
/**
 * The run's summary figures, worked out once for both file formats.
 * @param {object} R run
 * @returns {object}
 *
 * the run's figures, worked out once for both file formats
 */
function simFigures(R) {
  const { out, st } = R,
    n = out.t.length;
  const hv = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1),
      b = Math.min(n - 1, i + 1),
      dt = out.t[b] - out.t[a] || 1;
    hv.push(Math.hypot((out.drift[b] - out.drift[a]) / dt, ((out.cross[b] || 0) - (out.cross[a] || 0)) / dt));
  }
  const va = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1),
      b = Math.min(n - 1, i + 1);
    va.push((out.vel[b] - out.vel[a]) / (out.t[b] - out.t[a] || 1));
  }
  let iV = 0,
    iA = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.hypot(out.vel[i], hv[i]);
    if (v > Math.hypot(out.vel[iV], hv[iV])) iV = i;
    if ((out.acc[i] || 0) > (out.acc[iA] || 0)) iA = i;
  }
  const burn = st.staged ? (st.susTb ?? st.tb) : st.tb,
    land = st.tLand ?? out.t[n - 1];
  let gh = 0;
  for (let i = n - 1; i > 0; i--) {
    if (out.t[i] < land - 1e-9) {
      gh = Math.hypot(out.vel[i], hv[i]);
      break;
    }
  }
  return {
    n,
    hv,
    va,
    iV,
    iA,
    burn,
    land,
    gh,
    range: Math.hypot(st.drift || 0, st.driftY || 0),
    maxHV: Math.max(0, ...hv),
    maxVA: Math.max(0, ...va),
    optDelay: st.tApo != null && burn != null ? Math.max(0, st.tApo - burn) : null,
  };
}
/**
 * Adds the run to an .ork document as a finished simulation, with its summary, events and time history.
 * @param {string} xml
 * @param {object} R run
 * @param {string} cfg motor configuration id
 * @returns {string} the new XML
 */
function simOrkAdd(xml, R, cfg) {
  const doc = new DOMParser().parseFromString(xml, "application/xml"),
    root = doc.documentElement,
    ns = root.namespaceURI,
    mk = (t) => doc.createElementNS(ns, t);
  /**
   * The first child element with a tag name.
   */
  const kid = (el, t) => [...el.children].find((c) => c.tagName === t);
  let sims = kid(root, "simulations");
  if (!sims) {
    sims = mk("simulations");
    const r = kid(root, "rocket");
    root.insertBefore(sims, r ? r.nextSibling : null);
  }
  const all = [...sims.children].filter((c) => c.tagName === "simulation");
  const ref = all.find((s) => s.getElementsByTagName("configid")[0]?.textContent.trim() === cfg) || all[0];
  const { out, st } = R,
    F = simFigures(R);
  let sim, c;
  /**
   * Adds a child element with text.
   */
  const add = (p, t, v) => {
    const e = mk(t);
    if (v != null) e.textContent = String(v);
    p.appendChild(e);
    return e;
  };
  /**
   * Sets a child element's text, adding the element if it's missing.
   */
  const put = (p, t, v) => {
    const e = kid(p, t) || add(p, t);
    e.textContent = String(v);
    return e;
  };
  if (ref) {
    // the file's simulation for this configuration, with the run's own launch conditions
    sim = ref.cloneNode(true);
    [...sim.children]
      .filter((c) => c.tagName === "flightdata" || c.tagName === "name")
      .forEach((c) => sim.removeChild(c));
    c = kid(sim, "conditions") || add(sim, "conditions");
  } else {
    sim = mk("simulation");
    add(sim, "simulator", "RK4Simulator");
    add(sim, "calculator", "BarrowmanCalculator");
    c = add(sim, "conditions");
    if (cfg) add(c, "configid", cfg);
  }
  {
    const dir = simN(((L.windDir || 0) * Math.PI) / 180);
    put(c, "launchrodlength", simN(L.rail));
    put(c, "launchintowind", L.railMode !== "fixed" ? "true" : "false");
    put(c, "launchrodangle", simN(L.angle));
    put(c, "launchroddirection", simN(L.railDir ?? 90));
    put(c, "windaverage", simN(L.wind));
    put(c, "windturbulence", simN(L.turb || 0));
    put(c, "winddirection", dir);
    [...c.children].filter((e) => e.tagName === "wind").forEach((e) => c.removeChild(e));
    const w = add(c, "wind");
    w.setAttribute("model", "average");
    add(w, "speed", simN(L.wind));
    add(w, "direction", dir);
    add(w, "standarddeviation", simN(L.wind * (L.turb || 0)));
    put(c, "windmodeltype", "Average");
    put(c, "launchaltitude", simN(L.elev));
    put(c, "launchlatitude", simN(L.lat ?? 40));
    put(c, "launchlongitude", simN(L.lon ?? 0));
    if (!kid(c, "geodeticmethod")) add(c, "geodeticmethod", "flat");
    [...c.children].filter((e) => e.tagName === "atmosphere").forEach((e) => c.removeChild(e));
    const at = add(c, "atmosphere");
    at.setAttribute("model", "extendedisa");
    add(at, "basetemperature", simN(L.tempC + 273.15));
    add(at, "basepressure", simN(101325 * Math.pow(Math.max(1 - 2.25577e-5 * L.elev, 0.01), 5.25588)));
    if (!kid(c, "timestep")) add(c, "timestep", "0.05");
    if (!kid(c, "maxtime")) add(c, "maxtime", "1200");
  }
  sim.setAttribute("status", "uptodate");
  const nm = mk("name");
  nm.textContent = simName(R);
  sim.insertBefore(nm, sim.firstChild);
  const fd = mk("flightdata"),
    A = (k, v) => fd.setAttribute(k, simN(v));
  A("maxaltitude", st.maxAlt);
  A("maxvelocity", Math.hypot(out.vel[F.iV], F.hv[F.iV]));
  A("maxacceleration", st.maxAcc);
  A("maxmach", st.maxMach);
  A("timetoapogee", st.tApo);
  A("flighttime", F.land);
  A("groundhitvelocity", F.gh);
  A("launchrodvelocity", st.offRail);
  A("deploymentvelocity", st.vDeploy);
  A("optimumdelay", F.optDelay);
  const br = mk("databranch");
  br.setAttribute("name", "Sustainer");
  br.setAttribute(
    "types",
    "Time,Altitude,Vertical velocity,Vertical acceleration,Total velocity,Lateral distance,Lateral velocity,Thrust",
  );
  const ev = [
    [0, "launch"],
    [0, "ignition"],
    [st.offRailT, "launchrod"],
    [F.burn, "burnout"],
    [st.tApo, "apogee"],
    [st.tEject, "ejectioncharge"],
    [st.tDeploy, "recoverydevicedeployment"],
    [st.tMain != null && st.tMain !== st.tDeploy ? st.tMain : null, "recoverydevicedeployment"],
    [st.landed ? F.land : null, "groundhit"],
    [out.t[F.n - 1], "simulationend"],
  ];
  for (const [t, ty] of ev) {
    if (t == null || !isFinite(t)) continue;
    const e = mk("event");
    e.setAttribute("time", simN(t));
    e.setAttribute("type", ty);
    e.setAttribute("id", simUuid());
    br.appendChild(e);
  }
  const step = Math.max(1, Math.ceil(F.n / 800));
  for (let i = 0; i < F.n; i += step) {
    const dp = mk("datapoint");
    const lat = Math.hypot(out.drift[i], out.cross[i] || 0);
    dp.textContent = [
      out.t[i],
      Math.max(0, out.alt[i]),
      out.vel[i],
      F.va[i],
      Math.hypot(out.vel[i], F.hv[i]),
      lat,
      F.hv[i],
      out.thrust[i] || 0,
    ]
      .map(simN)
      .join(",");
    br.appendChild(dp);
  }
  fd.appendChild(br);
  sim.appendChild(fd);
  sims.appendChild(sim);
  return new XMLSerializer().serializeToString(doc);
}
/**
 * After a save to a new file, moves (or copies) the design's flight log and drag calibration to it.
 * @param {string} oldFl the flight log key before
 * @param {string} oldCal the calibration key before
 * @param {boolean} move move them (a copy gets copies)
 *
 * after a save to a new file, the design's flight log and drag calibration move with it (a copy takes copies of them)
 */
function prCarryLog(oldFl, oldCal, move) {
  const nf = flKey(),
    nc = calKey();
  if (oldFl && nf !== oldFl) {
    const all = flAll(),
      e = all[oldFl];
    if (e && e.flights && e.flights.length) {
      const cur = all[nf] || { name: e.name, file: "", flights: [] };
      for (const f of e.flights)
        if (!cur.flights.some((x) => x.id === f.id)) cur.flights.push(move ? f : { ...f, id: flId() });
      cur.file = (SOURCE && SOURCE.name) || cur.file;
      all[nf] = cur;
      if (move) delete all[oldFl];
      flSaveAll(all);
      flNow = {};
    }
  }
  if (nc !== oldCal) {
    const m = store.get(CAL_STORE, {});
    if (m[oldCal] && !m[nc]) {
      m[nc] = m[oldCal];
      if (move) delete m[oldCal];
      store.set(CAL_STORE, m);
    }
  }
}
/**
 * Save changes / Save as / Save a copy: writes the design into its file, a new .ork or a copy, with the run
 * as a saved simulation, and reports what was saved.
 * @param {boolean} asNew save as a new .ork
 * @param {{name:string, copyName:string}} [opts] the name for a first save, or for a copy
 * @returns {Promise<boolean>} true if saved
 */
async function saveDesignFile(asNew, opts = {}) {
  // the first Save changes of a new design, or of a design opened from a RockSim file: it becomes an .ork file
  // (under the name just given, or the .rkt file's name), and later saves go into it. A RockSim file is only ever read.
  const fromRkt = !asNew && !!SOURCE && SOURCE.format === "rkt" && !opts.copyName;
  const first = !asNew && ((!SOURCE && !!opts.name) || fromRkt);
  // Save a copy: the open file's design under a new name, in the same format; the copy is what's open afterwards
  const copy = !asNew && SOURCE && opts.copyName ? String(opts.copyName) : null;
  const clean = (nm) =>
    String(nm || "rocket")
      .replace(/\.(ork|rkt)$/i, "")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .trim() || "rocket";
  const msg = document.getElementById("savemsg"),
    btn = document.getElementById("savefile");
  msg.innerHTML = "";
  if (!downloadsNS) {
    msg.textContent = "Saving files isn’t available in this view.";
    return false;
  }
  const probs = bldProblems(BLD);
  if (probs.length) {
    msg.innerHTML = `<div class="report err"><b>Fix these before saving:</b><ul>${probs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
    return false;
  }
  bldSyncMotors();
  // over an OpenRocket file: rebuild its rocket from the parts and keep the rest of the file; anything else becomes a new .ork
  if (BLD)
    for (const st of BLD.stages) {
      const fix = (o) => {
        const m = /^rkt:(\d+)$/.exec(o.id || "");
        if (m) {
          if (bldSel === o.id) bldSel = rktPartId(+m[1]);
          o.id = rktPartId(+m[1]);
        }
      };
      fix(st);
      (st.parts || []).forEach(fix);
    }
  const into = !asNew && SOURCE && SOURCE.format === "ork";
  let text, fname;
  try {
    const fresh = bldToOrk(BLD, L);
    if (into) {
      const RB = SOURCE.resetTo || SOURCE.base || {};
      let baseXml = null;
      try {
        if (RB.M) baseXml = bldToOrk(jclone(RB.M), RB.L);
      } catch (_) {
        baseXml = null;
      }
      text = bldMergeOrk(SOURCE.text, fresh, BLD.cfg, L, RB.L, baseXml);
      fname = copy
        ? clean(copy) + ".ork"
        : /\.ork$/i.test(SOURCE.name)
          ? SOURCE.name
          : SOURCE.name.replace(/\.[^.]*$/, "") + ".ork";
    } else {
      text = fresh;
      fname = copy
        ? clean(copy) + ".ork"
        : fromRkt
          ? clean(opts.name || SOURCE.name) + ".ork"
          : clean(first ? opts.name : BLD.name) + ".ork";
    }
  } catch (e) {
    msg.innerHTML = `<div class="report err">${esc(e.message || String(e))}</div>`;
    return false;
  }
  // the run's results go into the file when asked for (Save this run)
  let simNote = "";
  {
    // a stand-in motor (the file's own isn't on this device) isn't written to the file, so its run can't be either
    const H = BLD.hold || [],
      held =
        (H[0] != null && H[0] === motorId) ||
        (D.twoStage && H[1] != null && H[1] === boostId) ||
        (isThree(D) && H[2] != null && H[2] === firstId);
    if (held && opts.addSim)
      simNote =
        " This run flew a stand-in motor because the file’s own motor isn’t on this device, so it wasn’t saved as a simulation.";
    else if (!held && opts.addSim) {
      let R = null;
      try {
        R = simFresh();
      } catch (e) {
        R = null;
      }
      if (!R || R.st.error || !R.out.t.length) {
        if (opts.addSim) simNote = " This run doesn’t fly normally, so it wasn’t saved as a simulation.";
      } else if (opts.addSim) {
        try {
          text = simOrkAdd(text, R, BLD.cfg);
          simNote = " This run was added to its simulations.";
        } catch (e) {
          simNote = " This run couldn’t be added to its simulations.";
        }
      }
    }
  }
  window.prLastSimNote = simNote;
  // the file keeps its name on Save changes, whatever the rocket is called (a new file name comes only from Save a copy)
  text = text.replace(/<crosssection>(beveled|doublewedge)<\/crosssection>/g, "<crosssection>airfoil</crosssection>");
  const bytes = new TextEncoder().encode(text);
  const extras = into
    ? (SOURCE.extras || [])
        .filter((x) => x.name !== BP_ORK && x.name !== LAUNCH_ORK)
        .map((x) => ({ name: x.name, data: b64ToU8(x.b64) }))
    : [];
  // every launch setting (OpenRocket's simulation holds only some of them) rides along in its own file too
  extras.push({
    name: LAUNCH_ORK,
    data: new TextEncoder().encode(
      JSON.stringify({
        app: "Pocket Rocket Flight Lab",
        version: 1,
        launch: L,
        when: document.getElementById("wxwhen").value || "",
      }),
    ),
  });
  // the ejection charge settings ride along in their own file inside the .ork; OpenRocket ignores it
  {
    const fe = {};
    if (BLD)
      for (const st of BLD.stages)
        for (const pp of st.parts || [])
          for (const k of pp.kids || [])
            if (k.type === "fins" && k.id && !["square", "rounded", "airfoil"].includes(k.edge || "square"))
              fe[k.id] = k.edge;
    const i = extras.findIndex((x) => x.name === FIN_ORK);
    if (i >= 0) extras.splice(i, 1);
    if (Object.keys(fe).length)
      extras.push({
        name: FIN_ORK,
        data: new TextEncoder().encode(JSON.stringify({ app: "Pocket Rocket Flight Lab", version: 1, finEdges: fe })),
      });
  }
  {
    const bp = BLD && BLD.bp;
    if (bp && (Object.keys(bp.comps || {}).length || Object.keys(bp.splits || {}).length))
      extras.push({
        name: BP_ORK,
        data: new TextEncoder().encode(
          JSON.stringify({
            app: "Pocket Rocket Flight Lab",
            version: 1,
            comps: bp.comps || {},
            splits: bp.splits || {},
          }),
        ),
      });
  }
  const fileBytes = zipStore([{ name: "rocket.ork", data: bytes }, ...extras]);
  // the web viewer can only hand out common file types, so the design comes wrapped in a .zip there
  const wrap = !isAndroidApp() && !(downloadsNS && downloadsNS.browser);
  const saveName = wrap ? fname + ".zip" : fname,
    data = wrap ? zipStore([{ name: fname, data: fileBytes }]) : fileBytes;
  btn.disabled = true;
  let ok = false;
  try {
    // in the Android app, Save changes writes straight over the .ork file that was opened
    let res = null,
      over = false;
    if (into && !copy && isAndroidApp() && window.PocketRocketApp.saveToSource) {
      try {
        over = !!window.PocketRocketApp.saveToSource(bufToB64(fileBytes));
      } catch (_) {
        over = false;
      }
    }
    if (over) res = { status: "delivered" };
    // on Android the new file is remembered once it's written, so later saves go straight into it
    else if ((first || copy) && isAndroidApp() && window.PocketRocketApp.saveFileAsSource) {
      window.PocketRocketApp.saveFileAsSource(saveName, bufToB64(data));
      res = { status: "delivered" };
    } else {
      res = await downloadsNS.save({
        filename: saveName,
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      });
      if (res.status === "saved") prToast("File saved.");
    }
    if (res.status === "saved" || res.status === "delivered") {
      ok = true;
      // the flight log and drag calibration follow the design to its new file
      const oldFl = typeof flKey === "function" ? flKey() : null,
        oldCal = calKey();
      if (first)
        setSource({
          name: fname,
          format: "ork",
          text,
          extras: [],
          base: { D: jclone(D), L: jclone(L), motorId, boostId, firstId, M: jclone(BLD) },
        });
      else if (!asNew && SOURCE) {
        // from now on the design is that .ork file: later saves merge into it, and Reset returns to it
        setSource({
          ...SOURCE,
          name: fname,
          format: "ork",
          text,
          resetTo: { D: jclone(D), L: jclone(L), motorId, boostId, firstId, M: jclone(BLD) },
          ...(copy ? { recentId: null } : {}),
        });
      }
      try {
        prCarryLog(oldFl, oldCal, !copy);
      } catch (_) {}
      if (!asNew || !SOURCE) markClean();
      // a copy gets its own entry in the recent files; the original's entry stays
      if (copy) {
        const id = "name:" + fname;
        await recentPut({
          id,
          name: fname,
          uri: "",
          rocket: D.name || "",
          when: Date.now(),
          data: fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength),
        });
        if (SOURCE && SOURCE.recentId == null) setSource({ ...SOURCE, recentId: id });
        renderRecent();
      } else if (!asNew && SOURCE) recentSaved(fileBytes, fname);
    }
    const what = fromRkt
      ? `Saved as ${fname}, an OpenRocket file. The original .rkt file isn’t changed; from now on, Save changes updates ${fname}.`
      : first
        ? `Saved ${fname}. From now on, Save changes updates this file.`
        : copy
          ? `Saved a copy as ${fname}. You’re now working on the copy: Save changes updates ${fname}, and the original file isn’t changed.`
          : over
            ? `Saved your changes over ${fname}.`
            : into
              ? `Saved your changes to ${fname}.`
              : `Saved ${fname}.`;
    const how =
      (wrap ? ` It’s inside ${saveName}: unzip it to get the OpenRocket file.` : "") +
      (res.status === "saved" || res.status === "delivered" ? simNote : "");
    msg.innerHTML = `<div class="report"><b>${esc(res.status === "saved" || res.status === "delivered" ? what : "Choose where to save the file.")}</b>${esc(how)}${into && ok ? `<div class="note" style="margin-top:6px">The file’s part colors, notes, other motor configurations and simulations were kept; ${/added/.test(simNote) ? "its other simulations are" : "its simulations are"} marked out of date.</div>` : ""}</div>`;
  } catch (e) {
    const c = e && e.code;
    msg.textContent =
      c === "declined"
        ? "Save cancelled."
        : c === "rate_limited"
          ? "A save prompt is already open. Finish it, then try again."
          : c === "unavailable" || c === "not_granted" || c === "capability_disabled" || c === "capability_removed"
            ? "Saving files isn’t available in this view."
            : `Couldn’t save the file${e && e.message ? ": " + e.message : "."}`;
  } finally {
    btn.disabled = false;
  }
  renderSavePanel();
  return ok;
}
// Save this run: the last run written into the design file as a saved simulation
document.getElementById("simsave").onclick = async () => {
  if (!SOURCE) {
    prToast("Save the design to a file first (Rocket tab), then runs can be saved into it.");
    return;
  }
  const b = document.getElementById("simsave");
  b.disabled = true;
  try {
    const ok = await saveDesignFile(false, { addSim: true });
    const t = (document.getElementById("savemsg").textContent || "").trim();
    const sn = (window.prLastSimNote || "").trim();
    prToast(ok && /added/.test(sn) ? `Saved this run into ${SOURCE.name}.` : ok && sn ? sn : t || "Not saved.");
  } finally {
    b.disabled = !SOURCE;
  }
};
