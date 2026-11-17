/**
 * RASAero II .CDX1 import. A RASAero file describes the rocket's outside shape only (nose, tubes, transitions, fin
 * cans, fins, launch guides), in inches, and keeps the weight, balance point and motors with each of its simulations.
 * The shape is rewritten as an OpenRocket .ork document and read by parseOrk; the chosen simulation's weight and
 * balance point go on each stage as an override covering its parts, and its motors, staging delays, launch site and
 * recovery are applied on top.
 *
 * What the file's numbers mean follows the RASAero II Users Manual: a simulation's launch weight and CG are with the
 * motor loaded (the booster's are the whole stack's), a fin's location is from the aft end of its tube to the leading
 * edge of its root, a fin can slides over the aft end of the tube ahead of it, and a booster starts where the
 * sustainer's tube ends, with the sustainer's boattail inside it.
 */
import { esc } from "../core/helpers.js";
import { FT, IN, LB } from "../core/units-and-fin-edges.js";
import { parseOrk } from "./openrocket-import.js";
import { finishNear } from "./ork-parts.js";
import { matchMotor } from "./rocksim-import.js";
import { ORK_SIM } from "./save.js";

/**
 * RASAero's surface finishes: the equivalent sand roughness of each, in inches (Users Manual, Surface Finish).
 */
const CDX_SURFACE = {
  "smooth (zero roughness)": 0,
  polished: 0.00005,
  "sheet metal": 0.00016,
  "smooth paint": 0.00025,
  "camouflage paint": 0.0004,
  "rough camouflage paint": 0.0012,
  "galvanized metal": 0.006,
  "cast iron": 0.01,
  "cast iron (very rough)": 0.01,
};
/**
 * RASAero's nose shapes as OpenRocket's shape and shape parameter.
 */
const CDX_NOSE = {
  "tangent ogive": ["ogive", 1],
  conical: ["conical", 0],
  parabolic: ["parabolic", 1],
  "von karman ogive": ["haack", 0],
  "lv-haack": ["haack", 0.333],
  elliptical: ["ellipsoid", 0],
  "power law": ["power", 0.5],
};
/**
 * The placeholder wall and material of every part: the weight comes from the simulation, not from the parts.
 */
const CDX_WALL = 0.002,
  CDX_MAT = '<material type="bulk" density="1000">Fiberglass</material>';

/**
 * The trimmed text of a child element, or "".
 * @param {Element|null} el
 * @param {string} tag
 * @returns {string}
 */
const cdxTxt = (el, tag) => {
  const c = el && [...el.children].find((e) => e.tagName === tag);
  return c ? c.textContent.trim() : "";
};
/**
 * A child element's number, or 0.
 * @param {Element|null} el
 * @param {string} tag
 * @returns {number}
 */
const cdxNum = (el, tag) => {
  const v = parseFloat(cdxTxt(el, tag));
  return isFinite(v) ? v : 0;
};
/**
 * True if a file's text is a RASAero II design.
 * @param {string} xml
 * @returns {boolean}
 */
export const isCdx = (xml) => /<RASAeroDocument/i.test((xml || "").slice(0, 4000));
/**
 * A RASAero engine name ("I205  (CTI)") as a designation and maker.
 * @param {string} s
 * @returns {{designation:string, mfr:string}|null} null if there is none
 */
function cdxEngine(s) {
  const m = /^\s*(.*?)\s*(?:\(([^)]*)\))?\s*$/.exec(s || "");
  return m && m[1] ? { designation: m[1], mfr: (m[2] || "").trim() } : null;
}
/**
 * The simulations stored in a RASAero file, for choosing one when it's opened.
 * @param {Document} doc
 * @returns {{i:number, name:string, motors:string, apogee:number|null, wind:number|null, outdated:boolean,
 *   cfg:null, at:string}[]}
 */
export function cdxRuns(doc) {
  const site = doc.getElementsByTagName("LaunchSite")[0],
    wind = site && cdxTxt(site, "WindSpeed") !== "" ? cdxNum(site, "WindSpeed") * 0.44704 : null;
  return [...doc.getElementsByTagName("Simulation")].map((s, i) => {
    const two = cdxTxt(s, "IncludeBooster1") === "True",
      names = [two ? cdxTxt(s, "Booster1Engine") : "", cdxTxt(s, "SustainerEngine")]
        .map((e) => cdxEngine(e))
        .filter(Boolean)
        .map((e) => e.designation),
      apo = cdxNum(s, "MaxAltitude");
    return {
      i,
      name: `Simulation ${i + 1}`,
      motors: names.join(" + ") || "no motor",
      apogee: apo > 0 ? apo * FT : null,
      wind,
      outdated: false,
      cfg: null,
      at: "",
    };
  });
}
/**
 * A RASAero surface as the finish elements of a part: a perfectly smooth one is the mirror finish, the rest keep
 * RASAero's own roughness (this app's custom finish, beside the nearest finish OpenRocket has).
 * @param {string} surface RASAero's name for it
 * @param {string[]} notes
 * @returns {string}
 */
