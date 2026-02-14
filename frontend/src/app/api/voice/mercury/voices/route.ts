import { NextRequest, NextResponse } from 'next/server';

const MERCURY_TTS_URL = process.env.MERCURY_TTS_URL || 'http://localhost:7002';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') || 'all';

    // Fetch voices from Mercury TTS
    const response = await fetch(`${MERCURY_TTS_URL}/voices`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch voices from Mercury');
    }

    const data = await response.json();

    // Mercury returns voices organized by provider
    // {
    //   "kokoro": ["af_sky", "af_sarah", ...],
    //   "chatterbox": {
    //     "voices": ["chotu", "meera", ...],
    //     "languages": ["hi", "en", ...],
    //     "emotions": ["neutral", "happy", ...],
    //     "styles": ["default", "casual", ...]
    //   }
    // }

    // Normalize response
    const voices = {
      kokoro: {
        voices: data.kokoro || [],
        languages: ['en'],
        description: 'High-quality English voices',
      },
      chatterbox: {
        voices: data.chatterbox?.voices || [],
        languages: data.chatterbox?.languages || [],
        emotions: data.chatterbox?.emotions || [],
        styles: data.chatterbox?.styles || [],
        description: '30+ languages, 16 emotions, 9 styles',
      }
    };

    if (provider !== 'all') {
      return NextResponse.json({
        success: true,
        provider,
        ...(voices[provider as keyof typeof voices] || {}),
      });
    }

    return NextResponse.json({
      success: true,
      voices,
    });
  } catch (error) {
    console.error('Fetch voices error:', error);
    
    // Return fallback voices if Mercury is unavailable
    return NextResponse.json({
      success: true,
      fallback: true,
      voices: {
        kokoro: {
          voices: [
            'af_sky', 'af_sarah', 'af_bella', 'af_nicole',
            'am_adam', 'am_michael', 'af_heart',
          ],
          languages: ['en'],
          description: 'High-quality English voices (offline)',
        },
        chatterbox: {
          voices: ['chotu', 'meera', 'raj', 'priya', 'amit'],
          languages: [
            'hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa',
            'or', 'as', 'ur', 'ne', 'si', 'ar', 'fr', 'de', 'es', 'pt',
            'ru', 'ja', 'ko', 'zh', 'th', 'vi', 'id', 'ms', 'tl', 'sw'
          ],
          emotions: [
            'neutral', 'happy', 'sad', 'angry', 'surprised', 'fearful',
            'disgusted', 'excited', 'calm', 'confident', 'curious',
            'hopeful', 'frustrated', 'loving', 'proud', 'anxious'
          ],
          styles: [
            'default', 'casual', 'formal', 'cheerful', 'empathetic',
            'professional', 'friendly', 'urgent', 'storytelling'
          ],
          description: '30+ languages, 16 emotions, 9 styles (offline)',
        }
      },
    });
  }
}
