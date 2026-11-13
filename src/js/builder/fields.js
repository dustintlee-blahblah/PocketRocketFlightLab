/**
 * The rocket builder's fields: the inputs the editor shows for each kind of part, for the rocket as a whole and for
 * each stage, and the choices they offer (shapes, motor sizes, cluster layouts, deployment events).
 */
import { BLD, bldFind } from "./builder-ui.js";
import { BLD_BUMPS, BLD_BUTTONS, BLD_LUG_KINDS, bldOvOn } from "./model.js";
import { FIN_EDGES } from "../core/units-and-fin-edges.js";
/**
 * Nose and transition shapes offered: [shape, label].
 */
export const BLD_SHAPES = [
  ["ogive", "Ogive"],
  ["conical", "Conical"],
  ["ellipsoid", "Ellipsoid"],
  ["power", "Power series"],
  ["parabolic", "Parabolic"],
  ["haack", "Haack series"],
];
/**
 * Standard motor diameters, mm.
 */
export const BLD_SIZES = [13, 18, 24, 29, 38, 54, 75, 98, 152];
/**
 * Cluster layouts offered for a motor mount: [OpenRocket name, label].
 */
const BLD_CLUSTERS = [
  ["single", "Single"],
  ["double", "2 motors"],
  ["3-row", "3 in a row"],
  ["3-ring", "3 in a ring"],
  ["4-ring", "4 in a ring"],
  ["5-ring", "5 in a ring"],
  ["6-ring", "6 in a ring"],
  ["7-ring", "7 (6 around 1)"],
];
/**
 * Deployment events offered for a recovery part: [event, label].
 */
const BLD_DEPLOY = [
  ["apogee", "At apogee"],
  ["ejection", "Motor ejection charge"],
  ["altitude", "At an altitude (main)"],
  ["launch", "On a timer after liftoff"],
];
/**
 * The fields a part shows in the editor: [key, label, kind, dimension or options].
 * @param {object} p part
 * @returns {Array[]}
 *
 * the fields each part shows: [key, label, kind, dim or options]
 */
