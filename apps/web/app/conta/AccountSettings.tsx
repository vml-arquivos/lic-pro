'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';

type Account = {
  id: string;
  email: string;
  nome: string;
  papel: string;
  publico: 'empresa' | 'mentoria';
  nivel_diagnostico: 'sem_diagnostico' | 'iniciante' | 'em_evolucao' | 'pronto_para_operar';
  perfil_jornada: 'iniciante' | 'mentorado' | 'profissional';
  onboarding_concluido: boolean;
  nicho_preferencias: string[] | null;
  email_verificado_em?: string | null;
  empresa_id?: string | null;
  created_at?: string;
};

type ProfileForm = {
  nome: string;
  publico: Account['publico'];
  nivel_diagnostico: Account['nivel_diagnostico'];
  perfil_jornada: Account['perfil_jornada'];
};

const journeyOptions = [
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'mentorado', label: 'Mentorado' },
  { value: 'profissional', label: 'Empresário avançado' },
] as const;

const audienceOptions = [
  { value: 'empresa', label: 'Empresa' },
  { value: 'mentoria', label: 'Mentoria' },
] as const;

const diagnosisOptions = [
  { value: 'sem_diagnostico', label: 'Ainda não informado' },
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'em_evolucao', label: 'Em evolução' },
  { value: 'pronto_para_operar', label: 'Pronto para operar' },
] as const;

function roleLabel(role: string) {
  return (
    {
      admin: 'Administrador',
      operador: 'Operação',
      mentor: 'Mentor',
      aluno: 'Mentorado',
    }[role] ?? role
  );
}

function errorMessage(code: string) {
  return (
    {
      current_password_invalid: 'A senha atual não confere.',
      password_must_change: 'A nova senha precisa ser diferente da senha atual.',
      weak_password: 'Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.',
      validation_error: 'Confira os campos informados.',
    }[code] ?? 'Não foi possível concluir esta ação agora.'
  );
}

async function responseCode(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error ?? `http_${response.status}`;
}

