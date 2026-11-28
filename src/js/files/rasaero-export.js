/**
 * Writes a design as a RASAero II file (.CDX1), so it can be run in RASAero II without entering it again (and its
 * Aero Plots export brought back as a drag and stability profile). The other way round from rasaero-import.js, with
 * the same reading of what RASAero's numbers mean (its Users Manual): everything in inches, a part's Location from the
 * nose tip, a fin's Location from the aft end of its tube forward to the leading edge of its root.
 *
 * RASAero describes the outside shape only, and less of it than this app: one nose, tubes, conical transitions, one
 * boattail at the aft end, one set of trapezoidal fins on a tube, one pair of rail guides or launch lugs on a tube,
 * and a booster that is one tube. What a design has beyond that is left out or simplified, and said in the notes that
 * come back with the file. Weights, balance points and motors belong to RASAero's flight simulations, which are not
 * written (its motor names are its own): they go in the file's comments, to enter there.
 */
import { RASAERO_ENGINES } from "../../data/rasaero-engines.js";
import { esc } from "../core/helpers.js";
import { FT, IN, LB } from "../core/units-and-fin-edges.js";
import { bodySegments, finGeom, finSetsOf } from "../physics/aerodynamics.js";
import { boosterDesign } from "../physics/staging.js";

/** RASAero's surface finishes and the roughness of each, inches (Users Manual, Surface Finish). */
const CDX_SURFACES = [
  ["Smooth (Zero Roughness)", 0],
  ["Polished", 0.00005],
  ["Sheet Metal", 0.00016],
  ["Smooth Paint", 0.00025],
  ["Camouflage Paint", 0.0004],
  ["Rough Camouflage Paint", 0.0012],
  ["Galvanized Metal", 0.006],
  ["Cast Iron (Very Rough)", 0.01],
];
/** A length in inches, as the file has it. */
const inch = (m) => String(+(m / IN).toFixed(4));
/**
 * This app's nose shape as RASAero's name for it.
 * @param {string} shape
 * @param {number} param the shape's parameter
 * @param {string[]} notes
 * @returns {string}
 */
function cdxNoseName(shape, param, notes) {
  switch (shape) {
    case "conical":
      return "Conical";
    case "ogive":
      if (param < 0.99)
        notes.push("A secant ogive nose was written as a tangent ogive: RASAero II has no secant ogive.");
      return "Tangent Ogive";
    case "parabolic":
      if (param < 0.99) notes.push("The parabolic nose was written as RASAero II’s full parabola.");
      return "Parabolic";
    case "haack":
      if (param > 0.02 && Math.abs(param - 1 / 3) > 0.02)
        notes.push("The Haack-series nose was written as the nearer of RASAero II’s two: Von Kármán or LV-Haack.");
      return param > 1 / 6 ? "LV-Haack" : "Von Karman Ogive";
    case "ellipsoid":
      return "Elliptical";
    case "power":
      notes.push(
        `The power-series nose (exponent ${+(+param).toFixed(2)}) needs its exponent set again in RASAero II.`,
      );
      return "Power Law";
    default:
      notes.push("The nose’s shape isn’t one RASAero II has: a tangent ogive was written.");
      return "Tangent Ogive";
  }
}
/**
 * A fin set as RASAero's Fin element on a tube.
 * @param {object} f fin set (finSetsOf)
 * @param {number} tubeEnd the aft end of its tube, m from the front of the stage
 * @param {string[]} notes
 * @param {string} who "The fins" or "The booster’s fins"
 * @returns {string}
 */
