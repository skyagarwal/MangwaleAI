import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { GameOrchestratorService } from '../../gamification/services/game-orchestrator.service';
import { RoutingResult, AgentResult } from '../types/agent.types';

/**
 * Game Handler Service
 * 
 * Extracted from AgentOrchestratorService to handle game-related intents.
 * This service provides a clean interface for game operations.
 */
@Injectable()
export class GameHandlerService {
  private readonly logger = new Logger(GameHandlerService.name);

  constructor(
    @Inject(forwardRef(() => GameOrchestratorService))
    private readonly gameOrchestrator: GameOrchestratorService,
  ) {}

  /**
   * Handle game-related intents
   */
  async handleGameIntent(
    phoneNumber: string,
    message: string,
    routing: RoutingResult,
    session: any,
    startTime: number,
  ): Promise<AgentResult | null> {
    // Check if this is a game-related intent
    const gameIntents = [
      'play_game',
      'claim_reward',
      'view_rewards',
      'check_points',
      'leaderboard',
      'game_intro',
    ];

    const intent = String(routing.intent || '').toLowerCase();
    if (!gameIntents.includes(intent)) {
      return null;
    }

    this.logger.log(`🎮 Handling game intent: ${intent}`);

    try {
      // Get user ID from session
      const userId = session?.data?.user_id || 0;
      
      // For game intents, we'll use the game intro flow instead
      // The actual game logic is handled by the flow engine
      if (intent === 'play_game' || intent === 'game_intro') {
        // Try to start a game - need userId and gameType
        if (userId > 0) {
          try {
            const gameResult = await this.gameOrchestrator.startGame(
              userId,
              'intent_quest', // Default game type
            );
            
            if (gameResult && gameResult.message) {
              return {
                response: gameResult.message,
                buttons: [],
                metadata: {
                  intent: routing.intent,
                  gameIntent: true,
                  sessionId: gameResult.sessionId,
                },
                executionTime: Date.now() - startTime,
              };
            }
          } catch (error) {
            this.logger.warn(`Game start failed: ${error.message}`);
          }
        }
      }

      // For other game intents, return a simple response
      // These should be handled by flows or specific game endpoints
      return {
        response: 'Game features are being developed. Please use the game menu to play!',
        buttons: [],
        metadata: {
          intent: routing.intent,
          gameIntent: true,
        },
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(`Error handling game intent: ${error.message}`);
    }

    return null;
  }
}
