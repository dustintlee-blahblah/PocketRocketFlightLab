/**
 * Fin flutter: each fin's estimated flutter speed from its shape, thickness and material (Martin's criterion, NACA
 * TN 4197), which the flight compares with the airspeed.
 */
/* fin flutter: Martin's bending-torsion flutter criterion (NACA TN 4197, 1958, eq. 18), applied to one fin panel:
   Vf = a·√( G / ( 2.674·AR³·p·(λ + 1) / (2·(AR + 2)·(t/c)³) ) ), with G and p in the same units, AR = span²/area,
   λ = tip/root chord and t/c taken at the root (the thinnest ratio of a constant-thickness fin, so the lowest speed).
   G is the fin material's in-plane shear modulus. Wood, paper and woven composites are not isotropic, so G is not
   E/(2(1+ν)) for them: wood's is about 4–8% of its grain-direction E (USDA Wood Handbook, Table 4-1). The values below
   are handbook figures, on the low side. */
/**
 * Shear modulus of a fin set's material, for the flutter estimate.
 * @param {object} f fin set (mat: material name, rho: density)
 * @returns {{G:number, est:boolean}} G in Pa; est is true when it was judged from the density (unknown material)
 */
function finShearG(f) {
  const n = (f.mat || "").toLowerCase(),
    r = f.rho || 0;
  const T = [
    [/alumin/, 26e9],
    [/titan/, 44e9],
    [/steel/, 79e9],
    [/carbon|graphite/, 5e9],
    [/g-?10|fr-?4|fiberglass|fibreglass|glass/, 3e9],
    [/phenolic/, 2e9],
    [/polycarb|lexan/, 0.8e9],
    [/abs|pla\b|petg|nylon|plastic|acrylic|styrene/, 0.9e9],
    [/balsa/, 0.1e9],
    [/ply|birch|bass|spruce|pine|wood|lite/, 0.6e9],
    [/card|paper|kraft/, 0.4e9],
  ];
  for (const [re, G] of T) if (re.test(n)) return { G, est: false };
  return { G: r > 2400 ? 26e9 : r > 1500 ? 3e9 : r > 900 ? 0.9e9 : r > 300 ? 0.6e9 : 0.1e9, est: true }; // unknown material: judged from its density
}
/**
 * Fin flutter speed by Martin's formula (NACA TN 4197).
 * @param {object} f fin set with its geometry (a root, b tip, s span, t thickness, area)
 * @param {object} atm the air at the height of interest, from atmosphere()
 * @returns {object|null} vf (flutter speed, m/s), the terms used, the shear modulus and whether it was estimated;
 *   null when the fin's size is incomplete
 */
export function flutterSpeed(f, atm) {
  const cr = f.a,
    ct = Math.max(f.b || 0, 0),
    s = f.s,
    t = f.t,
    A = f.area;
  if (!(cr > 0 && s > 0 && t > 0 && A > 0)) return null;
  const AR = (s * s) / A,
    lam = ct / cr,
    tc = t / cr,
    sh = finShearG(f);
  // NACA TN 4197 (Martin, 1958) eq. 18: (Vf/a)² = G / [ 39.3·A³/((t/c)³(A+2)) · (λ+1)/2 · p/p0 ], with 39.3 psi = (24ε/π)·γ·p0 (ε = 0.25, γ = 1.4).
  // In consistent units that is 2.674·p·A³(λ+1) / (2(t/c)³(A+2)). (The often-quoted 1.337·…/(2…) form halves this and gives a flutter speed √2 too high.)
  const K = ((24 * 0.25) / Math.PI) * 1.4; // = 2.674
  return {
    vf: atm.a * Math.sqrt(sh.G / ((K * AR ** 3 * atm.p * (lam + 1)) / (2 * (AR + 2) * tc ** 3))),
    G: sh.G,
    est: sh.est,
    mat: f.mat || "",
  };
}