function cdxFinish(surface, notes) {
  const inches = CDX_SURFACE[(surface || "").toLowerCase()];
  if (inches == null) {
    if (surface) notes.push(`RASAero’s surface finish “${surface}” isn’t known here; regular paint was used.`);
    return "<finish>normal</finish>";
  }
  if (inches === 0) return "<finish>mirror</finish>";
  const rs = +(inches * IN).toPrecision(6);
  notes.push(
    `Surface finish: RASAero’s “${surface}”, at its own roughness of ${+(rs * 1e6).toPrecision(3)} µm (Custom roughness under Surface finish).`,
  );
  return `<finish>${finishNear(rs)}</finish><prflfinish>custom</prflfinish><prflroughness>${rs}</prflroughness>`;
}
/**
 * A RASAero fin set as an OpenRocket trapezoidal fin set on the aft end of its tube.
 * @param {Element} F the Fin element
 * @param {string} fin the finish and material elements
 * @param {string[]} notes
 * @returns {string} "" if the fins have no size
 */
function cdxFins(F, fin, notes) {
  const cr = cdxNum(F, "Chord"),
    s = cdxNum(F, "Span"),
    n = Math.round(cdxNum(F, "Count"));
  if (!(cr > 0 && s > 0 && n > 0)) return "";
  const sec = cdxTxt(F, "AirfoilSection"),
    le = cdxNum(F, "FX1"),
    te = cdxNum(F, "FX3");
  // RASAero's sections as this app's: the edge type, and the lengths of the leading and trailing bevels
  let edge = "square",
    bev = "";
  const bevel = (a, b, teEdge) =>
    `<prflbevelle>${a * IN}</prflbevelle><prflbevelte>${b * IN}</prflbevelte>${teEdge ? `<prfltrailingedge>${teEdge}</prfltrailingedge>` : ""}`;
  switch (sec.toLowerCase()) {
    case "hexagonal":
      edge = "beveled";
      if (le > 0 || te > 0) bev = bevel(le, te, "");
      break;
    case "hexagonal blunt base":
      edge = "beveled";
      bev = bevel(le, 0, "square");
      break;
    case "single wedge":
      // a wedge from a sharp leading edge to a square trailing edge at full thickness
      edge = "beveled";
      bev = bevel(cr, 0, "square");
      notes.push("Single wedge fins were read as a bevel over the whole chord with a square trailing edge.");
      break;
    case "double wedge":
      edge = "doublewedge";
      break;
    case "rounded":
      edge = "rounded";
      break;
    case "subsonic naca":
      edge = "airfoil";
      break;
    case "square":
      break;
    default:
      notes.push(`RASAero’s fin section “${sec}” isn’t known here; square edges were used.`);
  }
  if (cdxNum(F, "LERadius") > 0 && edge !== "rounded" && edge !== "square")
    notes.push("The fins’ leading edge radius isn’t modeled: their leading edges are sharp here.");
  return `<trapezoidfinset><name>Fins</name><axialoffset method="bottom">${-(cdxNum(F, "Location") - cr) * IN}</axialoffset>${fin}<fincount>${n}</fincount><rotation>0</rotation><thickness>${cdxNum(F, "Thickness") * IN}</thickness><crosssection>${edge}</crosssection><cant>0</cant>${bev}<rootchord>${cr * IN}</rootchord><tipchord>${cdxNum(F, "TipChord") * IN}</tipchord><sweeplength>${cdxNum(F, "SweepDistance") * IN}</sweeplength><height>${s * IN}</height></trapezoidfinset>`;
}
/**
 * The launch guides and protuberances RASAero puts on a tube (it models two of each guide), as OpenRocket parts.
 * @param {Element} p the tube, fin can or booster
 * @param {number} len the length of the tube they go on, m
 * @param {string} fin the finish and material elements
 * @param {string[]} notes
 * @returns {string}
 */
