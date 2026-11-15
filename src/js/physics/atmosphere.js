/**
 * Atmosphere: air density, pressure, temperature, speed of sound and viscosity at any height above the pad.
 *
 * The U.S. Standard Atmosphere 1976 layers (to 86 km), shifted to the field's own temperature (through the
 * troposphere; the shift fades out across the tropopause) and pressure, with
 * humidity, and optionally a measured or forecast temperature profile aloft (L.tempAloft). Heights are geometric
 * meters; the layers use geopotential height.
 */
/* ---------- physics ---------- */
/* ---------- atmosphere: U.S. Standard Atmosphere 1976 layers to 86 km, shifted to the field's measured temperature ----------
   Temperature follows the standard layer lapse rates (geopotential height), offset by (field temperature − standard
   temperature at the field). Pressure starts at the standard pressure for the field elevation and is integrated
   hydrostatically through the layers with that temperature profile. */
const ISA_LAYERS = [
  [0, -0.0065],
  [11000, 0],
  [20000, 0.001],
  [32000, 0.0028],
  [47000, 0],
  [51000, -0.0028],
  [71000, -0.002],
  [84852, 0],
];
/* How far up the field's temperature offset reaches. The U.S. Standard Atmosphere Supplements, 1966 (table 2.2) give
   the mean temperature against height by latitude and season. At 45° N. the July air is 6 K warmer than standard at
   the ground and 10 to 12 K warmer from 2 to 11 km, then within 1 K of standard from 13 to 17 km and 4 K warmer at 27
   km; the January air is 16 K colder at the ground, 7 K at 3 km, 3.5 K at 10 km and 1.5 K from 11 to 19 km. At 30° N.
   in July it is 13 K warmer at the ground and 15 to 17 K from 6 to 11 km. So a season's offset lasts through the
   troposphere and is gone above the tropopause, where the stratosphere's temperature has little to do with the
   ground's: the offset is held to 11 km (geopotential, above sea level) and fades in a straight line to nothing at
   15 km. Above a forecast that reaches past 11 km, it fades over the 4 km above the forecast's top. */
const TROPO_FADE = [11000, 15000];
const offsetAt = (H, f0, f1) => (H <= f0 ? 1 : H >= f1 ? 0 : (f1 - H) / (f1 - f0));
const ISA_G = 9.80665,
  ISA_R = 287.05,
  R_EARTH = 6356766;
/**
 * Geopotential height of a geometric height.
 * @param {number} z geometric height above sea level, m
 * @returns {number} geopotential height, m
 */
const geoH = (z) => (R_EARTH * z) / (R_EARTH + z); // geometric → geopotential height
/**
 * Standard-atmosphere temperature at a geopotential height (U.S. Standard Atmosphere 1976 lapse rates).
 * @param {number} H geopotential height, m
 * @returns {number} temperature, K
 */
function isaT(H) {
  let T = 288.15;
  for (let i = 0; i < ISA_LAYERS.length; i++) {
    const [base, lapse] = ISA_LAYERS[i],
      top = i + 1 < ISA_LAYERS.length ? ISA_LAYERS[i + 1][0] : Infinity;
    if (H <= top) return T + lapse * (H - base);
    T += lapse * (top - base);
  }
  return T;
}
/**
 * Cache for atmosphere(): the launch conditions it was last set up for (ATM_KEY) and the values worked out at
 * the pad for them (ATM_BASE), so the per-height calculation stays cheap.
 */
let ATM_KEY = null,
  ATM_BASE = null;
/* temperatures aloft from a forecast (L.tempAloft: [{z: m above the pad, T: °C}]): the temperature runs in straight lines
   from the pad's temperature through each forecast level, and above the top level follows the standard atmosphere's
   lapse rates, shifted to meet the top level. Pressure is carried up through each straight-line piece by the hydrostatic
   equation (the barometric formula for a constant lapse rate), so density and the speed of sound follow the real day. */
