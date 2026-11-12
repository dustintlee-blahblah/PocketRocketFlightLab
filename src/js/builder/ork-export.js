/**
 * Writing the builder's design as an OpenRocket .ork document.
 */
import {
  BLD_BULK,
  BLD_BUTTONS,
  BLD_LINE,
  BLD_SURF,
  bldId,
  bldLayout,
  bldMountR,
  bldOvOn,
  bldPts,
  bldSettings,
} from "./model.js";
import { allMotors } from "../design/defaults.js";
import { findMotor } from "../motors/clusters.js";
/* ---------- the .ork file ---------- */
/**
 * The motor type OpenRocket uses to find a motor along with its name: single-use, reload or hybrid.
 * @param {object} km mount's motor {id, name, mfr}
 * @returns {string}
 *
 * OpenRocket finds a motor by its type as well as its name: single-use, reload or hybrid
 */
function orkMotorType(km) {
  const m =
    (km.id && findMotor(km.id)) ||
    allMotors().find((x) => x.name === km.name && (!km.mfr || (x.mfr || x.brand) === km.mfr));
  return !m ? "reload" : m.sys === "SU" || m.sys === "DMS" ? "single" : m.sys === "Hybrid" ? "hybrid" : "reload";
}
/**
 * The design as .ork XML: stages, parts, motor configuration, deployment and launch conditions.
 * @param {object} model builder model
 * @param {object} L launch conditions
 * @param {object} [opts] options (configuration id, ...)
 * @returns {string} XML
 */
