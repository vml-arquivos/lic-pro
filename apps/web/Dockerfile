FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @licitecomigo/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@licitecomigo/web", "start"]
