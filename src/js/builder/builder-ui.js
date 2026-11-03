/**
 * The Rocket tab's parts builder: the parts tree, the editor for the selected part, the side view of the rocket,
 * undo and redo, and turning the parts into the flight design (see the note below).
 */
/* ---------- Rocket tab: the parts builder ----------
   The parts list (BLD) is the design. The flight code's summary (D) is worked out from it every time it
   changes, by writing the parts as an OpenRocket file and reading that back. */
/**
 * BLD: the builder model (the design's parts); bldSel: the selected part's id; bldT: the debounce timer for typing;
 * bldHits: clickable areas of the side view; bldNewSure: when New design was last tapped.
 */
var BLD = null,
  bldSel = null,
  bldT = null,
  bldHits = [];
/**
 * Nose and transition shapes offered: [shape, label].
 */
const BLD_SHAPES = [
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
const BLD_SIZES = [13, 18, 24, 29, 38, 54, 75, 98, 152];
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
const BLD_ROOT = "__rocket";
/**
 * The fields a part shows in the editor: [key, label, kind, dimension or options].
 * @param {object} p part
 * @returns {Array[]}
 *
 * the fields each part shows: [key, label, kind, dim or options]
 */
function bldFields(p) {
  const posF = [["pos", "Position", "pos"]],
    kw = [
      ["known", p.knownCalc ? "Weight from RockSim’s calculation" : "Measured weight", "num", "smass"],
      ...(p.known > 0 ? [["knownAll", "Includes the parts attached to it", "check"]] : []),
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
        ["od", "Outside diameter", "num", "small"],
        ["id_", "Inside diameter", "num", "small"],
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
    case "raw":
      return [["name", "Name", "text"], ...posF];
  }
  return [];
}
/**
 * The fields of the rocket itself: name, finish, inertia, drag adjustments.
 * @returns {Array[]}
 */
function bldRootFields() {
  const two = BLD.stages.length > 1,
    s0 = BLD.stages[0];
  return [
    ["name", "Rocket name", "text"],
    ["finish", "Surface finish", "finish"],
    ...(two
      ? []
      : [
          ["known", "Measured weight without motor", "num", "mass", s0],
          ["knownCg", "Measured CG from the nose tip", "num", "len", s0],
          ["dryInertia", "Turning inertia about the CG", "num", "moi", BLD.settings],
        ]),
    ["otherCd", "Other drag (ΔCd)", "num", "none", BLD.settings],
    ["cdOverride", "Cd override", "num", "none", BLD.settings],
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
function bldStageFields(st, si) {
  const n = BLD.stages.length,
    upper = n > 1 && si < n - 1,
    below = si < n - 1 ? BLD.stages[si + 1].name || "the stage below" : "";
  return [
    ["name", "Name", "text"],
    ...(upper ? [["ignDelay", `Lights after ${below.toLowerCase()} burnout`, "num", "time"]] : []),
    ...(si > 0 ? [["sepDelay", "Separates after its motor burns out", "num", "time"]] : []),
    ["known", "Measured weight without motor", "num", "mass"],
    ["knownCg", si === 0 ? "Measured CG from the nose tip" : "Measured CG from its front end", "num", "len"],
    [
      "inertia",
      "Turning inertia about the CG",
      "num",
      "moi",
      BLD.settings,
      si === 0 ? "dryInertia" : n === 3 && si === 2 ? "s1DryInertia" : "bDryInertia",
    ],
  ];
}
/**
 * Finds a part (or stage, or the rocket) by id, with where it sits.
 * @param {string} id
 * @returns {object|null} {p, si, pi, st, parent, ki} for a part, {stage, si} for a stage, {root} for the rocket
 */
function bldFind(id) {
  if (id === BLD_ROOT) return { root: true };
  for (const [si, st] of BLD.stages.entries()) {
    if (st.id === id) return { stage: st, si };
    for (const [pi, p] of st.parts.entries()) {
      if (p.id === id) return { p, si, pi, st, parent: null };
      const ki = (p.kids || []).findIndex((k) => k.id === id);
      if (ki >= 0) return { p: p.kids[ki], si, pi, ki, st, parent: p };
    }
  }
  return null;
}
/**
 * Keeps the builder model on the device.
 */
function bldSave() {
  try {
    localStorage.setItem("rfs-builder", JSON.stringify(BLD));
  } catch (e) {}
}
/**
 * Puts the motors chosen on the Motor tab into each stage's primary motor mount.
 *
 * the primary motor mount of each stage holds the motor chosen on the Motor tab
 */
function bldSyncMotors() {
  if (!BLD) return;
  /**
   * Sets a stage's primary mount's motor, unless it's held by a choice already made there.
   */
  const put = (st, m, hold) => {
    const k = bldMounts(st)[0];
    if (!k || !m) return;
    if (hold && m.id === hold) return;
    if (m.dia > k.od - 2 * (k.wall || 0) + 0.0006 && k.od > 0) return; // a motor that can't go in this mount isn't written into the design
    if (m && (!k.motor || k.motor.name !== m.name || (k.motor.mfr || "") !== (m.mfr || m.brand || "")))
      k.motor = { id: m.id, mfr: m.mfr || m.brand || "", name: m.name, dia: m.dia, len: m.len };
    else if (m && k.motor) k.motor.id = m.id;
  };
  const h = BLD.hold || [];
  // a design where only one stage has a motor mount (a payload section on top): the motor goes in that stage
  const mounted = BLD.stages.filter((st) => bldMounts(st).length);
  if (BLD.stages.length > 1 && mounted.length === 1) {
    put(mounted[0], findMotor(motorId), h[0]);
    return;
  }
  put(BLD.stages[0], findMotor(motorId), h[0]);
  // three stages: sustainer, booster (the middle one), first stage
  if (BLD.stages.length === 3 && mounted.length === 3) {
    put(BLD.stages[1], findMotor(boostId), h[1]);
    put(BLD.stages[2], findMotor(firstId), h[2]);
  } else if (BLD.stages.length > 1) put(BLD.stages[BLD.stages.length - 1], findMotor(boostId), h[1]);
}
/**
 * Works out the flight design D from the parts (written as .ork and read back), keeping app-only settings.
 *
 * the flight code's summary, worked out from the parts
 */
function bldDerive() {
  bldSyncMotors();
  const prev = D,
    r = parseOrk(bldToOrk(BLD, L)),
    nd = r.design,
    S = BLD.settings || bldSettings();
  nd.name = BLD.name || nd.name;
  nd.otherCd = S.otherCd || 0;
  nd.blMode = S.blMode || "turb";
  nd.dryInertia = S.dryInertia || 0;
  nd.bDryInertia = S.bDryInertia || 0;
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
        o = out.find((x) => x.id === mid && Math.abs((x.d || 0) - d) < 1e-6 && x.ej === ej);
      if (o) o.n += e.count || 1;
      else out.push({ id: mid, n: e.count || 1, d, ej });
    }
    // the same motors as before (perhaps chosen on the Motor tab): kept, with the mounts' lighting times unless changed there
    if (want && had === want) {
      const pv = prev[key];
      if (pv.length === out.length)
        return pv.map((p, i) => (p.dUser ? { ...p, ej: out[i].ej } : { ...p, d: out[i].d, ej: out[i].ej }));
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
  if (nd.s1 && S.s1DryInertia > 0) nd.s1.bDryInertia = S.s1DryInertia;
  D = nd;
  applyCal();
  return r;
}
/**
 * bldDerive, with any error shown in the builder.
 */
function bldApply() {
  try {
    bldDerive();
    document.getElementById("bldmsg").innerHTML = "";
  } catch (e) {
    document.getElementById("bldmsg").innerHTML = `<div class="report err">${esc(e.message || String(e))}</div>`;
  }
  changed();
}
/* undo and redo for builder changes: a snapshot before each change; typing into one field counts as one change */
/**
 * Undo history: snapshots before each change (typing into one field counts as one change).
 */
const BLD_UNDO = { ref: null, cur: null, past: [], future: [], t: 0, key: null, max: 40 };
/**
 * A snapshot of the builder model (without the ejection charge settings).
 */
const bldSnap = () => JSON.stringify(BLD, (k, v) => (k === "bp" ? undefined : v));
/**
 * Starts a fresh history when another design is opened.
 */
function bldHistSync() {
  if (!BLD) return;
  if (BLD_UNDO.ref !== BLD) {
    BLD_UNDO.ref = BLD;
    BLD_UNDO.cur = bldSnap();
    BLD_UNDO.past = [];
    BLD_UNDO.future = [];
    BLD_UNDO.key = null;
  }
}
/**
 * Records a change in the history (typing in the same field within a moment joins the last change).
 * @param {boolean} full the change is complete (not mid-typing)
 */
function bldHistNote(full) {
  if (!BLD) return;
  if (BLD_UNDO.ref !== BLD) {
    bldHistSync();
    return;
  }
  const now = bldSnap();
  if (now === BLD_UNDO.cur) return;
  const t = Date.now(),
    same = !full && BLD_UNDO.key === bldSel && t - BLD_UNDO.t < 1200 && BLD_UNDO.past.length;
  if (!same) {
    BLD_UNDO.past.push(BLD_UNDO.cur);
    if (BLD_UNDO.past.length > BLD_UNDO.max) BLD_UNDO.past.shift();
  }
  BLD_UNDO.cur = now;
  BLD_UNDO.future = [];
  BLD_UNDO.t = t;
  BLD_UNDO.key = full ? null : bldSel;
  bldUndoUI();
}
/**
 * Undo (-1) or redo (+1).
 * @param {number} dir
 */
function bldUndoStep(dir) {
  bldHistSync();
  const from = dir < 0 ? BLD_UNDO.past : BLD_UNDO.future,
    to = dir < 0 ? BLD_UNDO.future : BLD_UNDO.past;
  if (!from.length) return;
  to.push(BLD_UNDO.cur);
  BLD_UNDO.cur = from.pop();
  {
    const keep = BLD.bp;
    BLD = JSON.parse(BLD_UNDO.cur);
    if (keep) BLD.bp = keep;
  }
  BLD_UNDO.ref = BLD;
  BLD_UNDO.key = null;
  if (!bldSel || !bldFind(bldSel)) bldSel = BLD_ROOT;
  bldSave();
  bldApply();
  bldRender();
  if (typeof renderMotors === "function") {
    mountFilter();
    renderMotors();
  }
}
/**
 * Enables the Undo and Redo buttons when there's something to undo or redo.
 */
function bldUndoUI() {
  const u = document.getElementById("bldundo"),
    r = document.getElementById("bldredo");
  if (!u) return;
  u.disabled = !(BLD && BLD_UNDO.ref === BLD && BLD_UNDO.past.length);
  r.disabled = !(BLD && BLD_UNDO.ref === BLD && BLD_UNDO.future.length);
}
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || (e.key.toLowerCase() !== "z" && e.key.toLowerCase() !== "y")) return;
  const tg = e.target && e.target.tagName;
  if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT") return;
  if (document.getElementById("v-rocket").hidden || !BLD) return;
  e.preventDefault();
  bldUndoStep(e.key.toLowerCase() === "y" || e.shiftKey ? 1 : -1);
});
/**
 * After a builder edit: saves, records history, and (for a complete change) rebuilds the design and redraws.
 * @param {boolean} full
 */
