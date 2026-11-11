# Módulos Curso e Profissional

O produto tem dois módulos que usam o mesmo domínio-base, o mesmo banco, a mesma conta de
equipe e a mesma IA (Ana), mas **não se misturam** em administração, dinheiro, leads e usuários.

|                   | Módulo Curso                                                                                          | Módulo Profissional                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Para quem         | Alunos que compram o curso (Hotmart/Asaas) e mentores                                                 | Empresas assinantes e a operação própria de licitações                                                      |
| Endereço sugerido | `mentoria.seudominio.com.br`                                                                          | `app.` (empresas), `admin.` (administração), `equipe.` (colaboradores)                                      |
| Áreas             | Aluno, Mentor, Painel da mentoria (`/gestao`)                                                  | Empresa, Colaborador, Administração (`/admin`, `/leads`)                                                    |
| O que tem         | Tirar dúvidas (Ana), materiais, academia, plano de 30 dias, prática, mentoria, encontros, certificado | Radar por nicho/local/esfera, alertas, oportunidades, preços pagos, pregões, agenda, documentos, assinatura |
| Dinheiro          | Cobranças `tipo = 'curso'`                                                                            | Cobranças `tipo = 'assinatura'`                                                                             |
| Leads             | `perfil` mentorado ou iniciante                                                                       | `perfil` empresario                                                                                         |
| Planos e cupons   | Plano do curso e cupons dele                                                                          | Planos `empresa-*` e cupons deles                                                                           |

## Como a separação é feita

- **Páginas e menus**: a área `curso` (Painel da mentoria) tem o próprio menu e as páginas em
  `/gestao`. A Administração não lista mais alunos, mentores e materiais, e a do
  curso não lista empresas, assinantes, fontes de dados nem financeiro das assinaturas.
  Com endereços por painel, o que não é daquele endereço responde 404.
- **Dados**: as rotas `/admin/financeiro`, `/admin/planos`, `/admin/cupons`, `/admin/leads` e
  `/platform/overview` aceitam `?modulo=curso|profissional`. Cada tela de administração pede só
  o módulo dela. Sem o parâmetro, as rotas somam os dois (comportamento anterior).
- **Cupons**: cupom criado dentro de um módulo vale só para os planos dele; tentar misturar
  responde `plano_de_outro_modulo`. Cupom antigo "para todos os planos" aparece nos dois.
- **Sem duplicar código**: é o mesmo aplicativo web, com os dois conjuntos de telas, selecionados
  pelo endereço (`PANEL_URL_*`). Isso mantém o consumo de memória do servidor e um só lugar para
  corrigir erros. Se um dia for preciso separar em dois containers, a mesma imagem sobe duas
  vezes, cada uma com os endereços do seu módulo.

## Quem administra o quê

A equipe (`plataforma`) é a mesma nos dois módulos e entra em cada um pela porta dele:
`admin.` para a Administração e `mentoria.` (ou `PANEL_URL_CURSO`) para a
Painel da mentoria. Não existe papel novo no banco: a Painel da mentoria é uma área
"ver como" da equipe. A mentora entra como `mentor` e vê só os alunos dela.

## Configuração

Sem nenhuma variável nova tudo continua como antes (um endereço, a equipe troca de área em
"Ver como"). Para separar por endereço:

```
PANEL_URL_ADMIN=https://admin.seudominio.com.br      # Administração
PANEL_URL_EMPRESA=https://app.seudominio.com.br      # Empresas assinantes
PANEL_URL_ALUNO=https://mentoria.seudominio.com.br   # Alunos, mentores e Painel da mentoria
# PANEL_URL_CURSO=https://gestao.seudominio.com.br   # opcional: Painel da mentoria à parte
```

Use os mesmos valores em `web`, `core-api` e `site`. Depois de atualizar o código, rode o recurso
de migrations (migration `0030`) e reinicie o `core-api` e o `web`.


> Acesso por escopo: a equipe pode ser convidada só para o Painel admin, só para o Painel da mentoria, ou para os dois (Equipe administrativa → Acesso). Colaborador e Empresa usam a página Análise (/analise) para ranquear, comparar e simular licitações.
