/* ---------- forms ---------- */
const FIELDS = {
  "g-stagelock": [
    ["ignMinAlt", "Lowest height to light the sustainer", "alt", "L"],
    ["ignMaxTilt", "Most tilt to light the sustainer", "deg", "L", 0],
  ],
  "g-mc": [
    ["mcN", "Number of flights", "int", "L"],
    ["mcWind", "Wind speed", "pct", "L", 0],
    ["mcDir", "Wind direction", "deg", "L", 0],
    ["mcImp", "Motor impulse", "pct", "L", 1],
    ["mcMass", "Rocket weight", "pct", "L", 1],
    ["mcCd", "Drag", "pct", "L", 0],
    ["mcAngle", "Rail angle", "deg", "L", 1],
    ["mcMis", "Thrust misalignment", "deg", "L", 2],
    ["mcDelay", "Ejection delay", "pct", "L", 0],
    ["mcChute", "Parachute drag", "pct", "L", 0],
    ["mcThermal", "Up and down drafts", "wind", "L", 1],
  ],
  "g-imperf": [
    ["thrustMis", "Thrust misalignment", "deg", "L", 2],
    ["finMis", "One fin misaligned by", "deg", "L", 2],
    ["cgOff", "CG off the centerline by", "small", "L"],
    [
      "clusterFail",
      "One cluster motor fails to light",
      "sel",
      "L",
      null,
      [
        ["false", "No"],
        ["true", "Yes"],
      ],
    ],
  ],
  "g-range": [
    ["elev", "Field elevation", "alt", "L"],
    ["waiver", "Waiver ceiling", "alt", "L"],
    [
      "waiverRef",
      "Ceiling measured from",
      "sel",
      "L",
      null,
      [
        ["agl", "Ground (AGL)"],
        ["msl", "Sea level (MSL)"],
      ],
    ],
    ["recRadius", "Recovery area radius", "dist", "L"],
  ],
  "g-launch": [
    [
      "railType",
      "Rail or rod type",
      "sel",
      "L",
      null,
      [
        ["", "Not set"],
        ["rod18", "1/8 in rod"],
        ["rod316", "3/16 in rod"],
        ["r1010", "1010 rail"],
        ["r1515", "1515 rail"],
        ["tower", "Launch tower"],
        ["other", "Other"],
      ],
    ],
    ["rail", "Rail length", "alt", "L", 1],
    ["angle", "Rail angle from vertical", "deg", "L"],
    [
      "railMode",
      "Rail leans",
      "sel",
      "L",
      null,
      [
        ["into", "Into the wind"],
        ["fixed", "Toward a set direction"],
      ],
    ],
    ["railDir", "Rail leans toward", "deg", "L", 0],
    ["cone", "Safety cone", "deg", "L", 0],
    [
      "flightType",
      "Flight type",
      "sel",
      "L",
      null,
      [
        ["standard", "Standard"],
        ["cert", "Certification flight"],
        ["first", "First flight"],
        ["headsup", "Heads-up"],
      ],
    ],
  ],
  "g-ambient": [
    ["tempC", "Temperature", "temp", "L"],
    ["pressure", "Air pressure at the pad", "press", "L"],
    ["humidity", "Relative humidity", "pct", "L", 0],
    ["dewC", "Dew point", "temp", "L", 1],
    ["wind", "Wind speed at the pad", "wind", "L"],
    ["windRef", "Wind measured at height", "alt", "L", 1],
    [
      "windProfile",
      "Wind with altitude",
      "sel",
      "L",
      null,
      [
        ["typical", "Increases, typical day (1/7 power)"],
        ["shear", "Increases, calm morning or evening (0.25 power)"],
        ["constant", "Same at all altitudes"],
      ],
    ],
    ["windDir", "Wind blowing from", "deg", "L", 0],
    ["turb", "Gustiness", "pct", "L", 0],
    ["ceiling", "Cloud base elevation (0 = clear)", "alt", "L", 0],
    ["cloudLow", "Low cloud cover", "pct", "L", 0],
    ["cloudMid", "Mid-level cloud cover", "pct", "L", 0],
    ["cloudHigh", "High cloud cover", "pct", "L", 0],
    ["vis", "Visibility (0 = not set)", "vis", "L"],
    ["precip", "Chance of precipitation", "pct", "L", 0],
  ],
  "g-motortemp": [["motorDT", "Motor temperature above air", "dtemp", "L", 0]],
  "g-body": [
    ["length", "Total length", "len"],
    ["diameter", "Body diameter", "small"],
    ["noseLen", "Nose length", "len"],
    ["noseShape", "Nose shape", "sel", null, null, NOSE_PRESETS],
    ["tailLen", "Boat-tail length (0 = none)", "len"],
    ["tailDia", "Boat-tail aft diameter", "small"],
    ["mountSel", "Motor mount size", "sel", null, null, []],
  ],
  "g-fins": [
    ["finCount", "Number of fins", "int"],
    ["finRoot", "Root chord", "len"],
    ["finTip", "Tip chord", "len"],
    ["finSpan", "Span (height)", "len"],
    ["finSweep", "Leading-edge sweep", "len"],
    ["finThick", "Thickness", "small"],
    ["finAft", "Root trailing edge to tail", "len"],
    ["finEdge", "Edge profile", "sel", null, null, FIN_EDGES],
  ],
  "g-mass": [
    ["dryMass", "Weight without motor", "mass"],
    ["cgEmpty", "CG without motor", "len"],
    ["motorOverhang", "Motor overhang", "small"],
    ["dryInertia", "Turning inertia about CG (0 = estimate)", "moi"],
  ],
  "g-drag": [
    [
      "finish",
      "Surface finish",
      "sel",
      null,
      null,
      [
        ["0.5e-6", "Smooth molded composite (0.5 µm)"],
        ["1.5e-6", "Polished metal (1.5 µm)"],
        ["6e-6", "Smooth paint, sanded (6 µm)"],
        ["10e-6", "Matte or camouflage paint (10 µm)"],
        ["30e-6", "Hobby spray paint (30 µm, est.)"],
        ["100e-6", "Bare paper or phenolic tube (100 µm, est.)"],
        ["300e-6", "Raw fiberglass weave or balsa (300 µm, est.)"],
      ],
    ],
    [
      "railPreset",
      "Rail guides",
      "sel",
      null,
      null,
      [
        ["none", "None"],
        ["1010", "1010 buttons ×2"],
        ["1515", "1515 buttons ×2"],
        ["custom", "From design file"],
      ],
    ],
    ["otherCd", "Other drag (ΔCd)", "none"],
    ["cdOverride", "Cd override", "none"],
  ],
  "g-stages": [
    [
      "twoStage",
      "Stages",
      "sel",
      null,
      null,
      [
        ["false", "Single stage"],
        ["true", "Two stage (booster + sustainer)"],
      ],
    ],
    ["stageDelay", "Sustainer ignition delay after booster burnout", "time"],
  ],
  "g-booster": [
    ["bLength", "Booster length", "len"],
    ["bDiameter", "Booster diameter", "small"],
    ["bDryMass", "Booster weight without motor", "mass"],
    ["bCg", "Booster CG from its front end", "len"],
    ["bOverhang", "Booster motor overhang", "small"],
    ["bMountSel", "Booster motor mount size", "sel", null, null, []],
    ["bDryInertia", "Booster turning inertia (0 = estimate)", "moi"],
  ],
  "g-bfins": [
    ["bFinCount", "Number of fins", "int"],
    ["bFinRoot", "Root chord", "len"],
    ["bFinTip", "Tip chord", "len"],
    ["bFinSpan", "Span (height)", "len"],
    ["bFinSweep", "Leading-edge sweep", "len"],
    ["bFinThick", "Thickness", "small"],
    ["bFinAft", "Root trailing edge to tail", "len"],
    [
      "bFinEdge",
      "Edge profile",
      "sel",
      null,
      null,
      [
        ["square", "Square"],
        ["rounded", "Rounded"],
        ["airfoil", "Airfoiled"],
      ],
    ],
  ],
  "g-brec": [
    [
      "bRecovery",
      "Booster recovery",
      "sel",
      null,
      null,
      [
        ["tumble", "None (booster falls free)"],
        ["chute", "Parachute or streamer at apogee"],
      ],
    ],
    ["bChuteDia", "Chute diameter", "len"],
    ["bChuteCd", "Chute Cd", "none"],
  ],
  "g-rec": [
    [
      "recovery",
      "Deployment",
      "sel",
      null,
      null,
      [
        ["dual", "Dual (drogue + main)"],
        ["single", "Single (one chute at apogee)"],
      ],
    ],
    [
      "deployMode",
      "First chute opens",
      "sel",
      null,
      null,
      [
        ["apogee", "At apogee (altimeter)"],
        ["motor", "At the motor ejection charge"],
        ["timer", "On a timer after liftoff"],
      ],
    ],
    ["deployDelay", "Delay after apogee (0 = at apogee)", "time"],
    ["drogueDia", "Drogue diameter", "len"],
    ["drogueCd", "Drogue Cd", "none"],
    ["mainDia", "Main diameter", "len"],
    ["mainCd", "Main Cd", "none"],
    ["mainAlt", "Main deploy altitude", "alt"],
  ],
};
const BODY_KEYS = ["length", "diameter", "noseLen", "noseShape", "tailLen", "tailDia"];
function renderSegNote() {
  const el = document.getElementById("segnote");
  if (!el) return;
  const sg = D.segments;
  if (sg && sg.length) {
    const ds = [...new Set(sg.map((x) => Math.round(Math.max(x.r1, x.r2) * 2e4) / 1e4))];
    el.hidden = false;
    el.textContent = `Body shape comes from your file: ${sg.length} sections, ${ds.length > 1 ? "diameters " + fmt(Math.min(...ds), "small") + "–" + fmt(Math.max(...ds), "small") : "diameter " + fmt(ds[0], "small")} ${uname("small")}. Editing the length, diameter, nose or boat-tail fields replaces it with a simple nose, tube and boat tail.`;
  } else el.hidden = true;
}
const B_BODY_KEYS = ["bLength", "bDiameter"];
const SUS_LABELS = {
  dryMass: "Sustainer weight without motor",
  cgEmpty: "Sustainer CG without motor",
  motorOverhang: "Sustainer motor overhang",
};
function renderStageUI() {
  const two = !!D.twoStage;
  document.getElementById("boosterpanels").hidden = !two;
  document.getElementById("h-body").textContent = two ? "Sustainer airframe & nose" : "Airframe & nose";
  const nx = (D.extraFins || []).length;
  document.getElementById("h-fins").textContent =
    (two ? "Sustainer fins" : "Fins") + (nx ? " · main set at the tail" : "");
  document.getElementById("h-mass").textContent = two ? "Sustainer mass & balance" : "Mass & balance";
  document.getElementById("h-rec").textContent = two ? "Sustainer recovery" : "Recovery";
  document.getElementById("massnote").textContent = two
    ? "Enter the sustainer’s flight-ready weight and balance point without its motor. Measure CG from the nose tip."
    : "Enter the flight-ready weight and balance point without the motor. Measure CG from the nose tip.";
  document.getElementById("stagenote").textContent = two
    ? "The stack lifts off on the booster motor and separates at booster burnout. The sustainer motor lights after the delay: use 0 s for direct (motor-to-motor) staging, or your altimeter’s delay for electronic staging."
    : "Choose two stage to add a booster below this rocket.";
  document.getElementById("brecnote").textContent =
    D.bRecovery === "chute"
      ? "The booster’s chute or streamer opens at its apogee. For a streamer, enter the diameter of a parachute with the same drag."
      : "With no recovery, the booster falls free after its apogee. Many low-power boosters are designed to tumble or flutter down this way.";
}
