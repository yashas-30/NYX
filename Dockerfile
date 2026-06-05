# Dockerfile (Multi-stage)
# Stage 1: Build dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
RUN npm ci

# Stage 2: Build server
FROM node:22-alpine AS server-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=apps/server

# Stage 3: Build web client
FROM node:22-alpine AS web-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=apps/web

# Stage 4: Production server
FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production

# Install runtime dependencies
RUN apk add --no-cache sqlite-libs

COPY --from=server-builder /app/apps/server/dist ./dist
COPY --from=server-builder /app/apps/server/package.json ./
COPY --from=web-builder /app/apps/web/dist ./public

# Install production dependencies only
RUN npm ci --only=production

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3   CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "dist/index.js"]

# Stage 5: Desktop build
FROM node:22-alpine AS desktop
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:desktop
