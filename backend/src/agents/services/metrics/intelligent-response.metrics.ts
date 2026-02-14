import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';

/**
 * Prometheus metrics for IntelligentResponseGenerator
 * 
 * Tracks:
 * - Response generation requests
 * - LLM vs template usage
 * - Response quality indicators
 * - Repeated question detection
 */
@Injectable()
export class IntelligentResponseMetrics {
  // Total response generation requests
  public readonly responsesTotal = new Counter({
    name: 'intelligent_response_requests_total',
    help: 'Total number of response generation requests',
    labelNames: ['method', 'result'], // method: llm|template, result: success|error
  });

  // Response generation latency
  public readonly responseLatency = new Histogram({
    name: 'intelligent_response_latency_ms',
    help: 'Time taken to generate intelligent response (milliseconds)',
    labelNames: ['method'], // llm, template
    buckets: [10, 50, 100, 500, 1000, 2000, 5000, 10000], // ms buckets
  });

  // Repeated question detection
  public readonly repeatedQuestions = new Counter({
    name: 'intelligent_response_repeated_questions_total',
    help: 'Number of repeated questions detected',
    labelNames: ['similarity_bucket'], // high (>0.95), medium (0.85-0.95), low (0.70-0.85)
  });

  // LLM generation success/failure
  public readonly llmGeneration = new Counter({
    name: 'intelligent_response_llm_generation_total',
    help: 'LLM response generation attempts',
    labelNames: ['result'], // success, timeout, error
  });

  // Template fallback usage
  public readonly templateFallback = new Counter({
    name: 'intelligent_response_template_fallback_total',
    help: 'Number of times template fallback was used',
    labelNames: ['reason'], // llm_timeout, llm_error, no_llm
  });

  // Context gathering metrics
  public readonly contextSize = new Histogram({
    name: 'intelligent_response_context_size_chars',
    help: 'Size of context gathered for response generation (characters)',
    buckets: [100, 500, 1000, 2000, 5000, 10000], // character buckets
  });

  // Active response generations
  public readonly activeGenerations = new Gauge({
    name: 'intelligent_response_active_requests',
    help: 'Number of response generation requests currently being processed',
  });

  // User preference integration
  public readonly preferenceUsage = new Counter({
    name: 'intelligent_response_preference_usage_total',
    help: 'Number of times user preferences were included in context',
    labelNames: ['preference_type'], // vehicle, price_sensitivity, timing
  });

  // Response length distribution
  public readonly responseLength = new Histogram({
    name: 'intelligent_response_length_chars',
    help: 'Length of generated responses (characters)',
    buckets: [50, 100, 200, 500, 1000, 2000], // character buckets
  });

  /**
   * Record a response generation request
   */
  recordResponse(
    method: 'llm' | 'template',
    result: 'success' | 'error',
    latencyMs: number,
    responseLength: number,
  ) {
    this.responsesTotal.inc({ method, result });
    this.responseLatency.observe({ method }, latencyMs);
    this.responseLength.observe(responseLength);
  }

  /**
   * Record repeated question detection
   */
  recordRepeatedQuestion(similarity: number) {
    let bucket: string;
    if (similarity >= 0.95) bucket = 'high';
    else if (similarity >= 0.85) bucket = 'medium';
    else bucket = 'low';

    this.repeatedQuestions.inc({ similarity_bucket: bucket });
  }

  /**
   * Record LLM generation attempt
   */
  recordLlmAttempt(result: 'success' | 'timeout' | 'error') {
    this.llmGeneration.inc({ result });
  }

  /**
   * Record template fallback
   */
  recordTemplateFallback(reason: 'llm_timeout' | 'llm_error' | 'no_llm') {
    this.templateFallback.inc({ reason });
  }

  /**
   * Record context size
   */
  recordContextSize(sizeChars: number) {
    this.contextSize.observe(sizeChars);
  }

  /**
   * Record user preference usage
   */
  recordPreferenceUsage(preferenceType: 'vehicle' | 'price_sensitivity' | 'timing') {
    this.preferenceUsage.inc({ preference_type: preferenceType });
  }

  /**
   * Start tracking an active generation
   */
  startGeneration() {
    this.activeGenerations.inc();
  }

  /**
   * Finish tracking an active generation
   */
  finishGeneration() {
    this.activeGenerations.dec();
  }
}
