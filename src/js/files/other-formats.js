/**
 * Design files from other programs: RockSim (.rkt) and RASAero II (.CDX1). Each is read by rewriting it as an
 * OpenRocket design (rocksim-import.js, rasaero-import.js), and is only ever read: changes are saved as a new .ork
 * file beside it.
 */
import { isCdx, parseCdx } from "./rasaero-import.js";
import { parseRkt } from "./rocksim-import.js";

/**
 * The ending of a design file's name: OpenRocket's or another program's.
 */
export const DESIGN_EXT = /\.(ork|rkt|cdx1)$/i;
/**
 * Which other program's design a file's text is.
 * @param {string} xml
 * @returns {"rkt"|"cdx"|null} null for an OpenRocket design
 */
export const otherFormat = (xml) =>
  /<RockSimDocument/i.test((xml || "").slice(0, 4000)) ? "rkt" : isCdx(xml) ? "cdx" : null;
/**
 * True if an open design came from another program's file (SOURCE.format), which is never written over.
 * @param {{format:string}|null} src
 * @returns {boolean}
 */
export const isOther = (src) => !!src && (src.format === "rkt" || src.format === "cdx");
/**
 * The program an open design's file came from, and the ending of its files.
 * @param {{format:string}|null} src
 * @returns {{app:string, ext:string}}
 */
export const otherApp = (src) =>
  src && src.format === "cdx" ? { app: "RASAero II", ext: ".CDX1" } : { app: "RockSim", ext: ".rkt" };
/**
 * Reads another program's design.
 * @param {string} xml the file's text
 * @param {string} [fileName] the file's name (a RASAero design has no name of its own)
 * @returns {object} the same shape as parseOrk's result, with orkXml: the design as OpenRocket XML
 */
export function parseOther(xml, fileName) {
  return isCdx(xml) ? parseCdx(xml, (fileName || "").replace(DESIGN_EXT, "").trim()) : parseRkt(xml);
}
