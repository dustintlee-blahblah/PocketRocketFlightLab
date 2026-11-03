const SYS_ORDER = ["RMS", "DMS", "SU", "Hybrid", "Kosdon", "ProX", "ProXL", "Loki", "Legacy"];
const BRAND_SYS = {};
for (const r of MOTOR_DB) (BRAND_SYS[r.b] = BRAND_SYS[r.b] || new Set()).add(r.sy);
for (const b in BRAND_SYS) BRAND_SYS[b] = SYS_ORDER.filter((y) => BRAND_SYS[b].has(y));
const BUILTIN_BRANDS = Object.keys(BRAND_SYS);
const BUILTIN = MOTOR_DB.map((r) => ({
  id: r.id,
  name: r.n,
  cn: r.cn,
  brand: r.b,
  mfr: r.mf,
  dia: r.d / 1000,
  len: r.l / 1000,
  delays: r.dl,
  case: r.cs,
  prop: r.pr,
  sys: r.sy,
  sparky: !!r.sp,
  totalMass: r.tw / 1000,
  propMass: r.pw / 1000,
  t: r.t,
  F: r.f,
  builtin: true,
}));
// an uploaded motor is filed under its manufacturer, and under the same motor system as the matching catalog motor
const MFR_ALIAS = [
  [/^(at|aerotech|aerotech\/rcs|rcs|isp|aerot)/, "AeroTech"],
  [/^(cti|cesaroni|ces)/, "Cesaroni"],
  [/^loki/, "Loki"],
  [/^(es|estes)\b/, "Estes"],
  [/^(q|quest)\b/, "Quest"],
  [/^(apogee|a)\b/, "Apogee"],
  [/^(amw|animal)/, "AMW"],
  [/^(ht|hypertek)/, "Hypertek"],
  [/^(gm|gorilla)/, "Gorilla"],
  [/^klima/, "Klima"],
  [/^(em|ellis)/, "Ellis Mountain"],
  [/^(pml|public missiles)/, "Public Missiles"],
  [/^(ka|kosdon)/, "Kosdon"],
  [/^contrail/, "Contrail"],
  [/^(sf|skyr)/, "Sky Ripper"],
  [/^(wcoast|west coast)/, "West Coast Hybrids"],
];
function brandOfMfr(mfr) {
  const t = (mfr || "").trim(),
    l = t.toLowerCase();
  if (!t) return "Unknown maker";
  for (const [re, b] of MFR_ALIAS) if (re.test(l)) return b;
  return t.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
// the same motor: same name, same maker, same diameter and the same total impulse (within 1%); other fields don't matter
function dupMotor(m, pool) {
  const norm = (x) => (x || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    nm = norm(m.name),
    d = Math.round(m.dia * 1000),
    I = motorStats(m).I;
  return (
    pool.find(
      (x) =>
        x !== m &&
        x.brand === m.brand &&
        Math.round(x.dia * 1000) === d &&
        (norm(x.name) === nm || (x.builtin && norm(x.cn) === nm)) &&
        Math.abs(motorStats(x).I - I) <= Math.max(0.5, 0.01 * I),
    ) || null
  );
}
function classifyUser(m) {
  if (m.delays)
    m.delays =
      String(m.delays)
        .split(/[-,\s]+/)
        .filter((x) => x && x !== "1000")
        .join(",") || "P";
  const norm = (x) => (x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  m.brand = brandOfMfr(m.mfr);
  const d = Math.round(m.dia * 1000),
    nm = norm(m.name);
  const hit = BUILTIN.find(
    (b) => b.brand === m.brand && Math.round(b.dia * 1000) === d && (norm(b.name) === nm || norm(b.cn) === nm),
  );
  if (hit) {
    m.sys = hit.sys;
    if (!m.cn) m.cn = hit.cn;
    if (!m.case) m.case = hit.case;
    if (!m.prop) m.prop = hit.prop;
    if (hit.sparky) m.sparky = true;
  } else m.sys = m.brand === "Cesaroni" ? "ProX" : m.brand === "Loki" ? "Loki" : "Imported";
  return m;
}
const DEFAULT_MOTOR = (BUILTIN.find((m) => m.name === "H148R") || BUILTIN[0]).id;
