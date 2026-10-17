import json
from pathlib import Path

from src.normalizer import normalize_pncp_publication

FIXTURE = Path(__file__).parent / "fixtures" / "pncp_publicacao_page_1.json"


def test_normalizer_maps_official_pncp_shape() -> None:
    payload = json.loads(FIXTURE.read_text())
    tender = normalize_pncp_publication(payload["data"][0], "00000000-0000-0000-0000-000000000001")

    assert tender.fonte == "pncp"
    assert tender.id_externo == "12345678000199-1-000042/2026"
    assert tender.titulo == "Aquisição de materiais de escritório"
    assert tender.orgao == "Órgão Público de Exemplo"
    assert tender.uf == "DF"
    assert tender.uasg == "123456"
    assert tender.valor_estimado is not None
    assert tender.hash_conteudo
    assert "Entrega conforme edital" in tender.conteudo_texto


def test_hash_changes_when_source_content_changes() -> None:
    payload = json.loads(FIXTURE.read_text())
    original = normalize_pncp_publication(payload["data"][0], "tenant")
    changed_payload = {**payload["data"][0], "objetoCompra": "Objeto revisado"}
    changed = normalize_pncp_publication(changed_payload, "tenant")

    assert original.hash_conteudo != changed.hash_conteudo
