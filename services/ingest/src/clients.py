"""Official public-data connectors, using the documented routes only."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from typing import Any

from .http import Endpoint, JsonObject, ResilientJsonClient
from .models import PncpPage, PncpPublicationQuery


class PncpClient:
    """Client for the PNCP public consultation API."""

    def __init__(
        self,
        http: ResilientJsonClient,
        base_url: str = "https://pncp.gov.br/api/consulta",
    ) -> None:
        self.http = http
        self.endpoint = Endpoint(base_url, "/v1/contratacoes/publicacao")

    def fetch_publications_page(
        self, query: PncpPublicationQuery, *, page: int = 1, page_size: int = 50
    ) -> PncpPage:
        payload = self.http.get(self.endpoint.url, query.to_params(page, page_size))
        raw_items = payload.get("data", [])
        if not isinstance(raw_items, list):
            raise ValueError("PNCP retornou campo data em formato inesperado")
        items = tuple(item for item in raw_items if isinstance(item, dict))
        return PncpPage(
            items=items,
            page=int(payload.get("numeroPagina", page)),
            total_pages=int(payload.get("totalPaginas", 0)),
            remaining_pages=int(payload.get("paginasRestantes", 0)),
        )

    def iter_publications(
        self, query: PncpPublicationQuery, *, page_size: int = 50
    ) -> Iterator[JsonObject]:
        page_number = 1
        while True:
            page = self.fetch_publications_page(query, page=page_number, page_size=page_size)
            yield from page.items
            if page.remaining_pages <= 0 and (
                page.total_pages == 0 or page.page >= page.total_pages
            ):
                return
            page_number += 1


class ComprasGovClient:
    """Client for documented CATMAT/CATSER and price research endpoints."""

    def __init__(
        self,
        http: ResilientJsonClient,
        base_url: str = "https://dadosabertos.compras.gov.br",
    ) -> None:
        self.http = http
        self.base_url = base_url.rstrip("/")

    def catalog_materials(
        self, *, page: int = 1, page_size: int = 500, **filters: Any
    ) -> JsonObject:
        params = _catalog_params(page, page_size, filters, max_page_size=500)
        return self.http.get(f"{self.base_url}/modulo-material/4_consultarItemMaterial", params)

    def catalog_services(
        self, *, page: int = 1, page_size: int = 500, **filters: Any
    ) -> JsonObject:
        params = _catalog_params(page, page_size, filters, max_page_size=500)
        return self.http.get(f"{self.base_url}/modulo-servico/6_consultarItemServico", params)

    def material_prices(
        self,
        *,
        codigo_item_catalogo: int,
        page: int = 1,
        page_size: int = 500,
        **filters: Any,
    ) -> JsonObject:
        params = _catalog_params(page, page_size, filters, max_page_size=500)
        params["codigoItemCatalogo"] = codigo_item_catalogo
        return self.http.get(f"{self.base_url}/modulo-pesquisa-preco/1_consultarMaterial", params)

    def service_prices(
        self,
        *,
        codigo_item_catalogo: int,
        page: int = 1,
        page_size: int = 500,
        **filters: Any,
    ) -> JsonObject:
        params = _catalog_params(page, page_size, filters, max_page_size=500)
        params["codigoItemCatalogo"] = codigo_item_catalogo
        return self.http.get(f"{self.base_url}/modulo-pesquisa-preco/3_consultarServico", params)


def _catalog_params(
    page: int, page_size: int, filters: Mapping[str, Any], *, max_page_size: int
) -> dict[str, str | int | bool]:
    if page < 1:
        raise ValueError("page deve ser maior ou igual a 1")
    if not 1 <= page_size <= max_page_size:
        raise ValueError(f"page_size deve estar entre 1 e {max_page_size}")
    params: dict[str, str | int | bool] = {"pagina": page, "tamanhoPagina": page_size}
    params.update({key: value for key, value in filters.items() if value is not None})
    return params
