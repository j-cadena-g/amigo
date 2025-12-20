# syntax=docker/dockerfile:1

FROM oven/bun:1.1-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json bun.lockb* ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/

# Install dependencies
RUN bun install --frozen-lockfile

# Build the application
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

WORKDIR /app/apps/api
RUN bun run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 hono
RUN adduser --system --uid 1001 hono

# Copy built output and dependencies
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

USER hono

EXPOSE 3001
ENV PORT=3001

CMD ["bun", "run", "dist/index.js"]
