#!/usr/bin/env bash
# Capture the TV's screen to a PNG on this machine. Usage: tools/tv-screenshot.sh out.png
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
for CONF in ./tv.conf ../polaris/tv.conf; do [ -f "$CONF" ] && { . "$CONF"; break; }; done
KEY="${TV_KEY:-$HOME/.ssh/id_ed25519}"; KEY="${KEY/#\~/$HOME}"
OUT="${1:-tv.png}"
ssh -tt -i "$KEY" -o BatchMode=yes -o LogLevel=ERROR "root@$TV_HOST" \
  "luna-send -n 1 luna://com.webos.service.capture/executeOneShot '{\"path\":\"/tmp/vf-shot.png\",\"method\":\"DISPLAY\",\"width\":1920,\"height\":1080,\"format\":\"PNG\"}' >/dev/null; exit" </dev/null
ssh -i "$KEY" -o BatchMode=yes -o LogLevel=ERROR "root@$TV_HOST" "cat /tmp/vf-shot.png; rm -f /tmp/vf-shot.png" > "$OUT"
echo "$OUT"
