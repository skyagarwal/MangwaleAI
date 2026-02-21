import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3200';

export async function GET(
  _request: NextRequest,
  { params }: { params: { orderId: string } },
) {
  const { orderId } = params;
  try {
    const response = await fetch(`${BACKEND_URL}/api/chat/track/${orderId}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ success: false, error: 'Could not fetch order status' });
  }
}