export function bldToOrk(model, L, opts = {}) {
  /**
   * A number as text, rounded to 10 significant digits.
   */
  const n = (v) => String(+(+v).toPrecision(10)),
    e = (s) =>
      String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const cfg = model.cfg || (model.cfg = bldId()),
    lay = bldLayout(model),
    S = model.settings || bldSettings();
  /**
   * A material element.
   */
  const matX = (k, type, list) => {
    const std = list.find((x) => x[0] === k.mat);
    const d = k.dens != null && isFinite(k.dens) ? k.dens : (std || list[0])[1];
    return `<material type="${type}" density="${n(d)}">${e(k.mat || list[0][0])}</material>`;
  };
  const bulk = (k) => matX(k, "bulk", BLD_BULK),
    surf = (k) => matX(k, "surface", BLD_SURF),
    line = (k) => matX(k, "line", BLD_LINE);
  /**
   * A fin set element.
   */
  const fin = (k) => {
    const f = k.finish || S.finish;
    return f ? `<finish>${e(f)}</finish>` : "";
  };
  /**
   * Fields of a part opened from a file that the builder doesn't edit, written back as they were.
   */
  // overrides are written only while they're switched on (an override switched off is kept with the app's settings)
  const known = (k) =>
    (bldOvOn(k, "cdo")
      ? `<overridecd>${n(k.cdo)}</overridecd><overridesubcomponentscd>${!!k.cdoAll}</overridesubcomponentscd>`
      : "") +
    (bldOvOn(k, "known")
      ? `<overridemass>${n(k.known)}</overridemass><overridesubcomponentsmass>${!!k.knownAll}</overridesubcomponentsmass>`
      : "") +
    // RockSim's calculated CG goes with its calculated weight
    (bldOvOn(k, "knownCg") && !(k.knownCalc && !bldOvOn(k, "known"))
      ? `<overridecg>${n(k.knownCg)}</overridecg><overridesubcomponentscg>${!!k.knownAll}</overridesubcomponentscg>`
      : "");
  /**
   * A part's position element.
   */
  const pos = (k) =>
    `<axialoffset method="${k.ref === "top" ? "top" : "bottom"}">${n(k.ref === "top" ? k.pos : -k.pos)}</axialoffset>`;
  /**
   * The name, id and position every part starts with.
   */
  const head = (k) => `<name>${e(k.name)}</name><id>${k.id}</id>${pos(k)}${known(k)}`;
  const sep = model.stages.length > 1;
  /**
   * A recovery part's deployment elements.
   */
  const deploy = (k) =>
    `<deployevent>${e(k.deploy || "apogee")}</deployevent><deployaltitude>${n(k.alt || 0)}</deployaltitude><deploydelay>${n(k.delay || 0)}</deploydelay>`;
  /**
   * A motor mount element with its motor and ignition.
   */
  const motorMount = (k, si) => {
    const upper = sep && si < model.stages.length - 1,
      ign = upper
        ? k.ign && k.ign !== "automatic" && k.ign !== "launch"
          ? k.ign
          : "burnout"
        : k.ign && k.ign !== "burnout"
          ? k.ign
          : "automatic";
    const idly = upper ? model.stages[si].ignDelay || 0 : k.ignDelay || 0;
    const mo = k.motor
      ? `<motor configid="${cfg}"><type>${e(k.motor.type || orkMotorType(k.motor))}</type><manufacturer>${e(k.motor.mfr)}</manufacturer><designation>${e(k.motor.name)}</designation><diameter>${n(k.motor.dia)}</diameter><length>${n(k.motor.len)}</length><delay>${k.delay == null || !(k.delay >= 0) ? "none" : n(k.delay)}</delay></motor>`
      : "";
    return `<motormount><ignitionevent>${ign}</ignitionevent><ignitiondelay>${n(idly)}</ignitiondelay><overhang>${n(k.overhang || 0)}</overhang>${mo}</motormount>`;
  };
  // OpenRocket doesn't take fins on a transition (a boattail): they're written on the body tube next to it, at the same place from the nose tip
  for (const b of lay.bodies) {
    if (b.p.type !== "transition") continue;
    const fins = b.kids.filter((c) => c.k.type === "fins");
    if (!fins.length) continue;
    const same = lay.bodies.filter((o) => o.si === b.si && o.p.type === "tube"),
      host = [...same].reverse().find((o) => o.pi < b.pi) || same.find((o) => o.pi > b.pi);
    if (!host) continue;
    b.kids = b.kids.filter((c) => c.k.type !== "fins");
    host.kids = [...host.kids, ...fins.map((c) => ({ ...c, abs: true }))];
  }
  /**
   * One attached or inner part as XML.
   */
  const kidXml = (c, b) => {
    const x = kidXml0(c, b);
    return c.abs
      ? x.replace(
          /<axialoffset method="[a-z]+">[^<]*<\/axialoffset>/,
          `<axialoffset method="absolute">${n(c.x)}</axialoffset>`,
        )
      : x;
  };
  const kidXml0 = (c, b) => {
    const k = c.k;
    const R = b.ri,
      pr = Math.max(R * 0.9, 0.005);
    switch (k.type) {
      case "fins": {
        const base = `${head(k)}${fin(k)}${bulk(k)}<fincount>${k.n}</fincount><rotation>${n(k.rot || 0)}</rotation><thickness>${n(k.t)}</thickness><crosssection>${k.edge}</crosssection><cant>${n(k.cant || 0)}</cant>${k.edge === "beveled" && (+k.bevLE > 0 || +k.bevTE > 0) ? `<prflbevelle>${n(+k.bevLE || 0)}</prflbevelle><prflbevelte>${n(+k.bevTE || 0)}</prflbevelte>` : ""}`;
        if (k.shape === "elliptical")
          return `<ellipticalfinset>${base}<rootchord>${n(k.root)}</rootchord><height>${n(k.span)}</height></ellipticalfinset>`;
        if (k.shape === "freeform") {
          const P = bldPts(k).pts,
            x0 = Math.min(...P.map((p) => p[0]));
          return `<freeformfinset>${base}<finpoints>${P.map(([x, y]) => `<point x="${n(x - x0)}" y="${n(y)}"/>`).join("")}</finpoints></freeformfinset>`;
        }
        return `<trapezoidfinset>${base}<rootchord>${n(k.root)}</rootchord><tipchord>${n(k.tip)}</tipchord><height>${n(k.span)}</height><sweeplength>${n(k.sweep)}</sweeplength></trapezoidfinset>`;
      }
      case "mount":
      case "inner": {
        const cl =
          k.type === "mount"
            ? `<clusterconfiguration>${e(k.cluster || "single")}</clusterconfiguration><clusterscale>${n(k.clusterScale || 1)}</clusterscale><clusterrotation>${n(k.clusterRot || 0)}</clusterrotation>`
            : `<clusterconfiguration>single</clusterconfiguration><clusterscale>1.0</clusterscale><clusterrotation>0.0</clusterrotation>`;
        return `<innertube>${head(k)}${bulk(k)}<length>${n(k.len)}</length><radialposition>0.0</radialposition><radialdirection>0.0</radialdirection><outerradius>${n(k.od / 2)}</outerradius><thickness>${n(k.wall)}</thickness>${cl}${k.type === "mount" ? motorMount(k, b.si) : ""}<subcomponents>${(k.inside || []).join("")}</subcomponents></innertube>`;
      }
      case "ring": {
        const ro = k.od > 0 ? k.od / 2 : R,
          inner = k.id_ > 0 ? k.id_ / 2 : bldMountR(b);
        return `<centeringring>${head(k)}${bulk(k)}<length>${n(k.len)}</length><radialposition>0.0</radialposition><radialdirection>0.0</radialdirection><outerradius>${n(ro)}</outerradius><innerradius>${n(Math.min(inner, ro))}</innerradius></centeringring>`;
      }
      case "bulkhead":
        return `<bulkhead>${head(k)}${bulk(k)}<length>${n(k.len)}</length><radialposition>0.0</radialposition><radialdirection>0.0</radialdirection><outerradius>${n(k.od > 0 ? k.od / 2 : R)}</outerradius></bulkhead>`;
      case "coupler": {
        const ro = k.od > 0 ? k.od / 2 : R;
        return `<tubecoupler>${head(k)}${bulk(k)}<length>${n(k.len)}</length><radialposition>0.0</radialposition><radialdirection>0.0</radialdirection><outerradius>${n(ro)}</outerradius><thickness>${n(Math.min(k.wall, ro))}</thickness><subcomponents/></tubecoupler>`;
      }
      case "lug":
        return `<launchlug>${head(k)}${fin(k)}${bulk(k)}<radialdirection>${n(k.dir || 0)}</radialdirection><radius>${n(k.od / 2)}</radius><thickness>${n(Math.max((k.od - k.id_) / 2, 1e-4))}</thickness><length>${n(k.len)}</length></launchlug>`;
      case "buttons": {
        const P = k.size === "custom" && k.dims ? k.dims : BLD_BUTTONS[k.size] || BLD_BUTTONS["1010"];
        // OpenRocket lines the copies up aft of the first button, so place the first one from the front
        return `<railbutton><name>${e(k.name)}</name><id>${k.id}</id><axialoffset method="top">${n(c.x - b.x + 0.005)}</axialoffset>${known(k)}${fin(k)}${k.mat ? bulk(k) : `<material type="bulk" density="1150">Delrin</material>`}<instancecount>${k.n}</instancecount><instanceseparation>${n(k.sep)}</instanceseparation><angleoffset method="relative">${n(k.dir || 0)}</angleoffset><outerdiameter>${n(P.od)}</outerdiameter><innerdiameter>${n(P.id)}</innerdiameter><height>${n(P.h)}</height><baseheight>${n(P.bs)}</baseheight><flangeheight>${n(P.fl)}</flangeheight><screwheight>0.0</screwheight></railbutton>`;
      }
      case "chute":
        return `<parachute>${head(k)}<packedlength>${n(k.packLen)}</packedlength><packedradius>${k.packAuto ? "auto " : ""}${n(k.packR > 0 ? k.packR : pr)}</packedradius><radialposition>0.0</radialposition><radialdirection>0.0</radialdirection><cd>${n(k.cd)}</cd>${surf(k)}${deploy(k)}<diameter>${n(k.dia)}</diameter><linecount>${k.lines}</linecount><linelength>${n(k.lineLen > 0 ? k.lineLen : k.dia)}</linelength><linematerial type="line" density="${n(k.lineDens > 0 ? k.lineDens : 0.0013)}">${e(k.lineMat || "Elastic cord (flat 6 mm, 1/4 in)")}</linematerial></parachute>`;
      case "streamer":
        return `<streamer>${head(k)}<packedlength>${n(k.packLen)}</packedlength><packedradius>${k.packAuto ? "auto " : ""}${n(k.packR > 0 ? k.packR : pr)}</packedradius><radialposition>0.0</radialposition><radialdirection>0.0</radialdirection><cd>${k.cd > 0 ? n(k.cd) : "auto"}</cd>${surf(k)}${deploy(k)}<striplength>${n(k.len)}</striplength><stripwidth>${n(k.width)}</stripwidth></streamer>`;
      case "cord":
        return `<shockcord>${head(k)}<packedlength>${n(k.packLen)}</packedlength><packedradius>${k.packAuto ? "auto " : ""}${n(k.packR > 0 ? k.packR : pr * 0.6)}</packedradius><radialposition>0.0</radialposition><radialdirection>0.0</radialdirection><cordlength>${n(k.cordLen)}</cordlength>${line(k)}</shockcord>`;
      case "mass":
        return `<masscomponent>${head(k)}<packedlength>${n(k.len)}</packedlength><packedradius>${k.packAuto ? "auto " : ""}${n(k.packR > 0 ? k.packR : pr * 0.6)}</packedradius><radialposition>${n(k.radPos || 0)}</radialposition><radialdirection>0.0</radialdirection><mass>${n(k.mass)}</mass><masscomponenttype>${e(k.massType || "masscomponent")}</masscomponenttype></masscomponent>`;
      case "bump":
        // OpenRocket reads it as a mass; the prflbump tags carry its outside shape and size for this app. A fly-away rail
        // guide is written with no weight (it is not on the rocket in flight); prflflymass carries its weight on the rail
        return `<masscomponent>${head(k)}<packedlength>${n(k.len)}</packedlength><packedradius>${k.packAuto ? "auto " : ""}${n(k.packR > 0 ? k.packR : pr * 0.6)}</packedradius><radialposition>${n(k.radPos || 0)}</radialposition><radialdirection>0.0</radialdirection><mass>${n(k.shape === "flyaway" ? 0 : k.mass)}</mass><masscomponenttype>masscomponent</masscomponenttype>${k.shape === "flyaway" ? `<prflflymass>${n(k.mass)}</prflflymass>` : ""}<prflbump>${e(k.shape || "bluff")}</prflbump><prflbumpw>${n(k.w)}</prflbumpw><prflbumph>${n(k.h)}</prflbumph></masscomponent>`;
      case "raw":
        return String(k.xml || "").replace(/^(<[a-z]+[^>]*>)/i, `$1${pos(k)}`);
    }
    return "";
  };
  /**
   * One body part with its attached parts.
   */
  const bodyXml = (b) => {
    const p = b.p,
      kids = b.kids.map((c) => kidXml(c, b)).join(""),
      base = `<name>${e(p.name)}</name><id>${p.id}</id>${known(p)}${fin(p)}${bulk(p)}`;
    if (p.type === "nose") {
      const sr = p.shR != null && p.shR >= 0 && p.shLen > 0 && p.shR > 0 ? p.shR : Math.max(p.dia / 2 - p.wall, 0.001);
      return `<nosecone>${base}<length>${n(p.len)}</length><thickness>${n(p.filled ? p.dia / 2 : p.wall)}</thickness><shape>${p.shape}</shape><shapeclipped>${!!p.clipped}</shapeclipped><shapeparameter>${n(p.param)}</shapeparameter><aftradius>${n(p.dia / 2)}</aftradius><aftshoulderradius>${n(p.shLen > 0 ? sr : 0)}</aftshoulderradius><aftshoulderlength>${n(p.shLen || 0)}</aftshoulderlength><aftshoulderthickness>${n(p.shLen > 0 ? (p.shT != null ? Math.min(p.shT, sr) : p.filled ? sr : Math.min(p.wall, sr)) : 0)}</aftshoulderthickness><aftshouldercapped>${!!p.shCap}</aftshouldercapped><isflipped>false</isflipped><subcomponents>${kids}</subcomponents></nosecone>`;
    }
    if (p.type === "tube")
      return `<bodytube>${base}<length>${n(p.len)}</length><thickness>${n(p.wall)}</thickness><radius>${n(p.od / 2)}</radius>${p.mm ? motorMount(p.mm, b.si) : ""}<subcomponents>${kids}</subcomponents></bodytube>`;
    const sh = (w, len, r, t, cap) =>
      `<${w}shoulderradius>${n(len > 0 ? r : 0)}</${w}shoulderradius><${w}shoulderlength>${n(len || 0)}</${w}shoulderlength><${w}shoulderthickness>${n(len > 0 ? t : 0)}</${w}shoulderthickness><${w}shouldercapped>${!!cap}</${w}shouldercapped>`;
    return `<transition>${base}<length>${n(p.len)}</length><thickness>${n(p.filled ? Math.max(p.dia1, p.dia2) / 2 : p.wall)}</thickness><shape>${p.shape}</shape><shapeclipped>${!!p.clipped}</shapeclipped><shapeparameter>${n(p.param)}</shapeparameter><foreradius>${n(p.dia1 / 2)}</foreradius><aftradius>${n(p.dia2 / 2)}</aftradius>${sh("fore", p.sh1Len, p.sh1R > 0 ? p.sh1R : p.dia1 / 2 - p.wall, p.sh1T != null ? p.sh1T : p.wall, p.sh1Cap)}${sh("aft", p.sh2Len, p.sh2R > 0 ? p.sh2R : p.dia2 / 2 - p.wall, p.sh2T != null ? p.sh2T : p.wall, p.sh2Cap)}<subcomponents>${kids}</subcomponents></transition>`;
  };
  const stages = model.stages
    .map((st, si) => {
      const all = st.knownAll !== false,
        known = bldOvOn(st, "known")
          ? `<overridemass>${n(st.known)}</overridemass><overridesubcomponentsmass>${all}</overridesubcomponentsmass>`
          : "",
        kcg = bldOvOn(st, "knownCg")
          ? `<overridecg>${n(st.knownCg)}</overridecg><overridesubcomponentscg>${all}</overridesubcomponentscg>`
          : "";
      const cdo =
        si === 0 && bldOvOn(S, "cdOverride")
          ? `<overridecd>${n(S.cdOverride)}</overridecd><overridesubcomponentscd>true</overridesubcomponentscd>`
          : "";
      return `<stage><name>${e(st.name)}</name><id>${st.id}</id>${known}${kcg}${cdo}${si > 0 ? `<separationevent>${e(st.sepEvent || "burnout")}</separationevent><separationdelay>${n(st.sepDelay || 0)}</separationdelay>` : ""}<subcomponents>${lay.bodies
        .filter((b) => b.si === si)
        .map(bodyXml)
        .join("")}</subcomponents></stage>`;
    })
    .join("");
  const LL = L || {
    rail: 1.83,
    angle: 0,
    wind: 2,
    turb: 0.1,
    windDir: 270,
    elev: 0,
    tempC: 15,
    railMode: "into",
    railDir: 90,
  };
  const cond = `<conditions><configid>${cfg}</configid><launchrodlength>${n(LL.rail)}</launchrodlength><launchintowind>${LL.railMode !== "fixed"}</launchintowind><launchrodangle>${n(LL.angle || 0)}</launchrodangle><launchroddirection>${n(LL.railMode === "fixed" ? LL.railDir || 90 : 90)}</launchroddirection><windaverage>${n(LL.wind || 0)}</windaverage><windturbulence>${n(LL.turb || 0)}</windturbulence><winddirection>${n(((LL.windDir || 0) * Math.PI) / 180)}</winddirection><wind model="average"><speed>${n(LL.wind || 0)}</speed><direction>${n(((LL.windDir || 0) * Math.PI) / 180)}</direction><standarddeviation>${n((LL.wind || 0) * (LL.turb || 0))}</standarddeviation></wind><windmodeltype>Average</windmodeltype><launchaltitude>${n(LL.elev || 0)}</launchaltitude><launchlatitude>${n(LL.lat ?? 40)}</launchlatitude><launchlongitude>${n(LL.lon ?? -111.9)}</launchlongitude><geodeticmethod>flat</geodeticmethod><atmosphere model="extendedisa"><basetemperature>${n((LL.tempC ?? 15) + 273.15)}</basetemperature><basepressure>${n(101325 * Math.pow(Math.max(1 - 2.25577e-5 * (LL.elev || 0), 0.01), 5.25588))}</basepressure></atmosphere><timestep>0.05</timestep><maxtime>1200.0</maxtime></conditions>`;
  const actives = model.stages.map((_, i) => `<stage number="${i}" active="true"/>`).join("");
  return `<?xml version='1.0' encoding='utf-8'?>\n<openrocket version="1.9" creator="Pocket Rocket Flight Lab"><rocket><name>${e(model.name || "My rocket")}</name><id>${model.rid || (model.rid = bldId())}</id><axialoffset method="absolute">0.0</axialoffset><position type="absolute">0.0</position><motorconfiguration configid="${cfg}" default="true">${actives}</motorconfiguration><referencetype>maximum</referencetype><subcomponents>${stages}</subcomponents></rocket><simulations><simulation status="outdated"><name>Simulation 1</name><simulator>RK4Simulator</simulator><calculator>BarrowmanCalculator</calculator>${cond}</simulation></simulations><photostudio/></openrocket>`;
}
