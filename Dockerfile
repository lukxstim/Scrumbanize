# syntax=docker/dockerfile:1

# ---- build: compile client and server ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
# The desktop workspace must exist for npm, but its packages (Electron …) are not installed.
COPY desktop/package.json desktop/
RUN npm ci --workspace client --workspace server
COPY client client
COPY server server
RUN npm run build

# ---- deps: production dependencies of the server only ----
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY desktop/package.json desktop/
RUN npm ci --omit=dev --workspace server && npm cache clean --force

# ---- runtime ----
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app

COPY --from=deps /app ./
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

# A new named volume inherits this directory's owner, so the unprivileged user can write the database.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://localhost:${process.env.PORT}/api/health`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "server/dist/index.js"]
