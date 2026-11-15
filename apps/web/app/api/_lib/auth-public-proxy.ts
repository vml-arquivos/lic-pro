import { panelUrl } from '@licitecomigo/shared';
import { configuredPanels, currentPanel } from '../../../lib/panel';

export async function proxyPublicAuth(request: Request, path: string): Promise<Response> {
  const baseUrl = process.env.CORE_API_INTERNAL_URL?.replace(/\/$/, '');
  if (!baseUrl) return Response.json({ error: 'core_api_not_configured' }, { status: 503 });
  // Informa de qual painel veio o pedido, para o link do e-mail voltar ao mesmo painel.
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const panel = currentPanel();
  const origin = panel ? panelUrl(configuredPanels(), panel) : null;
  if (origin) headers['x-panel-url'] = origin;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: await request.text(),
      cache: 'no-store',
    });
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return Response.json({ error: 'core_api_unavailable' }, { status: 503 });
  }
}
