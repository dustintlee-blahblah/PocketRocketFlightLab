/*
 * Reads a drag profile (the whole rocket's drag coefficient against Mach number) from another program's file, to fly
 * with in place of the app's own drag model and to compare with it:
 *   - RASAero II: Aero Plots > File > Export > To CSV File (columns Mach, Alpha, CD Power-Off, CD Power-On, ...): the
 *     zero angle-of-attack rows, coasting and motor-burning curves;
 *   - OpenRocket: a simulation's exported CSV with the "Mach number" and "Drag coefficient" columns (and Time, Altitude,
 *     Thrust and Angle of attack when they are there): the ascent, burning and coasting apart, averaged in Mach bands;
 *   - anything else (a CFD run, a spreadsheet): a table whose columns are Mach number and Cd, with an optional third
 *     column for Cd with the motor burning; commas, semicolons, tabs or spaces; a heading row or none.
 * A profile's Cd is on its program's reference area: the body's largest cross-section in RASAero II and OpenRocket,
 * as here; a CFD table can give its own reference diameter (refD).
 */

/** Most points kept of a curve (a RASAero II export has 2,500). */
const MAX_PTS = 160;

/**
 * Splits a line of a table into its cells.
 * @param {string} line
 * @param {string} sep "," ";" or " " (any run of spaces or tabs)
 * @returns {string[]}
 */
function cells(line, sep) {
  return (sep === " " ? line.trim().split(/\s+/) : line.split(sep)).map((c) => c.trim().replace(/^"|"$/g, ""));
}
/**
 * The separator a table uses, from one of its lines.
 * @param {string} line
 * @returns {string}
 */
function sepOf(line) {
  if (line.includes(";")) return ";";
  if (line.includes(",")) return ",";
  return " ";
}
/**
 * Thins a curve to the points that carry its shape (Douglas–Peucker on each Cd column, the kept points pooled), so a
 * profile saved in a design file stays small.
 * @param {number[]} m Mach numbers, rising
 * @param {number[][]} cols Cd columns
 * @returns {number[]} the indices kept
 */
function thin(m, cols) {
  const n = m.length;
  if (n <= MAX_PTS) return m.map((_, i) => i);
  for (let tol = 0.0005; ; tol *= 1.6) {
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    for (const y of cols) {
      const stack = [[0, n - 1]];
      while (stack.length) {
        const [a, b] = stack.pop();
        let worst = 0,
          at = -1;
        for (let i = a + 1; i < b; i++) {
          const d = Math.abs(y[i] - (y[a] + ((y[b] - y[a]) * (m[i] - m[a])) / (m[b] - m[a])));
          if (d > worst) {
            worst = d;
            at = i;
          }
        }
        if (worst > tol) {
          keep[at] = 1;
          stack.push([a, at], [at, b]);
        }
      }
    }
    const idx = [];
    for (let i = 0; i < n; i++) if (keep[i]) idx.push(i);
    if (idx.length <= MAX_PTS) return idx;
  }
}
/**
 * Makes a profile of rows of [Mach, Cd coasting, Cd burning or NaN]: sorted, one row a Mach number, thinned, rounded.
 * @param {number[][]} rows
 * @param {string} src where it is from
 * @param {string} name the file's name
 * @param {string} [note] something to tell about it
 * @returns {{src:string, name:string, m:number[], off:number[], on:number[]|null, refD:number, use:boolean, note:string}}
 */
