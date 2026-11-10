/**
 * From the builder's parts to the design the physics flies: bldDerive() turns BLD into D after every change, and the
 * calculated values (weight, CG, turning inertia, a part's weight) the override fields show beside your own.
 */
import { BLD, bldFind, bldSyncMotors } from "./builder-ui.js";
import { bldOvOn, bldSettings } from "./model.js";
import { bldToOrk } from "./ork-export.js";
import { jclone } from "../core/helpers.js";
import { boostId, D, firstId, L, motorId, setD } from "../design/defaults.js";
import { parseOrk } from "../files/openrocket-import.js";
import { matchMotor } from "../files/rocksim-import.js";
import { applyCal } from "../flightlog/drag-calibration.js";
import { aero, cdParts } from "../physics/aerodynamics.js";
import { atmosphere } from "../physics/atmosphere.js";
import { airInertia } from "../physics/simulate.js";
/**
 * The turning inertia worked out from the parts, as the flight uses it, for a stage's inertia setting.
 * @param {string} key the setting: "dryInertia" (sustainer or single stage), "bDryInertia" (booster) or "s1DryInertia"
 *   (first stage of three)
 * @returns {number|undefined} kg·m²
 */
function bldCalcInertia(key) {
  try {
    const r = parseOrk(bldToOrk(BLD, L)).design;
    if (key === "dryInertia") return airInertia(r.dryInertia, r.inertiaMass, D.dryMass, D.length);
    if (key === "bDryInertia") return airInertia(r.bDryInertia, r.bInertiaMass, D.bDryMass, D.bLength);
    const S1 = r.s1,
      d1 = D.s1;
    return S1 && d1 ? airInertia(S1.bDryInertia, S1.bInertiaMass, d1.bDryMass, d1.bLength) : undefined;
  } catch (e) {
    return undefined;
  }
}
/**
 * The design worked out from a copy of the builder model with every stage's weight and CG overrides off.
 * @param {function} [edit] changes the copy first
 * @returns {object} design
 */
function bldCalcDesign(edit) {
  const M = jclone(BLD);
  M.stages.forEach((st) => {
    st.knownOn = false;
    st.knownCgOn = false;
  });
  if (edit) edit(M);
  return parseOrk(bldToOrk(M, L)).design;
}
/**
 * The calculated value behind a rocket or stage override field: what the design gives without it.
 * @param {string} key known, knownCg, cdOverride, dryInertia, bDryInertia or s1DryInertia
 * @param {number} si stage index (for known and knownCg)
 * @returns {number|undefined}
 */
export function bldCalcOv(key, si) {
  try {
    if (/DryInertia$|^dryInertia$/.test(key)) return bldCalcInertia(key);
    if (key === "cdOverride") {
      const A = aero({ ...D, cdOverride: 0 }),
        atm = atmosphere(L, 0);
      return cdParts(A, 0.3 * atm.a, atm).cd;
    }
    if (key !== "known" && key !== "knownCg") return undefined;
    const r = bldCalcDesign(),
      n = BLD.stages.length;
    const x =
      si === 0
        ? { m: r.dryMass, cg: r.cgEmpty }
        : n === 3 && si === 2
          ? r.s1 && { m: r.s1.bDryMass, cg: r.s1.bCg }
          : { m: r.bDryMass, cg: r.bCg };
    return x ? (key === "known" ? x.m : x.cg) : undefined;
  } catch (e) {
    return undefined;
  }
}
/**
 * A part's weight as calculated from its size and material (with anything attached to it counted separately).
 * @param {string} id part id
 * @returns {number|undefined} kg
 */
export function bldCalcPartMass(id) {
  try {
    const tot = (r) => r.dryMass + (r.bDryMass || 0) + ((r.s1 && r.s1.bDryMass) || 0);
    const pick = (M) => {
      for (const st of M.stages)
        for (const q of st.parts || []) {
          if (q.id === id) return q;
          const k = (q.kids || []).find((x) => x.id === id);
          if (k) return k;
        }
      return null;
    };
    const a = tot(
      bldCalcDesign((M) => {
        const q = pick(M);
        if (q) {
          q.knownOn = false;
          q.knownCgOn = false;
        }
      }),
    );
    const b = tot(
      bldCalcDesign((M) => {
        const q = pick(M);
        if (q) {
          Object.assign(q, { known: 1e-9, knownOn: true, knownAll: false, knownCgOn: false });
          delete q.knownCalc;
        }
      }),
    );
    return Math.max(a - b, 0);
  } catch (e) {
    return undefined;
  }
}
/**
 * The overrides switched off, to keep with the app's settings in the file (a saved .ork leaves them out, as
 * OpenRocket does).
 * @returns {object[]} {id, k, v, all, calc}
 */
export function bldOffList() {
  const out = [];
  const add = (id, O, k) => {
    if (O && O[k + "On"] === false && O[k] != null && isFinite(O[k]))
      out.push({ id, k, v: O[k], ...(O.knownAll ? { all: true } : {}), ...(O.knownCalc ? { calc: true } : {}) });
  };
  if (!BLD) return out;
  ["cdOverride", "dryInertia", "bDryInertia", "s1DryInertia"].forEach((k) => add("settings", BLD.settings, k));
  for (const st of BLD.stages) {
    ["known", "knownCg"].forEach((k) => add(st.id, st, k));
    for (const q of st.parts || [])
      for (const x of [q, ...(q.kids || [])]) ["known", "knownCg", "cdo"].forEach((k) => add(x.id, x, k));
  }
  return out;
}
/**
 * Puts back overrides that were switched off when the file was saved (unless the file now has that override on).
 * @param {object[]} list from bldOffList
 */
