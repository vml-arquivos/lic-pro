import { NextResponse } from 'next/server';

export function GET() {
  const apiConfigured = Boolean(process.env.API_URL);
  return NextResponse.json(
    { service: 'web', ready: apiConfigured, apiConfigured },
    { status: apiConfigured ? 200 : 503 },
  );
}
