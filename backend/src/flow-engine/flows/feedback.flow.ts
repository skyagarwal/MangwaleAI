/**
 * Feedback Flow - User Satisfaction Collection
 * 
 * This flow collects user feedback and satisfaction ratings.
 * Critical for NLU data collection and service improvement.
 */

import { FlowDefinition } from '../types/flow.types';

export const feedbackFlow: FlowDefinition = {
  id: 'feedback_v1',
  name: 'Feedback Flow',
  description: 'Collects user feedback and satisfaction ratings',
  version: '1.0.0',
  // CLEANED UP: Removed complaint/problem/issue - those should go to support flow
  trigger: 'feedback|suggestion|rate app|review app|give feedback|dena feedback',
  module: 'general',
  enabled: true,
  initialState: 'ask_rating',
  finalStates: ['completed'],

  states: {
    // State 1: Ask for rating
    ask_rating: {
      type: 'wait',
      description: 'Ask user to rate their experience',
      onEntry: [
        {
          id: 'rating_prompt',
          executor: 'response',
          config: {
            message: "⭐ **How was your experience?**\n\nTap a star to rate:",
            buttons: [
              { id: 'rate_1', label: '⭐ 1 — Poor', value: 'rating_1' },
              { id: 'rate_2', label: '⭐⭐ 2 — Fair', value: 'rating_2' },
              { id: 'rate_3', label: '⭐⭐⭐ 3 — Good', value: 'rating_3' },
              { id: 'rate_4', label: '⭐⭐⭐⭐ 4 — Great', value: 'rating_4' },
              { id: 'rate_5', label: '⭐⭐⭐⭐⭐ 5 — Excellent!', value: 'rating_5' },
            ]
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'ask_comment',
        default: 'ask_comment',
      },
      metadata: {
        collectInput: true,
        captureAs: 'rating',
      },
    },

    // State 2: Ask for detailed comment
    ask_comment: {
      type: 'wait',
      description: 'Collect detailed feedback comment',
      actions: [
        {
          id: 'comment_prompt',
          executor: 'response',
          config: {
            message: "Thank you! 🙏\n\nAny specific comments or suggestions?\n\n[BUTTON:Skip:skip]",
            buttons: [
              { id: 'skip_comment', label: 'Skip', value: 'skip' }
            ]
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'thank_you',
        default: 'thank_you',
      },
      metadata: {
        collectInput: true,
        captureAs: 'comment',
        optional: true,
      },
    },

    // State 3: Thank user and complete
    thank_you: {
      type: 'action',
      description: 'Thank user for feedback',
      actions: [
        {
          id: 'gratitude_message',
          executor: 'response',
          config: {
            message: "Thank you so much for your feedback! 🌟\n\nYour input helps us improve our service. We truly appreciate you taking the time!\n\nIs there anything else I can help you with today?",
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'completed',
      },
    },

    // Final state
    completed: {
      type: 'end',
      description: 'Feedback completed',
      transitions: {},
      metadata: {
        completionType: 'feedback_collected',
        nextFlowSelection: 'auto',
      },
    },
  },

  contextSchema: {
    rating: {
      type: 'string',
      description: 'User rating (1-4)',
      required: true,
    },
    comment: {
      type: 'string',
      description: 'User feedback comment',
      required: false,
    },
  },

  metadata: {
    author: 'Mangwale AI Team',
    createdAt: '2025-11-19',
    tags: ['feedback', 'rating', 'satisfaction', 'nlu-data'],
    priority: 70,
    dataCollection: true,
  },
};