export function AccountSettings() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'loading' | 'ready' | 'denied' | 'error'>(
    'loading',
  );
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [niches, setNiches] = useState<string[]>(['', '', '']);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/core/me', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          setSessionStatus('denied');
          return null;
        }
        if (!response.ok) throw new Error('account_unavailable');
        return (await response.json()) as Account;
      })
      .then((current) => {
        if (!current || controller.signal.aborted) return;
        setAccount(current);
        setProfileForm({
          nome: current.nome,
          publico: current.publico,
          nivel_diagnostico: current.nivel_diagnostico,
          perfil_jornada: current.perfil_jornada,
        });
        const preferred = current.nicho_preferencias ?? [];
        setNiches([preferred[0] ?? '', preferred[1] ?? '', preferred[2] ?? '']);
        setSessionStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setSessionStatus('error');
      });
    return () => controller.abort();
  }, []);

  const panels = useMemo(() => {
    if (!account) return [];
    const role = account.papel.toLowerCase();
    const result = [
      {
        label: 'Painel geral',
        description: 'Resumo da sua conta, empresas e operação.',
        href: '/painel',
      },
      {
        label: 'Alertas',
        description: 'Notificações geradas dentro do seu escopo.',
        href: '/alertas',
      },
      {
        label: 'Buscas salvas',
        description: 'Consultas e regras de alerta da sua conta.',
        href: '/buscas-salvas',
      },
      {
        label: 'Pregões publicados',
        description: 'Publicações capturadas com fonte oficial.',
        href: '/pregoes',
      },
      {
        label: 'Oportunidades',
        description: 'Editais salvos no pipeline da conta.',
        href: '/oportunidades',
      },
      {
        label: 'Empresas',
        description: 'CNPJs e empresas acessíveis pela sua conta.',
        href: '/empresas',
      },
    ];
    if (role === 'mentor' || role === 'admin') {
      result.push({
        label: 'Painel do mentor',
        description: 'Mentorados e empresas com concessão explícita.',
        href: '/mentor',
      });
    }
    if (role === 'aluno' || account.perfil_jornada === 'mentorado') {
      result.push({
        label: 'Área do mentorado',
        description: 'Progresso da jornada e acompanhamento.',
        href: '/mentorado',
      });
    }
    if (account.perfil_jornada === 'profissional' || role === 'operador') {
      result.push({
        label: 'Painel profissional',
        description: 'Oportunidades, prazos e tarefas do perfil profissional.',
        href: '/profissional',
      });
    }
    if (role === 'admin') {
      result.push({
        label: 'Administração',
        description: 'Usuários, auditoria e operação protegida.',
        href: '/admin',
      });
      result.push({
        label: 'Leads',
        description: 'Leads capturados com consentimento e status de atendimento.',
        href: '/leads',
      });
    }
    return result;
  }, [account]);

  function updateNiche(index: number, value: string) {
    setNiches((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileForm) return;
    const selected = niches.filter(Boolean);
    setProfileMessage('');
    setProfileError('');
    if (selected.length < 1 || selected.length > 3 || new Set(selected).size !== selected.length) {
      setProfileError('Escolha de um a três nichos diferentes para o escopo do Radar.');
      return;
    }
    setSavingProfile(true);
    try {
      const response = await fetch('/api/core/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...profileForm, nichos: selected }),
      });
      if (!response.ok) {
        setProfileError(errorMessage(await responseCode(response)));
        return;
      }
      const updated = (await response.json()) as Partial<Account>;
      setAccount((current) =>
        current ? { ...current, ...updated, nicho_preferencias: selected } : current,
      );
      setNiches([selected[0] ?? '', selected[1] ?? '', selected[2] ?? '']);
      setProfileMessage('Dados do perfil atualizados.');
    } catch {
      setProfileError('Não foi possível salvar os dados agora.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    setSavingPassword(true);
    try {
      const response = await fetch('/api/core/auth/password-change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (!response.ok) {
        setPasswordError(errorMessage(await responseCode(response)));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage('Senha alterada com sucesso.');
    } catch {
      setPasswordError('Não foi possível alterar a senha agora.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
    router.refresh();
  }

  if (sessionStatus === 'loading') {
    return (
      <main className="account-page">
        <p className="notice">Validando sua conta…</p>
      </main>
    );
  }

  if (sessionStatus === 'denied') {
    return (
      <main className="account-page">
        <section className="access-denied" role="alert">
          <p className="eyebrow">Minha conta</p>
          <h1>Entre para acessar seus dados.</h1>
          <p>
            Perfil, empresas, segurança e painéis ficam disponíveis somente para a conta
            autenticada.
          </p>
          <Link className="button-primary" href="/login">
            Entrar
          </Link>
        </section>
      </main>
    );
  }

  if (sessionStatus === 'error' || !account || !profileForm) {
    return (
      <main className="account-page">
        <section className="account-card" role="alert">
          <p className="eyebrow">Minha conta</p>
          <h1>Não foi possível carregar seus dados.</h1>
          <p>Tente atualizar a página. Nenhum dado local foi usado para preencher este espaço.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="account-page">
      <div className="account-heading">
        <div>
          <p className="eyebrow">Minha conta</p>
          <h1>Seus dados e acessos</h1>
          <p>Atualize seu perfil, proteja sua conta e encontre cada painel autorizado.</p>
        </div>
        <button
          className="button-secondary"
          type="button"
          onClick={() => void logout()}
          disabled={loggingOut}
        >
          {loggingOut ? 'Saindo…' : 'Sair da conta'}
        </button>
      </div>

      <section className="account-status-bar" aria-label="Status da conta">
        <span>
          <strong>{roleLabel(account.papel)}</strong> · {account.email}
        </span>
        <span
          className={account.email_verificado_em ? 'account-status-ok' : 'account-status-warning'}
        >
          {account.email_verificado_em ? 'E-mail verificado' : 'E-mail ainda não verificado'}
        </span>
      </section>

      <div className="account-grid">
        <section className="account-card">
          <div className="account-card-heading">
            <div>
              <p className="eyebrow">Perfil</p>
              <h2>Dados da conta</h2>
            </div>
            <span className="account-readonly">E-mail não editável</span>
          </div>
          <form className="account-form" onSubmit={(event) => void saveProfile(event)}>
            <label>
              Nome completo
              <input
                value={profileForm.nome}
                onChange={(event) => setProfileForm({ ...profileForm, nome: event.target.value })}
                autoComplete="name"
                required
              />
            </label>
            <label>
              E-mail de acesso
              <input value={account.email} readOnly disabled autoComplete="email" />
            </label>
            <div className="account-form-grid">
              <label>
                Público da conta
                <select
                  value={profileForm.publico}
                  onChange={(event) =>
                    setProfileForm({
                      ...profileForm,
                      publico: event.target.value as ProfileForm['publico'],
                    })
                  }
                >
                  {audienceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Perfil de jornada
                <select
                  value={profileForm.perfil_jornada}
                  onChange={(event) =>
                    setProfileForm({
                      ...profileForm,
                      perfil_jornada: event.target.value as ProfileForm['perfil_jornada'],
                    })
                  }
                >
                  {journeyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nível atual
                <select
                  value={profileForm.nivel_diagnostico}
                  onChange={(event) =>
                    setProfileForm({
                      ...profileForm,
                      nivel_diagnostico: event.target.value as ProfileForm['nivel_diagnostico'],
                    })
                  }
                >
                  {diagnosisOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="account-fieldset">
              <legend>Nichos do Radar</legend>
              <p className="form-hint">
                Esses nichos definem o escopo de oportunidades e alertas da conta.
              </p>
              <div className="account-form-grid account-niche-grid">
                {niches.map((value, index) => (
                  <label key={index}>
                    {`Nicho ${index + 1}`}
                    <select
                      value={value}
                      onChange={(event) => updateNiche(index, event.target.value)}
                      required={index === 0}
                    >
                      <option value="">
                        {index === 0 ? 'Selecione um nicho' : 'Não usar este campo'}
                      </option>
                      {NICHE_CATALOG.map((niche) => (
                        <option key={niche.code} value={niche.code}>
                          {niche.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="account-form-actions">
              <button className="button-primary" type="submit" disabled={savingProfile}>
                {savingProfile ? 'Salvando…' : 'Salvar dados do perfil'}
              </button>
              {profileMessage ? (
                <p className="success-message" role="status">
                  {profileMessage}
                </p>
              ) : null}
              {profileError ? (
                <p className="error-message" role="alert">
                  {profileError}
                </p>
              ) : null}
            </div>
          </form>
        </section>

        <section className="account-card account-security-card">
          <div className="account-card-heading">
            <div>
              <p className="eyebrow">Segurança</p>
              <h2>Alterar senha</h2>
            </div>
          </div>
          <p className="form-hint">
            A senha atual é necessária. A nova senha deve ter 12 caracteres, maiúscula, minúscula,
            número e símbolo.
          </p>
          <form className="account-form" onSubmit={(event) => void changePassword(event)}>
            <label>
              Senha atual
              <input
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              Nova senha
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <button className="button-primary" type="submit" disabled={savingPassword}>
              {savingPassword ? 'Atualizando…' : 'Alterar senha'}
            </button>
            {passwordMessage ? (
              <p className="success-message" role="status">
                {passwordMessage}
              </p>
            ) : null}
            {passwordError ? (
              <p className="error-message" role="alert">
                {passwordError}
              </p>
            ) : null}
          </form>
          <Link className="account-inline-link" href="/password-recovery">
            Não lembra a senha? Recuperar acesso
          </Link>
        </section>
      </div>

      <section className="account-card account-panels-card">
        <div className="account-card-heading">
          <div>
            <p className="eyebrow">Acessos</p>
            <h2>Painéis e funcionalidades da sua conta</h2>
          </div>
          <span className="account-readonly">Permissões validadas pelo backend</span>
        </div>
        <div className="account-panel-grid">
          {panels.map((panel) => (
            <Link className="account-panel-link" href={panel.href} key={panel.href}>
              <strong>{panel.label}</strong>
              <span>{panel.description}</span>
              <small>Abrir →</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="account-links-row">
        <Link href="/onboarding">Revisar onboarding e nichos</Link>
        <Link href="/radar">Explorar licitações</Link>
        <Link href="/empresas">Gerenciar empresas</Link>
      </section>
    </main>
  );
}
