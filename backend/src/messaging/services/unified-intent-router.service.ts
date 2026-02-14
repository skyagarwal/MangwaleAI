import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SemanticFoodDetectorService } from '../../nlu/services/semantic-food-detector.service';
import { SemanticParcelDetectorService } from '../../nlu/services/semantic-parcel-detector.service';

/**
 * Unified Intent Router Service
 *
 * 🐛 FIX: Consolidates all intent routing logic into database-driven system
 *
 * BEFORE: Intent routing was fragmented across:
 * - Hardcoded keywords in IntentRouterService (FOOD_KEYWORDS, P2P_PATTERNS)
 * - Pattern matching in ContextRouterService
 * - Flow trigger definitions in database
 * - Semantic detectors running in parallel
 *
 * AFTER: Single source of truth with unified scoring:
 * - All routing rules in intent_routing_rules table
 * - Priority-based rule evaluation (commands > overrides > keywords > translations)
 * - Confidence scoring for all routing decisions
 * - Semantic AI + database rules working together
 *
 * Architecture:
 * 1. Load routing rules from database (cached, refreshed every 60s)
 * 2. Evaluate rules in priority order (100 > 90 > 80 > 50)
 * 3. Combine with semantic AI detection (food/parcel)
 * 4. Return highest-confidence routing decision
 */

export interface RoutingRule {
  id: number;
  name: string;
  ruleType: string;
  priority: number;
  keywords: string[];
  regexPattern: string | null;
  caseSensitive: boolean;
  targetIntent: string | null;
  targetFlow: string | null;
  confidence: number;
  appliesToIntents: string[];
  requiresContext: any;
  isActive: boolean;
}

export interface RouteDecision {
  originalIntent: string;
  translatedIntent: string;
  flowId: string | null;
  overrideApplied: boolean;
  reason: string;
  priority: 'command' | 'keyword' | 'food_ai' | 'parcel_ai' | 'pattern' | 'translation' | 'fallback';
  confidence: number;
  matchedRules?: string[]; // List of rule names that matched
}

export interface RoutingContext {
  hasActiveFlow: boolean;
  activeFlowId?: string;
  isAuthenticated: boolean;
  channel: string;
}

@Injectable()
export class UnifiedIntentRouterService implements OnModuleInit {
  private readonly logger = new Logger(UnifiedIntentRouterService.name);

  // Cached routing rules by type
  private commandRules: RoutingRule[] = [];
  private keywordRules: RoutingRule[] = [];
  private patternRules: RoutingRule[] = [];
  private translationRules: RoutingRule[] = [];
  private allRules: RoutingRule[] = [];

  private lastCacheUpdate = 0;
  private readonly CACHE_TTL = 60_000; // 1 minute

  constructor(
    private readonly prisma: PrismaService,
    private readonly foodDetector: SemanticFoodDetectorService,
    private readonly parcelDetector: SemanticParcelDetectorService,
  ) {}

  async onModuleInit() {
    await this.refreshRoutingRules();
    this.logger.log(`✅ Loaded ${this.allRules.length} routing rules from database`);
    this.logger.log(`   - ${this.commandRules.length} command rules (priority 100)`);
    this.logger.log(`   - ${this.keywordRules.length} keyword rules (avg priority 80-90)`);
    this.logger.log(`   - ${this.patternRules.length} pattern rules (priority 75)`);
    this.logger.log(`   - ${this.translationRules.length} translation rules (priority 50)`);
    this.logger.log(`✅ AI-powered semantic detection enabled (food + parcel)`);
  }

  /**
   * Refresh routing rules from database
   */
  private async refreshRoutingRules(): Promise<void> {
    try {
      const rules = await this.prisma.intent_routing_rules.findMany({
        where: { isActive: true },
        orderBy: { priority: 'desc' },
      });

      this.allRules = rules as RoutingRule[];

      // Group by rule type for faster lookup
      this.commandRules = rules.filter(r => r.ruleType === 'command') as RoutingRule[];
      this.keywordRules = rules.filter(r => r.ruleType === 'keyword') as RoutingRule[];
      this.patternRules = rules.filter(r => r.ruleType === 'pattern') as RoutingRule[];
      this.translationRules = rules.filter(r => r.ruleType === 'translation') as RoutingRule[];

      this.lastCacheUpdate = Date.now();
    } catch (error) {
      this.logger.error(`Failed to refresh routing rules: ${error.message}`);
    }
  }

