/**
 * RockSim .rkt import. The RockSim design is rewritten as an OpenRocket .ork document (the same components, in
 * meters and kilograms) and read by parseOrk, then RockSim's own simulation settings (motors per stage, ejection
 * delays, launch conditions) are applied on top.
 */
/* ---------- RockSim .rkt import: converted to the .ork file layout, then read by the .ork importer ---------- */
/**
 * Reads a RockSim design.
 * @param {string} xml the .rkt file
 * @returns {object} the same shape as parseOrk's result
 * @throws {Error} if the file isn't a readable RockSim design
 */
function parseRkt(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The RockSim file could not be read as XML.");
  const design = doc.getElementsByTagName("RocketDesign")[0];
  if (!design) throw new Error("No rocket design was found in this RockSim file.");
  const notes = [];
  /**
   * The first child element with a tag name.
   */
  const kid = (el, tag) => [...el.children].find((c) => c.tagName === tag);
  /**
   * The trimmed text of a child element, or null.
   */
  const txt = (el, tag) => {
    const c = kid(el, tag);
    return c ? c.textContent.trim() : null;
  };
  /**
   * A child element's value as a number, or def.
   */
  const num = (el, tag, def = 0) => {
    const v = parseFloat(txt(el, tag));
    return isFinite(v) ? v : def;
  };
  /**
   * Escapes text for XML.
   */
  const xe = (s) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const FIN = ["polished", "smooth", "normal", "unfinished"];
  const SHAPE = ["conical", "ogive", "ellipsoid", "ellipsoid", "power", "parabolic", "haack"];
  const EDGE = ["square", "rounded", "airfoil"];
  const allChutes = [...design.getElementsByTagName("Parachute")].map((p) => num(p, "Dia") / 1000);
  const mainD = allChutes.length > 1 ? Math.max(...allChutes) : null;
  let usedCalc = false;
  /**
   * A RockSim part's material as an .ork material element (bulk, surface or line density, in SI).
   * @param {Element} el part
   * @returns {string} XML
   */
  function material(el) {
    const type = num(el, "DensityType", 0),
      raw = num(el, "Density", 0);
    let t = ["bulk", "surface", "line"][type] || "bulk",
      d = type === 1 ? raw * 10 : raw;
    if ((el.tagName === "Parachute" || el.tagName === "Streamer") && type === 0) {
      t = "surface";
      d = (raw * num(el, "Thickness", 0)) / 1000;
    }
    return `<material type="${t}" density="${d}">${xe(txt(el, "Material") || "RockSim material")}</material>`;
  }
  /**
   * The .ork elements every component has: name, id, and (below stage level) position and mass overrides.
   * @param {Element} el RockSim part
   * @param {boolean} stageLevel the part is a stage
   * @returns {string} XML
   */
  function common(el, stageLevel) {
    let s = `<name>${xe(txt(el, "Name") || el.tagName)}</name><id>${rktPartId(RIDX.get(el))}</id>`;
    if (!stageLevel) {
      const mode = num(el, "LocationMode", 0),
        xb = num(el, "Xb", 0) / 1000;
      const method = ["top", "absolute", "bottom"][mode] || "top";
      s += `<axialoffset method="${method}">${method === "bottom" ? -xb : xb}</axialoffset>`;
    } else s += `<axialoffset method="after">0</axialoffset>`;
    // RockSim measures a transition's CG from the front of its front shoulder, which sits inside the tube ahead of it
    const cgShift = el.tagName === "Transition" ? num(el, "FrontShoulderLen", 0) : 0;
    if (txt(el, "UseKnownCG") === "1") {
      // RockSim stores a mass object's KnownCG in its parent's frame (it equals Xb when the CG is at the part's own position)
      const kcg =
        el.tagName === "MassObject" ? Math.max(0, num(el, "KnownCG") - num(el, "Xb", 0)) : num(el, "KnownCG") - cgShift;
      s += `<overridemass>${num(el, "KnownMass") / 1000}</overridemass><overridecg>${kcg / 1000}</overridecg>`;
    } else if (num(el, "CalcMass", 0) > 0 && el.tagName !== "SubAssembly") {
      usedCalc = true;
      s +=
        `<rktcalc/><overridemass>${num(el, "CalcMass") / 1000}</overridemass>` +
        (num(el, "CalcCG", 0) > 0 ? `<overridecg>${(num(el, "CalcCG") - cgShift) / 1000}</overridecg>` : "");
    }
    if (txt(el, "FinishCode") != null) s += `<finish>${FIN[num(el, "FinishCode", 2)] || "normal"}</finish>`;
    return s + material(el);
  }
  const RIDX = rktIndex(design);
  let parentLen = 0;
  /**
   * The converted attached parts of a RockSim part, as .ork subcomponents.
   * @param {Element} el
   * @returns {string} XML
   */
  function kids(el) {
    const ap = kid(el, "AttachedParts");
    if (!ap) return "";
    const prev = parentLen;
    parentLen = num(el, "Len", 0) / 1000;
    const r = [...ap.children].map((c) => conv(c, false)).join("");
    parentLen = prev;
    return r;
  }
  /**
   * Converts one RockSim part (and its attached parts) to an .ork component.
   * @param {Element} el
   * @param {boolean} stageLevel
   * @returns {string} XML
   */
  function conv(el, stageLevel) {
    const tag = el.tagName,
      c = common(el, stageLevel);
    const L = num(el, "Len") / 1000;
    switch (tag) {
      case "NoseCone": {
        const code = num(el, "ShapeCode", 1),
          shape = SHAPE[code] || "ogive";
        const par = ["power", "haack", "parabolic"].includes(shape)
          ? num(el, "ShapeParameter", shape === "parabolic" ? 1 : shape === "power" ? 0.5 : 0)
          : shape === "ogive"
            ? 1
            : 0;
        const filled = num(el, "ConstructionType", 1) === 0,
          t = num(el, "WallThickness") / 1000,
          sr = num(el, "ShoulderOD") / 2000;
        if (code === 2) notes.push("RockSim’s parabolic nose was treated as elliptical.");
        return `<nosecone>${c}<length>${L}</length><shape>${shape}</shape><shapeparameter>${par}</shapeparameter><aftradius>${num(el, "BaseDia") / 2000}</aftradius><thickness>${t}</thickness><filled>${filled}</filled><aftshoulderradius>${sr}</aftshoulderradius><aftshoulderlength>${num(el, "ShoulderLen") / 1000}</aftshoulderlength><aftshoulderthickness>${filled ? sr : t}</aftshoulderthickness><subcomponents>${kids(el)}</subcomponents></nosecone>`;
      }
      case "BodyTube": {
        const od = num(el, "OD") / 2000,
          id = num(el, "ID") / 2000,
          th = Math.max(od - id, 0);
        if (txt(el, "IsInsideTube") === "1") {
          return `<innertube>${c}<length>${L}</length><outerradius>${od}</outerradius><thickness>${th}</thickness><overhang>${num(el, "EngineOverhang") / 1000}</overhang>${txt(el, "IsMotorMount") === "1" ? "<motormount/>" : ""}<subcomponents>${kids(el)}</subcomponents></innertube>`;
        }
        // an outside tube can be the motor mount too (minimum-diameter rockets, or RockSim's tube-in-tube boat tails)
        return `<bodytube>${c}<length>${L}</length><radius>${od}</radius><thickness>${th}</thickness>${txt(el, "IsMotorMount") === "1" ? `<overhang>${num(el, "EngineOverhang") / 1000}</overhang><motormount/>` : ""}<subcomponents>${kids(el)}</subcomponents></bodytube>`;
      }
      case "Transition": {
        const code = num(el, "ShapeCode", 0),
          shape = SHAPE[code] || "conical";
        const par = ["power", "haack", "parabolic"].includes(shape)
          ? num(el, "ShapeParameter", 0)
          : shape === "ogive"
            ? 1
            : 0;
        return `<transition>${c}<length>${L}</length><shape>${shape}</shape><shapeparameter>${par}</shapeparameter><foreradius>${num(el, "FrontDia") / 2000}</foreradius><aftradius>${num(el, "RearDia") / 2000}</aftradius><thickness>${num(el, "WallThickness") / 1000}</thickness><subcomponents>${kids(el)}</subcomponents></transition>`;
      }
      case "FinSet":
      case "CustomFinSet": {
        const n = num(el, "FinCount", 3),
          t = num(el, "Thickness") / 1000,
          edge = EDGE[num(el, "TipShapeCode", 0)] || "square",
          code = tag === "CustomFinSet" ? 2 : num(el, "ShapeCode", 0);
        const cantR = num(el, "CantAngle", 0),
          cant = Math.abs(cantR) > 1e-6 ? (cantR * 180) / Math.PI : 0; // RockSim stores the cant angle in radians
        if (cant) notes.push(`Fin cant of ${cant.toFixed(1)}° read from the file.`);
        const head = `${c}<fincount>${n}</fincount><thickness>${t}</thickness><crosssection>${edge}</crosssection>${cant ? `<cant>${cant}</cant>` : ""}`;
        if (code === 1)
          return `<ellipticalfinset>${head}<rootchord>${num(el, "RootChord") / 1000}</rootchord><height>${num(el, "SemiSpan") / 1000}</height></ellipticalfinset>`;
        if (code === 2) {
          const pts = (txt(el, "PointList") || "")
            .split("|")
            .map((p) => p.split(",").map(parseFloat))
            .filter((p) => p.length > 1 && isFinite(p[0]) && isFinite(p[1]));
          // RockSim lists the outline from the trailing edge; OpenRocket's starts at the leading edge of the root (the other way round it reads as a fin of negative size)
          if (pts.length > 2 && pts[0][0] > pts[pts.length - 1][0]) pts.reverse();
          return `<freeformfinset>${head}<finpoints>${pts.map(([x, y]) => `<point x="${x / 1000}" y="${y / 1000}"/>`).join("")}</finpoints></freeformfinset>`;
        }
        return `<trapezoidfinset>${head}<rootchord>${num(el, "RootChord") / 1000}</rootchord><tipchord>${num(el, "TipChord") / 1000}</tipchord><height>${num(el, "SemiSpan") / 1000}</height><sweeplength>${num(el, "SweepDistance") / 1000}</sweeplength></trapezoidfinset>`;
      }
      case "Ring":
        return `<centeringring>${c}<length>${L}</length><outerradius>${num(el, "OD") / 2000}</outerradius><innerradius>${num(el, "ID") / 2000}</innerradius></centeringring>`;
      case "LaunchLug": {
        const od = num(el, "OD") / 2000,
          id = num(el, "ID") / 2000;
        return `<launchlug>${c}<length>${L}</length><radius>${od}</radius><thickness>${Math.max(od - id, 0)}</thickness></launchlug>`;
      }
      case "Parachute": {
        const d = num(el, "Dia") / 1000;
        const ev =
          mainD != null && Math.abs(d - mainD) < 1e-9
            ? `<deployevent>altitude</deployevent><deployaltitude>${D.mainAlt}</deployaltitude>`
            : `<deployevent>apogee</deployevent>`;
        return `<parachute>${c}<packedlength>${L}</packedlength><diameter>${d}</diameter><cd>${num(el, "DragCoefficient", 0.8) || 0.8}</cd>${ev}<linecount>${num(el, "ShroudLineCount")}</linecount><linelength>${num(el, "ShroudLineLen") / 1000}</linelength><linematerial type="line" density="${num(el, "ShroudLineMassPerMM")}">Shroud line</linematerial></parachute>`;
      }
      case "Streamer":
        return `<streamer>${c}<packedlength>0.05</packedlength><striplength>${L}</striplength><stripwidth>${num(el, "Width") / 1000}</stripwidth></streamer>`;
      case "MassObject": {
        // RockSim stores a shock cord's full cord length; pack it to 1/100 of that so its mass sits near its attachment point, as it does when coiled in the tube
        const cord = num(el, "TypeCode", 0) === 1 || (parentLen > 0 && L > 2 * parentLen);
        return `<masscomponent>${c}<mass>${num(el, "KnownMass") / 1000}</mass><packedlength>${cord ? L / 100 : L}</packedlength></masscomponent>`;
      }
      case "SubAssembly":
        return kids(el);
      default:
        notes.push(`Skipped a RockSim “${tag}” part.`);
        return "";
    }
  }
  // stages that actually hold parts (some files say 2 stages but draw everything in the upper one)
  const stageTags = ["Stage3Parts", "Stage2Parts", "Stage1Parts"]
    .slice(0, Math.max(1, num(design, "StageCount", 1)))
    .filter((st, i) => i === 0 || (kid(design, st) && kid(design, st).children.length > 0));
  const stageCount = stageTags.length;
  if (stageCount < Math.max(1, num(design, "StageCount", 1)))
    notes.push("The file lists more stages than it has parts for; the empty stages were ignored.");
  const stageParts = stageTags.map((st) => {
      const e = kid(design, st);
      return e
        ? `<stage><name>${st}</name><subcomponents>${[...e.children].map((c) => conv(c, true)).join("")}</subcomponents></stage>`
        : "";
    }),
    stagesXml = stageParts.join("");
  let rocketOverride = "";
  const s3m = num(design, "Stage3Mass", 0),
    s3cg = num(design, "Stage3CG", 0);
  if (stageCount === 1 && s3m > 0) {
    rocketOverride += `<overridemass>${s3m / 1000}</overridemass>`;
    notes.push("Used the RockSim stage mass override.");
  }
  if (stageCount === 1 && s3cg > 0) rocketOverride += `<overridecg>${s3cg / 1000}</overridecg>`;
  // RockSim's "use a fixed Cd" option: CalculateCD = 0, with FixedCd for the upper stage (or the whole rocket when there's one stage)
  if (num(design, "CalculateCD", 1) === 0) {
    const fcd = num(design, "FixedCd", 0);
    if (fcd > 0) {
      rocketOverride += `<overridecd>${fcd}</overridecd>`;
      notes.push(
        `The file uses a fixed drag coefficient of ${fcd} instead of a calculated one, so the Cd override is set to ${fcd}. Set it to 0 on the Rocket tab (whole rocket) to use the calculated drag.`,
      );
    }
  }
  // simulation: motor, launch conditions, reference apogee
  const sims = [...doc.getElementsByTagName("SimulationResults")];
  const sim = sims.find((s) => num(s, "MaxAltitude", 0) > 0) || sims[0];
  let motor = null,
    simXml = "",
    rktS3 = [],
    rktS2 = [],
    rktTurb = null;
  var bMotorRkt = null;
  const rktSite = {};
  if (sim) {
    // which mount each motor sits in tells its size, even for a motor that isn't in the list
    const mDia = new Map();
    for (const sn of design.getElementsByTagName("SerialNo")) {
      const pe = sn.parentElement,
        md = pe && [...pe.children].find((c) => c.tagName === "MotorDia");
      if (md && parseFloat(md.textContent) > 0) mDia.set(sn.textContent.trim(), parseFloat(md.textContent) / 1000);
    }
    /**
     * The motors in one of the simulation's stage engine lists: designation, maker, ignition and ejection delay, count.
     */
    const engs = (tag) => {
      const g = tag ? sim.getElementsByTagName(tag)[0] : sim;
      return g
        ? [...g.getElementsByTagName("EngineSet")]
            .map((es) => ({
              designation: txt(es, "EngineCode") || "",
              mfr: txt(es, "EngineMfg") || "",
              delay: num(es, "IgnitionDelay", 0),
              mountDia: mDia.get((txt(es, "MountSerialNo") || "").trim()) || 0,
              ej: num(es, "EjectionDelay", -1),
              count: Math.max(1, Math.round(num(es, "EngineCount", 1))),
            }))
            .filter((e) => e.designation)
        : [];
    };
    rktS3 = engs("Stage3Engines");
    rktS2 = engs("Stage2Engines");
    if (!rktS3.length) rktS3 = engs(null).slice(0, 1);
    motor = rktS3[0] || null;
    bMotorRkt = rktS2[0] || null;
    const g = (t) => {
      const v = parseFloat(txt(sim, t));
      return isFinite(v) ? v : null;
    };
    const cond = [];
    // newer RockSim files store the rail in mm; older ones (file version 1) store it in metres
    {
      let rl = g("LaunchGuideLen");
      if (!(rl > 0)) {
        const d = parseFloat(txt(design, "LaunchGuideLength"));
        rl = isFinite(d) && d > 0 ? d : null;
      }
      if (rl) cond.push(`<launchrodlength>${rl < 30 ? rl : rl / 1000}</launchrodlength>`);
    }
    if (g("LaunchAngle") != null) cond.push(`<launchrodangle>${(g("LaunchAngle") * 180) / Math.PI}</launchrodangle>`);
    if (g("LaunchWindSpeed") != null) cond.push(`<windaverage>${g("LaunchWindSpeed")}</windaverage>`);
    if (g("LaunchAltitude") != null) cond.push(`<launchaltitude>${g("LaunchAltitude")}</launchaltitude>`);
    if (g("LaunchTemperature") != null) cond.push(`<launchtemperature>${g("LaunchTemperature")}</launchtemperature>`);
    // latitude: usually degrees, but some files hold radians; 0 and 90° are RockSim's placeholders, not real sites
    {
      let la = g("LaunchLatitude");
      if (la != null && la !== 0 && Math.abs(la) <= Math.PI / 2 + 1e-3 && Math.abs(la - Math.round(la)) > 1e-6)
        la *= 180 / Math.PI;
      if (la != null && la !== 0 && Math.abs(la) < 89) rktSite.lat = la;
    }
    {
      const h = g("LaunchHumidity");
      if (h != null && h >= 0 && h <= 100) rktSite.humidity = h / 100;
    }
    {
      const mm = g("LaunchBarometer");
      if (mm > 0) rktSite.mmHg = mm;
    }
    const tp = g("LaunchWindTurbulencePreset");
    if (tp != null && tp > 0) {
      rktTurb = [0, 0.05, 0.1, 0.15, 0.2, 0.3][Math.min(5, Math.round(tp))];
      cond.push(`<windturbulence>${rktTurb}</windturbulence>`);
    }
    const apo = g("MaxAltitude");
    const ours = /Pocket Rocket/.test(sim.getElementsByTagName("SimulationName")[0]?.textContent || "");
    simXml = `<simulations><simulation><conditions>${cond.join("")}</conditions>${apo > 0 && !ours ? `<flightdata maxaltitude="${apo}"/>` : ""}</simulation></simulations>`;
  } else {
    // no saved simulation: the design's own launch guide length is still the rail
    const d = parseFloat(txt(design, "LaunchGuideLength"));
    if (isFinite(d) && d > 0)
      simXml = `<simulations><simulation><conditions><launchrodlength>${d < 30 ? d : d / 1000}</launchrodlength></conditions></simulation></simulations>`;
  }
  /* a staged RockSim rocket keeps each stage's motors in its simulation (Stage3Engines is the top stage): each one goes
     into its stage's motor mount, so the stages fly in turn, each upper one lighting its delay after the stage below burns out */
  let stagesOut = stagesXml,
    rktStageEngs = null;
  if (sim && stageCount > 1) {
    /**
     * A stage's engine sets from the simulation, with the mount each one sits in.
     */
    const engsOf = (tag) => {
      const g = sim.getElementsByTagName(tag)[0];
      return g
        ? [...g.getElementsByTagName("EngineSet")]
            .map((es) => ({
              designation: txt(es, "EngineCode") || "",
              mfr: txt(es, "EngineMfg") || "",
              delay: num(es, "IgnitionDelay", 0),
              ej: num(es, "EjectionDelay", -1),
              count: Math.max(1, Math.round(num(es, "EngineCount", 1))),
              mountSerial: (txt(es, "MountSerialNo") || "").trim(),
            }))
            .filter((e) => e.designation)
        : [];
    };
    const per = stageTags.map((t) => engsOf(t.replace("Parts", "Engines")));
    if (per.filter((l) => l.length).length > 1) {
      rktStageEngs = per;
      const parts = stageParts;
      stagesOut = parts
        .map((x, i) => {
          const e = per[i][0];
          if (!e) return x;
          const upper = i < parts.length - 1;
          return x.replace(
            "<motormount/>",
            `<motormount><ignitionevent>${upper ? "burnout" : "automatic"}</ignitionevent><ignitiondelay>${upper ? Math.max(0, e.delay || 0) : 0}</ignitiondelay><motor><type>reload</type><manufacturer>${xe(e.mfr)}</manufacturer><designation>${xe(e.designation)}</designation><diameter>0</diameter><length>0</length><delay>none</delay></motor></motormount>`,
          );
        })
        .join("");
    }
  }
  const orkXml = `<openrocket><rocket><name>${xe(txt(design, "Name") || "RockSim rocket")}</name>${rocketOverride}<subcomponents>${stagesOut}</subcomponents></rocket>${simXml}</openrocket>`;
  const r = parseOrk(orkXml);
  r.orkXml = orkXml;
  r.notes = [...notes, ...r.notes];
  if (usedCalc) r.notes.unshift("Part weights and balance points come from RockSim’s own saved calculations.");
  if (motor && motor.designation) {
    r.motor = { ...motor, dia: 0, nozzle: 0 };
    r.design.orkMotor = (motor.mfr + " " + motor.designation).trim();
  }
  // RockSim clusters: an engine count above one, or more than one motor in a stage
  const rx2 = (list) => {
    if (!list.length) return [];
    const [m0, ...rest] = list;
    return [...(m0.count > 1 ? [{ ...m0, count: m0.count - 1 }] : []), ...rest];
  };
  r.motorExtras = rx2(rktS3);
  r.boosterExtras = r.design.twoStage ? rx2(rktS2) : [];
  if (r.motorExtras.length || r.boosterExtras.length)
    r.notes.push("The file has a motor cluster. All motors in a stage are lit together and their thrust is added.");
  /* RockSim's EjectionDelay: seconds after burnout (0 fires at burnout); a negative value (-1, -2) is a plugged motor, and
     RockSim then opens nothing (its own simulations of such motors come down ballistic). Its chutes open at the motor's
     ejection charge. */
  if (motor) {
    const ej = rktEj(motor.ej);
    r.design.deployMode = "motor";
    r.design.deployDelay = ej ?? 0;
    r.notes.push(
      ej != null
        ? `The chute opens at the motor’s ejection charge, ${ej.toFixed(1)} s after burnout, as in the RockSim file.`
        : "The motor is plugged in the RockSim file, so the chute, which RockSim opens at the motor’s ejection charge, stays packed. Choose a delay under Motor Delay on the Motor tab.",
    );
  }
  // site conditions saved with RockSim's simulation
  if (rktSite.lat != null) {
    r.launch.lat = rktSite.lat;
  }
  if (rktSite.humidity != null) r.launch.humidity = rktSite.humidity;
  if (rktSite.mmHg) {
    // RockSim's barometer reading: used as the pad pressure only when it is plausible for the field elevation (a sea-level default at a high field is not)
    const pa = rktSite.mmHg * 133.322,
      std = 101325 * Math.pow(1 - 2.25577e-5 * (r.launch.elev || 0), 5.25588);
    // RockSim's defaults (about 750–762 mmHg, sea-level values) are skipped; a reading near the standard pressure for the field is taken as a real station reading
    const isDefault = rktSite.mmHg >= 749 && rktSite.mmHg <= 762;
    if (!isDefault && Math.abs(pa - std) / std < 0.06) r.launch.pressure = pa;
  }
  {
    const bits = [];
    if (rktSite.lat != null) bits.push(`latitude ${rktSite.lat.toFixed(2)}°`);
    if (rktSite.humidity != null) bits.push(`${Math.round(rktSite.humidity * 100)}% humidity`);
    if (r.launch.pressure > 0) bits.push("the barometer reading");
    if (bits.length) r.notes.push(`Launch site from the RockSim simulation: ${bits.join(", ")}.`);
  }
  if (rktTurb)
    r.notes.push(
      `RockSim’s turbulence setting was converted to about ${(rktTurb * 100).toFixed(0)}% gustiness; RockSim doesn’t publish the exact strength of its presets.`,
    );
  if (r.design.twoStage) {
    r.boosterMotor = bMotorRkt && bMotorRkt.designation ? { ...bMotorRkt, dia: 0, nozzle: 0 } : null;
    if (motor && motor.delay > 0) r.design.stageDelay = motor.delay;
  }
  if (r.design.threeStage && rktStageEngs) {
    const f = rktStageEngs[2];
    r.firstMotor = f[0] ? { ...f[0], dia: 0, nozzle: 0 } : null;
    r.firstExtras = rx2(f);
    if (bMotorRkt && bMotorRkt.delay > 0) r.design.midDelay = bMotorRkt.delay;
    r.notes.push(
      "Each stage’s motors come from the RockSim simulation: the booster lights after the first stage burns out, and the sustainer after the booster.",
    );
  }
  if (allChutes.length > 1)
    r.notes.push(
      "RockSim doesn’t store deployment altitudes in the design, so the largest chute was set as the main at your current main altitude.",
    );
  r.design.refSource = "RockSim";
  {
    // motor tube size: RockSim's own motor diameter for the mount, or the tube's inside diameter
    const mounts = stageTags.map((st) => {
      const e = kid(design, st);
      if (!e) return null;
      const mt = [...e.getElementsByTagName("BodyTube")].find((b) => txt(b, "IsMotorMount") === "1");
      if (!mt) return null;
      const md = num(mt, "MotorDia", 0),
        id = num(mt, "ID", 0);
      return md > 0 ? md / 1000 : id > 0 ? id / 1000 : null;
    });
    if (mounts[0]) r.design.mountDia = mounts[0];
    if (r.design.twoStage) r.design.bMountDia = mounts[1] || null;
    if (r.design.threeStage && r.design.s1) r.design.s1.bMountDia = mounts[2] || r.design.s1.bMountDia;
  }
  return r;
}
/**
 * Finds a motor in the catalog or the uploaded motors by its file designation and maker (and diameter, if given).
 * @param {{designation:string, mfr:string, dia:number}} mo
 * @returns {object|null}
 */
