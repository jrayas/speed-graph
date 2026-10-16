#!/bin/sh
# Copies the freshly built plugin into the running scratch vault. Then reload it in Obsidian:
#   app.plugins.disablePlugin('fast-graph'); app.plugins.enablePlugin('fast-graph')
# Usage: bench/obsidian-cdp/sync.sh <work dir>
set -e
SRC="$(cd "$(dirname "$0")/../../plugin" && pwd)"
cp "$SRC/main.js" "$SRC/manifest.json" "$SRC/styles.css" "$1/obs-vault/.obsidian/plugins/fast-graph/"
echo "synced"
