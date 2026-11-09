/*
 * The measured rockets the aerodynamic model is checked against, in one place: each one's geometry (as an OpenRocket
 * design the app reads), what was measured, how, and whether the model was tuned on it.
 *
 * role "tuned": a model constant was chosen or checked while looking at this case, so agreement here is partly by
 *   construction. role "check": never used to set anything; the honest test.
 * tier: how the reference numbers were obtained (wind tunnel, free flight, or a manufacturer's data sheet built from
 *   its own wind-tunnel tests).
 * Quantities: "cd" zero-lift drag coefficient on the reference area; "cdFins" the drag a fin set adds; "cp" center of
 *   pressure as a share of body length from the nose tip; "cna" normal-force slope per radian on the reference area.
 * Points are [Mach, value] or, for drag measured at a known Reynolds number, [Mach, value, Reynolds number on the body
 *   length]. Without one the drag is worked out in standard sea-level air.
 *
 * Used by tests/drag-benchmarks.js, validation/arcas.js and validation/accuracy.js.
 */
"use strict";
const IN = 0.0254;

/**
 * An OpenRocket design: an ogive (or conical) nose, a body tube and one set of four trapezoidal fins at the aft end (sizes in
 * inches).
 * @param {object} o {name, finish, nose, body, r, cr, ct, sw, s, t, edge, n?, shape?}
 * @returns {string} XML
 */
function finnedOrk(o) {
  const m = '<material type="bulk" density="2800">Aluminum</material>';
  return `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.9" creator="validation"><rocket><name>${o.name}</name><id>r</id>
<motorconfiguration configid="c" default="true"><stage number="0" active="true"/></motorconfiguration>
<referencetype>maximum</referencetype><subcomponents><stage><name>Stage</name><id>s</id><subcomponents>
<nosecone><name>nose</name><id>n</id><finish>${o.finish}</finish>${m}<length>${o.nose * IN}</length>
<thickness>${o.r * IN}</thickness><shape>${o.shape || "ogive"}</shape><shapeclipped>false</shapeclipped><shapeparameter>${o.shape === "conical" ? 0 : 1}</shapeparameter>
<aftradius>${o.r * IN}</aftradius><aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength>
<aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped></nosecone>
<bodytube><name>body</name><id>b</id><finish>${o.finish}</finish>${m}<length>${o.body * IN}</length>
<thickness>${o.r * IN}</thickness><radius>${o.r * IN}</radius><subcomponents>
<trapezoidfinset><name>fins</name><id>f</id><axialoffset method="bottom">0</axialoffset><finish>${o.finish}</finish>${m}
<fincount>${o.n || 4}</fincount><rotation>0</rotation><thickness>${o.t * IN}</thickness><crosssection>${o.edge}</crosssection>
<cant>0</cant><rootchord>${o.cr * IN}</rootchord><tipchord>${o.ct * IN}</tipchord><sweeplength>${o.sw * IN}</sweeplength>
<height>${o.s * IN}</height></trapezoidfinset></subcomponents></bodytube></subcomponents></stage></subcomponents>
</rocket></openrocket>`;
}

/**
 * The Arcas sounding rocket as NASA tested it (TN D-4013/4014): a 9.375 in ogive-like nose (fitted to the reports'
 * coordinates: ogive, shape parameter 0.75), a 2.25 in body, four trapezoidal fins and a conical boattail.
 * @param {number} tubeLen body tube length, in
 * @param {number} finOffset fins' leading edge from the tube's front, in
 * @returns {string} XML
 */
