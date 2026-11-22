import { finSectionShare, finTeEdge } from "../core/units-and-fin-edges.js";
import {
  elAutoNum,
  elDens,
  elIsAuto,
  elKid,
  elNum,
  elSubs,
  elTxt,
  ORK_BODY,
  orkFinOutline,
  orkLenOf,
  orkOffset,
  orkPlace,
} from "./ork-xml.js";
import { noseR } from "../physics/geometry.js";
/*
 * Reading an OpenRocket design's parts. orkReadStages walks every stage's component tree once (orkWalk), and each
 * kind of part has its own reader (readNose, readTube, readFins...) that works out its weight and balance point and
 * records what it adds to the rocket: a section of the body, a fin set, a parachute, a motor. What has been read so far
 * is kept in one object, the reading (orkReading), passed to every reader as rd. The weight, CG and Cd overrides are
 * applied in one place, orkWalk, after the part's own reader.
 */

/**
 * Surface roughness height of OpenRocket's finish names, m.
 */
export const FINISH_RS = {
  rough: 500e-6,
  roughunfinished: 250e-6,
  unfinished: 150e-6,
  normal: 60e-6,
  glossy: 40e-6, // this app's own (prflfinish), between OpenRocket's smooth and normal
  smooth: 20e-6,
  optimum: 5e-6,
  polished: 2e-6,
  finishpolished: 0.5e-6,
  mirror: 0,
};
/**
 * The OpenRocket finish nearest a roughness (on a log scale; 0 is the mirror finish), for a part whose own roughness
 * OpenRocket has no name for.
 * @param {number} rs roughness height, m
 * @returns {string} OpenRocket's finish name
 */
export function finishNear(rs) {
  if (!(rs > 0)) return "mirror";
  return Object.entries(FINISH_RS)
    .filter(([k, r]) => r > 0 && k !== "glossy")
    .sort((a, b) => Math.abs(Math.log(a[1] / rs)) - Math.abs(Math.log(b[1] / rs)))[0][0];
}
/**
 * A part's surface roughness: its own number (this app's custom finish: prflfinish "custom" with prflroughness), else
 * the app's own finish name when the part has one, else OpenRocket's.
 * @param {Element} c the part
 * @returns {number|undefined} roughness height, m; undefined if the part names no finish known here
 */
export function orkFinishRs(c) {
  const own = (elTxt(c, "prflfinish") || "").trim().toLowerCase();
  if (own === "custom") {
    const r = elNum(c, "prflroughness", -1);
    if (r >= 0) return r;
  }
  return FINISH_RS[((own !== "custom" && own) || elTxt(c, "finish") || "").trim().toLowerCase()];
}
/**
 * The notes about fin shapes kept as drawn (each said once).
 */
const ORK_FF_NOTE =
    "Free-form fins keep their exact shape from the file; drag and stability are calculated from that shape.",
  ORK_EL_NOTE = "Elliptical fins keep their exact shape; drag and stability are calculated from that shape.";
/**
 * The tags of flat fin sets, and of recovery devices (how each is numbered in the file, for saving changes back).
 */
const ORK_FINRE = /^(trapezoid|elliptical|freeform)finset$/,
  ORK_CHRE = /^(parachute|streamer)$/;
/**
 * The volume of a body of revolution and its centroid, solid or as a shell, the way OpenRocket works it out: in slices,
 * each a frustum less the frustum inside it, with the wall measured square to the surface (so the inner radius is
 * r − t·slant/length, and a slice whose wall fills it is solid).
 * @param {function(number):number} rAt radius at a distance from the front, m
 * @param {number} len length, m
 * @param {number} t wall thickness, m (ignored when solid)
 * @param {boolean} solid
 * @returns {{V:number, x:number}} volume (m³) and centroid from the front (m)
 */
function orkShell(rAt, len, t, solid) {
  const N = 100,
    fr = (a, b, l) => (Math.PI * l * (a * a + a * b + b * b)) / 3,
    // a frustum's centroid from its front face
    fx = (a, b, l) =>
      a * a + a * b + b * b > 0 ? (l * (a * a + 2 * a * b + 3 * b * b)) / (4 * (a * a + a * b + b * b)) : l / 2;
  let V = 0,
    M = 0;
  for (let i = 0; i < N; i++) {
    const x0 = (i / N) * len,
      l = len / N,
      a = rAt(x0),
      b = rAt(x0 + l);
    let v = fr(a, b, l),
      m = v * (x0 + fx(a, b, l));
    if (!solid) {
      const h = (t * Math.hypot(b - a, l)) / l,
        ai = Math.max(a - h, 0),
        bi = Math.max(b - h, 0),
        vi = fr(ai, bi, l);
      v -= vi;
      m -= vi * (x0 + fx(ai, bi, l));
    }
    V += v;
    M += m;
  }
  return { V, x: V > 0 ? M / V : len / 2 };
}
/**
 * A new reading: everything the reader keeps as it goes through a design's parts, passed to every reader as rd.
 * @param {Element} rocket the design's rocket element
 * @param {string|null} cfg the id of the motor configuration flown
 * @param {Set<Element>} offStages the stages switched off in that configuration
 * @param {string[]} notes notes on what was simplified, added to as the design is read
 * @returns {object}
 */
export function orkReading(rocket, cfg, offStages, notes) {
  return {
    rocket,
    cfg,
    offStages,
    notes,
    // the rocket's body parts in order: what an automatic radius follows (nextExplicit)
    bodyOrder: elSubs(rocket)
      .filter((s) => s.tagName === "stage")
      .flatMap((s) => elSubs(s))
      .filter((c) => ORK_BODY.includes(c.tagName)),
    /* pods and side boosters (OpenRocket pod sets and parallel stages, RockSim external pods): each one's body
       sections, for its drag and lift; how many copies of it there are (podK multiplies the mass, motors and fins of
       everything inside); and, for a side booster, what it weighs and when it separates. Tube fins: each set's tubes,
       for their lift, drag and weight. */
    pods: [],
    sideBoosters: [],
    tubeFinSets: [],
    // inside a pod or side booster: its copies, the pod and booster being read, and its distance from the axis
    podK: 1,
    podCur: null,
    sbCur: null,
    podROff: 0,
    // the whole rocket: its largest radius, weight and moment about the nose tip, and its parts by kind
    maxR: 0,
    totalMass: 0,
    moment: 0,
    nose: null,
    fins: [],
    chutes: [],
    motor: null,
    transitions: [],
    stages: 0,
    buttons: [],
    lugs: [],
    bumps: [],
    segments: [],
    // Cd overrides: how many parts have one, whether one is on an inner part (ignored) or covers the parts on it, and
    // how deep inside such a part the reader is
    cdCount: 0,
    cdComp: false,
    cdCovered: false,
    cdCover: 0,
    compUid: 0, // numbers each component, so fin sets know which body they're on
    // the stage being read, and how deep inside a parallel (side booster) stage
    curStage: 0,
    parDepth: 0,
    // by stage: its motor tube's aft end and inside diameter, whether its weight is an override, its weight and
    // moment, where it starts and ends, its motor's overhang, its motors and their ignition, and its separation
    sMountAft: [],
    sKnown: [],
    sMass: [],
    sMom: [],
    sX0: [],
    sX1: [],
    sOverhang: [],
    sMotor: [],
    sMotors: [],
    sIgn: [],
    sSep: [],
    sMount: [],
    sMountD: [],
    // R.last: the radius the body has reached (what an automatic radius takes); R.overhang: the motor's overhang
    R: {},
    // lists of elements by tag, for numbering parts as the file has them (ord)
    ORD: {},
    bodyEls: [],
    // every weight read: {m, x, len, k2, si}, for the inertia
    massPts: [],
    // where the next stage starts, from the nose tip
    cursor: 0,
  };
}
/**
 * The radius of the next body part aft that has an explicit (not automatic) radius. OpenRocket stores an automatic
 * radius as "auto <cached value>", and the cached value can be stale, so automatic sizes are worked out from the
 * neighbouring body parts, as the .ork format defines them.
 * @param {object} rd the reading
 * @param {Element} c a body part
 * @returns {number} m (0 if there is none)
 */
