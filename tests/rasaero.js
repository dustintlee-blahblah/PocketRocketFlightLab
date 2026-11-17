// RASAero II import test: opens two made-up .CDX1 designs (a single-stage rocket and the same rocket on a booster)
// in the built app and checks what the reader made of them against the numbers in the files: lengths, fins, nose
// tip, the launch weight and CG with the motor loaded, the nozzle exit diameters, staging delays, recovery, the launch
// site, RASAero's own apogee as the reference, and that the design is saved as an .ork, never over the .CDX1.
// usage: node tests/rasaero.js [page.html]     (default page: web/pocket-rocket-flight-lab.html)
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const IN = 0.0254,
  FT = 0.3048,
  LB = 0.45359237;
const fin = (loc) =>
  `<Fin><Count>3</Count><Chord>6</Chord><Span>3</Span><SweepDistance>4</SweepDistance><TipChord>2</TipChord><Thickness>0.125</Thickness><LERadius>0</LERadius><Location>${loc}</Location><AirfoilSection>Hexagonal</AirfoilSection><FX1>0.5</FX1><FX3>0.75</FX3></Fin>`;
const guides =
  "<LaunchLugDiameter>0</LaunchLugDiameter><LaunchLugLength>0</LaunchLugLength><RailGuideDiameter>0.5</RailGuideDiameter><RailGuideHeight>0.5</RailGuideHeight><LaunchShoeArea>0</LaunchShoeArea>";
/**
 * A made-up RASAero II file: a 3 in. rocket, 54 in. long with its boattail, and (booster: true) a 4 in. booster.
 */
const cdx = (booster) => `<RASAeroDocument><FileVersion>2</FileVersion><RocketDesign>
<NoseCone><PartType>NoseCone</PartType><Length>12</Length><Diameter>3</Diameter><Shape>Tangent Ogive</Shape><BluntRadius>0.1</BluntRadius><Location>0</Location></NoseCone>
<BodyTube><PartType>BodyTube</PartType><Length>40</Length><Diameter>3</Diameter>${guides}<Location>12</Location><BoattailLength>2</BoattailLength><BoattailRearDiameter>2.5</BoattailRearDiameter><BoattailOffset>0</BoattailOffset><Overhang>0</Overhang>${fin(7)}</BodyTube>
<BoatTail><PartType>BoatTail</PartType><Length>2</Length><Diameter>3</Diameter><RearDiameter>2.5</RearDiameter><Location>52</Location></BoatTail>
${booster ? `<Booster><PartType>Booster</PartType><Length>30</Length><Diameter>4</Diameter><InsideDiameter>3</InsideDiameter>${guides}<Location>52</Location><ShoulderLength>3</ShoulderLength><NozzleExitDiameter>0</NozzleExitDiameter>${fin(6)}</Booster>` : ""}
<Surface>Smooth Paint</Surface><CP>0</CP><ModifiedBarrowman>False</ModifiedBarrowman><Turbulence>False</Turbulence></RocketDesign>
<LaunchSite><Altitude>2000</Altitude><Pressure>0</Pressure><RodAngle>3</RodAngle><RodLength>10</RodLength><Temperature>59</Temperature><WindSpeed>5</WindSpeed></LaunchSite>
<Recovery><Altitude1>1000</Altitude1><Altitude2>700</Altitude2><DeviceType1>Parachute</DeviceType1><DeviceType2>Parachute</DeviceType2><Event1>True</Event1><Event2>True</Event2><Size1>12</Size1><Size2>48</Size2><EventType1>Apogee</EventType1><EventType2>Altitude</EventType2><CD1>1.2</CD1><CD2>1.5</CD2></Recovery>
<SimulationList><Simulation><SustainerEngine>J350W  (AT)</SustainerEngine><SustainerLaunchWt>8</SustainerLaunchWt><SustainerNozzleDiameter>0.75</SustainerNozzleDiameter><SustainerCG>34</SustainerCG><SustainerIgnitionDelay>2</SustainerIgnitionDelay>
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
        L: { elev: L.elev, rail: L.rail, angle: L.angle, wind: L.wind, tempC: L.tempC },
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
    near(`${t}: fin leading bevel (m)`, D.finBevLE, 0.5 * IN);
    near(`${t}: fin trailing bevel (m)`, D.finBevTE, 0.75 * IN);
    near(`${t}: boattail length (m)`, D.tailLen, 2 * IN);
    near(`${t}: boattail aft diameter (m)`, D.tailDia, 2.5 * IN);
    near(`${t}: surface roughness, the nearest finish to RASAero's 6.4 µm (m)`, D.finish, 5e-6, 1e-9);
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
      near(`${t}: booster fin root (m)`, D.bFinRoot, 6 * IN);
      near(`${t}: booster fins' trailing edge at its aft end (m)`, D.bFinAft, 0, 1e-6);
      near(`${t}: booster drops 1 s after burnout (s)`, D.sepDelay, 1);
      near(`${t}: sustainer lights 2 s after that (s)`, D.stageDelay, 3);
      near(`${t}: booster nozzle exit diameter (m)`, D.bNozzleDia, 1.25 * IN);
    }
  }
  await browser.close();
  console.log(fails.length ? fails.join("\n") : "");
  console.log(`${checks} checks, ${fails.length} failed`);
  process.exitCode = fails.length ? 1 : 0;
})();
