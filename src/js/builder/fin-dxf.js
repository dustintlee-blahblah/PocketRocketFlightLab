/**
 * A fin's outline as a DXF drawing at full size, for cutting it out (a laser, a CNC router, or printed as a template),
 * and the other way: a fin's outline read from a full-size DXF drawing into a free-form fin.
 */
import { bldPts } from "./model.js";
import { downloadsNS } from "../report/pdf-report.js";
import { fmt, uname } from "../ui/units.js";
/** Straight pieces in an elliptical fin's curve: under 0.01 mm off the true curve for any fin this app can fly. */
const FIN_DXF_ARC = 180;
/**
 * One fin's outline: corners in order (m), the root chord along y = 0 from x = 0 (the leading edge of the root), the
 * span up the page. Empty when the fin has no size yet.
 * @param {object} k fin part of the builder
 * @returns {number[][]}
 */
function finDxfOutline(k) {
  if (k.shape === "freeform") {
    const P = bldPts(k).pts;
    if (P.length < 3) return [];
    const x0 = Math.min(...P.map((p) => p[0]));
    return P.map((p) => [p[0] - x0, p[1]]);
  }
  if (!(k.root > 0 && k.span > 0)) return [];
  if (k.shape === "elliptical") {
    const P = [];
    for (let i = 0; i <= FIN_DXF_ARC; i++) {
      const th = Math.PI * (1 - i / FIN_DXF_ARC);
      P.push([(k.root / 2) * (1 + Math.cos(th)), k.span * Math.sin(th)]);
    }
    return P;
  }
  const P = [
    [0, 0],
    [k.sweep || 0, k.span],
    [(k.sweep || 0) + (k.tip || 0), k.span],
    [k.root, 0],
  ];
  // a pointed tip is one corner, not two on top of each other
  if (!(k.tip > 0)) P.splice(2, 1);
  return P;
}
/**
 * The fin's outline as the text of a DXF file (the 1992 "R12" form, which every CAD and cutting program reads): one
 * closed outline on a layer named FIN, in millimetres at full size.
 * @param {object} k fin part of the builder
 * @returns {string} empty when the fin has no outline
 */
