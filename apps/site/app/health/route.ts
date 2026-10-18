export function GET(): Response {
  return Response.json({ service: 'site', status: 'ok' });
}
