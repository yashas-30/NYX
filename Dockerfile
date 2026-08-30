# Multi-stage production container build for NYX Web
FROM node:22-alpine AS builder

# Enable PNPM package manager
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

WORKDIR /app

# Copy dependency manifests and project configuration
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps

# Install dependencies and build shared libraries & web app
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nyx/shared build
RUN pnpm --filter @nyx/web build

# Lightweight production runtime serving static assets with Nginx
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
