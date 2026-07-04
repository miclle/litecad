#!/usr/bin/env bash
# Kill a lingering litecad Vite process on the configured dev port.
# Safe to call when nothing is running - exits 0 either way.
set -euo pipefail

port="${LITECAD_VITE_PORT:-46281}"
lsof -ti tcp:"${port}" | xargs kill -9 2>/dev/null || true
sleep 1
