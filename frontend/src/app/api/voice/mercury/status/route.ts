import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3200';

/**
 * GET /api/voice/mercury/status
 * Proxies to NestJS backend which has full Mercury status + GPU info
 */
export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/voice/mercury/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Mercury status proxy failed:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch Mercury status from backend',
      mercury: {
        asr: { status: 'offline', latency: 0 },
        tts: { status: 'offline', latency: 0 },
        orchestrator: { status: 'offline', latency: 0 },
        nerve: { status: 'offline', latency: 0, activeCalls: 0, ttsCacheSize: 0 },
      },
      gpus: [],
    }, { status: 200 });
  }
}
