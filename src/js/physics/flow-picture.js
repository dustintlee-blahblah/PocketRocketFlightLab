/**
 * The flow picture in the Wind Tunnel's test section: where the shocks stand and how the pressure along the body runs,
 * from exact inviscid theory. It's drawn only; no force or coefficient comes from here (those are aerodynamics.js).
 *
 * Taylor–Maccoll conical flow for the nose shock, oblique-shock relations and Prandtl–Meyer expansions (NACA Report
 * 1135, Equations, Tables and Charts for Compressible Flow), and the second-order shock-expansion method along the body
 * (Syvertson & Dennis, NACA Report 1328). From the Wind Tunnel tool, v2.1.
 */
const G = 1.4;
const NU_MAX = ((Math.sqrt(6) - 1) * Math.PI) / 2;
const obCache = new Map(),
  tmCache = new Map();

/**
 * Static over total pressure at Mach M (isentropic).
 * @param {number} M
 * @returns {number}
 */
function pr(M) {
  return Math.pow(1 + 0.2 * M * M, -3.5);
}
/**
 * Mach number from static over total pressure.
 * @param {number} r
 * @returns {number}
 */
function machFromPr(r) {
  return r >= 1 ? 0 : Math.sqrt(5 * (Math.pow(r, -1 / 3.5) - 1));
}
/**
 * Prandtl–Meyer angle, rad.
 * @param {number} M
 * @returns {number}
 */
function pmNu(M) {
  if (M <= 1) return 0;
  const b = Math.sqrt(M * M - 1);
  return Math.sqrt(6) * Math.atan(b / Math.sqrt(6)) - Math.atan(b);
}
/**
 * Mach number for a Prandtl–Meyer angle.
 * @param {number} nu rad
 * @returns {number}
 */
function pmInv(nu) {
  if (nu <= 0) return 1;
  if (nu >= NU_MAX * 0.9999) return 200;
  let lo = 1,
    hi = 200;
  for (let i = 0; i < 80; i++) {
    const m = 0.5 * (lo + hi);
    if (pmNu(m) < nu) lo = m;
    else hi = m;
  }
  return 0.5 * (lo + hi);
}
/**
 * Normal shock: pressure ratio, Mach behind, total-pressure ratio.
 * @param {number} M
 * @returns {{p21:number, M2:number, p0r:number}}
 */
function normalShock(M) {
  const M2 = M * M;
  return {
    p21: 1 + ((2 * G) / (G + 1)) * (M2 - 1),
    M2: Math.sqrt((1 + 0.2 * M2) / (G * M2 - 0.2)),
    p0r:
      Math.pow(((G + 1) * M2) / (2 + (G - 1) * M2), G / (G - 1)) *
      Math.pow((G + 1) / (2 * G * M2 - (G - 1)), 1 / (G - 1)),
  };
}
/**
 * Flow deflection behind an oblique shock of wave angle b.
 * @param {number} M
 * @param {number} b rad
 * @returns {number} rad
 */
function obliqueDefl(M, b) {
  const s = M * Math.sin(b);
  return Math.atan(((2 / Math.tan(b)) * (s * s - 1)) / (M * M * (G + Math.cos(2 * b)) + 2));
}
/**
 * The largest deflection an attached oblique shock can turn at Mach M, and its wave angle.
 * @param {number} M
 * @returns {{dmax:number, bmax:number}}
 */
function obliqueMax(M) {
  const k = M.toFixed(4);
  if (obCache.has(k)) return obCache.get(k);
  const mu = Math.asin(1 / M);
  let best = 0,
    bb = mu;
  for (let i = 0; i <= 400; i++) {
    const b = mu + ((Math.PI / 2 - mu) * i) / 400,
      d = obliqueDefl(M, b);
    if (d > best) {
      best = d;
      bb = b;
    }
  }
  const r = { dmax: best, bmax: bb };
  obCache.set(k, r);
  return r;
}
/**
 * The weak oblique shock that turns the flow by th, or null if the shock stands off (detached).
 * @param {number} M
 * @param {number} th rad
 * @returns {{p:number, M2:number, p0r:number, beta:number}|null}
 */
export function obliqueShock(M, th) {
  const { dmax, bmax } = obliqueMax(M);
  if (th > dmax) return null;
  let lo = Math.asin(1 / M),
    hi = bmax;
  for (let i = 0; i < 60; i++) {
    const b = 0.5 * (lo + hi);
    if (obliqueDefl(M, b) < th) lo = b;
    else hi = b;
  }
  const b = 0.5 * (lo + hi),
    ns = normalShock(M * Math.sin(b));
  return { p: ns.p21, M2: ns.M2 / Math.sin(b - th), p0r: ns.p0r, beta: b };
}
/**
 * Taylor–Maccoll: integrates the conical flow behind a shock of wave angle beta in to the cone surface.
 * @param {number} M
 * @param {number} beta rad
 * @returns {{th:number, beta:number, ps:number, Ms:number, p0l:number}|null} cone half-angle, surface pressure
 *   (over free stream), surface Mach number, total pressure behind the shock
 */
