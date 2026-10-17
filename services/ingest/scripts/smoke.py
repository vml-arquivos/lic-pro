"""Opt-in smoke test; never run from CI or regular tests."""

from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.clients import ComprasGovClient, PncpClient  # noqa: E402
from src.http import ResilientJsonClient, UrllibJsonTransport  # noqa: E402
from src.models import PncpPublicationQuery  # noqa: E402
from src.normalizer import normalize_pncp_publication  # noqa: E402


def main() -> int:
    if os.getenv('RUN_INGEST_SMOKE') != '1':
        print('Smoke não executado: defina RUN_INGEST_SMOKE=1 explicitamente.')
        return 0

    transport = UrllibJsonTransport(timeout_seconds=10)
    http = ResilientJsonClient(transport, max_retries=0)
    start = date.fromisoformat(os.getenv('PNCP_SMOKE_START_DATE', str(date.today() - timedelta(days=1))))
    end = date.fromisoformat(os.getenv('PNCP_SMOKE_END_DATE', str(date.today())))
    query = PncpPublicationQuery(
        start_date=start,
        end_date=end,
        modality_code=int(os.getenv('PNCP_SMOKE_MODALITY_CODE', '6')),
        uf=os.getenv('PNCP_SMOKE_UF') or None,
    )

    pncp = PncpClient(http, os.getenv('PNCP_BASE_URL', 'https://pncp.gov.br/api/consulta'))
    compras = ComprasGovClient(http, os.getenv('COMPRAS_GOV_BASE_URL', 'https://dadosabertos.compras.gov.br'))
    pncp_payload = pncp.fetch_publications_page(query, page=1, page_size=10)
    compras_payload = compras.catalog_materials(page=1, page_size=1)

    print(_report('PNCP', pncp_payload.items[0] if pncp_payload.items else {}, {
        'numeroControlePNCP', 'objetoCompra', 'orgaoEntidade', 'unidadeOrgao'
    }))
    if pncp_payload.items:
        try:
            normalize_pncp_publication(pncp_payload.items[0], 'smoke-tenant')
            print('PNCP normalizador: OK')
        except ValueError as error:
            print(f'PNCP normalizador: FALHOU — {error}')
            return 1
    print(_report('Compras.gov.br', compras_payload, {'resultado', 'totalRegistros', 'totalPaginas'}))
    return 0


def _report(source: str, payload: dict[str, Any], expected: set[str]) -> str:
    observed = set(payload)
    missing = sorted(expected - observed)
    new = sorted(observed - expected)
    return f'{source}: campos_ausentes={missing or []}; campos_novos={new or []}; requisicoes=1'


if __name__ == '__main__':
    raise SystemExit(main())
