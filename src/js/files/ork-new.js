/* --- a new .ork written from the design (for designs typed in by hand, or to start fresh) --- */
function buildNewOrk() {
  const n = numStr,
    e = (s) =>
      String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const uid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
  const cfg = uid(),
    notes = [],
    fin = FINISH_NAME(D.finish);
  const mat = (t, d, nm) => `<material type="${t}" density="${d}">${nm}</material>`;
  const finXml = (f, name, off) =>
    `<trapezoidfinset><name>${e(name)}</name><axialoffset method="top">${n(off)}</axialoffset><finish>${fin}</finish>${mat("bulk", 680, "Plywood (birch)")}<fincount>${f.n}</fincount><rotation>0.0</rotation><thickness>${n(f.t)}</thickness><crosssection>${stdEdge(f.edge || "square")}</crosssection><cant>0.0</cant><rootchord>${n(f.root)}</rootchord><tipchord>${n(f.tip)}</tipchord><height>${n(f.span)}</height><sweeplength>${n(f.sweep)}</sweeplength></trapezoidfinset>`;
  const motorXml = (m, delay) =>
    `<motor configid="${cfg}"><type>reload</type><manufacturer>${e(m.mfr || m.brand)}</manufacturer><designation>${e(m.name)}</designation><diameter>${n(m.dia)}</diameter><length>${n(m.len)}</length><delay>${delay == null ? "none" : n(delay)}</delay></motor>`;
  const mountXml = (m, overhang, name, ign, delay, ej, off) =>
    `<innertube><name>${e(name)}</name><axialoffset method="bottom">${n(off || 0)}</axialoffset>${mat("bulk", 680, "Cardboard")}<length>${n(Math.max(m.len - overhang, 0.02))}</length><radialposition>0.0</radialposition><radialdirection>0.0</radialdirection><outerradius>${n(m.dia / 2 + 0.0008)}</outerradius><thickness>0.0008</thickness><clusterconfiguration>single</clusterconfiguration><clusterscale>1.0</clusterscale><clusterrotation>0.0</clusterrotation><motormount><ignitionevent>${ign}</ignitionevent><ignitiondelay>${n(delay)}</ignitiondelay><overhang>${n(overhang)}</overhang>${motorXml(m, ej)}</motormount><subcomponents/></innertube>`;
  const chuteXml = (name, d, cd, ev, alt, dd) =>
    `<parachute><name>${e(name)}</name><axialoffset method="top">0.0</axialoffset><packedlength>0.1</packedlength><packedradius>${n(D.diameter * 0.4)}</packedradius><radialposition>0.0</radialposition><radialdirection>0.0</radialdirection><cd>${n(cd)}</cd>${mat("surface", 0.067, "Ripstop nylon")}<deployevent>${ev}</deployevent><deployaltitude>${n(alt)}</deployaltitude><deploydelay>${n(dd)}</deploydelay><diameter>${n(d)}</diameter><linecount>6</linecount><linelength>${n(d)}</linelength><linematerial type="line" density="0.0013">Elastic cord (flat 6 mm, 1/4 in)</linematerial></parachute>`;
  const override = (m, cg) =>
    `<overridemass>${n(m)}</overridemass><overridesubcomponentsmass>true</overridesubcomponentsmass><overridecg>${n(cg)}</overridecg><overridesubcomponentscg>true</overridesubcomponentscg>`;
  // body parts from front to back (the file's own sections when the design came from one)
  const bodyParts = (segs, len, R, nose, tail) => {
    if (segs && segs.length) return segs.map((s) => ({ ...s }));
    const out = [];
    let x = 0;
    if (nose) {
      const [shape, p] = String(D.noseShape).split(":");
      out.push({ kind: "nose", x: 0, len: D.noseLen, r1: 0, r2: R, shape, param: parseFloat(p) || 0 });
      x = D.noseLen;
    }
    const tl = tail && D.tailLen > 0 ? D.tailLen : 0;
    out.push({ kind: "tube", x, len: Math.max(len - x - tl, 0.01), r1: R, r2: R });
    if (tl) out.push({ kind: "trans", x: len - tl, len: tl, r1: R, r2: D.tailDia / 2, shape: "conical", param: 0 });
    return out;
  };
  const guideXml = (btns, lugs) => [
    ...(btns || []).map((b) => ({
      x: b.x,
      xml: (off) =>
        `<railbutton><name>Rail button</name><axialoffset method="top">${n(off)}</axialoffset><outerdiameter>${n(b.od)}</outerdiameter><innerdiameter>${n(b.id)}</innerdiameter><height>${n(b.h)}</height><baseheight>${n(Math.max(b.h - b.ih, 0) / 2)}</baseheight><flangeheight>${n(Math.max(b.h - b.ih, 0) / 2)}</flangeheight><instancecount>1</instancecount><instanceseparation>0.0</instanceseparation>${mat("bulk", 1100, "Delrin")}</railbutton>`,
    })),
    ...(lugs || []).map((l) => ({
      x: l.x,
      xml: (off) =>
        `<launchlug><name>Launch lug</name><axialoffset method="top">${n(off)}</axialoffset>${mat("bulk", 680, "Cardboard")}<radius>${n(l.ro)}</radius><thickness>${n(Math.max(l.ro - l.ri, 1e-4))}</thickness><length>${n(l.len)}</length><instancecount>${l.n || 1}</instancecount><instanceseparation>0.0</instanceseparation></launchlug>`,
    })),
  ];
  const stageXml = (name, parts, fins, inner, chutes, ovr, extra, guides) => {
    const tubes = parts.filter((p) => p.kind === "tube");
    const tubeFor = (x) => tubes.find((t) => x >= t.x - 1e-6 && x < t.x + t.len) || tubes[tubes.length - 1];
    const kidsOf = new Map(tubes.map((t) => [t, []]));
    for (const f of fins) {
      const t = tubeFor(f.x);
      kidsOf.get(t).push(finXml(f, f.name, f.x - t.x));
    }
    for (const g of guides || []) {
      const t = tubeFor(g.x);
      if (t) kidsOf.get(t).push(g.xml(g.x - t.x));
    }
    if (tubes.length) {
      kidsOf.get(tubes[0]).push(...chutes);
      const aft = tubes[tubes.length - 1],
        end = parts[parts.length - 1].x + parts[parts.length - 1].len;
      kidsOf
        .get(aft)
        .push(
          ...inner.map((s) =>
            s.replace(
              /<axialoffset method="bottom">[^<]*</,
              `<axialoffset method="bottom">${n(end - (aft.x + aft.len))}<`,
            ),
          ),
        );
    }
    let seq = "",
      prevR = 0;
    for (const p of parts) {
      if (p.kind === "nose")
        seq += `<nosecone><name>Nose cone</name><finish>${fin}</finish>${mat("bulk", 1050, "Plastic")}<length>${n(p.len)}</length><thickness>0.002</thickness><shape>${p.shape || "ogive"}</shape><shapeclipped>false</shapeclipped><shapeparameter>${n(p.param || 0)}</shapeparameter><aftradius>${n(p.r2)}</aftradius><aftshoulderradius>${n(Math.max(p.r2 - 0.002, 0))}</aftshoulderradius><aftshoulderlength>${n(p.r2 * 2)}</aftshoulderlength><aftshoulderthickness>0.002</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped><subcomponents/></nosecone>`;
      else if (p.kind === "tube")
        seq += `<bodytube><name>Body tube</name><finish>${fin}</finish>${mat("bulk", 1250, "Fiberglass")}<length>${n(p.len)}</length><thickness>0.0015</thickness><radius>${n(p.r1)}</radius><subcomponents>${kidsOf.get(p).join("")}</subcomponents></bodytube>`;
      else
        seq += `<transition><name>Transition</name><finish>${fin}</finish>${mat("bulk", 1050, "Plastic")}<length>${n(p.len)}</length><thickness>0.002</thickness><shape>${p.shape || "conical"}</shape><shapeclipped>false</shapeclipped><shapeparameter>${n(p.param || 0)}</shapeparameter><foreradius>${n(p.r1)}</foreradius><aftradius>${n(p.r2)}</aftradius><foreshoulderradius>0.0</foreshoulderradius><foreshoulderlength>0.0</foreshoulderlength><foreshoulderthickness>0.0</foreshoulderthickness><foreshouldercapped>false</foreshouldercapped><aftshoulderradius>0.0</aftshoulderradius><aftshoulderlength>0.0</aftshoulderlength><aftshoulderthickness>0.0</aftshoulderthickness><aftshouldercapped>false</aftshouldercapped><subcomponents/></transition>`;
      prevR = p.r2;
    }
    if (!tubes.length)
      notes.push(`${name}: the body has no straight tube, so fins, chutes and the motor mount couldn’t be placed.`);
    return `<stage><name>${e(name)}</name>${ovr}${extra || ""}<subcomponents>${seq}</subcomponents></stage>`;
  };
  const two = !!D.twoStage,
    m = curMotor(),
    dm = D.deployMode || "apogee";
  // sustainer (or the only stage)
  const sParts = bodyParts(D.segments, D.length, D.diameter / 2, true, true);
  const sFins = [
    { ...mainOf0(false), x: D.length - D.finAft - D.finRoot, name: "Fins" },
    ...(D.extraFins || []).map((f, i) => ({ ...f, x: f.pos, name: `Fin set ${i + 2}` })),
  ];
  const ej = D.ejDelay != null ? Math.max(0, D.ejDelay) : null; // the motor's delay (Motor tab)
  const sInner = [
    mountXml(m, D.motorOverhang || 0, "Motor mount", two ? "burnout" : "automatic", two ? D.stageDelay || 0 : 0, ej),
  ];
  for (const x of D.extraMotors || []) {
    const xm = findMotor(x.id);
    if (!xm) continue;
    for (let i = 0; i < Math.max(1, x.n || 1); i++)
      sInner.push(
        mountXml(
          xm,
          D.motorOverhang || 0,
          "Cluster motor mount",
          two ? "burnout" : "automatic",
          two ? D.stageDelay || 0 : 0,
          ej,
        ),
      );
  }
  const firstEv = dm === "motor" ? "ejection" : dm === "timer" ? "launch" : "apogee",
    firstDd = dm === "motor" ? 0 : Math.max(0, D.deployDelay || 0);
  const sChutes =
    D.recovery === "dual"
      ? [
          ...(D.drogueDia > 0 ? [chuteXml("Drogue", D.drogueDia, D.drogueCd, firstEv, 0, firstDd)] : []),
          chuteXml("Main", D.mainDia, D.mainCd, "altitude", D.mainAlt, 0),
        ]
      : [chuteXml("Parachute", D.mainDia, D.mainCd, firstEv, 0, firstDd)];
  const cdo =
    D.cdOverride > 0
      ? `<overridecd>${n(D.cdOverride)}</overridecd><overridesubcomponentscd>true</overridesubcomponentscd>`
      : "";
  const custom = D.railPreset === "custom";
  let stages = stageXml(
    two ? "Sustainer" : "Stage",
    sParts,
    sFins,
    sInner,
    sChutes,
    override(D.dryMass, D.cgEmpty) + cdo,
    "",
    custom ? guideXml(D.buttons, D.lugs) : [],
  );
  if (two) {
    const b = curBoost(),
      bp = bodyParts(D.bSegments, D.bLength, D.bDiameter / 2, false, false);
    const bFins = [
      { ...mainOf0(true), x: D.bLength - D.bFinAft - D.bFinRoot, name: "Booster fins" },
      ...(D.bExtraFins || []).map((f, i) => ({ ...f, x: f.pos, name: `Booster fin set ${i + 2}` })),
    ];
    const bInner = [mountXml(b, D.bOverhang || 0, "Booster motor mount", "automatic", 0, null)];
    for (const x of D.bExtraMotors || []) {
      const xm = findMotor(x.id);
      if (!xm) continue;
      for (let i = 0; i < Math.max(1, x.n || 1); i++)
        bInner.push(mountXml(xm, D.bOverhang || 0, "Booster cluster mount", "automatic", 0, null));
    }
    const bCh = D.bRecovery === "chute" ? [chuteXml("Booster chute", D.bChuteDia, D.bChuteCd, "apogee", 0, 0)] : [];
    stages += stageXml(
      "Booster",
      bp,
      bFins,
      bInner,
      bCh,
      override(D.bDryMass, D.bCg),
      `<separationevent>burnout</separationevent><separationdelay>0.0</separationdelay>`,
      custom ? guideXml(D.bButtons, D.bLugs) : [],
    );
  }
  const cond = `<conditions><configid>${cfg}</configid><launchrodlength>${n(L.rail)}</launchrodlength><launchintowind>${L.railMode !== "fixed"}</launchintowind><launchrodangle>${n(L.angle)}</launchrodangle><launchroddirection>${n(L.railMode === "fixed" ? L.railDir : 90)}</launchroddirection><windaverage>${n(L.wind)}</windaverage><windturbulence>${n(L.turb || 0)}</windturbulence><winddirection>${n(((L.windDir || 0) * Math.PI) / 180)}</winddirection><wind model="average"><speed>${n(L.wind)}</speed><direction>${n(((L.windDir || 0) * Math.PI) / 180)}</direction><standarddeviation>${n(L.wind * (L.turb || 0))}</standarddeviation></wind><windmodeltype>Average</windmodeltype><launchaltitude>${n(L.elev)}</launchaltitude><launchlatitude>${n(L.lat ?? 40)}</launchlatitude><launchlongitude>${n(L.lon ?? -80.6)}</launchlongitude><geodeticmethod>flat</geodeticmethod><atmosphere model="extendedisa"><basetemperature>${n(L.tempC + 273.15)}</basetemperature><basepressure>${n(101325 * Math.pow(Math.max(1 - 2.25577e-5 * L.elev, 0.01), 5.25588))}</basepressure></atmosphere><timestep>0.05</timestep><maxtime>1200.0</maxtime></conditions>`;
  if (D.railPreset !== "none" && !custom)
    notes.push(
      "The rail-button preset isn’t written to the new file; add the buttons in OpenRocket if you need their drag there.",
    );
  if (D.otherCd > 0) notes.push("The extra drag (ΔCd) isn’t written to the new file.");
  if (D.dryInertia > 0) notes.push("OpenRocket has no turning-inertia setting, so the inertia isn’t written.");
  const xml = `<?xml version='1.0' encoding='utf-8'?>\n<openrocket version="1.9" creator="Pocket Rocket Flight Lab"><rocket><name>${e(D.name)}</name><motorconfiguration configid="${cfg}" default="true"/><referencetype>maximum</referencetype><subcomponents>${stages}</subcomponents></rocket><simulations><simulation status="outdated"><name>Simulation 1</name><simulator>RK4Simulator</simulator><calculator>BarrowmanCalculator</calculator>${cond}</simulation></simulations></openrocket>`;
  return { text: xml, notes };
}
function mainOf0(b) {
  return b
    ? {
        n: D.bFinCount,
        root: D.bFinRoot,
        tip: D.bFinTip,
        span: D.bFinSpan,
        sweep: D.bFinSweep,
        t: D.bFinThick,
        edge: D.bFinEdge,
      }
    : {
        n: D.finCount,
        root: D.finRoot,
        tip: D.finTip,
        span: D.finSpan,
        sweep: D.finSweep,
        t: D.finThick,
        edge: D.finEdge,
      };
}
