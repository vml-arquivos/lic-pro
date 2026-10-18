.PHONY: install dev lint test build format infra-up infra-down db-migrate db-seed ingest-smoke env-check

install:
	pnpm install

infra-up:
	docker compose up -d postgres redis rabbitmq

infra-down:
	docker compose down

db-migrate:
	pnpm db:migrate

db-seed:
	pnpm db:seed

ingest-smoke:
	pnpm ingest:smoke

env-check:
	pnpm env:check

lint:
	pnpm lint
	pnpm format:check

test:
	pnpm test

build:
	pnpm build

format:
	pnpm format

dev:
	pnpm dev