function bldChanged(full) {
  bldSave();
  bldHistNote(full);
  if (full) {
    bldApply();
    bldRender();
  } else {
    bldDrawFinEdit();
    clearTimeout(bldT);
    bldT = setTimeout(() => {
      bldApply();
      bldRenderTree();
    }, 140);
  }
}
/**
 * Draws the fin being edited to scale, with its distance to the end of its tube.
 *
 * the fin being edited, drawn to scale with its root, tip, span and sweep and its distance to the end of the tube it's on
 */
function bldDrawFinEdit() {
  const cv = document.getElementById("bldfinview");
  if (!cv) return;
  const f = bldSel ? bldFind(bldSel) : null;
  if (!f || !f.p || f.p.type !== "fins") return;
  const k = f.p,
    lay = bldLayout(BLD),
    body = lay.bodies.find((b) => b.p === f.parent),
    kk = body && body.kids.find((e) => e.k === k);
  const FS = {
    n: k.n,
    t: k.t,
    cant: k.cant || 0,
    edge: k.edge || "square",
    tailName: f.parent && f.parent.type === "tube" ? "tube end" : "aft end",
    aft: body && kk ? body.x + body.len - (kk.x + kk.len) : 0,
  };
  if (k.shape === "freeform") {
    const P = bldPts(k).pts;
    FS.pts = P;
    FS.a = P.length ? Math.max(...P.map((p) => p[0])) - Math.min(...P.map((p) => p[0])) : 0;
    FS.s = Math.max(0, ...P.map((p) => p[1]));
    FS.b = 0;
    FS.sw = 0;
    FS.showPts = true;
    FS.note =
      " Free-form: the numbered corners are the outline points above, in order. Root and span are measured from them.";
  } else if (k.shape === "elliptical") {
    const N = 60,
      a = k.root,
      sp = k.span;
    FS.pts = [];
    for (let i = 0; i <= N; i++) {
      const th = Math.PI * (1 - i / N);
      FS.pts.push([(a / 2) * (1 + Math.cos(th)), sp * Math.sin(th)]);
    }
    FS.a = a;
    FS.s = sp;
    FS.b = 0;
    FS.sw = 0;
    FS.note = " Elliptical: the root chord and span set the shape.";
  } else {
    FS.a = k.root;
    FS.b = k.tip;
    FS.s = k.span;
    FS.sw = k.sweep;
  }
  drawFinsInto("bldfinview", "bldfinnote", FS);
}
/**
 * Redraws the whole builder: tree, add buttons, editor, side view and undo state.
 */
function bldRender() {
  try {
    bpRender();
  } catch (e) {}
  if (!BLD) return;
  bldSyncMotors();
  bldHistSync();
  bldUndoUI();
  bldRenderTree();
  bldRenderAdd();
  bldRenderEdit();
  bldDraw();
}
/**
 * A one-line size summary of a part, for the tree.
 * @param {object} p part
 * @returns {string}
 */
const bldSum = (p) => {
  const L_ = (v) => `${fmt(v, "len")} ${uname("len")}`;
  switch (p.type) {
    case "nose":
      return `${(BLD_SHAPES.find((s) => s[0] === p.shape) || ["", p.shape])[1]}, ${L_(p.len)}`;
    case "tube":
      return `${L_(p.len)} × ${L_(p.od)}${p.mm ? " · motor mount" : ""}`;
    case "transition":
      return `${L_(p.dia1)} → ${L_(p.dia2)}`;
    case "fins":
      return `${p.n} × ${p.shape === "freeform" ? "free-form" : p.shape}`;
    case "mount":
      return `${bldMountMM(p)} mm`;
    case "inner":
      return `${bldMountMM(p)} mm`;
    case "chute":
      return L_(p.dia);
    case "mass":
      return `${fmt(p.mass, "smass")} ${uname("smass")}`;
    case "buttons":
      return `${p.n} × ${p.size === "custom" ? "from file" : p.size}`;
    case "raw":
      return "kept from the file";
    default:
      return "";
  }
};
/**
 * Draws the parts tree: the rocket, its stages and their parts.
 */
