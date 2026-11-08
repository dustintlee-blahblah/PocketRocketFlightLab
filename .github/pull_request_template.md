## What this changes, and why

<!-- One change per pull request. Link the issue it fixes, if there is one. -->

## Effect on results

- [ ] None: `npm test` passes with no differences
- [ ] Results change on purpose: I've checked the differences, recorded `tests/golden-snapshot.json` again
      (`npm run test:record`), and described below what changed, by how much, and the evidence it's better

<!-- e.g. "Apogee of the five examples changes by -0.4% to +1.1%; against OpenRocket on 98 designs the median error
     goes from +0.8% to +0.3%" -->

## Checklist

- [ ] Changes are in `src/` (not `web/`), and `node build.js` builds
- [ ] `npm run format` and `npm run lint` pass
- [ ] Physics changes cite their source (report, book, figure) in a comment
- [ ] Docs updated where needed (field help, README, ARCHITECTURE.md, CHANGELOG.md)
- [ ] Tried in the app: the screen or feature I changed works on a phone-sized window
