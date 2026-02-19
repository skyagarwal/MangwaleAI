import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * ProgressiveProfileService - Smart, non-intrusive profile collection
 * 
 * Philosophy: Collect profile data naturally during conversations, not all at once
 * 
 * Strategies:
 * 1. POST-ORDER - Ask 1 quick question after successful order
 * 2. CONTEXTUAL - Learn from user choices (veg items = vegetarian)
 * 3. PERIODIC - Ask 1 question if profile is incomplete and user is engaged
 * 4. REWARD-BASED - Offer small rewards for answering profile questions
 */

export interface ProfileQuestion {
  id: string;
  category: string;
  question: string;
  options: { label: string; value: string }[];
  priority: number; // 1 = most important
  context?: string; // When to ask (e.g., 'post_order', 'food_related')
}

export interface ProfileStatus {
  completeness: number; // 0-100
  missingFields: string[];
  nextQuestion: ProfileQuestion | null;
  canAskNow: boolean;
  lastAskedAt: Date | null;
}

@Injectable()
export class ProgressiveProfileService {
  private readonly logger = new Logger(ProgressiveProfileService.name);
  
  // Minimum hours between profile questions to avoid annoyance
  private readonly MIN_HOURS_BETWEEN_QUESTIONS = 24;
  
  // Don't ask profile questions if user has answered X questions in last Y days
  private readonly MAX_QUESTIONS_PER_WEEK = 3;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Profile questions - ordered by importance & non-intrusiveness
   */
  private getProfileQuestions(): ProfileQuestion[] {
    return [
      // TIER 1: Essential for personalization (high value, low friction)
      {
        id: 'dietary_type',
        category: 'food_preference',
        question: 'Quick question - are you vegetarian? 🥗',
        options: [
          { label: '🥗 Vegetarian', value: 'vegetarian' },
          { label: '🍗 Non-Vegetarian', value: 'non-vegetarian' },
          { label: '🥚 Eggetarian', value: 'eggetarian' },
          { label: '🌱 Vegan', value: 'vegan' },
        ],
        priority: 1,
        context: 'post_food_order',
      },
      {
        id: 'spice_level',
        category: 'food_preference',
        question: 'How spicy do you like your food? 🌶️',
        options: [
          { label: '😊 Mild', value: 'mild' },
          { label: '🔥 Medium', value: 'medium' },
          { label: '🔥🔥 Spicy', value: 'spicy' },
          { label: '🔥🔥🔥 Extra Hot', value: 'extra_hot' },
        ],
        priority: 2,
        context: 'post_food_order',
      },
      
      // TIER 2: Helpful for recommendations
      {
        id: 'cuisine_preference',
        category: 'food_preference',
        question: 'What\'s your favorite cuisine? 🍽️',
        options: [
          { label: '🍛 Indian', value: 'indian' },
          { label: '🍜 Chinese', value: 'chinese' },
          { label: '🍕 Italian/Pizza', value: 'italian' },
          { label: '🍔 Fast Food', value: 'fast_food' },
          { label: '🌯 Street Food', value: 'street_food' },
        ],
        priority: 3,
        context: 'post_food_order',
      },
      {
        id: 'price_preference',
        category: 'shopping_preference',
        question: 'What\'s your typical budget for food orders? 💰',
        options: [
          { label: '₹50-150 Budget', value: 'budget' },
          { label: '₹150-300 Moderate', value: 'moderate' },
          { label: '₹300+ Premium', value: 'premium' },
        ],
        priority: 4,
        context: 'general',
      },
      
      // TIER 3: Nice to have
      {
        id: 'allergies',
        category: 'food_preference',
        question: 'Any food allergies I should know about? 🚫',
        options: [
          { label: '✅ None', value: 'none' },
          { label: '🥜 Peanuts', value: 'peanuts' },
          { label: '🥛 Dairy', value: 'dairy' },
          { label: '🌾 Gluten', value: 'gluten' },
          { label: '📝 Other (type it)', value: 'other' },
        ],
        priority: 5,
        context: 'post_food_order',
      },
      {
        id: 'meal_time_preference',
        category: 'lifestyle',
        question: 'When do you usually order food? ⏰',
        options: [
          { label: '🌅 Breakfast (6-11am)', value: 'breakfast' },
          { label: '☀️ Lunch (11am-3pm)', value: 'lunch' },
          { label: '🌆 Evening Snacks (3-6pm)', value: 'evening' },
          { label: '🌙 Dinner (6-10pm)', value: 'dinner' },
          { label: '🌃 Late Night (10pm+)', value: 'late_night' },
        ],
        priority: 6,
        context: 'general',
      },
      {
        id: 'family_size',
        category: 'lifestyle',
        question: 'Usually ordering for how many people? 👨‍👩‍👧‍👦',
        options: [
          { label: '1️⃣ Just me', value: '1' },
          { label: '2️⃣ 2 people', value: '2' },
          { label: '3️⃣ 3-4 people', value: '3-4' },
          { label: '👥 5+ people', value: '5+' },
        ],
        priority: 7,
        context: 'post_food_order',
      },
    ];
  }

