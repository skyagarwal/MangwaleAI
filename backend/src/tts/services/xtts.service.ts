import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SynthesizeSpeechDto } from '../dto/synthesize-speech.dto';
import { SynthesisResultDto } from '../dto/synthesis-result.dto';

@Injectable()
export class XttsService {
  private readonly logger = new Logger(XttsService.name);
  private readonly xttsUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.xttsUrl = this.config.get('TTS_SERVICE_URL', 'http://localhost:8010');
  }

  async synthesize(dto: SynthesizeSpeechDto): Promise<SynthesisResultDto> {
    const startTime = Date.now();

    // Map language codes to reference audio files
    const langToRef: Record<string, string> = {
      'en': '/app/models/ref_en.wav',
      'en-US': '/app/models/ref_en.wav',
      'en-IN': '/app/models/ref_en.wav',
      'hi': '/app/models/ref_hi.wav',
      'hi-IN': '/app/models/ref_hi.wav',
    };
    
    // Get the language (first 2 chars for base language)
    const lang = (dto.language || 'en').split('-')[0];
    const speakerWav = langToRef[dto.language] || langToRef[lang] || langToRef['en'];

    try {
      // Call XTTS service - use /api/tts endpoint
      const response = await firstValueFrom(
        this.httpService.post(`${this.xttsUrl}/api/tts`, {
          text: dto.text,
          lang: lang,
          speaker_wav: speakerWav,
        }, {
          responseType: 'arraybuffer',
          timeout: 30000, // 30s timeout for TTS generation
        }),
      );

      // Response is raw audio data (arraybuffer)
      const audioBuffer = Buffer.from(response.data);

      return {
        audioUrl: undefined,
        audioData: audioBuffer,
        format: 'mp3',
        duration: 0, // Duration not provided by service
        provider: 'xtts',
        processingTimeMs: Date.now() - startTime,
        voice: dto.voice || 'default',
        language: dto.language || 'en',
      };
    } catch (error) {
      this.logger.error(`XTTS synthesis failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getVoices(language?: string): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.xttsUrl}/api/voices`, {
          params: { language },
        }),
      );

      return response.data || [];
    } catch (error) {
      this.logger.warn(`Failed to get XTTS voices: ${error.message}`);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.xttsUrl}/health`),
      );
      return response.status === 200 && response.data?.ok;
    } catch (error) {
      return false;
    }
  }
}