export function bldOffApply(list) {
  if (!BLD || !Array.isArray(list)) return;
  for (const e of list) {
    if (!e || typeof e.k !== "string" || !isFinite(e.v)) continue;
    let O;
    if (e.id === "settings") O = BLD.settings = BLD.settings || bldSettings();
    else {
      const f = bldFind(e.id);
      O = f ? f.stage || f.p : null;
    }
    if (!O || bldOvOn(O, e.k)) continue;
    O[e.k] = e.v;
    O[e.k + "On"] = false;
    if (e.all) O.knownAll = true;
    if (e.calc) O.knownCalc = true;
  }
}
/**
 * Works out the flight design D from the parts (written as .ork and read back), keeping app-only settings.
 *
 * the flight code's summary, worked out from the parts
 */
export function bldDerive() {
  bldSyncMotors();
  const prev = D,
    r = parseOrk(bldToOrk(BLD, L), { offIds: BLD.offIds }),
    nd = r.design,
    S = BLD.settings || bldSettings();
  nd.name = BLD.name || nd.name;
  // a rounded nose tip (the .ork has no place for it)
  {
    const np = BLD.stages[0] && BLD.stages[0].parts.find((q) => q.type === "nose");
    nd.noseTip = np && +np.tipR > 0 ? +np.tipR : 0;
  }
  nd.otherCd = S.otherCd || 0;
  nd.blMode = S.blMode || "turb";
  // turning inertia: a typed value, else the one worked out from the parts (parseOrk)
  if (bldOvOn(S, "dryInertia")) {
    nd.dryInertia = S.dryInertia;
    nd.inertiaSource = "typed";
  }
  if (bldOvOn(S, "bDryInertia")) {
    nd.bDryInertia = S.bDryInertia;
    nd.bInertiaSource = "typed";
  }
  if (BLD.ref) {
    nd.orkApogee = BLD.ref.apogee;
    nd.orkMotor = BLD.ref.motor;
    nd.refSource = BLD.ref.source;
  }
  // RockSim gives a mount's motor size directly: keep it while the mount is the size it came with
  if (BLD.mountHint) {
    /**
     * True if two sizes are within 2.5 mm.
     */
    const near = (a, b) => a && b && Math.abs(a - b) < 0.0025;
    if (near(nd.mountDia, BLD.mountHint[0])) nd.mountDia = BLD.mountHint[0];
    if (near(nd.bMountDia, BLD.mountHint[1])) nd.bMountDia = BLD.mountHint[1];
  }
  /**
   * A stage's extra motors for the cluster, matching the main motor unless they were chosen separately.
   *
   * clusters: the extra motors match the main one, unless they were chosen separately on the Motor tab
   */
  const ex = (list, key) => {
    const want = (list || []).reduce((a, e) => a + (e.count || 1), 0),
      had = ((prev && prev[key]) || []).reduce((a, e) => a + (e.n || 1), 0);
    const id = key === "extraMotors" ? motorId : key === "s1ExtraMotors" ? firstId : boostId,
      out = [];
    // a different motor in another mount (RockSim pods) flies as itself when it's in the list
    for (const e of list || []) {
      const m = e.designation ? matchMotor(e) : null,
        mid = m ? m.id : id,
        d = +e.d || 0,
        ej = e.ej != null && +e.ej >= 0 ? +e.ej : null,
        sb = e.sb ?? null, // a side booster's motor drops away with it; its charge can set when
        sbEj = e.sbEj ?? null,
        o = out.find((x) => x.id === mid && Math.abs((x.d || 0) - d) < 1e-6 && x.ej === ej && (x.sb ?? null) === sb);
      if (o) o.n += e.count || 1;
      else out.push({ id: mid, n: e.count || 1, d, ej, ...(sb != null ? { sb, sbEj } : {}) });
    }
    // the same motors as before (perhaps chosen on the Motor tab): kept, with the mounts' lighting times unless changed there
    if (want && had === want) {
      const pv = prev[key];
      if (pv.length === out.length)
        return pv.map((p, i) =>
          p.dUser
            ? { ...p, ej: out[i].ej, sb: out[i].sb, sbEj: out[i].sbEj }
            : { ...p, d: out[i].d, ej: out[i].ej, sb: out[i].sb, sbEj: out[i].sbEj },
        );
      return pv;
    }
    return out;
  };
  nd.extraMotors = ex(r.motorExtras, "extraMotors");
  nd.bExtraMotors = nd.twoStage ? ex(r.boosterExtras, "bExtraMotors") : [];
  nd.s1ExtraMotors = nd.threeStage ? ex(r.firstExtras, "s1ExtraMotors") : [];
  if (prev) {
    nd.mountSel = prev.mountSel === "file" || prev.mountSel == null ? "file" : prev.mountSel;
    nd.bMountSel = prev.bMountSel || "file";
  }
  if (nd.s1 && prev && prev.s1 && prev.s1.mountSel != null) nd.s1.mountSel = prev.s1.mountSel;
  if (nd.s1 && bldOvOn(S, "s1DryInertia")) nd.s1.bDryInertia = S.s1DryInertia;
  setD(nd);
  applyCal();
  return r;
}
