import { Injectable, Logger, Optional } from '@nestjs/common';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';
import { CollectionsService } from '../../personalization/collections.service';

/**
 * Collections Executor
 *
 * Generates personalised smart collections (home-screen tiles) for a user.
 * Collections are based on the user's profile (favourite items, favourite stores)
 * and the current time of day.
 *
 * Config: {} (no required fields)
 *
 * Context reads:
 *   context.data.user_id  — numeric user ID
 *   context.data.lat / context.data._lat  — optional latitude
 *   context.data.lng / context.data._lng  — optional longitude
 *
 * Output:
 *   { collections: Collection[] }
 */
@Injectable()
export class CollectionsExecutor implements ActionExecutor {
  readonly name = 'collections';
  private readonly logger = new Logger(CollectionsExecutor.name);

  constructor(
    @Optional() private readonly collectionsService?: CollectionsService,
  ) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    if (!this.collectionsService) {
      this.logger.warn('CollectionsService not available — returning empty collections');
      return {
        success: true,
        output: { collections: [] },
        data: { collections: [] },
      };
    }

    const userId = context.data.user_id;
    const lat = context.data.lat || context.data._lat;
    const lng = context.data.lng || context.data._lng;

    if (!userId || isNaN(Number(userId))) {
      this.logger.warn('CollectionsExecutor: no valid user_id in context');
      return {
        success: true,
        output: { collections: [] },
        data: { collections: [] },
      };
    }

    try {
      const collections = await this.collectionsService.generateCollections(
        Number(userId),
        {
          lat: lat !== undefined ? Number(lat) : undefined,
          lng: lng !== undefined ? Number(lng) : undefined,
        },
      );

      return {
        success: true,
        output: { collections },
        data: { collections },
      };
    } catch (err) {
      this.logger.error(`CollectionsExecutor failed for user ${userId}: ${err.message}`, err.stack);
      return {
        success: true, // degrade gracefully — don't break the flow
        output: { collections: [] },
        data: { collections: [] },
      };
    }
  }
}
