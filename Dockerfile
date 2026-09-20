# syntax=docker/dockerfile:1

# ── deps ────────────────────────────────────────────────────────────────────
# Installed separately so a source-only change does not re-resolve the lockfile.
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── builder ─────────────────────────────────────────────────────────────────
# Also the image the migration job runs from: it is the only stage that still
# has the Prisma CLI, and running migrations from the same commit as the app
# is the point.
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The client is generated, not committed, so it has to be produced here.
RUN pnpm prisma generate

# No environment is needed to build: nothing is baked into the bundle, so the
# same image runs against any database and any set of secrets.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ── runner ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=UTC

# Runs unprivileged: the container is the security boundary, and root inside it
# is one mistake away from being root on a mounted volume.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
