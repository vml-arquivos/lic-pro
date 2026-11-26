# Radar e dados dos editais — diagnóstico e o que mudou (nov/2026)

## 1. Como foi medido (e o que NÃO foi)

| Item                                    | Como                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Reabertura do Radar, número de chamadas | Lido no código antigo (out32). O build antigo não foi rodado para contar requisições.                             |
| Tempo de consulta do Radar              | **Simulado**: banco local com 60 mil editais sintéticos (55 mil abertos), Postgres 16. Não é o banco de produção. |
| PNCP / Compras.gov.br                   | **Não houve chamada real** (o ambiente de teste não alcança as fontes). Testado com respostas simuladas.          |
| Redis entre instâncias                  | Testado com um cliente Redis falso compartilhado. **Não testado com Redis real.**                                 |
| Coolify / homologação                   | Sem acesso. Nada foi verificado lá.                                                                               |

## 2. Diagnóstico

1. **Radar recomeçava do zero** ao abrir um edital e voltar: a lista era carregada de novo, com os filtros do perfil, e a página perdia busca, ordem e paginação.
2. **A ficha do edital esperava a lista de empresas** antes de aparecer.
3. **Valores fechados e Concorrentes** consultavam o PNCP por caminhos diferentes, sem reaproveitar resultado entre pessoas nem entre os dois blocos.
4. **Falha do PNCP** podia deixar o bloco vazio, sem dizer se faltava publicação, registro ou se a fonte caiu.
5. **Consulta do Radar** (simulado, 60 mil editais): `/editais` leva 1,2 a 1,5 s (linhas ≈ 440–540 ms, contagem ≈ 235 ms) e `/radar/painel` ≈ 0,83 s. O plano mostra leitura da tabela inteira (filtro de prazo + política de acesso por tenant), junção com descartes e ordenação de ~55 mil linhas para devolver 10.
   - Teste feito: índice extra em `(data_publicacao DESC, id DESC)`. **Não melhorou** (1,1–1,3 s) porque ~92% das linhas passam no filtro; o índice foi removido. **Nenhuma mudança de SQL foi feita.** Falta medir no banco real, onde o volume pode ser bem menor.

## 3. O que mudou

- **Radar**: busca, filtros, ordem e página ficam na URL e a lista é guardada no navegador por conta/usuário/perfil/parâmetros (`radar-cache.ts`). Voltar do edital mostra a lista na hora e atualiza em segundo plano, sem trocar o conteúdo por tela vazia. Resposta velha de busca anterior é descartada.
- **Ficha do edital** vem do banco na hora; empresas carregam separado.
- **Detalhes, itens, documentos, leitura dos PDFs, preços e concorrentes** carregam sozinhos. A atualização manual ficou só como recuperação. Detalhes são refeitos quando vencem (3 h aberto, 24 h fechado) ou quando o PNCP mudou o edital depois da última coleta.
- **Camada única de fonte** (`fonte-http.ts`, `cache-compartilhado.ts`): limite de chamadas simultâneas por fonte, repetição com espera crescente, respeito a `Retry-After`/429, contadores, trabalho único por chave (no processo e, com Redis, entre instâncias), cache negativo curto para falhas repetidas.
- **Resultados oficiais num caminho só** (`resultadosDoEdital`): Valores fechados e Concorrentes usam o mesmo dado, com estado por item (publicado, aguardando publicação, sem registro, falhou), cobertura (itens consultados/total, limite 120) e data da consulta.
- **Último dado válido nunca é trocado por vazio**: falha ou tempo esgotado mantém o anterior, mostrado com a data e "desatualizado".
- **Leitura dos PDFs**: fila com prioridade, gravação no cache compartilhado, nova tentativa quando só parte falhou e assinatura que muda quando o documento muda.

## 4. Validade por tipo de dado

| Dado                            | Validade                                                                                   | Guardado por | Observação                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------ |
| Resultados do edital (PNCP)     | 10 min aberto; 30 min fechado sem resultado completo; 24 h fechado com resultado publicado | 14 dias      | Parcial vale 2 min; serve o antigo e atualiza ao fundo |
| Preços pagos por CATMAT         | 6 h                                                                                        | 7 dias       | Compras.gov.br                                         |
| Contratos/fornecedores do órgão | 6 h                                                                                        | 7 dias       |                                                        |
| Leitura dos PDFs                | 6 h completa; 3 min incompleta; espera de 2 min após erro                                  | 24 h         |                                                        |
| Detalhes do edital (banco)      | 3 h aberto; 24 h fechado; imediato se o PNCP mudou                                         | —            |                                                        |
| Lista do Radar (navegador)      | atualiza ao abrir e a cada rodada agendada                                                 | sessão       |                                                        |

## 5. Portais — o que existe hoje

Todas as licitações entram **pelo PNCP**. O portal de origem é identificado pelo nome que o PNCP informa (e pelo link de origem) e serve para filtro e link direto. Não há integração direta com nenhum portal.

| Portal                                                                     | Origem identificada      | Editais  | Itens    | Anexos   | Resultados | Participantes  |
| -------------------------------------------------------------------------- | ------------------------ | -------- | -------- | -------- | ---------- | -------------- |
| Compras.gov.br                                                             | sim                      | via PNCP | via PNCP | via PNCP | via PNCP   | não confirmado |
| Portal de Compras Públicas                                                 | sim                      | via PNCP | via PNCP | via PNCP | via PNCP   | não confirmado |
| BLL, BNC, Licitanet, Licitações-e, ComprasBR, BBMNET, M2A, Licitar Digital | sim                      | via PNCP | via PNCP | via PNCP | via PNCP   | não confirmado |
| Outros                                                                     | pelo nome/host informado | via PNCP | via PNCP | via PNCP | via PNCP   | não confirmado |

"Via PNCP" = o que o PNCP publicar para aquele edital; o que o portal mostra e o PNCP não, não é coletado. Lista de participantes não foi confirmada como disponível em nenhuma fonte usada — não é mostrada como dado.

## 6. Pendente (não feito nesta entrega)

- **Perfis múltiplos por empresa/frente** (nome, nichos, CATMAT/CATSER, palavras incluir/excluir, região, faixa de valor, capacidade; critérios obrigatórios x preferências; aderência com evidência; priorização do enriquecimento por perfil). Continua o perfil único atual (`perfis_radar`). Pede migration nova e telas próprias.
- Otimização de SQL do Radar: depende de medir no banco real.
- Painel de contadores das fontes na tela de admin (os contadores existem no código, sem tela).
- Sobreposição entre `pncp-sync` do core-api e o agendador do ingest: não verificável sem acesso à produção.

## 7. Deploy e reversão

- Sem migration nova e sem variável nova (`REDIS_URL` já é usada; sem Redis, o cache é por processo).
- Ordem: core-api primeiro, depois web.
- Reversão: reimplantar o commit anterior de cada serviço. Nada gravado no banco muda de formato; o cache do navegador usa chave própria e expira com a sessão.

## 8. Testes

core-api: tsc limpo; 48 arquivos, 869 testes passando (com Postgres real). web: tsc limpo, prettier limpo, 11 testes. Fora desta entrega: ESLint do web não tem configuração no repositório; `tests/learning.integration.test.ts` tem 2 avisos `prefer-const` que já existiam.
