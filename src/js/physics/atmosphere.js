/**
 * Atmosphere: air density, pressure, temperature, speed of sound and viscosity at any height above the pad.
 *
 * The U.S. Standard Atmosphere 1976 layers (to 86 km), shifted to the field's own temperature and pressure, with
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
    // standard layers from the field (or from the forecast's top level) up
    const dTu = prof ? prof.dTtop : dT;
    let Hc = prof ? prof.H[prof.H.length - 1] : H0;
    p = prof ? prof.p[prof.p.length - 1] : pg;
    for (let i = 0; i < ISA_LAYERS.length && Hc < H; i++) {
      const [b, lr] = ISA_LAYERS[i],
        top = i + 1 < ISA_LAYERS.length ? ISA_LAYERS[i + 1][0] : Infinity;
      if (top <= Hc) continue;
      const H2 = Math.min(H, top),
        T1 = isaT(Hc) + dTu,
        T2 = isaT(H2) + dTu;
      p *= lr !== 0 ? Math.pow(T2 / T1, -ISA_G / (ISA_R * lr)) : Math.exp((-ISA_G * (H2 - Hc)) / (ISA_R * T1));
      Hc = H2;
    }
    T = isaT(H) + dTu;
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
