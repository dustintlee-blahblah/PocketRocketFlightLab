// RASAero II import test: opens two made-up .CDX1 designs (a single-stage rocket and the same rocket on a booster)
// in the built app and checks what the reader made of them against the numbers in the files: lengths, fins, nose
// tip, the launch weight and CG with the motor loaded (also with a motor that isn't in the motor list, until it's
// uploaded), the boundary layer and wind settings RASAero flies, the nozzle exit diameters, staging delays, recovery, the launch
// site, RASAero's own apogee as the reference, and that the design is saved as an .ork, never over the .CDX1.
// usage: node tests/rasaero.js [page.html]     (default page: web/pocket-rocket-flight-lab.html)
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const IN = 0.0254,
  FT = 0.3048,
  LB = 0.45359237;
const fin = (loc) =>
  `<Fin><Count>3</Count><Chord>6</Chord><Span>3</Span><SweepDistance>4</SweepDistance><TipChord>2</TipChord><Thickness>0.125</Thickness><LERadius>0.02</LERadius><Location>${loc}</Location><AirfoilSection>Hexagonal</AirfoilSection><FX1>0.5</FX1><FX3>0.75</FX3></Fin>`;
const guides =
  "<LaunchLugDiameter>0</LaunchLugDiameter><LaunchLugLength>0</LaunchLugLength><RailGuideDiameter>0.5</RailGuideDiameter><RailGuideHeight>0.5</RailGuideHeight><LaunchShoeArea>0</LaunchShoeArea>";
/**
 * A made-up RASAero II file: a 3 in. rocket, 54 in. long with its boattail, and (booster: true) a 4 in. booster.
 */
const cdx = (booster, engine = "J350W  (AT)") => `<RASAeroDocument><FileVersion>2</FileVersion><RocketDesign>
<NoseCone><PartType>NoseCone</PartType><Length>12</Length><Diameter>3</Diameter><Shape>Tangent Ogive</Shape><BluntRadius>0.1</BluntRadius><Location>0</Location></NoseCone>
<BodyTube><PartType>BodyTube</PartType><Length>40</Length><Diameter>3</Diameter>${guides}<Location>12</Location><BoattailLength>2</BoattailLength><BoattailRearDiameter>2.5</BoattailRearDiameter><BoattailOffset>0</BoattailOffset><Overhang>0</Overhang>${fin(7)}</BodyTube>
<BoatTail><PartType>BoatTail</PartType><Length>2</Length><Diameter>3</Diameter><RearDiameter>2.5</RearDiameter><Location>52</Location></BoatTail>
${booster ? `<Booster><PartType>Booster</PartType><Length>30</Length><Diameter>4</Diameter><InsideDiameter>3</InsideDiameter>${guides}<Location>52</Location><ShoulderLength>3</ShoulderLength><NozzleExitDiameter>0</NozzleExitDiameter>${fin(6)}</Booster>` : ""}
<Surface>Smooth Paint</Surface><CP>0</CP><ModifiedBarrowman>False</ModifiedBarrowman><Turbulence>False</Turbulence></RocketDesign>
<LaunchSite><Altitude>2000</Altitude><Pressure>0</Pressure><RodAngle>3</RodAngle><RodLength>10</RodLength><Temperature>59</Temperature><WindSpeed>5</WindSpeed></LaunchSite>
<Recovery><Altitude1>1000</Altitude1><Altitude2>700</Altitude2><DeviceType1>Parachute</DeviceType1><DeviceType2>Parachute</DeviceType2><Event1>True</Event1><Event2>True</Event2><Size1>12</Size1><Size2>48</Size2><EventType1>Apogee</EventType1><EventType2>Altitude</EventType2><CD1>1.2</CD1><CD2>1.5</CD2></Recovery>
<SimulationList><Simulation><SustainerEngine>${engine}</SustainerEngine><SustainerLaunchWt>8</SustainerLaunchWt><SustainerNozzleDiameter>0.75</SustainerNozzleDiameter><SustainerCG>34</SustainerCG><SustainerIgnitionDelay>2</SustainerIgnitionDelay>
${booster ? "<Booster1Engine>K550W  (AT)</Booster1Engine><Booster1LaunchWt>20</Booster1LaunchWt><Booster1SeparationDelay>1</Booster1SeparationDelay><Booster1IgnitionDelay>0</Booster1IgnitionDelay><Booster1CG>50</Booster1CG><Booster1NozzleDiameter>1.25</Booster1NozzleDiameter><IncludeBooster1>True</IncludeBooster1>" : "<IncludeBooster1>False</IncludeBooster1>"}
<IncludeBooster2>False</IncludeBooster2><MaxAltitude>5000</MaxAltitude></Simulation></SimulationList></RASAeroDocument>`;

