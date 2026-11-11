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
  niches_locked: 'Os nichos da sua conta são definidos pela Administração.',
  niche_preferences_required: 'Escolha os nichos da sua conta (Minha conta) para ver esta lista.',
  niche_not_allowed: 'Este nicho não está entre os da sua conta.',
  itens_nao_coletados:
    'Busque os itens do edital primeiro (botão “Buscar itens e documentos no PNCP”).',
  invitation_not_found: 'Convite não encontrado ou já usado.',
  cannot_change_self: 'Você não pode desativar a própria conta.',
  invalid_token: 'Link inválido ou expirado. Use o link do e-mail mais recente.',
  coleta_em_andamento: 'Já existe uma coleta em andamento. Aguarde ela terminar.',
  fonte_indisponivel: 'A fonte oficial não respondeu agora. Tente novamente em instantes.',
  fonte_limitada: 'A fonte oficial pediu para aguardar um pouco. Tente de novo em alguns minutos.',
  fonte_recusou: 'A fonte oficial recusou a consulta. Tente mais tarde.',
  billing_not_configured: 'A cobrança online ainda não está ligada. Fale com a equipe.',
  pagamento_indisponivel: 'O meio de pagamento não respondeu. Tente novamente em instantes.',
  limite_do_plano: 'Você chegou ao limite do seu plano. Veja as opções em Assinatura.',
  assinatura_inativa: 'Sua assinatura não está ativa. Regularize em Assinatura.',
  curso_ja_comprado: 'Este e-mail já comprou o curso. Entre com a sua conta.',
  assinatura_existente: 'Sua empresa já tem uma assinatura.',
  access_expired: 'O seu prazo de acesso terminou. Fale com a equipe do curso para renovar.',
  material_not_found: 'Material não encontrado.',
  missing_answers: 'Responda as perguntas marcadas com *.',
  encontro_not_found: 'Encontro não encontrado.',
  user_not_found: 'Usuário não encontrado.',
  user_inactive: 'Esta conta está desativada. Reative antes de gerar o link de senha.',
  user_has_no_credentials: 'Esta conta ainda não tem acesso criado. Gere um link de cadastro.',
  company_name_only_for_company: 'O nome da empresa só pode ser editado em conta de empresa.',
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
