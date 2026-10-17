FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @licitecomigo/bid-engine build
EXPOSE 3002
CMD ["pnpm", "--filter", "@licitecomigo/bid-engine", "start"]
