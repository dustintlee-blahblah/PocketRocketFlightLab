# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue: use GitHub's
[private vulnerability reporting](https://github.com/dustintlee-blahblah/PocketRocketFlightLab/security/advisories/new)
(the repository's **Security** tab → **Report a vulnerability**). Include what's affected, how to reproduce it, and
what an attacker could do with it. You'll get a reply as soon as the maintainer can look at it, and credit in the
release notes if you'd like it.

Examples of what counts: a design, motor or altimeter file that runs script in the app; a way for a web page or another
app to read the user's files through the Android app's bridge; a weakness in how releases are built or signed.

## Supported versions

Only the newest release is supported; fixes come out as a new build.

## How releases are protected

Releases are built from a commit on main by GitHub Actions (`.github/workflows/release.yml`). The signing key is a
repository secret, never a file in the repository, and the workflow refuses to publish an APK that isn't signed with
the release certificate:

```
SHA-256 b7:25:7a:22:71:8c:1b:8f:09:d2:42:ed:d3:09:c8:c2:53:f9:2c:b9:f8:9b:ef:bb:3a:71:9a:20:4a:68:ce:78
```

Android only installs an update signed with the same certificate as the installed app, so an APK signed with any other
key, from any source, is not an official build.

Note the app's results are estimates, not a safety system: see the README's Safety section.
