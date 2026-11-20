/**
 * The altimeters the Flight Log knows: what each one records, what it shows or beeps after a flight, and the limits of
 * its sensors, so a reading taken off its display can be compared with the prediction and a reading at a sensor's limit
 * is kept but not graded. Sources for each figure are in REFERENCES.md ("Altimeters").
 */

/**
 * The readings an altimeter can show after a flight: [key, label, dimension ("alt", "speed", "s" for seconds, "g")].
 * ap2e is negative when the charge fired before apogee.
 */
/*
 * Each altimeter: id, brand, name; accG, its accelerometer's range in g (null: it has none; undefined: not published);
 * maxAlt, the highest it reads, ft; readings, what it shows after a flight; file and fileBrand, the log file it writes;
 * how, where its readings are read; and fires, the deployment charges it can fire: "dual" (an apogee charge and a main
 * charge at a set height; some have more outputs), "apogee" (an apogee charge only), or not there for one that only
 * records. The builder's Recovery block lists the ones that fire.
 */
export const ALT_READINGS = [
  ["apo", "Max altitude", "alt"],
  ["vmax", "Top speed", "speed"],
  ["thrust", "Thrust time", "s"],
  ["peakG", "Peak acceleration", "g"],
  ["avgG", "Average acceleration", "g"],
  ["tApo", "Time to apogee", "s"],
  ["coast", "Coast to apogee", "s"],
  ["ap2e", "Apogee to ejection", "s"],
  ["ejAlt", "Ejection altitude", "alt"],
  ["mainAlt", "Main deployment altitude", "alt"],
  ["desc", "Descent rate", "speed"],
  ["dur", "Flight duration", "s"],
];
/* the readings each kind of altimeter gives */
const JL_STATS = ["apo", "vmax", "thrust", "peakG", "avgG", "coast", "ap2e", "ejAlt", "desc", "dur"];
const BEEP_APO = ["apo"];
const BEEP_APO_V = ["apo", "vmax"];
const SUMMARY = ["apo", "vmax", "tApo", "mainAlt"];
const ALTUS = ["apo", "vmax", "peakG", "mainAlt"];

/**
 * The altimeters: id, brand, name, its file brand (the id altimeter-files.js recognizes its logs by), the accelerometer
 * limit it reports to along the rocket (g; null without an accelerometer, undefined when the maker doesn't publish it),
 * its highest altitude above sea level (ft), what it gives you after a flight (readings), whether it saves a log file,
 * and a note on where the readings come from.
 */
