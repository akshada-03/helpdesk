# Single-image deploy: the Express API also serves the built client, so both
# live on one origin (keeps the auth cookie same-site — see DEPLOYMENT.md).
FROM oven/bun:1.3-debian

WORKDIR /app

# Prisma's query engine needs openssl at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Dependencies first, so edits to source don't invalidate the install layer.
# Installed with npm: the repo's lockfile is package-lock.json, and npm resolves
# the Bun workspaces (core/client/server) from the root package.json just fine.
COPY package.json package-lock.json ./
COPY core/package.json ./core/
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY e2e/package.json ./e2e/
RUN npm ci

COPY . .

# Generated into server/src/generated/prisma — imported at runtime by src/db.ts,
# so this must happen at build time, not on boot.
RUN cd server && npx prisma generate

# No API URL baked in: the client derives it from window.location at runtime
# (client/src/lib/config.ts), so this image is portable across hosts.
RUN cd client && bun run build

ENV NODE_ENV=production
EXPOSE 3001

# migrate deploy is idempotent — safe to run on every boot/restart.
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && bun src/index.ts"]
