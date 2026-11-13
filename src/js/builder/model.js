/**
 * The rocket builder's parts model: part types, materials, new parts and the layout of a design.
 */
/* ---------- rocket builder: parts model, .ork import and export ----------
   A design is a list of stages; each stage is a front-to-back list of body parts (nose cone, body tubes,
   transitions), and each body part holds the parts attached to it or packed inside it. Lengths in metres.
   Parts opened from a file keep their file id, so saving can carry over what the builder doesn't edit. */
/**
 * Bulk materials: [name, density kg/m³].
 */
export const BLD_BULK = [
  ["Cardboard", 680],
  ["Kraft phenolic", 950],
  ["Blue Tube", 1300],
  ["Fiberglass", 1850],
  ["Carbon fiber", 1780],
  ["Polystyrene (PS)", 1050],
  ["ABS plastic", 1020],
  ["PLA (3D printed)", 1250],
  ["Polycarbonate", 1200],
  ["Balsa", 170],
  ["Basswood", 500],
  ["Birch plywood", 630],
  ["G10 fiberglass", 1800],
  ["Aluminum", 2700],
];
/**
 * Surface materials (parachute cloth, streamers): [name, kg/m²].
 */
export const BLD_SURF = [
  ["Ripstop nylon", 0.067],
  ["Mylar", 0.021],
  ["Polyethylene (thin)", 0.01],
];
/**
 * Line materials (shock cords): [name, kg/m].
 */
export const BLD_LINE = [
  ["Kevlar 1/4 in", 0.0105],
  ["Tubular nylon 1/2 in", 0.013],
  ["Tubular nylon 1 in", 0.03],
  ["Elastic 1/4 in", 0.0013],
];
/**
 * The part types that make up the outside of the body.
 */
export const BLD_BODY = ["nose", "tube", "transition"];
/**
 * Default names of the part types.
 */
export const BLD_NAMES = {
  nose: "Nose cone",
  tube: "Body tube",
  transition: "Transition",
  fins: "Fin set",
  mount: "Motor mount",
  inner: "Inner tube",
  ring: "Centering ring",
  bulkhead: "Bulkhead",
  coupler: "Coupler",
  lug: "Launch lug",
  buttons: "Rail buttons",
  chute: "Parachute",
  streamer: "Streamer",
  cord: "Shock cord",
  mass: "Mass",
  bump: "Protuberance",
  raw: "Part from file",
};
/**
 * Shapes of a protuberance on the outside of the body (a camera, a switch box, an antenna, a shroud): [name, label].
 * Their drag: BUMP_CD in physics/aerodynamics.js.
 */
export const BLD_BUMPS = [
  ["bluff", "Blunt box"],
  ["long", "Long blunt box"],
  ["ramp", "Long box, sloped front"],
  ["round", "Upright cylinder"],
  ["faired", "Streamlined"],
  ["flyaway", "Fly-away rail guide"],
];
/**
 * Surface finishes offered: [OpenRocket name, label]. The names and roughness heights are OpenRocket's, kept so its
 * files open unchanged; the labels add what each height corresponds to in Missile DATCOM's table of equivalent sand
 * roughness (user's manual, table 5: polished metal 0.5–2 µm, carefully applied smooth matte paint 6 µm, average
 * camouflage paint 10 µm, production spray paint 30 µm), which puts paint well below OpenRocket's own words for it.
 */
export const BLD_FINISH = [
  ["mirror", "Mirror (0 µm)"],
  ["finishpolished", "Finish-polished (0.5 µm)"],
  ["polished", "Polished (2 µm)"],
  ["optimum", "Optimum paint: sanded smooth (5 µm)"],
  ["smooth", "Smooth paint: sprayed, unsanded (20 µm)"],
  ["normal", "Regular paint: rough or brushed (60 µm)"],
  ["unfinished", "Unfinished (150 µm)"],
  ["roughunfinished", "Rough unfinished (250 µm)"],
  ["rough", "Rough (500 µm)"],
];
/**
 * A new random part id (OpenRocket requires every part id to be a UUID).
 *
 * OpenRocket requires every part id to be a UUID
 */
export const bldId = () =>
  globalThis.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
/**
 * A new part with sensible sizes for the body it goes on.
 * @param {string} type part type ("nose", "tube", "fins", "chute", "mount"...)
 * @param {number} [R=0.0333] the body radius, m
 * @returns {object} part
 *
 * a new part with sensible sizes for the body it goes on (R = body radius)
 */
