/**
 * A fin's outline as a DXF drawing at full size, for cutting it out (a laser, a CNC router, or printed as a template).
 */
import { bldPts } from "./model.js";
import { downloadsNS } from "../report/pdf-report.js";
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
 * Saves a fin's outline as a DXF file and says what happened under the button.
 * @param {object} k fin part of the builder
 * @param {string} design the design's name, for the file's name
 */
export async function finDxfSave(k, design) {
  const msg = document.getElementById("bldfindxfmsg"),
    say = (t) => {
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
