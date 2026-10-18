FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY services/realtime-gw/package.json services/realtime-gw/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY services/realtime-gw services/realtime-gw
RUN pnpm --filter @licitecomigo/shared build && pnpm --filter @licitecomigo/realtime-gw build
RUN pnpm deploy --filter @licitecomigo/realtime-gw --prod /out
RUN mkdir -p /out/dist && cp -R services/realtime-gw/dist/. /out/dist/

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app
ENV NODE_ENV=production REALTIME_PORT=3003
COPY --from=build --chown=app:app /out ./
USER app
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -q -O - "http://127.0.0.1:${REALTIME_PORT}/health" >/dev/null || exit 1
CMD ["node", "dist/index.js"]
