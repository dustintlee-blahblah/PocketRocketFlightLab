/**
 * Writes a design as a RockSim file (.rkt). The other way round from rocksim-import.js: the design as this app saves it
 * for OpenRocket (builder/ork-export.js) is rewritten part for part in RockSim's layout, in millimetres and grams,
 * with the same reading of RockSim's fields that the reader has.
 *
 * What is written is the layout OpenRocket's own "export as RockSim" produces (file version 4: the design and its
 * parts, each with its weight and balance point), which RockSim is known to open. RockSim keeps motors, launch
 * conditions and when each recovery device opens in its simulations, which are not written; those, and what RockSim's
 * parts cannot say, are listed in the notes that come back with the file.
 */
import { esc } from "../core/helpers.js";
import { parseOrk } from "./openrocket-import.js";

/** RockSim's finish codes, nose and transition shape codes, and fin edge codes (as rocksim-import.js reads them). */
const RKT_FINISH = ["polished", "smooth", "normal", "unfinished"];
const RKT_SHAPE = { conical: 0, ogive: 1, ellipsoid: 3, power: 4, parabolic: 5, haack: 6 };
const RKT_EDGE = { square: 0, rounded: 1, airfoil: 2 };

/**
 * A design as a RockSim file.
 * @param {string} orkXml the design as an OpenRocket document (bldToOrk)
 * @param {object} [info] what the document doesn't say in a form to copy:
 *   cd: [sustainer, sustainer + booster, all three] fixed drag coefficients to write, or null to leave RockSim
 *   calculating its own; rail: launch guide length, m; sim: a simulation to write ({name, angle (degrees), wind (m/s),
 *   elev (m), tempC, lat, humidity (0 to 1), pressure (Pa), turb (gustiness, 0 to 1), engines: for each stage from the top, a list of {code, mfg,
 *   count, ignDelay, ejDelay (s; below 0 plugged), overhang (m)}})
 * @returns {{text:string, notes:string[]}} the file, and what of the design it does not hold
 * @throws {Error} if the document can't be read
 */