function nextExplicit(rd, c) {
  // the rocket's body parts in order, or a pod's own (a pod's parts follow one another inside it)
  const par = c.parentElement && c.parentElement.parentElement,
    order =
      par && (par.tagName === "podset" || par.tagName === "parallelstage")
        ? [...c.parentElement.children].filter((e) => ORK_BODY.includes(e.tagName))
        : rd.bodyOrder;
  const i = order.indexOf(c);
  for (let j = i + 1; j < order.length; j++) {
    const e = order[j];
    if (e.tagName === "bodytube" && !elIsAuto(e, "radius")) return elNum(e, "radius");
    if (e.tagName === "transition" && !elIsAuto(e, "foreradius")) return elNum(e, "foreradius");
  }
  return 0;
}
/**
 * Records a motor mount's motor (for the configuration in use), cluster count, ignition and overhang.
 * @param {object} rd the reading
 * @param {Element} c the tube element
 * @param {number} ri its inside radius, m
 * @param {boolean} isInner an inner tube (not a body tube flown as its own mount)
 * @param {number} xAft the tube's aft end from the nose tip, m
 */
function motorMountIn(rd, c, ri, isInner, xAft) {
  // only a tube marked as a motor mount holds motors (an inner tube around a mount must not count them again)
  if (!elKid(c, "motormount") && c.getElementsByTagName("motormount").length) return;
  const mountEl = elKid(c, "motormount") || c;
  const motorEls = [...mountEl.getElementsByTagName("motor")];
  // the motor for this configuration; a mount with motors only for other configurations is empty in this one
  const motorEl =
    motorEls.find((e) => e.getAttribute("configid") === rd.cfg) ||
    (rd.cfg && motorEls.some((e) => e.getAttribute("configid")) ? null : motorEls[0]);
  if (isInner && rd.sMount[rd.curStage] == null && elKid(c, "motormount"))
    rd.sMount[rd.curStage] = ord(rd, c, "it", /^innertube$/);
  if (rd.sMountAft[rd.curStage] == null && elKid(c, "motormount") && xAft != null) rd.sMountAft[rd.curStage] = xAft; // the aft end of the motor tube: where the motor sits
  if (rd.sMountD[rd.curStage] == null && elKid(c, "motormount") && ri > 0) rd.sMountD[rd.curStage] = 2 * ri; // inside diameter of the motor tube
  if (motorEl) {
    const delayTxt = (elTxt(motorEl, "delay") || "").trim().toLowerCase(),
      ej =
        delayTxt === "" || delayTxt === "none" || delayTxt === "p" || !isFinite(parseFloat(delayTxt))
          ? null
          : parseFloat(delayTxt);
    const mo = {
      designation: (elTxt(motorEl, "designation") || "").trim(),
      mfr: (elTxt(motorEl, "manufacturer") || "").trim(),
      dia: elNum(motorEl, "diameter"),
      nozzle: elNum(motorEl, "nozzleexitdiameter", 0),
      ej,
      oi: ord(rd, motorEl, "mo", /^motor$/),
      par: rd.parDepth > 0,
      sb: rd.sbCur ? rd.sbCur.i : null,
    };
    if (!rd.sMotor[rd.curStage]) rd.sMotor[rd.curStage] = mo;
    if (!rd.motor) rd.motor = mo;
    const clusterCfg = (elTxt(c, "clusterconfiguration") || "single").trim().toLowerCase();
    const copies =
      (clusterCfg === "single" ? 1 : clusterCfg === "double" ? 2 : Math.max(1, parseInt(clusterCfg, 10) || 1)) *
      rd.podK;
    const ignCfg = [...mountEl.getElementsByTagName("ignitionconfiguration")].find(
      (e) => e.getAttribute("configid") === rd.cfg,
    );
    const ignEvent = (
      (ignCfg && elTxt(ignCfg, "ignitionevent")) ||
      elTxt(mountEl, "ignitionevent") ||
      "automatic"
    ).toLowerCase();
    const ignDelay =
      ignCfg && elTxt(ignCfg, "ignitiondelay") != null
        ? elNum(ignCfg, "ignitiondelay", 0)
        : elNum(mountEl, "ignitiondelay", 0);
    (rd.sMotors[rd.curStage] || (rd.sMotors[rd.curStage] = [])).push({
      ...mo,
      count: copies,
      ign: ignEvent,
      ignDelay: ignDelay,
      si: rd.curStage,
    });
    if (!rd.sIgn[rd.curStage]) rd.sIgn[rd.curStage] = { event: ignEvent, delay: ignDelay };
  }
  const overhangTxt = elTxt(mountEl, "overhang") ?? elTxt(c, "overhang") ?? elTxt(c, "motoroverhang");
  if (overhangTxt != null) {
    rd.R.overhang = parseFloat(overhangTxt);
    if (rd.sOverhang[rd.curStage] == null) rd.sOverhang[rd.curStage] = parseFloat(overhangTxt);
  }
}
/**
 * A part's own Cd override (an override of 0, by which OpenRocket means the part adds no drag, is kept as 1e-12 so
 * it still counts as set), or 0 for none.
 * @param {Element} c
 * @returns {number}
 */
function odcOwn(c) {
  const e = elKid(c, "overridecd");
  const v = e ? parseFloat(e.textContent) : 0;
  return !isFinite(v) || v < 0 ? 0 : v > 0 ? v : e ? 1e-12 : 0;
}
/**
 * The Cd override a part flies with: its own, or, inside a part whose Cd override covers the parts on it, no drag of
 * its own (as OpenRocket flies it: the override stands for all of them).
 * @param {object} rd the reading
 * @param {Element} c
 * @returns {number}
 */