function cdxGuides(p, len, fin, notes) {
  let out = "";
  const pair = `<instancecount>2</instancecount><instanceseparation>${0.5 * len}</instanceseparation>`;
  const rd = cdxNum(p, "RailGuideDiameter"),
    rh = cdxNum(p, "RailGuideHeight");
  if (rd > 0 && rh > 0)
    out += `<railbutton><name>Rail guides</name><axialoffset method="bottom">${-Math.min(0.05, 0.25 * len)}</axialoffset><outerdiameter>${rd * IN}</outerdiameter><innerdiameter>${0.6 * rd * IN}</innerdiameter><height>${rh * IN}</height>${pair}</railbutton>`;
  const ld = cdxNum(p, "LaunchLugDiameter"),
    ll = cdxNum(p, "LaunchLugLength");
  if (ld > 0 && ll > 0)
    out += `<launchlug><name>Launch lugs</name><axialoffset method="bottom">${-Math.min(0.05, 0.25 * len)}</axialoffset>${fin}<radius>${(ld / 2) * IN}</radius><thickness>0.0005</thickness><length>${ll * IN}</length>${pair}</launchlug>`;
  /**
   * A protuberance of a frontal area (in²) as a mass-less bump of this app, a square of that area.
   */
  const bump = (name, area, shape, at) => {
    const a = Math.sqrt(area) * IN;
    return `<masscomponent><name>${name}</name><axialoffset method="top">${at * len}</axialoffset><packedlength>${shape === "long" ? a : 3 * a}</packedlength><packedradius>${a / 2}</packedradius><radialposition>0</radialposition><radialdirection>0</radialdirection><mass>0</mass><masscomponenttype>masscomponent</masscomponenttype><prflbump>${shape}</prflbump><prflbumpw>${a}</prflbumpw><prflbumph>${a}</prflbumph></masscomponent>`;
  };
  const shoe = cdxNum(p, "LaunchShoeArea");
  if (shoe > 0) {
    out += bump("Launch shoe", shoe, "long", 0.25) + bump("Launch shoe", shoe, "long", 0.75);
    notes.push("RASAero’s two launch shoes were read as blunt boxes of the same frontal area.");
  }
  const pr = [...p.children].find((e) => e.tagName === "Protuberance");
  if (pr) {
    const kinds = [
      ["StreamlinedNoBaseDrag", "faired"],
      ["StreamlinedWithBaseDrag", "faired"],
      ["InclinedPlate1FrontalArea", "ramp"],
      ["InclinedPlate2FrontalArea", "ramp"],
    ];
    let any = false;
    for (const [tag, shape] of kinds) {
      const a = cdxNum(pr, tag);
      if (a > 0) {
        out += bump("Protuberance", a, shape, 0.5);
        any = true;
      }
    }
    if (any)
      notes.push(
        "RASAero’s protuberances were read as faired or sloped-front shapes of the same frontal area: an approximation of its own protuberance drag.",
      );
  }
  return out;
}
/**
 * The outside of a RASAero rocket as OpenRocket body parts: the sustainer's, and the booster's if the file has one.
 * @param {Element} design RocketDesign
 * @param {string} fin the finish and material elements
 * @param {string[]} notes
 * @returns {{sus:object[], boost:object[]|null, tip:number}} each part: {xml (a function of what goes inside it), len,
 *   d (aft diameter), tube}; tip: the nose's blunt radius, m
 */