function bldRenderTree() {
  const el = document.getElementById("bldtree");
  if (!el) return;
  let h = "";
  const multi = BLD.stages.length > 1;
  h += `<button class="bldrow stage${bldSel === BLD_ROOT ? " on" : ""}" data-id="${BLD_ROOT}"><b>ROCKET</b><span>TOP LEVEL</span></button>`;
  BLD.stages.forEach((st, si) => {
    if (multi)
      h += `<button class="bldrow stage${bldSel === st.id ? " on" : ""}" data-id="${st.id}"><b>${esc(st.name)}</b><span>stage ${si + 1}</span></button>`;
    st.parts.forEach((p) => {
      h += `<button class="bldrow${bldSel === p.id ? " on" : ""}" data-id="${p.id}"><b>${esc(p.name)}</b><span>${esc(bldSum(p))}</span></button>`;
      for (const k of p.kids || [])
        h += `<button class="bldrow kid${bldSel === k.id ? " on" : ""}" data-id="${k.id}"><b>${esc(k.name)}</b><span>${esc(bldSum(k))}</span></button>`;
    });
  });
  el.innerHTML = h;
  el.querySelectorAll(".bldrow").forEach(
    (b) =>
      (b.onclick = () => {
        bldSel = b.dataset.id;
        bldRender();
      }),
  );
}
let bldAddOpen = false;
/**
 * Which Motor tab target a builder stage is: sustainer (top), booster, or a three-stage rocket's first stage.
 * @param {number} si stage index
 * @returns {string}
 *
 * the Motor tab follows the mount size typed in the builder: it shows that size of motor
 * which Motor tab target a builder stage is: sustainer (top), booster, or a three-stage rocket's first stage (bottom)
 */
const bldTgt = (si) => (!(si > 0) ? "sustainer" : BLD && BLD.stages.length === 3 && si === 2 ? "first" : "booster");
/**
 * Points the Motor tab at the motor size of a mount being edited.
 * @param {object} p mount part
 */
function bldMountFilterFor(p) {
  const f = p && bldFind(p.id);
  if (!f) return;
  motorTarget = bldTgt(f.si);
  if (typeof mountFilter === "function") mountFilter();
  if (typeof renderMotors === "function") renderMotors();
}
/**
 * Draws the buttons for the parts that can be added where the selection is.
 */
function bldRenderAdd() {
  const el = document.getElementById("bldadd");
  if (!el) return;
  const f = bldSel ? bldFind(bldSel) : null;
  const body = f && f.p ? f.parent || f.p : null,
    si = f && f.si != null ? f.si : 0,
    hasNose = BLD.stages[0].parts.some((p) => p.type === "nose");
  const title = `Add a body part${body ? ` / Add to ${esc(body.name)}` : ""}`;
  if (!bldAddOpen) {
    el.innerHTML = `<button type="button" class="bldaddtoggle" aria-expanded="false"><span>＋ ${title}</span><span aria-hidden="true">▸</span></button>`;
    el.querySelector(".bldaddtoggle").onclick = () => {
      bldAddOpen = true;
      bldRenderAdd();
    };
    return;
  }
  let h = `<button type="button" class="bldaddtoggle" aria-expanded="true"><span>${title}</span><span aria-hidden="true">▾</span></button><div class="bldh">Add a body part${BLD.stages.length > 1 ? ` to ${esc(BLD.stages[si].name)}` : ""}</div><div class="bldadds">`;
  if (!hasNose && si === 0) h += `<button class="btn ghost" data-add="nose">Nose cone</button>`;
  h += `<button class="btn ghost" data-add="tube">Body tube</button><button class="btn ghost" data-add="transition">Transition</button></div>`;
  if (body)
    h += `<div class="bldh">Add to ${esc(body.name)}</div><div class="bldadds">${["fins", "mount", "inner", "ring", "bulkhead", "coupler", "lug", "buttons", "chute", "streamer", "cord", "mass"].map((t) => `<button class="btn ghost" data-add="${t}">${BLD_NAMES[t]}</button>`).join("")}</div>`;
  else
    h += `<p class="note" style="margin:6px 0 0">Select a body part to add fins, a motor mount, recovery and other parts to it.</p>`;
  {
    const n = BLD.stages.length;
    h += `<div class="bldadds" style="margin-top:12px">${n < 3 ? `<button class="btn ghost" data-stage="add">Add a ${n < 2 ? "booster" : "first"} stage</button>` : ""}${n > 1 ? `<button class="btn ghost" data-stage="del">Remove the ${n > 2 ? "first" : "booster"} stage</button>` : ""}</div>`;
  }
  el.innerHTML = h;
  el.querySelector(".bldaddtoggle").onclick = () => {
    bldAddOpen = false;
    bldRenderAdd();
  };
  // the section folds up again once a part is added
  el.querySelectorAll("[data-add]").forEach(
    (b) =>
      (b.onclick = () => {
        bldAddOpen = false;
        bldAdd(b.dataset.add);
      }),
  );
  el.querySelectorAll("[data-stage]").forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.stage === "add") {
          const third = BLD.stages.length === 2,
            above = BLD.stages[BLD.stages.length - 1],
            last = above.parts.slice(-1)[0],
            R = last ? bldBodyR(last) : 0.0333,
            nm = third ? "First stage" : "Booster";
          const t = { ...bldNew("tube", R), name: nm + " tube", len: R * 10 },
            m = { ...bldNew("mount", R), name: nm + " motor mount" };
          t.kids = [
            { ...bldNew("fins", R), name: nm + " fins", span: R * 2.6 },
            m,
            { ...bldNew("ring", R), name: "Aft centering ring", pos: 0.003 },
            { ...bldNew("ring", R), name: "Forward centering ring", pos: 0.185 },
          ];
          BLD.stages.push({ id: bldId(), name: nm, sepDelay: 0, parts: [t] });
          above.ignDelay = above.ignDelay || 0;
          if (BLD.stages[0].name === "Stage") BLD.stages[0].name = "Sustainer";
          bldSel = t.id;
          if (third) {
            if (!findMotor(firstId) || Math.abs(findMotor(firstId).dia - findMotor(boostId)?.dia) > 0.002) {
              firstId = boostId;
              store.set("rfs-b1motor", firstId);
            }
          } else if (!findMotor(boostId) || Math.abs(findMotor(boostId).dia - findMotor(motorId)?.dia) > 0.002) {
            boostId = motorId;
            store.set("rfs-bmotor", boostId);
          }
        } else {
          BLD.stages.length = BLD.stages.length - 1;
          bldSel = BLD.stages[0].parts[0]?.id || BLD_ROOT;
        }
        bldAddOpen = false;
        bldChanged(true);
      }),
  );
}
/**
 * Adds a part: a body part after the selection, or an attached part on the selected body part.
 * @param {string} type
 */
function bldAdd(type) {
  const f = bldSel ? bldFind(bldSel) : null,
    si = f && f.si != null ? f.si : 0,
    st = BLD.stages[si];
  if (BLD_BODY.includes(type)) {
    const at = f && f.p && !f.parent ? f.pi + 1 : f && f.parent ? f.pi + 1 : st.parts.length,
      prev = st.parts[at - 1],
      R = prev ? (prev.type === "nose" ? prev.dia / 2 : prev.type === "tube" ? prev.od / 2 : prev.dia2 / 2) : 0.0333;
    const p = bldNew(type, R);
    if (type === "nose") st.parts.unshift(p);
    else st.parts.splice(at, 0, p);
    bldSel = p.id;
  } else {
    const body = f && f.p ? f.parent || f.p : st.parts.find((p) => p.type === "tube") || st.parts[0];
    if (!body) return;
    const k = bldNew(type, bldBodyR(body));
    if (type === "ring" || type === "bulkhead" || type === "coupler") k.od = 0;
    if (type === "mount" && BLD.stages.indexOf(st) === 0 && !bldMounts(st).length) {
      const m = findMotor(motorId);
      if (m && Math.abs(m.dia - (k.od - 2 * k.wall)) < 0.002)
        k.motor = { id: m.id, mfr: m.mfr || m.brand, name: m.name, dia: m.dia, len: m.len };
    }
    body.kids = body.kids || [];
    body.kids.push(k);
    bldSel = k.id;
  }
  bldChanged(true);
}
/**
 * Draws the editor for the selected part, stage or rocket.
 */
