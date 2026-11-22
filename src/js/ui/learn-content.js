/**
 * The Learn page's chapters, in three levels: Getting started (how rockets fly and how this app works them out), Mid &
 * high power (certification, waivers, dual deploy, flutter, Mach 1, staging, altimeters) and Technical (the drag and
 * stability models, the equations of motion and the atmosphere, validation). Each chapter is plain HTML with a simple drawing (inline SVG in the page's own colors, so it
 * works offline and in both themes) and a "Try it in the app" note. The numbers given are the guidelines the app
 * itself uses (the RSO Checklist's), so the two agree; the technical detail behind the drag chapter is in
 * AERODYNAMICS.md and VALIDATION.md, which it links to.
 */
import { APO_ACCURACY } from "../../data/apogee-accuracy.js";

/**
 * The opening of each drawing: a 300-wide picture that scales to the page, its lines in the text color.
 * @param {number} h height in the picture's units
 * @param {string} label what it shows, for screen readers
 * @returns {string}
 */
const svgOpen = (h, label) =>
  `<svg viewBox="0 0 300 ${h}" width="100%" role="img" aria-label="${label}" font-size="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">`;
/**
 * An arrow from (x1, y1) to (x2, y2), with a label at (lx, ly).
 */
const arrowSvg = (x1, y1, x2, y2, label, lx, ly, accent) => {
  const a = Math.atan2(y2 - y1, x2 - x1),
    h = 7,
    p1 = [x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45)],
    p2 = [x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45)],
    c = accent ? ' stroke="var(--accent)"' : "",
    tc = accent ? "var(--accent)" : "currentColor";
  return `<path${c} d="M${x1} ${y1} L${x2} ${y2} M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${x2} ${y2} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}"/><text x="${lx}" y="${ly}" fill="${tc}" stroke="none" text-anchor="middle">${label}</text>`;
};
/**
 * A drawing with its caption.
 */
const fig = (svg, caption) => `<figure>${svg}</svg><figcaption>${caption}</figcaption></figure>`;
/**
 * The "Try it in the app" box.
 */
const tryIt = (html) => `<div class="try"><b>Try it in the app:</b> ${html}</div>`;

/**
 * What the drag model does in each speed band (Technical level, "How the drag is worked out"): shown under the
 * speed-band drawing when a band is tapped. From AERODYNAMICS.md; keep the two in step.
 */
export const LEARN_BANDS = {
  sub: {
    title: "Subsonic: below Mach 0.8",
    html:
      `<p>The air has time to move aside ahead of the rocket, so no shock waves form. Compressibility only scales things a little. Drag is mostly <b>skin friction</b>, often the biggest single part, and <b>base drag</b>, often a quarter to a third of the total on a coasting model rocket.</p>` +
      `<ul><li><b>Friction:</b> the Prandtl–Schlichting turbulent flat-plate law, White's rough law for rough surfaces, Hoerner's form factors for thick bodies and fins.</li>` +
      `<li><b>Nose:</b> almost no pressure drag if it blends smoothly into the body (Hoerner's shoulder-angle rule).</li>` +
      `<li><b>Base:</b> the base pressure measured in flight in NASA TR R-100. A boattail shrinks the base, and a burning motor's exhaust fills the nozzle's share of it.</li>` +
      `<li><b>Fins:</b> a square leading edge costs 0.4 of the stagnation pressure on its face (Hoerner); a rounded one costs nothing. Their lift is Barrowman's (Diederich's formula with the Prandtl–Glauert correction).</li></ul>` +
      `<p><b>Where it shows:</b> most model rockets and many Level 1 and 2 flights never leave this band. Finish, fillets and the base matter most here. Across the check cases the drag is within about 10%; calibrating to your own altimeter readings closes most of the rest.</p>`,
    links: [["validation", "Validation"]],
  },
  trans: {
    title: "Transonic: Mach 0.8 to 1.2 (fins to 1.5)",
    html:
      `<p>Parts of the airflow reach the speed of sound before the rocket does: over the nose shoulder and the fins first. <b>Shock waves form</b>, drag rises steeply and peaks just past Mach 1, and the center of pressure moves. No theory covers this band, so every simulator works from measurements here.</p>` +
      `<ul><li><b>Nose:</b> NASA TR R-100's measured curves for cones, ogives, parabolic, Haack and elliptical noses, read for your nose's shape and slenderness.</li>` +
      `<li><b>Fins:</b> a measured correlation of 22 wings through Mach 1 (NACA Report 1253). A fin's drag starts to rise near Mach 0.96 − 1.5 × its thickness ratio: about Mach 0.87 for a 6%-thick fin. A short, stubby fin's drag rises later and peaks lower.</li>` +
      `<li><b>Base:</b> the measured base pressure peaks just past Mach 1. Fins near the base add suction from Mach 0.95 (NACA TN 3819).</li>` +
      `<li><b>Fin lift</b> is blended from Barrowman's subsonic value at Mach 0.9 to supersonic theory at 1.5.</li></ul>` +
      `<p><b>Where it shows:</b> this is the weakest band of every rocket simulator. Across the check cases the drag is about 13% off here, against about 6% above Mach 1.2. The ± beside the apogee on Results widens for flights that top out here, and the RSO Checklist flags transonic flights.</p>`,
    links: [
      ["mach", "Flying through Mach 1"],
      ["validation", "Validation"],
    ],
  },
  super: {
    title: "Supersonic: Mach 1.2 to 4",
    html:
      `<p>The shocks settle into place ahead of the nose and on the fins' leading edges. Drag comes mostly from <b>wave drag</b>, the energy the shocks take, and for thin fins and slender noses <b>linear supersonic theory</b> works well.</p>` +
      `<ul><li><b>Fins:</b> wave drag from linear theory for the fin's own outline and section (the supersonic area rule). For a wide unswept fin that is thin-airfoil theory, K × (t/c)² ÷ √(M² − 1): K = 4 for a double wedge, 16/3 for an airfoil, 10 for a beveled fin with 20% bevels. A swept fin has less while its edges are behind the Mach line, and a peak as the Mach line passes each edge. A rounded leading edge acts like a cylinder across the flow (modified Newtonian theory). Fin lift is Ackeret's theory with tip loss.</li>` +
      `<li><b>Nose:</b> NASA TR R-100's measured curves to Mach 2. Past that, a nose that comes to a point uses the second-order shock-expansion method (NACA Report 1328), as Missile DATCOM does; a blunt nose keeps the measured curves to their last point, about Mach 3.6.</li>` +
      `<li><b>Boattails:</b> TR R-100's equation for conical afterbodies to Mach 2, linear theory past 2.5.</li>` +
      `<li><b>Base:</b> NACA TN 3819 above Mach 2, with the extra suction from fins near the base and blunt fin trailing edges.</li>` +
      `<li><b>Friction</b> falls as the air near the skin heats (the Van Driest II method), and the skin's own temperature is followed through the flight.</li></ul>` +
      `<p><b>Where it shows:</b> sharp, thin fin edges and slender noses pay off here. Well past Mach 1 the fins lose lift faster than the nose, so the CP creeps forward and the margin shrinks. Across the check cases the drag is within about 6% from Mach 1.2 to 3 and about 4% from 3 to 5.</p>`,
    links: [
      ["mach", "Flying through Mach 1"],
      ["validation", "Validation"],
    ],
  },
  hyper: {
    title: "Hypersonic edge: Mach 4 to 6",
    html:
      `<p>Past most of the measured data for rocket shapes. The shocks lie close to the surface, and the pressure on a surface depends mostly on the angle it meets the flow at.</p>` +
      `<ul><li><b>Blunt noses</b> (and any nose the shock-expansion method can't handle) are blended from Mach 4 to 6 into <b>modified Newtonian theory</b>, which works out the pressure from that angle alone. Pointed noses stay with shock-expansion.</li>` +
      `<li><b>Friction</b> keeps falling as the boundary layer heats: by Mach 5 it is under half its low-speed value.</li>` +
      `<li>The fins' wave drag and lift carry on from the supersonic band.</li></ul>` +
      `<p><b>Where it shows:</b> only the fastest amateur flights reach this band, briefly. The model's fastest checks are the Aerobee 150A wind-tunnel data to Mach 5 and the Arcas sounding rocket to Mach 4.6; nothing measured checks it past Mach 5. The Wind Tunnel on the Rocket tab goes to Mach 6.</p>`,
    links: [["validation", "Validation"]],
  },
};

/**
 * The chapters, in reading order: id (for links into a chapter), group, title, a one-line summary and the HTML.
 * Built when asked for (nothing is drawn at start-up).
 * @returns {{id:string, group:string, title:string, sub:string, html:string}[]}
 */