export function bldNew(type, R = 0.0333) {
  const id = bldId(),
    name = BLD_NAMES[type];
  switch (type) {
    case "nose":
      return {
        id,
        type,
        name,
        shape: "ogive",
        param: 1,
        len: R * 6,
        dia: 2 * R,
        wall: 0.002,
        filled: false,
        tipR: 0,
        shLen: 2 * R,
        mat: "Polystyrene (PS)",
        known: 0,
        kids: [],
      };
    case "tube":
      return { id, type, name, len: R * 16, od: 2 * R, wall: 0.0015, mat: "Blue Tube", known: 0, mm: null, kids: [] };
    case "transition":
      return {
        id,
        type,
        name,
        shape: "conical",
        param: 0,
        len: R * 2,
        dia1: 2 * R,
        dia2: 1.5 * R,
        wall: 0.002,
        mat: "Polystyrene (PS)",
        known: 0,
        kids: [],
      };
    case "fins":
      return {
        id,
        type,
        name,
        shape: "trapezoid",
        cant: 0,
        n: 3,
        root: R * 4.5,
        tip: R * 1.8,
        span: R * 2.3,
        sweep: R * 2.7,
        t: 0.003,
        edge: "rounded",
        bevLE: 0,
        bevTE: 0,
        pts: "",
        ref: "bottom",
        pos: 0,
        mat: "Birch plywood",
        known: 0,
      };
    case "mount":
      return {
        id,
        type,
        name,
        od: 0.031,
        wall: 0.0008,
        len: 0.2,
        ref: "bottom",
        pos: 0,
        overhang: 0.006,
        mat: "Kraft phenolic",
        motor: null,
        delay: null,
        cluster: "single",
        known: 0,
      };
    case "inner":
      return {
        id,
        type,
        name,
        od: 0.031,
        wall: 0.0008,
        len: 0.1,
        ref: "top",
        pos: 0.05,
        mat: "Kraft phenolic",
        known: 0,
      };
    case "ring":
      return { id, type, name, od: 0, id_: 0, len: 0.006, ref: "bottom", pos: 0.01, mat: "Birch plywood", known: 0 };
    case "bulkhead":
      return { id, type, name, od: 0, len: 0.006, ref: "top", pos: 0.02, mat: "Birch plywood", known: 0 };
    case "coupler":
      return {
        id,
        type,
        name,
        od: 0,
        wall: 0.0015,
        len: R * 3,
        ref: "bottom",
        pos: -R * 1.5,
        mat: "Kraft phenolic",
        known: 0,
      };
    case "lug":
      return {
        id,
        type,
        name,
        kind: "rod316",
        od: 0.0076,
        id_: 0.0064,
        len: 0.05,
        ref: "bottom",
        pos: 0.05,
        mat: "Cardboard",
        known: 0,
      };
    case "buttons":
      return { id, type, name, size: "1010", n: 2, sep: 0.3, ref: "bottom", pos: 0.03, known: 0 };
    case "chute":
      return {
        id,
        type,
        name,
        dia: Math.max(0.3, Math.round((R * 28) / 0.0254 / 6) * 6 * 0.0254),
        cd: 0.8,
        deploy: "apogee",
        alt: 150,
        delay: 0,
        lines: 6,
        lineLen: 0,
        ref: "top",
        pos: 0.05,
        packLen: 0.08,
        mat: "Ripstop nylon",
        known: 0,
      };
    case "streamer":
      return {
        id,
        type,
        name,
        len: 1,
        width: 0.08,
        deploy: "apogee",
        alt: 150,
        delay: 0,
        ref: "top",
        pos: 0.05,
        packLen: 0.05,
        mat: "Mylar",
        known: 0,
      };
    case "cord":
      return { id, type, name, cordLen: R * 90, ref: "top", pos: 0.04, packLen: 0.04, mat: "Kevlar 1/4 in", known: 0 };
    case "mass":
      return { id, type, name: "Mass", mass: 0.03, len: 0.03, ref: "top", pos: 0.02, known: 0 };
    case "bump":
      return {
        id,
        type,
        name,
        shape: "bluff",
        ang: 0,
        w: 0.03,
        h: 0.025,
        len: 0.05,
        mass: 0.03,
        ref: "top",
        pos: 0.1,
        known: 0,
      };
  }
}
/**
 * Design-wide builder settings that aren't parts (finish, inertia, drag adjustments), at their defaults.
 * @returns {object}
 */
/**
 * True when an override field is in use: it has a value and its Override switch isn't off. Values from a design file
 * have no switch yet and count as on.
 * @param {object} O the part, stage or rocket settings that hold it
 * @param {string} k the field (known, knownCg, cdo, cdOverride, dryInertia, bDryInertia, s1DryInertia)
 * @returns {boolean}
 */
