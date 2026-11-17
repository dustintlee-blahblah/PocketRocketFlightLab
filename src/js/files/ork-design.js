import { finTeEdge } from "../core/units-and-fin-edges.js";
import { D } from "../design/defaults.js";
import { orkEdge } from "./ork-airframe.js";
import { orkFinishRs } from "./ork-parts.js";
import { elKid, elSubs, elTxt } from "./ork-xml.js";
/*
 * The parts of a design read from an OpenRocket file that depend on how it is flown: the booster's and first stage's
 * fields, the recovery (which chute is the main, which the drogue, and when the first opens), and the extra motors of a
 * cluster.
 */
/**
 * The design's main fields: the sustainer's (or the only stage's) size, weight, fins and attached parts, the finish,
 * the motor mount, and what the file overrides for the whole rocket.
 * @param {object} rd the reading
 * @param {object} S the sustainer's airframe (orkAirframe)
 * @param {boolean} twoStage whether it is flown as stages
 * @param {object|null} motor the main motor
 * @returns {object} the design, on the app's defaults
 */
export function orkSustainer(rd, S, twoStage, motor) {
  const ocd = [rd.rocket, ...elSubs(rd.rocket).filter((e) => e.tagName === "stage")]
    .map((e) => elKid(e, "overridecd"))
    .find(Boolean);
  if (ocd) rd.notes.push("Used the file’s Cd override for the whole rocket.");
  // the rocket's finish: the first body tube's (the app's own finish name or roughness, beside OpenRocket's on the part)
  const finTag =
    (rd.rocket.getElementsByTagName("bodytube")[0] || rd.rocket).getElementsByTagName("finish")[0] ||
    rd.rocket.getElementsByTagName("finish")[0];
  const f = S.f;
  const nd = {
    ...D,
    name: elTxt(rd.rocket, "name") || "Imported rocket",
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
    finEdge: orkEdge(f.edge),
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
    motorOverhang: (twoStage ? rd.sOverhang[0] : rd.R.overhang) ?? 0,
    mountAft:
      rd.sMountAft[0] != null && Math.abs(rd.sMountAft[0] - (rd.sX0[0] || 0) - S.length) > 0.002
        ? rd.sMountAft[0] - (rd.sX0[0] || 0)
        : null,
    finish: (finTag && orkFinishRs(finTag.parentElement)) ?? 60e-6,
    finFinish: f.rs ?? null,
    buttons: S.buttons,
    lugs: S.lugs,
    bumps: S.bumps,
    railPreset: rd.buttons.length || rd.lugs.length ? "custom" : "none",
    otherCd: 0,
    nozzleDia: motor?.nozzle || 0,
    twoStage,
    cdOverride: ocd ? parseFloat(ocd.textContent) || 0 : 0,
    refSource: "OpenRocket",
    mountSel: "file",
    bMountSel: "file",
    mountDia: (twoStage ? rd.sMountD[0] : rd.sMountD.find((v) => v > 0)) ?? null,
    bMountDia: twoStage ? (rd.sMountD[1] ?? null) : null,
    orkApogee: null,
    orkMotor: motor ? (motor.mfr + " " + motor.designation).trim() : null,
  };
  return nd;
}
/**
 * Fills in a two- or three-stage design's booster: its airframe, recovery, the sustainer's ignition delay, and notes on
 * what the file sets that isn't flown.
 * @param {object} rd the reading
 * @param {object} nd the design being built, changed in place
 * @param {object} B the booster's airframe (orkAirframe)
 * @param {object} SRC where the parts are in the file, added to
 */