  /**
   * Main routing method - evaluates all rules and returns best match
   */
  async route(
    nluIntent: string,
    message: string,
    context: RoutingContext = { hasActiveFlow: false, isAuthenticated: false, channel: 'web' },
  ): Promise<RouteDecision> {
    // Refresh cache if stale
    if (Date.now() - this.lastCacheUpdate > this.CACHE_TTL) {
      await this.refreshRoutingRules();
    }

    const lowerText = message.toLowerCase().trim();
    const matchedRules: string[] = [];

    // ========================================
    // STEP 1: Command Rules (Priority 100)
    // ========================================
    for (const rule of this.commandRules) {
      if (this.matchesRule(rule, lowerText, nluIntent, context)) {
        matchedRules.push(rule.name);
        return {
          originalIntent: nluIntent,
          translatedIntent: rule.targetIntent || nluIntent,
          flowId: rule.targetFlow || null,
          overrideApplied: true,
          reason: `Command detected: ${rule.name}`,
          priority: 'command',
          confidence: rule.confidence,
          matchedRules,
        };
      }
    }

    // ========================================
    // STEP 2: AI-Powered Semantic Detection
    // ========================================
    // Check for food intent using AI (more accurate than keywords)
    const foodResult = await this.foodDetector.detectFoodIntent(message);
    if (foodResult.isFood && foodResult.confidence > 0.7) {
      this.logger.log(`🍔 AI food detection: ${foodResult.confidence.toFixed(2)} confidence`);
      matchedRules.push('ai_food_detector');

      // Only override if NLU intent could be food-related
      const FOOD_OVERRIDE_INTENTS = ['parcel_booking', 'manage_address', 'send', 'search', 'checkout', 'order', 'unknown'];
      if (FOOD_OVERRIDE_INTENTS.includes(nluIntent)) {
        return {
          originalIntent: nluIntent,
          translatedIntent: 'order_food',
          flowId: 'food_order_v1',
          overrideApplied: true,
          reason: `AI detected food intent (${foodResult.confidence.toFixed(2)} confidence)`,
          priority: 'food_ai',
          confidence: foodResult.confidence,
          matchedRules,
        };
      }
    }

    // Check for parcel intent using AI
    const parcelResult = await this.parcelDetector.detectParcelIntent(message);
    if (parcelResult.isParcel && parcelResult.confidence > 0.7) {
      this.logger.log(`📦 AI parcel detection: ${parcelResult.confidence.toFixed(2)} confidence`);
      matchedRules.push('ai_parcel_detector');

      return {
        originalIntent: nluIntent,
        translatedIntent: 'parcel_booking',
        flowId: 'parcel_delivery_v1',
        overrideApplied: true,
        reason: `AI detected parcel intent (${parcelResult.confidence.toFixed(2)} confidence)`,
        priority: 'parcel_ai',
        confidence: parcelResult.confidence,
        matchedRules,
      };
    }

    // ========================================
    // STEP 3: Keyword Override Rules (Priority 80-90)
    // ========================================
    for (const rule of this.keywordRules) {
      if (this.matchesRule(rule, lowerText, nluIntent, context)) {
        matchedRules.push(rule.name);

        // Check if this rule applies to current NLU intent
        if (rule.appliesToIntents.length > 0 && !rule.appliesToIntents.includes(nluIntent)) {
          continue; // Skip if rule doesn't apply to this intent
        }

        return {
          originalIntent: nluIntent,
          translatedIntent: rule.targetIntent || nluIntent,
          flowId: rule.targetFlow || null,
          overrideApplied: true,
          reason: `Keyword match: ${rule.name}`,
          priority: 'keyword',
          confidence: rule.confidence,
          matchedRules,
        };
      }
    }

    // ========================================
    // STEP 4: Pattern Rules (Priority 75)
    // ========================================
    for (const rule of this.patternRules) {
      if (this.matchesRule(rule, lowerText, nluIntent, context)) {
        matchedRules.push(rule.name);

        return {
          originalIntent: nluIntent,
          translatedIntent: rule.targetIntent || nluIntent,
          flowId: rule.targetFlow || null,
          overrideApplied: true,
          reason: `Pattern match: ${rule.name}`,
          priority: 'pattern',
          confidence: rule.confidence,
          matchedRules,
        };
      }
    }

    // ========================================
    // STEP 5: Intent Translation Rules (Priority 50)
    // ========================================
    let translatedIntent = nluIntent;
    for (const rule of this.translationRules) {
      if (rule.appliesToIntents.includes(nluIntent)) {
        // Check context requirements if specified
        if (rule.requiresContext) {
          const contextMet = this.checkContextRequirements(rule.requiresContext, context);
          if (!contextMet) continue;
        }

        translatedIntent = rule.targetIntent || nluIntent;
        matchedRules.push(rule.name);
        break;
      }
    }

    // ========================================
    // STEP 6: Database Flow Mapping
    // ========================================
    const flowId = await this.findFlowForIntent(translatedIntent);

    if (flowId) {
      return {
        originalIntent: nluIntent,
        translatedIntent,
        flowId,
        overrideApplied: translatedIntent !== nluIntent,
        reason: `DB-matched ${translatedIntent} → ${flowId}`,
        priority: 'translation',
        confidence: 0.9,
        matchedRules,
      };
    }

    // ========================================
    // STEP 7: No Match Fallback
    // ========================================
    return {
      originalIntent: nluIntent,
      translatedIntent,
      flowId: null,
      overrideApplied: false,
      reason: `No routing rule matched for intent: ${translatedIntent}`,
      priority: 'fallback',
      confidence: 0.3,
      matchedRules,
    };
  }

