'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type ModuleKey =
  | 'automacoes'
  | 'aprovacoes'
  | 'jornada'
  | 'oportunidade'
  | 'edital'
  | 'precificacao'
  | 'documentos'
  | 'pregoes'
  | 'mercado'
  | 'agenda'
  | 'fornecedores'
  | 'plano30'
  | 'mentoria'
  | 'assinatura';

type ApprovalState = 'Pendente' | 'Aprovado' | 'Rejeitado';

const automations = [
  [
    'Radar diário de oportunidades',
    'Busca editais conforme CNAE, segmentos, locais, palavras-chave e valores.',
    'Diariamente · 08:00',
  ],
  [
    'Análise automática dos editais',
    'Extrai requisitos, lotes, datas, critérios e fontes quando um edital é salvo.',
    'Ao salvar ou atualizar um edital',
  ],
  [
    'Alerta de prazos e mudanças',
    'Detecta retificações, atualizações de edital e vencimento de certidões.',
    'A cada atualização disponível',
  ],
  [
    'Preparação de documentos',
    'Preenche minutas a partir de dados aprovados e identifica campos ausentes.',
    'Quando a proposta for iniciada',
  ],
] as const;

const approvals = [
  [
    'a1',
    'Revisar declaração para proposta',
    'Edital demonstrativo · dados da contratação',
    'Documento será gerado somente após validar campos e fonte.',
  ],
  [
    'a2',
    'Confirmar oportunidade recomendada',
    'Material de escritório · oportunidade priorizada',
    'Confira exigências e viabilidade antes de participar.',
  ],
  [
    'a3',
    'Autorizar notificação externa',
    'Alertas de prazos e sessões',
    'Exige consentimento e integração oficial.',
  ],
] as const;

const journeySteps = [
  ['Abrir ou verificar empresa', '/empresas'],
  ['Preparar cadastros e documentos', '/documentos'],
  ['Encontrar oportunidade', '/radar'],
  ['Avaliar viabilidade', '/oportunidade'],
  ['Ler edital e preparar proposta', '/edital'],
  ['Participar da sessão', '/pregoes'],
  ['Habilitação e resultado', '/agenda'],
  ['Contratação e execução', '/agenda'],
] as const;

const days = [
  ['1–5', 'Preparar', 'Definir produtos ou serviços, validar CNPJ, CNAEs, cadastro e documentos.'],
  [
    '6–10',
    'Mapear',
    'Configurar filtros, pesquisar órgãos compradores e selecionar oportunidades.',
  ],
  ['11–15', 'Analisar', 'Ler editais, verificar requisitos, fornecedores e concorrentes.'],
  ['16–20', 'Precificar', 'Construir preço, margem mínima e documentos da proposta.'],
  ['21–25', 'Participar', 'Validar cadastro no portal e conferir o checklist da sessão.'],
  [
    '26–30',
    'Próximo ciclo',
    'Acompanhar resultado, melhorar o processo e buscar novas oportunidades.',
  ],
] as const;

function ModuleFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="module-page">
      <header className="module-heading">
        <p className="eyebrow">LiciteComigo · {eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </main>
  );
}

function Hero({
  kicker,
  title,
  text,
  href,
  label,
}: {
  kicker: string;
  title: string;
  text: string;
  href?: string;
  label?: string;
}) {
  return (
    <section className="module-hero">
      <div>
        <p className="hero-kicker">✦ {kicker}</p>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {href && label ? (
        <Link className="button-light" href={href}>
          {label} →
        </Link>
      ) : null}
    </section>
  );
}

