# Blueprint de decisão para expansão do Licite Comigo

**Status:** decisão de produto e arquitetura, sem alteração de código
**Base:** oito relatórios de pesquisa e inspeção do monorepo; 110 referências citadas nos relatórios (há URLs repetidas entre frentes).
**Escopo:** descoberta, atualização, análise e organização de oportunidades de contratação pública no Brasil, com integração somente leitura às fontes oficiais.

## 0. Decisão executiva

O Licite Comigo deve evoluir como **radar brasileiro orientado a evidências**, tendo o **PNCP** como espinha dorsal de descoberta/atualização e o **Compras.gov.br Dados Abertos** como enriquecimento federal (CATMAT, CATSER, UASG, preços, licitações, contratos, atas e resultados). O produto não deve se posicionar como portal de compras, participante de sessão, operador de lances ou substituto do edital.

A experiência recomendada é:

1. **Radar:** busca local, explicável e tenant-scoped sobre dados oficialmente ingeridos.
2. **Oportunidade canônica:** uma identidade oficial, múltiplas versões, itens, resultados, documentos e links de origem.
3. **Reader/Ana:** análise documental somente com trechos/evidências da versão capturada, em modo somente leitura e com revisão humana.
4. **Alertas:** correspondências novas, prazo de propostas, retificações e mudanças de situação; primeiro in-app, depois e-mail opt-in.
5. **Pipeline:** tarefas, checklist, agenda e decisões internas, sem transmitir ações ao portal externo.
6. **Painéis com capacidades:** empresário, mentorado, mentor, administrador e operação são experiências/escopos distintos; nenhum botão ou persona no cliente concede autorização.
7. **Proveniência visível:** fonte, URL, identificador, data de publicação, última atualização da origem, captura, versão/hash, estado do documento e eventual atraso.

### Decisão de fronteira

| Classe                          | Significado para o produto                                                                                                                              | Exemplos                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pública já possível**         | Pode ser feita por consulta oficial pública/sem credencial, ou com dados já disponíveis no monorepo; exige ingestão, normalização e controles próprios. | Radar PNCP, resultados de Compras.gov.br, filtros locais, links oficiais, versões, Reader sobre documentos capturados, alertas in-app, pipeline e exportação própria.                                |
| **Exige parceria/API/contrato** | Só entra após documentação pública suficiente, autorização da fonte, contrato/licença, credenciais e SLA/limites acordados.                             | Fontes privadas ou adicionais sem API pública, WhatsApp empresarial, Google Sheets OAuth, feed autorizado de sessão, catálogo de terceiros, cobertura além das APIs oficiais.                        |
| **Não deve ser automatizada**   | A fronteira do produto permanece humana ou no portal oficial; não guardar credenciais de fornecedor nem simular operações.                              | Cadastro Gov.br/SICAF, envio/alteração de proposta, lance, chat de disputa, recurso, impugnação, assinatura, protocolo, CAPTCHA, scraping de UI autenticada e recomendação automática de estratégia. |

**Regra de comunicação:** usar “atualização observada”, “última captura” e “monitoramento por polling” por padrão. Reservar “ao vivo/tempo real” somente para um feed oficial ou integração autorizada que publique essa garantia e seus limites.

---

## 1. Fontes oficiais, contratos e proveniência

### 1.1 Registro de fontes aprovado