export function bldOvOn(O, k) {
  if (!O || O[k + "On"] === false) return false;
  const v = O[k];
  return k === "knownCg" || k === "cdo" ? v != null && isFinite(v) : +v > 0;
}
/** rocket-wide settings the .ork itself can't hold, kept with the app's settings in the file */
export const BLD_APP_SETTINGS = [
  "otherCd",
  "blMode",
  "dryInertia",
  "dryInertiaOn",
  "bDryInertia",
  "bDryInertiaOn",
  "s1DryInertia",
  "s1DryInertiaOn",
];
export function bldSettings() {
  return { finish: null, dryInertia: 0, bDryInertia: 0, otherCd: 0, cdOverride: 0 };
}
/**
 * A complete, flyable starting design: 2.6 in airframe, 29 mm mount, three fins, one parachute.
 * @returns {object} builder model
 *
 * a complete, flyable starting design: 2.6 in airframe, 29 mm mount, three fins, one chute
 */
export function bldDefault() {
  const R = 0.0333,
    nose = bldNew("nose", R),
    tube = bldNew("tube", R);
  tube.len = 0.75;
  nose.len = 0.2;
  const mount = bldNew("mount", R);
  const r1 = { ...bldNew("ring", R), name: "Aft centering ring", ref: "bottom", pos: 0.003 },
    r2 = { ...bldNew("ring", R), name: "Forward centering ring", ref: "bottom", pos: 0.185 };
  tube.kids = [bldNew("fins", R), mount, r1, r2, { ...bldNew("buttons", R) }, bldNew("cord", R), bldNew("chute", R)];
  return {
    name: "My rocket",
    src: "new",
    cfg: bldId(),
    settings: { ...bldSettings(), finish: "normal" },
    ref: null,
    stages: [{ id: bldId(), name: "Sustainer", sepDelay: 0, ignDelay: 0, parts: [nose, tube] }],
  };
}
/**
 * The outside radius of a body part (the smaller end of a transition).
 */
export const bldBodyR = (p) =>
  p.type === "tube" ? p.od / 2 : p.type === "nose" ? p.dia / 2 : Math.min(p.dia1, p.dia2) / 2;
/**
 * Where everything sits, front to back: each body part with its stage, position and radius.
 * @param {object} model builder model
 * @returns {{bodies:object[], len:number, ...}}
 *
 * where everything sits, front to back
 */
export function bldLayout(model) {
  const out = [];
  let x = 0;
  model.stages.forEach((st, si) => {
    st.parts.forEach((p, pi) => {
      let r1,
        r2,
        len = p.len;
      if (p.type === "nose") {
        r1 = 0;
        r2 = p.dia / 2;
      } else if (p.type === "tube") {
        r1 = r2 = p.od / 2;
      } else {
        r1 = p.dia1 / 2;
        r2 = p.dia2 / 2;
      }
      const body = {
        p,
        si,
        pi,
        x,
        len,
        r1,
        r2,
        ri: Math.max((p.type === "tube" ? p.od / 2 : Math.min(r1, r2)) - (p.wall || 0), 0),
      };
      out.push(body);
      body.kids = (p.kids || []).map((k) => {
        const kl = bldLen(k),
          kx = k.ref === "top" ? x + k.pos : x + len - kl - k.pos;
        return { k, x: kx, len: kl };
      });
      x += len;
    });
  });
  return { bodies: out, length: x, maxR: Math.max(0.001, ...out.map((b) => Math.max(b.r1, b.r2))) };
}
/**
 * A part's length along the body (fin root chord, packed length...).
 * @param {object} k part
 * @returns {number} m
 */
export function bldLen(k) {
  switch (k.type) {
    case "fins":
      return k.shape === "freeform" ? bldPts(k).root : k.root;
    case "chute":
    case "streamer":
    case "cord":
      return k.packLen;
    case "buttons":
      return (k.n - 1) * k.sep + 0.01;
    case "raw":
      return k.len || 0;
    default:
      return k.len || 0;
  }
}
/**
 * A free-form fin outline from its "x,y" lines (meters); the root runs along y = 0.
 * @param {object} k fin part
 * @returns {{pts:number[][], root:number, span:number}}
 *
 * free-form fin outline from "x,y" lines (metres); the root runs along y = 0
 */
