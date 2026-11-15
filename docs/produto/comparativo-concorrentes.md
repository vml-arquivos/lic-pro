# Licite Comigo frente aos concorrentes (relatório de 11/11/2026)

Base: relatório de benchmark de 11/11/2026 (PNCP, Compras.gov.br, Pesquisa de Preços Lite, Effecti,
ConLicitação, BLL, Portal de Compras Públicas, Licitações-e, Licitanet e Banco de Preços). O
relatório não prova cobertura nem desempenho de nenhuma delas; contagens de portais são
declaradas pelas próprias empresas. Este quadro compara só o que o Licite Comigo faz hoje.

## O que o relatório diz que ninguém prova, e o Licite Comigo faz

| Ponto do relatório                                                     | Licite Comigo hoje                                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Nenhuma solução calcula margem do fornecedor com custos próprios       | Simulador: custo, frete, impostos, comissão, taxa da plataforma, preço de equilíbrio e preço mínimo |
| Preço de referência não é margem                                       | Lucro estimado = valor provável × margem informada; sempre rotulado como estimativa ou premissa     |
| Diferença entre estimado, homologado, contrato e pagamento             | Guia "Como ler os valores" em Análise e Preços; rótulos "Homologado"; nunca mostra "pago"           |
| Monitoramento não é disputa (a disputa é na plataforma do edital)      | Cada edital mostra a plataforma de origem ("disputa em…") e o link oficial                          |
| Taxa da plataforma entra no custo (BLL tem taxa de êxito)              | Simulador com BLL (1,5% até R$ 600 por lote), Portal de Compras Públicas (R$ 129) e "outra"         |
| Comparar editais lado a lado, por prazo, preço, facilidade e histórico | Análise: ranking por foco, comparação de 2 a 4 editais, histórico do órgão e mediana do catálogo    |

## Onde estamos iguais ou atrás (sem promessa)

| Recurso                           | Concorrentes (segundo o relatório)                    | Licite Comigo                                                                    | Próximo passo                                                                           |
| --------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Cobertura de fontes               | Effecti "1.400 portais", ConLicitação "6.000 fontes"  | PNCP (que recebe publicações de várias plataformas) e Compras.gov.br para preços | Mostrar aos usuários a última coleta e as fontes; não comparar contagens autodeclaradas |
| Alertas por e-mail                | ConLicitação: boletim 3 vezes ao dia                  | Alertas no sino e por e-mail quando o envio (SMTP) está configurado no ambiente  | Configurar SMTP no Coolify; avaliar boletim diário                                      |
| Alertas por linha de fornecimento | Compras.gov.br notifica por linha de fornecimento     | Alertas por nicho (aberturas, mudanças, prazos e sessão ao vivo)                 | Já cobre; refinar por CATMAT se houver demanda                                          |
| Estatísticas de preço             | Pesquisa Lite: mín., máx., média, mediana, desvio, CV | Mín., máx., média, mediana, quartis e variação dos preços; exportação em CSV     | —                                                                                       |
| Robô de lances                    | Effecti, ConLicitação, Licitanet                      | Motor de lances próprio, ainda sem integração com os portais                     | Só avançar com contrato e termos de cada portal                                         |
| Pagamento efetivo                 | Ninguém comprova                                      | Não mostra pagamentos (só homologado e contrato)                                 | Manter assim, com o aviso                                                               |

## Método de teste comparável (sugestão do relatório)

Escolher os mesmos objetos, regiões, modalidades e períodos; medir precisão, editais não
encontrados, atraso de alertas e esforço de triagem, usando editais oficiais como referência.