| Fonte                                                                                                                                                                                                                             | O que sustenta                                                                                                                   | Superfície autorizada no baseline                                                                                                                                                     | Autenticação e limite conhecido                                                                                                                                                                               | Decisão de uso                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [PNCP](https://pncp.gov.br/api/consulta) / [OpenAPI de consulta](https://pncp.gov.br/pncp-consulta/v3/api-docs)                                                                                                                   | Contratações, propostas abertas, atualizações globais, detalhes, itens, resultados, documentos, atas, contratos, PCA e domínios. | `GET /v1/contratacoes/publicacao`, `/atualizacao`, `/proposta`, detalhes em `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}` e sub-recursos; depois atas/contratos/PCA conforme escopo. | Consulta pública sem login. Para contratações/propostas, o OpenAPI vigente limita `tamanhoPagina` a 10–50; atas/contratos/PCA chegam a 500 e instrumentos de cobrança a 100. Não há quota/SLA/429 publicados. | Fonte primária. Polling conservador, janelas curtas, sobreposição, backoff e reconciliação.         |
| [PNCP Manual de Consultas](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/ManualPNCPAPIConsultasVerso1.0.pdf/@@display-file/file) e [Manual de Integração](https://pncp.gov.br/manual/pt-br/latest/singlehtml/)               | Semântica de campos, datas `AAAAMMDD`, domínios, documentos e limite histórico.                                                  | Referência sem substituir o contrato OpenAPI atual.                                                                                                                                   | A API de manutenção em `/api/pncp` exige credenciamento/JWT para escrita; não é necessária para leitura e não será usada pelo radar.                                                                          | Usar para interpretação, fixtures e revisão; seguir OpenAPI atual quando houver conflito.           |
| [Compras.gov.br Dados Abertos](https://www.gov.br/compras/pt-br/cidadao/portal-de-dados-abertos) / [OpenAPI](https://dadosabertos.compras.gov.br/v3/api-docs)                                                                     | Licitações legadas e 14.133, resultados, UASG, CATMAT/CATSER, preços, planejamento, atas, contratos, fornecedores e OCDS.        | Consultas GET públicas documentadas; começar por licitações, itens, resultados, catálogo e preços.                                                                                    | O contrato publicado não exige bearerAuth para consultas públicas; regras de autenticação e schema devem ser testadas periodicamente.                                                                         | Enriquecimento federal e fonte complementar, nunca sinônimo de cobertura nacional.                  |
| [IBGE/CONCLA — CNAE](https://concla.ibge.gov.br/busca-online-cnae.html)                                                                                                                                                           | Taxonomia oficial para perfil e sugestão de termos.                                                                              | Catálogo/cache de códigos e descrições.                                                                                                                                               | Sem credencial de fornecedor.                                                                                                                                                                                 | CNAE é sinal de relevância, não filtro oficial universal nem prova de habilitação.                  |
| [Lei 14.133/2021](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm), [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) e materiais [ANPD](https://www.gov.br/anpd/) | Fronteira de publicidade, fases, proteção de dados, finalidade, segurança, direitos e incidentes.                                | Regras de produto, textos de aviso, retenção e controles.                                                                                                                             | Não são APIs.                                                                                                                                                                                                 | Revisão jurídica é condição de lançamento de documentos, alertas multicanal, IA e exportação ampla. |

**Fontes de benchmark não são dependências:** Licis e Alerta Licitações servem para comparar simplicidade, buscas salvas, e-mail, agenda, exportação e cobertura declarada. Seus catálogos/APIs não devem ser copiados; os termos da API do Alerta Licitações proíbem alimentar um concorrente de alertas e impõem uma chamada por segundo.

### 1.2 Envelope de proveniência obrigatório

Toda entidade, versão, item, resultado e documento deve conseguir apontar para um envelope de captura. O mínimo é:

- `source_id`, `source_kind` e `source_contract_version`;
- `source_url`, método HTTP, rota e query normalizada;
- `source_record_id` (`numeroControlePNCP` quando disponível) e identificador de origem;
- `captured_at` em UTC e datas de negócio preservadas no fuso de Brasília quando aplicável;
- `source_published_at`, `source_updated_at`/`dataAtualizacaoGlobal`, quando fornecidos;
- status HTTP, bytes, URL final e cabeçalhos permitidos (`ETag`, `Last-Modified`, `Cache-Control`);
- `raw_sha256`, `normalized_sha256`, `adapter_version`, `normalizer_version` e `document/extraction_version`;
- tenant/empresa de escopo, estado de completude (`completo`, `parcial`, `pendente`, `não informado`) e motivo de falha;
- link para a página/sistema de origem e, quando houver arquivo, tipo oficial, título, tamanho, checksum e estado do download.

Guardar o JSON bruto de forma imutável ou append-only, fora dos logs; campos desconhecidos não devem ser descartados. O produto deve dizer **“não informado”**, **“sigiloso”**, **“documento pendente”** ou **“fonte atrasada”**, em vez de inferir zero, aberto, federal ou elegível.

Identidade recomendada: `fonte + numeroControlePNCP`. Para recursos sem esse identificador, usar a chave oficial composta (por exemplo, CNPJ + ano + sequencial) e nunca título, valor ou hash como identidade única. O hash serve para detectar mudança e criar versão.

---

## 2. Matriz textual de funcionalidades reais

| Funcionalidade                                  | Classificação                                             | O que é possível/observado                                                                                                                            | Limite e decisão de implementação                                                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Radar de contratações PNCP                      | Pública já possível                                       | Consulta pública por publicação, propostas abertas e atualização; filtros oficiais de modalidade, modo, UF, município IBGE, CNPJ, unidade e usuário.  | Ingestão em janelas/partições, `tamanhoPagina` 10–50 para contratações, `query_hash` no checkpoint e aviso de cobertura dependente do órgão.                          |
| Enriquecimento Compras.gov.br                   | Pública já possível                                       | Dados federais de licitações, itens, resultados, CATMAT/CATSER, UASG e preços.                                                                        | Separar `fonte` e `sistema_origem`; não anunciar cobertura nacional por usar Compras.gov.br.                                                                          |
| Busca por texto, itens e relevância             | Pública já possível                                       | Objeto, complemento, itens e documentos capturados podem ser indexados no PostgreSQL/GIN/pgvector; o endpoint PNCP não documenta busca textual livre. | Fazer filtro textual local, literal + semântico explicável. Score não é elegibilidade nem habilitação.                                                                |
| CNAE, CATMAT/CATSER e perfil                    | Pública já possível                                       | CATMAT/CATSER podem enriquecer dados federais; CNAE pode sugerir termos e priorizar.                                                                  | Exibir origem e fatores. CNAE não prova capacidade técnica, regularidade, atestado ou exclusividade ME/EPP.                                                           |
| Itens, resultados e histórico publicado         | Pública já possível                                       | PNCP expõe itens, resultados, quantidades/valores homologados, fornecedor, situação e datas; atualizações permitem retificação.                       | É histórico de publicação/resultados, não replay de lances nem todas as propostas concorrentes.                                                                       |
| Documentos e Reader                             | Pública já possível, com controles                        | Metadados e downloads de documentos oficiais; Reader existente trabalha com trechos/evidências.                                                       | Download assíncrono, limite de 30 MB conforme Manual PNCP, MIME/bytes/páginas/timeout, quarentena, hash e OCR isolado. Documento ausente não invalida a oportunidade. |
| Busca salva e favoritos                         | Pública já possível                                       | O modelo atual já tem oportunidades salvas, pipeline, prazos, tarefas e notificações.                                                                 | Separar favorito pessoal de oportunidade da empresa; registrar versão da busca, última execução e motivo do match.                                                    |
| Alertas in-app                                  | Pública já possível                                       | Eventos `edital.novo`/`edital.atualizado`, propostas abertas e datas permitem novos matches, prazo, retificação e situação.                           | Primeiro canal do MVP; deduplicar por oportunidade/versão/regra e mostrar fonte, timestamp e prazo exato.                                                             |
| E-mail transacional/digest                      | Exige parceiro/infra própria                              | O benchmark Licis confirma valor de digest diário; o monorepo pode gerar o conteúdo próprio.                                                          | Requer provedor, domínio, SPF/DKIM/DMARC, outbox, opt-in/out, bounce, supressão e auditoria. Não usar API de concorrente.                                             |
| WhatsApp/SMS/push externo                       | Exige parceria/API/contrato                               | Não há base oficial do PNCP para esses canais.                                                                                                        | Só após provedor autorizado, consentimento, templates, custo, DPA, rate limit e segregação por empresa.                                                               |
| Exportação CSV/XLSX própria                     | Pública já possível                                       | Dados próprios filtrados podem ser exportados com link oficial e captura.                                                                             | Job assíncrono, limite de volume, auditoria, tenant, aviso de que a planilha não substitui edital. Google Sheets exige OAuth/parceria de API.                         |
| Painel empresário/mentorado/mentor              | Pública já possível na camada interna                     | RLS, empresas, vínculos, concessões, Academia, Radar, Reader e pipeline já existem em graus diferentes.                                               | Consolidar capacidades; várias telas/rotas são placeholders e não devem exibir dados fictícios.                                                                       |
| Painel admin/operação                           | Pública já possível após trabalho de produto              | Checkpoints, readiness, retries, DLQ, leads, auditoria e concessões já têm base parcial.                                                              | Criar rotas/painéis reais; separar administrador de operador e restringir leitura de negócio.                                                                         |
| Monitoramento “quase atual”                     | Pública já possível como polling                          | Consulta por atualização e propostas abertas permite reconsulta frequente.                                                                            | Mostrar `last_checked_at`/`source_updated_at`; não prometer cadência, SLA ou evento instantâneo que a fonte não oferece.                                              |
| Pregão ao vivo com todos os lances/chat         | Exige parceria/API autorizada; não disponível no baseline | APIs públicas analisadas não publicam WebSocket/SSE/webhook nem histórico completo de lances/chat.                                                    | Não anunciar. Exibir estado agregado e histórico publicado; encaminhar ao portal oficial.                                                                             |
| Cadastro, proposta, lance, recurso e assinatura | Não deve ser automatizada                                 | Compras.gov.br exige autenticação do fornecedor/SICAF/Gov.br e o aplicativo confirma operações autenticadas.                                          | Sem cookies, Gov.br, SICAF, certificados ou automação de navegador; deep-link e checklist apenas.                                                                     |
| Scraping de UI, CAPTCHA e endpoints privados    | Não deve ser automatizada                                 | Não há autorização operacional nas fontes para capturar tráfego privado.                                                                              | Usar somente contratos oficiais; qualquer nova fonte passa por revisão técnica/jurídica.                                                                              |

---

## 3. Catálogo de busca e filtros

A interface deve separar **filtro de descoberta**, **filtro de relevância**, **fase do processo** e **tipo de instrumento**. Não usar um único campo “tipo” que misture pregão, dispensa, PCA e contrato.

| Grupo                  | Filtros/campos                                                                                                          | Origem e comportamento                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Texto                  | Palavra-chave, frase, exclusões, siglas, objeto, complemento e itens                                                    | Avaliação local após ingestão; normalizar caixa/acentos/hífens e conservar texto original. Busca semântica complementa a literal e mostra os termos/trechos que causaram o match. |
| Perfil/classificação   | CATMAT, CATSER, código/descrição de catálogo, CNAE da empresa e sinônimos revisáveis                                    | CATMAT/CATSER vêm de Compras.gov.br quando publicados; CNAE é preferência/sugestão do perfil, nunca prova jurídica.                                                               |
| Escopo federativo      | Esfera federal/estadual/municipal/distrital; poder quando informado                                                     | Derivar de `orgaoEntidade`; não inferir esfera apenas pela UF. Filtro vazio pode significar ausência/atraso de publicação.                                                        |
| Localidade             | UF, município, código IBGE, proximidade/distância opcional                                                              | PNCP fornece UF e município IBGE; distância é computada localmente com ponto/centroide e deve indicar precisão.                                                                   |
| Órgão/unidade          | CNPJ e nome do órgão, código/nome da unidade, UASG quando aplicável                                                     | CNPJ/unidade são identificadores oficiais; listas devem refletir entidades com publicação, não um cadastro nacional completo.                                                     |
| Tempo                  | Data de publicação, inclusão, última atualização, início e encerramento de propostas, abertura/sessão quando disponível | Cada data precisa de rótulo. “Publicado recentemente” não equivale a “recebe proposta”. Usar fuso de Brasília na UX e UTC no armazenamento técnico.                               |
| Instrumento/modalidade | Edital, aviso de contratação direta, ato autorizativo; modalidades e códigos PNCP; pregão/concorrência/leilão etc.      | Carregar domínios oficiais (`/v1/modalidades`) e versionar nome/ID/status.                                                                                                        |
| Disputa                | Aberto, fechado, aberto-fechado, dispensa com disputa, não se aplica, fechado-aberto                                    | Domínio PNCP versionado; não assumir que modo publicado fornece eventos ao vivo.                                                                                                  |
| Estado                 | Divulgada, em andamento, suspensa, revogada, anulada; item homologado, deserto, fracassado, cancelado                   | Separar situação da contratação e situação do item. Nunca continuar recomendando como aberta uma oportunidade encerrada/revogada/anulada/suspensa.                                |
| Valor                  | Estimado mínimo/máximo, homologado, “não informado”, “sigiloso”                                                         | Zero pode significar orçamento sigiloso sem resultado; não tratar como contratação gratuita.                                                                                      |
| SRP/relacionados       | Registro de preços, PCA, IRP, ata, contrato, empenho                                                                    | Exibir PCA/IRP/ata/contrato como relacionados e não como edital aberto.                                                                                                           |
| Fonte                  | PNCP, Compras.gov.br, portal/sistema de origem, rota e status da fonte                                                  | Diferenciar **fonte de ingestão** de **sistema de origem**; link oficial sempre clicável.                                                                                         |
| Confiança/completude   | Documento disponível/pendente, captura atrasada, campos ausentes, resultado confirmado, exclusividade ME/EPP            | Valores triestado: confirmado, extraído de documento com evidência/confiabilidade, não informado.                                                                                 |

### Relevância explicável

A ordenação deve priorizar, nessa ordem configurável: filtros obrigatórios; correspondência exata de código; frase/termo em objeto, item e documento; UF/município/esfera; modalidade/instrumento; faixa de valor; proximidade do encerramento; atualização recente; feedback do usuário. O cartão precisa mostrar “por que apareceu” e “o que não foi verificado”. O score não decide habilitação, não dispensa leitura do edital e não deve eliminar silenciosamente oportunidades por CNAE ausente ou texto genérico.

### Deduplicação

Apresentar “1 oportunidade, N versões/fontes” quando houver cópias ou atualizações. O agrupamento deve manter cada URL, payload e documento. Publicação nova em uma identidade existente gera `edital.atualizado`, com diff; somente identidade desconhecida gera `edital.novo`.

---

## 4. Pregão eletrônico: níveis de atualização e limitações

| Nível                            | Rótulo na UI                                                       | O que o produto pode fazer                                                                                                                      | O que não pode afirmar                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **N0 — lote publicado**          | “Capturado em [data/hora]”                                         | Mostrar contratação, situação, datas, itens, documentos, resultados e histórico de alterações publicado pelo PNCP/Compras.gov.br.               | Não afirmar que o estado é atual neste instante nem que todos os lances estão presentes.                                  |
| **N1 — polling incremental**     | “Última verificação [data/hora]; atualização da fonte [data/hora]” | Reconsultar `/atualizacao` e `/proposta`, com intervalos configuráveis, sobreposição, backoff, checkpoint e alerta de retificação/status/prazo. | Não chamar de “ao vivo”; a fonte não publica SLA/cadência nacional garantida.                                             |
| **N2 — feed oficial autorizado** | “Atualização conforme contrato da fonte”                           | Só se órgão/portal fornecer API, webhook, SSE, WebSocket ou feed documentado, com contrato, permissão, limites, campos, retenção e SLA.         | Não extrapolar para outros portais nem prometer universalidade.                                                           |
| **N3 — operação transacional**   | “Abrir no portal oficial”                                          | Deep-link, checklist, lembrete e registro interno de decisão.                                                                                   | Não cadastrar fornecedor, enviar proposta, dar lance, receber comando de chat, recorrer, impugnar, assinar ou protocolar. |

A Sala de Disputa e o chat são funcionalidades operacionais para agentes e fornecedores participantes. A API pública consultada não demonstra histórico completo de lances, todas as propostas, mensagens, relógio, prorrogação ou sessão em tempo real. A interface deve utilizar “status agregado observado” e encaminhar para o `linkSistemaOrigem`.

**Controle de segurança e concorrência:** não redistribuir estratégia, piso, identidade ou mensagem privada de participantes; anonimizar/limitar qualquer dado pessoal; nunca usar atualização agregada para recomendar lance automático.

---

## 5. Alertas

### 5.1 Eventos do MVP

1. **Nova correspondência:** identidade nova compatível com busca salva, com motivo do match.
2. **Prazo se aproximando:** 7/3/1 dias antes de `dataEncerramentoProposta`, em Brasília, com data/hora exatas e indicação de origem. A política de dias úteis, feriados e tolerância deve ser configurável e explicitada.
3. **Prazo encerrado/indisponível:** mudança para encerrado, suspenso, anulado ou revogado; remover do conjunto “aberto”.
4. **Retificação/atualização:** novo `dataAtualizacaoGlobal`, mudança de hash, documento novo/alterado, valor ou data modificada, com diff e link.
5. **Resultado de item:** homologado, deserto, fracassado, cancelado ou fornecedor/valor publicado; apresentado como inteligência/histórico, nunca como oportunidade aberta.
6. **Planejamento:** PCA/IRP relacionado, separado visualmente e rotulado como intenção futura, não convite vigente.
7. **Saúde da fonte:** falha parcial, atraso além do SLO interno, DLQ ou documento pendente relevante; não gerar falsa confiança de ausência de oportunidades.

### 5.2 Canais e entrega

- **P0:** inbox/in-app, idempotente e vinculada ao tenant/empresa/oportunidade.
- **P1:** e-mail diário ou imediato opt-in, usando outbox, template versionado, SPF/DKIM/DMARC, bounce/supressão, unsubscribe e log de entrega. O digest inspirado no Licis é uma escolha de UX, não uma garantia de cobertura.
- **P2:** WhatsApp/SMS/push somente com provedor, autorização, consentimento, templates, limites, custo, DPA e segregação por empresa.

Cada alerta guarda `alert_rule_version`, `opportunity_id`, versão/hash, motivo, canal, destinatário minimizado, criado/enfileirado/enviado/entregue/aberto/falhou, erro sanitizado e link oficial. Redelivery deve ser idempotente. Preferências e opt-out precisam ser honrados antes da fila de envio.

A busca salva guarda filtros canônicos, versão, tenant/empresa, frequência, janela, canais, última execução, último sucesso e erro. Uma falha de fonte não deve marcar a busca como atualizada com sucesso.

---

## 6. Painéis e permissões por perfil

“Empresário” e “mentorado” são personas/jornadas; `admin`, `operador`, `mentor` e `aluno` são papéis técnicos; `empresa_usuarios` e uma concessão mentor–empresa são escopos adicionais. Não consolidar esses conceitos em um enum único.

| Perfil/escopo                                                                  | Deve ver/fazer                                                                                                                                                       | Não deve fazer por padrão                                                                                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empresário / empresa** (`proprietario`, `administrador`, `membro`, `leitor`) | Radar, oportunidades, versões, itens, Reader/Ana read-only, checklist, prazos, tarefas, pipeline, membros conforme vínculo e exportação se concedida.                | Alterar fonte oficial; conceder acesso de mentor; criar `admin`; atuar em portal externo. Leitor é consulta.                                                                     |
| **Mentorado** (`perfil_jornada`/aluno + vínculo empresarial)                   | Diagnóstico, Academia, progresso próprio, metas/tarefas quando implementadas e oportunidades da empresa ao qual está vinculado.                                      | Ver outros mentorados; alterar editorial; aceitar/revogar concessões; acessar empresa sem vínculo.                                                                               |
| **Mentor** (`mentor` + concessão ativa)                                        | Lista de empresas/mentorados concedidos, progresso, fila de revisão e comentários/sugestões apenas se a capacidade estiver na concessão.                             | Acesso tenant-wide; editar CNPJ/membros/assinaturas; aprovar; conceder acesso a si mesmo; exportar sem capacidade/justificativa. Concessão expirada/revogada nega imediatamente. |
| **Administrador do tenant**                                                    | Usuários, convites, empresas, vínculos, plano/entitlements, concessões, leads e auditoria do próprio tenant; reautenticação/dupla aprovação para mudanças sensíveis. | Invadir outro tenant; tratar operador como administrador de dados; editar fatos da fonte sem trilha.                                                                             |
| **Operação** (`operador`)                                                      | Fontes, contratos, janelas, checkpoints, readiness, filas, retries, DLQ, drift, métricas e reprocessamento técnico controlado.                                       | Leitura ampla de documento, estratégia, conversa ou dados empresariais sem escopo excepcional, temporário e auditado; mudar papéis/concessões.                                   |

### Contrato de capacidades

Adotar default-deny e capacidades tipadas, por exemplo `opportunity.read`, `document.read`, `checklist.comment`, `document.export`, `academy.progress.read`; não interpretar `{}` de `concessoes_mentor.escopo` como acesso amplo. Toda rota verifica usuário, `tenant_id`, `empresa_id`, vínculo/concessão, recurso, ação e validade; RLS continua como defesa server-side, nunca como substituto da autorização de rota.

A auditoria deve registrar login/falha, mudança de papel, vínculo, concessão/revogação, leitura/exportação de documento, correção de evidência, ação da Ana, ingestão/reprocessamento e acesso operacional excepcional. Incluir ator, sujeito, tenant/empresa, recurso, ação, resultado, timestamp, request/correlation ID, origem, versão e justificativa; não incluir tokens, CPF, e-mail completo ou conteúdo integral. Views da auditoria devem ser próprias do escopo: usuário, mentor, admin e operação não enxergam o mesmo histórico.

---

## 7. Modelo de dados e jobs de ingestão

### 7.1 Entidades e mudanças necessárias

1. **`source_connectors` / contratos:** fonte, rota, método, parâmetros, limites, esquema/versão, licença, periodicidade, status, saúde e proprietário operacional.
2. **`ingest_runs`, `ingest_checkpoints`, `ingest_dead_letters`:** tenant, fonte, endpoint, `query_hash` canônico de todos os filtros, janela, página/cursor, watermark, lease/heartbeat, tentativas, status, contagens, erro sanitizado e `contract_version`. Corrigir o problema atual: o cursor é salvo, mas `iter_publications` recomeça da página 1.
3. **`raw_responses`:** query/URL, status, headers permitidos, captura, bytes, hash bruto, storage pointer e contrato; append-only.
4. **`editais`/oportunidade canônica:** `fonte + id_externo`, PNCP, instrumento, códigos/nomes de modalidade e modo, situação, SRP, esfera/poder, órgão/unidade/CNPJ/UASG, UF/IBGE, objeto/complemento, valores com estado sigiloso/nulo, datas, link, captura, atualização, hash e completude.
5. **`edital_versoes`:** número, hash anterior/novo, payload normalizado, diff, fonte, captura, publicação, motivo e estado de revisão.
6. **Itens/resultados:** identidade do item/resultado, descrição, unidade, quantidade, CATMAT/CATSER, valor, fornecedor minimizado conforme finalidade, situação, datas e vínculo à versão.
7. **`edital_documentos`:** identificador externo, tipo/título oficial, URL/URI, media type, tamanhos, ETag/Last-Modified, hash, storage privado, status download/extração/OCR, páginas, erro, versão do extrator, retenção e classificação de dados pessoais. Limite de 30 MB por arquivo no PNCP deve virar validação operacional.
8. **`outbox_events`:** evento, entidade/versão, hash, chave idempotente, estado e tentativas; publicar somente após commit do upsert.
9. **`saved_searches`, `alert_rules`, `alert_deliveries`:** configuração versionada, empresa/usuário, frequência, janela, canal, motivo, dedupe, entrega e preferências.
10. **Domínios:** modalidade, modo, instrumento, tipo de documento, situação e CATMAT/CATSER, com ID/nome/status/datas de atualização; nunca congelar nomes na UI.
11. **Segurança:** capacidades/concessões tipadas, auditoria append-only, storage/derivados rastreáveis e política de retenção/eliminação.

Conservar PostgreSQL/GIN/pgvector como primeira busca. Acrescentar índices de execução, atualização, versões e documentos antes de adotar outro mecanismo. O catálogo segue tenant-scoped enquanto não houver decisão explícita de catálogo global, ACL, fan-out e migração.

### 7.2 Jobs e sequência

1. `refresh_source_domains`: modalidades, modos, documentos, CATMAT/CATSER; registrar versão e validade.
2. `plan_ingest_windows`: criar janelas curtas e sobrepostas por fonte/rota/modalidade; não fazer varredura anual de atas/contratos como unidade única.
3. `discover_publications`: PNCP `/publicacao` e licitações Compras.gov.br; paginação oficial e checkpoint retomável.
4. `discover_open_proposals`: PNCP `/proposta`; atualizar conjunto de prazos.
5. `discover_updates`: PNCP `/atualizacao`, atas/contratos/PCA conforme escopo; ordenar por `dataAtualizacaoGlobal` e gerar diff.
6. `normalize_upsert`: validar envelope, preservar desconhecidos, upsert idempotente, criar versão somente em mudança e gravar outbox.
7. `enrich_detail_items_results`: sob demanda ao salvar/abrir ou por política de valor/frescor; 404 de recurso ausente não é retry transitório.
8. `fetch_documents`: somente URL oficial/canônica, allowlist de host quando possível, MIME/bytes/timeout/quarentena/checksum/ETag.
9. `extract_documents` e `ocr_documents`: sandbox, limites de páginas/tempo, extração com página/seção, versão do extrator e marcação de OCR; documento é conteúdo não confiável e pode conter prompt injection.
10. `embed_chunks`/`index_search`: assíncrono por hash de documento, sem servir chunk de versão obsoleta; minimizar dados pessoais antes de LLM/embedding.
11. `match_saved_searches`: consumir eventos idempotentes, calcular motivo/score e gerar alerta sem enviar diretamente para canal externo.
12. `deliver_notifications`: outbox de in-app/e-mail/provedor futuro, opt-out, bounce, retry e auditoria.
13. `reconcile_window`: reconciliar uma janela maior por contagens, páginas, hashes e status para recuperar mudança de ordenação/atraso.
14. `retry_dead_letters`: reprocessamento por fonte/rota/documento, com limite e intervenção de operação.
15. `collect_health_metrics`: frescor, lag, 429/5xx, p95, cache, DLQ, documentos pendentes, campos novos/desaparecidos e duplicidade.

### 7.3 HTTP, limites e falhas

O cliente deve preservar status e cabeçalhos, usar cache/revalidação (`ETag`, `Last-Modified`, `Cache-Control`), limitador distribuído por host/fonte em Redis, jitter, orçamento, concorrência máxima, circuit breaker e respeito a `Retry-After`. Como não há quota oficial localizada, o intervalo interno é uma política conservadora, não promessa da fonte.

- Retry com backoff para 408, 429, 5xx e rede; `Retry-After` prevalece.
- Não repetir cegamente 400, 401, 403, 404, 422 ou drift de schema.
- 204/empty válido conclui a janela como zero.
- Resposta incompatível preserva bruto, pausa adaptador afetado e abre alerta.
- Falha de documento não apaga oportunidade; marca `documento_pendente`.
- Cada página atualiza checkpoint transacionalmente antes da próxima; lease impede dois workers na mesma chave.

Métricas e traces devem correlacionar scheduler, worker, fonte, banco, fila, storage e índice por `trace_id`/`span_id`, sem query sensível, token, CPF, e-mail ou texto integral em logs.

---

## 8. Fases de implementação no monorepo atual

Não editar o código como parte deste blueprint; as fases abaixo são ordem de execução e critérios de escopo.

### Fase 0 — contrato, segurança e operação (P0)

- Criar registro de fonte/rota/contrato e fixtures versionadas para OpenAPI vigente.
- Corrigir retomada de `cursor_pagina`; incluir endpoint, filtros canônicos, `query_hash`, lease/heartbeat e watermark no checkpoint.
- Evoluir `services/ingest/src/http.py` para cabeçalhos, cache/revalidação, status/bytes e limitador distribuído.
- Adicionar captura bruta, outbox transacional e consumidores idempotentes antes de aumentar fan-out.
- Definir SLOs internos de frescor/lag, contagem, qualidade e DLQ por fonte; não derivar SLO do beat de 900 segundos.
- Aprovar mapa LGPD, retenção, suboperadores, transferência, eliminação e runbook de incidente.

### Fase 1 — registro canônico e busca nacional (P0)

- Estender normalizador/modelo para esfera, poder, município IBGE, instrumento, códigos/domínios, situação, SRP, datas de proposta/atualização, homologado, sigilo, itens e `dataAtualizacaoGlobal`.
- Implementar trilhas `/publicacao`, `/proposta` e `/atualizacao`; manter atas/contratos/PCA relacionados, sem misturar no feed de editais.
- Estender `services/core-api/src/search.ts` com filtros de fonte, município, esfera, instrumento, modo, situação, datas, prazo, SRP e estados nulo/sigilo; indexar objeto, complemento e itens.
- Apresentar identidade, fonte, captura, versão, documento e link oficial no Radar.
- Adicionar dedupe/versionamento conservador; não trocar identidade por hash.

### Fase 2 — documentos, Reader e relevância (P1)

- Criar entidade/storage de documentos, download seguro, extração/OCR isolados, chunks e embeddings versionados.
- Enriquecimento assíncrono ao salvar/abrir oportunidade; checksum, limites e 404 explícito.
- Score explicável com literal, catálogo, localidade, prazo e feedback; CNAE apenas sugestão.
- Reader/Ana somente com versão atual, página/seção, confiança, modelo/prompt e evidência; revisão humana e correção auditada.

### Fase 3 — alertas e colaboração (P1)

- Persistir buscas salvas/alert rules por empresa, frequência, canal, janela e versão.
- Consumir `edital.novo`/`edital.atualizado` via outbox, deduplicar e implementar inbox/in-app, 7/3/1 dias, retificação, situação e resultado.
- Separar favorito pessoal de oportunidade da empresa; ligar versão nova a pipeline, tarefa, agenda e checklist.
- Só depois contratar/provisionar e-mail; testar entregabilidade, opt-out, bounce e auditoria.

### Fase 4 — painéis, capacidades e observabilidade (P1/P2)

- Consolidar painel empresário e mentorado com recursos realmente existentes.
- Tipar concessões mentor–empresa; migrar default-deny; exigir empresa selecionada para dados sensíveis.
- Criar painel admin (usuários, empresas, concessões, auditoria) e painel operação (fontes, janelas, lag, checkpoints, DLQ, drift) sem métricas fictícias.
- Restringir `operador` que hoje é tratado amplamente por `empresa_acessivel`; aplicar autorização server-side e testes RLS cross-tenant/cross-company.
- Instrumentar OpenTelemetry, dashboard de saúde por fonte/rota e alertas de atraso/429/backlog.

### Fase 5 — extensões condicionais (P2)

- Fontes adicionais somente com contrato/licença/API e registro de cobertura; não começar por scraping de milhares de portais.
- CSV/XLSX próprio após limites e auditoria; Google Sheets somente com OAuth/API aprovado.
- WhatsApp/push somente com provedor, consentimento, DPA e orçamento.
- Feed de pregão somente após parceria que documente eventos, escopo, retenção, privacidade, anticolusão e SLA. Sem essa condição, manter N0/N1.
- Reavaliar catálogo global somente após medir custo do modelo tenant-scoped e especificar ACL/fan-out.

---

## 9. Variáveis, credenciais e decisões externas ainda necessárias

### 9.1 Já necessárias/observadas no monorepo

- PostgreSQL, RabbitMQ e Redis: URLs/credenciais, TLS, roles de serviço e migrations.
- Scheduler/worker: `INGEST_SCHEDULE_TENANT_ID`, `INGEST_RATE_LIMIT_SECONDS`, timeout, retries e configuração de beat/filas, conforme `.env.example` e `services/ingest`.
- URLs de base PNCP/Compras.gov.br e identificador `User-Agent` operacional; consultas públicas não devem receber segredo de fornecedor.
- Chaves JWT do próprio Licite Comigo e contexto `tenant_id/user_id/empresa_id/role`; não confundir com JWT da API de manutenção PNCP.

### 9.2 Necessárias para as fases futuras

- **Storage de documentos:** endpoint/bucket, região, chave de criptografia, KMS/secret manager, TTL, política privada e lifecycle.
- **E-mail:** provedor, API key/secret, domínio remetente, SPF/DKIM/DMARC, webhook de bounce/complaint, templates e endereço de opt-out.
- **Observabilidade:** endpoint OTLP, credenciais, retenção, redaction, alertas e responsável de plantão.
- **LLM/OCR/antivírus, se externos:** provedor/modelo, chave, região, DPA, limites de contexto/custo e política de não enviar documento integral por padrão. Se o runtime atual já fornece esses serviços, documentar o contrato sem adicionar credencial externa desnecessária.
- **Google Sheets:** OAuth client, redirect URIs, escopos mínimos e política de revogação; não tratar como necessário para CSV/XLSX próprio.
- **WhatsApp/SMS/push:** provedor autorizado, conta remetente, templates, webhook, opt-in/opt-out, custos, limites e DPA.
- **Fontes/parceiros:** token/API key, contrato de licença, autorização de redistribuição, SLA, rate limit, campos, retenção, suporte, contato de mudança de schema e direito de auditoria.
- **Comercial/pagamentos:** somente depois de definir planos/entitlements, provedor, webhook, cancelamento, trial e impostos. As tabelas de planos/assinaturas existem, mas a página pública ainda informa que cobrança/limites estão em definição.

### 9.3 Credenciais que não devem ser solicitadas

Não guardar Gov.br, SICAF, senha de fornecedor, certificado digital, cookies, tokens de sessão, CAPTCHA ou credenciais de portais para enviar proposta/lance. O usuário deve abrir o portal oficial e executar a transação fora do Licite Comigo. A API de manutenção do PNCP, com JWT de uma hora, não é necessária para o radar e não autoriza escrita do produto.

---

## 10. Riscos legais/técnicos e mitigação

| Risco                                      | Consequência                                                                                            | Mitigação/critério de decisão                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cobertura incompleta/atrasada do PNCP      | Falso negativo e perda de prazo; municípios pequenos podem publicar fora do PNCP no regime transitório. | Expor fonte, captura, lag e cobertura; não dizer “todas as oportunidades”; reconciliação e fontes adicionais somente documentadas.                  |
| Mudança de OpenAPI/domínios/paginação      | Quebra silenciosa, duplicatas ou registros perdidos.                                                    | Registro de contrato, smoke tests, fixtures, drift alert, domínio versionado; OpenAPI atual prevalece sobre Manual antigo.                          |
| Rate limit não publicado                   | Bloqueio, degradação ou 429.                                                                            | Limitador distribuído, backoff/jitter, circuit breaker, baixa concorrência, respeito a `Retry-After`, métrica por host.                             |
| Checkpoint incompleto/ordenação mutável    | Reprocessamento caro e lacuna entre páginas.                                                            | Cursor aplicado de fato, lease, janelas sobrepostas, idempotência e reconciliação maior.                                                            |
| Documento quebrado, grande ou malicioso    | Indisponibilidade, malware, prompt injection, custo e vazamento.                                        | Download separado, allowlist, limite 30 MB/bytes/páginas/tempo, hash, quarentena/sandbox, OCR isolado, conteúdo não confiável.                      |
| LGPD em anexos, logs, embeddings e alertas | Exposição de CPF/e-mail/assinatura e incidente.                                                         | Necessidade/finalidade, minimização, classificação/retensão, RLS, storage privado, criptografia, redaction, inventário de derivados e runbook ANPD. |
| Prazo incorreto                            | Perda de proposta ou falsa segurança jurídica.                                                          | Diferenciar datas, fuso Brasília, fonte e trecho; não inferir recurso/impugnação/entrega a partir de sessão; aviso para conferir edital.            |
| Superprivilégio de admin/operador/mentor   | Vazamento entre empresas e ações indevidas.                                                             | Capacidades tipadas, default-deny, concessão com validade, empresa selecionada, RLS e auditoria append-only.                                        |
| Dependência de API/concorrente             | Violação de termos, bloqueio ou cópia indevida de catálogo.                                             | Não consumir API do Alerta Licitações/Licis para alimentar serviço; fontes próprias e contratos revisados.                                          |
| “Ao vivo”/lances/chat inexistentes         | Decisão comercial baseada em status incompleto e risco anticolusão.                                     | N0/N1 explícitos; N2 somente parceria autorizada; transação sempre no portal oficial.                                                               |
| Marketing/planos sem suporte operacional   | Promessa indevida de cobertura, 24/7, trial, WhatsApp ou cobrança.                                      | Matriz de entitlements publicada só após testes, SLA/limites mensurados, termos e política aprovados.                                               |

---

## 11. Critérios de aceite do blueprint implementado

### Fontes e ingestão

- [ ] Cada resultado do Radar aponta para fonte, URL oficial, identificador externo, rota/query normalizada, captura, atualização da origem, versão/hash e estado de completude.
- [ ] O contrato PNCP vigente é testado: `pagina >= 1`, limites 10–50 em contratações/propostas, campos nulos, 204/empty e erros 400/404/422/429/5xx; atas/contratos/PCA usam limites próprios.
- [ ] O checkpoint inclui fonte, endpoint, todos os filtros canônicos, janela, página/cursor e lease; uma falha retoma sem começar silenciosamente da página 1 e sem duplicar efeitos.
- [ ] Publicação, propostas abertas e atualização são trilhas separadas; reconciliação recupera mudanças de ordenação/atraso.
- [ ] Payload bruto, cabeçalhos permitidos, hash e versões ficam em storage/auditoria apropriados, nunca em logs integrais.
- [ ] Outbox e consumidores idempotentes garantem que upsert e evento não se separem em falha/reentrega.

### Busca, documentos e alertas

- [ ] Filtros da seção 3 distinguem instrumento, modalidade, modo, situação, fase do item, datas, sigilo/nulo, fonte e localidade.
- [ ] CNAE aparece como sugestão explicável; não é tratado como habilitação. Score mostra fatores e permite revisão.
- [ ] A UI diferencia nova oportunidade, atualização, versão, documento pendente, prazo encerrado, revogada/anulada/suspensa e resultado histórico.
- [ ] Documentos são baixados/extraídos assincronamente com limite, hash, quarentena, página/seção e versão do extrator; falha de documento não apaga edital.
- [ ] Alertas in-app são deduplicados, versionados, auditáveis e usam datas exatas; nenhum alerta classifica uma contratação fechada como aberta.
- [ ] E-mail só é ativado após opt-in, opt-out, bounce, supressão, SPF/DKIM/DMARC e teste de isolamento entre empresas.

### Painéis e segurança

- [ ] Dois tenants, duas empresas, concessão ativa/expirada/revogada e exportação são cobertos por testes RLS/capabilities.
- [ ] Persona no cliente não amplia escopo; admin, operador, mentor e vínculo empresarial são verificados no servidor.
- [ ] Auditoria de leitura/exportação/concessão/reprocessamento tem ator, alvo, tenant/empresa, ação, resultado, correlação, versão e justificativa sem dados sensíveis desnecessários.
- [ ] Painel de operação mostra métricas reais ou “não configurado/indisponível”; não há números de demonstração em produção.

### Fronteira de produto e comunicação

- [ ] O Radar/alerta exibe aviso de que a informação é de fonte ingerida, pode estar incompleta/atrasada e deve ser conferida no edital/portal oficial.
- [ ] Nenhum fluxo do produto solicita Gov.br/SICAF, senha, certificado, cookie ou CAPTCHA.
- [ ] Não existem endpoints ou automações de proposta, lance, chat, recurso, impugnação, assinatura ou protocolo; o CTA é deep-link/checklist.
- [ ] “Ao vivo” não aparece para polling; níveis N0/N1/N2 estão visíveis e N2 só é habilitado com contrato de fonte.
- [ ] Planos, canais, cobertura, retenção, trial, cancelamento e SLA só são anunciados quando entitlements, termos, provedor e métricas estiverem aprovados.

**Resultado esperado:** uma expansão com valor comercial claro — descoberta, explicação, documentos, prazos e coordenação — sem transformar lacunas de API, alegações de concorrentes ou dados públicos incompletos em promessas de cobertura, tempo real ou execução transacional.

---

## Referências de decisão

As fontes primárias e seus links estão consolidados nos relatórios:

- `01-pncp.md` — PNCP, OpenAPI, Manual, domínios, documentos e volumes observados;
- `02-compras-gov.md` — Compras.gov.br, Dados Abertos, fornecedor, app e fronteira de autenticação;
- `03-licis.md` — benchmark espanhol de radar/digest, sem API pública confirmada;
- `04-alerta-licitacoes.md` — benchmark de catálogo, alertas, exportação e termos de API concorrente;
- `05-pregao-ao-vivo.md` — níveis de atualização, sala de disputa, eventos não públicos e anticolusão;
- `06-busca-alertas.md` — catálogo de filtros, alertas verificáveis, cobertura e deduplicação;
- `07-paineis-perfis.md` — personas, permissões, concessões, auditoria e estado dos painéis;
- `08-arquitetura-ingestao.md` — ingestão, documentos, cache, jobs, LGPD, observabilidade e riscos.

Os relatórios acima foram usados como evidência; este arquivo é uma decisão de implementação e não altera o repositório.
