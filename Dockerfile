# Single-image deploy: the Express API also serves the built client, so both
# live on one origin (keeps the auth cookie same-site — see DEPLOYMENT.md).
FROM oven/bun:1.3-debian

WORKDIR /app

# Prisma's query engine needs openssl at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Dependencies first, so edits to source don't invalidate the install layer.
COPY package.json package-lock.json ./
COPY core/package.json ./core/
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY e2e/package.json ./e2e/

# The bun image ships no Node.js, so npm/npx do not exist here — every step must
# go through bun/bunx. Plain `bun install`, not `--frozen-lockfile`: the repo's
# committed lockfile is package-lock.json and there is no bun.lock, so a frozen
# install has nothing to freeze against. Bun reads and migrates package-lock.json,
# so resolutions still come from the committed lockfile, not a fresh solve.
RUN bun install

COPY . .

# Generated into server/src/generated/prisma — imported at runtime by src/db.ts,
# so this must happen at build time, not on boot.
#
# The placeholder DATABASE_URL satisfies prisma.config.ts's env("DATABASE_URL")
# without connecting to anything: generate reads the schema only, and no real
# database exists at build time. The real value comes from Render's environment
# at runtime, for the migrate step below.
RUN cd server && DATABASE_URL="postgresql://placeholder" bunx prisma generate

# No API URL baked in: the client derives it from window.location at runtime
# (client/src/lib/config.ts), so this image is portable across hosts.
RUN cd client && bun run build

ENV NODE_ENV=production
EXPOSE 3001

# Start the server only — migrations are NOT run here, deliberately.
#
# `prisma migrate deploy` takes a postgres advisory lock, which is session-scoped.
# DATABASE_URL points at Neon's -pooler endpoint (PgBouncer, transaction pooling),
# where consecutive statements can land on different backend connections, so the
# lock never resolves and migrate dies with P1002 after 10s. That failure also
# fed itself: the crash triggered a restart, and restarting containers contended
# for the same lock.
#
# Migrating from a deploy is the wrong shape here anyway — it blocks boot, so a
# transient database issue means the service never starts at all. Run migrations
# from a workstation before deploying (see DEPLOYMENT.md step 3):
#
#   cd server && bunx prisma migrate deploy
#
# That connection is a normal session, so the advisory lock works correctly.
CMD ["sh", "-c", "cd server && bun src/index.ts"]
