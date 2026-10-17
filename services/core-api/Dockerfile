FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @licitecomigo/core-api build
EXPOSE 3001
CMD ["pnpm", "--filter", "@licitecomigo/core-api", "start"]
