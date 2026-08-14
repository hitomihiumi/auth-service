#!/bin/sh
set -e

# Prisma takes an advisory lock, so several replicas starting at once is safe;
# a dedicated migration job is still the cleaner shape at scale.
echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

# Runs the compiled script rather than `prisma db seed`, whose configured
# command needs ts-node — a devDependency that production images do not have.
# Idempotent: it exits quietly when an admin already exists. Deliberately not
# guarded with `|| true`: if bootstrapping was asked for and fails, starting
# without an admin would leave an unreachable admin panel.
if [ -n "$ADMIN_BOOTSTRAP_EMAIL" ]; then
  echo "Ensuring a bootstrap admin exists..."
  node dist/scripts/seed-admin.js
fi

exec "$@"
