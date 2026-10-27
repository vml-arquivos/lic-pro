/** Chamadas ao core-api pelo proxy do site. Só para componentes de cliente. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  forbidden: 'Sua conta não tem permissão para esta ação.',
  email_already_registered: 'Este e-mail já tem conta.',
  email_in_use: 'Este e-mail já tem conta.',
  class_not_found: 'Turma não encontrada ou encerrada.',
  mentor_not_found: 'Mentor não encontrado.',
  invitation_not_found: 'Convite não encontrado ou já usado.',
  cannot_change_self: 'Você não pode desativar a própria conta.',
  invalid_token: 'Link inválido ou expirado. Use o link do e-mail mais recente.',
  coleta_em_andamento: 'Já existe uma coleta em andamento. Aguarde ela terminar.',
  core_api_unavailable: 'O serviço não respondeu. Tente novamente em instantes.',
  database_unavailable: 'O banco de dados não respondeu. Tente novamente em instantes.',
};

export function friendlyMessage(status: number, code: string, fallback?: string): string {
  if (MESSAGES[code]) return MESSAGES[code];
  if (fallback && status < 500) return fallback;
  if (status === 401) return 'Sua sessão expirou. Entre novamente.';
  if (status === 403) return MESSAGES.forbidden!;
  if (status === 429) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  return 'Não foi possível concluir agora. Tente novamente.';
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/core${path}`, {
    cache: 'no-store',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    const code = payload.error ?? 'request_failed';
    throw new ApiError(
      response.status,
      code,
      friendlyMessage(response.status, code, payload.message),
    );
  }
  return payload as T;
}

export function send<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  return api<T>(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir agora.';
}
