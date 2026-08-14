#!/bin/sh
set -e

# Prisma takes an advisory lock, so concurrent replicas starting at once is
# safe; a dedicated migration job is still the cleaner shape at scale.
echo "Applying database migrations..."
npx prisma migrate deploy

# Idempotent: exits quietly when an admin already exists.
if [ -n "$ADMIN_BOOTSTRAP_EMAIL" ]; then
  echo "Ensuring a bootstrap admin exists..."
  npx prisma db seed || echo "Seed skipped."
fi

exec "$@"
