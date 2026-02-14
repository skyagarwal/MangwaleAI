import { NextRequest, NextResponse } from 'next/server';

const MERCURY_TTS_URL = process.env.MERCURY_TTS_URL || 'http://localhost:7002';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      text, 
      voice = 'chotu', 
      language = 'hi',
      emotion = 'helpful',
      style = 'conversational',
      speed = 1.0,
      exaggeration = 0.3, // Lower default for faster generation
      cfg_weight = 0.4,   // Lower default for faster generation
      pitch = 1.0,
      provider = 'chatterbox' // kokoro or chatterbox
    } = body;

    if (!text) {
      return NextResponse.json({ 
        success: false, 
        error: 'Text is required' 
      }, { status: 400 });
    }

    const startTime = Date.now();

    // Call Mercury TTS service with all Chatterbox parameters
    const ttsPayload: any = {
      text,
      voice,
      language,
      emotion,
      style,
      speed,
      provider,
    };

    // Add Chatterbox-specific parameters (significantly improves speed!)
    if (provider === 'chatterbox') {
      ttsPayload.exaggeration = exaggeration;
      ttsPayload.cfg_weight = cfg_weight;
      ttsPayload.pitch = pitch;
    }

    const response = await fetch(`${MERCURY_TTS_URL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ttsPayload),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mercury TTS error:', errorText);
      return NextResponse.json({
        success: false,
        error: 'TTS synthesis failed',
        details: errorText,
      }, { status: response.status });
    }

    // Get the audio buffer
    const audioBuffer = await response.arrayBuffer();
    const latency = Date.now() - startTime;

    // Return audio as base64
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    return NextResponse.json({
      success: true,
      audio: base64Audio,
      audioUrl: `data:audio/wav;base64,${base64Audio}`,
      latency,
      provider,
      voice,
      language,
      emotion,
      style,
      speed,
      exaggeration: ttsPayload.exaggeration,
      cfg_weight: ttsPayload.cfg_weight,
      pitch: ttsPayload.pitch,
    });
  } catch (error) {
    console.error('TTS synthesis error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to synthesize speech',
    }, { status: 500 });
  }
}
