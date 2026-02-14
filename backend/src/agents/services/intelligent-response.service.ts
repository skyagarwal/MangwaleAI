import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { QuestionType } from './question-classifier.service';
import { UserPreferenceService } from '../../personalization/user-preference.service';
import { ConversationDeduplicationService } from './conversation-memory.service';
import { IntelligentResponseMetrics } from './metrics/intelligent-response.metrics';

type ConversationMessage = {
  role: string;
  content: string;
  type?: string;
};

interface ResponseContext {
  current_field?: string;
  flow_id?: string;
  collected_data?: Record<string, any>;
  conversation_history?: ConversationMessage[];
  user_id?: string | number;
  session_id?: string;
  preferences?: Record<string, any>;
  relevant_context?: string;
}

/**
 * IntelligentResponseGenerator
 * 
 * Generates context-aware responses using LLM + templates
 * Replaces hardcoded templates with intelligent, personalized responses
 * 
 * Features:
 * - Uses conversation history
 * - References user preferences
 * - Adapts tone based on context
 * - Always redirects back to flow
 */
@Injectable()
export class IntelligentResponseGenerator {
  private readonly logger = new Logger(IntelligentResponseGenerator.name);
  private readonly MAX_RESPONSE_CHARS = 500;

  constructor(
    private readonly llmService: LlmService,
    private readonly userPreferenceService: UserPreferenceService,
    private readonly conversationMemoryService: ConversationDeduplicationService,
    private readonly metrics: IntelligentResponseMetrics,
  ) {}

  /**
   * Generate intelligent, context-aware response to user's question
   * 
   * Strategy:
   * 1. Gather relevant context (history, preferences, flow state)
   * 2. Use LLM to generate natural response
   * 3. Fallback to smart templates if LLM fails
   * 4. Always include redirection to continue flow
   */
  async generate(
    question: string,
    questionType: QuestionType,
    context: ResponseContext,
  ): Promise<string> {
    const startTime = Date.now();
    this.metrics.startGeneration();

    try {
      const conversationHistory = context.conversation_history || [];

      // Reuse previous answer if user repeats the same question
      const repeated = await this.conversationMemoryService.findRepeatedQuestion(
        question,
        conversationHistory,
      );

      if (repeated.isRepeated && repeated.previousAnswer) {
        this.logger.debug(
          `🔁 Repeated question detected (similarity: ${repeated.similarity?.toFixed(2) || 'n/a'})`,
        );
        
        if (repeated.similarity) {
          this.metrics.recordRepeatedQuestion(repeated.similarity);
        }
        
        const redirect = this.buildRedirect(context.current_field);
        const response = `${repeated.previousAnswer}\n\n${redirect}`;
        
        const latency = Date.now() - startTime;
        this.metrics.recordResponse('template', 'success', latency, response.length);
        
        return response;
      }

      // Gather contextual signals for LLM/template generation
      const enrichedContext = await this.gatherContext(question, context);
      
      // Try LLM-based generation first
      try {
        const llmResponse = await this.generateWithLLM(question, questionType, enrichedContext);
        if (llmResponse) {
          this.logger.debug(`🤖 Generated LLM response for ${questionType.type}`);
          
          const latency = Date.now() - startTime;
          this.metrics.recordResponse('llm', 'success', latency, llmResponse.length);
          this.metrics.recordLlmAttempt('success');
          
          return llmResponse;
        }
      } catch (error) {
        this.logger.warn(`⚠️ LLM generation failed: ${error.message}, falling back to templates`);
        
        const errorType = error.message.includes('timeout') ? 'llm_timeout' : 'llm_error';
        this.metrics.recordLlmAttempt(errorType === 'llm_timeout' ? 'timeout' : 'error');
        this.metrics.recordTemplateFallback(errorType);
      }
    } catch (error) {
      this.logger.error(`❌ Response generation error: ${error.message}`, error.stack);
    }
    
    // Fallback to smart templates
    const templateResponse = this.generateFromTemplate(question, questionType, context);
    const latency = Date.now() - startTime;
    this.metrics.recordResponse('template', 'success', latency, templateResponse.length);
    this.metrics.finishGeneration();
    
    return templateResponse;
  }

  /**
   * Gather relevant context for response generation
   */
  private async gatherContext(question: string, context: ResponseContext): Promise<ResponseContext> {
    const enriched: ResponseContext = { ...context };
    const history = context.conversation_history || [];

    // Merge stored user preferences with behavioral signals from conversation history
    let storedPreferences: Record<string, any> | undefined;
    if (context.user_id) {
      try {
        const userId = typeof context.user_id === 'string' ? parseInt(context.user_id, 10) : context.user_id;
        storedPreferences = await this.userPreferenceService.getPreferences(userId);
      } catch (error) {
        this.logger.debug(`Could not fetch user preferences: ${error.message}`);
      }
    }

    const preferenceSignals = this.conversationMemoryService.extractPreferences(history);
    enriched.preferences = {
      ...(storedPreferences || {}),
      ...(preferenceSignals || {}),
    };

    // Extract previous user questions (helps the LLM stay consistent)
    if (history.length > 0) {
      enriched.conversation_history = history.slice(-15); // recent window
    }

    // Detect references like "same as last time"
    const memoryContext = await this.conversationMemoryService.findRelevantContext(
      question,
      history,
    );

    if (memoryContext.relevant && memoryContext.message) {
      enriched.relevant_context = memoryContext.message;
    }

    return enriched;
  }