function tmSolve(M, beta) {
  const Mn1 = M * Math.sin(beta);
  if (Mn1 <= 1.00001) return null;
  const delta = obliqueDefl(M, beta),
    ns = normalShock(Mn1),
    M2 = ns.M2 / Math.sin(beta - delta),
    p02 = ns.p21 / pr(M2),
    V = 1 / Math.sqrt(2 / ((G - 1) * M2 * M2) + 1);
  let vr = V * Math.cos(beta - delta),
    vt = -V * Math.sin(beta - delta),
    th = beta;
  const f = (t, a, b) => {
    const A = 0.2 * (1 - a * a - b * b);
    return [b, (b * b * a - A * (2 * a + b / Math.tan(t))) / (A - b * b)];
  };
  const h = -0.0008;
  for (let n = 0; n < 20000 && vt < 0; n++) {
    const k1 = f(th, vr, vt),
      k2 = f(th + h / 2, vr + (h / 2) * k1[0], vt + (h / 2) * k1[1]),
      k3 = f(th + h / 2, vr + (h / 2) * k2[0], vt + (h / 2) * k2[1]),
      k4 = f(th + h, vr + h * k3[0], vt + h * k3[1]);
    const nvr = vr + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      nvt = vt + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    if (nvt >= 0) {
      const s = -vt / (nvt - vt);
      th += h * s;
      vr += (nvr - vr) * s;
      vt = 0;
      break;
    }
    th += h;
    vr = nvr;
    vt = nvt;
    if (th <= 1e-5) return null;
  }
  const Ms = Math.sqrt(((2 / (G - 1)) * vr * vr) / (1 - vr * vr));
  return { th, beta, ps: p02 * pr(Ms), Ms, p0l: p02 };
}
/**
 * Cone solutions at Mach M for cone angles up to the largest with an attached shock.
 * @param {number} M
 * @returns {{M:number, pts:object[], thMax:number}}
 */
function tmTable(M) {
  const key = M.toFixed(4);
  if (tmCache.has(key)) return tmCache.get(key);
  const mu = Math.asin(1 / M),
    pts = [{ th: 0, ps: 1, Ms: M, p0l: 1 / pr(M), beta: mu }];
  let last = 0;
  const N = 110;
  for (let k = 1; k <= N; k++) {
    const t = k / N,
      r = tmSolve(M, mu + (Math.PI / 2 - mu - 1e-3) * t * t);
    if (!r) continue;
    if (r.th < last) break;
    pts.push(r);
    last = r.th;
  }
  const tab = { M, pts, thMax: last };
  if (tmCache.size > 600) tmCache.clear();
  tmCache.set(key, tab);
  return tab;
}
/**
 * The cone flow for a cone half-angle, or null if its shock is detached.
 * @param {object} tab from tmTable
 * @param {number} th rad
 * @returns {{ps:number, Ms:number, p0l:number, beta:number}|null}
 */
function coneAt(tab, th) {
  if (th > tab.thMax) return null;
  const p = tab.pts;
  let i = 1;
  while (i < p.length - 1 && p[i].th < th) i++;
  const a = p[i - 1],
    b = p[i],
    s = (th - a.th) / (b.th - a.th || 1),
    L = (u, v) => u + (v - u) * s;
  return { ps: L(a.ps, b.ps), Ms: L(a.Ms, b.Ms), p0l: L(a.p0l, b.p0l), beta: L(a.beta, b.beta) };
}
/**
 * Second-order shock-expansion terms (Syvertson & Dennis).
 * @param {number} p
 * @param {number} M
 * @returns {number}
 */
function Bf(p, M) {
  return (G * p * M * M) / (2 * (M * M - 1));
}
/**
 * @param {number} M
 * @returns {number}
 */
function Om(M) {
  return (1 / M) * Math.pow((1 + 0.2 * M * M) / 1.2, 3);
}
/**
 * Pressure along a pointed body of revolution at supersonic speed, by the second-order shock-expansion method.
 * @param {{x:number, r:number}[]} P the body's outline from the tip
 * @param {number} M Mach number (above 1)
 * @returns {{cps:{x0:number, x1:number, cp:number}[], shockAngle:number|null, detached:boolean}} each panel's pressure
 *   coefficient, the nose shock's wave angle (rad), and whether it stands off the tip
 */