function cdxBody(design, fin, notes) {
  const parts = [...design.children].filter((e) => [...e.children].some((c) => c.tagName === "PartType"));
  const sus = [];
  let boost = null,
    tip = 0,
    d = 0; // the diameter at the aft end so far, in.
  const tubeXml = (name, len, dia) => (inside) =>
    `<bodytube><name>${name}</name>${fin}<length>${len * IN}</length><thickness>${inside.wall || CDX_WALL}</thickness><radius>${(dia / 2) * IN}</radius>${inside.mount || ""}<subcomponents>${inside.kids || ""}</subcomponents></bodytube>`;
  const coneXml = (name, len, d0, d1) => () =>
    `<transition><name>${name}</name>${fin}<length>${len * IN}</length><thickness>${CDX_WALL}</thickness><shape>conical</shape><shapeclipped>false</shapeclipped><shapeparameter>0</shapeparameter><foreradius>${(d0 / 2) * IN}</foreradius><aftradius>${(d1 / 2) * IN}</aftradius><foreshoulderlength>0</foreshoulderlength><aftshoulderlength>0</aftshoulderlength></transition>`;
  /**
   * A tube with what RASAero puts on it: fins and launch guides.
   */
  const tube = (list, p, name, len, dia) => {
    const F = [...p.children].find((e) => e.tagName === "Fin");
    list.push({
      xml: tubeXml(name, len, dia),
      len,
      d: dia,
      tube: true,
      kids: (F ? cdxFins(F, fin, notes) : "") + cdxGuides(p, len * IN, fin, notes),
    });
  };
  /**
   * Takes a length off the aft end of the body so far (a fin can or a booster goes over it).
   */
  const trim = (list, cut) => {
    while (cut > 1e-9 && list.length > 1) {
      const last = list[list.length - 1];
      if (!last.tube || last.len <= cut + 1e-9) break;
      const keep = last.len - cut;
      last.len = keep;
      last.xml = tubeXml("Body tube", keep, last.d);
      cut = 0;
    }
    return cut;
  };
  for (const p of parts) {
    const len = cdxNum(p, "Length"),
      dia = cdxNum(p, "Diameter");
    switch (p.tagName) {
      case "NoseCone": {
        const [shape, param] = CDX_NOSE[cdxTxt(p, "Shape").toLowerCase()] || ["ogive", 1];
        if (!CDX_NOSE[cdxTxt(p, "Shape").toLowerCase()])
          notes.push(`RASAero’s nose shape “${cdxTxt(p, "Shape")}” isn’t known here; a tangent ogive was used.`);
        if (cdxTxt(p, "Shape").toLowerCase() === "power law")
          notes.push("The power law nose was read with an exponent of 0.5; set its shape in the builder.");
        tip = cdxNum(p, "BluntRadius") * IN;
        sus.push({
          xml: () =>
            `<nosecone><name>Nose cone</name>${fin}<length>${len * IN}</length><thickness>${CDX_WALL}</thickness><shape>${shape}</shape><shapeclipped>false</shapeclipped><shapeparameter>${param}</shapeparameter><aftradius>${(dia / 2) * IN}</aftradius><aftshoulderlength>0</aftshoulderlength></nosecone>`,
          len,
          d: dia,
        });
        d = dia;
        break;
      }
      case "BodyTube":
        if (len > 0 && dia > 0) tube(sus, p, "Body tube", len, dia);
        d = dia || d;
        break;
      case "Transition":
      case "BoatTail": {
        // (the front is the diameter of the part ahead; RASAero's own Diameter here is often the rear one again)
        const rear = cdxNum(p, "RearDiameter") || dia;
        if (len > 0)
          sus.push({
            xml: coneXml(p.tagName === "BoatTail" ? "Boattail" : "Transition", len, d, rear),
            len,
            d: rear,
            tail: p.tagName === "BoatTail",
          });
        d = rear;
        break;
      }
      case "FinCan": {
        // slides over the aft end of the tube ahead of it: a shoulder up to its own diameter, then the can
        const sh = Math.min(Math.max(cdxNum(p, "ShoulderLength"), 0), len),
          left = trim(sus, len);
        if (left > 0)
          notes.push("The fin can is longer than the tube it slides over, so the rocket is longer here by the rest.");
        if (sh > 0 && dia !== d) sus.push({ xml: coneXml("Fin can shoulder", sh, d, dia), len: sh, d: dia });
        tube(sus, p, "Fin can", sh > 0 && dia !== d ? len - sh : len, dia);
        d = dia;
        break;
      }
      case "Booster": {
        if (boost) {
          notes.push("Only the first booster in the file was read.");
          break;
        }
        boost = [];
        // it starts at the end of the sustainer's tube: a boattail behind that tube sits inside it
        const inside = sus.filter((q, i) => q.tail && i === sus.length - 1).reduce((a, q) => a + q.len, 0),
          sh0 = Math.min(Math.max(cdxNum(p, "ShoulderLength"), 0), len),
          hasSh = sh0 > 0 && dia !== d,
          tubeLen = (hasSh ? len - sh0 : len) - inside;
        let sh = hasSh ? sh0 : 0,
          tl = tubeLen;
        if (tl <= 0) {
          sh = Math.max(sh + tl, 0);
          tl = 0;
        }
        if (inside > 0)
          notes.push(
            "The sustainer’s boattail sits inside the booster. Here the stages go end to end, so the booster’s tube was shortened by the boattail’s length: the whole rocket’s length and the booster’s fins are where the file has them.",
          );
        if (sh > 0) boost.push({ xml: coneXml("Interstage", sh, d, dia), len: sh, d: dia });
        if (tl > 0) tube(boost, p, "Booster", tl, dia);
        else notes.push("The booster is no longer than the boattail inside it: its fins and guides were left out.");
        d = dia;
        break;
      }
      default:
        notes.push(`Skipped a RASAero “${p.tagName}” part.`);
    }
  }
  return { sus, boost, tip };
}
/**
 * A stage's XML from its parts: the motor mount in its last tube, and the weight and balance point from the
 * simulation as an override that covers the parts.
 * @param {string} name the stage's name
 * @param {object[]} parts from cdxBody
 * @param {{mass:number, cg:number}|null} wt the stage's weight without its motor (kg) and where it balances, from the
 *   stage's front (m); either may be 0 (not known)
 * @param {{dia:number, len:number}|null} mo the motor it flies, if it's in the motor list
 * @param {{stage:string, mount:string, motor:string, recovery:string}} more elements for the stage, its motor mount's
 *   ignition, the motor in the mount, and its recovery parts
 * @returns {string}
 */
