import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';

/**
 * Prometheus metrics for ConversationMemoryService
 * 
 * Tracks:
 * - Memory operations (add, retrieve, search)
 * - Embedding generation and similarity search
 * - Preference extraction
 * - Memory size and growth
 */
@Injectable()
export class ConversationMemoryMetrics {
  // Total memory operations
  public readonly operationsTotal = new Counter({
    name: 'conversation_memory_operations_total',
    help: 'Total number of memory operations',
    labelNames: ['operation', 'result'], // operation: add|search|extract, result: success|error
  });

  // Embedding generation metrics
  public readonly embeddingGeneration = new Counter({
    name: 'conversation_memory_embedding_generation_total',
    help: 'Total number of embedding generation requests',
    labelNames: ['result'], // success, error
  });

  public readonly embeddingLatency = new Histogram({
    name: 'conversation_memory_embedding_latency_ms',
    help: 'Time taken to generate embeddings (milliseconds)',
    buckets: [5, 10, 50, 100, 500, 1000], // ms buckets
  });

  // Similarity search metrics
  public readonly similaritySearch = new Counter({
    name: 'conversation_memory_similarity_search_total',
    help: 'Total number of similarity searches',
    labelNames: ['found'], // yes, no
  });

  public readonly similarityScore = new Histogram({
    name: 'conversation_memory_similarity_score',
    help: 'Distribution of similarity scores',
    buckets: [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0],
  });

  public readonly searchLatency = new Histogram({
    name: 'conversation_memory_search_latency_ms',
    help: 'Time taken to search for repeated questions (milliseconds)',
    buckets: [1, 5, 10, 50, 100, 500], // ms buckets
  });

  // Preference extraction metrics
  public readonly preferenceExtraction = new Counter({
    name: 'conversation_memory_preference_extraction_total',
    help: 'Total number of preference extraction operations',
    labelNames: ['preference_type'], // vehicle, price_sensitivity, timing
  });

  // Context retrieval metrics
  public readonly contextRetrieval = new Counter({
    name: 'conversation_memory_context_retrieval_total',
    help: 'Total number of context retrieval operations',
    labelNames: ['found'], // yes, no
  });

  public readonly contextSize = new Histogram({
    name: 'conversation_memory_context_size',
    help: 'Number of context items retrieved',
    buckets: [1, 2, 5, 10, 20, 50], // item count buckets
  });

  // Memory size tracking
  public readonly memorySizeGauge = new Gauge({
    name: 'conversation_memory_size_items',
    help: 'Current number of items in conversation memory',
    labelNames: ['session_id'],
  });

  public readonly memorySizeBytes = new Gauge({
    name: 'conversation_memory_size_bytes',
    help: 'Approximate memory size in bytes',
    labelNames: ['session_id'],
  });

  // Active sessions
  public readonly activeSessions = new Gauge({
    name: 'conversation_memory_active_sessions',
    help: 'Number of active conversation sessions in memory',
  });

  /**
   * Record a memory operation
   */
  recordOperation(
    operation: 'add' | 'search' | 'extract',
    result: 'success' | 'error',
  ) {
    this.operationsTotal.inc({ operation, result });
  }

  /**
   * Record embedding generation
   */
  recordEmbedding(result: 'success' | 'error', latencyMs: number) {
    this.embeddingGeneration.inc({ result });
    if (result === 'success') {
      this.embeddingLatency.observe(latencyMs);
    }
  }

  /**
   * Record similarity search
   */
  recordSimilaritySearch(
    found: boolean,
    latencyMs: number,
    similarity?: number,
  ) {
    this.similaritySearch.inc({ found: found ? 'yes' : 'no' });
    this.searchLatency.observe(latencyMs);

    if (similarity !== undefined) {
      this.similarityScore.observe(similarity);
    }
  }

  /**
   * Record preference extraction
   */
  recordPreferenceExtraction(preferenceType: 'vehicle' | 'price_sensitivity' | 'timing') {
    this.preferenceExtraction.inc({ preference_type: preferenceType });
  }

  /**
   * Record context retrieval
   */
  recordContextRetrieval(found: boolean, itemCount: number) {
    this.contextRetrieval.inc({ found: found ? 'yes' : 'no' });
    if (found) {
      this.contextSize.observe(itemCount);
    }
  }

  /**
   * Update memory size for a session
   */
  updateMemorySize(sessionId: string, itemCount: number, approxBytes: number) {
    this.memorySizeGauge.set({ session_id: sessionId }, itemCount);
    this.memorySizeBytes.set({ session_id: sessionId }, approxBytes);
  }

  /**
   * Update active sessions count
   */
  updateActiveSessions(count: number) {
    this.activeSessions.set(count);
  }
}