function profile(rows, src, name, note = "") {
  const ok = rows
    .filter((r) => isFinite(r[0]) && r[0] >= 0 && isFinite(r[1]) && r[1] > 0 && r[1] < 20)
    .sort((a, b) => a[0] - b[0]);
  const u = [];
  for (const r of ok) if (!u.length || r[0] - u[u.length - 1][0] > 1e-6) u.push(r);
  if (u.length < 2)
    throw new Error("That file has fewer than two rows with a Mach number and a drag coefficient to read.");
  const hasOn = u.every((r) => isFinite(r[2]) && r[2] > 0),
    m = u.map((r) => r[0]),
    idx = thin(m, hasOn ? [u.map((r) => r[1]), u.map((r) => r[2])] : [u.map((r) => r[1])]),
    r4 = (v) => +v.toFixed(4);
  return {
    src,
    name: String(name || "").slice(0, 80),
    m: idx.map((i) => r4(u[i][0])),
    off: idx.map((i) => r4(u[i][1])),
    on: hasOn ? idx.map((i) => r4(u[i][2])) : null,
    refD: 0,
    use: true,
    note,
  };
}
/**
 * Averages rows of [Mach, Cd] in Mach bands.
 * @param {number[][]} rows
 * @param {number} w band width
 * @returns {Map<number, number>} band number → mean Cd
 */
function bands(rows, w) {
  const acc = new Map();
  for (const [M, cd] of rows) {
    const k = Math.round(M / w),
      a = acc.get(k) || [0, 0];
    a[0] += cd;
    a[1]++;
    acc.set(k, a);
  }
  return new Map([...acc].map(([k, a]) => [k, a[0] / a[1]]));
}
/**
 * Reads a drag profile from a file's text.
 * @param {string} text the file
 * @param {string} [name] its name
 * @returns {{src:string, name:string, m:number[], off:number[], on:number[]|null, refD:number, use:boolean, note:string}}
 *   m: Mach numbers, rising; off: Cd coasting; on: Cd with the motor burning, when the file has it; refD: the
 *   reference diameter its Cd is on (m), 0 for the rocket's own; use: fly with it
 * @throws {Error} with a message for the user when the file can't be read as a drag profile
 */