function cdxStage(name, parts, wt, mo, more) {
  const tubes = parts.filter((p) => p.tube),
    last = tubes[tubes.length - 1],
    // the motor's aft end is at the aft end of the stage, behind any boattail
    after = last ? parts.slice(parts.indexOf(last) + 1).reduce((a, p) => a + p.len, 0) * IN : 0,
    ign = more.mount || "<ignitionevent>automatic</ignitionevent><ignitiondelay>0</ignitiondelay>";
  /**
   * The motor mount: a motor tube of the motor's size when the motor is known and smaller than the body, else the
   * body tube itself.
   */
  const mountOf = (p) => {
    if (p !== last) return {};
    const mm = `<motormount>${ign}<overhang>${after}</overhang>${more.motor || ""}</motormount>`,
      r = mo && mo.dia > 0 ? mo.dia / 2 + 0.0005 : 0;
    if (r > 0 && r + 0.001 < (p.d / 2) * IN - CDX_WALL) {
      const len = Math.min(mo.len > 0 ? mo.len : p.len * IN, p.len * IN);
      return {
        kids: `<innertube><name>Motor mount</name><axialoffset method="bottom">0</axialoffset>${CDX_MAT}<length>${len}</length><radialposition>0</radialposition><radialdirection>0</radialdirection><outerradius>${r + 0.001}</outerradius><thickness>0.001</thickness>${mm}</innertube>`,
      };
    }
    // a motor as wide as the body (a minimum-diameter rocket): the tube's wall is what is left around it
    return { mount: mm, ...(r > 0 ? { wall: Math.max((p.d * IN) / 2 - mo.dia / 2, 0.0002) } : {}) };
  };
  const body = parts
    .map((p) => {
      const m = mountOf(p),
        rec = p === tubes[0] ? more.recovery || "" : "";
      return p.xml({ mount: m.mount, wall: m.wall, kids: (p.kids || "") + rec + (m.kids || "") });
    })
    .join("");
  const ov =
    (wt && wt.mass > 0
      ? `<overridemass>${wt.mass}</overridemass><overridesubcomponentsmass>true</overridesubcomponentsmass>`
      : "") +
    (wt && wt.mass > 0 && wt.cg > 0
      ? `<overridecg>${wt.cg}</overridecg><overridesubcomponentscg>true</overridesubcomponentscg>`
      : "");
  return `<stage><name>${name}</name>${more.stage || ""}${ov}<subcomponents>${body}</subcomponents></stage>`;
}
/**
 * The recovery events of a RASAero file as parachutes in the sustainer.
 * @param {Element|null} R Recovery
 * @param {string[]} notes
 * @returns {string}
 */
