/**
 * Opening files: a design (.ork or .rkt) from the file picker, loadDesignXml (which every way of opening a design goes
 * through), uploaded motor files (.eng, .rse, or a .zip of them), and Reset Changes.
 */
document.getElementById("orkfile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const buf = await f.arrayBuffer();
    const xml = await unzipOrk(buf);
    if (await openDesignAsk(xml, f.name, buf)) await recentAdd(buf, f.name);
  } catch (err) {
    document.getElementById("orkreport").innerHTML = `<div class="report err">${esc(err.message || String(err))}</div>`;
  }
  e.target.value = "";
});
/**
 * True if two values are the same (numbers to a few parts in a million).
 */
function launchSame(a, b) {
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  if (a == null || b == null) return a == null && b == null;
  return JSON.stringify(a) === JSON.stringify(b);
}
/**
 * The runs (simulations) stored in a design file, for choosing one when it's opened.
 * @param {string} xml the .ork or .rkt text
 * @param {object|null} saved this app's saved state from the file (prStateRead), for its runs' times
 * @returns {{i:number, name:string, motors:string, apogee:number|null, wind:number|null, outdated:boolean,
 *   cfg:string|null, at:string}[]}
 */
function designRuns(xml, saved) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch (e) {
    return [];
  }
  const t = (el, tag) => {
    const e = el && el.getElementsByTagName(tag)[0];
    return e ? e.textContent.trim() : "";
  };
  const n = (v) => (v === "" || v == null || !isFinite(+v) ? null : +v);
  if (/<RockSimDocument/i.test(xml.slice(0, 4000)))
    return [...doc.getElementsByTagName("SimulationResults")].map((s, i) => ({
      i,
      name: t(s, "SimulationName") || `Simulation ${i + 1}`,
      motors: [
        ...new Set([...s.getElementsByTagName("EngineCode")].map((e) => e.textContent.trim()).filter(Boolean)),
      ].join(", "),
      apogee: n(t(s, "MaxAltitude")),
      wind: n(t(s, "LaunchWindSpeed")),
      outdated: false,
      cfg: null,
      at: "",
    }));
  const runs = (saved && saved.runs) || {};
  return [...doc.getElementsByTagName("simulation")].map((s, i) => {
    const cfg = t(s.getElementsByTagName("conditions")[0], "configid") || null,
      fd = s.getElementsByTagName("flightdata")[0],
      name = t(s, "name") || `Simulation ${i + 1}`;
    // the motors of its configuration
    const motors = cfg
      ? [...doc.getElementsByTagName("motor")]
          .filter((m) => m.getAttribute("configid") === cfg)
          .map((m) => t(m, "designation"))
          .filter(Boolean)
      : [];
    return {
      i,
      name,
      motors: [...new Set(motors)].join(", "),
      apogee: fd ? n(fd.getAttribute("maxaltitude")) : null,
      wind: n(t(s.getElementsByTagName("conditions")[0], "windaverage")),
      outdated: s.getAttribute("status") === "outdated",
      cfg,
      at: (runs[name] && runs[name].at) || "",
    };
  });
}
/**
 * Asks how to open a design file: the design alone (keeping your launch settings), with the settings saved with it, or
 * with one of its stored runs.
 * @param {string} name the file's name
 * @param {object[]} runs from designRuns
 * @param {boolean} hasSaved the file has this app's saved settings
 * @returns {Promise<{kind:string, i?:number, cfg?:string|null, name?:string}|null>} null if cancelled
 */
