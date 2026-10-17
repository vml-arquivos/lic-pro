# Fase 2 — fontes oficiais consultadas

A implementação dos conectores usa somente contratos encontrados nas documentações oficiais consultadas em 17/10/2026.

## PNCP

A API de consulta pública usa a base `https://pncp.gov.br/api/consulta`. O OpenAPI oficial expõe `GET /v1/contratacoes/publicacao`, com `dataInicial`, `dataFinal`, `codigoModalidadeContratacao` e `pagina` obrigatórios. Os filtros opcionais incluem modo de disputa, UF, município IBGE, CNPJ, unidade administrativa e usuário. O OpenAPI vigente consultado limita `tamanhoPagina` a 50; o cliente usa 50 por padrão e não assume o limite histórico de manuais anteriores. As datas são serializadas em `AAAAMMDD` conforme o manual oficial de consultas.

A normalização usa os campos oficiais `numeroControlePNCP`, `objetoCompra`, `orgaoEntidade`, `unidadeOrgao`, `modalidadeNome`, `valorTotalEstimado`, `dataPublicacaoPncp` e `linkSistemaOrigem`. Quando a fonte não retorna evidência, o campo interno fica vazio; não há preenchimento especulativo.

## Compras.gov.br

O manual oficial da API de dados abertos documenta `https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial` para itens CATMAT, `https://dadosabertos.compras.gov.br/modulo-servico/6_consultarItemServico` para itens CATSER, `.../modulo-pesquisa-preco/1_consultarMaterial` para preços de materiais e `.../modulo-pesquisa-preco/3_consultarServico` para preços de serviços. Os clientes preservam os nomes de parâmetros publicados, como `codigoItemCatalogo`, `codigoUasg`, `estado`, `codigoMunicipio`, `dataResultado` e `codigoClasse`.

Os testes usam fixtures locais e transportes falsos. Nenhum teste depende da rede externa.

## Referências

- [1]: https://pncp.gov.br/pncp-consulta/v3/api-docs 'OpenAPI oficial da API de consulta do PNCP'
- [2]: http://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/ManualPNCPAPIConsultasVerso1.0.pdf/@@display-file/file 'Manual oficial das APIs de consultas PNCP'
- [3]: https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais/manual-dados-abertos/manual-api-compras.pdf 'Manual oficial da API de dados abertos do Compras.gov.br'