function finDxf(k) {
  const P = finDxfOutline(k).map(([x, y]) => [x * 1000, y * 1000]);
  if (P.length < 3) return "";
  const n = (v) => String(+v.toFixed(4)),
    xs = P.map((p) => p[0]),
    ys = P.map((p) => p[1]);
  const L = [];
  /**
   * Adds DXF group code and value pairs.
   */
  const add = (...pairs) => {
    for (let i = 0; i < pairs.length; i += 2) L.push(String(pairs[i]), String(pairs[i + 1]));
  };
  add(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009");
  add(9, "$INSUNITS", 70, 4, 9, "$MEASUREMENT", 70, 1); // millimetres, metric
  add(9, "$EXTMIN", 10, n(Math.min(...xs)), 20, n(Math.min(...ys)), 30, 0);
  add(9, "$EXTMAX", 10, n(Math.max(...xs)), 20, n(Math.max(...ys)), 30, 0);
  add(0, "ENDSEC", 0, "SECTION", 2, "TABLES");
  add(0, "TABLE", 2, "LTYPE", 70, 1, 0, "LTYPE", 2, "CONTINUOUS", 70, 0, 3, "Solid line", 72, 65, 73, 0, 40, 0);
  add(0, "ENDTAB", 0, "TABLE", 2, "LAYER", 70, 1, 0, "LAYER", 2, "FIN", 70, 0, 62, 7, 6, "CONTINUOUS", 0, "ENDTAB");
  add(0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");
  add(0, "POLYLINE", 8, "FIN", 66, 1, 70, 1, 10, 0, 20, 0, 30, 0);
  for (const [x, y] of P) add(0, "VERTEX", 8, "FIN", 10, n(x), 20, n(y), 30, 0);
  add(0, "SEQEND", 8, "FIN", 0, "ENDSEC", 0, "EOF");
  return L.join("\r\n") + "\r\n";
}
/**
 * What the last export or import said, and for which fin: the editor is redrawn after an import, and shows it again.
 */
let finDxfSaid = null;
/**
 * The line under the DXF buttons for a fin: what the last export or import of that fin said, or what the buttons do.
 * @param {string} id the fin part's id
 * @returns {string}
 */
export const finDxfNote = (id) =>
  finDxfSaid && finDxfSaid.id === id
    ? finDxfSaid.text
    : "A full-size drawing of one fin: export it for a laser cutter, a CNC router or a printed template, or import one to make this fin that shape.";
/** Metres in one drawing unit, by the DXF header's $INSUNITS. */
const FIN_DXF_UNITS = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };
/** Degrees of arc in one straight piece when a drawing's curve is turned into corners. */
const FIN_DXF_STEP = 4;
/**
 * The paths drawn in a DXF file's text: polylines (with their arcs), lines, arcs, ellipses and splines, each as a list
 * of points in the drawing's units. Circles, text, dimensions and blocks are passed over.
 * @param {string} text the file
 * @returns {{paths:{pts:number[][], closed:boolean}[], unit:number}} unit: the header's $INSUNITS (0 if none)
 */
function finDxfPaths(text) {
  const lines = text.split(/\r\n|\r|\n/),
    pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i], 10);
    if (isFinite(c)) pairs.push([c, lines[i + 1].trim()]);
  }
  let unit = 0;
  const iu = pairs.findIndex((q) => q[0] === 9 && q[1].toUpperCase() === "$INSUNITS");
  if (iu >= 0 && pairs[iu + 1]) unit = parseInt(pairs[iu + 1][1], 10) || 0;
  let a = pairs.findIndex((q, i) => q[0] === 2 && q[1].toUpperCase() === "ENTITIES" && i > 0 && pairs[i - 1][0] === 0),
    b = pairs.length;
  if (a >= 0) {
    const e = pairs.findIndex((q, i) => i > a && q[0] === 0 && q[1].toUpperCase() === "ENDSEC");
    if (e >= 0) b = e;
  } else a = -1;
  // entities: each starts at a group 0
  const ents = [];
  for (let i = a + 1; i < b; i++) {
    if (pairs[i][0] === 0) ents.push({ type: pairs[i][1].toUpperCase(), g: [] });
    else if (ents.length) ents[ents.length - 1].g.push(pairs[i]);
  }
  const num = (e, code, d = 0) => {
      const q = e.g.find((x) => x[0] === code);
      return q && isFinite(parseFloat(q[1])) ? parseFloat(q[1]) : d;
    },
    all = (e, code) => e.g.filter((x) => x[0] === code).map((x) => parseFloat(x[1])),
    rad = Math.PI / 180;
  /**
   * Points along an arc of a circle, from angle a0 through sweep (radians, counter-clockwise positive).
   */
  const arc = (cx, cy, r, a0, sweep) => {
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / (FIN_DXF_STEP * rad))),
      out = [];
    for (let i = 0; i <= n; i++)
      out.push([cx + r * Math.cos(a0 + (sweep * i) / n), cy + r * Math.sin(a0 + (sweep * i) / n)]);
    return out;
  };
  /**
   * A polyline's corners with their bulges (an arc from a corner to the next) turned into points.
   */
  const bulged = (V, closed) => {
    const out = [];
    for (let i = 0; i < V.length; i++) {
      const p = V[i],
        q = V[(i + 1) % V.length];
      out.push([p[0], p[1]]);
      if (!p[2] || (i === V.length - 1 && !closed)) continue;
      const dx = q[0] - p[0],
        dy = q[1] - p[1],
        k = (1 - p[2] * p[2]) / (4 * p[2]),
        cx = (p[0] + q[0]) / 2 - k * dy,
        cy = (p[1] + q[1]) / 2 + k * dx;
      out.push(
        ...arc(cx, cy, Math.hypot(p[0] - cx, p[1] - cy), Math.atan2(p[1] - cy, p[0] - cx), 4 * Math.atan(p[2])).slice(
          1,
          -1,
        ),
      );
    }
    return out;
  };
  /**
   * A spline's curve as points: through its control points and knots (de Boor's algorithm), or along its fit points
   * when it has no usable control points.
   */
  const spline = (e) => {
    const cx = all(e, 10),
      cy = all(e, 20),
      knots = all(e, 40),
      deg = Math.round(num(e, 71, 3)),
      n = cx.length;
    if (n > deg && knots.length === n + deg + 1) {
      const out = [],
        t0 = knots[deg],
        t1 = knots[n],
        N = Math.max(24, n * 8);
      for (let s = 0; s <= N; s++) {
        const t = Math.min(t0 + ((t1 - t0) * s) / N, t1 - 1e-12 * (Math.abs(t1) + 1));
        let k = deg;
        while (k < n - 1 && knots[k + 1] <= t) k++;
        const d = [];
        for (let j = 0; j <= deg; j++) d.push([cx[j + k - deg], cy[j + k - deg]]);
        for (let r = 1; r <= deg; r++)
          for (let j = deg; j >= r; j--) {
            const den = knots[j + 1 + k - r] - knots[j + k - deg],
              al = den > 0 ? (t - knots[j + k - deg]) / den : 0;
            d[j] = [(1 - al) * d[j - 1][0] + al * d[j][0], (1 - al) * d[j - 1][1] + al * d[j][1]];
          }
        out.push(d[deg]);
      }
      return out;
    }
    const fx = all(e, 11),
      fy = all(e, 21);
    return fx.length >= 2 ? fx.map((x, i) => [x, fy[i]]) : cx.map((x, i) => [x, cy[i]]);
  };
  const paths = [];
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.type === "LINE")
      paths.push({
        pts: [
          [num(e, 10), num(e, 20)],
          [num(e, 11), num(e, 21)],
        ],
        closed: false,
      });
    else if (e.type === "ARC") {
      const a0 = num(e, 50) * rad;
      let sw = ((((num(e, 51) - num(e, 50)) % 360) + 360) % 360) * rad;
      if (sw === 0) sw = 2 * Math.PI;
      paths.push({ pts: arc(num(e, 10), num(e, 20), num(e, 40), a0, sw), closed: false });
    } else if (e.type === "ELLIPSE") {
      const cx = num(e, 10),
        cy = num(e, 20),
        mx = num(e, 11),
        my = num(e, 21),
        ratio = num(e, 40, 1),
        t0 = num(e, 41, 0);
      let t1 = num(e, 42, 2 * Math.PI);
      if (t1 <= t0) t1 += 2 * Math.PI;
      const n = Math.max(2, Math.ceil((t1 - t0) / (FIN_DXF_STEP * rad))),
        pts = [];
      for (let j = 0; j <= n; j++) {
        const t = t0 + ((t1 - t0) * j) / n;
        pts.push([cx + Math.cos(t) * mx - Math.sin(t) * ratio * my, cy + Math.cos(t) * my + Math.sin(t) * ratio * mx]);
      }
      const full = Math.abs(t1 - t0 - 2 * Math.PI) < 1e-6;
      paths.push({ pts: full ? pts.slice(0, -1) : pts, closed: full });
    } else if (e.type === "SPLINE") {
      const pts = spline(e),
        closed = (Math.round(num(e, 70)) & 1) === 1;
      if (pts.length >= 2) paths.push({ pts, closed });
    } else if (e.type === "LWPOLYLINE") {
      // corners come as 10, 20 and (sometimes) 42 for the arc to the next corner, in that order
      const V = [];
      for (const [c, v] of e.g) {
        if (c === 10) V.push([parseFloat(v), 0, 0]);
        else if (c === 20 && V.length) V[V.length - 1][1] = parseFloat(v);
        else if (c === 42 && V.length) V[V.length - 1][2] = parseFloat(v);
      }
      const closed = (Math.round(num(e, 70)) & 1) === 1;
      if (V.length >= 2) paths.push({ pts: bulged(V, closed), closed });
    } else if (e.type === "POLYLINE") {
      const closed = (Math.round(num(e, 70)) & 1) === 1,
        V = [];
      for (i++; i < ents.length && ents[i].type === "VERTEX"; i++)
        V.push([num(ents[i], 10), num(ents[i], 20), num(ents[i], 42)]);
      i--;
      if (V.length >= 2) paths.push({ pts: bulged(V, closed), closed });
    }
  }
  return { paths, unit };
}
/**
 * The outline in a drawing's paths: its closed shapes, and the shapes its separate lines and arcs make when joined end
 * to end; the one enclosing the most area is the fin (a hole or a border inside it is not).
 * @param {{pts:number[][], closed:boolean}[]} paths from finDxfPaths
 * @returns {number[][]|null} the outline's corners in order, without the first repeated at the end
 */
