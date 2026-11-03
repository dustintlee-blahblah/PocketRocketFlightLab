/* --- zip (stored, no compression): OpenRocket's own .ork format, and a wrapper for web downloads --- */
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let k = 0; k < 256; k++) {
    let c = k;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[k] = c >>> 0;
  }
  return t;
})();
function crc32(u) {
  let c = 0xffffffff;
  for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
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
      sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true);
    h.setUint16(10, tm, true);
    h.setUint16(12, dt, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, sz, true);
    h.setUint32(22, sz, true);
    h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(12, tm, true);
    c.setUint16(14, dt, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, sz, true);
    c.setUint32(24, sz, true);
    c.setUint16(28, nm.length, true);
    c.setUint32(42, off, true);
    cd.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + sz;
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
const isAndroidApp = () => !!(window.PocketRocketApp && window.PocketRocketApp.saveFile);
