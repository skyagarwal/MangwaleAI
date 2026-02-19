import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3200';

/**
 * GET /api/voice/mercury/voices
 * Proxies to NestJS backend which fetches voices from Mercury TTS
 */
export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/voice/mercury/voices`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Mercury voices proxy failed:', error);
    return NextResponse.json({
      success: false,
      kokoro: {
        voices: ['af_heart', 'af_bella', 'am_adam', 'am_michael'],
        languages: ['en'],
        description: 'Kokoro TTS (offline)',
      },
      chatterbox: {
        voices: ['chotu', 'default'],
        languages: ['hi', 'en'],
        emotions: ['helpful', 'happy', 'calm'],
        styles: ['conversational', 'formal'],
        description: 'Chatterbox TTS (offline)',
      },
    });
  }
}
