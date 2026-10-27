'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert } from '../components/ui';

type Preview = {
  tipo: 'aluno' | 'mentor' | 'empresa';
  nome: string;
  email: string;
  empresa_nome: string | null;
};

const WHO = {
  aluno: 'aluno do curso',
  mentor: 'mentor',
  empresa: 'conta da empresa',
} as const;

function readToken(): string {
  return new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
}

export function InviteAccept() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'loading' | 'invalid' | 'ready' | 'done'>('loading');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const current = readToken();
    setToken(current);
    if (current.length < 20) {
      setStatus('invalid');
      return;
    }
    void fetch('/api/auth/invitations/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: current }),
    })
      .then(async (response) => {
        if (!response.ok) {
          setStatus('invalid');
          return;
        }
        setPreview((await response.json()) as Preview);
        setStatus('ready');
      })
      .catch(() => setStatus('invalid'));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('As senhas não são iguais.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          termos_aceitos: terms,
          privacidade_aceita: privacy,
        }),
      });
      if (response.ok) {
        setStatus('done');
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(
        payload.error === 'weak_password'
          ? 'Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.'
          : payload.error === 'invalid_or_expired_invitation'
            ? 'Este convite não vale mais. Peça um novo link à equipe.'
            : response.status === 429
              ? 'Muitas tentativas. Aguarde um pouco e tente de novo.'
              : 'Não foi possível criar a conta agora. Tente novamente.',
      );
    } catch {
      setError('Não foi possível criar a conta agora. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') return <p className="ui-loading">Conferindo seu convite…</p>;

  if (status === 'invalid') {
    return (
      <>
        <p className="eyebrow">Convite</p>
        <h1>Este convite não é válido.</h1>
        <p>
          O link pode ter expirado, já ter sido usado ou ter sido cancelado. Peça um novo link à
          equipe do Licite Comigo.
        </p>
        <Link className="ui-btn" href="/login">
          Ir para o login
        </Link>
      </>
    );
  }

  if (status === 'done') {
    return (
      <>
        <p className="eyebrow">Tudo certo</p>
        <h1>Conta criada.</h1>
        <p>Agora é só entrar com o seu e-mail e a senha que você acabou de criar.</p>
        <Link className="ui-btn" href="/login">
          Entrar
        </Link>
      </>
    );
  }

  return (
    <>
      <p className="eyebrow">Convite</p>
      <h1>Olá, {preview?.nome}. Crie sua senha.</h1>
      <p>
        Você foi convidado como {preview ? WHO[preview.tipo] : ''}
        {preview?.tipo === 'empresa' && preview.empresa_nome ? ` (${preview.empresa_nome})` : ''}. O
        e-mail de acesso será <strong>{preview?.email}</strong>.
      </p>
      <form className="invite-card" onSubmit={(event) => void submit(event)}>
        <div className="ui-form">
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <label>
            Repita a senha
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <small>Mínimo de 12 caracteres, com maiúscula, minúscula, número e símbolo.</small>
          <label className="invite-check">
            <input
              type="checkbox"
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              required
            />
            <span>
              Li e aceito os <a href="/termos">Termos de Uso</a>.
            </span>
          </label>
          <label className="invite-check">
            <input
              type="checkbox"
              checked={privacy}
              onChange={(event) => setPrivacy(event.target.checked)}
              required
            />
            <span>
              Li e aceito a <a href="/privacidade">Política de Privacidade</a>.
            </span>
          </label>
          <div className="ui-form-actions">
            <button className="ui-btn" type="submit" disabled={busy || !terms || !privacy}>
              {busy ? 'Criando conta…' : 'Criar minha conta'}
            </button>
          </div>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </>
  );
}
