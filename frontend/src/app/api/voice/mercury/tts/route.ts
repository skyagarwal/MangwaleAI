import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3200';

/**
 * POST /api/voice/mercury/tts
 * Proxies to NestJS backend which calls Mercury TTS service
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.text) {
      return NextResponse.json({
        success: false,
        error: 'Text is required',
      }, { status: 400 });
    }

    const response = await fetch(`${BACKEND_URL}/api/voice/mercury/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();

    // Add audioUrl if not present (for frontend compatibility)
    if (data.success && data.audio && !data.audioUrl) {
      data.audioUrl = `data:audio/wav;base64,${data.audio}`;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('TTS proxy error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to synthesize speech',
    }, { status: 500 });
  }
}
