import { Injectable } from '@nestjs/common';
import { BaseAgent } from '../services/base-agent.service';
import { AgentType, ModuleType, AgentConfig, AgentContext, FunctionDefinition } from '../types/agent.types';

/**
 * Rider Agent (Delivery Partner Agent)
 * 
 * Handles delivery partner interactions:
 * - View assigned orders
 * - Accept/reject delivery requests
 * - Update delivery status (pickup, on-the-way, delivered)
 * - Report delays
 * - Confirm delivery with OTP
 * - View earnings
 * - Go online/offline
 * 
 * Supports Hinglish for local delivery partner communication.
 * Works across all delivery modules.
 */
@Injectable()
export class RiderAgent extends BaseAgent {
  getConfig(): AgentConfig {
    return {
      id: 'rider-agent',
      type: AgentType.RIDER, // Delivery partner agent type
      name: 'Rider Agent',
      description: 'Handles delivery partner order management and delivery operations',
      modules: [
        ModuleType.FOOD,
        ModuleType.GROCERY,
        ModuleType.PHARMACY,
        ModuleType.ECOM,
        ModuleType.PARCEL,
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

DELIVERY PARTNER ROLE:
You are a helpful assistant for delivery partners (riders/drivers).

Current rider phone: ${context.phoneNumber}
Current module: ${context.module}

Your role:
- Help riders view their assigned/pending orders ("mere orders dikhao")
- Help accept or reject delivery requests with reasons
- Track and update delivery status (pickup, on-the-way, delivered)
- Help report delays and estimated times ("10 min late hounga")
- Process delivery confirmation with OTP
- Show daily earnings and trip history ("aaj ki kamai batao")
- Help riders go online/offline ("offline karo")
- Provide navigation and delivery tips

Communication Style:
- Use friendly Hinglish (Hindi + English mix)
- Be efficient and clear - riders are on the move!
- Provide addresses and contact details prominently
- Use emojis for status (🏍️ 📦 ✅ ⏰ 📍)
- Keep responses short and actionable

Always prioritize safety - remind riders about traffic rules when relevant.`;
  }

  getFunctions(): FunctionDefinition[] {
    return [
      {
        name: 'rider_get_assigned_orders',
        description: 'Get current assigned orders for the delivery partner. Use when rider asks "mere orders dikhao" or "pending deliveries"',
        parameters: {
          type: 'object',
          properties: {
            status_filter: {
              type: 'string',
              description: 'Filter by status (assigned, picked_up, on_way, all)',
              enum: ['assigned', 'picked_up', 'on_way', 'all'],
            },
          },
          required: [],
        },
      },
      {
        name: 'rider_get_order_details',
        description: 'Get detailed information about a specific order including pickup and delivery addresses',
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
        name: 'rider_accept_delivery',
        description: 'Accept a delivery request. Use when rider says "accept karo" or "delivery lelo"',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID to accept',
            },
          },
          required: ['order_id'],
        },
      },
      {
        name: 'rider_reject_delivery',
        description: 'Reject a delivery request with reason. Use when rider says "reject karo" or "ye nahi karunga"',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID to reject',
            },
            reason: {
              type: 'string',
              description: 'Reason for rejection',
              enum: ['too_far', 'traffic', 'vehicle_issue', 'personal', 'other'],
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
        name: 'rider_update_status',
        description: 'Update delivery status. Use when rider says "pickup ho gaya" or "on the way"',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID to update',
            },
            status: {
              type: 'string',
              description: 'New delivery status',
              enum: ['picked_up', 'on_way', 'reached', 'delivered'],
            },
          },
          required: ['order_id', 'status'],
        },
      },
      {
        name: 'rider_report_delay',
        description: 'Report expected delay for a delivery. Use when rider says "10 min late hounga" or "delay hoga"',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID',
            },
            delay_minutes: {
              type: 'number',
              description: 'Expected delay in minutes',
            },
            reason: {
              type: 'string',
              description: 'Reason for delay',
              enum: ['traffic', 'weather', 'restaurant_delay', 'wrong_address', 'other'],
            },
          },
          required: ['order_id', 'delay_minutes'],
        },
      },
      {
        name: 'rider_confirm_delivery',
        description: 'Confirm delivery completion with OTP. Use when rider says "delivery complete" or provides OTP',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID to confirm',
            },
            otp: {
              type: 'string',
              description: 'The OTP provided by customer for delivery confirmation',
            },
          },
          required: ['order_id', 'otp'],
        },
      },
      {
        name: 'rider_get_earnings',
        description: 'Get rider earnings summary. Use when rider asks "aaj ki kamai" or "earnings dikhao"',
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
        name: 'rider_get_trip_history',
        description: 'Get delivery trip history. Use when rider asks "aaj ki trips" or "delivery history"',
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              description: 'Time period (today, week)',
              enum: ['today', 'week'],
            },
            limit: {
              type: 'number',
              description: 'Number of trips to fetch (default 10)',
            },
          },
          required: [],
        },
      },
      {
        name: 'rider_go_online',
        description: 'Set rider status to online/available. Use when rider says "online karo" or "start duty"',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'rider_go_offline',
        description: 'Set rider status to offline/unavailable. Use when rider says "offline karo" or "end duty"',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'rider_update_location',
        description: 'Update rider\'s current location for tracking',
        parameters: {
          type: 'object',
          properties: {
            latitude: {
              type: 'number',
              description: 'Current latitude',
            },
            longitude: {
              type: 'number',
              description: 'Current longitude',
            },
          },
          required: ['latitude', 'longitude'],
        },
      },
      {
        name: 'rider_get_navigation',
        description: 'Get navigation help to pickup or delivery location',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The order ID',
            },
            destination_type: {
              type: 'string',
              description: 'Navigate to pickup or delivery location',
              enum: ['pickup', 'delivery'],
            },
          },
          required: ['order_id', 'destination_type'],
        },
      },
    ];
  }
}
