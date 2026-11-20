/**
 * The rocket's recovery configuration (builder, Whole rocket, Recovery): how its parachutes are deployed. One of
 *
 *   "motor"   the motor's ejection charge does it
 *   "one"     one altimeter fires an apogee charge and (with a main) a main charge
 *   "two"     two altimeters, each with its own apogee delay and main height
 *   "custom"  each parachute keeps its own opening setting (a design file this doesn't fit, timers)
 *
 * and, with any of the first three, a chute release that holds the main closed down to a height. The configuration is
 * the user's one place to set deployment; each parachute of the top stage only has a role (drogue or main), and its
 * opening event (what OpenRocket's file holds, and what the flight reads) is written from the configuration here.
 * A design file has only the parachutes' events: the configuration is worked out from them, and kept only if writing
 * it back gives exactly the events the file had (otherwise the design is "custom" and nothing in it changes).
 */
import { bldMounts } from "./model.js";
import { ALTIMETERS } from "../flightlog/altimeters.js";

/** the recovery settings when not set: heights in metres (500 ft and 400 ft), delays in seconds */
export const REC_DEFAULTS = {
  recCfg: null,
  recSolo: "apogee",
  a1Model: "",
  a1Apo: 0,
  a1Main: 152.4,
  a2Model: "",
  a2Apo: 1,
  a2Main: 121.92,
  crOn: false,
  crAlt: 121.92,
  bayDia: 0,
  bayLen: 0,
  mainRating: 0,
};
/** the configurations, as the builder lists them */
export const REC_CONFIGS = [
  ["motor", "Motor ejection"],
  ["one", "One altimeter"],
  ["two", "Two altimeters"],
  ["custom", "Custom: each parachute has its own setting"],
];
/**
 * The altimeters that can fire a charge, for the builder's list: [id, name].
 * @returns {string[][]}
 */
export function recAltimeters() {
  return [
    ["", "Any altimeter"],
    ...ALTIMETERS.filter((a) => a.fires && a.id !== "other").map((a) => [a.id, `${a.brand} ${a.name}`]),
  ];
}
/**
 * An altimeter by its id.
 * @param {string} id
 * @returns {object|null}
 */
export function recAltimeter(id) {
  return (id && ALTIMETERS.find((a) => a.id === id && a.fires)) || null;
}
/**
 * The recovery devices of the top stage (the one that carries the nose): its parachutes and streamers, in order.
 * @param {object} model the builder model
 * @returns {object[]}
 */
export function recChutes(model) {
  const st = model && model.stages && model.stages[0],
    out = [];
  const walk = (list) => {
    for (const p of list || []) {
      if (p.type === "chute" || p.type === "streamer") out.push(p);
      walk(p.kids);
    }
  };
  if (st) walk(st.parts);
  return out;
}
/**
 * A recovery setting, or its default.
 * @param {object} S the model's settings
 * @param {string} k
 * @returns {*}
 */
const val = (S, k) => (S && S[k] != null ? S[k] : REC_DEFAULTS[k]);
/**
 * The delay of the top stage's motor ejection charge, s after burnout; null when plugged or there is no motor mount.
 * @param {object} model
 * @returns {number|null}
 */
export function recMotorDelay(model) {
  const st = model && model.stages && model.stages[0],
    mm = st ? bldMounts(st)[0] : null;
  return mm && mm.delay != null ? +mm.delay : null;
}
/**
 * The role of each of the top stage's recovery devices: "only" (the one device), "main" or "drogue". With two or more,
 * the device's own role if it has one, else from its opening event (an altitude: the main); there is always a main
 * (the largest parachute, when none is set).
 * @param {object[]} C recChutes
 * @returns {string[]}
 */
function recRoles(C) {
  if (C.length < 2) return C.map(() => "only");
  const r = C.map((c) => c.role || (c.deploy === "altitude" ? "main" : "drogue"));
  if (!r.includes("main")) {
    let big = -1;
    C.forEach((c, i) => {
      if (c.type === "chute" && (big < 0 || (+c.dia || 0) > (+C[big].dia || 0))) big = i;
    });
    r[big >= 0 ? big : C.length - 1] = "main";
  }
  return r;
}
/**
 * The opening events the configuration gives the top stage's recovery devices: for each, its deploy event, altitude,
 * delay and whether a chute release holds it. With two altimeters whichever fires first does the work: the shorter
 * apogee delay and the higher main height.
 * @param {object} S the settings
 * @param {object[]} C recChutes
 * @returns {{deploy:string, alt:number, delay:number, release:boolean}[]}
 */
function recEvents(S, C) {
  const cfg = val(S, "recCfg"),
    two = cfg === "two",
    alti = cfg === "one" || two,
    A = two ? Math.min(+val(S, "a1Apo"), +val(S, "a2Apo")) : +val(S, "a1Apo"),
    M = two ? Math.max(+val(S, "a1Main"), +val(S, "a2Main")) : +val(S, "a1Main"),
    cr = !!val(S, "crOn"),
    crAlt = +val(S, "crAlt"),
    solo = val(S, "recSolo") === "main";
  const first = alti
      ? { deploy: "apogee", alt: 0, delay: Math.max(0, A || 0), release: false }
      : { deploy: "ejection", alt: 0, delay: 0, release: false },
    held = (h) => ({ deploy: "altitude", alt: Math.max(0, h || 0), delay: 0, release: true });
  return recRoles(C).map((role, i) => {
    const chute = C[i].type === "chute";
    if (role === "drogue") return first;
    if (role === "only") {
      // the one parachute: at the first charge; or held in a chute release; or (an altimeter's) at the main charge
      if (cr && chute) return held(alti && solo ? Math.min(M, crAlt) : crAlt);
      if (alti && solo) return { deploy: "altitude", alt: Math.max(0, M || 0), delay: 0, release: false };
      return first;
    }
    // the main
    if (cr && chute) return held(alti ? Math.min(M, crAlt) : crAlt);
    return alti ? { deploy: "altitude", alt: Math.max(0, M || 0), delay: 0, release: false } : first;
  });
}
/**
 * True when a recovery device already has an opening event.
 * @param {object} c the device
 * @param {object} e the event (recEvents)
 * @returns {boolean}
 */