export function orkBooster(rd, nd, B, SRC) {
  const bf = B.f;
  Object.assign(nd, {
    bLength: B.length,
    bDiameter: B.diameter,
    bSegments: B.segs,
    bDryMass: B.mass,
    bCg: B.cg,
    bOverhang: rd.sOverhang[1] ?? 0,
    bNozzleDia: (rd.sMotor[1] && rd.sMotor[1].nozzle) || 0,
    bMountAft:
      rd.sMountAft[1] != null && Math.abs(rd.sMountAft[1] - rd.sX0[1] - B.length) > 0.002
        ? rd.sMountAft[1] - rd.sX0[1]
        : null,
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
    bFinEdge: orkEdge(bf.edge),
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
    if (bc.streamer) rd.notes.push("Booster: the streamer was modeled as a parachute with the same drag area.");
  } else nd.bRecovery = "tumble";
  const ig = rd.sIgn[0] || { event: "burnout", delay: 0 };
  nd.stageDelay = Math.max(0, ig.delay || 0);
  if (!["burnout", "automatic"].includes(ig.event))
    rd.notes.push(
      `Sustainer ignition in the file is set to “${ig.event}”; it was modeled as booster burnout plus ${nd.stageDelay.toFixed(1)} s.`,
    );
  if (rd.sSep[1] && !["burnout", "upperignition"].includes(rd.sSep[1].event))
    rd.notes.push(`Stage separation in the file is set to “${rd.sSep[1].event}”; it was modeled at booster burnout.`);
}
/**
 * Fills in a three-stage design's first stage (nd.s1, in the booster's field names, every one set so none is taken
 * from the booster), the booster's ignition delay, and notes on what the file sets that isn't flown.
 * @param {object} rd the reading
 * @param {object} nd the design being built, changed in place
 * @param {object} C1 the first stage's airframe (orkAirframe)
 * @param {object} SRC where the parts are in the file, added to
 */
export function orkFirstStage(rd, nd, C1, SRC) {
  const cf = C1.f,
    cc = C1.chutes.reduce((a, b) => (!a || b.d > a.d ? b : a), null);
  nd.s1 = {
    bLength: C1.length,
    bDiameter: C1.diameter,
    bSegments: C1.segs,
    bDryMass: C1.mass,
    bCg: C1.cg,
    bOverhang: rd.sOverhang[2] ?? 0,
    bMountAft:
      rd.sMountAft[2] != null && Math.abs(rd.sMountAft[2] - rd.sX0[2] - C1.length) > 0.002
        ? rd.sMountAft[2] - rd.sX0[2]
        : null,
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
    bFinEdge: orkEdge(cf.edge),
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
    bMountDia: rd.sMountD[2] ?? null,
    bEjDelay: rd.sMotor[2] && rd.sMotor[2].ej != null ? rd.sMotor[2].ej : null,
  };
  if (cc) {
    SRC.b1chute = cc.oi;
    SRC.b1streamer = !!cc.streamer;
  }
  const ig = rd.sIgn[1] || { event: "burnout", delay: 0 };
  nd.midDelay = Math.max(0, ig.delay || 0);
  if (!["burnout", "automatic"].includes(ig.event))
    rd.notes.push(
      `Booster ignition in the file is set to “${ig.event}”; it was modeled as first-stage burnout plus ${nd.midDelay.toFixed(1)} s.`,
    );
  if (rd.sSep[2] && !["burnout", "upperignition"].includes(rd.sSep[2].event))
    rd.notes.push(
      `First-stage separation in the file is set to “${rd.sSep[2].event}”; it was modeled at first-stage burnout.`,
    );
}
/**
 * Fills in the recovery of the sustainer (or the only stage): the main chute and drogue, every other chute or streamer
 * with its own opening event, when the first chute opens, which chute the motor's charge pushes out, and the motors'
 * ejection delays.
 * @param {object} rd the reading
 * @param {object} nd the design being built, changed in place
 * @param {object} S the sustainer's airframe (orkAirframe)
 * @param {object} SRC where the parts are in the file, added to
 * @param {boolean} twoStage whether it is flown as stages
 * @param {object|null} motor the main motor
 */
export function orkRecovery(rd, nd, S, SRC, twoStage, motor) {
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
    rd.notes.push(
      "The file has no parachute or streamer, so none is used: the rocket comes down tumbling. Add a parachute in the design tree to fly it with one.",
    );
  }
  // every other chute or streamer on the sustainer (or the only stage), with its own opening event
  {
    const mc = S.chutes.find((c) => c.oi === SRC.main),
      ms = mc ? mc.si : null,
      other = S.chutes.filter((c) => c.oi !== SRC.main && c.oi !== SRC.drogue && ms != null && c.si !== ms).length;
    if (other)
      rd.notes.push(
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
    rd.notes.push(
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
        mo = twoStage ? rd.sMotor[0] : motor;
      if (first.ev === "ejection") {
        nd.deployMode = "motor";
        nd.deployDelay = mo && mo.ej != null ? mo.ej + dd : 0;
        nd.ejChuteDelay = dd;
        if (!(mo && mo.ej != null))
          rd.notes.push(
            "The chute is set to open at the motor ejection charge, but the motor is plugged, so that chute never opens. Choose a delay under Motor Delay on the Motor tab, or set the chute to open at apogee.",
          );
      } else if (first.ev === "launch") {
        nd.deployMode = "timer";
        nd.deployDelay = dd;
      } else if (first.ev === "apogee") nd.deployDelay = dd;
      else if (first.ev !== "altitude")
        rd.notes.push(`The chute is set to open on “${first.ev}”; it was modeled as opening at apogee.`);
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
    const sm = twoStage ? rd.sMotor[0] : motor;
    nd.ejDelay = sm && sm.ej != null ? sm.ej : null;
    nd.bEjDelay = twoStage && rd.sMotor[1] && rd.sMotor[1].ej != null ? rd.sMotor[1].ej : null;
  }
}
/**
 * A cluster's extra motors. The first motor is the main one; its extra copies and every other motor mount become extra
 * motors. Each extra motor lights this long after the main one: a mount set to light at liftoff with a delay is an
 * airstart; a mount set never to light is left out. Also sets the main motors' own delays in the design.
 * @param {object} rd the reading
 * @param {object} nd the design being built, changed in place
 * @param {boolean} twoStage whether it is flown as stages
 * @param {boolean} threeStage whether it has three
 * @returns {{motorExtras:object[], boosterExtras:object[], firstExtras:object[]}} each stage's extra motors
 */
export function orkMotorExtras(rd, nd, twoStage, threeStage) {
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
      rd.notes.push(
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
      rd.notes.push(
        "Some motors light after others (an airstart); each one's thrust starts that many seconds after the first motor lights.",
      );
    return out;
  };
  const susList = twoStage ? rd.sMotors[0] : rd.sMotors.flat().filter(Boolean);
  const motorExtras = extrasOf(susList, "s"),
    boosterExtras = twoStage ? extrasOf(rd.sMotors[1], "b") : [],
    firstExtras = threeStage ? extrasOf(rd.sMotors[2], "f") : [];
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
    rd.notes.push("The file has a motor cluster. All motors in a stage are lit together and their thrust is added.");
  return { motorExtras, boosterExtras, firstExtras };
}