function cdxFinXml(f, tubeEnd, notes, who) {
  let a = f.a,
    b = f.b,
    s = f.s,
    sw = f.sw;
  // an outline that is not the trapezoid of these numbers
  const trap = [
      [0, 0],
      [f.sw, f.s],
      [f.sw + f.b, f.s],
      [f.a, 0],
    ],
    isTrap =
      !f.pts ||
      f.pts.length < 3 ||
      (f.pts.length === 4 && f.pts.every((q, i) => Math.hypot(q[0] - trap[i][0], q[1] - trap[i][1]) < 1e-4));
  if (!isTrap) {
    // any other outline: the trapezoid of the same root chord, span and area, its tip placed to keep the sweep of
    // the mid-chord line
    const g = finGeom(f);
    if (g && g.area > 0 && g.span > 0) {
      s = g.span;
      b = Math.max(0, (2 * g.area) / s - a);
      sw = Math.max(0, f.sw != null && isFinite(f.sw) ? f.sw : (a - b) / 2);
      notes.push(
        `${who} are not a trapezoid: RASAero II has trapezoidal fins only, so one of the same root chord, span and area was written.`,
      );
    }
  }
  if (f.n < 3 || f.n > 8) notes.push(`${who}: RASAero II takes 3 to 8 fins; the file has ${f.n}.`);
  if (f.cant) notes.push(`${who}’ cant isn’t in a RASAero II file.`);
  const sq = f.edgeTE === "square";
  let sec = "Square",
    fx1 = 0,
    fx3 = 0;
  switch (f.edge) {
    case "rounded":
      sec = "Rounded";
      break;
    case "airfoil":
      sec = "Subsonic NACA";
      break;
    case "doublewedge":
      sec = "Double Wedge";
      break;
    case "beveled":
      sec = sq ? "Hexagonal Blunt Base" : "Hexagonal";
      fx1 = f.bevLE > 0 ? f.bevLE : 0.2 * a;
      fx3 = sq ? 0 : f.bevTE > 0 ? f.bevTE : 0.2 * a;
      break;
    default:
      break;
  }
  if (f.edgeTE && f.edgeTE !== f.edge && !(f.edge === "beveled" && sq))
    notes.push(
      `${who} have a different trailing edge from their leading edge; RASAero II’s “${sec}” section was written.`,
    );
  return (
    `<Fin><Count>${f.n}</Count><Chord>${inch(a)}</Chord><Span>${inch(s)}</Span><SweepDistance>${inch(sw)}</SweepDistance>` +
    `<TipChord>${inch(b)}</TipChord><Thickness>${inch(f.t)}</Thickness><LERadius>${inch(f.ler || 0)}</LERadius>` +
    `<Location>${inch(tubeEnd - f.xLead)}</Location><AirfoilSection>${sec}</AirfoilSection><FX1>${inch(fx1)}</FX1><FX3>${inch(fx3)}</FX3></Fin>`
  );
}
/**
 * The launch guides on a stretch of the rocket, as RASAero's fields of a tube (it models a pair of each).
 * @param {object} D design
 * @param {number} x0 the stretch's front, m from the nose tip
 * @param {number} x1 its end
 * @param {number} si stage index of the guides wanted
 * @param {string[]} notes
 * @returns {string}
 */
function cdxGuideXml(D, x0, x1, si, notes) {
  // (a booster's guides are all on its one tube)
  const on = (g) => (g.si || 0) === si && (si > 0 || (g.x >= x0 - 1e-6 && g.x < x1 - 1e-9)),
    bt = (D.buttons || []).filter(on),
    lg = (D.lugs || []).filter(on);
  if (bt.length && bt.length !== 2)
    notes.push(`RASAero II counts two rail guides on a tube; the design has ${bt.length} there.`);
  if (lg.some((l) => l.rail))
    notes.push("A rail lug was written as a launch lug of its height: RASAero II has rail guides and round lugs.");
  const lugN = lg.reduce((t, l) => t + (l.n || 1), 0);
  if (lg.length && lugN !== 2) notes.push(`RASAero II counts two launch lugs on a tube; the design has ${lugN} there.`);
  return (
    `<LaunchLugDiameter>${lg.length ? inch(2 * lg[0].ro) : 0}</LaunchLugDiameter><LaunchLugLength>${lg.length ? inch(lg[0].len) : 0}</LaunchLugLength>` +
    `<RailGuideDiameter>${bt.length ? inch(bt[0].od) : 0}</RailGuideDiameter><RailGuideHeight>${bt.length ? inch(bt[0].h) : 0}</RailGuideHeight>` +
    `<LaunchShoeArea>0</LaunchShoeArea>`
  );
}
/* RASAero II's engine list names a motor by a designation, two spaces and its maker's code in brackets
   ("H148R  (AT)", "I242-WH-15A  (CTI)"). The whole list (RASAero II 1.0.2.0, 887 motors) is in data/rasaero-engines.js;
   it is not regular (Cesaroni is there as "I240", "I236BS" and "I242-WH-15A"; Hypertek as "J250" and
   "I260-440CC172J"), so the name is looked up in it: of the maker's names that are this motor's designation, or its
   common name with nothing but letters and dashes after it, the one that best fits the motor's designation,
   propellant and delay. A name with a different propellant ("F13RCJ" for an F13-RCT) is never taken. When none fits,
   a name is made by the maker's rule below and RASAero II says the motor was not found and keeps the rest of the file.
   Each maker: its codes in the list, and that rule
     name: the motor's own designation without a "HP-" in front or a delay after it (H148R, J607WC, I301W);
     cn: the common name (I205, D10);
     prop: the common name and the propellant's initials (AMW: I285GG, J500ST);
     dash: the common name, a dash and the propellant's two letters (Loki: H500-LW, I316-SP). */
