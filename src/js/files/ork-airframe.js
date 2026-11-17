import { FIN_EDGES, finTeEdge } from "../core/units-and-fin-edges.js";
import { elKid } from "./ork-xml.js";
/*
 * From what was read of an OpenRocket design's parts (ork-parts.js) to the airframes that fly: how its stages are
 * flown, and each airframe's size, weight, balance, inertia, body sections, fins and attached parts.
 */
/**
 * An edge type from the file, or square if this app doesn't know it.
 * @param {string} e
 * @returns {string}
 */
export const orkEdge = (e) => (FIN_EDGES.some((x) => x[0] === e) ? e : "square");
/**
 * How the stages are flown. Two stages with a motor each are flown as booster and sustainer; a stage with no motor (a
 * payload section that separates) rides along, so the rocket is flown as one. Three stages with a motor each: first
 * stage, booster (the middle one) and sustainer. A rocket flown as one takes the rocket-level weight and CG overrides.
 * @param {object} rd the reading
 * @returns {{twoStage:boolean, threeStage:boolean}} twoStage is true for three stages too
 */
export function orkStaging(rd) {
  const threeStage = rd.stages === 3 && !!rd.sMotor[0] && !!rd.sMotor[1] && !!rd.sMotor[2];
  const twoStage = (rd.stages === 2 && !!rd.sMotor[0] && !!rd.sMotor[1]) || threeStage;
  if (rd.stages === 2 && !twoStage)
    rd.notes.push(
      "Only one of the two stages has a motor (the other is a payload section), so the rocket is flown as one. Its separation isn’t simulated; it doesn’t change the climb to apogee.",
    );
  if (rd.stages === 3 && !threeStage)
    rd.notes.push(
      "Not every one of the three stages has a motor, so all stages were combined and flown as one rocket.",
    );
  if (rd.stages > 3)
    rd.notes.push(
      `This design has ${rd.stages} stages. Pocket Rocket Flight Lab simulates up to three, so all stages were combined and flown as one rocket.`,
    );
  if (!twoStage) {
    const rom = elKid(rd.rocket, "overridemass");
    if (rom) {
      rd.totalMass = parseFloat(rom.textContent) || rd.totalMass;
      rd.notes.push("Used the rocket-level mass override.");
    }
    const rcg = elKid(rd.rocket, "overridecg");
    if (rcg && parseFloat(rcg.textContent) > 0) {
      rd.moment = parseFloat(rcg.textContent) * rd.totalMass;
    }
  }
  return { twoStage, threeStage };
}
/**
 * An airframe's turning and roll inertia from the weights read. The turning inertia is about the parts' own CG, each
 * part as a uniform rod of its length. A weight override adds (or removes) mass the parts list doesn't show: extra
 * mass is placed where it must sit for the parts plus that mass to balance at the file's CG, and less mass scales the
 * parts down. The roll inertia, about the axis, is scaled to the weight the same way.
 * @param {object[]} pts the airframe's weights {m, x, len, k2}
 * @param {number} mass its weight, kg
 * @param {number} mom its moment about the nose tip, kg·m
 * @returns {{inertia:number, rollI:number}} kg·m²
 */
function airframeInertia(pts, mass, mom) {
  const pm = pts.reduce((a, p) => a + p.m, 0),
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
  return { inertia, rollI };
}
/**
 * An airframe's main fin set and its other sets. Matching sets at the same place are one set; the main set is the
 * aft-most one on the rocket's own body (its trailing edge is closest to the tail), unless every set is on a pod; the
 * others become extra sets.
 * @param {object} rd the reading (for its notes)
 * @param {object[]} fl the airframe's fin sets as read
 * @param {string} pre the prefix of its notes
 * @param {number} x0 where the airframe starts, from the nose tip, m
 * @returns {{f:object, extra:object[]}} the main set, and the others as the design keeps them
 */