function arcasOrk(tubeLen, finOffset) {
  return `<?xml version="1.0" encoding="utf-8"?>
<openrocket version="1.9" creator="Pocket Rocket Flight Lab validation"><rocket><name>Arcas</name><subcomponents><stage><name>Stage</name><subcomponents>
<nosecone><name>Nose</name><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><length>${9.375 * IN}</length><thickness>0.002</thickness><shape>ogive</shape><shapeclipped>false</shapeclipped><shapeparameter>0.75</shapeparameter><aftradius>${1.125 * IN}</aftradius><aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength><aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped></nosecone>
<bodytube><name>Body</name><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><length>${tubeLen * IN}</length><thickness>0.002</thickness><radius>${1.125 * IN}</radius><subcomponents>
<trapezoidfinset><name>Fins</name><axialoffset method="top">${finOffset * IN}</axialoffset><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><fincount>4</fincount><rotation>0</rotation><thickness>${0.12 * IN}</thickness><crosssection>airfoil</crosssection><cant>0</cant><tabheight>0</tabheight><tablength>0</tablength><tabposition relativeto="front">0</tabposition><rootchord>${3.38 * IN}</rootchord><tipchord>${2.165 * IN}</tipchord><sweeplength>${1.214 * IN}</sweeplength><height>${2.103 * IN}</height></trapezoidfinset>
</subcomponents></bodytube>
<transition><name>Boattail</name><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><length>${1.46 * IN}</length><thickness>0.002</thickness><shape>conical</shape><shapeclipped>false</shapeclipped><shapeparameter>0</shapeparameter><foreradius>${1.125 * IN}</foreradius><aftradius>${0.735 * IN}</aftradius><foreshoulderradius>0</foreshoulderradius><foreshoulderlength>0</foreshoulderlength><foreshoulderthickness>0</foreshoulderthickness><foreshouldercapped>false</foreshouldercapped><aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength><aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped></transition>
</subcomponents></stage></subcomponents></rocket></openrocket>`;
}

/* NACA RM A53D02 (James & Carros, 1953): free-flight total drag of a fin-stabilized body of fineness ratio 10 (tangent
   ogive nose, four trapezoidal fins swept 72° with 4% sections), figure 11 and table I. Coefficients on the body's
   cross-section; Reynolds number on the model length. */
const A53 = {
  name: "RM A53D02",
  finish: "polished",
  nose: 1.0,
  body: 1.5,
  r: 0.125,
  cr: 0.75,
  ct: 0.375,
  sw: 0.375,
  s: 0.125,
  t: 0.04 * 0.5625, // 4% of the mean chord (the sections taper in thickness to keep 4%)
  edge: "airfoil",
};
// [Mach, measured Cd, Reynolds number on the model length]
const A53_PTS = [
  [0.598, 0.36, 0.86e6],
  [0.901, 0.365, 1.28e6],
  [1.06, 0.535, 1.54e6],
  [1.32, 0.515, 1.9e6],
  [1.48, 0.475, 2.1e6],
  [1.58, 0.45, 2.3e6],
  [1.95, 0.45, 2.9e6],
  [2.09, 0.425, 3.2e6],
  [2.3, 0.39, 3.5e6],
  [2.56, 0.38, 3.8e6],
  [2.91, 0.325, 4.3e6],
  [3.29, 0.3, 4.9e6],
  [3.99, 0.24, 6.6e6],
  [4.57, 0.2, 7.5e6],
];

/* NACA RM E50D28 (1950): the RM-10 missile in the Lewis 8- by 6-foot tunnel, Mach 1.49 to 1.98. The drag its four
   60°-swept fins (10% circular-arc sections, taper ratio 1, root chord 8.75 in at the base) add to the body (figure 8(d)
   minus figure 6), less the fins' measured base-pressure increase (figure 9), on the body's maximum cross-section. The
   body is modeled as a 6 in ogive and cylinder of the same length: only the fins' increment is compared. Reynolds
   number 4.5 million per foot. */
const RM10 = (fins) => ({
  name: "RM-10",
  finish: "smooth",
  nose: 45,
  body: 28.25,
  r: 3,
  cr: fins ? 8.75 : 0.01,
  ct: fins ? 8.75 : 0.01,
  sw: fins ? 9.07 : 0,
  s: fins ? 9.07 / Math.tan((60 * Math.PI) / 180) : 0.001,
  t: fins ? 0.875 : 0.0001,
  edge: "airfoil",
});
// [Mach, fin increment: body + 4 fins minus body alone, less the fins' base-pressure increase]
const RM10_PTS = [
  [1.49, 0.255 - 0.157 - 0.007],
  [1.59, 0.255 - 0.155 - 0.005],
  [1.78, 0.255 - 0.151 - 0.006],
  [1.98, 0.255 - 0.149 - 0.004],
];