/**
 * Temperature and pressure at each forecast level, from a temperature profile aloft.
 *
 * @param {object} L launch conditions; L.tempAloft is [{z: m above the pad, T: °C}]
 * @param {number} fieldElev field elevation above sea level, m
 * @param {number} fieldT temperature at the pad, K
 * @param {number} fieldP pressure at the pad, Pa
 * @returns {{H:number[], T:number[], p:number[], dTtop:number}|null} geopotential heights, temperatures (K) and
 *   pressures (Pa) at the pad and each level, and the offset from the standard atmosphere at the top level; null
 *   without a profile
 */
function atmProfile(L, fieldElev, fieldT, fieldP) {
  const P = (L.tempAloft || [])
    .filter((r) => r && r.z > 1 && isFinite(r.T))
    .slice()
    .sort((a, b) => a.z - b.z);
  if (!P.length) return null;
  const H = [geoH(fieldElev)],
    T = [fieldT],
    p = [fieldP];
  for (const r of P) {
    const H2 = geoH(fieldElev + r.z),
      T2 = r.T + 273.15,
      H1 = H[H.length - 1],
      T1 = T[T.length - 1];
    if (H2 <= H1 + 1) continue;
    const lr = (T2 - T1) / (H2 - H1),
      p2 =
        Math.abs(lr) > 1e-6
          ? p[p.length - 1] * Math.pow(T2 / T1, -ISA_G / (ISA_R * lr))
          : p[p.length - 1] * Math.exp((-ISA_G * (H2 - H1)) / (ISA_R * T1));
    H.push(H2);
    T.push(T2);
    p.push(p2);
  }
  return H.length > 1 ? { H, T, p, dTtop: T[T.length - 1] - isaT(H[H.length - 1]) } : null;
}
/**
 * The air at a height above the pad.
 *
 * Temperature: the measured or forecast profile where there is one, otherwise the standard layers shifted by the
 * field's temperature offset. Pressure: the field's measured pressure (or the standard pressure for its elevation),
 * carried up hydrostatically. Density counts water vapor as a separate gas (Tetens' saturation pressure times the
 * relative humidity, thinning with a 2 km scale height); the speed of sound uses the virtual temperature.
 * Viscosity: Sutherland's law.
 *
 * @param {object} L launch conditions: elev (m), tempC (°C), pressure (Pa, 0 for standard), humidity (0–1), tempAloft
 * @param {number} h height above the pad, m
 * @returns {{rho:number, a:number, mu:number, T:number, p:number}} density (kg/m³), speed of sound (m/s), dynamic
 *   viscosity (Pa·s), temperature (K), pressure (Pa)
 */
