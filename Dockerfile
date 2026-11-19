# syntax=docker/dockerfile:1

# 1) Build the web app.
FROM node:26-alpine AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2) Install the server's runtime dependencies only.
FROM node:26-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 3) The image that runs: the server (TypeScript runs directly on Node 24) serving the built web app.
FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/ ./
COPY --from=web-build /app/web/dist /app/web/dist
ENV WEB_DIR=/app/web/dist \
    DATA_DIR=/data \
    PORT=3000
# Uploaded photos and saved reports live here; mount a volume to keep them.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/index.ts"]
