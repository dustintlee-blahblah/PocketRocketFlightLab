/**
 * OpenRocket .ork import: unpacking the file (zip or gzip) and reading its rocket into this app's design.
 *
 * parseOrk walks the component tree once, adding up mass and balance, collecting the body shape, fins, recovery,
 * launch lugs and motor mounts per stage, then builds the design (finalize) for one, two or three stages. The motor
 * configuration used is the one chosen on the Motor tab (ORK_CFG), else the one the file's simulation flew, else
 * the default.
 */
import { FIN_EDGES, finTeEdge } from "../core/units-and-fin-edges.js";
import { D, L } from "../design/defaults.js";
import { FINISH_RS, orkReading, orkReadStages } from "./ork-parts.js";
import { elKid, elSubs, elTxt } from "./ork-xml.js";
import { ORK_CFG, ORK_SIM } from "./save.js";
/**
 * Turns each reversed ("flipped") nose cone in an OpenRocket design into the transition it is: a tail cone from the
 * nose's base radius down to a point, its shoulder at the front.
 * @param {Document} doc the design, changed in place
 */
export function unflipNoses(doc) {
  for (const nc of [...doc.getElementsByTagName("nosecone")]) {
    const fl = [...nc.children].find((e) => e.tagName === "isflipped");
    if (!fl || fl.textContent.trim() !== "true") continue;
    const tr = doc.createElement("transition");
    for (const e of [...nc.children]) {
      const t = e.tagName;
      if (t === "isflipped") continue;
      const ne = doc.createElement(t === "aftradius" ? "foreradius" : t.replace(/^aftshoulder/, "foreshoulder"));
      for (const a of e.attributes) ne.setAttribute(a.name, a.value);
      while (e.firstChild) ne.appendChild(e.firstChild);
      tr.appendChild(ne);
      if (t === "thickness" && /filled/i.test(ne.textContent)) {
        const f = doc.createElement("filled");
        f.textContent = "true";
        tr.appendChild(f);
      }
    }
    const ar = doc.createElement("aftradius");
    ar.textContent = "0";
    tr.appendChild(ar);
    nc.replaceWith(tr);
  }
}
/**
 * Reads an OpenRocket design.
 * @param {string} xml the design XML
 * @param {{offIds:string[]}} [opts] offIds: the ids of stages switched off (the builder passes them, since its own
 *   file numbers only its stages)
 * @returns {{design:object, launch:object, notes:string[], motor:object, boosterMotor:object, firstMotor:object,
 *   motorExtras:object[], boosterExtras:object[], firstExtras:object[], src:object}} the design, launch site and
 *   conditions, notes on what was simplified, each stage's main motor (designation, maker, delay...) and extra
 *   motors, and where the parts are in the file (for saving changes back into it)
 * @throws {Error} if the file isn't a readable rocket design
 */
