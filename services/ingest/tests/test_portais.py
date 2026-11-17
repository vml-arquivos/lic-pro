from src.portais import host_do_link, portal_da_licitacao, slug_de_portal


def test_same_names_as_shared_package() -> None:
    cases = [
        ("BLL - Bolsa de Licitações e Leilões do Brasil", "bll-compras"),
        ("BNC - Bolsa Nacional de Compras", "bnc"),
        ("COMPRASNET 4.0", "compras-gov-br"),
        ("Compras.gov.br", "compras-gov-br"),
    ]
    for usuario, slug in cases:
        found = portal_da_licitacao(usuario=usuario)
        assert found is not None and found.slug == slug and found.conhecido


def test_link_and_object_prefix_fallbacks() -> None:
    link = portal_da_licitacao(link="https://app.licitanet.com.br/x")
    assert link is not None and link.slug == "licitanet"
    prefixed = portal_da_licitacao(objeto="[Portal de Compras Públicas] - Aquisição de material")
    assert prefixed is not None and prefixed.slug == "portal-de-compras-publicas"
    assert portal_da_licitacao(objeto="[Urgente] - Aquisição de material") is None


def test_short_names_only_match_whole_words() -> None:
    found = portal_da_licitacao(usuario="Abnconsultoria")
    assert found is not None and not found.conhecido


def test_helpers() -> None:
    assert host_do_link("www.bnc.org.br/x") == "bnc.org.br"
    assert host_do_link("texto qualquer") is None
    assert slug_de_portal("Licitações-e (BB)") == "licitacoes-e-bb"
    assert slug_de_portal("???") == "portal"
    assert portal_da_licitacao() is None
