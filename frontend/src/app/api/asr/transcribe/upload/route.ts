import { NextRequest, NextResponse } from 'next/server';

// Backend URL - internal Docker network or localhost
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://host.docker.internal:3000';

export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = formData.get('language') as string || 'hi';

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: 'No audio file provided' },
        { status: 400 }
      );
    }

    console.log(`ASR upload: ${audioFile.name}, size: ${audioFile.size}, lang: ${language}`);

    // Convert File to Buffer for forwarding
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create a new FormData for the backend request
    const backendFormData = new FormData();
    backendFormData.append('audio', new Blob([buffer], { type: audioFile.type }), audioFile.name || 'recording.webm');
    backendFormData.append('language', language);

    // Forward to backend ASR service
    const response = await fetch(`${BACKEND_URL}/api/asr/transcribe/upload`, {
      method: 'POST',
      body: backendFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ASR Backend error:', response.status, errorText);
      return NextResponse.json(
        { success: false, error: 'Transcription service unavailable' },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('ASR result:', result);

    return NextResponse.json({
      success: true,
      text: result.text || '',
      language: result.language || 'en',
      confidence: result.confidence || 0,
      provider: result.provider || 'unknown',
      processingTimeMs: result.processingTimeMs,
    });
  } catch (error) {
    console.error('ASR API route error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process audio' },
      { status: 500 }
    );
  }
}
