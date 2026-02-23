/**
 * Campaign Action Flow - End-to-End Ad Campaign Pipeline
 *
 * Trend detected → generate creative (copy + image) → preview → review → approve → publish
 * Used by the mOS Action Engine for automated campaign creation.
 */

import { FlowDefinition } from '../types/flow.types';

export const campaignActionFlow: FlowDefinition = {
  id: 'campaign_action_v1',
  name: 'Campaign Action Pipeline',
  description:
    'End-to-end: trend → generate creative → review → approve → publish ad',
  module: 'general',
  trigger: 'campaign_action',
  version: '1.0.0',
  enabled: true,
  initialState: 'start',
  finalStates: ['completed', 'cancelled'],

  states: {
    // State 1: Initialize campaign context
    start: {
      type: 'action',
      description: 'Initialize campaign context and confirm start',
      actions: [
        {
          id: 'init_campaign',
          executor: 'response',
          config: {
            message:
              'Starting campaign creation for: {{campaign_name}}',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        success: 'generate_copy',
      },
    },

    // State 2: LLM generates ad headline + body
    generate_copy: {
      type: 'action',
      description: 'Generate ad copy (headline + body) using asset generation',
      actions: [
        {
          id: 'gen_copy',
          executor: 'asset_generation',
          config: {
            action: 'generate_copy',
            product: '{{product_name}}',
            tone: '{{tone}}',
            platform: '{{platform}}',
          },
          output: 'ad_copy',
          onError: 'fail',
        },
      ],
      transitions: {
        success: 'generate_image',
        error: 'generation_failed',
      },
    },

    // State 3: Generate ad image
    generate_image: {
      type: 'action',
      description: 'Generate ad creative image via asset generation',
      actions: [
        {
          id: 'gen_image',
          executor: 'asset_generation',
          config: {
            action: 'generate_image',
            prompt:
              'Create a food delivery ad image for {{product_name}}. Style: vibrant, appetizing, Indian food theme.',
          },
          output: 'generated_image',
          onError: 'fail',
        },
      ],
      transitions: {
        success: 'show_preview',
        error: 'generation_failed',
      },
    },

    // State 4: Display generated creative for review
    show_preview: {
      type: 'action',
      description: 'Show campaign preview with generated copy and image',
      actions: [
        {
          id: 'preview_message',
          executor: 'response',
          config: {
            message:
              'Campaign Preview:\nHeadline: {{ad_copy.headline}}\nBody: {{ad_copy.body}}\nImage: {{generated_image.url}}',
            buttons: [
              { id: 'btn_approve', label: 'Approve', value: 'approve' },
              { id: 'btn_regen', label: 'Regenerate', value: 'regenerate' },
              { id: 'btn_cancel', label: 'Cancel', value: 'cancel' },
            ],
          },
          output: '_last_response',
        },
      ],
      transitions: {
        success: 'wait_review',
      },
    },

    // State 5: Wait for admin input on the preview
    wait_review: {
      type: 'wait',
      description: 'Wait for admin to approve, regenerate, or cancel',
      validator: {
        type: 'keyword',
        validKeywords: ['approve', 'regenerate', 'cancel'],
        errorMessage: 'Please choose: Approve, Regenerate, or Cancel',
      },
      actions: [],
      transitions: {
        approve: 'create_ad_draft',
        regenerate: 'generate_copy',
        cancel: 'cancelled',
      },
    },

    // State 6: Create the ad execution record / draft
    create_ad_draft: {
      type: 'action',
      description: 'Create ad draft record for the campaign',
      actions: [
        {
          id: 'draft_ad',
          executor: 'ad_execution',
          config: {
            action: 'create_draft',
            platform: '{{platform}}',
            headline: '{{ad_copy.headline}}',
            bodyText: '{{ad_copy.body}}',
            assetUrl: '{{generated_image.url}}',
            budget: '{{budget}}',
          },
          output: 'ad_draft',
        },
      ],
      transitions: {
        success: 'submit_for_approval',
      },
    },

    // State 7: Create approval request
    submit_for_approval: {
      type: 'action',
      description: 'Submit campaign for admin approval',
      actions: [
        {
          id: 'approval_req',
          executor: 'approval_gate',
          config: {
            action: 'create_request',
            type: 'ad_campaign',
            title: 'New {{platform}} campaign: {{campaign_name}}',
            payload: {
              campaignName: '{{campaign_name}}',
              platform: '{{platform}}',
              headline: '{{ad_copy.headline}}',
              body: '{{ad_copy.body}}',
              imageUrl: '{{generated_image.url}}',
              budget: '{{budget}}',
              draftId: '{{ad_draft.id}}',
            },
          },
          output: 'approval_request',
        },
      ],
      transitions: {
        success: 'notify_admin',
      },
    },

    // State 8: WhatsApp notification to admin
    notify_admin: {
      type: 'action',
      description: 'Send WhatsApp notification to admin about pending approval',
      actions: [
        {
          id: 'wa_notify',
          executor: 'whatsapp_notify',
          config: {
            action: 'send_text',
            to: '{{admin_phone}}',
            message:
              'New campaign pending approval: {{campaign_name}}\nPlatform: {{platform}}\nBudget: Rs {{budget}}/day\nReview in mOS dashboard.',
          },
          output: 'notification_result',
          onError: 'continue',
        },
      ],
      transitions: {
        success: 'approval_confirmed',
      },
    },

    // State 9: Confirm approval has been submitted
    approval_confirmed: {
      type: 'action',
      description: 'Confirm that the campaign has been submitted for approval',
      actions: [
        {
          id: 'confirm_msg',
          executor: 'response',
          config: {
            message:
              "Campaign submitted for approval. You'll be notified when approved.",
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'completed',
      },
    },

    // State 10: Handle generation errors
    generation_failed: {
      type: 'action',
      description: 'Handle creative generation failure',
      actions: [
        {
          id: 'fail_msg',
          executor: 'response',
          config: {
            message: 'Failed to generate creative. Please try again.',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'completed',
      },
    },

    // State 11: Handle cancellation
    cancelled: {
      type: 'action',
      description: 'Handle campaign cancellation',
      actions: [
        {
          id: 'cancel_msg',
          executor: 'response',
          config: {
            message: 'Campaign creation cancelled.',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'completed',
      },
    },

    // State 12: Terminal state
    completed: {
      type: 'end',
      description: 'Campaign flow completed',
      transitions: {},
      metadata: {
        completionType: 'campaign_pipeline',
        nextFlowSelection: 'auto',
      },
    },
  },

  contextSchema: {
    campaign_name: {
      type: 'string',
      description: 'Name of the campaign',
      required: true,
    },
    product_name: {
      type: 'string',
      description: 'Product to advertise',
      required: true,
    },
    platform: {
      type: 'string',
      description: 'Ad platform (whatsapp, instagram, facebook)',
      required: true,
    },
    tone: {
      type: 'string',
      description: 'Tone of the ad copy (friendly, professional, urgent)',
      required: false,
    },
    budget: {
      type: 'number',
      description: 'Daily ad budget in INR',
      required: false,
    },
    admin_phone: {
      type: 'string',
      description: 'Admin phone number for notifications',
      required: false,
    },
  },

  metadata: {
    author: 'Mangwale AI Team',
    createdAt: '2026-02-22',
    tags: ['campaign', 'ads', 'creative', 'action-engine', 'mos'],
    priority: 50,
  },
};
