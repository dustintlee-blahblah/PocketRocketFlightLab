/**
 * What counts as a change to the design file (for the unsaved-changes check), the range-only settings, and keeping
 * an .ork file's other zip entries when it is saved.
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
 * Range settings, which only feed the RSO Checklist (changing them keeps the results).
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
 * Keys the design file doesn't carry (app-only settings), so changing them isn't an unsaved change.
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
