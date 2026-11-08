/**
 * Wind and the earth's rotation for the flight: the wind at each height and moment (the surface wind growing with
 * height, the winds-aloft table, and gusts), and the Coriolis acceleration at the launch site.
 */
import { WIND_ALPHA } from "../design/defaults.js";
/**
 * The wind through a flight, as a function of height and time: [along x (downwind), along y] in m/s, in the flight
 * axes of simulate (x along the ground wind's direction of travel).
 * @param {object} L launch conditions (wind, its direction, profile and reference height, gustiness, winds aloft)
 * @returns {function(number, number=): number[]} windVec(z, t)
 */
export function flightWind(L) {
  const alpha = WIND_ALPHA[L.windProfile] ?? 1 / 7,
    zref = Math.max(L.windRef || 2, 0.5);
  // gusts: four steady sine waves with fixed random phases (the same every run), scaled to the gustiness as an RMS fraction
  const turb = Math.max(0, L.turb || 0),
    GUST = (() => {
      let sd = 97531;
      const r = () => {
        sd = (sd * 16807) % 2147483647;
        return sd / 2147483647;
      };
      return [2.3, 4.7, 9.1, 17.3].map((Pd) => ({ w: (2 * Math.PI) / Pd, ph: 2 * Math.PI * r() }));
    })();
  const gust = (t) =>
    turb > 0 ? Math.max(0, 1 + turb * Math.SQRT1_2 * GUST.reduce((a, g) => a + Math.sin(g.w * t + g.ph), 0)) : 1;
  /* wind as a vector [along x, along y] in the flight axes. The surface wind grows with height by the power law; a
     winds-aloft table (height, speed, direction) takes over: below its lowest level the surface wind blends into it,
     between levels the wind is interpolated, and above the top level it holds. Gusts scale the whole vector. */
  const h0 = (((L.windDir ?? 270) + 180) * Math.PI) / 180;
  const vecOf = (spd, from) => {
    const a = ((from + 180) * Math.PI) / 180 - h0;
    return [spd * Math.cos(a), -spd * Math.sin(a)];
  };
  const ALOFT = (L.aloft || [])
    .filter((r) => r && r.alt > 0 && r.speed >= 0 && isFinite(r.dir))
    .slice()
    .sort((a, b) => a.alt - b.alt)
    .map((r) => ({ z: r.alt, v: vecOf(r.speed, r.dir) }));
  const surf = (z) =>
    alpha === 0
      ? L.wind
      : L.wind * Math.pow(Math.min(Math.max(z, 0.3), ALOFT.length ? Math.max(ALOFT[0].z, 1) : 1000) / zref, alpha);
  const windVec = (z, t = 0) => {
    let w;
    if (!ALOFT.length) w = [surf(z), 0];
    else if (z <= ALOFT[0].z) {
      const f = Math.max(z, 0) / ALOFT[0].z,
        s0 = surf(z);
      w = [s0 * (1 - f) + ALOFT[0].v[0] * f, ALOFT[0].v[1] * f];
    } else {
      let i = ALOFT.findIndex((r) => r.z >= z);
      if (i < 0) w = ALOFT[ALOFT.length - 1].v.slice();
      else {
        const a = ALOFT[i - 1],
          b = ALOFT[i],
          f = (z - a.z) / (b.z - a.z);
        w = [a.v[0] + (b.v[0] - a.v[0]) * f, a.v[1] + (b.v[1] - a.v[1]) * f];
      }
    }
    const gm = gust(t);
    return [w[0] * gm, w[1] * gm];
  };
  return windVec;
}
/**
 * The Coriolis acceleration from the earth's rotation, in the flight axes of simulate.
 * @param {object} L launch conditions (latitude, wind direction)
 * @returns {{corX: function, corY: function, corZ: function}} each component from the velocity's other two
 */
export function coriolis(L) {
  /* the earth's rotation (Coriolis acceleration −2Ω×v): Ω has components Ω·cos(lat) to the north and Ω·sin(lat) up;
     in these axes (x downwind, heading h = wind direction + 180°; y to its left; z up) */
  const OM = 7.2921159e-5,
    latR = ((L.lat ?? 40) * Math.PI) / 180,
    hdg = ((((L.windDir ?? 270) + 180) % 360) * Math.PI) / 180;
  const Ox = OM * Math.cos(latR) * Math.cos(hdg),
    Oy = OM * Math.cos(latR) * Math.sin(hdg),
    Oz = OM * Math.sin(latR);
  const corX = (vy, vz) => -2 * (Oy * vz - Oz * vy),
    corY = (vx, vz) => -2 * (Oz * vx - Ox * vz),
    corZ = (vx, vy) => -2 * (Ox * vy - Oy * vx);
  return { corX, corY, corZ };
}
