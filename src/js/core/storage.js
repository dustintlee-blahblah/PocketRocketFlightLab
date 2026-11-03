/* ---------- storage helpers ---------- */
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  },
};
const IN = 0.0254,
  FT = 0.3048,
  LB = 0.45359237;
/* fin edge (cross-section) types. Square and rounded edges are blunt; the rest have sharp edges. Supersonic wave drag of a
   thin sharp-edged section from linear theory, Cd = K·(t/c)²/β with K from its slopes (Ackeret: K = 4/c·∫(dy/dx)²dx·c²/t²):
   double wedge (diamond) K = 4; biconvex (circular-arc) airfoil K = 16/3; a flat plate beveled over 20% of the chord at
   each edge K = 2/0.2 = 10. Below Mach 1 the sharp types are all streamlined: no leading-edge or trailing-edge base drag. */
/* the fins' transonic drag rise. Thin-airfoil theory only applies once the flow is fully supersonic; between about Mach 0.85
   and 1.5 shocks stand on the fin surfaces and the drag of a fin set rises far above it. NASA wind-tunnel data for the
   Arcas sounding rocket (TN D-4013, fins on against fins off, two body lengths; TN D-4014 above Mach 1.5) shows the four
   double-wedge fins' drag rising by about 0.29 (on the body's reference area) from Mach 0.85 to a peak just past Mach 1,
   then falling back by Mach 1.3 with a tail that fades out by about Mach 3. Per unit fin planform area that is
   finTransonicCd, scaled with thickness by transonic similarity (wave drag ∝ (t/c)^(5/3), von Kármán) from the Arcas
   fins' 4.3%. Nothing changes below Mach 0.85. This is for sharp-edged sections (airfoil, beveled, double wedge), the
   kind measured: square and rounded edges have their own blunt-edge drag model above, which already rises through Mach 1,
   and adding this to them would count the same shocks twice.
   Sweeping the leading edge back delays and weakens the rise. The Arcas fins are swept 30°; NASA TM X-653 (Ames, Mach
   0.6–5.8) measured almost no added drag from thin sharp fins swept 70°, where an unswept rise would have added about 0.15.
   So the Mach number is scaled by √(cos Λ / cos 30°) (Λ = leading-edge sweep), which leaves the Arcas calibration as it
   was, moves the rise of a 60° fin to about Mach 1.35, and keeps a 70° fin out of it until well past Mach 1.5. */
function finTransonicCd(M, tc, cosL = 1) {
  M *= Math.min(1, Math.sqrt(Math.max(cosL, 0) / 0.866));
  if (M <= 0.85 || !(tc > 0)) return 0;
  const g =
    M < 1.02 ? smooth01((M - 0.85) / 0.15) : 0.75 * Math.exp(-(M - 1.02) / 0.2) + 0.25 * Math.exp(-(M - 1.02) / 0.8);
  return 9.36 * Math.pow(Math.min(tc, 0.12), 5 / 3) * g;
}
const FIN_EDGES = [
  ["square", "Square"],
  ["rounded", "Rounded"],
  ["airfoil", "Airfoil (streamlined)"],
  ["beveled", "Beveled (tapered leading and trailing edges)"],
  ["doublewedge", "Double wedge (diamond)"],
];
const finWaveK = (e) => (e === "doublewedge" ? 4 : e === "beveled" ? 10 : 16 / 3);
// OpenRocket and RockSim know square, rounded and airfoil only: the closest of those goes into their files
const stdEdge = (e) => (finBlunt(e) ? e : "airfoil");
const finBlunt = (e) => e === "square" || e === "rounded";
