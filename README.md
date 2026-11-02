# release-files

This branch holds only the files for the newest release of Pocket Rocket Flight Lab: the signed
APK, the web version and the release notes. It is replaced (not added to) with each release, so old
APKs don't build up in the repository's history. The code is on the `main` branch.

Each push to this branch runs `.github/workflows/release.yml`, which publishes the GitHub release
from these files (tagged, for example, `v1.0-build227` at the `main` commit in `MAIN_COMMIT`). Download the app from the
[Releases page](https://github.com/dustintlee-blahblah/PocketRocketFlightLab/releases/latest).
