"""Normalize official PNCP records into the internal edital shape."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from .models import JsonObject, NormalizedTender


def normalize_pncp_publication(raw: JsonObject, tenant_id: str) -> NormalizedTender:
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
    )


def _content_text(raw: JsonObject, organization: JsonObject, unit: JsonObject) -> str:
    parts = [
        _optional_text(raw.get("objetoCompra")),
        _optional_text(raw.get("informacaoComplementar")),
        _optional_text(raw.get("modalidadeNome")),
        _optional_text(organization.get("razaoSocial")),
        _optional_text(unit.get("nomeUnidade")),
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


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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
    if not isinstance(value, str):
        raise ValueError(f"data/hora inválida: {value!r}")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))
