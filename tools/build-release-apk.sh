#!/usr/bin/env bash
# Builds the signed release APK and checks it's signed with the release key.
# Used by .github/workflows/release.yml (and check.yml, to catch signing problems before a release).
#
#   KEYSTORE_B64=... STORE_PASSWORD=... KEY_ALIAS=... KEY_PASSWORD=... tools/build-release-apk.sh
#
# Needs the page built first (node build.js), JDK 17 and the Android SDK (ANDROID_HOME). The keystore is written to a
# temporary folder and deleted afterwards. RELEASE_CERT_SHA256 is the release key's certificate fingerprint; forks
# signing with their own key set it to theirs.
set -euo pipefail
cd "$(dirname "$0")/../android"
: "${RELEASE_CERT_SHA256:=b7257a22718c1b8f09d242edd309c8c253f92cb9f89befbb3a719a204a68ce78}"
[ -n "${KEYSTORE_B64:-}" ] || { echo "The signing keystore (KEYSTORE_B64) isn't set" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp" keystore.properties' EXIT
umask 077
# tolerate line breaks and spaces picked up when the text was copied
printf '%s' "$KEYSTORE_B64" | tr -d ' \t\r\n' | base64 -d > "$tmp/release.p12" || {
  echo "SIGNING_KEYSTORE_B64 isn't valid base64 text" >&2
  exit 1
}
# a PKCS#12 keystore is a DER structure: it starts with 0x30 0x82; report what arrived otherwise (sizes and the
# first two bytes only)
if [ "$(head -c 2 "$tmp/release.p12" | od -An -tx1 | tr -d ' ')" != "3082" ]; then
  echo "SIGNING_KEYSTORE_B64 doesn't decode to a keystore: $(wc -c < "$tmp/release.p12") bytes starting" \
    "$(head -c 2 "$tmp/release.p12" | od -An -tx1) (expected 30 82); the secret holds $(printf '%s' "$KEYSTORE_B64" | wc -c)" \
    "characters. Paste the whole contents of the base64 text file again." >&2
  exit 1
fi
{
  echo "storeFile=$tmp/release.p12"
  echo "storeType=pkcs12"
  echo "storePassword=$STORE_PASSWORD"
  echo "keyAlias=$KEY_ALIAS"
  echo "keyPassword=$KEY_PASSWORD"
} > keystore.properties
./gradlew --no-daemon assembleRelease
APK=app/build/outputs/apk/release/app-release.apk
SIGNER=$(ls "$ANDROID_HOME"/build-tools/*/apksigner | sort -V | tail -n 1)
"$SIGNER" verify --print-certs "$APK" > "$tmp/certs.txt"
cat "$tmp/certs.txt"
grep -qi "certificate SHA-256 digest: $RELEASE_CERT_SHA256" "$tmp/certs.txt" || {
  echo "The APK isn't signed with the release key ($RELEASE_CERT_SHA256)" >&2
  exit 1
}
echo "Signed release APK: android/$APK"
