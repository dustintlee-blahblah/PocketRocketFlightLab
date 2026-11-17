import { L } from "../design/defaults.js";
import { elTxt } from "./ork-xml.js";
import { ORK_CFG, ORK_SIM } from "./save.js";
/*
 * Which flight of an OpenRocket design is read: the motor configuration, the simulation it is taken from, the stages
 * switched off in it, and that simulation's launch site and weather.
 */
/**
 * The flight to read from a design: its motor configuration and the simulation that goes with it. A motor
 * configuration chosen on the Motor tab (ORK_CFG) or a simulation chosen when opening (ORK_SIM) wins; then the one the
 * file's simulation flew; then the file's default.
 * @param {Document} doc the design
 * @param {Element} rocket its rocket element
 * @param {{offIds:string[]}} opts offIds: the ids of stages switched off (the builder passes them, since its own file
 *   numbers only its stages)
 * @returns {{simEls:Element[], refSim:Element|null, cfg:string|null, offStages:Set<Element>}} the file's simulations,
 *   the one read, the motor configuration's id, and the stages switched off in it
 */
export function orkConfig(doc, rocket, opts) {
  const simEls = [...doc.getElementsByTagName("simulation")];
  /**
   * The motor configuration id a simulation element flew.
   *
   * A motor configuration chosen on the Motor tab (ORK_CFG) wins; then the one the file's simulation used; then the default.
   */
  const simCfgOf = (sm) => {
    const c = sm && sm.getElementsByTagName("conditions")[0],
      e = c && c.getElementsByTagName("configid")[0];
    return e ? e.textContent.trim() : null;
  };
  const pick =
    ORK_CFG &&
    [...rocket.getElementsByTagName("motorconfiguration")].some((e) => e.getAttribute("configid") === ORK_CFG)
      ? ORK_CFG
      : null;
  const chosen = ORK_SIM != null ? simEls[ORK_SIM] || null : null;
  const refSim = chosen
    ? chosen
    : pick
      ? simEls.find(
          (s) => simCfgOf(s) === pick && s.getElementsByTagName("flightdata")[0]?.getAttribute("maxaltitude"),
        ) ||
        simEls.find((s) => simCfgOf(s) === pick) ||
        null
      : simEls.find((s) => s.getElementsByTagName("flightdata")[0]?.getAttribute("maxaltitude")) || simEls[0] || null;
  let cfg = chosen ? simCfgOf(chosen) || pick : pick;
  if (!cfg) cfg = simCfgOf(refSim);
  if (!cfg) {
    const mcs = [...rocket.getElementsByTagName("motorconfiguration")];
    const dc = mcs.find((e) => e.getAttribute("default") === "true") || mcs[0];
    cfg = dc ? dc.getAttribute("configid") : null;
  }
  /* stages switched off in this flight configuration (OpenRocket numbers its stages, side booster sets included, in the
     order they appear): they aren't on the rocket at all for this flight */
  const offStages = new Set();
  {
    const mc = [...rocket.getElementsByTagName("motorconfiguration")].find((e) => e.getAttribute("configid") === cfg);
    const allStages = [...rocket.getElementsByTagName("*")].filter(
      (e) => e.tagName === "stage" || e.tagName === "parallelstage",
    );
    if (mc)
      for (const st of mc.getElementsByTagName("stage"))
        if (st.getAttribute("active") === "false") {
          const el = allStages[+st.getAttribute("number")];
          if (el) offStages.add(el);
        }
    // the builder passes the ones the file had switched off by their ids (its own file numbers only its stages)
    for (const el of allStages) if ((opts.offIds || []).includes(elTxt(el, "id"))) offStages.add(el);
  }
  return { simEls, refSim, cfg, offStages };
}
/**
 * The simulation whose apogee is shown for comparison: the one read, if it holds a result that is current and
 * OpenRocket's own (not one this app saved).
 * @param {Element|null} refSim the simulation read
 * @returns {Element|null}
 */
export function orkRefSim(refSim) {
  return refSim &&
    refSim.getElementsByTagName("flightdata")[0]?.getAttribute("maxaltitude") &&
    refSim.getAttribute("status") !== "outdated" &&
    !/^\s*Pocket Rocket/.test(refSim.getElementsByTagName("name")[0]?.textContent || "")
    ? refSim
    : null;
}
/**
 * The launch site and weather of the simulation read, over the app's current conditions. A run chosen when opening
 * also brings its air pressure, humidity and winds aloft; opening the design alone keeps your weather.
 * @param {Element|null} anySim the simulation read
 * @returns {object} launch conditions
 */
