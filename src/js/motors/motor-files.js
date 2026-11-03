/**
 * Reading motor files (RASP .eng and RockSim .rse) and the basic numbers of a thrust curve.
 */
/* ---------- motor file parsing ---------- */
/**
 * Reads a RASP .eng file, which can hold several motors. Comments (;) are skipped; sizes come in mm.
 * @param {string} text file contents
 * @returns {object[]} motor objects (curves with fewer than two points are dropped)
 */
function parseEng(text) {
  const out = [];
  let cur = null;
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.replace(/;.*$/, "").trim();
    if (!line) continue;
    const p = line.split(/\s+/);
    if (!cur || (isNaN(parseFloat(p[0])) && p.length >= 7)) {
      if (isNaN(parseFloat(p[0]))) {
        if (cur && cur.t.length > 1) out.push(cur);
        cur = {
          name: p[0],
          dia: parseFloat(p[1]) / 1000,
          len: parseFloat(p[2]) / 1000,
          delays: p[3],
          propMass: parseFloat(p[4]),
          totalMass: parseFloat(p[5]),
          mfr: p.slice(6).join(" "),
          t: [],
          F: [],
        };
        continue;
      }
    }
    if (cur && p.length >= 2 && !isNaN(parseFloat(p[0]))) {
      cur.t.push(parseFloat(p[0]));
      cur.F.push(parseFloat(p[1]));
    }
  }
  if (cur && cur.t.length > 1) out.push(cur);
  return out.map(fixCurve);
}
/**
 * Reads a RockSim .rse (XML) motor file, which can hold several motors.
 * @param {string} text file contents
 * @returns {object[]} motor objects
 */
function parseRse(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  return [...doc.getElementsByTagName("engine")]
    .map((e) => {
      const a = (n) => e.getAttribute(n);
      const pts = [...e.getElementsByTagName("eng-data")];
      return fixCurve({
        name: a("code"),
        mfr: a("mfg") || "",
        dia: parseFloat(a("dia")) / 1000,
        len: parseFloat(a("len")) / 1000,
        delays: a("delays") || "",
        propMass: parseFloat(a("propWt")) / 1000,
        totalMass: parseFloat(a("initWt")) / 1000,
        t: pts.map((p) => parseFloat(p.getAttribute("t"))),
        F: pts.map((p) => parseFloat(p.getAttribute("f"))),
      });
    })
    .filter((m) => m.t.length > 1);
}
/**
 * Makes a thrust curve start and end at zero thrust, and gives the motor its uploaded-motor id.
 * @param {object} m motor (changed in place)
 * @returns {object} the same motor
 */
function fixCurve(m) {
  if (m.t[0] !== 0) {
    m.t.unshift(0);
    m.F.unshift(0);
  }
  if (m.F[m.F.length - 1] !== 0) {
    m.t.push(m.t[m.t.length - 1] + 0.01);
    m.F.push(0);
  }
  m.id = "u-" + m.mfr + "-" + m.name + "-" + Math.round(m.totalMass * 1e4);
  return m;
}
/**
 * Total impulse, peak thrust, burn time, average thrust and impulse class of a motor.
 * @param {object} m motor
 * @returns {{I:number, Fmax:number, tb:number, avg:number, cls:string}} N·s, N, s, N and the class letter
 */
function motorStats(m) {
  let I = 0,
    Fmax = 0;
  for (let i = 1; i < m.t.length; i++) {
    I += ((m.t[i] - m.t[i - 1]) * (m.F[i] + m.F[i - 1])) / 2;
  }
  m.F.forEach((f) => (Fmax = Math.max(Fmax, f)));
  const tb = m.t[m.t.length - 1];
  const cls = I <= 0 ? "?" : String.fromCharCode(65 + Math.max(0, Math.ceil(Math.log2(I / 2.5))));
  return { I, Fmax, tb, avg: I / tb, cls };
}