const CDX_MAKERS = {
  AeroTech: [["AT"], "name"],
  AMW: [["AMW", "AMW/ProX"], "prop"],
  Apogee: [["AP"], "cn"],
  Cesaroni: [["CTI"], "cn"],
  Contrail: [["Contrail"], "cn"],
  "DEAP EX": [["DEAP-EX"], "cn"],
  "Ellis Mountain": [["EM"], "cn"],
  Estes: [["ES"], "name"],
  Gorilla: [["GM"], "name"],
  Historical: [["Hist"], "cn"],
  Hypertek: [["HT"], "cn"],
  Kosdon: [["KBA"], "name"],
  Loki: [["LR", "LR-EX"], "dash"],
  "Public Missiles": [["PML"], "name"],
  Quest: [["QU"], "name"],
  "RATT Works": [["RTW"], "name"],
  Roadrunner: [["RR"], "name"],
  Rocketvision: [["RV"], "name"],
  "Sky Ripper": [["SRS"], "cn"],
  "West Coast Hybrids": [["WCH"], "name"],
};
// the two letters Cesaroni's and Loki's names carry for a propellant (I242-WH-15A, H500-LW)
const CDX_PROP = {
  "Blue Streak": "BS",
  "C-Star": "CS",
  Classic: "CL",
  Green3: "GR",
  Imax: "IM",
  Mellow: "MY",
  Pink: "PK",
  "Red Lightning": "RL",
  Skidmark: "SK",
  "Smoky Sam": "SS",
  Vmax: "VM",
  White: "WH",
  "White Thunder": "WT",
  "Loki White": "LW",
  "Loki Red": "LR",
  "Loki Blue": "LB",
  Spitfire: "SF",
  Cocktail: "CT",
};
const CDX_PROP_CODES = new Set(Object.values(CDX_PROP));
let cdxList = null;
/**
 * The motor's name in RASAero II's engine list, looked up in it.
 * @param {string[]} codes the maker's codes in the list
 * @param {string} name designation without "HP-"
 * @param {string} cn common name
 * @param {string} prop propellant
 * @param {string} brand maker
 * @returns {string} "" when no name in the list fits
 */
function cdxListed(codes, name, cn, prop, brand) {
  if (!cdxList) {
    cdxList = {};
    for (const [k, v] of Object.entries(RASAERO_ENGINES)) cdxList[k] = v.split(" ");
  }
  const initials = (t) =>
      t
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase())
        .join(""),
    pc = CDX_PROP[prop.split("/")[0]] || (brand === "AMW" && prop ? initials(prop) : ""),
    delay = (/-(\d+A)$/.exec(name) || [])[1],
    // Cesaroni's designations carry the total impulse in front and the delay after (348I204-13A)
    core = name.replace(/^\d+(?=[A-Z])/, "").replace(/-\d+A$/, ""),
    lead = (t) => (/^[A-Z]*/.exec(t.replace(/[^A-Z0-9]/g, "")) || [""])[0];
  let best = "",
    top = -Infinity;
  for (const code of codes)
    for (const d of cdxList[code] || []) {
      const exact = d === name || d === core,
        rest = d.slice(cn.length);
      if (!exact && !(cn && d.startsWith(cn) && !/^[\d.]/.test(rest))) continue;
      const own = rest.split(/[-_/]/).find((t) => CDX_PROP_CODES.has(t)) || (/^[A-Z]{2}$/.test(rest) ? rest : "");
      if (!exact && pc && own && own !== pc) continue;
      if (!exact && core.startsWith(cn)) {
        // the letters after the common name are the propellant (F13RCJ: Blackjack, F13-RCT: Blue Thunder)
        const a = lead(core.slice(cn.length)),
          b = lead(rest);
        if (a && b && !a.startsWith(b) && !b.startsWith(a)) continue;
      }
      let s = -d.length / 100;
      if (d === name) s += 100;
      if (d === core && core !== cn) s += 80;
      if (d.startsWith(core)) s += 30;
      if (name.startsWith(d) || core.startsWith(d)) s += 15;
      if (pc && own === pc) s += 20;
      if (delay && d.endsWith(delay)) s += 10;
      if (d === cn) s += 5;
      if (s > top) {
        top = s;
        best = `${d}  (${code})`;
      }
    }
  return best;
}
/**
 * A motor's name in RASAero II's engine list.
 * @param {object|null} m motor
 * @returns {string} "" when its maker's code in RASAero II isn't known
 */
