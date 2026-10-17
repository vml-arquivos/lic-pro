import { proxyAi } from '../../_lib/ai-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return proxyAi(request, '/reader/analyze');
}
