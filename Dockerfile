FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:web
RUN npm run build:server

# Production image
FROM node:22-alpine

WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2

# Copy production artifacts
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/ecosystem.config.cjs ./ecosystem.config.cjs

# Install only production dependencies
# Copying the built server artifacts which bundle most things,
# but we still need some external native modules.
COPY package-lock.json ./
RUN npm ci --omit=dev

# Optional: Healthcheck
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3010/api/v1/health || exit 1

EXPOSE 3010

CMD ["pm2-runtime", "ecosystem.config.cjs"]
