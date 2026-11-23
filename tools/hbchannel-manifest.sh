#!/usr/bin/env bash
# Write the Homebrew Channel manifest for the built IPK.
# Usage: tools/hbchannel-manifest.sh <ipk-download-url>
# Run after `tools/deploy.sh` or `npm run build && ares-package dist -o build`. Publishing (uploading the IPK
# and manifest, and submitting to a repository) is done by hand.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
URL="${1:?Pass the URL the IPK will be downloaded from}"
ID=$(python3 -I -c 'import json;print(json.load(open("webos-meta/appinfo.json"))["id"])')
VER=$(python3 -I -c 'import json;print(json.load(open("webos-meta/appinfo.json"))["version"])')
IPK="build/${ID}_${VER}_all.ipk"
[ -f "$IPK" ] || { echo "Missing $IPK; build and package first"; exit 1; }
HASH=$(sha256sum "$IPK" | cut -d' ' -f1)
python3 -I - "$ID" "$VER" "$URL" "$HASH" > "build/${ID}.manifest.json" <<'PY'
import json, sys
app_id, version, url, sha = sys.argv[1:5]
print(json.dumps({
    "id": app_id,
    "version": version,
    "type": "web",
    "title": "Vox Folio",
    "appDescription": "An Audiobookshelf player for LG TVs.",
    "iconUri": "https://raw.githubusercontent.com/Odd-Orbit-Software/Vox-Folio/main/webos-meta/icon.png",
    "sourceUrl": "https://github.com/Odd-Orbit-Software/Vox-Folio",
    "rootRequired": False,
    "ipkUrl": url,
    "ipkHash": {"sha256": sha},
}, indent=2))
PY
echo "Wrote build/${ID}.manifest.json"