function cdxEngineName(m) {
  const [codes, how] = (m && CDX_MAKERS[m.brand]) || [],
    cn = String((m && m.cn) || "").trim(),
    name = String((m && m.name) || "")
      .trim()
      .replace(/^HP-/i, "");
  if (!codes) return "";
  const listed = cdxListed(codes, name, cn, String(m.prop || ""), m.brand);
  if (listed) return listed;
  let nm = cn;
  if (how === "name") nm = name.replace(/-.*$/, "") || cn;
  else if (how === "prop") {
    // the designation when it is already of that form (I375GG), else the propellant's initials (Green Gorilla)
    const ini = String(m.prop || "")
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase())
      .join("");
    nm = new RegExp(`^${cn}[A-Z]{2}$`).test(name) ? name : cn && ini.length === 2 ? cn + ini : cn;
  } else if (how === "dash") {
    const two = /([A-Z]{2})$/.exec(name);
    nm = cn && two ? `${cn}-${two[1]}` : cn;
  }
  return nm ? `${nm}  (${codes[0]})` : "";
}
/**
 * A design as a RASAero II file.
 * @param {object} D design (the flight's: sections, fin sets, guides, weights)
 * @param {object} L launch conditions
 * @param {{name?:string, motor?:object, boost?:object, nozzle?:number, boostNozzle?:number}} [info] the rocket's
 *   name, the motors it flies (for the file's simulation) and their nozzle exit diameters, m
 * @returns {{text:string, notes:string[]}} the file, and what of the design it could not hold
 */
