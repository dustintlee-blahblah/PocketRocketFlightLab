/**
 * The built-in motor catalog as motor objects, and the rules that file uploaded motors under a brand and motor system.
 *
 * A motor object: {id, name, cn (common name), brand, mfr, dia (m), len (m), delays ("6,8,10" or "P"), case, prop,
 * sys, sparky, totalMass (kg), propMass (kg), t (s), F (N), builtin}.
 */
import { MOTOR_DB } from "../../data/motor-catalog.js";
import { motorStats } from "./motor-files.js";
/**
 * The order motor systems are listed in.
 */
export const SYS_ORDER = ["RMS", "DMS", "SU", "Reload", "Hybrid", "Kosdon", "ProX", "ProXL", "Loki", "Legacy"];
/**
 * For each catalog brand, the motor systems it has, in SYS_ORDER.
 */
export const BRAND_SYS = {};
/**
 * The catalog's brands, the makers with the most motors first (filled at start-up, when the catalog is unpacked).
 */
export const BUILTIN_BRANDS = [];
/**
 * The catalog (MOTOR_DB's compact rows) unpacked into motor objects, with sizes in meters and masses in kg.
 */
export let BUILTIN;
// an uploaded motor is filed under its manufacturer, and under the same motor system as the matching catalog motor
// the short codes are OpenRocket's (older .ork and RASP files name makers by them: "A" AeroTech, "E" Estes, "Q" Quest...)
const MFR_ALIAS = [
  [/^(a|at|aet|aero|aerotech|aerotech\/rcs|rcs|isp|aerot)\b/, "AeroTech"],
  [/^(aerotech)/, "AeroTech"],
  [/^(cti|cesaroni|ces|cs|csr)\b/, "Cesaroni"],
  [/^(cesaroni)/, "Cesaroni"],
  [/^(loki|lr)\b/, "Loki"],
  [/^(e|es|estes)\b/, "Estes"],
  [/^(q|qu|quest)\b/, "Quest"],
  [/^(ap|apog|apogee)\b/, "Apogee"],
  [/^(amw|animal)/, "AMW"],
  [/^(h|ht|hyper|hypertek)\b/, "Hypertek"],
  [/^(gr|gm|gorilla)\b/, "Gorilla"],
  [/^(klima|raketenmodellbau klima)/, "Klima"],
  [/^(em|ellis)\b/, "Ellis Mountain"],
  [/^(pm|pml|public missiles)\b/, "Public Missiles"],
  [/^(k|ka|kba|k-at|kos|kosdon)\b/, "Kosdon"],
  [/^contrail/, "Contrail"],
  [/^(sr|srs|sf|skyr|skyripper|sky ripper)\b/, "Sky Ripper"],
  [/^(wcoast|west coast|wch|wcr)\b/, "West Coast Hybrids"],
  [/^(ratt|rt|rtw|r\.a\.t\.t)\b/, "RATT Works"],
  [/^(roadrunner|rr)\b/, "Roadrunner"],
  [/^(rocketvision|rocket vision|rv)\b/, "Rocketvision"],
  [/^(tendera|tsp|piotr tendera)\b/, "Tendera"],
  [/^(propulsion polymers|pp|prop)\b/, "Propulsion Polymers"],
  [/^(southern cross|scr)\b/, "Southern Cross"],
  [/^alpha/, "Alpha Hybrids"],
  [/^zeveta/, "Zeveta"],
  [/^(deap|derek deville)/, "DEAP EX"],
];
/**
 * The brand an uploaded motor is filed under, from the manufacturer field of its file.
 * @param {string} mfr manufacturer text (e.g. "AT", "Cesaroni")
 * @returns {string} a catalog brand name, or the text tidied up
 */
export function brandOfMfr(mfr) {
  const t = (mfr || "").trim(),
    l = t.toLowerCase();
  if (!t) return "Unknown maker";
  for (const [re, b] of MFR_ALIAS) if (re.test(l)) return b;
  return t.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
/**
 * Finds the same motor in a list: same name, maker and diameter, and total impulse within 1%.
 * @param {object} m motor
 * @param {object[]} pool motors to search
 * @returns {object|null} the matching motor, or null
 *
 * the same motor: same name, same maker, same diameter and the same total impulse (within 1%); other fields don't matter
 */
export function dupMotor(m, pool) {
  const norm = (x) => (x || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    nm = norm(m.name),
    d = Math.round(m.dia * 1000),
    I = motorStats(m).I;
  return (
    pool.find(
      (x) =>
        x !== m &&
        x.brand === m.brand &&
        Math.round(x.dia * 1000) === d &&
        (norm(x.name) === nm || (x.builtin && norm(x.cn) === nm)) &&
        Math.abs(motorStats(x).I - I) <= Math.max(0.5, 0.01 * I),
    ) || null
  );
}
/**
 * Tidies an uploaded motor in place: cleans its delay list (no "1000" = plugged placeholder; an empty list becomes
 * "P"), sets its brand, and copies the system, case and propellant from the matching catalog motor, if there is one.
 * @param {object} m uploaded motor
 * @returns {object} the same motor
 */
export function classifyUser(m) {
  if (m.delays)
    m.delays =
      String(m.delays)
        .split(/[-,\s]+/)
        .filter((x) => x && x !== "1000")
        .join(",") || "P";
  const norm = (x) => (x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  m.brand = brandOfMfr(m.mfr);
  const d = Math.round(m.dia * 1000),
    nm = norm(m.name);
  const hit = BUILTIN.find(
    (b) => b.brand === m.brand && Math.round(b.dia * 1000) === d && (norm(b.name) === nm || norm(b.cn) === nm),
  );
  if (hit) {
    m.sys = hit.sys;
    if (!m.cn) m.cn = hit.cn;
    if (!m.case) m.case = hit.case;
    if (!m.prop) m.prop = hit.prop;
    if (hit.sparky) m.sparky = true;
  } else m.sys = m.brand === "Cesaroni" ? "ProX" : m.brand === "Loki" ? "Loki" : "Imported";
  return m;
}
/**
 * The motor a fresh install starts with (AeroTech H148R).
 */
export let DEFAULT_MOTOR;
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  for (const r of MOTOR_DB) (BRAND_SYS[r.b] = BRAND_SYS[r.b] || new Set()).add(r.sy);
  for (const b in BRAND_SYS) BRAND_SYS[b] = SYS_ORDER.filter((y) => BRAND_SYS[b].has(y));
  // the brand list is filled here, not when the module loads (BRAND_SYS was still empty then, which left the Motor
  // tab's manufacturer filter with no brands)
  const count = {};
  for (const r of MOTOR_DB) count[r.b] = (count[r.b] || 0) + 1;
  BUILTIN_BRANDS.length = 0;
  BUILTIN_BRANDS.push(...Object.keys(BRAND_SYS).sort((a, b) => count[b] - count[a] || a.localeCompare(b)));
  BUILTIN = MOTOR_DB.map((r) => ({
    id: r.id,
    name: r.n,
    cn: r.cn,
    brand: r.b,
    mfr: r.mf,
    dia: r.d / 1000,
    len: r.l / 1000,
    delays: r.dl,
    case: r.cs,
    prop: r.pr,
    sys: r.sy,
    sparky: !!r.sp,
    totalMass: r.tw / 1000,
    propMass: r.pw / 1000,
    t: r.t,
    F: r.f,
    builtin: true,
  }));
  DEFAULT_MOTOR = (BUILTIN.find((m) => m.name === "H148R") || BUILTIN[0]).id;
}
