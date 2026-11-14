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
<fincount>${o.n || 4}</fincount><rotation>0</rotation><thickness>${o.t * IN}</thickness><crosssection>${o.edge}</crosssection>${o.te ? `<prfltrailingedge>${o.te}</prfltrailingedge>` : ""}
<cant>0</cant><rootchord>${o.cr * IN}</rootchord><tipchord>${o.ct * IN}</tipchord><sweeplength>${o.sw * IN}</sweeplength>
<height>${o.s * IN}</height></trapezoidfinset></subcomponents></bodytube></subcomponents></stage></subcomponents>
</rocket></openrocket>`;
}

/**
 * An OpenRocket design built from a list of body parts (sizes in inches): a nose, then tubes ("tube": len, d) and
 * conical transitions ("tail": len, d0, d1), any of which can carry a set of trapezoidal fins
 * ({n, cr, ct, s, sw, t, edge, le?, te?, aft}: aft is the root trailing edge's distance ahead of the part's aft end).
 * No masses: for drag and CP only.
 * @param {object} o {name, finish, nose: {len, shape, param?}, parts}
 * @returns {string} XML
 */
function partsOrk(o) {
  const m = '<material type="bulk" density="2800">Aluminum</material>',
    fin = `<finish>${o.finish}</finish>${m}`,
    sh0 =
      "<aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength><aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped>",
    fins = (F) =>
      F
        ? `<subcomponents><trapezoidfinset><name>fins</name><axialoffset method="bottom">${-(F.aft || 0) * IN}</axialoffset>${fin}<fincount>${F.n || 4}</fincount><rotation>0</rotation><thickness>${F.t * IN}</thickness><crosssection>${F.edge}</crosssection><cant>0</cant>${F.le > 0 || F.te > 0 ? `<prflbevelle>${(F.le || 0) * IN}</prflbevelle><prflbevelte>${(F.te || 0) * IN}</prflbevelte>` : ""}<rootchord>${F.cr * IN}</rootchord><tipchord>${F.ct * IN}</tipchord><sweeplength>${F.sw * IN}</sweeplength><height>${F.s * IN}</height></trapezoidfinset></subcomponents>`
        : "",
    part = (p, i) =>
      p.t === "tail"
        ? `<transition><name>t${i}</name>${fin}<length>${p.len * IN}</length><thickness>0.002</thickness><shape>conical</shape><shapeclipped>false</shapeclipped><shapeparameter>0</shapeparameter><foreradius>${(p.d0 / 2) * IN}</foreradius><aftradius>${(p.d1 / 2) * IN}</aftradius><foreshoulderradius>0</foreshoulderradius><foreshoulderlength>0</foreshoulderlength><foreshoulderthickness>0</foreshoulderthickness><foreshouldercapped>false</foreshouldercapped>${sh0}${fins(p.fins)}</transition>`
        : `<bodytube><name>b${i}</name>${fin}<length>${p.len * IN}</length><thickness>0.002</thickness><radius>${(p.d / 2) * IN}</radius>${fins(p.fins)}</bodytube>`;
  const d0 = o.parts[0].d ?? o.parts[0].d0;
  return `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.9" creator="validation"><rocket><name>${o.name}</name>
<motorconfiguration configid="c" default="true"><stage number="0" active="true"/></motorconfiguration>
<referencetype>maximum</referencetype><subcomponents><stage><name>Stage</name><subcomponents>
<nosecone><name>nose</name>${fin}<length>${o.nose.len * IN}</length><thickness>0.002</thickness><shape>${o.nose.shape}</shape><shapeclipped>false</shapeclipped><shapeparameter>${o.nose.param ?? 1}</shapeparameter><aftradius>${(d0 / 2) * IN}</aftradius>${sh0}</nosecone>
${o.parts.map(part).join("\n")}
</subcomponents></stage></subcomponents></rocket></openrocket>`;
}

/**
 * The Arcas sounding rocket as NASA tested it (TN D-4013/4014): a 9.375 in ogive-like nose (fitted to the reports'
 * coordinates: ogive, shape parameter 0.75), a 2.25 in body, four trapezoidal fins and a conical boattail.
 * @param {number} tubeLen body tube length, in
 * @param {number} finOffset fins' leading edge from the tube's front, in
 * @param {boolean} [fins] false for the body alone (the fins shrunk to nothing: a design needs a fin set)
 * @returns {string} XML
 */
function arcasOrk(tubeLen, finOffset, fins = true) {
  return `<?xml version="1.0" encoding="utf-8"?>
