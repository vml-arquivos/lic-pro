"""Domain models used by public-source connectors and the normalizer."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

JsonObject = dict[str, Any]


def canonical_query_hash(filters: Mapping[str, Any]) -> str:
    """Return a stable digest for a set of request filters.

    Pagination and page size are deliberately not part of the digest: they are
    cursors, not query identity.  ``None`` values are retained so that the
    absence of a filter has a deterministic representation as well.
    """

    canonical = json.dumps(
        dict(sorted(filters.items())),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=_json_default,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _json_default(value: Any) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"valor não serializável no hash de consulta: {value!r}")


@dataclass(frozen=True)
class PncpPublicationQuery:
    start_date: date
    end_date: date
    modality_code: int
    dispute_mode_code: int | None = None
    uf: str | None = None
    municipality_ibge_code: str | None = None
    cnpj: str | None = None
    administrative_unit_code: str | None = None
    user_id: int | None = None

    def filter_params(self) -> dict[str, str | int | None]:
        """Return every non-pagination PNCP filter in canonical API names."""

        if self.end_date < self.start_date:
            raise ValueError("end_date não pode ser anterior a start_date")
        return {
            "dataInicial": self.start_date.strftime("%Y%m%d"),
            "dataFinal": self.end_date.strftime("%Y%m%d"),
            "codigoModalidadeContratacao": self.modality_code,
            "codigoModoDisputa": self.dispute_mode_code,
            "uf": self.uf,
            "codigoMunicipioIbge": self.municipality_ibge_code,
            "cnpj": self.cnpj,
            "codigoUnidadeAdministrativa": self.administrative_unit_code,
            "idUsuario": self.user_id,
        }

    @property
    def query_hash(self) -> str:
        return canonical_query_hash(self.filter_params())

    def to_params(self, page: int, page_size: int = 50) -> dict[str, str | int]:
        if page < 1:
            raise ValueError("page deve ser maior ou igual a 1")
        if not 10 <= page_size <= 50:
            raise ValueError("page_size deve estar entre 10 e 50 conforme o OpenAPI atual do PNCP")

        params: dict[str, str | int] = {
            key: value for key, value in self.filter_params().items() if value is not None
        }
        params.update({"pagina": page, "tamanhoPagina": page_size})
        return params


@dataclass(frozen=True)
class PncpPage:
    items: tuple[JsonObject, ...]
    page: int
    total_pages: int
    remaining_pages: int


@dataclass(frozen=True)
class NormalizedTender:
    tenant_id: str
    fonte: str
    id_externo: str
    titulo: str
    orgao: str | None
    uf: str | None
    uasg: str | None
    modalidade: str | None
    valor_estimado: Decimal | None
    data_publicacao: datetime | None
    url_origem: str | None
    hash_conteudo: str
    conteudo_texto: str
    raw_payload: JsonObject
    sistema_origem: str | None = None
    codigo_modalidade: int | None = None
    codigo_modo_disputa: int | None = None
    codigo_instrumento: str | None = None
    instrumento: str | None = None
    modo_disputa: str | None = None
    situacao: str | None = None
    esfera: str | None = None
    poder: str | None = None
    municipio_ibge: str | None = None
    municipio_nome: str | None = None
    srp: bool | None = None
    data_atualizacao: datetime | None = None
    data_abertura_proposta: datetime | None = None
    data_encerramento_proposta: datetime | None = None
    valor_homologado: Decimal | None = None
    estado_completude: str | None = None

    @property
    def identity(self) -> tuple[str, str, str, str]:
        return (self.tenant_id, self.fonte, self.id_externo, self.hash_conteudo)

    @property
    def data_abertura_propostas(self) -> datetime | None:
        """Plural alias matching the database vocabulary."""

        return self.data_abertura_proposta

    @property
    def data_encerramento_propostas(self) -> datetime | None:
        """Plural alias matching the database vocabulary."""

        return self.data_encerramento_proposta


@dataclass(frozen=True)
class UpsertResult:
    inserted: bool


@dataclass(frozen=True)
class IngestEvent:
    event_type: str
    tenant_id: str
    edital_id_externo: str
    fonte: str
    payload: JsonObject
