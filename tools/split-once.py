# One-time conversion of the single-file app into src/ files (kept for the record). The section boundaries are the
# "/* ---------- name ---------- */" headings already in the code; nothing inside a file is changed.
import sys, os
SRC = sys.argv[1]; OUT = sys.argv[2]
L = open(SRC, encoding="utf-8").read().split("\n")  # L[i] is line i+1
# (first line, path) of each JavaScript file inside the main <script> (lines 1019..8080); each runs to the next one
JS = [
 (1019, "js/core/start.js"),
 (1021, "js/core/storage.js"),
 (1053, "data/motor-catalog.js"),
 (1055, "js/motors/catalog.js"),
 (1056, "data/old-motor-ids.js"),
 (1058, "js/motors/catalog-lookup.js"),
 (1084, "js/motors/motor-files.js"),
 (1126, "js/design/defaults.js"),
 (1189, "js/motors/clusters.js"),
 (1225, "js/ui/units.js"),
 (1235, "js/ui/forms.js"),
 (1281, "js/ui/field-help.js"),
 (1460, "js/recovery/ejection-charge.js"),
 (1661, "js/design/extra-fins.js"),
 (1803, "js/physics/atmosphere.js"),
 (1852, "js/physics/geometry.js"),
 (1885, "js/physics/aerodynamics.js"),
 (2229, "js/physics/simulate.js"),
 (2721, "js/files/openrocket-import.js"),
 (3185, "js/files/rocksim-import.js"),
 (3396, "js/builder/model.js"),
 (3472, "js/builder/ork-export.js"),
 (3539, "js/builder/ork-read.js"),
 (3708, "js/builder/ork-merge.js"),
 (3862, "js/ui/results.js"),
 (4039, "js/ui/rso-checklist.js"),
 (4352, "js/animation/animation.js"),
 (4395, "js/animation/scenery.js"),
 (4649, "js/animation/video-export.js"),
 (4747, "js/ui/motor-tab.js"),
 (5122, "js/ui/motor-delay.js"),
 (5214, "js/ui/launch-sites.js"),
 (5318, "js/ui/compare-motors.js"),
 (5435, "js/ui/events.js"),
 (5472, "js/ui/settings.js"),
 (5661, "js/flightlog/drag-calibration.js"),
 (5680, "js/flightlog/altimeter-files.js"),
 (5838, "js/flightlog/flight-log.js"),
 (6061, "js/flightlog/xlsx.js"),
 (6244, "js/builder/builder-ui.js"),
 (6681, "js/files/save.js"),
 (6696, "js/files/recent.js"),
 (6736, "data/examples.js"),
 (6738, "js/files/examples.js"),
 (6787, "js/ui/touch-and-android.js"),
 (6808, "js/files/save-diff.js"),
 (6847, "js/files/xml-helpers.js"),
 (6880, "js/files/ork-patch.js"),
 (7086, "js/files/ork-new.js"),
 (7151, "js/files/zip.js"),
 (7165, "js/files/saved-simulation.js"),
 (7300, "js/files/unsaved-changes.js"),
 (7383, "js/report/pdf-report.js"),
 (7710, "js/ui/donate.js"),
 (7773, "js/physics/monte-carlo.js"),
 (7904, "js/weather/winds-aloft.js"),
 (7929, "js/weather/forecast.js"),
]
END = 8080  # last line of the main script
def lines(a, b): return "\n".join(L[a-1:b]) + "\n"
os.makedirs(OUT, exist_ok=True)
def put(p, text):
  full = os.path.join(OUT, p); os.makedirs(os.path.dirname(full), exist_ok=True); open(full, "w", encoding="utf-8").write(text)
assert L[1017].startswith("<script>") and L[1017] == "<script>" and L[8080] == "</script>", (L[1017][:20], L[8080][:20])
assert L[23] == "<style>" and L[460] == "</style>"
put("styles.css", lines(25, 460))
order = []
for i, (a, p) in enumerate(JS):
  b = (JS[i+1][0] - 1) if i + 1 < len(JS) else END
  put(p, lines(a, b)); order.append(p)
# the page: everything else, with the parts replaced by markers
page = lines(1, 24) + "@@include styles.css\n" + lines(461, 1018) + "".join(f"@@include {p}\n" for p in order) + "\n".join(L[8080:])
put("index.html", page)
print(len(order), "script files")
