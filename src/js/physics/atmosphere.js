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
const geoH = (z) => (R_EARTH * z) / (R_EARTH + z); // geometric → geopotential height
function isaT(H) {
  let T = 288.15;
  for (let i = 0; i < ISA_LAYERS.length; i++) {
    const [b, lr] = ISA_LAYERS[i],
      top = i + 1 < ISA_LAYERS.length ? ISA_LAYERS[i + 1][0] : Infinity;
    if (H <= top) return T + lr * (H - b);
    T += lr * (top - b);
  }
  return T;
}
let ATM_KEY = null,
  ATM_BASE = null;
/* temperatures aloft from a forecast (L.tempAloft: [{z: m above the pad, T: °C}]): the temperature runs in straight lines
   from the pad's temperature through each forecast level, and above the top level follows the standard atmosphere's
   lapse rates, shifted to meet the top level. Pressure is carried up through each straight-line piece by the hydrostatic
   equation (the barometric formula for a constant lapse rate), so density and the speed of sound follow the real day. */
function atmProfile(L, hg, Tg, pg) {
  const P = (L.tempAloft || [])
    .filter((r) => r && r.z > 1 && isFinite(r.T))
    .slice()
    .sort((a, b) => a.z - b.z);
  if (!P.length) return null;
  const H = [geoH(hg)],
    T = [Tg],
    p = [pg];
  for (const r of P) {
    const H2 = geoH(hg + r.z),
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
function atmosphere(L, h) {
  // h = AGL meters
  const hg = L.elev || 0,
    Tg = L.tempC + 273.15,
    pin = L.pressure > 0 ? L.pressure : 0,
    rh = Math.min(Math.max(L.humidity || 0, 0), 1),
    TA = L.tempAloft;
  const key =
    hg +
    "|" +
    Tg +
    "|" +
    pin +
    "|" +
    rh +
    "|" +
    (TA && TA.length ? TA.length + ":" + TA[0].z + ":" + TA[0].T + ":" + TA[TA.length - 1].T : "");
  if (ATM_KEY !== key) {
    ATM_KEY = key;
    const H0 = geoH(hg),
      Tc = L.tempC,
      pg = pin || 101325 * Math.pow(1 - 2.25577e-5 * hg, 5.25588);
    // water vapor at the pad: saturation pressure (Tetens' formula) times the relative humidity
    ATM_BASE = {
      H0,
      dT: Tg - isaT(H0),
      pg,
      e0: rh * 610.78 * Math.exp((17.27 * Tc) / (Tc + 237.3)),
      prof: atmProfile(L, hg, Tg, pg),
    };
  }
  const { H0, dT, pg, e0, prof } = ATM_BASE,
    H = geoH(hg + Math.max(h, 0));
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
  const e = e0 > 0 ? Math.min(e0 * Math.exp(-Math.max(h, 0) / 2000), 0.5 * p) : 0;
  const rho = (p - e) / (ISA_R * T) + e / (461.5 * T),
    Tv = T / (1 - (e / p) * (1 - 0.622)),
    a = Math.sqrt(1.4 * ISA_R * Tv);
  const mu = (1.458e-6 * Math.pow(T, 1.5)) / (T + 110.4);
  return { rho, a, mu, T, p };
}