export function atmosphere(L, h) {
  // h = AGL meters
  const fieldElev = L.elev || 0,
    fieldT = L.tempC + 273.15,
    pMeasured = L.pressure > 0 ? L.pressure : 0,
    humidity = Math.min(Math.max(L.humidity || 0, 0), 1),
    tempAloft = L.tempAloft;
  const key =
    fieldElev +
    "|" +
    fieldT +
    "|" +
    pMeasured +
    "|" +
    humidity +
    "|" +
    (tempAloft && tempAloft.length
      ? tempAloft.length + ":" + tempAloft[0].z + ":" + tempAloft[0].T + ":" + tempAloft[tempAloft.length - 1].T
      : "");
  if (ATM_KEY !== key) {
    ATM_KEY = key;
    const H0 = geoH(fieldElev),
      Tc = L.tempC,
      pg = pMeasured || 101325 * Math.pow(1 - 2.25577e-5 * fieldElev, 5.25588);
    // water vapor at the pad: saturation pressure (Tetens' formula) times the relative humidity
    ATM_BASE = {
      H0,
      dT: fieldT - isaT(H0),
      pg,
      e0: humidity * 610.78 * Math.exp((17.27 * Tc) / (Tc + 237.3)),
      prof: atmProfile(L, fieldElev, fieldT, pg),
    };
  }
  const { H0, dT, pg, e0, prof } = ATM_BASE,
    H = geoH(fieldElev + Math.max(h, 0));
  let p, T;
  if (prof && H <= prof.H[prof.H.length - 1]) {
    // inside the forecast's levels
    const PH = prof.H;
    let k = 1;
    while (k < PH.length - 1 && PH[k] < H) k++;
    const H1 = PH[k - 1],
      H2 = PH[k],
      T1 = prof.T[k - 1],
      lr = (prof.T[k] - T1) / (H2 - H1);
    T = T1 + lr * (H - H1);
    p =
      Math.abs(lr) > 1e-6
        ? prof.p[k - 1] * Math.pow(T / T1, -ISA_G / (ISA_R * lr))
        : prof.p[k - 1] * Math.exp((-ISA_G * (H - H1)) / (ISA_R * T1));
  } else {
    /* standard layers from the field (or from the forecast's top level) up, shifted by the offset there. The shift
       holds through the troposphere and fades out across the tropopause (offsetAt): each stretch between the
       standard layers' bases and the fade's ends has a constant lapse rate, so the barometric formula carries the
       pressure up it. */
    const dTu = prof ? prof.dTtop : dT,
      Hs = prof ? prof.H[prof.H.length - 1] : H0,
      f0 = Math.max(TROPO_FADE[0], Hs),
      f1 = f0 + (TROPO_FADE[1] - TROPO_FADE[0]),
      Tat = (x) => isaT(x) + dTu * offsetAt(x, f0, f1);
    let Hc = Hs;
    p = prof ? prof.p[prof.p.length - 1] : pg;
    const breaks = ISA_LAYERS.map((l) => l[0])
      .concat([f0, f1])
      .filter((x) => x > Hc && x < H)
      .sort((a, b) => a - b);
    breaks.push(H);
    for (const H2 of breaks) {
      if (H2 <= Hc) continue;
      if (H2 <= f0) {
        // below the fade: the standard layer's own lapse rate
        let lr = 0;
        for (const l of ISA_LAYERS) if (l[0] <= Hc) lr = l[1];
        const T1 = isaT(Hc) + dTu,
          T2 = isaT(H2) + dTu;
        p *= lr !== 0 ? Math.pow(T2 / T1, -ISA_G / (ISA_R * lr)) : Math.exp((-ISA_G * (H2 - Hc)) / (ISA_R * T1));
      } else {
        const T1 = Tat(Hc),
          T2 = Tat(H2),
          lr = (T2 - T1) / (H2 - Hc);
        p *=
          Math.abs(lr) > 1e-7
            ? Math.pow(T2 / T1, -ISA_G / (ISA_R * lr))
            : Math.exp((-ISA_G * (H2 - Hc)) / (ISA_R * T1));
      }
      Hc = H2;
    }
    T = H <= f0 ? isaT(H) + dTu : Tat(H);
  }
  T = Math.max(T, 150);
  // humid air is lighter: dry air and water vapor as separate gases; vapor thins out with a ~2 km scale height
  const vaporP = e0 > 0 ? Math.min(e0 * Math.exp(-Math.max(h, 0) / 2000), 0.5 * p) : 0;
  const rho = (p - vaporP) / (ISA_R * T) + vaporP / (461.5 * T),
    virtualT = T / (1 - (vaporP / p) * (1 - 0.622)),
    a = Math.sqrt(1.4 * ISA_R * virtualT);
  const mu = (1.458e-6 * Math.pow(T, 1.5)) / (T + 110.4);
  return { rho, a, mu, T, p };
}

/**
 * What a barometric altimeter would report at a height above the pad. It turns the pressure it reads into height with
 * the standard atmosphere, whatever the day's temperature, and zeroes itself on the pad, so in air warmer than
 * standard it reads low (about 1% for every 3 °C) and in colder air high.
 * @param {object} L launch conditions (as for atmosphere)
 * @param {number} h true height above the pad, m
 * @returns {number} indicated height above the pad, m
 */
export function baroReading(L, h) {
  const hStd = (p) => 44330.8 * (1 - Math.pow(p / 101325, 0.190263));
  return hStd(atmosphere(L, h).p) - hStd(atmosphere(L, 0).p);
}