function askOpenRun(name, runs, hasSaved) {
  const box = document.getElementById("runpick"),
    list = document.getElementById("runlist");
  document.getElementById("runttl").textContent = `Open ${name}`;
  const item = (val, title, sub, checked) =>
    `<label class="runitem"><input type="radio" name="runsel" value="${val}"${checked ? " checked" : ""}><span><b>${esc(title)}</b>${sub ? `<span class="note">${esc(sub)}</span>` : ""}</span></label>`;
  let h = item("design", "Design only", "Keeps the launch settings you have now.", true);
  if (hasSaved) h += item("saved", "Design with its saved settings", "The launch settings saved with the file.", false);
  if (runs.length) {
    h += `<div class="runhead">Stored runs (${runs.length})</div>`;
    for (const r of runs) {
      const bits = [
        r.motors,
        r.apogee != null ? `apogee ${fmt(r.apogee, "alt")} ${uname("alt")}` : "no results",
        r.wind != null ? `wind ${fmt(r.wind, "wind")} ${uname("wind")}` : "",
        r.at
          ? new Date(r.at).toLocaleString([], {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "",
        r.outdated ? "out of date" : "",
      ].filter(Boolean);
      h += item("run:" + r.i, r.name, bits.join(" · "), false);
    }
  }
  list.innerHTML = h;
  list.scrollTop = 0;
  box.hidden = false;
  document.getElementById("runok").focus();
  return new Promise((res) => {
    const done = (v) => {
      box.hidden = true;
      document.getElementById("runok").onclick = document.getElementById("runcancel").onclick = box.onclick = null;
      document.removeEventListener("keydown", onKey);
      res(v);
    };
    /**
     * Escape cancels.
     */
    const onKey = (e) => {
      if (e.key === "Escape") done(null);
    };
    document.addEventListener("keydown", onKey);
    document.getElementById("runcancel").onclick = () => done(null);
    box.onclick = (e) => {
      if (e.target === box) done(null);
    };
    document.getElementById("runok").onclick = () => {
      const v = (list.querySelector("input[name=runsel]:checked") || {}).value || "design";
      if (v.startsWith("run:")) {
        const r = runs.find((x) => x.i === +v.slice(4));
        done({ kind: "run", i: r.i, cfg: r.cfg, name: r.name });
      } else done({ kind: v });
    };
  });
}
/**
 * Opens a design file you chose (file picker, recent files, examples): first asks how to open it when it has stored runs
 * or saved settings, then loads it.
 * @param {string} xml
 * @param {string} name
 * @param {ArrayBuffer|null} buf
 * @param {object} [opts] more options for loadDesignXml
 * @returns {Promise<boolean>} true if opened
 */
async function openDesignAsk(xml, name, buf, opts = {}) {
  const rkt = /<RockSimDocument/i.test(xml.slice(0, 4000)),
    saved = !rkt && buf ? await prStateRead(buf, null) : null,
    runs = designRuns(xml, saved);
  // (tests open files as they come, without asking)
  if (window.PR_NO_ASK) return loadDesignXml(xml, name, buf, opts);
  let pick = { kind: "design" };
  if (runs.length || (saved && saved.launch)) {
    pick = await askOpenRun(name, runs, !!(saved && saved.launch));
    if (!pick) return false;
  }
  return loadDesignXml(xml, name, buf, { ...opts, pick });
}
/**
 * Opens a design from .ork or .rkt text: reads it, picks the motors, sets the design, conditions and builder
 * parts, and reports what was opened.
 * @param {string} xml
 * @param {string} fileName
 * @param {ArrayBuffer} [buf] the file as opened (kept for saving changes back into it)
 * @param {{cfg:string}} [opts] cfg: a motor configuration chosen on the Motor tab, when reopening for it
 *
 * open a design from .ork / .rkt text: from a file, or from the rocket builder
 */
async function loadDesignXml(xml, fileName, buf, opts = {}) {
  const rep = document.getElementById("orkreport");
  ORK_CFG = opts.cfg || null; // a motor configuration chosen on the Motor tab, when reopening for it
  // a stored run chosen when opening (openDesignAsk): its configuration, conditions and results
  const pk = opts.pick || null;
  ORK_SIM = pk && pk.kind === "run" ? pk.i : null;
  if (pk && pk.kind === "run" && pk.cfg) ORK_CFG = pk.cfg;
  const Lnow = jclone(L);
  try {
    // what the app saved in the file besides the design (prStateNow), read first: its motor configuration and uploaded
    // motors decide which motors the design flies
    const saved =
      opts.cfg == null && buf && !/<RockSimDocument/i.test(xml.slice(0, 4000)) ? await prStateRead(buf, null) : null;
    const savedNotes = [];
    if (saved) {
      const added = [];
      for (const m of Array.isArray(saved.motors) ? saved.motors : [])
        if (m && m.id && Array.isArray(m.t) && Array.isArray(m.F) && !findMotor(m.id) && !dupMotor(m, allMotors())) {
          USER_MOTORS.push(m);
          added.push(m.cn || m.name);
        }
      if (added.length) {
        store.set("rfs-motors", USER_MOTORS);
        savedNotes.push(
          `Added ${added.join(", ")} from the file to your uploaded motors (the design flies ${added.length > 1 ? "them" : "it"}).`,
        );
      }
      if (typeof saved.cfg === "string" && saved.cfg && !(pk && pk.kind === "run")) ORK_CFG = saved.cfg;
    }
    const r = /<RockSimDocument/i.test(xml.slice(0, 4000)) ? parseRkt(xml) : parseOrk(xml);
    D = r.design;
    // the file's own launch settings, offered once it's open (the ones you have now are kept meanwhile)
    // the chosen run's conditions, as read (r.launch becomes L below)
    const runL = jclone(r.launch);
    const keptWx = !!(L && L.wxSet);
    {
      const keep = {};
      [...RANGE_KEYS, "elev", "lat", "lon", ...(keptWx ? WX_KEYS : [])].forEach((k) => {
        if (L && L[k] !== undefined) keep[k] = jclone(L[k]);
      });
      L = Object.assign(r.launch, keep);
    }
    let keptSite = siteKeep(); // your range settings stay when you open another rocket
    let savedCalUse = false;
    if (pk && pk.kind === "design") L = Object.assign(defaultLaunch(), Lnow);
    else if (pk && (pk.kind === "saved" || pk.kind === "run")) {
      // the settings saved with the file, or the chosen run's: this app's runs keep all of them, others their
      // OpenRocket or RockSim conditions (over the settings you have)
      const sr = pk.kind === "run" && saved && saved.runs && saved.runs[pk.name];
      const src = pk.kind === "saved" ? saved : sr && sr.launch ? sr : null;
      if (src && src.launch) {
        L = Object.assign(defaultLaunch(), jclone(src.launch));
        if (typeof src.when === "string" && src.when) document.getElementById("wxwhen").value = src.when;
      } else L = Object.assign(defaultLaunch(), Lnow, runL);
      savedCalUse = pk.kind === "saved";
      keptSite = null;
      siteCur = "";
      store.set("rfs-site", "");
    }
    const mm = matchMotor(r.motor);
    let mnote = "";
    /**
     * Matches a stage's extra motors to the motor list.
     */
    const addExtras = (list, key, label) => {
      const miss = [];
      D[key] = [];
      for (const e of list || []) {
        const x = matchMotor(e);
        if (x) D[key].push({ id: x.id, n: e.count || 1 });
        else miss.push(`${e.mfr} ${e.designation}`.trim());
      }
      return miss.length
        ? ` ${label} also uses ${miss.join(", ")}, which ${miss.length > 1 ? "aren’t" : "isn’t"} in your motor list.`
        : "";
    };
    if (mm) {
      motorId = mm.id;
      store.set("rfs-motor", motorId);
    }
    let xnote = addExtras(r.motorExtras, "extraMotors", D.twoStage ? "The sustainer" : "The rocket");
    if (mm) {
      const c = clusterOf(mm, D.extraMotors);
      mnote = `${D.twoStage ? "Sustainer motor" : "Motor"} set to ${c.cn || c.name}.` + xnote;
    } else if (r.motor && r.motor.designation) {
      const miss = [
        ...new Set(
          [r.motor, ...(r.motorExtras || [])]
            .filter((e) => e && e.designation && !matchMotor(e))
            .map((e) => `${e.mfr} ${e.designation}`.trim()),
        ),
      ];
      mnote = `The file uses ${miss.join(" and ")}, which ${miss.length > 1 ? "aren’t" : "isn’t"} in your motor list. Upload ${miss.length > 1 ? "their .eng files" : "its .eng file"} on the Motor tab.`;
      // the motor left over from before may not fit this rocket: choose one that does, close to the file's impulse class
      const alt = fitStandIn(D, false, r.motor);
      if (alt) {
        motorId = alt.id;
        store.set("rfs-motor", motorId);
        mnote += ` Until then the ${alt.cn || alt.name} (${Math.round(alt.dia * 1000)} mm, fits the motor mount) is selected.`;
      }
    } else if (opts.builder)
      mnote =
        "No motor was chosen in the builder: pick one on the Motor tab, which is filtered to the motor mount size.";
    if (D.twoStage) {
      const bm = matchMotor(r.boosterMotor);
      const bx = addExtras(r.boosterExtras, "bExtraMotors", "The booster");
      if (bm) {
        boostId = bm.id;
        store.set("rfs-bmotor", boostId);
        const c = clusterOf(bm, D.bExtraMotors);
        mnote += ` Booster motor set to ${c.cn || c.name}.` + bx;
      } else if (r.boosterMotor && r.boosterMotor.designation) {
        mnote += ` The booster uses ${r.boosterMotor.mfr} ${r.boosterMotor.designation}, which isn’t in your motor list. Upload its .eng file on the Motor tab.`;
        const alt = fitStandIn(D, true, r.boosterMotor);
        if (alt) {
          boostId = alt.id;
          store.set("rfs-bmotor", boostId);
          mnote += ` Until then the ${alt.cn || alt.name} (${Math.round(alt.dia * 1000)} mm, fits the booster’s motor mount) is selected.`;
        }
      }
    }
    if (isThree(D)) {
      const fm = matchMotor(r.firstMotor);
      const fx = addExtras(r.firstExtras, "s1ExtraMotors", "The first stage");
      if (fm) {
        firstId = fm.id;
        store.set("rfs-b1motor", firstId);
        const c = clusterOf(fm, D.s1ExtraMotors);
        mnote += ` First-stage motor set to ${c.cn || c.name}.` + fx;
      } else if (r.firstMotor && r.firstMotor.designation) {
        mnote += ` The first stage uses ${r.firstMotor.mfr} ${r.firstMotor.designation}, which isn’t in your motor list. Upload its .eng file on the Motor tab.`;
        const alt = fitStandIn(s1View(D), true, r.firstMotor, firstId);
        if (alt) {
          firstId = alt.id;
          store.set("rfs-b1motor", firstId);
          mnote += ` Until then the ${alt.cn || alt.name} (${Math.round(alt.dia * 1000)} mm, fits the first stage’s motor mount) is selected.`;
        }
      }
    }
    if (keptWx)
      mnote +=
        " Your weather (temperature, pressure, humidity, wind and winds aloft) was kept, not the conditions saved in the file.";
    if (keptSite)
      mnote += ` Your launch site, ${keptSite}, was kept (elevation, coordinates, rail and range), not the file’s own launch settings.`;
    const uniq = [...new Set(r.notes)];
    const summary = isThree(D)
      ? `Three-stage rocket. Sustainer: ${fmt(D.dryMass, "mass")} ${uname("mass")} without motor, ${fmt(D.length, "len", 1)} ${uname("len")} long. Booster: ${fmt(D.bDryMass, "mass")} ${uname("mass")}, ${fmt(D.bLength, "len", 1)} ${uname("len")}. First stage: ${fmt(D.s1.bDryMass, "mass")} ${uname("mass")}, ${fmt(D.s1.bLength, "len", 1)} ${uname("len")}. Booster ignition ${(D.midDelay || 0).toFixed(1)} s after first-stage burnout; sustainer ignition ${D.stageDelay.toFixed(1)} s after booster burnout.`
      : D.twoStage
        ? `Two-stage rocket. Sustainer: ${fmt(D.dryMass, "mass")} ${uname("mass")} without motor, CG ${fmt(D.cgEmpty, "len", 1)} ${uname("len")}, ${fmt(D.length, "len", 1)} ${uname("len")} long. Booster: ${fmt(D.bDryMass, "mass")} ${uname("mass")}, ${fmt(D.bLength, "len", 1)} ${uname("len")} long. Sustainer ignition ${D.stageDelay.toFixed(1)} s after booster burnout.`
        : `Weight without motor ${fmt(D.dryMass, "mass")} ${uname("mass")}, CG ${fmt(D.cgEmpty, "len", 1)} ${uname("len")}, length ${fmt(D.length, "len", 1)} ${uname("len")}.`;
    rep.innerHTML = `<div class="report"><b>${opts.builder ? "Built" : "Opened"} ${esc(D.name)}.</b> ${esc(summary)} ${esc(mnote)}
      ${uniq.length ? `<ul>${uniq.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}<div class="note" style="margin-top:6px">Weight, CG and turning inertia are computed from the file’s components and materials. If you have weighed and balanced the real rocket, select the stage in the design tree and enter your numbers there.</div></div>`;
    {
      const isR = /<RockSimDocument/i.test(xml.slice(0, 4000));
      let nm = (fileName || "").trim();
      if (!nm || /^\.[a-z]+$/i.test(nm) || !/\.(ork|rkt)$/i.test(nm))
        nm = ((D.name || "rocket").replace(/[\\/:*?"<>|]+/g, "-").trim() || "rocket") + (isR ? ".rkt" : ".ork");
      const prevNotes = opts.cfg != null && BLD && BLD.notes ? BLD.notes : null;
      if (isR) ORK_SIM = null; // RockSim files are read as one converted OpenRocket design with the chosen run
      BLD = bldFromOrk(isR ? r.orkXml : xml, { ...r, rkt: isR });
      ORK_SIM = null;
      // your design notes, kept per motor configuration
      const notes = prevNotes || (saved && saved.notes && typeof saved.notes === "object" ? saved.notes : null);
      if (notes) BLD.notes = jclone(notes);
      BLD.name = r.design.name || BLD.name;
      BLD.bp = { comps: {}, splits: {} };
      // Pocket Rocket's own files inside the .ork: from the opened file, or (reopening it for another motor configuration)
      // from the copy kept with the design
      const prevX = opts.cfg != null && !buf && SOURCE ? SOURCE.extras || [] : null;
      /**
       * Reads a file kept inside the .ork (ejection charges, fin edges) from the copy kept with the design.
       */
      const side = async (nm) => {
        try {
          if (buf) {
            const e = zipEntries(buf).find((e) => e.name === nm);
            return e ? new TextDecoder().decode(await zipData(buf, e)) : null;
          }
          const x = prevX && prevX.find((x) => x.name === nm);
          return x ? new TextDecoder().decode(b64ToU8(x.b64)) : null;
        } catch (e) {
          return null;
        }
      };
      if (!isR)
        try {
          const t = await side(FIN_ORK);
          if (t) {
            const fe = JSON.parse(t).finEdges || {};
            for (const st of BLD.stages)
              for (const pp of st.parts || [])
                for (const k of pp.kids || [])
                  if (k.type === "fins" && fe[k.id] && FIN_EDGES.some((x) => x[0] === fe[k.id])) k.edge = fe[k.id];
          }
        } catch (e) {}
      if (!isR)
        try {
          const t = await side(BP_ORK);
          if (t) {
            const j = JSON.parse(t);
            BLD.bp = { comps: j.comps || {}, splits: j.splits || {} };
          }
        } catch (e) {}
      if (isR) BLD.mountHint = [r.design.mountDia || null, r.design.bMountDia || null];
      // a RockSim stage with different motors: the main mount flies the one that fits it
      if (isR) {
        const pm = bldMounts(BLD.stages[0])[0];
        if (pm && pm.motor && pm.motor.id && pm.motor.id !== motorId && findMotor(pm.motor.id)) {
          motorId = pm.motor.id;
          store.set("rfs-motor", motorId);
        }
      }
      // the motors chosen when the file was saved (one that doesn't fit its mount isn't written into the design), as long
      // as the file hasn't been changed since by another program
      if (saved && saved.text && saved.text === prHash(xml)) {
        const ok = (id) => typeof id === "string" && !!findMotor(id);
        if (ok(saved.motorId)) store.set("rfs-motor", (motorId = saved.motorId));
        if (D.twoStage && ok(saved.boostId)) store.set("rfs-bmotor", (boostId = saved.boostId));
        if (isThree(D) && ok(saved.firstId)) store.set("rfs-b1motor", (firstId = saved.firstId));
      }
      // a motor the file names but your list doesn't have stays in the file until you choose another one
      BLD.hold = [
        r.motor && r.motor.designation && !mm ? motorId : null,
        D.twoStage && r.boosterMotor && r.boosterMotor.designation && !matchMotor(r.boosterMotor) ? boostId : null,
        isThree(D) && r.firstMotor && r.firstMotor.designation && !matchMotor(r.firstMotor) ? firstId : null,
      ];
      bldSel = BLD_ROOT;
      bldSave();
      try {
        bldDerive();
      } catch (e) {}
      setSource({
        name: nm,
        format: isR ? "rkt" : "ork",
        text: xml,
        src: r.src,
        extras: isR ? [] : prevX ? prevX : !buf ? [] : await zipOthers(buf),
        recentId: prevX && SOURCE ? SOURCE.recentId : undefined,
        base: { D: jclone(D), L: jclone(L), motorId, boostId, firstId, M: jclone(BLD) },
      });
      document.getElementById("savemsg").innerHTML = "";
    }
    // the flight log and drag calibration saved in the file
    if (saved)
      try {
        const fl = Array.isArray(saved.flights) ? saved.flights.filter((f) => f && f.id) : [];
        if (fl.length) {
          const cur = flList(),
            add = fl.filter((f) => !cur.some((x) => x.id === f.id));
          if (add.length && flPut([...cur, ...add])) {
            flNow = {};
            savedNotes.push(
              `Added ${add.length} logged flight${add.length > 1 ? "s" : ""} from the file to the flight log.`,
            );
          }
        }
        if (saved.cal && saved.cal.k > 0) {
          const c = calGet();
          if (!c || (savedCalUse && !launchSame(c.k, saved.cal.k))) calSet(saved.cal);
        }
      } catch (e) {}
    if (savedNotes.length)
      rep
        .querySelector(".report")
        ?.insertAdjacentHTML(
          "beforeend",
          `<div class="note" style="margin-top:6px">${esc(savedNotes.join(" "))}</div>`,
        );
    applyCal();
    if (D.dragScale !== 1)
      rep
        .querySelector(".report")
        ?.insertAdjacentHTML(
          "beforeend",
          `<div class="note" style="margin-top:6px">Drag is calibrated to your flight of this rocket (×${D.dragScale.toFixed(2)}). See Results to change it.</div>`,
        );
    motorTarget = "sustainer";
    mountFilter();
    renderMotors();
    setActive(true);
    renderForms();
    changed();
    markClean();
    bldRender();
    // the Android app overwrites the opened file on save; a built design has no file yet
    try {
      const A = window.PocketRocketApp;
      if (A) {
        if (opts.recent) {
          if (opts.recent.live && opts.recent.uri && A.useSource) A.useSource(opts.recent.uri);
          else if (A.clearSource) A.clearSource();
        } else if (opts.example) {
          if (A.clearSource) A.clearSource();
        } // an example has no file on the phone: Save changes asks where to save
        else if (!opts.builder && A.markSource) A.markSource();
        else if (opts.builder && A.clearSource) A.clearSource();
      }
    } catch (_) {}
    renderRecent();
    return true;
  } catch (err) {
    ORK_SIM = null;
    rep.innerHTML = `<div class="report err">${esc(err.message || String(err))}</div>`;
    return false;
  }
}
document.getElementById("engfile").addEventListener("change", async (e) => {
  const rep = document.getElementById("engreport");
  const added = [],
    bad = [],
    dup = [];
  // a .zip is opened and every .eng / .rse file inside it (in any folder) is read, as if each had been picked
  const files = [];
  for (const f of e.target.files) {
    const buf = await f.arrayBuffer(),
      u8 = new Uint8Array(buf);
    if (/\.zip$/i.test(f.name) || (u8[0] === 0x50 && u8[1] === 0x4b)) {
      try {
        const ents = (await unzipEntries(buf)).filter(
          (x) => !/(^|\/)(__MACOSX\/|\.)/.test(x.name) && /\.(eng|rse)$/i.test(x.name),
        );
        if (!ents.length) bad.push(`${f.name} (no .eng or .rse files inside)`);
        for (const x of ents)
          files.push({ name: x.name.split("/").pop(), text: async () => new TextDecoder().decode(await x.data()) });
      } catch (err) {
        bad.push(f.name);
      }
    } else files.push({ name: f.name, text: async () => new TextDecoder().decode(u8) });
  }
  for (const f of files) {
    try {
      const txt = await f.text();
      const ms = /\.rse$/i.test(f.name) || txt.trim().startsWith("<") ? parseRse(txt) : parseEng(txt);
      if (!ms.length) {
        bad.push(f.name);
        continue;
      }
      ms.forEach((m) => {
        classifyUser(m);
        if (!isFinite(m.totalMass) || !isFinite(m.propMass)) throw new Error("missing weights");
        if (dupMotor(m, allMotors())) {
          dup.push(m.name);
          return;
        }
        USER_MOTORS = USER_MOTORS.filter((x) => x.id !== m.id);
        USER_MOTORS.push(m);
        added.push(m.name);
      });
    } catch (err) {
      bad.push(f.name);
    }
  }
  store.set("rfs-motors", USER_MOTORS);
  if (added.length) {
    motorId = USER_MOTORS.find((m) => m.name === added[added.length - 1]).id;
    store.set("rfs-motor", motorId);
  }
  rep.innerHTML = `<div class="report${bad.length && !added.length ? " err" : ""}">${added.length ? `Added ${added.length > 8 ? `${added.length} motors (${added.slice(0, 6).map(esc).join(", ")} and ${added.length - 6} more)` : added.map(esc).join(", ")} to your user-uploaded motors${added.length === 1 ? " and selected it" : ""}.` : ""} ${dup.length ? `Skipped ${dup.length} duplicate${dup.length > 1 ? "s" : ""} (same name, impulse, diameter and maker as a motor already in the list): ${dup.length > 8 ? `${dup.slice(0, 6).map(esc).join(", ")} and ${dup.length - 6} more` : dup.map(esc).join(", ")}.` : ""} ${bad.length ? `Couldn’t read ${bad.map(esc).join(", ")}. Check that it is a RASP .eng or RockSim .rse file.` : ""}</div>`;
  renderMotors();
  if (added.length) markStale();
  e.target.value = "";
});
document.getElementById("resetbtn").onclick = () => {
  // reset goes back to the open file as it was opened (or last saved), or a new design to the basic rocket it started from
  if (!isDirty()) {
    prToast("No changes to reset.");
    return;
  }
  document.getElementById("resettxt").textContent =
    SOURCE && SOURCE.base
      ? `Reset ${(SOURCE.resetTo || SOURCE.base).D.name || "the design"} to how it was when you ${SOURCE.resetTo ? "last saved" : "opened"} ${SOURCE.name}? Your edits will be lost.`
      : "Start this new design over from the basic rocket? Your edits to it will be lost.";
  document.getElementById("openconfirm").hidden = true;
  document.getElementById("resetconfirm").hidden = false;
  document.getElementById("resetyes").focus();
};
document.getElementById("resetno").onclick = () => {
  document.getElementById("resetconfirm").hidden = true;
};
document.getElementById("resetyes").onclick = () => {
  document.getElementById("savemsg").innerHTML = "";
  if (SOURCE && SOURCE.base) {
    const B = SOURCE.resetTo || SOURCE.base;
    D = Object.assign(defaultDesign(), jclone(B.D));
    L = Object.assign(defaultLaunch(), jclone(B.L));
    siteKeep();
    motorId = B.motorId || motorId;
    if (B.boostId) boostId = B.boostId;
    if (B.firstId) firstId = B.firstId;
    if (B.M) BLD = jclone(B.M);
  } else {
    BLD = bldDefault();
  }
  store.set("rfs-motor", motorId);
  if (boostId) store.set("rfs-bmotor", boostId);
  bldSel = BLD_ROOT;
  bldSave();
  try {
    bldDerive();
  } catch (e) {}
  applyCal();
  document.getElementById("resetconfirm").hidden = true;
  renderForms();
  changed();
  markClean();
  bldRender();
  if (typeof renderMotors === "function") renderMotors();
};
