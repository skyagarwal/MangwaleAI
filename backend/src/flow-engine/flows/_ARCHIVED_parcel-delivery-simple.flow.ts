import { FlowDefinition } from '../types/flow.types';

/**
 * SIMPLIFIED PARCEL DELIVERY FLOW
 * 
 * Philosophy: Ask ONLY what PHP API requires, nothing extra
 * 
 * Required PHP Payload Fields:
 * 1. Pickup address (lat, lng, address string)
 * 2. Delivery address (lat, lng, address string)
 * 3. Recipient name
 * 4. Recipient phone
 * 5. Vehicle type (parcel_category_id)
 * 
 * Optional: distance (auto-calculated), payment_method (defaults to COD)
 * 
 * Total Questions: 5 (down from 8-12)
 * Lines of Code: ~400 (down from 1436)
 */

export const parcelDeliverySimpleFlow: FlowDefinition = {
  id: 'parcel_delivery_simple_v1',
  name: 'Coolie / Local Delivery - Simplified',
  description: 'Streamlined parcel booking: 5 questions → Order placed (Nashik only)',
  module: 'parcel',
  trigger: 'parcel_booking_simple',
  version: '2.0.0',
  
  contextSchema: {
    pickup_address: { type: 'object', required: true },
    delivery_address: { type: 'object', required: true },
    recipient_details: { type: 'object', required: true },
    distance: { type: 'number', required: true },
    pricing: { type: 'object', required: true },
    parcel_category_id: { type: 'number', required: true },
    order_result: { type: 'object', required: false },
  },
  
  states: {
    // Start: Check if user is authenticated
    check_trigger: {
      type: 'decision',
      description: 'Entry point - check initial context',
      conditions: [
        {
          expression: 'context._trigger === "parcel_booking_simple"',
          event: 'valid_trigger',
        },
      ],
      transitions: {
        valid_trigger: 'init',
        default: 'init',
      },
    },

    // Initialize - welcome message
    init: {
      type: 'action',
      description: 'Welcome and start parcel booking',
      actions: [
        {
          id: 'welcome',
          executor: 'response',
          config: {
            message: '📦 **Local Parcel Delivery** (Nashik only)\n\nI need 5 quick details to book your delivery. Let\'s start!',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'collect_pickup',
      },
    },

    // QUESTION 1: Get pickup address
    collect_pickup: {
      type: 'action',
      description: 'Collect pickup address',
      actions: [
        {
          id: 'get_pickup_address',
          executor: 'address',
          config: {
            field: 'pickup_address',
            prompt: '📍 **Question 1/5:** Where should we pick up?\n\n• Share your live location 📍\n• Type an address\n• Or select a saved address',
            offerSaved: true,
          },
          output: 'pickup_address',
          retryOnError: true,
          maxRetries: 3,
        },
      ],
      transitions: {
        address_valid: 'validate_pickup_zone',
        waiting_for_input: 'wait_for_pickup',
        user_cancelled: 'cancelled',
        error: 'pickup_error',
      },
    },

    wait_for_pickup: {
      type: 'wait',
      description: 'Wait for pickup address input',
      actions: [],
      transitions: {
        user_message: 'process_pickup_input',
      },
    },

    process_pickup_input: {
      type: 'action',
      description: 'Process pickup address from user input',
      actions: [
        {
          id: 'extract_pickup',
          executor: 'address',
          config: {
            field: 'pickup_address',
            input: '{{_user_message}}',
          },
          output: 'pickup_address',
        },
      ],
      transitions: {
        address_valid: 'validate_pickup_zone',
        waiting_for_input: 'collect_pickup',
        error: 'pickup_error',
      },
    },

    // Validate pickup is in Nashik
    validate_pickup_zone: {
      type: 'action',
      description: 'Verify pickup is in Nashik service area',
      actions: [
        {
          id: 'check_pickup_zone',
          executor: 'zone',
          config: {
            latPath: 'pickup_address.latitude',
            lngPath: 'pickup_address.longitude',
          },
          output: 'pickup_zone',
        },
      ],
      transitions: {
        zone_valid: 'collect_delivery',
        zone_invalid: 'pickup_out_of_zone',
      },
    },

    // QUESTION 2: Get delivery address
    collect_delivery: {
      type: 'action',
      description: 'Collect delivery address',
      actions: [
        {
          id: 'get_delivery_address',
          executor: 'address',
          config: {
            field: 'delivery_address',
            prompt: '✅ Pickup confirmed!\n\n📍 **Question 2/5:** Where to deliver?\n\n• Share location 📍\n• Type address\n• Or select saved address',
            offerSaved: true,
          },
          output: 'delivery_address',
          retryOnError: true,
          maxRetries: 3,
        },
      ],
      transitions: {
        address_valid: 'validate_delivery_zone',
        waiting_for_input: 'wait_for_delivery',
        user_cancelled: 'cancelled',
        error: 'delivery_error',
      },
    },

    wait_for_delivery: {
      type: 'wait',
      description: 'Wait for delivery address input',
      actions: [],
      transitions: {
        user_message: 'process_delivery_input',
      },
    },

    process_delivery_input: {
      type: 'action',
      description: 'Process delivery address from user input',
      actions: [
        {
          id: 'extract_delivery',
          executor: 'address',
          config: {
            field: 'delivery_address',
            input: '{{_user_message}}',
          },
          output: 'delivery_address',
        },
      ],
      transitions: {
        address_valid: 'validate_delivery_zone',
        waiting_for_input: 'collect_delivery',
        error: 'delivery_error',
      },
    },

    // Validate delivery is in Nashik
    validate_delivery_zone: {
      type: 'action',
      description: 'Verify delivery is in Nashik service area',
      actions: [
        {
          id: 'check_delivery_zone',
          executor: 'zone',
          config: {
            latPath: 'delivery_address.latitude',
            lngPath: 'delivery_address.longitude',
          },
          output: 'delivery_zone',
        },
      ],
      transitions: {
        zone_valid: 'check_auth_for_recipient',
        zone_invalid: 'delivery_out_of_zone',
      },
    },

    // Check if user is authenticated
    check_auth_for_recipient: {
      type: 'decision',
      description: 'Check if user is logged in',
      conditions: [
        {
          expression: 'context.phone && context.phone !== "unknown"',
          event: 'authenticated',
        },
      ],
      transitions: {
        authenticated: 'collect_recipient_auth',
        default: 'collect_recipient_guest',
      },
    },

    // QUESTION 3A: Recipient (authenticated users can use "Same as Sender")
    collect_recipient_auth: {
      type: 'wait',
      description: 'Collect recipient details - authenticated user',
      onEntry: [
        {
          id: 'ask_recipient_auth',
          executor: 'response',
          config: {
            message: '✅ Addresses confirmed!\n\n👤 **Question 3/5:** Who is the recipient?\n\nProvide name and phone:\nExample: "Rahul Kumar 9876543210"\n\nOr tap "Same as Me" to deliver to yourself:',
            buttons: [
              { label: '👤 Same as Me', value: 'same_as_sender', action: 'same_as_sender' },
              { label: '❌ Cancel', value: 'cancel', action: 'cancel' },
            ],
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'check_recipient_input',
        user_cancelled: 'cancelled',
      },
    },

    // QUESTION 3B: Recipient (guest users must provide details)
    collect_recipient_guest: {
      type: 'wait',
      description: 'Collect recipient details - guest user',
      onEntry: [
        {
          id: 'ask_recipient_guest',
          executor: 'response',
          config: {
            message: '✅ Addresses confirmed!\n\n👤 **Question 3/5:** Who is the recipient?\n\nProvide name and phone number:\nExample: "Rahul Kumar 9876543210"',
            buttons: [
              { label: '❌ Cancel', value: 'cancel', action: 'cancel' },
            ],
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'extract_recipient_details',
        user_cancelled: 'cancelled',
      },
    },

    // Check if user wants to use their own details
    check_recipient_input: {
      type: 'decision',
      description: 'Check if user selected "Same as Me"',
      conditions: [
        {
          expression: 'context._user_message?.toLowerCase().match(/^(same_as_sender|same|me|myself|mera|khud|mujhe)$/)',
          event: 'use_self',
        },
        {
          expression: 'context._user_message?.toLowerCase().match(/^(cancel|nahi|no|stop)$/)',
          event: 'cancelled',
        },
      ],
      transitions: {
        use_self: 'copy_sender_to_recipient',
        cancelled: 'cancelled',
        default: 'extract_recipient_details',
      },
    },

    // Copy sender details to recipient
    copy_sender_to_recipient: {
      type: 'action',
      description: 'Use sender as recipient',
      actions: [
        {
          id: 'copy_sender',
          executor: 'response',
          config: {
            message: '✅ Recipient set: You ({{user_name}} - {{phone}})',
            setContext: {
              'recipient_details.name': '{{user_name}}',
              'recipient_details.phone': '{{phone}}',
            },
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'fetch_categories',
      },
    },

    // Extract recipient name and phone
    extract_recipient_details: {
      type: 'action',
      description: 'Extract name and phone from user message',
      actions: [
        {
          id: 'extract_recipient',
          executor: 'llm',
          config: {
            systemPrompt: 'Extract recipient name and phone. Return JSON: {"name": "string", "phone": "string"}. If only one provided, set the other to null.',
            prompt: 'User message: "{{_user_message}}"\n\nExtract name and phone as JSON.',
            temperature: 0.1,
            maxTokens: 50,
            parseJson: true,
            skipHistory: true,
          },
          output: 'recipient_details',
        },
      ],
      transitions: {
        success: 'validate_recipient',
        error: 'collect_recipient_guest',
      },
    },

    // Validate recipient details
    validate_recipient: {
      type: 'decision',
      description: 'Check if both name and phone are present',
      conditions: [
        {
          expression: 'context.recipient_details?.name && context.recipient_details?.phone && context.recipient_details.phone.match(/^[0-9]{10,12}$/)',
          event: 'valid',
        },
      ],
      transitions: {
        valid: 'fetch_categories',
        default: 'ask_recipient_retry',
      },
    },

    // Ask for missing details
    ask_recipient_retry: {
      type: 'wait',
      description: 'Ask again for complete details',
      onEntry: [
        {
          id: 'ask_complete_details',
          executor: 'response',
          config: {
            message: '❓ I need both **name** and **phone number** (10 digits).\n\nExample: "Rahul Kumar 9876543210"',
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'extract_recipient_details',
      },
    },

    // QUESTION 4: Fetch and show vehicle categories
    fetch_categories: {
      type: 'action',
      description: 'Get available vehicles',
      actions: [
        {
          id: 'get_categories',
          executor: 'parcel',
          config: {
            action: 'get_categories',
            pickupAddressPath: 'pickup_address',
          },
          output: 'vehicle_categories',
        },
      ],
      transitions: {
        categories_fetched: 'show_categories',
        error: 'category_error',
      },
    },

    show_categories: {
      type: 'wait',
      description: 'Show vehicle options',
      onEntry: [
        {
          id: 'show_vehicles',
          executor: 'response',
          config: {
            message: '✅ Recipient confirmed!\n\n🚗 **Question 4/5:** Select vehicle type:',
            cardsPath: 'vehicle_categories',
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'handle_vehicle_selection',
      },
    },

    // Handle vehicle selection
    handle_vehicle_selection: {
      type: 'action',
      description: 'Process vehicle selection',
      actions: [
        {
          id: 'interpret_vehicle',
          executor: 'llm',
          config: {
            systemPrompt: 'Extract category ID from user input. Return ONLY the number.',
            prompt: 'User said: "{{_user_message}}"\nCategories: {{json vehicle_categories}}\n\nWhich category ID? Return only the number or "null" if unclear.',
            temperature: 0.1,
            maxTokens: 10,
            skipHistory: true,
          },
          output: 'selected_category_id_raw',
        },
        {
          id: 'save_vehicle',
          executor: 'response',
          config: {
            saveToContext: {
              'parcel_category_id': '{{selected_category_id_raw}}',
            },
          },
        },
      ],
      transitions: {
        success: 'validate_vehicle',
      },
    },

    validate_vehicle: {
      type: 'decision',
      description: 'Check if valid vehicle selected',
      conditions: [
        {
          expression: 'context.parcel_category_id && context.parcel_category_id !== "null"',
          event: 'valid',
        },
      ],
      transitions: {
        valid: 'calculate_distance',
        default: 'show_categories_retry',
      },
    },

    show_categories_retry: {
      type: 'wait',
      description: 'Ask again for vehicle selection',
      onEntry: [
        {
          id: 'retry_vehicles',
          executor: 'response',
          config: {
            message: '❓ Please select a vehicle from the list:',
            cardsPath: 'vehicle_categories',
          },
        },
      ],
      actions: [],
      transitions: {
        user_message: 'handle_vehicle_selection',
      },
    },

    // QUESTION 5: Calculate distance and show price
    calculate_distance: {
      type: 'action',
      description: 'Calculate delivery distance',
      actions: [
        {
          id: 'get_distance',
          executor: 'distance',
          config: {
            fromLatPath: 'pickup_address.latitude',
            fromLngPath: 'pickup_address.longitude',
            toLatPath: 'delivery_address.latitude',
            toLngPath: 'delivery_address.longitude',
          },
          output: 'distance',
          retryOnError: true,
          maxRetries: 2,
        },
      ],
      transitions: {
        calculated: 'calculate_pricing',
        error: 'distance_error',
      },
    },

    calculate_pricing: {
      type: 'action',
      description: 'Calculate delivery charges',
      actions: [
        {
          id: 'get_pricing',
          executor: 'parcel',
          config: {
            action: 'calculate_shipping',
            distancePath: 'distance',
            categoryPath: 'parcel_category_id',
          },
          output: 'pricing',
        },
      ],
      transitions: {
        shipping_calculated: 'show_summary',
        error: 'pricing_error',
      },
    },

    // Show order summary and confirm
    show_summary: {
      type: 'wait',
      description: 'Display summary and confirm',
      onEntry: [
        {
          id: 'summary',
          executor: 'response',
          config: {
            message: '📦 **Order Summary**\n\n📍 Pickup: {{pickup_address.address}}\n📍 Delivery: {{delivery_address.address}}\n👤 Recipient: {{recipient_details.name}} ({{recipient_details.phone}})\n📏 Distance: {{distance}} km\n\n💰 **Total: ₹{{pricing.total_charge}}**\n(Delivery: ₹{{pricing.delivery_charge}} + Fee: ₹{{pricing.platform_fee}})\n\n💳 Payment: Cash on Delivery\n\n**Question 5/5:** Confirm your order?',
            buttons: [
              { label: '✅ Confirm', value: 'yes', action: 'yes' },
              { label: '❌ Cancel', value: 'cancel', action: 'cancel' },
            ],
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'check_confirmation',
      },
    },

    check_confirmation: {
      type: 'decision',
      description: 'Check user confirmation',
      conditions: [
        {
          expression: 'context._user_message?.toLowerCase().match(/^(yes|confirm|ok|haan|ha|proceed|book)/)',
          event: 'confirmed',
        },
        {
          expression: 'context._user_message?.toLowerCase().match(/^(no|cancel|nahi|stop|exit)/)',
          event: 'cancelled',
        },
      ],
      transitions: {
        confirmed: 'check_auth_before_order',
        cancelled: 'cancelled',
        default: 'show_summary',
      },
    },

    // Check authentication before placing order
    check_auth_before_order: {
      type: 'decision',
      description: 'Verify user is logged in',
      conditions: [
        {
          // Expression context is the flow data object, so `auth_token` is available directly.
          expression: 'context.auth_token',
          event: 'authenticated',
        },
      ],
      transitions: {
        authenticated: 'place_order',
        default: 'require_login',
      },
    },

    require_login: {
      type: 'action',
      description: 'Request user to login',
      actions: [
        {
          id: 'login_prompt',
          executor: 'response',
          config: {
            message: '🔐 **Login Required**\n\nPlease login to place your order.\n\nTap below or type your phone number:',
            buttons: [
              { label: '📱 Login', value: 'login', action: 'trigger_auth_flow' },
              { label: '❌ Cancel', value: 'cancel', action: 'cancel' },
            ],
          },
          output: '_last_response',
        },
      ],
      transitions: {
        success: 'cancelled',  // Simplified: just cancel for now (auth flow integration in next phase)
        default: 'cancelled',
      },
    },

    // Place order via PHP API
    place_order: {
      type: 'action',
      description: 'Create order in backend',
      actions: [
        {
          id: 'create_order',
          executor: 'order',
          config: {
            type: 'parcel',
            pickupAddressPath: 'pickup_address',
            deliveryAddressPath: 'delivery_address',
            recipientPath: 'recipient_details',
            distancePath: 'distance',
            pricingPath: 'pricing',
            categoryPath: 'parcel_category_id',
          },
          output: 'order_result',
          retryOnError: true,
          maxRetries: 2,
        },
      ],
      transitions: {
        success: 'completed',
        error: 'order_failed',
      },
    },

    // Success!
    completed: {
      type: 'action',
      description: 'Order placed successfully',
      actions: [
        {
          id: 'success',
          executor: 'response',
          config: {
            message: '🎉 **Order Confirmed!**\n\n📦 Order ID: #{{order_result.orderId}}\n📍 From: {{pickup_address.address}}\n📍 To: {{delivery_address.address}}\n👤 Recipient: {{recipient_details.name}}\n💰 Total: ₹{{pricing.total_charge}}\n⏱️ ETA: 30-45 minutes\n\nYou\'ll receive WhatsApp updates. Track anytime!',
            buttons: [
              { label: '📍 Track Order', value: 'track', action: 'track_order' },
              { label: '🏠 Home', value: 'home', action: 'home' },
            ],
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'finish',
      },
    },

    finish: {
      type: 'end',
      description: 'Flow complete',
      actions: [],
      transitions: {},
    },

    // Error states
    pickup_error: {
      type: 'end',
      description: 'Pickup address error',
      actions: [
        {
          id: 'error',
          executor: 'response',
          config: {
            message: '❌ Could not understand pickup address. Please start again.',
          },
        },
      ],
      transitions: {},
    },

    delivery_error: {
      type: 'end',
      description: 'Delivery address error',
      actions: [
        {
          id: 'error',
          executor: 'response',
          config: {
            message: '❌ Could not understand delivery address. Please start again.',
          },
        },
      ],
      transitions: {},
    },

    pickup_out_of_zone: {
      type: 'end',
      description: 'Pickup outside Nashik',
      actions: [
        {
          id: 'zone_error',
          executor: 'response',
          config: {
            message: '❌ **Pickup location is outside Nashik.**\n\nWe currently deliver only within Nashik city. We\'ll notify you when we expand!',
          },
        },
      ],
      transitions: {},
    },

    delivery_out_of_zone: {
      type: 'end',
      description: 'Delivery outside Nashik',
      actions: [
        {
          id: 'zone_error',
          executor: 'response',
          config: {
            message: '❌ **Delivery location is outside Nashik.**\n\nWe currently deliver only within Nashik city. We\'ll notify you when we expand!',
          },
        },
      ],
      transitions: {},
    },

    distance_error: {
      type: 'end',
      description: 'Distance calculation failed',
      actions: [
        {
          id: 'error',
          executor: 'response',
          config: {
            message: '❌ Could not calculate distance. Please try again.',
          },
        },
      ],
      transitions: {},
    },

    category_error: {
      type: 'end',
      description: 'Failed to fetch vehicles',
      actions: [
        {
          id: 'error',
          executor: 'response',
          config: {
            message: '❌ Could not load vehicles. Please try again.',
          },
        },
      ],
      transitions: {},
    },

    pricing_error: {
      type: 'end',
      description: 'Pricing calculation failed',
      actions: [
        {
          id: 'error',
          executor: 'response',
          config: {
            message: '❌ Could not calculate price. Please try again.',
          },
        },
      ],
      transitions: {},
    },

    order_failed: {
      type: 'end',
      description: 'Order placement failed',
      actions: [
        {
          id: 'error',
          executor: 'response',
          config: {
            message: '❌ Could not place order. Please try again or contact support.',
          },
        },
      ],
      transitions: {},
    },

    cancelled: {
      type: 'end',
      description: 'User cancelled',
      actions: [
        {
          id: 'cancel',
          executor: 'response',
          config: {
            message: '❌ Order cancelled.\n\nHow else can I help you?',
            buttons: [
              { label: '📦 Send Parcel', value: 'parcel', action: 'send_parcel' },
              { label: '🍔 Order Food', value: 'food', action: 'order_food' },
              { label: '❓ Help', value: 'help', action: 'help' },
            ],
          },
        },
      ],
      transitions: {},
    },
  },

  initialState: 'check_trigger',
  finalStates: ['finish', 'cancelled', 'pickup_error', 'delivery_error', 'pickup_out_of_zone', 'delivery_out_of_zone', 'distance_error', 'order_failed', 'category_error', 'pricing_error'],
};