function finDxfLoop(paths) {
  const xs = paths.flatMap((p) => p.pts.map((q) => q[0])),
    ys = paths.flatMap((p) => p.pts.map((q) => q[1]));
  if (!xs.length) return null;
  const tol = 1e-4 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-9),
    near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
  const loops = paths.filter((p) => p.closed).map((p) => p.pts.slice()),
    open = paths.filter((p) => !p.closed).map((p) => p.pts.slice());
  while (open.length) {
    let cur = open.pop(),
      grew = true;
    while (grew && !near(cur[0], cur[cur.length - 1])) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const o = open[i],
          end = cur[cur.length - 1];
        if (near(end, o[0])) cur = cur.concat(o.slice(1));
        else if (near(end, o[o.length - 1])) cur = cur.concat(o.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (cur.length > 3 && near(cur[0], cur[cur.length - 1])) loops.push(cur.slice(0, -1));
  }
  const area = (P) =>
    Math.abs(P.reduce((s, p, i) => s + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0)) / 2;
  let best = null;
  for (const L of loops) {
    // corners drawn twice in a row are one corner
    const P = L.filter((p, i) => !near(p, L[(i + 1) % L.length]));
    if (P.length >= 3 && (!best || area(P) > area(best))) best = P;
  }
  return best;
}
/**
 * An outline turned and moved to sit as a free-form fin does: the root along y = 0 from x = 0, the fin above it, the
 * corners listed from the root's front end around to its back end. The root is the edge along the bottom of the
 * drawing; failing that the edge along its top or a side (the drawing is turned, never mirrored); failing that the
 * longest straight edge.
 * @param {number[][]} P outline corners (m)
 * @returns {{pts:number[][], root:string}} root: which edge was taken as the root
 */
