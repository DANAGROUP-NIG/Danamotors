#!/bin/bash
set -e
export PATH=/opt/cpanel/ea-nodejs22/bin:/opt/danamotors-tools/bin:$PATH
cd /home/danagroup/apps/danamotors/source/server
echo "=== npm ci ==="
npm ci
echo "=== prisma generate ==="
npx --no-install prisma generate
echo "=== prisma migrate deploy ==="
npx --no-install prisma migrate deploy
echo "=== prisma migrate status ==="
npx --no-install prisma migrate status
echo "=== npm run build ==="
npm run build
echo "=== server build done ==="