function matchMotor(mo) {
  if (!mo || !mo.designation) return null;
  const norm = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const d = norm(mo.designation),
    mf = (mo.mfr || "").toLowerCase();
  const isAT = mf.includes("aerotech") || mf.startsWith("aerot") || mf === "at",
    isCTI = mf.includes("cesaroni") || mf.startsWith("cesar") || mf.startsWith("cti"),
    isLoki = mf.includes("loki");
  const pool = allMotors().filter((m) =>
    !mf
      ? true
      : isCTI
        ? m.brand === "Cesaroni"
        : isAT
          ? m.brand === "AeroTech"
          : isLoki
            ? m.brand === "Loki"
            : m.brand === brandOfMfr(mo.mfr) ||
              (!m.builtin && ((m.mfr || "") + " " + m.brand).toLowerCase().includes(mf.split(/\s+/)[0])),
  );
  const dia = mo.dia ? Math.round(mo.dia * 1000) : null;
  const okDia = (m) => !dia || Math.round(m.dia * 1000) === dia;
  return (
    pool.find((m) => norm(m.name) === d) ||
    pool.find((m) => okDia(m) && norm(m.cn) === d) ||
    pool.find((m) => okDia(m) && (d.startsWith(norm(m.name)) || norm(m.name).startsWith(d))) ||
    pool.find((m) => okDia(m) && m.cn && new RegExp("(^|\\d)" + norm(m.cn) + "($|[A-Z])").test(d)) ||
    null
  );
}