export function learnChapters() {
  const FORCES = fig(
    svgOpen(195, "A rocket climbing with four forces on it") +
      `<path d="M150 22 Q141 36 141 52 L141 140 L159 140 L159 52 Q159 36 150 22Z"/><path d="M141 116 L126 140 L126 146 L141 140Z M159 116 L174 140 L174 146 L159 140Z"/>` +
      arrowSvg(150, 188, 150, 152, "Thrust", 184, 178, true) +
      arrowSvg(198, 78, 198, 122, "Weight", 230, 104) +
      arrowSvg(108, 30, 108, 70, "Drag", 84, 52) +
      arrowSvg(124, 132, 90, 132, "Lift (fins)", 66, 124),
    "Thrust pushes it up, weight pulls it down, drag pushes back against its motion, and the fins' lift steers it.",
  );
  const PHASES = fig(
    svgOpen(140, "The flight path from the pad to landing, with its phases") +
      `<path d="M30 126 L30 112 C40 60 70 22 130 18 C140 18 146 19 152 21" />` +
      `<path stroke-dasharray="4 4" d="M152 21 C190 50 230 92 262 126"/><path d="M14 126 L290 126" stroke-opacity=".35"/>` +
      `<circle cx="30" cy="112" r="3" fill="currentColor"/><circle cx="58" cy="54" r="3" fill="var(--accent)" stroke="var(--accent)"/><circle cx="130" cy="18" r="3.5" fill="var(--accent)" stroke="var(--accent)"/><circle cx="152" cy="21" r="3" fill="currentColor"/>` +
      `<g fill="currentColor" stroke="none"><text x="38" y="122">1 Rail</text><text x="66" y="62">2 Burnout</text><text x="80" y="44">3 Coast</text><text x="124" y="10" text-anchor="end" fill="var(--accent)">4 Apogee</text><text x="160" y="16">5 Ejection</text><text x="230" y="104" text-anchor="end">6 Descent</text></g>`,
    "Fastest at burnout, slowest at apogee: the chute comes out just after, and the wind carries it down.",
  );
  const STABILITY = fig(
    svgOpen(120, "A rocket with its CG ahead of its CP") +
      `<line x1="20" y1="60" x2="280" y2="60" stroke-opacity=".25"/>` +
      `<path d="M40 60 Q70 46 90 46 L240 46 L262 34 L262 86 L240 74 L90 74 Q70 74 40 60Z"/>` +
      `<circle cx="150" cy="60" r="7"/><path d="M150 53 A7 7 0 0 1 157 60 L150 60Z M150 67 A7 7 0 0 1 143 60 L150 60Z" fill="currentColor"/>` +
      `<circle cx="205" cy="60" r="6" fill="var(--accent)" stroke="var(--accent)"/>` +
      `<path d="M150 22 L205 22 M150 17 L150 27 M205 17 L205 27"/>` +
      `<g stroke="none"><text x="150" y="100" text-anchor="middle" fill="currentColor">CG</text><text x="205" y="100" text-anchor="middle" fill="var(--accent)">CP</text><text x="177" y="13" text-anchor="middle" fill="currentColor">1.5 calibers</text></g>`,
    "The nose is on the left. With the CG ahead of the CP, a tilt is pushed back into line.",
  );
  const MOTORS = fig(
    svgOpen(130, "Two thrust curves with the same total impulse") +
      `<path d="M30 110 L280 110 M30 110 L30 12" stroke-opacity=".5"/>` +
      `<path stroke="var(--accent)" d="M30 110 L34 22 L44 30 L60 62 L80 98 L90 110"/>` +
      `<path d="M30 110 L34 70 L40 66 L180 72 L196 110"/>` +
      `<g stroke="none" fill="currentColor"><text x="155" y="125" text-anchor="middle">time</text><text x="18" y="62" transform="rotate(-90 18 62)" text-anchor="middle">thrust</text><text x="96" y="40" fill="var(--accent)">a hard, short kick</text><text x="120" y="60">a long, even push</text></g>`,
    "Two motors of the same letter: the same total push (the area under each curve), given quickly or slowly.",
  );
  const DRAG = fig(
    svgOpen(140, "Drag coefficient rising steeply near the speed of sound") +
      `<path d="M40 118 L285 118 M40 118 L40 14" stroke-opacity=".5"/><path d="M128 14 L128 118" stroke-dasharray="3 4" stroke-opacity=".5"/>` +
      `<path stroke="var(--accent)" stroke-width="2.2" d="M40 92 L100 90 C112 88 118 50 132 36 C144 28 160 40 190 52 C220 62 250 68 284 72"/>` +
      `<g stroke="none" fill="currentColor"><text x="40" y="132" text-anchor="middle">0</text><text x="128" y="132" text-anchor="middle">Mach 1</text><text x="240" y="132" text-anchor="middle">Mach 2</text><text x="26" y="66" transform="rotate(-90 26 66)" text-anchor="middle">Cd</text></g>`,
    "A typical rocket's Cd: steady at low speed, rising steeply toward Mach 1, then easing off.",
  );
  const WEATHER = fig(
    svgOpen(140, "Wind getting stronger with height, and a rocket turning into it") +
      `<path d="M20 128 L170 128" stroke-opacity=".5"/>` +
      [
        [118, 24],
        [96, 18],
        [72, 13],
        [48, 9],
      ]
        .map(([y, w]) => arrowSvg(150 - w * 4.6, y, 150, y, "", 0, 0))
        .join("") +
      `<g stroke="none" fill="currentColor"><text x="110" y="10" text-anchor="middle">stronger wind up high</text></g>` +
      `<path d="M230 128 L230 100" stroke-opacity=".5"/><g transform="rotate(-14 230 100)"><path d="M230 70 L236 82 L236 100 L224 100 L224 82Z"/></g>` +
      arrowSvg(270, 92, 248, 92, "wind", 270, 86) +
      `<g stroke="none" fill="currentColor"><text x="230" y="58" text-anchor="middle">turns into the wind</text></g>`,
    "Wind usually grows with height, and a rocket leaving the rail turns to face it.",
  );
  const RECOVERY = fig(
    svgOpen(150, "Single and dual deploy compared") +
      `<path d="M10 140 L290 140" stroke-opacity=".5"/>` +
      `<path d="M30 14 C50 50 90 100 120 138" stroke-dasharray="4 4"/><path d="M24 14 a8 6 0 0 1 16 0z" fill="currentColor"/>` +
      `<path d="M240 14 C243 60 246 96 254 112 C262 124 268 132 272 138" stroke="var(--accent)" stroke-dasharray="4 4"/><path d="M236 14 a4 3 0 0 1 8 0z" fill="var(--accent)" stroke="var(--accent)"/><path d="M242 104 a10 7 0 0 1 20 0z" fill="var(--accent)" stroke="var(--accent)"/>` +
      `<g stroke="none" fill="currentColor"><text x="60" y="30">Main at apogee:</text><text x="60" y="43">slow all the way, long drift</text><text x="230" y="70" text-anchor="end" fill="var(--accent)">Drogue, then the main</text><text x="230" y="83" text-anchor="end" fill="var(--accent)">low down: less drift</text></g>`,
    "Dual deploy falls fast under a small drogue, then opens the main close to the ground.",
  );
  const LOOP = fig(
    svgOpen(130, "The simulator's step loop") +
      [
        [60, 30, "Thrust and fuel"],
        [240, 30, "The air here"],
        [240, 100, "Drag and lift"],
        [60, 100, "New speed, place"],
      ]
        .map(
          ([x, y, t]) =>
            `<rect x="${x - 52}" y="${y - 14}" width="104" height="28" rx="7"/><text x="${x}" y="${y + 4}" text-anchor="middle" fill="currentColor" stroke="none">${t}</text>`,
        )
        .join("") +
      arrowSvg(112, 30, 186, 30, "", 0, 0) +
      arrowSvg(240, 44, 240, 84, "", 0, 0) +
      arrowSvg(188, 100, 114, 100, "", 0, 0) +
      arrowSvg(60, 86, 60, 46, "", 0, 0, true) +
      `<text x="150" y="70" text-anchor="middle" fill="var(--accent)" stroke="none">every 0.002 to 0.2 s</text>`,
    "Each step adds up the forces and moves the rocket a moment forward, thousands of times a flight.",
  );
  // the speed bands, each tappable: the panel under the drawing (learnBand, in learn.js) says what drives the drag
  // there and how the app works it out
  const BANDS =
    fig(
      svgOpen(96, "Speed bands of the drag model: tap a band to read about it").replace('role="img"', 'role="group"') +
        [
          ["sub", 4, 66, "Subsonic", "below 0.8"],
          ["trans", 75, 70, "Transonic", "0.8 to 1.2"],
          ["super", 150, 72, "Supersonic", "1.2 to 4"],
          ["hyper", 227, 70, "Hypersonic", "4 to 6"],
        ]
          .map(
            ([k, x, w, t, m]) =>
              `<g class="lband" data-band="${k}" role="button" tabindex="0" aria-pressed="false" aria-label="${t}, Mach ${m}: what drives the drag and how the app works it out"><rect x="${x}" y="20" width="${w}" height="34" rx="6"/><text class="lbt" x="${x + w / 2}" y="41" text-anchor="middle" stroke="none">${t}</text><text x="${x + w / 2}" y="72" text-anchor="middle" stroke="none" fill="currentColor">${m}</text></g>`,
          )
          .join("") +
        `<text x="150" y="90" text-anchor="middle" stroke="none" fill="currentColor">Mach number</text>`,
      "Tap a band for what drives the drag there and how the app works it out. Each band uses its own methods, blended where they meet.",
    ) + `<div class="bandinfo" id="bandinfo" aria-live="polite" hidden></div>`;
  // ---- Mid & high power, and Technical: drawings ----
  const CERT = fig(
    svgOpen(128, "Motor impulse classes and the certification levels that allow them") +
      ["H", "I", "J", "K", "L", "M", "N", "O"]
        .map(
          (c, i) =>
            `<rect x="${14 + i * 34}" y="${84 - i * 9}" width="28" height="${18 + i * 9}" rx="3"${i < 2 ? "" : i < 5 ? ' stroke="var(--accent)"' : ' fill="currentColor" fill-opacity=".18"'}/><text x="${28 + i * 34}" y="118" text-anchor="middle" stroke="none" fill="currentColor">${c}</text>`,
        )
        .join("") +
      `<g stroke="none" fill="currentColor"><text x="48" y="64" text-anchor="middle">Level 1</text><text x="150" y="40" text-anchor="middle" fill="var(--accent)">Level 2</text><text x="252" y="14" text-anchor="middle">Level 3</text></g>`,
    "Each letter is up to twice the total impulse of the one before: H starts at 160 N·s, O ends at 40,960 N·s.",
  );
  const WAIVER = fig(
    svgOpen(120, "A predicted apogee with its 1-sigma and 90% ranges under a waiver ceiling") +
      `<path d="M20 20 L280 20" stroke="var(--accent)" stroke-dasharray="6 4"/><text x="276" y="14" text-anchor="end" stroke="none" fill="var(--accent)">waiver ceiling</text>` +
      `<rect x="80" y="34" width="60" height="78" rx="4" fill="currentColor" fill-opacity=".08" stroke-opacity=".5"/>` +
      `<rect x="80" y="54" width="60" height="40" rx="4" fill="currentColor" fill-opacity=".18"/>` +
      `<path d="M70 70 L150 70" stroke-width="2.4"/>` +
      `<g stroke="none" fill="currentColor"><text x="156" y="74">predicted apogee</text><text x="156" y="58">1σ: the ± shown</text><text x="156" y="40">top of the 90% range</text><text x="156" y="108">bottom of the 90% range</text></g>`,
    "The ± beside the apogee is the typical (1σ) spread; the waiver check uses the top of the wider 90% range.",
  );
  const DUAL = fig(
    svgOpen(150, "A dual deploy flight: drogue at apogee, main low, with backups") +
      `<path d="M10 140 L290 140" stroke-opacity=".5"/>` +
      `<path d="M30 138 C44 70 80 22 126 16 C150 14 166 30 182 62 L214 118 C222 128 230 134 240 138" />` +
      `<circle cx="126" cy="16" r="4" fill="var(--accent)" stroke="var(--accent)"/><circle cx="214" cy="118" r="4" fill="var(--accent)" stroke="var(--accent)"/>` +
      `<g stroke="none" fill="currentColor"><text x="132" y="12">apogee: drogue (backup +1–2 s)</text><text x="200" y="54">falls fast,</text><text x="200" y="66">50–100 ft/s</text><text x="224" y="100" fill="var(--accent)">main at</text><text x="224" y="112" fill="var(--accent)">500–1,000 ft</text><text x="244" y="132">15–20 ft/s</text><text x="46" y="118">Mach lockout</text><text x="46" y="130">while fast</text></g>`,
    "The drogue comes out at apogee, the main near the ground; each event has a backup, and the motor's charge is the last.",
  );
  const FLUTTER = fig(
    svgOpen(128, "Airspeed against the fins' flutter speed through a flight") +
      `<path d="M30 112 L285 112 M30 112 L30 10" stroke-opacity=".5"/>` +
      `<path stroke="var(--accent)" stroke-width="2.2" d="M30 112 L52 26 C70 30 110 60 170 92 C210 104 250 110 285 112"/>` +
      `<path d="M30 40 C100 36 180 30 285 24" stroke-dasharray="5 4"/>` +
      `<g stroke="none" fill="currentColor"><text x="160" y="124" text-anchor="middle">time</text><text x="285" y="42" text-anchor="end">flutter speed:</text><text x="285" y="54" text-anchor="end">rises as the air thins</text><text x="62" y="18" fill="var(--accent)">airspeed peaks at burnout</text></g>`,
    "Flutter is likeliest at burnout, low down where the air is thick; the app compares the two all the way up.",
  );
  const SHOCK = fig(
    svgOpen(126, "Shock waves on a rocket flying faster than sound") +
      `<path d="M60 63 Q90 50 112 50 L240 50 L262 38 L262 88 L240 76 L112 76 Q90 76 60 63Z"/>` +
      `<path d="M60 63 L130 8 M60 63 L130 118" stroke="var(--accent)"/><path d="M236 50 L282 16 M236 76 L282 110" stroke="var(--accent)" stroke-opacity=".7"/>` +
      `<g stroke="none" fill="currentColor"><text x="134" y="16" fill="var(--accent)">bow shock</text><text x="20" y="66">M > 1</text><text x="140" y="96">drag rises,</text><text x="140" y="108">the CP moves,</text><text x="140" y="120">pressure jumps</text></g>`,
    "Past Mach 1 the air can't move aside ahead of the rocket, so shocks form at the nose and fins.",
  );
  const STAGE = fig(
    svgOpen(140, "A two-stage flight: booster burnout, separation, coast and sustainer ignition") +
      `<path d="M10 132 L290 132" stroke-opacity=".5"/>` +
      `<path d="M40 130 C52 96 66 74 84 60" stroke-width="2.4"/><path d="M84 60 C100 48 116 42 132 38" stroke-dasharray="4 4"/><path d="M132 38 C170 26 214 18 268 14" stroke="var(--accent)" stroke-width="2.4"/>` +
      `<path d="M84 60 C92 80 96 108 100 130" stroke-dasharray="2 4" stroke-opacity=".6"/>` +
      `<g stroke="none" fill="currentColor"><text x="44" y="104" text-anchor="end">booster</text><text x="78" y="44" text-anchor="end">separation</text><text x="104" y="124">booster recovers</text><text x="140" y="58" fill="var(--accent)">sustainer lit: only if</text><text x="140" y="70" fill="var(--accent)">high and straight enough</text></g>`,
    "The booster drops away, the sustainer coasts a moment, and its altimeter lights it only if the lockouts allow.",
  );
  const LOGFIG = fig(
    svgOpen(126, "An altimeter's curve against the prediction, with an early charge") +
      `<path d="M30 112 L285 112 M30 112 L30 10" stroke-opacity=".5"/>` +
      `<path stroke="var(--accent)" stroke-dasharray="5 4" d="M30 112 C60 50 110 22 170 18 C200 18 230 40 280 100"/>` +
      `<path stroke-width="2" d="M30 112 C60 52 108 30 140 26 L152 24 C170 26 210 52 270 106"/>` +
      `<path d="M140 20 L146 26 L140 32 L134 26Z" fill="var(--panel)"/>` +
      `<g stroke="none" fill="currentColor"><text x="140" y="66" text-anchor="middle">charge before apogee</text><text x="214" y="12" fill="var(--accent)">predicted</text><text x="140" y="100" text-anchor="middle">altimeter (solid)</text></g>`,
    "Solid: what the altimeter logged. Dashed: the design flown the same way. Here the charge fired while still climbing.",
  );
  const CPFIG = fig(
    svgOpen(132, "Where the lift on each part acts, and the CP they add up to") +
      `<path d="M30 60 Q60 44 84 44 L240 44 L262 30 L262 90 L240 76 L84 76 Q60 76 30 60Z"/>` +
      arrowSvg(56, 104, 56, 66, "nose", 56, 116) +
      arrowSvg(160, 100, 160, 80, "body", 160, 112) +
      arrowSvg(246, 112, 246, 82, "fins", 246, 124, true) +
      `<circle cx="196" cy="60" r="6" fill="var(--accent)" stroke="var(--accent)"/><text x="196" y="22" text-anchor="middle" stroke="none" fill="var(--accent)">CP: the lifts' balance point</text>`,
    "Each part's lift acts at its own point; the CP is where their sum acts, weighted by how much each part lifts.",
  );
  const ATMFIG = fig(
    svgOpen(148, "Temperature against height in the standard atmosphere") +
      `<path d="M40 128 L285 128 M40 128 L40 10" stroke-opacity=".5"/>` +
      `<path stroke="var(--accent)" stroke-width="2.2" d="M180 128 L90 70 L90 52 L110 28 L150 12"/>` +
      `<path d="M210 128 L120 70" stroke-dasharray="4 4"/>` +
      `<g stroke="none" fill="currentColor"><text x="160" y="144" text-anchor="middle">temperature</text><text x="26" y="70" transform="rotate(-90 26 70)" text-anchor="middle">height</text><text x="96" y="64">11 km: tropopause</text><text x="196" y="112">a hot day, shifted</text></g>`,
    "Standard layers, shifted to the field's temperature through the lowest 11 km and fading back to standard by 15 km.",
  );
  const B = APO_ACCURACY.bands,
    pctTxt = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`;
  const VALFIG = fig(
    svgOpen(150, "The app's apogee accuracy by speed band: 1-sigma and 90% ranges") +
      `<path d="M42 75 L285 75" stroke-opacity=".35"/>` +
      B.map((b, i) => {
        const x = 90 + i * 80,
          Y = (f) => 75 - f * 280,
          lo90 = b.mean - b.k90 * b.sd,
          hi90 = b.mean + b.k90 * b.sd,
          lo1 = b.mean - b.k68 * b.sd,
          hi1 = b.mean + b.k68 * b.sd;
        return (
          `<rect x="${x - 14}" y="${Y(hi90).toFixed(1)}" width="28" height="${(Y(lo90) - Y(hi90)).toFixed(1)}" rx="3" fill="currentColor" fill-opacity=".08" stroke-opacity=".5"/>` +
          `<rect x="${x - 14}" y="${Y(hi1).toFixed(1)}" width="28" height="${(Y(lo1) - Y(hi1)).toFixed(1)}" rx="3" fill="currentColor" fill-opacity=".2"/>` +
          `<path d="M${x - 18} ${Y(b.mean).toFixed(1)} L${x + 18} ${Y(b.mean).toFixed(1)}" stroke="var(--accent)" stroke-width="2.2"/>` +
          `<text x="${x}" y="146" text-anchor="middle" stroke="none" fill="currentColor">${b.lo === 0 ? "below 0.8" : b.hi > 9 ? "above " + b.lo : b.lo + "–" + b.hi}</text>`
        );
      }).join("") +
      `<g stroke="none" fill="currentColor"><text x="36" y="79" text-anchor="end">0</text><text x="36" y="23" text-anchor="end">+20%</text><text x="36" y="135" text-anchor="end">−20%</text></g>`,
    "Where real apogees landed against the prediction, by top Mach: the mean (line), 1σ (dark) and 90% (light) ranges.",
  );
  return [
    {
      id: "forces",
      group: "Getting started",
      title: "The four forces",
      sub: "Thrust, weight, drag and lift",
      html:
        `<p>Every moment of a flight, four forces push and pull on the rocket. How high it goes is the result of the contest between them.</p>` +
        FORCES +
        `<ul><li><b>Thrust</b> pushes the rocket up. The motor makes it by throwing hot gas out the back very fast. It lasts only while the motor burns, usually one to a few seconds.</li>` +
        `<li><b>Weight</b> pulls the rocket down. It is the pull of gravity on everything aboard: the airframe, the parachute, and the motor's fuel, which gets lighter as it burns.</li>` +
        `<li><b>Drag</b> is the air pushing back. It always works against the direction the rocket moves, and it grows quickly with speed: twice as fast means about four times the drag.</li>` +
        `<li><b>Lift</b> comes mostly from the fins. When the rocket tips away from the direction it is moving, the fins push it back into line, the way a weathervane points into the wind.</li></ul>` +
        `<p>While the motor burns, thrust wins and the rocket speeds up. After burnout, weight and drag both slow it down until it stops climbing. That highest point is <b>apogee</b>.</p>` +
        `<p>A rule of thumb: the motor's average thrust should be at least five times the rocket's weight. Less than that and the rocket leaves the rail slowly, where the wind can push it off course.</p>` +
        tryIt(
          "on the Results tab, look at the Acceleration chart. The big jump at the start is thrust beating weight. The steady negative values after burnout are weight and drag working together.",
        ),
    },
    {
      id: "flight",
      group: "Getting started",
      title: "A flight, pad to landing",
      sub: "Six phases, and where they show in Results",
      html:
        `<p>A rocket flight has six phases. Each one asks something different of the rocket, and each shows up somewhere in the results.</p>` +
        PHASES +
        `<ol><li><b>On the rail.</b> The launch rail or rod holds the rocket straight until it is moving fast enough for its fins to steer. The usual guideline, and the one the RSO Checklist uses, is at least 50 ft/s (15 m/s) as it leaves the rail.</li>` +
        `<li><b>Boost.</b> The motor burns and the rocket speeds up fast. It reaches its top speed at the moment the motor burns out.</li>` +
        `<li><b>Coast.</b> The motor is out, but the rocket keeps climbing on its speed, slowing all the time. Coasting usually takes several times longer than the boost.</li>` +
        `<li><b>Apogee.</b> The rocket stops climbing, for an instant moving neither up nor down. This is the best time to deploy the recovery system, because the rocket is moving slowest.</li>` +
        `<li><b>Ejection.</b> A small charge, set off by the motor's delay or by an altimeter, pushes the parachute or streamer out.</li>` +
        `<li><b>Descent.</b> The rocket comes down under its chute, and the wind carries it sideways as it falls. Larger rockets often use a small drogue chute at apogee and a big main chute closer to the ground, so they drift less.</li></ol>` +
        tryIt(
          "on the Results tab, switch the chart between Altitude, Velocity and Acceleration. Find burnout (where velocity peaks), apogee (where altitude peaks) and ejection on each. Flight Animation plays the same flight back.",
        ),
    },
    {
      id: "stability",
      group: "Getting started",
      title: "Stability",
      sub: "CG, CP and calibers",
      html:
        `<p>A rocket flies straight when its balance point is ahead of the point where the air pushes on it. Those two points are the CG and the CP.</p>` +
        STABILITY +
        `<ul><li><b>CG, the center of gravity</b>, is the balance point. Balance the rocket on your finger, motor in, and the CG is where it doesn't tip either way.</li>` +
        `<li><b>CP, the center of pressure</b>, is the point where the air's push on the whole rocket acts. Fins at the back pull the CP rearward, like the feathers on an arrow.</li></ul>` +
        `<p>If the CG is ahead of the CP, any tilt makes the air push the tail back into line, and the rocket corrects itself. If the CG is behind the CP, a small tilt grows, and the rocket loops or tumbles. That is dangerous, and it should never fly that way.</p>` +
        `<p>The distance between the two is measured in <b>calibers</b>: multiples of the body's diameter. One caliber is the usual minimum. One to two is typical. Over about four, the rocket is so eager to turn into any wind that it can arc over noticeably right off the pad.</p>` +
        `<p>Stability changes during the flight. The CG moves forward as the motor burns its fuel, and the CP moves as the rocket goes faster. So the app checks it all the way up, not only on the pad.</p>` +
        `<p>If a rocket is short of stability, the fixes are to add weight in the nose (moves the CG forward) or to use bigger fins (moves the CP back).</p>` +
        tryIt(
          "on the Rocket tab, the drawing marks the CG and CP. Make the fins smaller in the builder and watch the CP move forward and the stability drop. The RSO Checklist says how much nose weight would bring it back to one caliber.",
        ),
    },
    {
      id: "motors",
      group: "Getting started",
      title: "Motors",
      sub: "Letters, impulse, thrust curves, delays",
      html:
        `<p>A motor's letter tells you how much total push it gives, and each letter is twice the one before. An F motor has up to twice the total push of an E, and up to four times a D.</p>` +
        MOTORS +
        `<ul><li><b>Total impulse</b> is the motor's whole push added up over its burn, in newton-seconds (N·s). It is what the letter measures, and it sets how high a given rocket can go.</li>` +
        `<li><b>Average thrust</b> is the number after the letter: an F50 averages about 50 newtons. More thrust for the same impulse means a shorter, harder push: faster off the rail, but more drag at the higher speed.</li>` +
        `<li><b>The thrust curve</b> is the motor's push second by second. Some motors kick hard at the start and taper off; others push evenly. The app flies the real measured curve, not just the average.</li>` +
        `<li><b>The delay</b> is the number at the end (the 6 in F50-6). It is the seconds from burnout until the ejection charge fires. Ideally that is close to the time from burnout to apogee. Too short, and the chute comes out while the rocket is still climbing fast. Too long, and it comes out on the way down, fast.</li></ul>` +
        `<p>Motors also add weight. A loaded motor can be a large share of a small rocket's weight, and it burns off as the flight goes, so the rocket gets lighter as it climbs.</p>` +
        `<p>Letters through G are model rockets. H and above are high power and need certification: Level 1 for H and I, Level 2 for J to L, Level 3 for M and up. A few F and G motors need Level 1 too: any with more than 80 N of average thrust.</p>` +
        tryIt(
          "on the Motor tab, open Compare motors to fly the same rocket on several motors side by side. After a run, Motor Delay shows the best delay for that flight next to the delays the motor comes with.",
        ),
    },
    {
      id: "drag",
      group: "Getting started",
      title: "Drag",
      sub: "What Cd means and what changes it",
      html:
        `<p>Drag is usually what decides how high a rocket goes, and its size is summed up in one number: the drag coefficient, <b>Cd</b>. A lower Cd means a more slippery rocket.</p>` +
        `<p>Cd says how much drag a shape makes compared with its size. A typical model rocket's Cd is somewhere around 0.4 to 0.7. The total drag also depends on how big the rocket is from the front and how fast it goes.</p>` +
        `<p>Drag comes from several places, and the app adds each one up:</p>` +
        `<ul><li><b>Skin friction:</b> air rubbing along the surface. A smoother finish means less of it. That is why Surface finish can change the predicted altitude more than you might expect.</li>` +
        `<li><b>The nose:</b> a long, pointed nose pushes the air aside gently. A blunt one shoves it.</li>` +
        `<li><b>Fins:</b> their size, thickness and the shape of their edges. Rounded or sharpened edges make less drag than square ones.</li>` +
        `<li><b>The base:</b> the flat back end leaves a low-pressure wake that pulls backward. A boattail, a taper at the back, makes it smaller.</li>` +
        `<li><b>Bumps:</b> rail buttons, launch lugs and anything else sticking out.</li></ul>` +
        DRAG +
        `<p>Near the speed of sound, about 760 mph or 1,116 ft/s (340 m/s) in mild sea-level air, drag climbs steeply as shock waves form. Cd can double between about 80% of the speed of sound and just past it. Speed as a fraction of the speed of sound is called the <b>Mach number</b>.</p>` +
        tryIt(
          "the Wind Tunnel on the Rocket tab shows Cd at every speed, and the Drag table splits it into its parts. Change Surface finish or the fin edges, then launch again and compare.",
        ),
    },
    {
      id: "weather",
      group: "Getting started",
      title: "Weather and the launch site",
      sub: "Altitude, temperature, wind",
      html:
        `<p>The same rocket on the same motor flies higher at a high, hot field than at a cool one by the sea, because thinner air makes less drag.</p>` +
        `<ul><li><b>Elevation:</b> air gets about 3% thinner for every 1,000 ft (300 m) you go up. A field at 4,500 ft (1,400 m) has roughly 13% less air in the way than one at sea level.</li>` +
        `<li><b>Temperature:</b> warm air is thinner than cold air, by about 1% for every 5 °F (3 °C). A summer afternoon flies higher than a winter morning.</li>` +
        `<li><b>Humidity:</b> humid air is slightly lighter than dry air, but the effect is small.</li>` +
        `<li><b>Wind:</b> a rocket turns into the wind as it leaves the rail, because the wind pushes harder on its fins than on its nose. So it climbs at an angle, which costs some altitude. Under the parachute, the wind carries it sideways, so wind also decides how far you walk.</li></ul>` +
        WEATHER +
        `<p>Wind usually gets stronger with height. A light breeze at the pad can be a stiff wind a few thousand feet up, where the rocket spends most of its descent.</p>` +
        tryIt(
          "on the Range tab, set your launch site and the day's conditions under Ambient conditions, or fill in Winds aloft. Then run the same rocket at your home field and at a high-desert site to see the difference.",
        ),
    },
    {
      id: "recovery",
      group: "Getting started",
      title: "Recovery",
      sub: "Descent rate, chute size, drift",
      html:
        `<p>The goal of recovery is a landing slow enough not to break anything, without drifting so far you can't find the rocket.</p>` +
        `<ul><li><b>Descent rate</b> is how fast it comes down under the chute. For a main parachute, 15 to 20 ft/s (4.5 to 6 m/s) is the usual target, about the speed of jumping off a wall 3½ to 6 ft high.</li>` +
        `<li><b>Parachute size:</b> a bigger chute falls slower. Doubling the diameter roughly halves the descent rate.</li>` +
        `<li><b>Drift:</b> the slower it falls, the longer the wind has to carry it. A chute that lands gently from high up can drift a long way.</li>` +
        `<li><b>Dual deploy</b> solves this. A small drogue chute opens at apogee and lets the rocket fall fast, typically 50 to 100 ft/s (15 to 30 m/s), then the big main opens a few hundred feet up. It lands gently but drifts far less.</li></ul>` +
        RECOVERY +
        `<p>Streamers are an option for small, light rockets. They fall faster than a chute but drift less.</p>` +
        tryIt(
          "the Results tab reports descent rate and drift, and the RSO Checklist flags a landing that is too fast. Landing dispersion shows where the rocket could come down as the wind varies. Try a smaller chute, or set up dual deploy, and compare.",
        ),
    },
    {
      id: "simulator",
      group: "Getting started",
      title: "How the simulator works",
      sub: "And how far to trust it",
      html:
        `<p>The simulator flies your rocket in tiny steps of time, working out the forces at each step, the same way you would by hand if you had a few million years.</p>` +
        LOOP +
        `<p>At each step it:</p><ol><li>Reads the motor's thrust at that instant from its measured thrust curve, and how much fuel is left.</li>` +
        `<li>Works out the air at that height: how thick it is, how warm, how fast the wind blows.</li>` +
        `<li>Works out the drag and the push on the fins, from the rocket's shape, its speed and the angle it is flying at.</li>` +
        `<li>Adds up all the forces, and from them the rocket's speed, position and which way it points a moment later.</li></ol>` +
        `<p>The steps are very short: 2 thousandths of a second on the rail and while the motor burns, 1 hundredth while coasting, and longer under the parachute, where little changes. A typical flight takes many thousands of steps, in well under a second.</p>` +
        `<p><b>How close is it?</b> Flown against 23 real flights with measured altitudes, the app's predictions came within about 6% on average. Your rocket can differ for reasons the app can't see:</p>` +
        `<ul><li>The real weight and balance point, if they were estimated rather than measured.</li><li>The real finish, and small things like glue fillets, seams and decals.</li><li>Motors of the same type, which vary a little from one to the next.</li><li>Gusts, and the wind higher up, which no one measures at the pad.</li></ul>` +
        `<p>The best fix is your own data. Weigh the rocket and find its CG with the motor in, and enter those in the builder. After a flight, tap Compare with a real flight in the Flight Log on the Results tab, enter your altimeter's reading or import its file, save the flight and let the app calibrate to your rocket.</p>` +
        tryIt(
          "Imperfections on the Rocket tab adds the small real-world flaws, and Landing dispersion on the Results tab shows how much the result spreads when the wind varies.",
        ),
    },
    {
      id: "cert",
      group: "Mid & high power",
      title: "Certification flights",
      sub: "Level 1 to Level 3: the motor, the rocket, what the RSO looks at",
      html:
        `<p>Motors from H up are high power, and buying and flying them takes a certification from the NAR or Tripoli. Each level is earned with one successful flight on a motor of that level, and opens the next band of letters.</p>` +
        CERT +
        `<ul><li><b>Level 1: H and I</b> (160 to 640 N·s). For adults: both organizations require you to be 18. Build a rocket, fly it on an H or I, and recover it undamaged, with a certified member watching. Tripoli asks for a single motor (no clusters or staging) and a parachute, and doesn't count a landing faster than 35 ft/s. Juniors can start earlier: the NAR's Junior HPR program takes members 14 to 17 to H and I motors with an adult Level 1 sponsor who handles the motor; Tripoli's mentoring program starts at 12.</li>` +
        `<li><b>Level 2: J, K and L</b> (to 5,120 N·s). A written exam comes first: rules, motor codes, range safety and stability. The NAR's is 40 questions from a published pool of 100, passed at 35. Then a certification flight on a J, K or L with an active recovery system (in practice, a parachute deployed by the motor or an altimeter).</li>` +
        `<li><b>Level 3: M, N and O</b> (to 40,960 N·s). A project, planned and approved before you build. Tripoli asks for drawings, a parts list, the recovery wiring and your flight simulations, approved by two members of its Technical Advisory Panel, and for two fully separate electronics systems (batteries, switches, altimeters and charges) for every recovery event. The NAR's Level 3 Certification Committee reviews the project and witnesses the flight in the same spirit.</li></ul>` +
        `<p>On the day, the Range Safety Officer looks at the same things the app's RSO Checklist does: the CG and CP marked on the rocket and a stability margin of at least one caliber, a motor that is retained and right for the rocket, enough speed off the rail, sound recovery, and a predicted apogee under the field's ceiling. A Level 1 rocket is usually a 38 to 54 mm (1.5 to 2.1 in) airframe on a 29 or 38 mm motor mount.</p>` +
        `<p class="note">Rules checked in November 2026 on the <a href="https://nar.org/?p=32269" target="_blank" rel="noopener">NAR</a> and <a href="https://www.tripoli.org/Certification" target="_blank" rel="noopener">Tripoli</a> certification pages. They change: check the current procedures before you fly.</p>` +
        tryIt(
          "set your certification level in Settings and the flight type to Certification on the Range tab: the RSO Checklist adds a Certification attempt row for your level. The PDF report on Results brings the simulation to the RSO.",
        ),
    },
    {
      id: "waiver",
      group: "Mid & high power",
      title: "Waivers and predicting apogee",
      sub: "The ± beside the apogee, and how much margin to leave",
      html:
        `<p>A high-power flight goes into airspace the FAA controls, so every launch has a ceiling. Going over it is the one mistake a simulation is most often asked to prevent.</p>` +
        `<ul><li><b>The FAA's classes</b> (14 CFR Part 101): a model rocket (Class 1) carries no more than 125 g of propellant and weighs no more than 1,500 g. A high-power rocket (Class 2) is anything bigger, up to 40,960 N·s for all its motors together; more than that is Class 3.</li>` +
        `<li><b>Class 2 needs permission for the airspace:</b> usually a waiver the club holds, with a ceiling and a radius, and air traffic control told 24 hours to 3 days ahead. The waiver gives the ceiling above sea level or above the ground: check which, since the field's elevation is the difference.</li>` +
        `<li><b>The weather limits</b> come with it: no flying into a cloud, nor where more than five-tenths of the sky is covered at any height the rocket reaches, nor with less than five miles' visibility. People not involved must be at least 1,500 ft away or a quarter of the expected apogee, whichever is more.</li></ul>` +
        WAIVER +
        `<p><b>The ± beside the apogee</b> is how far off a prediction like this one typically is, measured: the app's predictions for real flights with recorded apogees, split by top speed. For each band, the typical miss (one standard deviation, 1σ, about two flights in three) and a wider range that holds about nine flights in ten. The ranges are uneven where the app has tended to predict high or low, and they widen when the rocket's weight is estimated from its parts rather than weighed.</p>` +
        `<p><b>The waiver check</b> in the RSO Checklist uses the top of the 90% range, not the predicted apogee itself: about one flight in twenty could go higher still. What pushes a flight higher than predicted: a lighter rocket than entered, a hot motor or a hot day, a smoother finish than set. What brings it lower: weight added at the field, wind (the rocket turns into it), a rough finish, rail buttons and seams.</p>` +
        `<p>To narrow the range: weigh the rocket ready to fly and enter it, and after a flight, log the altimeter's reading and calibrate the drag to it.</p>` +
        `<p class="note">FAA rules checked in November 2026 in <a href="https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-101" target="_blank" rel="noopener">14 CFR Part 101</a>.</p>` +
        tryIt(
          "enter the waiver on the Range tab (and whether it is above the ground or sea level). Tap the ± on Results to see both ranges; the RSO Checklist's Apogee vs. waiver row shows the margin.",
        ),
    },
    {
      id: "dualdeploy",
      group: "Mid & high power",
      title: "Dual deploy and electronics",
      sub: "Drogue at apogee, main low, backups and Mach lockout",
      html:
        `<p>A rocket that opens its main chute at 3,000 ft drifts a long way. Dual deploy splits the recovery in two: a small drogue (or none, just the rocket's parts falling apart) at apogee, and the main close to the ground.</p>` +
        DUAL +
        `<ul><li><b>Under the drogue</b> the rocket comes down fast, typically 50 to 100 ft/s (15 to 30 m/s), so the wind has little time to carry it. Faster than that, the main's opening gets harsh.</li>` +
        `<li><b>The main</b> opens at a set height, usually 500 to 1,000 ft, and brings it down at 15 to 20 ft/s (4.5 to 6 m/s).</li>` +
        `<li><b>The altimeter</b> reads the air pressure, finds apogee where it stops falling, and fires the charges. A second altimeter on its own battery and switch backs up the first, set to fire a second or two later and a little lower, so the two charges don't fire at once. Tripoli requires two fully separate systems at Level 3. The motor's ejection charge, set to fire after apogee, can be the last backup.</li>` +
        `<li><b>Mach lockout.</b> Near the speed of sound the air pressure around the rocket jumps, and a barometric altimeter can read it as apogee and fire early, at full speed. Altimeters let you ignore the pressure for a set time after liftoff: set it past the time the rocket is above Mach 0.8.</li>` +
        `<li><b>Static ports.</b> The altimeter bay needs holes so the pressure inside follows the air outside: follow your altimeter maker's rule for their size, and use three or four around the bay so a side wind doesn't fool it.</li>` +
        `<li><b>Charges and shear pins.</b> Each charge must break the shear pins and push the section apart, but not so hard it damages the rocket. Size it, then ground test it in the real rocket before flying.</li></ul>` +
        `<p>Two failures to plan for: a charge that fires while the rocket is still fast (a zipper, where the shock cord slices the airframe), and a main that opens too high (long drift) or too low (not open in time).</p>` +
        tryIt(
          "in the builder, select Recovery in the Design Tree and choose One altimeter or Two altimeters, with each one's apogee delay and main height; a chute release can be added to any set-up. The RSO Checklist rates the drogue and landing speeds and the main's opening load, and gives the Mach lockout time; the Ejection Charge Calculator sizes the charges. The Recovery Plan on Results lists every charge in order, flies the rocket again as if each altimeter failed and as if both did, and gives the time and drift under each chute and the static port size.",
        ),
    },
    {
      id: "flutter",
      group: "Mid & high power",
      title: "Fin flutter and strength",
      sub: "Why fins fail near Mach 1, and what stiffens them",
      html:
        `<p>Fin flutter is a fin twisting and bending back and forth in the airflow, faster and further each cycle, until it breaks off. It needs no flaw in the fin: above a certain speed the air feeds the vibration more energy than the fin can soak up. That is its <b>flutter speed</b>.</p>` +
        FLUTTER +
        `<p>The app estimates it with Martin's criterion (NACA TN 4197, 1958), which NACA wrote as a first check for missile fins:</p>` +
        `<p class="eq">V<sub>f</sub> = a √( G / ( 1.337 · AR³ · p · (λ + 1) / ((AR + 2) · (t/c)³) ) )</p>` +
        `<p>a is the speed of sound and p the air pressure where the rocket is; G is the fin material's shear modulus (how hard it is to twist); AR is the fin's aspect ratio (span² / area); λ the tip chord over the root chord; t/c its thickness over its root chord.</p>` +
        `<ul><li><b>Thickness matters most:</b> the flutter speed grows with (t/c) to the power 1.5, so 25% thicker fins flutter about 40% faster.</li>` +
        `<li><b>A stiffer material</b> raises it with √G: in the app's table, G-10 fiberglass fins flutter at about twice the speed of plywood ones. Wood and woven cloth twist much more easily than their bending stiffness suggests, which the app allows for.</li>` +
        `<li><b>A shorter span</b> (lower aspect ratio) and <b>more taper</b> help. Tip-to-tip cloth over the fins stiffens them most of all.</li>` +
        `<li><b>Thin air helps:</b> higher up, the lower pressure raises the flutter speed, so the risk is greatest at burnout low down.</li></ul>` +
        `<p>The estimate is rough and meant to be cautious: real materials vary, and the method doesn't model a fin's attachment. Treat 80% of the flutter speed as the line to stay under.</p>` +
        tryIt(
          "set each fin set's material and thickness in the builder. The RSO Checklist's Fin flutter row shows the flight's peak airspeed as a share of the flutter speed; try a thicker fin or G-10 and watch it fall.",
        ),
    },
    {
      id: "mach",
      group: "Mid & high power",
      title: "Flying through Mach 1",
      sub: "What changes in drag and stability, and in the prediction",
      html:
        `<p>Many high-power flights pass the speed of sound. Through Mach 0.8 to 1.2 the air around the rocket changes character, and several things change with it at once.</p>` +
        SHOCK +
        `<ul><li><b>Drag rises steeply.</b> Shock waves form on the nose and fins, and Cd can double between Mach 0.8 and just past 1, then eases off. A motor that pushes the rocket only just past Mach 1 often buys surprisingly little extra height.</li>` +
        `<li><b>Stability shifts.</b> The CP moves as the fins' lift changes through the transonic range. Well past Mach 1 the fins lose lift faster than the nose does, so the CP creeps forward and the margin shrinks. Check the stability at top speed, not only on the pad.</li>` +
        `<li><b>Shape matters more.</b> Thin fins with sharp or beveled edges, a long pointed nose (a Von Kármán or ogive), and few bumps cut the wave drag. Square fin edges cost the most here.</li>` +
        `<li><b>Loads and heat.</b> Fins, nose and joints carry their highest loads near top speed. Flutter is likeliest here; past Mach 2 the skin also heats noticeably.</li>` +
        `<li><b>Barometric altimeters</b> can be fooled by the pressure jump: use a Mach lockout.</li>` +
        `<li><b>The prediction is least certain.</b> No theory covers the transonic range, so every simulator works from measurements there. The app's measured accuracy is shown by speed band in the Technical level's Validation chapter, and the ± on Results widens to match.</li></ul>` +
        tryIt(
          "the Wind Tunnel on the Rocket tab plots Cd and the CP against Mach. Results shows the top Mach, and the RSO Checklist flags the transonic window, the Mach lockout time and the flutter margin.",
        ),
    },
    {
      id: "staging",
      group: "Mid & high power",
      title: "Staging and airstarts",
      sub: "Separation, ignition timing and the rules",
      html:
        `<p>A staged rocket carries a second motor up before lighting it, so it starts higher and lighter. An airstart is any motor lit in flight: the sustainer of a two-stage rocket, or the outer motors of a cluster lit after the center one.</p>` +
        STAGE +
        `<ul><li><b>Model rockets</b> often stage directly: the booster's burnout flame lights the sustainer through the joint, with no electronics.</li>` +
        `<li><b>High-power stages</b> separate (by drag, or a small charge), and the sustainer is lit by electronics after a set time or at a set height.</li>` +
        `<li><b>Lockouts</b> keep a sustainer from lighting if something went wrong: staging altimeters can refuse to fire below a set height, or when the rocket is tilted past a set angle (a sustainer lit pointing sideways goes where it points).</li>` +
        `<li><b>The booster needs recovery too.</b> It falls from separation and needs its own chute or streamer.</li>` +
        `<li><b>Coast time</b> trades off: a longer coast before lighting the sustainer saves drag, but the rocket slows, tilts in the wind and loses stability before the sustainer gets it moving again.</li></ul>` +
        `<p><b>The rules.</b> All motors count together toward the FAA's limits and the safe distances: the NAR's High Power Safety Code puts staged and clustered rockets in a "complex" column with larger distances (for a K motor, 300 ft rather than 200). Tripoli's Unified Safety Code says the order to arm at the pad: recovery electronics first, then staging, then the launch igniter. Tripoli doesn't allow staged or clustered rockets for Level 1 or Level 3 certification; the NAR allows them for Level 2 up to 5,120 N·s, with at least one J, K or L motor. Many ranges ask to review a staged flight before it flies.</p>` +
        `<p class="note">Rules checked in November 2026 in the <a href="https://www.nar.org/?p=74" target="_blank" rel="noopener">NAR High Power Rocket Safety Code</a> and the <a href="https://tripoli.org/safety" target="_blank" rel="noopener">Tripoli Unified Safety Code</a>.</p>` +
        tryIt(
          "add a booster in the builder and pick both motors on the Motor tab; Sustainer ignition lockouts are on the Range tab. Results shows the sustainer's ignition height and tilt, and the booster's own flight down.",
        ),
    },
    {
      id: "altimeter",
      group: "Mid & high power",
      title: "Reading your altimeter",
      sub: "Flight vs prediction: what each difference points at",
      html:
        `<p>An altimeter turns a prediction into a check. Compare the flight with the prediction event by event, and each difference points at a different cause.</p>` +
        LOGFIG +
        `<ul><li><b>Top speed off by more than a few percent:</b> drag hardly changes the boost, so look at the weight (weigh the rocket) or the motor (a different reload, or a hot or cold motor).</li>` +
        `<li><b>Boost right, apogee off:</b> the coast is where drag shows. The real rocket losing more height than predicted points at more drag: a rougher finish, rail buttons, seams, fin edges. Calibrating the drag to the flight corrects the rest of that rocket's predictions.</li>` +
        `<li><b>Charge before apogee:</b> the logged top altitude isn't a full apogee. The rocket came apart still climbing; compare the coast up to the charge instead, and pick a longer delay next time.</li>` +
        `<li><b>Charge well after apogee:</b> the rocket was falling, which is harder on the recovery.</li>` +
        `<li><b>Acceleration at the altimeter's limit:</b> many small altimeters read acceleration only to about 23 g, and work out top speed from it. A flight that pulls harder reads low on both.</li>` +
        `<li><b>Barometric altimeters</b> turn pressure into height assuming a standard day. On a hot day the real height is higher than they say, by about 1% for every 3 °C (5 °F) above standard.</li></ul>` +
        tryIt(
          "tap Compare with a real flight in the Flight Log on the Results tab, and import the altimeter's file or enter what its display showed: Flight vs prediction shows the curves, each event's error and what the differences point at.",
        ),
    },
    {
      id: "dragmodel",
      group: "Technical",
      title: "The drag model",
      sub: "Each part, its method and its sources",
      html:
        `<p>The app works out drag the way professional rocket and missile codes do: it splits the rocket into parts, gives each part the method best backed by measurements, and adds them up.</p>` +
        `<h3>Adding it up</h3><p>No single equation covers a rocket from a standstill to Mach 5, so the drag is built from parts. USAF DATCOM, Missile DATCOM, RASAero and OpenRocket all work this way. The drag force at any moment is:</p>` +
        `<p class="eq">D = ½ ρ v² C<sub>D</sub> A<sub>ref</sub></p>` +
        `<p>Here ρ is the air's density, v the airspeed, and A<sub>ref</sub> the frontal area of the widest body section. C<sub>D</sub> is the sum of the parts, each worked out separately at the current speed and height:</p>` +
        `<p class="eq">C<sub>D</sub> = friction + nose + shoulders + boattail + base + fins + protuberances</p>` +
        `<p>Each term comes from the method with the best support from measurements at that speed. The Missile DATCOM final report (1988) and the NACA and NASA reports it relies on set most of the choices; Hoerner's <i>Fluid-Dynamic Drag</i> and the US Army handbook MIL-HDBK-762 fill the gaps.</p>` +
        `<h3>Speed bands</h3>` +
        BANDS +
        `<p>The air behaves differently at different speeds, so each part's method changes with the Mach number. Where one method hands over to the next, the two are blended smoothly over a stated range, so no coefficient jumps. Below Mach 0.8, drag is mostly skin friction and the base. From 0.8 to 1.2 (fins to 1.5) shock waves form, drag rises steeply and the CP moves; no theory works here, so the app uses measurements. From 1.2 to 4, linear supersonic theory works for thin fins and slender noses. Past Mach 4 the app blends into modified Newtonian theory.</p>` +
        `<h3>Skin friction</h3><p>Friction is the air dragging along the surface inside a thin layer, the boundary layer. On most rockets below Mach 1 it is the biggest single part of the drag.</p>` +
        `<ul><li><b>Smooth surfaces</b> use the Prandtl–Schlichting turbulent flat-plate law, with the boundary layer turbulent from the nose tip. The Natural transition setting lets it start laminar and turn turbulent at a Reynolds number of 500,000.</li>` +
        `<li><b>Rough surfaces</b> blend in White's fully rough law, depending on how big the roughness is next to the boundary layer's own small scales. That is why Surface finish matters more on fast rockets.</li>` +
        `<li><b>Compressibility</b> uses the Van Driest II method, which Missile DATCOM also uses. Hot air near the skin is thinner, so friction falls at high speed: at Mach 5 it is under half the low-speed value.</li>` +
        `<li><b>Skin temperature</b> is followed through the flight. A cool skin early in a fast flight has more friction than a heated one later.</li>` +
        `<li><b>Form factors</b> from Hoerner add the extra friction a thick body or thick fin causes by speeding up the air around it.</li></ul>` +
        `<p class="eq">C<sub>f</sub> = 0.455 / (log<sub>10</sub> Re)<sup>2.58</sup></p><p>That is the smooth turbulent flat-plate law, before roughness, compressibility and form factors.</p>` +
        `<h3>Nose, shoulders and boattails</h3><p><b>The nose</b> makes almost no pressure drag below about Mach 0.8 if it blends smoothly into the body. Above that, its drag comes from measurements: NASA TR R-100 (Stoney, 1961) flew and wind-tunnel-tested cones, ogives, parabolic, Haack and elliptical noses through Mach 2. The app reads its curves for your nose's shape and slenderness. Above Mach 2 a pointed nose switches to shock-expansion theory, built from the exact solution for flow over a cone. A rounded tip adds the drag of a small hemisphere above Mach 0.8.</p>` +
        `<p><b>Shoulders and flares</b>, where the body gets wider, follow Hoerner's rule below Mach 0.8 and Bonney's cone correlation above Mach 1. A flat step facing forward uses wind-tunnel measurements of how the flow lifts off ahead of it.</p>` +
        `<p><b>Boattails</b>, where the body narrows at the back, cost little pressure drag below the speed of sound if the flow follows them. They also shrink the base, which saves drag. The flow stays attached up to about a 15° slope and has fully separated past about 25°. Above Mach 1, boattails do cost wave drag, from NASA TR R-100's equation for conical afterbodies, and from wind-tunnel data above Mach 2.5.</p>` +
        `<h3>Base drag, and what the motor does to it</h3><p>Behind the flat back of a rocket the air can't follow the edge, so it leaves a low-pressure region that pulls back on the base. On a coasting model rocket below Mach 1 this is often a quarter to a third of the total drag.</p>` +
        `<ul><li><b>Below Mach 2,</b> the base pressure comes from flight measurements in NASA TR R-100. It is about the same up to Mach 0.9 and peaks just past Mach 1.</li>` +
        `<li><b>Above Mach 2,</b> it comes from NACA TN 3819 (Love, 1957), which also gives the extra suction from fins near the base and from blunt fin trailing edges.</li>` +
        `<li><b>A boattail</b> shrinks the base, and the drag falls with it.</li>` +
        `<li><b>While the motor burns,</b> its exhaust fills the nozzle's share of the base, and that share has no base drag. This is why the app asks for the nozzle exit diameter, or estimates it from the motor's thrust. The exhaust plume's effect on the pressure around it isn't modeled.</li></ul>` +
        `<h3>Fins</h3><p>Fins add friction on both faces, pressure drag on their edges, and wave drag above the speed of sound. Their edge shape matters a lot.</p>` +
        `<ul><li><b>Square leading edge:</b> the air stops against the flat front. Below the drag rise it costs 0.4 of the stagnation pressure on the edge's face, rising to 0.8 through Mach 1 (Hoerner).</li>` +
        `<li><b>Rounded leading edge:</b> no penalty below the drag rise, because the air flows round it. Above, it acts like a cylinder across the flow, ⅔ of the stagnation pressure by modified Newtonian theory.</li>` +
        `<li><b>Sharp edges</b> (airfoil, beveled, double wedge): above the drag rise, wave drag from linear theory for the fin's own outline and section. Short, steep bevels cost more, and sweeping an edge behind the Mach line costs less.</li>` +
        `<li><b>A small round on a sharp edge</b> (the leading-edge radius): what the round adds over the sharp wedge it replaces, by modified Newtonian theory.</li>` +
        `<li><b>Through Mach 1:</b> a measured correlation of 22 wings (NACA Report 1253). A short, stubby fin's drag rises later and peaks lower than a long one's.</li>` +
        `<li><b>Square and rounded trailing edges</b> leave a small base behind them and take base drag on that area.</li>` +
        `<li><b>Sweep</b> delays everything: the edges feel only the part of the airspeed normal to them.</li></ul>` +
        `<p class="eq">C<sub>D,wave</sub> = K (t/c)² / β,&nbsp;&nbsp; β = √(M² − 1)</p>` +
        `<p>The fin's wave drag on its own area: t/c is the thickness over the chord, K = 4 for a double wedge, 16/3 for an airfoil, and 10 for a beveled fin with 20% bevels. A fin's drag starts to rise at its drag-divergence Mach number, about 0.96 − 1.5·(t/c): around Mach 0.87 for a 6%-thick fin.</p>` +
        `<h3>Rail buttons, lugs and other bumps</h3><p>Anything sticking out of the body adds drag, but less than its size suggests: it sits partly inside the slow air of the boundary layer. The app reduces each item's drag by how deep it sits, using the standard 1/7-power profile of a turbulent boundary layer.</p>` +
        `<ul><li><b>Rail buttons:</b> a short cylinder across the flow, a drag coefficient of 1.2 on its frontal area below the speed of sound (Hoerner), rising toward modified Newtonian theory above Mach 1.3.</li>` +
        `<li><b>Launch lugs:</b> pressure on the front face, base drag on the back, and friction through the bore.</li>` +
        `<li><b>Cameras, switch boxes and shrouds</b> (the Protuberance part): Hoerner's measured coefficients for boxes, cylinders and streamlined blisters. A bare 1 in cube on a 4 in rocket adds about 0.09 to Cd; a streamlined one the same size, about 0.005 below Mach 1.</li></ul>` +
        `<p>Items on one side of the body also push the rocket slightly sideways, and the app includes that turn in the flight.</p>` +
        `<h3>How well it is checked</h3><p>The model has been compared with wind-tunnel tests, free-flight tests and real flights. Cases marked "check" were never used to set any constant in the model, so they are a fair test.</p>` +
        `<div class="tblwrap"><table><thead><tr><th>What</th><th>Measured against</th><th>Mean error</th></tr></thead><tbody>` +
        [
          [
            "Apogee, 23 flights, Mach 0.55 to 3.5 (check)",
            "Altimeters, GPS, accelerometers and tracking",
            "6.3% (RASAero II: 5.2%)",
          ],
          ["Drag, Arcas sounding rocket, Mach 1.5 to 4.6 (check)", "NASA TN D-4014, wind tunnel", "5.5%"],
          ["Drag, fin-stabilized cone-cylinder, Mach 2.5 to 3.9 (check)", "NACA RM L55G28a, free flight", "1.2%"],
          ["Drag, Aerobee 150A, Mach 0.1 to 5 (check)", "Aerojet wind-tunnel data", "7.2% under thrust, 5.3% coasting"],
          ["Drag, boattailed bodies in flight, Mach 0.8 to 2 (check)", "NASA TR R-100", "20.3% and 16.8%, high"],
          [
            "Drag that swept wings add, Mach 1.1 to 1.7 (check)",
            "NACA TN 3697, six wings in free flight",
            "0.001 to 0.003 on the wing area for five; up to 0.007 too little on one",
          ],
          [
            "A boattail's own pressure drag, Mach 0.9 to 1.4 (check)",
            "NACA RM L56K22, RM A57I09 and NASA TM X-1960, wind tunnel",
            "within 0.01 in drag coefficient at 15°; 0.01 to 0.02 too little at 3° to 10°",
          ],
          ["Center of pressure, Mach 0.6 to 4.6", "NASA TN D-4013 and D-4014, Arcas", "3.1% of body length"],
        ]
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
          .join("") +
        `</tbody></table></div>` +
        `<p>The weakest band is transonic. Across all check cases, drag is within about 6% between Mach 1.2 and 3, but about 13% off between Mach 0.8 and 1.2, where shock waves come and go and no theory holds.</p>` +
        `<h3>Calibrating to your own flights</h3><p>No drag model knows your rocket's real finish, fillets and seams. After a flight, tap Compare with a real flight in the Flight Log, enter your altimeter's reading or import its file, save the flight and tick Use for calibration: the app scales its drag so the prediction matches your flights, and every later run of that rocket uses it.</p>` +
        tryIt(
          "open the Wind Tunnel and the Drag table on the Rocket tab to see the parts for your own rocket at every speed.",
        ) +
        `<p>The full reference, with every equation, the speed where each method hands over, every constant fitted to a measurement and the known gaps, is in the project's source: <a href="https://github.com/dustintlee-blahblah/PocketRocketFlightLab/blob/main/AERODYNAMICS.md" target="_blank" rel="noopener">AERODYNAMICS.md</a>, <a href="https://github.com/dustintlee-blahblah/PocketRocketFlightLab/blob/main/VALIDATION.md" target="_blank" rel="noopener">VALIDATION.md</a> and <a href="https://github.com/dustintlee-blahblah/PocketRocketFlightLab/blob/main/REFERENCES.md" target="_blank" rel="noopener">REFERENCES.md</a>.</p>`,
    },
    {
      id: "stabmodel",
      group: "Technical",
      title: "The stability model",
      sub: "Barrowman, body lift, fin–body carryover",
      html:
        `<p>Stability comes from where the air's sideways force acts when the rocket flies at a small angle to the airflow (the angle of attack, α). Each part makes a normal force that grows with α, at a slope C<sub>Nα</sub> and acting at its own point; the CP is their weighted average.</p>` +
        CPFIG +
        `<p class="eq">x<sub>CP</sub> = Σ C<sub>Nα,i</sub> x<sub>i</sub> / Σ C<sub>Nα,i</sub>&nbsp;&nbsp;&nbsp; static margin = (x<sub>CP</sub> − x<sub>CG</sub>) / d</p>` +
        `<ul><li><b>Nose, shoulders and boattails:</b> Barrowman's slender-body theory (1966–67): C<sub>Nα</sub> = 2(A<sub>2</sub> − A<sub>1</sub>)/A<sub>ref</sub> at each section's centroid. A nose gives 2; a boattail gives a negative slope, pulling the CP forward. Above Mach 1 the nose and the body behind it follow measured charts for ogive- and cone-cylinders (MIL-HDBK-762).</li>` +
        `<li><b>Fins below Mach 0.9:</b> Diederich's lift-slope formula with the Prandtl–Glauert correction, as Barrowman uses it, worked strip by strip so any outline works; the CP at a quarter of the mean chord.</li>` +
        `<li><b>Fins above Mach 1.5:</b> linear supersonic theory for the fin's taper and sweep (charts), β = √(M² − 1); blended between 0.9 and 1.5. A fin swept behind the Mach line makes less lift than thin-airfoil theory's 4/β; an unswept fin, or any fin at high Mach, has 4/β with a tip loss. The fin lift falls as 1/β, which is why the CP moves forward at high Mach.</li>` +
        `<li><b>Fins and body together:</b> the body between the fins raises their lift by Barrowman's 1 + r/(s + r). Above Mach 0.9, the fins' lift carried onto the body comes from Pitts, Nielsen and Kaattari (NACA Report 1307).</li>` +
        `<li><b>Body lift across the flow:</b> at larger angles the body's side area adds lift, K·(side area/A<sub>ref</sub>)·sin²α with K = 1.1, acting mid-body. It moves the CP back as α grows, so the static CP is quoted at a typical 2°.</li>` +
        `<li><b>Five or more fins</b> shield each other (MIL-HDBK-762's factors); fins stall from about 18° to 35°.</li></ul>` +
        `<p>The flight also needs <b>damping</b>: how quickly a swing dies out. The app works out pitch and roll damping from the same parts, so a rocket that is stable but under-damped weaves in the flight, as real ones do.</p>` +
        `<p>Checked against wind-tunnel data: the Arcas sounding rocket's CP from Mach 0.6 to 4.6 (NASA TN D-4013 and D-4014) within 3.1% of body length on average.</p>` +
        tryIt(
          "the Wind Tunnel's CP against Mach, and the Results stability chart through the flight. AERODYNAMICS.md lists every term with its source.",
        ),
    },
    {
      id: "motion",
      group: "Technical",
      title: "Equations of motion and the atmosphere",
      sub: "What is integrated, the time step, the standard atmosphere",
      html:
        `<p>The app flies the rocket as a rigid body with six degrees of freedom: three for where it is and three for which way it points.</p>` +
        `<ul><li><b>The state</b> is the position, the velocity, the rocket's axis (as a direction), and its pitch, yaw and roll rates. Mass, the CG and the moments of inertia change as the motor burns.</li>` +
        `<li><b>Forces:</b> thrust along the axis (with any misalignment you set); gravity, falling off with height above sea level; drag along the airflow and the normal force across it, from the airspeed relative to the wind; and the earth's rotation (Coriolis), from the site's latitude.</li>` +
        `<li><b>Moments:</b> the normal force acting at the CP, about the CG, turns the rocket into the airflow; damping slows the swing; fin cant spins it.</li>` +
        `<li><b>Integration:</b> a fourth-order Runge–Kutta step, 0.002 s on the rail and under power, 0.01 s coasting and up to 0.2 s under a chute, shortened while a canopy fills or the drag changes quickly.</li>` +
        `<li><b>Phases:</b> on the rail (guided until the rocket leaves it), free flight (tumbling if it goes unstable), and under drogue and main. Lower stages drop away and are flown down on their own.</li></ul>` +
        `<p class="eq">m dv/dt = T + m g + D + N + F<sub>Coriolis</sub>&nbsp;&nbsp;&nbsp; I dω/dt = M<sub>aero</sub> + M<sub>damping</sub></p>` +
        ATMFIG +
        `<p><b>The atmosphere</b> is the U.S. Standard Atmosphere 1976 to 86 km, shifted to the field's own temperature and pressure. The shift holds through the troposphere and fades out between 11 and 15 km, where a season's warmth or cold is gone (U.S. Standard Atmosphere Supplements, 1966). Humidity lowers the density a little and raises the speed of sound (through the virtual temperature); viscosity follows Sutherland's law. A forecast's temperatures aloft replace the standard ones where they reach.</p>` +
        `<p><b>Wind</b> grows with height (by a profile you pick, or the forecast's winds aloft), with gusts, and the rocket turns into it off the rail.</p>` +
        tryIt(
          "Results' charts show the flight as it was integrated, and Export CSV writes it out step by step for your own analysis.",
        ),
    },
    {
      id: "validation",
      group: "Technical",
      title: "Validation",
      sub: "Measured flights by speed band, mean and σ",
      html:
        `<p>How far to trust a simulation is a measurement, not a feeling. The app is checked against real flights with recorded apogees, wind-tunnel data and other simulators, and the flights it was never tuned on count most.</p>` +
        VALFIG +
        `<div class="tblwrap"><table><thead><tr><th>Top speed</th><th>Flights</th><th>Mean</th><th>σ</th><th>1σ range</th><th>90% range</th></tr></thead><tbody>` +
        B.map(
          (b) =>
            `<tr><td>${b.lo === 0 ? "below Mach 0.8" : b.hi > 9 ? "above Mach " + b.lo : "Mach " + b.lo + "–" + b.hi}</td><td>${b.n}</td><td>${pctTxt(b.mean)}</td><td>${(b.sd * 100).toFixed(1)}%</td><td>${pctTxt(b.mean - b.k68 * b.sd)} to ${pctTxt(b.mean + b.k68 * b.sd)}</td><td>${pctTxt(b.mean - b.k90 * b.sd)} to ${pctTxt(b.mean + b.k90 * b.sd)}</td></tr>`,
        ).join("") +
        `</tbody></table></div>` +
        `<p>The table is where real apogees landed against the app's prediction (negative: lower), over ${APO_ACCURACY.flights} flights from Mach 0.55 to 3.6 measured by altimeters, GPS, accelerometers and optical tracking. With this few flights the ranges are prediction intervals for one more flight: Student's t for that many flights, widened by √(1 + 1/n). They are the ranges behind the ± on Results and the waiver check, and they are worked out again from the flights whenever flights are added.</p>` +
        `<ul><li><b>Below Mach 0.8</b> the app is closest: drag here is mostly friction and base drag, both well measured.</li>` +
        `<li><b>Mach 0.8 to 1.2</b> is the hardest band for every simulator: shocks come and go, and only measurements cover it. One flight (Raven, 22% under its prediction) sets much of this band's spread.</li>` +
        `<li><b>Above Mach 1.2</b> the app has tended to predict high. The cause is being looked for in the drag model itself, rather than covered with a correction factor.</li></ul>` +
        `<p>Other checks: drag against NACA and NASA wind-tunnel and free-flight data within about 6% from Mach 1.2 to 3; the Arcas CP within 3.1% of length; and OpenRocket's own example files flown side by side.</p>` +
        tryIt(
          "compare your own flights with Compare with a real flight in the Flight Log: for your rocket, they are the best check of all. VALIDATION.md has every flight and comparison above, and how to run them yourself.",
        ) +
        `<p><a href="https://github.com/dustintlee-blahblah/PocketRocketFlightLab/blob/main/VALIDATION.md" target="_blank" rel="noopener">VALIDATION.md</a></p>`,
    },
    {
      id: "reading",
      group: "Technical",
      title: "Further reading",
      sub: "Where to go next",
      html:
        `<p>These are good next steps, from easiest to deepest.</p><ul>` +
        `<li><a href="https://www.grc.nasa.gov/www/k-12/rocket/" target="_blank" rel="noopener">NASA Glenn, Beginner's Guide to Rockets</a>: short illustrated pages on forces, aerodynamics and model rocket parts.</li>` +
        `<li><a href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/conditions-for-rocket-stability/" target="_blank" rel="noopener">NASA Glenn, Conditions for rocket stability</a>: CG and CP with pictures.</li>` +
        `<li><a href="https://nar.org/?p=31407" target="_blank" rel="noopener">NAR Model Rocket Safety Code</a> and <a href="https://www.nar.org/?p=74" target="_blank" rel="noopener">High Power Rocket Safety Code</a>: the rules every flyer follows.</li>` +
        `<li><a href="https://www.tripoli.org/" target="_blank" rel="noopener">Tripoli Rocketry Association</a>: high-power certification and launches.</li>` +
        `<li>G. Harry Stine and Bill Stine, <i>Handbook of Model Rocketry</i>: the classic book on the hobby, from first flights to recovery and staging.</li>` +
        `<li>James Barrowman, <i>Calculating the Center of Pressure of a Model Rocket</i> (Centuri TIR-33): the method behind every rocket stability calculator, for the curious.</li></ul>` +
        `<p>These links need a connection; everything else on this page works offline.</p>`,
    },
  ];
}