  /**
   * Check if a routing rule matches the current message
   */
  private matchesRule(
    rule: RoutingRule,
    lowerText: string,
    nluIntent: string,
    context: RoutingContext,
  ): boolean {
    // Check context requirements first
    if (rule.requiresContext && !this.checkContextRequirements(rule.requiresContext, context)) {
      return false;
    }

    // Keyword matching
    if (rule.keywords.length > 0) {
      const textToMatch = rule.caseSensitive ? lowerText : lowerText.toLowerCase();
      for (const keyword of rule.keywords) {
        const keywordToMatch = rule.caseSensitive ? keyword : keyword.toLowerCase();
        if (textToMatch.includes(keywordToMatch)) {
          return true;
        }
      }
    }

    // Regex pattern matching
    if (rule.regexPattern) {
      try {
        const flags = rule.caseSensitive ? '' : 'i';
        const regex = new RegExp(rule.regexPattern, flags);
        if (regex.test(lowerText)) {
          return true;
        }
      } catch (error) {
        this.logger.error(`Invalid regex in rule ${rule.name}: ${rule.regexPattern}`);
      }
    }

    return false;
  }

  /**
   * Check if context requirements are met
   */
  private checkContextRequirements(requirements: any, context: RoutingContext): boolean {
    if (!requirements) return true;

    // Example: { "hasActiveFlow": false }
    if (requirements.hasActiveFlow !== undefined && requirements.hasActiveFlow !== context.hasActiveFlow) {
      return false;
    }

    if (requirements.isAuthenticated !== undefined && requirements.isAuthenticated !== context.isAuthenticated) {
      return false;
    }

    if (requirements.channel && requirements.channel !== context.channel) {
      return false;
    }

    return true;
  }

  /**
   * Find flow ID for intent from database (uses existing flow_definitions table)
   */
  private async findFlowForIntent(intent: string): Promise<string | null> {
    try {
      const flow = await this.prisma.$queryRaw<Array<{ name: string }>>`
        SELECT name
        FROM flow_definitions
        WHERE is_active = true
          AND $1 = ANY(trigger_intents)
        ORDER BY priority DESC
        LIMIT 1
      ` as any;

      return flow.length > 0 ? flow[0].name : null;
    } catch (error) {
      this.logger.error(`Error finding flow for intent ${intent}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get routing statistics for monitoring/debugging
   */
  async getRoutingStats(): Promise<{
    totalRules: number;
    rulesByType: Record<string, number>;
    avgConfidence: number;
    lastCacheUpdate: number;
  }> {
    return {
      totalRules: this.allRules.length,
      rulesByType: {
        command: this.commandRules.length,
        keyword: this.keywordRules.length,
        pattern: this.patternRules.length,
        translation: this.translationRules.length,
      },
      avgConfidence: this.allRules.reduce((sum, r) => sum + r.confidence, 0) / this.allRules.length || 0,
      lastCacheUpdate: this.lastCacheUpdate,
    };
  }
}
