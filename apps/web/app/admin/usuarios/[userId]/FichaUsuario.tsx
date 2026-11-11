'use client';

import Link from 'next/link';
import { useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import { errorText, send } from '../../../../lib/api';
import {
  Alert,
  Badge,
  Empty,
  Kpi,
  Panel,
  Resource,
  Table,
  formatDate,
  formatNumber,
  useResource,
} from '../../../components/ui';
import { ActiveToggle } from '../../_components/ActiveToggle';
import { ResetLinkBox, ResetLinkButton, type ResetLink } from '../../_components/UserActions';

type Tipo = 'empresa' | 'aluno' | 'mentor' | 'colaborador' | 'equipe';
type Filtros = Record<string, unknown>;

type Ficha = {
  usuario: {
    id: string;
    nome: string;
    email: string;
    tipo: Tipo;
    ativo: boolean;
    conta: string;
    nichos: string[];
    onboarding_concluido: boolean;
    email_verificado: boolean;
    created_at: string;
  };
  escopo: 'empresa' | 'usuario';
  empresa: {
    razao_social: string;
    nome_fantasia: string | null;
    cnpj: string;
    porte: string | null;
    segmento: string | null;
    cidade: string | null;
    uf: string | null;
  } | null;
  assinatura: { plano: string; status: string; inicio_em: string; fim_em: string | null } | null;
  usuarios_da_empresa: { id: string; nome: string; email: string; papel: string; ativo: boolean }[];
  acesso: {
    primeiro_acesso: string | null;
    ultimo_acesso: string | null;
    entradas: number;
    dias_ativos_30d: number;
    usos_30d: number;
    por_recurso: {
      recurso: string;
      rotulo: string;
      total: number;
      dias: number;
      ultimo_em: string;
    }[];
    recentes: { recurso: string; rotulo: string; total: number; ultimo_em: string }[];
  };
  buscas: {
    salvas: { id: string; nome: string; filtros: Filtros; ativa: boolean; created_at: string }[];
    recentes: {
      origem: 'radar' | 'precos';
      termo: string | null;
      filtros: Filtros;
      created_at: string;
    }[];
  };
  oportunidades: {
    por_status: { status: string; total: number }[];
    recentes: {
      id: string;
      status: string;
      updated_at: string;
      titulo: string | null;
      orgao: string | null;
      uf: string | null;
      modalidade: string | null;
      valor_estimado: string | null;
    }[];
  };
  alertas: { total: number; ultimos_30d: number; ultimo_em: string | null };
  ana: { conversas: number; ultimos_30d: number; ultima_em: string | null };
  curso: Record<string, string | number | null> | null;
  historico: { acao: string; rotulo: string; created_at: string }[];
};

const TIPO_LABEL: Record<Tipo, string> = {
  empresa: 'Empresa cliente',
  aluno: 'Aluno',
  mentor: 'Mentor',
  colaborador: 'Colaborador',
  equipe: 'Administrador',
};
const TIPO_LISTA: Record<Tipo, { href: string; label: string }> = {
  empresa: { href: '/admin/empresas', label: 'Empresas clientes' },
  aluno: { href: '/admin/alunos', label: 'Alunos e turmas' },
  mentor: { href: '/admin/mentores', label: 'Mentores' },
  colaborador: { href: '/admin/colaboradores', label: 'Colaboradores' },
  equipe: { href: '/admin/equipe', label: 'Equipe administrativa' },
};
const PAPEL_LABEL: Record<string, string> = {
  admin: 'Responsável',
  operador: 'Operador',
  plataforma: 'Administrador',
  mentor: 'Mentor',
  aluno: 'Aluno',
  colaborador: 'Colaborador',
};
const STATUS_OPORTUNIDADE: Record<string, string> = {
  salva: 'Salva',
  triagem: 'Em triagem',
  em_analise: 'Em análise',
  em_habilitacao: 'Em habilitação',
  proposta: 'Proposta',
  arquivada: 'Arquivada',
  ganha: 'Ganha',
  perdida: 'Perdida',
};
const FILTRO_LABEL: Record<string, string> = {
  nicho: 'Nicho',
  uf: 'UF',
  regiao: 'Região',
  modalidade: 'Modalidade',
  orgao: 'Órgão',
  municipio: 'Município',
  catmat: 'CATMAT',
  catmat_catser: 'CATMAT/CATSER',
  item: 'Item',
  periodo: 'Período',
  situacao_prazo: 'Prazo',
  valor_min: 'Valor mínimo',
  valor_max: 'Valor máximo',
  q: 'Termo',
};

const nicheLabel = (code: string) => NICHE_CATALOG.find((n) => n.code === code)?.label ?? code;

/** Resume os filtros de uma busca em uma linha: "UF: SP · Modalidade: Pregão". */
function filtrosTexto(filtros: Filtros): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(filtros ?? {})) {
    if (!(key in FILTRO_LABEL)) continue;
    const scalar = Array.isArray(value) ? value.join(', ') : value;
    if (typeof scalar !== 'string' && typeof scalar !== 'number') continue;
    const text = String(scalar).trim();
    if (!text) continue;
    const shown = key === 'nicho' ? text.split(', ').map(nicheLabel).join(', ') : text;
    parts.push(`${FILTRO_LABEL[key]}: ${shown}`);
  }
  return parts.join(' · ') || 'Sem filtros';
}