/* Arcas: measured CP, % of body length from the nose tip, from NASA TN D-4013 (1967), figures 11 and 12 (Mach 0.6–0.9,
   short and long models) and TN D-4014 (1967), figure 7 (short model, Mach 1.5–4.6). */
const ARCAS = {
  short: {
    xml: arcasOrk(30.115, 27.925),
    cp: {
      0.6: 75,
      0.7: 73.5,
      0.8: 72,
      0.85: 71,
      0.9: 71.5,
      1.5: 78,
      2: 74.5,
      2.5: 70.5,
      3: 67,
      3.5: 63.8,
      4: 61,
      4.6: 57.5,
    },
  },
  long: { xml: arcasOrk(42.665, 40.475), cp: { 0.6: 76.5, 0.7: 75.7, 0.8: 75.5, 0.85: 75.8, 0.9: 75.8 } },
};

/* Aerobee 150A sounding rocket, sustainer (the vehicle without its booster), Aerojet-General / Space-General.
   Geometry (in): 87.8 tangent-ogive nose, 15 diameter, 201.2 body (288.97 from the nose to the base, as both sources
   give), four fins at the base: root chord 38.96, tip 28, span 16.13, leading edge swept back 16.13, 1.1 thick, the
   leading edge beveled and the trailing edge blunt. The fin dimensions are the open-aerospace project's reconstruction
   (github.com/open-aerospace/aerobee-150, its RASAero model); the app's "beveled" section bevels both edges, so it gives
   these fins a little less trailing-edge drag than they have.
   The reference numbers are the manufacturer's: Vought Astronautics Report AST/E1R-13319 (Baber, 1961), "Performance
   Summary for the Aerobee 150A", figure 22, which cites Aerojet's wind-tunnel tests of the Aerobee 150A (Thomas,
   Aerojet Report 1784, 1960); the same curves are in Pressly et al., "Sounding Rockets", NASA TM X-55123 (1965),
   appendix A, figures 1 and 3. Reference area 1.228 ft² (15 in diameter). Drag and CP points are the open-aerospace
   project's digitization of Pressly's figures; the lift-curve slope was read from the Vought figure here (stage 2,
   per degree, read to about ±0.01). The sustainer's nozzle exit area is 0.297 ft² (Pressly, trajectory inputs). */
const AEROBEE = {
  name: "Aerobee 150A sustainer",
  finish: "smooth",
  nose: 87.8,
  body: 201.2,
  r: 7.5,
  cr: 38.96,
  ct: 28,
  sw: 16.13,
  s: 16.13,
  t: 1.1,
  edge: "beveled",
};
const AEROBEE_LEN = 288.97;
const AEROBEE_NOZZLE_DIA = Math.sqrt((4 * 0.297) / Math.PI) * 0.3048; // m, from the exit area
// Cd thrusting (from Mach 0.1; the curve below Mach 2 is the sustainer flying on its own motor)
const AEROBEE_CD_ON = [
  [0.1, 0.3374],
  [0.3, 0.337],
  [0.5, 0.3401],
  [0.7, 0.3474],
  [0.8, 0.3553],
  [0.9, 0.3722],
  [1.0, 0.4763],
  [1.1, 0.5385],
  [1.2, 0.5375],
  [1.3, 0.527],
  [1.5, 0.4894],
  [1.7, 0.4507],
  [2.0, 0.3987],
  [2.5, 0.3334],
  [3.0, 0.2911],
  [3.5, 0.2599],
  [4.0, 0.2367],
  [4.5, 0.2177],
  [5.0, 0.2025],
];
// Cd coasting (drawn from Mach 2)
const AEROBEE_CD_OFF = [
  [2.0, 0.4324],
  [2.5, 0.3652],
  [3.0, 0.3172],
  [3.5, 0.2829],
  [4.0, 0.2554],
  [4.5, 0.2332],
  [5.0, 0.214],
];
// CP, inches from the nose tip
const AEROBEE_CP_IN = [
  [0.1, 233.88],
  [0.3, 232.71],
  [0.5, 231.66],
  [0.7, 231.47],
  [0.8, 229.9],
  [0.9, 229.79],
  [1.0, 232.63],
  [1.1, 236.83],
  [1.2, 240.5],
  [1.4, 244.06],
  [1.6, 243.52],
  [2.0, 239.82],
  [2.5, 233.57],
  [3.0, 227.2],
  [3.5, 221.49],
  [4.0, 217.06],
  [4.5, 213.16],
  [5.0, 209.87],
];
// lift-curve slope, per degree (Vought figure 22, stage 2)
const AEROBEE_CNA_DEG = [
  [0.1, 0.3],
  [0.5, 0.295],
  [0.9, 0.287],
  [1.2, 0.34],
  [1.45, 0.401],
  [1.6, 0.383],
  [1.8, 0.352],
  [2.0, 0.32],
  [2.5, 0.263],
  [3.0, 0.237],
  [4.0, 0.206],
  [5.0, 0.184],
];

