/*
 * Reading values out of an OpenRocket design's XML: a part's child elements as text and numbers, its subcomponents,
 * where it sits on its parent, how long it is, and the outline of a free-form fin. Nothing here keeps any state; the
 * design reader (openrocket-import.js) is built on these.
 */

/**
 * The first child element with a tag name.
 * @param {Element} el
 * @param {string} tag
 * @returns {Element|undefined}
 */
export const elKid = (el, tag) => [...el.children].find((c) => c.tagName === tag);
/**
 * The trimmed text of a child element, or null.
 * @param {Element} el
 * @param {string} tag
 * @returns {string|null}
 */
export const elTxt = (el, tag) => {
  const c = elKid(el, tag);
  return c ? c.textContent.trim() : null;
};
/**
 * The first number in a child element's text, or def.
 * @param {Element} el
 * @param {string} tag
 * @param {number} [def=0] the value when the element is missing or holds no number
 * @returns {number}
 */
export const elNum = (el, tag, def = 0) => {
  const s = elTxt(el, tag);
  if (s == null) return def;
  const mm = s.match(/-?\d+(\.\d+)?(e-?\d+)?/i);
  return mm ? parseFloat(mm[0]) : def;
};
/**
 * True if a child element's value is OpenRocket's "auto".
 * @param {Element} el
 * @param {string} tag
 * @returns {boolean}
 */
export const elIsAuto = (el, tag) => {
  const s = elTxt(el, tag);
  return s != null && /^\s*auto/i.test(s);
};
/**
 * The cached number after "auto" (may be stale).
 * @param {Element} el
 * @param {string} tag
 * @returns {number}
 */
export const elAutoNum = (el, tag) => {
  const s = elTxt(el, tag) || "";
  const mm = s.match(/-?\d+(\.\d+)?(e-?\d+)?/i);
  return mm ? parseFloat(mm[0]) : 0;
};
/**
 * The density attribute of a part's material element.
 * @param {Element} el
 * @param {string} [tag="material"] the material element's tag
 * @returns {number} 0 if there is none
 */
export const elDens = (el, tag = "material") => {
  const c = elKid(el, tag);
  return c ? parseFloat(c.getAttribute("density")) || 0 : 0;
};
/**
 * A component's subcomponents.
 * @param {Element} el
 * @returns {Element[]}
 */
export const elSubs = (el) => {
  const s = elKid(el, "subcomponents");
  return s ? [...s.children] : [];
};
/**
 * The tags of the parts that make up a body's outline, end to end.
 */
export const ORK_BODY = ["nosecone", "bodytube", "transition"];
/**
 * The outline of a free-form fin set from its points: root, span, area, centroid and the points.
 * @param {Element} c fin set element
 * @returns {object}
 */
export function orkFinOutline(c) {
  const fp = elKid(c, "finpoints");
  if (!fp) return { root: 0, span: 0, area: 0, pts: [] };
  const pts = [...fp.children].map((p) => [parseFloat(p.getAttribute("x")), parseFloat(p.getAttribute("y"))]);
  let area = 0,
    cx = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i],
      [x2, y2] = pts[(i + 1) % pts.length],
      cr = x1 * y2 - x2 * y1;
    area += cr;
    cx += (x1 + x2) * cr;
  }
  /* OpenRocket's outline runs from the root's leading edge (the first point) round to its trailing edge (the last), and
     the fin's length, which places it on the body, is that root chord. The tip can sweep past the root's trailing edge
     (or reach ahead of its leading edge), so the outline's full extent isn't the root. */
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]),
    rootLen = pts.length > 2 ? pts[pts.length - 1][0] - pts[0][0] : 0,
    x0 = rootLen > 0 ? pts[0][0] : Math.min(...xs),
    span = Math.max(...ys);
  // quarter point of the mean aerodynamic chord, by spanwise strips (where Barrowman puts a fin's lift)
  let A2 = 0,
    M2 = 0;
  const N = 200;
  for (let k = 0; k < N; k++) {
    const y = ((k + 0.5) / N) * span;
    let lo = Infinity,
      hi = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [xa, ya] = pts[i],
        [xb, yb] = pts[(i + 1) % pts.length];
      if ((ya - y) * (yb - y) <= 0 && ya !== yb) {
        const xx = xa + ((y - ya) / (yb - ya)) * (xb - xa);
        lo = Math.min(lo, xx);
        hi = Math.max(hi, xx);
      }
    }
    if (hi > lo) {
      const ch = hi - lo;
      A2 += ch;
      M2 += ch * (lo - x0 + ch / 4);
    }
  }
  return {
    root: rootLen > 0 ? rootLen : Math.max(...xs) - x0,
    span,
    area: Math.abs(area) / 2,
    xc: area ? cx / (3 * area) - x0 : (Math.max(...xs) - x0) / 2,
    cpq: A2 > 0 ? M2 / A2 : null,
    pts,
    norm: pts.map(([x, y]) => [x - x0, y]),
  };
}
/**
 * A component's length along the body (fin root chord, packed length of recovery and mass parts).
 * @param {Element} c
 * @returns {number} m
 */
export function orkLenOf(c) {
  switch (c.tagName) {
    case "trapezoidfinset":
    case "ellipticalfinset":
      return elNum(c, "rootchord");
    case "freeformfinset":
      return orkFinOutline(c).root;
    case "parachute":
    case "streamer":
    case "shockcord":
    case "masscomponent":
      return elNum(c, "packedlength");
    case "podset":
    case "parallelstage": {
      // a pod's length: its body parts end to end
      const k = [...c.children].find((e) => e.tagName === "subcomponents");
      return k ? [...k.children].filter((e) => ORK_BODY.includes(e.tagName)).reduce((a, e) => a + orkLenOf(e), 0) : 0;
    }
    default:
      return elNum(c, "length");
  }
}
/**
 * A component's axial position element: method (top, bottom, middle, absolute...) and value.
 * @param {Element} c
 * @returns {{method:string, val:number}}
 */
export function orkOffset(c) {
  const axialEl = elKid(c, "axialoffset"),
    positionEl = elKid(c, "position");
  // when a file has both, OpenRocket keeps the one it reads last
  const el =
    axialEl && positionEl
      ? [...c.children].indexOf(positionEl) > [...c.children].indexOf(axialEl)
        ? positionEl
        : axialEl
      : axialEl || positionEl;
  if (!el) return { method: null, val: 0 };
  return {
    method: (el.getAttribute("method") || el.getAttribute("type") || "top").toLowerCase(),
    val: parseFloat(el.textContent) || 0,
  };
}
/**
 * The forward end of a component, from its position method relative to its parent.
 * @param {Element} k component
 * @param {{x:number, len:number}} p parent
 * @returns {number} m from the nose tip
 */
export function orkPlace(k, p) {
  const o = orkOffset(k),
    len = orkLenOf(k);
  switch (o.method) {
    case "bottom":
      return p.x + p.len - len + o.val;
    case "middle":
      return p.x + (p.len - len) / 2 + o.val;
    case "absolute":
      return o.val;
    default:
      return p.x + o.val;
  }
}
