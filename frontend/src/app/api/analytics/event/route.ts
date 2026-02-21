import { NextRequest, NextResponse } from 'next/server';

const SEARCH_API_URL = process.env.SEARCH_API_URL || 'http://localhost:3100';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await fetch(`${SEARCH_API_URL}/v2/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Fire-and-forget: analytics failures must never surface to the user
  }
  return new NextResponse(null, { status: 204 });
}
