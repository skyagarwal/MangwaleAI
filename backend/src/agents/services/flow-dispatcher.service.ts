import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { FlowEngineService } from '../../flow-engine/flow-engine.service';
import { RoutingResult, AgentResult } from '../types/agent.types';
import { SessionService } from '../../session/session.service';

/**
 * Flow Dispatcher Service
 * 
 * Extracted from AgentOrchestratorService to handle flow routing and execution.
 * This service provides a clean interface for flow operations.
 */
@Injectable()
export class FlowDispatcherService {
  private readonly logger = new Logger(FlowDispatcherService.name);

  constructor(
    @Inject(forwardRef(() => FlowEngineService))
    private readonly flowEngineService: FlowEngineService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Try to process an active flow if one exists
   */
  async tryActiveFlow(
    phoneNumber: string,
    message: string,
    routing: RoutingResult,
    startTime: number,
  ): Promise<AgentResult | null> {
    const activeFlow = await this.flowEngineService.getActiveFlow(phoneNumber);
    if (!activeFlow) {
      return null;
    }

    this.logger.log(`🔄 Processing active flow: ${activeFlow}`);
    
    try {
      const result = await this.flowEngineService.processMessage(
        phoneNumber,
        message,
        undefined, // event
        routing.intent,
        routing.confidence,
      );

      if (result && result.response) {
        return {
          response: result.response,
          buttons: result.buttons,
          metadata: {
            ...result.metadata,
            flowId: activeFlow,
            intent: routing.intent,
          },
          executionTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      this.logger.error(`Error processing active flow: ${error.message}`);
    }

    return null;
  }

  /**
   * Check if there's an active flow
   */
  async hasActiveFlow(phoneNumber: string): Promise<boolean> {
    const activeFlow = await this.flowEngineService.getActiveFlow(phoneNumber);
    return !!activeFlow;
  }

  /**
   * Process an active flow with message
   */
  async processActiveFlow(
    phoneNumber: string,
    message: string,
    intent: string,
    confidence: number,
    startTime: number,
  ): Promise<AgentResult | null> {
    const activeFlow = await this.flowEngineService.getActiveFlow(phoneNumber);
    if (!activeFlow) {
      return null;
    }

    try {
      const result = await this.flowEngineService.processMessage(
        phoneNumber,
        message,
        undefined, // event
        intent,
        confidence,
      );

      if (result && result.response) {
        return {
          response: result.response,
          buttons: result.buttons,
          metadata: {
            ...result.metadata,
            flowId: activeFlow,
            intent,
          },
          executionTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      this.logger.error(`Error processing active flow: ${error.message}`);
    }

    return null;
  }

  /**
   * Try to start a flow for the given routing
   */
  async tryStartFlow(
    phoneNumber: string,
    message: string,
    routing: RoutingResult,
    module: string,
    session: any,
    startTime?: number,
    prependResponse?: string,
  ): Promise<AgentResult | null> {
    try {
      // Find flow by intent
      const flow = await this.flowEngineService.findFlowByIntent(
        routing.intent,
        module,
      );

      if (!flow) {
        return null;
      }

      this.logger.log(`🚀 Starting flow: ${flow.id} for intent: ${routing.intent}`);

      const result = await this.flowEngineService.startFlow(flow.id, {
        sessionId: session?.id || phoneNumber,
        phoneNumber,
        module: module as 'food' | 'parcel' | 'ecommerce' | 'general',
        intent: routing.intent,
        intentConfidence: routing.confidence,
        initialContext: {
          ...routing.entities,
          module,
        },
      });

      if (result && result.response) {
        const response = prependResponse 
          ? `${prependResponse}\n\n${result.response}`
          : result.response;
        
        return {
          response,
          buttons: result.buttons,
          metadata: {
            ...result.metadata,
            flowId: flow.id,
            intent: routing.intent,
          },
          executionTime: startTime ? Date.now() - startTime : 0,
        };
      }
    } catch (error) {
      this.logger.error(`Error starting flow: ${error.message}`);
    }

    return null;
  }

  /**
   * Cancel an active flow
   */
  async cancelActiveFlow(phoneNumber: string): Promise<void> {
    try {
      await this.flowEngineService.cancelFlow(phoneNumber);
      this.logger.log(`❌ Cancelled active flow for ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`Error cancelling flow: ${error.message}`);
    }
  }
}
