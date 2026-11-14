/**
 * Reading a design file into builder parts (see the note below).
 */
import {
  BLD_BULK,
  BLD_BUTTONS,
  BLD_LINE,
  BLD_NAMES,
  BLD_SURF,
  bldBodyR,
  bldId,
  bldMounts,
  bldNew,
  bldPts,
  bldSettings,
} from "./model.js";
import { finTeEdge } from "../core/units-and-fin-edges.js";
import { unflipNoses } from "../files/openrocket-import.js";
import { matchMotor } from "../files/rocksim-import.js";
import { ORK_CFG, ORK_SIM } from "../files/save.js";
import { rktEj } from "../recovery/ejection-charge.js";
/* ---------- reading a design file into builder parts ----------
   .rkt files arrive already converted to .ork text. Parts the builder can't edit (pods, tube fins,
   engine blocks...) are kept exactly as written, so they still fly and still save. */
/**
 * Reads .ork XML into a builder model.
 * @param {string} xml
 * @param {object} [info] the importer's result for the same file (motors, configuration...)
 * @returns {object} builder model
 * @throws {Error} if there is no rocket in the file
 */
export function bldFromOrk(xml, info) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  unflipNoses(doc);
  const rocket = doc.querySelector("openrocket > rocket") || doc.getElementsByTagName("rocket")[0];
  if (!rocket) throw new Error("No rocket was found in this file.");
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
   * The first number in a child element's text, or def.
   */
  const num = (el, tag, def = 0) => {
    const s = txt(el, tag);
    if (s == null) return def;
    const mm = s.match(/-?\d+(\.\d+)?(e-?\d+)?/i);
    return mm ? parseFloat(mm[0]) : def;
  };
  /**
   * True if a child element's value is "auto".
   */
  const isAuto = (el, tag) => /^\s*auto/i.test(txt(el, tag) || "");
  /**
   * A component's subcomponents.
   */
  const subs = (el) => {
    const s = kid(el, "subcomponents");
    return s ? [...s.children] : [];
  };
  /**
   * A part kept as written, without its own position (the builder writes that, in this body part's frame).
   */
  const ser = (el) => {
    const c = el.cloneNode(true);
    [...c.children]
      .filter((k) => k.tagName === "axialoffset" || k.tagName === "position")
      .forEach((k) => c.removeChild(k));
    return new XMLSerializer().serializeToString(c).replace(/ xmlns="[^"]*"/g, "");
  };
  /**
   * A component's position method and value.
   */
  const offset = (c) => {
    const ao = kid(c, "axialoffset"),
      po = kid(c, "position");
    const el = ao && po ? ([...c.children].indexOf(po) > [...c.children].indexOf(ao) ? po : ao) : ao || po;
    return el
      ? {
          method: (el.getAttribute("method") || el.getAttribute("type") || "top").toLowerCase(),
          val: parseFloat(el.textContent) || 0,
        }
      : { method: "top", val: 0 };
  };
  /**
   * A free-form fin's outline as "x,y" lines.
   */
  const ptsOf = (c) => {
    const fp = kid(c, "finpoints");
    return fp ? [...fp.children].map((p) => [parseFloat(p.getAttribute("x")), parseFloat(p.getAttribute("y"))]) : [];
  };
  /**
   * A component's length along the body.
   */
  const lenOf = (c) => {
    switch (c.tagName) {
      case "trapezoidfinset":
      case "ellipticalfinset":
        return num(c, "rootchord");
      case "freeformfinset": {
        const xs = ptsOf(c).map((p) => p[0]);
        return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
      }
      case "parachute":
      case "streamer":
      case "shockcord":
      case "masscomponent":
        return num(c, "packedlength");
      default:
        return num(c, "length");
    }
  };
  /**
   * A component's forward end from its parent's front.
   */
  const place = (c, px, plen) => {
    const o = offset(c),
      len = lenOf(c);
    switch (o.method) {
      case "bottom":
        return px + plen - len + o.val;
      case "middle":
        return px + (plen - len) / 2 + o.val;
      case "absolute":
        return o.val;
      default:
        return px + o.val;
    }
  };
  /**
   * A part's material name and density.
   */
  const mat = (c, tag = "material") => {
    const m = kid(c, tag);
    if (!m) return {};
    const d = parseFloat(m.getAttribute("density")) || 0,
      nm = m.textContent.trim();
    const all = [...BLD_BULK, ...BLD_SURF, ...BLD_LINE],
      std = all.find((x) => x[0] === nm && Math.abs(x[1] - d) < 1e-9);
    return std ? { mat: nm } : { mat: nm || "Material", dens: d };
  };
  /**
   * The fields every part has: id, name, material, mass and CG overrides, Cd override.
   */
  const common = (c) => {
    const o = { id: txt(c, "id") || bldId(), name: txt(c, "name") || BLD_NAMES.raw, ...mat(c) };
    const f = txt(c, "finish");
    if (f) o.finish = f;
    if (kid(c, "overridemass")) {
      o.known = num(c, "overridemass");
      o.knownAll = txt(c, "overridesubcomponentsmass") === "true";
      if (!(o.known > 0)) o.known = 1e-9;
      if (kid(c, "rktcalc")) o.knownCalc = true;
    } else o.known = 0;
    if (kid(c, "overridecd")) {
      o.cdo = num(c, "overridecd");
      o.cdoAll = txt(c, "overridesubcomponentscd") === "true";
    }
    if (kid(c, "overridecg")) {
      o.knownCg = num(c, "overridecg");
      if (txt(c, "overridesubcomponentscg") === "true") o.knownAll = true;
    }
    return o;
  };
  const cfgEl = [...rocket.children].filter((c) => c.tagName === "motorconfiguration");
  const sims = [...doc.getElementsByTagName("simulation")],
    scfg = (sm) =>
      sm && sm.getElementsByTagName("conditions")[0]?.getElementsByTagName("configid")[0]?.textContent.trim();
  const chosen = ORK_SIM != null ? sims[ORK_SIM] || null : null;
  const pickC = chosen
    ? scfg(chosen) || null
    : ORK_CFG && cfgEl.some((c) => c.getAttribute("configid") === ORK_CFG)
      ? ORK_CFG
      : null;
  const refSim = chosen
    ? chosen
    : pickC
      ? sims.find((s) => scfg(s) === pickC && s.getElementsByTagName("flightdata")[0]?.getAttribute("maxaltitude")) ||
        sims.find((s) => scfg(s) === pickC) ||
        null
      : sims.find((s) => s.getElementsByTagName("flightdata")[0]?.getAttribute("maxaltitude")) || sims[0];
  const simCfg = scfg(refSim);
  const cfg =
    pickC ||
    simCfg ||
    (cfgEl.find((c) => c.getAttribute("default") === "true") || cfgEl[0])?.getAttribute("configid") ||
    bldId();
  /**
   * The element for the motor configuration in use (else the default).
   */
  const forCfg = (el, tag) =>
    [...el.children].filter((c) => c.tagName === tag).find((c) => c.getAttribute("configid") === cfg);
  /**
   * A recovery part's deployment: event, altitude, delay.
   */
  const dep = (e) => {
    const dc = forCfg(e, "deploymentconfiguration"),
      g = (t, d) =>
        dc && txt(dc, t) != null
          ? t === "deployevent"
            ? txt(dc, t)
            : num(dc, t)
          : t === "deployevent"
            ? txt(e, t) || d
            : num(e, t);
    return {
      deploy: String(g("deployevent", "apogee")).toLowerCase(),
      alt: g("deployaltitude"),
      delay: g("deploydelay"),
    };
  };
  /**
   * A motor mount's settings and motor.
   */
  const mountOf = (mm, k) => {
    const motors = [...mm.children].filter((c) => c.tagName === "motor"),
      // the motor for this configuration; a mount with motors only for other configurations is empty in this one
      mo =
        motors.find((m) => m.getAttribute("configid") === cfg) ||
        (motors.some((m) => m.getAttribute("configid")) ? null : motors[0]);
    const ic = [...mm.children]
      .filter((c) => c.tagName === "ignitionconfiguration")
      .find((c) => c.getAttribute("configid") === cfg);
    k.overhang =
      txt(mm, "overhang") != null ? num(mm, "overhang") : num(mm.parentNode || mm.parentElement || mm, "overhang");
    k.ign = ((ic && txt(ic, "ignitionevent")) || txt(mm, "ignitionevent") || "automatic").toLowerCase();
    k.ignDelay = ic && txt(ic, "ignitiondelay") != null ? num(ic, "ignitiondelay") : num(mm, "ignitiondelay");
    if (mo) {
      const dl = (txt(mo, "delay") || "").trim().toLowerCase();
      k.motor = {
        mfr: txt(mo, "manufacturer") || "",
        name: txt(mo, "designation") || "",
        dia: num(mo, "diameter"),
        len: num(mo, "length"),
        type: txt(mo, "type") || "reload",
      };
      k.delay = dl === "" || dl === "none" || !isFinite(parseFloat(dl)) ? null : parseFloat(dl);
    } else {
      k.motor = null;
      k.delay = null;
    }
    return k;
  };
  // stages and side booster sets switched off in this flight configuration (by id, so the flight leaves them out)
  const offIds = [];
  {
    const mc = cfgEl.find((c) => c.getAttribute("configid") === cfg);
    const all = [...rocket.getElementsByTagName("*")].filter(
      (e) => e.tagName === "stage" || e.tagName === "parallelstage",
    );
    if (mc)
      for (const st of mc.getElementsByTagName("stage"))
        if (st.getAttribute("active") === "false" && all[+st.getAttribute("number")])
          offIds.push(txt(all[+st.getAttribute("number")], "id"));
  }
  const model = {
    name: txt(rocket, "name") || "Rocket",
    rid: txt(rocket, "id") || bldId(),
    src: "ork",
    cfg,
    ...(offIds.filter(Boolean).length ? { offIds: offIds.filter(Boolean) } : {}),
    settings: bldSettings(),
    ref: null,
    stages: [],
  };
  const rcd = kid(rocket, "overridecd");
  // body parts, with "auto" radii resolved from the neighbouring parts
  const stages = subs(rocket).filter((c) => c.tagName === "stage");
  const bodies = stages.flatMap((s) =>
    subs(s).filter((c) => ["nosecone", "bodytube", "transition"].includes(c.tagName)),
  );
  /**
   * The cached number after "auto".
   *
   * The same rules the flight code uses: an automatic radius follows the part before it, else the next stated one.
   */
  const autoNum = (el, tag) => {
    const m = (txt(el, tag) || "").match(/-?\d+(\.\d+)?(e-?\d+)?/i);
    return m ? parseFloat(m[0]) : 0;
  };
  /**
   * The next stated radius aft of a part.
   */
  const nextExplicit = (e) => {
    const i = bodies.indexOf(e);
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (b.tagName === "bodytube" && !isAuto(b, "radius")) return num(b, "radius");
      if (b.tagName === "transition" && !isAuto(b, "foreradius")) return num(b, "foreradius");
    }
    return 0;
  };
  const res = new Map();
  let last = 0;
  for (const e of bodies) {
    if (e.tagName === "nosecone") {
      const a = isAuto(e, "aftradius") ? last || nextExplicit(e) || autoNum(e, "aftradius") : num(e, "aftradius");
      res.set(e, { f: 0, a });
      last = a;
    } else if (e.tagName === "bodytube") {
      const r = isAuto(e, "radius") ? last || nextExplicit(e) || autoNum(e, "radius") : num(e, "radius");
      res.set(e, { f: r, a: r });
      last = r;
    } else {
      const f = isAuto(e, "foreradius") ? last || autoNum(e, "foreradius") : num(e, "foreradius"),
        a = isAuto(e, "aftradius") ? nextExplicit(e) || autoNum(e, "aftradius") || f : num(e, "aftradius");
      res.set(e, { f, a });
      last = a;
    }
  }
  let x = 0;
  for (const s of stages) {
    const sc = forCfg(s, "separationconfiguration");
    const st = {
      id: txt(s, "id") || bldId(),
      name: txt(s, "name") || "Stage",
      sepEvent: ((sc && txt(sc, "separationevent")) || txt(s, "separationevent") || "burnout").toLowerCase(),
      sepDelay: sc ? num(sc, "separationdelay") : num(s, "separationdelay"),
      ignDelay: 0,
      parts: [],
    };
    if (kid(s, "overridemass")) {
      st.known = num(s, "overridemass");
      st.knownAll = txt(s, "overridesubcomponentsmass") === "true";
    }
    if (kid(s, "overridecg")) {
      st.knownCg = num(s, "overridecg");
      if (txt(s, "overridesubcomponentscg") === "true") st.knownAll = true;
    }
    const scd = kid(s, "overridecd");
    if (scd && !model.settings.cdOverride) model.settings.cdOverride = parseFloat(scd.textContent) || 0;
    for (const c of subs(s)) {
      const t = c.tagName;
      if (!["nosecone", "bodytube", "transition"].includes(t)) {
        // something unusual at stage level: keep it on the part before it
        const last = st.parts[st.parts.length - 1];
        if (last)
          last.kids.push({
            ...common(c),
            type: "raw",
            tag: t,
            xml: ser(c),
            ref: "top",
            pos: Math.max(place(c, x - last.len, last.len) - (x - last.len), 0),
            len: lenOf(c),
          });
        continue;
      }
      const r = res.get(c),
        len = num(c, "length"),
        p = { ...common(c), kids: [] };
      if (t === "nosecone") {
        Object.assign(p, {
          type: "nose",
          shape: (txt(c, "shape") || "ogive").toLowerCase(),
          param: num(c, "shapeparameter", 1),
          len,
          dia: 2 * r.a,
        });
        const th = num(c, "thickness", 0.002);
        p.filled =
          /filled/i.test(txt(c, "thickness") || "") || txt(c, "filled") === "true" || (r.a > 0 && th >= r.a * 0.999);
        p.wall = p.filled ? 0.002 : th;
        p.shLen = num(c, "aftshoulderlength");
        p.shR = num(c, "aftshoulderradius");
        p.shT = num(c, "aftshoulderthickness");
        p.shCap = txt(c, "aftshouldercapped") === "true";
        p.clipped = txt(c, "shapeclipped") === "true";
      } else if (t === "bodytube") {
        Object.assign(p, { type: "tube", len, od: 2 * r.f, wall: num(c, "thickness", 0.001), mm: null });
        const mm = kid(c, "motormount");
        if (mm) p.mm = mountOf(mm, {});
      } else {
        Object.assign(p, {
          type: "transition",
          shape: (txt(c, "shape") || "conical").toLowerCase(),
          param: num(c, "shapeparameter", 0),
          len,
          dia1: 2 * r.f,
          dia2: 2 * r.a,
        });
        const th = num(c, "thickness", 0.002);
        p.filled =
          /filled/i.test(txt(c, "thickness") || "") || (th >= Math.max(r.f, r.a) * 0.999 && Math.max(r.f, r.a) > 0);
        p.wall = p.filled ? 0.002 : th;
        p.clipped = txt(c, "shapeclipped") === "true";
        p.sh1Len = num(c, "foreshoulderlength");
        p.sh1R = num(c, "foreshoulderradius");
        p.sh1T = num(c, "foreshoulderthickness");
        p.sh1Cap = txt(c, "foreshouldercapped") === "true";
        p.sh2Len = num(c, "aftshoulderlength");
        p.sh2R = num(c, "aftshoulderradius");
        p.sh2T = num(c, "aftshoulderthickness");
        p.sh2Cap = txt(c, "aftshouldercapped") === "true";
      }
      // attached parts; parts nested inside an inner tube or coupler move up to this body part, measured from its front
      const flat = (list, px, plen, direct, innerR) => {
        for (const e of list) {
          const ex = place(e, px, plen),
            elen = lenOf(e),
            o = offset(e),
            pos0 =
              direct && (o.method === "top" || o.method === "bottom")
                ? { ref: o.method, pos: o.method === "top" ? o.val : -o.val }
                : { ref: "top", pos: ex - x };
          const k = { ...common(e), ...pos0 },
            et = e.tagName;
          switch (et) {
            case "trapezoidfinset":
              Object.assign(k, {
                type: "fins",
                n: Math.round(num(e, "fincount", 3)),
                t: num(e, "thickness", 0.003),
                edge: (txt(e, "crosssection") || "square").toLowerCase(),
                edgeTE: finTeEdge(txt(e, "prfltrailingedge") || ""),
                bevLE: num(e, "prflbevelle"),
                bevTE: num(e, "prflbevelte"),
                cant: num(e, "cant"),
                rot: num(e, "rotation"),
                shape: "trapezoid",
                root: num(e, "rootchord"),
                tip: num(e, "tipchord"),
                span: num(e, "height"),
                sweep: num(e, "sweeplength"),
              });
              break;
            case "ellipticalfinset":
              Object.assign(k, {
                type: "fins",
                n: Math.round(num(e, "fincount", 3)),
                t: num(e, "thickness", 0.003),
                edge: (txt(e, "crosssection") || "square").toLowerCase(),
                edgeTE: finTeEdge(txt(e, "prfltrailingedge") || ""),
                bevLE: num(e, "prflbevelle"),
                bevTE: num(e, "prflbevelte"),
                cant: num(e, "cant"),
                rot: num(e, "rotation"),
                shape: "elliptical",
                root: num(e, "rootchord"),
                span: num(e, "height"),
                tip: 0,
                sweep: 0,
              });
              break;
            case "freeformfinset": {
              const P = ptsOf(e);
              Object.assign(k, {
                type: "fins",
                n: Math.round(num(e, "fincount", 3)),
                t: num(e, "thickness", 0.003),
                edge: (txt(e, "crosssection") || "square").toLowerCase(),
                edgeTE: finTeEdge(txt(e, "prfltrailingedge") || ""),
                bevLE: num(e, "prflbevelle"),
                bevTE: num(e, "prflbevelte"),
                cant: num(e, "cant"),
                rot: num(e, "rotation"),
                shape: "freeform",
                pts: P.map(([a, b]) => `${a},${b}`).join("\n"),
                root: lenOf(e),
                span: Math.max(0, ...P.map((p) => p[1])),
                tip: 0,
                sweep: 0,
              });
              break;
            }
            case "bodytube":
            case "innertube": {
              const mm = kid(e, "motormount");
              Object.assign(k, {
                type: mm ? "mount" : "inner",
                od:
                  2 *
                  (et === "bodytube"
                    ? isAuto(e, "radius") && innerR
                      ? innerR
                      : num(e, "radius")
                    : num(e, "outerradius")),
                wall: num(e, "thickness", 0.0008),
                len: num(e, "length"),
                cluster: txt(e, "clusterconfiguration") || "single",
                clusterScale: num(e, "clusterscale", 1),
                clusterRot: num(e, "clusterrotation"),
              });
              if (mm) mountOf(mm, k);
              break;
            }
            case "centeringring":
              Object.assign(k, {
                type: "ring",
                od: isAuto(e, "outerradius") ? (innerR ? 2 * innerR : 0) : 2 * num(e, "outerradius"),
                id_: isAuto(e, "innerradius") ? 0 : 2 * num(e, "innerradius"),
                len: num(e, "length"),
              });
              break;
            case "bulkhead":
              Object.assign(k, {
                type: "bulkhead",
                od: isAuto(e, "outerradius") ? (innerR ? 2 * innerR : 0) : 2 * num(e, "outerradius"),
                len: num(e, "length"),
              });
              break;
            case "tubecoupler":
              Object.assign(k, {
                type: "coupler",
                od: isAuto(e, "outerradius") ? (innerR ? 2 * innerR : 0) : 2 * num(e, "outerradius"),
                wall: num(e, "thickness", 0.0015),
                len: num(e, "length"),
              });
              break;
            case "launchlug":
              Object.assign(k, {
                type: "lug",
                // its type, when the app saved it; otherwise it is read from its size (bldLugKind) when needed
                ...((txt(e, "prfllug") || "").trim() ? { kind: txt(e, "prfllug").trim() } : {}),
                ...(num(e, "prfllugw") > 0 ? { w: num(e, "prfllugw") } : {}),
                od: 2 * num(e, "radius"),
                id_: Math.max(2 * (num(e, "radius") - num(e, "thickness")), 0),
                len: num(e, "length"),
                dir: num(e, "radialdirection"),
              });
              break;
            case "railbutton": {
              const d = {
                od: num(e, "outerdiameter", 0.0102),
                id: num(e, "innerdiameter", 0.0064),
                h: num(e, "height", 0.0097),
                bs: num(e, "baseheight", 0.002),
                fl: num(e, "flangeheight", 0.002),
              };
              const pre = Object.entries(BLD_BUTTONS).find(
                ([, v]) => Math.abs(v.od - d.od) < 2e-4 && Math.abs(v.h - d.h) < 2e-4,
              );
              Object.assign(k, {
                type: "buttons",
                size: pre ? pre[0] : "custom",
                dims: d,
                n: Math.max(1, Math.round(num(e, "instancecount", 1))),
                sep: num(e, "instanceseparation"),
                ref: "top",
                pos: ex - x - 0.005,
              });
              break;
            }
            case "parachute":
              Object.assign(k, {
                type: "chute",
                dia: num(e, "diameter"),
                cd: /auto/i.test(txt(e, "cd") || "") ? 0.8 : num(e, "cd", 0.8),
                ...dep(e),
                lines: Math.round(num(e, "linecount", 6)),
                // a file's line length of 0 means no shroud lines; the builder's 0 means as long as the chute is wide,
                // which is how it is written, so lines exactly that long are read back as following the chute
                lineLen:
                  kid(e, "linelength") && num(e, "linelength") === 0
                    ? 1e-9
                    : Math.abs(num(e, "linelength") - num(e, "diameter")) < 1e-9
                      ? 0
                      : num(e, "linelength"),
                packLen: num(e, "packedlength"),
                packR: num(e, "packedradius"),
              });
              {
                const lm = kid(e, "linematerial");
                if (lm) {
                  k.lineMat = lm.textContent.trim();
                  k.lineDens = parseFloat(lm.getAttribute("density")) || 0;
                }
              }
              break;
            case "streamer":
              Object.assign(k, {
                type: "streamer",
                len: num(e, "striplength"),
                width: num(e, "stripwidth"),
                cd: /auto/i.test(txt(e, "cd") || "auto") ? 0 : num(e, "cd"),
                ...dep(e),
                packLen: num(e, "packedlength"),
                packR: num(e, "packedradius"),
              });
              break;
            case "shockcord":
              Object.assign(k, {
                type: "cord",
                cordLen: num(e, "cordlength"),
                packLen: num(e, "packedlength"),
                packR: num(e, "packedradius"),
              });
              break;
            case "masscomponent":
              if (txt(e, "prflbump")) {
                // a protuberance on the outside of the body (this app's tags on an OpenRocket mass)
                Object.assign(k, {
                  type: "bump",
                  shape: txt(e, "prflbump").trim(),
                  w: num(e, "prflbumpw"),
                  h: num(e, "prflbumph"),
                  len: num(e, "packedlength"),
                  ang: num(e, "radialdirection"),
                  mass: txt(e, "prflflymass") ? num(e, "prflflymass") : num(e, "mass"),
                });
                break;
              }
              Object.assign(k, {
                type: "mass",
                mass: num(e, "mass"),
                len: num(e, "packedlength"),
                packR: num(e, "packedradius"),
                radPos: num(e, "radialposition"),
                massType: txt(e, "masscomponenttype") || "masscomponent",
              });
              break;
            default: {
              let xml = ser(e);
              // an automatic size inside a container means the container's inside: write it out, since the part moves up a level
              if (innerR) xml = xml.replace(/<(outerradius|radius)>\s*auto[^<]*<\/\1>/g, `<$1>${innerR}</$1>`);
              Object.assign(k, { type: "raw", tag: et, xml, len: elen }, direct ? {} : { ref: "top", pos: ex - x });
            }
          }
          if (/^(parachute|streamer|shockcord|masscomponent)$/.test(et) && /auto/i.test(txt(e, "packedradius") || ""))
            k.packAuto = true;
          p.kids.push(k);
          // what was inside an inner tube or coupler now sits on the body part, at the same place
          if (et === "innertube" || et === "tubecoupler" || et === "bodytube") {
            const inner = subs(e);
            // parts inside a clustered tube repeat with each tube: keep them inside it, as written
            if (inner.length && k.cluster && k.cluster !== "single") {
              k.inside = inner.map((i) => new XMLSerializer().serializeToString(i).replace(/ xmlns="[^"]*"/g, ""));
            } else if (inner.length) {
              const or_ = k.od > 0 ? k.od / 2 : innerR || bodyIR || 0,
                ir = or_ - (k.wall || 0);
              flat(inner, ex, elen, false, ir > 0 ? ir : null);
            }
          }
        }
      };
      const bodyIR = t === "bodytube" ? r.f - num(c, "thickness", 0.001) : null;
      flat(subs(c), x, len, true, null);
      st.parts.push(p);
      x += len;
    }
    model.stages.push(st);
  }
  // RockSim's internal stage names read better as sustainer and booster
  if (model.stages.every((st) => /^Stage\dParts$/.test(st.name)))
    model.stages.forEach(
      (st, i) =>
        (st.name =
          model.stages.length === 1
            ? "Stage"
            : i === 0
              ? "Sustainer"
              : i === model.stages.length - 1 && i > 1
                ? "First stage"
                : "Booster"),
    );
  // the sustainer lights after the booster: keep its delay on the stage, where the builder shows it
  model.stages.forEach((st, i) => {
    if (i < model.stages.length - 1) {
      const m = bldMounts(st)[0];
      if (m) st.ignDelay = m.ignDelay || 0;
    }
  });
  if (rcd) model.settings.cdOverride = parseFloat(rcd.textContent) || 0;
  // a whole-rocket weight or balance from a RockSim file goes on the first stage
  if (model.stages.length === 1) {
    const s0 = model.stages[0];
    if (kid(rocket, "overridemass") && !(s0.known > 0)) s0.known = num(rocket, "overridemass");
    if (kid(rocket, "overridecg") && s0.knownCg == null && num(rocket, "overridecg") > 0)
      s0.knownCg = num(rocket, "overridecg");
  }
  // a RockSim file keeps its motors and ejection timing in its simulation, not in the parts: put them on the mounts
  if (info && info.rkt) {
    const mo = (x) => {
      if (!x || !x.designation) return null;
      const m = typeof matchMotor === "function" ? matchMotor(x) : null;
      return {
        mfr: x.mfr || "",
        name: x.designation,
        dia: m ? m.dia : x.dia || 0,
        len: m ? m.len : 0,
        id: m ? m.id : undefined,
      };
    };
    const s0 = model.stages[0],
      m0 = bldMounts(s0)[0],
      three = !!(info.design && info.design.threeStage && model.stages.length === 3),
      last = model.stages[three ? 1 : model.stages.length - 1],
      mb = model.stages.length > 1 ? bldMounts(last)[0] : null;
    const m1 = three ? bldMounts(model.stages[2])[0] : null;
    if (m0) {
      // every motor in the stage; the mount gets the one that fits it, and different motors (RockSim pods) get a mount of their own
      const all = [info.motor, ...(info.motorExtras || [])].filter((x) => x && x.designation),
        key = (x) => (x.mfr + " " + x.designation).trim();
      const groups = [];
      for (const x of all) {
        const g = groups.find((g) => key(g.x) === key(x));
        if (g) g.n += x === info.motor ? 1 : x.count || 1;
        else groups.push({ x, n: x === info.motor ? 1 : x.count || 1 });
      }
      const inner = m0.od - 2 * (m0.wall || 0),
        fits = (g) => {
          const m = mo(g.x),
            d = m && m.dia > 0 ? m.dia : g.x.mountDia || 0;
          return d > 0 && Math.abs(d - inner) < 0.004;
        };
      const main = groups.find(fits) || groups[0];
      if (main) {
        m0.motor = mo(main.x);
        m0.delay = rktEj(main.x.ej);
        if (main.n > 1 && m0.type === "mount") m0.cluster = main.n === 2 ? "double" : `${main.n}-ring`;
      } else {
        m0.motor = null;
        m0.delay = null;
      }
      const host = s0.parts.find((p) => p.kids.includes(m0)) || s0.parts[s0.parts.length - 1];
      for (const g of groups) {
        if (g === main) continue;
        const m = mo(g.x),
          d = m && m.dia > 0 ? m.dia : g.x.mountDia || 0.029;
        if (m && !(m.dia > 0)) m.dia = d;
        host.kids.push({
          ...bldNew("mount"),
          name: `Mount for ${g.x.designation} (from the file)`,
          od: d + 2 * 0.0008 + 0.0004,
          wall: 0.0008,
          len: m && m.len > 0 ? m.len : 0.1,
          ref: "bottom",
          pos: 0,
          overhang: 0.003,
          mat: "Kraft phenolic",
          known: 1e-9,
          knownAll: false,
          motor: m,
          delay: rktEj(g.x.ej),
          cluster: g.n === 1 ? "single" : g.n === 2 ? "double" : `${g.n}-ring`,
          extra: true,
        });
      }
    }
    if (mb) {
      mb.motor = mo(info.boosterMotor);
      mb.delay = rktEj(info.boosterMotor && info.boosterMotor.ej);
    }
    if (m1) {
      m1.motor = mo(info.firstMotor);
      m1.delay = rktEj(info.firstMotor && info.firstMotor.ej);
    }
    if (three) model.stages[1].ignDelay = info.design.midDelay || 0;
    if (info.design && info.design.deployMode === "motor")
      for (const st of model.stages)
        for (const p of st.parts)
          for (const k of p.kids)
            if ((k.type === "chute" || k.type === "streamer") && k.deploy === "apogee") k.deploy = "ejection";
    if (info.design && model.stages.length > 1) model.stages[0].ignDelay = info.design.stageDelay || 0;
  }
  if (info && info.design && info.design.orkApogee)
    model.ref = {
      apogee: info.design.orkApogee,
      motor: info.design.orkMotor || null,
      source: info.design.refSource || null,
    };
  const fins = model.stages.flatMap((s) => s.parts.map((p) => p.finish).filter(Boolean));
  if (fins.length) {
    const cnt = {};
    fins.forEach((f) => (cnt[f] = (cnt[f] || 0) + 1));
    model.settings.finish = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
  }
  // a stage whose mounts have no motor in this flight configuration (when the file sets motors per configuration) flies
  // without one: the Motor tab's choice isn't put into it
  if ([...doc.getElementsByTagName("motor")].some((m) => m.getAttribute("configid")))
    for (const st of model.stages) {
      const ms = bldMounts(st);
      if (ms.length && ms.every((k) => !k.motor)) st.noMotor = true;
    }
  return model;
}
/**
 * Checks that would make the design wrong or unflyable (no motor mount, a mount wider than its tube...).
 * @param {object} model
 * @returns {string[]}
 */
