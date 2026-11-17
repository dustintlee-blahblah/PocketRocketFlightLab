/**
 * The Learn page's chapters: how rockets fly and how this app works them out, for beginners, and a deeper chapter
 * on the drag model. Each chapter is plain HTML with a simple drawing (inline SVG in the page's own colors, so it
 * works offline and in both themes) and a "Try it in the app" note. The numbers given are the guidelines the app
 * itself uses (the RSO Checklist's), so the two agree; the technical detail behind the drag chapter is in
 * AERODYNAMICS.md and VALIDATION.md, which it links to.
 */

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
  const BANDS = fig(
    svgOpen(96, "Speed bands of the drag model") +
      [
        [6, 72, "Subsonic", "below 0.8"],
        [80, 72, "Transonic", "0.8 to 1.2"],
        [154, 76, "Supersonic", "1.2 to 4"],
        [232, 62, "Hypersonic", "4 to 6"],
      ]
        .map(
          ([x, w, t, m], i) =>
            `<rect x="${x}" y="20" width="${w}" height="34" rx="6" ${i === 1 ? 'stroke="var(--accent)" fill="var(--accent)" fill-opacity=".15"' : ""}/><text x="${x + w / 2}" y="41" text-anchor="middle" stroke="none" fill="${i === 1 ? "var(--accent)" : "currentColor"}">${t}</text><text x="${x + w / 2}" y="72" text-anchor="middle" stroke="none" fill="currentColor">${m}</text>`,
        )
        .join("") +
      `<text x="150" y="90" text-anchor="middle" stroke="none" fill="currentColor">Mach number</text>`,
    "Each band uses its own methods, blended where they meet. The transonic band has no theory, only measurements.",
  );
  return [
    {
      id: "forces",
      group: "The basics",
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
      group: "The basics",
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
      group: "The basics",
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
      group: "The basics",
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
        `<p>Letters through G are model rockets. H and above are high power and need certification: Level 1 for H and I, Level 2 for J to L, Level 3 for M and up.</p>` +
        tryIt(
          "on the Motor tab, open Compare motors to fly the same rocket on several motors side by side. After a run, Motor Delay shows the best delay for that flight next to the delays the motor comes with.",
        ),
    },
    {
      id: "drag",
      group: "The basics",
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
      group: "The basics",
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
      group: "The basics",
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
      group: "The basics",
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
        `<p>The best fix is your own data. Weigh the rocket and find its CG with the motor in, and enter those in the builder. After a flight, enter your altimeter's reading in the Flight Log and let the app calibrate to your rocket.</p>` +
        tryIt(
          "Imperfections on the Rocket tab adds the small real-world flaws, and Landing dispersion on the Results tab shows how much the result spreads when the wind varies.",
        ),
    },
    {
      id: "dragmodel",
      group: "Going deeper",
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
        `<li><b>Sharp edges</b> (airfoil, beveled, double wedge): above the drag rise, thin-airfoil wave drag. Beveled fins take K from their bevel lengths, so short, steep bevels cost more.</li>` +
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
            "6.4% (RASAero II: 5.2%)",
          ],
          ["Drag, Arcas sounding rocket, Mach 1.5 to 4.6 (check)", "NASA TN D-4014, wind tunnel", "4.1%"],
          ["Drag, fin-stabilized cone-cylinder, Mach 2.5 to 3.9 (check)", "NACA RM L55G28a, free flight", "1.2%"],
          ["Drag, Aerobee 150A, Mach 0.1 to 5 (check)", "Aerojet wind-tunnel data", "5.9% under thrust, 4.8% coasting"],
          ["Drag, boattailed bodies in flight, Mach 0.8 to 2 (check)", "NASA TR R-100", "6.2% and 12.6%"],
          ["Center of pressure, Mach 0.6 to 4.6", "NASA TN D-4013 and D-4014, Arcas", "3.1% of body length"],
        ]
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
          .join("") +
        `</tbody></table></div>` +
        `<p>The weakest band is transonic. Across all check cases, drag is within about 6% between Mach 1.2 and 3, but about 13% off between Mach 0.8 and 1.2, where shock waves come and go and no theory holds.</p>` +
        `<h3>Calibrating to your own flights</h3><p>No drag model knows your rocket's real finish, fillets and seams. After a flight, log your altimeter's reading in the Flight Log and tick Use for calibration: the app scales its drag so the prediction matches your flights, and every later run of that rocket uses it.</p>` +
        tryIt(
          "open the Wind Tunnel and the Drag table on the Rocket tab to see the parts for your own rocket at every speed.",
        ) +
        `<p>The full reference, with every equation, the speed where each method hands over, every constant fitted to a measurement and the known gaps, is in the project's source: <a href="https://github.com/dustintlee-blahblah/PocketRocketFlightLab/blob/main/AERODYNAMICS.md" target="_blank" rel="noopener">AERODYNAMICS.md</a>, <a href="https://github.com/dustintlee-blahblah/PocketRocketFlightLab/blob/main/VALIDATION.md" target="_blank" rel="noopener">VALIDATION.md</a> and <a href="https://github.com/dustintlee-blahblah/PocketRocketFlightLab/blob/main/REFERENCES.md" target="_blank" rel="noopener">REFERENCES.md</a>.</p>`,
    },
    {
      id: "reading",
      group: "Going deeper",
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
