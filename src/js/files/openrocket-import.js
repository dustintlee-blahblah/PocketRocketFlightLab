/**
 * OpenRocket .ork import: unpacking the file (zip or gzip) and reading its rocket into this app's design.
 *
 * parseOrk walks the component tree once, adding up mass and balance, collecting the body shape, fins, recovery,
 * launch lugs and motor mounts per stage, then builds the design (finalize) for one, two or three stages. The motor
 * configuration used is the one chosen on the Motor tab (ORK_CFG), else the one the file's simulation flew, else
 * the default.
 */
import { FIN_EDGES } from "../core/units-and-fin-edges.js";
import { D, L } from "../design/defaults.js";
import { ORK_CFG, ORK_SIM } from "./save.js";
import { noseR } from "../physics/geometry.js";
/**
 * Surface roughness height of OpenRocket's finish names, m.
 */
const FINISH_RS = {
  rough: 500e-6,
  roughunfinished: 250e-6,
  unfinished: 150e-6,
  normal: 60e-6,
  smooth: 20e-6,
  optimum: 5e-6,
  polished: 2e-6,
  finishpolished: 0.5e-6,
  mirror: 0,
};
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
 * Reads an OpenRocket design.
 * @param {string} xml the design XML
 * @returns {{design:object, launch:object, notes:string[], motor:object, boosterMotor:object, firstMotor:object,
 *   motorExtras:object[], boosterExtras:object[], firstExtras:object[], src:object}} the design, launch site and
 *   conditions, notes on what was simplified, each stage's main motor (designation, maker, delay...) and extra
 *   motors, and where the parts are in the file (for saving changes back into it)
 * @throws {Error} if the file isn't a readable rocket design
 */
