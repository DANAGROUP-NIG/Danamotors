#!/bin/bash
set -e
export PATH=/opt/cpanel/ea-nodejs22/bin:/opt/danamotors-tools/bin:$PATH
export NODE_ENV=development
export NEXT_TELEMETRY_DISABLED=1
cd /home/danagroup/apps/danamotors/source/client
echo "=== yarn install ==="
yarn install --frozen-lockfile --non-interactive
echo "=== cleaning previous build ==="
rm -rf .next
echo "=== yarn build ==="
NODE_ENV=production yarn build
echo "=== client build done ==="
