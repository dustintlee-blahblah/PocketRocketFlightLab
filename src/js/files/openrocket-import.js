/**
 * OpenRocket .ork import: reading the file's rocket into this app's design.
 *
 * parseOrk is the whole of it, in order: which flight of the design is read (ork-config.js: the motor configuration
 * chosen on the Motor tab, else the one the file's simulation flew, else the default); every part of every stage, read
 * once (ork-parts.js: a reader for each kind of part, adding up weight and balance and collecting the body's shape,
 * fins, recovery, launch lugs and motor mounts by stage); the airframes that fly, for one, two or three stages
 * (ork-airframe.js); and the design's fields, recovery and extra motors (ork-design.js). The XML helpers they share
 * are ork-xml.js.
 */
import { orkAirframe, orkStaging } from "./ork-airframe.js";
import { orkConfig, orkLaunch, orkRefSim } from "./ork-config.js";
import { orkBooster, orkFirstStage, orkMotorExtras, orkRecovery, orkSustainer } from "./ork-design.js";
import { orkReading, orkReadStages } from "./ork-parts.js";
import { elKid } from "./ork-xml.js";
/**
 * Turns each reversed ("flipped") nose cone in an OpenRocket design into the transition it is: a tail cone from the
 * nose's base radius down to a point, its shoulder at the front.
 * @param {Document} doc the design, changed in place
 */
export function unflipNoses(doc) {
  for (const nc of [...doc.getElementsByTagName("nosecone")]) {
    const fl = [...nc.children].find((e) => e.tagName === "isflipped");
    if (!fl || fl.textContent.trim() !== "true") continue;
    const tr = doc.createElement("transition");
    for (const e of [...nc.children]) {
      const t = e.tagName;
      if (t === "isflipped") continue;
      const ne = doc.createElement(t === "aftradius" ? "foreradius" : t.replace(/^aftshoulder/, "foreshoulder"));
      for (const a of e.attributes) ne.setAttribute(a.name, a.value);
      while (e.firstChild) ne.appendChild(e.firstChild);
      tr.appendChild(ne);
      if (t === "thickness" && /filled/i.test(ne.textContent)) {
        const f = doc.createElement("filled");
        f.textContent = "true";
        tr.appendChild(f);
      }
    }
    const ar = doc.createElement("aftradius");
    ar.textContent = "0";
    tr.appendChild(ar);
    nc.replaceWith(tr);
  }
}
/**
 * Reads an OpenRocket design.
 * @param {string} xml the design XML
 * @param {{offIds:string[]}} [opts] offIds: the ids of stages switched off (the builder passes them, since its own
 *   file numbers only its stages)
 * @returns {{design:object, launch:object, notes:string[], motor:object, boosterMotor:object, firstMotor:object,
 *   motorExtras:object[], boosterExtras:object[], firstExtras:object[], src:object}} the design, launch site and
 *   conditions, notes on what was simplified, each stage's main motor (designation, maker, delay...) and extra
 *   motors, and where the parts are in the file (for saving changes back into it)
 * @throws {Error} if the file isn't a readable rocket design
 */
