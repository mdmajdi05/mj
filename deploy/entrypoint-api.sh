#!/bin/sh
set -eu

# Apply only committed schema migrations. Never use `db push` in production.
export PRISMA_HIDE_UPDATE_MESSAGE=1
export CHECKPOINT_DISABLE=1

echo "Applying database migrations..."
node_modules/.bin/prisma migrate deploy

echo "Seeding the two accounts (idempotent)..."
node_modules/.bin/tsx prisma/seed.ts

echo "Starting Private Duo API..."
exec node apps/server/dist/index.js