function bldRenderEdit() {
  const el = document.getElementById("bldedit");
  if (!el) return;
  const f = bldSel ? bldFind(bldSel) : null;
  if (!f) {
    el.innerHTML = `<p class="note">Select a part to change it.</p>`;
    return;
  }
  if (f.root) {
    let h = `<div class="bldh">Whole rocket</div><div class="grid">`;
    for (const [key, label, kind, dim, obj, opts] of bldRootFields())
      h += bldFieldHtml(
        { key, label, kind, dim, opts },
        (obj || BLD)[key] ?? (key === "finish" ? BLD.settings.finish : key === "blMode" ? "turb" : undefined),
      );
    el.innerHTML = h + `</div>`;
    bldWire(el, null, "root");
    return;
  }
  if (f.stage) {
    const st = f.stage;
    let h = `<div class="bldh">${esc(st.name)}</div><div class="grid">`;
    for (const [key, label, kind, dim, obj, alias] of bldStageFields(st, f.si))
      h += bldFieldHtml({ key, label, kind, dim }, obj ? obj[alias] : st[key]);
    el.innerHTML = h + `</div>`;
    bldWire(el, st, "stage", f.si);
    return;
  }
  const p = f.p,
    fields = bldFields(p),
    body = !f.parent;
  let h = `<div class="bldh">${esc(BLD_NAMES[p.type])}${p.type === "raw" ? ` (${esc(p.tag)})` : ""}</div>`;
  // the motor itself is chosen on the Motor tab; the mount shows which one it holds
  {
    const host = p.type === "mount" ? p : p.type === "tube" && p.mm ? p.mm : null;
    if (host) {
      const f = bldFind(p.id),
        st = BLD.stages[f ? f.si : 0],
        primary = st && bldMounts(st)[0] === host;
      h += `<p class="note" style="margin:0 0 10px">Motor: <b>${esc(host.motor ? (host.motor.mfr ? host.motor.mfr + " " : "") + host.motor.name : "none")}</b>${primary ? ` · <a href="#" data-gomotor="1">choose it on the Motor tab</a>` : " · from the file"}</p>`;
    }
  }
  if (p.type === "raw")
    h += `<p class="note" style="margin:0 0 10px">This part came from the file and the builder can’t change its shape, but it still counts in the weight, balance and drag, and it’s kept when you save. You can rename or move it.</p>`;
  h += `<div class="grid">`;
  for (const [key, label, kind, opt] of fields) {
    const val =
      key === "isMount"
        ? !!p.mm
        : key === "mmMotor"
          ? p.mm && p.mm.motor
          : key === "mmDelay"
            ? p.mm && p.mm.delay
            : key === "mmOverhang"
              ? p.mm && p.mm.overhang
              : p[key];
    h += bldFieldHtml(
      {
        key,
        label,
        kind,
        dim: typeof opt === "string" ? opt : null,
        opts: Array.isArray(opt) ? opt : null,
        p,
        parent: f.parent,
      },
      val,
    );
  }
  h += `</div><div class="row" style="margin-top:12px;gap:8px">${body ? `<button class="btn ghost" data-act="up">Move forward</button><button class="btn ghost" data-act="down">Move aft</button>` : ""}<button class="btn ghost" data-act="dup">Duplicate</button><button class="btn ghost" data-act="del">Delete</button></div>`;
  if (p.type === "fins")
    h += `<canvas id="bldfinview" aria-label="This fin drawn to scale, with the sizes that set its shape"></canvas><p class="note" id="bldfinnote"></p>`;
  el.innerHTML = h;
  bldWire(el, p, "part");
  if (p.type === "fins") requestAnimationFrame(bldDrawFinEdit);
  el.querySelector("[data-gomotor]")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof mountFilter === "function") {
      motorTarget = bldTgt(f.si);
      mountFilter();
    }
    if (typeof renderMotors === "function") renderMotors();
    showTab("motor");
    window.scrollTo({ top: 0 });
  });
  el.querySelectorAll("[data-act]").forEach(
    (b) =>
      (b.onclick = () => {
        const st = BLD.stages[f.si];
        if (b.dataset.act === "del") {
          if (f.parent) {
            f.parent.kids.splice(f.ki, 1);
            bldSel = f.parent.id;
          } else {
            st.parts.splice(f.pi, 1);
            bldSel = st.parts[Math.max(0, f.pi - 1)]?.id || BLD_ROOT;
          }
        } else if (b.dataset.act === "dup") {
          const c = JSON.parse(JSON.stringify(p));
          const reid = (x) => {
            x.id = bldId();
            (x.kids || []).forEach(reid);
          };
          reid(c);
          c.name += " copy";
          if (f.parent) f.parent.kids.splice(f.ki + 1, 0, c);
          else st.parts.splice(f.pi + 1, 0, c);
          bldSel = c.id;
        } else {
          const j = f.pi + (b.dataset.act === "up" ? -1 : 1);
          if (j < 0 || j >= st.parts.length) return;
          [st.parts[f.pi], st.parts[j]] = [st.parts[j], st.parts[f.pi]];
        }
        bldChanged(true);
      }),
  );
}
/**
 * The HTML of one editor field.
 * @param {object} F field {key, label, kind, dim}
 * @param {*} val its value
 * @returns {string}
 */
