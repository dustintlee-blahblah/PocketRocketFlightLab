/**
 * The form field lists: launch conditions, range settings, imperfections and the dispersion spreads. (The rocket
 * itself is edited in the parts builder on the Rocket tab.)
 */
/* ---------- forms ---------- */
/**
 * Form fields by group element id: [key, label, dimension, object ("L": all of them are launch settings), decimals,
 * options].
 */
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
};
