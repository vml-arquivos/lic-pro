export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Diagnóstico público e sem segredos: mostra se o app web enxerga o core-api.
 * Abra https://<app>/api/diagnostico no navegador quando o login falhar.
 * Não retorna URLs, variáveis nem dados de conta.
 */
export async function GET(): Promise<Response> {
  const baseUrl = process.env.CORE_API_INTERNAL_URL?.replace(/\/$/, '');
  const result: {
    web: 'ok';
    coreApiConfigurado: boolean;
    coreApiRespondeu: boolean | null;
    coreApiStatus: number | null;
    bancoPronto: boolean | null;
  } = {
    web: 'ok',
    coreApiConfigurado: Boolean(baseUrl),
    coreApiRespondeu: null,
    coreApiStatus: null,
    bancoPronto: null,
  };
  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/ready`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      });
      result.coreApiRespondeu = true;
      result.coreApiStatus = response.status;
      const body = (await response.json().catch(() => null)) as { ready?: boolean } | null;
      result.bancoPronto = typeof body?.ready === 'boolean' ? body.ready : null;
    } catch {
      result.coreApiRespondeu = false;
    }
  }
  return Response.json(result, { headers: { 'cache-control': 'no-store' } });
}
