import { proxyCore } from '../../_lib/core-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function upstreamPath(path: string[], request: Request): string {
  const query = new URL(request.url).search;
  return `/${path.join('/')}${query}`;
}

export async function GET(
  request: Request,
  context: { params: { path: string[] } },
): Promise<Response> {
  return proxyCore(request, upstreamPath(context.params.path, request));
}

export async function POST(
  request: Request,
  context: { params: { path: string[] } },
): Promise<Response> {
  return proxyCore(request, upstreamPath(context.params.path, request));
}

export async function PATCH(
  request: Request,
  context: { params: { path: string[] } },
): Promise<Response> {
  return proxyCore(request, upstreamPath(context.params.path, request));
}

export async function PUT(
  request: Request,
  context: { params: { path: string[] } },
): Promise<Response> {
  return proxyCore(request, upstreamPath(context.params.path, request));
}

export async function DELETE(
  request: Request,
  context: { params: { path: string[] } },
): Promise<Response> {
  return proxyCore(request, upstreamPath(context.params.path, request));
}