function bldFieldHtml(F, val) {
  const id = "bf-" + F.key,
    wide = F.kind === "pts" || F.kind === "motor" || F.kind === "pos" || F.kind === "check";
  let inp = "";
  const num = (v, dim) =>
    v == null || v === "" || !isFinite(v)
      ? ""
      : +toDisp(+v, dim).toFixed(
          dim === "none"
            ? 4
            : dim === "moi"
              ? 3
              : Math.max(
                  DIMS[units][dim]?.[2] ?? 2,
                  dim === "len" && units === "imp" ? 2 : dim === "small" && units === "met" ? 2 : 0,
                ),
        ) + 0;
  switch (F.kind) {
    case "text":
      inp = `<div class="in"><input id="${id}" type="text" value="${esc(val ?? "")}"></div>`;
      break;
    case "int":
      inp = `<div class="in"><input id="${id}" type="number" inputmode="numeric" step="1" min="1" value="${val ?? 1}"></div>`;
      break;
    case "num": {
      const dim = F.dim || "none",
        blankable = ["delay", "mmDelay", "knownCg"].includes(F.key),
        v = blankable && (val == null || val === "") ? "" : num(val ?? 0, dim);
      inp = `<div class="in"><input id="${id}" type="number" inputmode="decimal" step="any" value="${v}">${uname(dim) ? `<span class="u">${uname(dim)}</span>` : ""}</div>`;
      break;
    }
    case "check":
      inp = `<label class="chk"><input id="${id}" type="checkbox" ${val ? "checked" : ""}> <span>${esc(F.label)}</span></label>`;
      break;
    case "sel":
      inp = `<div class="in"><select id="${id}">${F.opts.map(([k, l]) => `<option value="${esc(k)}" ${String(val) === String(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
      break;
    case "finish":
      inp = `<div class="in"><select id="${id}">${val ? "" : `<option value="" selected>As set on each part</option>`}${BLD_FINISH.map(([k, l]) => `<option value="${k}" ${val === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
      break;
    case "bulk":
    case "surf":
    case "line": {
      const list = F.kind === "bulk" ? BLD_BULK : F.kind === "surf" ? BLD_SURF : BLD_LINE,
        std = list.some((x) => x[0] === val);
      inp = `<div class="in"><select id="${id}">${std ? "" : `<option value="${esc(val || "")}" selected>${esc(val || "From file")} (from file)</option>`}${list.map(([nm]) => `<option ${nm === val ? "selected" : ""}>${esc(nm)}</option>`).join("")}</select></div>`;
      break;
    }
    case "pts": {
      const t = String(val || "")
        .split(/[\n;]+/)
        .map((l) =>
          l
            .split(/[ ,\t]+/)
            .filter(Boolean)
            .map(Number),
        )
        .filter((a) => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]))
        .map((a) => `${num(a[0], "len")}, ${num(a[1], "len")}`)
        .join("\n");
      inp = `<div class="in"><textarea id="${id}" rows="6" spellcheck="false" placeholder="0, 0\n${num(0.1, "len")}, ${num(0.08, "len")}\n${num(0.15, "len")}, ${num(0.08, "len")}\n${num(0.15, "len")}, 0">${esc(t)}</textarea></div>`;
      break;
    }
    case "size": {
      const mm = bldMountMM(F.p),
        opts = BLD_SIZES.map((s) => `<option value="${s}" ${s === mm ? "selected" : ""}>${s} mm</option>`).join("");
      inp = `<div class="in"><select id="${id}">${BLD_SIZES.includes(mm) ? "" : `<option value="" selected>${mm} mm (custom)</option>`}${opts}</select></div>`;
      break;
    }
    case "motor": {
      const host = F.key === "mmMotor" ? F.p : F.p,
        inner = F.key === "mmMotor" ? host.od - 2 * host.wall : host.od - 2 * host.wall,
        list = allMotors()
          .filter((m) => m.dia <= inner + 0.0005 && m.dia >= inner - 0.004)
          .sort((a, b) => a.dia - b.dia || motorStats(a).I - motorStats(b).I);
      const cur = val && ((val.id && findMotor(val.id)) || list.find((m) => m.name === val.name)),
        extra =
          val && !cur ? `<option value="__file" selected>${esc(val.name)} (from file, not in your list)</option>` : "";
      inp = `<div class="in"><select id="${id}"><option value="">None yet</option>${extra}${list.map((m) => `<option value="${esc(m.id)}" ${cur && cur.id === m.id ? "selected" : ""}>${esc((m.cn && m.cn !== m.name ? m.cn + " " : "") + m.name)} · ${Math.round(m.dia * 1000)} mm · ${esc((m.brand || m.mfr || "") + (m.builtin ? "" : ", uploaded"))}</option>`).join("")}</select></div>`;
      break;
    }
    case "pos": {
      inp = `<div class="row" style="gap:6px;flex-wrap:nowrap"><div class="in" style="flex:1.4"><select id="bf-ref"><option value="bottom" ${F.p.ref !== "top" ? "selected" : ""}>From aft end</option><option value="top" ${F.p.ref === "top" ? "selected" : ""}>From front</option></select></div><div class="in" style="flex:1"><input id="${id}" type="number" inputmode="decimal" step="any" value="${num(val, "len")}"><span class="u">${uname("len")}</span></div></div>`;
      break;
    }
  }
  const label = F.kind === "pos" ? `Position on ${F.parent ? F.parent.name : "the body"}` : F.label;
  const ib = infoBtn(F.kind === "pos" ? "Position" : label, bldInfo(F));
  return F.kind === "check"
    ? `<div class="fld wide"><div class="chkrow">${inp}${ib}</div></div>`
    : `<div class="fld${wide ? " wide" : ""}"><div class="lh"><label for="${id}">${esc(label)}</label>${ib}</div>${inp}</div>`;
}
/**
 * Connects the editor's inputs to the part they edit.
 * @param {HTMLElement} el editor
 * @param {object} p part, stage or rocket
 * @param {string} mode "root", "stage" or "part"
 * @param {number} si stage index
 */
function bldWire(el, p, mode, si) {
  const spec = mode === "root" ? bldRootFields() : mode === "stage" ? bldStageFields(p, si) : bldFields(p);
  el.querySelectorAll("[id^=bf-]").forEach((inp) => {
    const key = inp.id.slice(3);
    const ev = inp.tagName === "SELECT" || inp.type === "checkbox" ? "change" : "input";
    inp.addEventListener(ev, () => {
      const f = spec.find((x) => x[0] === key) || (key === "ref" ? ["ref", "", "ref"] : null);
      if (!f) return;
      const kind = f[2],
        dim = typeof f[3] === "string" ? f[3] : "none";
      // where the value lives: the part, the stage, or the rocket-wide settings
      let O = p,
        k = key;
      if (mode === "root") {
        O = f[4] || BLD;
        if (key === "finish") O = BLD.settings;
      }
      if (mode === "stage" && f[4]) {
        O = f[4];
        k = f[5];
      }
      let full = false;
      if (key === "ref") {
        p.ref = inp.value;
      } else if (kind === "text") {
        O[k] = inp.value;
        if (mode === "root" && key === "name") renderTitle();
      } else if (kind === "int") {
        const v = parseInt(inp.value, 10);
        if (v >= 1) O[k] = Math.min(v, 24);
      } else if (kind === "check") {
        if (key === "isMount") {
          p.mm = inp.checked ? { overhang: 0.006, motor: null, delay: null, ign: "automatic", ignDelay: 0 } : null;
          if (inp.checked) {
            const m = findMotor(motorId);
            if (m && Math.abs(m.dia - (p.od - 2 * p.wall)) < 0.002)
              p.mm.motor = { id: m.id, mfr: m.mfr || m.brand, name: m.name, dia: m.dia, len: m.len };
          }
        } else O[k] = inp.checked;
        full = true;
      } else if (kind === "sel") {
        O[k] = inp.value;
        full = ["shape", "deploy", "size", "cluster", "ign"].includes(key);
        // switching fins to free-form starts from the outline they had, so there's a shape to edit
        if (key === "shape" && p && p.type === "fins" && inp.value === "freeform" && !bldPts(p).pts.length) {
          const r = p.root || 0.1,
            sp = p.span || 0.05,
            sw = p.sweep || 0,
            tp = p.tip || 0;
          p.pts = [
            [0, 0],
            [sw, sp],
            [sw + tp, sp],
            [r, 0],
          ]
            .map(([x, y]) => `${+x.toFixed(6)},${+y.toFixed(6)}`)
            .join("\n");
        }
      } else if (kind === "finish") {
        BLD.settings.finish = inp.value || null;
        if (inp.value)
          for (const st of BLD.stages)
            for (const q of st.parts) {
              delete q.finish;
              for (const c of q.kids || []) delete c.finish;
            }
        full = true;
      } else if (kind === "bulk" || kind === "surf" || kind === "line") {
        const list = kind === "bulk" ? BLD_BULK : kind === "surf" ? BLD_SURF : BLD_LINE;
        if (list.some((x) => x[0] === inp.value)) {
          O[k] = inp.value;
          delete O.dens;
        }
      } else if (kind === "pts") {
        p.pts = inp.value
          .split(/\n+/)
          .map((l) =>
            l
              .split(/[ ,\t]+/)
              .filter(Boolean)
              .map(Number),
          )
          .filter((a) => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]))
          .map((a) => `${fromDisp(a[0], "len")},${fromDisp(a[1], "len")}`)
          .join("\n");
      } else if (kind === "size") {
        const s = parseInt(inp.value, 10);
        if (s > 0) {
          p.od = s / 1000 + 2 * p.wall + 0.0004;
          if (p.motor && Math.abs(p.motor.dia - s / 1000) > 0.0015) p.motor = null;
          full = true;
        }
      } else if (kind === "motor") {
        if (inp.value === "__file") return;
        const m = findMotor(inp.value),
          host = key === "mmMotor" ? p.mm : p;
        const hadM = host.motor
          ? findMotor(host.motor.id) || allMotors().find((x) => x.name === host.motor.name)
          : null;
        host.motor = m ? { id: m.id, mfr: m.mfr || m.brand, name: m.name, dia: m.dia, len: m.len } : null;
        // the delay (set on the Motor tab): a new mount's first motor gets its middle stock delay; a stock delay of the
        // previous motor moves to the nearest one this motor offers; plugged and custom times stay
        if (m) {
          const b = mdStock(m).list.filter((x) => x > 0);
          if (!hadM && host.delay == null) {
            if (b.length) host.delay = b[Math.floor(b.length / 2)];
          } else if (
            hadM &&
            host.delay != null &&
            b.length &&
            !b.includes(+host.delay) &&
            mdStock(hadM).list.includes(+host.delay)
          )
            host.delay = b.reduce((x, y) => (Math.abs(y - host.delay) < Math.abs(x - host.delay) ? y : x), b[0]);
        }
        // the stage's main mount flies the motor the Motor tab shows
        const f2 = bldFind(p.id),
          st = BLD.stages[f2 ? f2.si : 0],
          isPrimary = bldMounts(st)[0] === host;
        if (m && isPrimary) {
          const tg = bldTgt(BLD.stages.indexOf(st));
          if (tg === "sustainer") {
            motorId = m.id;
            store.set("rfs-motor", motorId);
          } else if (tg === "first") {
            firstId = m.id;
            store.set("rfs-b1motor", firstId);
          } else {
            boostId = m.id;
            store.set("rfs-bmotor", boostId);
          }
          if (typeof mountFilter === "function") {
            motorTarget = tg;
            mountFilter();
          }
          if (typeof renderMotors === "function") renderMotors();
        }
        full = true;
      } else if (kind === "num" || kind === "pos") {
        const raw = inp.value.trim();
        const blank = raw === "";
        if (blank && (key === "delay" || key === "mmDelay")) {
          (key === "mmDelay" ? p.mm : O).delay = null;
        } else if (blank && key === "knownCg") {
          delete O.knownCg;
        } else {
          const v = parseFloat(raw);
          if (!isFinite(v)) return;
          const val = fromDisp(v, kind === "pos" ? "len" : dim);
          if (key === "mmDelay") p.mm.delay = val;
          else if (key === "mmOverhang") p.mm.overhang = val;
          else {
            O[k] = val;
            if (k === "packLen" || k === "packR" || k === "len") delete O.packAuto;
            if (kind === "num" && !["pos", "param", "cant", "knownCg"].includes(key) && O[k] < 0) O[k] = 0;
          }
        }
      }
      // RockSim's own weight for a part no longer fits once the part changes; typing a weight makes it a measured one
      if (
        p &&
        p.knownCalc &&
        mode !== "root" &&
        mode !== "stage" &&
        !["name", "pos", "ref", "known", "knownAll"].includes(key)
      ) {
        p.known = 0;
        delete p.knownCg;
        delete p.knownCalc;
        full = true;
      } else if (p && key === "known") delete p.knownCalc;
      bldChanged(full);
      if (kind === "size") bldMountFilterFor(p);
    });
    // fields that change what else is shown redraw the panel once typing is done, so the keyboard stays open while typing
    if (ev === "input" && ((key === "od" && p && p.type === "mount") || key === "known"))
      inp.addEventListener("change", () => {
        bldChanged(true);
        if (key === "od") bldMountFilterFor(p);
      });
    if (ev === "input" && p && p.type === "tube" && p.mm && (key === "od" || key === "wall"))
      inp.addEventListener("change", () => bldMountFilterFor(p));
  });
}
/**
 * Draws the side view of the rocket with its parts, CG and CP, and records the clickable areas.
 */