function cdxRecovery(R, notes) {
  if (!R) return "";
  let out = "";
  for (const i of ["1", "2"]) {
    if (cdxTxt(R, "Event" + i) !== "True") continue;
    const dia = cdxNum(R, "Size" + i) * IN,
      cd = cdxNum(R, "CD" + i),
      type = cdxTxt(R, "EventType" + i).toLowerCase(),
      dev = cdxTxt(R, "DeviceType" + i);
    if (!(dia > 0) || !/chute/i.test(dev)) {
      if (dev && !/^none$/i.test(dev))
        notes.push(`Recovery event ${i} in the file is a “${dev}”, which isn’t a parachute: it was left out.`);
      continue;
    }
    const alt = type === "altitude" ? cdxNum(R, "Altitude" + i) * FT : 0;
    out += `<parachute><name>${alt > 0 ? "Main parachute" : "Parachute at apogee"}</name><axialoffset method="top">${0.02 * (+i - 1)}</axialoffset><packedlength>0.1</packedlength><packedradius>0.02</packedradius><radialposition>0</radialposition><radialdirection>0</radialdirection><cd>${cd > 0 ? cd : 0.8}</cd><material type="surface" density="0.067">Ripstop nylon</material><deployevent>${alt > 0 ? "altitude" : "apogee"}</deployevent><deployaltitude>${alt}</deployaltitude><deploydelay>0</deploydelay><diameter>${dia}</diameter><linecount>6</linecount><linelength>${dia}</linelength><linematerial type="line" density="0.0013">Elastic cord (flat 6 mm, 1/4 in)</linematerial></parachute>`;
  }
  return out;
}
/**
 * Reads a RASAero II design.
 * @param {string} xml the .CDX1 file
 * @param {string} [name] the rocket's name (a RASAero file has none: its file name, without the ending)
 * @returns {object} the same shape as parseOrk's result, with orkXml (the design as OpenRocket XML), noseTip (the
 *   nose's blunt radius, m), blMode (the boundary layer setting the file asks for) and loaded (for each stage whose
 *   motor isn't in the motor list, its weight and CG with that motor in: {mass, cg from its front, len, motor})
 * @throws {Error} if the file isn't a readable RASAero design
 */
