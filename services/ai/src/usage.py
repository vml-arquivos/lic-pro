"""PostgreSQL-backed monthly AI usage meter."""

from __future__ import annotations

from datetime import date

from psycopg import connect

from .limits import LimitExceeded, ServiceLimits, UsageStore


class PostgresUsageStore(UsageStore):
    def __init__(self, database_url: str, limits: ServiceLimits) -> None:
        self.database_url = database_url
        self.limits = limits

    def consume(self, tenant_id: str, user_id: str, input_tokens: int, output_tokens: int) -> None:
        month = date.today().replace(day=1)
        with connect(self.database_url) as connection:
            connection.execute("SELECT set_config('app.tenant_id', %s, false)", (tenant_id,))
            connection.execute("SELECT set_config('app.user_id', %s, false)", (user_id,))
            connection.execute(
                """
                INSERT INTO cotas_ia (tenant_id, limite_chamadas_mes, limite_tokens_mes)
                VALUES (%s, %s, %s)
                ON CONFLICT (tenant_id) DO NOTHING
                """,
                (tenant_id, self.limits.default_monthly_calls, self.limits.default_monthly_tokens),
            )
            quota = connection.execute(
                "SELECT limite_chamadas_mes, limite_tokens_mes FROM cotas_ia WHERE tenant_id = %s",
                (tenant_id,),
            ).fetchone()
            usage = connection.execute(
                """
                SELECT chamadas, tokens_entrada, tokens_saida
                  FROM uso_ia
                 WHERE tenant_id = %s AND usuario_id = %s AND mes = %s
                 FOR UPDATE
                """,
                (tenant_id, user_id, month),
            ).fetchone()
            calls, input_total, output_total = usage or (0, 0, 0)
            if quota is None:
                raise LimitExceeded("monthly_quota_unavailable")
            if calls + 1 > quota[0]:
                raise LimitExceeded("monthly_call_quota_exceeded")
            if input_total + output_total + input_tokens + output_tokens > quota[1]:
                raise LimitExceeded("monthly_token_quota_exceeded")
            connection.execute(
                """
                INSERT INTO uso_ia
                  (tenant_id, usuario_id, mes, chamadas, tokens_entrada, tokens_saida)
                VALUES (%s, %s, %s, 1, %s, %s)
                ON CONFLICT (tenant_id, usuario_id, mes) DO UPDATE SET
                  chamadas = uso_ia.chamadas + 1,
                  tokens_entrada = uso_ia.tokens_entrada + EXCLUDED.tokens_entrada,
                  tokens_saida = uso_ia.tokens_saida + EXCLUDED.tokens_saida,
                  updated_at = now()
                """,
                (tenant_id, user_id, month, input_tokens, output_tokens),
            )
