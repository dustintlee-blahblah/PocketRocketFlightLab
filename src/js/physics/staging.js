/**
 * Two- and three-stage rockets: the stack's geometry (the upper stages on top of the booster), each lower stage as a
 * design of its own, and the stability of the whole stack.
 */
import { flightFirst } from "../motors/clusters.js";
import { aero, bodySegments, CP_UNC, cpAtAoA, cpOf, finSetsOf, xfinSets } from "./aerodynamics.js";
/* ---------- two-stage geometry ---------- */
/**
 * Body sections of the booster (a plain tube when the design has no section list).
 * @param {object} D design
 * @returns {object[]} sections, x from the booster's front
 */
function boosterSegments(D) {
  if (D.bSegments && D.bSegments.length) return D.bSegments;
  const r = D.bDiameter / 2;
  return [{ kind: "tube", x: 0, len: D.bLength, r1: r, r2: r }];
}
/**
 * The booster's fin sets in the common fin-set form (see finSetsOf).
 * @param {object} D design
 * @returns {object[]}
 */
function boosterFinSets(D) {
  return [
    {
      n: D.bFinCount,
      mat: D.bFinMat,
      rho: D.bFinRho,
      a: D.bFinRoot,
      b: D.bFinTip,
      s: D.bFinSpan,
      sw: D.bFinSweep,
      t: D.bFinThick,
      xLead: D.bLength - D.bFinAft - D.bFinRoot,
      edge: D.bFinEdge,
      bevLE: D.bFinBevLE || 0,
      bevTE: D.bFinBevTE || 0,
      rs: D.bFinFinish ?? D.finish,
      cdo: D.bFinCdOverride || 0,
      pts: D.bFinPts || null,
      cant: D.bFinCant || 0,
      par: D.bFinPar || 0,
      ...(D.bFinPod != null ? { pod: D.bFinPod, rb: D.bFinRb, sb: D.bFinSb } : {}),
    },
    ...xfinSets(D.bExtraFins, D.bFinFinish ?? D.finish),
  ];
}
/**
 * A pod moved aft by a distance (a booster's pod, placed behind the sustainer in the stack).
 * @param {object} pd pod
 * @param {number} dx m
 * @returns {object}
 */
function shiftPod(pd, dx) {
  return { ...pd, segs: pd.segs.map((sg) => ({ ...sg, x: sg.x + dx })) };
}
/**
 * The sustainer and booster joined into one airframe, for the aerodynamics of the whole stack before separation.
 * @param {object} D two-stage design
 * @returns {object} a design-like object for aero()
 */
export function stackDesign(D) {
  const Ls = D.length;
  const segs = [...bodySegments(D).map((s) => ({ ...s })), ...boosterSegments(D).map((s) => ({ ...s, x: s.x + Ls }))];
  const fs = [...finSetsOf(D), ...boosterFinSets(D).map((f) => ({ ...f, xLead: f.xLead + Ls }))];
  const custom = D.railPreset === "custom";
  return {
    ...D,
    length: Ls + D.bLength,
    diameter: Math.max(D.diameter, D.bDiameter),
    segments: segs,
    finSets: fs,
    // the booster's pods and tube fins, behind the sustainer
    pods: D.pods || D.bPods ? [...(D.pods || []), ...(D.bPods || []).map((pd) => shiftPod(pd, Ls))] : null,
    tubeFins:
      D.tubeFins || D.bTubeFins
        ? [...(D.tubeFins || []), ...(D.bTubeFins || []).map((t) => ({ ...t, x: t.x + Ls }))]
        : null,
    buttons: custom ? [...(D.buttons || []), ...(D.bButtons || []).map((b) => ({ ...b, x: b.x + Ls }))] : D.buttons,
    lugs: custom ? [...(D.lugs || []), ...(D.bLugs || []).map((l) => ({ ...l, x: l.x + Ls }))] : D.lugs,
    bumps: [...(D.bumps || []), ...(D.bBumps || []).map((b) => ({ ...b, x: b.x + Ls }))],
    cdOverride: 0,
  };
}
/**
 * Whether a design is a three-stage rocket (a first stage under the booster, in D.s1).
 *
 * Three stages: the first (bottom) stage under the booster-and-sustainer stack; D.s1 holds its parts in the booster's field names.
 */
