FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/web apps/web
COPY packages/ui packages/ui
RUN pnpm --filter @licitecomigo/ui build && pnpm --filter @licitecomigo/web build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app
ENV NODE_ENV=production
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