export function ModulePage({ module }: { module: ModuleKey }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    r1: true,
    r2: true,
    r3: true,
    r4: true,
  });
  const [approvalState, setApprovalState] = useState<Record<string, ApprovalState>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [priceInputs, setPriceInputs] = useState({
    custo: 1000,
    frete: 120,
    operacao: 80,
    risco: 50,
    tributos: 8,
    margem: 15,
  });
  const [supplier, setSupplier] = useState({ name: '', product: '', price: '', deadline: '' });
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [marketTerm, setMarketTerm] = useState('');

  const price = useMemo(() => {
    const costs = priceInputs.custo + priceInputs.frete + priceInputs.operacao + priceInputs.risco;
    const denominator = 1 - (priceInputs.tributos + priceInputs.margem) / 100;
    return { costs, sale: denominator > 0 ? costs / denominator : 0 };
  }, [priceInputs]);

  if (module === 'automacoes') {
    return (
      <ModuleFrame
        eyebrow="Central de automações"
        title="ANA executora"
        description="Transforme a assistente em uma gerente digital: ela identifica eventos, prepara trabalho e encaminha decisões à sua equipe."
      >
        <Hero
          kicker="ANA · MOTOR DE EXECUÇÃO"
          title="Automatize o trabalho. Mantenha o controle."
          text="Rotinas para pesquisar, monitorar, cruzar informações e preparar documentos com segurança."
          href="/aprovacoes"
          label="Ver aprovações"
        />
        <div className="module-notice">
          As rotinas abaixo respeitam aprovação humana. Nenhum lance, assinatura, pagamento,
          mensagem ou envio a portal é executado sem integração autorizada.
        </div>
        <section className="module-grid two-columns">
          {automations.map(([name, description, frequency], index) => {
            const id = `r${index + 1}`;
            return (
              <article className="module-card" key={id}>
                <div className="module-card-top">
                  <span className="tag">{frequency}</span>
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={Boolean(enabled[id])}
                      onChange={(event) =>
                        setEnabled((current) => ({ ...current, [id]: event.target.checked }))
                      }
                    />{' '}
                    Ativada
                  </label>
                </div>
                <h2>{name}</h2>
                <p>{description}</p>
                <p className="module-muted">
                  <b>Modo:</b> rascunhos, alertas e análise com fontes.
                </p>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => setEnabled((current) => ({ ...current, [id]: !current[id] }))}
                >
                  {enabled[id] ? 'Simular rotina →' : 'Ativar rotina →'}
                </button>
              </article>
            );
          })}
        </section>
        <section className="module-card module-table-card">
          <h2>Histórico de execução e trilha de auditoria</h2>
          <table className="module-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Ação</th>
                <th>Status</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Agora</td>
                <td>Configuração das rotinas da ANA</td>
                <td>
                  <span className="tag">Pronto</span>
                </td>
                <td>Nenhuma integração externa executada.</td>
              </tr>
            </tbody>
          </table>
        </section>
      </ModuleFrame>
    );
  }

  if (module === 'aprovacoes') {
    return (
      <ModuleFrame
        eyebrow="Aprovações"
        title="Aprovações da ANA"
        description="A ANA pode preparar o trabalho, mas o empresário decide antes das ações importantes."
      >
        <Hero
          kicker="CONTROLE HUMANO"
          title="Fila de decisões com contexto."
          text="Revise o risco, a fonte e a próxima ação antes de aprovar qualquer etapa."
        />
        <section className="module-stack">
          {approvals.map(([id, title, subject, risk]) => {
            const state = approvalState[id] ?? 'Pendente';
            return (
              <article className="module-card" key={id}>
                <div className="module-card-top">
                  <span className="tag tag-blue">Aprovação</span>
                  <span className={`tag ${state === 'Pendente' ? 'tag-warn' : ''}`}>{state}</span>
                </div>
                <h2>{title}</h2>
                <p>{subject}</p>
                <p className="module-muted">⚑ {risk}</p>
                {state === 'Pendente' ? (
                  <div className="button-row">
                    <button
                      className="button-primary"
                      type="button"
                      onClick={() =>
                        setApprovalState((current) => ({ ...current, [id]: 'Aprovado' }))
                      }
                    >
                      Aprovar simulação
                    </button>
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() =>
                        setApprovalState((current) => ({ ...current, [id]: 'Rejeitado' }))
                      }
                    >
                      Rejeitar
                    </button>
                  </div>
                ) : (
                  <p className="module-muted">Decisão registrada no histórico desta sessão.</p>
                )}
                <small className="module-muted">
                  Protótipo operacional: não gera efeitos em sistemas oficiais.
                </small>
              </article>
            );
          })}
        </section>
      </ModuleFrame>
    );
  }

  if (module === 'jornada') {
    return (
      <ModuleFrame
        eyebrow="Minha jornada"
        title="Por onde começar"
        description="Sua jornada avança por ações reais, com status de cada etapa."
      >
        <section className="module-columns">
          <article className="module-card">
            <h2>Da empresa ao contrato</h2>
            {journeySteps.map(([title, href], index) => (
              <div className="journey-step" key={title}>
                <span className={`step-number ${index ? 'pending' : ''}`}>{index + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{index ? 'Não iniciado' : 'Em andamento'}</small>
                </div>
                <Link className="button-secondary compact" href={href}>
                  Abrir
                </Link>
              </div>
            ))}
          </article>
          <article className="module-card">
            <h2>Diagnóstico inicial</h2>
            <p>Conte à ANA onde sua empresa está para receber próximos passos mais úteis.</p>
            <div className="module-form">
              <label>
                Você já possui empresa?
                <select>
                  <option>Sim, tenho CNPJ</option>
                  <option>Ainda vou abrir</option>
                  <option>Sou MEI</option>
                </select>
              </label>
              <label>
                O que deseja vender?
                <select>
                  <option>Produtos</option>
                  <option>Serviços</option>
                  <option>Ainda não sei</option>
                </select>
              </label>
              <label>
                Estado de atuação
                <input defaultValue="Rio Grande do Norte" />
              </label>
              <Link className="button-primary" href="/onboarding">
                Atualizar diagnóstico →
              </Link>
            </div>
          </article>
        </section>
      </ModuleFrame>
    );
  }

  if (module === 'oportunidade') {
    return (
      <ModuleFrame
        eyebrow="Analisar oportunidade"
        title="Decida com dados"
        description="Confira a aderência comercial e os pontos que ainda precisam de evidência antes de participar."
      >
        <Hero
          kicker="PRÉ-ANÁLISE ORIENTADA"
          title="Aquisição de notebooks para unidades administrativas"
          text="Órgão demonstrativo · Pregão eletrônico · valor de referência a confirmar na fonte."
          href="/radar"
          label="Buscar outra oportunidade"
        />
        <section className="module-columns">
          <article className="module-card">
            <h2>Compatibilidade com sua empresa</h2>
            {[
              'Objeto que sua empresa fornece',
              'CNAE e atividade compatíveis',
              'Certidões em dia',
              'Experiência ou qualificação técnica adequada',
              'Fornecedor ou capacidade de execução',
              'Preço e margem calculados',
            ].map((item) => (
              <label className="check-row" key={item}>
                <input
                  type="checkbox"
                  checked={Boolean(checks[item])}
                  onChange={(event) =>
                    setChecks((current) => ({ ...current, [item]: event.target.checked }))
                  }
                />{' '}
                {item}
              </label>
            ))}
            <div className="button-row">
              <Link className="button-primary" href="/edital">
                Quero analisar o edital →
              </Link>
              <Link className="button-secondary" href="/radar">
                Buscar outra
              </Link>
            </div>
          </article>
          <article className="module-card">
            <h2>Decisão assistida pela ANA</h2>
            <p>
              Antes de recomendar participar, a plataforma deverá analisar viabilidade comercial,
              exigências, prazos, risco jurídico, concorrência, capital de giro e fornecedores.
            </p>
            <div className="module-notice">
              Informações insuficientes para decidir. O sistema nunca deverá inferir habilitação ou
              lucro garantido apenas pelo CNAE.
            </div>
            <p className="module-muted">
              ✅ Aderência ao objeto
              <br />
              ⚠️ Capacidade técnica a confirmar
              <br />
              ⚠️ Precificação pendente
              <br />
              ⚠️ Disponibilidade de fornecedor
            </p>
            <Link className="button-secondary" href="/precificacao">
              Montar preço →
            </Link>
          </article>
        </section>
      </ModuleFrame>
    );
  }

  if (module === 'edital') {
    return (
      <ModuleFrame
        eyebrow="Analisar edital"
        title="Transforme o edital em decisões"
        description="Organize checklist, evidências e documentos revisáveis antes de preparar uma proposta."
      >
        <section className="module-columns">
          <article className="module-card">
            <h2>Envie seu edital</h2>
            <p className="module-muted">PDF, link oficial ou número da contratação.</p>
            <input className="file-input" type="file" accept=".pdf" />
            <input placeholder="Cole o link ou número da licitação" />
            <button className="button-primary" type="button">
              Analisar edital com ANA
            </button>
            <div className="module-divider" />
            <h2>Checklist do edital</h2>
            {[
              'Objeto, quantidades e especificações',
              'Critérios de julgamento e disputa',
              'Vedações e condições de participação',
              'Habilitação jurídica',
              'Regularidade fiscal e trabalhista',
              'Qualificação técnica e atestados',
              'Prazos de proposta e esclarecimentos',
            ].map((item) => (
              <label className="check-row" key={item}>
                <input
                  type="checkbox"
                  checked={Boolean(checks[item])}
                  onChange={(event) =>
                    setChecks((current) => ({ ...current, [item]: event.target.checked }))
                  }
                />{' '}
                {item}
              </label>
            ))}
          </article>
          <article className="module-card">
            <span className="tag">Resumo estruturado</span>
            <h2>ANA identificará</h2>
            <p>📍 Trechos e páginas que fundamentam cada exigência.</p>
            <p>⚠️ Pontos de atenção e riscos.</p>
            <p>🗓️ Prazos e alertas.</p>
            <p>📄 Documentos e modelos a preparar.</p>
            <p>
              ⚖️ Possíveis fundamentos para esclarecimento, impugnação e recurso, sempre com revisão
              humana.
            </p>
            <div className="module-notice">
              Não gerar documentos definitivos sem fonte, confirmação dos dados e aprovação do
              usuário.
            </div>
            <Link className="button-secondary" href="/documentos">
              Preparar documentos →
            </Link>
          </article>
        </section>
      </ModuleFrame>
    );
  }

  if (module === 'precificacao') {
    return (
      <ModuleFrame
        eyebrow="Precificação"
        title="Planilha de precificação"
        description="Calcule um preço de referência com despesas, tributos e margem."
      >
        <section className="module-columns">
          <article className="module-card">
            <div className="form-grid">
              {(
                [
                  ['custo', 'Custo principal'],
                  ['frete', 'Frete e logística'],
                  ['operacao', 'Mão de obra e despesas'],
                  ['risco', 'Provisão de riscos'],
                  ['tributos', 'Tributos sobre a receita (%)'],
                  ['margem', 'Margem alvo sobre receita (%)'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    value={priceInputs[key]}
                    onChange={(event) =>
                      setPriceInputs((current) => ({
                        ...current,
                        [key]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="module-notice">
              Simulação simplificada. A precificação real deverá contemplar regime tributário, tipo
              de contratação, custos financeiros, BDI e tributos incidentes.
            </div>
          </article>
          <article className="module-card">
            <p className="eyebrow">Preço estimado de venda</p>
            <div className="module-metric">
              R$ {price.sale.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="module-divider" />
            <p className="module-muted">Custos totais</p>
            <h2>R$ {price.costs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
            <p className="module-muted">
              Fórmula ilustrativa: preço = custos / (1 − tributos% − margem%).
            </p>
            <Link className="button-secondary" href="/agenda">
              Salvar na participação →
            </Link>
          </article>
        </section>
      </ModuleFrame>
    );
  }

  if (module === 'documentos') {
    return (
      <ModuleFrame
        eyebrow="Documentos"
        title="Central de documentos"
        description="Organize habilitação e prepare minutas a partir dos dados validados."
      >
        <section className="module-columns">
          <article className="module-card">
            <h2>Documentos para conferir</h2>
            {[
              'Contrato social e alterações',
              'Cartão CNPJ',
              'Certidões federais, estaduais e municipais',
              'FGTS e CNDT',
              'Balanço e demonstrações contábeis',
              'Atestado de capacidade técnica',
              'Representação e procuração',
              'Declarações específicas do edital',
            ].map((item) => (
              <label className="check-row" key={item}>
                <input
                  type="checkbox"
                  checked={Boolean(checks[item])}
                  onChange={(event) =>
                    setChecks((current) => ({ ...current, [item]: event.target.checked }))
                  }
                />{' '}
                {item}
              </label>
            ))}
          </article>
          <article className="module-card">
            <h2>Preenchimento automático</h2>
            <p>
              A ANA poderá extrair dados do edital e preencher minutas com dados da empresa
              previamente validados.
            </p>
            <div className="tag-row">
              <span className="tag">Proposta comercial</span>
              <span className="tag">Declarações</span>
              <span className="tag">Ofícios</span>
            </div>
            <div className="module-divider" />
            <input placeholder="Razão social" />
            <input placeholder="CNPJ" />
            <button className="button-primary" type="button">
              Gerar minuta para revisão
            </button>
            <div className="module-notice">
              Nunca inventar certidões, atestados, assinaturas, números ou informações não
              comprovadas.
            </div>
          </article>
        </section>
      </ModuleFrame>
    );
  }

  if (module === 'pregoes') {
    return (
      <ModuleFrame
        eyebrow="Pregões ao vivo"
        title="Sala de acompanhamento"
        description="Central de sessões e alertas, com acesso às plataformas oficiais."
      >
        <Hero
          kicker="SESSÃO DEMONSTRATIVA"
          title="Pregão de aquisição de notebooks"
          text="Acompanhe prazos e registre ocorrências quando a integração oficial estiver autorizada."
        />
        <article className="module-card">
          <div className="module-card-top">
            <strong>Pregão demonstrativo · Portal oficial</strong>
            <span className="tag tag-warn">Sem conexão em tempo real</span>
          </div>
          <div className="module-divider" />
          <p>
            ✅ Checklist pré-sessão · 📣 Alertas de convocação · 📝 Registro de mensagens e lances
            quando houver integração autorizada.
          </p>
          <div className="button-row">
            <button className="button-secondary" type="button">
              Abrir portal oficial ↗
            </button>
            <Link className="button-primary" href="/agenda">
              Registrar próxima ação
            </Link>
          </div>
          <div className="module-notice">
            Não exibir lances ou alertas supostamente ao vivo sem integração autorizada e status
            verificável.
          </div>
        </article>
      </ModuleFrame>
    );
  }

  if (module === 'mercado') {
    return (
      <ModuleFrame
        eyebrow="Mercado e concorrentes"
        title="Estude quem vende ao governo"
        description="Cruze contratos firmados, fornecedores e preços históricos com indicação clara das fontes."
      >
        <section className="module-grid three-columns">
          <article className="module-card">
            <p className="eyebrow">Visão de mercado</p>
            <h2>Empresas contratadas</h2>
            <p>Buscar por CNPJ, fornecedor, órgão, município e período.</p>
            <span className="tag">Histórico público</span>
          </article>
          <article className="module-card">
            <p className="eyebrow">Inteligência competitiva</p>
            <h2>Concorrentes</h2>
            <p>Contratos, valores, recorrência, itens e órgãos compradores.</p>
            <span className="tag tag-blue">Comparação</span>
          </article>
          <article className="module-card">
            <p className="eyebrow">Tendências</p>
            <h2>O que o governo compra</h2>
            <p>PCA, licitações publicadas, contratos e padrões por segmento.</p>
            <span className="tag">Dados públicos</span>
          </article>
        </section>
        <article className="module-card market-search">
          <h2>Pesquisar mercado</h2>
          <div className="button-row">
            <input
              className="wide-input"
              placeholder="Fornecedor, produto, CNPJ ou órgão"
              value={marketTerm}
              onChange={(event) => setMarketTerm(event.target.value)}
            />
            <select>
              <option>Últimos 12 meses</option>
              <option>Últimos 24 meses</option>
            </select>
            <button className="button-primary" type="button">
              Pesquisar
            </button>
          </div>
          {marketTerm ? (
            <p className="module-muted">
              Busca preparada para: <strong>{marketTerm}</strong>
            </p>
          ) : null}
          <div className="module-notice">
            Toda análise deverá mostrar fonte, data de atualização e distinção entre preço
            homologado, contratado e efetivamente pago.
          </div>
        </article>
      </ModuleFrame>
    );
  }

  if (module === 'agenda') {
    return (
      <ModuleFrame
        eyebrow="Agenda e participações"
        title="Minha agenda e participações"
        description="Controle prazos, tarefas, sessões e resultados de cada contratação."
      >
        <section className="module-grid three-columns">
          <article className="module-card">
            <p className="eyebrow">Em preparação</p>
            <div className="module-metric">1</div>
            <p className="module-muted">Exemplo de participação</p>
          </article>
          <article className="module-card">
            <p className="eyebrow">Próximas sessões</p>
            <div className="module-metric">1</div>
            <p className="module-muted">Data demonstrativa</p>
          </article>
          <article className="module-card">
            <p className="eyebrow">Pendências</p>
            <div className="module-metric">3</div>
            <p className="module-muted">Conferir antes da proposta</p>
          </article>
        </section>
        <article className="module-card module-table-card">
          <h2>Pipeline de participação</h2>
          <table className="module-table">
            <thead>
              <tr>
                <th>Licitação</th>
                <th>Objeto</th>
                <th>Etapa</th>
                <th>Próxima ação</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>EX-001</td>
                <td>Notebooks</td>
                <td>
                  <span className="tag tag-warn">Preparação</span>
                </td>
                <td>Conferir habilitação</td>
              </tr>
            </tbody>
          </table>
          {[
            'Conferir certidões',
            'Validar preço mínimo',
            'Conferir edital e prazo da proposta',
          ].map((item) => (
            <label className="check-row" key={item}>
              <input
                type="checkbox"
                checked={Boolean(checks[item])}
                onChange={(event) =>
                  setChecks((current) => ({ ...current, [item]: event.target.checked }))
                }
              />{' '}
              {item}
            </label>
          ))}
        </article>
      </ModuleFrame>
    );
  }

  if (module === 'fornecedores') {
    function addSupplier(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!supplier.name.trim()) return;
      setSuppliers((current) => [
        ...current,
        `${supplier.name} · ${supplier.product || 'produto/serviço'} · ${supplier.price || 'preço a confirmar'}`,
      ]);
      setSupplier({ name: '', product: '', price: '', deadline: '' });
    }
    return (
      <ModuleFrame
        eyebrow="Meus fornecedores"
        title="Organize seus fornecedores"
        description="Cadastre contatos e compare condições antes de formar seu preço."
      >
        <section className="module-columns">
          <form className="module-card module-form" onSubmit={addSupplier}>
            <h2>Adicionar fornecedor</h2>
            <label>
              Razão social
              <input
                value={supplier.name}
                onChange={(event) => setSupplier({ ...supplier, name: event.target.value })}
                required
              />
            </label>
            <label>
              Produto ou serviço
              <input
                value={supplier.product}
                onChange={(event) => setSupplier({ ...supplier, product: event.target.value })}
              />
            </label>
            <label>
              Preço cotado
              <input
                value={supplier.price}
                onChange={(event) => setSupplier({ ...supplier, price: event.target.value })}
                placeholder="R$ 0,00"
              />
            </label>
            <label>
              Prazo de entrega
              <input
                value={supplier.deadline}
                onChange={(event) => setSupplier({ ...supplier, deadline: event.target.value })}
                placeholder="Ex.: 10 dias"
              />
            </label>
            <button className="button-primary" type="submit">
              Salvar fornecedor
            </button>
            {suppliers.length ? (
              <ul className="module-list">
                {suppliers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </form>
          <article className="module-card">
            <h2>Comparação comercial</h2>
            <p>
              Uma oportunidade poderá receber múltiplas cotações, com preço, prazo, garantia, frete,
              validade e evidência documental.
            </p>
            <div className="module-notice">
              Não presumir que o menor preço cotado é o menor custo real. A ANA verificará
              logística, tributação e riscos.
            </div>
          </article>
        </section>
      </ModuleFrame>
    );
  }

  if (module === 'plano30') {
    return (
      <ModuleFrame
        eyebrow="Plano de 30 dias"
        title="Seu plano de ação em 30 dias"
        description="Uma meta de execução assistida — encontrar e preparar uma participação viável, sem garantia de adjudicação."
      >
        <section className="module-grid three-columns">
          {days.map(([period, title, description], index) => {
            const key = `day-${index}`;
            return (
              <article className="module-card" key={key}>
                <strong className="module-period">DIAS {period}</strong>
                <h2>{title}</h2>
                <p>{description}</p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={Boolean(checks[key])}
                    onChange={(event) =>
                      setChecks((current) => ({ ...current, [key]: event.target.checked }))
                    }
                  />{' '}
                  Etapa concluída
                </label>
              </article>
            );
          })}
        </section>
        <Hero
          kicker="ORIENTAÇÃO DA ANA"
          title="Hoje vamos identificar oportunidades compatíveis."
          text="A jornada só avança quando houver dados, fonte e uma próxima ação clara."
          href="/radar"
          label="Começar pela busca"
        />
      </ModuleFrame>
    );
  }

  if (module === 'mentoria') {
    return (
      <ModuleFrame
        eyebrow="Mentoria"
        title="Espaço do mentorado"
        description="Acesso exclusivo ao acompanhamento, sem tirar o foco da prática."
      >
        <section className="module-grid three-columns">
          <article className="module-card">
            <h2>Plano de ação de 30 dias</h2>
            <p>Atividades específicas orientadas para uma participação viável.</p>
            <Link className="button-primary" href="/plano-30-dias">
              Abrir plano
            </Link>
          </article>
          <article className="module-card">
            <h2>Revisões e devolutivas</h2>
            <p>
              Solicite revisão das análises, documentos e precificação conforme a mentoria
              contratada.
            </p>
            <button className="button-secondary" type="button">
              Enviar caso
            </button>
          </article>
          <article className="module-card">
            <h2>Encontros e materiais</h2>
            <p>Aulas e encontros como apoio contextual às tarefas, sem substituir a execução.</p>
            <Link className="button-secondary" href="/academia">
              Consultar academia
            </Link>
          </article>
        </section>
        <article className="module-card mentor-access">
          <h2>Painel de acompanhamento</h2>
          <p>
            Empresas e mentorados aparecem somente quando existe uma concessão explícita no tenant.
          </p>
          <Link className="button-primary" href="/academia/mentor">
            Abrir painel de mentor
          </Link>
        </article>
      </ModuleFrame>
    );
  }

  return (
    <ModuleFrame
      eyebrow="Assinatura"
      title="Minha assinatura e notas fiscais"
      description="Gerencie plano, cobranças, recibos e notas fiscais da assinatura."
    >
      <section className="module-columns">
        <article className="module-card">
          <span className="tag">Plano atual</span>
          <h2>LiciteComigo Empresa</h2>
          <p>Assinatura recorrente; condições e preços serão definidos no módulo comercial.</p>
          <button className="button-primary" type="button">
            Gerenciar assinatura
          </button>
        </article>
        <article className="module-card">
          <h2>Notas fiscais</h2>
          <p>
            A emissão será feita pelo emissor fiscal integrado após a confirmação e classificação do
            pagamento.
          </p>
          <table className="module-table">
            <tbody>
              <tr>
                <th>Competência</th>
                <th>Status</th>
              </tr>
              <tr>
                <td>Exemplo</td>
                <td>Não emitida</td>
              </tr>
            </tbody>
          </table>
          <div className="module-notice">
            Este módulo emite nota do serviço de assinatura da LiciteComigo, não notas fiscais de
            vendas ao governo.
          </div>
        </article>
      </section>
    </ModuleFrame>
  );
}