export function parseCdx(xml, name) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The RASAero file could not be read as XML.");
  const design = doc.getElementsByTagName("RocketDesign")[0];
  if (!design) throw new Error("No rocket design was found in this RASAero file.");
  const notes = [];
  const fin = cdxFinish(cdxTxt(design, "Surface"), notes) + CDX_MAT;
  const { sus, boost, tip } = cdxBody(design, fin, notes);
  if (!sus.some((p) => p.tube)) throw new Error("This RASAero file has no body tube.");
  // the simulation read: the one chosen when opening, else the first that flies a motor, else the first
  const sims = [...doc.getElementsByTagName("Simulation")],
    sim =
      (ORK_SIM != null && sims[ORK_SIM]) ||
      sims.find((s) => cdxEngine(cdxTxt(s, "SustainerEngine")) || cdxEngine(cdxTxt(s, "Booster1Engine"))) ||
      sims[0] ||
      null;
  const lenOf = (list) => list.reduce((a, p) => a + p.len, 0) * IN;
  const withBoost = !!(sim && boost && boost.length && cdxTxt(sim, "IncludeBooster1") === "True"),
    susEng = sim ? cdxEngine(cdxTxt(sim, "SustainerEngine")) : null,
    boostEng = withBoost ? cdxEngine(cdxTxt(sim, "Booster1Engine")) : null,
    // a boosted flight whose sustainer has no motor flies as one rocket on the booster's motor
    asOne = withBoost && !susEng,
    two = withBoost && !asOne;
  if (boost && !withBoost)
    notes.push(
      sim
        ? "The file has a booster, but this simulation flies the sustainer alone, so the booster was left off."
        : "The file has a booster but no simulation to give its weight, so the booster was left off.",
    );
  if (asOne)
    notes.push(
      "This simulation’s sustainer has no motor, so the rocket was read as a single stage flying on the booster’s motor: the stages don’t separate here.",
    );
  if (sim && cdxTxt(sim, "IncludeBooster2") === "True")
    notes.push("The simulation’s second booster wasn’t read: RASAero files hold the shape of one booster only.");
  /**
   * A stage's weight without its motor and its balance point from its own front, from the simulation's loaded
   * weight and CG (both from the nose tip): the motor, centred half its length ahead of the stage's aft end, and
   * anything flying ahead of the stage are taken out.
   */
  const dryOf = (label, W, cg, eng, x0, x1, ahead) => {
    if (!(W > 0)) {
      notes.push(
        `The simulation gives no weight for the ${label}: its parts are placeholders, so type its weight and CG in the builder.`,
      );
      return { wt: null, m: null, loaded: null };
    }
    const m = eng ? matchMotor({ ...eng, dia: 0 }) : null,
      mm = m ? m.totalMass : 0,
      a = ahead || { W: 0, mom: 0 };
    let mass = W - a.W - mm,
      cgAbs = cg > 0 ? (W * cg - a.mom - mm * (x1 - (m ? m.len : 0) / 2)) / mass : 0;
    if (!(mass > 0)) {
      notes.push(
        `The ${label}’s launch weight in the file is less than what it carries (${m ? "its motor" : "the stage above"}${m && ahead ? " and the stage above" : ""}): the launch weight was used as its weight without the motor.`,
      );
      mass = W - a.W > 0 ? W - a.W : W;
      cgAbs = cg;
    } else if (eng && !m)
      notes.push(
        `RASAero’s weight and CG for the ${label} include its motor, ${eng.designation}, which isn’t in your motor list. Until it is, the ${label}’s weight and CG without motor are worked out by taking out the motor flown here in its place. Add its motor file on the Motor tab and pick it: they are then worked out from it and kept.`,
      );
    else if (!eng) notes.push(`The simulation flies no motor in the ${label}: its weight was taken as is.`);
    if (cg > 0 && !(cgAbs > x0 && cgAbs < x1)) {
      notes.push(
        `The ${label}’s CG without its motor works out outside the ${label}, so the file’s CG was used as it is.`,
      );
      cgAbs = Math.min(Math.max(cg, x0 + 0.001), x1 - 0.001);
    }
    if (!(cg > 0)) notes.push(`The simulation gives no CG for the ${label}: it was worked out from placeholder parts.`);
    const wt = { mass, cg: cgAbs > 0 ? cgAbs - x0 : 0 };
    // (with a motor that isn't in the list, what the file gave: the builder takes the motor flown out of it)
    return { wt, m, loaded: eng && !m && W - a.W - mm > 0 ? { ...wt, len: x1 - x0, motor: eng } : null };
  };
  const susLen = lenOf(sus),
    allLen = susLen + (withBoost ? lenOf(boost) : 0);
  /**
   * A staged rocket's motor, named in its mount so the design is read as stages (as OpenRocket files have them).
   */
  const motorXml = (eng, noz) =>
    eng
      ? `<motor><type>reload</type><manufacturer>${esc(eng.mfr)}</manufacturer><designation>${esc(eng.designation)}</designation><diameter>0</diameter><length>0</length>${noz > 0 ? `<nozzleexitdiameter>${noz}</nozzleexitdiameter>` : ""}<delay>none</delay></motor>`
      : "";
  // the nozzle exit diameters the simulation gives (they set the base drag while the motor burns)
  const susNoz = sim ? cdxNum(sim, "SustainerNozzleDiameter") * IN : 0,
    boostNoz = sim ? cdxNum(sim, "Booster1NozzleDiameter") * IN : 0;
  let stages = "",
    susM = null,
    boostM = null;
  const loaded = [null, null];
  const recovery = cdxRecovery(doc.getElementsByTagName("Recovery")[0], notes);
  if (asOne) {
    const r = dryOf(
      "rocket",
      cdxNum(sim, "Booster1LaunchWt") * LB,
      cdxNum(sim, "Booster1CG") * IN,
      boostEng,
      0,
      allLen,
    );
    susM = r.m;
    loaded[0] = r.loaded;
    stages = cdxStage("Rocket", [...sus, ...boost], r.wt, r.m, { recovery });
  } else {
    const W = sim ? cdxNum(sim, "SustainerLaunchWt") * LB : 0,
      cg = sim ? cdxNum(sim, "SustainerCG") * IN : 0,
      s = dryOf(two ? "sustainer" : "rocket", W, cg, susEng, 0, susLen);
    if (!sim)
      notes.push(
        "The file has no simulation, and a RASAero design keeps its weight there: type the weight and CG in the builder.",
      );
    susM = s.m;
    loaded[0] = s.loaded;
    const sep = two ? Math.max(cdxNum(sim, "Booster1SeparationDelay"), 0) : 0,
      ign = two ? Math.max(cdxNum(sim, "SustainerIgnitionDelay"), 0) : 0;
    stages = cdxStage(two ? "Sustainer" : "Rocket", sus, s.wt, s.m, {
      recovery,
      mount: two ? `<ignitionevent>burnout</ignitionevent><ignitiondelay>${sep + ign}</ignitiondelay>` : "",
      motor: two ? motorXml(susEng, susNoz) : "",
    });
    if (two) {
      const b = dryOf(
        "booster",
        cdxNum(sim, "Booster1LaunchWt") * LB,
        cdxNum(sim, "Booster1CG") * IN,
        boostEng,
        susLen,
        allLen,
        { W, mom: W * cg },
      );
      boostM = b.m;
      loaded[1] = b.loaded;
      stages += cdxStage("Booster", boost, b.wt, b.m, {
        stage: `<separationevent>burnout</separationevent><separationdelay>${sep}</separationdelay>`,
        motor: motorXml(boostEng, boostNoz),
      });
      notes.push(
        `Staging from the RASAero simulation: the booster drops ${sep > 0 ? `${sep} s after it burns out` : "when it burns out"}, and the sustainer lights ${ign > 0 ? `${ign} s after that` : "at once"}.`,
      );
    }
  }
  const apo = sim ? cdxNum(sim, "MaxAltitude") * FT : 0;
  const orkXml = `<openrocket><rocket><name>${esc(name || "RASAero rocket")}</name><referencetype>maximum</referencetype><subcomponents>${stages}</subcomponents></rocket></openrocket>`;
  const r = parseOrk(orkXml);
  r.orkXml = orkXml;
  r.noseTip = tip;
  r.loaded = loaded;
  r.notes = [
    "RASAero keeps a rocket’s weight and CG with each simulation: they were read from the simulation, with the motor taken out, and put on the rocket as a weight and CG override. The parts themselves are the outside shape only.",
    ...notes,
    ...r.notes.filter((n) => !/^Used the stage weight/.test(n)),
  ];
  const asMotor = (eng, noz) => (eng ? { ...eng, delay: 0, ej: -1, dia: 0, nozzle: noz > 0 ? noz : 0 } : null);
  const main = asOne ? boostEng : susEng;
  r.motor = asMotor(main, asOne ? boostNoz : susNoz);
  r.boosterMotor = two ? asMotor(boostEng, boostNoz) : null;
  r.design.nozzleDia = r.motor ? r.motor.nozzle : 0;
  if (main) r.design.orkMotor = `${main.mfr} ${main.designation}`.trim();
  if (apo > 0) {
    r.design.orkApogee = apo;
    r.design.refSource = "RASAero II";
  }
  // the motor tube's size, where the motor is known
  if (susM && susM.dia > 0) r.design.mountDia = susM.dia;
  if (two && boostM && boostM.dia > 0) r.design.bMountDia = boostM.dia;
  // the launch site saved in the file
  const site = doc.getElementsByTagName("LaunchSite")[0];
  if (site) {
    const has = (t) => cdxTxt(site, t) !== "";
    if (has("Altitude")) r.launch.elev = cdxNum(site, "Altitude") * FT;
    if (cdxNum(site, "RodLength") > 0) r.launch.rail = cdxNum(site, "RodLength") * FT;
    if (has("RodAngle")) r.launch.angle = Math.abs(cdxNum(site, "RodAngle"));
    if (has("WindSpeed")) r.launch.wind = Math.abs(cdxNum(site, "WindSpeed")) * 0.44704;
    if (cdxNum(site, "WindSpeed") < 0)
      r.notes.push(
        "The file’s wind is a tailwind (a negative speed); its speed was read, and the rail’s direction is yours to set.",
      );
    if (has("Temperature")) r.launch.tempC = ((cdxNum(site, "Temperature") - 32) * 5) / 9;
    // RASAero's barometer reading is the weather report's, corrected to sea level (0: standard air). A simulation
    // chosen when opening brings it, as the pressure at the pad
    const hg = cdxNum(site, "Pressure");
    if (ORK_SIM != null) {
      r.launch.pressure =
        hg > 0 ? hg * 3386.389 * Math.pow(1 - 2.25577e-5 * Math.max(r.launch.elev || 0, 0), 5.25588) : 0;
      // RASAero has one wind speed for the whole flight, where this app's wind usually grows with height
      r.launch.windProfile = "constant";
      if (r.launch.wind > 0)
        r.notes.push(
          "RASAero flies one wind speed at every height, so Wind with height on the Range tab was set to Same at all altitudes for this run.",
        );
    }
  }
  // RASAero's skin friction: laminar flow up to a Reynolds number of 500,000 and turbulent after it, unless its All
  // Turbulent Flow box is ticked. Both are boundary layer settings of this app
  const flow = cdxTxt(design, "Turbulence");
  if (flow) {
    r.blMode = flow === "True" ? "turb" : "natural";
    r.notes.push(
      flow === "True"
        ? "RASAero’s All Turbulent Flow is on in the file: Boundary layer is set to Turbulent from the nose."
        : "RASAero’s All Turbulent Flow is off in the file, so it flies laminar flow that turns turbulent: Boundary layer was set to Natural transition, which does the same. Turbulent from the nose gives a lower, more cautious apogee.",
    );
  }
  return r;
}
