/**
 * The starting design (a LOC IV X2) and launch conditions, the saved state loaded at startup (design D, launch L,
 * uploaded motors, flyer profile, selected motors), and the current-motor lookups.
 */
import { OLD_MOTOR_IDS } from "../../data/old-motor-ids.js";
import { store } from "../core/storage.js";
import { FT, IN, LB } from "../core/units-and-fin-edges.js";
import { BUILTIN, classifyUser, DEFAULT_MOTOR, dupMotor } from "../motors/catalog-lookup.js";
import { motorStats } from "../motors/motor-files.js";
import { noseSpec } from "../physics/geometry.js";
/* ---------- default design: LOC IV X2 ---------- */
/**
 * Nose shapes offered in the quick form: ["shape:param", label] (see noseR for the parameters).
 */
export const NOSE_PRESETS = [
  ["ogive:1", "Tangent ogive"],
  ["conical:0", "Conical"],
  ["ellipsoid:0", "Elliptical"],
  ["parabolic:1", "Parabolic"],
  ["parabolic:0.75", "¾ parabolic"],
  ["parabolic:0.5", "½ parabolic"],
  ["power:0.75", "¾ power"],
  ["power:0.5", "½ power"],
  ["haack:0", "Von Kármán (Haack)"],
  ["haack:0.3333", "LV-Haack"],
];
/**
 * A fresh design: the LOC IV X2 on a single parachute. All lengths in meters, masses in kg.
 * @returns {object} design
 */
export function defaultDesign() {
  return {
    name: "LOC IV X2",
    length: 47.5 * IN,
    diameter: 3.9 * IN,
    noseLen: 13 * IN,
    noseShape: "ogive:1",
    tailLen: 0,
    tailDia: 3.9 * IN,
    finCount: 3,
    finRoot: 8 * IN,
    finTip: 3.5 * IN,
    finSpan: 4.5 * IN,
    finSweep: 4.5 * IN,
    finThick: 0.125 * IN,
    finAft: 0,
    finEdge: "rounded",
    finCdOverride: 0,
    finPts: null,
    mountDia: null,
    bMountDia: null,
    mountSel: "file",
    bMountSel: "file",
    extraFins: [],
    extraMotors: [],
    dryMass: 7 * LB,
    cgEmpty: 30 * IN,
    dryInertia: 0,
    inertiaMass: 0,
    finish: 30e-6,
    railPreset: "1010",
    buttons: [],
    lugs: [],
    otherCd: 0,
    cdOverride: 0,
    nozzleDia: 0,
    motorOverhang: 0.5 * IN,
    recovery: "single",
    deployMode: "apogee",
    deployDelay: 0,
    drogueDia: 18 * IN,
    drogueCd: 0.8,
    mainDia: 48 * IN,
    mainCd: 0.8,
    mainAlt: 500 * FT,
    transitions: [],
    orkApogee: null,
    orkMotor: null,
    twoStage: false,
    stageDelay: 0,
    bLength: 24 * IN,
    bDiameter: 3.9 * IN,
    bSegments: null,
    bDryMass: 2 * LB,
    bCg: 12 * IN,
    bDryInertia: 0,
    bInertiaMass: 0,
    bOverhang: 0.5 * IN,
    bFinCount: 3,
    bFinRoot: 8 * IN,
    bFinTip: 3.5 * IN,
    bFinSpan: 5 * IN,
    bFinSweep: 4.5 * IN,
    bFinThick: 0.125 * IN,
    bFinAft: 0,
    bFinEdge: "rounded",
    bFinFinish: null,
    bFinCdOverride: 0,
    bExtraFins: [],
    bExtraMotors: [],
    bButtons: [],
    bLugs: [],
    bRecovery: "tumble",
    bChuteDia: 24 * IN,
    bChuteCd: 0.8,
  };
}
/**
 * Fresh launch conditions and Monte Carlo spreads. Lengths in meters, speeds in m/s, angles in degrees.
 * @returns {object} launch conditions
 */
export function defaultLaunch() {
  return {
    elev: 0,
    tempC: 15,
    dewC: null,
    ceiling: 0,
    cloudLow: 0,
    cloudMid: 0,
    cloudHigh: 0,
    cloudProf: null,
    vis: 0,
    precip: 0,
    rail: 8 * FT,
    angle: 5,
    wind: 5 * 0.44704,
    windRef: 6 * FT,
    windProfile: "typical",
    windDir: 270,
    turb: 0,
    railType: "",
    railMode: "into",
    railDir: 90,
    cone: 20,
    lat: null,
    lon: null,
    waiver: 0,
    waiverRef: "agl",
    recRadius: 0,
    cert: "",
    flightType: "standard",
    mcN: 100,
    mcWind: 0.25,
    mcDir: 15,
    mcImp: 0.03,
    mcMass: 0.02,
    mcBal: 0.023,
    mcCd: 0.05,
    mcAngle: 1,
    mcMis: 0.2,
    mcDelay: 0.05,
    mcChute: 0.08,
    mcThermal: 0,
    thermalW: 0,
    ignMinAlt: 0,
    ignMaxTilt: 0,
    pressure: 0,
    humidity: 0,
    motorDT: 0,
    aloft: [],
    tempAloft: null,
    thrustMis: 0,
    finMis: 0,
    cgOff: 0,
    clusterFail: false,
  };
}
/**
 * Wind-profile power-law exponents: wind at height h = wind at the reference height × (h / ref)^α.
 */
