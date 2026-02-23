import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmClientService } from '../clients/llm-client.service';

export interface PlanStep {
  id: string;
  type: 'search' | 'cart' | 'order' | 'track' | 'help' | 'chitchat';
  description: string;
  params: Record<string, any>;
  dependsOn?: string[]; // IDs of steps this depends on
}

export interface ExecutionPlan {
  goal: string;
  steps: PlanStep[];
  reasoning: string;
  isMultiTask: boolean;
  estimatedTurns: number;
}

/**
 * Planning Service
 * Decomposes complex user goals into executable steps
 * Enables multi-task handling like "order food AND book parcel"
 */
@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);
  private readonly enablePlanning: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LlmClientService,
  ) {
    this.enablePlanning = this.config.get<string>('ENABLE_PLANNING', 'true') === 'true';
    this.logger.log(`Planning Service: ${this.enablePlanning ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Analyze user message and create an execution plan
   */
  async createPlan(message: string, context?: any): Promise<ExecutionPlan> {
    // Quick check for simple queries (no planning needed)
    if (this.isSimpleQuery(message)) {
      return this.createSimplePlan(message);
    }

    // Check if multi-task
    const isMultiTask = this.detectMultiTask(message);

    if (!isMultiTask && !this.enablePlanning) {
      return this.createSimplePlan(message);
    }

    this.logger.log(`📋 Creating plan for: "${message}" (multi-task: ${isMultiTask})`);

    try {
      if (isMultiTask) {
        return await this.createMultiTaskPlan(message, context);
      }
      return await this.createSingleTaskPlan(message, context);
    } catch (error: any) {
      this.logger.error(`Planning failed: ${error.message}`);
      return this.createFallbackPlan(message);
    }
  }

  /**
   * Detect if message contains multiple tasks
   */
  private detectMultiTask(message: string): boolean {
    const lower = message.toLowerCase();
    
    // Explicit multi-task keywords
    const multiTaskPatterns = [
      /\band\s+also\b/,
      /\bthen\s+also\b/,
      /\bfirst\s+.*\bthen\b/,
      /\b(?:order|get|buy)\s+.*\b(?:and|also)\s+(?:book|send|deliver)/,
      /\bparcel\b.*\b(?:and|also)\b.*\bfood\b/,
      /\bfood\b.*\b(?:and|also)\b.*\bparcel\b/,
    ];

    for (const pattern of multiTaskPatterns) {
      if (pattern.test(lower)) {
        return true;
      }
    }

    // Count distinct task types
    const taskTypes = this.countTaskTypes(lower);
    return taskTypes > 1;
  }

  /**
   * Count distinct task types in message
   */
  private countTaskTypes(message: string): number {
    let count = 0;
    
    // Food ordering
    if (/\b(?:order|food|pizza|biryani|burger|eat|hungry|dinner|lunch|breakfast)\b/.test(message)) {
      count++;
    }
    
    // Parcel/delivery
    if (/\b(?:parcel|send|deliver|courier|package|pickup)\b/.test(message)) {
      count++;
    }
    
    // Tracking
    if (/\b(?:track|where|status|delivery)\b/.test(message)) {
      count++;
    }
    
    // Help
    if (/\b(?:help|support|problem|issue|complaint)\b/.test(message)) {
      count++;
    }

    return count;
  }

  /**
   * Check if query is simple (no planning needed)
   */
  private isSimpleQuery(message: string): boolean {
    const lower = message.toLowerCase();
    const words = lower.split(/\s+/).length;
    
    // Very short messages are usually simple
    if (words <= 4) return true;
    
    // Greetings are simple
    if (/^(hi|hello|hey|good\s+(morning|afternoon|evening)|namaste)/i.test(lower)) {
      return true;
    }
    
    // Single food items are simple
    if (/^(?:i\s+want\s+)?(\d+\s+)?\w+(\s+from\s+\w+)?$/i.test(lower)) {
      return true;
    }

    return false;
  }

  /**
   * Create a simple plan for single-task queries
   */
  private createSimplePlan(message: string): ExecutionPlan {
    const taskType = this.detectPrimaryTask(message);
    
    return {
      goal: message,
      steps: [{
        id: 'step_1',
        type: taskType,
        description: `Handle ${taskType} request`,
        params: { query: message },
      }],
      reasoning: 'Simple single-task query, no decomposition needed',
      isMultiTask: false,
      estimatedTurns: 1,
    };
  }

  /**
   * Detect the primary task type
   */
  private detectPrimaryTask(message: string): PlanStep['type'] {
    const lower = message.toLowerCase();
    
    if (/\b(?:track|where|status)\b/.test(lower)) return 'track';
    if (/\b(?:help|support|problem|issue)\b/.test(lower)) return 'help';
    if (/\b(?:parcel|send|courier|package)\b/.test(lower)) return 'cart'; // parcel uses cart flow
    if (/\b(?:hi|hello|hey|bye|thanks)\b/.test(lower)) return 'chitchat';
    
    return 'search'; // Default to search
  }

  /**
   * Create plan for single complex task using LLM
   */
  private async createSingleTaskPlan(message: string, context?: any): Promise<ExecutionPlan> {
    const prompt = `Analyze this user request and create an execution plan.

User request: "${message}"
${context ? `Context: ${JSON.stringify(context)}` : ''}

Available task types:
- search: Search for food/products
- cart: Add items to cart
- order: Place an order
- track: Track delivery status
- help: Handle support request
- chitchat: Casual conversation

Return JSON only:
{
  "goal": "user's main goal",
  "steps": [
    {
      "id": "step_1",
      "type": "search|cart|order|track|help|chitchat",
      "description": "what this step does",
      "params": {"query": "...", "filters": {...}}
    }
  ],
  "reasoning": "why this plan",
  "estimatedTurns": 1
}`;

    try {
      const response = await this.llm.generateResponse(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          goal: parsed.goal || message,
          steps: parsed.steps || [{ id: 'step_1', type: 'search', description: 'Search', params: { query: message } }],
          reasoning: parsed.reasoning || 'LLM-generated plan',
          isMultiTask: false,
          estimatedTurns: parsed.estimatedTurns || 1,
        };
      }
    } catch (error: any) {
      this.logger.warn(`LLM planning failed: ${error.message}`);
    }

    return this.createFallbackPlan(message);
  }

  /**
   * Create plan for multi-task requests using LLM
   */
  private async createMultiTaskPlan(message: string, context?: any): Promise<ExecutionPlan> {
    const prompt = `The user wants to do MULTIPLE tasks. Decompose into separate steps.

User request: "${message}"
${context ? `Context: ${JSON.stringify(context)}` : ''}

Available task types:
- search: Search for food/products
- cart: Add items to cart
- order: Place an order
- track: Track delivery status
- help: Handle support request
- chitchat: Casual conversation

Return JSON with MULTIPLE steps that can be executed sequentially:
{
  "goal": "overall goal",
  "steps": [
    {"id": "step_1", "type": "search", "description": "First task", "params": {...}},
    {"id": "step_2", "type": "cart", "description": "Second task", "params": {...}, "dependsOn": ["step_1"]}
  ],
  "reasoning": "how tasks are related",
  "estimatedTurns": 2
}`;

    try {
      const response = await this.llm.generateResponse(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Ensure we have multiple steps
        const steps = parsed.steps && parsed.steps.length > 1 
          ? parsed.steps 
          : this.splitIntoSteps(message);

        return {
          goal: parsed.goal || message,
          steps,
          reasoning: parsed.reasoning || 'Multi-task decomposition',
          isMultiTask: true,
          estimatedTurns: parsed.estimatedTurns || steps.length,
        };
      }
    } catch (error: any) {
      this.logger.warn(`LLM multi-task planning failed: ${error.message}`);
    }

    // Fallback: split by "and"
    return {
      goal: message,
      steps: this.splitIntoSteps(message),
      reasoning: 'Rule-based multi-task split',
      isMultiTask: true,
      estimatedTurns: 2,
    };
  }

  /**
   * Rule-based step splitting
   */
  private splitIntoSteps(message: string): PlanStep[] {
    const lower = message.toLowerCase();
    const steps: PlanStep[] = [];
    
    // Split by common conjunctions
    const parts = lower.split(/\s+(?:and\s+also|then\s+also|and|then)\s+/);
    
    parts.forEach((part, index) => {
      const taskType = this.detectPrimaryTask(part);
      steps.push({
        id: `step_${index + 1}`,
        type: taskType,
        description: part.trim(),
        params: { query: part.trim() },
        dependsOn: index > 0 ? [`step_${index}`] : undefined,
      });
    });

    // Ensure at least one step
    if (steps.length === 0) {
      steps.push({
        id: 'step_1',
        type: 'search',
        description: message,
        params: { query: message },
      });
    }

    return steps;
  }

  /**
   * Fallback plan when LLM is unavailable
   */
  private createFallbackPlan(message: string): ExecutionPlan {
    return {
      goal: message,
      steps: [{
        id: 'step_1',
        type: this.detectPrimaryTask(message),
        description: 'Process request',
        params: { query: message },
      }],
      reasoning: 'Fallback single-step plan',
      isMultiTask: false,
      estimatedTurns: 1,
    };
  }

  /**
   * Execute a plan step by step
   */
  async executePlan(plan: ExecutionPlan, executor: (step: PlanStep) => Promise<any>): Promise<{
    results: Array<{ stepId: string; result: any; success: boolean }>;
    completed: boolean;
  }> {
    const results: Array<{ stepId: string; result: any; success: boolean }> = [];
    const completedSteps = new Set<string>();

    for (const step of plan.steps) {
      // Check dependencies
      if (step.dependsOn) {
        const depsComplete = step.dependsOn.every(dep => completedSteps.has(dep));
        if (!depsComplete) {
          this.logger.warn(`⏸️ Step ${step.id} blocked by incomplete dependencies`);
          continue;
        }
      }

      try {
        this.logger.log(`▶️ Executing step ${step.id}: ${step.description}`);
        const result = await executor(step);
        results.push({ stepId: step.id, result, success: true });
        completedSteps.add(step.id);
      } catch (error: any) {
        this.logger.error(`❌ Step ${step.id} failed: ${error.message}`);
        results.push({ stepId: step.id, result: error.message, success: false });
        
        // Don't continue if a step fails
        break;
      }
    }

    return {
      results,
      completed: completedSteps.size === plan.steps.length,
    };
  }

  /**
   * Format plan for user display
   */
  formatPlanForUser(plan: ExecutionPlan): string {
    if (!plan.isMultiTask) {
      return ''; // Don't show plan for simple queries
    }

    const stepDescriptions = plan.steps.map((step, i) => 
      `${i + 1}. ${step.description}`
    ).join('\n');

    return `I'll help you with multiple things:\n${stepDescriptions}\n\nLet's start with the first one.`;
  }
}