const odc = (rd, c) => (rd.cdCover > 0 ? 1e-12 : odcOwn(c));
/**
 * The index of an element among all elements of matching tags (how parts are found again when saving).
 * @param {object} rd the reading
 * @param {Element} el
 * @param {string} key a name for the list of matching elements, kept for the next call
 * @param {RegExp} re the tags that count
 * @returns {number}
 */
function ord(rd, el, key, re) {
  if (!rd.ORD[key]) rd.ORD[key] = [...rd.rocket.getElementsByTagName("*")].filter((e) => re.test(e.tagName));
  return rd.ORD[key].indexOf(el);
}
/**
 * Adds a point mass to the rocket's totals and to the current stage.
 * @param {object} rd the reading
 * @param {number} m kg
 * @param {number} x position of its CG from the nose tip, m
 * @param {number} [len=0] its length, for the inertia estimate
 * @param {number} [k2=0] its own radius of gyration squared, m²
 */
function addMass(rd, m, x, len = 0, k2 = 0) {
  if (m > 0 && isFinite(x)) {
    // inside pods: every copy, off the rocket's axis
    if (rd.podK > 1 || rd.podROff) {
      m *= rd.podK;
      k2 += rd.podROff * rd.podROff;
    }
    if (rd.sbCur) {
      rd.sbCur.mass += m;
      rd.sbCur.mom += m * x;
    }
    rd.totalMass += m;
    rd.moment += m * x;
    rd.sMass[rd.curStage] = (rd.sMass[rd.curStage] || 0) + m;
    rd.sMom[rd.curStage] = (rd.sMom[rd.curStage] || 0) + m * x;
    rd.massPts.push({ m, x, len: Math.max(len || 0, 0), k2: isFinite(k2) ? k2 : 0, si: rd.curStage });
  }
}
/**
 * A nose cone: its weight and balance point from its real profile (with its shoulder), and its section of the body.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readNose(rd, c, x, parent, { len, cfin, rho }) {
  let m = 0,
    cg = x + len / 2;
  const ro = elIsAuto(c, "aftradius")
    ? rd.R.last || nextExplicit(rd, c) || elAutoNum(c, "aftradius")
    : elNum(c, "aftradius");
  const shape = (elTxt(c, "shape") || "ogive").toLowerCase();
  // OpenRocket marks a solid nose by a wall as thick as the radius
  const filled =
    elTxt(c, "filled") === "true" ||
    /filled/i.test(elTxt(c, "thickness") || "") ||
    (ro > 0 && elNum(c, "thickness", 0) >= ro * 0.999);
  const t = filled ? ro : elNum(c, "thickness", 0.002);
  const defP = { ogive: 1, power: 0.5, parabolic: 1, haack: 0 }[shape] ?? 0;
  const sp = elTxt(c, "shapeparameter") != null ? elNum(c, "shapeparameter", defP) : defP;
  const shp = ["ogive", "conical", "ellipsoid", "parabolic", "power", "haack"].includes(shape) ? shape : "ogive";
  // weight and balance point from the actual nose profile (solid, or a shell of the given thickness)
  {
    const sh = orkShell((u) => noseR(shp, sp, u, ro, len), len, t, filled);
    m = rho * sh.V;
    cg = x + (sh.V > 0 ? sh.x : len * 0.6);
  }
  const sl = elNum(c, "aftshoulderlength"),
    sr = elNum(c, "aftshoulderradius"),
    st = Math.min(elNum(c, "aftshoulderthickness", 0.002), sr);
  // the shoulder is part of the nose cone's own mass, so a mass override on the nose replaces both
  if (sl > 0 && sr > 0) {
    const parts = [[rho * Math.PI * (sr * sr - Math.max(sr - st, 0) ** 2) * sl, x + len + sl / 2]];
    if (elTxt(c, "aftshouldercapped") === "true" && st < sr)
      parts.push([rho * Math.PI * Math.max(sr - st, 0) ** 2 * st, x + len + sl - st / 2]);
    for (const [pm, px] of parts) {
      if (pm > 0 && isFinite(px)) {
        cg = (m * cg + pm * px) / (m + pm);
        m += pm;
      }
    }
  }
  rd.R.last = ro;
  if (!rd.nose && !rd.podCur)
    rd.nose = { len, r: ro, shape: shp + ":" + +sp.toFixed(4), x, oi: ord(rd, c, "nc", /^nosecone$/) };
  if (parent.podTop) rd.podCur.segs.push({ kind: "nose", x, len, r1: 0, r2: ro, shape: shp, param: sp, rs: cfin });
  if (parent.top)
    rd.segments.push({
      kind: "nose",
      x,
      len,
      r1: 0,
      r2: ro,
      shape: shp,
      param: sp,
      rs: cfin,
      si: rd.curStage,
      cdo: odc(rd, c),
      wt: t,
      wd: rho,
    });
  if (!["ogive", "conical", "ellipsoid", "parabolic", "power", "haack"].includes(shape))
    rd.notes.push(`Nose shape “${shape}” was treated as ogive.`);
  return { m, cg, ro };
}
/**
 * A body tube: its weight, its section of the body, and its motor if it is its own motor mount.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readTube(rd, c, x, parent, { len, cfin, rho }) {
  const ro = elIsAuto(c, "radius") ? rd.R.last || nextExplicit(rd, c) || elAutoNum(c, "radius") : elNum(c, "radius");
  const ri = Math.max(ro - elNum(c, "thickness", 0.001), 0);
  const m = rho * Math.PI * (ro * ro - ri * ri) * len;
  // wt, wd: the wall's thickness and density, for the skin's heating in flight (drag-model.js)
  if (parent.top)
    rd.segments.push({
      kind: "tube",
      x,
      len,
      r1: ro,
      r2: ro,
      rs: cfin,
      si: rd.curStage,
      cdo: odc(rd, c),
      wt: ro - ri,
      wd: rho,
    });
  if (parent.podTop) rd.podCur.segs.push({ kind: "tube", x, len, r1: ro, r2: ro, rs: cfin });
  if (elKid(c, "motormount")) {
    motorMountIn(rd, c, ri, false, x + len);
    if (rd.sMountD[rd.curStage] == null && ri > 0) rd.sMountD[rd.curStage] = 2 * ri;
  }
  return { m, ro, ri };
}
/**
 * A transition: its weight and balance point from its profile (with its shoulders), and its section of the body.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readTransition(rd, c, x, parent, { len, cfin, rho }) {
  let m = 0,
    cg = x + len / 2;
  const r1 = elIsAuto(c, "foreradius") ? rd.R.last || elAutoNum(c, "foreradius") : elNum(c, "foreradius"),
    r2 = elIsAuto(c, "aftradius") ? nextExplicit(rd, c) || elAutoNum(c, "aftradius") || r1 : elNum(c, "aftradius");
  const t = elNum(c, "thickness", 0.002);
  const tsh = (elTxt(c, "shape") || "conical").toLowerCase(),
    tshp = ["ogive", "conical", "ellipsoid", "parabolic", "power", "haack"].includes(tsh) ? tsh : "conical";
  const tp =
    elTxt(c, "shapeparameter") != null
      ? elNum(c, "shapeparameter", 0)
      : ({ ogive: 1, power: 0.5, parabolic: 1 }[tshp] ?? 0);
  // weight and balance point from its profile, with its shoulders, as OpenRocket works them out
  {
    const rAt = (u) => (r1 <= r2 ? r1 + noseR(tshp, tp, u, r2 - r1, len) : r2 + noseR(tshp, tp, len - u, r1 - r2, len));
    const filledT = elTxt(c, "filled") === "true" || (Math.max(r1, r2) > 0 && t >= Math.max(r1, r2) * 0.999);
    const sh = orkShell(rAt, len, t, filledT);
    m = rho * sh.V;
    cg = x + sh.x;
    const sparts = [];
    for (const [end, sx] of [
      ["fore", -1],
      ["aft", 1],
    ]) {
      const sl = elNum(c, end + "shoulderlength"),
        sr = elNum(c, end + "shoulderradius"),
        st = Math.min(elNum(c, end + "shoulderthickness", 0.002), sr);
      if (!(sl > 0 && sr > 0)) continue;
      const mid = sx < 0 ? x - sl / 2 : x + len + sl / 2;
      sparts.push([rho * Math.PI * (sr * sr - Math.max(sr - st, 0) ** 2) * sl, mid]);
      if (elTxt(c, end + "shouldercapped") === "true" && st < sr)
        sparts.push([rho * Math.PI * Math.max(sr - st, 0) ** 2 * st, sx < 0 ? x - sl + st / 2 : x + len + sl - st / 2]);
    }
    for (const [pm, px] of sparts)
      if (pm > 0 && isFinite(px)) {
        cg = (m * cg + pm * px) / (m + pm);
        m += pm;
      }
  }
  const ro = Math.max(r1, r2);
  rd.transitions.push({ x, len, d1: 2 * r1, d2: 2 * r2 });
  rd.R.last = r2;
  if (parent.top)
    rd.segments.push({
      kind: "trans",
      x,
      len,
      r1,
      r2,
      shape: tshp,
      param: tp,
      rs: cfin,
      si: rd.curStage,
      cdo: odc(rd, c),
      wt: t,
      wd: rho,
    });
  if (parent.podTop) rd.podCur.segs.push({ kind: "trans", x, len, r1, r2, shape: tshp, param: tp, rs: cfin });
  return { m, cg, ro };
}
/**
 * A launch lug (or, tagged by this app, a rail-type lug).
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readLug(rd, c, x, parent, { len, rho }) {
  const ro = elNum(c, "radius", elNum(c, "outerradius", 0.003));
  const ri = Math.max(ro - elNum(c, "thickness", 0.0005), 0);
  const cnt = Math.max(1, elNum(c, "instancecount", 1));
  const m = rho * Math.PI * (ro * ro - ri * ri) * len * cnt;
  // a rail-type lug (this app's): a solid slider, w wide and 2·ro tall, riding a 1010 or 1515 rail
  // a rail-type lug the app saved (tagged): a solid slider, w wide and 2·ro tall, riding a 1010 or 1515 rail. An
  // untagged solid lug keeps the file's own shape (a solid cylinder), as OpenRocket flies it
  const tagged = (elTxt(c, "prfllug") || "").trim(),
    rail = ["r1010", "r1515"].includes(tagged) ? tagged : "";
  rd.lugs.push({
    x,
    ro,
    ri,
    len,
    n: cnt,
    si: rd.curStage,
    cdo: odc(rd, c),
    ...(rail ? { rail, w: elNum(c, "prfllugw", rail === "r1515" ? 0.0157 : 0.0102) } : {}),
  });
  return { m, ro, ri };
}
/**
 * Rail buttons: their weight as OpenRocket works it out, and each one for its drag.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readButtons(rd, c, x, parent, { len, rho }) {
  const od = elNum(c, "outerdiameter", 0.0097),
    id = elNum(c, "innerdiameter", 0.008),
    h = elNum(c, "height", 0.0097),
    fl = elNum(c, "flangeheight", 0.002),
    bs = elNum(c, "baseheight", 0.002);
  const cnt = Math.max(1, elNum(c, "instancecount", 1)),
    sep = elNum(c, "instanceseparation", 0);
  // weight as OpenRocket works it out: the base and flange discs at the outside diameter and the waist at the
  // inside diameter, in the button's material (Delrin when the file names none)
  const m = (rho || 1150) * Math.PI * ((od / 2) ** 2 * (bs + fl) + (id / 2) ** 2 * Math.max(h - fl - bs, 0)) * cnt;
  const cg = x + od / 2 + ((cnt - 1) * sep) / 2;
  for (let i = 0; i < cnt; i++)
    rd.buttons.push({
      x: x + i * sep,
      od,
      id,
      h,
      ih: Math.max(h - fl - bs, 0),
      si: rd.curStage,
      cdo: i === 0 ? odc(rd, c) : 0,
    });
  return { m, cg };
}
/**
 * An inner tube or tube coupler: its weight, and its motor if it is a motor mount.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readInnerTube(rd, c, x, parent, { tag, len, rho }) {
  const ro = elIsAuto(c, "outerradius") ? parent.ri || 0 : elNum(c, "outerradius");
  const ri = Math.max(ro - elNum(c, "thickness", 0.001), 0);
  const m = rho * Math.PI * (ro * ro - ri * ri) * len;
  if (tag === "innertube") motorMountIn(rd, c, ri, true, x + len);
  return { m, ro, ri };
}
/**
 * A centering ring, bulkhead or engine block: its weight.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readRing(rd, c, x, parent, { tag, len, rho }) {
  let ri = 0;
  const ro = elIsAuto(c, "outerradius") ? parent.ri || 0 : elNum(c, "outerradius");
  ri = elIsAuto(c, "innerradius") ? parent.innerOR || 0 : elNum(c, "innerradius");
  if (tag === "bulkhead") ri = 0;
  // an engine block is a ring given by its thickness (it has no inner radius of its own in the file)
  if (tag === "engineblock" && elKid(c, "thickness") && !elKid(c, "innerradius"))
    ri = Math.max(ro - elNum(c, "thickness"), 0);
  const m = rho * Math.PI * Math.max(ro * ro - ri * ri, 0) * len;
  return { m, ro, ri };
}
/**
 * A fin set's shape: root and tip chords, span, sweep and area. An elliptical or free-form set also keeps its outline,
 * and is given the trapezoid of equal area and span that stands in for it where a trapezoid is needed.
 * @param {object} rd the reading (for the note that the exact shape is kept)
 * @param {Element} c the fin set
 * @param {string} tag its tag
 * @returns {{root:number, tip:number, span:number, sweep:number, area:number, outline:number[][]|null,
 *   xcen:number|null}} outline: the fin's points from its root's leading edge; xcen: its centroid behind that edge
 */
