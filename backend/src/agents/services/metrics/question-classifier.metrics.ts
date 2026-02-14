import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';

/**
 * Prometheus metrics for QuestionClassifierService
 * 
 * Tracks:
 * - Classification requests (total, by type, by result)
 * - Processing latency (pattern vs LLM)
 * - Confidence scores
 * - Error rates
 */
@Injectable()
export class QuestionClassifierMetrics {
  // Total classification requests
  public readonly classificationsTotal = new Counter({
    name: 'question_classifier_requests_total',
    help: 'Total number of question classification requests',
    labelNames: ['result', 'method'], // result: question|not_question, method: pattern|llm
  });

  // Classification by question type
  public readonly classificationsByType = new Counter({
    name: 'question_classifier_by_type_total',
    help: 'Classification requests grouped by detected question type',
    labelNames: ['question_type'], // general_inquiry, timing_inquiry, pricing_inquiry, etc.
  });

  // Processing latency histogram
  public readonly classificationLatency = new Histogram({
    name: 'question_classifier_latency_ms',
    help: 'Time taken to classify user input (milliseconds)',
    labelNames: ['method'], // pattern, llm
    buckets: [1, 5, 10, 50, 100, 500, 1000, 5000], // ms buckets
  });

  // Confidence score distribution
  public readonly confidenceScore = new Histogram({
    name: 'question_classifier_confidence',
    help: 'Distribution of classification confidence scores',
    buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  });

  // Current active classifications (gauge for concurrency)
  public readonly activeClassifications = new Gauge({
    name: 'question_classifier_active_requests',
    help: 'Number of classification requests currently being processed',
  });

  // Pattern match hit rate
  public readonly patternHitRate = new Counter({
    name: 'question_classifier_pattern_hits_total',
    help: 'Number of times pattern matching successfully detected a question',
    labelNames: ['pattern_type'], // hinglish, english, hindi
  });

  // LLM fallback usage
  public readonly llmFallbackUsage = new Counter({
    name: 'question_classifier_llm_fallback_total',
    help: 'Number of times LLM fallback was used (pattern match failed)',
  });

  // Classification errors
  public readonly classificationErrors = new Counter({
    name: 'question_classifier_errors_total',
    help: 'Total number of classification errors',
    labelNames: ['error_type'], // llm_timeout, llm_error, parse_error
  });

  /**
   * Record a classification request
   */
  recordClassification(
    isQuestion: boolean,
    method: 'pattern' | 'llm',
    latencyMs: number,
    confidence: number,
    questionType?: string,
  ) {
    const result = isQuestion ? 'question' : 'not_question';
    this.classificationsTotal.inc({ result, method });
    this.classificationLatency.observe({ method }, latencyMs);
    this.confidenceScore.observe(confidence);

    if (isQuestion && questionType) {
      this.classificationsByType.inc({ question_type: questionType });
    }
  }

  /**
   * Record pattern match hit
   */
  recordPatternHit(patternType: 'hinglish' | 'english' | 'hindi') {
    this.patternHitRate.inc({ pattern_type: patternType });
  }

  /**
   * Record LLM fallback usage
   */
  recordLlmFallback() {
    this.llmFallbackUsage.inc();
  }

  /**
   * Record classification error
   */
  recordError(errorType: 'llm_timeout' | 'llm_error' | 'parse_error') {
    this.classificationErrors.inc({ error_type: errorType });
  }

  /**
   * Start tracking an active classification
   */
  startClassification() {
    this.activeClassifications.inc();
  }

  /**
   * Finish tracking an active classification
   */
  finishClassification() {
    this.activeClassifications.dec();
  }
}
