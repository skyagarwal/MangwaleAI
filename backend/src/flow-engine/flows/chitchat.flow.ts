/**
 * Chitchat Flow - Casual Conversation
 * 
 * This flow handles casual conversation and social pleasantries.
 * IMPORTANT: This is a "fire and forget" flow - it responds ONCE and clears itself
 * so that subsequent messages are properly routed to other flows.
 * 
 * ✨ Uses LLM for natural, contextual responses
 */

import { FlowDefinition } from '../types/flow.types';

export const chitchatFlow: FlowDefinition = {
  id: 'chitchat_v1',
  name: 'Chitchat Flow',
  description: 'Handles casual conversation - responds once and clears to allow other intents',
  version: '1.1.0',  // Version bump - now properly clears after response
  // Reduced trigger patterns - let NLU handle most detection
  trigger: 'chitchat|how are you|kaise ho|kaise hai|chotu',
  module: 'general',
  enabled: true,
  initialState: 'respond_friendly',
  finalStates: ['completed'],

  states: {
    // State 1: Respond to chitchat and IMMEDIATELY complete
    respond_friendly: {
      type: 'action',
      description: 'Respond in a friendly manner, then clear flow',
      actions: [
        {
          id: 'chitchat_response',
          executor: 'llm',
          config: {
            systemPrompt: `You are Chotu (चोटू), Mangwale's friendly AI assistant in Nashik.

MY IDENTITY:
- Name: Chotu / चोटू (pronounced "Cho-too")
- Role: AI Assistant for Mangwale super app
- Location: Based in Nashik, Maharashtra
- Purpose: Help users with orders, deliveries, and local services

WHEN ASKED ABOUT MY NAME OR IDENTITY:
- "What's your name?" → "I'm Chotu! 😊 Main Mangwale ka AI assistant hu."
- "Who are you?" → "I'm Chotu, your friendly AI helper on Mangwale!"
- "Tumhara naam kya hai?" → "Mera naam Chotu hai! 😊"
- Always be warm and friendly when introducing yourself

PERSONALITY:
- Friendly, helpful, warm and approachable
- Like a helpful local friend who knows the city
- Enthusiastic about helping with anything

IMPORTANT: Mangwale is a SUPER APP - not just food! We offer:
- Food delivery 🍔
- Parcel/courier service 📦
- Online shopping 🛒
- Local services 🔧

RULES:
1. Reply in 1-2 sentences max (unless introducing yourself)
2. Acknowledge politely
3. MATCH THE USER'S LANGUAGE:
   - If user writes in English → Reply in English: "How can I help you today?"
   - If user writes in Hindi → Reply in Hindi: "Kya help chahiye?"
   - If user writes in Hinglish → Reply in Hinglish: "Aur batao, kya help karu?"
4. Never assume user wants food unless they mention it
5. DO NOT ask follow-up questions about the chitchat topic itself`,
            prompt: `User said: {{message}}

{{#if festival.isToday}}
🎉 Today is {{festival.nameHindi}}! Include a warm festival greeting.
{{/if}}

Respond briefly (1-2 sentences). End with asking how you can help.`,
            temperature: 0.6,
            maxTokens: 100,  // Reduced - keep it short
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'completed',  // Immediately go to completed
      },
    },

    // Final state - CLEARS THE FLOW
    completed: {
      type: 'end',
      description: 'Chitchat done - flow is cleared for next intent',
      transitions: {},
      metadata: {
        completionType: 'clear_and_ready',  // Signal to clear activeFlow
        clearActiveFlow: true,  // Explicitly clear so other intents work
        nextFlowSelection: 'auto',
      },
    },
  },

  metadata: {
    author: 'Mangwale AI Team',
    createdAt: '2025-11-19',
    updatedAt: '2025-12-30',
    tags: ['chitchat', 'casual', 'fire-and-forget'],
    priority: 50,  // Lowered priority so other intents take precedence
  },
};