  /**
   * Generate response using LLM
   */
  private async generateWithLLM(
    question: string,
    questionType: QuestionType,
    context: ResponseContext
  ): Promise<string | null> {
    const redirect = this.buildRedirect(context.current_field);
    const systemPrompt = `You are Mangwale's delivery assistant. A user asked a ${questionType.type} question mid-flow.

Instructions:
- Give a concise, friendly answer (<100 words) in English/Hinglish mix.
- Use 0-2 emojis max.
- If pricing or timing depends on distance, say so.
- Always end by redirecting back to the flow: "${redirect}".

Context:
- Flow: ${context.flow_id || 'unknown'} | Field: ${context.current_field || 'address'}
- Collected data: ${JSON.stringify(context.collected_data || {})}
- Preferences: ${JSON.stringify(context.preferences || 'none')}
- Memory hint: ${context.relevant_context || 'none'}
- Recent user turns: ${this.summarizeHistory(context.conversation_history)}

Few-shot examples:
Q: "bike wala hai?"
A: "Yes! Bike, Auto, Mini Truck are available. Final price depends on distance. ${redirect}"

Q: "kitna time lagega?"
A: "Inside Nashik it's usually 30-60 mins. We assign a rider right after booking. ${redirect}"`;

    const userPrompt = `Question: "${question}"`;

    try {
      const result = await this.llmService.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        maxTokens: 150,
      });
      const response = result.content || '';


      // Validate response is not too long
      if (response.length > this.MAX_RESPONSE_CHARS) {
        this.logger.warn(`⚠️ LLM response too long (${response.length} chars), using template`);
        return null;
      }

      return response;
    } catch (error) {
      throw new Error(`LLM generation failed: ${error.message}`);
    }
  }

  /**
   * Generate response from smart templates
   * (Improved version of current hardcoded templates)
   */
  private generateFromTemplate(
    question: string,
    questionType: QuestionType,
    context: ResponseContext
  ): string {
    const lowerMsg = question.toLowerCase();
    const field = context.current_field || 'address';
    const fieldName = field.includes('pickup') ? 'pickup' : 'delivery';
    const redirect = this.buildRedirect(fieldName);
    
    // Vehicle inquiry
    if (questionType.type === 'vehicle_inquiry') {
      const preferences = context.collected_data?.preferred_vehicle;
      let response = `Yes! 🚗 We have multiple vehicle options:\n\n`;
      response += `🏍️ **Bike** - Starting at ₹30 (perfect for small items)\n`;
      response += `🛺 **Auto** - Starting at ₹50 (good for medium parcels)\n`;
      response += `🚐 **Mini Truck** - Starting at ₹100 (for larger items)\n`;
      response += `🚚 **Large Truck** - Starting at ₹200 (bulk deliveries)\n\n`;
      
      if (preferences) {
        response += `Last time you chose ${preferences}. `;
      }
      
      response += `Exact pricing will be shown after you provide both addresses. Distance matters!\n\n`;
      response += redirect;
      return response;
    }
    
    // Pricing inquiry
    if (questionType.type === 'pricing_inquiry') {
      let response = `💰 Pricing depends on:\n`;
      response += `1. **Distance** between pickup and delivery\n`;
      response += `2. **Vehicle type** you choose (Bike/Auto/Truck)\n`;
      response += `3. **Item weight** and size\n\n`;
      
      const pickup = context.collected_data?.pickup_address;
      const delivery = context.collected_data?.delivery_address;
      
      if (pickup && !delivery) {
        response += `You're sending from ${pickup}. `;
      } else if (pickup && delivery) {
        response += `For ${pickup} to ${delivery}, `;
      }
      
      response += `I'll calculate exact costs after you provide both addresses!\n\n`;
      response += redirect;
      return response;
    }
    
    // Timing inquiry
    if (questionType.type === 'timing_inquiry') {
      let response = `⚡ **Delivery Speed:**\n`;
      response += `- Within Nashik city: 30-60 minutes\n`;
      response += `- Rider assigned immediately after booking\n`;
      response += `- Real-time tracking available in app\n\n`;
      
      if (lowerMsg.includes('urgent') || lowerMsg.includes('jaldi')) {
        response += `For urgent deliveries, our Bike option is fastest! `;
      }
      
      response += `${redirect}`;
      return response;
    }
    
    // Clarification
    if (questionType.type === 'clarification') {
      let response = `Let me explain! 📝\n\n`;
      response += `Mangwale is a hyperlocal delivery service in Nashik. `;
      response += `We deliver parcels, food, groceries - anything you need!\n\n`;
      response += `To book a parcel delivery:\n`;
      response += `1. Tell us pickup address\n`;
      response += `2. Tell us delivery address\n`;
      response += `3. Choose vehicle type\n`;
      response += `4. Confirm and pay\n`;
      response += `5. Track rider in real-time\n\n`;
      response += redirect;
      return response;
    }
    
    // Generic fallback
    let response = `I'm here to help with your parcel delivery! 📦\n\n`;
    response += `Let me get your ${fieldName} address first, then I can answer all your questions about vehicles, pricing, and timing.\n\n`;
    response += redirect;
    return response;
  }

  private buildRedirect(field?: string): string {
    const fieldName = field?.includes('pickup') ? 'pickup' : 'delivery';
    return `Now, where should we ${fieldName === 'pickup' ? 'pick up' : 'deliver'} the parcel?`;
  }

  private summarizeHistory(history?: ConversationMessage[]): string {
    if (!history || history.length === 0) return 'none';
    const recentUserTurns = history
      .filter((msg) => msg.role === 'user')
      .slice(-3)
      .map((msg) => msg.content?.slice(0, 120) || '')
      .filter(Boolean);

    return recentUserTurns.length > 0 ? recentUserTurns.join(' | ') : 'none';
  }
}
