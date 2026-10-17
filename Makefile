.PHONY: install dev lint test build format infra-up infra-down

install:
\tpnpm install

infra-up:
\tdocker compose up -d postgres redis rabbitmq

infra-down:
\tdocker compose down

lint:
\tpnpm lint
\tpnpm format:check

test:
\tpnpm test

build:
\tpnpm build

format:
\tpnpm format

dev:
\tpnpm dev
