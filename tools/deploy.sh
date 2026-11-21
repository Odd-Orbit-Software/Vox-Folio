#!/usr/bin/env bash
# Build, copy to the rooted TV over SSH, install and launch Vox Folio.
# Usage: tools/deploy.sh [--no-build] [launch-params-json]
# Reads TV_HOST / TV_KEY from ./tv.conf, falling back to ../polaris/tv.conf (both git-ignored).
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

BUILD=1
[ "${1:-}" = "--no-build" ] && { BUILD=0; shift; }
PARAMS="${1:-{\}}"

for CONF in ./tv.conf ../polaris/tv.conf; do [ -f "$CONF" ] && { . "$CONF"; break; }; done
HOST="${TV_HOST:-}"; KEY="${TV_KEY:-$HOME/.ssh/id_ed25519}"; KEY="${KEY/#\~/$HOME}"
[ -n "$HOST" ] || { echo "Set TV_HOST and TV_KEY in tv.conf"; exit 1; }
SSH=(ssh -i "$KEY" -o BatchMode=yes -o LogLevel=ERROR -o ConnectTimeout=8 "root@$HOST")

ID=$(python3 -I -c 'import json;print(json.load(open("webos-meta/appinfo.json"))["id"])')
VER=$(python3 -I -c 'import json;print(json.load(open("webos-meta/appinfo.json"))["version"])')
if [ $BUILD = 1 ]; then npm run build --silent; fi
mkdir -p build && ares-package dist -o build >/dev/null
NAME="${ID}_${VER}_all.ipk"

echo "[*] Copying $NAME to $HOST"
"${SSH[@]}" "cat > /media/developer/temp/$NAME" < "build/$NAME"

echo "[*] Installing"
ssh -tt -i "$KEY" -o BatchMode=yes -o LogLevel=ERROR "root@$HOST" \
  "luna-send -i -w 120000 luna://com.webos.appInstallService/dev/install '{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"/media/developer/temp/$NAME\",\"subscribe\":true}' 2>&1 | while read -r l; do echo \"  \$l\"; case \"\$l\" in *installed*|*FAILED*|*failed*|*errorText*) break;; esac; done; rm -f /media/developer/temp/$NAME; exit" </dev/null | grep -E 'installed|FAILED|failed|errorText' || true

echo "[*] Launching $ID with $PARAMS"
ssh -tt -i "$KEY" -o BatchMode=yes -o LogLevel=ERROR "root@$HOST" \
  "luna-send -n 1 luna://com.webos.applicationManager/launch '{\"id\":\"$ID\",\"params\":$PARAMS}'; exit" </dev/null
