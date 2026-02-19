import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  @Put()
  async updateSettings(@Body() body: { settings: Array<{ key: string; value: string }> }) {
    return this.settingsService.updateSettings(body.settings);
  }

  /**
   * GET /settings/agent — Agent personality/tone settings
   */
  @Get('agent')
  async getAgentSettings() {
    const raw = await this.settingsService.getSetting('agent-settings', '');
    if (raw) {
      try { return JSON.parse(raw); } catch {}
    }
    // Return defaults
    return {
      tone: {
        personality: 'friendly',
        enthusiasm: 70,
        empathy: 80,
        humor: 40,
        formality: 50,
        verbosity: 'balanced',
        emoji: true,
        greetingStyle: 'warm',
      },
      language: {
        defaultLanguage: 'hi',
        supportedLanguages: ['en', 'hi', 'mr'],
        autoDetect: true,
        translationEnabled: true,
        regionalVariants: true,
      },
      response: {
        maxLength: 500,
        includeEmoji: true,
        useMarkdown: false,
        suggestFollowUps: true,
        acknowledgeFirst: true,
        useUserName: true,
      },
      voice: {
        ttsVoice: 'chotu',
        speechRate: 1.0,
        pitch: 1.0,
        emphasis: 'medium',
      },
    };
  }

  /**
   * POST /settings/agent — Save agent personality/tone settings
   */
  @Post('agent')
  async updateAgentSettings(@Body() body: Record<string, unknown>) {
    await this.settingsService.updateSettings([
      { key: 'agent-settings', value: JSON.stringify(body) },
    ]);
    return { success: true, message: 'Agent settings saved' };
  }

  @Get('labelstudio/test')
  async testLabelStudio() {
    return this.settingsService.testLabelStudio();
  }

  @Get('asr/test')
  async testAsr() {
    return this.settingsService.testAsr();
  }

  @Get('tts/test')
  async testTts() {
    return this.settingsService.testTts();
  }

  @Get('nlu/test')
  async testNlu() {
    return this.settingsService.testNlu();
  }

  @Get('llm/test')
  async testLlm() {
    return this.settingsService.testLlm();
  }

  @Get('minio/test')
  async testMinio() {
    return this.settingsService.testMinio();
  }

  @Get('key/:key')
  async getSetting(@Param('key') key: string) {
    const value = await this.settingsService.getSetting(key);
    return { key, value };
  }

  @Put('key/:key')
  async updateSetting(@Param('key') key: string, @Body() body: { value: string }) {
    await this.settingsService.updateSettings([{ key, value: body.value }]);
    return { key, value: body.value, success: true };
  }
}
