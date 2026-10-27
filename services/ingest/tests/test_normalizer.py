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


def test_normalizer_maps_observed_expansion_fields_only() -> None:
    payload = json.loads(FIXTURE.read_text())
    source = {
        **payload["data"][0],
        "sistemaOrigemNome": "Compras.gov.br",
        "tipoInstrumentoConvocatorioId": "1",
        "tipoInstrumentoConvocatorioNome": "Edital",
        "situacaoCompraNome": "Divulgada no PNCP",
        "esferaNome": "Federal",
        "poderNome": "Executivo",
        "srp": True,
        "dataAtualizacao": "2026-10-02T12:00:00Z",
        "dataAberturaProposta": "2026-10-03T12:00:00Z",
        "dataEncerramentoProposta": "2026-10-04T12:00:00Z",
        "valorTotalHomologado": 12000,
    }

    tender = normalize_pncp_publication(source, "tenant")

    assert tender.sistema_origem == "Compras.gov.br"
    assert tender.codigo_modalidade == 8
    assert tender.codigo_modo_disputa == 1
    assert tender.codigo_instrumento == "1"
    assert tender.instrumento == "Edital"
    assert tender.modo_disputa == "Aberto"
    assert tender.situacao == "Divulgada no PNCP"
    assert tender.esfera == "Federal"
    assert tender.poder == "Executivo"
    assert tender.municipio_nome == "Brasília"
    assert tender.srp is True
    assert tender.valor_homologado is not None
    assert tender.data_abertura_propostas == tender.data_abertura_proposta


def test_normalizer_does_not_turn_absence_into_false_or_estimated_value() -> None:
    payload = json.loads(FIXTURE.read_text())
    tender = normalize_pncp_publication(payload["data"][0], "tenant")

    assert tender.srp is None
    assert tender.valor_homologado is None
    assert tender.situacao is None
    assert tender.data_abertura_proposta is None


def test_normalizer_maps_buyer_identity_and_legal_basis() -> None:
    payload = json.loads(FIXTURE.read_text())
    source = {
        **payload["data"][0],
        "processo": "00123.000456/2026-11",
        "amparoLegal": {"codigo": 1, "nome": "Lei 14.133/2021, Art. 28, I"},
        "orgaoEntidade": {
            "cnpj": "12.345.678/0001-99",
            "razaoSocial": "Órgão Público de Exemplo",
            "esferaId": "F",
            "poderId": "E",
        },
    }

    tender = normalize_pncp_publication(source, "tenant")

    assert tender.orgao_cnpj == "12345678000199"
    assert tender.numero_compra == "42/2026"
    assert tender.processo == "00123.000456/2026-11"
    assert tender.amparo_legal == "Lei 14.133/2021, Art. 28, I"
    assert tender.informacao_complementar == "Entrega conforme edital e anexos."
    assert tender.esfera == "Federal"
    assert tender.poder == "Executivo"


def test_unknown_sphere_and_power_codes_stay_empty() -> None:
    payload = json.loads(FIXTURE.read_text())
    source = {
        **payload["data"][0],
        "orgaoEntidade": {"cnpj": "12345678000199", "esferaId": "?", "poderId": "Z"},
    }

    tender = normalize_pncp_publication(source, "tenant")

    assert tender.esfera is None
    assert tender.poder is None
