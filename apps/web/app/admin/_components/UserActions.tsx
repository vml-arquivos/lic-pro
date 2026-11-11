'use client';

import Link from 'next/link';
import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
import { ActiveToggle } from './ActiveToggle';

export type ResetLink = {
  link: string;
  expira_em: string;
  email_enviado: boolean;
  nome: string;
  email: string;
};

/** Gera um link para a pessoa definir uma nova senha. O link só aparece quando é gerado. */
export function ResetLinkButton({
  userId,
  ativo = true,
  onGenerated,
  onError,
  label = 'Link de senha',
}: Readonly<{
  userId: string;
  ativo?: boolean;
  onGenerated: (link: ResetLink) => void;
  onError: (message: string) => void;
  label?: string;
}>) {
  const [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    onError('');
    try {
      onGenerated(
        await send<ResetLink>('POST', `/platform/users/${userId}/password-reset-link`, {}),
      );
    } catch (cause) {
      onError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      className="ui-btn ui-btn-small ui-btn-ghost"
      disabled={busy || !ativo}
      title={ativo ? 'Gera um link para definir uma nova senha' : 'Conta desativada'}
      onClick={() => void generate()}
    >
      {busy ? 'Gerando…' : label}
    </button>
  );
}

export function ResetLinkBox({
  link,
  onClose,
}: Readonly<{ link: ResetLink; onClose: () => void }>) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="ui-link-box" role="status">
      <strong>
        Link de nova senha para {link.nome} ({link.email}). Ele só aparece agora:
      </strong>
      <code>{link.link}</code>
      <div className="ui-table-actions">
        <button type="button" className="ui-btn ui-btn-small" onClick={() => void copy()}>
          {copied ? 'Link copiado' : 'Copiar link'}
        </button>
        <button type="button" className="ui-btn ui-btn-small ui-btn-ghost" onClick={onClose}>
          Fechar
        </button>
        <small>
          {link.email_enviado
            ? 'Também enviamos por e-mail. '
            : 'O envio por e-mail não está ligado: mande o link pela forma que preferir. '}
          Vale por 48 horas e só pode ser usado uma vez.
        </small>
      </div>
    </div>
  );
}

/** Ações de cada linha das listas de usuários: ficha, edição, link de senha e situação. */
export function UserRowActions({
  userId,
  ativo,
  onGenerated,
  onChanged,
  onError,
}: Readonly<{
  userId: string;
  ativo: boolean;
  onGenerated: (link: ResetLink) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}>) {
  return (
    <span className="ui-table-actions">
      <Link className="ui-btn ui-btn-small" href={`/admin/usuarios/${userId}`}>
        Ver ficha
      </Link>
      <Link
        className="ui-btn ui-btn-small ui-btn-ghost"
        href={`/admin/usuarios/${userId}?editar=1`}
      >
        Editar
      </Link>
      <ResetLinkButton userId={userId} ativo={ativo} onGenerated={onGenerated} onError={onError} />
      <ActiveToggle
        userId={userId}
        ativo={ativo}
        onDone={() => {
          onError('');
          onChanged();
        }}
        onError={onError}
      />
    </span>
  );
}

/** "Último acesso" em texto curto para as tabelas. */
export function lastAccessText(value: string | null | undefined): string {
  if (!value) return 'Nunca entrou';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Nunca entrou';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
