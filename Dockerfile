# syntax=docker/dockerfile:1

# Node.js line of all stages; the desktop app and CI use the same (24).
ARG NODE_IMAGE=node:24-bookworm-slim

# ---- build: compile client and server ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
# The desktop workspace must exist for npm, but its packages (Electron …) are not installed.
COPY desktop/package.json desktop/
# No install scripts, as in CI: better-sqlite3 loads its prebuilt binary (prebuilds/) at run time, but its binding.gyp
# makes npm run `node-gyp rebuild`, which fails in the slim image without Python and a compiler.
RUN npm ci --ignore-scripts --workspace client --workspace server
COPY client client
COPY server server
RUN npm run build

# ---- deps: production dependencies of the server only ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY desktop/package.json desktop/
RUN npm ci --ignore-scripts --omit=dev --workspace server && npm cache clean --force

# ---- runtime ----
FROM ${NODE_IMAGE}
LABEL org.opencontainers.image.title="Scrumbanize" \
      org.opencontainers.image.description="Notizen und Scrumban-Board, selbst gehostet"
# TMPDIR in the data volume: in docker-compose.yml the image's own file system is read-only, and a backup's database
# snapshot needs as much room as the database (US-23).
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    TMPDIR=/data/tmp
WORKDIR /app

COPY --from=deps /app ./
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

# A new named volume inherits these folders and their owner, so the unprivileged user can write the database.
RUN mkdir -p /data/tmp /data/backups && chown -R node:node /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://localhost:${process.env.PORT}/api/health`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "server/dist/index.js"]