export function parseDragProfile(text, name = "") {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (!lines.length) throw new Error("That file is empty.");
  const num = (s) => (s == null || s === "" ? NaN : +String(s).replace(",", "."));
  // ---- OpenRocket: a comment line names the columns
  const orHead = lines.findIndex((l) => /^\s*#/.test(l) && /mach number/i.test(l) && /drag coefficient/i.test(l));
  if (orHead >= 0) {
    const sep = sepOf(lines[orHead].replace(/^\s*#\s*/, "")),
      H = cells(lines[orHead].replace(/^\s*#\s*/, ""), sep).map((h) => h.toLowerCase()),
      col = (re) => H.findIndex((h) => re.test(h)),
      cM = col(/^mach number/),
      cD = col(/^drag coefficient/),
      cAlt = col(/^altitude/),
      cT = col(/^thrust/),
      cA = col(/^angle of attack/);
    let rows = lines
      .slice(orHead + 1)
      .filter((l) => !/^\s*#/.test(l))
      .map((l) => cells(l, sep).map(num));
    // the ascent only: up to the highest point
    if (cAlt >= 0) {
      let top = 0;
      rows.forEach((r, i) => {
        if (r[cAlt] > rows[top][cAlt]) top = i;
      });
      rows = rows.slice(0, top + 1);
    }
    // flying straight: the drag at an angle isn't the profile (OpenRocket gives the angle in degrees)
    rows = rows.filter((r) => r[cM] >= 0.05 && r[cD] > 0 && !(cA >= 0 && Math.abs(r[cA]) > 3));
    const burn = cT >= 0 ? rows.filter((r) => r[cT] > 0) : [],
      coast = cT >= 0 ? rows.filter((r) => !(r[cT] > 0)) : rows,
      w = 0.02,
      bOff = bands(
        coast.map((r) => [r[cM], r[cD]]),
        w,
      ),
      bOn = bands(
        burn.map((r) => [r[cM], r[cD]]),
        w,
      );
    if (bOff.size < 2 && bOn.size < 2)
      throw new Error("That OpenRocket export has no ascent with a Mach number and drag coefficient to read.");
    // OpenRocket's drag doesn't change with the motor burning, so one curve fills the other's gaps
    const keys = [...new Set([...bOff.keys(), ...bOn.keys()])].sort((a, b) => a - b),
      both = bOff.size >= 2 && bOn.size >= 2;
    return profile(
      keys.map((k) => [k * w, bOff.get(k) ?? bOn.get(k), both ? (bOn.get(k) ?? bOff.get(k)) : NaN]),
      "OpenRocket",
      name,
      "Read from one flight: the drag at that flight’s speeds and altitudes, to its top speed.",
    );
  }
  // ---- a table: a heading row, or none
  const data = lines.filter((l) => !/^\s*(#|\/\/|%)/.test(l)),
    sep = sepOf(data[Math.min(1, data.length - 1)]),
    first = cells(data[0], sep),
    headed = first.some((c) => c !== "" && !isFinite(num(c))),
    H = headed ? first.map((h) => h.toLowerCase()) : [],
    body = (headed ? data.slice(1) : data).map((l) => cells(l, sep).map(num));
  // RASAero II
  if (H.includes("mach") && H.some((h) => /^cd power-off/.test(h))) {
    const cM = H.indexOf("mach"),
      cOff = H.findIndex((h) => /^cd power-off/.test(h)),
      cOn = H.findIndex((h) => /^cd power-on/.test(h)),
      cA = H.indexOf("alpha"),
      a0 = cA >= 0 ? Math.min(...body.map((r) => Math.abs(r[cA])).filter(isFinite)) : 0,
      rows = body.filter((r) => cA < 0 || Math.abs(Math.abs(r[cA]) - a0) < 1e-9);
    return profile(
      rows.map((r) => [r[cM], r[cOff], cOn >= 0 ? r[cOn] : NaN]),
      "RASAero II",
      name,
      a0 > 0 ? `The file has no zero angle-of-attack rows: read at ${a0}°.` : "",
    );
  }
  let cM = H.findIndex((h) => /mach|^m$|^ma$/.test(h)),
    cOn = H.findIndex((h) => /c[ _]?d|drag/.test(h) && /on\b|burn|thrust|power(ed)?$/.test(h) && !/off/.test(h)),
    cOff = H.findIndex((h, i) => i !== cOn && /c[ _]?d|drag/.test(h));
  if (headed && (cM < 0 || cOff < 0)) {
    // headings that don't say: Mach number first, Cd second
    if (first.length < 2) throw new Error("That file needs two columns: Mach number, then drag coefficient.");
    cM = 0;
    cOff = 1;
    cOn = -1;
  }
  if (!headed) {
    if (first.length < 2) throw new Error("That file needs two columns: Mach number, then drag coefficient.");
    cM = 0;
    cOff = 1;
    cOn = first.length > 2 ? 2 : -1;
  }
  return profile(
    body.map((r) => [r[cM], r[cOff], cOn >= 0 ? r[cOn] : NaN]),
    "Table",
    name,
  );
}
/**
 * A drag profile as a design file keeps it (the JSON in this app's prflcdcurve element), checked.
 * @param {string} [json]
 * @returns {object|null} the profile, or null when there is none or it can't be used
 */
export function readCdCurve(json) {
  if (!json) return null;
  try {
    const c = JSON.parse(json),
      nums = (a) => Array.isArray(a) && a.every((v) => typeof v === "number" && isFinite(v));
    if (!nums(c.m) || !nums(c.off) || c.m.length < 2 || c.off.length !== c.m.length) return null;
    if (c.m.some((v, i) => i && v <= c.m[i - 1])) return null;
    return {
      src: String(c.src || "Table").slice(0, 40),
      name: String(c.name || "").slice(0, 80),
      m: c.m,
      off: c.off,
      on: nums(c.on) && c.on.length === c.m.length ? c.on : null,
      refD: c.refD > 0 ? +c.refD : 0,
      use: c.use !== false,
      note: String(c.note || "").slice(0, 200),
    };
  } catch (e) {
    return null;
  }
}