export function bldProblems(model) {
  const out = [];
  model.stages.forEach((st, si) => {
    const tag = model.stages.length > 1 ? `${st.name}: ` : "";
    if (!st.parts.length) {
      out.push(tag + "has no body parts.");
      return;
    }
    if (si === 0 && st.parts[0].type !== "nose") out.push("The rocket should start with a nose cone.");
    st.parts.forEach((p, i) => {
      if (i > 0 && p.type === "nose") out.push(tag + "a nose cone can only go at the front.");
    });
    // every stage needs a motor mount, except a payload section riding on a stage that has the motor
    if (
      !bldMounts(st).length &&
      !(model.stages.length > 1 && model.stages.some((o) => o !== st && bldMounts(o).length) && si === 0)
    )
      out.push(tag + "needs a motor mount.");
    st.parts.forEach((p) =>
      (p.kids || []).forEach((k) => {
        if (k.type === "mount" && k.od >= 2 * bldBodyR(p) + 1e-9 && p.type === "tube")
          out.push(`${tag}the motor mount is wider than ${p.name}.`);
        if (k.type === "fins" && k.shape === "freeform" && bldPts(k).pts.length < 3)
          out.push(`${tag}${k.name} needs at least three outline points.`);
      }),
    );
  });
  return out;
}
