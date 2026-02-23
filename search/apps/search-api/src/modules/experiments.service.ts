import { Injectable, Logger } from '@nestjs/common';

/**
 * A/B Testing & Experiments Service
 * 
 * Manages feature flags and experiments for search optimizations.
 * Uses consistent hashing to ensure users always get the same variant.
 */
@Injectable()
export class ExperimentsService {
  private readonly logger = new Logger(ExperimentsService.name);
  private experiments = new Map<string, Experiment>();

  constructor() {
    this.setupExperiments();
  }

  /**
   * Configure active experiments
   */
  private setupExperiments() {
    // Experiment 1: Search Algorithm (Hybrid vs Keyword-only)
    this.experiments.set('search_algorithm', {
      name: 'search_algorithm',
      description: 'Compare hybrid search (keyword+vector) vs keyword-only',
      variants: [
        { name: 'control', weight: 50, description: 'Keyword-only search' },
        { name: 'hybrid', weight: 50, description: 'Keyword + Vector search' }
      ],
      active: true
    });

    // Experiment 2: Personalization
    this.experiments.set('personalization', {
      name: 'personalization',
      description: 'Test impact of personalized ranking',
      variants: [
        { name: 'off', weight: 50, description: 'No personalization' },
        { name: 'on', weight: 50, description: 'User history-based personalization' }
      ],
      active: true
    });

    // Experiment 3: Reranking Strategy
    this.experiments.set('reranking', {
      name: 'reranking',
      description: 'Compare reranking strategies',
      variants: [
        { name: 'basic', weight: 33, description: 'Popularity + Rating only' },
        { name: 'ml', weight: 33, description: 'ML-based reranking' },
        { name: 'ctr', weight: 34, description: 'CTR-optimized reranking' }
      ],
      active: false  // Not yet implemented
    });

    this.logger.log(`✅ Experiments configured: ${this.experiments.size} active`);
  }

  /**
   * Get variant assignment for a user
   * Uses consistent hashing to ensure same user always gets same variant
   */
  getVariant(experimentName: string, userId: number | string): string {
    const exp = this.experiments.get(experimentName);
    
    if (!exp || !exp.active) {
      return 'control';
    }

    // Handle anonymous users
    const userKey = userId || 'anonymous';

    // Consistent hashing
    const hash = this.hashUserId(userKey, experimentName);
    const bucket = hash % 100;

    let cumulative = 0;
    for (const variant of exp.variants) {
      cumulative += variant.weight;
      if (bucket < cumulative) {
        return variant.name;
      }
    }

    return exp.variants[0].name;
  }

  /**
   * Check if a feature is enabled for a user
   */
  isFeatureEnabled(featureName: string, userId: number | string): boolean {
    const variant = this.getVariant(featureName, userId);
    return variant !== 'off' && variant !== 'control';
  }

  /**
   * Get all active experiments
   */
  getActiveExperiments(): Experiment[] {
    return Array.from(this.experiments.values()).filter(exp => exp.active);
  }

  /**
   * Get experiment details
   */
  getExperiment(name: string): Experiment | undefined {
    return this.experiments.get(name);
  }

  /**
   * Hash user ID with experiment name for consistent bucketing
   * Uses simple string hashing algorithm
   */
  private hashUserId(userId: number | string, salt: string): number {
    const str = `${userId}_${salt}`;
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash);
  }

  /**
   * Enable/disable an experiment
   */
  setExperimentActive(name: string, active: boolean): boolean {
    const exp = this.experiments.get(name);
    if (!exp) {
      this.logger.warn(`Experiment "${name}" not found`);
      return false;
    }

    exp.active = active;
    this.logger.log(`Experiment "${name}" ${active ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Add a new experiment dynamically
   */
  addExperiment(experiment: Experiment): void {
    // Validate weights sum to 100
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      throw new Error(`Experiment variant weights must sum to 100 (got ${totalWeight})`);
    }

    this.experiments.set(experiment.name, experiment);
    this.logger.log(`Added experiment: ${experiment.name} with ${experiment.variants.length} variants`);
  }
}

// Type definitions
export interface Experiment {
  name: string;
  description: string;
  variants: ExperimentVariant[];
  active: boolean;
}

export interface ExperimentVariant {
  name: string;
  weight: number;  // 0-100
  description: string;
}