export const WIND_ALPHA = { constant: 0, typical: 1 / 7, shear: 0.25 };

/**
 * The current design, from storage over the defaults, with older saved formats brought up to date below.
 */
export let D;
export let L;
export let USER_MOTORS;
export let PROFILE;
export let motorId;
export let units;
export let series = "alt"; /**
 * Every motor: the catalog and the uploaded ones.
 * @returns {object[]}
 */
export const allMotors = () => [...BUILTIN, ...USER_MOTORS];
export let boostId;
export let motorTarget = "sustainer";
/**
 * The booster's selected motor (falls back to the sustainer's motor, and saves the fallback).
 * @returns {object} motor
 */
export function curBoost() {
  let m = allMotors().find((m) => m.id === boostId);
  if (!m) m = curMotor();
  if (m.id !== boostId) {
    boostId = m.id;
    store.set("rfs-bmotor", boostId);
  }
  return m;
}
// a three-stage rocket's first (bottom) stage motor
export let firstId;
/**
 * A three-stage rocket's first-stage motor (falls back to the booster's motor).
 * @returns {object} motor
 */
export function curFirst() {
  let m = allMotors().find((m) => m.id === firstId);
  if (!m) m = curBoost();
  if (m.id !== firstId) {
    firstId = m.id;
    store.set("rfs-b1motor", firstId);
  }
  return m;
}
/**
 * The sustainer's (or the only stage's) selected motor; falls back to the default motor and saves the choice.
 * @returns {object} motor
 */
export function curMotor() {
  let m = allMotors().find((m) => m.id === motorId);
  if (!m && /^b-/.test(motorId)) m = BUILTIN.find((x) => x.name === motorId.slice(2));
  if (!m) m = BUILTIN.find((x) => x.id === DEFAULT_MOTOR);
  if (m.id !== motorId) {
    motorId = m.id;
    store.set("rfs-motor", motorId);
  }
  return m;
}
const statCache = new WeakMap();
/**
 * motorStats, cached per motor object.
 * @param {object} m motor
 * @returns {object} see motorStats
 */
export function mstats(m) {
  let s = statCache.get(m);
  if (!s) {
    s = motorStats(m);
    statCache.set(m, s);
  }
  return s;
}

/**
 * Sets series (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setSeries(v) {
  return (series = v);
}
/**
 * Sets motorTarget (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setMotorTarget(v) {
  return (motorTarget = v);
}
/**
 * Sets firstId (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setFirstId(v) {
  return (firstId = v);
}
/**
 * Sets boostId (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setBoostId(v) {
  return (boostId = v);
}
/**
 * Sets motorId (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setMotorId(v) {
  return (motorId = v);
}
/**
 * Sets USER_MOTORS (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setUSER_MOTORS(v) {
  return (USER_MOTORS = v);
}
/**
 * Sets units (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setUnitsValue(v) {
  return (units = v);
}
/**
 * Sets D (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setD(v) {
  return (D = v);
}
/**
 * Sets L (for other modules: an imported binding can't be assigned).
 * @param {*} v
 */
export function setL(v) {
  return (L = v);
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  D = Object.assign(defaultDesign(), store.get("rfs-design", {}));
  if (!store.get("rfs-rec-default-single", false)) {
    D.recovery = "single";
    store.set("rfs-rec-default-single", true);
    store.set("rfs-design", D);
  }
  if ("extraCd" in D) {
    delete D.extraCd;
    D.otherCd = 0;
    if (!D.railPreset) D.railPreset = "1010";
  }
  D.noseShape = (() => {
    const n = noseSpec(D);
    return n.shape + ":" + n.param;
  })();
  L = Object.assign(defaultLaunch(), store.get("rfs-launch", {}));
  USER_MOTORS = store.get("rfs-motors", []);
  PROFILE = Object.assign({ name: "", club: "", nar: "", tra: "", cert: "" }, store.get("rfs-profile", {}));
  if (!store.get("rfs-profile", null) && L.cert) {
    PROFILE.cert = L.cert;
    store.set("rfs-profile", PROFILE);
  }
  motorId = store.get("rfs-motor", DEFAULT_MOTOR);
  units = store.get("rfs-units", "imp");
  // the Flight Performance chart always opens on Altitude
  USER_MOTORS.forEach(classifyUser);
  // motors uploaded before duplicates were caught: keep the first of each, and point the selected motors at what stays
  {
    const keep = [];
    for (const m of USER_MOTORS) {
      const d = dupMotor(m, [...BUILTIN, ...keep]);
      if (!d) {
        keep.push(m);
        continue;
      }
      for (const k of ["rfs-motor", "rfs-bmotor", "rfs-b1motor"]) if (store.get(k, null) === m.id) store.set(k, d.id);
    }
    if (keep.length !== USER_MOTORS.length) {
      USER_MOTORS = keep;
      store.set("rfs-motors", USER_MOTORS);
      motorId = store.get("rfs-motor", DEFAULT_MOTOR);
    }
  }
  boostId = store.get("rfs-bmotor", null);
  firstId = store.get("rfs-b1motor", null);
  for (const [k, set] of [
    ["rfs-motor", (v) => (motorId = v)],
    ["rfs-bmotor", (v) => (boostId = v)],
    ["rfs-b1motor", (v) => (firstId = v)],
  ]) {
    const v = store.get(k, null);
    if (v && OLD_MOTOR_IDS[v]) {
      set(OLD_MOTOR_IDS[v]);
      store.set(k, OLD_MOTOR_IDS[v]);
    }
  }
}
