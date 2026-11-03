/**
 * Field help: the small "i" button beside each input, the text it shows, and drawing the forms.
 */
/* ---------- field help: a small "i" button beside each input opens a box explaining how to fill it in ---------- */
/**
 * The HTML of an "i" button that opens a help box (empty if there is no help text).
 * @param {string} title box title (HTML tags are stripped)
 * @param {string} txt help text
 * @returns {string} HTML
 */
function infoBtn(title, txt) {
  if (!txt) return "";
  const q = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]),
    t = String(title).replace(/<[^>]*>/g, "");
  return `<button class="ib" type="button" data-title="${q(t)}" data-info="${q(txt)}" aria-label="About ${q(t)}">i</button>`;
}
/**
 * Help text for the form fields, by key (a function where the text depends on the design).
 */
const FIELD_INFO = {
  elev: "Height of the launch site above sea level. It sets the air pressure and density the rocket starts in, unless you enter a barometer reading under Ambient conditions.",
  lon: "The launch site’s longitude in degrees. Use a negative number west of Greenwich (all of North and South America) and a positive number east of it (for example −111.9 for Salt Lake City, 151.2 for Sydney).\n\nIt’s used to fetch the weather forecast for the site (Ambient conditions) and is written into OpenRocket files you save.",
  lat: "The launch site’s latitude in degrees. Use a positive number north of the equator and a negative number south of it (for example 40.7 for New York, −33.9 for Sydney).\n\nIt sets how much the earth’s rotation (the Coriolis effect) bends the flight, which matters mostly for high, long flights.",
  waiver:
    "The highest the rocket may fly: the field's FAA waiver or the club's ceiling. Set whether it's measured from the ground (AGL) or from sea level (MSL) below; FAA waivers are often given above sea level, so the app subtracts the field elevation.\n\nThe RSO Checklist compares the apogee with it, and the dispersion run's 95th-percentile apogee when you've run one.\n\n0 means not set.",
  waiverRef:
    "Whether the waiver ceiling is a height above the ground at the field (AGL) or an altitude above sea level (MSL), as many FAA waivers are written.",
  recRadius:
    "How far from the pad the rocket can land and still be inside the recovery area: the distance to the nearest field boundary, road or hazard in the direction it will drift.\n\nThe RSO Checklist compares the landing distance with it, and the far edge of the dispersion run's 95% landing ellipse when you've run one.\n\n0 means not set.",
  cert: "Your high-power certification. It sets the largest total impulse you can fly: none allows model rockets (G and smaller, up to 320 N·s in all); Level 1 allows H and I; Level 2 J, K and L; Level 3 M, N and O.\n\nFor clusters and two-stage rockets the impulse of every motor counts. A certification attempt flies one level up under the rules of NAR or Tripoli.",
  flightType:
    "Certification flight: an attempt at the next certification level (set the level you hold now in Settings → Profile). A motor above your certification switches this to Certification on its own. The checklist then checks that the motor is the right class for that attempt.\n\nFirst flights of a new design and other unusual flights are usually announced as heads-up flights: everyone on the field watches the launch. The RSO Checklist reminds you of this.\n\nClustered and two-stage rockets are complex rockets, which need larger distances from the pad; the app spots those itself.",
  rail: () =>
    `Length of the launch rail or rod the rocket slides along before it’s free. A longer rail gives more speed at rail exit, which keeps the rocket straighter in wind. A rail shorter than ${units === "imp" ? "2.5 ft" : "0.76 m"} gets a warning.`,
  angle: "How far the rail is tilted from straight up, in degrees. 0 is vertical. Most clubs allow up to 20°.",
  railType:
    "What guides the rocket off the pad. The RSO Checklist checks that it suits the rocket: rods need a launch lug big enough to slide over them, and 1010 and 1515 rails need rail buttons of that size (1010 buttons fit 1010 rails; 1515 buttons fit 1515 rails). It's saved with a launch site. It doesn't change the simulated flight: set the rail length to the guide's length above the rocket's lowest lug or button.",
  railMode:
    "Into the wind tilts the rail toward the wind, the usual practice, so the rocket doesn’t weathercock as far downwind.\n\nToward a set direction lets you choose the compass direction instead.",
  railDir:
    "The compass direction the top of the rail points toward, in degrees: 0 = north, 90 = east, 180 = south, 270 = west.\n\nUsed only when Rail leans is set to Toward a set direction.",
  cone: "Half-angle of the safety cone around vertical, in degrees. The app checks whether the rocket tips beyond it while the motor is still burning.\n\n20° is the launch-angle limit in the NAR and Tripoli safety codes.",
  tempC:
    "Air temperature at the pad. It sets the air density and the speed of sound, so it changes both drag and Mach number.",
  pressure:
    "The barometer reading at the pad itself (station pressure), not the sea-level “altimeter setting” given in weather reports.\n\nLeave it at 0 to use the standard pressure for the field elevation.",
  dewC: "The temperature the air would have to cool to for dew or fog to form. The closer it is to the air temperature, the more humid the air and the lower any clouds are likely to be. Get forecast fills it in; it's shown for planning and doesn't change the flight (Relative humidity is what the simulation uses).",
  ceiling:
    "How high the bottom of the lowest clouds is, measured above the pad (the same way as apogee). 0 means clear: no clouds worth counting.\n\nRockets must never be flown into clouds, so the RSO Checklist compares the predicted apogee with it. Get forecast estimates it from the forecast cloud cover at each pressure level (the lowest level where clouds cover about a quarter of the sky or more), so treat it as a rough guide and look at the sky on the day.",
  cloudLow:
    "Share of the sky covered by low clouds and fog, from the ground up to about 10,000 ft (3 km). Get forecast fills it in.\n\nWhat the RSO Checklist uses is the cloud cover at the heights the rocket actually flies through, up to its predicted apogee: high-power flights (FAA Part 101.25) may not go to any altitude where clouds cover more than five-tenths of the sky. After a forecast that's worked out from the cloud cover at each forecast level; if you type these three in yourself, from the three bands.",
  cloudMid:
    "Share of the sky covered by mid-level clouds, about 10,000–26,000 ft (3–8 km). Get forecast fills it in. See Low cloud cover for how the RSO Checklist uses it.",
  cloudHigh:
    "Share of the sky covered by high clouds, above about 26,000 ft (8 km): mostly thin cirrus, which makes the whole sky look cloudy on forecasts but is far above almost every rocket. Get forecast fills it in.",
  vis: "How far you can see horizontally. High-power flights (FAA Part 101.25) need at least 5 miles (8 km); the RSO Checklist checks it. 0 means not set. Get forecast fills it in.",
  precip:
    "The forecast chance of rain or snow at the launch hour. Shown for planning; it doesn't change the flight. The RSO Checklist flags a chance of 50% or more.",
  humidity:
    "Relative humidity at the pad, 0–100%. Humid air is slightly lighter than dry air; the effect is small (about 1.5% less density at 30 °C and 100%). 0 means dry air.",
  wind: "Average wind speed at the pad, measured at the height given in Wind measured at height.",
  windRef:
    "The height above the ground where the wind speed was measured: for example about 6 ft (2 m) for a hand-held meter, or 33 ft (10 m) for weather-station reports. The app adjusts the wind for height from here.",
  windProfile:
    "How the wind grows with height up to about 3,300 ft (1 km).\n\nTypical day uses the 1/7 power law. Calm mornings and evenings have stronger growth with height. Same at all altitudes keeps the pad wind everywhere.\n\nIf you fill in Winds aloft, those levels take over above the lowest one.",
  windDir:
    "The compass direction the wind blows from, in degrees: 0 = from the north, 90 = from the east, 180 = from the south, 270 = from the west. Weather reports give wind direction the same way.",
  turb: "Adds a repeatable gust pattern on top of the steady wind, as a percent of the wind speed. 0 is a steady wind; 10–20% is typical.",
  ignMinAlt:
    "The sustainer won’t light if the rocket is below this height above the pad at ignition time, like the altitude lockout on a staging altimeter.\n\n0 means no limit.",
  ignMaxTilt:
    "The sustainer won’t light if the rocket is tilted more than this angle from vertical at ignition time, so a rocket that has weathercocked badly doesn’t fire its upper stage sideways.\n\n0 means no limit.",
  motorDT:
    "How much warmer the motor is than the air. Use a negative number if it’s colder.\n\nA motor stored in a hot car burns faster and harder for a shorter time; a cold one slower and softer. Thrust changes about 0.2% per °C (0.1% per °F), with the same total impulse.\n\n0 means the motor is at air temperature.",
  thrustMis:
    "Angle between the motor’s thrust and the rocket’s centerline, in degrees. A tilted motor pushes the rocket sideways in a direction that turns as it rolls, which makes it cone and lose altitude.\n\nTypical: 0.1–0.5°. 0 is a perfectly straight motor.",
  finMis:
    "How far one fin is twisted from straight, in degrees. A crooked fin makes the rocket roll and pushes it sideways, and can drive roll lock-in.\n\nTypical: 0.1–0.5°. 0 is a perfectly straight fin.",
  cgOff:
    "How far the CG sits off the centerline, for example from an off-center altimeter bay or ballast. The thrust then pushes past the CG and turns the rocket.\n\n0 is centered.",
  clusterFail:
    "Yes flies the rocket with one outer motor of a cluster not lighting. The dud’s weight stays on board and the remaining thrust is off-center.\n\nApplies only to rockets with clustered motors.",
  mcN: "How many flights to run. More flights give a steadier result but take longer: 100 is a good start, fewer on a phone.",
  mcWind:
    "Spread of the wind speed, as one standard deviation in percent of the wind you entered. 25% means about two-thirds of the flights see a wind within ±25% of it.",
  mcDir: "Spread of the wind direction, as one standard deviation in degrees.",
  mcImp:
    "Spread of the motor’s total impulse, as one standard deviation. Certified motors typically vary 2–5% from their rated impulse.",
  mcMass: "Spread of the rocket’s weight, as one standard deviation, for uncertainty in what you weighed or estimated.",
  mcCd: "Spread of the drag, as one standard deviation, for uncertainty in the drag estimate and surface finish.",
  mcAngle: "Spread of the rail angle, as one standard deviation in degrees, for how accurately the rail is set.",
  mcDelay:
    "Spread of the motor's ejection delay, as one standard deviation. Delay grains are typically within about ±10% of their rating (two standard deviations of 5%), so the chute can come out early or late. Applies when the motor's charge deploys the chute.",
  mcChute:
    "Spread of each parachute's drag, as one standard deviation. Real canopies swing, breathe and lose drag in gusts, so the descent rate varies from flight to flight.",
  mcThermal:
    "Rising and sinking air during the descent, as one standard deviation of the vertical air speed. Each flight gets its own steady draft: up holds the rocket in the air longer and carries it farther, down brings it in sooner. Calm mornings: 0. A sunny desert afternoon: about 1–2 mph (0.5–1 m/s), with thermals of 5 mph or more possible. It fades out above about 10,000 ft and near the ground.",
  mcMis:
    "Spread of the thrust misalignment, as one standard deviation in degrees. Each flight gets a random amount in a random direction.",
};
/**
 * The help text of a form field.
 * @param {string} k field key
 * @returns {string}
 */
