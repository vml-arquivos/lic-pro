FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @licitecomigo/realtime-gw build
EXPOSE 3003
CMD ["pnpm", "--filter", "@licitecomigo/realtime-gw", "start"]