(async () => {
  const file = process.argv[2] || path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html");
  const browser = await chromium.launch();
  const fails = [];
  let checks = 0;
  const near = (what, got, want, tol = 1e-3) => {
    checks++;
    if (!(Math.abs(got - want) <= tol * Math.max(1, Math.abs(want)))) fails.push(`${what}: ${got}, expected ${want}`);
  };
  const same = (what, got, want) => {
    checks++;
    if (got !== want) fails.push(`${what}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  };
  for (const booster of [false, true]) {
    const p = await browser.newPage();
    p.on("pageerror", (e) => fails.push("pageerror: " + e.message));
    await p.route(/^https?:/, (r) => r.abort());
    await p.addInitScript(() => {
      window.PR_EXPOSE = true;
      window.PR_NO_ASK = true;
      localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    });
    await p.goto("file://" + path.resolve(file));
    await p.waitForTimeout(1000);
    const r = await p.evaluate(async (xml) => {
      const runs = designRuns(xml, null);
      const ok = await loadDesignXml(xml, "Test rocket.CDX1", null, {
        pick: { kind: "run", i: 0, cfg: null, name: runs[0].name },
      });
      await new Promise((res) => setTimeout(res, 300));
      const m = findMotor(motorId),
        mb = D.twoStage ? findMotor(boostId) : null,
        R = simulate(D, { ...L, turb: 0 }, m, mb);
      const nose = BLD.stages[0].parts.find((q) => q.type === "nose");
      return {
        ok,
        runs: runs.map((x) => [x.motors, x.apogee]),
        D: JSON.parse(JSON.stringify(D)),
        L: { elev: L.elev, rail: L.rail, angle: L.angle, wind: L.wind, tempC: L.tempC, windProfile: L.windProfile },
        m: { name: m.name, mass: m.totalMass, len: m.len },
        mb: mb && { name: mb.name, mass: mb.totalMass, len: mb.len },
        liftMass: R.st.liftMass,
        apogee: R.st.maxAlt,
        staged: !!R.st.staged,
        source: { format: SOURCE.format, name: SOURCE.name },
        save: document.getElementById("savefile").textContent,
        note: document.getElementById("rktnote").hidden ? "" : document.getElementById("rktnote").textContent,
        tip: nose && nose.tipR,
        mounts: BLD.stages.map((st) => bldMounts(st)[0] && bldMounts(st)[0].motor),
        stages: BLD.stages.length,
        fin: [BLD.settings.finish, BLD.settings.finishUm],
        ler: BLD.stages[0].parts.flatMap((q) => q.kids || []).find((k) => k.type === "fins").ler,
        lerSaved: +(bldToOrk(BLD, L).match(/<prflleradius>([^<]+)</) || [0, 0])[1],
      };
    }, cdx(booster));
    await p.close();
    const t = booster ? "two-stage" : "single-stage",
      D = r.D;
    same(`${t}: opened`, r.ok !== false, true);
    same(`${t}: its simulation is offered when opening`, r.runs[0][0], booster ? "K550W + J350W" : "J350W");
    near(`${t}: RASAero's apogee offered when opening (m)`, r.runs[0][1], 5000 * FT);
    same(`${t}: file format`, r.source.format, "cdx");
    same(`${t}: file name`, r.source.name, "Test rocket.CDX1");
    same(`${t}: rocket named after the file`, D.name, "Test rocket");
    same(`${t}: saved as an .ork`, r.save, "Save as .ork");
    same(`${t}: says the .CDX1 isn't changed`, /RASAero II file.*\.CDX1 isn’t changed/.test(r.note), true);
    same(`${t}: stages`, r.stages, booster ? 2 : 1);
    same(`${t}: flown as stages`, !!D.twoStage, booster);
    same(`${t}: motor`, r.m.name, "J350W");
    near(`${t}: length (m)`, D.length, 54 * IN);
    near(`${t}: diameter (m)`, D.diameter, 3 * IN);
    near(`${t}: nose length (m)`, D.noseLen, 12 * IN);
    near(`${t}: nose tip radius (m)`, D.noseTip, 0.1 * IN);
    near(`${t}: nose tip radius in the builder (m)`, r.tip, 0.1 * IN);
    same(`${t}: fins`, D.finCount, 3);
    near(`${t}: fin root (m)`, D.finRoot, 6 * IN);
    near(`${t}: fin tip (m)`, D.finTip, 2 * IN);
    near(`${t}: fin span (m)`, D.finSpan, 3 * IN);
    near(`${t}: fin sweep (m)`, D.finSweep, 4 * IN);
    // the root's trailing edge is 1 in. ahead of the tube's aft end, and the 2 in. boattail is behind that
    near(`${t}: fins' trailing edge from the aft end (m)`, D.finAft, 3 * IN);
    same(`${t}: fin section`, D.finEdge, "beveled");
    near(`${t}: fins' leading-edge radius (m)`, D.finLER, 0.02 * IN);
    near(`${t}: leading-edge radius in the builder (m)`, r.ler, 0.02 * IN);
    near(`${t}: leading-edge radius in the saved .ork (m)`, r.lerSaved, 0.02 * IN);
    near(`${t}: fin leading bevel (m)`, D.finBevLE, 0.5 * IN);
    near(`${t}: fin trailing bevel (m)`, D.finBevTE, 0.75 * IN);
    near(`${t}: boattail length (m)`, D.tailLen, 2 * IN);
    near(`${t}: boattail aft diameter (m)`, D.tailDia, 2.5 * IN);
    near(`${t}: surface roughness, RASAero's own for smooth paint (m)`, D.finish, 0.00025 * IN, 1e-9);
    same(`${t}: finish in the builder`, r.fin.join(), "custom,6.35");
    near(`${t}: fins' roughness (m)`, D.finFinish, 0.00025 * IN, 1e-9);
    // the weight and CG in the file are with the motor loaded, its aft end at the rocket's
    near(`${t}: weight without motor (kg)`, D.dryMass, 8 * LB - r.m.mass);
    near(
      `${t}: CG with the motor loaded (m)`,
      (D.dryMass * D.cgEmpty + r.m.mass * (54 * IN - r.m.len / 2)) / (8 * LB),
      34 * IN,
    );
    near(`${t}: sustainer nozzle exit diameter (m)`, D.nozzleDia, 0.75 * IN);
    near(`${t}: nozzle exit diameter kept with the motor in the builder (m)`, r.mounts[0].noz, 0.75 * IN);
    same(`${t}: recovery`, D.recovery, "dual");
    near(`${t}: drogue diameter (m)`, D.drogueDia, 12 * IN);
    near(`${t}: drogue Cd`, D.drogueCd, 1.2);
    near(`${t}: main diameter (m)`, D.mainDia, 48 * IN);
    near(`${t}: main Cd`, D.mainCd, 1.5);
    near(`${t}: main altitude (m)`, D.mainAlt, 700 * FT);
    same(`${t}: chutes open by altimeter, not the motor's charge`, D.deployMode, "apogee");
    near(`${t}: reference apogee (m)`, D.orkApogee, 5000 * FT);
    same(`${t}: reference source`, D.refSource, "RASAero II");
    near(`${t}: site elevation (m)`, r.L.elev, 2000 * FT);
    near(`${t}: rail (m)`, r.L.rail, 10 * FT);
    near(`${t}: rail angle (deg)`, r.L.angle, 3);
    near(`${t}: wind (m/s)`, r.L.wind, 5 * 0.44704);
    near(`${t}: temperature (°C)`, r.L.tempC, 15);
    same(`${t}: wind the same at all heights, as RASAero flies it`, r.L.windProfile, "constant");
    same(`${t}: boundary layer as RASAero's (All Turbulent Flow off)`, D.blMode, "natural");
    near(`${t}: launch weight flown (kg)`, r.liftMass, (booster ? 20 : 8) * LB);
    same(`${t}: flies`, r.apogee > 100, true);
    if (booster) {
      same(`${t}: booster motor`, r.mb.name, "K550W");
      same(`${t}: the stages separate in flight`, r.staged, true);
      // the booster starts at the end of the sustainer's tube; here it follows the 2 in. boattail, shortened by it
      near(`${t}: booster length (m)`, D.bLength, 28 * IN);
      near(`${t}: whole rocket's length (m)`, D.length + D.bLength, 82 * IN);
      near(`${t}: booster diameter (m)`, D.bDiameter, 4 * IN);
      near(`${t}: booster weight without motor (kg)`, D.bDryMass, 20 * LB - 8 * LB - r.mb.mass);
      near(
        `${t}: whole rocket's CG with both motors loaded (m)`,
        (8 * LB * 34 * IN + D.bDryMass * (54 * IN + D.bCg) + r.mb.mass * (82 * IN - r.mb.len / 2)) / (20 * LB),
        50 * IN,
      );
      same(`${t}: booster fins`, D.bFinCount, 3);
      near(`${t}: booster fins' leading-edge radius (m)`, D.bFinLER, 0.02 * IN);
      near(`${t}: booster fin root (m)`, D.bFinRoot, 6 * IN);
      near(`${t}: booster fins' trailing edge at its aft end (m)`, D.bFinAft, 0, 1e-6);
      near(`${t}: booster drops 1 s after burnout (s)`, D.sepDelay, 1);
      near(`${t}: sustainer lights 2 s after that (s)`, D.stageDelay, 3);
      near(`${t}: booster nozzle exit diameter (m)`, D.bNozzleDia, 1.25 * IN);
    }
  }
  // a motor that isn't in the motor list: the file's weight and CG have it in, so the motor flown in its place is
  // taken out until the real one is uploaded, and from then on the numbers stay
  {
    const p = await browser.newPage();
    p.on("pageerror", (e) => fails.push("pageerror: " + e.message));
    await p.route(/^https?:/, (r) => r.abort());
    await p.addInitScript(() => {
      window.PR_EXPOSE = true;
      window.PR_NO_ASK = true;
      localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    });
    await p.goto("file://" + path.resolve(file));
    await p.waitForTimeout(1000);
    const state = () =>
      p.evaluate(() => {
        const m = findMotor(motorId);
        return {
          m: { name: m.name, mass: m.totalMass, len: m.len },
          dry: D.dryMass,
          cg: D.cgEmpty,
          lift: simulate(D, { ...L, turb: 0 }, m, null).st.liftMass,
          pending: !!BLD.stages[0].withMotor,
        };
      });
    const loadedCg = (a) => (a.dry * a.cg + a.m.mass * (54 * IN - a.m.len / 2)) / (8 * LB);
    await p.evaluate(
      async (xml) => {
        await loadDesignXml(xml, "Test rocket.CDX1", null, {
          pick: { kind: "run", i: 0, cfg: null, name: "Simulation 1" },
        });
        await new Promise((res) => setTimeout(res, 300));
      },
      cdx(false, "Z999  (EX)"),
    );
    const a = await state();
    same("unlisted motor: a motor that fits flies in its place", a.m.name !== "Z999", true);
    same("unlisted motor: weight still worked out from the motor flown", a.pending, true);
    near("unlisted motor: weight without motor, the stand-in taken out (kg)", a.dry, 8 * LB - a.m.mass);
    near("unlisted motor: CG with the stand-in loaded (m)", loadedCg(a), 34 * IN);
    near("unlisted motor: launch weight flown (kg)", a.lift, 8 * LB);
    await p.setInputFiles("#engfile", {
      name: "Z999.eng",
      mimeType: "text/plain",
      buffer: Buffer.from("Z999 54 400 P 0.9 1.6 EX\n0.05 900\n1.5 800\n2.0 0\n"),
    });
    await p.waitForTimeout(600);
    const b = await state();
    same("its motor uploaded: it is the motor flown", b.m.name, "Z999");
    same("its motor uploaded: the weight is settled", b.pending, false);
    near("its motor uploaded: weight without motor (kg)", b.dry, 8 * LB - 1.6);
    near("its motor uploaded: CG with it loaded (m)", loadedCg(b), 34 * IN);
    near("its motor uploaded: launch weight flown (kg)", b.lift, 8 * LB);
    // another motor after that: the rocket's own weight doesn't change with it
    await p.evaluate(
      (id) => {
        setMotorId(id);
        bldMotorPicked();
        bldDerive();
      },
      await p.evaluate((nm) => allMotors().find((m) => m.name !== nm && Math.abs(m.dia - 0.054) < 0.001).id, "Z999"),
    );
    const c = await state();
    same("another motor picked: it is the motor flown", c.m.name !== "Z999", true);
    near("another motor picked: weight without motor unchanged (kg)", c.dry, 8 * LB - 1.6);
    near("another motor picked: CG without motor unchanged (m)", c.cg, b.cg);
    await p.close();
  }
  // ---- the other way: a design written as a RASAero II file (Nov 27, 2026), read back by the reader above
  {
    const p = await browser.newPage({ viewport: { width: 412, height: 860 } });
    p.on("pageerror", (e) => fails.push("pageerror: " + e.message));
    await p.route(/^https?:/, (r) => r.abort());
    await p.addInitScript(() => {
      window.PR_EXPOSE = true;
      window.PR_NO_ASK = true;
      localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
      sessionStorage.setItem("rfs-splash", "1");
    });
    await p.goto("file://" + path.resolve(file));
    await p.waitForFunction(() => typeof window.openExample === "function");
    // write the open design, read the file back, and compare the outside shape
    const round = (setup) =>
      p.evaluate(async (setup) => {
        const l = document.getElementById("legal");
        if (l) l.hidden = true;
        await openExample(setup.ex);
        if (setup.stage) {
          bldRender();
          if (!document.querySelector('[data-stage="add"]')) document.querySelector(".bldaddtoggle").click();
          document.querySelector('[data-stage="add"]').click();
          setBoostId("a-5f4294d20002e9000000000d");
          bldChanged(true);
        }
        if (setup.transition) {
          const R = BLD.stages[0].parts.find((q) => q.type === "tube").od / 2;
          BLD.stages[0].parts.push(bldNew("transition", R));
          BLD.stages[0].parts.push(bldNew("tube", R * 0.7));
          bldChanged(true);
        }
        if (setup.power) {
          BLD.stages[0].parts.find((q) => q.type === "nose").shape = "power";
          bldChanged(true);
        }
        const shape = () => {
          const A = aero(D);
          return {
            L: D.length,
            d: D.diameter,
            two: !!D.twoStage,
            bL: D.twoStage ? D.bLength : 0,
            segs: bodySegments(D).map((g) => [g.kind, +g.len.toFixed(4), +(2 * g.r2).toFixed(4)]),
            fins: finSetsOf(D).map((f) => [f.n, +f.a.toFixed(4), +f.s.toFixed(4), +f.xLead.toFixed(4), f.edge]),
            area: finSetsOf(D).map((f) => finGeom(f).area),
            cp: cpOf(A),
            guides: (D.buttons || []).length,
            dry: D.dryMass,
            cg: D.cgEmpty,
            bDry: D.twoStage ? D.bDryMass : 0,
            motor: (flightMotor() || {}).name || "",
            brand: (flightMotor() || {}).brand || "",
            boost: D.twoStage ? (flightBoost() || {}).name || "" : "",
            sep: [D.stageDelay || 0, D.sepDelay || 0],
          };
        };
        const before = shape(),
          { text, notes } = designToCdx(D, L, {
            name: BLD.name,
            motor: flightMotor(),
            boost: D.twoStage ? flightBoost() : null,
          });
        const opened = await loadDesignXml(text, "back.CDX1", new TextEncoder().encode(text).buffer, {
          pick: { kind: "saved" },
        });
        return { before, after: shape(), opened, notes, text };
      }, setup);
    for (const ex of [0, 1, 2, 3, 4]) {
      const r = await round({ ex }),
        t = `example ${ex} as a RASAero II file`;
      same(`${t}: it is one, and this app opens it`, r.opened && /^<RASAeroDocument>/.test(r.text), true);
      near(`${t}: length`, r.after.L, r.before.L, 1e-4);
      near(`${t}: diameter`, r.after.d, r.before.d, 1e-4);
      same(`${t}: the body's sections`, JSON.stringify(r.after.segs), JSON.stringify(r.before.segs));
      same(
        `${t}: the fins' count, root, span, place and edges`,
        JSON.stringify(r.after.fins),
        JSON.stringify(r.before.fins),
      );
      near(`${t}: the fins' area`, r.after.area[0], r.before.area[0], 1e-3);
      near(`${t}: center of pressure`, r.after.cp, r.before.cp, 0.01);
      // the flight simulation: written when the motor's maker has a known name in RASAero II's engine list (AeroTech,
      // Cesaroni, Estes and the others in the exporter's table), with the launch weight and CG, and read back as the same rocket on the same motor
      const known = ["AeroTech", "Cesaroni", "AMW", "Estes", "Apogee", "Quest", "Loki", "Gorilla", "Kosdon"].includes(
          r.before.brand,
        ),
        sim = /<SimulationList><Simulation><SustainerEngine>([^<]+)<\/SustainerEngine>/.exec(r.text);
      same(`${t}: a flight simulation is written when the motor's maker is known to RASAero II`, !!sim, known);
      same(
        `${t}: and the notes say which it was`,
        (known ? /A flight simulation was written/ : /No flight simulation was written/).test(r.notes.join(" ")),
        true,
      );
      if (sim) {
        same(
          `${t}: the engine as RASAero II names it`,
          /^\S+ {2}\((AT|CTI|AMW|ES|AP|QU|LR|GM|KBA)\)$/.test(sim[1]),
          true,
        );
        near(`${t}: read back, the weight without the motor`, r.after.dry, r.before.dry, 2e-3);
        near(`${t}: read back, its CG`, r.after.cg, r.before.cg, 5e-3);
        same(`${t}: read back, the motor`, r.after.motor, r.before.motor);
      }
      same(
        `${t}: launch weight and CG are in its comments`,
        /aunch weight [\d.]+ lb, CG [\d.]+ in from the nose tip/.test(r.text),
        true,
      );
    }
    const st = await round({ ex: 2, stage: true });
    same(
      "a two-stage rocket: written with a booster",
      /<Booster>/.test(st.text) && /<UseBooster1>True/.test(st.text),
      true,
    );
    // its simulation flies the booster (seen in RASAero II on Nov 27, 2026: both motors loaded, 1,427 ft): the
    // booster's launch weight and CG there are the whole rocket's
    same(
      "a two-stage rocket: the simulation has both engines and flies the booster",
      /<SustainerEngine>H148R {2}\(AT\)<.*<Booster1Engine>H128W {2}\(AT\)<.*<IncludeBooster1>True</.test(st.text),
      true,
    );
    {
      const g = (tag) => +(new RegExp(`<${tag}>([\\d.]+)<`).exec(st.text) || [])[1],
        LBK = 0.45359237;
      same(
        "a two-stage rocket: the booster's launch weight is the whole rocket's",
        g("Booster1LaunchWt") > g("SustainerLaunchWt") + st.before.bDry / LBK,
        true,
      );
      same(
        "a two-stage rocket: the whole rocket's CG is behind the sustainer's",
        g("Booster1CG") > g("SustainerCG"),
        true,
      );
      same("a two-stage rocket: read back as two stages", st.after.two, true);
      near("a two-stage rocket: read back, the sustainer's weight", st.after.dry, st.before.dry, 2e-3);
      near("a two-stage rocket: read back, the booster's weight", st.after.bDry, st.before.bDry, 5e-3);
      same(
        "a two-stage rocket: read back, both motors",
        [st.after.motor, st.after.boost].join(),
        [st.before.motor, st.before.boost].join(),
      );
    }
    near("a two-stage rocket: the sustainer's length", st.after.L, st.before.L, 1e-4);
    near(
      "a two-stage rocket: the booster's length in the file (inches)",
      +(/<Booster>.*?<Length>([\d.]+)</.exec(st.text) || [])[1],
      st.before.bL / 0.0254,
      1e-3,
    );
    same(
      "a two-stage rocket: the booster starts where the sustainer ends",
      (/<Booster>.*?<Location>([\d.]+)</.exec(st.text) || [])[1],
      String(+(st.before.L / 0.0254).toFixed(4)),
    );
    // a transition as RASAero II writes one itself (seen Nov 27, 2026): Diameter is its rear diameter, as
    // RearDiameter is, and its front is the part ahead's. Written with the front there, RASAero II stops with an error.
    const trn = await round({ ex: 2, transition: true });
    same(
      "a transition: Diameter and RearDiameter are both its rear diameter",
      /<Transition><PartType>Transition<\/PartType><Length>[\d.]+<\/Length><Diameter>([\d.]+)<\/Diameter><Location>[\d.]+<\/Location><RearDiameter>\1<\/RearDiameter>/.test(
        trn.text,
      ),
      true,
    );
    same(
      "a transition: read back with the same sections",
      JSON.stringify(trn.after.segs),
      JSON.stringify(trn.before.segs),
    );
    same(
      "a two-stage rocket: the booster has the fields RASAero II's own files have",
      /<ShoulderLength>0<\/ShoulderLength><Color>Black<\/Color><NozzleExitDiameter>[\d.]+<\/NozzleExitDiameter><BoattailLength>0</.test(
        st.text,
      ),
      true,
    );
    same("pad pressure left to RASAero II's standard", /<Pressure>0<\/Pressure>/.test(st.text), true);
    const pw = await round({ ex: 2, power: true });
    same(
      "a power-series nose: written as Power Law, and its exponent noted",
      /<Shape>Power Law</.test(pw.text) && /exponent/.test(pw.notes.join(" ")),
      true,
    );
    // motor names as RASAero II's engine list has them (each expected name was seen in that list, Nov 27, 2026, or
    // is of the form its maker's names take there); a maker with no known code gets no simulation
    const named = await p.evaluate(() =>
      [
        ["AeroTech", "HP-H45W", "H45", "White Lightning"],
        ["AeroTech", "J570W", "J570", "White Lightning"],
        ["AMW", "GG-54", "I285", "Green Gorilla"],
        ["AMW", "K1075GG", "K1075", ""],
        ["Loki", "HP-G69-SF", "G69", "Spitfire"],
        ["Loki", "H500-LW", "H500", "Loki White"],
        ["Loki", "J712LB", "J712", "Loki Blue"],
        ["Gorilla", "J607WC", "J607", ""],
        ["Kosdon", "I301W", "I301", "White Lightning"],
        ["Cesaroni", "348I204-13A", "I240", "Imax"],
        ["Estes", "A10T", "A10", ""],
        ["Apogee", "C4", "C4", ""],
        ["Ellis Mountain", "J228", "J228", ""],
        ["DEAP EX", "Q18000", "Q18000", ""],
        ["Klima", "D9", "D9", "composite"],
      ].map(([brand, name, cn, prop]) => {
        const { text } = designToCdx(D, L, { motor: { ...flightMotor(), brand, name, cn, prop } });
        return (/<SustainerEngine>([^<]*)</.exec(text) || [])[1] || "";
      }),
    );
    same(
      "motor names as RASAero II lists them, maker by maker",
      named.join("|"),
      [
        "H45W  (AT)",
        "J570W  (AT)",
        "I285GG  (AMW)",
        "K1075GG  (AMW)",
        "G69-SF  (LR)",
        "H500-LW  (LR)",
        "J712-LB  (LR)",
        "J607WC  (GM)",
        "I301W  (KBA)",
        "I240  (CTI)",
        "A10T  (ES)",
        "C4  (AP)",
        "J228  (EM)",
        "Q18000  (DEAP-EX)",
        "",
      ].join("|"),
    );
    // (the Export box that writes these files is checked in tests/export-design.js)
    await p.close();
  }
  await browser.close();
  console.log(fails.length ? fails.join("\n") : "");
  console.log(`${checks} checks, ${fails.length} failed`);
  process.exitCode = fails.length ? 1 : 0;
})();
