"""Database writer contract for idempotent edital upserts."""

from __future__ import annotations

from typing import Any, Protocol

from .models import NormalizedTender, UpsertResult

UPSERT_EDITAL_SQL = """
INSERT INTO editais (
  tenant_id, fonte, id_externo, titulo, orgao, uf, uasg, modalidade,
  valor_estimado, data_publicacao, url_origem, hash_conteudo, conteudo_texto
) VALUES (
  %(tenant_id)s, %(fonte)s, %(id_externo)s, %(titulo)s, %(orgao)s, %(uf)s, %(uasg)s,
  %(modalidade)s, %(valor_estimado)s, %(data_publicacao)s, %(url_origem)s,
  %(hash_conteudo)s, %(conteudo_texto)s
)
ON CONFLICT (tenant_id, fonte, id_externo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  orgao = EXCLUDED.orgao,
  uf = EXCLUDED.uf,
  uasg = EXCLUDED.uasg,
  modalidade = EXCLUDED.modalidade,
  valor_estimado = EXCLUDED.valor_estimado,
  data_publicacao = EXCLUDED.data_publicacao,
  url_origem = EXCLUDED.url_origem,
  hash_conteudo = EXCLUDED.hash_conteudo,
  conteudo_texto = EXCLUDED.conteudo_texto,
  updated_at = now()
RETURNING (xmax = 0) AS inserted;
"""


class SqlExecutor(Protocol):
    def execute(self, statement: str, parameters: dict[str, Any]) -> Any:
        """Execute a parameterized SQL statement."""


class SqlTenderWriter:
    def __init__(self, executor: SqlExecutor) -> None:
        self.executor = executor

    def upsert(self, tender: NormalizedTender) -> UpsertResult:
        result = self.executor.execute(UPSERT_EDITAL_SQL, _parameters(tender))
        row = result.fetchone()
        if row is None:
            raise RuntimeError("upsert de edital não retornou sua classificação")
        return UpsertResult(inserted=bool(row[0]))


def _parameters(tender: NormalizedTender) -> dict[str, Any]:
    return {
        "tenant_id": tender.tenant_id,
        "fonte": tender.fonte,
        "id_externo": tender.id_externo,
        "titulo": tender.titulo,
        "orgao": tender.orgao,
        "uf": tender.uf,
        "uasg": tender.uasg,
        "modalidade": tender.modalidade,
        "valor_estimado": tender.valor_estimado,
        "data_publicacao": tender.data_publicacao,
        "url_origem": tender.url_origem,
        "hash_conteudo": tender.hash_conteudo,
        "conteudo_texto": tender.conteudo_texto,
    }