export function parseOrk(xml, opts = {}) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The design file could not be read as XML.");
  unflipNoses(doc);
  const rocket = doc.querySelector("openrocket > rocket") || doc.getElementsByTagName("rocket")[0];
  if (!rocket) throw new Error("No rocket was found in this file.");
  const notes = [];
  const { simEls, refSim, cfg, offStages } = orkConfig(doc, rocket, opts);
  // every part of every stage, read once (ork-parts.js)
  const rd = orkReading(rocket, cfg, offStages, notes);
  orkReadStages(rd);
  const SRC = {};
  const { twoStage, threeStage } = orkStaging(rd);
  const {
    pods,
    sideBoosters,
    tubeFinSets,
    fins,
    bodyEls,
    sKnown,
    sMass,
    sX0,
    sMotor,
    sMotors,
    sSep,
    sMount,
    stages,
    nose,
    cdCount,
    cdCovered,
    cdComp,
  } = rd;
  const all = [...Array(Math.max(stages, 1)).keys()];
  const S = orkAirframe(rd, twoStage ? [0] : all, twoStage ? "Sustainer" : "");
  const B = twoStage ? orkAirframe(rd, [1], "Booster") : null;
  const C1 = threeStage ? orkAirframe(rd, [2], "First stage") : null;
  // the main motor: the sustainer's when flown as stages, else the first motor found
  const motor = twoStage ? sMotor[0] || null : rd.motor;
  if (!nose) notes.push("No nose cone was found; a 3:1 ogive was assumed.");
  if (cdCount)
    notes.push(
      `Used the file’s Cd override on ${cdCount} part${cdCount > 1 ? "s" : ""}; it replaces the calculated drag of ${cdCount > 1 ? "those parts" : "that part"}${cdCovered ? ", and of the parts on it where the override covers them" : ""}. On the last body part that includes the base drag behind it.`,
    );
  if (cdComp) notes.push("Cd overrides on inner parts were ignored, since inner parts have no drag of their own.");
  const nd = orkSustainer(rd, S, twoStage, motor);
  if (twoStage) orkBooster(rd, nd, B, SRC);
  {
    const sd = (x) => (!x ? 0 : x.event === "upperignition" ? 1e6 : Math.max(0, x.delay || 0));
    nd.sepDelay = twoStage ? sd(sSep[1]) : 0;
    nd.sep1Delay = threeStage ? sd(sSep[2]) : 0;
  }
  // whether the weight is the builder's own number (a stage or rocket weight override) rather than added up from the parts
  nd.massKnown =
    !!elKid(rocket, "overridemass") ||
    (stages > 0 && [...Array(stages).keys()].every((i) => sKnown[i] || !(sMass[i] > 0)));
  nd.threeStage = threeStage;
  nd.s1 = null;
  nd.midDelay = 0;
  if (threeStage) orkFirstStage(rd, nd, C1, SRC);
  orkRecovery(rd, nd, S, SRC, twoStage, motor);
  // simulations: reference apogee + launch conditions
  const sim = orkRefSim(refSim);
  const newL = orkLaunch(refSim);
  if (sim) {
    nd.orkApogee = parseFloat(sim.getElementsByTagName("flightdata")[0].getAttribute("maxaltitude"));
  }
  const { motorExtras, boosterExtras, firstExtras } = orkMotorExtras(rd, nd, twoStage, threeStage);
  if (pods.length)
    notes.push(
      `Pods: ${pods.length === 1 ? "the pod adds its" : "each pod adds its"} weight, lift and drag, once for every copy.`,
    );
  if (tubeFinSets.length)
    notes.push("Tube fins are modeled as OpenRocket models them (lift, and drag inside and out).");
  if (sideBoosters.length)
    notes.push(
      twoStage
        ? "This rocket has stages, so its side boosters stay on for the whole flight here."
        : "The side boosters drop away at their separation event; their own descent isn’t flown.",
    );
  const smo = twoStage ? sMotor[0] : motor;
  Object.assign(SRC, {
    cfg,
    stages,
    sX0: sX0.slice(),
    fins: fins.map((f) => ({ oi: f.oi, x: f.x, root: f.root, si: f.si })),
    fMain: S.f.oi,
    bfMain: B ? B.f.oi : null,
    nose: nose ? nose.oi : null,
    body: bodyEls,
    motor: smo && smo.oi != null ? smo.oi : null,
    bmotor: twoStage && sMotor[1] ? sMotor[1].oi : null,
    b1motor: threeStage && sMotor[2] ? sMotor[2].oi : null,
    mount: sMount[0] ?? null,
    bmount: twoStage ? (sMount[1] ?? null) : null,
    sim: refSim ? simEls.indexOf(refSim) : -1,
    clusters: sMotors.map((l) => (l || []).length),
  });
  return {
    design: nd,
    launch: newL,
    notes,
    motor,
    boosterMotor: twoStage ? sMotor[1] || null : null,
    firstMotor: threeStage ? sMotor[2] || null : null,
    motorExtras,
    boosterExtras,
    firstExtras,
    src: SRC,
  };
}
