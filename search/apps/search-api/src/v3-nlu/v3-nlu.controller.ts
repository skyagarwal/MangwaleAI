import { Controller, Post, Body, Get, Param, Query, Logger, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { V3NluService } from './v3-nlu.service';
import { ContinuousLearningService } from './services/continuous-learning.service';
import {
  UnderstandQueryDto,
  ConversationalSearchDto,
  VoiceSearchDto,
  FeedbackDto,
} from './dto/v3-nlu.dto';

// DTOs for new endpoints
import { IsString, IsIn, IsNotEmpty } from 'class-validator';

class RememberDto {
  @IsString()
  @IsNotEmpty()
  user_id!: string;
  
  @IsIn(['preference', 'fact', 'feedback'])
  type!: 'preference' | 'fact' | 'feedback';
  
  @IsString()
  @IsNotEmpty()
  content!: string;
}

@Controller('v3/search')
@ApiTags('V3 NLU Search (Amazon-Grade)')
export class V3NluController {
  private readonly logger = new Logger(V3NluController.name);

  constructor(
    private readonly v3NluService: V3NluService,
    private readonly learningService: ContinuousLearningService,
  ) {}

  /**
   * POST /v3/search/understand
   * Parse natural language query into structured filters (no search execution)
   */
  @Post('understand')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Understand natural language query',
    description: 'Parse user query into structured filters using IndicBERT + vLLM. Returns extracted entities without executing search.',
  })
  @ApiBody({ type: UnderstandQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Query understood successfully',
    schema: {
      example: {
        original_query: 'cheap veg biryani near me',
        understood: {
          query_text: 'biryani',
          module_id: 4,
          veg: 1,
          price_max: 200,
          use_current_location: true,
          sort_by: 'distance',
          confidence: 0.92,
        },
        nlu_path: 'fast',
        processing_time_ms: 45,
        suggestions: [
          'Did you mean: Open restaurants with veg biryani?',
          'Filter by: Under ₹150 | Under ₹250',
        ],
      },
    },
  })
  async understandQuery(@Body() dto: UnderstandQueryDto) {
    this.logger.log(`V3 Understanding: "${dto.q}"`);
    return await this.v3NluService.understandQuery(
      dto.q,
      dto.user_id,
      dto.zone_id,
      dto.location,
    );
  }

  /**
   * POST /v3/search/conversational
   * Multi-turn conversational search with context
   */
  @Post('conversational')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Conversational search',
    description: 'Multi-turn dialogue with context management. Maintains conversation state in Redis and provides natural language responses.',
  })
  @ApiBody({ type: ConversationalSearchDto })
  @ApiResponse({
    status: 200,
    description: 'Conversational search executed',
    schema: {
      example: {
        message: 'Found 2,340 veg biryanis under ₹200. Open now or all?',
        items: [
          {
            name: 'Veg Biryani',
            price: 150,
            store_name: 'Paradise Restaurant',
            veg: 1,
          },
        ],
        total: 2340,
        context: {
          current_filters: {
            q: 'biryani',
            veg: 1,
            price_max: 200,
            module_id: 4,
          },
          awaiting: 'timing',
          conversation_turn: 3,
        },
        quick_replies: ['Open now', 'All restaurants', 'Show top rated'],
      },
    },
  })
  async conversationalSearch(@Body() dto: ConversationalSearchDto) {
    this.logger.log(`V3 Conversational [${dto.session_id}]: "${dto.message}"`);
    return await this.v3NluService.conversationalSearch(
      dto.message,
      dto.session_id,
      dto.user_id,
      dto.zone_id,
      dto.limit || 20,
      dto.module_id || 4,
    );
  }

  /**
   * POST /v3/search/voice
   * Voice search: ASR → NLU → Search → TTS
   */
  @Post('voice')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Voice search (ASR → NLU → Search → TTS)',
    description: 'Complete voice search pipeline: transcribe audio, understand intent, execute search, generate voice response. Integrated with Mercury voice infrastructure.',
  })
  @ApiBody({ type: VoiceSearchDto })
  @ApiResponse({
    status: 200,
    description: 'Voice search completed',
    schema: {
      example: {
        transcription: 'मुझे सस्ता बिरयानी चाहिए',
        understood: {
          query_text: 'biryani',
          price_max: 200,
          module_id: 4,
        },
        results: [
          { name: 'Mutton Biryani', price: 150 },
          { name: 'Chicken Biryani', price: 120 },
        ],
        total: 45,
        response_text: 'मिला! 45 सस्ते बिरयानी। पहला: मटन बिरयानी 150 रुपये...',
        response_audio: 'UklGRiQAAABXQVZF...',
        latency_ms: 2100,
      },
    },
  })
  async voiceSearch(@Body() dto: VoiceSearchDto) {
    this.logger.log(`V3 Voice search from user ${dto.user_id}`);
    return await this.v3NluService.voiceSearch(dto);
  }

  /**
   * POST /v3/analytics/feedback
   * Log user feedback for continuous learning
   */
  @Post('/analytics/feedback')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit user feedback',
    description: 'Log user interactions (clicks, orders) for continuous learning. Data is used to retrain NLU models weekly.',
  })
  @ApiBody({ type: FeedbackDto })
  @ApiResponse({
    status: 200,
    description: 'Feedback recorded',
    schema: {
      example: {
        message: 'Thank you for feedback! This helps improve search.',
        training_queued: true,
      },
    },
  })
  async submitFeedback(@Body() dto: FeedbackDto) {
    this.logger.log(`V3 Feedback: item ${dto.clicked_item_id} at position ${dto.clicked_position}`);
    
    await this.learningService.logUserAction({
      sessionId: dto.session_id,
      query: dto.query,
      itemId: dto.clicked_item_id,
      position: dto.clicked_position,
      addedToCart: dto.added_to_cart || false,
      ordered: dto.ordered || false,
      orderId: dto.order_id,
    });

    return {
      message: 'Thank you for feedback! This helps improve search.',
      training_queued: true,
    };
  }

  /**
   * GET /v3/health
   * Health check for all V3 services
   */
  @Get('health')
  @ApiOperation({
    summary: 'V3 services health check',
    description: 'Check connectivity to IndicBERT NLU, vLLM, and Mercury voice services.',
  })
  @ApiResponse({
    status: 200,
    description: 'Health status',
    schema: {
      example: {
        status: 'healthy',
        services: {
          nlu: true,
          llm: true,
          mercury: { asr: true, tts: true },
        },
      },
    },
  })
  async healthCheck() {
    const services = await this.v3NluService.healthCheck();
    
    const allHealthy = services.nlu && services.llm && services.mercury.asr && services.mercury.tts;
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      services,
    };
  }

  /**
   * GET /v3/analytics/stats
   * Get V3 analytics statistics
   */
  @Get('/analytics/stats')
  @ApiOperation({
    summary: 'Get V3 analytics statistics',
    description: 'Retrieve usage statistics and performance metrics for V3 NLU system.',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics stats',
    schema: {
      example: {
        total_queries: 10543,
        fast_path_percentage: 78.5,
        complex_path_percentage: 21.5,
        avg_confidence: 0.89,
        avg_latency_ms: 125,
        top3_ctr: 0.72,
      },
    },
  })
  async getAnalyticsStats(@Query('days') days?: number) {
    const stats = await this.v3NluService.getAnalyticsStats(days || 7);
    return stats || {
      total_queries: 0,
      fast_path_percentage: 0,
      complex_path_percentage: 0,
      avg_confidence: 0,
      avg_latency_ms: 0,
      top3_ctr: 0,
    };
  }

  // =============================================
  // AGENTIC ENDPOINTS
  // =============================================

  /**
   * POST /v3/search/remember
   * Remember user preference
   */
  @Post('remember')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remember user preference',
    description: 'Store a user preference or fact for personalization.',
  })
  @ApiBody({ type: RememberDto })
  @ApiResponse({
    status: 200,
    description: 'Preference remembered',
    schema: {
      example: {
        success: true,
        message: 'Remembered: User is vegetarian',
      },
    },
  })
  async rememberPreference(@Body() dto: RememberDto) {
    this.logger.log(`💾 Remembering for user ${dto.user_id}: ${dto.content}`);
    return await this.v3NluService.rememberUserPreference(dto.user_id, {
      type: dto.type,
      content: dto.content,
    });
  }

  /**
   * GET /v3/search/user/:userId/profile
   * Get user profile with preferences
   */
  @Get('user/:userId/profile')
  @ApiOperation({
    summary: 'Get user profile',
    description: 'Retrieve user profile with remembered preferences and order history.',
  })
  @ApiParam({ name: 'userId', description: 'User ID or phone number' })
  @ApiResponse({
    status: 200,
    description: 'User profile',
    schema: {
      example: {
        userId: '9876543210',
        memories: [
          { type: 'preference', content: 'User is vegetarian', confidence: 0.95 },
          { type: 'order_history', content: 'Ordered: 5x Roti, 2x Naan', confidence: 1.0 },
        ],
        preferences: {
          dietaryRestrictions: ['vegetarian'],
          priceRange: 'mid',
        },
      },
    },
  })
  async getUserProfile(@Param('userId') userId: string) {
    this.logger.log(`📋 Getting profile for user ${userId}`);
    return await this.v3NluService.getUserProfile(userId);
  }

  /**
   * POST /v3/search/retrain
   * Trigger manual retraining
   */
  @Post('retrain')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Trigger manual NLU retraining',
    description: 'Manually trigger NLU retraining from logged interactions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retraining status',
    schema: {
      example: {
        success: true,
        message: 'Retraining triggered with 150 samples',
        samplesCount: 150,
      },
    },
  })
  async triggerRetraining() {
    this.logger.log('🔄 Manual retraining triggered');
    return await this.v3NluService.triggerRetraining();
  }
}