export function parseOrk(xml, opts = {}) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The design file could not be read as XML.");
  unflipNoses(doc);
  const rocket = doc.querySelector("openrocket > rocket") || doc.getElementsByTagName("rocket")[0];
  if (!rocket) throw new Error("No rocket was found in this file.");
  const notes = [];
  const simEls = [...doc.getElementsByTagName("simulation")];
  /**
   * The motor configuration id a simulation element flew.
   *
   * A motor configuration chosen on the Motor tab (ORK_CFG) wins; then the one the file's simulation used; then the default.
   */
  const simCfgOf = (sm) => {
    const c = sm && sm.getElementsByTagName("conditions")[0],
      e = c && c.getElementsByTagName("configid")[0];
    return e ? e.textContent.trim() : null;
  };
  const pick =
    ORK_CFG &&
    [...rocket.getElementsByTagName("motorconfiguration")].some((e) => e.getAttribute("configid") === ORK_CFG)
      ? ORK_CFG
      : null;
  const chosen = ORK_SIM != null ? simEls[ORK_SIM] || null : null;
  const refSim = chosen
    ? chosen
    : pick
      ? simEls.find(
          (s) => simCfgOf(s) === pick && s.getElementsByTagName("flightdata")[0]?.getAttribute("maxaltitude"),
        ) ||
        simEls.find((s) => simCfgOf(s) === pick) ||
        null
      : simEls.find((s) => s.getElementsByTagName("flightdata")[0]?.getAttribute("maxaltitude")) || simEls[0] || null;
  let cfg = chosen ? simCfgOf(chosen) || pick : pick;
  if (!cfg) cfg = simCfgOf(refSim);
  if (!cfg) {
    const mcs = [...rocket.getElementsByTagName("motorconfiguration")];
    const dc = mcs.find((e) => e.getAttribute("default") === "true") || mcs[0];
    cfg = dc ? dc.getAttribute("configid") : null;
  }
  /* stages switched off in this flight configuration (OpenRocket numbers its stages, side booster sets included, in the
     order they appear): they aren't on the rocket at all for this flight */
  const offStages = new Set();
  {
    const mc = [...rocket.getElementsByTagName("motorconfiguration")].find((e) => e.getAttribute("configid") === cfg);
    const allStages = [...rocket.getElementsByTagName("*")].filter(
      (e) => e.tagName === "stage" || e.tagName === "parallelstage",
    );
    if (mc)
      for (const st of mc.getElementsByTagName("stage"))
        if (st.getAttribute("active") === "false") {
          const el = allStages[+st.getAttribute("number")];
          if (el) offStages.add(el);
        }
    // the builder passes the ones the file had switched off by their ids (its own file numbers only its stages)
    for (const el of allStages) if ((opts.offIds || []).includes(elTxt(el, "id"))) offStages.add(el);
  }
  // every part of every stage, read once (ork-parts.js)
  const rd = orkReading(rocket, cfg, offStages, notes);
  orkReadStages(rd);
  const SRC = {};
  const {
    pods,
    sideBoosters,
    tubeFinSets,
    fins,
    chutes,
    buttons,
    lugs,
    bumps,
    segments,
    massPts,
    bodyEls,
    R,
    sMountAft,
    sKnown,
    sMass,
    sMom,
    sX0,
    sX1,
    sOverhang,
    sMotor,
    sMotors,
    sIgn,
    sSep,
    sMount,
    sMountD,
    stages,
    nose,
    maxR,
    cdCount,
    cdCovered,
    cdComp,
    cursor,
  } = rd;
  let { totalMass, moment, motor } = rd;
  // two stages with a motor each are flown as booster and sustainer; a stage with no motor (a payload section that
  // separates) rides along, so the rocket is flown as one
  // three stages with a motor each: first stage, booster (the middle one) and sustainer
  const threeStage = stages === 3 && !!sMotor[0] && !!sMotor[1] && !!sMotor[2];
  const twoStage = (stages === 2 && !!sMotor[0] && !!sMotor[1]) || threeStage;
  if (stages === 2 && !twoStage)
    notes.push(
      "Only one of the two stages has a motor (the other is a payload section), so the rocket is flown as one. Its separation isn’t simulated; it doesn’t change the climb to apogee.",
    );
  if (stages === 3 && !threeStage)
    notes.push("Not every one of the three stages has a motor, so all stages were combined and flown as one rocket.");
  if (stages > 3)
    notes.push(
      `This design has ${stages} stages. Pocket Rocket Flight Lab simulates up to three, so all stages were combined and flown as one rocket.`,
    );
  if (!twoStage) {
    const rom = elKid(rocket, "overridemass");
    if (rom) {
      totalMass = parseFloat(rom.textContent) || totalMass;
      notes.push("Used the rocket-level mass override.");
    }
    const rcg = elKid(rocket, "overridecg");
    if (rcg && parseFloat(rcg.textContent) > 0) {
      moment = parseFloat(rcg.textContent) * totalMass;
    }
  }
  /**
   * Builds one airframe from a set of stages (sustainer [0], booster [1], or all for a single stage).
   * @param {number[]} sel stage indexes
   * @param {string} label prefix for its notes
   * @returns {object} design fields for that airframe
   */
  function finalize(sel, label) {
    const pre = label ? label + ": " : "";
    const inS = (o) => sel.includes(o.si);
    const x0 = sX0[sel[0]] || 0,
      x1 = sX1[sel[sel.length - 1]] || cursor;
    const mass = sel.length === stages ? totalMass : sel.reduce((a, k) => a + (sMass[k] || 0), 0);
    const mom = sel.length === stages ? moment : sel.reduce((a, k) => a + (sMom[k] || 0), 0);
    // turning inertia about the parts' own CG: each part as a uniform rod of its length, scaled to any weight override
    // a weight override adds (or removes) mass the parts list doesn't show; extra mass is placed where it must sit
    // for the parts plus that mass to balance at the file's CG
    const pts = massPts.filter(inS),
      pm = pts.reduce((a, p) => a + p.m, 0),
      pmx = pts.reduce((a, p) => a + p.m * p.x, 0);
    let inertia = 0;
    if (pm > 0 && mass > 0) {
      const cgF = mom / mass,
        extra = mass - pm;
      inertia = pts.reduce((a, p) => a + p.m * ((p.len * p.len) / 12 + (p.x - cgF) ** 2), 0);
      if (extra > 1e-6) {
        const xe = (mom - pmx) / extra;
        inertia += extra * (xe - cgF) ** 2;
      } else if (extra < -1e-6) inertia *= mass / pm;
    }
    // roll inertia about the axis, scaled to any weight override
    const rollI = pm > 0 ? pts.reduce((a, p) => a + p.m * (p.k2 || 0), 0) * (mass > 0 ? mass / pm : 1) : 0;
    const segs = segments
      .filter(inS)
      .map((s) => {
        const o = { ...s, x: s.x - x0 };
        delete o.si;
        return o;
      })
      .sort((a, b) => a.x - b.x);
    const fl = fins.filter(inS),
      tfl = tubeFinSets.filter(inS);
    if (!fl.length && !tfl.length)
      throw new Error(`${pre}No fin set was found, so stability and drag can’t be estimated.`);
    // tube fins only: the main (flat) fin set is empty
    if (!fl.length)
      fl.push({ n: 0, root: 0, tip: 0, span: 0, sweep: 0, t: 0, x: x1, edge: "square", si: sel[0], oi: -1, par: 0 });
    const groups = new Map();
    for (const fs of fl) {
      // (fins on different bodies, or on a pod, stay apart)
      const k =
        [fs.x, fs.root, fs.span].map((v) => Math.round(v * 500)).join("|") +
        "|" +
        (fs.pod ?? "") +
        "|" +
        (fs.par ?? "");
      const g = groups.get(k);
      if (g) {
        g.n += fs.n;
        g.oi.push(fs.oi);
      } else groups.set(k, { ...fs, oi: [fs.oi] });
    }
    const garea = (g) => ((g.n * (g.root + g.tip)) / 2) * g.span;
    // the main set is the aft-most one on the rocket's own body (its trailing edge is closest to the tail), unless every
    // set is on a pod; others become extra sets
    const onBody = [...groups.values()].filter((g) => g.pod == null);
    const f = (onBody.length ? onBody : [...groups.values()]).reduce((a, b) => {
      const ta = a.x + a.root,
        tb = b.x + b.root;
      return tb > ta + 1e-4 || (Math.abs(tb - ta) <= 1e-4 && garea(b) > garea(a)) ? b : a;
    });
    if (groups.size < fl.length && f.n > 1)
      notes.push(`${pre}Matching fin sets at the same position were combined into ${f.n} fins.`);
    const others = [...groups.values()].filter((g) => g !== f).sort((p, q) => p.x - q.x);
    if (others.length)
      notes.push(
        `${pre}${groups.size} fin sets were imported. The aft-most (${f.n} fins) is the main set; the other${others.length > 1 ? "s are" : " is"} listed under Fin set 2${others.length > 1 ? "–" + (others.length + 1) : ""}.`,
      );
    const EDGE0 = (e) => (FIN_EDGES.some((x) => x[0] === e) ? e : "square");
    const extra = others.map((g) => ({
      n: g.n,
      mat: g.mat,
      rho: g.rho,
      root: g.root,
      tip: g.tip,
      span: g.span,
      sweep: g.sweep,
      t: g.t,
      cant: g.cant || 0,
      pos: g.x - x0,
      edge: EDGE0(g.edge),
      edgeTE: finTeEdge(g.edgeTE),
      bevLE: g.bevLE || 0,
      bevTE: g.bevTE || 0,
      cdo: g.cdo || 0,
      oi: g.oi,
      par: g.par || 0,
      ...(g.pts ? { pts: g.pts } : {}),
      ...(g.pod != null ? { pod: g.pod, rb: g.rb, sb: g.sb } : {}),
    }));
    const length = x1 - x0;
    const diameter = 2 * (Math.max(0, ...segs.map((s) => Math.max(s.r1, s.r2))) || maxR || nose?.r || 0.05);
    const nz = segs.find((s) => s.kind === "nose");
    let tailLen = 0,
      tailDia = diameter,
      useSegs = false;
    {
      const Rb = diameter / 2,
        sg = segs,
        last = sg[sg.length - 1];
      const simple =
        sg.length > 0 &&
        sg[0].kind === "nose" &&
        Math.abs(sg[0].r2 - Rb) < 2e-4 &&
        sg
          .slice(1)
          .every(
            (s, i, arr) =>
              (s.kind === "tube" && Math.abs(s.r1 - Rb) < 2e-4) ||
              (i === arr.length - 1 && s.kind === "trans" && Math.abs(s.r1 - Rb) < 2e-4 && s.r2 < s.r1),
          );
      const plainTube = sg.length > 0 && !nz && sg.every((s) => s.kind === "tube" && Math.abs(s.r1 - Rb) < 2e-4);
      if (simple) {
        if (last.kind === "trans") {
          tailLen = last.len;
          tailDia = 2 * last.r2;
        }
      } else if (!plainTube && sg.length) {
        useSegs = true;
        notes.push(
          `${pre}The body has ${sg.length} sections with diameter changes; drag and stability use each section.`,
        );
      }
    }
    if (!useSegs && segs.some((s) => s.cdo > 0)) useSegs = true; // keep per-part Cd overrides with their parts
    const shift = (o) => {
      const r = { ...o, x: o.x - x0 };
      delete r.si;
      return r;
    };
    return {
      length,
      diameter,
      mass,
      cg: mass > 0 ? mom / mass - x0 : length / 2,
      segs: useSegs ? segs : null,
      // the body's wall, averaged over its sections by surface: for the skin's heating in flight
      wall: (() => {
        let w = 0,
          t = 0,
          r = 0;
        for (const sg of segs) {
          const a = sg.len * (sg.r1 + sg.r2);
          w += a;
          t += a * (sg.wt > 0 ? sg.wt : 0.002);
          r += a * (sg.wd > 0 ? sg.wd : 1300);
        }
        return w > 0 ? { t: t / w, rho: r / w } : null;
      })(),
      tailLen,
      tailDia,
      nose: nz ? { len: nz.len, shape: nz.shape + ":" + +(+nz.param).toFixed(4) } : null,
      f,
      extra,
      inertia,
      rollI,
      fAft: length - (f.x - x0 + f.root),
      /* negative when the fins reach past the aft end (V-2 style fins over a boattail) */ // a side booster's own chutes bring it down after it separates: not the rocket's
      chutes: chutes.filter((c) => inS(c) && c.sb == null),
      buttons: buttons.filter(inS).map(shift),
      lugs: lugs.filter(inS).map(shift),
      bumps: bumps.filter(inS).map(shift),
      pods: pods.filter(inS).map((pd) => ({ ...shift(pd), segs: pd.segs.map(shift) })),
      tubeFins: tfl.map(shift),
      sideBoosters: sideBoosters.filter(inS).map((b) => ({
        i: b.i,
        count: b.count,
        mass: b.mass,
        cg: b.mass > 0 ? b.mom / b.mass - x0 : 0,
        event: b.event,
        delay: b.delay,
      })),
    };
  }
  const all = [...Array(Math.max(stages, 1)).keys()];
  const S = finalize(twoStage ? [0] : all, twoStage ? "Sustainer" : "");
  const B = twoStage ? finalize([1], "Booster") : null;
  const C1 = threeStage ? finalize([2], "First stage") : null;
  if (twoStage) motor = sMotor[0] || null;
  if (!nose) notes.push("No nose cone was found; a 3:1 ogive was assumed.");
  if (cdCount)
    notes.push(
      `Used the file’s Cd override on ${cdCount} part${cdCount > 1 ? "s" : ""}; it replaces the calculated drag of ${cdCount > 1 ? "those parts" : "that part"}${cdCovered ? ", and of the parts on it where the override covers them" : ""}. On the last body part that includes the base drag behind it.`,
    );
  if (cdComp) notes.push("Cd overrides on inner parts were ignored, since inner parts have no drag of their own.");
  const ocd = [rocket, ...elSubs(rocket).filter((e) => e.tagName === "stage")]
    .map((e) => elKid(e, "overridecd"))
    .find(Boolean);
  if (ocd) notes.push("Used the file’s Cd override for the whole rocket.");
  const FIN = FINISH_RS;
  const finTag0 =
      (rocket.getElementsByTagName("bodytube")[0] || rocket).getElementsByTagName("finish")[0] ||
      rocket.getElementsByTagName("finish")[0],
    // the app's own finish name sits right after OpenRocket's on the same part
    finTag = finTag0 && finTag0.nextElementSibling?.tagName === "prflfinish" ? finTag0.nextElementSibling : finTag0;
  /**
   * An edge type from the file, or square if this app doesn't know it.
   */
  const EDGE = (e) => (FIN_EDGES.some((x) => x[0] === e) ? e : "square");
  const f = S.f;
  const nd = {
    ...D,
    name: elTxt(rocket, "name") || "Imported rocket",
    length: S.length,
    diameter: S.diameter,
    noseLen: S.nose ? S.nose.len : 3 * S.diameter,
    noseShape: S.nose ? S.nose.shape : "ogive:1",
    tailLen: S.tailLen,
    tailDia: S.tailDia,
    segments: S.segs,
    wall: S.wall,
    finCount: f.n,
    finMat: f.mat || "",
    finRho: f.rho || 0,
    finCant: f.cant || 0,
    rollInertia: S.rollI,
    finRoot: f.root,
    finTip: f.tip,
    finSpan: f.span,
    finSweep: f.sweep,
    finThick: f.t,
    finAft: S.fAft,
    finPts: f.pts || null,
    finPar: f.par || 0,
    finPod: f.pod ?? null,
    finRb: f.rb ?? null,
    finSb: f.sb ?? null,
    finEdge: EDGE(f.edge),
    finEdgeTE: finTeEdge(f.edgeTE),
    finBevLE: f.bevLE || 0,
    finBevTE: f.bevTE || 0,
    finCdOverride: f.cdo || 0,
    bFinCdOverride: 0,
    extraFins: S.extra,
    bExtraFins: [],
    pods: S.pods.length ? S.pods : null,
    tubeFins: S.tubeFins.length ? S.tubeFins : null,
    sideBoosters: S.sideBoosters.length ? S.sideBoosters : null,
    extraMotors: [],
    bExtraMotors: [],
    dryInertia: S.inertia,
    inertiaMass: S.mass,
    inertiaSource: S.inertia > 0 ? "file" : null,
    bDryInertia: 0,
    bInertiaMass: 0,
    bInertiaSource: null,
    dryMass: S.mass,
    cgEmpty: S.cg,
    transitions: [],
    motorOverhang: (twoStage ? sOverhang[0] : R.overhang) ?? 0,
    mountAft:
      sMountAft[0] != null && Math.abs(sMountAft[0] - (sX0[0] || 0) - S.length) > 0.002
        ? sMountAft[0] - (sX0[0] || 0)
        : null,
    finish: FIN[(finTag?.textContent || "normal").trim().toLowerCase()] ?? 60e-6,
    finFinish: f.rs ?? null,
    buttons: S.buttons,
    lugs: S.lugs,
    bumps: S.bumps,
    railPreset: buttons.length || lugs.length ? "custom" : "none",
    otherCd: 0,
    nozzleDia: motor?.nozzle || 0,
    twoStage,
    cdOverride: ocd ? parseFloat(ocd.textContent) || 0 : 0,
    refSource: "OpenRocket",
    mountSel: "file",
    bMountSel: "file",
    mountDia: (twoStage ? sMountD[0] : sMountD.find((v) => v > 0)) ?? null,
    bMountDia: twoStage ? (sMountD[1] ?? null) : null,
    orkApogee: null,
    orkMotor: motor ? (motor.mfr + " " + motor.designation).trim() : null,
  };
  if (twoStage) {
    const bf = B.f;
    Object.assign(nd, {
      bLength: B.length,
      bDiameter: B.diameter,
      bSegments: B.segs,
      bDryMass: B.mass,
      bCg: B.cg,
      bOverhang: sOverhang[1] ?? 0,
      bMountAft:
        sMountAft[1] != null && Math.abs(sMountAft[1] - sX0[1] - B.length) > 0.002 ? sMountAft[1] - sX0[1] : null,
      bFinCount: bf.n,
      bFinMat: bf.mat || "",
      bFinRho: bf.rho || 0,
      bFinCant: bf.cant || 0,
      bRollInertia: B.rollI,
      bFinRoot: bf.root,
      bFinTip: bf.tip,
      bFinSpan: bf.span,
      bFinSweep: bf.sweep,
      bFinPts: bf.pts || null,
      bFinPar: bf.par || 0,
      bFinPod: bf.pod ?? null,
      bFinRb: bf.rb ?? null,
      bFinSb: bf.sb ?? null,
      bPods: B.pods.length ? B.pods : null,
      bTubeFins: B.tubeFins.length ? B.tubeFins : null,
      bFinThick: bf.t,
      bFinAft: B.fAft,
      bFinEdge: EDGE(bf.edge),
      bFinEdgeTE: finTeEdge(bf.edgeTE),
      bFinBevLE: bf.bevLE || 0,
      bFinBevTE: bf.bevTE || 0,
      bFinFinish: bf.rs ?? null,
      bFinCdOverride: bf.cdo || 0,
      bExtraFins: B.extra,
      bDryInertia: B.inertia,
      bInertiaMass: B.mass,
      bInertiaSource: B.inertia > 0 ? "file" : null,
      bButtons: B.buttons,
      bLugs: B.lugs,
      bBumps: B.bumps,
    });
    const bc = B.chutes.reduce((a, b) => (!a || b.d > a.d ? b : a), null);
    if (bc) {
      SRC.bchute = bc.oi;
      SRC.bstreamer = !!bc.streamer;
      nd.bRecovery = "chute";
      nd.bChuteDia = bc.d;
      nd.bChuteCd = bc.cd;
      nd.bChuteEv = bc.ev;
      nd.bChuteAlt = bc.alt || 0;
      nd.bChuteDelay = Math.max(0, bc.dd || 0);
      if (bc.streamer) notes.push("Booster: the streamer was modeled as a parachute with the same drag area.");
    } else nd.bRecovery = "tumble";
    const ig = sIgn[0] || { event: "burnout", delay: 0 };
    nd.stageDelay = Math.max(0, ig.delay || 0);
    if (!["burnout", "automatic"].includes(ig.event))
      notes.push(
        `Sustainer ignition in the file is set to “${ig.event}”; it was modeled as booster burnout plus ${nd.stageDelay.toFixed(1)} s.`,
      );
    if (sSep[1] && !["burnout", "upperignition"].includes(sSep[1].event))
      notes.push(`Stage separation in the file is set to “${sSep[1].event}”; it was modeled at booster burnout.`);
  }
  {
    const sd = (x) => (!x ? 0 : x.event === "upperignition" ? 1e6 : Math.max(0, x.delay || 0));
    nd.sepDelay = twoStage ? sd(sSep[1]) : 0;
    nd.sep1Delay = threeStage ? sd(sSep[2]) : 0;
  }
  // whether the weight is the builder's own number (a stage or rocket weight override) rather than added up from the parts
  nd.massKnown =
    !!elKid(rocket, "overridemass") ||
    (stages > 0 && [...Array(stages).keys()].every((i) => sKnown[i] || !(sMass[i] > 0)));
  nd.threeStage = threeStage;
  nd.s1 = null;
  nd.midDelay = 0;
  if (threeStage) {
    // the first stage, in the booster's field names (every one set, so none is taken from the booster)
    const cf = C1.f,
      cc = C1.chutes.reduce((a, b) => (!a || b.d > a.d ? b : a), null);
    nd.s1 = {
      bLength: C1.length,
      bDiameter: C1.diameter,
      bSegments: C1.segs,
      bDryMass: C1.mass,
      bCg: C1.cg,
      bOverhang: sOverhang[2] ?? 0,
      bMountAft:
        sMountAft[2] != null && Math.abs(sMountAft[2] - sX0[2] - C1.length) > 0.002 ? sMountAft[2] - sX0[2] : null,
      bFinCount: cf.n,
      bFinMat: cf.mat || "",
      bFinRho: cf.rho || 0,
      bFinCant: cf.cant || 0,
      bRollInertia: C1.rollI,
      bFinRoot: cf.root,
      bFinTip: cf.tip,
      bFinSpan: cf.span,
      bFinSweep: cf.sweep,
      bFinPts: cf.pts || null,
      bFinPar: cf.par || 0,
      bFinPod: cf.pod ?? null,
      bFinRb: cf.rb ?? null,
      bFinSb: cf.sb ?? null,
      bPods: C1.pods.length ? C1.pods : null,
      bTubeFins: C1.tubeFins.length ? C1.tubeFins : null,
      bFinThick: cf.t,
      bFinAft: C1.fAft,
      bFinEdge: EDGE(cf.edge),
      bFinEdgeTE: finTeEdge(cf.edgeTE),
      bFinBevLE: cf.bevLE || 0,
      bFinBevTE: cf.bevTE || 0,
      bFinFinish: cf.rs ?? null,
      bFinCdOverride: cf.cdo || 0,
      bExtraFins: C1.extra,
      bDryInertia: C1.inertia,
      bInertiaMass: C1.mass,
      bInertiaSource: C1.inertia > 0 ? "file" : null,
      bButtons: C1.buttons,
      bLugs: C1.lugs,
      bBumps: C1.bumps,
      bRecovery: cc ? "chute" : "tumble",
      bChuteDia: cc ? cc.d : 0,
      bChuteCd: cc ? cc.cd : 0.8,
      bChuteEv: cc ? cc.ev : "apogee",
      bChuteAlt: cc ? cc.alt || 0 : 0,
      bChuteDelay: cc ? Math.max(0, cc.dd || 0) : 0,
      bMountDia: sMountD[2] ?? null,
      bEjDelay: sMotor[2] && sMotor[2].ej != null ? sMotor[2].ej : null,
    };
    if (cc) {
      SRC.b1chute = cc.oi;
      SRC.b1streamer = !!cc.streamer;
    }
    const ig = sIgn[1] || { event: "burnout", delay: 0 };
    nd.midDelay = Math.max(0, ig.delay || 0);
    if (!["burnout", "automatic"].includes(ig.event))
      notes.push(
        `Booster ignition in the file is set to “${ig.event}”; it was modeled as first-stage burnout plus ${nd.midDelay.toFixed(1)} s.`,
      );
    if (sSep[2] && !["burnout", "upperignition"].includes(sSep[2].event))
      notes.push(
        `First-stage separation in the file is set to “${sSep[2].event}”; it was modeled at first-stage burnout.`,
      );
  }
  const apo = S.chutes.filter((c) => c.ev !== "altitude"),
    alt = S.chutes.filter((c) => c.ev === "altitude");
  if (alt.length) {
    const mn = alt.reduce((a, b) => (b.d > a.d ? b : a));
    SRC.main = mn.oi;
    SRC.mstreamer = !!mn.streamer;
    nd.mainDia = mn.d;
    nd.mainCd = mn.cd;
    nd.mainAlt = mn.alt;
    nd.chuteRelease = !!mn.rel;
    nd.recovery = "dual";
    if (apo.length) {
      const dr = apo.reduce((a, b) => (b.d > a.d ? b : a));
      SRC.drogue = dr.oi;
      SRC.dstreamer = !!dr.streamer;
      nd.drogueDia = dr.d;
      nd.drogueCd = dr.cd;
    } else nd.drogueDia = 0;
  } else if (apo.length) {
    const mn = apo.reduce((a, b) => (b.d > a.d ? b : a));
    SRC.main = mn.oi;
    SRC.mstreamer = !!mn.streamer;
    nd.mainDia = mn.d;
    nd.mainCd = mn.cd;
    nd.recovery = "single";
  } else {
    nd.recovery = "single";
    nd.mainDia = 0;
    nd.drogueDia = 0;
    notes.push(
      "The file has no parachute or streamer, so none is used: the rocket comes down tumbling. Add a parachute in the design tree to fly it with one.",
    );
  }
  // every other chute or streamer on the sustainer (or the only stage), with its own opening event
  {
    const mc = S.chutes.find((c) => c.oi === SRC.main),
      ms = mc ? mc.si : null,
      other = S.chutes.filter((c) => c.oi !== SRC.main && c.oi !== SRC.drogue && ms != null && c.si !== ms).length;
    if (other)
      notes.push(
        `${other} recovery device${other > 1 ? "s are" : " is"} in a different stage that separates from this one, so ${other > 1 ? "they come" : "it comes"} down separately and ${other > 1 ? "don't" : "doesn't"} slow this flight.`,
      );
  }
  nd.extraChutes = S.chutes
    .filter(
      (c) =>
        c.oi !== SRC.main &&
        c.oi !== SRC.drogue &&
        !(S.chutes.find((m) => m.oi === SRC.main) && c.si !== S.chutes.find((m) => m.oi === SRC.main).si),
    )
    .map((c) => ({ d: c.d, cd: c.cd, ev: c.ev, alt: c.alt || 0, dd: Math.max(0, c.dd || 0), streamer: !!c.streamer }));
  if (nd.extraChutes.length)
    notes.push(
      `${nd.extraChutes.length} more recovery device${nd.extraChutes.length > 1 ? "s" : ""} besides the ${nd.recovery === "dual" ? "drogue and main" : "main chute"}: each opens on its own setting and adds its drag.`,
    );
  {
    // when the first chute opens
    const big = (a) => (a.length ? a.reduce((p, q) => (q.d > p.d ? q : p)) : null),
      first = big(apo);
    nd.deployMode = "apogee";
    nd.deployDelay = 0;
    nd.ejChuteDelay = 0;
    if (first) {
      SRC.first = first.oi;
      const dd = Math.max(0, first.dd || 0),
        mo = twoStage ? sMotor[0] : motor;
      if (first.ev === "ejection") {
        nd.deployMode = "motor";
        nd.deployDelay = mo && mo.ej != null ? mo.ej + dd : 0;
        nd.ejChuteDelay = dd;
        if (!(mo && mo.ej != null))
          notes.push(
            "The chute is set to open at the motor ejection charge, but the motor is plugged, so that chute never opens. Choose a delay under Motor Delay on the Motor tab, or set the chute to open at apogee.",
          );
      } else if (first.ev === "launch") {
        nd.deployMode = "timer";
        nd.deployDelay = dd;
      } else if (first.ev === "apogee") nd.deployDelay = dd;
      else if (first.ev !== "altitude")
        notes.push(`The chute is set to open on “${first.ev}”; it was modeled as opening at apogee.`);
    }
  }
  // the chute nearest the tail: it's the one the motor's ejection charge pushes out
  {
    const aft = S.chutes.reduce((a, b) => (!a || (b.x ?? 0) > (a.x ?? 0) ? b : a), null);
    nd.aftChute = !aft
      ? null
      : nd.recovery !== "dual"
        ? "main"
        : SRC.main === aft.oi
          ? "main"
          : SRC.drogue === aft.oi
            ? "drogue"
            : aft.ev === "altitude"
              ? "main"
              : "drogue";
  }
  // the motors' own ejection charges, fired this long after burnout (null: plugged, no charge)
  {
    const sm = twoStage ? sMotor[0] : motor;
    nd.ejDelay = sm && sm.ej != null ? sm.ej : null;
    nd.bEjDelay = twoStage && sMotor[1] && sMotor[1].ej != null ? sMotor[1].ej : null;
  }
  // simulations: reference apogee + launch conditions
  const sim =
    refSim &&
    refSim.getElementsByTagName("flightdata")[0]?.getAttribute("maxaltitude") &&
    refSim.getAttribute("status") !== "outdated" &&
    !/^\s*Pocket Rocket/.test(refSim.getElementsByTagName("name")[0]?.textContent || "")
      ? refSim
      : null;
  const newL = { ...L };
  const anySim = refSim;
  if (anySim) {
    const cnd = anySim.getElementsByTagName("conditions")[0];
    if (cnd) {
      const g = (t) => {
        const e = cnd.getElementsByTagName(t)[0];
        return e ? parseFloat(e.textContent) : null;
      };
      const rl = g("launchrodlength");
      if (rl) newL.rail = rl;
      let ang = g("launchrodangle");
      if (ang != null) {
        newL.angle = Math.abs(ang);
      }
      const wv = g("windaverage");
      if (wv != null) newL.wind = wv;
      const la = g("launchaltitude");
      if (la != null) newL.elev = la;
      const lat = g("launchlatitude");
      if (lat != null && Math.abs(lat) <= 90) newL.lat = lat;
      const lon = g("launchlongitude");
      if (lon != null && Math.abs(lon) <= 180) newL.lon = lon;
      const lt = g("launchtemperature");
      if (lt != null) newL.tempC = lt > 150 ? lt - 273.15 : lt;
      {
        const at = cnd.getElementsByTagName("atmosphere")[0];
        if (at && (at.getAttribute("model") || "").toLowerCase() === "extendedisa") {
          const bt = parseFloat(at.getElementsByTagName("basetemperature")[0]?.textContent);
          if (isFinite(bt)) newL.tempC = bt > 150 ? bt - 273.15 : bt;
          // a chosen run's own air pressure (Pa) and relative humidity (0 to 1) at the launch site
          const bp = parseFloat(at.getElementsByTagName("basepressure")[0]?.textContent),
            rh = parseFloat(at.getElementsByTagName("baserelativehumidity")[0]?.textContent);
          if (ORK_SIM != null && isFinite(bp) && bp > 1000) newL.pressure = bp;
          if (ORK_SIM != null && isFinite(rh) && rh >= 0 && rh <= 1) newL.humidity = rh;
        } else if (at && ORK_SIM != null) {
          // a chosen run in OpenRocket's standard air: standard pressure and temperature at the site, dry
          newL.pressure = 0;
          newL.humidity = 0;
          newL.tempC = +(15 - 0.0065 * Math.max(g("launchaltitude") || 0, 0)).toFixed(2);
        }
      }
      const wd = g("winddirection");
      if (wd != null) newL.windDir = ((((wd * 180) / Math.PI) % 360) + 360) % 360;
      const wt = g("windturbulence");
      if (wt != null) newL.turb = Math.max(0, Math.min(wt, 1));
      // OpenRocket's multi-level wind (its winds aloft), when the run uses it: heights above sea level or the pad, a speed,
      // the direction it blows from (radians) and a standard deviation at each. The lowest level sets the ground wind
      // and its gustiness, the rest fill the Winds aloft table. A run with OpenRocket's average wind has none.
      {
        const kind = (cnd.getElementsByTagName("windmodeltype")[0]?.textContent || "").trim().toLowerCase(),
          ml = [...cnd.getElementsByTagName("wind")].find((w) => w.getAttribute("model") === "multilevel");
        // (only for a run chosen when opening: opening the design alone keeps your weather)
        if (ORK_SIM != null && kind === "multilevel" && ml) {
          const base = ml.getAttribute("altituderef") === "msl" ? g("launchaltitude") || 0 : 0;
          const lv = [...ml.getElementsByTagName("windlevel")]
            .map((e) => ({
              alt: parseFloat(e.getAttribute("altitude")) - base,
              speed: parseFloat(e.getAttribute("speed")),
              dir: +(((((parseFloat(e.getAttribute("direction")) * 180) / Math.PI) % 360) + 360) % 360).toFixed(2),
              sd: parseFloat(e.getAttribute("standarddeviation")),
            }))
            .filter((e) => isFinite(e.alt) && isFinite(e.speed) && e.speed >= 0 && isFinite(e.dir))
            .sort((a, b) => a.alt - b.alt);
          if (lv.length) {
            newL.wind = lv[0].speed;
            newL.windDir = lv[0].dir;
            if (isFinite(lv[0].sd) && lv[0].speed > 0) newL.turb = Math.max(0, Math.min(lv[0].sd / lv[0].speed, 1));
            newL.aloft = lv.filter((e) => e.alt > 1).map((e) => ({ alt: e.alt, speed: e.speed, dir: e.dir }));
            newL.aloftSrc = newL.aloft.length ? "OpenRocket multi-level wind" : "";
          }
        } else if (ORK_SIM != null) {
          newL.aloft = [];
          newL.aloftSrc = "";
        }
      }
      const into = (cnd.getElementsByTagName("launchintowind")[0]?.textContent || "true").trim() !== "false",
        rdir = g("launchroddirection");
      newL.railMode = into ? "into" : "fixed";
      if (!into && rdir != null) newL.railDir = ((rdir % 360) + 360) % 360;
    }
  }
  if (sim) {
    nd.orkApogee = parseFloat(sim.getElementsByTagName("flightdata")[0].getAttribute("maxaltitude"));
  }
  // a cluster: the first motor is the main one; its extra copies and every other motor mount become extra motors
  // each extra motor lights this long after the main one: a mount set to light at liftoff with a delay is an airstart;
  // a mount set never to light is left out
  const mainInfo = {};
  /**
   * A stage's extra motors (see the notes above), and the main motor's own delay and never-lights setting in
   * mainInfo[key].
   * @param {object[]} list the stage's motors
   * @param {string} key "s", "b" or "f"
   * @returns {object[]} extra motors {id, n, d, ej}
   */
  const extrasOf = (list, key) => {
    const info = (mainInfo[key] = { delay: 0, off: false });
    if (!list || !list.length) return [];
    const fly = list.filter((e) => e.ign !== "never"),
      off = list.length - fly.length;
    if (off)
      notes.push(
        `${off} motor mount${off > 1 ? "s are" : " is"} set never to light in this configuration, so ${off > 1 ? "they're" : "it's"} left out.`,
      );
    if (!fly.length) {
      info.off = true;
      return [];
    }
    const tmin = Math.min(...fly.map((e) => +e.ignDelay || 0)),
      m0 = list[0];
    let out;
    if (m0.ign === "never") {
      info.off = true;
      out = fly.map((e) => ({ ...e, d: (+e.ignDelay || 0) - tmin }));
    } else {
      const d0 = (+m0.ignDelay || 0) - tmin;
      info.delay = d0;
      out = [
        ...(m0.count > 1 ? [{ ...m0, count: m0.count - 1, d: d0 }] : []),
        ...list
          .slice(1)
          .filter((e) => e.ign !== "never")
          .map((e) => ({ ...e, d: (+e.ignDelay || 0) - tmin })),
      ];
    }
    // a motor in another stage (an OpenRocket parallel booster or pod stage) has its own charge for its own recovery: it
    // doesn't open this stage's chutes, so its delay isn't carried here
    // (a side booster keeps its charge's delay as sbEj: it can set when the booster separates)
    out = out.map((e) => (e.si !== m0.si || !!e.par !== !!m0.par ? { ...e, ej: null, sbEj: e.ej } : e));
    if (out.some((e) => e.d > 0) || info.delay > 0)
      notes.push(
        "Some motors light after others (an airstart); each one's thrust starts that many seconds after the first motor lights.",
      );
    return out;
  };
  const susList = twoStage ? sMotors[0] : sMotors.flat().filter(Boolean);
  const motorExtras = extrasOf(susList, "s"),
    boosterExtras = twoStage ? extrasOf(sMotors[1], "b") : [],
    firstExtras = threeStage ? extrasOf(sMotors[2], "f") : [];
  nd.mainDelay = mainInfo.s ? mainInfo.s.delay : 0;
  nd.mainOff = !!(mainInfo.s && mainInfo.s.off);
  nd.bMainDelay = mainInfo.b ? mainInfo.b.delay : 0;
  nd.bMainOff = !!(mainInfo.b && mainInfo.b.off);
  nd.s1MainDelay = mainInfo.f ? mainInfo.f.delay : 0;
  nd.s1MainOff = !!(mainInfo.f && mainInfo.f.off);
  if (
    (motorExtras.length || boosterExtras.length || firstExtras.length) &&
    ![...motorExtras, ...boosterExtras, ...firstExtras].some((e) => e.d > 0)
  )
    notes.push("The file has a motor cluster. All motors in a stage are lit together and their thrust is added.");
  if (pods.length)
    notes.push(
      `Pods: ${pods.length === 1 ? "the pod adds its" : "each pod adds its"} weight, lift and drag, once for every copy.`,
    );
  if (tubeFinSets.length)
    notes.push("Tube fins are modeled as OpenRocket models them (lift, and drag inside and out).");
  if (sideBoosters.length)
    notes.push(
      twoStage
        ? "This rocket has stages, so its side boosters stay on for the whole flight here."
        : "The side boosters drop away at their separation event; their own descent isn’t flown.",
    );
  const smo = twoStage ? sMotor[0] : motor;
  Object.assign(SRC, {
    cfg,
    stages,
    sX0: sX0.slice(),
    fins: fins.map((f) => ({ oi: f.oi, x: f.x, root: f.root, si: f.si })),
    fMain: S.f.oi,
    bfMain: B ? B.f.oi : null,
    nose: nose ? nose.oi : null,
    body: bodyEls,
    motor: smo && smo.oi != null ? smo.oi : null,
    bmotor: twoStage && sMotor[1] ? sMotor[1].oi : null,
    b1motor: threeStage && sMotor[2] ? sMotor[2].oi : null,
    mount: sMount[0] ?? null,
    bmount: twoStage ? (sMount[1] ?? null) : null,
    sim: refSim ? simEls.indexOf(refSim) : -1,
    clusters: sMotors.map((l) => (l || []).length),
  });
  return {
    design: nd,
    launch: newL,
    notes,
    motor,
    boosterMotor: twoStage ? sMotor[1] || null : null,
    firstMotor: threeStage ? sMotor[2] || null : null,
    motorExtras,
    boosterExtras,
    firstExtras,
    src: SRC,
  };
}
