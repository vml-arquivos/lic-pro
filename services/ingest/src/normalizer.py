"""Normalize official PNCP records into the internal edital shape."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from .models import JsonObject, NormalizedTender


def normalize_pncp_publication(raw: JsonObject, tenant_id: str) -> NormalizedTender:
    """Map fields actually returned by PNCP; unknown values remain ``None``.

    The same normalizer is used for publication, update and proposal feeds.  A
    field is only populated when a documented/observed source key is present;
    in particular, absence is not interpreted as ``False``, zero or a guessed
    status.
    """

    organization = raw.get("orgaoEntidade")
    unit = raw.get("unidadeOrgao")
    organization_data = organization if isinstance(organization, dict) else {}
    unit_data = unit if isinstance(unit, dict) else {}
    external_id = _required_text(raw, "numeroControlePNCP")
    title = _required_text(raw, "objetoCompra")
    content = _content_text(raw, organization_data, unit_data)
    return NormalizedTender(
        tenant_id=tenant_id,
        fonte="pncp",
        id_externo=external_id,
        titulo=title,
        orgao=_optional_text(organization_data.get("razaoSocial")),
        uf=_optional_text(unit_data.get("ufSigla")),
        uasg=_optional_text(unit_data.get("codigoUnidade")),
        modalidade=_optional_text(raw.get("modalidadeNome")),
        valor_estimado=_decimal(raw.get("valorTotalEstimado")),
        data_publicacao=_datetime(raw.get("dataPublicacaoPncp")),
        url_origem=_optional_text(raw.get("linkSistemaOrigem")),
        hash_conteudo=_content_hash(raw),
        conteudo_texto=content,
        raw_payload=raw,
        sistema_origem=_optional_text(_first_value(raw, "sistemaOrigemNome", "sistemaOrigem")),
        codigo_modalidade=_integer(
            _first_value(raw, "modalidadeId", "codigoModalidadeContratacao")
        ),
        codigo_modo_disputa=_integer(_first_value(raw, "modoDisputaId", "codigoModoDisputa")),
        codigo_instrumento=_optional_text(
            _first_value(
                raw,
                "tipoInstrumentoConvocatorioId",
                "codigoInstrumentoConvocatorio",
                "codigoInstrumento",
            )
        ),
        instrumento=_optional_text(
            _first_value(
                raw,
                "tipoInstrumentoConvocatorioNome",
                "instrumentoConvocatorioNome",
                "tipoInstrumentoNome",
            )
        ),
        modo_disputa=_optional_text(_first_value(raw, "modoDisputaNome", "modoDisputa")),
        situacao=_optional_text(
            _first_value(raw, "situacaoCompraNome", "situacaoNome", "situacao")
        ),
        esfera=_optional_text(
            _first_value(raw, "esferaNome", "esfera")
            or _first_value(organization_data, "esferaNome", "esfera")
        )
        or _coded(ESFERAS, _first_value(raw, "esferaId") or organization_data.get("esferaId")),
        poder=_optional_text(
            _first_value(raw, "poderNome", "poder")
            or _first_value(organization_data, "poderNome", "poder")
        )
        or _coded(PODERES, _first_value(raw, "poderId") or organization_data.get("poderId")),
        municipio_ibge=_optional_text(
            _first_value(
                unit_data,
                "codigoIbge",
                "codigoMunicipioIbge",
                "municipioIbge",
            )
            or _first_value(raw, "codigoMunicipioIbge", "municipioIbge")
        ),
        municipio_nome=_optional_text(
            _first_value(unit_data, "municipioNome") or _first_value(raw, "municipioNome")
        ),
        srp=_boolean(_first_value(raw, "srp", "registroPreco", "registroPrecos")),
        data_atualizacao=_datetime(
            _first_value(raw, "dataAtualizacao", "dataAtualizacaoPncp", "dataAtualizacaoGlobal")
        ),
        data_abertura_proposta=_datetime(
            _first_value(
                raw,
                "dataAberturaProposta",
                "dataAberturaPropostas",
                "dataInicioProposta",
            )
        ),
        data_encerramento_proposta=_datetime(
            _first_value(
                raw,
                "dataEncerramentoProposta",
                "dataEncerramentoPropostas",
                "dataFimProposta",
            )
        ),
        valor_homologado=_decimal(_first_value(raw, "valorTotalHomologado", "valorHomologado")),
        estado_completude=_optional_text(
            _first_value(raw, "estadoCompletude", "statusCompletude", "completude")
        ),
        orgao_cnpj=_digits(organization_data.get("cnpj")),
        numero_compra=_optional_text(raw.get("numeroCompra")),
        processo=_optional_text(raw.get("processo")),
        amparo_legal=_legal_basis(raw.get("amparoLegal")),
        informacao_complementar=_optional_text(raw.get("informacaoComplementar")),
    )


# Códigos de uma letra publicados no manual do PNCP; letra desconhecida vira ``None``.
ESFERAS = {"F": "Federal", "E": "Estadual", "M": "Municipal", "D": "Distrital"}
PODERES = {"E": "Executivo", "L": "Legislativo", "J": "Judiciário"}


def _coded(table: dict[str, str], value: Any) -> str | None:
    text = _optional_text(value)
    return table.get(text.upper()) if text else None


def _digits(value: Any) -> str | None:
    text = _optional_text(value)
    if not text:
        return None
    digits = "".join(char for char in text if char.isdigit())
    return digits or None


def _legal_basis(value: Any) -> str | None:
    if isinstance(value, dict):
        return _optional_text(_first_value(value, "nome", "descricao"))
    return _optional_text(value)


def _content_text(raw: JsonObject, organization: JsonObject, unit: JsonObject) -> str:
    parts = [
        _optional_text(raw.get("objetoCompra")),
        _optional_text(raw.get("informacaoComplementar")),
        _optional_text(raw.get("modalidadeNome")),
        _optional_text(
            _first_value(raw, "tipoInstrumentoConvocatorioNome", "instrumentoConvocatorioNome")
        ),
        _optional_text(_first_value(raw, "situacaoCompraNome", "situacaoNome")),
        _optional_text(organization.get("razaoSocial")),
        _optional_text(unit.get("nomeUnidade")),
        _optional_text(unit.get("municipioNome")),
    ]
    return "\n".join(part for part in parts if part)


def _content_hash(raw: JsonObject) -> str:
    canonical = json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _required_text(payload: JsonObject, key: str) -> str:
    value = _optional_text(payload.get(key))
    if not value:
        raise ValueError(f"registro PNCP sem campo obrigatório {key}")
    return value


def _first_value(payload: JsonObject, *keys: str) -> Any:
    for key in keys:
        if key in payload and payload[key] is not None and payload[key] != "":
            return payload[key]
    return None


def _optional_text(value: Any) -> str | None:
    if value is None or isinstance(value, (dict, list, tuple)):
        return None
    text = str(value).strip()
    return text or None


def _integer(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"código numérico inválido: {value!r}") from error


def _boolean(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "t", "1", "sim"}:
            return True
        if normalized in {"false", "f", "0", "nao", "não"}:
            return False
    return None


def _decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError) as error:
        raise ValueError(f"valor numérico inválido: {value!r}") from error


def _datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        raise ValueError(f"data/hora inválida: {value!r}")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))
