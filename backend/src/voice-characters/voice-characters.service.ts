import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { firstValueFrom } from 'rxjs';
import {
  CreateVoiceCharacterDto,
  UpdateVoiceCharacterDto,
  CreateEmotionPresetDto,
  UpdateEmotionPresetDto,
  CreateStylePresetDto,
  UpdateStylePresetDto,
  CreateLanguageSettingDto,
  UpdateLanguageSettingDto,
  SynthesizeDto,
} from './dto';

@Injectable()
export class VoiceCharactersService {
  private readonly logger = new Logger(VoiceCharactersService.name);
  private readonly ttsServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.ttsServiceUrl = this.configService.get('TTS_SERVICE_URL');
  }

  // ==================== Character CRUD ====================

  async findAllCharacters(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    return this.prisma.voiceCharacter.findMany({
      where,
      // Relations (languageSettings, emotionPresets, stylePresets) not yet in DB schema
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findCharacterById(id: string) {
    const character = await this.prisma.voiceCharacter.findUnique({
      where: { id },
      // Relations not yet in DB schema
    });
    if (!character) {
      throw new NotFoundException(`Character with ID ${id} not found`);
    }
    return character;
  }

  async findCharacterByName(name: string) {
    const character = await this.prisma.voiceCharacter.findUnique({
      where: { name },
      // Relations (languageSettings, emotionPresets, stylePresets) not yet in DB schema
    });
    if (!character) {
      throw new NotFoundException(`Character "${name}" not found`);
    }
    return character;
  }

  async getDefaultCharacter() {
    let character = await this.prisma.voiceCharacter.findFirst({
      where: { isDefault: true, isActive: true },
      // Relations (languageSettings, emotionPresets, stylePresets) not yet in DB schema
    });

    if (!character) {
      // Fallback to first active character
      character = await this.prisma.voiceCharacter.findFirst({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    }

    return character;
  }

  async createCharacter(dto: CreateVoiceCharacterDto, createdBy?: string) {
    // Check if name already exists
    const existing = await this.prisma.voiceCharacter.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Character with name "${dto.name}" already exists`);
    }

    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await this.prisma.voiceCharacter.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.voiceCharacter.create({
      data: {
        ...dto,
        createdBy,
      },
      // Relations not yet in DB schema
    });
  }

  async updateCharacter(id: string, dto: UpdateVoiceCharacterDto) {
    await this.findCharacterById(id);

    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await this.prisma.voiceCharacter.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.voiceCharacter.update({
      where: { id },
      data: dto,
      // Relations not yet in DB schema
    });
  }

  async deleteCharacter(id: string) {
    await this.findCharacterById(id);
    return this.prisma.voiceCharacter.delete({ where: { id } });
  }

  // ==================== Language Settings (stub - DB tables not yet created) ====================

  async addLanguageSetting(characterId: string, dto: CreateLanguageSettingDto) {
    return { id: 'stub', characterId, ...dto, message: 'Language settings table not yet created' };
  }

  async updateLanguageSetting(id: string, dto: UpdateLanguageSettingDto) {
    return { id, ...dto, message: 'Language settings table not yet created' };
  }

  async deleteLanguageSetting(id: string) {
    return { id, deleted: true, message: 'Language settings table not yet created' };
  }

  // ==================== Emotion Presets (stub - DB tables not yet created) ====================

  async addEmotionPreset(characterId: string, dto: CreateEmotionPresetDto) {
    return { id: 'stub', characterId, ...dto, message: 'Emotion presets table not yet created' };
  }

  async updateEmotionPreset(id: string, dto: UpdateEmotionPresetDto) {
    return { id, ...dto, message: 'Emotion presets table not yet created' };
  }

  async deleteEmotionPreset(id: string) {
    return { id, deleted: true, message: 'Emotion presets table not yet created' };
  }

  // ==================== Style Presets (stub - DB tables not yet created) ====================

  async addStylePreset(characterId: string, dto: CreateStylePresetDto) {
    return { id: 'stub', characterId, ...dto, message: 'Style presets table not yet created' };
  }

  async updateStylePreset(id: string, dto: UpdateStylePresetDto) {
    return { id, ...dto, message: 'Style presets table not yet created' };
  }

  async deleteStylePreset(id: string) {
    return { id, deleted: true, message: 'Style presets table not yet created' };
  }

  // ==================== TTS Synthesis ====================

  async synthesize(dto: SynthesizeDto): Promise<Buffer> {
    const startTime = Date.now();

    // Get character (by name or default)
    const character = dto.character
      ? await this.findCharacterByName(dto.character)
      : await this.getDefaultCharacter();

    if (!character) {
      throw new NotFoundException('No voice character available');
    }

    // Cast to any for optional relation properties (tables not yet created)
    const charAny = character as any;

    // Determine TTS parameters — Decimal → number conversion
    let exaggeration = Number(character.defaultExaggeration);
    let cfgWeight = Number(character.defaultCfgWeight);
    let speed = Number(character.defaultSpeed);

    // Apply language-specific settings if available (relation table pending)
    const language = dto.language || character.defaultLanguage;
    const langSetting = charAny.languageSettings?.find((l: any) => l.languageCode === language);
    if (langSetting) {
      exaggeration = Number(langSetting.exaggeration);
      cfgWeight = Number(langSetting.cfgWeight);
      speed = Number(langSetting.speed);
    }

    // Apply emotion preset if specified (relation table pending)
    if (dto.emotion) {
      const emotionPreset = charAny.emotionPresets?.find((e: any) => e.name === dto.emotion);
      if (emotionPreset) {
        exaggeration = Number(emotionPreset.exaggeration);
        cfgWeight = Number(emotionPreset.cfgWeight);
        speed = speed * Number(emotionPreset.speedMultiplier);
      }
    }

    // Apply style preset if specified (relation table pending)
    if (dto.style) {
      const stylePreset = charAny.stylePresets?.find((s: any) => s.name === dto.style);
      if (stylePreset) {
        exaggeration = Number(stylePreset.exaggeration);
        cfgWeight = Number(stylePreset.cfgWeight);
        speed = Number(stylePreset.speed);
      }
    }

    // Override with explicit parameters
    if (dto.exaggeration !== undefined) exaggeration = dto.exaggeration;
    if (dto.cfgWeight !== undefined) cfgWeight = dto.cfgWeight;
    if (dto.speed !== undefined) speed = dto.speed;

    this.logger.log(`Synthesizing with character=${character.name}, lang=${language}, exag=${exaggeration}, cfg=${cfgWeight}`);

    try {
      // Call Mercury TTS service
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.ttsServiceUrl}/synthesize`,
          {
            text: dto.text,
            language,
            exaggeration,
            cfg_weight: cfgWeight,
            speed,
          },
          { responseType: 'arraybuffer', timeout: 60000 },
        ),
      );

      const processingTime = Date.now() - startTime;
      const audioBuffer = Buffer.from(response.data);

      // Usage logging (voiceUsageLog table not yet created)
      this.logger.debug(`TTS OK: char=${character.name}, lang=${language}, ${processingTime}ms, ${audioBuffer.length}b`);

      return audioBuffer;
    } catch (error: any) {
      // Failure logging (voiceUsageLog table not yet created)
      this.logger.warn(`TTS FAIL: char=${character.name}, lang=${language}, ${Date.now() - startTime}ms`);

      this.logger.error(`TTS synthesis failed: ${error.message}`);
      throw error;
    }
  }


  // ==================== Persona Generation ====================
  
  /**
   * Generate system prompt for a character persona
   * Used by AgentOrchestrator to inject personality into chatbot
   */
  async generateSystemPromptForCharacter(characterName: string): Promise<string> {
    try {
      const character = await this.findCharacterByName(characterName);
      
      if (!character || !character.isActive) {
        this.logger.warn(`Character "${characterName}" not found or inactive`);
        return ''; // Return empty string to use default system prompt
      }
      
      const personality = character.personality as any;
      const background = personality?.background || '';
      const style = personality?.style || '';
      const traits = character.traits || [];
      
      // Build persona prompt
      const personaPrompt = `You are ${character.displayName} - ${character.description}

CHARACTER BACKGROUND:
${background}

COMMUNICATION STYLE:
${style}

PERSONALITY TRAITS:
${traits.map(t => `- ${t}`).join('\n')}

IMPORTANT GUIDELINES:
- Embody this character's personality in all your responses
- Use the communication style that matches this character
- Stay in character while being helpful and accurate
- Balance personality with professionalism
`;
      
      return personaPrompt;
    } catch (error) {
      this.logger.error(`Failed to generate persona: ${error.message}`);
      return '';
    }
  }



  // ==================== Analytics ====================

  async getUsageStats(characterId?: string, days = 7) {
    // voiceUsageLog table not yet created - return empty stats
    return {
      period: { days, since: new Date(Date.now() - days * 86400000) },
      total: 0,
      successful: 0,
      successRate: 0,
      avgProcessingTimeMs: 0,
      byCharacter: [],
      byLanguage: [],
      message: 'Usage logging table not yet created',
    };
  }

  // ==================== Seed Default Characters ====================

  async seedDefaultCharacters() {
    const chotu = await this.prisma.voiceCharacter.upsert({
      where: { name: 'chotu' },
      update: {},
      create: {
        name: 'chotu',
        displayName: 'Chotu - The Helpful Assistant',
        description: 'A sweet, innocent village boy working in the city. Always eager to help with a warm, pleasing nature.',
        personality: {
          background: 'Young village boy who moved to the city to work. Innocent and helpful.',
          style: 'Warm, friendly, slightly shy but eager to please',
          traits: ['helpful', 'innocent', 'polite', 'warm', 'eager'],
        },
        traits: ['helpful', 'innocent', 'polite', 'warm', 'shy', 'eager'],
        defaultLanguage: 'hi',
        defaultExaggeration: 0.35,
        defaultCfgWeight: 0.35,
        defaultSpeed: 1.0,
        defaultPitch: 1.0,
        ttsEngine: 'chatterbox',
        isActive: true,
        isDefault: true,
        sortOrder: 1,
      },
    });

    // Emotion presets, style presets, and language settings tables not yet created
    // Skipping seed for those - character base record is sufficient

    this.logger.log('Seeded default voice characters (base record only - relation tables pending)');
    return { chotu };
  }
}
