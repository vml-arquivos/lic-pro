#!/usr/bin/env python3
"""Fail when a runtime variable declared for a service is absent from .env.example."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_KEYS = {
    line.split('=', 1)[0].strip()
    for line in (ROOT / '.env.example').read_text().splitlines()
    if line.strip() and not line.lstrip().startswith('#') and '=' in line
}

SERVICE_ENV = {
    'postgres': {'POSTGRES_DB', 'POSTGRES_ADMIN_USER', 'POSTGRES_ADMIN_PASSWORD'},
    'rabbitmq': {'RABBITMQ_USER', 'RABBITMQ_PASSWORD', 'RABBITMQ_VHOST'},
    'web': {'NODE_ENV', 'APP_ENV', 'PORT', 'APP_URL', 'API_URL', 'CORE_API_INTERNAL_URL', 'WS_URL', 'AI_INTERNAL_URL', 'DEMO_MODE'},
    'site': {'NODE_ENV', 'APP_ENV', 'PORT', 'SITE_URL', 'APP_URL', 'CORE_API_INTERNAL_URL', 'WHATSAPP_NUMBER', 'BRAND_SLOGAN', 'SIGNUP_ENABLED'},
    'core-api': {'NODE_ENV', 'CORE_API_PORT', 'JWT_SECRET', 'JWT_TTL_SECONDS', 'JWT_ISSUER', 'JWT_AUDIENCE', 'DATABASE_URL', 'REDIS_URL', 'APP_URL', 'API_URL', 'SITE_URL', 'ALLOWED_ORIGINS', 'SIGNUP_ENABLED', 'EMAIL_PROVIDER', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'TERMS_VERSION', 'PRIVACY_VERSION'},
    'ai': {'NODE_ENV', 'AI_PORT', 'DATABASE_URL', 'REDIS_URL', 'RABBITMQ_URL', 'AI_JWT_ALGORITHM', 'AI_JWT_SECRET', 'AI_JWT_PUBLIC_KEY', 'AI_JWT_ISSUER', 'AI_JWT_AUDIENCE', 'LLM_PROVIDER', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_API_BASE_URL', 'EMBEDDING_PROVIDER', 'EMBEDDING_MODEL', 'EMBEDDING_API_KEY', 'EMBEDDING_API_BASE_URL', 'ANA_HISTORY_RETENTION_DAYS', 'AI_MAX_PDF_BYTES', 'AI_MAX_PDF_PAGES', 'AI_READER_TIMEOUT_SECONDS', 'AI_RATE_LIMIT_PER_MINUTE_USER', 'AI_RATE_LIMIT_PER_MINUTE_TENANT', 'AI_DEFAULT_MONTHLY_CALL_LIMIT', 'AI_DEFAULT_MONTHLY_TOKEN_LIMIT', 'ENABLE_OCR'},
    'ingest-http': {'INGEST_PORT', 'DATABASE_URL', 'REDIS_URL', 'RABBITMQ_URL', 'PNCP_BASE_URL', 'COMPRAS_GOV_BASE_URL'},
    'ingest-worker': {'DATABASE_URL', 'REDIS_URL', 'RABBITMQ_URL', 'PNCP_BASE_URL', 'INGEST_MAX_RETRIES', 'INGEST_RATE_LIMIT_SECONDS'},
    'ingest-scheduler': {'DATABASE_URL', 'REDIS_URL', 'RABBITMQ_URL', 'INGEST_SCHEDULE_SECONDS', 'INGEST_SCHEDULE_TENANT_ID', 'INGEST_SCHEDULE_MODALITY_CODE', 'INGEST_SCHEDULE_UF', 'INGEST_WINDOW_DAYS'},
    'migrate': {'MIGRATION_DATABASE_URL', 'CORE_DB_PASSWORD', 'INGEST_DB_PASSWORD', 'AI_DB_PASSWORD', 'BID_DB_PASSWORD', 'REALTIME_DB_PASSWORD', 'MIGRATE_IDLE_AFTER'},
    'bid-engine': {'NODE_ENV', 'BID_ENGINE_PORT'},
    'realtime-gw': {'NODE_ENV', 'REALTIME_PORT', 'ALLOWED_ORIGINS'},
    'bootstrap': {'MIGRATION_DATABASE_URL', 'BOOTSTRAP_TENANT_NAME', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD', 'TERMS_VERSION', 'PRIVACY_VERSION'},
}

missing = {service: sorted(keys - ENV_KEYS) for service, keys in SERVICE_ENV.items() if keys - ENV_KEYS}
print('Contrato de ambiente por serviço:')
for service, keys in SERVICE_ENV.items():
    print(f"- {service}: {', '.join(sorted(keys))}")
if missing:
    print('\nVariáveis ausentes em .env.example:')
    for service, keys in missing.items():
        print(f"- {service}: {', '.join(keys)}")
    raise SystemExit(1)
print('\nOK: toda variável declarada para runtime aparece em .env.example.')