/* NACA RM L55G28a (Rumsey, 1955): free-flight drag of a fin-stabilized cone-cylinder, two rocket-propelled models
   flown by NACA Langley. Figure 1(a): a 10° (total angle) cone 40 in long on a 7.0 in body, 150 in overall
   (fineness 21.4); four fins at the base, root chord 18 in, tip chord 9 in, leading edge swept back 8 in over a 9 in
   span, the trailing edge 1 in ahead of the base at the tip; steel, 0.2 in (model 1) or 0.3 in (model 2) thick at the
   root tapering to 0.1 in, wedge leading edges, square trailing edges. Drag coefficients from figure 5 (coasting,
   radar and telemeter data: model 1 Mach 2.5–2.9, model 2 Mach 3.55–3.9), on the body's cross-section; Reynolds
   numbers on the body length from figure 2 (model-alone coasting lines). The figure was read off the scan to about
   ±0.003 in Cd. */
const L55 = {
  name: "RM L55G28a",
  finish: "smooth",
  shape: "conical",
  nose: 40,
  body: 110,
  r: 3.5,
  cr: 18,
  ct: 9,
  sw: 8,
  s: 9,
  t: 0.175, // the two models' mean thickness
  edge: "beveled",
};
// [Mach, Cd, Reynolds number on the body length]
const L55_PTS = [
  [2.48, 0.389, 121e6],
  [2.54, 0.384, 130e6],
  [2.63, 0.378, 149e6],
  [2.73, 0.372, 169e6],
  [2.82, 0.368, 188e6],
  [2.92, 0.362, 208e6],
  [3.55, 0.275, 85e6],
  [3.67, 0.273, 110e6],
  [3.76, 0.273, 141e6],
  [3.86, 0.276, 176e6],
];

