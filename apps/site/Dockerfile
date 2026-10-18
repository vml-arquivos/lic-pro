FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/site/package.json apps/site/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/site apps/site
COPY packages/ui packages/ui
RUN pnpm --filter @licitecomigo/ui build && pnpm --filter @licitecomigo/site build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app
ENV NODE_ENV=production PORT=3100
COPY --from=build --chown=app:app /app/apps/site/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/site/.next/static ./apps/site/.next/static
COPY --from=build --chown=app:app /app/apps/site/public ./apps/site/public
USER app
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -q -O - "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
CMD ["node", "apps/site/server.js"]