function finShape(rd, c, tag) {
  let root,
    tip,
    span,
    sweep,
    area,
    outline = null,
    xcen = null;
  if (tag === "trapezoidfinset") {
    root = elNum(c, "rootchord");
    tip = elNum(c, "tipchord");
    span = elNum(c, "height");
    sweep = elNum(c, "sweeplength");
    area = ((root + tip) / 2) * span;
  } else if (tag === "ellipticalfinset") {
    root = elNum(c, "rootchord");
    span = elNum(c, "height");
    area = (Math.PI / 4) * root * span;
    tip = Math.max((2 * area) / span - root, 0);
    sweep = (root - tip) / 2;
    outline = [];
    for (let i = 0; i <= 36; i++) {
      const th = (Math.PI * i) / 36;
      outline.push([(root / 2) * (1 - Math.cos(th)), span * Math.sin(th)]);
    }
    if (!rd.notes.includes(ORK_EL_NOTE)) rd.notes.push(ORK_EL_NOTE);
  } else {
    const f = orkFinOutline(c);
    root = f.root;
    span = f.span;
    area = f.area;
    tip = Math.max((2 * area) / span - root, 0);
    outline = f.norm;
    xcen = f.xc;
    // equal area and span, with the sweep set so the trapezoid's lift acts where the real fin's does (quarter of the mean aerodynamic chord)
    const K = (root + tip - (root * tip) / (root + tip || 1)) / 6;
    sweep =
      f.cpq != null && root + 2 * tip > 0
        ? ((f.cpq - K) * 3 * (root + tip)) / (root + 2 * tip)
        : (3 * (root + tip) * f.xc - (root * root + root * tip + tip * tip)) / (root + 2 * tip || 1);
    sweep = Math.min(Math.max(sweep, -tip), root);
    if (!rd.notes.includes(ORK_FF_NOTE)) rd.notes.push(ORK_FF_NOTE);
  }
  return { root, tip, span, sweep, area, outline, xcen };
}
/**
 * The weight of a fin set's tabs (through-the-wall): a rectangle of the fin's own material inside the body.
 * @param {Element} c the fin set
 * @param {number} root its root chord, m
 * @param {number} rho its material's density, kg/m³
 * @param {number} t its thickness, m
 * @param {number} n how many fins
 * @returns {{m:number, x:number}} the tabs' weight, kg, and their middle behind the root's leading edge, m
 */
