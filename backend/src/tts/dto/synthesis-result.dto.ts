export class SynthesisResultDto {
  audioUrl: string; // URL to generated audio file
  audioData?: Buffer; // Raw audio data (optional)
  format: string; // 'wav', 'mp3', 'ogg'
  duration: number; // seconds
  provider: 'xtts' | 'google' | 'azure' | 'fallback';
  processingTimeMs: number;
  voice: string;
  language: string;
}