export function bodyPressures(P, M) {
  const tab = tmTable(M),
    q = 0.7 * M * M,
    ns = normalShock(M),
    p0ns = ns.p0r / pr(M),
    cpMax = (p0ns - 1) / q;
  let st = null;
  const cps = [];
  const push = (a, b, p) => cps.push({ x0: a.x, x1: b.x, cp: (p - 1) / q });
  // a tip with an infinite slope (Haack, power, ellipsoid): tangent-cone or Newtonian pressures there, then the march
  // from the exact cone solution once the surface angle is moderate
  const Ltot = P[P.length - 1].x - P[0].x,
    dRestart = Math.min(0.5 * tab.thMax, (20 * Math.PI) / 180);
  let iStart = 0;
  while (iStart < P.length - 2 && Math.atan2(P[iStart + 1].r - P[iStart].r, P[iStart + 1].x - P[iStart].x) > dRestart)
    iStart++;
  if (P[iStart].x - P[0].x > 0.05 * Ltot) iStart = 0;
  for (let i = 0; i < iStart; i++) {
    const a = P[i],
      b = P[i + 1],
      d = Math.atan2(b.r - a.r, b.x - a.x),
      c = coneAt(tab, d);
    push(a, b, c ? c.ps : 1 + q * cpMax * Math.sin(d) ** 2);
  }
  const tangentP = (dd) => {
    if (dd > 1e-7) {
      const c = coneAt(tab, dd);
      return c ? c.ps : 1 + q * cpMax * Math.sin(dd) ** 2;
    }
    if (dd < -1e-7) return pr(pmInv(pmNu(M) - dd)) / pr(M);
    return 1;
  };
  for (let i = iStart; i < P.length - 1; i++) {
    const a = P[i],
      b = P[i + 1],
      ds = Math.hypot(b.x - a.x, b.r - a.r);
    if (ds < 1e-12) continue;
    const d = Math.atan2(b.r - a.r, b.x - a.x);
    if (st === null || st.newton) {
      const c = d > 1e-7 ? coneAt(tab, d) : { ps: 1, Ms: M, p0l: 1 / pr(M) };
      if (st === null && c) {
        st = { p: c.ps, M: c.Ms, p0l: c.p0l, dpds: 0, d, newton: false };
        push(a, b, c.ps);
        continue;
      }
      const pN = 1 + q * cpMax * Math.sin(Math.max(d, 0)) ** 2,
        Mn = machFromPr(Math.min(pN / p0ns, 0.9999));
      if (st && st.newton && c && Mn > 1.05) {
        // a pointed tip with an infinite slope restarts from the cone solution; a truly blunt tip keeps its entropy layer
        const blunt = a.x - P[0].x > 0.02 * Ltot || st.bluntCount > 12;
        if (blunt) st = { p: st.p, M: Math.max(st.M, 1.0001), p0l: p0ns, dpds: 0, d: st.d, newton: false };
        else {
          st = { p: c.ps, M: c.Ms, p0l: c.p0l, dpds: 0, d, newton: false };
          push(a, b, c.ps);
          continue;
        }
      } else {
        st = {
          p: pN,
          M: Math.max(Mn, 1.0001),
          p0l: p0ns,
          dpds: 0,
          d,
          newton: true,
          bluntCount: ((st && st.bluntCount) || 0) + 1,
        };
        push(a, b, pN);
        continue;
      }
    }
    // the corner from the end of the last panel into this one, then relaxing toward the tangent-cone pressure
    const nu2 = pmNu(st.M) + (st.d - d),
      M2 = nu2 <= 0 ? 1.0001 : pmInv(nu2),
      p2 = st.p0l * pr(M2),
      pc = tangentP(d),
      r = a.r;
    let dp2 = 0;
    if (r > 1e-9 && st.M > 1.0001 && M2 > 1.0001)
      dp2 =
        (Bf(p2, M2) / r) * ((Om(st.M) / Om(M2)) * Math.sin(st.d) - Math.sin(d)) +
        (Bf(p2, M2) / Bf(st.p, st.M)) * (Om(st.M) / Om(M2)) * st.dpds;
    const D = pc - p2;
    let k = Math.abs(D) > 1e-10 ? Math.abs(dp2 / D) : 0;
    if (!isFinite(k)) k = 0;
    const e = Math.exp(-k * ds);
    let pE, pavg, dpdsE;
    if (k > 0) {
      pE = pc - D * e;
      pavg = pc - (D * (1 - e)) / (k * ds);
      dpdsE = k * D * e;
    } else {
      pE = p2;
      pavg = p2;
      dpdsE = 0;
    }
    const MlE = Math.max(machFromPr(Math.min(pE / st.p0l, 0.99999)), 1.0001);
    st = { p: pE, M: MlE, p0l: st.p0l, dpds: dpdsE, d, newton: false };
    push(a, b, pavg);
  }
  const k0 = Math.min(iStart, P.length - 2),
    tip = P.length > 1 ? Math.atan2(P[k0 + 1].r - P[k0].r, P[k0 + 1].x - P[k0].x) : 0,
    cone = coneAt(tab, tip);
  return { cps, shockAngle: cone ? cone.beta : null, detached: !cone };
}
