#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
if [ ! -f node_modules/ws/package.json ]; then
    npm ci --omit=dev
fi
exec npm start