function fieldInfo(k) {
  const v = FIELD_INFO[k];
  return typeof v === "function" ? v() : v || "";
}
/**
 * The help text of a builder field, by part type and key.
 * @param {object} F builder field: key and part p
 * @returns {string}
 */
function bldInfo(F) {
  const k = F.key,
    t = F.p ? F.p.type : null,
    two = typeof BLD !== "undefined" && BLD && BLD.stages.length > 1;
  const LU = uname("len");
  const T = {
    name: t
      ? "A name for this part, shown in the Design Tree."
      : "The rocket’s name, shown in the title and in the report. It’s separate from the design file name.",
    finish:
      "The surface finish for every part. Rougher finishes add skin-friction drag.\n\nAs set on each part keeps the finishes from the design file.",
    known: t
      ? F.p && F.p.knownCalc
        ? "The weight RockSim calculated for this part, kept from the design file. Enter 0 to have this app calculate it from the part’s size and material."
        : "A weighed value for this part. It replaces the weight calculated from its size and material.\n\n0 calculates it."
      : "The weight of the rocket ready to fly but without its motor, if you’ve weighed it. It replaces the total the parts add up to.\n\n0 uses the parts.",
    knownAll:
      "Tick if the weight you entered includes everything attached inside this part (fins, mounts, recovery and so on), so those parts aren’t counted twice.",
    knownCg:
      "The measured balance point without the motor, measured from the nose tip (for a booster, from its front end). Balance the rocket ready to fly, without its motor.\n\nLeave blank to use the parts.",
    dryInertia:
      "The rocket’s resistance to turning end over end about its CG, without the motor. It sets how quickly the rocket weathercocks and how strongly it oscillates.\n\n0 estimates it from the parts; enter a measured value if you have one (for example from a swing test).",
    otherCd:
      "Extra drag coefficient for things the parts don’t include, such as camera shrouds, switch bands or screw heads. Usually 0.",
    cdOverride:
      "A fixed drag coefficient that replaces the calculated drag at every speed.\n\n0 uses the calculated drag.",
    blMode:
      "Turbulent from the nose is right for nearly all rockets, since nose tips, joints and lugs trip the airflow early.\n\nNatural transition lets the flow stay smooth (laminar) over the front of a very smooth, polished rocket, which lowers friction drag.",
    ignDelay: "Seconds between the booster burning out and the sustainer motor lighting.",
    sepDelay:
      "Seconds after this stage's motor burns out that it separates from the stage above. If the stage above lights first, the stages separate when it lights (hot staging).",
    shape:
      t === "fins"
        ? "Trapezoid fins are set by root chord, tip chord, span and sweep; elliptical fins by root chord and span; free-form fins by a list of outline points."
        : "The profile shape. Ogive and Haack (von Kármán) shapes have the lowest drag at most speeds; a cone does well above Mach 1. The Shape parameter, where shown, fine-tunes the shape.",
    param:
      "Fine-tunes the shape.\n\nOgive: 1 is a tangent ogive, 0 is a cone.\nPower series: 1 is a cone; smaller values are blunter.\nParabolic: 0 is a cone, 1 is a full parabola.\nHaack series: 0 is von Kármán (LD-Haack), 1/3 is LV-Haack.",
    len:
      {
        nose: "Length of the nose cone, not including its shoulder.",
        tube: "Length of the tube.",
        transition: "Length of the transition, not including its shoulders.",
        mount: "Length of the motor mount tube.",
        inner: "Length of the inner tube.",
        ring: "Thickness of the ring along the rocket’s axis.",
        bulkhead: "Thickness of the bulkhead along the rocket’s axis.",
        coupler: "Length of the coupler.",
        lug: "Length of the launch lug.",
        streamer: "Length of the streamer.",
        mass: "Length of the item along the rocket, used to place its balance point.",
      }[t] || "Length along the rocket’s axis.",
    dia:
      t === "chute"
        ? "Canopy diameter as given by the maker (the flat diameter for flat chutes)."
        : "Diameter of the nose cone’s base, normally the airframe’s outside diameter.",
    filled:
      "Tick for a solid nose cone (for example wood or foam). Otherwise it’s hollow, with the wall thickness given.",
    wall:
      t === "mount"
        ? "Wall thickness of the motor mount tube, used for its weight."
        : "Wall thickness, used for the part’s weight.",
    shLen: "Length of the shoulder that slides into the airframe. It adds weight but no drag.",
    sh1Len: "Length of the shoulder at the front of the transition. It adds weight but no drag.",
    sh2Len: "Length of the shoulder at the back of the transition. It adds weight but no drag.",
    dia1: "Diameter at the front of the transition.",
    dia2: "Diameter at the back of the transition.",
    mat:
      F.kind === "surf"
        ? "Fabric of the canopy or streamer, which sets its weight from its size."
        : F.kind === "line"
          ? "Shock cord material, which sets its weight from its length."
          : "The material, which sets the part’s weight from its size.",
    od:
      {
        tube: "Outside diameter of the tube.",
        mount: "Outside diameter of the motor mount tube.",
        inner: "Outside diameter of the inner tube.",
        lug: "Outside diameter of the launch lug.",
        ring: "Outside diameter of the centering ring.\n\n0 makes it fit inside the tube it sits in.",
        bulkhead: "Diameter of the bulkhead.\n\n0 makes it fit inside the tube it sits in.",
        coupler: "Outside diameter of the coupler.\n\n0 makes it fit inside the tube it sits in.",
      }[t] || "Outside diameter.",
    id_:
      t === "ring"
        ? "Diameter of the centering ring’s hole.\n\n0 makes it fit around the motor mount."
        : "Inside diameter of the launch lug.",
    isMount:
      "Tick when the motor fits directly in this airframe tube with no separate mount (a minimum-diameter rocket).",
    mmDelay:
      "The motor’s ejection delay, in seconds after burnout.\n\nLeave it blank for a plugged motor with no ejection charge (when an altimeter handles deployment).",
    delay:
      t === "mount"
        ? "The motor’s ejection delay, in seconds after burnout.\n\nLeave it blank for a plugged motor with no ejection charge (when an altimeter handles deployment)."
        : F.p && F.p.deploy === "launch"
          ? "Seconds after liftoff when it opens."
          : "Seconds after apogee when it opens. 0 opens it at apogee.",
    mmOverhang: "How far the motor sticks out past the aft end of the tube.",
    overhang: "How far the motor sticks out past the aft end of the mount.",
    n: t === "buttons" ? "How many rail buttons." : "Number of fins in this set, spaced evenly around the body.",
    root: "Length of the fin where it joins the body.",
    tip: "Length of the fin’s outer edge.",
    span: "Height of the fin from the body to its tip.",
    sweep:
      "How far the tip’s leading edge sits behind the root’s leading edge. 0 gives a straight leading edge at right angles to the body.",
    t: "Thickness of the fins.",
    edge: "Shape of the fin in cross-section. Square: flat sides, square edges. Rounded: edges sanded round. Airfoil: a streamlined section. Beveled: a flat fin with its leading and trailing edges tapered to a sharp edge. Double wedge: a diamond section, thickest in the middle. Rounded and sharp edges have less drag than square ones, and above Mach 1 sharp edges (airfoil, beveled, double wedge) also keep more of their lift; the app counts square and rounded fins cautiously there. Saved .ork files record beveled and double-wedge fins as airfoil for OpenRocket, and this app keeps the exact type.",
    cant: "Angle each fin is twisted to spin the rocket, in degrees. 0 for straight fins.",
    pts: `The fin outline as x, y pairs in ${LU}, one pair per line. x runs aft along the root and y outward from the body; the root lies along y = 0.\n\nStart at the root’s leading edge (0, 0) and go round the outline.`,
    pos: `Where this part sits, measured from the front or the aft end of ${F.parent ? "the " + F.parent.name : "the body"}. Choose which end in the box on the left.`,
    size: "Standard motor diameter this mount holds. It sets the mount tube’s inside size.",
    cluster: "How many motors this mount holds and how they’re arranged.",
    sep: "Distance between the rail buttons.",
    cd: "Drag coefficient of the canopy: about 0.8 for flat chutes and 1.5 for dome or toroidal chutes. Use the maker’s figure if it gives one.",
    deploy:
      "When it opens: at apogee, by the motor’s ejection charge, at a set altitude on the way down (usually the main), or on a timer after liftoff.",
    alt: "Height above the pad where it opens on the way down.",
    lines: "Number of shroud lines, used for the weight.",
    packLen: "Length of the packed chute, streamer or cord inside the airframe, used for its weight and balance point.",
    width: "Width of the streamer.",
    cordLen: "Length of the shock cord.",
    mass: "Weight of this item, such as an altimeter, battery, ballast or payload.",
  };
  if (k === "inertia") return T.dryInertia;
  if (k === "known" && !t && two)
    return "This stage’s weight ready to fly but without its motor, if you’ve weighed it. It replaces the total its parts add up to.\n\n0 uses the parts.";
  return T[k] || "";
}
document.addEventListener(
  "click",
  (e) => {
    const b = e.target.closest(".ib");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    document.getElementById("infottl").textContent = b.dataset.title || "";
    document.getElementById("infotxt").textContent = b.dataset.info || "";
    const m = document.getElementById("infobox");
    m.hidden = false;
    document.getElementById("infook").focus();
  },
  true,
);
(function () {
  const m = () => document.getElementById("infobox");
  document.addEventListener("click", (e) => {
    if (e.target.id === "infook" || e.target === m()) m().hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && m() && !m().hidden) m().hidden = true;
  });
})();
/**
 * Draws every quick-form group from FIELDS with the current values and units, and the notes that go with them.
 */
