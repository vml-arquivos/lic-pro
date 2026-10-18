"""Database writer contract for idempotent edital upserts."""

from __future__ import annotations

from typing import Any, Protocol

from .models import NormalizedTender, UpsertResult

UPSERT_EDITAL_SQL = """
INSERT INTO editais (
  tenant_id, fonte, id_externo, titulo, orgao, uf, uasg, modalidade,
  valor_estimado, data_publicacao, url_origem, hash_conteudo, conteudo_texto,
  sistema_origem, codigo_modalidade, codigo_modo_disputa, codigo_instrumento,
  instrumento, modo_disputa, situacao, esfera, poder, municipio_ibge, municipio_nome,
  srp, data_atualizacao, data_abertura_proposta, data_encerramento_proposta,
  data_abertura_propostas, data_encerramento_propostas, valor_homologado, estado_completude
) VALUES (
  %(tenant_id)s, %(fonte)s, %(id_externo)s, %(titulo)s, %(orgao)s, %(uf)s, %(uasg)s,
  %(modalidade)s, %(valor_estimado)s, %(data_publicacao)s, %(url_origem)s,
  %(hash_conteudo)s, %(conteudo_texto)s, %(sistema_origem)s, %(codigo_modalidade)s,
  %(codigo_modo_disputa)s, %(codigo_instrumento)s, %(instrumento)s, %(modo_disputa)s,
  %(situacao)s, %(esfera)s, %(poder)s, %(municipio_ibge)s, %(municipio_nome)s, %(srp)s,
  %(data_atualizacao)s, %(data_abertura_proposta)s, %(data_encerramento_proposta)s,
  %(data_abertura_propostas)s, %(data_encerramento_propostas)s, %(valor_homologado)s,
  %(estado_completude)s
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
  sistema_origem = EXCLUDED.sistema_origem,
  codigo_modalidade = EXCLUDED.codigo_modalidade,
  codigo_modo_disputa = EXCLUDED.codigo_modo_disputa,
  codigo_instrumento = EXCLUDED.codigo_instrumento,
  instrumento = EXCLUDED.instrumento,
  modo_disputa = EXCLUDED.modo_disputa,
  situacao = EXCLUDED.situacao,
  esfera = EXCLUDED.esfera,
  poder = EXCLUDED.poder,
  municipio_ibge = EXCLUDED.municipio_ibge,
  municipio_nome = EXCLUDED.municipio_nome,
  srp = EXCLUDED.srp,
  data_atualizacao = EXCLUDED.data_atualizacao,
  data_abertura_proposta = EXCLUDED.data_abertura_proposta,
  data_encerramento_proposta = EXCLUDED.data_encerramento_proposta,
  data_abertura_propostas = EXCLUDED.data_abertura_propostas,
  data_encerramento_propostas = EXCLUDED.data_encerramento_propostas,
  valor_homologado = EXCLUDED.valor_homologado,
  estado_completude = EXCLUDED.estado_completude,
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
        "sistema_origem": tender.sistema_origem,
        "codigo_modalidade": tender.codigo_modalidade,
        "codigo_modo_disputa": tender.codigo_modo_disputa,
        "codigo_instrumento": tender.codigo_instrumento,
        "instrumento": tender.instrumento,
        "modo_disputa": tender.modo_disputa,
        "situacao": tender.situacao,
        "esfera": tender.esfera,
        "poder": tender.poder,
        "municipio_ibge": tender.municipio_ibge,
        "municipio_nome": tender.municipio_nome,
        "srp": tender.srp,
        "data_atualizacao": tender.data_atualizacao,
        "data_abertura_proposta": tender.data_abertura_proposta,
        "data_encerramento_proposta": tender.data_encerramento_proposta,
        "data_abertura_propostas": tender.data_abertura_propostas,
        "data_encerramento_propostas": tender.data_encerramento_propostas,
        "valor_homologado": tender.valor_homologado,
        "estado_completude": tender.estado_completude,
    }
