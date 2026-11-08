// Flies the simulations stored in OpenRocket design files with OpenRocket's own engine (headless), for comparing
// the app's predictions with OpenRocket's. Prints one JSON line per simulation:
//   {"file":..., "sim":1, "name":..., "apogee":m, "maxVelocity":m/s, "maxMach":..., "impulse":N*s,
//    "deployedBeforeApogee":true|false, "extensions":n}
// impulse: the total impulse of every motor that fires; deployedBeforeApogee: a recovery device opened before
// apogee (so the "apogee" is where it opened); extensions: simulation extensions or scripts the run uses.
//
//   javac -cp OpenRocket-24.12.jar -d build validation/openrocket/ORFlights.java
//   java -cp OpenRocket-24.12.jar:build ORFlights design1.ork design2.ork ...
//
// Each simulation is flown as stored in the file (its motor, launch conditions and random seed).
// SPDX-License-Identifier: GPL-3.0-or-later

import com.google.inject.AbstractModule;
import com.google.inject.Guice;
import info.openrocket.core.document.OpenRocketDocument;
import info.openrocket.core.document.Simulation;
import info.openrocket.core.file.GeneralRocketLoader;
import info.openrocket.core.motor.MotorConfiguration;
import info.openrocket.core.plugin.PluginModule;
import info.openrocket.core.simulation.FlightDataBranch;
import info.openrocket.core.simulation.FlightEvent;
import info.openrocket.core.startup.Application;
import info.openrocket.core.startup.CoreModule;
import java.io.File;
import java.io.PrintStream;

public class ORFlights {
    public static void main(String[] args) throws Exception {
        PrintStream out = System.out;
        System.setOut(System.err); // OpenRocket's own messages stay off the results
        try {
            var root = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
            root.setLevel(ch.qos.logback.classic.Level.ERROR);
        } catch (Throwable t) { }
        CoreModule core = new CoreModule();
        Application.setInjector(Guice.createInjector(core, new PluginModule(), new AbstractModule() {
            @Override protected void configure() {
                bind(info.openrocket.core.database.ComponentPresetDao.class)
                    .to(info.openrocket.core.database.ComponentPresetDatabase.class);
            }
        }));
        core.startLoader();
        for (String path : args) {
            OpenRocketDocument doc;
            try {
                doc = new GeneralRocketLoader(new File(path)).load();
            } catch (Exception e) {
                out.println("{\"file\":" + q(new File(path).getName()) + ",\"error\":" + q("could not open: " + e.getMessage()) + "}");
                continue;
            }
            int i = 0;
            for (Simulation s : doc.getSimulations()) {
                i++;
                String head = "{\"file\":" + q(new File(path).getName()) + ",\"sim\":" + i + ",\"name\":" + q(s.getName());
                try {
                    s.simulate();
                    var fd = s.getSimulatedData();
                    FlightDataBranch b = fd.getBranch(0);
                    var apo = b.getFirstEvent(FlightEvent.Type.APOGEE);
                    var dep = b.getFirstEvent(FlightEvent.Type.RECOVERY_DEVICE_DEPLOYMENT);
                    boolean early = dep != null && (apo == null || dep.getTime() < apo.getTime() - 1e-6);
                    double impulse = 0;
                    var cfg = s.getRocket().getFlightConfiguration(s.getFlightConfigurationId());
                    for (MotorConfiguration mc : cfg.getActiveMotors()) {
                        // each copy: a cluster's motors, in every copy of the pods or side boosters it sits in
                        int copies = 1;
                        for (var c = ((info.openrocket.core.rocketcomponent.RocketComponent) mc.getMount()).getParent(); c != null; c = c.getParent())
                            if (c instanceof info.openrocket.core.rocketcomponent.PodSet || c instanceof info.openrocket.core.rocketcomponent.ParallelStage)
                                copies *= ((info.openrocket.core.rocketcomponent.ComponentAssembly) c).getInstanceCount();
                        impulse += mc.getMotor().getTotalImpulseEstimate() * mc.getMotorCount() * copies;
                    }
                    out.println(head + ",\"apogee\":" + n(fd.getMaxAltitude()) + ",\"maxVelocity\":" + n(fd.getMaxVelocity())
                        + ",\"maxMach\":" + n(fd.getMaxMachNumber()) + ",\"impulse\":" + n(impulse)
                        + ",\"deployedBeforeApogee\":" + early + ",\"extensions\":" + s.getSimulationExtensions().size() + "}");
                } catch (Exception e) {
                    out.println(head + ",\"error\":" + q(String.valueOf(e.getMessage())) + "}");
                }
            }
        }
        System.exit(0);
    }

    /** A number for JSON: null when it isn't finite. */
    static String n(double v) {
        return Double.isFinite(v) ? String.valueOf(v) : "null";
    }

    static String q(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ") + "\"";
    }
}
