export function GET(): Response {
  const ready = Boolean(process.env.SITE_URL && process.env.CORE_API_INTERNAL_URL);
  return Response.json({ service: 'site', ready }, { status: ready ? 200 : 503 });
}