function finTabs(c, root, rho, t, n) {
  const tabH = elNum(c, "tabheight", 0),
    tabL = Math.min(elNum(c, "tablength", 0), root);
  let tabM = 0,
    tabX = 0;
  if (tabH > 0 && tabL > 0) {
    const tp = [...c.children].filter((e) => e.tagName === "tabposition").pop(),
      rel = (tp?.getAttribute("relativeto") || "top").toLowerCase(),
      off = tp ? parseFloat(tp.textContent) || 0 : 0;
    const x0t =
      rel === "middle" || rel === "center"
        ? (root - tabL) / 2 + off
        : rel === "bottom" || rel === "end"
          ? root - tabL + off
          : off;
    tabM = rho * tabH * tabL * t * n;
    tabX = x0t + tabL / 2;
  }
  return { m: tabM, x: tabX };
}
/**
 * The weight of a fin set's fillets: the wedge between each side of a fin and the body, as OpenRocket sizes it (the
 * fillet's arc, tangent to the fin and to the round body), along the root, in the fillet's own material.
 * @param {Element} c the fin set
 * @param {number} root its root chord, m
 * @param {number} rho the fins' own density, used when the fillet names no material, kg/m³
 * @param {number} n how many fins
 * @param {number} bodyR the radius of the body the fins are on, m
 * @returns {number} kg
 */
function finFillets(c, root, rho, n, bodyR) {
  const filR = elNum(c, "filletradius", 0);
  let filM = 0;
  if (filR > 0 && bodyR > 0) {
    const hyp = filR + bodyR,
      ia = Math.asin(filR / hyp),
      oa = Math.acos(filR / hyp),
      sec = (Math.tan(oa) * filR * filR) / 2 - (oa * filR * filR) / 2 - (ia * bodyR * bodyR) / 2;
    filM = Math.max(sec, 0) * 2 * root * (elDens(c, "filletmaterial") || rho) * n;
  }
  return filM;
}
/**
 * A fin set (trapezoidal, elliptical or free-form): its shape, and its weight with its tabs and fillets.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readFins(rd, c, x, parent, { tag, cfin, rho }) {
  const n = elNum(c, "fincount", 3),
    t = elNum(c, "thickness", 0.003);
  const { root, tip, span, sweep, area, outline, xcen } = finShape(rd, c, tag);
  // the section's own shape: rounded, beveled or airfoiled edges take material off the slab (finSectionShare)
  const share = finSectionShare(
    (elTxt(c, "crosssection") || "square").toLowerCase(),
    finTeEdge(elTxt(c, "prfltrailingedge") || ""),
    t,
    span > 0 ? area / span : root,
    elNum(c, "prflbevelle", 0),
    elNum(c, "prflbevelte", 0),
  );
  let m = rho * area * t * n * share;
  const tab = finTabs(c, root, rho, t, n),
    tabM = tab.m,
    tabX = tab.x,
    filM = finFillets(c, root, rho, n, parent.ro || 0);
  const xbar =
    xcen != null ? xcen : (sweep * (root + 2 * tip) + (root * root + root * tip + tip * tip)) / (3 * (root + tip || 1));
  let cg = x + (isFinite(xbar) ? xbar : root / 2);
  if (tabM + filM > 0) {
    cg = (m * cg + tabM * (x + tabX) + filM * (x + root / 2)) / (m + tabM + filM);
    m += tabM + filM;
  }
  rd.fins.push({
    n,
    root,
    tip,
    span,
    sweep,
    t,
    x,
    mat: (elKid(c, "material")?.textContent || "").trim(),
    rho,
    cant: elNum(c, "cant", 0),
    pts: outline,
    edge: (elTxt(c, "crosssection") || "square").toLowerCase(),
    // the app's own trailing edge, set apart from the section (not part of OpenRocket's format)
    edgeTE: finTeEdge(elTxt(c, "prfltrailingedge") || ""),
    // the app's own bevel lengths (beveled fins; not part of OpenRocket's format)
    bevLE: elNum(c, "prflbevelle", 0),
    bevTE: elNum(c, "prflbevelte", 0),
    // the app's own leading-edge radius on a sharp section (not part of OpenRocket's format)
    ler: elNum(c, "prflleradius", 0),
    rs: cfin,
    si: rd.curStage,
    cdo: odc(rd, c),
    oi: ord(rd, c, "f", ORK_FINRE),
    par: parent ? parent.uid : 0,
    // on a pod: every pod's fins, around the pod's own body
    ...(rd.podCur ? { n: n * rd.podK, rb: parent.ro || 0, pod: rd.podCur.i, sb: rd.sbCur ? rd.sbCur.i : null } : {}),
  });
  return { m, cg };
}
/**
 * A mass component; with this app's tags, a protuberance on the outside of the body.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @returns {{m:number}} its weight
 */