<openrocket version="1.9" creator="Pocket Rocket Flight Lab validation"><rocket><name>Arcas</name><subcomponents><stage><name>Stage</name><subcomponents>
<nosecone><name>Nose</name><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><length>${9.375 * IN}</length><thickness>0.002</thickness><shape>ogive</shape><shapeclipped>false</shapeclipped><shapeparameter>0.75</shapeparameter><aftradius>${1.125 * IN}</aftradius><aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength><aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped></nosecone>
<bodytube><name>Body</name><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><length>${tubeLen * IN}</length><thickness>0.002</thickness><radius>${1.125 * IN}</radius><subcomponents>
<trapezoidfinset><name>Fins</name><axialoffset method="top">${finOffset * IN}</axialoffset><finish>smooth</finish><material type="bulk" density="2700">Aluminum</material><fincount>4</fincount><rotation>0</rotation><thickness>${(fins ? 0.12 : 0.0001) * IN}</thickness><crosssection>airfoil</crosssection><cant>0</cant><tabheight>0</tabheight><tablength>0</tablength><tabposition relativeto="front">0</tabposition><rootchord>${(fins ? 3.38 : 0.01) * IN}</rootchord><tipchord>${(fins ? 2.165 : 0.01) * IN}</tipchord><sweeplength>${(fins ? 1.214 : 0) * IN}</sweeplength><height>${(fins ? 2.103 : 0.001) * IN}</height></trapezoidfinset>
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
   60°-swept fins (circular-arc sections 10% thick normal to the leading edge, as NACA Report 1160 gives them, so 5%
   along the flow; taper ratio 1, root chord 8.75 in at the base) add to the body (figure 8(d)
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
  t: fins ? 0.4375 : 0.0001,
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

/* Arcas short model: axial force at zero angle of attack, fins undeflected, NASA TN D-4013 figure 11 (Mach 0.6–1.2,
   3 million per foot, the model 40.95 in long). The report gives the force with the base at free-stream pressure
   (C_A,corr) and the base's own share (C_A,b) separately; a boattail ends the body at 0.65 of its diameter. The base
   reads above free-stream pressure below Mach 0.95 (a negative base drag, with a sting in the wake). The model's
   fin anchors, small lugs at the fin roots, are not in the design.
   [Mach, C_A,corr, C_A,b] */
const ARCAS_CA = [
  [0.6, 0.299, -0.039],
  [0.7, 0.309, -0.048],
  [0.8, 0.329, -0.045],
  [0.85, 0.356, -0.035],
  [0.9, 0.415, -0.019],
  [0.95, 0.593, -0.011],
  [1.0, 0.686, 0.014],
  [1.05, 0.686, 0.024],
  [1.1, 0.664, 0.03],
  [1.2, 0.593, 0.041],
];
const ARCAS_RE = (3e6 * 40.95) / 12;
/* The same model from Mach 1.5 to 4.63: NASA TN D-4014 figure 5, the axial force at zero angle of attack with the fins
   off (a) and on, undeflected (b), read off the plots (about ±0.005). The report did not correct these to free-stream
   pressure at the base, so they are the whole drag; 3 million per foot, with grit strips behind the nose tip and the
   fins' leading edges to make the boundary layer turbulent. The fins (figure 1(b): double wedges of 2.72° half-angle,
   0.150 in thick at the root and 0.096 at the tip) sit on the 15° boattail, and each carries a strip of No. 60 grit
   (about 0.01 in high) on both faces, so what they add includes the grit's own drag, perhaps 0.03 at Mach 1.5, and
   their effect on the boattail. The app's fin drag is low by 0.065 at Mach 1.5 and 0.03 at Mach 1.8 here and
   was left alone: the two fin sets it was built on (TR R-100 figure 5, the RM-10) have no grit and no boattail.
   [Mach, C_A fins on, C_A fins off] */
const ARCAS_CA_SUP = [
  [1.5, 0.535, 0.349],
  [1.8, 0.47, 0.337],
  [2.3, 0.382, 0.293],
  [2.96, 0.305, 0.241],
  [3.96, 0.234, 0.186],
  [4.63, 0.202, 0.157],
];

/* Aerobee 150A sounding rocket, sustainer (the vehicle without its booster), Aerojet-General / Space-General.
   Geometry (in): 87.8 tangent-ogive nose, 15 diameter, 201.2 body (288.97 from the nose to the base, as both sources
   give), four fins at the base: root chord 38.96, tip 28, span 16.13, leading edge swept back 16.13, 1.1 thick, the
   leading edge beveled and the trailing edge blunt. The fin dimensions are the open-aerospace project's reconstruction
   (github.com/open-aerospace/aerobee-150, its RASAero model). NASA's description of the vehicle (NTRS 19660005621, "Each
   is a modified single wedge of magnesium skin and spars") gives no thickness at the trailing edge, and the app has no
   single-wedge section, so the fins stay entered as beveled at both edges. Entered with a square trailing edge of
   the full 1.1 in (te: "square") the drag is 19% high thrusting and 11% coasting, against 6% and 5% as they are:
   this case can't check the trailing-edge term, and RM L55G28a below, whose report gives its fins' edges, does.
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
  te: "square", // wedge leading edges, square trailing edges
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

/* NASA TR R-100 (Stoney, 1961), appendix: total drag of rocket-boosted free-flight models with conical boattails ending
   at the base, the only measured cases here that have one. Geometry from each data sheet's sketch and table
   (inches); the drag and Reynolds number curves read off its plot (about ±0.006 in Cd). Both models' fins have a
   flat-sided section with wedge edges and straddle the start of the boattail.
   Configuration 11: 5 in diameter, 56 in long, fineness-3.5 ogive nose, an 8° boattail 5.7 in long to 0.67 of the
     diameter (base area 0.45 of the maximum), four 60°-swept delta fins. Mach 1.1 to 2.07.
   Configuration 36: 5 in diameter, 75 in long, a 22.5 in nose (a curved tip to 0.78 of the diameter in 13.5 in, then
     a conical frustum; flown as a power-series nose of exponent 0.45, which passes within 0.03 of the diameter of
     the sketch's profile), a 4.02° boattail 10 in long to 0.72 of the diameter (base area 0.52), three untapered
     45°-swept fins of 9 in chord. Mach 0.88 to 1.7. */
const R100_11 = {
  title: "TR R-100 configuration 11",
  finish: "polished",
  nose: { shape: "ogive", len: 17.5 },
  parts: [
    {
      t: "tube",
      len: 32.8,
      d: 5,
      fins: {
        n: 4,
        cr: 10.5,
        ct: 0.375,
        s: 5.5,
        sw: 10.125,
        t: 0.128,
        loc: 7.83,
        edge: "beveled",
        le: 0.75,
        te: 0.375,
      },
    },
    { t: "tail", len: 5.7, d0: 5, d1: 3.354 },
  ],
  rail: null,
  w: 50,
  cg: 28,
};
const R100_36 = {
  title: "TR R-100 configuration 36",
  finish: "polished",
  nose: { shape: "power", len: 22.5, param: 0.45 },
  parts: [
    {
      t: "tube",
      len: 42.5,
      d: 5,
      fins: { n: 3, cr: 9, ct: 9, s: 9, sw: 9, t: 0.25, loc: 4, edge: "beveled", le: 3, te: 3 },
    },
    { t: "tail", len: 10, d0: 5, d1: 3.606 },
  ],
  rail: null,
  w: 50,
  cg: 37,
};
// [Mach, Cd on the maximum cross-section, Reynolds number on the body length]
const R100_11_PTS = [
  [1.1, 0.4],
  [1.2, 0.386],
  [1.3, 0.36],
  [1.4, 0.332],
  [1.5, 0.315],
  [1.6, 0.3],
  [1.7, 0.288],
  [1.8, 0.28],
  [1.9, 0.272],
  [2.0, 0.265],
].map(([M, cd]) => [M, cd, 17e6 + (M - 0.95) * 37.4e6]);
const R100_36_PTS = [
  [0.9, 0.241],
  [0.95, 0.243],
  [1.05, 0.35],
  [1.1, 0.363],
  [1.2, 0.367],
  [1.3, 0.358],
  [1.4, 0.344],
  [1.5, 0.33],
  [1.6, 0.316],
  [1.7, 0.303],
].map(([M, cd]) => [M, cd, 17.7e6 + (M - 0.8) * 50.6e6]);
const NO_MOTOR = { totalMass: 0, len: 0 };
/* TR R-100 figure 5: the pressure (wave) drag of the report's fin types A and B, the 45°-swept untapered fins of
   configuration 36 (2.8% thick, flat-sided with wedge edges), measured on special gun-launched and rocket models with
   cylindrical bodies: nothing below Mach 0.97, a brief peak at Mach 1, then a level 0.0037 on the fins' exposed planform
   area from Mach 1.05 to 3. Here on configuration 36's three fins (12.4 times the body's cross-section), as the
   difference in pressure drag between that body with its fins and with token ones. */
const R100_36_BARE = {
  ...R100_36,
  parts: R100_36.parts.map((p) =>
    p.fins ? { ...p, fins: { n: 3, cr: 0.3, ct: 0.3, s: 0.2, sw: 0, t: 0.02, loc: 1, edge: "square" } } : p,
  ),
};
/* Conical boattails behind a cylinder: the pressure (wave) drag on the boattail's own surface, on the body's
   cross-section, from wind-tunnel pressure measurements at Mach 2.5 and 3.5 (Rubin, Brazzel and Henderson, The Effects
   of Jet Plume and Boattail Geometry on Base and Afterbody Pressures of a Body of Revolution at Mach Numbers of 2.0 to
   3.5, US Army Missile Command RD-TR-70-5, 1970, read off MIL-HDBK-762 figure 5-144, about ±0.004). Four boattails,
   named by length and base diameter over the body's diameter; the forebody (not given in the handbook) is taken as
   a fineness-3 ogive and six diameters of cylinder, and the same body without the boattail is taken off.
   [length/d, base d/d, [Mach, drag]...] */
const BT144 = [
  [0.818, 0.818, [2.5, 0.027], [3.5, 0.016]],
  [0.818, 0.727, [2.5, 0.045], [3.5, 0.029]],
  [1.2, 0.818, [2.5, 0.02], [3.5, 0.014]],
  [1.2, 0.727, [2.5, 0.038], [3.5, 0.026]],
];
const bt144 = (len, ratio) => ({
  title: "boattail",
  finish: "polished",
  nose: { shape: "ogive", len: 15 },
  parts: [
    {
      t: "tube",
      len: 30,
      d: 5,
      fins: { n: 3, cr: 0.3, ct: 0.3, s: 0.2, sw: 0, t: 0.02, loc: 1, edge: "square" },
    },
    ratio < 1 ? { t: "tail", len: 5 * len, d0: 5, d1: 5 * ratio } : { t: "tube", len: 5 * len, d: 5 },
  ],
  rail: null,
  w: 50,
  cg: 28,
});
const R100_FIN_A_PTS = [0.9, 1.1, 1.2, 1.3, 1.5, 1.7, 2.0, 2.5, 3.0].map((M) => [
  M,
  M < 1 ? 0 : (0.0037 * 3 * 9 * 9) / (Math.PI * 2.5 * 2.5),
]);

/* NACA RM L56G24 (Gillespie, 1956): a rocket-powered free-flight model of a ballistic missile flown from Wallops
   Island, Mach 1.6 to 2.8. Figure 2 and table I: a 25 in nose (close to a tangent ogive, with a 0.17 in tip radius) on a
   7.00 in body 118.25 in long, the aft end a 2° (half-angle) boattail to 5.00 in at the base, so 28.64 in long. Four
   60° delta fins on the boattail, the horizontal pair's root chord 9.02 in with its trailing edge 9.05 in ahead of the
   base, tip chord 0.392 in, 16.15 in tip to tip (the exposed span here is taken from the body's radius at the fin's
   mid-root, 2.97 in, giving 5.1 in: 24.0 in² a fin against the report's 0.18 ft², 25.9 in²). Sections: flat plates 4%
   thick (here 0.24 in, 4% of the mean chord) with a 5°51' leading-edge bevel and an 8° trailing-edge bevel (bevel
   lengths 1.17 and 0.85 in). Not modeled: the two accelerometer fairings near the CG (0.88 in high, 14.5 in long), the
   nose probe, and the vertical fins' trailing-edge extension (0.47 in).
   Drag (figure 8, on the 7 in body's area), coasting: Mach 1.7–2.08, the line the report extrapolated to zero lift
   from its drag polars; Mach 2.6–2.8, the second coast's measured points (at α ≈ 0 with sideslip up to about 7°, which
   in the first coast added about 0.007). Reynolds numbers from figure 6(a), on the body length (9.85 ft). Read to about
   ±0.004; the report gives ±0.015 for its axial force.
   CP from figure 15 (dCm/dCN at zero angle of attack, in body diameters, about a CG at 54.4 in), first coast. */
const L56 = {
  name: "RM L56G24",
  finish: "smooth",
  nose: { len: 25, shape: "ogive" },
  parts: [
    { t: "tube", len: 64.61, d: 7 },
    {
      t: "tail",
      len: 28.64,
      d0: 7,
      d1: 5,
      fins: { n: 4, cr: 9.02, ct: 0.392, s: 5.1, sw: 8.83, t: 0.24, edge: "beveled", le: 1.17, te: 0.85, aft: 9.05 },
    },
  ],
};
const L56_LEN = 9.854; // ft
// [Mach, Cd, Reynolds number on the body length]
const L56_CD = [
  [1.7, 0.358, 9.5e6 * L56_LEN],
  [1.8, 0.351, 11.0e6 * L56_LEN],
  [1.9, 0.343, 12.2e6 * L56_LEN],
  [2.0, 0.335, 13.2e6 * L56_LEN],
  [2.08, 0.329, 14.0e6 * L56_LEN],
  [2.6, 0.302, 8.2e6 * L56_LEN],
  [2.7, 0.293, 9.2e6 * L56_LEN],
  [2.8, 0.284, 10.2e6 * L56_LEN],
];
// [Mach, dCm/dCN in diameters about the CG at 54.4 in] → CP as a share of the 118.25 in length
const L56_CP = [
  [1.71, -3.0],
  [1.75, -2.9],
  [1.9, -2.75],
  [2.01, -2.42],
  [2.08, -2.14],
].map(([M, s]) => [M, (54.4 - 7 * s) / 118.25]);

/* NASA TM-2005-213541 (Allen, 2005): a slender missile in the Langley 8-Foot Transonic Pressure Tunnel and Unitary
   Plan Wind Tunnel, Mach 0.6 to 3.95, 1.5 million per foot, boundary layer tripped near the nose and the fins'
   leading edges. Configuration 3 (small nose, no strakes, four tail fins), from figures 6 and 9: a 6.293 in nose
   (taken as a tangent ogive) on a 2.694 in body 7.41 in long, a 3.875 in cone out to 3.150 in, 23.579 in at 3.150 in,
   then a 1.371 in boattail to 3.040 in at the base (42.528 in overall). Fins: root chord 1.992 in from 39.165 in, tip
   chord 1.213 in, span 1.953 in, trailing edge unswept and ending where the boattail starts, 0.110 in thick, hexagonal
   section (the root's bevels 0.78 and 0.58 in; here 0.63 and 0.47, scaled to the mean chord).
   The numbers are from the report's digital data (NTRS 20050165156, the CD-ROM's ASCII tables): roll angle 0, fins
   undeflected, runs 1412, 1392, 1372, 655, 666, 677 and 251, the points within ±2.1° of zero (as the app's ±2°
   balance; wider spans pick up the body's nonlinear lift). CNα is the slope of the
   normal force over those points (per radian, on the 3.15 in body's area), the CP is the moment reference (23.387 in)
   less dCm/dCN in diameters, and the axial force is at zero angle of attack. The axial force has the base pressure
   taken out (the report corrects it to free-stream pressure in the base), so it is compared with the app's drag
   without its base drag. */
const ALLEN = {
  name: "TM-2005-213541 configuration 3",
  finish: "polished",
  nose: { len: 6.293, shape: "ogive" },
  parts: [
    { t: "tube", len: 7.41, d: 2.694 },
    { t: "tail", len: 3.875, d0: 2.694, d1: 3.15 },
    {
      t: "tube",
      len: 23.579,
      d: 3.15,
      fins: { n: 4, cr: 1.992, ct: 1.213, s: 1.953, sw: 0.779, t: 0.11, edge: "beveled", le: 0.63, te: 0.47, aft: 0 },
    },
    { t: "tail", len: 1.371, d0: 3.15, d1: 3.04 },
  ],
};
const ALLEN_RE = 1.5e6 * (42.528 / 12); // on the body length
// [Mach, CA at zero angle of attack without base, CP share of length, CNα per radian]
const ALLEN_PTS = [
  [0.6, 0.1687, 30.63, 6.25],
  [0.9, 0.1747, 31.04, 6.57],
  [1.19, 0.2967, 33.21, 8.43],
  [1.7, 0.3009, 28.52, 6.13],
  [2.36, 0.2621, 24.17, 5.16],
  [2.86, 0.2293, 22.41, 4.83],
  [3.95, 0.1854, 20.09, 4.66],
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
    id: "arcas-short-cd",
    title: "NASA TN D-4013, Arcas short model (boattailed): total drag",
    tier: "wind tunnel",
    role: "check",
    quantity: "cd",
    xml: ARCAS.short.xml,
    pts: ARCAS_CA.map(([M, corr, b]) => [M, corr + b, ARCAS_RE]),
  },
  {
    id: "arcas-short-cd-sup",
    title: "NASA TN D-4014, Arcas short model, Mach 1.5–4.63: total drag",
    tier: "wind tunnel",
    role: "check",
    quantity: "cd",
    xml: ARCAS.short.xml,
    pts: ARCAS_CA_SUP.map(([M, on]) => [M, on, ARCAS_RE]),
  },
  {
    id: "arcas-short-body-sup",
    title: "NASA TN D-4014, Arcas short model without fins, Mach 1.5–4.63: total drag",
    tier: "wind tunnel",
    role: "check",
    quantity: "cd",
    xml: arcasOrk(30.115, 27.925, false),
    pts: ARCAS_CA_SUP.map(([M, , off]) => [M, off, ARCAS_RE]),
  },
  {
    id: "arcas-short-fins-sup",
    title: "NASA TN D-4014, Arcas short model, Mach 1.5–4.63: drag its four fins add",
    tier: "wind tunnel",
    role: "check",
    quantity: "cdFins",
    xml: ARCAS.short.xml,
    xmlBody: arcasOrk(30.115, 27.925, false),
    rePerM: 3e6 / 0.3048,
    pts: ARCAS_CA_SUP.map(([M, on, off]) => [M, on - off]),
  },
  {
    id: "r100-11-cd",
    title: "NASA TR R-100 configuration 11, ogive body with an 8° boattail: total drag",
    tier: "free flight",
    role: "check",
    quantity: "cd",
    get xml() {
      return flightOrk(R100_11, NO_MOTOR);
    },
    pts: R100_11_PTS,
  },
  {
    id: "r100-36-cd",
    title: "NASA TR R-100 configuration 36, body with a 4° boattail: total drag",
    tier: "free flight",
    role: "check",
    quantity: "cd",
    get xml() {
      return flightOrk(R100_36, NO_MOTOR);
    },
    pts: R100_36_PTS,
  },
  {
    id: "boattail-1",
    title: "MIL-HDBK-762 figure 5-144, 6.4° boattail to 0.82 of the diameter: its pressure drag",
    tier: "wind tunnel",
    role: "tuned",
    quantity: "cdAftPressure",
    get xml() {
      return flightOrk(bt144(BT144[0][0], BT144[0][1]), NO_MOTOR);
    },
    get xmlBody() {
      return flightOrk(bt144(BT144[0][0], 1), NO_MOTOR);
    },
    pts: BT144[0].slice(2),
  },
  {
    id: "boattail-2",
    title: "MIL-HDBK-762 figure 5-144, 9.5° boattail to 0.73 of the diameter: its pressure drag",
    tier: "wind tunnel",
    role: "tuned",
    quantity: "cdAftPressure",
    get xml() {
      return flightOrk(bt144(BT144[1][0], BT144[1][1]), NO_MOTOR);
    },
    get xmlBody() {
      return flightOrk(bt144(BT144[1][0], 1), NO_MOTOR);
    },
    pts: BT144[1].slice(2),
  },
  {
    id: "boattail-3",
    title: "MIL-HDBK-762 figure 5-144, 4.3° boattail to 0.82 of the diameter: its pressure drag",
    tier: "wind tunnel",
    role: "tuned",
    quantity: "cdAftPressure",
    get xml() {
      return flightOrk(bt144(BT144[2][0], BT144[2][1]), NO_MOTOR);
    },
    get xmlBody() {
      return flightOrk(bt144(BT144[2][0], 1), NO_MOTOR);
    },
    pts: BT144[2].slice(2),
  },
  {
    id: "boattail-4",
    title: "MIL-HDBK-762 figure 5-144, 6.5° boattail to 0.73 of the diameter: its pressure drag",
    tier: "wind tunnel",
    role: "tuned",
    quantity: "cdAftPressure",
    get xml() {
      return flightOrk(bt144(BT144[3][0], BT144[3][1]), NO_MOTOR);
    },
    get xmlBody() {
      return flightOrk(bt144(BT144[3][0], 1), NO_MOTOR);
    },
    pts: BT144[3].slice(2),
  },
  {
    id: "r100-fin-a",
    title: "NASA TR R-100 figure 5, 45° untapered fins 2.8% thick: fin pressure drag",
    tier: "free flight",
    role: "check",
    quantity: "cdFinsPressure",
    get xml() {
      return flightOrk(R100_36, NO_MOTOR);
    },
    get xmlBody() {
      return flightOrk(R100_36_BARE, NO_MOTOR);
    },
    pts: R100_FIN_A_PTS,
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
    id: "aerobee-cd-jet",
    title: "Aerobee 150A sustainer: drag coasting less drag thrusting (what the exhaust removes)",
    tier: "manufacturer (from wind-tunnel tests)",
    role: "check",
    quantity: "cdJet",
    xml: finnedOrk(AEROBEE),
    nozzleDia: AEROBEE_NOZZLE_DIA,
    // the two curves above, where both are drawn (Mach 2 to 5)
    pts: AEROBEE_CD_OFF.map(([M, off]) => [M, off - AEROBEE_CD_ON.find((q) => q[0] === M)[1]]),
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
  {
    id: "l56g24-cd",
    title: "NACA RM L56G24, fineness-16.9 missile with 60° delta fins: drag coasting",
    tier: "free flight",
    role: "check",
    quantity: "cd",
    xml: partsOrk(L56),
    design: { noseTip: 0.17 * IN },
    pts: L56_CD,
  },
  {
    id: "l56g24-cp",
    title: "NACA RM L56G24, fineness-16.9 missile with 60° delta fins: CP",
    tier: "free flight",
    role: "check",
    quantity: "cp",
    xml: partsOrk(L56),
    design: { noseTip: 0.17 * IN },
    pts: L56_CP,
  },
  {
    id: "tm2005-cdfore",
    title: "NASA TM-2005-213541, configuration 3: drag without the base",
    tier: "wind tunnel",
    role: "check",
    quantity: "cdFore",
    xml: partsOrk(ALLEN),
    pts: ALLEN_PTS.map(([M, ca]) => [M, ca, ALLEN_RE]),
  },
  {
    id: "tm2005-cp",
    title: "NASA TM-2005-213541, configuration 3: CP",
    tier: "wind tunnel",
    role: "check",
    quantity: "cp",
    xml: partsOrk(ALLEN),
    pts: ALLEN_PTS.map(([M, , x]) => [M, x / 42.528]),
  },
  {
    id: "tm2005-cna",
    title: "NASA TM-2005-213541, configuration 3: normal-force slope",
    tier: "wind tunnel",
    role: "check",
    quantity: "cna",
    xml: partsOrk(ALLEN),
    pts: ALLEN_PTS.map(([M, , , c]) => [M, c]),
  },
];

/* ---------- measured flights (apogee) ----------
   Rockets whose apogee was measured (barometric altimeters, GPS, integrated accelerometers or optical tracking), as
   RASAero II's author published them in the example design files that come with RASAero II (rasaero.com). Each entry
   is copied from one file: geometry, launch weight and CG, launch site, rail, wind, motor, RASAero II's prediction, and
   the measured apogee from the file's notes (where two instruments are given, the file's own average or final value).
   The files themselves aren't in this repository. Sizes in inches, weights in lb, temperatures in °F, wind in mph, site
   altitude and apogees in ft, as in the files.
   Parts after the nose, front to back: "tube" (a body tube, with its fins if it has them; RASAero's fin location is
   from the tube's aft end to the root leading edge) and "tail" (a conical transition: a fin can's shoulder or a
   boattail). RASAero "hexagonal" fins (flat with beveled leading and trailing edges) fly as the app's beveled section;
   their bevel lengths (le, te: RASAero's FX1 and FX3) go in as the app's bevel lengths.
   The motors' thrust curves are RASAero's own (validation/flight-motors.eng). */
const LB = 0.45359237,
  FT = 0.3048,
  MPH = 0.44704;
const FLIGHTS = [
  {
    title: "Blister",
    file: "Blister.CDX1",
    nose: {
      len: 13.0,
      shape: "ogive",
      tip: 0.125,
    },
    parts: [
      {
        t: "tube",
        len: 68.625,
        d: 3.0,
      },
      {
        t: "tail",
        len: 0.75,
        d0: 3.0,
        d1: 3.125,
      },
      {
        t: "tube",
        len: 12.25,
        d: 3.125,
        fins: {
          n: 3,
          cr: 12.25,
          ct: 3.0,
          s: 4.5,
          sw: 7.0,
          t: 0.2,
          loc: 12.375,
          edge: "rounded",
        },
      },
    ],
    rail: {
      d: 0.375,
      h: 0.5,
    },
    finish: "polished",
    noz: 1.3125,
    motor: "K1075GG",
    mfr: "AMW",
    w: 17.81,
    cg: 55.25,
    site: 2400.0,
    tF: 80.0,
    rod: 10.0,
    angle: 0.0,
    wind: 8.0,
    meas: 9026,
    how: "barometric altimeter",
    ras: 8301.0,
  },
  {
    title: "Gary Byrum, LDRS-26",
    file: "Byrum.CDX1",
    nose: {
      len: 13.0,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 71.75,
        d: 3.0,
        fins: {
          n: 3,
          cr: 11.75,
          ct: 1.875,
          s: 3.1875,
          sw: 7.875,
          t: 0.25,
          loc: 13.0,
          edge: "square",
        },
      },
    ],
    rail: {
      d: 0.375,
      h: 0.3438,
    },
    finish: "polished",
    noz: 0.0,
    motor: "J570W",
    mfr: "AT",
    w: 7.75,
    cg: 56.0,
    site: 2750.0,
    tF: 100.0,
    rod: 10.0,
    angle: 0.0,
    wind: 0.0,
    meas: 5732,
    how: "barometric altimeter",
    ras: 5281.0,
  },
  {
    title: "USAF TPS 2004, Team 3",
    file: "CalIsp1.CDX1",
    nose: {
      len: 11.25,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 48.0,
        d: 3.1,
        fins: {
          n: 4,
          cr: 8.5,
          ct: 0.75,
          s: 3.5,
          sw: 7.18,
          t: 0.125,
          loc: 9.5,
          edge: "beveled",
          le: 0.4375,
          te: 0.25,
        },
      },
    ],
    rail: {
      d: 0.375,
      h: 0.3438,
    },
    finish: "polished",
    noz: 0.63,
    motor: "I205",
    mfr: "CTI",
    w: 3.41,
    cg: 40.0,
    site: 2302.0,
    tF: 77.0,
    rod: 10.0,
    angle: 3.0,
    wind: 0.0,
    meas: 3964,
    how: "barometric altimeter",
    ras: 3876.0,
  },
  {
    title: "USAF TPS 2004, Team 1",
    file: "CalIsp2.CDX1",
    nose: {
      len: 11.25,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 48.0,
        d: 3.1,
        fins: {
          n: 4,
          cr: 8.5,
          ct: 0.75,
          s: 3.5,
          sw: 7.18,
          t: 0.125,
          loc: 9.5,
          edge: "beveled",
          le: 0.4375,
          te: 0.25,
        },
      },
    ],
    rail: {
      d: 0.375,
      h: 0.3438,
    },
    finish: "polished",
    noz: 0.63,
    motor: "I205",
    mfr: "CTI",
    w: 3.25,
    cg: 40.0,
    site: 2302.0,
    tF: 78.0,
    rod: 10.0,
    angle: 3.0,
    wind: 0.0,
    meas: 3837,
    how: "barometric altimeter",
    ras: 3948.0,
  },
  {
    title: "USAF TPS 2004, Team 2",
    file: "CalIsp3.CDX1",
    nose: {
      len: 11.25,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 48.0,
        d: 3.1,
        fins: {
          n: 4,
          cr: 8.5,
          ct: 0.75,
          s: 3.5,
          sw: 7.18,
          t: 0.125,
          loc: 9.5,
          edge: "beveled",
          le: 0.4375,
          te: 0.25,
        },
      },
    ],
    rail: {
      d: 0.375,
      h: 0.3438,
    },
    finish: "polished",
    noz: 0.63,
    motor: "I205",
    mfr: "CTI",
    w: 3.4,
    cg: 40.0,
    site: 2302.0,
    tF: 76.0,
    rod: 10.0,
    angle: 3.0,
    wind: 0.0,
    meas: 3710,
    how: "barometric altimeter",
    ras: 3876.0,
  },
  {
    title: "Cal Poly Pomona 2005, Team Columbia",
    file: "CalIsp4.CDX1",
    nose: {
      len: 11.25,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 48.0,
        d: 3.1,
        fins: {
          n: 4,
          cr: 8.5,
          ct: 0.75,
          s: 3.5,
          sw: 7.18,
          t: 0.125,
          loc: 9.5,
          edge: "beveled",
          le: 0.4375,
          te: 0.25,
        },
      },
    ],
    rail: {
      d: 0.375,
      h: 0.3438,
    },
    finish: "polished",
    noz: 0.63,
    motor: "I285",
    mfr: "CTI",
    w: 3.36,
    cg: 40.0,
    site: 2848.0,
    tF: 62.0,
    rod: 10.0,
    angle: 3.0,
    wind: 0.0,
    meas: 5085,
    how: "barometric altimeter",
    ras: 4847.0,
  },
  {
    title: "Cal Poly Pomona 2005, Team Discovery",
    file: "CalIsp5.CDX1",
    nose: {
      len: 11.25,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 48.0,
        d: 3.1,
        fins: {
          n: 4,
          cr: 8.5,
          ct: 0.75,
          s: 3.5,
          sw: 7.18,
          t: 0.125,
          loc: 9.5,
          edge: "beveled",
          le: 0.4375,
          te: 0.25,
        },
      },
    ],
    rail: {
      d: 0.375,
      h: 0.3438,
    },
    finish: "polished",
    noz: 0.63,
    motor: "I285",
    mfr: "CTI",
    w: 3.55,
    cg: 40.0,
    site: 2848.0,
    tF: 64.0,
    rod: 10.0,
    angle: 3.0,
    wind: 0.0,
    meas: 4930,
    how: "barometric altimeter",
    ras: 4836.0,
  },
  {
    title: "Cancer Descending, LDRS-26",
    file: "CancerDescending.CDX1",
    nose: {
      len: 24.0,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 85.0,
        d: 6.0,
        fins: {
          n: 3,
          cr: 19.0,
          ct: 5.5,
          s: 9.0,
          sw: 16.0,
          t: 0.375,
          loc: 21.0,
          edge: "rounded",
        },
      },
    ],
    rail: {
      d: 0.5,
      h: 0.5,
    },
    finish: "polished",
    noz: 0.0,
    motor: "M1297W",
    mfr: "AT",
    w: 49.84,
    cg: 74.0,
    site: 2750.0,
    tF: 100.0,
    rod: 10.0,
    angle: 0.0,
    wind: 0.0,
    meas: 6188,
    how: "average of two barometric altimeters",
    ras: 6328.0,
  },
  {
    title: "Don't Debate This (N5800 minimum diameter)",
    file: "DontDebateThisN5800MinDia.CDX1",
    nose: {
      len: 18.0,
      shape: "conical",
      tip: 0.05,
    },
    parts: [
      {
        t: "tube",
        len: 67.25,
        d: 3.9173,
      },
      {
        t: "tail",
        len: 0.5,
        d0: 3.9173,
        d1: 4.15,
      },
      {
        t: "tube",
        len: 12.5,
        d: 4.15,
        fins: {
          n: 3,
          cr: 12.0,
          ct: 2.25,
          s: 4.0,
          sw: 10.3,
          t: 0.189,
          loc: 12.25,
          edge: "beveled",
          le: 1.0,
          te: 1.0,
        },
      },
    ],
    rail: null,
    finish: "smooth",
    noz: 2.488,
    motor: "N5800-CS",
    mfr: "CTI",
    w: 48.19,
    cg: 64.69,
    site: 3750.0,
    tF: 80.0,
    rod: 10.0,
    angle: 2.0,
    wind: 5.0,
    meas: 56573,
    how: "average of two barometric altimeters",
    ras: 61982.0,
  },
  {
    title: "LOC/Precision EZI-65, LDRS-26",
    file: "EZI65-1.CDX1",
    nose: {
      len: 13.0,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 72.0,
        d: 4.0,
        fins: {
          n: 3,
          cr: 7.0,
          ct: 4.5,
          s: 4.75,
          sw: 1.25,
          t: 0.25,
          loc: 7.0,
          edge: "rounded",
        },
      },
    ],
    rail: {
      d: 0.625,
      h: 0.469,
    },
    finish: "polished",
    noz: 0.0,
    motor: "J450ST",
    mfr: "AMW",
    w: 10.06,
    cg: 59.0,
    site: 2750.0,
    // its RASAero II file says 70 °F; the other six LDRS-26 flights, from the same site, all say 100 °F, so that is
    // taken as the day's temperature here too
    tF: 100.0,
    rod: 10.0,
    angle: 0.0,
    wind: 0.0,
    meas: 3965,
    how: "barometric altimeter",
    ras: 4214.0,
  },
  {
    title: "Full Metal Jacket, BALLS 005",
    file: "Full Metal Jacket1.CDX1",
    nose: {
      len: 16.0,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 101.8125,
        d: 4.0,
      },
      {
        t: "tail",
        len: 0.2415,
        d0: 4.0,
        d1: 4.25,
      },
      {
        t: "tube",
        len: 14.2585,
        d: 4.25,
        fins: {
          n: 3,
          cr: 12.5,
          ct: 4.0,
          s: 4.4,
          sw: 8.5,
          t: 0.125,
          loc: 13.5,
          edge: "beveled",
          le: 0.25,
          te: 0.125,
        },
      },
    ],
    rail: null,
    finish: "polished",
    noz: 2.5,
    motor: "O10000",
    mfr: "Hist",
    w: 70.0,
    cg: 86.0,
    site: 3933.0,
    tF: 80.0,
    rod: 12.0,
    angle: 0.0,
    wind: 0.0,
    meas: 37981,
    how: "optical tracking",
    ras: 38772.0,
  },
  {
    title: "Full Metal Jacket, Black Rock 6",
    file: "Full Metal Jacket2.CDX1",
    nose: {
      len: 5.75,
      shape: "conical",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 103.3125,
        d: 4.0,
      },
      {
        t: "tail",
        len: 0.2415,
        d0: 4.0,
        d1: 4.25,
      },
      {
        t: "tube",
        len: 14.2585,
        d: 4.25,
        fins: {
          n: 3,
          cr: 12.5,
          ct: 4.0,
          s: 4.4,
          sw: 8.5,
          t: 0.125,
          loc: 13.5,
          edge: "beveled",
          le: 0.25,
          te: 0.125,
        },
      },
    ],
    rail: null,
    finish: "polished",
    noz: 2.5,
    motor: "O10000",
    mfr: "Hist",
    w: 65.0,
    cg: 85.0,
    site: 3933.0,
    tF: 80.0,
    rod: 12.0,
    angle: 0.0,
    wind: 0.0,
    meas: 30038,
    how: "optical tracking",
    ras: 32548.0,
  },
  {
    title: "Gibb, LDRS-26",
    file: "Gibb.CDX1",
    nose: {
      len: 13.0,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 57.75,
        d: 3.0,
        fins: {
          n: 4,
          cr: 5.5625,
          ct: 2.375,
          s: 3.75,
          sw: 3.0,
          t: 0.093,
          loc: 8.75,
          edge: "rounded",
        },
      },
    ],
    rail: null,
    finish: "polished",
    noz: 0.0,
    motor: "I284W",
    mfr: "AT",
    w: 6.16,
    cg: 50.5,
    site: 2750.0,
    tF: 100.0,
    rod: 10.0,
    angle: 0.0,
    wind: 0.0,
    meas: 3913,
    how: "barometric altimeter",
    ras: 4205.0,
  },
  {
    title: "Ion Drive, LDRS-26",
    file: "IonDrive.CDX1",
    nose: {
      len: 19.0,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 49.5,
        d: 4.0,
        fins: {
          n: 3,
          cr: 9.5,
          ct: 2.0625,
          s: 4.375,
          sw: 7.0,
          t: 0.093,
          loc: 12.25,
          edge: "beveled",
          le: 0.75,
          te: 0.5,
        },
      },
      {
        t: "tail",
        len: 1.5,
        d0: 4.0,
        d1: 2.5,
      },
    ],
    rail: {
      d: 0.375,
      h: 0.3438,
    },
    finish: "polished",
    noz: 0.0,
    motor: "K550W",
    mfr: "AT",
    w: 11.37,
    cg: 39.5,
    site: 2750.0,
    tF: 100.0,
    rod: 10.0,
    angle: 0.0,
    wind: 0.0,
    meas: 8027,
    how: "average of two barometric altimeters",
    ras: 8642.0,
  },
  {
    title: "Kinsel A-601 (P4935)",
    file: "Kinsel_P4935_A-601_Rocket.CDX1",
    nose: {
      len: 35.0,
      shape: "ogive",
      tip: 0.03,
    },
    parts: [
      {
        t: "tube",
        len: 114.0,
        d: 6.125,
      },
      {
        t: "tail",
        len: 0.5,
        d0: 6.125,
        d1: 6.5,
      },
      {
        t: "tube",
        len: 19.5,
        d: 6.5,
        fins: {
          n: 4,
          cr: 17.0,
          ct: 6.0,
          s: 7.0,
          sw: 9.5,
          t: 0.25,
          loc: 20.0,
          edge: "beveled",
          le: 0.125,
          te: 0.125,
        },
      },
    ],
    rail: {
      d: 0.75,
      h: 0.75,
    },
    finish: "smooth",
    noz: 3.09,
    motor: "P4935",
    mfr: "LR-EX",
    w: 154.46,
    cg: 113.2,
    site: 3933.0,
    tF: 80.0,
    rod: 14.0,
    angle: 0.0,
    wind: 0.0,
    meas: 42771,
    how: "GPS",
    ras: 41098.0,
  },
  {
    title: "Kline-Rogers L500 rocket, USXRL-89",
    file: "L500Roc.CDX1",
    nose: {
      len: 10.0,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 52.0,
        d: 2.26,
        fins: {
          n: 3,
          cr: 11.0,
          ct: 0.0,
          s: 5.0,
          sw: 9.798,
          t: 0.125,
          loc: 12.0,
          edge: "beveled",
          le: 0.66,
          te: 0.3,
        },
      },
    ],
    rail: null,
    finish: "polished",
    noz: 1.0,
    motor: "L500",
    mfr: "Hist",
    w: 8.5,
    cg: 42.6,
    site: 2848.0,
    tF: 80.0,
    rod: 8.0,
    angle: 0.0,
    wind: 0.0,
    meas: 24771,
    how: "optical tracking",
    ras: 26509.0,
  },
  {
    title: "Proteus 6 (P9381)",
    file: "Proteus6.CDX1",
    nose: {
      len: 28.5,
      shape: "conical",
      tip: 0.25,
    },
    parts: [
      {
        t: "tube",
        len: 141.5,
        d: 6.0,
        fins: {
          n: 3,
          cr: 10.1,
          ct: 3.05,
          s: 9.0,
          sw: 7.05,
          t: 0.1875,
          loc: 14.0,
          edge: "beveled",
          le: 2.0,
          te: 1.0,
        },
      },
      {
        t: "tail",
        len: 1.0,
        d0: 6.0,
        d1: 5.0,
      },
    ],
    rail: {
      d: 1.5,
      h: 0.7,
    },
    finish: "polished",
    noz: 4.8,
    motor: "P9381",
    mfr: "LR-EX",
    w: 186.7,
    cg: 111.0,
    site: 3933.0,
    tF: 80.0,
    rod: 18.0,
    angle: 2.0,
    wind: 0.0,
    meas: 85067,
    how: "integrated accelerometers",
    ras: 81499.0,
  },
  {
    title: "Qu8k (Q18000)",
    file: "Qu8k.CDX1",
    nose: {
      len: 42.0,
      shape: "conical",
      tip: 0.0125,
    },
    parts: [
      {
        t: "tube",
        len: 100.0,
        d: 8.0,
      },
      {
        t: "tail",
        len: 0.75,
        d0: 8.0,
        d1: 8.375,
      },
      {
        t: "tube",
        len: 23.25,
        d: 8.375,
        fins: {
          n: 4,
          cr: 22.0,
          ct: 5.0,
          s: 7.5,
          sw: 14.0,
          t: 0.25,
          loc: 23.0,
          edge: "beveled",
          le: 0.75,
          te: 0.6,
        },
      },
      {
        t: "tail",
        len: 1.1,
        d0: 8.375,
        d1: 6.7,
      },
    ],
    rail: {
      d: 1.021,
      h: 1.021,
    },
    finish: "smooth",
    noz: 6.0,
    motor: "Q18000",
    mfr: "DEAP-EX",
    w: 314.5,
    cg: 110.0,
    site: 3750.0,
    tF: 80.0,
    rod: 16.0,
    angle: 2.0,
    wind: 0.0,
    meas: 121478,
    how: "integrated accelerometer",
    ras: 119684.0,
  },
  {
    title: "Rabia, short fin can",
    file: "Rabia-ShortFinCan.CDX1",
    nose: {
      len: 13.25,
      shape: "conical",
      tip: 0.031,
    },
    parts: [
      {
        t: "tube",
        len: 71.5,
        d: 3.126,
      },
      {
        t: "tail",
        len: 1.0,
        d0: 3.126,
        d1: 3.19,
      },
      {
        t: "tube",
        len: 11.5,
        d: 3.19,
        fins: {
          n: 3,
          cr: 10.5,
          ct: 0.0,
          s: 4.25,
          sw: 9.625,
          t: 0.1875,
          loc: 11.5,
          edge: "rounded",
        },
      },
    ],
    rail: {
      d: 0.375,
      h: 0.5,
    },
    finish: "polished",
    noz: 1.187,
    motor: "L730",
    mfr: "CTI",
    w: 17.68,
    cg: 51.75,
    site: 3400.0,
    tF: 85.0,
    rod: 10.0,
    angle: 0.0,
    wind: 14.0,
    meas: 10584,
    how: "barometric altimeter",
    ras: 10225.0,
  },
  {
    title: "Rabia",
    file: "Rabia.CDX1",
    nose: {
      len: 14.75,
      shape: "conical",
      tip: 0.031,
    },
    parts: [
      {
        t: "tube",
        len: 83.0,
        d: 3.0,
      },
      {
        t: "tail",
        len: 0.75,
        d0: 3.0,
        d1: 3.125,
      },
      {
        t: "tube",
        len: 13.25,
        d: 3.125,
        fins: {
          n: 3,
          cr: 12.375,
          ct: 0.0,
          s: 4.25,
          sw: 11.25,
          t: 0.188,
          loc: 13.75,
          edge: "rounded",
        },
      },
    ],
    rail: null,
    finish: "polished",
    noz: 1.188,
    motor: "L1080BB",
    mfr: "AMW",
    w: 18.44,
    cg: 61.5,
    site: 2400.0,
    tF: 80.0,
    rod: 10.0,
    angle: 0.0,
    wind: 8.0,
    meas: 12745,
    how: "barometric altimeter",
    ras: 12197.0,
  },
  {
    title: "Raven, LDRS-26",
    file: "Raven.CDX1",
    nose: {
      len: 8.5,
      shape: "vonkarman",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 65.0,
        d: 1.75,
        fins: {
          n: 3,
          cr: 7.5,
          ct: 0.0,
          s: 2.375,
          sw: 6.0,
          t: 0.125,
          loc: 9.370003,
          edge: "rounded",
        },
      },
    ],
    rail: {
      d: 0.375,
      h: 0.3438,
    },
    finish: "polished",
    noz: 0.0,
    motor: "J570W",
    mfr: "AT",
    w: 5.44,
    cg: 54.9,
    site: 2750.0,
    tF: 100.0,
    rod: 10.0,
    angle: 0.0,
    wind: 0.0,
    meas: 8815,
    how: "barometric altimeter",
    ras: 9332.0,
  },
  {
    title: "Thunder and Lightning, LDRS-26",
    file: "Thunder&Lightning.CDX1",
    nose: {
      len: 15.25,
      shape: "ogive",
      tip: 0.0,
    },
    parts: [
      {
        t: "tube",
        len: 60.5,
        d: 3.1,
        fins: {
          n: 3,
          cr: 11.43,
          ct: 0.0,
          s: 4.0,
          sw: 8.75,
          t: 0.0625,
          loc: 13.5,
          edge: "rounded",
        },
      },
    ],
    rail: {
      d: 0.5,
      h: 0.5,
    },
    finish: "polished",
    noz: 0.0,
    motor: "I284W",
    mfr: "AT",
    w: 6.17,
    cg: 51.5,
    site: 2750.0,
    tF: 100.0,
    rod: 10.0,
    angle: 0.0,
    wind: 0.0,
    meas: 3577,
    how: "barometric altimeter",
    ras: 3989.0,
  },
  {
    title: "Torrent",
    file: "Torrent.CDX1",
    nose: {
      len: 20.0,
      shape: "conical",
      tip: 0.031,
    },
    parts: [
      {
        t: "tube",
        len: 82.5,
        d: 4.0,
      },
      {
        t: "tail",
        len: 0.05,
        d0: 4.0,
        d1: 4.125,
      },
      {
        t: "tube",
        len: 6.95,
        d: 4.125,
        fins: {
          n: 3,
          cr: 8.25,
          ct: 3.25,
          s: 5.0,
          sw: 5.0,
          t: 0.125,
          loc: 9.5,
          edge: "rounded",
        },
      },
    ],
    rail: {
      d: 0.375,
      h: 0.5,
    },
    finish: "polished",
    noz: 1.625,
    motor: "M1850GG",
    mfr: "AMW",
    w: 29.13,
    cg: 66.5,
    site: 2400.0,
    tF: 80.0,
    rod: 10.0,
    angle: 0.0,
    wind: 10.0,
    meas: 12807,
    how: "barometric altimeter",
    ras: 13717.0,
  },
];

