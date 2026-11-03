/* ---------- motor clusters: the motors in a stage add their thrust; an extra motor can light a set time after the
   main one (an airstart), so its thrust curve starts that much later ---------- */
const clusterCache = new Map();
function findMotor(id) {
  id = OLD_MOTOR_IDS[id] || id;
  return allMotors().find((m) => m.id === id) || null;
}
function clusterOf(main, extras, mainD = 0) {
  // extras: [{id, n, d}] in addition to the main motor; d: seconds after the first motor lights
  const ex = (extras || [])
    .map((e) => ({ m: findMotor(e.id), n: Math.max(1, Math.round(e.n || 1)), d: Math.max(0, +e.d || 0) }))
    .filter((e) => e.m);
  if (!ex.length) return main;
  const members = [{ m: main, n: 1, d: Math.max(0, +mainD || 0) }];
  for (const e of ex) {
    const same = members.find((x) => x.m.id === e.m.id && Math.abs(x.d - e.d) < 1e-6);
    if (same) same.n += e.n;
    else members.push({ ...e });
  }
  const key = members.map((e) => e.m.id + "*" + e.n + (e.d ? "@" + e.d : "")).join("|");
  if (clusterCache.has(key)) return clusterCache.get(key);
  const at = (m, t) => {
    const T = m.t;
    if (t <= T[0] || t >= T[T.length - 1]) return t === T[0] ? m.F[0] : 0;
    let i = 1;
    while (T[i] < t) i++;
    const f = (t - T[i - 1]) / (T[i] - T[i - 1] || 1);
    return m.F[i - 1] + f * (m.F[i] - m.F[i - 1]);
  };
  // every curve's own time points, shifted by its motor's ignition delay
  const t = [...new Set(members.flatMap((e) => e.m.t.map((x) => +(x + e.d).toFixed(6))))].sort((a, b) => a - b);
  const F = t.map((x) => members.reduce((a, e) => a + (x >= e.d - 1e-9 ? e.n * at(e.m, x - e.d) : 0), 0));
  const late = members.filter((e) => e.d > 0);
  const totalMass = members.reduce((a, e) => a + e.n * e.m.totalMass, 0),
    propMass = members.reduce((a, e) => a + e.n * e.m.propMass, 0);
  const count = members.reduce((a, e) => a + e.n, 0),
    lab = (e, k) => (e.n > 1 ? e.n + "× " : "") + (k === "cn" ? e.m.cn || e.m.name : e.m.name);
  const mfrs = [...new Set(members.map((e) => e.m.mfr))];
  const c = {
    id: "cluster:" + key,
    name: members.map((e) => lab(e, "name")).join(" + "),
    cn: members.map((e) => lab(e, "cn")).join(" + "),
    brand: main.brand,
    mfr: mfrs.length === 1 ? mfrs[0] : "Mixed",
    dia: Math.max(...members.map((e) => e.m.dia)),
    len: members.reduce((a, e) => a + e.n * e.m.totalMass * e.m.len, 0) / totalMass, // mass-weighted, so the cluster's CG lands where the motors' combined CG is
    delays: "",
    case:
      `Cluster of ${count} motors` +
      (late.length ? `, ${late.map((e) => `${e.n}× ${e.m.cn || e.m.name} lit ${e.d} s later`).join(", ")}` : ""),
    prop: [...new Set(members.map((e) => e.m.prop).filter(Boolean))].join(", "),
    sys: main.sys,
    totalMass,
    propMass,
    t,
    F,
    members,
    cluster: true,
    count,
    airstart: late.length > 0,
  };
  if (clusterCache.size > 50) clusterCache.clear();
  clusterCache.set(key, c);
  return c;
}
// a stage's motors as flown: the main mount's motor (unless that mount is set never to light, or lights late) with the others
function flightOf(main, extras, mainD, mainOff) {
  const ex = (extras || []).filter((e) => e && findMotor(e.id));
  if (mainOff && ex.length) {
    const [e0, ...rest] = ex;
    return clusterOf(findMotor(e0.id), [...(e0.n > 1 ? [{ ...e0, n: e0.n - 1 }] : []), ...rest], e0.d);
  }
  return clusterOf(main, extras, mainD);
}
function flightMotor() {
  return flightOf(curMotor(), D.extraMotors, D.mainDelay, D.mainOff);
}
function flightBoost() {
  return flightOf(curBoost(), D.bExtraMotors, D.bMainDelay, D.bMainOff);
}
function flightFirst(Dx = D) {
  return flightOf(curFirst(), Dx && Dx.s1ExtraMotors, Dx && Dx.s1MainDelay, Dx && Dx.s1MainOff);
}
