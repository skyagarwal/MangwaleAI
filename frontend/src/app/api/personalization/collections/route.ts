import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3200';

export async function GET(request: NextRequest) {
  try {
    const params = new URLSearchParams();
    request.nextUrl.searchParams.forEach((value, key) => {
      params.append(key, value);
    });

    const response = await fetch(`${BACKEND_URL}/api/personalization/collections?${params}`, {
      headers: { 'Content-Type': 'application/json' },
      // Short timeout — collections are non-critical; don't block the UI
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return NextResponse.json({ collections: [] });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    // Collections are best-effort; return empty gracefully
    return NextResponse.json({ collections: [] });
  }
}
