/**
 * ARCHIVED: Legacy Flow Execution Methods
 * 
 * Archive Date: December 28, 2025
 * Source: backend/src/agents/services/agent-orchestrator.service.ts
 * 
 * These methods have been replaced by the modern FlowEngineService.
 * Kept for reference and potential rollback.
 */

export interface Flow {
  id: string;
  name: string;
  description?: string;
  steps: FlowStep[];
  enabled: boolean;
  trigger?: string;
  module?: string;
}

export interface FlowStep {
  id: string;
  type: string;
  config: Record<string, unknown>;
  next?: string;
}

export interface FlowExecutionContext {
  phoneNumber: string;
  sessionId: string;
  collectedData: Record<string, unknown>;
  currentStepId: string;
  flowId: string;
  stepAttempts?: Record<string, number>;
}

/**
 * LEGACY: Execute a flow (step-based approach)
 * 
 * Replaced by: FlowEngineService.startFlow() and FlowEngineService.continueFlow()
 */
export async function executeFlowLegacy(
  flow: Flow, 
  context: any,
  sessionService: any,
  logger: any
): Promise<{ response: string; executionTime: number }> {
  const startTime = Date.now();
  
  try {
    logger.log(`🔄 [LEGACY] Executing flow: ${flow.name} (${flow.steps.length} steps)`);

    // Get flow execution context from session
    let flowContext = context.session?.data?.flowContext as FlowExecutionContext;

    if (!flowContext || flowContext.flowId !== flow.id) {
      // Initialize new flow context
      flowContext = {
        phoneNumber: context.phoneNumber,
        sessionId: context.session?.phoneNumber || context.phoneNumber,
        collectedData: {},
        currentStepId: flow.steps[0]?.id || '',
        flowId: flow.id,
      };
    }

    // Execute current step
    const currentStep = flow.steps.find(s => s.id === flowContext.currentStepId);

    if (!currentStep) {
      logger.error(`Step not found: ${flowContext.currentStepId}`);
      return {
        response: 'I encountered an error processing your request. Please try again.',
        executionTime: Date.now() - startTime,
      };
    }

    // Step execution would happen here...
    // This is where executeFlowStep would be called

    return {
      response: 'Legacy flow execution',
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Error executing legacy flow:', error);
    return {
      response: 'I encountered an error processing your request. Please try again.',
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * LEGACY: Execute a single flow step
 * 
 * Replaced by: FlowEngine executors in backend/src/flow-engine/executors/
 */
export async function executeFlowStepLegacy(
  step: FlowStep,
  context: any,
  flowContext: FlowExecutionContext,
  logger: any
): Promise<{ response: string; complete: boolean; data?: Record<string, unknown> }> {
  logger.log(`📋 [LEGACY] Executing step: ${step.id} (type: ${step.type})`);

  switch (step.type) {
    case 'nlu':
      // Now handled by: nlu.executor.ts
      return { response: '', complete: true };
    
    case 'collect_data':
      // Now handled by: state machine with 'wait' states
      return { response: 'Please provide the information.', complete: false };
    
    case 'tool':
      // Now handled by: specific executors (auth.executor.ts, search.executor.ts, etc.)
      return { response: '', complete: true };
    
    case 'validate':
    case 'validate_zone':
      // Now handled by: zone.executor.ts
      return { response: '', complete: true };
    
    case 'calculate':
    case 'calculate_distance':
      // Now handled by: distance.executor.ts
      return { response: '', complete: true };
    
    case 'calculate_charges':
      // Now handled by: pricing.executor.ts
      return { response: '', complete: true };
    
    case 'llm':
      // Now handled by: llm.executor.ts
      return { response: '', complete: true };
    
    case 'api_call':
      // Now handled by: order.executor.ts or specific service calls
      return { response: '', complete: true };
    
    case 'respond':
      // Now handled by: response.executor.ts
      return { response: step.config.message as string, complete: true };
    
    case 'condition':
    case 'decision':
      // Now handled by: state machine transition conditions
      return { response: '', complete: true };
    
    case 'game':
    case 'gamification':
      // Now handled by: game.executor.ts
      return { response: '', complete: true };
    
    case 'pricing':
      // Now handled by: pricing.executor.ts
      return { response: '', complete: true };
    
    default:
      logger.warn(`Unknown legacy step type: ${step.type}`);
      return {
        response: 'I encountered an unknown step type. Please type "reset" to start over.',
        complete: true,
      };
  }
}

/**
 * LEGACY: Find flow for a given intent and module
 * 
 * Replaced by: FlowEngineService.findFlowByIntent() and flowDefinitionsByTrigger
 */
export async function findFlowForIntentLegacy(
  intent: string, 
  module: string, 
  message: string | undefined,
  flows: Flow[],
  logger: any
): Promise<Flow | null> {
  try {
    // Strategy 1: Exact trigger match
    let flow = flows.find(
      f => f.trigger && f.trigger === intent && f.module === module.toLowerCase()
    );
    
    if (flow) {
      logger.log(`✅ [LEGACY] Flow matched by trigger: ${flow.name}`);
      return flow;
    }

    // Strategy 2: Keyword matching for unknown intents
    if ((intent === 'unknown' || intent === 'general' || !intent) && message) {
      const lowerMessage = message.toLowerCase();
      
      // Parcel/Courier keywords
      if (lowerMessage.match(/\b(parcel|courier|delivery|package|send|ship|booking)\b/)) {
        flow = flows.find(f => 
          f.name.toLowerCase().includes('parcel') || 
          f.id.includes('parcel')
        );
        if (flow) {
          logger.log(`✅ [LEGACY] Flow matched by keyword (parcel): ${flow.name}`);
          return flow;
        }
      }

      // Food/Restaurant keywords
      if (lowerMessage.match(/\b(food|restaurant|meal|order|hungry|eat|menu)\b/)) {
        flow = flows.find(f => 
          f.name.toLowerCase().includes('food') || 
          f.name.toLowerCase().includes('restaurant') ||
          f.module === 'food'
        );
        if (flow) {
          logger.log(`✅ [LEGACY] Flow matched by keyword (food): ${flow.name}`);
          return flow;
        }
      }

      // E-commerce keywords
      if (lowerMessage.match(/\b(shop|buy|product|cart|checkout|purchase)\b/)) {
        flow = flows.find(f => 
          f.name.toLowerCase().includes('commerce') || 
          f.name.toLowerCase().includes('shop')
        );
        if (flow) {
          logger.log(`✅ [LEGACY] Flow matched by keyword (ecommerce): ${flow.name}`);
          return flow;
        }
      }
    }

    // Strategy 3: Module-based matching
    flow = flows.find(f => f.module === module.toLowerCase());
    if (flow) {
      logger.log(`✅ [LEGACY] Flow matched by module: ${flow.name}`);
      return flow;
    }

    // Strategy 4: Default to first active flow for this module
    flow = flows.find(f => f.enabled);
    if (flow) {
      logger.log(`⚠️ [LEGACY] Using default flow: ${flow.name}`);
      return flow;
    }

    return null;
  } catch (error) {
    logger.error('[LEGACY] Error finding flow for intent:', error);
    return null;
  }
}