function renderForms() {
  if (typeof mtSummary === "function") setTimeout(mtSummary, 0);
  try {
    bpRender();
  } catch (e) {}
  renderSegNote();
  renderInertiaNote();
  renderStageUI();
  renderTitle();
  const rn = document.getElementById("recnote");
  renderRecNote();
  for (const [gid, list] of Object.entries(FIELDS)) {
    const g = document.getElementById(gid);
    g.innerHTML = "";
    for (const [k, label, dim, obj, decOverride, opts] of list) {
      const O = obj === "L" ? L : D,
        id = "f-" + k;
      const wrap = document.createElement("div");
      wrap.className = "fld";
      const single = D.recovery === "single";
      const off =
        (single && ["drogueDia", "drogueCd", "mainAlt"].includes(k)) ||
        (L.railMode !== "fixed" && k === "railDir") ||
        (!D.twoStage && k === "stageDelay") ||
        (D.bRecovery !== "chute" && ["bChuteDia", "bChuteCd"].includes(k));
      const lab =
        k === "deployDelay"
          ? {
              apogee: "Delay after apogee (0 = at apogee)",
              motor: "Motor ejection delay after burnout",
              timer: "Time after liftoff",
            }[D.deployMode || "apogee"]
          : single && k === "mainDia"
            ? "Parachute diameter"
            : single && k === "mainCd"
              ? "Parachute Cd"
              : (D.twoStage && SUS_LABELS[k]) || label;
      if (off) wrap.classList.add("off");
      let html = `<div class="lh"><label for="${id}">${lab}</label>${infoBtn(lab, fieldInfo(k))}</div><div class="in">`;
      if (dim === "sel") {
        let o2 = opts;
        if (k === "railPreset" && !((D.buttons || []).length || (D.lugs || []).length))
          o2 = opts.filter((o) => o[0] !== "custom");
        if (k === "finish" && !opts.some((o) => Math.abs(+o[0] - D.finish) < 1e-12))
          o2 = [...opts, [String(D.finish), `From file (${+(D.finish * 1e6).toFixed(1)} µm)`]];
        if (k === "mountSel" || k === "bMountSel") o2 = mountOptions(k === "bMountSel");
        if (k === "noseShape" && !opts.some((o) => o[0] === String(D.noseShape))) {
          const ns = noseSpec(D);
          o2 = [...opts, [String(D.noseShape), `From file (${ns.shape}, ${ns.param})`]];
        }
        html +=
          `<select id="${id}">` +
          o2.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("") +
          `</select>`;
      } else {
        // pressure and humidity left unset show blank (standard air, dry) rather than a 0 that reads like a measurement
        const blank = (k === "pressure" || k === "humidity") && !(O[k] > 0),
          ph = k === "pressure" ? "Standard" : k === "humidity" || k === "dewC" ? "Not set" : "";
        const val =
          O[k] == null || blank
            ? ""
            : dim === "int"
              ? O[k]
              : +toDisp(O[k], dim).toFixed(
                  decOverride ??
                    (dim === "temp"
                      ? 1
                      : Math.max(DIMS[units][dim]?.[2] ?? 2, dim === "len" && units === "imp" ? 2 : 0)),
                );
        html +=
          `<input id="${id}" type="number" inputmode="decimal" step="any" value="${val}"${ph ? ` placeholder="${ph}"` : ""}>` +
          (dim !== "int" && uname(dim) ? `<span class="u">${uname(dim)}</span>` : "");
      }
      wrap.innerHTML = html + "</div>";
      g.appendChild(wrap);
      const el = wrap.querySelector("input,select");
      if (off) el.disabled = true;
      if (dim === "sel") {
        const cur = String(O[k]);
        const match = [...el.options].find(
          (o) =>
            o.value === cur ||
            (o.value !== "" && !isNaN(+o.value) && !isNaN(+cur) && Math.abs(+o.value - +cur) < 1e-12),
        );
        if (match) el.value = match.value;
        el.addEventListener("change", () => {
          if (RANGE_KEYS.includes(k)) {
            L[k] = el.value;
            store.set("rfs-launch", L);
            el.dataset.shown = el.value;
            renderRSO();
            siteRender();
            return;
          }
          O[k] =
            k === "twoStage" || k === "clusterFail"
              ? el.value === "true"
              : isNaN(+el.value) || k === "railPreset"
                ? el.value
                : +el.value;
          if (D.segments && BODY_KEYS.includes(k)) {
            D.segments = null;
            renderSegNote();
          }
          if (k === "twoStage") {
            if (D.twoStage && !D.bSegments) D.bDiameter = D.diameter;
            motorTarget = "sustainer";
          }
          if (k === "recovery" || k === "twoStage" || k === "bRecovery" || k === "railMode" || k === "deployMode")
            renderForms();
          if (k === "finish") {
            D.finFinish = null;
            if (D.segments)
              D.segments.forEach((sg) => {
                delete sg.rs;
              });
          }
          if (k === "mountSel" || k === "bMountSel") {
            motorTarget = k === "bMountSel" ? "booster" : "sustainer";
            mountFilter();
            renderMotors();
            renderMountNote();
          }
          changed();
        });
      } else {
        el.addEventListener("input", () => {
          const v = parseFloat(el.value);
          if (el.value.trim() === "" && ["pressure", "humidity", "dewC"].includes(k)) {
            O[k] = k === "dewC" ? null : 0;
            el.dataset.shown = "";
            changed();
            return;
          } // cleared: back to standard air
          if (!isFinite(v)) return;
          O[k] = dim === "int" ? Math.max(1, Math.round(v)) : fromDisp(v, dim);
          // the dispersion spreads don't change the flight itself: keep the results, just remember the setting
          if (RANGE_KEYS.includes(k)) {
            store.set("rfs-launch", L);
            el.dataset.shown = el.value;
            renderRSO();
            siteRender();
            return;
          }
          if (["finRoot", "finTip", "finSpan", "finSweep"].includes(k)) D.finPts = null;
          if (["bFinRoot", "bFinTip", "bFinSpan", "bFinSweep"].includes(k)) D.bFinPts = null;
          if (D.segments && BODY_KEYS.includes(k)) {
            D.segments = null;
            D.mountAft = null;
            renderSegNote();
          }
          if (D.bSegments && B_BODY_KEYS.includes(k)) {
            D.bSegments = null;
            D.bMountAft = null;
          }
          if (k === "dryInertia") {
            D.inertiaMass = D.dryMass;
            D.inertiaSource = "manual";
          }
          if (k === "bDryInertia") {
            D.bInertiaMass = D.bDryMass;
            D.bInertiaSource = "manual";
          }
          changed();
        });
        if (k === "tailDia" && !(D.tailLen > 0)) wrap.style.opacity = ".55";
      }
      el.dataset.shown = el.value;
    }
  }
  renderExtraFins();
  renderSavePanel();
  renderMountNote();
  if (typeof renderAloft === "function") renderAloft();
  {
    const sp = document.getElementById("stagelockpanel");
    if (sp) sp.hidden = !D.twoStage;
  }
}