export const isThree = (D) => !!(D && D.twoStage && D.threeStage && D.s1 && D.s1.bLength > 0);
/**
 * All three stages joined into one airframe (first stage under the two-stage stack).
 * @param {object} D three-stage design
 * @returns {object} a design-like object for aero()
 */
export function stackDesign3(D) {
  const S2 = stackDesign(D);
  return stackDesign({ ...S2, ...D.s1, railPreset: D.railPreset });
}
/**
 * The whole stack of a two- or three-stage design, as one airframe.
 */
export const fullStack = (D) => (isThree(D) ? stackDesign3(D) : stackDesign(D));
/**
 * The booster on its own, as a design-like object for aero(), for its flight after separation.
 * @param {object} D two-stage design
 * @returns {object}
 */
export function boosterDesign(D) {
  return {
    length: D.bLength,
    diameter: D.bDiameter,
    segments: boosterSegments(D),
    finSets: boosterFinSets(D),
    pods: D.bPods || null,
    tubeFins: D.bTubeFins || null,
    finish: D.finish,
    railPreset: "none",
    buttons: [],
    lugs: [],
    bumps: D.bBumps || [],
    otherCd: 0,
    cdOverride: 0,
    noseShape: "ogive:1",
    noseLen: 0,
  };
}
/**
 * Static stability of the whole stack at liftoff and at burnout of the motor lighting first.
 * @param {object} D two- or three-stage design
 * @param {object} mS sustainer motor
 * @param {object} mB booster motor
 * @param {object} [m1] first-stage motor (three stages; defaults to the one chosen)
 * @returns {{cp:number, cgL:number, cgB:number, marginL:number, marginB:number, d:number}} positions in m from the
 *   nose tip, margins in calibers of d (the largest body diameter)
 */
export function stackStability(D, mS, mB, m1) {
  // a three-stage rocket at liftoff: all three stages, the first stage's motor the one burning
  const three = isThree(D);
  if (three && !m1) m1 = flightFirst(D);
  const A = aero(three ? stackDesign3(D) : stackDesign(D)),
    d = 2 * A.R,
    cp = cpOf(A),
    Ls = D.length;
  const xS = (D.mountAft ?? Ls) + D.motorOverhang - mS.len / 2,
    xB = Ls + (D.bMountAft ?? D.bLength) + (D.bOverhang || 0) - mB.len / 2;
  const parts = [
    [D.dryMass, D.cgEmpty],
    [mS.totalMass, xS],
    [D.bDryMass, Ls + D.bCg],
  ];
  let mBurn = mB,
    xBurn = xB;
  if (three) {
    const c = D.s1,
      L2 = Ls + D.bLength;
    parts.push([mB.totalMass, xB], [c.bDryMass, L2 + c.bCg]);
    mBurn = m1;
    xBurn = L2 + (c.bMountAft ?? c.bLength) + (c.bOverhang || 0) - m1.len / 2;
  }
  const cgWith = (mb) => {
    const ps = [...parts, [mb, xBurn]];
    const M = ps.reduce((a, p) => a + p[0], 0);
    return ps.reduce((a, p) => a + p[0] * p[1], 0) / M;
  };
  const cgL = cgWith(mBurn.totalMass),
    cgB = cgWith(mBurn.totalMass - mBurn.propMass);
  return {
    cp,
    cgL,
    cgB,
    marginL: (cp - cgL) / d,
    marginB: (cp - cgB) / d,
    marginL5: (cpAtAoA(A, 5) - cgL) / d,
    marginL10: (cpAtAoA(A, 10) - cgL) / d,
    pctL: ((cp - cgL) / A.L) * 100,
    unc: (CP_UNC * A.L) / d,
    L: A.L,
    d,
  };
}
