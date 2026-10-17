"""Domain models used by public-source connectors and the normalizer."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

JsonObject = dict[str, Any]


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

    def to_params(self, page: int, page_size: int = 50) -> dict[str, str | int]:
        if self.end_date < self.start_date:
            raise ValueError("end_date não pode ser anterior a start_date")
        if page < 1:
            raise ValueError("page deve ser maior ou igual a 1")
        if not 10 <= page_size <= 50:
            raise ValueError("page_size deve estar entre 10 e 50 conforme o OpenAPI atual do PNCP")

        params: dict[str, str | int] = {
            "dataInicial": self.start_date.strftime("%Y%m%d"),
            "dataFinal": self.end_date.strftime("%Y%m%d"),
            "codigoModalidadeContratacao": self.modality_code,
            "pagina": page,
            "tamanhoPagina": page_size,
        }
        optional = {
            "codigoModoDisputa": self.dispute_mode_code,
            "uf": self.uf,
            "codigoMunicipioIbge": self.municipality_ibge_code,
            "cnpj": self.cnpj,
            "codigoUnidadeAdministrativa": self.administrative_unit_code,
            "idUsuario": self.user_id,
        }
        params.update({key: value for key, value in optional.items() if value is not None})
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

    @property
    def identity(self) -> tuple[str, str, str, str]:
        return (self.tenant_id, self.fonte, self.id_externo, self.hash_conteudo)


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