export function parseOrk(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The design file could not be read as XML.");
  const rocket = doc.querySelector("openrocket > rocket") || doc.getElementsByTagName("rocket")[0];
  if (!rocket) throw new Error("No rocket was found in this file.");
  const notes = [];
  /**
   * The first child element with a tag name.
   */
  const kid = (el, tag) => [...el.children].find((c) => c.tagName === tag);
  /**
   * The trimmed text of a child element, or null.
   */
  const txt = (el, tag) => {
    const c = kid(el, tag);
    return c ? c.textContent.trim() : null;
  };
  /**
   * The first number in a child element's text, or def.
   */
  const num = (el, tag, def = 0) => {
    const s = txt(el, tag);
    if (s == null) return def;
    const mm = s.match(/-?\d+(\.\d+)?(e-?\d+)?/i);
    return mm ? parseFloat(mm[0]) : def;
  };
  /**
   * True if a child element's value is OpenRocket's "auto".
   */
  const isAuto = (el, tag) => {
    const s = txt(el, tag);
    return s != null && /^\s*auto/i.test(s);
  };
  /**
   * The cached number after "auto" (may be stale).
   */
  const autoNum = (el, tag) => {
    const s = txt(el, tag) || "";
    const mm = s.match(/-?\d+(\.\d+)?(e-?\d+)?/i);
    return mm ? parseFloat(mm[0]) : 0;
  };
  // automatic radii: OpenRocket stores "auto <cached value>", and the cached value can be stale,
  // so resolve them from the neighbouring body components, as the .ork format defines automatic sizes
  let bodyOrder = [];
  /**
   * The radius of the next body part aft that has an explicit (not automatic) radius.
   */
  const nextExplicit = (c) => {
    const i = bodyOrder.indexOf(c);
    for (let j = i + 1; j < bodyOrder.length; j++) {
      const e = bodyOrder[j];
      if (e.tagName === "bodytube" && !isAuto(e, "radius")) return num(e, "radius");
      if (e.tagName === "transition" && !isAuto(e, "foreradius")) return num(e, "foreradius");
    }
    return 0;
  };
  /**
   * The density attribute of a part's material element.
   */
  const dens = (el, tag = "material") => {
    const c = kid(el, tag);
    return c ? parseFloat(c.getAttribute("density")) || 0 : 0;
  };
  /**
   * A component's subcomponents.
   */
  const subs = (el) => {
    const s = kid(el, "subcomponents");
    return s ? [...s.children] : [];
  };
  /**
   * A component's length along the body (fin root chord, packed length of recovery and mass parts).
   */
  const lenOf = (c) => {
    switch (c.tagName) {
      case "trapezoidfinset":
      case "ellipticalfinset":
        return num(c, "rootchord");
      case "freeformfinset":
        return finPts(c).root;
      case "parachute":
      case "streamer":
      case "shockcord":
      case "masscomponent":
        return num(c, "packedlength");
      default:
        return num(c, "length");
    }
  };
  const FF_NOTE =
    "Free-form fins keep their exact shape from the file; drag and stability are calculated from that shape.";
  const EL_NOTE = "Elliptical fins keep their exact shape; drag and stability are calculated from that shape.";
  /**
   * The outline of a free-form fin set from its points: root, span, area, centroid and the points.
   * @param {Element} c fin set element
   * @returns {object}
   */
  function finPts(c) {
    const fp = kid(c, "finpoints");
    if (!fp) return { root: 0, span: 0, area: 0, pts: [] };
    const pts = [...fp.children].map((p) => [parseFloat(p.getAttribute("x")), parseFloat(p.getAttribute("y"))]);
    let area = 0,
      cx = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i],
        [x2, y2] = pts[(i + 1) % pts.length],
        cr = x1 * y2 - x2 * y1;
      area += cr;
      cx += (x1 + x2) * cr;
    }
    /* OpenRocket's outline runs from the root's leading edge (the first point) round to its trailing edge (the last), and
       the fin's length, which places it on the body, is that root chord. The tip can sweep past the root's trailing edge
       (or reach ahead of its leading edge), so the outline's full extent isn't the root. */
    const xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1]),
      rootLen = pts.length > 2 ? pts[pts.length - 1][0] - pts[0][0] : 0,
      x0 = rootLen > 0 ? pts[0][0] : Math.min(...xs),
      span = Math.max(...ys);
    // quarter point of the mean aerodynamic chord, by spanwise strips (where Barrowman puts a fin's lift)
    let A2 = 0,
      M2 = 0;
    const N = 200;
    for (let k = 0; k < N; k++) {
      const y = ((k + 0.5) / N) * span;
      let lo = Infinity,
        hi = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const [xa, ya] = pts[i],
          [xb, yb] = pts[(i + 1) % pts.length];
        if ((ya - y) * (yb - y) <= 0 && ya !== yb) {
          const xx = xa + ((y - ya) / (yb - ya)) * (xb - xa);
          lo = Math.min(lo, xx);
          hi = Math.max(hi, xx);
        }
      }
      if (hi > lo) {
        const ch = hi - lo;
        A2 += ch;
        M2 += ch * (lo - x0 + ch / 4);
      }
    }
    return {
      root: rootLen > 0 ? rootLen : Math.max(...xs) - x0,
      span,
      area: Math.abs(area) / 2,
      xc: area ? cx / (3 * area) - x0 : (Math.max(...xs) - x0) / 2,
      cpq: A2 > 0 ? M2 / A2 : null,
      pts,
      norm: pts.map(([x, y]) => [x - x0, y]),
    };
  }
  /**
   * Records a motor mount's motor (for the configuration in use), cluster count, ignition and overhang.
   * @param {Element} c the tube element
   * @param {number} ri its inside radius, m
   * @param {boolean} isInner an inner tube (not a body tube flown as its own mount)
   * @param {number} xAft the tube's aft end from the nose tip, m
   *
   * a motor mount: an inner tube, or a body tube flown as its own mount (minimum diameter)
   */
  function motorMountIn(c, ri, isInner, xAft) {
    // only a tube marked as a motor mount holds motors (an inner tube around a mount must not count them again)
    if (!kid(c, "motormount") && c.getElementsByTagName("motormount").length) return;
    const mountEl = kid(c, "motormount") || c;
    const motorEls = [...mountEl.getElementsByTagName("motor")];
    const motorEl = motorEls.find((e) => e.getAttribute("configid") === cfg) || motorEls[0];
    if (isInner && sMount[curStage] == null && kid(c, "motormount")) sMount[curStage] = ord(c, "it", /^innertube$/);
    if (sMountAft[curStage] == null && kid(c, "motormount") && xAft != null) sMountAft[curStage] = xAft; // the aft end of the motor tube: where the motor sits
    if (sMountD[curStage] == null && kid(c, "motormount") && ri > 0) sMountD[curStage] = 2 * ri; // inside diameter of the motor tube
    if (motorEl) {
      const delayTxt = (txt(motorEl, "delay") || "").trim().toLowerCase(),
        ej =
          delayTxt === "" || delayTxt === "none" || delayTxt === "p" || !isFinite(parseFloat(delayTxt))
            ? null
            : parseFloat(delayTxt);
      const mo = {
        designation: (txt(motorEl, "designation") || "").trim(),
        mfr: (txt(motorEl, "manufacturer") || "").trim(),
        dia: num(motorEl, "diameter"),
        nozzle: num(motorEl, "nozzleexitdiameter", 0),
        ej,
        oi: ord(motorEl, "mo", /^motor$/),
        par: parDepth > 0,
      };
      if (!sMotor[curStage]) sMotor[curStage] = mo;
      if (!motor) motor = mo;
      const clusterCfg = (txt(c, "clusterconfiguration") || "single").trim().toLowerCase();
      const copies =
        clusterCfg === "single" ? 1 : clusterCfg === "double" ? 2 : Math.max(1, parseInt(clusterCfg, 10) || 1);
      const ignCfg = [...mountEl.getElementsByTagName("ignitionconfiguration")].find(
        (e) => e.getAttribute("configid") === cfg,
      );
      const ignEvent = (
        (ignCfg && txt(ignCfg, "ignitionevent")) ||
        txt(mountEl, "ignitionevent") ||
        "automatic"
      ).toLowerCase();
      const ignDelay =
        ignCfg && txt(ignCfg, "ignitiondelay") != null
          ? num(ignCfg, "ignitiondelay", 0)
          : num(mountEl, "ignitiondelay", 0);
      (sMotors[curStage] || (sMotors[curStage] = [])).push({
        ...mo,
        count: copies,
        ign: ignEvent,
        ignDelay: ignDelay,
        si: curStage,
      });
      if (!sIgn[curStage]) sIgn[curStage] = { event: ignEvent, delay: ignDelay };
    }
    const overhangTxt = txt(mountEl, "overhang") ?? txt(c, "overhang") ?? txt(c, "motoroverhang");
    if (overhangTxt != null) {
      R.overhang = parseFloat(overhangTxt);
      if (sOverhang[curStage] == null) sOverhang[curStage] = parseFloat(overhangTxt);
    }
  }
  /**
   * A component's axial position element: method (top, bottom, middle, absolute...) and value.
   * @param {Element} c
   * @returns {{method:string, val:number}}
   */
  function offset(c) {
    const axialEl = kid(c, "axialoffset"),
      positionEl = kid(c, "position");
    // when a file has both, OpenRocket keeps the one it reads last
    const el =
      axialEl && positionEl
        ? [...c.children].indexOf(positionEl) > [...c.children].indexOf(axialEl)
          ? positionEl
          : axialEl
        : axialEl || positionEl;
    if (!el) return { method: null, val: 0 };
    return {
      method: (el.getAttribute("method") || el.getAttribute("type") || "top").toLowerCase(),
      val: parseFloat(el.textContent) || 0,
    };
  }
  const simEls = [...doc.getElementsByTagName("simulation")];
  /**
   * The motor configuration id a simulation element flew.
   *
   * a motor configuration chosen on the Motor tab (ORK_CFG) wins; then the one the file's simulation used; then the default
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
  let tubeFins = false;
  let maxR = 0,
    totalMass = 0,
    moment = 0,
    nose = null,
    fins = [],
    chutes = [],
    motor = null,
    transitions = [],
    stages = 0,
    buttons = [],
    lugs = [],
    cdComp = false,
    segments = [];
  let cdCount = 0;
  /**
   * A part's Cd override (an override of 0 is kept as 1e-12 so it still counts as set), or 0 for none.
   */
  const odc = (c) => {
    const e = kid(c, "overridecd");
    const v = e ? parseFloat(e.textContent) : 0;
    return !isFinite(v) || v < 0 ? 0 : v > 0 ? v : e ? 1e-12 : 0;
  }; // an override of 0 (OpenRocket: the part adds no drag) is kept as 1e-12
  let compUid = 0; // numbers each component, so fin sets know which body they're on
  let curStage = 0,
    parDepth = 0;
  const sMountAft = [],
    sKnown = [],
    sMass = [],
    sMom = [],
    sX0 = [],
    sX1 = [],
    sOverhang = [],
    sMotor = [],
    sMotors = [],
    sIgn = [],
    sSep = [];
  const R = {};
  const ORD = {};
  /**
   * The index of an element among all elements of matching tags (how parts are found again when saving).
   */
  const ord = (el, key, re) => {
    if (!ORD[key]) ORD[key] = [...rocket.getElementsByTagName("*")].filter((e) => re.test(e.tagName));
    return ORD[key].indexOf(el);
  };
  const FINRE = /^(trapezoid|elliptical|freeform)finset$/,
    CHRE = /^(parachute|streamer)$/;
  const bodyEls = [],
    sMount = [],
    sMountD = [],
    SRC = {};
  const massPts = [];
  /**
   * Adds a point mass to the rocket's totals and to the current stage.
   * @param {number} m kg
   * @param {number} x position of its CG from the nose tip, m
   * @param {number} [len=0] its length, for the inertia estimate
   * @param {number} [k2=0] its own radius of gyration squared, m²
   */
  function addMass(m, x, len = 0, k2 = 0) {
    if (m > 0 && isFinite(x)) {
      totalMass += m;
      moment += m * x;
      sMass[curStage] = (sMass[curStage] || 0) + m;
      sMom[curStage] = (sMom[curStage] || 0) + m * x;
      massPts.push({ m, x, len: Math.max(len || 0, 0), k2: isFinite(k2) ? k2 : 0, si: curStage });
    }
  }
  /**
   * Visits a component and its subcomponents, recording geometry and mass.
   * @param {Element} c component
   * @param {number} x its forward end from the nose tip, m
   * @param {object} parent the parent's position and length
   */
  function walk(c, x, parent) {
    // returns nothing; x is absolute top of component
    const tag = c.tagName,
      len = lenOf(c);
    const cfin = FINISH_RS[(txt(c, "finish") || "").trim().toLowerCase()];
    let m = 0,
      cg = x + len / 2,
      ro = 0,
      ri = 0;
    const rho = dens(c);
    if (tag === "nosecone") {
      ro = isAuto(c, "aftradius") ? R.last || nextExplicit(c) || autoNum(c, "aftradius") : num(c, "aftradius");
      const shape = (txt(c, "shape") || "ogive").toLowerCase();
      // OpenRocket marks a solid nose by a wall as thick as the radius
      const filled =
        txt(c, "filled") === "true" ||
        /filled/i.test(txt(c, "thickness") || "") ||
        (ro > 0 && num(c, "thickness", 0) >= ro * 0.999);
      const t = filled ? ro : num(c, "thickness", 0.002);
      const defP = { ogive: 1, power: 0.5, parabolic: 1, haack: 0 }[shape] ?? 0;
      const sp = txt(c, "shapeparameter") != null ? num(c, "shapeparameter", defP) : defP;
      const shp = ["ogive", "conical", "ellipsoid", "parabolic", "power", "haack"].includes(shape) ? shape : "ogive";
      // weight and balance point from the actual nose profile (solid, or a shell of the given thickness)
      {
        const sh = orkShell((u) => noseR(shp, sp, u, ro, len), len, t, filled);
        m = rho * sh.V;
        cg = x + (sh.V > 0 ? sh.x : len * 0.6);
      }
      const sl = num(c, "aftshoulderlength"),
        sr = num(c, "aftshoulderradius"),
        st = Math.min(num(c, "aftshoulderthickness", 0.002), sr);
      // the shoulder is part of the nose cone's own mass, so a mass override on the nose replaces both
      if (sl > 0 && sr > 0) {
        const parts = [[rho * Math.PI * (sr * sr - Math.max(sr - st, 0) ** 2) * sl, x + len + sl / 2]];
        if (txt(c, "aftshouldercapped") === "true" && st < sr)
          parts.push([rho * Math.PI * Math.max(sr - st, 0) ** 2 * st, x + len + sl - st / 2]);
        for (const [pm, px] of parts) {
          if (pm > 0 && isFinite(px)) {
            cg = (m * cg + pm * px) / (m + pm);
            m += pm;
          }
        }
      }
      R.last = ro;
      if (!nose) nose = { len, r: ro, shape: shp + ":" + +sp.toFixed(4), x, oi: ord(c, "nc", /^nosecone$/) };
      if (parent.top)
        segments.push({
          kind: "nose",
          x,
          len,
          r1: 0,
          r2: ro,
          shape: shp,
          param: sp,
          rs: cfin,
          si: curStage,
          cdo: odc(c),
        });
      if (!["ogive", "conical", "ellipsoid", "parabolic", "power", "haack"].includes(shape))
        notes.push(`Nose shape “${shape}” was treated as ogive.`);
    } else if (tag === "bodytube") {
      ro = isAuto(c, "radius") ? R.last || nextExplicit(c) || autoNum(c, "radius") : num(c, "radius");
      ri = Math.max(ro - num(c, "thickness", 0.001), 0);
      m = rho * Math.PI * (ro * ro - ri * ri) * len;
      if (parent.top) segments.push({ kind: "tube", x, len, r1: ro, r2: ro, rs: cfin, si: curStage, cdo: odc(c) });
      if (kid(c, "motormount")) {
        motorMountIn(c, ri, false, x + len);
        if (sMountD[curStage] == null && ri > 0) sMountD[curStage] = 2 * ri;
      }
    } else if (tag === "transition") {
      const r1 = isAuto(c, "foreradius") ? R.last || autoNum(c, "foreradius") : num(c, "foreradius"),
        r2 = isAuto(c, "aftradius") ? nextExplicit(c) || autoNum(c, "aftradius") || r1 : num(c, "aftradius");
      const t = num(c, "thickness", 0.002);
      const tsh = (txt(c, "shape") || "conical").toLowerCase(),
        tshp = ["ogive", "conical", "ellipsoid", "parabolic", "power", "haack"].includes(tsh) ? tsh : "conical";
      const tp =
        txt(c, "shapeparameter") != null
          ? num(c, "shapeparameter", 0)
          : ({ ogive: 1, power: 0.5, parabolic: 1 }[tshp] ?? 0);
      // weight and balance point from its profile, with its shoulders, as OpenRocket works them out
      {
        const rAt = (u) =>
          r1 <= r2 ? r1 + noseR(tshp, tp, u, r2 - r1, len) : r2 + noseR(tshp, tp, len - u, r1 - r2, len);
        const filledT = txt(c, "filled") === "true" || (Math.max(r1, r2) > 0 && t >= Math.max(r1, r2) * 0.999);
        const sh = orkShell(rAt, len, t, filledT);
        m = rho * sh.V;
        cg = x + sh.x;
        const sparts = [];
        for (const [end, sx] of [
          ["fore", -1],
          ["aft", 1],
        ]) {
          const sl = num(c, end + "shoulderlength"),
            sr = num(c, end + "shoulderradius"),
            st = Math.min(num(c, end + "shoulderthickness", 0.002), sr);
          if (!(sl > 0 && sr > 0)) continue;
          const mid = sx < 0 ? x - sl / 2 : x + len + sl / 2;
          sparts.push([rho * Math.PI * (sr * sr - Math.max(sr - st, 0) ** 2) * sl, mid]);
          if (txt(c, end + "shouldercapped") === "true" && st < sr)
            sparts.push([
              rho * Math.PI * Math.max(sr - st, 0) ** 2 * st,
              sx < 0 ? x - sl + st / 2 : x + len + sl - st / 2,
            ]);
        }
        for (const [pm, px] of sparts)
          if (pm > 0 && isFinite(px)) {
            cg = (m * cg + pm * px) / (m + pm);
            m += pm;
          }
      }
      ro = Math.max(r1, r2);
      transitions.push({ x, len, d1: 2 * r1, d2: 2 * r2 });
      R.last = r2;
      if (parent.top)
        segments.push({ kind: "trans", x, len, r1, r2, shape: tshp, param: tp, rs: cfin, si: curStage, cdo: odc(c) });
    } else if (tag === "launchlug") {
      ro = num(c, "radius", num(c, "outerradius", 0.003));
      ri = Math.max(ro - num(c, "thickness", 0.0005), 0);
      const cnt = Math.max(1, num(c, "instancecount", 1));
      m = rho * Math.PI * (ro * ro - ri * ri) * len * cnt;
      lugs.push({ x, ro, ri, len, n: cnt, si: curStage, cdo: odc(c) });
    } else if (tag === "railbutton") {
      const od = num(c, "outerdiameter", 0.0097),
        id = num(c, "innerdiameter", 0.008),
        h = num(c, "height", 0.0097),
        fl = num(c, "flangeheight", 0.002),
        bs = num(c, "baseheight", 0.002);
      const cnt = Math.max(1, num(c, "instancecount", 1)),
        sep = num(c, "instanceseparation", 0);
      for (let i = 0; i < cnt; i++)
        buttons.push({
          x: x + i * sep,
          od,
          id,
          h,
          ih: Math.max(h - fl - bs, 0),
          si: curStage,
          cdo: i === 0 ? odc(c) : 0,
        });
    } else if (tag === "innertube" || tag === "tubecoupler") {
      ro = isAuto(c, "outerradius") ? parent.ri || 0 : num(c, "outerradius");
      ri = Math.max(ro - num(c, "thickness", 0.001), 0);
      m = rho * Math.PI * (ro * ro - ri * ri) * len;
      if (tag === "innertube") motorMountIn(c, ri, true, x + len);
    } else if (tag === "centeringring" || tag === "bulkhead" || tag === "engineblock") {
      ro = isAuto(c, "outerradius") ? parent.ri || 0 : num(c, "outerradius");
      ri = isAuto(c, "innerradius") ? parent.innerOR || 0 : num(c, "innerradius");
      if (tag === "bulkhead") ri = 0;
      m = rho * Math.PI * Math.max(ro * ro - ri * ri, 0) * len;
    } else if (tag === "trapezoidfinset" || tag === "ellipticalfinset" || tag === "freeformfinset") {
      const n = num(c, "fincount", 3),
        t = num(c, "thickness", 0.003);
      let root,
        tip,
        span,
        sweep,
        area,
        outline = null,
        xcen = null;
      if (tag === "trapezoidfinset") {
        root = num(c, "rootchord");
        tip = num(c, "tipchord");
        span = num(c, "height");
        sweep = num(c, "sweeplength");
        area = ((root + tip) / 2) * span;
      } else if (tag === "ellipticalfinset") {
        root = num(c, "rootchord");
        span = num(c, "height");
        area = (Math.PI / 4) * root * span;
        tip = Math.max((2 * area) / span - root, 0);
        sweep = (root - tip) / 2;
        outline = [];
        for (let i = 0; i <= 36; i++) {
          const th = (Math.PI * i) / 36;
          outline.push([(root / 2) * (1 - Math.cos(th)), span * Math.sin(th)]);
        }
        if (!notes.includes(EL_NOTE)) notes.push(EL_NOTE);
      } else {
        const f = finPts(c);
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
        if (!notes.includes(FF_NOTE)) notes.push(FF_NOTE);
      }
      m = rho * area * t * n;
      const xbar =
        xcen != null
          ? xcen
          : (sweep * (root + 2 * tip) + (root * root + root * tip + tip * tip)) / (3 * (root + tip || 1));
      cg = x + (isFinite(xbar) ? xbar : root / 2);
      fins.push({
        n,
        root,
        tip,
        span,
        sweep,
        t,
        x,
        mat: (kid(c, "material")?.textContent || "").trim(),
        rho,
        cant: num(c, "cant", 0),
        pts: outline,
        edge: (txt(c, "crosssection") || "square").toLowerCase(),
        rs: cfin,
        si: curStage,
        cdo: odc(c),
        oi: ord(c, "f", FINRE),
        par: parent ? parent.uid : 0,
      });
    } else if (tag === "masscomponent") {
      m = num(c, "mass");
    } else if (tag === "parachute") {
      const d = num(c, "diameter"),
        lc = num(c, "linecount"),
        ll = num(c, "linelength");
      m = rho * Math.PI * (d / 2) ** 2 + lc * ll * dens(c, "linematerial");
      const cdS = txt(c, "cd");
      const cd = cdS && !/auto/i.test(cdS) ? parseFloat(cdS) : 0.8;
      const dc = [...c.children]
        .filter((e) => e.tagName === "deploymentconfiguration")
        .find((e) => e.getAttribute("configid") === cfg);
      const ev = ((dc && txt(dc, "deployevent")) || txt(c, "deployevent") || "apogee").toLowerCase();
      const da = dc && txt(dc, "deployaltitude") != null ? num(dc, "deployaltitude", 0) : num(c, "deployaltitude", 0);
      const dd = dc && txt(dc, "deploydelay") != null ? num(dc, "deploydelay", 0) : num(c, "deploydelay", 0);
      chutes.push({ d, cd, ev, alt: da, dd, x, si: curStage, oi: ord(c, "c", CHRE) });
    } else if (tag === "streamer") {
      m = rho * num(c, "striplength") * num(c, "stripwidth");
      const L_ = num(c, "striplength"),
        W_ = num(c, "stripwidth");
      // streamer: modeled as a parachute with the same drag area (streamer Cd about 0.7 of strip area)
      if (L_ > 0 && W_ > 0)
        chutes.push({
          d: Math.sqrt((4 * 0.7 * L_ * W_) / (Math.PI * 0.8)),
          cd: 0.8,
          ev: (txt(c, "deployevent") || "apogee").toLowerCase(),
          alt: num(c, "deployaltitude", 0),
          dd: num(c, "deploydelay", 0),
          x,
          si: curStage,
          streamer: true,
          oi: ord(c, "c", CHRE),
        });
    } else if (tag === "shockcord") {
      m = rho * num(c, "cordlength");
    } else if (tag === "stage" || tag === "podset" || tag === "parallelstage") {
      m = 0;
    } else if (tag === "tubefinset") tubeFins = true;
    else if (tag !== "subcomponents") {
      notes.push(`Skipped a “${tag}” component.`);
    }
    if (parent.top && ["nosecone", "bodytube", "transition"].includes(tag))
      bodyEls.push({ tag, oi: ord(c, tag, new RegExp("^" + tag + "$")), x, len, si: curStage });
    if (
      odc(c) > 0 &&
      [
        "nosecone",
        "bodytube",
        "transition",
        "trapezoidfinset",
        "ellipticalfinset",
        "freeformfinset",
        "launchlug",
        "railbutton",
      ].includes(tag)
    )
      cdCount++;
    else if (odc(c) > 0) cdComp = true;
    const om = kid(c, "overridemass"),
      oc = kid(c, "overridecg");
    let skipKids = false;
    if (om) {
      const v = parseFloat(om.textContent);
      if (isFinite(v) && v >= 0) m = v;
      if (txt(c, "overridesubcomponentsmass") === "true") skipKids = true;
    }
    if (oc) {
      cg = x + (parseFloat(oc.textContent) || 0);
    }
    // loose items (cords, chutes, mass objects) are packed inside their tube: their spread can't exceed the tube's length
    const spread = ["masscomponent", "shockcord", "parachute", "streamer"].includes(tag)
      ? Math.min(len, parent && parent.len > 0 ? parent.len : len)
      : len;
    // mean squared distance from the rocket's axis, for the roll inertia
    const pr = (parent && parent.ro) || 0,
      pin = (parent && parent.ri) || pr;
    let k2 = 0;
    if (tag === "nosecone")
      k2 = (num(c, "thickness", 0) >= ro * 0.999 || txt(c, "filled") === "true" ? 0.3 : 0.5) * ro * ro;
    else if (tag === "transition") k2 = 0.5 * ro * ro;
    else if (tag === "launchlug") k2 = (pr + ro) ** 2;
    else if (["bodytube", "innertube", "tubecoupler", "centeringring", "bulkhead", "engineblock"].includes(tag))
      k2 = (ro * ro + ri * ri) / 2;
    else if (/finset$/.test(tag)) {
      const fl = fins[fins.length - 1],
        sp = fl ? fl.span : 0,
        rt = fl && fl.tip != null ? fl.tip : 0,
        rr = fl ? fl.root : 0,
        yc = (sp * (rr + 2 * rt)) / (3 * (rr + rt || 1));
      k2 = (pr + yc) ** 2 + (sp * sp) / 18;
    } else if (tag === "masscomponent") {
      const rp = num(c, "radialposition", 0);
      k2 = rp * rp + 0.25 * pin * pin;
    } else k2 = 0.25 * pin * pin;
    if (!skipKids || !om) addMass(m, cg, spread, k2);
    else addMass(m, cg, spread, k2);
    if (ro > 0 && ["nosecone", "bodytube", "transition"].includes(tag)) maxR = Math.max(maxR, ro);
    if (tag === "bodytube") {
      R.last = ro;
    }
    // children
    const kids = subs(c);
    const innerOR = Math.max(0, ...kids.filter((k) => k.tagName === "innertube").map((k) => num(k, "outerradius")));
    const me = { x, len, ri: ri || ro, ro: ro || (parent && parent.ro) || 0, innerOR, uid: ++compUid };
    // pods and side boosters have their own outline: they don't change what an automatic size on the main body follows
    const lastR = R.last;
    if (tag === "parallelstage") parDepth++; // an OpenRocket parallel (side booster) stage: its motors' charges are its own
    if (!skipKids) for (const k of kids) walk(k, place(k, me), me);
    else
      for (const k of kids) {
        if (/finset/.test(k.tagName) || k.tagName === "parachute" || k.tagName === "innertube") {
          const tm = totalMass,
            mo = moment,
            np = massPts.length;
          walk(k, place(k, me), me);
          totalMass = tm;
          moment = mo;
          massPts.length = np;
        }
      }
    if (tag === "parallelstage") parDepth--;
    if (tag === "podset" || tag === "parallelstage") R.last = lastR;
  }
  /**
   * The forward end of a component, from its position method relative to its parent.
   * @param {Element} k component
   * @param {{x:number, len:number}} p parent
   * @returns {number} m from the nose tip
   */
  function place(k, p) {
    const o = offset(k),
      len = lenOf(k);
    switch (o.method) {
      case "bottom":
        return p.x + p.len - len + o.val;
      case "middle":
        return p.x + (p.len - len) / 2 + o.val;
      case "absolute":
        return o.val;
      default:
        return p.x + o.val;
    }
  }
  bodyOrder = subs(rocket)
    .filter((s) => s.tagName === "stage")
    .flatMap((s) => subs(s))
    .filter((c) => ["nosecone", "bodytube", "transition"].includes(c.tagName));
  let cursor = 0;
  for (const stage of subs(rocket)) {
    if (stage.tagName !== "stage") continue;
    stages++;
    curStage = stages - 1;
    sMass[curStage] = sMass[curStage] || 0;
    sMom[curStage] = sMom[curStage] || 0;
    sX0[curStage] = cursor;
    {
      const sc = [...stage.children]
        .filter((e) => e.tagName === "separationconfiguration")
        .find((e) => e.getAttribute("configid") === cfg);
      sSep[curStage] = {
        event: ((sc && txt(sc, "separationevent")) || txt(stage, "separationevent") || "burnout").toLowerCase(),
        delay: sc ? num(sc, "separationdelay", 0) : num(stage, "separationdelay", 0),
      };
    }
    const m0 = totalMass,
      mo0 = moment,
      x0 = cursor;
    for (const c of subs(stage)) {
      const o = offset(c);
      const x = o.method === "absolute" ? o.val : cursor + (o.method && o.method !== "after" ? 0 : o.val);
      walk(c, x, { x: 0, len: 0, ri: 0, top: true });
      cursor = Math.max(cursor, x + lenOf(c));
    }
    // stage-level overrides (OpenRocket applies these to the whole stage when "override subcomponents" is set)
    const som = kid(stage, "overridemass"),
      soc = kid(stage, "overridecg");
    if (som || soc) {
      const ms = totalMass - m0,
        xs = ms > 0 ? (moment - mo0) / ms : (x0 + cursor) / 2;
      const subsOn = txt(stage, "overridesubcomponentsmass") === "true";
      const newM = som ? (subsOn ? parseFloat(som.textContent) : ms + parseFloat(som.textContent)) : ms;
      const newX = soc && txt(stage, "overridesubcomponentscg") === "true" ? x0 + parseFloat(soc.textContent) : xs;
      totalMass = m0 + newM;
      moment = mo0 + newM * newX;
      sMass[curStage] = newM;
      sMom[curStage] = newM * newX;
      sKnown[curStage] = !!(som && subsOn);
      notes.push("Used the stage weight" + (soc ? " and CG" : "") + " override from the file.");
    }
    sX1[curStage] = cursor;
  }
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
    const rom = kid(rocket, "overridemass");
    if (rom) {
      totalMass = parseFloat(rom.textContent) || totalMass;
      notes.push("Used the rocket-level mass override.");
    }
    const rcg = kid(rocket, "overridecg");
    if (rcg && parseFloat(rcg.textContent) > 0) {
      moment = parseFloat(rcg.textContent) * totalMass;
    }
  }
  /**
   * Builds one airframe from a set of stages (sustainer [0], booster [1], or all for a single stage).
   * @param {number[]} sel stage indexes
   * @param {string} label prefix for its notes
   * @returns {object} design fields for that airframe
   *
   * build one airframe from a set of stages: sustainer = [0], booster = [1], single = all
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
    const fl = fins.filter(inS);
    if (!fl.length)
      throw new Error(
        tubeFins
          ? `${pre}This rocket has tube fins, which the app can’t model yet, so its stability and drag can’t be worked out. Designs with flat fins (trapezoidal, elliptical or free-form) open normally.`
          : `${pre}No fin set was found, so stability and drag can’t be estimated.`,
      );
    const groups = new Map();
    for (const fs of fl) {
      const k = [fs.x, fs.root, fs.span].map((v) => Math.round(v * 500)).join("|");
      const g = groups.get(k);
      if (g) {
        g.n += fs.n;
        g.oi.push(fs.oi);
      } else groups.set(k, { ...fs, oi: [fs.oi] });
    }
    const garea = (g) => ((g.n * (g.root + g.tip)) / 2) * g.span;
    // the main set is the aft-most one (its trailing edge is closest to the tail); others become extra sets
    const f = [...groups.values()].reduce((a, b) => {
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
    const EDGE0 = (e) => ({ square: "square", rounded: "rounded", airfoil: "airfoil" })[e] || "square";
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
      cdo: g.cdo || 0,
      oi: g.oi,
      par: g.par || 0,
      ...(g.pts ? { pts: g.pts } : {}),
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
      tailLen,
      tailDia,
      nose: nz ? { len: nz.len, shape: nz.shape + ":" + +(+nz.param).toFixed(4) } : null,
      f,
      extra,
      inertia,
      rollI,
      fAft: length - (f.x - x0 + f.root),
      /* negative when the fins reach past the aft end (V-2 style fins over a boattail) */ chutes: chutes.filter(inS),
      buttons: buttons.filter(inS).map(shift),
      lugs: lugs.filter(inS).map(shift),
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
      `Used the file’s Cd override on ${cdCount} part${cdCount > 1 ? "s" : ""}; it replaces the calculated drag of ${cdCount > 1 ? "those parts" : "that part"} (base drag is still calculated).`,
    );
  if (cdComp) notes.push("Cd overrides on inner parts were ignored, since inner parts have no drag of their own.");
  const ocd = [rocket, ...subs(rocket).filter((e) => e.tagName === "stage")]
    .map((e) => kid(e, "overridecd"))
    .find(Boolean);
  if (ocd) notes.push("Used the file’s Cd override for the whole rocket.");
  const FIN = FINISH_RS;
  const finTag =
    (rocket.getElementsByTagName("bodytube")[0] || rocket).getElementsByTagName("finish")[0] ||
    rocket.getElementsByTagName("finish")[0];
  /**
   * An edge type from the file, or square if this app doesn't know it.
   */
  const EDGE = (e) => (FIN_EDGES.some((x) => x[0] === e) ? e : "square");
  const f = S.f;
  const nd = {
    ...D,
    name: txt(rocket, "name") || "Imported rocket",
    length: S.length,
    diameter: S.diameter,
    noseLen: S.nose ? S.nose.len : 3 * S.diameter,
    noseShape: S.nose ? S.nose.shape : "ogive:1",
    tailLen: S.tailLen,
    tailDia: S.tailDia,
    segments: S.segs,
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
    finEdge: EDGE(f.edge),
    finCdOverride: f.cdo || 0,
    bFinCdOverride: 0,
    extraFins: S.extra,
    bExtraFins: [],
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
      bFinThick: bf.t,
      bFinAft: B.fAft,
      bFinEdge: EDGE(bf.edge),
      bFinFinish: bf.rs ?? null,
      bFinCdOverride: bf.cdo || 0,
      bExtraFins: B.extra,
      bDryInertia: B.inertia,
      bInertiaMass: B.mass,
      bInertiaSource: B.inertia > 0 ? "file" : null,
      bButtons: B.buttons,
      bLugs: B.lugs,
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
    !!kid(rocket, "overridemass") ||
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
      bFinThick: cf.t,
      bFinAft: C1.fAft,
      bFinEdge: EDGE(cf.edge),
      bFinFinish: cf.rs ?? null,
      bFinCdOverride: cf.cdo || 0,
      bExtraFins: C1.extra,
      bDryInertia: C1.inertia,
      bInertiaMass: C1.mass,
      bInertiaSource: C1.inertia > 0 ? "file" : null,
      bButtons: C1.buttons,
      bLugs: C1.lugs,
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
    out = out.map((e) => (e.si !== m0.si || !!e.par !== !!m0.par ? { ...e, ej: null } : e));
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
