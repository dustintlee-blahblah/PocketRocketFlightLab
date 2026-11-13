/**
 * Reading compressed files: inflating deflate and gzip data, listing a zip file's entries, and unpacking an OpenRocket
 * .ork file (zip or gzip) to its XML.
 */
/* ---------- .ork import ---------- */
/**
 * Decompresses bytes with the browser's DecompressionStream.
 * @param {Uint8Array} bytes
 * @param {string} format "gzip", "deflate" or "deflate-raw"
 * @returns {Promise<Uint8Array>}
 */
export async function inflate(bytes, format) {
  if (typeof DecompressionStream === "undefined")
    throw new Error("This browser cannot decompress .ork files. Update Chrome on your phone and try again.");
  const ds = new DecompressionStream(format);
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
/**
 * Lists the files in a .zip archive from its central directory.
 * @param {ArrayBuffer} buf
 * @returns {Promise<{name:string, read:function():Promise<Uint8Array>}[]>}
 */
export async function unzipEntries(buf) {
  const u8 = new Uint8Array(buf),
    dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("The zip file looks damaged.");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true),
      csize = dv.getUint32(p + 20, true),
      nlen = dv.getUint16(p + 28, true),
      xlen = dv.getUint16(p + 30, true),
      clen = dv.getUint16(p + 32, true),
      off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    out.push({
      name,
      data: async () => {
        const lnl = dv.getUint16(off + 26, true),
          lxl = dv.getUint16(off + 28, true);
        const d = u8.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
        return method === 0 ? d : await inflate(d, "deflate-raw");
      },
    });
  }
  return out;
}
/**
 * The design XML of an .ork file, which can be a zip archive, gzip or plain XML.
 * @param {ArrayBuffer} buf
 * @returns {Promise<string>}
 */
export async function unzipOrk(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x1f && u8[1] === 0x8b) return new TextDecoder().decode(await inflate(u8, "gzip"));
  if (u8[0] !== 0x50 || u8[1] !== 0x4b) return new TextDecoder().decode(u8);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("The .ork zip archive looks damaged.");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true),
      csize = dv.getUint32(p + 20, true),
      nlen = dv.getUint16(p + 28, true),
      xlen = dv.getUint16(p + 30, true),
      clen = dv.getUint16(p + 32, true),
      off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    entries.push({ name, method, csize, off });
    p += 46 + nlen + xlen + clen;
  }
  const e =
    entries.find((e) => /rocket\.ork$/i.test(e.name)) ||
    entries.find((e) => /\.ork$/i.test(e.name)) ||
    entries.find((e) => /\.xml$/i.test(e.name));
  if (!e) throw new Error("No rocket design was found inside this .ork file.");
  const lnl = dv.getUint16(e.off + 26, true),
    lxl = dv.getUint16(e.off + 28, true);
  const data = u8.subarray(e.off + 30 + lnl + lxl, e.off + 30 + lnl + lxl + e.csize);
  const raw = e.method === 0 ? data : await inflate(data, "deflate-raw");
  return new TextDecoder().decode(raw);
}
