FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY services/bid-engine/package.json services/bid-engine/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY services/bid-engine services/bid-engine
RUN pnpm --filter @licitecomigo/shared build && pnpm --filter @licitecomigo/bid-engine build
RUN pnpm deploy --filter @licitecomigo/bid-engine --prod /out
RUN mkdir -p /out/dist && cp -R services/bid-engine/dist/. /out/dist/

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app
ENV NODE_ENV=production
COPY --from=build --chown=app:app /out ./
USER app
EXPOSE 3002
CMD ["node", "dist/index.js"]