/** Every case, for validation/accuracy.js. */
const CASES = [
  {
    id: "a53d02-cd",
    title: "NACA RM A53D02, fineness-10 body with 72° fins: total drag",
    tier: "free flight",
    role: "tuned",
    quantity: "cd",
    xml: finnedOrk(A53),
    pts: A53_PTS,
  },
  {
    id: "rm10-fins",
    title: "NACA RM E50D28, RM-10: drag of its 60° fins",
    tier: "wind tunnel",
    role: "tuned",
    quantity: "cdFins",
    xml: finnedOrk(RM10(true)),
    xmlBody: finnedOrk(RM10(false)),
    rePerM: 4.5e6 / 0.3048,
    pts: RM10_PTS,
  },
  {
    id: "arcas-short-cp",
    title: "NASA TN D-4013/4014, Arcas short model: CP",
    tier: "wind tunnel",
    role: "tuned",
    quantity: "cp",
    xml: ARCAS.short.xml,
    pts: Object.entries(ARCAS.short.cp).map(([M, v]) => [+M, v / 100]),
  },
  {
    id: "arcas-long-cp",
    title: "NASA TN D-4013, Arcas long model: CP",
    tier: "wind tunnel",
    role: "tuned",
    quantity: "cp",
    xml: ARCAS.long.xml,
    pts: Object.entries(ARCAS.long.cp).map(([M, v]) => [+M, v / 100]),
  },
  {
    id: "l55g28a-cd",
    title: "NACA RM L55G28a, fin-stabilized cone-cylinder: total drag",
    tier: "free flight",
    role: "check",
    quantity: "cd",
    xml: finnedOrk(L55),
    pts: L55_PTS,
  },
  {
    id: "aerobee-cd-on",
    title: "Aerobee 150A sustainer: drag while thrusting",
    tier: "manufacturer (from wind-tunnel tests)",
    role: "check",
    quantity: "cd",
    xml: finnedOrk(AEROBEE),
    nozzleDia: AEROBEE_NOZZLE_DIA,
    pts: AEROBEE_CD_ON,
  },
  {
    id: "aerobee-cd-off",
    title: "Aerobee 150A sustainer: drag coasting",
    tier: "manufacturer (from wind-tunnel tests)",
    role: "check",
    quantity: "cd",
    xml: finnedOrk(AEROBEE),
    pts: AEROBEE_CD_OFF,
  },
  {
    id: "aerobee-cp",
    title: "Aerobee 150A sustainer: CP",
    tier: "manufacturer (from wind-tunnel tests)",
    role: "check",
    quantity: "cp",
    xml: finnedOrk(AEROBEE),
    pts: AEROBEE_CP_IN.map(([M, x]) => [M, x / AEROBEE_LEN]),
  },
  {
    id: "aerobee-cna",
    title: "Aerobee 150A sustainer: normal-force slope",
    tier: "manufacturer (from wind-tunnel tests)",
    role: "check",
    quantity: "cna",
    xml: finnedOrk(AEROBEE),
    pts: AEROBEE_CNA_DEG.map(([M, v]) => [M, (v * 180) / Math.PI]),
  },
];

/* ---------- measured flights (apogee) ----------
   Rockets flown with a recording altimeter or optical tracking, as RASAero II's author published them in RASAero
   design files (rasaero.com): geometry, launch weight and CG, launch site, motor, the measured apogee and RASAero II's
   prediction. All sizes in inches, weights in lb, temperatures in °F, site altitude and apogees in ft, as in the files.
   The motors' thrust curves are RASAero's own (validation/flight-motors.eng). RASAero "hexagonal" fins (flat with
   beveled leading and trailing edges) fly as the app's beveled section; its "rounded" as rounded. */
const LB = 0.45359237,
  FT = 0.3048;
// the Cal Poly Pomona ARO-414 and USAF Test Pilot School course rockets share one airframe
const CALISP = {
  nose: 11.25,
  dia: 3.1,
  body: 48,
  rail: { d: 0.375, h: 0.3438 },
  fins: { n: 4, cr: 8.5, ct: 0.75, s: 3.5, sw: 7.18, t: 0.125, loc: 9.5, edge: "beveled" },
  noz: 0.63,
};
const FLIGHTS = [
  ...[
    ["USAF TPS 2004, Team 1", "I205", 3.25, 2302, 78, 3837, 3948],
    ["USAF TPS 2004, Team 2", "I205", 3.4, 2302, 76, 3710, 3876],
    ["USAF TPS 2004, Team 3", "I205", 3.41, 2302, 77, 3964, 3876],
    ["Cal Poly Pomona 2005, Team Columbia", "I285", 3.36, 2848, 62, 5085, 4847],
    ["Cal Poly Pomona 2005, Team Discovery", "I285", 3.55, 2848, 64, 4930, 4836],
  ].map(([title, motor, w, site, tF, meas, ras]) => ({
    title,
    ...CALISP,
    motor,
    w,
    cg: 40,
    site,
    tF,
    rod: 10,
    angle: 3,
    meas,
    ras,
    how: "barometric altimeter (AltAcc)",
  })),
  {
    title: "LOC/Precision EZI-65, LDRS-26",
    nose: 13,
    dia: 4,
    body: 72,
    rail: { d: 0.625, h: 0.469 },
    fins: { n: 3, cr: 7, ct: 4.5, s: 4.75, sw: 1.25, t: 0.25, loc: 7, edge: "rounded" },
    noz: 0,
    motor: "J450ST",
    w: 10.06,
    cg: 59,
    site: 2750,
    tF: 70,
    rod: 10,
    angle: 0,
    meas: 3965,
    ras: 4214,
    how: "barometric altimeter",
  },
  {
    title: "Kline-Rogers L500 rocket, USXRL-89",
    nose: 10,
    dia: 2.26,
    body: 52,
    rail: null,
    fins: { n: 3, cr: 11, ct: 0, s: 5, sw: 9.798, t: 0.125, loc: 12, edge: "beveled" },
    noz: 1,
    motor: "L500",
    w: 8.5,
    cg: 42.6,
    site: 2848,
    tF: 80,
    rod: 8,
    angle: 0,
    meas: 24771,
    ras: 26509,
    how: "optical tracking",
  },
];