export function bldFields(p) {
  const posF = [["pos", "Position", "pos"]],
    kw = [
      ["known", "Weight", "ovr", "smass"],
      ...(bldOvOn(p, "known") ? [["knownAll", "Includes the parts attached to it", "check"]] : []),
      ...(p.cdo != null ? [["cdo", "Drag coefficient (Cd)", "ovr", "none"]] : []),
    ];
  /**
   * The material field of a part.
   */
  const mat = (k) => [["mat", "Material", k || "bulk"]];
  const param = ["power", "parabolic", "haack", "ogive"].includes(p.shape)
    ? [["param", "Shape parameter", "num", "none"]]
    : [];
  const dep = [
    [
      "deploy",
      "Opens",
      "sel",
      BLD_DEPLOY.some((d) => d[0] === p.deploy) ? BLD_DEPLOY : [...BLD_DEPLOY, [p.deploy, `From file (${p.deploy})`]],
    ],
    ...(p.deploy === "altitude"
      ? [["alt", "Opening altitude", "num", "alt"]]
      : p.deploy === "apogee"
        ? [["delay", "Delay after apogee", "num", "time"]]
        : p.deploy === "ejection"
          ? [["delay", "Delay after the charge", "num", "time"]]
          : p.deploy === "launch"
            ? [["delay", "Time after liftoff", "num", "time"]]
            : []),
  ];
  switch (p.type) {
    case "nose":
      return [
        ["name", "Name", "text"],
        ["shape", "Shape", "sel", BLD_SHAPES],
        ...param,
        ["len", "Length", "num", "len"],
        ["dia", "Base diameter", "num", "len"],
        ["tipR", "Tip radius", "num", "small"],
        ["filled", "Solid", "check"],
        ...(p.filled ? [] : [["wall", "Wall thickness", "num", "small"]]),
        ["shLen", "Shoulder length", "num", "len"],
        ...mat(),
        ...kw,
      ];
    case "tube":
      return [
        ["name", "Name", "text"],
        ["len", "Length", "num", "len"],
        ["od", "Outside diameter", "num", "len"],
        ["wall", "Wall thickness", "num", "small"],
        ["isMount", "This tube is the motor mount (minimum diameter)", "check"],
        ...(p.mm ? [["mmOverhang", "Motor overhang", "num", "small"]] : []),
        ...mat(),
        ...kw,
      ];
    case "transition":
      return [
        ["name", "Name", "text"],
        ["shape", "Shape", "sel", BLD_SHAPES.filter((s) => s[0] !== "ellipsoid")],
        ...param,
        ["len", "Length", "num", "len"],
        ["dia1", "Front diameter", "num", "len"],
        ["dia2", "Aft diameter", "num", "len"],
        ["wall", "Wall thickness", "num", "small"],
        ["sh1Len", "Front shoulder length", "num", "len"],
        ["sh2Len", "Aft shoulder length", "num", "len"],
        ...mat(),
        ...kw,
      ];
    case "fins":
      return [
        ["name", "Name", "text"],
        [
          "shape",
          "Shape",
          "sel",
          [
            ["trapezoid", "Trapezoid"],
            ["elliptical", "Elliptical"],
            ["freeform", "Free-form"],
          ],
        ],
        ["n", "Number of fins", "int"],
        ...(p.shape === "freeform"
          ? [["pts", "Outline points", "pts"]]
          : [
              ["root", "Root chord", "num", "len"],
              ...(p.shape === "trapezoid" ? [["tip", "Tip chord", "num", "len"]] : []),
              ["span", "Span (height)", "num", "len"],
              ...(p.shape === "trapezoid" ? [["sweep", "Leading-edge sweep", "num", "len"]] : []),
            ]),
        ["t", "Thickness", "num", "small"],
        ["edge", "Edges", "sel", FIN_EDGES],
        ...(p.edge === "beveled"
          ? [
              ["bevLE", "Leading-edge bevel length", "num", "small"],
              ["bevTE", "Trailing-edge bevel length", "num", "small"],
            ]
          : []),
        ["cant", "Cant angle", "num", "deg"],
        ...posF,
        ...mat(),
        ...kw,
      ];
    case "mount": {
      const f = typeof bldFind === "function" ? bldFind(p.id) : null,
        upper = f && BLD && BLD.stages.length > 1 && f.si < BLD.stages.length - 1;
      return [
        ["name", "Name", "text"],
        ["size", "Motor size", "size"],
        ...(upper
          ? []
          : [
              [
                "ign",
                "Lights",
                "sel",
                [
                  ["automatic", "At liftoff"],
                  ["never", "Never (leave it empty this flight)"],
                  ...(["automatic", "never", "launch"].includes(p.ign || "automatic")
                    ? []
                    : [[p.ign, `From file (${p.ign})`]]),
                ],
              ],
              ...((p.ign || "automatic") !== "never"
                ? [["ignDelay", "Airstart: lights this long after liftoff", "num", "time"]]
                : []),
            ]),
        [
          "cluster",
          "Motors in this mount",
          "sel",
          BLD_CLUSTERS.some((c) => c[0] === p.cluster)
            ? BLD_CLUSTERS
            : [...BLD_CLUSTERS, [p.cluster, `From file (${p.cluster})`]],
        ],
        ["od", "Tube outside diameter", "num", "small"],
        ["wall", "Tube wall", "num", "small"],
        ["len", "Length", "num", "len"],
        ["overhang", "Motor overhang", "num", "small"],
        ...posF,
        ...mat(),
        ...kw,
      ];
    }
    case "inner":
      return [
        ["name", "Name", "text"],
        ["od", "Outside diameter", "num", "small"],
        ["wall", "Wall thickness", "num", "small"],
        ["len", "Length", "num", "len"],
        ...posF,
        ...mat(),
        ...kw,
      ];
    case "ring":
      return [
        ["name", "Name", "text"],
        ["od", "Outside diameter", "num", "small"],
        ["id_", "Hole diameter", "num", "small"],
        ["len", "Thickness", "num", "small"],
        ...posF,
        ...mat(),
        ...kw,
      ];
    case "bulkhead":
      return [
        ["name", "Name", "text"],
        ["od", "Diameter", "num", "small"],
        ["len", "Thickness", "num", "small"],
        ...posF,
        ...mat(),
        ...kw,
      ];
    case "coupler":
      return [
        ["name", "Name", "text"],
        ["len", "Length", "num", "len"],
        ["od", "Outside diameter", "num", "small"],
        ["wall", "Wall thickness", "num", "small"],
        ...posF,
        ...mat(),
        ...kw,
      ];
    case "lug":
      return [
        ["name", "Name", "text"],
        ["kind", "Lug type", "sel", BLD_LUG_KINDS],
        // a rod lug is a tube; a rail lug is a solid slider the size of that rail's button
        ...(p.kind === "r1010" || p.kind === "r1515"
          ? []
          : [
              ["od", "Outside diameter", "num", "small"],
              ["id_", "Inside diameter", "num", "small"],
            ]),
        ["len", "Length", "num", "len"],
        ...posF,
        ...mat(),
        ...kw,
      ];
    case "buttons":
      return [
        ["name", "Name", "text"],
        [
          "size",
          "Button size",
          "sel",
          [
            ...Object.entries(BLD_BUTTONS).map(([k, v]) => [k, v.label]),
            ...(p.size === "custom" ? [["custom", "From file"]] : []),
          ],
        ],
        ["n", "How many", "int"],
        ["sep", "Spacing", "num", "len"],
        ...posF,
        ...kw,
      ];
    case "chute":
      return [
        ["name", "Name", "text"],
        ["dia", "Diameter", "num", "len"],
        ["cd", "Drag coefficient", "num", "none"],
        ...dep,
        ["lines", "Shroud lines", "int"],
        ["packLen", "Packed length", "num", "small"],
        ...posF,
        ...mat("surf"),
        ...kw,
      ];
    case "streamer":
      return [
        ["name", "Name", "text"],
        ["len", "Length", "num", "len"],
        ["width", "Width", "num", "small"],
        ...dep,
        ["packLen", "Packed length", "num", "small"],
        ...posF,
        ...mat("surf"),
        ...kw,
      ];
    case "cord":
      return [
        ["name", "Name", "text"],
        ["cordLen", "Cord length", "num", "alt"],
        ["mat", "Cord", "line"],
        ["packLen", "Packed length", "num", "small"],
        ...posF,
        ...kw,
      ];
    case "mass":
      return [["name", "Name", "text"], ["mass", "Weight", "num", "smass"], ["len", "Length", "num", "small"], ...posF];
    case "bump":
      return [
        ["name", "Name", "text"],
        ["shape", "Shape", "sel", BLD_BUMPS],
        // a fly-away rail guide goes all the way around the body, so it has no width or angle
        ...(p.shape === "flyaway" ? [] : [["w", "Width", "num", "small"]]),
        ["h", p.shape === "flyaway" ? "Thickness around the body" : "Height above the body", "num", "small"],
        ["len", "Length", "num", "small"],
        ["mass", "Weight", "num", "smass"],
        ...(p.shape === "flyaway" ? [] : [["ang", "Angle around the body", "num", "deg"]]),
        ...posF,
      ];
    case "raw":
      return [["name", "Name", "text"], ...posF];
  }
  return [];
}
/**
 * The fields of the rocket itself: name, finish, inertia, drag adjustments.
 * @returns {Array[]}
 */