  /**
   * Get profile status for a user
   */
  async getProfileStatus(userId: number): Promise<ProfileStatus> {
    try {
      const profile = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM user_profiles WHERE user_id = ${userId}
      `;

      const userProfile = profile[0] || {};
      const allQuestions = this.getProfileQuestions();
      
      // Determine what's missing
      const answeredFields = new Set<string>();
      if (userProfile.dietary_type) answeredFields.add('dietary_type');
      if (userProfile.favorite_cuisines && Object.keys(userProfile.favorite_cuisines).length > 0) {
        answeredFields.add('cuisine_preference');
      }
      if (userProfile.price_sensitivity) answeredFields.add('price_preference');
      if (userProfile.allergies && userProfile.allergies.length > 0) answeredFields.add('allergies');
      if (userProfile.preferred_meal_times) answeredFields.add('meal_time_preference');
      if (userProfile.personality_traits?.spice_level) answeredFields.add('spice_level');
      if (userProfile.personality_traits?.family_size) answeredFields.add('family_size');

      const missingFields = allQuestions
        .filter(q => !answeredFields.has(q.id))
        .map(q => q.id);

      const completeness = Math.round((answeredFields.size / allQuestions.length) * 100);

      // Check if we can ask now (rate limiting)
      const canAskNow = await this.canAskQuestion(userId);

      // Get next question (highest priority unanswered)
      const nextQuestion = allQuestions
        .filter(q => !answeredFields.has(q.id))
        .sort((a, b) => a.priority - b.priority)[0] || null;

      return {
        completeness,
        missingFields,
        nextQuestion,
        canAskNow,
        lastAskedAt: userProfile.last_profile_question_at || null,
      };
    } catch (error) {
      this.logger.error(`Failed to get profile status: ${error.message}`);
      return {
        completeness: 0,
        missingFields: [],
        nextQuestion: null,
        canAskNow: false,
        lastAskedAt: null,
      };
    }
  }

  /**
   * Check rate limiting - don't annoy users
   */
  private async canAskQuestion(userId: number): Promise<boolean> {
    try {
      // Check last question time
      const result = await this.prisma.$queryRaw<any[]>`
        SELECT last_profile_question_at, profile_questions_this_week 
        FROM user_profiles 
        WHERE user_id = ${userId}
      `;

      if (!result[0]) return true; // New user, can ask

      const lastAsked = result[0].last_profile_question_at;
      const questionsThisWeek = result[0].profile_questions_this_week || 0;

      // Check hourly limit
      if (lastAsked) {
        const hoursSinceLastQuestion = (Date.now() - new Date(lastAsked).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastQuestion < this.MIN_HOURS_BETWEEN_QUESTIONS) {
          return false;
        }
      }

      // Check weekly limit
      if (questionsThisWeek >= this.MAX_QUESTIONS_PER_WEEK) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn(`Rate limit check failed: ${error.message}`);
      return true; // Allow on error
    }
  }

  /**
   * Get contextual profile question based on what user just did
   */
  async getContextualQuestion(userId: number, context: string): Promise<ProfileQuestion | null> {
    const status = await this.getProfileStatus(userId);
    
    if (!status.canAskNow || status.completeness >= 80) {
      return null; // Don't ask if rate limited or profile mostly complete
    }

    const allQuestions = this.getProfileQuestions();
    
    // Find unanswered question matching context
    const contextualQuestion = allQuestions
      .filter(q => !status.missingFields.includes(q.id) === false) // is in missing
      .filter(q => q.context === context || q.context === 'general')
      .sort((a, b) => a.priority - b.priority)[0];

    return contextualQuestion || null;
  }

  /**
   * Save profile answer
   */
  async saveAnswer(userId: number, questionId: string, answer: string): Promise<void> {
    try {
      this.logger.log(`📝 Saving profile answer for user ${userId}: ${questionId} = ${answer}`);

      // Map question ID to database field
      const fieldMapping: Record<string, { field: string; isJsonb?: boolean; merge?: boolean }> = {
        'dietary_type': { field: 'dietary_type' },
        'spice_level': { field: 'personality_traits', isJsonb: true, merge: true },
        'cuisine_preference': { field: 'favorite_cuisines', isJsonb: true },
        'price_preference': { field: 'price_sensitivity' },
        'allergies': { field: 'allergies' },
        'meal_time_preference': { field: 'preferred_meal_times', isJsonb: true },
        'family_size': { field: 'personality_traits', isJsonb: true, merge: true },
      };

      const mapping = fieldMapping[questionId];
      if (!mapping) {
        this.logger.warn(`Unknown question ID: ${questionId}`);
        return;
      }

      // Validate field name to prevent SQL injection
      const allowedFields = ['dietary_type', 'personality_traits', 'favorite_cuisines', 'price_sensitivity', 'allergies', 'preferred_meal_times'];
      if (!allowedFields.includes(mapping.field)) {
        this.logger.error(`Invalid field name: ${mapping.field}`);
        return;
      }

      // Use Prisma.raw() for whitelisted column name (validated above)
      const col = Prisma.raw(mapping.field);

      if (mapping.merge && mapping.isJsonb) {
        // Merge into JSONB field (e.g. personality_traits)
        const jsonValue = JSON.stringify({ [questionId]: answer });
        await this.prisma.$executeRaw`
          INSERT INTO user_profiles (user_id, ${col}, last_profile_question_at, profile_questions_this_week, updated_at)
           VALUES (${userId}, ${jsonValue}::jsonb, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)
           ON CONFLICT (user_id) DO UPDATE SET
             ${col} = COALESCE(user_profiles.${col}, '{}'::jsonb) || ${jsonValue}::jsonb,
             last_profile_question_at = CURRENT_TIMESTAMP,
             profile_questions_this_week = COALESCE(user_profiles.profile_questions_this_week, 0) + 1,
             profile_completeness = LEAST(100, COALESCE(user_profiles.profile_completeness, 0) + 10),
             updated_at = CURRENT_TIMESTAMP`;
      } else if (mapping.isJsonb) {
        // Set JSONB field
        const jsonValue = JSON.stringify({ [answer]: 1 });
        await this.prisma.$executeRaw`
          UPDATE user_profiles SET
             ${col} = ${jsonValue}::jsonb,
             last_profile_question_at = CURRENT_TIMESTAMP,
             profile_questions_this_week = COALESCE(profile_questions_this_week, 0) + 1,
             profile_completeness = LEAST(100, COALESCE(profile_completeness, 0) + 10),
             updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ${userId}`;
      } else if (mapping.field === 'allergies') {
        // Array field
        const arrayValue = answer === 'none' ? '{}' : `{${answer}}`;
        await this.prisma.$executeRaw`
          UPDATE user_profiles SET
             allergies = ${arrayValue}::text[],
             last_profile_question_at = CURRENT_TIMESTAMP,
             profile_questions_this_week = COALESCE(profile_questions_this_week, 0) + 1,
             profile_completeness = LEAST(100, COALESCE(profile_completeness, 0) + 10),
             updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ${userId}`;
      } else {
        // Simple text field
        await this.prisma.$executeRaw`
          UPDATE user_profiles SET
             ${col} = ${answer},
             last_profile_question_at = CURRENT_TIMESTAMP,
             profile_questions_this_week = COALESCE(profile_questions_this_week, 0) + 1,
             profile_completeness = LEAST(100, COALESCE(profile_completeness, 0) + 10),
             updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ${userId}`;
      }

      this.logger.log(`✅ Profile updated for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to save profile answer: ${error.message}`);
    }
  }

  /**
   * Learn from user behavior (implicit profiling)
   */
  async learnFromOrder(userId: number, orderDetails: {
    items: Array<{ name: string; isVeg: boolean; category: string; price: number }>;
    totalAmount: number;
    orderTime: Date;
  }): Promise<void> {
    try {
      const { items, totalAmount, orderTime } = orderDetails;

      // Detect dietary preference from items
      const vegCount = items.filter(i => i.isVeg).length;
      const nonVegCount = items.filter(i => !i.isVeg).length;
      
      let detectedDiet: string | null = null;
      if (nonVegCount === 0 && vegCount > 0) {
        detectedDiet = 'vegetarian';
      } else if (nonVegCount > 0) {
        detectedDiet = 'non-vegetarian';
      }

      // Detect price sensitivity
      const avgItemPrice = totalAmount / items.length;
      let priceSensitivity = 'moderate';
      if (avgItemPrice < 100) priceSensitivity = 'budget';
      else if (avgItemPrice > 300) priceSensitivity = 'premium';

      // Detect meal time
      const hour = orderTime.getHours();
      let mealTime = 'dinner';
      if (hour >= 6 && hour < 11) mealTime = 'breakfast';
      else if (hour >= 11 && hour < 15) mealTime = 'lunch';
      else if (hour >= 15 && hour < 18) mealTime = 'evening';
      else if (hour >= 22 || hour < 6) mealTime = 'late_night';

      // Update profile with learned data (only if not already set explicitly)
      await this.prisma.$executeRaw`
        UPDATE user_profiles SET
          dietary_type = COALESCE(dietary_type, ${detectedDiet}),
          price_sensitivity = COALESCE(price_sensitivity, ${priceSensitivity}),
          preferred_meal_times = COALESCE(preferred_meal_times, '{}'::jsonb) || ${JSON.stringify({ [mealTime]: 1 })}::jsonb,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId}
      `;

      this.logger.log(`📊 Learned from order: diet=${detectedDiet}, price=${priceSensitivity}, meal=${mealTime}`);
    } catch (error) {
      this.logger.error(`Failed to learn from order: ${error.message}`);
    }
  }

  /**
   * Format profile question for chat display
   */
  formatQuestionForChat(question: ProfileQuestion): {
    message: string;
    buttons: Array<{ label: string; value: string }>;
  } {
    return {
      message: `${question.question}\n\n_This helps me recommend better options for you!_`,
      buttons: question.options.map(o => ({
        label: o.label,
        value: `profile_answer:${question.id}:${o.value}`,
      })),
    };
  }

  /**
   * Reset weekly question counter (call via cron)
   */
  async resetWeeklyCounters(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE user_profiles SET profile_questions_this_week = 0
      `;
      this.logger.log('✅ Reset weekly profile question counters');
    } catch (error) {
      this.logger.error(`Failed to reset counters: ${error.message}`);
    }
  }
}
