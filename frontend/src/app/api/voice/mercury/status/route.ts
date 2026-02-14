import { NextResponse } from 'next/server';

// Mercury server endpoints
const MERCURY_ASR_URL = process.env.MERCURY_ASR_URL || 'http://localhost:7001';
const MERCURY_TTS_URL = process.env.MERCURY_TTS_URL || 'http://localhost:7002';
const MERCURY_ORCHESTRATOR_URL = process.env.MERCURY_ORCHESTRATOR_URL || 'http://localhost:7000';
const MERCURY_NERVE_URL = process.env.MERCURY_NERVE_URL || 'http://localhost:7100';

interface ServiceStatus {
  status: 'healthy' | 'unhealthy' | 'offline';
  latency: number;
  details?: Record<string, unknown>;
}

async function checkService(url: string, endpoint: string = '/health'): Promise<ServiceStatus> {
  const startTime = Date.now();
  try {
    const response = await fetch(`${url}${endpoint}`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      return {
        status: data.status === 'healthy' ? 'healthy' : 'unhealthy',
        latency,
        details: data,
      };
    }
    return { status: 'unhealthy', latency };
  } catch (error) {
    return { status: 'offline', latency: Date.now() - startTime };
  }
}

export async function GET() {
  try {
    // Check all Mercury services in parallel
    const [asr, tts, orchestrator, nerve] = await Promise.all([
      checkService(MERCURY_ASR_URL),
      checkService(MERCURY_TTS_URL),
      checkService(MERCURY_ORCHESTRATOR_URL),
      checkService(MERCURY_NERVE_URL),
    ]);

    // Get TTS voices if TTS is healthy
    let ttsVoices = null;
    if (tts.status === 'healthy') {
      try {
        const voicesRes = await fetch(`${MERCURY_TTS_URL}/voices`, {
          signal: AbortSignal.timeout(5000),
        });
        if (voicesRes.ok) {
          ttsVoices = await voicesRes.json();
        }
      } catch {
        // Voice fetch failed, continue without voices
      }
    }

    return NextResponse.json({
      success: true,
      mercury: {
        asr: {
          url: MERCURY_ASR_URL,
          ...asr,
          providers: asr.details?.providers || {},
          gpu: {
            available: asr.details?.gpu_available || false,
            name: asr.details?.gpu_name || 'N/A',
          },
        },
        tts: {
          url: MERCURY_TTS_URL,
          ...tts,
          version: tts.details?.version || 'unknown',
          providers: tts.details?.providers || {},
          voices: ttsVoices,
          gpu: {
            available: tts.details?.gpu_available || false,
            name: tts.details?.gpu_name || 'N/A',
          },
        },
        orchestrator: {
          url: MERCURY_ORCHESTRATOR_URL,
          ...orchestrator,
          components: orchestrator.details?.components || {},
        },
        nerve: {
          url: MERCURY_NERVE_URL,
          ...nerve,
          activeCalls: nerve.details?.active_calls || 0,
          ttsCacheSize: nerve.details?.tts_cache_size || 0,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Mercury status check failed:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to check Mercury services',
    }, { status: 500 });
  }
}
