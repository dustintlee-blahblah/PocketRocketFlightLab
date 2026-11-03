/**
 * What changed since the design was opened, and which of those changes each file format can save.
 */
/**
 * The other files inside an .ork zip (decal images), as base64, so a save keeps them.
 * @param {ArrayBuffer} buf
 * @returns {Promise<{name:string, b64:string}[]>}
 *
 * the other files inside an OpenRocket .ork zip (decal images), kept so a save doesn't lose them
 */
async function zipOthers(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x50 || u8[1] !== 0x4b) return [];
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const ents = [];
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true),
      csize = dv.getUint32(p + 20, true),
      nlen = dv.getUint16(p + 28, true),
      xlen = dv.getUint16(p + 30, true),
      clen = dv.getUint16(p + 32, true),
      off = dv.getUint32(p + 42, true);
    ents.push({ name: new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen)), method, csize, off });
    p += 46 + nlen + xlen + clen;
  }
  const main =
    ents.find((e) => /rocket\.ork$/i.test(e.name)) ||
    ents.find((e) => /\.ork$/i.test(e.name)) ||
    ents.find((e) => /\.xml$/i.test(e.name));
  const out = [];
  for (const e of ents) {
    if (e === main || /\/$/.test(e.name)) continue;
    try {
      const lnl = dv.getUint16(e.off + 26, true),
        lxl = dv.getUint16(e.off + 28, true),
        data = u8.subarray(e.off + 30 + lnl + lxl, e.off + 30 + lnl + lxl + e.csize);
      const raw = e.method === 0 ? data : new Uint8Array(await inflate(data, "deflate-raw"));
      out.push({ name: e.name, b64: bufToB64(raw) });
    } catch (err) {}
  }
  return out;
}
/**
 * Base64 text to bytes.
 */
const b64ToU8 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/**
 * A deep copy of plain JSON data.
 */
const jclone = (o) => JSON.parse(JSON.stringify(o));
/**
 * Design keys that are derived or file-only, so a difference in them isn't a change.
 */
const SAVE_IGNORE = new Set([
  "dragScale",
  "mountDia",
  "bMountDia",
  "finPts",
  "bFinPts",
  "inertiaMass",
  "inertiaSource",
  "bInertiaMass",
  "bInertiaSource",
  "segments",
  "bSegments",
  "transitions",
  "orkApogee",
  "orkMotor",
  "refSource",
  "finFinish",
  "bFinFinish",
]);
/**
 * Names of the design keys as the user knows them, for the save summary.
 */
const SAVE_LABEL = (() => {
  const m = {
    name: "Rocket name",
    extraFins: "Extra fin sets",
    bExtraFins: "Booster extra fin sets",
    extraMotors: "Cluster motors",
    bExtraMotors: "Booster cluster motors",
    motor: "Motor",
    bmotor: "Booster motor",
    buttons: "Rail buttons",
    lugs: "Launch lugs",
    finCdOverride: "Fin Cd override",
    bFinCdOverride: "Booster fin Cd override",
    nozzleDia: "Nozzle diameter",
  };
  for (const list of Object.values(FIELDS)) for (const [k, l] of list) if (!m[k]) m[k] = l;
  return m;
})();
/**
 * Range settings, which only feed the RSO Checklist (changing them keeps the results).
 *
 * what each format can carry
 * range settings only feed the RSO Checklist: changing them keeps the results
 */
const RANGE_KEYS = [
  "waiver",
  "waiverRef",
  "recRadius",
  "cert",
  "flightType",
  "railType",
  "ceiling",
  "cloudLow",
  "cloudMid",
  "cloudHigh",
  "cloudProf",
  "vis",
  "precip",
  "dewC",
]; // read live by the RSO Checklist: changing them doesn't change the flight
/**
 * Keys each format can't carry, so they aren't written back into the file.
 */
const SAVE_NOT = {
  common: [
    "waiver",
    "waiverRef",
    "recRadius",
    "cert",
    "flightType",
    "ignMinAlt",
    "ignMaxTilt",
    "blMode",
    "lon",
    "pressure",
    "humidity",
    "motorDT",
    "aloft",
    "tempAloft",
    "aloftSrc",
    "wxSet",
    "ceiling",
    "cloudLow",
    "cloudMid",
    "cloudHigh",
    "cloudProf",
    "vis",
    "precip",
    "dewC",
    "thrustMis",
    "finMis",
    "cgOff",
    "clusterFail",
    "mcN",
    "mcWind",
    "mcDir",
    "mcImp",
    "mcMass",
    "mcCd",
    "mcAngle",
    "mcMis",
    "mcDelay",
    "mcChute",
    "mcThermal",
    "thermalW",
    "mountSel",
    "bMountSel",
    "cone",
    "dryInertia",
    "bDryInertia",
    "railPreset",
    "buttons",
    "lugs",
    "otherCd",
    "cdOverride",
    "nozzleDia",
    "finCdOverride",
    "bFinCdOverride",
    "windRef",
    "windProfile",
    "recovery",
    "bRecovery",
    "bDiameter",
    "bExtraMotors",
  ],
  ork: ["extraMotors"],
};
/**
 * The changes since the design was opened (or since ref).
 * @param {object} [ref] a base {D, L, motorId, boostId, firstId}, in place of SOURCE.base
 * @returns {{keys:string[], saved:string[], skipped:string[], stageSwitch:boolean}|null} null without a source file
 */
function saveDiff(ref) {
  if (!SOURCE || !SOURCE.base) return null;
  const RB = ref || SOURCE.base,
    bD = RB.D,
    bL = RB.L,
    keys = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of new Set([...Object.keys(D), ...Object.keys(bD)])) {
    if (SAVE_IGNORE.has(k)) continue;
    if (!same(D[k], bD[k])) keys.push(k);
  }
  for (const k of new Set([...Object.keys(L), ...Object.keys(bL)])) if (!same(L[k], bL[k])) keys.push(k);
  if (motorId !== RB.motorId) keys.push("motor");
  if (D.twoStage && boostId !== RB.boostId) keys.push("bmotor");
  if (isThree(D) && firstId !== RB.firstId) keys.push("b1motor");
  const not = new Set([...SAVE_NOT.common, ...SAVE_NOT.ork]);
  if (D.recovery !== bD.recovery) ["mainDia", "mainCd", "mainAlt", "drogueDia", "drogueCd"].forEach((k) => not.add(k));
  if (D.bRecovery !== bD.bRecovery) ["bChuteDia", "bChuteCd"].forEach((k) => not.add(k));
  return {
    keys,
    saved: keys.filter((k) => !not.has(k)),
    skipped: keys.filter((k) => not.has(k)),
    stageSwitch: !!D.twoStage !== !!bD.twoStage,
  };
}
/**
 * The labels of a list of keys, joined, without repeats.
 */
const labelList = (ks) => [...new Set(ks.map((k) => SAVE_LABEL[k] || k))].join(", ");