export function orkLaunch(anySim) {
  const newL = { ...L };
  if (anySim) {
    const cnd = anySim.getElementsByTagName("conditions")[0];
    if (cnd) {
      const g = (t) => {
        const e = cnd.getElementsByTagName(t)[0];
        return e ? parseFloat(e.textContent) : null;
      };
      const rl = g("launchrodlength");
      if (rl) newL.rail = rl;
      let ang = g("launchrodangle");
      if (ang != null) {
        newL.angle = Math.abs(ang);
      }
      const wv = g("windaverage");
      if (wv != null) newL.wind = wv;
      const la = g("launchaltitude");
      if (la != null) newL.elev = la;
      const lat = g("launchlatitude");
      if (lat != null && Math.abs(lat) <= 90) newL.lat = lat;
      const lon = g("launchlongitude");
      if (lon != null && Math.abs(lon) <= 180) newL.lon = lon;
      const lt = g("launchtemperature");
      if (lt != null) newL.tempC = lt > 150 ? lt - 273.15 : lt;
      {
        const at = cnd.getElementsByTagName("atmosphere")[0];
        if (at && (at.getAttribute("model") || "").toLowerCase() === "extendedisa") {
          const bt = parseFloat(at.getElementsByTagName("basetemperature")[0]?.textContent);
          if (isFinite(bt)) newL.tempC = bt > 150 ? bt - 273.15 : bt;
          // a chosen run's own air pressure (Pa) and relative humidity (0 to 1) at the launch site
          const bp = parseFloat(at.getElementsByTagName("basepressure")[0]?.textContent),
            rh = parseFloat(at.getElementsByTagName("baserelativehumidity")[0]?.textContent);
          if (ORK_SIM != null && isFinite(bp) && bp > 1000) newL.pressure = bp;
          if (ORK_SIM != null && isFinite(rh) && rh >= 0 && rh <= 1) newL.humidity = rh;
        } else if (at && ORK_SIM != null) {
          // a chosen run in OpenRocket's standard air: standard pressure and temperature at the site, dry
          newL.pressure = 0;
          newL.humidity = 0;
          newL.tempC = +(15 - 0.0065 * Math.max(g("launchaltitude") || 0, 0)).toFixed(2);
        }
      }
      const wd = g("winddirection");
      if (wd != null) newL.windDir = ((((wd * 180) / Math.PI) % 360) + 360) % 360;
      const wt = g("windturbulence");
      if (wt != null) newL.turb = Math.max(0, Math.min(wt, 1));
      // OpenRocket's multi-level wind (its winds aloft), when the run uses it: heights above sea level or the pad, a speed,
      // the direction it blows from (radians) and a standard deviation at each. The lowest level sets the ground wind
      // and its gustiness, the rest fill the Winds aloft table. A run with OpenRocket's average wind has none.
      {
        const kind = (cnd.getElementsByTagName("windmodeltype")[0]?.textContent || "").trim().toLowerCase(),
          ml = [...cnd.getElementsByTagName("wind")].find((w) => w.getAttribute("model") === "multilevel");
        // (only for a run chosen when opening: opening the design alone keeps your weather)
        if (ORK_SIM != null && kind === "multilevel" && ml) {
          const base = ml.getAttribute("altituderef") === "msl" ? g("launchaltitude") || 0 : 0;
          const lv = [...ml.getElementsByTagName("windlevel")]
            .map((e) => ({
              alt: parseFloat(e.getAttribute("altitude")) - base,
              speed: parseFloat(e.getAttribute("speed")),
              dir: +(((((parseFloat(e.getAttribute("direction")) * 180) / Math.PI) % 360) + 360) % 360).toFixed(2),
              sd: parseFloat(e.getAttribute("standarddeviation")),
            }))
            .filter((e) => isFinite(e.alt) && isFinite(e.speed) && e.speed >= 0 && isFinite(e.dir))
            .sort((a, b) => a.alt - b.alt);
          if (lv.length) {
            newL.wind = lv[0].speed;
            newL.windDir = lv[0].dir;
            if (isFinite(lv[0].sd) && lv[0].speed > 0) newL.turb = Math.max(0, Math.min(lv[0].sd / lv[0].speed, 1));
            newL.aloft = lv.filter((e) => e.alt > 1).map((e) => ({ alt: e.alt, speed: e.speed, dir: e.dir }));
            newL.aloftSrc = newL.aloft.length ? "OpenRocket multi-level wind" : "";
          }
        } else if (ORK_SIM != null) {
          newL.aloft = [];
          newL.aloftSrc = "";
        }
      }
      const into = (cnd.getElementsByTagName("launchintowind")[0]?.textContent || "true").trim() !== "false",
        rdir = g("launchroddirection");
      newL.railMode = into ? "into" : "fixed";
      if (!into && rdir != null) newL.railDir = ((rdir % 360) + 360) % 360;
    }
  }
  return newL;
}