function readMass(rd, c, x) {
  const m = elNum(c, "mass");
  // a protuberance on the outside of the body: this app's tags on an OpenRocket mass (see the builder's "bump")
  if (elTxt(c, "prflbump"))
    rd.bumps.push({
      x,
      len: elNum(c, "packedlength"),
      w: elNum(c, "prflbumpw"),
      h: elNum(c, "prflbumph"),
      end: elNum(c, "prflbumpend", 0),
      shape: elTxt(c, "prflbump").trim(),
      // its weight and where around the body it sits, for the sideways pull of an item on one side.
      // A fly-away rail guide is on the rocket only while it is on the rail: its weight is kept apart (m is 0 in the file)
      mass: elTxt(c, "prflbump").trim() === "flyaway" ? elNum(c, "prflflymass", 0) : m,
      ang: elNum(c, "radialdirection", 0),
      ...(elTxt(c, "prflbump").trim() === "flyaway" ? { fly: true } : {}),
      si: rd.curStage,
    });
  return { m };
}
/**
 * A parachute: its weight, and when and how it opens in the configuration flown.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readChute(rd, c, x, parent, { rho }) {
  const d = elNum(c, "diameter"),
    lc = elNum(c, "linecount"),
    ll = elNum(c, "linelength");
  const m = rho * Math.PI * (d / 2) ** 2 + lc * ll * elDens(c, "linematerial");
  const cdS = elTxt(c, "cd");
  const cd = cdS && !/auto/i.test(cdS) ? parseFloat(cdS) : 0.8;
  const dc = [...c.children]
    .filter((e) => e.tagName === "deploymentconfiguration")
    .find((e) => e.getAttribute("configid") === rd.cfg);
  const ev = ((dc && elTxt(dc, "deployevent")) || elTxt(c, "deployevent") || "apogee").toLowerCase();
  const da = dc && elTxt(dc, "deployaltitude") != null ? elNum(dc, "deployaltitude", 0) : elNum(c, "deployaltitude", 0);
  const dd = dc && elTxt(dc, "deploydelay") != null ? elNum(dc, "deploydelay", 0) : elNum(c, "deploydelay", 0);
  rd.chutes.push({
    d,
    cd,
    ev,
    alt: da,
    dd,
    x,
    rel: /true/i.test(elTxt(c, "prflrelease") || ""),
    si: rd.curStage,
    oi: ord(rd, c, "c", ORK_CHRE),
    ...(rd.sbCur ? { sb: rd.sbCur.i } : {}),
  });
  return { m };
}
/**
 * A streamer: its weight, and its drag as a parachute of the same drag area.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readStreamer(rd, c, x, parent, { rho }) {
  const m = rho * elNum(c, "striplength") * elNum(c, "stripwidth");
  const L_ = elNum(c, "striplength"),
    W_ = elNum(c, "stripwidth");
  // streamer: modeled as a parachute with the same drag area (streamer Cd about 0.7 of strip area)
  if (L_ > 0 && W_ > 0)
    rd.chutes.push({
      d: Math.sqrt((4 * 0.7 * L_ * W_) / (Math.PI * 0.8)),
      cd: 0.8,
      ev: (elTxt(c, "deployevent") || "apogee").toLowerCase(),
      alt: elNum(c, "deployaltitude", 0),
      dd: elNum(c, "deploydelay", 0),
      x,
      si: rd.curStage,
      streamer: true,
      ...(rd.sbCur ? { sb: rd.sbCur.i } : {}),
      oi: ord(rd, c, "c", ORK_CHRE),
    });
  return { m };
}
/**
 * A shock cord: its weight.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readCord(rd, c, x, parent, { rho }) {
  const m = rho * elNum(c, "cordlength");
  return { m };
}
/**
 * A tube fin set: its tubes, for their lift, drag and weight.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on: its position, length and radii
 * @param {{tag:string, len:number, cfin:number, rho:number}} p the part's tag, length, finish roughness and material density
 * @returns {object} what it worked out of the part's weight m, balance point cg and outside and inside radii ro, ri
 */
function readTubeFins(rd, c, x, parent, { len, cfin, rho }) {
  /* tube fins: short tubes around the body, touching it. "auto" outer radius: as OpenRocket sizes them, so that
     neighbors touch each other and the body (fewer than 3: the body's radius) */
  const n = Math.max(1, elNum(c, "fincount", elNum(c, "instancecount", 6))),
    rb = parent.ro || 0;
  const sinH = Math.sin(Math.PI / n);
  const ro =
    elIsAuto(c, "radius") || elTxt(c, "radius") == null ? (n < 3 ? rb : (rb * sinH) / (1 - sinH)) : elNum(c, "radius");
  const ri = Math.max(ro - elNum(c, "thickness", 0.0005), 0);
  const m = rho * Math.PI * (ro * ro - ri * ri) * len * n;
  rd.tubeFinSets.push({
    n: n * rd.podK,
    len,
    ro,
    ri,
    x,
    rb,
    rs: cfin,
    si: rd.curStage,
    cdo: odc(rd, c),
    rot: (elNum(c, "rotation", 0) * Math.PI) / 180,
    id: elTxt(c, "id") || null,
    ...(rd.podCur ? { pod: rd.podCur.i, sb: rd.sbCur ? rd.sbCur.i : null } : {}),
  });
  return { m, ro, ri };
}
/**
 * The reader of each kind of part, by its tag.
 */
const ORK_READ = {
  nosecone: readNose,
  bodytube: readTube,
  transition: readTransition,
  launchlug: readLug,
  railbutton: readButtons,
  innertube: readInnerTube,
  tubecoupler: readInnerTube,
  centeringring: readRing,
  bulkhead: readRing,
  engineblock: readRing,
  trapezoidfinset: readFins,
  ellipticalfinset: readFins,
  freeformfinset: readFins,
  masscomponent: readMass,
  parachute: readChute,
  streamer: readStreamer,
  shockcord: readCord,
  tubefinset: readTubeFins,
};
/**
 * Parts that only hold other parts: they have no reader and no weight of their own.
 */
const ORK_HOLDERS = ["stage", "podset", "parallelstage", "subcomponents"];
/**
 * The kinds of part whose drag a Cd override can replace.
 */
const ORK_CD_PARTS = [
  "nosecone",
  "bodytube",
  "transition",
  "trapezoidfinset",
  "ellipticalfinset",
  "freeformfinset",
  "launchlug",
  "railbutton",
];
/**
 * Counts a part's Cd override for the notes, and says whether it covers the parts on it.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {string} tag its tag
 * @returns {boolean} whether the part has a Cd override that covers the parts on it
 */
function countCdOverride(rd, c, tag) {
  if (rd.cdCover > 0) {
    // covered by a parent's Cd override: counted with the parent
  } else if (odcOwn(c) > 0 && ORK_CD_PARTS.includes(tag)) rd.cdCount++;
  else if (odcOwn(c) > 0) rd.cdComp = true;
  const cdAll = rd.cdCover === 0 && odcOwn(c) > 0 && elTxt(c, "overridesubcomponentscd") === "true";
  if (cdAll) rd.cdCovered = true;
  return cdAll;
}
/**
 * A part's mean squared distance from the rocket's axis, for the roll inertia.
 * @param {object} rd the reading
 * @param {Element} c the part
 * @param {string} tag its tag
 * @param {number} ro its outside radius, m
 * @param {number} ri its inside radius, m
 * @param {object} parent the part it is on
 * @returns {number} m²
 */
