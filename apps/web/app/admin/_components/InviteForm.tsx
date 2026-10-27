'use client';

import { useState } from 'react';
import { Alert } from '../../components/ui';
import { errorText, send } from '../../../lib/api';

export type InviteKind = 'aluno' | 'mentor' | 'empresa';
type Option = { id: string; nome: string };
type Created = { id: string; expira_em: string; link: string; email_enviado: boolean };

const LABELS: Record<InviteKind, { title: string; cta: string }> = {
  aluno: { title: 'Matricular aluno', cta: 'Gerar convite do aluno' },
  mentor: { title: 'Convidar mentor', cta: 'Gerar convite do mentor' },
  empresa: { title: 'Convidar empresa', cta: 'Gerar convite da empresa' },
};

export function InviteLink({ created }: Readonly<{ created: Created }>) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="ui-link-box" role="status">
      <strong>
        {created.email_enviado
          ? 'Convite enviado por e-mail. O link também está aqui:'
          : 'Convite criado. Envie este link à pessoa (ele só aparece agora):'}
      </strong>
      <code>{created.link}</code>
      <div className="ui-table-actions">
        <button type="button" className="ui-btn ui-btn-small" onClick={() => void copy()}>
          {copied ? 'Link copiado' : 'Copiar link'}
        </button>
        <small>Vale por 7 dias e só pode ser usado uma vez.</small>
      </div>
    </div>
  );
}

export function InviteForm({
  kind,
  classes = [],
  mentors = [],
  onCreated,
}: Readonly<{
  kind: InviteKind;
  classes?: Option[];
  mentors?: Option[];
  onCreated: () => void;
}>) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [turma, setTurma] = useState('');
  const [mentor, setMentor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setCreated(null);
    try {
      const result = await send<Created>('POST', '/platform/invitations', {
        tipo: kind,
        nome,
        email,
        ...(kind === 'empresa' ? { empresa_nome: empresa } : {}),
        ...(kind === 'aluno' ? { turma_id: turma, ...(mentor ? { mentor_id: mentor } : {}) } : {}),
      });
      setCreated(result);
      setNome('');
      setEmail('');
      setEmpresa('');
      onCreated();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="ui-form"
      onSubmit={(event) => void submit(event)}
      aria-label={LABELS[kind].title}
    >
      <label>
        Nome
        <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={2} required />
      </label>
      <label>
        E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      {kind === 'empresa' ? (
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
      {kind === 'aluno' ? (
        <>
          <label>
            Turma
            <select value={turma} onChange={(e) => setTurma(e.target.value)} required>
              <option value="">Escolha a turma</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mentor (opcional)
            <select value={mentor} onChange={(e) => setMentor(e.target.value)}>
              <option value="">Usar o mentor da turma</option>
              {mentors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      <div className="ui-form-actions">
        <button
          className="ui-btn"
          type="submit"
          disabled={busy || (kind === 'aluno' && !classes.length)}
        >
          {busy ? 'Gerando…' : LABELS[kind].cta}
        </button>
      </div>
      {kind === 'aluno' && !classes.length ? (
        <Alert kind="info">Crie uma turma ativa antes de matricular alunos.</Alert>
      ) : null}
      {error ? <Alert kind="error">{error}</Alert> : null}
      {created ? <InviteLink created={created} /> : null}
    </form>
  );
}
