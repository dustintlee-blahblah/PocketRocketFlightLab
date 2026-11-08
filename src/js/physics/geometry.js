/**
 * Body geometry: nose-cone and transition profiles, and a small interpolation table class.
 *
 * Nose shape definitions follow Crowell, The Descriptive Geometry of Nose Cones (1996).
 */
/* ---------- body geometry (nose-cone shape definitions: Crowell, The Descriptive Geometry of Nose Cones, 1996) ---------- */
/**
 * The nose shape of a quick-form design (D.noseShape, "shape:param"), with old one-word values mapped to it.
 * @param {object} D design
 * @returns {{shape:string, param:number}}
 */
export function noseSpec(D) {
  let s = String(D.noseShape || "ogive:1");
  const legacy = { ogive: "ogive:1", conical: "conical:0", parabolic: "parabolic:1", elliptical: "ellipsoid:0" };
  if (legacy[s]) s = legacy[s];
  const [shape, p] = s.split(":");
  return { shape, param: parseFloat(p) || 0 };
}
/**
 * Radius of a nose cone (or transition) profile at a distance from its tip.
 * @param {string} shape "conical", "ogive", "ellipsoid", "power", "parabolic" or "haack"
 * @param {number} param shape parameter: ogive 1 = tangent, 0 = cone; power-series exponent; parabolic K;
 *   Haack C (0 = von Kármán, 1/3 = LV-Haack)
 * @param {number} x distance from the tip, m
 * @param {number} R base radius, m
 * @param {number} L length, m
 * @returns {number} radius at x, m
 */
export function noseR(shape, param, x, R, L) {
  // radius at distance x from the tip
  x = Math.min(Math.max(x, 0), L);
  switch (shape) {
    case "conical":
      return (R * x) / L;
    case "ogive": {
      if (L < R) {
        x = (x * R) / L;
        L = R;
      }
      if (param < 1e-3) return (R * x) / L;
      const Rr = Math.sqrt(((L * L + R * R) * (((2 - param) * L) ** 2 + (param * R) ** 2)) / (4 * (param * R) ** 2));
      const Lp = L / param,
        y0 = Math.sqrt(Math.max(Rr * Rr - Lp * Lp, 0));
      return Math.sqrt(Math.max(Rr * Rr - (Lp - x) ** 2, 0)) - y0;
    }
    case "ellipsoid": {
      const xx = (x * R) / L;
      return Math.sqrt(Math.max(2 * R * xx - xx * xx, 0));
    }
    case "power":
      return param <= 1e-5 ? (x <= 1e-5 ? 0 : R) : R * Math.pow(x / L, param);
    case "parabolic":
      return R * (((2 * x) / L - param * (x / L) ** 2) / (2 - param));
    case "haack": {
      const th = Math.acos(1 - (2 * x) / L);
      return R * Math.sqrt(Math.max((th - Math.sin(2 * th) / 2 + param * Math.sin(th) ** 3) / Math.PI, 0));
    }
  }
  return (R * x) / L;
}
/**
 * A rounded nose tip: a sphere of radius rt on the axis, tangent to the nose's profile, in place of the point. Where it
 * touches is where the profile's radius of curvature across the axis, r·√(1 + r′²), reaches rt.
 * @param {string} shape nose shape (as noseR)
 * @param {number} param shape parameter
 * @param {number} R base radius, m
 * @param {number} L length, m
 * @param {number} rt tip radius, m
 * @returns {{rt:number, xs:number, xc:number, xt:number, rNat:number}|null} the sphere's front (xs) and center (xc),
 *   where it meets the profile (xt), and how round the tip already is (rNat); null if it's no rounder than the shape's
 *   own tip
 */
export function noseTip(shape, param, R, L, rt) {
  if (!(rt > 0) || !(R > 0) || !(L > 0)) return null;
  const g = (t) => {
    const e = Math.max(L * 1e-6, 1e-9),
      r = noseR(shape, param, t, R, L),
      d = (noseR(shape, param, Math.min(t + e, L), R, L) - noseR(shape, param, Math.max(t - e, 0), R, L)) / (2 * e);
    return { r, d, g: r * Math.sqrt(1 + d * d) };
  };
  const rNat = g(L * 1e-5).g;
  if (rt <= rNat) return null;
  let lo = L * 1e-5,
    hi = L;
  if (g(hi).g <= rt) lo = hi;
  else
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (g(m).g < rt) lo = m;
      else hi = m;
    }
  const p = g(lo),
    xc = lo + p.r * p.d;
  return { rt, xs: xc - rt, xc, xt: lo, rNat };
}
/**
 * Radius of a nose with a rounded tip (noseTip) at a distance from where its point would be.
 * @param {string} shape
 * @param {number} param
 * @param {number} x distance from the sharp tip, m
 * @param {number} R base radius, m
 * @param {number} L length, m
 * @param {object|null} tip from noseTip
 * @returns {number} radius, m
 */
export function noseRTip(shape, param, x, R, L, tip) {
  if (!tip || x >= tip.xt) return noseR(shape, param, x, R, L);
  return x < tip.xs ? 0 : Math.sqrt(Math.max(tip.rt * tip.rt - (x - tip.xc) ** 2, 0));
}
