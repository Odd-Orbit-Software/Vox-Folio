#!/usr/bin/env bash
# Launch (or relaunch) Vox Folio on the TV with launch params, the way Polaris does.
# Usage: tools/tv-launch.sh [--cold] '<params json>'   --cold closes the app first.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
for CONF in ./tv.conf ../polaris/tv.conf; do [ -f "$CONF" ] && { . "$CONF"; break; }; done
KEY="${TV_KEY:-$HOME/.ssh/id_ed25519}"; KEY="${KEY/#\~/$HOME}"
ID=$(python3 -I -c 'import json;print(json.load(open("webos-meta/appinfo.json"))["id"])')
COLD=0; [ "${1:-}" = "--cold" ] && { COLD=1; shift; }
PARAMS="${1:-{\}}"
run() { ssh -tt -i "$KEY" -o BatchMode=yes -o LogLevel=ERROR "root@$TV_HOST" "$1; exit" </dev/null; }
if [ $COLD = 1 ]; then
  run "luna-send -n 1 luna://com.webos.applicationManager/closeByAppId '{\"id\":\"$ID\"}'" >/dev/null || true
  sleep 2
fi
run "luna-send -n 1 luna://com.webos.applicationManager/launch '{\"id\":\"$ID\",\"params\":$PARAMS}'"
