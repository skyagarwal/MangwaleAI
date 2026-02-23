import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TranscriptionResult, SynthesisResult } from '../interfaces/nlu.interfaces';

/**
 * Mercury Client Service
 * Connects to Mercury voice infrastructure (ASR + TTS)
 * ASR: http://192.168.0.151:8000
 * TTS: http://192.168.0.151:5500
 */
@Injectable()
export class MercuryClientService {
  private readonly logger = new Logger(MercuryClientService.name);
  private readonly mercuryAsrEndpoint: string;
  private readonly mercuryTtsEndpoint: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.mercuryAsrEndpoint = this.config.get<string>('MERCURY_ASR_ENDPOINT', 'http://192.168.0.151:8000');
    this.mercuryTtsEndpoint = this.config.get<string>('MERCURY_TTS_ENDPOINT', 'http://192.168.0.151:5500');
    this.logger.log(`Mercury Client initialized - ASR: ${this.mercuryAsrEndpoint}, TTS: ${this.mercuryTtsEndpoint}`);
  }

  /**
   * Transcribe audio to text using Whisper ASR
   */
  async transcribe(audio: string, format: string = 'wav', language?: string): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.mercuryAsrEndpoint}/transcribe`, {
          audio: audio,
          format: format,
          language: language,
        }, {
          timeout: 10000, // 10 seconds for ASR
        }),
      );

      const latency = Date.now() - startTime;
      this.logger.debug(`ASR transcription: ${latency}ms`);

      return {
        text: response.data.text,
        language: response.data.language || language || 'en',
        confidence: response.data.confidence || 0.9,
        latency: latency,
      };
    } catch (error: any) {
      this.logger.error(`ASR transcription failed: ${error.message}`);
      throw new Error(`Voice transcription failed: ${error.message}`);
    }
  }

  /**
   * Synthesize text to speech using OpenTTS
   */
  async synthesize(text: string, language: string = 'en', voice?: string): Promise<SynthesisResult> {
    const startTime = Date.now();
    const selectedVoice = voice || this.selectVoice(language);

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.mercuryTtsEndpoint}/api/tts`, {
          text: text,
          voice: selectedVoice,
          format: 'wav',
        }, {
          timeout: 15000, // 15 seconds for TTS
        }),
      );

      const latency = Date.now() - startTime;
      this.logger.debug(`TTS synthesis: ${latency}ms`);

      return {
        audio: response.data.audio_base64 || response.data.audio,
        format: 'wav',
        duration_ms: response.data.duration_ms || 0,
        latency: latency,
      };
    } catch (error: any) {
      this.logger.error(`TTS synthesis failed: ${error.message}`);
      throw new Error(`Voice synthesis failed: ${error.message}`);
    }
  }

  /**
   * Select appropriate voice based on language
   * OpenTTS has 251 voices available
   */
  private selectVoice(language: string): string {
    const voiceMap: Record<string, string> = {
      'hi': 'hi-IN-Wavenet-D',      // Hindi female
      'en': 'en-US-Wavenet-F',      // English female
      'mr': 'mr-IN-Wavenet-A',      // Marathi female
      'ta': 'ta-IN-Wavenet-A',      // Tamil
      'te': 'te-IN-Wavenet-A',      // Telugu
      'bn': 'bn-IN-Wavenet-A',      // Bengali
    };

    return voiceMap[language] || voiceMap['en'];
  }

  /**
   * Health check for Mercury services
   */
  async healthCheck(): Promise<{ asr: boolean; tts: boolean }> {
    const checks = await Promise.allSettled([
      firstValueFrom(this.httpService.get(`${this.mercuryAsrEndpoint}/health`, { timeout: 3000 })),
      firstValueFrom(this.httpService.get(`${this.mercuryTtsEndpoint}/health`, { timeout: 3000 })),
    ]);

    return {
      asr: checks[0].status === 'fulfilled',
      tts: checks[1].status === 'fulfilled',
    };
  }
}