/**
 * A measured flight's rocket as an OpenRocket design: tangent ogive nose, body tube, one fin set (RASAero's fin
 * location is from the base to the root leading edge) and two rail buttons, with the stage's mass and CG set so the
 * loaded rocket matches the file's launch weight and CG (the motor's own mass and CG are taken off).
 * @param {object} f one of FLIGHTS
 * @param {{totalMass:number, len:number}} motor the motor (kg, m)
 * @returns {string} XML
 */
function flightOrk(f, motor) {
  const r = (f.dia / 2) * IN,
    len = (f.nose + f.body) * IN,
    W = f.w * LB,
    dry = W - motor.totalMass,
    xm = len - motor.len / 2, // motor flush with the base
    cgDry = (W * f.cg * IN - motor.totalMass * xm) / dry,
    F = f.fins,
    m = '<material type="bulk" density="1000">Fiberglass</material>',
    rail = f.rail
      ? `<railbutton><name>buttons</name><axialoffset method="bottom">${-0.05}</axialoffset><outerdiameter>${f.rail.d * IN}</outerdiameter><innerdiameter>${0.6 * f.rail.d * IN}</innerdiameter><height>${f.rail.h * IN}</height><instancecount>2</instancecount><instanceseparation>${0.5 * f.body * IN}</instanceseparation></railbutton>`
      : "";
  return `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.9" creator="validation"><rocket><name>${f.title}</name>
<motorconfiguration configid="c" default="true"><stage number="0" active="true"/></motorconfiguration>
<referencetype>maximum</referencetype><subcomponents><stage><name>Stage</name>
<overridemass>${dry}</overridemass><overridesubcomponentsmass>true</overridesubcomponentsmass>
<overridecg>${cgDry}</overridecg><overridesubcomponentscg>true</overridesubcomponentscg><subcomponents>
<nosecone><name>nose</name><finish>polished</finish>${m}<length>${f.nose * IN}</length><thickness>0.002</thickness>
<shape>ogive</shape><shapeclipped>false</shapeclipped><shapeparameter>1</shapeparameter><aftradius>${r}</aftradius>
<aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength><aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped></nosecone>
<bodytube><name>body</name><finish>polished</finish>${m}<length>${f.body * IN}</length><thickness>0.002</thickness>
<radius>${r}</radius><motormount><ignitionevent>automatic</ignitionevent><ignitiondelay>0</ignitiondelay><overhang>0</overhang></motormount><subcomponents>
<trapezoidfinset><name>fins</name><axialoffset method="bottom">${-(F.loc - F.cr) * IN}</axialoffset><finish>polished</finish>${m}
<fincount>${F.n}</fincount><rotation>0</rotation><thickness>${F.t * IN}</thickness><crosssection>${F.edge}</crosssection>
<cant>0</cant><rootchord>${F.cr * IN}</rootchord><tipchord>${F.ct * IN}</tipchord><sweeplength>${F.sw * IN}</sweeplength>
<height>${F.s * IN}</height></trapezoidfinset>${rail}</subcomponents></bodytube></subcomponents></stage></subcomponents>
</rocket></openrocket>`;
}

module.exports = { IN, LB, FT, finnedOrk, arcasOrk, flightOrk, A53, A53_PTS, RM10, RM10_PTS, ARCAS, CASES, FLIGHTS };
