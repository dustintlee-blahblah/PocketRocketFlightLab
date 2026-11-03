/* --- patch the original file with the edits --- */
function buildPatchedFile() {
  const S = SOURCE,
    ork = S.format === "ork",
    diff = saveDiff(),
    bD = S.base.D,
    bL = S.base.L,
    src = S.src || {};
  if (diff.stageSwitch)
    throw new Error(
      "The design was switched between one and two stages, which can’t be written into the original file. Use “Save as new .ork” instead.",
    );
  const doc = new DOMParser().parseFromString(S.text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The original file could no longer be read.");
  const lists = srcLists(doc, S.format),
    ch = new Set(diff.saved),
    notes = [];
  const chg = (...ks) => ks.some((k) => ch.has(k));
  const mm = (v) => v * 1000;
  /* name */
  if (chg("name")) ork ? setKid(lists.rocket, "name", D.name) : setKid(lists.rocket, "Name", D.name);
  /* nose */
  const noseEl = src.nose != null ? lists.nosecone[src.nose] : null;
  if (chg("noseLen", "noseShape")) {
    if (!noseEl) notes.push("The file has no nose cone, so the nose changes weren’t saved.");
    else {
      const [shape, p] = String(D.noseShape).split(":"),
        par = parseFloat(p) || 0;
      if (ork) {
        setKid(noseEl, "length", D.noseLen);
        setKid(noseEl, "shape", shape);
        setKid(noseEl, "shapeparameter", par);
      } else {
        setKid(noseEl, "Len", mm(D.noseLen));
        setKid(
          noseEl,
          "ShapeCode",
          { conical: 0, ogive: 1, ellipsoid: 3, power: 4, parabolic: 5, haack: 6 }[shape] ?? 1,
        );
        setKid(noseEl, "ShapeParameter", par);
      }
    }
  }
  /* body diameter */
  if (chg("diameter")) {
    const r0 = bD.diameter / 2,
      r1 = D.diameter / 2;
    let n = 0;
    const near = (v) => Math.abs(v - r0) < 2e-4;
    for (const b of (src.body || []).filter((b) => (D.twoStage ? b.si === 0 : true))) {
      const el = lists[b.tag][b.oi];
      if (!el) continue;
      if (ork) {
        for (const t of b.tag === "bodytube"
          ? ["radius"]
          : b.tag === "nosecone"
            ? ["aftradius"]
            : ["foreradius", "aftradius"]) {
          const s = txtOf(el, t);
          if (s == null || /auto/i.test(s)) continue;
          if (near(parseFloat(s))) {
            setKid(el, t, r1);
            n++;
          }
        }
      } else {
        const pairs =
          b.tag === "bodytube" ? [["OD"]] : b.tag === "nosecone" ? [["BaseDia"]] : [["FrontDia"], ["RearDia"]];
        for (const [t] of pairs) {
          const v = parseFloat(txtOf(el, t));
          if (isFinite(v) && near(v / 2000)) {
            setKid(el, t, 2000 * r1);
            if (t === "OD") {
              const id = parseFloat(txtOf(el, "ID"));
              if (isFinite(id)) setKid(el, "ID", id + 2000 * (r1 - r0));
            }
            n++;
          }
        }
      }
    }
    if (!n) notes.push("No body section with the old diameter was found, so the diameter change wasn’t saved.");
  }
  /* boat tail */
  if (chg("tailLen", "tailDia")) {
    const tl = (src.body || []).filter((b) => b.si === 0 || !D.twoStage);
    const last = tl.sort((a, b) => a.x - b.x)[tl.length - 1];
    if (last && last.tag === "transition" && D.tailLen > 0) {
      const el = lists.transition[last.oi];
      if (ork) {
        setKid(el, "length", D.tailLen);
        setKid(el, "aftradius", D.tailDia / 2);
      } else {
        setKid(el, "Len", mm(D.tailLen));
        setKid(el, "RearDia", mm(D.tailDia));
      }
    } else {
      notes.push("The file has no boat tail at the end of the body to edit, so the boat-tail changes weren’t saved.");
      diff.saved = diff.saved.filter((k) => k !== "tailLen" && k !== "tailDia");
      diff.skipped.push("tailLen");
    }
  }
  /* fins */
  const finSet = (el, g, geom) => {
    if (ork) {
      if (geom && el.tagName !== "trapezoidfinset")
        el = renameEl(el, "trapezoidfinset", ["finpoints", "rootchord", "tipchord", "height", "sweeplength"]);
      if (geom) {
        setKid(el, "rootchord", g.root);
        setKid(el, "tipchord", g.tip);
        setKid(el, "height", g.span);
        setKid(el, "sweeplength", g.sweep);
      }
      if (g.t != null) setKid(el, "thickness", g.t);
      if (g.edge) setKid(el, "crosssection", g.edge);
      if (g.n != null) {
        setKid(el, "fincount", g.n);
        if (kidOf(el, "instancecount")) setKid(el, "instancecount", g.n);
      }
    } else {
      if (geom && el.tagName === "CustomFinSet") el = renameEl(el, "FinSet", ["PointList"]);
      if (geom) {
        setKid(el, "ShapeCode", 0);
        setKid(el, "RootChord", mm(g.root));
        setKid(el, "TipChord", mm(g.tip));
        setKid(el, "SemiSpan", mm(g.span));
        setKid(el, "SweepDistance", mm(g.sweep));
        if (kidOf(el, "SweepMode")) setKid(el, "SweepMode", 0);
      }
      if (g.t != null) setKid(el, "Thickness", mm(g.t));
      if (g.edge) setKid(el, "TipShapeCode", { square: 0, rounded: 1, airfoil: 2 }[stdEdge(g.edge)] ?? 0);
      if (g.n != null) setKid(el, "FinCount", g.n);
    }
    return el;
  };
  const countOf = (el) => parseFloat(ork ? txtOf(el, "fincount") : txtOf(el, "FinCount")) || 0;
  // a group is one fin set in the app, made of one or more fin-set parts in the file
  const groups = [];
  const mkGroup = (ois, cur, old, stage, kind) => {
    const els = (ois || []).map((i) => lists.fin[i]).filter(Boolean);
    if (!els.length) return null;
    const geom = ["root", "tip", "span", "sweep"].some((k) => Math.abs(cur[k] - old[k]) > 1e-7);
    const t = Math.abs(cur.t - old.t) > 1e-7 ? cur.t : null,
      edge = cur.edge !== old.edge ? cur.edge : null;
    let n = null;
    if (cur.n !== old.n) {
      const rest = els.slice(1).reduce((a, e) => a + countOf(e), 0);
      if (cur.n - rest >= 1) n = cur.n - rest;
      else {
        els.slice(1).forEach((e) => e.remove());
        els.length = 1;
        n = cur.n;
      }
    }
    if (geom || t != null || edge || n != null) {
      els[0] = finSet(els[0], { ...cur, t, edge, n }, geom);
      for (let i = 1; i < els.length; i++) els[i] = finSet(els[i], { ...cur, t, edge, n: null }, geom);
    }
    const g = { els, stage, kind, cur };
    groups.push(g);
    return g;
  };
  const mainOf = (b) =>
    b
      ? {
          n: D.bFinCount,
          root: D.bFinRoot,
          tip: D.bFinTip,
          span: D.bFinSpan,
          sweep: D.bFinSweep,
          t: D.bFinThick,
          edge: D.bFinEdge,
        }
      : {
          n: D.finCount,
          root: D.finRoot,
          tip: D.finTip,
          span: D.finSpan,
          sweep: D.finSweep,
          t: D.finThick,
          edge: D.finEdge,
        };
  const oldMain = (b) =>
    b
      ? {
          n: bD.bFinCount,
          root: bD.bFinRoot,
          tip: bD.bFinTip,
          span: bD.bFinSpan,
          sweep: bD.bFinSweep,
          t: bD.bFinThick,
          edge: bD.bFinEdge,
        }
      : {
          n: bD.finCount,
          root: bD.finRoot,
          tip: bD.finTip,
          span: bD.finSpan,
          sweep: bD.finSweep,
          t: bD.finThick,
          edge: bD.finEdge,
        };
  for (const b of D.twoStage ? [false, true] : [false]) {
    const mg = mkGroup(b ? src.bfMain : src.fMain, mainOf(b), oldMain(b), b ? 1 : 0, "main");
    const key = b ? "bExtraFins" : "extraFins",
      cur = D[key] || [],
      old = bD[key] || [];
    // removed sets
    const keep = new Set(cur.filter((f) => f.oi).map((f) => JSON.stringify(f.oi)));
    for (const f of old)
      if (f.oi && !keep.has(JSON.stringify(f.oi)))
        f.oi
          .map((i) => lists.fin[i])
          .filter(Boolean)
          .forEach((e) => e.remove());
    for (const f of cur) {
      if (f.oi) {
        const o = old.find((x) => JSON.stringify(x.oi) === JSON.stringify(f.oi));
        if (o) mkGroup(f.oi, f, o, b ? 1 : 0, "extra");
        continue;
      }
      // a new set: copy the main set's part (material and finish) and give it the new shape
      if (!mg) {
        notes.push("A new fin set couldn’t be added because the file’s main fin set wasn’t found.");
        continue;
      }
      let cl = mg.els[0].cloneNode(true);
      for (const t of [
        "id",
        "overridemass",
        "overridecg",
        "overridecd",
        "overridesubcomponentsmass",
        "overridesubcomponentscg",
        "overridesubcomponentscd",
        "KnownMass",
        "KnownCG",
        "UseKnownCG",
        "CalcMass",
        "CalcCG",
        "FinTabs",
      ])
        delKid(cl, t);
      mg.els[0].parentNode.insertBefore(cl, mg.els[0].nextSibling);
      cl = finSet(cl, { ...f }, true);
      setKid(cl, ork ? "name" : "Name", `Fin set ${cur.indexOf(f) + 2}`);
      groups.push({ els: [cl], stage: b ? 1 : 0, kind: "extra", cur: f, isNew: true });
    }
  }
  /* mass and balance: written as a stage weight and CG override, which replace the parts' own weights */
  const massSet = (stageIdx, m, cg) => {
    if (ork) {
      const st = lists.stage[stageIdx];
      if (!st) return false;
      setKid(st, "overridemass", m);
      setKid(st, "overridesubcomponentsmass", "true");
      setKid(st, "overridecg", cg);
      setKid(st, "overridesubcomponentscg", "true");
      if (kidOf(st, "overridesubcomponents")) setKid(st, "overridesubcomponents", "true");
      delKid(lists.rocket, "overridemass");
      delKid(lists.rocket, "overridecg");
      return true;
    }
    setKid(lists.rocket, "Stage3Mass", m * 1000);
    setKid(lists.rocket, "Stage3CG", cg * 1000);
    return true;
  };
  if (chg("dryMass", "cgEmpty")) {
    if (ork && (src.stages || 1) > 2 && !D.twoStage)
      notes.push("The file has more than two stages, so the weight and CG weren’t saved.");
    else massSet(0, D.dryMass, D.cgEmpty);
  }
  if (D.twoStage && chg("bDryMass", "bCg")) massSet(1, D.bDryMass, D.bCg);
  /* recovery */
  const chuteEl = (oi) => (oi != null ? lists.chute[oi] : null);
  const setChute = (el, dia, cd, streamer, label) => {
    if (!el) {
      notes.push(`The file has no ${label} to update.`);
      return;
    }
    if (streamer) {
      notes.push(`The ${label} is a streamer in the file, so its size wasn’t changed.`);
      return;
    }
    if (ork) {
      setKid(el, "diameter", dia);
      setKid(el, "cd", cd);
    } else {
      setKid(el, "Dia", mm(dia));
      setKid(el, "DragCoefficient", cd);
    }
  };
  const cfgDeploy = (el, k, v) => {
    setKid(el, k, v);
    for (const dc of [...el.children].filter(
      (e) => e.tagName === "deploymentconfiguration" && (!src.cfg || e.getAttribute("configid") === src.cfg),
    ))
      setKid(dc, k, v);
  };
  if (chg("mainDia", "mainCd"))
    setChute(
      chuteEl(src.main),
      D.mainDia,
      D.mainCd,
      src.mstreamer,
      D.recovery === "single" ? "parachute" : "main parachute",
    );
  if (chg("drogueDia", "drogueCd") && D.recovery === "dual")
    setChute(chuteEl(src.drogue), D.drogueDia, D.drogueCd, src.dstreamer, "drogue");
  if (ork && chg("mainAlt") && D.recovery === "dual" && chuteEl(src.main))
    cfgDeploy(chuteEl(src.main), "deployaltitude", D.mainAlt);
  if (D.twoStage && chg("bChuteDia", "bChuteCd"))
    setChute(chuteEl(src.bchute), D.bChuteDia, D.bChuteCd, src.bstreamer, "booster parachute");
  let motorDelay = null;
  if (chg("deployMode", "deployDelay", "ejChuteDelay")) {
    const dm = D.deployMode || "apogee",
      dl = Math.max(0, D.deployDelay || 0);
    if (ork) {
      const el = chuteEl(src.first);
      if (!el) notes.push("No chute that opens at apogee was found, so the deployment timing wasn’t saved.");
      else if (dm === "motor") {
        cfgDeploy(el, "deployevent", "ejection");
        cfgDeploy(el, "deploydelay", Math.max(0, D.ejChuteDelay || 0));
      } else if (dm === "timer") {
        cfgDeploy(el, "deployevent", "launch");
        cfgDeploy(el, "deploydelay", dl);
      } else {
        cfgDeploy(el, "deployevent", "apogee");
        cfgDeploy(el, "deploydelay", dl);
      }
    }
  }
  // the motor's ejection delay (Motor tab, Motor Delay): "none" in OpenRocket for a plugged motor
  if (chg("ejDelay", "motor")) motorDelay = D.ejDelay != null ? D.ejDelay : ork ? "none" : -1;
  /* motors */
  const sim = lists.sims[src.sim >= 0 ? src.sim : 0] || null;
  const rktSet = (stage) => {
    if (!sim) return null;
    const g = sim.getElementsByTagName(stage === 1 ? "Stage2Engines" : "Stage3Engines")[0];
    return (g || (stage === 0 ? sim : null))?.getElementsByTagName("EngineSet")[0] || null;
  };
  const writeMotor = (stage, m, count) => {
    if (ork) {
      let el = lists.motor[stage === 1 ? src.bmotor : src.motor];
      if (!el) {
        const it = lists.innertube[stage === 1 ? src.bmount : src.mount],
          mmt = it && kidOf(it, "motormount");
        if (!mmt || !src.cfg) {
          notes.push(
            `The file has no ${stage ? "booster " : ""}motor mount set up for a motor, so the ${stage ? "booster " : ""}motor wasn’t saved.`,
          );
          return null;
        }
        if (!m) return null;
        el = doc.createElementNS(mmt.namespaceURI, "motor");
        el.setAttribute("configid", src.cfg);
        mmt.appendChild(el);
      }
      if (m) {
        setKid(el, "manufacturer", m.mfr || m.brand || "");
        setKid(el, "designation", m.name);
        setKid(el, "diameter", m.dia);
        setKid(el, "length", m.len);
        delKid(el, "digest");
        if (!kidOf(el, "delay")) setKid(el, "delay", "none");
      }
      return el;
    }
    const es = rktSet(stage);
    if (!es) {
      notes.push(
        `The RockSim file has no ${stage ? "booster " : ""}motor in its simulation, so the ${stage ? "booster " : ""}motor wasn’t saved.`,
      );
      return null;
    }
    if (m) {
      setKid(es, "EngineCode", m.name);
      setKid(es, "EngineMfg", m.mfr || m.brand || "");
    }
    if (count != null) setKid(es, "EngineCount", count);
    return es;
  };
  if (chg("motor")) writeMotor(0, curMotor());
  if (D.twoStage && chg("bmotor")) writeMotor(1, curBoost());
  if (!ork && chg("extraMotors")) writeMotor(0, null, 1 + (D.extraMotors || []).reduce((a, e) => a + (e.n || 1), 0));
  if (motorDelay != null) {
    const el = writeMotor(0, null);
    if (el) ork ? setKid(el, "delay", motorDelay) : setKid(el, "EjectionDelay", motorDelay);
  }
  if (chg("stageDelay") && D.twoStage) {
    if (ork) {
      const it = lists.innertube[src.mount],
        mmt = it && kidOf(it, "motormount");
      if (mmt) {
        const ic = [...mmt.children].find(
          (e) => e.tagName === "ignitionconfiguration" && e.getAttribute("configid") === src.cfg,
        );
        setKid(ic || mmt, "ignitiondelay", D.stageDelay);
      }
    } else {
      const es = rktSet(0);
      if (es) setKid(es, "IgnitionDelay", D.stageDelay);
    }
  }
  if (chg("motorOverhang", "bOverhang")) {
    for (const [b, k] of [
      [0, "motorOverhang"],
      [1, "bOverhang"],
    ]) {
      if (!chg(k)) continue;
      if (ork) {
        const it = lists.innertube[b ? src.bmount : src.mount];
        if (it) {
          const mmt = kidOf(it, "motormount");
          if (mmt && kidOf(mmt, "overhang")) setKid(mmt, "overhang", D[k]);
          else if (kidOf(it, "overhang")) setKid(it, "overhang", D[k]);
          else setKid(mmt || it, "overhang", D[k]);
        }
      } else {
        const mt = lists.innertube.concat(lists.bodytube).find((e) => txtOf(e, "IsMotorMount") === "1");
        if (mt) setKid(mt, "EngineOverhang", mm(D[k]));
      }
    }
  }
  /* finish */
  if (chg("finish")) {
    const nm = FINISH_NAME(D.finish);
    if (ork) {
      for (const e of lists.rocket.getElementsByTagName("finish")) e.textContent = nm;
    } else {
      const code = { polished: 0, smooth: 1, optimum: 1, normal: 2, unfinished: 3, rough: 3 }[nm] ?? 2;
      for (const e of lists.rocket.getElementsByTagName("FinishCode")) e.textContent = String(code);
    }
  }
  /* launch conditions */
  if (sim && chg("elev", "tempC", "wind", "windDir", "turb", "rail", "angle", "railMode", "railDir")) {
    if (ork) {
      const c = kidOf(sim, "conditions") || sim.appendChild(doc.createElementNS(sim.namespaceURI, "conditions"));
      const oldT = parseFloat(txtOf(c, "launchtemperature"));
      if (chg("rail")) setKid(c, "launchrodlength", L.rail);
      if (chg("angle")) setKid(c, "launchrodangle", L.angle);
      if (chg("wind")) setKid(c, "windaverage", L.wind);
      if (chg("elev")) setKid(c, "launchaltitude", L.elev);
      if (chg("lat")) setKid(c, "launchlatitude", L.lat ?? 40);
      if (chg("tempC")) {
        if (kidOf(c, "launchtemperature"))
          setKid(c, "launchtemperature", isFinite(oldT) && oldT <= 150 ? L.tempC : L.tempC + 273.15);
        // OpenRocket keeps a non-standard temperature as an "extended ISA" atmosphere: temperature and pressure at the pad
        delKid(c, "atmosphere");
        const at = doc.createElementNS(c.namespaceURI, "atmosphere");
        at.setAttribute("model", "extendedisa");
        c.insertBefore(at, kidOf(c, "timestep") || null);
        setKid(at, "basetemperature", L.tempC + 273.15);
        setKid(at, "basepressure", 101325 * Math.pow(Math.max(1 - 2.25577e-5 * L.elev, 0.01), 5.25588));
      }
      if (chg("windDir")) setKid(c, "winddirection", (L.windDir * Math.PI) / 180);
      if (chg("turb")) setKid(c, "windturbulence", L.turb);
      if (chg("wind", "windDir", "turb")) {
        const w = [...c.children].find((e) => e.tagName === "wind" && e.getAttribute("model") === "average");
        if (w) {
          setKid(w, "speed", L.wind);
          setKid(w, "direction", (L.windDir * Math.PI) / 180);
          setKid(w, "standarddeviation", L.wind * (L.turb || 0));
        }
        if (kidOf(c, "windmodeltype")) setKid(c, "windmodeltype", "Average");
      }
      if (chg("railMode", "railDir")) {
        setKid(c, "launchintowind", L.railMode !== "fixed" ? "true" : "false");
        if (L.railMode === "fixed") setKid(c, "launchroddirection", L.railDir);
      }
    } else {
      const oldT = parseFloat(txtOf(sim, "LaunchTemperature"));
      if (chg("rail")) setKid(sim, "LaunchGuideLen", mm(L.rail));
      if (chg("angle")) setKid(sim, "LaunchAngle", (L.angle * Math.PI) / 180);
      if (chg("wind")) setKid(sim, "LaunchWindSpeed", L.wind);
      if (chg("elev")) setKid(sim, "LaunchAltitude", L.elev);
      if (chg("tempC")) setKid(sim, "LaunchTemperature", isFinite(oldT) && oldT > 150 ? L.tempC + 273.15 : L.tempC);
      if (chg("turb")) {
        const P = [0, 0.05, 0.1, 0.15, 0.2, 0.3];
        let bi = 0;
        P.forEach((v, i) => {
          if (Math.abs(v - L.turb) < Math.abs(P[bi] - L.turb)) bi = i;
        });
        setKid(sim, "LaunchWindTurbulencePreset", bi);
      }
    }
  } else if (!sim && chg("elev", "tempC", "wind", "windDir", "turb", "rail", "angle", "railMode", "railDir"))
    notes.push("The file has no simulation, so the launch conditions weren’t saved.");
  if (ork && sim && diff.saved.length) sim.setAttribute("status", "outdated");
  if (ork && S.extrasDropped) {
    const dc = [...doc.getElementsByTagName("decal")];
    if (dc.length) {
      dc.forEach((e) => e.remove());
      notes.push(
        "The file’s decal images were too large to keep in this app, so the decals were removed from the saved copy.",
      );
    }
  }
  /* lengths and fin positions: re-read the file the way the importer does and nudge until they match */
  const ser = () => new XMLSerializer().serializeToString(doc);
  const reparse = () => {
    const x = ser();
    return ork ? parseOrk(x) : parseRkt(x);
  };
  // a length change goes to the longest tube without the motor mount, so the mount and the parts packed around it stay put
  const hasMount = (el) =>
    ork
      ? el.getElementsByTagName("motormount").length > 0
      : [el, ...el.getElementsByTagName("*")].some((e) => txtOf(e, "IsMotorMount") === "1");
  const lenTube = (si) => {
    const tubes = (src.body || []).filter(
      (b) => b.tag === "bodytube" && (D.twoStage ? b.si === si : true) && lists.bodytube[b.oi],
    );
    if (!tubes.length) return null;
    const free = tubes.filter((b) => !hasMount(lists.bodytube[b.oi])),
      pool = free.length ? free : tubes;
    return lists.bodytube[pool.reduce((a, b) => (b.len > a.len ? b : a)).oi];
  };
  const wantLen = chg("length", "noseLen"),
    wantBLen = D.twoStage && chg("bLength");
  const tS = lenTube(0),
    tB = D.twoStage ? lenTube(1) : null;
  if (wantLen && !tS) notes.push("The file has no body tube to lengthen, so the length change wasn’t saved.");
  const posKids = (el) => (ork ? kidOf(el, "axialoffset") || kidOf(el, "position") : kidOf(el, "Xb"));
  // OpenRocket files can carry the position twice (axialoffset, and the older position tag); move both
  const moveEl = (el, dx) => {
    if (ork) {
      let ps = [kidOf(el, "axialoffset"), kidOf(el, "position")].filter(Boolean);
      if (!ps.length) {
        const p = setKid(el, "axialoffset", 0);
        p.setAttribute("method", "top");
        ps = [p];
      }
      for (const p of ps) p.textContent = numStr((parseFloat(p.textContent) || 0) + dx);
    } else {
      const mode = parseFloat(txtOf(el, "LocationMode")) || 0,
        p = kidOf(el, "Xb") || setKid(el, "Xb", 0);
      p.textContent = numStr((parseFloat(p.textContent) || 0) + (mode === 2 ? -1 : 1) * dx * 1000);
    }
  };
  // a new fin set goes on the body tube under its leading edge
  if (groups.some((g) => g.isNew)) {
    const r0 = reparse(),
      nl = srcLists(doc, S.format),
      x0 = r0.src.sX0 || [0, 0];
    for (const g of groups.filter((g) => g.isNew)) {
      const want = (x0[g.stage] || 0) + g.cur.pos;
      const tube = (r0.src.body || [])
        .filter((b) => b.tag === "bodytube" && (!D.twoStage || b.si === g.stage))
        .find((b) => want >= b.x - 1e-6 && want < b.x + b.len);
      const el = tube && nl.bodytube[tube.oi];
      if (!el) continue;
      const box =
        kidOf(el, ork ? "subcomponents" : "AttachedParts") ||
        el.appendChild(doc.createElementNS(el.namespaceURI, ork ? "subcomponents" : "AttachedParts"));
      if (g.els[0].parentNode !== box) box.appendChild(g.els[0]);
    }
  }
  let r = null;
  for (let it = 0; it < 6; it++) {
    r = reparse();
    let moved = false;
    const rd = r.design;
    const adjLen = (el, want, have) => {
      const d = want - have;
      if (!el || Math.abs(d) < 2e-5) return;
      const k = ork ? "length" : "Len",
        cur = parseFloat(txtOf(el, k)) || 0,
        nv = Math.max(cur + (ork ? d : d * 1000), ork ? 1e-3 : 1);
      setKid(el, k, nv);
      moved = true;
    };
    if (wantLen) adjLen(tS, D.length, rd.length);
    if (wantBLen) adjLen(tB, D.bLength, rd.bLength);
    if (moved) continue;
    const nl = srcLists(doc, S.format),
      x0 = r.src.sX0 || [0, 0];
    for (const g of groups) {
      const el = g.els[0];
      if (!el.isConnected) continue;
      const oi = nl.fin.indexOf(el);
      const f = (r.src.fins || []).find((q) => q.oi === oi);
      if (!f) continue;
      const sx = x0[g.stage] || 0,
        sl = g.stage ? rd.bLength : rd.length;
      const target = g.kind === "main" ? sx + sl - (g.stage ? D.bFinAft : D.finAft) - g.cur.root : sx + g.cur.pos;
      const dx = target - f.x;
      if (Math.abs(dx) > 2e-5) {
        g.els.forEach((e) => moveEl(e, dx));
        moved = true;
      }
    }
    if (!moved) break;
  }
  r = reparse();
  /* check what the file now says against the app */
  const rd = r.design,
    miss = [];
  const cmp = (k, a, b, tol, dim) => {
    if (ch.has(k) && Math.abs(a - b) > tol)
      miss.push(`${SAVE_LABEL[k] || k}: ${fmt(a, dim)} in the file vs ${fmt(b, dim)} here`);
  };
  cmp("length", rd.length, D.length, 1e-3, "len");
  cmp("noseLen", rd.noseLen, D.noseLen, 1e-3, "len");
  cmp("diameter", rd.diameter, D.diameter, 5e-4, "small");
  for (const k of ["finRoot", "finTip", "finSpan", "finSweep", "finAft"]) cmp(k, rd[k], D[k], 1e-3, "len");
  if (ch.has("finCount") && rd.finCount !== D.finCount)
    miss.push(`Number of fins: ${rd.finCount} in the file vs ${D.finCount} here`);
  if (chg("dryMass", "cgEmpty")) {
    cmp("dryMass", rd.dryMass, D.dryMass, D.dryMass * 0.005 + 1e-4, "mass");
    cmp("cgEmpty", rd.cgEmpty, D.cgEmpty, 1e-3, "len");
  }
  if (ch.has("extraFins") && (rd.extraFins || []).length !== (D.extraFins || []).length)
    miss.push(`Extra fin sets: ${(rd.extraFins || []).length} in the file vs ${(D.extraFins || []).length} here`);
  if (chg("mainDia")) cmp("mainDia", rd.mainDia, D.mainDia, 1e-3, "len");
  if (D.twoStage) {
    cmp("bLength", rd.bLength, D.bLength, 1e-3, "len");
    if (chg("bDryMass")) cmp("bDryMass", rd.bDryMass, D.bDryMass, D.bDryMass * 0.005 + 1e-4, "mass");
  }
  if (ch.has("motor") && r.motor && r.motor.designation !== curMotor().name)
    miss.push("Motor: the file names " + r.motor.designation);
  if (miss.length) notes.push("Couldn’t match exactly — " + miss.join("; ") + ".");
  return { text: ser(), notes, diff };
}
