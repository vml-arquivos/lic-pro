import { proxyPublicAuth } from '../../_lib/auth-public-proxy';
export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return proxyPublicAuth(request, '/auth/password-reset');
}