function bldDraw() {
  const cv = document.getElementById("bldcv");
  if (!cv || !BLD || !cv.getBoundingClientRect().width) return;
  const { c, W, H } = setupCanvas(cv),
    cs = getComputedStyle(document.documentElement),
    col = (k) => cs.getPropertyValue(k).trim() || "#888";
  c.clearRect(0, 0, W, H);
  bldHits = [];
  const lay = bldLayout(BLD),
    R = lay.maxR;
  let span = 0;
  for (const b of lay.bodies)
    for (const k of b.kids)
      if (k.k.type === "fins")
        span = Math.max(span, k.k.shape === "freeform" ? Math.max(0, ...bldPts(k.k).pts.map((p) => p[1])) : k.k.span);
  // the drawing fits everything: fins swept back past the end of the body (or a fin tip swept forward) included
  let xLo = 0,
    xHi = lay.length;
  for (const b of lay.bodies)
    for (const kk of b.kids) {
      const k = kk.k;
      if (k.type !== "fins") continue;
      let lo = 0,
        hi = k.root || 0;
      if (k.shape === "freeform") {
        const P = bldPts(k).pts;
        if (P.length) {
          const mx = Math.min(...P.map((p) => p[0]));
          hi = Math.max(...P.map((p) => p[0])) - mx;
        }
      } else if (k.shape !== "elliptical") {
        lo = Math.min(0, k.sweep || 0);
        hi = Math.max(k.root || 0, (k.sweep || 0) + (k.tip || 0));
      }
      xLo = Math.min(xLo, kk.x + lo);
      xHi = Math.max(xHi, kk.x + hi);
    }
  const ext = Math.max(xHi - xLo, 0.05);
  const padX = 14,
    sc = Math.min((W - 2 * padX) / ext, (H - 40) / (2 * (R + span) + 0.002)),
    x0 = padX + (W - 2 * padX - ext * sc) / 2 - xLo * sc,
    yc = (H - 22) / 2 + 2;
  const X = (x) => x0 + x * sc,
    Y = (r) => yc - r * sc,
    Yb = (r) => yc + r * sc;
  const ink = col("--ink"),
    acc = col("--accent"),
    mut = col("--muted"),
    fld = col("--field");
  const rAt = (b, x) => {
    const t = Math.min(Math.max(x - b.x, 0), b.len);
    if (b.p.type === "tube") return b.r1;
    if (b.p.type === "nose") return noseR(b.p.shape, b.p.param, t, b.r2, b.len);
    return b.r2 >= b.r1
      ? b.r1 + (b.r2 - b.r1) * noseR(b.p.shape, b.p.param, t, 1, b.len)
      : b.r2 + (b.r1 - b.r2) * noseR(b.p.shape, b.p.param, b.len - t, 1, b.len);
  };
  const bodyAt = (x) =>
    lay.bodies.find((b) => x >= b.x - 1e-9 && x <= b.x + b.len + 1e-9) || lay.bodies[lay.bodies.length - 1];
  // stages: the one being edited is shaded and named, so it's clear which stage a part or setting belongs to
  const stR = BLD.stages.map((_, si) => {
    const bs = lay.bodies.filter((b) => b.si === si);
    return bs.length ? [bs[0].x, bs[bs.length - 1].x + bs[bs.length - 1].len] : null;
  });
  if (BLD.stages.length > 1) {
    const fs = bldSel ? bldFind(bldSel) : null,
      ss = fs && fs.si != null ? fs.si : null;
    BLD.stages.forEach((stg, si) => {
      const r = stR[si];
      if (!r) return;
      const on = si === ss;
      if (on) {
        c.fillStyle = acc + "14";
        c.fillRect(X(r[0]), 2, (r[1] - r[0]) * sc, H - 24);
      }
      c.font = `${on ? 700 : 500} 10px ${cs.getPropertyValue("--f-body") || "sans-serif"}`;
      c.textAlign = "center";
      c.fillStyle = on ? acc : mut;
      c.fillText(stg.name || `Stage ${si + 1}`, X((r[0] + r[1]) / 2), 11);
      c.textAlign = "start";
    });
  }
  // fins first (behind the body); the ones on the near side are drawn after it
  const frontFins = [],
    finSets = [];
  for (const b of lay.bodies)
    for (const kk of b.kids) {
      const k = kk.k;
      if (k.type !== "fins") continue;
      const on = k.id === bldSel;
      const rr = rAt(bodyAt(kk.x + 0.0001), kk.x + 0.0001);
      let pts;
      if (k.shape === "freeform") {
        const P = bldPts(k).pts;
        if (!P.length) continue;
        const mx = Math.min(...P.map((p) => p[0]));
        pts = P.map(([x, y]) => [x - mx, y]);
      } else if (k.shape === "elliptical") {
        pts = [];
        for (let i = 0; i <= 24; i++) {
          const th = (Math.PI * i) / 24;
          pts.push([(k.root / 2) * (1 - Math.cos(th)), k.span * Math.sin(th)]);
        }
      } else
        pts = [
          [0, 0],
          [k.sweep, k.span],
          [k.sweep + k.tip, k.span],
          [k.root, 0],
        ];
      // each fin is drawn where it really sits around the body, seen from the side: fins on the near side go in front of the body
      const nF = Math.max(1, k.n || 3),
        rot0 = ((k.rot || 0) * Math.PI) / 180;
      for (let i = 0; i < nF; i++) {
        const ph = rot0 + (2 * Math.PI * i) / nF,
          cs_ = Math.cos(ph),
          sn = Math.sin(ph);
        const draw = () => {
          c.beginPath();
          pts.forEach(([x, y], j) => {
            const px = X(kk.x + x),
              py = Y((rr + y) * cs_);
            j ? c.lineTo(px, py) : c.moveTo(px, py);
          });
          c.closePath();
          c.fillStyle = on ? acc + (sn > 0.01 ? "55" : "33") : fld;
          c.fill();
          c.strokeStyle = on ? acc : ink;
          c.lineWidth = on ? 2 : 1.2;
          c.stroke();
        };
        if (sn > 0.01) frontFins.push(draw);
        else draw();
      }
      finSets.push({ k, on, rr });
      bldHits.push({
        id: k.id,
        x1: X(kk.x),
        x2: X(kk.x + bldLen(k)),
        y1: Y(rr + (k.span || 0.05)),
        y2: Yb(rr + (k.span || 0.05)),
        pri: 2,
      });
    }
  // body outline
  for (const b of lay.bodies) {
    const on = b.p.id === bldSel,
      N = b.p.type === "tube" ? 2 : 40;
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = b.x + (b.len * i) / N;
      const px = X(x),
        py = Y(rAt(b, x));
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    for (let i = N; i >= 0; i--) {
      const x = b.x + (b.len * i) / N;
      c.lineTo(X(x), Yb(rAt(b, x)));
    }
    c.closePath();
    c.fillStyle = on ? acc + "22" : col("--panel");
    c.fill();
    c.strokeStyle = on ? acc : ink;
    c.lineWidth = on ? 2 : 1.4;
    c.stroke();
    bldHits.push({
      id: b.p.id,
      x1: X(b.x),
      x2: X(b.x + b.len),
      y1: Y(Math.max(b.r1, b.r2)),
      y2: Yb(Math.max(b.r1, b.r2)),
      pri: 1,
    });
    if (b.p.type === "nose" && b.p.shLen > 0) {
      c.setLineDash([3, 3]);
      c.strokeStyle = mut;
      c.lineWidth = 1;
      const sr = b.p.shR > 0 ? b.p.shR : b.r2 - b.p.wall;
      c.strokeRect(X(b.x + b.len), Y(sr), b.p.shLen * sc, 2 * sr * sc);
      c.setLineDash([]);
    }
    if (b.p.mm && b.p.mm.motor) {
      const m = b.p.mm.motor,
        ml = m.len || 0.1;
      c.fillStyle = "rgba(120,120,120,.25)";
      c.fillRect(X(b.x + b.len + (b.p.mm.overhang || 0) - ml), Y(m.dia / 2), ml * sc, m.dia * sc);
    }
  }
  // a small view from behind shows how many fins there are and where they sit
  {
    const fsel = finSets.find((f) => f.on) || finSets[0];
    if (fsel) {
      const k = fsel.k,
        nF = Math.max(1, k.n || 3),
        rot0 = ((k.rot || 0) * Math.PI) / 180,
        rf = 15,
        rb = 6,
        cx = 6 + rf,
        cy = H - 6 - rf;
      c.fillStyle = col("--panel");
      c.strokeStyle = fsel.on ? acc : ink;
      c.lineWidth = 1.2;
      c.lineWidth = 2.4;
      for (let i = 0; i < nF; i++) {
        const ph = rot0 + (2 * Math.PI * i) / nF;
        c.beginPath();
        c.moveTo(cx + rb * Math.sin(ph), cy - rb * Math.cos(ph));
        c.lineTo(cx + rf * Math.sin(ph), cy - rf * Math.cos(ph));
        c.stroke();
      }
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(cx, cy, rb, 0, 2 * Math.PI);
      c.fill();
      c.stroke();
      c.font = `500 9px ${cs.getPropertyValue("--f-body") || "sans-serif"}`;
      c.textAlign = "start";
      c.fillStyle = mut;
      c.fillText(`${nF} fin${nF === 1 ? "" : "s"} · aft view`, cx + rf + 5, cy + 3);
      c.textAlign = "start";
    }
  }
  // stage joint
  for (let si = 1; si < BLD.stages.length; si++) {
    const j = lay.bodies.find((b) => b.si === si);
    if (j) {
      c.setLineDash([2, 3]);
      c.strokeStyle = mut;
      c.beginPath();
      c.moveTo(X(j.x), Y(R + span * 0.3));
      c.lineTo(X(j.x), Yb(R + span * 0.3));
      c.stroke();
      c.setLineDash([]);
    }
  }
  // inside and outside parts
  for (const b of lay.bodies)
    for (const kk of b.kids) {
      const k = kk.k,
        on = k.id === bldSel;
      if (k.type === "fins") continue;
      const x1 = X(kk.x),
        x2 = X(kk.x + Math.max(kk.len, 0.002)),
        rr = rAt(b, Math.min(Math.max(kk.x, b.x), b.x + b.len)),
        ri = Math.max(rr - (b.p.wall || 0), 0.001);
      c.strokeStyle = on ? acc : mut;
      c.fillStyle = on ? acc + "44" : mut + "33";
      c.lineWidth = on ? 2 : 1;
      let hit = null;
      switch (k.type) {
        case "mount":
        case "inner": {
          const ro = k.od / 2;
          c.setLineDash([4, 3]);
          c.strokeRect(x1, Y(ro), kk.len * sc, 2 * ro * sc);
          c.setLineDash([]);
          if (k.type === "mount" && k.overhang > 0) {
            c.strokeRect(X(kk.x + kk.len), Y(ro * 0.85), k.overhang * sc, 1.7 * ro * sc);
          }
          if (k.motor) {
            const ml = k.motor.len || 0.1,
              mx = kk.x + kk.len + (k.overhang || 0) - ml;
            c.fillStyle = on ? acc + "55" : "rgba(120,120,120,.25)";
            c.fillRect(X(mx), Y((k.motor.dia || k.od * 0.9) / 2), ml * sc, (k.motor.dia || k.od * 0.9) * sc);
          }
          hit = [x1, X(kk.x + kk.len), Y(ro), Yb(ro)];
          break;
        }
        case "ring":
        case "bulkhead": {
          const ro = k.od > 0 ? k.od / 2 : ri,
            hole = k.type === "ring" ? (k.id_ > 0 ? k.id_ / 2 : bldMountR(b)) : 0;
          // selected, a thin ring is drawn wider (only on screen) so it stands out; its real thickness doesn't change
          const tw = kk.len * sc,
            w = on ? Math.max(tw, 7) : Math.max(tw, 2),
            xr = on ? x1 + tw / 2 - w / 2 : x1;
          if (on) {
            c.fillStyle = acc + "cc";
            c.lineWidth = 1.5;
          }
          c.fillRect(xr, Y(ro), w, (ro - hole) * sc);
          c.fillRect(xr, Yb(hole), w, (ro - hole) * sc);
          if (on) {
            c.strokeRect(xr, Y(ro), w, (ro - hole) * sc);
            c.strokeRect(xr, Yb(hole), w, (ro - hole) * sc);
          }
          hit = [x1 - 3, x2 + 3, Y(ro), Yb(ro)];
          break;
        }
        case "coupler": {
          const ro = k.od > 0 ? k.od / 2 : ri;
          c.setLineDash([2, 3]);
          c.strokeRect(x1, Y(ro), kk.len * sc, 2 * ro * sc);
          c.setLineDash([]);
          hit = [x1, x2, Y(ro), Yb(ro)];
          break;
        }
        case "lug": {
          c.fillRect(x1, Y(rr + k.od), kk.len * sc, k.od * sc);
          hit = [x1, x2, Y(rr + k.od) - 4, Y(rr) + 2];
          break;
        }
        case "buttons": {
          const P = k.size === "custom" && k.dims ? k.dims : BLD_BUTTONS[k.size] || BLD_BUTTONS["1010"];
          for (let i = 0; i < k.n; i++) {
            const bx = X(kk.x + i * k.sep);
            c.fillRect(bx - (P.od * sc) / 2, Yb(rr), Math.max(P.od * sc, 3), Math.max(P.h * sc, 3));
          }
          hit = [x1 - 4, X(kk.x + (k.n - 1) * k.sep) + 4, Yb(rr) - 2, Yb(rr + P.h) + 4];
          break;
        }
        case "chute":
        case "streamer": {
          const pr = ri * 0.8;
          c.beginPath();
          c.ellipse((x1 + x2) / 2, yc, Math.max((x2 - x1) / 2, 3), pr * sc, 0, 0, 2 * Math.PI);
          c.fill();
          c.stroke();
          hit = [x1, x2, Y(pr), Yb(pr)];
          break;
        }
        case "cord": {
          const pr = ri * 0.5;
          c.beginPath();
          for (let i = 0; i <= 12; i++) {
            const px = x1 + ((x2 - x1) * i) / 12;
            c.lineTo(px, yc + (i % 2 ? -1 : 1) * pr * sc);
          }
          c.stroke();
          hit = [x1, x2, Y(pr), Yb(pr)];
          break;
        }
        case "mass": {
          const pr = ri * 0.5;
          c.fillRect(x1, Y(pr), Math.max(kk.len * sc, 4), 2 * pr * sc);
          hit = [x1, x2, Y(pr), Yb(pr)];
          break;
        }
        case "raw": {
          const pr = ri * 0.6;
          c.setLineDash([1, 3]);
          c.strokeRect(x1, Y(pr), Math.max(kk.len * sc, 4), 2 * pr * sc);
          c.setLineDash([]);
          hit = [x1, Math.max(x2, x1 + 6), Y(pr), Yb(pr)];
          break;
        }
      }
      if (hit) bldHits.push({ id: k.id, x1: hit[0], x2: hit[1], y1: hit[2], y2: hit[3], pri: 3 });
    }
  // fins on the near side cover the body and what is inside it, a little see-through
  c.save();
  c.globalAlpha = 0.85;
  frontFins.forEach((f) => f());
  c.restore();
  // CG with the motor in, and CP: the same numbers the flight uses
  const st = document.getElementById("bldstats");
  try {
    const two = !!D.twoStage,
      m = flightMotor(),
      mb = two ? flightBoost() : null,
      SU = stability(D, m),
      S = two ? stackStability(D, m, mb) : SU;
    const m1 = isThree(D) ? flightFirst() : null,
      dry = (two ? D.dryMass + D.bDryMass : D.dryMass) + (m1 ? D.s1.bDryMass : 0),
      lift = dry + (m ? m.totalMass : 0) + (two && mb ? mb.totalMass : 0) + (m1 ? m1.totalMass : 0);
    const mark = (x, kind) => {
      const px = X(x),
        py = yc + (R + span) * sc + 12;
      c.lineWidth = 1.5;
      if (kind === "cg") {
        c.strokeStyle = col("--cg");
        c.fillStyle = col("--cg");
        c.beginPath();
        c.arc(px, py, 6, 0, 2 * Math.PI);
        c.stroke();
        c.beginPath();
        c.moveTo(px, py);
        c.arc(px, py, 6, -Math.PI / 2, 0);
        c.closePath();
        c.fill();
        c.beginPath();
        c.moveTo(px, py);
        c.arc(px, py, 6, Math.PI / 2, Math.PI);
        c.closePath();
        c.fill();
      } else {
        c.strokeStyle = col("--bad");
        c.fillStyle = col("--bad");
        c.beginPath();
        c.arc(px, py, 6, 0, 2 * Math.PI);
        c.stroke();
        c.beginPath();
        c.arc(px, py, 2.2, 0, 2 * Math.PI);
        c.fill();
      }
    };
    mark(S.cgL, "cg");
    mark(S.cp, "cp");
    const cls = (v) => (v >= 1.5 ? "good" : v >= 1 ? "warn" : "bad"),
      mname =
        (m1 ? `${m1.cn || m1.name} → ` : "") + (two && mb ? `${mb.cn || mb.name} → ${m.cn || m.name}` : m.cn || m.name);
    st.innerHTML =
      `<span>Length <b>${fmt(lay.length, "len", 1)} ${uname("len")}</b></span><span>Diameter <b>${fmt(2 * lay.maxR, "len")} ${uname("len")}</b></span>` +
      `<span>Weight <b>${fmt(dry, "mass")} ${uname("mass")}</b> empty, <b>${fmt(lift, "mass")} ${uname("mass")}</b> on ${esc(mname)}</span>` +
      `<span><i class="dotcg"></i>CG <b>${fmt(S.cgL, "len", 1)} ${uname("len")}</b> with motor</span><span><i class="dotcp"></i>CP <b>${fmt(S.cp, "len", 1)} ${uname("len")}</b></span>` +
      `<span class="${cls(S.marginL)}">Stability <b>${S.marginL.toFixed(2)} cal</b> at liftoff, <b>${S.marginB.toFixed(2)}</b> at burnout${two ? ` · sustainer alone ${SU.marginL.toFixed(2)}` : ""}</span>`;
    const stx = document.getElementById("stabtxt");
    if (stx)
      stx.textContent = two
        ? `Stack ${S.marginL.toFixed(2)} cal at liftoff · sustainer ${SU.marginL.toFixed(2)} cal alone`
        : `Margin ${S.marginL.toFixed(2)} cal at liftoff, ${S.marginB.toFixed(2)} at burnout`;
  } catch (e) {
    st.innerHTML = `<span class="bad">${esc(e.message || String(e))}</span>`;
  }
}
/**
 * Selects the part tapped on in the side view.
 * @param {MouseEvent} ev
 */