function rollK2(rd, c, tag, ro, ri, parent) {
  const pr = (parent && parent.ro) || 0,
    pin = (parent && parent.ri) || pr;
  let k2 = 0;
  if (tag === "nosecone")
    k2 = (elNum(c, "thickness", 0) >= ro * 0.999 || elTxt(c, "filled") === "true" ? 0.3 : 0.5) * ro * ro;
  else if (tag === "transition") k2 = 0.5 * ro * ro;
  else if (tag === "launchlug" || tag === "tubefinset") k2 = (pr + ro) ** 2;
  else if (tag === "railbutton") k2 = (pr + elNum(c, "height", 0.0097) / 2) ** 2;
  else if (["bodytube", "innertube", "tubecoupler", "centeringring", "bulkhead", "engineblock"].includes(tag))
    k2 = (ro * ro + ri * ri) / 2;
  else if (/finset$/.test(tag)) {
    const fl = rd.fins[rd.fins.length - 1],
      sp = fl ? fl.span : 0,
      rt = fl && fl.tip != null ? fl.tip : 0,
      rr = fl ? fl.root : 0,
      yc = (sp * (rr + 2 * rt)) / (3 * (rr + rt || 1));
    k2 = (pr + yc) ** 2 + (sp * sp) / 18;
  } else if (tag === "masscomponent") {
    const rp = elNum(c, "radialposition", 0);
    k2 = rp * rp + 0.25 * pin * pin;
  } else k2 = 0.25 * pin * pin;
  return k2;
}
/**
 * Walks a pod set or a set of side boosters: everything inside, once per copy, on a body of its own.
 * @param {object} rd the reading
 * @param {Element} c the pod set or parallel stage
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the part it is on
 * @param {object} me its own position and size, as its parts' parent
 * @param {Element[]} kids its parts
 * @param {string} tag its tag
 */
function walkPod(rd, c, x, parent, me, kids, tag) {
  const saved = [rd.podK, rd.podCur, rd.sbCur, rd.podROff],
    count = Math.max(1, Math.round(elNum(c, "instancecount", 1)));
  rd.podK *= count;
  const ao = elKid(c, "angleoffset");
  // for the drawing: which part it is, its copies around the rocket (this set's own), and where the first one sits
  rd.podCur = {
    i: rd.pods.length,
    count: rd.podK,
    segs: [],
    si: rd.curStage,
    sb: null,
    id: elTxt(c, "id") || null,
    n: count,
    ang: ao ? ((parseFloat(ao.textContent) || 0) * Math.PI) / 180 : 0,
    rOff: 0,
  };
  rd.pods.push(rd.podCur);
  const ro = elKid(c, "radiusoffset"),
    rv = ro ? parseFloat(ro.textContent) || 0 : 0,
    rm = ro ? (ro.getAttribute("method") || "relative").toLowerCase() : "relative";
  // the pod's distance from the rocket's axis (for the roll inertia): from the parent's surface unless set from the axis
  rd.podROff = rm === "free" || rm === "coaxial" ? rv : (parent.ro || 0) * 1.5 + rv;
  if (tag === "parallelstage") {
    const sc = [...c.children]
      .filter((e) => e.tagName === "separationconfiguration")
      .find((e) => e.getAttribute("configid") === rd.cfg);
    rd.sbCur = {
      i: rd.sideBoosters.length,
      count: rd.podK,
      mass: 0,
      mom: 0,
      si: rd.curStage,
      event: ((sc && elTxt(sc, "separationevent")) || elTxt(c, "separationevent") || "burnout").toLowerCase(),
      delay: sc ? elNum(sc, "separationdelay", 0) : elNum(c, "separationdelay", 0),
    };
    rd.sideBoosters.push(rd.sbCur);
    rd.podCur.sb = rd.sbCur.i;
  }
  me.podTop = true;
  // a pod's "auto" sizes follow its own body, not the rocket's
  rd.R.last = 0;
  // its body parts follow one another from the pod's position, as a stage's do
  let cur = x;
  for (const k of kids) {
    const o = orkOffset(k),
      body = ORK_BODY.includes(k.tagName);
    const kx = body && (!o.method || o.method === "after") ? cur + (o.method ? o.val : 0) : orkPlace(k, me);
    orkWalk(rd, k, kx, me);
    if (body) cur = Math.max(cur, kx + orkLenOf(k));
  }
  // its distance from the rocket's axis: as set from the axis, or from the parent's surface to the pod's
  {
    const pR = Math.max(0, ...rd.podCur.segs.map((sg) => Math.max(sg.r1, sg.r2)));
    rd.podCur.rOff = rm === "free" || rm === "coaxial" ? rv : (parent.ro || 0) + rv + pR;
  }
  [rd.podK, rd.podCur, rd.sbCur, rd.podROff] = saved;
}
/**
 * Walks the parts on a part whose weight override covers them. The parent's weight stands in for theirs, but the parts
 * are still there: fins, rail buttons, launch lugs, parachutes and motor mounts keep their shape, drag and place; only
 * their weight is left out.
 * @param {object} rd the reading
 * @param {Element[]} kids the parts
 * @param {object} me the part they are on
 */
function walkCovered(rd, kids, me) {
  for (const k of kids) {
    const tm = rd.totalMass,
      mo = rd.moment,
      np = rd.massPts.length,
      sm = rd.sMass.slice(),
      so = rd.sMom.slice(),
      sb = rd.sideBoosters.map((b) => [b.mass, b.mom]);
    orkWalk(rd, k, orkPlace(k, me), me);
    rd.totalMass = tm;
    rd.moment = mo;
    rd.massPts.length = np;
    rd.sMass.length = 0;
    rd.sMass.push(...sm);
    rd.sMom.length = 0;
    rd.sMom.push(...so);
    sb.forEach(([bm, bo], i) => {
      rd.sideBoosters[i].mass = bm;
      rd.sideBoosters[i].mom = bo;
    });
  }
}
/**
 * Moves a part and everything on it so that together they balance at a point: a CG override that covers the parts on
 * it (OpenRocket's "override CG of all subcomponents"). Each weight moves by the same amount, so the spread along the
 * body is kept.
 * @param {object} rd the reading
 * @param {{tm:number, mo:number, np:number}} at0 where the sums stood before the part
 * @param {number} cg where they balance, from the nose tip, m
 */