export const ALTIMETERS = [
  // Jolly Logic: the AltimeterTwo's limit is 24 g including gravity, about 23 g of added acceleration in any orientation
  {
    id: "jl-one",
    brand: "Jolly Logic",
    name: "AltimeterOne",
    accG: null,
    maxAlt: 29500,
    readings: BEEP_APO,
    file: false,
    how: "its display",
  },
  {
    id: "jl-two",
    brand: "Jolly Logic",
    name: "AltimeterTwo",
    accG: 23,
    maxAlt: 29500,
    readings: JL_STATS,
    file: false,
    how: "its display, in this order",
  },
  {
    id: "jl-two64",
    brand: "Jolly Logic",
    name: "AltimeterTwo Gen64",
    accG: 64,
    maxAlt: 29500,
    readings: JL_STATS,
    file: false,
    how: "its display, in this order",
  },
  {
    id: "jl-three",
    brand: "Jolly Logic",
    name: "AltimeterThree",
    accG: undefined,
    maxAlt: 29500,
    readings: JL_STATS,
    file: true,
    fileBrand: "jolly",
    how: "the phone app's flight stats",
  },
  {
    id: "jl-chute",
    brand: "Jolly Logic",
    name: "Chute Release",
    accG: null,
    maxAlt: undefined,
    readings: BEEP_APO,
    file: false,
    how: "its display",
  },
  // Featherweight
  {
    id: "fw-raven3",
    fires: "dual",
    brand: "Featherweight",
    name: "Raven3",
    accG: 105,
    maxAlt: 100000,
    readings: BEEP_APO,
    file: true,
    fileBrand: "featherweight",
    how: "its beeps",
  },
  {
    id: "fw-raven4",
    fires: "dual",
    brand: "Featherweight",
    name: "Raven4",
    accG: 105,
    maxAlt: 100000,
    readings: BEEP_APO,
    file: true,
    fileBrand: "featherweight",
    how: "its beeps",
  },
  {
    id: "fw-blueraven",
    fires: "dual",
    brand: "Featherweight",
    name: "Blue Raven",
    accG: 400,
    maxAlt: undefined,
    readings: ["apo", "vmax"],
    file: true,
    fileBrand: "featherweight",
    how: "the Featherweight UI app's summary",
  },
  {
    id: "fw-bluejay",
    fires: "dual",
    brand: "Featherweight",
    name: "Blue Jay",
    accG: 32,
    maxAlt: undefined,
    readings: BEEP_APO,
    file: true,
    fileBrand: "featherweight",
    how: "the Featherweight UI app",
  },
  // Missile Works
  {
    id: "mw-rrc2p",
    fires: "dual",
    brand: "Missile Works",
    name: "RRC2+",
    accG: null,
    maxAlt: undefined,
    readings: BEEP_APO,
    file: false,
    how: "its beeps",
  },
  {
    id: "mw-rrc2l",
    fires: "dual",
    brand: "Missile Works",
    name: "RRC2L",
    accG: null,
    maxAlt: undefined,
    readings: BEEP_APO,
    file: false,
    how: "its beeps",
  },
  {
    id: "mw-rrc3s",
    fires: "dual",
    brand: "Missile Works",
    name: "RRC3 Sport",
    accG: null,
    maxAlt: 40000,
    readings: BEEP_APO,
    file: true,
    fileBrand: "missileworks",
    how: "its beeps",
  },
  {
    id: "mw-rrc3x",
    fires: "dual",
    brand: "Missile Works",
    name: "RRC3+ / Xtreme",
    accG: null,
    maxAlt: 100000,
    readings: BEEP_APO,
    file: true,
    fileBrand: "missileworks",
    how: "its beeps",
  },
  // PerfectFlite: beeps the peak altitude in feet, then the top speed in mph
  {
    id: "pf-sl100",
    fires: "dual",
    brand: "PerfectFlite",
    name: "StratoLogger SL100",
    accG: null,
    maxAlt: 100000,
    readings: BEEP_APO_V,
    speedUnit: "mph",
    file: true,
    fileBrand: "perfectflite",
    how: "its beeps: altitude in feet, then top speed in mph",
  },
  {
    id: "pf-slcf",
    fires: "dual",
    brand: "PerfectFlite",
    name: "StratoLoggerCF",
    accG: null,
    maxAlt: 100000,
    readings: BEEP_APO_V,
    speedUnit: "mph",
    file: true,
    fileBrand: "perfectflite",
    how: "its beeps: altitude in feet, then top speed in mph",
  },
  // Eggtimer: barometric, except the Proton (120 g); the summary page or download gives apogee, top speed and events
  {
    id: "et-classic",
    fires: "dual",
    brand: "Eggtimer",
    name: "Eggtimer (classic)",
    accG: null,
    maxAlt: 29500,
    readings: SUMMARY,
    file: true,
    fileBrand: "eggtimer",
    how: "its flight summary",
  },
  {
    id: "et-quantum",
    fires: "dual",
    brand: "Eggtimer",
    name: "Quantum",
    accG: null,
    maxAlt: undefined,
    readings: SUMMARY,
    file: true,
    fileBrand: "eggtimer",
    how: "its flight summary",
  },
  {
    id: "et-quasar",
    fires: "dual",
    brand: "Eggtimer",
    name: "Quasar",
    accG: null,
    maxAlt: undefined,
    readings: SUMMARY,
    file: true,
    fileBrand: "eggtimer",
    how: "its flight summary",
  },
  {
    id: "et-proton",
    fires: "dual",
    brand: "Eggtimer",
    name: "Proton",
    accG: 120,
    maxAlt: 60000,
    readings: SUMMARY,
    file: true,
    fileBrand: "eggtimer",
    how: "its flight summary",
  },
  {
    id: "et-apogee",
    fires: "apogee",
    brand: "Eggtimer",
    name: "Eggtimer Apogee",
    accG: null,
    maxAlt: undefined,
    readings: BEEP_APO,
    file: false,
    how: "its beeps",
  },
  // Altus Metrum: AltosUI's flight summary
  {
    id: "am-telemetrum",
    fires: "dual",
    brand: "Altus Metrum",
    name: "TeleMetrum",
    accG: 200,
    maxAlt: 100000,
    readings: ALTUS,
    file: true,
    fileBrand: "altus",
    how: "AltosUI's flight summary",
  },
  {
    id: "am-telemega",
    fires: "dual",
    brand: "Altus Metrum",
    name: "TeleMega",
    accG: 200,
    maxAlt: 100000,
    readings: ALTUS,
    file: true,
    fileBrand: "altus",
    how: "AltosUI's flight summary",
  },
  {
    id: "am-easymega",
    fires: "dual",
    brand: "Altus Metrum",
    name: "EasyMega",
    accG: undefined,
    maxAlt: undefined,
    readings: ALTUS,
    file: true,
    fileBrand: "altus",
    how: "AltosUI's flight summary",
  },
  {
    id: "am-easymini",
    fires: "dual",
    brand: "Altus Metrum",
    name: "EasyMini",
    accG: null,
    maxAlt: undefined,
    readings: ["apo", "vmax", "mainAlt"],
    file: true,
    fileBrand: "altus",
    how: "AltosUI's flight summary",
  },
  {
    id: "am-telemini",
    fires: "dual",
    brand: "Altus Metrum",
    name: "TeleMini",
    accG: null,
    maxAlt: undefined,
    readings: ["apo", "vmax", "mainAlt"],
    file: true,
    fileBrand: "altus",
    how: "AltosUI's flight summary",
  },
  {
    id: "other",
    fires: "dual",
    brand: "",
    name: "Another altimeter",
    accG: undefined,
    maxAlt: undefined,
    readings: ["apo", "vmax", "peakG", "tApo", "ap2e", "ejAlt", "desc", "dur"],
    file: true,
    how: "its readings",
  },
];
/**
 * An altimeter by id (the "other" entry for an unknown id).
 * @param {string} id
 * @returns {object}
 */
export function altimeterById(id) {
  return ALTIMETERS.find((a) => a.id === id) || ALTIMETERS[ALTIMETERS.length - 1];
}
/**
 * An altimeter's full name ("Jolly Logic AltimeterTwo").
 * @param {object} a
 * @returns {string}
 */
export function altimeterName(a) {
  return a ? `${a.brand ? a.brand + " " : ""}${a.name}` : "";
}
/**
 * Whether an altimeter's acceleration readings (and the top speed it adds up from them) are at its limit for a flight:
 * the peak it read is at the limit, or the flight's predicted peak is beyond it.
 * @param {object} a altimeter
 * @param {number|null} readG the peak it read, g
 * @param {number|null} predG the predicted peak, g
 * @returns {boolean}
 */
export function altAtLimit(a, readG, predG) {
  if (!a || !(a.accG > 0)) return false;
  return (readG != null && readG >= a.accG - 0.5) || (predG != null && predG > a.accG);
}