function bldPick(ev) {
  const cv = document.getElementById("bldcv"),
    rc = cv.getBoundingClientRect(),
    x = ev.clientX - rc.left,
    y = ev.clientY - rc.top;
  const hit = bldHits
    .filter(
      (h) =>
        x >= Math.min(h.x1, h.x2) - 2 &&
        x <= Math.max(h.x1, h.x2) + 2 &&
        y >= Math.min(h.y1, h.y2) - 2 &&
        y <= Math.max(h.y1, h.y2) + 2,
    )
    .sort((a, b) => b.pri - a.pri)[0];
  if (hit) {
    bldSel = hit.id;
    bldRender();
    document.getElementById("bldedit").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}
/**
 * Starts a new design from scratch: a basic flyable rocket with a 29 mm motor.
 *
 * a new design from scratch: a basic flyable rocket to change
 */
function bldNewDesign() {
  BLD = bldDefault();
  bldSel = BLD.stages[0].parts[0].id;
  const fit = allMotors()
    .filter((m) => Math.abs(m.dia - 0.029) < 0.0008)
    .sort((a, b) => Math.abs(motorStats(a).I - 120) - Math.abs(motorStats(b).I - 120))[0];
  if (fit) {
    motorId = fit.id;
    store.set("rfs-motor", motorId);
  }
  setSource(null);
  bldSave();
  bldDerive();
  // a new design has no file yet: Save changes must not write into the file opened before
  try {
    const A = window.PocketRocketApp;
    if (A && A.clearSource) A.clearSource();
  } catch (_) {}
  document.getElementById("orkreport").innerHTML =
    `<div class="report">Started a new design from a basic rocket: nose cone, body tube, three fins, a 29 mm motor mount and a parachute. Select any part below to change it, or add parts to it.</div>`;
  setActive(true);
  markClean();
  bldRender();
  changed();
  if (typeof renderMotors === "function") {
    motorTarget = "sustainer";
    mountFilter();
    renderMotors();
  }
}
document.getElementById("bldcv").addEventListener("click", bldPick);
window.addEventListener("resize", () => {
  if (BLD) {
    bldDraw();
    bldDrawFinEdit();
  }
});
