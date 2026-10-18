# Nichos, filtros por seleção e painéis — outubro de 2026

## Decisão de produto

O Radar passa a trabalhar com filtros de seleção. O usuário escolhe de um a três nichos no cadastro ou no onboarding; o Radar, as buscas salvas e os alertas usam esses nichos como escopo padrão. A conta pode estreitar a pesquisa por UF, esfera, modalidade, modo de disputa, situação, instrumento, fonte, CATMAT/CATSER observado e prazo, sempre por `select`.

A escolha de nicho é uma preferência de descoberta. Ela não prova CNAE, habilitação, capacidade técnica ou elegibilidade. Um resultado só aparece quando o edital capturado contém correspondência nos campos indexados e continua exigindo leitura do edital e da fonte original.

## Evidência das fontes

O OpenAPI público do [PNCP](https://pncp.gov.br/pncp-consulta/v3/api-docs) documenta consultas de contratação por publicação, atualização e recebimento de propostas, com filtros oficiais como modalidade, modo de disputa, UF, município IBGE, CNPJ e unidade administrativa. A mesma especificação prevê `204 No Content`; o transporte do ingest trata esse estado sem inferir conteúdo.

A documentação interativa do [Compras.gov.br Dados Abertos](https://dadosabertos.compras.gov.br/swagger-ui/index.html) expõe módulos públicos de CATMAT, CATSER, preços, licitações, contratos, atas, fornecedores, UASG e OCDS. O [Catálogo de Compras](https://catalogo.compras.gov.br/) é a referência para bens e serviços catalogados; códigos CATMAT/CATSER devem ser exibidos como dados observados, não como texto inventado.

A [CNAE da CONCLA/IBGE](https://concla.ibge.gov.br/busca-online-cnae.html) é uma taxonomia oficial de atividades econômicas. O catálogo inicial do produto usa seções e famílias de navegação derivadas dela e de vocabulário de contratação pública. Esses itens são rótulos de descoberta, com origem declarada, e não substituem uma consulta oficial de CNAE, CATMAT ou CATSER.

O [Alerta Licitação](https://alertalicitacao.com.br/) confirma padrões de uso úteis para o produto: segmentação por atuação e região, buscas salvas e alertas por canais. O blueprint também registra Licis e Alerta Licitações como benchmarks de experiência, nunca como dependências, fonte de dados, API ou catálogo a ser copiado. O produto continua usando apenas PNCP e Compras.gov.br em superfícies públicas autorizadas.

## Escopo técnico

- `usuarios.nicho_preferencias` guarda de um a três códigos por conta, com RLS herdado da tabela de usuários.
- O cadastro e o onboarding enviam os códigos selecionados; o backend valida o catálogo e rejeita códigos desconhecidos.
- O endpoint de filtros retorna UFs oficiais e domínios realmente observados no tenant, além do catálogo de nichos com sua origem.
- O Radar não recebe mais texto livre. Cada filtro é um `select`; CATMAT/CATSER é preenchido pelos códigos/descrições observados na base.
- O Core API aplica as preferências de nicho para usuários comuns. Um usuário só pode estreitar a busca dentro dos próprios nichos; sem preferência cadastrada, o Radar pede onboarding em vez de mostrar dados sem escopo.
- Buscas salvas e alertas persistem os códigos e os termos de correspondência derivados do catálogo. A deduplicação e a proveniência já existentes permanecem ativas.
- O menu expõe somente rotas reais: Radar, pregões publicados (não “ao vivo”), oportunidades salvas, alertas, buscas, empresas, Academia, Ana e painéis autorizados. Módulos demo continuam fora do menu em produção.
- O seletor de contexto altera apenas `perfil_jornada` por meio do endpoint protegido. Ele não concede papel técnico, empresa, concessão de mentor ou acesso tenant-wide; as autorizações continuam sendo verificadas no backend.

## Limites preservados

Não haverá integração com Licis ou Alerta Licitações sem contrato/API autorizada, scraping ou cópia de catálogo proprietário. “Pregões” será apresentado como contratação publicada/capturada, com última verificação e link oficial. “Ao vivo”, lances, chat, envio de proposta, Gov.br, SICAF e operação transacional permanecem no portal oficial.
