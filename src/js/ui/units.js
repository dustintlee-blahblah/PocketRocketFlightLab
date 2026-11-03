/* ---------- units ---------- */
const DIMS = {
  imp: {
    dist: ["mi", 1609.344, 2],
    qpress: ["psi", 6894.757, 1],
    press: ["inHg", 3386.389, 2],
    dtemp: ["°F", 5 / 9, 0],
    len: ["in", IN, 2],
    alt: ["ft", FT, 0],
    mass: ["lb", LB, 2],
    speed: ["ft/s", FT, 0],
    wind: ["mph", 0.44704, 1],
    small: ["in", IN, 3],
    temp: ["°F"],
    deg: ["°", 1, 1],
    none: ["", 1, 2],
    acc: ["g", 9.80665, 1],
    force: ["lbf", 4.4482216, 1],
    time: ["s", 1, 1],
    moi: ["lb·in²", 2.9263965e-4, 1],
    pct: ["%", 0.01, 0],
    smass: ["oz", 0.028349523125, 2],
    vis: ["mi", 1609.344, 1],
  },
  met: {
    dist: ["km", 1000, 2],
    qpress: ["kPa", 1000, 1],
    press: ["hPa", 100, 1],
    dtemp: ["°C", 1, 0],
    len: ["mm", 0.001, 0],
    alt: ["m", 1, 0],
    mass: ["kg", 1, 3],
    speed: ["m/s", 1, 1],
    wind: ["m/s", 1, 1],
    small: ["mm", 0.001, 1],
    temp: ["°C"],
    deg: ["°", 1, 1],
    none: ["", 1, 2],
    acc: ["g", 9.80665, 1],
    force: ["N", 1, 0],
    time: ["s", 1, 1],
    moi: ["kg·m²", 1, 4],
    pct: ["%", 0.01, 0],
    smass: ["g", 0.001, 1],
    vis: ["km", 1000, 1],
  },
};
function toDisp(v, dim) {
  if (dim === "temp") return units === "imp" ? (v * 9) / 5 + 32 : v;
  return v / DIMS[units][dim][1];
}
function fromDisp(v, dim) {
  if (dim === "temp") return units === "imp" ? ((v - 32) * 5) / 9 : v;
  return v * DIMS[units][dim][1];
}
function fmt(v, dim, dec) {
  const d = dec ?? DIMS[units][dim][2] ?? 1;
  const x = toDisp(v, dim);
  return isFinite(x) ? x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
}
const uname = (dim) => DIMS[units][dim][0];