/**
 * A measured flight's rocket as an OpenRocket design: the nose, the parts in order, rail buttons on the longest tube,
 * and the stage's mass and CG set so the loaded rocket matches the file's launch weight and CG (the motor's own mass
 * and CG, flush with the rocket's aft end, are taken off).
 * @param {object} f one of FLIGHTS
 * @param {{totalMass:number, len:number}} motor the motor (kg, m)
 * @returns {string} XML
 */
function flightOrk(f, motor) {
  const len = (f.nose.len + f.parts.reduce((s, p) => s + p.len, 0)) * IN,
    W = f.w * LB,
    dry = W - motor.totalMass,
    xm = len - motor.len / 2,
    cgDry = (W * f.cg * IN - motor.totalMass * xm) / dry,
    m = '<material type="bulk" density="1000">Fiberglass</material>',
    fin = `<finish>${f.finish}</finish>${m}`,
    shape = f.nose.shape === "vonkarman" ? "haack" : f.nose.shape,
    param = f.nose.param ?? (f.nose.shape === "ogive" ? 1 : 0),
    tubes = f.parts.filter((p) => p.t === "tube"),
    railOn = tubes.reduce((a, b) => (b.len > a.len ? b : a)),
    lastTube = tubes[tubes.length - 1],
    tailAfter = f.parts.slice(f.parts.indexOf(lastTube) + 1).reduce((s, p) => s + p.len, 0);
  const part = (p, i) => {
    if (p.t === "tail")
      return `<transition><name>t${i}</name>${fin}<length>${p.len * IN}</length><thickness>0.002</thickness><shape>conical</shape><shapeclipped>false</shapeclipped><shapeparameter>0</shapeparameter><foreradius>${(p.d0 / 2) * IN}</foreradius><aftradius>${(p.d1 / 2) * IN}</aftradius><foreshoulderradius>0</foreshoulderradius><foreshoulderlength>0</foreshoulderlength><foreshoulderthickness>0</foreshoulderthickness><foreshouldercapped>false</foreshouldercapped><aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength><aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped></transition>`;
    const F = p.fins,
      fins = F
        ? `<trapezoidfinset><name>fins</name><axialoffset method="bottom">${-(F.loc - F.cr) * IN}</axialoffset>${fin}<fincount>${F.n}</fincount><rotation>0</rotation><thickness>${F.t * IN}</thickness><crosssection>${F.edge}</crosssection><cant>0</cant>${F.le > 0 || F.te > 0 ? `<prflbevelle>${(F.le || 0) * IN}</prflbevelle><prflbevelte>${(F.te || 0) * IN}</prflbevelte>` : ""}<rootchord>${F.cr * IN}</rootchord><tipchord>${F.ct * IN}</tipchord><sweeplength>${F.sw * IN}</sweeplength><height>${F.s * IN}</height></trapezoidfinset>`
        : "",
      rail =
        f.rail && p === railOn
          ? `<railbutton><name>buttons</name><axialoffset method="bottom">-0.05</axialoffset><outerdiameter>${f.rail.d * IN}</outerdiameter><innerdiameter>${0.6 * f.rail.d * IN}</innerdiameter><height>${f.rail.h * IN}</height><instancecount>2</instancecount><instanceseparation>${0.5 * p.len * IN}</instanceseparation></railbutton>`
          : "",
      mount =
        p === lastTube
          ? `<motormount><ignitionevent>automatic</ignitionevent><ignitiondelay>0</ignitiondelay><overhang>${tailAfter * IN}</overhang></motormount>`
          : "";
    return `<bodytube><name>b${i}</name>${fin}<length>${p.len * IN}</length><thickness>0.002</thickness><radius>${(p.d / 2) * IN}</radius>${mount}<subcomponents>${fins}${rail}</subcomponents></bodytube>`;
  };
  return `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.9" creator="validation"><rocket><name>${f.title}</name>
<motorconfiguration configid="c" default="true"><stage number="0" active="true"/></motorconfiguration>
<referencetype>maximum</referencetype><subcomponents><stage><name>Stage</name>
<overridemass>${dry}</overridemass><overridesubcomponentsmass>true</overridesubcomponentsmass>
<overridecg>${cgDry}</overridecg><overridesubcomponentscg>true</overridesubcomponentscg><subcomponents>
<nosecone><name>nose</name>${fin}<length>${f.nose.len * IN}</length><thickness>0.002</thickness><shape>${shape}</shape><shapeclipped>false</shapeclipped><shapeparameter>${param}</shapeparameter><aftradius>${((f.nose.d || f.parts[0].d) / 2) * IN}</aftradius><aftshoulderradius>0</aftshoulderradius><aftshoulderlength>0</aftshoulderlength><aftshoulderthickness>0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped></nosecone>
${f.parts.map(part).join("\n")}
</subcomponents></stage></subcomponents></rocket></openrocket>`;
}

module.exports = {
  IN,
  LB,
  FT,
  MPH,
  finnedOrk,
  partsOrk,
  arcasOrk,
  flightOrk,
  A53,
  A53_PTS,
  RM10,
  RM10_PTS,
  ARCAS_CA,
  ARCAS_CA_SUP,
  ARCAS,
  CASES,
  FLIGHTS,
};
