#!/usr/bin/env bash
# Print the test account's saved progress for an item (uses the git-ignored .abs-test.env).
# Usage: tools/abs-progress.sh <item id>
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
. ./.abs-test.env
TOKEN=$(curl -sS -m 20 -X POST "$VOX_ABS_URL/login" -H 'Content-Type: application/json' \
  --data "{\"username\":\"$VOX_ABS_USER\",\"password\":\"$VOX_ABS_PASS\"}" | python3 -I -c 'import json,sys;print(json.load(sys.stdin)["user"]["accessToken"])')
curl -sS -m 20 -H "Authorization: Bearer $TOKEN" "$VOX_ABS_URL/api/me/progress/$1" | python3 -I -c '
import json,sys,time
p=json.load(sys.stdin)
print("currentTime=%.1fs progress=%.2f%% finished=%s updated=%ds ago" % (p["currentTime"], p["progress"]*100, p["isFinished"], time.time()-p["lastUpdate"]/1000))'