function shiftToCg(rd, at0, cg) {
  const ma = rd.totalMass - at0.tm;
  if (ma > 0) {
    const d = cg - (rd.moment - at0.mo) / ma;
    rd.moment += ma * d;
    for (let i = at0.np; i < rd.massPts.length; i++) {
      const pt = rd.massPts[i];
      pt.x += d;
      rd.sMom[pt.si] = (rd.sMom[pt.si] || 0) + pt.m * d;
    }
    if (rd.sbCur) rd.sbCur.mom += ma * d;
  }
}
/**
 * Visits a component and its subcomponents, recording geometry and mass.
 * @param {object} rd the reading
 * @param {Element} c component
 * @param {number} x its forward end from the nose tip, m
 * @param {object} parent the parent's position and length
 */
function orkWalk(rd, c, x, parent) {
  const tag = c.tagName,
    len = orkLenOf(c);
  // the app's own finish name when the part has one, otherwise OpenRocket's
  const cfin = orkFinishRs(c);
  const rho = elDens(c);
  // the part's own reader: its weight, balance point and radii
  const read = ORK_READ[tag];
  if (!read && !ORK_HOLDERS.includes(tag)) rd.notes.push(`Skipped a “${tag}” component.`);
  let { m, cg, ro, ri } = {
    m: 0,
    cg: x + len / 2,
    ro: 0,
    ri: 0,
    ...(read ? read(rd, c, x, parent, { tag, len, cfin, rho }) : null),
  };
  if (parent.top && ORK_BODY.includes(tag))
    rd.bodyEls.push({ tag, oi: ord(rd, c, tag, new RegExp("^" + tag + "$")), x, len, si: rd.curStage });
  // the overrides: Cd (counted here, applied by the readers through odc), then weight and CG
  const cdAll = countCdOverride(rd, c, tag);
  const om = elKid(c, "overridemass"),
    oc = elKid(c, "overridecg");
  let skipKids = false;
  if (om) {
    const v = parseFloat(om.textContent);
    if (isFinite(v) && v >= 0) m = v;
    if (elTxt(c, "overridesubcomponentsmass") === "true") skipKids = true;
  }
  if (oc) {
    cg = x + (parseFloat(oc.textContent) || 0);
  }
  // loose items (cords, chutes, mass objects) are packed inside their tube: their spread can't exceed the tube's length
  const spread = ["masscomponent", "shockcord", "parachute", "streamer"].includes(tag)
    ? Math.min(len, parent && parent.len > 0 ? parent.len : len)
    : len;
  const k2 = rollK2(rd, c, tag, ro, ri, parent);
  // where the sums stood before this part, to place it and the parts on it as one when its CG override covers them
  const cgAll = !!oc && elTxt(c, "overridesubcomponentscg") === "true",
    at0 = { tm: rd.totalMass, mo: rd.moment, np: rd.massPts.length };
  addMass(rd, m, cg, spread, k2);
  if (ro > 0 && ORK_BODY.includes(tag)) rd.maxR = Math.max(rd.maxR, ro);
  if (tag === "bodytube") {
    rd.R.last = ro;
  }
  // children
  const kids = elSubs(c);
  if (cdAll) rd.cdCover++;
  const innerOR = Math.max(0, ...kids.filter((k) => k.tagName === "innertube").map((k) => elNum(k, "outerradius")));
  const me = { x, len, ri: ri || ro, ro: ro || (parent && parent.ro) || 0, innerOR, uid: ++rd.compUid };
  // pods and side boosters have their own outline: they don't change what an automatic size on the main body follows
  const lastR = rd.R.last;
  if (tag === "parallelstage") rd.parDepth++; // an OpenRocket parallel (side booster) stage: its motors' charges are its own
  if (tag === "parallelstage" && rd.offStages.has(c)) {
    // switched off in this flight configuration: not on the rocket
  } else if (tag === "podset" || tag === "parallelstage") walkPod(rd, c, x, parent, me, kids, tag);
  else if (!skipKids) for (const k of kids) orkWalk(rd, k, orkPlace(k, me), me);
  else walkCovered(rd, kids, me);
  if (cdAll) rd.cdCover--;
  if (cgAll) shiftToCg(rd, at0, cg);
  if (tag === "parallelstage") rd.parDepth--;
  if (tag === "podset" || tag === "parallelstage") rd.R.last = lastR;
}
/**
 * Reads every stage of the rocket in turn, front to back: each one's parts, where it starts and ends, when it
 * separates, and its own weight and CG overrides.
 * @param {object} rd the reading
 */
export function orkReadStages(rd) {
  for (const stage of elSubs(rd.rocket)) {
    if (stage.tagName !== "stage") continue;
    if (rd.offStages.has(stage)) {
      rd.notes.push(
        `The stage “${elTxt(stage, "name") || "stage"}” is switched off in this flight configuration, so it’s left off.`,
      );
      continue;
    }
    rd.stages++;
    rd.curStage = rd.stages - 1;
    rd.sMass[rd.curStage] = rd.sMass[rd.curStage] || 0;
    rd.sMom[rd.curStage] = rd.sMom[rd.curStage] || 0;
    rd.sX0[rd.curStage] = rd.cursor;
    {
      const sc = [...stage.children]
        .filter((e) => e.tagName === "separationconfiguration")
        .find((e) => e.getAttribute("configid") === rd.cfg);
      rd.sSep[rd.curStage] = {
        event: ((sc && elTxt(sc, "separationevent")) || elTxt(stage, "separationevent") || "burnout").toLowerCase(),
        delay: sc ? elNum(sc, "separationdelay", 0) : elNum(stage, "separationdelay", 0),
      };
    }
    const m0 = rd.totalMass,
      mo0 = rd.moment,
      x0 = rd.cursor;
    for (const c of elSubs(stage)) {
      const o = orkOffset(c);
      const x = o.method === "absolute" ? o.val : rd.cursor + (o.method && o.method !== "after" ? 0 : o.val);
      orkWalk(rd, c, x, { x: 0, len: 0, ri: 0, top: true });
      rd.cursor = Math.max(rd.cursor, x + orkLenOf(c));
    }
    // stage-level overrides (OpenRocket applies these to the whole stage when "override subcomponents" is set)
    const som = elKid(stage, "overridemass"),
      soc = elKid(stage, "overridecg");
    if (som || soc) {
      const ms = rd.totalMass - m0,
        xs = ms > 0 ? (rd.moment - mo0) / ms : (x0 + rd.cursor) / 2;
      const subsOn = elTxt(stage, "overridesubcomponentsmass") === "true";
      const newM = som ? (subsOn ? parseFloat(som.textContent) : ms + parseFloat(som.textContent)) : ms;
      const newX = soc && elTxt(stage, "overridesubcomponentscg") === "true" ? x0 + parseFloat(soc.textContent) : xs;
      rd.totalMass = m0 + newM;
      rd.moment = mo0 + newM * newX;
      rd.sMass[rd.curStage] = newM;
      rd.sMom[rd.curStage] = newM * newX;
      rd.sKnown[rd.curStage] = !!(som && subsOn);
      rd.notes.push("Used the stage weight" + (soc ? " and CG" : "") + " override from the file.");
    }
    rd.sX1[rd.curStage] = rd.cursor;
  }
}