function recSame(c, e) {
  const near = (a, b) => Math.abs((+a || 0) - (+b || 0)) < 1e-6;
  return (
    (c.deploy || "apogee") === e.deploy &&
    !!c.release === e.release &&
    (e.deploy === "altitude" ? near(c.alt, e.alt) : near(c.delay, e.delay))
  );
}
/**
 * Works out the configuration of a design that has none yet (a design file, or a design from an earlier build) from
 * its parachutes' opening events, without changing them: it is "custom" unless writing the configuration back would
 * give exactly the events they have. An earlier build's backup altimeter becomes the second altimeter.
 * @param {object} model the builder model; its settings are filled in
 */
function recInfer(model) {
  const S = model.settings,
    C = recChutes(model),
    plugged = recMotorDelay(model) == null,
    held = C.filter((c) => c.deploy === "altitude" && c.release),
    alts = C.filter((c) => c.deploy === "altitude" && !c.release),
    apo = C.filter((c) => (c.deploy || "apogee") === "apogee"),
    ej = C.filter((c) => c.deploy === "ejection");
  const set = { recCfg: "custom" };
  if (
    !C.some((c) => !["apogee", "ejection", "altitude"].includes(c.deploy || "apogee")) &&
    !(ej.length && apo.length)
  ) {
    if (held.length) Object.assign(set, { crOn: true, crAlt: +held[0].alt || 0 });
    if (ej.length) set.recCfg = "motor";
    else if (apo.length || alts.length) {
      set.recCfg = S.bakOn ? "two" : "one";
      set.a1Apo = apo.length ? Math.max(0, +apo[0].delay || 0) : 0;
      if (alts.length) set.a1Main = +alts[0].alt || 0;
      else if (held.length) set.a1Main = Math.max(REC_DEFAULTS.a1Main, +held[0].alt || 0);
      if (C.length === 1 && alts.length) set.recSolo = "main";
      if (S.bakOn) {
        // the backup never fired before the primary: it stays the later of the two
        set.a2Apo = Math.max(+S.bakDelay >= 0 ? +S.bakDelay : 1, set.a1Apo);
        set.a2Main = Math.max(0, (set.a1Main ?? REC_DEFAULTS.a1Main) - (+S.bakMainDrop >= 0 ? +S.bakMainDrop : 30.48));
      }
    } else if (held.length) set.recCfg = plugged ? "one" : "motor";
    else set.recCfg = plugged ? "one" : "motor";
  }
  if (set.recCfg !== "custom") {
    const T = { ...S, ...set },
      E = recEvents(T, C);
    if (!C.every((c, i) => recSame(c, E[i]))) {
      for (const k of Object.keys(set)) delete set[k];
      set.recCfg = "custom";
    }
  }
  Object.assign(S, set);
  delete S.bakOn;
  delete S.bakDelay;
  delete S.bakMainDrop;
}
/**
 * Brings the top stage's parachutes in line with the recovery configuration: works the configuration out first when the
 * design has none, then (unless it is "custom") gives each parachute its role and the opening event that goes with it.
 * Called whenever the design changes.
 * @param {object} model the builder model
 */
export function recSync(model) {
  if (!model || !model.stages || !model.stages.length) return;
  const S = (model.settings = model.settings || {});
  // no configuration yet; or a file from an earlier build, whose backup altimeter arrives with its saved settings
  if (!S.recCfg || S.bakOn) recInfer(model);
  else if (S.bakOn !== undefined) {
    delete S.bakOn;
    delete S.bakDelay;
    delete S.bakMainDrop;
  }
  const C = recChutes(model);
  if (S.recCfg === "custom") {
    for (const c of C) delete c.role;
    return;
  }
  const roles = recRoles(C),
    E = recEvents(S, C);
  C.forEach((c, i) => {
    if (roles[i] === "only") delete c.role;
    else c.role = roles[i];
    c.deploy = E[i].deploy;
    if (E[i].deploy === "altitude") c.alt = E[i].alt;
    else c.delay = E[i].delay;
    if (c.type === "chute") {
      if (E[i].release) c.release = true;
      else delete c.release;
    }
  });
}
/**
 * True when a parachute or streamer's opening comes from the recovery configuration (it is in the top stage, and the
 * configuration isn't "custom"), so the part shows its role instead of its own opening setting.
 * @param {object} model
 * @param {object} p the part
 * @returns {boolean}
 */
export function recManaged(model, p) {
  return !!(model && model.settings && model.settings.recCfg !== "custom" && recChutes(model).includes(p));
}
/**
 * The recovery settings the flight's recovery plan reads (recovery/recovery-plan.js).
 * @param {object} model
 * @returns {object}
 */
export function recForFlight(model) {
  const S = model.settings || {},
    C = recChutes(model),
    out = {};
  for (const k of Object.keys(REC_DEFAULTS)) out[k] = val(S, k);
  out.cfg = out.recCfg || "custom";
  out.devices = C.length;
  // the main charge is in use: a separate main, or the one parachute set to it
  out.mainCharge =
    (out.cfg === "one" || out.cfg === "two") && (C.length > 1 || (C.length === 1 && out.recSolo === "main"));
  return out;
}
