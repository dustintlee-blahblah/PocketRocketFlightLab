/**
 * Nose weight: how much weight at the middle of the nose cone brings a rocket to 1 caliber of stability at liftoff,
 * 10% of its length, and 1 caliber leaving the rail in the day's wind, and what it does to the apogee.
 */
import { aero, bodySegments, cpAtAoA } from "./aerodynamics.js";
import { atmosphere } from "./atmosphere.js";
import { simulate } from "./simulate.js";
import { fullStack } from "./staging.js";
/**
 * Nose weight: how much to add at the middle of the nose cone to reach each stability target, and what it costs in
 * apogee. Adding a weight m at x moves the CG to (M·cg + m·x)/(M + m), so reaching a CG of cg′ takes
 * m = M·(cg − cg′)/(cg′ − x). Targets: 1 caliber at liftoff, 10% of the length, and 1 caliber leaving the rail in this
 * wind (the CP at that angle of attack).
 * @param {object} D design
 * @param {object} S stability at liftoff (stability or stackStability)
 * @param {object} st the flight's summary (liftoff weight, rail exit angle)
 * @param {object} Lx launch conditions
 * @param {object} m motor; mb booster motor (or null)
 * @returns {{x:number, cal:number, pct:number, rail:(number|null), need:number, apoCost:(number|null)}|null}
 *   weights in kg (Infinity if no nose weight can reach it), x in m from the nose tip
 */
export function noseWeightPlan(D, S, st, Lx, m, mb) {
  if (!S || !st || !(st.liftMass > 0)) return null;
  const segs = bodySegments(D),
    nose = segs[0] && segs[0].kind === "nose" ? segs[0] : null,
    x = nose ? nose.len / 2 : 0.05 * S.L,
    M = st.liftMass,
    cg = S.cgL;
  const forCg = (cgT) => (cg <= cgT ? 0 : cgT <= x ? Infinity : (M * (cg - cgT)) / (cgT - x));
  const out = { x, cal: forCg(S.cp - S.d), pct: forCg(S.cp - 0.1 * S.L), rail: null, need: 0, apoCost: null };
  if (st.railAoA != null && st.offRail > 0) {
    try {
      const A = aero(D.twoStage ? fullStack(D) : D),
        a = atmosphere(Lx, 0);
      out.rail = forCg(cpAtAoA(A, Math.min(st.railAoA, 17), st.offRail / a.a) - S.d);
    } catch (e) {
      out.rail = null;
    }
  }
  out.need = Math.max(out.cal, out.pct, out.rail || 0);
  if (out.need > 0 && isFinite(out.need))
    try {
      const D2 = {
        ...D,
        dryMass: D.dryMass + out.need,
        cgEmpty: (D.dryMass * D.cgEmpty + out.need * x) / (D.dryMass + out.need),
      };
      const r = simulate(D2, Lx, m, mb, { noRef: true });
      if (!r.st.error) out.apoCost = st.maxAlt - r.st.maxAlt;
    } catch (e) {
      out.apoCost = null;
    }
  return out;
}