export function designToCdx(D, L, info = {}) {
  const notes = [],
    segs = bodySegments(D).filter((sg) => sg.len > 0),
    nose = segs[0] && segs[0].kind === "nose" ? segs[0] : null;
  if (!nose) throw new Error("RASAero II needs a nose cone at the front, and this design has none.");
  if (nose.r1 > 1e-6) notes.push("The nose’s flat or rounded front was written as RASAero II’s blunt radius.");
  const fins = finSetsOf(D).filter((f) => f && f.n > 0 && f.a > 0 && f.s > 0 && f.pod == null),
    used = new Set();
  let parts =
    `<NoseCone><PartType>NoseCone</PartType><Length>${inch(nose.len)}</Length><Diameter>${inch(2 * nose.r2)}</Diameter>` +
    `<Shape>${cdxNoseName(nose.shape, nose.param, notes)}</Shape><BluntRadius>${inch(Math.max(D.noseTip || 0, nose.r1 || 0))}</BluntRadius><Location>0</Location><Color>Black</Color></NoseCone>`;
  // the fin set a tube carries: the largest whose root lies mostly on it
  const finOn = (x0, x1) => {
    const here = fins
      .filter((f) => !used.has(f) && f.xLead + f.a / 2 >= x0 - 1e-6 && f.xLead + f.a / 2 <= x1 + 1e-6)
      .sort((p, q) => q.a * q.s - p.a * p.s);
    here.forEach((f) => used.add(f));
    if (here.length > 1)
      notes.push("RASAero II has one fin set on a tube: the largest there was written, the others left out.");
    return here[0] || null;
  };
  const rest = segs.slice(1);
  rest.forEach((sg, i) => {
    const last = i === rest.length - 1,
      x1 = sg.x + sg.len;
    if (sg.kind === "tube" || Math.abs(sg.r1 - sg.r2) < 1e-6) {
      const f = finOn(sg.x, x1),
        // a boattail right behind this tube is also given on the tube, as RASAero's own files do
        bt = rest[i + 1] && i + 1 === rest.length - 1 && rest[i + 1].r2 < rest[i + 1].r1 ? rest[i + 1] : null;
      parts +=
        `<BodyTube><PartType>BodyTube</PartType><Length>${inch(sg.len)}</Length><Diameter>${inch(2 * sg.r1)}</Diameter>` +
        cdxGuideXml(D, sg.x, x1, 0, notes) +
        `<Location>${inch(sg.x)}</Location><Color>Black</Color><BoattailLength>${bt ? inch(bt.len) : 0}</BoattailLength>` +
        `<BoattailRearDiameter>${bt ? inch(2 * bt.r2) : 0}</BoattailRearDiameter><BoattailOffset>0</BoattailOffset><Overhang>0</Overhang>` +
        (f ? cdxFinXml(f, x1, notes, "The fins") : "") +
        `</BodyTube>`;
      return;
    }
    if (sg.shape && sg.shape !== "conical")
      notes.push("A curved transition was written as a straight cone: RASAero II’s transitions are conical.");
    const tag = last && sg.r2 < sg.r1 ? "BoatTail" : "Transition";
    // as RASAero II writes them itself: a transition's Diameter is its rear diameter (its front is the part ahead's),
    // a boattail's is its front
    parts +=
      tag === "Transition"
        ? `<Transition><PartType>Transition</PartType><Length>${inch(sg.len)}</Length><Diameter>${inch(2 * sg.r2)}</Diameter>` +
          `<Location>${inch(sg.x)}</Location><RearDiameter>${inch(2 * sg.r2)}</RearDiameter><Color>Black</Color></Transition>`
        : `<BoatTail><PartType>BoatTail</PartType><Length>${inch(sg.len)}</Length><Diameter>${inch(2 * sg.r1)}</Diameter>` +
          `<RearDiameter>${inch(2 * sg.r2)}</RearDiameter><Location>${inch(sg.x)}</Location><Color>Black</Color></BoatTail>`;
  });
  if (fins.some((f) => !used.has(f)))
    notes.push("Fins on the nose or on a transition were left out: RASAero II puts fins on tubes.");
  if (finSetsOf(D).some((f) => f && f.pod != null) || (D.pods && D.pods.length))
    notes.push("Side pods and their fins were left out: RASAero II has none.");
  if (D.tubeFins && D.tubeFins.length) notes.push("Tube fins were left out: RASAero II has none.");
  if ((D.bumps || []).length)
    notes.push("Protuberances (cameras, switch bands and the like) were left out: add them in RASAero II.");
  // the booster: one tube of its largest diameter, with its largest fin set
  const two = !!D.twoStage && D.bLength > 0;
  let noz2 = 0;
  if (two) {
    const B = boosterDesign(D),
      bs = bodySegments(B).filter((sg) => sg.len > 0),
      bd = 2 * Math.max(...bs.map((sg) => Math.max(sg.r1, sg.r2))),
      bf = finSetsOf(B)
        .filter((f) => f && f.n > 0 && f.a > 0 && f.s > 0 && f.pod == null)
        .sort((p, q) => q.a * q.s - p.a * p.s),
      endR = segs[segs.length - 1].r2;
    if (bs.length > 1 || bs.some((sg) => Math.abs(sg.r1 - sg.r2) > 1e-6))
      notes.push("The booster was written as one tube of its largest diameter: RASAero II’s booster is a single tube.");
    if (bf.length > 1) notes.push("The booster’s largest fin set was written, the others left out.");
    if (D.threeStage && D.s1)
      notes.push("Only the sustainer and the stage under it were written: the first stage was left out.");
    noz2 = info.boostNozzle > 0 ? info.boostNozzle : 0;
    parts +=
      `<Booster><PartType>Booster</PartType><Length>${inch(D.bLength)}</Length><Diameter>${inch(bd)}</Diameter>` +
      `<InsideDiameter>${inch(2 * endR)}</InsideDiameter>` +
      cdxGuideXml(D, D.length, D.length + D.bLength, 1, notes) +
      `<Location>${inch(D.length)}</Location><ShoulderLength>0</ShoulderLength><Color>Black</Color>` +
      `<NozzleExitDiameter>${inch(noz2)}</NozzleExitDiameter><BoattailLength>0</BoattailLength><BoattailRearDiameter>0</BoattailRearDiameter>` +
      (bf[0] ? cdxFinXml(bf[0], D.bLength, notes, "The booster’s fins") : "") +
      `</Booster>`;
  }
  // the finish: RASAero's nearest by roughness
  const rs = typeof D.finish === "number" && isFinite(D.finish) ? D.finish : 60e-6,
    surf = CDX_SURFACES.map(([n, r]) => [n, r * IN]).reduce((best, s) =>
      Math.abs(s[1] - rs) < Math.abs(best[1] - rs) ? s : best,
    );
  if (Math.abs(surf[1] - rs) > 2e-6)
    notes.push(
      `Surface finish: RASAero II’s nearest, “${surf[0]}” (${+(surf[1] * 1e6).toFixed(1)} µm; the design’s is ${+(rs * 1e6).toFixed(1)} µm).`,
    );
  const noz = D.nozzleDia > 0 ? D.nozzleDia : info.nozzle > 0 ? info.nozzle : 0;
  // RASAero's flight simulation holds the weights: each stage's launch weight and CG with its motor in, the booster's
  // being the whole stack's (as its own two-stage example has them)
  const m = info.motor,
    mb = two ? info.boost : null,
    lb = (kg) => +(kg / LB).toFixed(3),
    lines = [info.name || "Rocket", "Written by Pocket Rocket Flight Lab."];
  let sim = "";
  if (D.dryMass > 0) {
    const mx = m ? (D.mountAft ?? D.length) + (D.motorOverhang || 0) - (m.len || 0) / 2 : 0,
      wt = D.dryMass + (m ? m.totalMass : 0),
      cg = m ? (D.dryMass * D.cgEmpty + m.totalMass * mx) / wt : D.cgEmpty;
    let wtAll = 0,
      cgAll = 0;
    if (two) {
      const bx = mb ? D.length + (D.bMountAft ?? D.bLength) + (D.bOverhang || 0) - (mb.len || 0) / 2 : 0,
        bm = mb ? mb.totalMass : 0;
      wtAll = wt + D.bDryMass + bm;
      cgAll = (wt * cg + D.bDryMass * (D.length + (D.bCg || 0)) + bm * bx) / wtAll;
    }
    lines.push(
      `${two ? "Sustainer l" : "L"}aunch weight ${lb(wt)} lb, CG ${inch(cg)} in from the nose tip${m ? ` (with ${m.cn || m.name || "the motor"})` : " (without a motor)"}.`,
    );
    if (two)
      lines.push(
        `Whole rocket: ${lb(wtAll)} lb, CG ${inch(cgAll)} in${mb ? ` (with ${mb.cn || mb.name || "the booster’s motor"} too)` : ""}.`,
      );
    const e = cdxEngineName(m),
      eb = cdxEngineName(mb),
      missing = [!e && m, two && !eb && mb].filter(Boolean),
      d2 = (v) => +Math.max(0, v || 0).toFixed(2);
    if (e && (!two || eb)) {
      const sep = two ? Math.min(Math.max(0, D.sepDelay || 0), Math.max(0, D.stageDelay || 0)) : 0;
      sim =
        `<Simulation><SustainerEngine>${esc(e)}</SustainerEngine><SustainerLaunchWt>${lb(wt)}</SustainerLaunchWt>` +
        `<SustainerNozzleDiameter>${inch(noz)}</SustainerNozzleDiameter><SustainerCG>${inch(cg)}</SustainerCG>` +
        // RASAero counts the sustainer's ignition delay from the separation
        `<SustainerIgnitionDelay>${two ? d2((D.stageDelay || 0) - sep) : 0}</SustainerIgnitionDelay>` +
        (two ? `<Booster1Engine>${esc(eb)}</Booster1Engine>` : "") +
        `<Booster1LaunchWt>${two ? lb(wtAll) : 0}</Booster1LaunchWt><Booster1SeparationDelay>${d2(sep)}</Booster1SeparationDelay>` +
        `<Booster1IgnitionDelay>0</Booster1IgnitionDelay><Booster1CG>${two ? inch(cgAll) : 0}</Booster1CG>` +
        `<Booster1NozzleDiameter>${two ? inch(noz2) : 0}</Booster1NozzleDiameter><IncludeBooster1>${two ? "True" : "False"}</IncludeBooster1>` +
        `<Booster2LaunchWt>0</Booster2LaunchWt><Booster2Delay>0</Booster2Delay><Booster2CG>0</Booster2CG>` +
        `<Booster2NozzleDiameter>0</Booster2NozzleDiameter><IncludeBooster2>False</IncludeBooster2>` +
        `<FlightTime>0</FlightTime><TimetoApogee>0</TimetoApogee><MaxAltitude>0</MaxAltitude><MaxVelocity>0</MaxVelocity>` +
        `<OptimumWt>0</OptimumWt><OptimumMaxAlt>0</OptimumMaxAlt></Simulation>`;
      notes.push(
        `A flight simulation was written with the weight, the CG and ${two ? "the motors" : "the motor"} (${[eb, e]
          .filter(Boolean)
          .map((x) => x.replace(/\s+/g, " "))
          .join(
            " and ",
          )}). RASAero II flies its own thrust curve for a motor of that name, which can differ from this app’s; if it has none of that name it says so when the simulation is run, and the motor is then chosen there.`,
      );
    } else if (missing.length)
      notes.push(
        `No flight simulation was written: ${missing.map((x) => x.cn || x.name).join(" and ")} is from a maker whose name in RASAero II’s engine list this app doesn’t know. The weight and CG to enter there are in the file’s comments.`,
      );
    else
      notes.push(
        "No flight simulation was written: choose a motor first. The weight and CG are in the file’s comments.",
      );
  } else notes.push("No flight simulation was written: the design has no weight yet.");
  const text =
    `<RASAeroDocument>\n<FileVersion>2</FileVersion>\n<RocketDesign>` +
    parts +
    `<Surface>${surf[0]}</Surface><CP>0</CP><ModifiedBarrowman>False</ModifiedBarrowman>` +
    `<Turbulence>${D.blMode === "natural" ? "False" : "True"}</Turbulence>` +
    `<SustainerNozzle>${inch(noz)}</SustainerNozzle><Booster1Nozzle>${inch(noz2)}</Booster1Nozzle><Booster2Nozzle>0</Booster2Nozzle>` +
    `<UseBooster1>${two ? "True" : "False"}</UseBooster1><UseBooster2>False</UseBooster2>` +
    `<Comments>${esc(lines.join("\n"))}</Comments></RocketDesign>\n` +
    `<LaunchSite><Altitude>${+((L.elev || 0) / FT).toFixed(0)}</Altitude><Pressure>0</Pressure><RodAngle>${+(L.angle || 0).toFixed(1)}</RodAngle>` +
    `<RodLength>${+((L.rail || 0) / FT).toFixed(2)}</RodLength><Temperature>${+(((L.tempC ?? 15) * 9) / 5 + 32).toFixed(1)}</Temperature>` +
    `<WindSpeed>${+((L.wind || 0) / 0.44704).toFixed(1)}</WindSpeed></LaunchSite>\n` +
    `<Recovery><Altitude1>${+((D.mainAlt || 0) / FT).toFixed(0)}</Altitude1><Altitude2>${+((D.mainAlt || 0) / FT).toFixed(0)}</Altitude2>` +
    `<DeviceType1>None</DeviceType1><DeviceType2>None</DeviceType2><Event1>False</Event1><Event2>False</Event2>` +
    `<Size1>1</Size1><Size2>1</Size2><EventType1>None</EventType1><EventType2>None</EventType2><CD1>1.33</CD1><CD2>1.33</CD2></Recovery>\n` +
    `<MachAlt />\n${sim ? `<SimulationList>${sim}</SimulationList>` : "<SimulationList />"}\n</RASAeroDocument>\n`;
  notes.push("Not in the file: the recovery. Set it in RASAero II’s flight simulation.");
  return { text, notes: [...new Set(notes)] };
}
