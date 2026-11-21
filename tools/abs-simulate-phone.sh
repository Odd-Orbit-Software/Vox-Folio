#!/usr/bin/env bash
# Act as another listening device: open a session on the test account, save a position, close it.
# Usage: tools/abs-simulate-phone.sh <item id> <seconds>
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
. ./.abs-test.env
TOKEN=$(curl -sS -m 20 -X POST "$VOX_ABS_URL/login" -H 'Content-Type: application/json' \
  --data "{\"username\":\"$VOX_ABS_USER\",\"password\":\"$VOX_ABS_PASS\"}" | python3 -I -c 'import json,sys;print(json.load(sys.stdin)["user"]["accessToken"])')
SID=$(curl -sS -m 20 -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$VOX_ABS_URL/api/items/$1/play" \
  --data '{"deviceInfo":{"deviceId":"vox-folio-phone-sim","clientName":"Phone (simulated)","clientVersion":"0","manufacturer":"Test","model":"Phone"},"mediaPlayer":"html5","supportedMimeTypes":["audio/mpeg","audio/mp4"]}' \
  | python3 -I -c 'import json,sys;print(json.load(sys.stdin)["id"])')
curl -sS -m 20 -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$VOX_ABS_URL/api/session/$SID/close" \
  --data "{\"currentTime\":$2,\"timeListening\":5,\"duration\":0}" -o /dev/null -w "phone saved $2s (HTTP %{http_code})\n"
