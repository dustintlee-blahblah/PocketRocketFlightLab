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
function noseSpec(D) {
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
function noseR(shape, param, x, R, L) {
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