function relativeDays(value: string | null): string {
  if (!value) return 'Nunca entrou';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return '—';
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return `Há ${days} dias`;
}

function money(value: string | null): string {
  if (value === null || value === undefined) return '—';
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';
}

function EditForm({
  ficha,
  onSaved,
  onCancel,
}: Readonly<{ ficha: Ficha; onSaved: () => void; onCancel: () => void }>) {
  const [nome, setNome] = useState(ficha.usuario.nome);
  const [email, setEmail] = useState(ficha.usuario.email);
  const [empresa, setEmpresa] = useState(ficha.empresa?.razao_social ?? ficha.usuario.conta);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isCompany = ficha.usuario.tipo === 'empresa';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const changes: Record<string, string> = {};
    if (nome.trim() !== ficha.usuario.nome) changes.nome = nome.trim();
    if (email.trim().toLowerCase() !== ficha.usuario.email.toLowerCase())
      changes.email = email.trim();
    if (isCompany && empresa.trim() !== (ficha.empresa?.razao_social ?? ficha.usuario.conta)) {
      changes.empresa_nome = empresa.trim();
    }
    if (!Object.keys(changes).length) {
      setError('Nada foi alterado.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await send('PATCH', `/platform/users/${ficha.usuario.id}`, changes);
      onSaved();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ui-form" onSubmit={(event) => void submit(event)} aria-label="Editar dados">
      <label>
        Nome
        <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={2} required />
      </label>
      <label>
        E-mail de acesso
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      {isCompany ? (
        <label>
          Nome da empresa
          <input
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            minLength={2}
            required
          />
        </label>
      ) : null}
      <small>
        Ao trocar o e-mail, a pessoa passa a entrar com o novo endereço. A senha continua a mesma.
      </small>
      <div className="ui-form-actions">
        <button className="ui-btn" type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar alterações'}
        </button>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {error ? <Alert kind="error">{error}</Alert> : null}
    </form>
  );
}

function Data({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function FichaUsuario({
  userId,
  selfId,
  startEditing,
}: Readonly<{ userId: string; selfId: string; startEditing: boolean }>) {
  const [ficha, reload] = useResource<Ficha>(`/platform/users/${userId}/ficha`);
  const [editing, setEditing] = useState(startEditing);
  const [error, setError] = useState('');
  const [link, setLink] = useState<ResetLink | null>(null);

  return (
    <Resource value={ficha}>
      {(data) => {
        const { usuario, acesso } = data;
        const lista = TIPO_LISTA[usuario.tipo];
        const forCompany = data.escopo === 'empresa';
        return (
          <>
            <p>
              <Link href={lista.href}>← Voltar para {lista.label}</Link>
            </p>
            <Panel
              title={usuario.nome}
              description={`${TIPO_LABEL[usuario.tipo]} · ${usuario.email}`}
              actions={<Badge>{usuario.ativo ? 'Ativo' : 'Inativo'}</Badge>}
            >
              {error ? <Alert kind="error">{error}</Alert> : null}
              {link ? <ResetLinkBox link={link} onClose={() => setLink(null)} /> : null}
              {editing ? (
                <EditForm
                  ficha={data}
                  onCancel={() => setEditing(false)}
                  onSaved={() => {
                    setEditing(false);
                    setError('');
                    reload();
                  }}
                />
              ) : (
                <div className="ui-table-actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn-small"
                    onClick={() => setEditing(true)}
                  >
                    Editar dados
                  </button>
                  <ResetLinkButton
                    userId={usuario.id}
                    ativo={usuario.ativo}
                    label="Gerar link de senha"
                    onGenerated={setLink}
                    onError={setError}
                  />
                  {usuario.id !== selfId ? (
                    <ActiveToggle
                      userId={usuario.id}
                      ativo={usuario.ativo}
                      onDone={() => {
                        setError('');
                        reload();
                      }}
                      onError={setError}
                    />
                  ) : null}
                </div>
              )}
            </Panel>

            <div className="ui-kpis" aria-label="Resumo de uso">
              <Kpi
                label="Último acesso"
                value={relativeDays(acesso.ultimo_acesso)}
                hint={
                  acesso.ultimo_acesso
                    ? formatDate(acesso.ultimo_acesso, true)
                    : 'Ainda sem entrada registrada'
                }
              />
              <Kpi
                label="Entradas no sistema"
                value={formatNumber(acesso.entradas)}
                hint="Desde o início do registro"
              />
              <Kpi
                label="Dias com uso (30 dias)"
                value={formatNumber(acesso.dias_ativos_30d)}
                tone={acesso.dias_ativos_30d ? 'ok' : 'warn'}
              />
              <Kpi label="Ações no sistema (30 dias)" value={formatNumber(acesso.usos_30d)} />
            </div>

            <Panel title="Dados">
              <dl className="ui-dl">
                <Data label="Nome">{usuario.nome}</Data>
                <Data label="E-mail de acesso">{usuario.email}</Data>
                <Data label="Tipo">{TIPO_LABEL[usuario.tipo]}</Data>
                <Data label="Conta">{usuario.conta}</Data>
                <Data label="Cadastro em">{formatDate(usuario.created_at, true)}</Data>
                <Data label="E-mail confirmado">{usuario.email_verificado ? 'Sim' : 'Não'}</Data>
                <Data label="Configuração inicial">
                  {usuario.onboarding_concluido ? 'Concluída' : 'Ainda não concluída'}
                </Data>
                {data.empresa ? (
                  <>
                    <Data label="Razão social">{data.empresa.razao_social}</Data>
                    <Data label="CNPJ">{data.empresa.cnpj}</Data>
                    <Data label="Cidade / UF">
                      {[data.empresa.cidade, data.empresa.uf].filter(Boolean).join(' / ') || '—'}
                    </Data>
                    <Data label="Porte e segmento">
                      {[data.empresa.porte, data.empresa.segmento].filter(Boolean).join(' · ') ||
                        '—'}
                    </Data>
                  </>
                ) : null}
                {forCompany ? (
                  <Data label="Plano">
                    {data.assinatura
                      ? `${data.assinatura.plano} (${data.assinatura.status}${
                          data.assinatura.fim_em
                            ? `, até ${formatDate(data.assinatura.fim_em)}`
                            : ''
                        })`
                      : 'Sem plano'}
                  </Data>
                ) : null}
              </dl>
            </Panel>

            <Panel
              title="O que está procurando"
              description="Nichos escolhidos, buscas salvas e as últimas buscas feitas no Radar e em Preços pagos."
            >
              <p>
                <strong>Nichos: </strong>
                {usuario.nichos.length
                  ? usuario.nichos.map(nicheLabel).join(', ')
                  : usuario.onboarding_concluido
                    ? 'Nenhum nicho definido'
                    : 'Ainda não definiu'}
              </p>
              <h3>Buscas salvas</h3>
              {data.buscas.salvas.length ? (
                <Table label="Buscas salvas" head={['Busca', 'Filtros', 'Situação', 'Criada em']}>
                  {data.buscas.salvas.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.nome}</strong>
                      </td>
                      <td>{filtrosTexto(item.filtros)}</td>
                      <td>
                        <Badge>{item.ativa ? 'Ativa' : 'Inativo'}</Badge>
                      </td>
                      <td>{formatDate(item.created_at)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>Nenhuma busca salva.</Empty>
              )}
              <h3>Últimas buscas feitas</h3>
              {data.buscas.recentes.length ? (
                <Table label="Buscas recentes" head={['Quando', 'Onde', 'O que buscou']}>
                  {data.buscas.recentes.map((item, index) => (
                    <tr key={`${item.created_at}-${index}`}>
                      <td>{formatDate(item.created_at, true)}</td>
                      <td>{item.origem === 'precos' ? 'Preços pagos' : 'Radar de editais'}</td>
                      <td>
                        {item.termo ? <strong>“{item.termo}”</strong> : null}
                        <small>{filtrosTexto(item.filtros)}</small>
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>
                  Nenhuma busca registrada ainda. As buscas passam a aparecer aqui a partir desta
                  versão do sistema.
                </Empty>
              )}
            </Panel>

            <Panel
              title="O que já acessou"
              description={`${forCompany ? 'Uso de todos os usuários da empresa' : 'Uso desta pessoa'} nos últimos 30 dias, por área do sistema.`}
            >
              {acesso.por_recurso.length ? (
                <Table
                  label="Uso por área"
                  head={['Área', 'Vezes', 'Dias diferentes', 'Último uso']}
                >
                  {acesso.por_recurso.map((item) => (
                    <tr key={item.recurso}>
                      <td>
                        <strong>{item.rotulo}</strong>
                      </td>
                      <td>{formatNumber(item.total)}</td>
                      <td>{item.dias}</td>
                      <td>{formatDate(item.ultimo_em, true)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>
                  Nenhum uso registrado nos últimos 30 dias. O registro passa a valer a partir desta
                  versão do sistema.
                </Empty>
              )}
            </Panel>

            <Panel title="Oportunidades no pipeline">
              {data.oportunidades.por_status.length ? (
                <>
                  <p className="ui-table-actions">
                    {data.oportunidades.por_status.map((item) => (
                      <Badge key={item.status} tone="muted">
                        {`${STATUS_OPORTUNIDADE[item.status] ?? item.status}: ${item.total}`}
                      </Badge>
                    ))}
                  </p>
                  <Table
                    label="Oportunidades"
                    head={['Edital', 'Órgão / UF', 'Valor estimado', 'Fase', 'Atualizada em']}
                  >
                    {data.oportunidades.recentes.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.titulo ?? 'Edital sem título'}</strong>
                          <small>{item.modalidade ?? ''}</small>
                        </td>
                        <td>{[item.orgao, item.uf].filter(Boolean).join(' · ') || '—'}</td>
                        <td>{money(item.valor_estimado)}</td>
                        <td>{STATUS_OPORTUNIDADE[item.status] ?? item.status}</td>
                        <td>{formatDate(item.updated_at)}</td>
                      </tr>
                    ))}
                  </Table>
                </>
              ) : (
                <Empty>Nenhuma oportunidade salva.</Empty>
              )}
            </Panel>

            <div className="ui-kpis" aria-label="Alertas e Ana">
              <Kpi
                label="Alertas recebidos"
                value={formatNumber(data.alertas.total)}
                hint={`${data.alertas.ultimos_30d} nos últimos 30 dias${
                  data.alertas.ultimo_em ? ` · último em ${formatDate(data.alertas.ultimo_em)}` : ''
                }`}
              />
              <Kpi
                label="Conversas com a Ana"
                value={formatNumber(data.ana.conversas)}
                hint={`${data.ana.ultimos_30d} nos últimos 30 dias${
                  data.ana.ultima_em ? ` · última em ${formatDate(data.ana.ultima_em)}` : ''
                }`}
              />
            </div>

            {data.curso ? (
              <Panel title={usuario.tipo === 'mentor' ? 'Mentoria' : 'Andamento no curso'}>
                <dl className="ui-dl">
                  {usuario.tipo === 'aluno' ? (
                    <>
                      <Data label="Turma">{String(data.curso.turma_nome ?? '—')}</Data>
                      <Data label="Aulas concluídas">
                        {String(data.curso.aulas_concluidas ?? 0)}
                      </Data>
                      <Data label="Última aula">
                        {formatDate(String(data.curso.ultimo_progresso ?? ''))}
                      </Data>
                      <Data label="Plano de 30 dias">
                        {data.curso.plano_total
                          ? `${data.curso.plano_feitos}/${data.curso.plano_total} dias`
                          : '—'}
                      </Data>
                      <Data label="Práticas enviadas">
                        {String(data.curso.praticas_enviadas ?? 0)}
                      </Data>
                      <Data label="Certificados">{String(data.curso.certificados ?? 0)}</Data>
                    </>
                  ) : (
                    <>
                      <Data label="Alunos ativos">{String(data.curso.alunos_ativos ?? 0)}</Data>
                      <Data label="Acessos concedidos">
                        {String(data.curso.concessoes_ativas ?? 0)}
                      </Data>
                    </>
                  )}
                </dl>
              </Panel>
            ) : null}

            {forCompany ? (
              <Panel title="Usuários desta empresa">
                <Table label="Usuários da empresa" head={['Nome', 'Função', 'Situação', '']}>
                  {data.usuarios_da_empresa.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.nome}</strong>
                        <small>{item.email}</small>
                      </td>
                      <td>{PAPEL_LABEL[item.papel] ?? item.papel}</td>
                      <td>
                        <Badge>{item.ativo ? 'Ativo' : 'Inativo'}</Badge>
                      </td>
                      <td>
                        {item.id === usuario.id ? (
                          'Esta ficha'
                        ) : (
                          <Link className="ui-btn ui-btn-small" href={`/admin/usuarios/${item.id}`}>
                            Ver ficha
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              </Panel>
            ) : null}

            <Panel
              title="Histórico recente"
              description={
                forCompany
                  ? 'Últimas ações de todos os usuários da empresa.'
                  : 'Últimas ações desta pessoa e o que a Administração fez na conta dela.'
              }
            >
              {data.historico.length ? (
                <Table label="Histórico" head={['Quando', 'O que aconteceu']}>
                  {data.historico.map((item, index) => (
                    <tr key={`${item.created_at}-${index}`}>
                      <td>{formatDate(item.created_at, true)}</td>
                      <td>{item.rotulo}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>Sem ações registradas ainda.</Empty>
              )}
            </Panel>
          </>
        );
      }}
    </Resource>
  );
}