export function orkToRkt(orkXml, info = {}) {
  const doc = new DOMParser().parseFromString(orkXml, "application/xml"),
    rocket = doc.getElementsByTagName("rocket")[0];
  if (!rocket || doc.getElementsByTagName("parsererror").length) throw new Error("The design could not be read.");
  const notes = new Set();
  const kid = (el, tag) => [...el.children].find((c) => c.tagName === tag) || null,
    txt = (el, tag) => {
      const c = kid(el, tag);
      return c ? c.textContent.trim() : "";
    },
    // a number, with OpenRocket's "auto " prefix dropped
    num = (el, tag, def = 0) => {
      const v = parseFloat(txt(el, tag).replace(/^auto\s*/, ""));
      return isFinite(v) ? v : def;
    },
    mm = (m) => String(+(m * 1000).toFixed(4)),
    g = (kg) => String(+(kg * 1000).toFixed(4)),
    subs = (el) => [...(kid(el, "subcomponents")?.children || [])];
  let serial = 0,
    stageNow = 0;
  // what a simulation needs to point at: each stage's motor mounts and the recovery devices, by serial number
  const mounts = [[], [], []],
    devices = [];
  /**
   * The fields every RockSim part starts with.
   * @param {Element} el the OpenRocket part
   * @param {{len:number, parentLen?:number, cgShift?:number, massObject?:boolean, stageLevel?:boolean, angle?:number,
   *   radial?:number}} o the part's length (m), its parent's, what to add to its CG (m), and where it sits round the
   *   body when that isn't in its own elements
   * @returns {string} XML
   */
  const common = (el, o) => {
    const mat = kid(el, "material"),
      mt = mat ? mat.getAttribute("type") : "bulk",
      md = mat ? parseFloat(mat.getAttribute("density")) || 0 : 0,
      // RockSim's surface density is a tenth of OpenRocket's number (g/cm² against kg/m²); bulk and line are the same
      dType = mt === "surface" ? 1 : mt === "line" ? 2 : 0,
      dens = mt === "surface" ? md / 10 : md;
    // where along its parent: from the parent's front (0), from the nose tip (1) or forward from the parent's end (2)
    let mode = 0,
      xb = 0;
    const ax = kid(el, "axialoffset") || kid(el, "position");
    if (ax && !o.stageLevel) {
      const v = parseFloat(ax.textContent) || 0,
        how = ax.getAttribute("method") || ax.getAttribute("type") || "top";
      if (how === "bottom") {
        mode = 2;
        xb = -v;
      } else if (how === "absolute") {
        mode = 1;
        xb = v;
      } else if (how === "middle") xb = ((o.parentLen || 0) - o.len) / 2 + v;
      else if (how !== "after") xb = v;
    }
    const hasM = kid(el, "overridemass") != null,
      // its weight: as overridden, a weight's own, or (a shock cord) its length at its cord's weight a metre
      mass = hasM
        ? num(el, "overridemass")
        : el.tagName === "shockcord" && mt === "line"
          ? md * num(el, "cordlength")
          : num(el, "mass"),
      // its CG from its own front: as overridden, else its middle (a packed part's, of its packed length)
      cg =
        kid(el, "overridecg") != null
          ? num(el, "overridecg")
          : (kid(el, "packedlength") ? num(el, "packedlength") : o.len) / 2,
      // a mass object's CG is in its parent's frame; a transition's is from the front of its front shoulder
      kcg = o.massObject ? xb + cg : cg + (o.cgShift || 0),
      fin = RKT_FINISH.indexOf(txt(el, "finish"));
    serial++;
    return (
      `<KnownMass>${g(mass)}</KnownMass><Density>${+dens.toPrecision(7)}</Density><Material>${esc(mat ? mat.textContent.trim() : "")}</Material>` +
      `<Name>${esc(txt(el, "name") || el.tagName)}</Name><KnownCG>${mm(kcg)}</KnownCG><UseKnownCG>${hasM || o.massObject ? 1 : 0}</UseKnownCG>` +
      `<Xb>${mm(xb)}</Xb><CalcMass>${g(mass)}</CalcMass><CalcCG>${mm(kcg)}</CalcCG><DensityType>${dType}</DensityType>` +
      `<RadialLoc>${mm(o.radial ?? num(el, "radialposition"))}</RadialLoc><RadialAngle>${+(((o.angle ?? num(el, "radialdirection")) * Math.PI) / 180).toFixed(6)}</RadialAngle>` +
      `<LocationMode>${mode}</LocationMode><Len>${mm(o.len)}</Len><FinishCode>${fin < 0 ? 2 : fin}</FinishCode><SerialNo>${serial}</SerialNo>`
    );
  };
  /** The motor size a mount tube takes: the largest standard diameter that fits its inside (RockSim's MotorDia). */
  const motorDia = (id) => {
    const std = [0.013, 0.018, 0.024, 0.029, 0.038, 0.054, 0.075, 0.098, 0.152].filter((d) => d <= id + 0.0012);
    return std.length ? std[std.length - 1] : id;
  };
  /** A part's attached parts. */
  const attached = (el, len) => {
    const out = subs(el)
      .map((c) => conv(c, len))
      .join("");
    return out ? `<AttachedParts>${out}</AttachedParts>` : `<AttachedParts/>`;
  };
  /** A nose's or transition's shape fields. */
  const shapeXml = (el, what) => {
    const shape = txt(el, "shape") || "ogive",
      par = num(el, "shapeparameter", 0);
    if (!(shape in RKT_SHAPE)) notes.add(`The ${what}’s shape isn’t one RockSim has: an ogive was written.`);
    if (shape === "ogive" && par < 0.99)
      notes.add(`A secant ogive ${what} was written as a tangent ogive: RockSim has no secant ogive.`);
    if (txt(el, "shapeclipped") === "true") notes.add(`The ${what}’s clipped shape isn’t in a RockSim file.`);
    return `<ShapeCode>${RKT_SHAPE[shape] ?? 1}</ShapeCode><ShapeParameter>${["power", "parabolic", "haack"].includes(shape) ? par : 0}</ShapeParameter>`;
  };
  /** A fin set's shared fields. */
  const finHead = (el, code, a, b, s, sw) => {
    const edge = txt(el, "crosssection") || "square";
    if (!(edge in RKT_EDGE))
      notes.add(
        "Bevelled and double-wedge fins were written with RockSim’s airfoil edges: it has square, rounded and airfoil.",
      );
    if (kid(el, "prfltrailingedge"))
      notes.add("A fin’s separate trailing edge isn’t in a RockSim file: its section was written.");
    if (num(el, "filletradius") > 0) notes.add("Fin fillets aren’t in a RockSim file.");
    return (
      `<FinCount>${Math.max(1, Math.round(num(el, "fincount", 3)))}</FinCount><RootChord>${mm(a)}</RootChord><TipChord>${mm(b)}</TipChord>` +
      `<SemiSpan>${mm(s)}</SemiSpan><SweepDistance>${mm(sw)}</SweepDistance><Thickness>${mm(num(el, "thickness"))}</Thickness>` +
      `<ShapeCode>${code}</ShapeCode><TipShapeCode>${RKT_EDGE[edge] ?? 2}</TipShapeCode><TabLength>0</TabLength><TabDepth>0</TabDepth><TabOffset>0</TabOffset>` +
      `<SweepMode>1</SweepMode><CantAngle>${+((num(el, "cant") * Math.PI) / 180).toFixed(6)}</CantAngle>`
    );
  };
  /**
   * One OpenRocket part as RockSim's.
   * @param {Element} el
   * @param {number} parentLen its parent's length, m
   * @param {boolean} [stageLevel] it is one of a stage's (or a pod's) own sections, which follow one another
   * @returns {string} XML
   */
  function conv(el, parentLen, stageLevel = false) {
    const L = num(el, "length"),
      o = { len: L, parentLen, stageLevel };
    switch (el.tagName) {
      case "nosecone": {
        const filled = txt(el, "filled") === "true" || num(el, "thickness") >= num(el, "aftradius") - 1e-9;
        if (num(el, "foreradius") > 0) notes.add("The nose’s flat front isn’t in a RockSim file.");
        return (
          `<NoseCone>${common(el, o)}${shapeXml(el, "nose")}<ConstructionType>${filled ? 0 : 1}</ConstructionType>` +
          `<WallThickness>${mm(num(el, "thickness"))}</WallThickness>${attached(el, L)}<BaseDia>${mm(2 * num(el, "aftradius"))}</BaseDia>` +
          `<ShoulderLen>${mm(num(el, "aftshoulderlength"))}</ShoulderLen><ShoulderOD>${mm(2 * num(el, "aftshoulderradius"))}</ShoulderOD></NoseCone>`
        );
      }
      case "bodytube":
      case "innertube": {
        const inner = el.tagName === "innertube",
          ro = num(el, inner ? "outerradius" : "radius"),
          ri = Math.max(ro - num(el, "thickness"), 0),
          mount = kid(el, "motormount");
        if (inner && txt(el, "clusterconfiguration") && txt(el, "clusterconfiguration") !== "single")
          notes.add("A cluster of motor tubes was written as one tube: add the others in RockSim.");
        return (
          `<BodyTube>${common(el, o)}${mount && mounts[stageNow] ? (mounts[stageNow].push(serial), "") : ""}<OD>${mm(2 * ro)}</OD><ID>${mm(2 * ri)}</ID><IsMotorMount>${mount ? 1 : 0}</IsMotorMount>` +
          `<MotorDia>${mm(mount ? motorDia(2 * ri) : 2 * ri)}</MotorDia><EngineOverhang>${mm(mount ? num(mount, "overhang") : 0)}</EngineOverhang>` +
          `<IsInsideTube>${inner ? 1 : 0}</IsInsideTube>${attached(el, L)}</BodyTube>`
        );
      }
      case "transition": {
        const r1 = num(el, "foreradius"),
          r2 = num(el, "aftradius"),
          th = num(el, "thickness"),
          fsl = num(el, "foreshoulderlength");
        return (
          `<Transition>${common(el, { ...o, cgShift: fsl })}${shapeXml(el, "transition")}` +
          `<ConstructionType>${txt(el, "filled") === "true" || th >= Math.max(r1, r2) - 1e-9 ? 0 : 1}</ConstructionType><WallThickness>${mm(th)}</WallThickness>${attached(el, L)}` +
          `<FrontShoulderLen>${mm(fsl)}</FrontShoulderLen><RearShoulderLen>${mm(num(el, "aftshoulderlength"))}</RearShoulderLen>` +
          `<FrontShoulderDia>${mm(2 * num(el, "foreshoulderradius"))}</FrontShoulderDia><RearShoulderDia>${mm(2 * num(el, "aftshoulderradius"))}</RearShoulderDia>` +
          `<FrontDia>${mm(2 * r1)}</FrontDia><RearDia>${mm(2 * r2)}</RearDia></Transition>`
        );
      }
      case "trapezoidfinset": {
        const a = num(el, "rootchord");
        return `<FinSet>${common(el, { ...o, len: a })}${finHead(el, 0, a, num(el, "tipchord"), num(el, "height"), num(el, "sweeplength"))}</FinSet>`;
      }
      case "ellipticalfinset": {
        const a = num(el, "rootchord");
        return `<FinSet>${common(el, { ...o, len: a })}${finHead(el, 1, a, 0, num(el, "height"), 0)}</FinSet>`;
      }
      case "freeformfinset": {
        const pts = [...el.getElementsByTagName("point")].map((q) => [
            parseFloat(q.getAttribute("x")) || 0,
            parseFloat(q.getAttribute("y")) || 0,
          ]),
          a = pts.length ? Math.max(...pts.filter((q) => Math.abs(q[1]) < 1e-9).map((q) => q[0]), 0) : 0;
        // RockSim lists the outline from the trailing edge of the root round to the leading edge
        return (
          `<CustomFinSet>${common(el, { ...o, len: a })}${finHead(el, 2, a, 0, Math.max(...pts.map((q) => q[1]), 0), 0)}` +
          `<PointList>${pts
            .slice()
            .reverse()
            .map((q) => `${mm(q[0])},${mm(q[1])}|`)
            .join("")}</PointList></CustomFinSet>`
        );
      }
      case "tubefinset": {
        const ro = num(el, "radius"),
          n = Math.max(1, Math.round(num(el, "fincount", 6)));
        return (
          `<TubeFinSet>${common(el, { ...o, angle: num(el, "rotation") })}<OD>${mm(2 * ro)}</OD><ID>${mm(2 * Math.max(ro - num(el, "thickness"), 0))}</ID>` +
          `<TubeCount>${n}</TubeCount><MaxTubesAllowed>${n}</MaxTubesAllowed></TubeFinSet>`
        );
      }
      case "centeringring":
      case "bulkhead":
      case "tubecoupler":
      case "engineblock": {
        // a size left automatic ("auto", as OpenRocket writes it for these) follows the tube the part is in: its bore
        // outside, and the widest inner tube beside it for a centering ring's hole
        const tube = el.parentNode && el.parentNode.parentNode,
          isAuto = (tag) => /^auto\s*$/i.test(txt(el, tag)),
          bore = tube
            ? Math.max(num(tube, tube.tagName === "bodytube" ? "radius" : "outerradius") - num(tube, "thickness"), 0)
            : 0,
          beside = Math.max(
            0,
            ...[...el.parentNode.children].filter((c) => c.tagName === "innertube").map((c) => num(c, "outerradius")),
          ),
          ro = isAuto("outerradius") ? bore : num(el, "outerradius"),
          ri =
            el.tagName === "bulkhead"
              ? 0
              : kid(el, "innerradius")
                ? isAuto("innerradius")
                  ? Math.min(beside, ro)
                  : num(el, "innerradius")
                : Math.max(ro - num(el, "thickness"), 0),
          // what the ring is for: a centering ring, a bulkhead, an engine block or a tube coupler
          use = { centeringring: 0, bulkhead: 1, engineblock: 2, tubecoupler: 4 }[el.tagName];
        return `<Ring>${common(el, o)}<OD>${mm(2 * ro)}</OD><ID>${mm(2 * ri)}</ID><UsageCode>${use}</UsageCode><AutoSize>0</AutoSize></Ring>`;
      }
      case "launchlug": {
        const ro = num(el, "radius");
        if (kid(el, "prfllug")) notes.add("A rail lug was written as a round launch lug of its size.");
        return `<LaunchLug>${common(el, o)}<OD>${mm(2 * ro)}</OD><ID>${mm(2 * Math.max(ro - num(el, "thickness"), 0))}</ID></LaunchLug>`;
      }
      case "railbutton": {
        // no rail button among the parts written here: a lug of the button's diameter and height stands in for each
        notes.add(
          "Rail buttons were written as launch lugs of their diameter and height: replace them in RockSim if it matters.",
        );
        const od = num(el, "outerdiameter"),
          h = num(el, "height"),
          n = Math.max(1, Math.round(num(el, "instancecount", 1))),
          sep = num(el, "instanceseparation"),
          ax = kid(el, "axialoffset"),
          x0 = ax ? parseFloat(ax.textContent) || 0 : 0;
        let s = "";
        for (let i = 0; i < n; i++) {
          const c = el.cloneNode(true),
            a = kid(c, "axialoffset");
          if (a) a.textContent = String(x0 + i * sep);
          s += `<LaunchLug>${common(c, { ...o, len: od, angle: num(el, "angleoffset") })}<OD>${mm(od)}</OD><ID>${mm(Math.max(od - 2 * h, 0))}</ID></LaunchLug>`;
        }
        return s;
      }
      case "parachute": {
        const lm = kid(el, "linematerial");
        devices.push({ sn: serial + 1, el });
        return (
          `<Parachute>${common(el, { ...o, len: num(el, "packedlength"), massObject: false })}<Dia>${mm(num(el, "diameter"))}</Dia>` +
          `<ShroudLineCount>${Math.round(num(el, "linecount"))}</ShroudLineCount><Thickness>0</Thickness><ShroudLineLen>${mm(num(el, "linelength"))}</ShroudLineLen>` +
          `<ChuteCount>1</ChuteCount><ShroudLineMassPerMM>${lm ? parseFloat(lm.getAttribute("density")) || 0 : 0}</ShroudLineMassPerMM>` +
          `<ShroudLineMaterial>${esc(lm ? lm.textContent.trim() : "")}</ShroudLineMaterial><DragCoefficient>${num(el, "cd", 0.75)}</DragCoefficient></Parachute>`
        );
      }
      case "streamer":
        devices.push({ sn: serial + 1, el });
        return `<Streamer>${common(el, { ...o, len: num(el, "striplength") })}<Width>${mm(num(el, "stripwidth"))}</Width><DragCoefficient>${num(el, "cd", 0.6)}</DragCoefficient></Streamer>`;
      case "shockcord":
        return `<MassObject>${common(el, { ...o, len: num(el, "cordlength"), massObject: true })}<TypeCode>1</TypeCode></MassObject>`;
      case "masscomponent":
        if (kid(el, "prflbump"))
          notes.add("Protuberances were written as weights only: their drag isn’t in a RockSim file.");
        return `<MassObject>${common(el, { ...o, len: num(el, "packedlength"), massObject: true })}<TypeCode>0</TypeCode></MassObject>`;
      case "podset":
      case "parallelstage": {
        // RockSim has one pod a part: a set of several is written as that many, spaced evenly round the body
        const n = Math.max(1, Math.round(num(el, "instancecount", 1))),
          rad = num(el, "radiusoffset"),
          a0 = num(el, "angleoffset");
        let s = "";
        for (let i = 0; i < n; i++) {
          const inside = subs(el)
            .map((c) => conv(c, 0, true))
            .join("");
          s +=
            `<ExternalPod>${common(el, { ...o, len: 0, radial: rad, angle: a0 + (360 * i) / n })}<AutoCalcRadialDistance>0</AutoCalcRadialDistance>` +
            `<AutoCalcRadialAngle>0</AutoCalcRadialAngle><Detachable>${el.tagName === "parallelstage" ? 1 : 0}</Detachable><Removed>0</Removed>` +
            `${inside ? `<AttachedParts>${inside}</AttachedParts>` : `<AttachedParts/>`}</ExternalPod>`;
        }
        return s;
      }
      default:
        notes.add(`A “${el.tagName}” part has no RockSim counterpart here and was left out.`);
        return "";
    }
  }
  // stages: the top one is RockSim's stage 3, the next its stage 2, the lowest of three its stage 1
  const stages = subs(rocket).filter((c) => c.tagName === "stage");
  if (!stages.length) throw new Error("The design has no stage to write.");
  if (stages.length > 3) notes.add("RockSim has three stages: the stages below the third were left out.");
  const parts = stages.slice(0, 3).map((st, i) => {
    stageNow = i;
    return subs(st)
      .map((c) => conv(c, 0, true))
      .join("");
  });
  /* Weight overrides (RockSim's Mass override tab: "use the values shown below for all simulations"). It is all or
     nothing: with it on, a stage whose measured mass is left at 0 weighs nothing (seen in RockSim 11). So when any
     stage has a weight override, every stage's weight is written: its override, or what its parts come to. The CGs
     RockSim asks for with them: the sustainer's, the upper two stages' together and all three's, from the nose tip;
     and each booster's alone, written from that booster's own front (RockSim doesn't say where it measures those
     from). */
  const used = stages.slice(0, 3),
    known = used.some((st) => kid(st, "overridemass") != null && num(st, "overridemass") > 0);
  if (!known && used.some((st) => kid(st, "overridecg") != null))
    notes.add("A CG override without a weight override was not written: RockSim’s go together.");
  /** The top n stages together without motors, as this app reads the design: weight (kg), CG from the nose tip and length (m). */
  const stack = (n) => {
    try {
      const d2 = new DOMParser().parseFromString(orkXml, "application/xml"),
        sts = [...(kid(d2.getElementsByTagName("rocket")[0], "subcomponents")?.children || [])].filter(
          (c) => c.tagName === "stage",
        );
      sts.slice(n).forEach((st) => st.remove());
      [...d2.getElementsByTagName("motor")].forEach((m) => m.remove());
      const d = parseOrk(new XMLSerializer().serializeToString(d2)).design;
      return { m: d.dryMass || 0, cg: d.cgEmpty || 0, len: d.length + (d.twoStage ? d.bLength || 0 : 0) };
    } catch (e) {
      return { m: 0, cg: 0, len: 0 };
    }
  };
  const S = known ? used.map((st, i) => stack(i + 1)) : [],
    // a stage alone: what it adds to the stack above it, and where that sits behind its own front
    alone = (i) => {
      const m = S[i].m - S[i - 1].m,
        cg = m > 0 ? (S[i].m * S[i].cg - S[i - 1].m * S[i - 1].cg) / m - S[i - 1].len : 0;
      return { m, cg };
    },
    sm = (i) => (known && S[i] ? g(i ? alone(i).m : S[0].m) : "0."),
    cgAlone = (i) => (known && S[i] ? mm(Math.max(alone(i).cg, 0)) : "0."),
    cgStack = (i) => (known && S[i] ? mm(S[i].cg) : "0.");
  /* Drag: RockSim's Cd override tab has one switch and a fixed Cd for each airframe that flies (the sustainer, the
     sustainer with its booster, all three stages). */
  const cd = Array.isArray(info.cd) && info.cd.some((v) => v > 0) ? info.cd : null,
    cdOf = (i, def) => (cd && cd[i] > 0 ? +(+cd[i]).toFixed(4) : def);
  if (cd && info.cdMixed)
    notes.add(
      "RockSim has one switch for fixed Cd: the airframes without one here were given this app’s own Cd at Mach 0.3.",
    );
  if (!cd && (rocket.getElementsByTagName("overridecd").length || rocket.getElementsByTagName("prflstackdrag").length))
    notes.add("A fixed drag coefficient isn’t written: set it on RockSim’s Cd override tab.");
  if (rocket.getElementsByTagName("prflcdcurve").length || /&quot;curve&quot;/.test(orkXml))
    notes.add(
      "An imported drag profile isn’t in a RockSim file: RockSim calculates its own drag, or takes one fixed Cd.",
    );
  /* When each recovery device opens: RockSim's event types are 1 at the motor's ejection charge, 2 a time after
     ignition, 3 a time after apogee, 4 at apogee, 5 at an altitude on the way down, 0 never. */
  const eventXml = (d) => {
    const ev = txt(d.el, "deployevent") || "apogee",
      delay = num(d.el, "deploydelay"),
      type =
        ev === "altitude" ? 5 : ev === "ejection" ? 1 : ev === "launch" ? 2 : ev === "never" ? 0 : delay > 0 ? 3 : 4;
    return (
      `<SimulationEvent><PartSerialNo>${d.sn}</PartSerialNo><Type>${type}</Type>` +
      `<DeployAltitude>${type === 5 ? +num(d.el, "deployaltitude").toFixed(3) : "0."}</DeployAltitude>` +
      `<DeplyTime>${type === 2 || type === 3 ? +delay.toFixed(3) : "0."}</DeplyTime></SimulationEvent>`
    );
  };
  const events = devices.map(eventXml).join("");
  if (devices.some((d) => kid(d.el, "prflrelease")))
    notes.add("A chute release isn’t in a RockSim file: that parachute was written to open as its own setting says.");
  // a simulation: the motors in their mounts and the launch conditions, not yet run (RockSim runs it there)
  let simXml = "";
  const sim = info.sim;
  if (sim && Array.isArray(sim.engines) && sim.engines.some((l) => l && l.length)) {
    const sets = (i) =>
      (sim.engines[i] || [])
        .filter((e) => e && e.code && mounts[i] && mounts[i].length)
        .map(
          (e, k) =>
            `<EngineSet><EngineCount>${Math.max(1, e.count || 1)}</EngineCount><EngineCode>${esc(e.code)}</EngineCode>` +
            `<IgnitionDelay>${+(e.ignDelay || 0).toFixed(3)}</IgnitionDelay><EngineMfg>${esc(e.mfg || "")}</EngineMfg>` +
            `<EngineOverhang>${mm(e.overhang || 0)}</EngineOverhang><CasingCG>0.</CasingCG>` +
            `<MountSerialNo>${mounts[i][Math.min(k, mounts[i].length - 1)]}</MountSerialNo>` +
            `<EjectionDelay>${e.ejDelay == null || e.ejDelay < 0 ? "-1." : +e.ejDelay.toFixed(2)}</EjectionDelay></EngineSet>`,
        )
        .join("");
    const eng = [sets(0), sets(1), sets(2)],
      n = (v, def) => (isFinite(v) ? +(+v).toFixed(4) : def);
    if (eng.some(Boolean))
      simXml =
        `<SimulationResultsList><SimulationResults>` +
        `<LaunchGuideLen>${mm(info.rail > 0 ? info.rail : 1.8288)}</LaunchGuideLen><LaunchWindDirection>0</LaunchWindDirection>` +
        `<LaunchWindSpeed>${n(sim.wind, 0)}</LaunchWindSpeed><LaunchDirection>0</LaunchDirection>` +
        `<LaunchAngle>${n(((sim.angle || 0) * Math.PI) / 180, 0)}</LaunchAngle>` +
        `<LaunchBarometer>${n((sim.pressure > 0 ? sim.pressure : 101325 * Math.pow(1 - 2.25577e-5 * (sim.elev || 0), 5.25588)) / 133.322, 760)}</LaunchBarometer>` +
        `<LaunchLatitude>${n(sim.lat, 0)}</LaunchLatitude><LaunchHumidity>${n((sim.humidity ?? 0.5) * 100, 50)}</LaunchHumidity>` +
        `<LaunchTemperature>${n(sim.tempC, 15)}</LaunchTemperature><LaunchAltitude>${n(sim.elev, 0)}</LaunchAltitude>` +
        `<LaunchWindLowSpeed>${n(sim.wind, 0)}</LaunchWindLowSpeed><LaunchWindHighSpeed>${n(sim.wind, 0)}</LaunchWindHighSpeed>` +
        // gustiness as the nearest of RockSim's turbulence presets (as rocksim-import.js reads them back)
        `<LaunchWindTurbulencePreset>${[0, 0.05, 0.1, 0.15, 0.2, 0.3].reduce((best, v, k, all) => (Math.abs(v - (sim.turb || 0)) < Math.abs(all[best] - (sim.turb || 0)) ? k : best), 0)}</LaunchWindTurbulencePreset>` +
        `<SimulationName>${esc(sim.name || "Pocket Rocket Flight Lab")}</SimulationName>` +
        `<SimulationEvents>${events}</SimulationEvents>` +
        `<Stage1Engines>${eng[2]}</Stage1Engines><Stage2Engines>${eng[1]}</Stage2Engines><Stage3Engines>${eng[0]}</Stage3Engines>` +
        `</SimulationResults></SimulationResultsList>`;
  }
  notes.add(
    simXml
      ? "The motors and launch conditions are in the file as a simulation that hasn’t been run: run it in RockSim (a motor RockSim doesn’t have under that name has to be chosen again there)."
      : "Not in the file: motors and launch conditions. RockSim keeps those in its simulations: choose them there.",
  );
  const stageXml = (i) => (parts[i] ? `<Stage${3 - i}Parts>${parts[i]}</Stage${3 - i}Parts>` : `<Stage${3 - i}Parts/>`);
  const text =
    `<RockSimDocument><FileVersion>4</FileVersion><DesignInformation><RocketDesign><Name>${esc(txt(rocket, "name") || "Rocket")}</Name>` +
    `<CalculateCD>${cd ? 0 : 1}</CalculateCD><FixedCd>${cdOf(0, 0.75)}</FixedCd><FixedCd2>${cdOf(1, 0.8)}</FixedCd2><FixedCd3>${cdOf(2, 0.81)}</FixedCd3>` +
    `<StageCount>${Math.min(stages.length, 3)}</StageCount>` +
    `<Stage3Mass>${sm(0)}</Stage3Mass><Stage2Mass>${sm(1)}</Stage2Mass><Stage1Mass>${sm(2)}</Stage1Mass>` +
    `<Stage321CG>${cgStack(2)}</Stage321CG><Stage32CG>${cgStack(1)}</Stage32CG><Stage3CG>${cgStack(0)}</Stage3CG>` +
    `<Stage2CGAlone>${used.length > 1 ? cgAlone(1) : "0."}</Stage2CGAlone><Stage1CGAlone>${used.length > 2 ? cgAlone(2) : "0."}</Stage1CGAlone>` +
    `<CPCalcFlags>1</CPCalcFlags>${info.rail > 0 ? `<LaunchGuideLength>${mm(info.rail)}</LaunchGuideLength>` : ""}` +
    `<UseKnownMass>${known ? 1 : 0}</UseKnownMass><CPSimFlags>1</CPSimFlags><LastSerialNumber>${serial}</LastSerialNumber>` +
    `<DisplayFlags>7</DisplayFlags><ViewType>0</ViewType><ViewStageCount>${Math.min(stages.length, 3)}</ViewStageCount>` +
    `<ViewTypeEdit>0</ViewTypeEdit><ViewStageCountEdit>${Math.min(stages.length, 3)}</ViewStageCountEdit><ZoomFactor>0.</ZoomFactor><ZoomFactorEdit>0.</ZoomFactorEdit>` +
    `<ScrollPosX>0</ScrollPosX><ScrollPosY>0</ScrollPosY><ScrollPosXEdit>0</ScrollPosXEdit><ScrollPosYEdit>0</ScrollPosYEdit>` +
    `<ThreeDFlags>0</ThreeDFlags><ThreeDFlagsEdit>0</ThreeDFlagsEdit>` +
    `<SimulationEventList>${events}</SimulationEventList>` +
    `${stageXml(0)}${stageXml(1)}${stageXml(2)}` +
    `</RocketDesign></DesignInformation>${simXml}</RockSimDocument>\n`;
  return { text, notes: [...notes] };
}
