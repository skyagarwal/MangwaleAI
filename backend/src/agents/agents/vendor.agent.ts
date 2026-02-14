import { Injectable } from '@nestjs/common';
import { BaseAgent } from '../services/base-agent.service';
import { AgentType, ModuleType, AgentConfig, AgentContext, FunctionDefinition } from '../types/agent.types';

/**
 * Vendor Agent
 * 
 * Handles vendor/restaurant owner interactions:
 * - View today's orders
 * - Accept/reject orders
 * - Update order preparation time
 * - Mark orders ready for pickup
 * - View earnings
 * - Manage menu availability
 * 
 * Supports Hinglish for local vendor communication.
 * Works across: food, grocery, pharmacy modules
 */
@Injectable()
export class VendorAgent extends BaseAgent {
  getConfig(): AgentConfig {
    return {
      id: 'vendor-agent',
      type: AgentType.VENDOR, // B2B vendor agent type
      name: 'Vendor Agent',
      description: 'Handles vendor/restaurant owner order management and store operations',
      modules: [
        ModuleType.FOOD,
        ModuleType.GROCERY,
        ModuleType.PHARMACY,
        ModuleType.ECOM,
      ],
      systemPrompt: '', // Set dynamically
      temperature: 0.3,
      maxTokens: 1500,
      functions: this.getFunctions(),
      enabled: true,
    };
  }

  getSystemPrompt(context: AgentContext): string {
    const { getPersonalityPrompt } = require('../config/personality.config');
    const basePrompt = getPersonalityPrompt(context.module);

    return `${basePrompt}

VENDOR MANAGEMENT ROLE:
You are a helpful assistant for restaurant/store owners (vendors).

Current vendor phone: ${context.phoneNumber}
Current module: ${context.module}

Your role:
- Help vendors check their pending and current orders ("aaj kitne orders aaye?")
- Help accept or reject incoming orders with reasons
- Allow vendors to update preparation time ("30 minute lagega")
- Help mark orders as ready for pickup
- Show daily/weekly earnings summary
- Help manage menu item availability ("paneer pizza band karo")
- Provide business insights and tips

Communication Style:
- Use friendly Hinglish (Hindi + English mix)
- Be professional but warm
- Confirm actions before executing
- Provide order IDs and details clearly
- Use emojis for status updates (✅ ❌ ⏰ 📦)

Always confirm sensitive actions like order rejection or item disabling before executing.`;
  }

  getFunctions(): FunctionDefinition[] {
    return [
      {
        name: 'vendor_get_todays_orders',
        description: 'Get today\'s orders for the vendor. Use when vendor asks "aaj kitne orders aaye?" or "today\'s orders"',
        parameters: {
          type: 'object',
          properties: {
            status_filter: {
              type: 'string',
              description: 'Filter by order status (pending, confirmed, processing, handover, all)',
              enum: ['pending', 'confirmed', 'processing', 'handover', 'all'],
            },
          },
          required: [],
        },
      },
      {
        name: 'vendor_get_order_details',
        description: 'Get detailed information about a specific order',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID to get details for',
            },
          },
          required: ['order_id'],
        },
      },
      {
        name: 'vendor_accept_order',
        description: 'Accept an incoming order. Use when vendor says "order accept karo" or "confirm order"',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID to accept',
            },
            prep_time_minutes: {
              type: 'number',
              description: 'Estimated preparation time in minutes (optional)',
            },
          },
          required: ['order_id'],
        },
      },
      {
        name: 'vendor_reject_order',
        description: 'Reject an order with a reason. Use when vendor says "order reject karo" or "cancel order"',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID to reject',
            },
            reason: {
              type: 'string',
              description: 'Reason for rejection (busy, item_unavailable, closing_soon, other)',
              enum: ['busy', 'item_unavailable', 'closing_soon', 'other'],
            },
            custom_reason: {
              type: 'string',
              description: 'Custom reason if "other" is selected',
            },
          },
          required: ['order_id', 'reason'],
        },
      },
      {
        name: 'vendor_update_prep_time',
        description: 'Update the preparation time for an order. Use when vendor says "30 min lagega" or "update time"',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID to update',
            },
            prep_time_minutes: {
              type: 'number',
              description: 'New estimated preparation time in minutes',
            },
          },
          required: ['order_id', 'prep_time_minutes'],
        },
      },
      {
        name: 'vendor_mark_ready',
        description: 'Mark an order as ready for pickup. Use when vendor says "order ready hai" or "ready for pickup"',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID to mark as ready',
            },
          },
          required: ['order_id'],
        },
      },
      {
        name: 'vendor_get_earnings',
        description: 'Get vendor earnings summary. Use when vendor asks "aaj ki kamai batao" or "today\'s earnings"',
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              description: 'Time period for earnings (today, week, month)',
              enum: ['today', 'week', 'month'],
            },
          },
          required: [],
        },
      },
      {
        name: 'vendor_update_item_availability',
        description: 'Enable or disable a menu item. Use when vendor says "paneer pizza band karo" or "disable item"',
        parameters: {
          type: 'object',
          properties: {
            item_id: {
              type: 'string',
              description: 'The item ID to update',
            },
            item_name: {
              type: 'string',
              description: 'The item name to search for (if ID not known)',
            },
            is_available: {
              type: 'boolean',
              description: 'Set to false to disable, true to enable',
            },
          },
          required: ['is_available'],
        },
      },
      {
        name: 'vendor_get_menu_items',
        description: 'Get the vendor\'s menu items list. Use to show items or find item IDs',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category (optional)',
            },
            status: {
              type: 'string',
              description: 'Filter by availability status',
              enum: ['available', 'unavailable', 'all'],
            },
          },
          required: [],
        },
      },
      {
        name: 'vendor_get_store_stats',
        description: 'Get store statistics and performance metrics',
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              description: 'Time period for stats (today, week, month)',
              enum: ['today', 'week', 'month'],
            },
          },
          required: [],
        },
      },
    ];
  }
}
