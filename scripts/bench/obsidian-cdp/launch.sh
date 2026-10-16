#!/bin/sh
# Starts a SEPARATE Obsidian instance (own data folder, debug port 9222) on a
# disposable COPY of a test vault, so the repo's vaults and your real Obsidian
# are never touched. Stop it with: pkill -f "user-data-dir=$WORK/obs-data"
# Usage: bench/obsidian-cdp/launch.sh <vault dir> <work dir>
set -e
VAULT="$1"; WORK="$2"
[ -d "$VAULT/.obsidian" ] && [ -n "$WORK" ] || { echo "usage: launch.sh <vault dir> <work dir>"; exit 1; }
rm -rf "$WORK/obs-data" "$WORK/obs-vault"
mkdir -p "$WORK/obs-data"
cp -R "$VAULT" "$WORK/obs-vault"
# Give the copy its OWN plugin files (not a symlink to the repo), so the plugin's saved settings stay in the copy.
PLUG="$WORK/obs-vault/.obsidian/plugins/speed-graph"
if [ -L "$PLUG" ]; then
  SRC="$(readlink "$PLUG")"
  rm "$PLUG"; mkdir "$PLUG"
  cp "$SRC/main.js" "$SRC/manifest.json" "$SRC/styles.css" "$PLUG/"
fi
printf '{"vaults":{"a1b2c3d4e5f60718":{"path":"%s","ts":%s000,"open":true}}}' "$WORK/obs-vault" "$(date +%s)" > "$WORK/obs-data/obsidian.json"
nohup /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$WORK/obs-data" --remote-debugging-port=9222 --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows > "$WORK/obs-launch.log" 2>&1 &
echo "started; debug port 9222; vault copy at $WORK/obs-vault"
