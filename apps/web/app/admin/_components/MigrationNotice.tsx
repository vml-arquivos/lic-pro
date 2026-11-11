'use client';

import { useEffect, useState } from 'react';
import { Alert } from '../../components/ui';

type Estado = { pendente: boolean; motivo: string; esperada: string; aplicada: string | null };

/**
 * Avisa a equipe quando o banco está atrás do código (migrations por aplicar). Sem esse aviso,
 * telas que dependem de tabelas novas só mostram "não foi possível concluir agora".
 */
export function MigrationNotice() {
  const [estado, setEstado] = useState<Estado | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/core/platform/migracoes')
      .then((response) => (response.ok ? (response.json() as Promise<Estado>) : null))
      .then((data) => active && setEstado(data))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  if (!estado?.pendente) return null;
  return (
    <Alert kind="error">
      O banco de dados está desatualizado (última migration aplicada:{' '}
      {estado.aplicada ?? 'não foi possível ler'}; esperada: {estado.esperada}). Rode o recurso
      "migrations" no Coolify e reinicie o core-api. Enquanto isso, algumas telas podem mostrar "Não
      foi possível concluir agora".
    </Alert>
  );
}
