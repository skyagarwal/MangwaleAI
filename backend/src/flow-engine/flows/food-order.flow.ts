import { FlowDefinition } from '../types/flow.types';

export const foodOrderFlow: FlowDefinition = {
  id: 'food_order_v1',
  name: 'Food Order Flow',
  description: 'Complete food ordering flow with search, selection, address, and payment',
  module: 'food',
  trigger: 'order_food',
  version: '1.0.0',
  
  contextSchema: {
    search_query: { type: 'string', required: false },
    search_results: { type: 'array', required: false },
    selected_items: { type: 'array', required: true },
    delivery_address: { type: 'object', required: true },
    distance: { type: 'number', required: true },
    pricing: { type: 'object', required: true },
    order_result: { type: 'object', required: false },
    // Custom Order / Parcel Fallback Context
    custom_pickup_location: { type: 'object', required: false },
    custom_item_details: { type: 'string', required: false },
    is_custom_order: { type: 'boolean', required: false },
  },
  
  states: {
    // Check if flow was triggered with a specific request
    check_trigger: {
      type: 'decision',
      description: 'Check if user already specified what they want',
      conditions: [
        {
          // If message is long enough and not just a greeting, assume it's a query
          // Check both user_message and _user_message to be safe
          expression: '(context.user_message || context._user_message) && (context.user_message || context._user_message).length > 3 && !["hi", "hello", "hey", "start"].includes((context.user_message || context._user_message).toLowerCase())',
          event: 'has_query',
        }
      ],
      transitions: {
        has_query: 'understand_request',
        default: 'greet_user',
      },
    },

    // Initial state - welcome (renamed from init)
    greet_user: {
      type: 'wait',
      description: 'Welcome user and ask what they want to order',
      actions: [
        {
          id: 'welcome_message',
          executor: 'llm',
          config: {
            systemPrompt: 'You are Mangwale Food Assistant. Be concise (max 2 sentences).',
            prompt: `Greet {{user_name}}. Ask what they want to eat today (e.g., "Misal Pav", "Pizza").`,
            temperature: 0.6,
            maxTokens: 60,
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'understand_request',
      },
    },

    // Understand what user wants
    understand_request: {
      type: 'action',
      description: 'Extract food intent and entities',
      actions: [
        {
          id: 'analyze_request',
          executor: 'nlu',
          config: {
            extractEntities: true,
          },
          output: 'food_nlu',
        },
        {
          id: 'extract_food_details',
          executor: 'llm',
          config: {
            systemPrompt: 'You are a JSON extractor. Extract food order details. Return JSON with keys: "item", "restaurant", "search_query". "search_query" is REQUIRED.',
            prompt: `User message: "{{user_message}}"

Extract details into this JSON format:
{
  "item": "extracted food item or null",
  "restaurant": "extracted restaurant name or null",
  "search_query": "full search string"
}

If the user just says "I want food", search_query should be "food".
If the user says "order pizza", search_query should be "pizza".

JSON:`,
            temperature: 0.1,
            maxTokens: 100,
            parseJson: true
          },
          output: 'extracted_food',
        }
      ],
      transitions: {
        success: 'search_food',
        order_food: 'search_food',
        search_product: 'search_food',
        browse_menu: 'search_food',
        default: 'search_food',
      },
    },

    // Search for food items
    search_food: {
      type: 'action',
      description: 'Search OpenSearch for food items',
      actions: [
        {
          id: 'search_items',
          executor: 'search',
          config: {
            index: 'food_items_v4',
            query: '{{extracted_food.search_query}}',
            size: 10,
            fields: ['item_name', 'category', 'subcategory', 'description', 'restaurant_name'],
            formatForUi: true,
            lat: '{{location.lat}}',
            lng: '{{location.lng}}',
          },
          output: 'search_results',
        },
      ],
      transitions: {
        items_found: 'show_results',
        no_items: 'analyze_no_results',
        error: 'analyze_no_results', // Handle search errors gracefully
      },
    },

    // Analyze why search failed and if we can offer custom pickup
    analyze_no_results: {
      type: 'action',
      description: 'Check if user asked for specific restaurant not in DB',
      actions: [
        {
          id: 'analyze_failure',
          executor: 'llm',
          config: {
            systemPrompt: 'Analyze if the user requested a specific restaurant or item that was not found.',
            prompt: 'User query: "{{extracted_food.search_query}}". Did they mention a specific restaurant name? Return JSON: {"specific_restaurant": true/false, "restaurant_name": "name if found"}',
            temperature: 0.1,
            maxTokens: 50,
            parseJson: true
          },
          output: '_failure_analysis',
        }
      ],
      transitions: {
        success: 'check_custom_offer',
        error: 'no_results',
      }
    },

    // Decide whether to offer custom pickup
    check_custom_offer: {
      type: 'decision',
      description: 'Decide if we should offer custom pickup',
      conditions: [
        {
          expression: 'context._failure_analysis?.specific_restaurant === true',
          event: 'offer_custom',
        }
      ],
      transitions: {
        offer_custom: 'offer_custom_pickup',
        default: 'no_results',
      }
    },

    // Offer custom pickup (Parcel service fallback)
    offer_custom_pickup: {
      type: 'wait',
      description: 'Offer to pick up from the specific restaurant via parcel service',
      actions: [
        {
          id: 'offer_custom_message',
          executor: 'llm',
          config: {
            systemPrompt: 'You are a helpful assistant. The user wanted food from a specific place we don\'t partner with.',
            prompt: `User wanted: {{extracted_food.search_query}}.
Restaurant "{{_failure_analysis.restaurant_name}}" is not in our partner list.
However, offer to send a rider to pick up the order if they place it directly with the restaurant.
Ask: "Would you like me to send a rider to pick it up for you?"`,
            temperature: 0.7,
            maxTokens: 100,
          },
          output: '_last_response',
        }
      ],
      transitions: {
        user_message: 'handle_custom_pickup_response',
      }
    },

    // Handle user response to custom pickup offer
    handle_custom_pickup_response: {
      type: 'decision',
      description: 'Check if user wants custom pickup',
      conditions: [
        {
          expression: 'context._user_message?.toLowerCase().includes("yes") || context._user_message?.toLowerCase().includes("sure") || context._user_message?.toLowerCase().includes("please")',
          event: 'accepted',
        }
      ],
      transitions: {
        accepted: 'collect_custom_pickup_details',
        default: 'no_results', // If they say no, just show generic alternatives
      }
    },

    // Collect Custom Pickup Details
    collect_custom_pickup_details: {
      type: 'wait',
      description: 'Ask for pickup location details',
      actions: [
        {
          id: 'ask_pickup_details',
          executor: 'llm',
          config: {
            systemPrompt: 'You are arranging a custom pickup.',
            prompt: 'Ask for the pickup location (Restaurant Name & Area) and what item they are ordering. Be brief.',
            temperature: 0.6,
            maxTokens: 80,
          },
          output: '_last_response',
        }
      ],
      transitions: {
        user_message: 'extract_custom_pickup',
      }
    },

    // Extract Custom Pickup Details
    extract_custom_pickup: {
      type: 'action',
      description: 'Extract pickup location',
      actions: [
        {
          id: 'extract_pickup_loc',
          executor: 'address', // Use address executor to resolve location
          config: {
            field: 'custom_pickup_location',
            prompt: 'Resolving pickup location...',
            useUserMessage: true, 
          },
          output: 'custom_pickup_location',
        },
        {
          id: 'set_custom_flag',
          executor: 'response',
          config: {
            saveToContext: {
              'is_custom_order': true,
              'custom_item_details': '{{extracted_food.search_query}}' // Default to search query
            }
          }
        }
      ],
      transitions: {
        address_valid: 'collect_address', // Reuse standard address collection for drop
        error: 'collect_custom_pickup_details', // Retry
      }
    },

    // Show search results
    show_results: {
      type: 'action',
      description: 'Display food items to user',
      actions: [
        {
          id: 'display_items',
          executor: 'response',
          config: {
            message: 'Here are some delicious options I found for you:',
            dynamicMetadata: {
              cards: 'search_results.cards'
            }
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'process_selection',
      },
    },

    // Process item selection
    process_selection: {
      type: 'action',
      description: 'Parse selected items and quantities',
      actions: [
        {
          id: 'parse_selection',
          executor: 'nlu',
          config: {
            extractEntities: true,
          },
          output: 'selection_nlu',
        },
        // TODO: Add custom executor to parse "1x2, 3x1" format
        // For now, using LLM to extract selections
        {
          id: 'extract_selections',
          executor: 'llm',
          config: {
            systemPrompt: 'Extract item numbers and quantities from user message. Return JSON array.',
            prompt: 'User message: {{user_message}}\n\nExtract selections in format: [{"itemIndex": 0, "quantity": 2}]. If unclear, ask for clarification.',
            temperature: 0.3,
            maxTokens: 150,
          },
          output: '_selection_extract',
        },
      ],
      transitions: {
        success: 'confirm_selection',
        error: 'show_results',
      },
    },

    // Confirm selected items
    confirm_selection: {
      type: 'action',
      description: 'Show cart and ask for confirmation',
      actions: [
        {
          id: 'show_cart',
          executor: 'llm',
          config: {
            systemPrompt: 'You are showing the cart. List items, quantities, prices, and total.',
            prompt: `Show the cart summary:
Items in cart: {{selected_items.length}}
Total items value: ₹{{pricing.itemsTotal}}

Ask if they want to:
1. Proceed to checkout
2. Add more items
3. Cancel order`,
            temperature: 0.7,
            maxTokens: 200,
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'check_cart_action',
      },
    },

    // Check what user wants to do with cart
    check_cart_action: {
      type: 'decision',
      description: 'Determine next step based on user response',
      conditions: [
        {
          expression: 'context._user_message?.toLowerCase().includes("proceed") || context._user_message?.toLowerCase().includes("checkout") || context._user_message?.toLowerCase().includes("yes")',
          event: 'proceed_checkout',
        },
        {
          expression: 'context._user_message?.toLowerCase().includes("more") || context._user_message?.toLowerCase().includes("add")',
          event: 'add_more',
        },
        {
          expression: 'context._user_message?.toLowerCase().includes("cancel")',
          event: 'cancel_order',
        },
      ],
      transitions: {
        proceed_checkout: 'upsell_offer',
        add_more: 'search_food',
        cancel_order: 'cancelled',
        default: 'confirm_selection',
      },
    },

    // Upsell Offer
    upsell_offer: {
      type: 'action',
      description: 'Suggest add-ons',
      actions: [
        {
          id: 'suggest_addon',
          executor: 'llm',
          config: {
            systemPrompt: 'You are a helpful waiter. Suggest a drink or dessert to go with the order. Be brief.',
            prompt: 'User ordered {{selected_items.length}} items. Suggest a Coke, Lassi, or Gulab Jamun. Ask "Would you like to add a dessert or drink?"',
            temperature: 0.6,
            maxTokens: 80,
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'handle_upsell',
      },
    },

    // Handle Upsell Response
    handle_upsell: {
      type: 'decision',
      description: 'Check if user accepted upsell',
      conditions: [
        {
          expression: 'context._user_message?.toLowerCase().includes("no") || context._user_message?.toLowerCase().includes("skip")',
          event: 'declined',
        },
        {
          expression: 'context._user_message?.toLowerCase().includes("yes") || context._user_message?.toLowerCase().includes("add")',
          event: 'accepted',
        }
      ],
      transitions: {
        declined: 'collect_address',
        accepted: 'add_upsell_item', // Simplified: In real app, would search/add specific item
        default: 'collect_address',
      },
    },

    // Add Upsell Item (Mock)
    add_upsell_item: {
      type: 'action',
      description: 'Add the suggested item',
      actions: [
        {
          id: 'add_mock_item',
          executor: 'llm', // Using LLM to acknowledge for now
          config: {
            systemPrompt: 'Acknowledge addition.',
            prompt: 'Say "Great choice! Added to your order." and proceed.',
            temperature: 0.5,
            maxTokens: 30,
          },
          output: '_last_response',
        }
      ],
      transitions: {
        next: 'collect_address', // Auto transition not supported by 'action' type usually, need user input or 'pass'
        // Assuming action type waits for user input unless it's a 'logic' type. 
        // Let's assume we just move to collect_address after sending the message? 
        // The flow engine might need a 'pass' transition or 'auto'.
        // Looking at existing states, they all wait for 'user_message' or 'success'.
        // I'll use 'success' if the executor returns.
        success: 'collect_address',
      },
    },

    // Collect delivery address
    collect_address: {
      type: 'wait',
      description: 'Get delivery address',
      actions: [
        {
          id: 'get_address',
          executor: 'address',
          config: {
            field: 'delivery_address',
            prompt: 'Where should we deliver your order?',
            offerSaved: true,
          },
          output: 'delivery_address',
          retryOnError: true,
          maxRetries: 3,
        },
      ],
      transitions: {
        address_valid: 'validate_zone',
        waiting_for_input: 'collect_address',
        error: 'address_error',
      },
    },

    // Validate delivery zone
    validate_zone: {
      type: 'action',
      description: 'Check if address is in service area',
      actions: [
        {
          id: 'check_zone',
          executor: 'zone',
          config: {
            latPath: 'delivery_address.lat',
            lngPath: 'delivery_address.lng',
          },
          output: 'delivery_zone',
        },
      ],
      transitions: {
        zone_valid: 'check_distance_type', // Changed from calculate_distance
        zone_invalid: 'out_of_zone',
      },
    },

    // Check which distance calculation to use
    check_distance_type: {
      type: 'decision',
      description: 'Route to correct distance calculation',
      conditions: [
        {
          expression: 'context.is_custom_order === true',
          event: 'custom',
        }
      ],
      transitions: {
        custom: 'calculate_custom_distance',
        default: 'calculate_distance',
      }
    },

    // Calculate custom distance (for custom pickup)
    calculate_custom_distance: {
      type: 'action',
      description: 'Calculate distance for custom pickup',
      actions: [
        {
          id: 'get_custom_distance',
          executor: 'distance',
          config: {
            fromLatPath: 'custom_pickup_location.lat',
            fromLngPath: 'custom_pickup_location.lng',
            toLatPath: 'delivery_address.lat',
            toLngPath: 'delivery_address.lng',
          },
          output: 'distance',
          retryOnError: true,
          maxRetries: 2,
        },
      ],
      transitions: {
        calculated: 'calculate_custom_pricing',
        error: 'distance_error',
      },
    },

    // Calculate custom pricing (Parcel rates)
    calculate_custom_pricing: {
      type: 'action',
      description: 'Calculate pricing for custom pickup (Parcel rates)',
      actions: [
        {
          id: 'get_custom_pricing',
          executor: 'pricing',
          config: {
            type: 'parcel', // Use parcel pricing for custom orders
            distancePath: 'distance',
            minimumFare: 40,
            perKmRate: 12,
            taxRate: 0.05,
          },
          output: 'pricing',
        },
      ],
      transitions: {
        calculated: 'show_custom_summary',
      },
    },

    // Show custom order summary
    show_custom_summary: {
      type: 'action',
      description: 'Show summary for custom pickup',
      actions: [
        {
          id: 'custom_summary_msg',
          executor: 'llm',
          config: {
            systemPrompt: 'Show custom pickup summary. Be clear this is a delivery-only service.',
            prompt: `Summary:
Pickup: {{custom_pickup_location.label}}
Drop: {{delivery_address.label}}
Item: {{custom_item_details}}
Distance: {{distance}} km
Delivery Fee: ₹{{pricing.total}}

Note: You need to pay the restaurant directly. We only charge for delivery.
Reply "confirm" to book the rider.`,
            temperature: 0.7,
            maxTokens: 200,
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'check_final_confirmation', // Reuse existing confirmation logic
      },
    },

    // Calculate distance (from restaurant to delivery)
    calculate_distance: {
      type: 'action',
      description: 'Calculate delivery distance',
      actions: [
        {
          id: 'get_distance',
          executor: 'distance',
          config: {
            // TODO: Get restaurant coordinates from selected items
            fromLatPath: 'selected_items.0.restaurant_lat',
            fromLngPath: 'selected_items.0.restaurant_lng',
            toLatPath: 'delivery_address.lat',
            toLngPath: 'delivery_address.lng',
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

    // Calculate total pricing
    calculate_pricing: {
      type: 'action',
      description: 'Calculate food order pricing',
      actions: [
        {
          id: 'get_pricing',
          executor: 'pricing',
          config: {
            type: 'food',
            itemsPath: 'selected_items',
            distancePath: 'distance',
            deliveryPerKm: 10,
            taxRate: 0.05,
          },
          output: 'pricing',
        },
      ],
      transitions: {
        calculated: 'collect_payment_method',
      },
    },

    // Collect Payment Method
    collect_payment_method: {
      type: 'wait',
      description: 'Ask for payment method',
      actions: [
        {
          id: 'ask_payment',
          executor: 'llm',
          config: {
            systemPrompt: 'You are collecting payment preference.',
            prompt: 'Ask how they would like to pay: "Cash on Delivery" or "Online Payment" (UPI/Card).',
            temperature: 0.7,
            maxTokens: 100,
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'extract_payment_method',
      },
    },

    // Extract Payment Method
    extract_payment_method: {
      type: 'action',
      description: 'Extract payment method from user response',
      actions: [
        {
          id: 'extract_payment',
          executor: 'llm',
          config: {
            systemPrompt: 'Extract payment method. Return "COD" or "ONLINE".',
            prompt: 'User message: {{user_message}}\n\nReturn JSON: {"method": "COD" | "ONLINE"}',
            temperature: 0.1,
            maxTokens: 50,
          },
          output: 'payment_details',
        },
      ],
      transitions: {
        success: 'show_order_summary',
      },
    },

    // Show final order summary
    show_order_summary: {
      type: 'wait',
      description: 'Display complete order summary',
      actions: [
        {
          id: 'summary_message',
          executor: 'llm',
          config: {
            systemPrompt: 'You are showing a food order summary. Be clear about items, prices, and delivery details.',
            prompt: `Create order summary:
📦 Items: {{selected_items.length}} items
💰 Items Total: ₹{{pricing.itemsTotal}}
🚚 Delivery Fee: ₹{{pricing.deliveryFee}} ({{distance}}km)
🧾 GST (5%): ₹{{pricing.tax}}
💳 Total: ₹{{pricing.total}}
💸 Payment: {{payment_details.method}}

📍 Delivery to: {{delivery_address.label}}
⏱️ Estimated time: 30-45 minutes

Reply "confirm" to place order or "cancel" to cancel.`,
            temperature: 0.7,
            maxTokens: 250,
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'check_final_confirmation',
      },
    },

    // Check final confirmation
    check_final_confirmation: {
      type: 'decision',
      description: 'Evaluate final confirmation',
      conditions: [
        {
          expression: 'context._user_message?.toLowerCase().includes("confirm") || context._user_message?.toLowerCase().includes("yes")',
          event: 'user_confirms',
        },
        {
          expression: 'context._user_message?.toLowerCase().includes("cancel") || context._user_message?.toLowerCase().includes("no")',
          event: 'user_cancels',
        },
      ],
      transitions: {
        user_confirms: 'check_order_type_final', // Changed from place_order
        user_cancels: 'cancelled',
        default: 'show_order_summary',
      },
    },

    // Check order type before placing
    check_order_type_final: {
      type: 'decision',
      description: 'Route to correct order placement',
      conditions: [
        {
          expression: 'context.is_custom_order === true',
          event: 'custom',
        }
      ],
      transitions: {
        custom: 'place_custom_order',
        default: 'place_order',
      }
    },

    // Place custom order
    place_custom_order: {
      type: 'action',
      description: 'Create custom pickup order',
      actions: [
        {
          id: 'create_custom_order',
          executor: 'order',
          config: {
            type: 'parcel', // Treat as parcel
            pickupAddressPath: 'custom_pickup_location',
            deliveryAddressPath: 'delivery_address',
            pricingPath: 'pricing',
            detailsPath: 'custom_item_details', // Pass item name as details
            isCustomFood: true,
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

    // Place order
    place_order: {
      type: 'action',
      description: 'Create food order in backend',
      actions: [
        {
          id: 'create_order',
          executor: 'order',
          config: {
            type: 'food',
            itemsPath: 'selected_items',
            addressPath: 'delivery_address',
            paymentPath: 'payment_details',
            pricingPath: 'pricing',
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

    // Success
    completed: {
      type: 'end',
      description: 'Order successfully placed',
      actions: [
        {
          id: 'success_message',
          executor: 'llm',
          config: {
            systemPrompt: 'Confirm successful food order placement. Be enthusiastic!',
            prompt: `Confirm order:
✅ Order ID: {{order_result.orderId}}
💰 Total: ₹{{pricing.total}}
📍 Delivery: {{delivery_address.label}}
⏱️ ETA: 30-45 minutes

Tell them they'll receive live updates on WhatsApp and can track their order.`,
            temperature: 0.8,
            maxTokens: 200,
          },
          output: '_last_response',
        },
      ],
      transitions: {},
    },

    // Error states
    no_results: {
      type: 'wait',
      description: 'No food items found',
      actions: [
        {
          id: 'fetch_categories',
          executor: 'search',
          config: {
            type: 'categories',
            index: 'food_items_v4',
            limit: 8
          },
          output: 'popular_categories'
        },
        {
          id: 'no_results_message',
          executor: 'llm',
          config: {
            systemPrompt: 'Apologize for no results and suggest alternatives.',
            prompt: `I couldn't find anything matching "{{user_message}}".
{{#if userPreferenceContext}}
Based on your preferences, maybe try searching for: Veg Pizza, Paneer Tikka, or Veg Biryani.
{{else}}
{{#if popular_categories}}
Here are some popular options you might like:
{{#each popular_categories}}
- {{this}}
{{/each}}
{{else}}
Suggest popular categories like pizza, biryani, chinese, burgers, etc.
{{/if}}
{{/if}}
Ask what else they'd like to try.`,
            temperature: 0.8,
            maxTokens: 150,
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'understand_request',
      },
    },

    address_error: {
      type: 'end',
      description: 'Failed to get valid address',
      actions: [
        {
          id: 'error_message',
          executor: 'response',
          config: {
            message: 'Sorry, we couldn\'t understand your delivery address. Please try ordering again.',
          },
        },
      ],
      transitions: {},
    },

    out_of_zone: {
      type: 'end',
      description: 'Delivery location outside service area',
      actions: [
        {
          id: 'zone_error',
          executor: 'response',
          config: {
            message: 'Sorry, we don\'t deliver to this location yet. We currently serve Nashik city. We\'ll notify you when we expand!',
          },
        },
      ],
      transitions: {},
    },

    distance_error: {
      type: 'end',
      description: 'Failed to calculate distance',
      actions: [
        {
          id: 'error_message',
          executor: 'response',
          config: {
            message: 'Sorry, we encountered an error calculating delivery distance. Please try again.',
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
          id: 'failure_message',
          executor: 'response',
          config: {
            message: 'Sorry, we couldn\'t place your order right now. Please try again in a few minutes.',
          },
        },
      ],
      transitions: {},
    },

    cancelled: {
      type: 'end',
      description: 'User cancelled the order',
      actions: [
        {
          id: 'cancel_message',
          executor: 'response',
          config: {
            message: 'No worries! Your order has been cancelled. Come back when you\'re hungry! 🍕',
          },
        },
      ],
      transitions: {},
    },
  },

  initialState: 'understand_request',
  finalStates: ['completed', 'cancelled', 'address_error', 'out_of_zone', 'distance_error', 'order_failed'],
};
