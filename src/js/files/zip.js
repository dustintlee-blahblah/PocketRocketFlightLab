/**
 * Zip files: writing them (compressed for a saved .ork, as OpenRocket writes it; stored for the web download wrapper),
 * and keeping an .ork file's other entries (decal images) when it is saved.
 */
import { inflate } from "./unzip.js";
import { bufToB64 } from "../report/pdf-report.js";
/**
 * The CRC-32 lookup table.
 */
let CRC_T;
/**
 * CRC-32 of bytes.
 * @param {Uint8Array} u
 * @returns {number}
 */
function crc32(u) {
  let c = 0xffffffff;
  for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/**
 * A zip archive of files, each stored as given or already deflated.
 * @param {{name:string, data:Uint8Array, z?:Uint8Array}[]} files data is the file; z, when given, its raw deflate
 * @returns {Uint8Array}
 */
function zipBuild(files) {
  const enc = new TextEncoder(),
    parts = [],
    cd = [];
  let off = 0;
  const d = new Date(),
    dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const f of files) {
    const nm = enc.encode(f.name),
      crc = crc32(f.data),
      sz = f.data.length,
      body = f.z || f.data,
      method = f.z ? 8 : 0,
      csz = body.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true);
    h.setUint16(8, method, true);
    h.setUint16(10, tm, true);
    h.setUint16(12, dt, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, csz, true);
    h.setUint32(22, sz, true);
    h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, method, true);
    c.setUint16(12, tm, true);
    c.setUint16(14, dt, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, csz, true);
    c.setUint32(24, sz, true);
    c.setUint16(28, nm.length, true);
    c.setUint32(42, off, true);
    cd.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + csz;
  }
  const cdSize = cd.reduce((a, b) => a + b.length, 0),
    z = new DataView(new ArrayBuffer(22));
  z.setUint32(0, 0x06054b50, true);
  z.setUint16(8, files.length, true);
  z.setUint16(10, files.length, true);
  z.setUint32(12, cdSize, true);
  z.setUint32(16, off, true);
  const all = [...parts, ...cd, new Uint8Array(z.buffer)],
    out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}
/**
 * A zip archive of files, uncompressed.
 * @param {{name:string, data:Uint8Array}[]} files
 * @returns {Uint8Array}
 */
export function zipStore(files) {
  return zipBuild(files.map((f) => ({ name: f.name, data: f.data })));
}
/**
 * A zip archive of files, each deflated where that makes it smaller (stored where the browser can't compress).
 * @param {{name:string, data:Uint8Array}[]} files
 * @returns {Promise<Uint8Array>}
 */
export async function zipDeflate(files) {
  const out = [];
  for (const f of files) {
    let z = null;
    try {
      if (typeof CompressionStream === "function" && f.data.length > 64)
        z = new Uint8Array(
          await new Response(
            new Blob([f.data]).stream().pipeThrough(new CompressionStream("deflate-raw")),
          ).arrayBuffer(),
        );
    } catch (e) {
      z = null;
    }
    out.push({ name: f.name, data: f.data, ...(z && z.length < f.data.length ? { z } : {}) });
  }
  return zipBuild(out);
}
/**
 * True inside the Android app (which saves files through its own bridge).
 */
export const isAndroidApp = () => !!(window.PocketRocketApp && window.PocketRocketApp.saveFile);
/**
 * The other files inside an .ork zip (decal images), as base64, so a save keeps them.
 * @param {ArrayBuffer} buf
 * @returns {Promise<{name:string, b64:string}[]>}
 *
 * the other files inside an OpenRocket .ork zip (decal images), kept so a save doesn't lose them
 */
export async function zipOthers(buf) {
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
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  CRC_T = (() => {
    const t = new Uint32Array(256);
    for (let k = 0; k < 256; k++) {
      let c = k;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[k] = c >>> 0;
    }
    return t;
  })();
}