function finDxfSeat(P) {
  const box = (Q) => ({
      x0: Math.min(...Q.map((p) => p[0])),
      x1: Math.max(...Q.map((p) => p[0])),
      y0: Math.min(...Q.map((p) => p[1])),
      y1: Math.max(...Q.map((p) => p[1])),
    }),
    B = box(P),
    e = 1e-4 * Math.max(B.x1 - B.x0, B.y1 - B.y0);
  /**
   * The length of outline lying along one side of its box.
   */
  const along = (axis, v) =>
    P.reduce((s, p, i) => {
      const q = P[(i + 1) % P.length];
      return Math.abs(p[axis] - v) <= e && Math.abs(q[axis] - v) <= e ? s + Math.hypot(q[0] - p[0], q[1] - p[1]) : s;
    }, 0);
  const sides = [
    ["the edge along the bottom of the drawing", along(1, B.y0), (p) => [p[0], p[1]]],
    ["the edge along the top of the drawing", along(1, B.y1), (p) => [-p[0], -p[1]]],
    ["the edge along the left of the drawing", along(0, B.x0), (p) => [-p[1], p[0]]],
    ["the edge along the right of the drawing", along(0, B.x1), (p) => [p[1], -p[0]]],
  ];
  let pick = sides[0][1] > e ? sides[0] : sides.slice(1).sort((a, b) => b[1] - a[1])[0];
  if (!(pick[1] > e)) {
    // no edge on the box: the longest edge, turned to lie along the bottom with the fin above it
    let bi = 0,
      bl = 0;
    P.forEach((p, i) => {
      const q = P[(i + 1) % P.length],
        l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (l > bl) [bl, bi] = [l, i];
    });
    const p = P[bi],
      q = P[(bi + 1) % P.length],
      c = (q[0] - p[0]) / bl,
      s = (q[1] - p[1]) / bl,
      turn = (r) => [(r[0] - p[0]) * c + (r[1] - p[1]) * s, -(r[0] - p[0]) * s + (r[1] - p[1]) * c],
      up = P.map(turn).reduce((m, r) => m + r[1], 0) >= 0;
    pick = ["its longest straight edge", bl, (r) => (up ? turn(r) : turn(r).map((v) => -v))];
  }
  let Q = P.map(pick[2]);
  const b = box(Q),
    onRoot = (p) => Math.abs(p[1] - b.y0) <= e,
    x0 = Math.min(...Q.filter(onRoot).map((p) => p[0]));
  Q = Q.map((p) => [p[0] - x0, Math.max(0, p[1] - b.y0)]);
  // start at the root's front end, and go round the way that leaves the root's back end for last
  const i0 = Q.findIndex((p) => p[1] <= e && Math.abs(p[0]) <= e),
    n = Q.length,
    nx = Q[(i0 + 1) % n],
    fwd = !(nx[1] <= e && nx[0] > e);
  const out = [];
  for (let k = 0; k < n; k++) out.push(Q[(((i0 + (fwd ? k : -k)) % n) + n) % n]);
  return { pts: out, root: pick[0] };
}
/**
 * Fewer corners along a path where they add nothing (Douglas and Peucker's method): a corner stays only if dropping it
 * would move the outline by more than tol.
 * @param {number[][]} P path, ends kept
 * @param {number} tol m
 * @returns {number[][]}
 */
