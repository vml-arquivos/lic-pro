"""Portal de compras de cada licitação (BLL, BNC, Compras.gov.br...).

Espelho de ``packages/shared/src/portais.ts``: a coleta do core-api e esta ingestão têm de dar o
mesmo nome e o mesmo identificador para o mesmo portal. Um teste do pacote compartilhado confere
que a lista abaixo continua com os mesmos identificadores e endereços.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class PortalConhecido:
    slug: str
    nome: str
    nomes: tuple[str, ...]
    hosts: tuple[str, ...]


@dataclass(frozen=True)
class PortalDaLicitacao:
    slug: str
    nome: str
    conhecido: bool


PORTAIS_CONHECIDOS: tuple[PortalConhecido, ...] = (
    PortalConhecido(
        "compras-gov-br",
        "Compras.gov.br",
        ("compras.gov", "comprasgov", "comprasnet", "compras net", "siasg"),
        ("compras.gov.br", "comprasnet.gov.br", "comprasgovernamentais.gov.br"),
    ),
    PortalConhecido(
        "portal-de-compras-publicas",
        "Portal de Compras Públicas",
        ("portal de compras publicas", "portaldecompraspublicas"),
        ("portaldecompraspublicas.com.br",),
    ),
    PortalConhecido(
        "bll-compras",
        "BLL Compras",
        ("bll compras", "bllcompras", "bolsa de licitacoes", "bll -", "bll.org"),
        ("bllcompras.com", "bll.org.br"),
    ),
    PortalConhecido(
        "bnc",
        "BNC - Bolsa Nacional de Compras",
        ("bnc", "bolsa nacional de compras"),
        ("bnc.org.br",),
    ),
    PortalConhecido("licitanet", "Licitanet", ("licitanet",), ("licitanet.com.br",)),
    PortalConhecido(
        "licitacoes-e",
        "Licitações-e (Banco do Brasil)",
        ("licitacoes-e", "licitacoes e", "licitacoese"),
        ("licitacoes-e.com.br",),
    ),
    PortalConhecido(
        "comprasbr",
        "ComprasBR",
        ("comprasbr", "compras br", "compras brasil"),
        ("comprasbr.com.br",),
    ),
    PortalConhecido(
        "bbmnet",
        "BBMNET Licitações",
        ("bbmnet",),
        ("bbmnet.com.br", "bbmnetlicitacoes.com.br"),
    ),
    PortalConhecido("m2a", "M2A Tecnologia", ("m2a",), ("m2atecnologia.com.br",)),
    PortalConhecido(
        "licitar-digital",
        "Licitar Digital",
        ("licitar digital", "licitardigital"),
        ("licitardigital.com.br",),
    ),
)

_PREFIXO_OBJETO = re.compile(r"^\s*\[([^\]]{2,60})\]\s*[-–—]")


def _sem_acento(valor: str) -> str:
    decomposto = unicodedata.normalize("NFD", valor)
    return "".join(c for c in decomposto if not unicodedata.combining(c)).lower()


def slug_de_portal(nome: str) -> str:
    texto = re.sub(r"[^a-z0-9]+", "-", _sem_acento(nome)).strip("-")[:80]
    return texto or "portal"


def host_do_link(link: str | None) -> str | None:
    texto = (link or "").strip()
    if not texto:
        return None
    if not re.match(r"^[a-z][a-z0-9+.-]*://", texto, re.IGNORECASE):
        texto = f"https://{texto}"
    try:
        host = (urlparse(texto).hostname or "").lower()
    except ValueError:
        return None
    host = re.sub(r"^www\.", "", host)
    return host if "." in host else None


def _por_host(host: str) -> PortalConhecido | None:
    for portal in PORTAIS_CONHECIDOS:
        if any(host == d or host.endswith(f".{d}") for d in portal.hosts):
            return portal
    return None


def _por_nome(nome: str) -> PortalConhecido | None:
    texto = _sem_acento(nome)
    for portal in PORTAIS_CONHECIDOS:
        for trecho in portal.nomes:
            if len(trecho) <= 3:
                if re.search(rf"(^|[^a-z0-9]){re.escape(trecho)}([^a-z0-9]|$)", texto):
                    return portal
            elif trecho in texto:
                return portal
    return None


def portal_da_licitacao(
    usuario: str | None = None, link: str | None = None, objeto: str | None = None
) -> PortalDaLicitacao | None:
    """Nome do PNCP primeiro, depois o endereço do link e, por fim, o prefixo do objeto."""

    nome = re.sub(r"\s+", " ", usuario or "").strip()[:120]
    host = host_do_link(link)
    achou = _PREFIXO_OBJETO.match(objeto or "")
    prefixo = achou.group(1).strip() if achou else None

    conhecido = (
        (_por_nome(nome) if nome else None)
        or (_por_host(host) if host else None)
        or (_por_nome(prefixo) if prefixo else None)
    )
    if conhecido:
        return PortalDaLicitacao(conhecido.slug, conhecido.nome, True)
    if nome:
        return PortalDaLicitacao(slug_de_portal(nome), nome, False)
    if host:
        return PortalDaLicitacao(slug_de_portal(host), host, False)
    return None