export function bldPts(k) {
  const pts = String(k.pts || "")
    .split(/[\n;]+/)
    .map((l) =>
      l
        .split(/[ ,\t]+/)
        .filter(Boolean)
        .map(Number),
    )
    .filter((a) => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]))
    .map((a) => [a[0], a[1]]);
  if (pts.length < 3) return { pts: [], root: 0 };
  const xs = pts.map((p) => p[0]);
  return { pts, root: Math.max(...xs) - Math.min(...xs) };
}
/**
 * A motor mount's inside diameter, rounded to the motor size it takes.
 * @param {object} k mount part
 * @returns {number} mm
 *
 * the motor mount's inside size, rounded to the motor size it takes
 */
export function bldMountMM(k) {
  return Math.round((k.od - 2 * k.wall) * 1000);
}
/**
 * Rail button sizes by rail: outside diameter, height and weight.
 */
/**
 * The kinds of launch lug: a tube that slides over a 1/8 or 3/16 in rod, or a solid slider shaped to ride in a rail's
 * slot (1010 or 1515). A rail lug stands out from the body as far as that rail's button and is as wide as one.
 */
export const BLD_LUG_KINDS = [
  ["rod18", "1/8 Rod"],
  ["rod316", "3/16 Rod"],
  ["r1010", "1010 Rail"],
  ["r1515", "1515 Rail"],
];
/**
 * Each rod's diameter, and the usual lug for it (inside and outside diameter) (m).
 */
export const BLD_ROD_LUG = {
  rod18: { rod: 0.003175, id: 0.0042, od: 0.005 },
  rod316: { rod: 0.0047625, id: 0.0057, od: 0.0066 },
};
/**
 * A lug's type: the one chosen (kind), or when the file doesn't say (a lug saved before lug types, from RockSim, or a
 * rail lug re-saved by OpenRocket, which drops the app's tag) read from its size. A solid lug (no hole) can only be a
 * rail guide (older OpenRocket designs draw rail buttons that way): a 1515 one if it is taller than halfway between the
 * two buttons' heights, otherwise a 1010. Any other lug is for a 3/16 rod if it clears one, otherwise a 1/8 rod. A
 * lug whose type is only read from its size keeps the file's shape and drag; the type is used to check it against
 * the pad.
 * @param {object} k the lug (od, id_ in m)
 * @returns {string} rod18, rod316, r1010 or r1515
 */
export function bldLugKind(k) {
  if (k && BLD_LUG_KINDS.some(([v]) => v === k.kind)) return k.kind;
  if (k && k.od > 0 && !((k.id_ || 0) > 0.0005))
    return k.od > (BLD_BUTTONS["1010"].h + BLD_BUTTONS["1515"].h) / 2 ? "r1515" : "r1010";
  return (k && k.id_) >= BLD_ROD_LUG.rod316.rod + 0.0003 ? "rod316" : "rod18";
}
/**
 * A rail-type lug's size: width and height above the body (those of the rail's button), or null for a rod lug.
 * @param {object} k the lug
 * @returns {{w:number, h:number}|null}
 */
export function bldRailLug(k) {
  const t = k ? bldLugKind(k) : "",
    P = t === "r1010" || t === "r1515" ? BLD_BUTTONS[t.slice(1)] : null;
  // its own height (od) and width when it has them: a rail lug read from a file keeps the file's size
  return P ? { w: k.w > 0 ? k.w : P.od, h: k.od > 0 ? k.od : P.h } : null;
}
export const BLD_BUTTONS = {
  1010: { od: 0.0102, id: 0.0064, h: 0.0097, fl: 0.0021, bs: 0.0021, label: "1010 (small)" },
  1515: { od: 0.0157, id: 0.0081, h: 0.0127, fl: 0.0025, bs: 0.0025, label: "1515 (large)" },
};
/**
 * The motor tube's outside radius inside a body part (the centering rings' hole size).
 * @param {object} b body part from bldLayout
 * @returns {number} m
 *
 * the motor tube's outside radius in a body part: the ring's hole size
 */
export function bldMountR(b) {
  const m = (b.p.kids || []).find((k) => k.type === "mount" || k.type === "inner");
  return m ? m.od / 2 : Math.max(b.ri * 0.5, 0.005);
}
/**
 * Every motor mount in a stage (inner tubes with a motor, or body tubes flown as their own mount).
 * @param {object} st stage
 * @returns {object[]}
 *
 * every motor mount in a stage (inner tubes with a motor, or a body tube flown as its own mount)
 */
export function bldMounts(st) {
  return st.parts.flatMap((p) => [...(p.mm ? [p.mm] : []), ...(p.kids || []).filter((k) => k.type === "mount")]);
}