function finDxfThin(P, tol) {
  if (P.length < 3) return P;
  const a = P[0],
    b = P[P.length - 1],
    L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-12;
  let far = 0,
    at = 0;
  for (let i = 1; i < P.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - P[i][1]) - (a[0] - P[i][0]) * (b[1] - a[1])) / L;
    if (d > far) [far, at] = [d, i];
  }
  if (far <= tol) return [a, b];
  return finDxfThin(P.slice(0, at + 1), tol)
    .slice(0, -1)
    .concat(finDxfThin(P.slice(at), tol));
}
/**
 * A fin's outline read from a DXF file's text.
 * @param {string} text the file
 * @param {string} [as] "mm" or "in" to read the drawing in that unit whatever the file says
 * @returns {{pts:number[][], root:number, span:number, unit:string, said:boolean, seat:string}|{error:string}}
 *   pts: the free-form fin's corners (m); unit: the unit it was read in; said: the file named its unit
 */
function finDxfRead(text, as) {
  const { paths, unit } = finDxfPaths(text);
  const loop = finDxfLoop(paths);
  if (!loop)
    return {
      error: paths.length
        ? "The drawing’s lines don’t join up into a closed outline."
        : "No outline found in the file. It needs the fin drawn as lines, arcs, a polyline or a spline (a DXF saved as text, not binary).",
    };
  const said = !as && unit in FIN_DXF_UNITS,
    k = as === "in" ? 0.0254 : as === "mm" ? 0.001 : said ? FIN_DXF_UNITS[unit] : 0.001,
    name =
      as === "in"
        ? "inches"
        : as === "mm"
          ? "millimetres"
          : said
            ? { 1: "inches", 2: "feet", 4: "millimetres", 5: "centimetres", 6: "metres" }[unit]
            : "millimetres";
  const S = finDxfSeat(loop.map((p) => [p[0] * k, p[1] * k]));
  let tol = 2e-5,
    pts = finDxfThin(S.pts, tol);
  while (pts.length > 250) pts = finDxfThin(S.pts, (tol *= 2));
  const root = Math.max(...pts.filter((p) => p[1] <= 1e-9).map((p) => p[0]), 0),
    span = Math.max(...pts.map((p) => p[1]));
  if (pts.length < 3 || !(root > 0 && span > 0))
    return { error: "The outline has no straight root edge to sit on the body." };
  return { pts, root, span, unit: name, said, seat: S.root };
}
/**
 * Reads a fin's outline from a DXF file and makes the fin that shape (a free-form fin); the number of fins, their
 * thickness, edges, cant, position and material stay as they are. Says what was read under the buttons.
 * @param {object} k fin part of the builder
 * @param {File} file the DXF file
 * @param {string} as "" (as the file says), "mm" or "in"
 * @param {function():void} changed called once the fin has its new outline
 */