function airframeFins(rd, fl, pre, x0) {
  const groups = new Map();
  for (const fs of fl) {
    // (fins on different bodies, or on a pod, stay apart)
    const k =
      [fs.x, fs.root, fs.span].map((v) => Math.round(v * 500)).join("|") + "|" + (fs.pod ?? "") + "|" + (fs.par ?? "");
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
    rd.notes.push(`${pre}Matching fin sets at the same position were combined into ${f.n} fins.`);
  const others = [...groups.values()].filter((g) => g !== f).sort((p, q) => p.x - q.x);
  if (others.length)
    rd.notes.push(
      `${pre}${groups.size} fin sets were imported. The aft-most (${f.n} fins) is the main set; the other${others.length > 1 ? "s are" : " is"} listed under Fin set 2${others.length > 1 ? "–" + (others.length + 1) : ""}.`,
    );
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
    edge: orkEdge(g.edge),
    edgeTE: finTeEdge(g.edgeTE),
    bevLE: g.bevLE || 0,
    bevTE: g.bevTE || 0,
    ler: g.ler || 0,
    cdo: g.cdo || 0,
    oi: g.oi,
    par: g.par || 0,
    ...(g.pts ? { pts: g.pts } : {}),
    ...(g.pod != null ? { pod: g.pod, rb: g.rb, sb: g.sb } : {}),
  }));
  return { f, extra };
}
/**
 * How an airframe's body is flown: as a nose, a tube and perhaps a boattail (given by the tail's length and diameter),
 * or, when its diameter changes along the way or a section has a Cd override, section by section.
 * @param {object} rd the reading (for its notes)
 * @param {object[]} segs the body's sections, front to back
 * @param {number} diameter its largest diameter, m
 * @param {string} pre the prefix of its notes
 * @returns {{nz:object|undefined, tailLen:number, tailDia:number, useSegs:boolean}} nz: the nose section
 */
function airframeBody(rd, segs, diameter, pre) {
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
      rd.notes.push(
        `${pre}The body has ${sg.length} sections with diameter changes; drag and stability use each section.`,
      );
    }
  }
  if (!useSegs && segs.some((s) => s.cdo > 0)) useSegs = true; // keep per-part Cd overrides with their parts
  return { nz, tailLen, tailDia, useSegs };
}
/**
 * Builds one airframe from a set of stages (sustainer [0], booster [1], or all for a single stage).
 * @param {object} rd the reading
 * @param {number[]} sel stage indexes
 * @param {string} label prefix for its notes
 * @returns {object} design fields for that airframe
 * @throws {Error} if it has no fins
 */
export function orkAirframe(rd, sel, label) {
  const pre = label ? label + ": " : "";
  const inS = (o) => sel.includes(o.si);
  const x0 = rd.sX0[sel[0]] || 0,
    x1 = rd.sX1[sel[sel.length - 1]] || rd.cursor;
  const mass = sel.length === rd.stages ? rd.totalMass : sel.reduce((a, k) => a + (rd.sMass[k] || 0), 0);
  const mom = sel.length === rd.stages ? rd.moment : sel.reduce((a, k) => a + (rd.sMom[k] || 0), 0);
  const { inertia, rollI } = airframeInertia(rd.massPts.filter(inS), mass, mom);
  const segs = rd.segments
    .filter(inS)
    .map((s) => {
      const o = { ...s, x: s.x - x0 };
      delete o.si;
      return o;
    })
    .sort((a, b) => a.x - b.x);
  const fl = rd.fins.filter(inS),
    tfl = rd.tubeFinSets.filter(inS);
  if (!fl.length && !tfl.length)
    throw new Error(`${pre}No fin set was found, so stability and drag can’t be estimated.`);
  // tube fins only: the main (flat) fin set is empty
  if (!fl.length)
    fl.push({ n: 0, root: 0, tip: 0, span: 0, sweep: 0, t: 0, x: x1, edge: "square", si: sel[0], oi: -1, par: 0 });
  const { f, extra } = airframeFins(rd, fl, pre, x0);
  const length = x1 - x0;
  const diameter = 2 * (Math.max(0, ...segs.map((s) => Math.max(s.r1, s.r2))) || rd.maxR || rd.nose?.r || 0.05);
  const { nz, tailLen, tailDia, useSegs } = airframeBody(rd, segs, diameter, pre);
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
    chutes: rd.chutes.filter((c) => inS(c) && c.sb == null),
    buttons: rd.buttons.filter(inS).map(shift),
    lugs: rd.lugs.filter(inS).map(shift),
    bumps: rd.bumps.filter(inS).map(shift),
    pods: rd.pods.filter(inS).map((pd) => ({ ...shift(pd), segs: pd.segs.map(shift) })),
    tubeFins: tfl.map(shift),
    sideBoosters: rd.sideBoosters.filter(inS).map((b) => ({
      i: b.i,
      count: b.count,
      mass: b.mass,
      cg: b.mass > 0 ? b.mom / b.mass - x0 : 0,
      event: b.event,
      delay: b.delay,
    })),
  };
}
