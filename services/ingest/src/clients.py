"""Official public-data connectors, using the documented routes only."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from typing import Any

from .http import Endpoint, JsonObject, ResilientJsonClient
from .models import PncpPage, PncpPublicationQuery


class PncpClient:
    """Client for the PNCP public consultation API.

    ``start_page`` is a cursor, not a query filter.  It is intentionally
    available on every iterator so a persisted checkpoint can select the next
    page after a worker restart.
    """

    def __init__(
        self,
        http: ResilientJsonClient,
        base_url: str = "https://pncp.gov.br/api/consulta",
        *,
        start_page: int = 1,
        initial_page: int | None = None,
        page_size: int = 50,
    ) -> None:
        self.http = http
        self.publication_endpoint = Endpoint(base_url, "/v1/contratacoes/publicacao")
        self.update_endpoint = Endpoint(base_url, "/v1/contratacoes/atualizacao")
        self.proposal_endpoint = Endpoint(base_url, "/v1/contratacoes/proposta")
        # ``endpoint`` remains an alias for callers from the original client.
        self.endpoint = self.publication_endpoint
        self.start_page = _validate_page(initial_page if initial_page is not None else start_page)
        self.default_page_size = _validate_page_size(page_size)
        self.next_page = self.start_page
        self.last_page: int | None = None

    def fetch_publications_page(
        self, query: PncpPublicationQuery, *, page: int = 1, page_size: int = 50
    ) -> PncpPage:
        return self._fetch_page(self.publication_endpoint, query, page, page_size)

    def fetch_updates_page(
        self, query: PncpPublicationQuery, *, page: int = 1, page_size: int = 50
    ) -> PncpPage:
        return self._fetch_page(self.update_endpoint, query, page, page_size)

    def fetch_atualizacoes_page(
        self, query: PncpPublicationQuery, *, page: int = 1, page_size: int = 50
    ) -> PncpPage:
        """Portuguese alias for callers that mirror the endpoint name."""

        return self.fetch_updates_page(query, page=page, page_size=page_size)

    def fetch_atualizacao_page(
        self, query: PncpPublicationQuery, *, page: int = 1, page_size: int = 50
    ) -> PncpPage:
        return self.fetch_updates_page(query, page=page, page_size=page_size)

    def fetch_proposals_page(
        self, query: PncpPublicationQuery, *, page: int = 1, page_size: int = 50
    ) -> PncpPage:
        return self._fetch_page(self.proposal_endpoint, query, page, page_size)

    def fetch_propostas_page(
        self, query: PncpPublicationQuery, *, page: int = 1, page_size: int = 50
    ) -> PncpPage:
        """Portuguese alias for callers that mirror the endpoint name."""

        return self.fetch_proposals_page(query, page=page, page_size=page_size)

    def fetch_proposta_page(
        self, query: PncpPublicationQuery, *, page: int = 1, page_size: int = 50
    ) -> PncpPage:
        return self.fetch_proposals_page(query, page=page, page_size=page_size)

    def iter_publications(
        self,
        query: PncpPublicationQuery,
        *,
        page_size: int | None = None,
        start_page: int | None = None,
        page: int | None = None,
    ) -> Iterator[JsonObject]:
        yield from self._iter_endpoint(
            self.publication_endpoint,
            query,
            page_size=page_size,
            start_page=_coalesce_page(start_page, page),
        )

    def iter_updates(
        self,
        query: PncpPublicationQuery,
        *,
        page_size: int | None = None,
        start_page: int | None = None,
        page: int | None = None,
    ) -> Iterator[JsonObject]:
        yield from self._iter_endpoint(
            self.update_endpoint,
            query,
            page_size=page_size,
            start_page=_coalesce_page(start_page, page),
        )

    def iter_atualizacoes(
        self,
        query: PncpPublicationQuery,
        *,
        page_size: int | None = None,
        start_page: int | None = None,
        page: int | None = None,
    ) -> Iterator[JsonObject]:
        yield from self.iter_updates(query, page_size=page_size, start_page=start_page, page=page)

    def iter_atualizacao(
        self,
        query: PncpPublicationQuery,
        *,
        page_size: int | None = None,
        start_page: int | None = None,
        page: int | None = None,
    ) -> Iterator[JsonObject]:
        yield from self.iter_updates(query, page_size=page_size, start_page=start_page, page=page)

    def iter_proposals(
        self,
        query: PncpPublicationQuery,
        *,
        page_size: int | None = None,
        start_page: int | None = None,
        page: int | None = None,
    ) -> Iterator[JsonObject]:
        yield from self._iter_endpoint(
            self.proposal_endpoint,
            query,
            page_size=page_size,
            start_page=_coalesce_page(start_page, page),
        )

    def iter_propostas(
        self,
        query: PncpPublicationQuery,
        *,
        page_size: int | None = None,
        start_page: int | None = None,
        page: int | None = None,
    ) -> Iterator[JsonObject]:
        yield from self.iter_proposals(query, page_size=page_size, start_page=start_page, page=page)

    def iter_proposta(
        self,
        query: PncpPublicationQuery,
        *,
        page_size: int | None = None,
        start_page: int | None = None,
        page: int | None = None,
    ) -> Iterator[JsonObject]:
        yield from self.iter_proposals(query, page_size=page_size, start_page=start_page, page=page)

    def _fetch_page(
        self,
        endpoint: Endpoint,
        query: PncpPublicationQuery,
        page: int,
        page_size: int,
    ) -> PncpPage:
        payload = self.http.get(endpoint.url, query.to_params(page, page_size))
        raw_items = payload.get("data", [])
        if not isinstance(raw_items, list):
            raise ValueError("PNCP retornou campo data em formato inesperado")
        items = tuple(item for item in raw_items if isinstance(item, dict))
        return PncpPage(
            items=items,
            page=_as_int(payload.get("numeroPagina"), page),
            total_pages=_as_int(payload.get("totalPaginas"), 0),
            remaining_pages=_as_int(payload.get("paginasRestantes"), 0),
        )

    def _iter_endpoint(
        self,
        endpoint: Endpoint,
        query: PncpPublicationQuery,
        *,
        page_size: int | None,
        start_page: int | None,
    ) -> Iterator[JsonObject]:
        page_number = _validate_page(self.start_page if start_page is None else start_page)
        size = self.default_page_size if page_size is None else _validate_page_size(page_size)
        self.next_page = page_number
        while True:
            page = self._fetch_page(endpoint, query, page=page_number, page_size=size)
            self.last_page = page.page
            yield from page.items
            # The saved cursor is the *next* page to request, not the page just
            # read.  This is the value used by checkpoint.complete().
            next_page = max(page_number, page.page) + 1
            self.next_page = next_page
            if page.remaining_pages <= 0 and (
                page.total_pages == 0 or page.page >= page.total_pages
            ):
                return
            page_number = next_page


def _validate_page(page: int) -> int:
    if page < 1:
        raise ValueError("page deve ser maior ou igual a 1")
    return page


def _coalesce_page(start_page: int | None, page: int | None) -> int | None:
    if start_page is not None and page is not None and start_page != page:
        raise ValueError("start_page e page não podem divergir")
    return start_page if start_page is not None else page


def _validate_page_size(page_size: int) -> int:
    if not 10 <= page_size <= 50:
        raise ValueError("page_size deve estar entre 10 e 50 conforme o OpenAPI atual do PNCP")
    return page_size


def _as_int(value: Any, default: int) -> int:
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"PNCP retornou contador inválido: {value!r}") from error


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