export async function finDxfLoad(k, file, as, changed) {
  let R;
  try {
    R = finDxfRead(await file.text(), as);
  } catch (e) {
    R = { error: "The file couldn’t be read." };
  }
  if (!R.error && (R.span > 2 || R.root > 3 || Math.max(R.span, R.root) < 0.01))
    R = {
      error: `Read in ${R.unit}, the fin would be ${fmt(R.root, "len")} ${uname("len")} along the root and ${fmt(R.span, "len")} ${uname("len")} tall. Choose the drawing’s unit beside the button and import it again.`,
    };
  if (R.error) {
    finDxfSaid = { id: k.id, text: `Not imported: ${R.error}` };
    const msg = document.getElementById("bldfindxfmsg");
    if (msg) msg.textContent = finDxfSaid.text;
    return;
  }
  k.shape = "freeform";
  k.pts = R.pts.map((p) => `${+p[0].toFixed(5)},${+p[1].toFixed(5)}`).join("\n");
  finDxfSaid = {
    id: k.id,
    text: `Imported ${file.name}: ${fmt(R.root, "len")} ${uname("len")} along the root, ${fmt(R.span, "len")} ${uname("len")} tall, ${R.pts.length} corners, read in ${R.unit}${R.said || as ? "" : " (the file doesn’t say its unit)"}. The root is ${R.seat}. Check the drawing above: if the size is wrong choose the unit and import again, and if the fin is back to front, flip it.`,
  };
  changed();
}
/**
 * Turns a free-form fin back to front: its leading edge becomes its trailing edge.
 * @param {object} k fin part of the builder
 */
export function finDxfFlip(k) {
  const P = bldPts(k).pts;
  if (P.length < 3) return;
  const x1 = Math.max(...P.map((p) => p[0]));
  k.pts = P.map((p) => `${+(x1 - p[0]).toFixed(5)},${+p[1].toFixed(5)}`)
    .reverse()
    .join("\n");
}
/**
 * Saves a fin's outline as a DXF file and says what happened under the button.
 * @param {object} k fin part of the builder
 * @param {string} design the design's name, for the file's name
 */
export async function finDxfSave(k, design) {
  const msg = document.getElementById("bldfindxfmsg"),
    say = (t) => {
      finDxfSaid = { id: k.id, text: t };
      if (msg) msg.textContent = t;
    };
  const text = finDxf(k);
  if (!text) {
    say("Give the fin its sizes first.");
    return;
  }
  if (!downloadsNS) {
    say("Saving files isn’t available in this view.");
    return;
  }
  const name =
    `${design || "rocket"}-${k.name || "fin"}`
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") + ".dxf";
  try {
    const res = await downloadsNS.save({ filename: name, data: new TextEncoder().encode(text).buffer });
    say(
      `${res.status === "saved" ? `Saved ${name}.` : "Choose where to save the drawing."} One fin at full size, in millimetres: tell your cutting program the file is in mm if it asks.`,
    );
  } catch (e) {
    say(
      e && e.code === "declined"
        ? "Save cancelled."
        : `Couldn’t save the drawing${e && e.message ? ": " + e.message : "."}`,
    );
  }
}