export function bldRootFields() {
  const two = BLD.stages.length > 1,
    s0 = BLD.stages[0];
  return [
    ["name", "Rocket name", "text"],
    ["finish", "Surface finish", "finish"],
    ...(two
      ? []
      : [
          ["known", "Weight without motor", "ovr", "mass", s0],
          ["knownCg", "CG without motor, from the nose tip", "ovr", "len", s0],
          ["dryInertia", "Turning inertia about the CG", "ovr", "moi", BLD.settings],
        ]),
    ["cdOverride", "Drag coefficient (Cd)", "ovr", "none", BLD.settings],
    ["otherCd", "Other drag (ΔCd)", "num", "none", BLD.settings],
    [
      "blMode",
      "Boundary layer",
      "sel",
      null,
      BLD.settings,
      [
        ["turb", "Turbulent from the nose (typical)"],
        ["natural", "Natural transition (very smooth, no joints near the nose)"],
      ],
    ],
  ];
}
/**
 * The fields of a stage: name, separation and ignition settings.
 * @param {object} st stage
 * @param {number} si its index
 * @returns {Array[]}
 */
export function bldStageFields(st, si) {
  const n = BLD.stages.length,
    upper = n > 1 && si < n - 1,
    below = si < n - 1 ? BLD.stages[si + 1].name || "the stage below" : "";
  return [
    ["name", "Name", "text"],
    ...(upper ? [["ignDelay", `Lights after ${below.toLowerCase()} burnout`, "num", "time"]] : []),
    ...(si > 0 ? [["sepDelay", "Separates after its motor burns out", "num", "time"]] : []),
    ["known", "Weight without motor", "ovr", "mass"],
    [
      "knownCg",
      si === 0 ? "CG without motor, from the nose tip" : "CG without motor, from its front end",
      "ovr",
      "len",
    ],
    [
      "inertia",
      "Turning inertia about the CG",
      "ovr",
      "moi",
      BLD.settings,
      si === 0 ? "dryInertia" : n === 3 && si === 2 ? "s1DryInertia" : "bDryInertia",
    ],
  ];
}
