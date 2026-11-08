# Contributing to Pocket Rocket Flight Lab

Thanks for helping. Bug reports, accuracy reports from real flights, fixes, new altimeter formats, motor data, physics
improvements and documentation are all welcome.

Before you start, read [ARCHITECTURE.md](ARCHITECTURE.md): it explains how the app is put together and how a flight is
computed.

## Reporting a problem

Open an issue and pick the template that fits:

- **Bug report**: something doesn't work. Include the app build (shown under the app's name, e.g. "v1.0 · build 278"), Android or
  browser, the steps, and the design file if you can share it.
- **Accuracy report**: a prediction that disagrees with a real flight, OpenRocket or RockSim. These are the most useful
  reports we get. Include the design file, the motor, the conditions, and the other number with where it came from
  (altimeter file, OpenRocket version and settings).
- **Feature request**: what you'd like to do and why.

Security problems: see [SECURITY.md](SECURITY.md), not a public issue.

## Setting up

You need Node.js 22.18 or later.

```
git clone https://github.com/dustintlee-blahblah/PocketRocketFlightLab.git
cd PocketRocketFlightLab
npm ci
npx playwright install chromium
npm test
```

`npm test` builds the page and runs the regression test; it should end with `PASS: 40 cases identical`. Open
`web/pocket-rocket-flight-lab.html` in a browser to use the app you built. For the Android app, see the README.

## Making a change

1. **Edit `src/`, then build** (`node build.js`). `web/` is build output; don't edit it or commit it.
2. **Keep to the style.** `npm run format` (Prettier, line width 120) and `npm run lint` (ESLint, then the unused-name
   check) must pass. Comments explain why, in plain words; give the source for any physics (report, book, figure).
3. **Run the tests.**
   - `npm test`: the regression test. A change meant to leave results alone (refactoring, UI, docs) must pass with no
     differences.
   - A change meant to alter results (a physics fix, a new output): look at the differences it reports and make sure
     they're the intended ones, then run `npm run test:record` and commit the new `tests/golden-snapshot.json` with
     the change. Say in the pull request what changed, by how much, and why it's better, with evidence where you can
     (OpenRocket, a NASA/NACA report, flight data).
   - `npm run test:smoke`: clicks through the tabs and controls and fails on any page error.
   - `npm run test:drag` if you touched the drag model.
4. **Modules.** Import what you use and export only what other modules need. Keep a module's top level to
   definitions; anything it does when the app opens goes in its `start()` (see ARCHITECTURE.md). To change a shared
   variable from another module, use the setter its module exports.
5. **Units.** Keep values in SI inside the design, conditions and physics; convert only for display.
6. **Update the docs** you affected: the field help text (`src/js/ui/field-help.js`), the README, ARCHITECTURE.md.

## Pull requests

- One change per pull request, with a clear description; the template lists what to check.
- The Check workflow runs formatting, lint, the regression test, the drag benchmarks and an Android build on every pull
  request. It must pass.
- Commit messages: a short summary line, then what changed and why.
- By contributing, you agree your contribution is licensed under the project's license, the GNU GPL v3 or later.

## Releases

Releases are made by the maintainer, by setting a new build number on main; the README's "Releasing" section has the steps. Add a line for
your change under the next build in `CHANGELOG.md` if it's something users will notice, or the maintainer will.

## Code of conduct

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
