import { FlowDefinition } from '../types/flow.types';

export const foodOrderFlow: FlowDefinition = {
  id: 'food_order_v1',
  name: 'Food Order Flow',
  description: 'Complete food ordering flow with search, selection, address, and payment',
  module: 'food',
  trigger: 'order_food|browse_menu|browse_category|ask_recommendation|ask_famous|check_availability|ask_fastest_delivery',
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
          expression: '(context.user_message || context._user_message) && (context.user_message || context._user_message).length > 3 && !["hi", "hello", "hey", "start", "order_food", "order food", "food", "khana", "khaana"].includes((context.user_message || context._user_message).toLowerCase().trim())',
          event: 'has_query',
        }
      ],
      transitions: {
        has_query: 'detect_express_order',
        default: 'greet_user',
      },
    },

    // 🚀 EXPRESS ORDER DETECTION: Check if user provided complete order info
    // Patterns: "butter chicken from inayat cafe to home, COD?"
    // ⚡ OPTIMIZED: Use NLU for entity extraction instead of LLM
    detect_express_order: {
      type: 'action',
      description: 'Detect if user provided complete order using NLU entities',
      actions: [
        {
          id: 'nlu_extract',
          executor: 'nlu',
          config: {
            input: '{{_user_message}}',
            extractEntities: true,
          },
          output: 'nlu_result',
        },
        {
          // Map NLU entities to express_order_detection format
          id: 'check_express',
          executor: 'response',
          config: {
            skipResponse: true,
            saveToContext: {
              express_order_detection: {
                food_items: '{{nlu_result.entities.food_reference || []}}',
                restaurant: '{{nlu_result.entities.store_reference || null}}',
                delivery_address_type: '{{nlu_result.entities.location_reference || null}}',
              },
            },
          },
        },
      ],
      transitions: {
        success: 'check_if_express_order',
        default: 'save_original_query',
      },
    },

    // 🚀 Check if it's an express order (food + restaurant both detected by NLU)
    check_if_express_order: {
      type: 'decision',
      description: 'Route to express checkout if complete order detected',
      conditions: [
        {
          // Express order = NLU extracted both food items AND a restaurant reference
          expression: 'context.express_order_detection?.food_items?.length > 0 && context.express_order_detection?.restaurant',
          event: 'express_order',
        },
      ],
      transitions: {
        express_order: 'express_order_flow',
        default: 'save_original_query',
      },
    },

    // 🚀 EXPRESS ORDER FLOW: Skip intermediate steps, go directly to item search + auto-cart
    express_order_flow: {
      type: 'action',
      description: 'Handle express order - search item, add to cart, show checkout',
      actions: [
        {
          id: 'save_express_data',
          executor: 'response',
          config: {
            saveToContext: {
              original_food_query: '{{_user_message}}',
              extracted_food: {
                items: '{{express_order_detection.food_items}}',
                restaurant: '{{express_order_detection.restaurant}}',
                search_query: '{{#each express_order_detection.food_items}}{{this.name}} {{/each}}',
              },
              _is_express_order: true,
              _delivery_address_type: '{{express_order_detection.delivery_address_type}}',
              _payment_query: '{{express_order_detection.payment_query}}',
            },
            event: 'saved',
          },
        },
      ],
      transitions: {
        saved: 'check_saved_address_intent',
        default: 'check_saved_address_intent',
      },
    },

    // 💾 Save the original query AND delivery hints before asking for location
    save_original_query: {
      type: 'action',
      description: 'Save the original user query and delivery address hints from NLU for later use',
      actions: [
        {
          id: 'save_query',
          executor: 'response',
          config: {
            saveToContext: {
              original_food_query: '{{_user_message}}',
              // 🏠 Propagate delivery address type from NLU entities (home/office/ghar)
              _delivery_address_type: '{{express_order_detection.delivery_address_type}}',
              // 🥗 Propagate food preference from NLU (veg/non-veg)
              _user_food_preference: '{{nlu_result.entities.preference}}',
            },
            event: 'saved',
          },
        },
      ],
      transitions: {
        saved: 'check_saved_address_intent',
        default: 'check_saved_address_intent',
      },
    },

    // 🏠 Check if user mentioned a saved address OR has location already
    // 📍 FIXED: Require location BEFORE search to show nearby stores only
    // 🚀 FIXED: Check NLU entities AND keywords, not just intent
    // Previously only checked for 'use_saved_address' intent which never matched
    // when primary intent was 'order_food'. Now checks:
    //   1. NLU-extracted delivery_address_type (home/office) from detect_express_order
    //   2. _delivery_address_type saved in save_original_query
    //   3. Keyword match for home/ghar/office in user message
    check_saved_address_intent: {
      type: 'decision',
      description: 'Check if user wants to use a saved address via entities or keywords',
      conditions: [
        {
          // Check if NLU extracted delivery_address_type (e.g., "home", "office") in detect_express_order
          expression: `context.express_order_detection?.delivery_address_type && 
                       context.express_order_detection.delivery_address_type !== 'null' && 
                       context.express_order_detection.delivery_address_type !== '' &&
                       context.express_order_detection.delivery_address_type !== null`,
          event: 'has_address_hint',
        },
        {
          // Check saved _delivery_address_type from express order flow
          expression: `context._delivery_address_type && 
                       context._delivery_address_type !== 'null' && 
                       context._delivery_address_type !== '' &&
                       context._delivery_address_type !== null`,
          event: 'has_address_hint',
        },
        {
          // Keyword fallback: check for home/office/ghar in original message
          expression: `/\\b(home|ghar|office|daftar|delivered at home|deliver at home|delivery at home|ghar pe|ghar par|घर|ऑफिस)\\b/i.test(context._user_message || context.original_food_query || '')`,
          event: 'has_address_hint',
        },
      ],
      transitions: {
        has_address_hint: 'auto_select_saved_address',
        default: 'check_existing_location',
      },
    },

    // 🚀 AGENTIC: Check if location already exists in session
    check_existing_location: {
      type: 'decision',
      description: 'Check if location already available in session context - avoids re-asking',
      conditions: [
        {
          // Session already has location from previous interaction
          expression: 'context.location && context.location.lat && context.location.lng',
          event: 'has_location',
        }
      ],
      transitions: {
        // 🔧 FIX: If location exists in session, still need to restore original query
        // before NLU analysis to avoid hallucination
        has_location: 'restore_original_query',
        default: 'request_location',
      },
    },

    // 🏠 NEW: Auto-select saved address based on user's preference (home/office)
    auto_select_saved_address: {
      type: 'action',
      description: 'Fetch saved addresses and auto-select home/office based on user message',
      actions: [
        {
          id: 'fetch_and_select',
          executor: 'saved_address_selector',
          config: {
            addressTypeHint: '{{_user_message}}', // Will parse home/office from message
            saveToContext: 'delivery_address',
          },
          onError: 'continue', // Don't fail flow if user not authenticated - just transition to request_location
        },
      ],
      transitions: {
        address_selected: 'use_saved_address_location', // Address found and selected
        no_saved_address: 'request_location', // User has no saved addresses
        default: 'request_location',
      },
    },

    // 🏠 NEW: Use the saved address location for search
    use_saved_address_location: {
      type: 'action',
      description: 'Copy saved address coordinates to location context for geo-search',
      actions: [
        {
          id: 'copy_location',
          executor: 'response',
          config: {
            saveToContext: {
              location: {
                lat: '{{delivery_address.lat}}',
                lng: '{{delivery_address.lng}}',
              },
              _address_auto_selected: true,
              _location_source: 'saved_address',
            },
            event: 'location_set',
          },
        },
      ],
      transitions: {
        // 🔧 FIX: Must restore original query before NLU analysis
        location_set: 'restore_original_query',
        default: 'restore_original_query',
      },
    },

    // NOTE: Removed duplicate check_location state — identical to check_existing_location (line 197)
    // and was never referenced as a transition target (dead code).

    // 📍 NEW: Request location from user
    request_location: {
      type: 'wait',
      description: 'Ask user to share their location for better results',
      onEntry: [
        {
          id: 'ask_location',
          executor: 'response',
          config: {
            message: '📍 To show you the best food options nearby, please share your location!\n\nTap the button below or type your area name.',
            responseType: 'request_location',
            buttons: [
              { id: 'btn_location', label: '📍 Share Location', value: '__LOCATION__' },
              { id: 'btn_skip', label: 'Skip for now', value: 'skip_location' }
            ]
          },
          output: '_last_response',
        }
      ],
      transitions: {
        location_shared: 'confirm_location_received',
        user_message: 'handle_location_response',
        default: 'handle_location_response',
      },
    },

    // ✅ NEW: Confirm location was received and continue immediately
    confirm_location_received: {
      type: 'action',
      description: 'Set flag that location was just received (confirmation shown in next prompt)',
      actions: [
        {
          id: 'set_location_confirmed_flag',
          executor: 'response',
          config: {
            // Clear the old request_location responseType by setting a new one
            responseType: 'silent',
            saveToContext: {
              _location_just_received: true,
            },
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'restore_original_query',
      },
    },

    // 📍 NEW: Handle location response (GPS coordinates, text input, or skip)
    handle_location_response: {
      type: 'decision',
      description: 'Check if user shared GPS location, skipped, or provided area name',
      conditions: [
        {
          // Check if message contains LOCATION: prefix (from WhatsApp GPS share)
          expression: 'context._user_message?.startsWith("LOCATION:")',
          event: 'location_shared',
        },
        {
          // Check if GPS coordinates were shared (location object in context)
          expression: 'context.location?.lat && context.location?.lng',
          event: 'location_shared',
        },
        {
          // Check if _raw_location has coordinates (from message)
          expression: 'context._raw_location?.lat && context._raw_location?.lng',
          event: 'location_shared',
        },
        {
          expression: 'context._user_message?.toLowerCase().includes("skip")',
          event: 'skipped',
        }
      ],
      transitions: {
        location_shared: 'confirm_location_received', // GPS coordinates received - confirm and restore query
        skipped: 'restore_original_query', // Continue without location
        default: 'extract_location_from_text',
      },
    },

    // 🔄 CRITICAL: Restore the original food query after location is collected
    // This prevents LLM from hallucinating food items from location data
    restore_original_query: {
      type: 'action',
      description: 'Restore the original food query to _user_message for NLU analysis. Also marks session as location-ready.',
      actions: [
        {
          id: 'restore_query',
          executor: 'response',
          config: {
            saveToContext: {
              // Restore original query for NLU analysis
              _user_message: '{{original_food_query}}',
              // Mark session as having location ready - prevents re-asking
              _session_has_location: true,
              _location_captured_at: '{{_now}}',
            },
            event: 'restored',
          },
        },
      ],
      transitions: {
        restored: 'understand_request',
        default: 'understand_request',
      },
    },

    // 📍 NEW: Try to extract location from text
    extract_location_from_text: {
      type: 'action',
      description: 'Extract location from user area name',
      actions: [
        {
          id: 'parse_area',
          executor: 'address',
          config: {
            field: 'location',
            useUserMessage: true,
            city: 'Nashik',
          },
          output: 'location',
        }
      ],
      transitions: {
        // 🔧 FIX: Restore original food query after text location extraction
        address_valid: 'restore_original_query',
        waiting_for_input: 'request_location', // Go back to request if address not found
        error: 'restore_original_query', // Continue even if extraction fails - but restore query first!
        default: 'restore_original_query', // Fallback - always restore query
      },
    },

    // Initial state - welcome (renamed from init)
    // ⚡ OPTIMIZED: Use static message instead of LLM for faster response
    greet_user: {
      type: 'wait',
      description: 'Welcome user and ask what they want to order',
      onEntry: [
        {
          id: 'welcome_message',
          executor: 'response',
          config: {
            message: 'Hey {{user_name}}! 😋 What would you like to eat today?',
            quickReplies: [
              { label: '🍕 Pizza', value: 'pizza' },
              { label: '🍛 Biryani', value: 'biryani' },
              { label: '🥘 Thali', value: 'thali' },
              { label: '🍔 Burger', value: 'burger' },
            ],
          },
        },
      ],
      transitions: {
        user_message: 'understand_request',
      },
    },

    // Understand what user wants
    // ⚡ OPTIMIZED: Use NLU only - entities already extracted by EntityExtractorService
    understand_request: {
      type: 'action',
      description: 'Extract food intent and entities using NLU',
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
          // Map NLU entities to extracted_food format for downstream states
          id: 'map_nlu_to_extracted_food',
          executor: 'response',
          config: {
            skipResponse: true,
            saveToContext: {
              extracted_food: {
                // Use NLU extracted entities
                items: '{{food_nlu.entities.food_reference || []}}',
                restaurant: '{{food_nlu.entities.store_reference || null}}',
                search_query: '{{_user_message}}',
                special_instructions: null,
                // 🥗 Propagate food preference (veg/non-veg) from NLU to search
                preference: '{{food_nlu.entities.preference || _user_food_preference || null}}',
              },
              // 🥗 Also save preference at top level for SearchExecutor to read
              _user_food_preference: '{{food_nlu.entities.preference || _user_food_preference || null}}',
            },
          },
        },
      ],
      transitions: {
        // Always check if we have a search query first before searching
        success: 'check_search_query_exists',
        order_food: 'check_search_query_exists',
        search_product: 'check_search_query_exists',
        browse_menu: 'show_categories',              // 🔧 FIX: Browse menu → show categories, not search
        browse_category: 'show_categories',
        browse_stores: 'show_partner_stores',  // User wants to see other stores/restaurants
        ask_recommendation: 'show_recommendations',
        ask_famous: 'show_recommendations',
        ask_fastest_delivery: 'search_fastest_delivery',
        check_availability: 'check_search_query_exists',
        add_to_cart: 'process_selection',           // 🔧 FIX: Handle add-to-cart intent directly
        view_cart: 'show_current_cart',              // 🔧 FIX: Handle view cart intent
        checkout: 'check_auth_for_checkout',         // 🔧 FIX: Handle checkout intent
        default: 'check_search_query_exists',
      },
    },

    // 🆕 Check if user provided specific food items or restaurant to search
    // SMART DETECTION: Uses NLU entity extraction - no hardcoded patterns
    // 🔒 SAFETY: Validates store_reference isn't a common word before treating as restaurant
    check_search_query_exists: {
      type: 'decision',
      description: 'Check if NLU extracted specific food items or restaurant, or if query is vague',
      conditions: [
        {
          // 🏪🏪 MULTI-STORE: If NLU detected multiple stores (e.g., "paneer from ganesh and gulkand from dagu teli")
          // store_references is an array of {store, items} extracted by LLM
          expression: 'context.food_nlu?.entities?.store_references && Array.isArray(context.food_nlu.entities.store_references) && context.food_nlu.entities.store_references.length >= 2',
          event: 'multi_store',
        },
        {
          // If user mentioned a restaurant (with or without food items), go to restaurant search
          // NLU extracts store_reference for restaurant names like "haldirams", "dominos", "inayat cafe"
          // 🔒 SAFETY: Exclude common words that are NOT restaurant names
          // Pattern: store_reference exists AND is not in blocklist AND is not too short (less than 3 chars)
          expression: `(context.food_nlu?.entities?.store_reference || context.extracted_food?.restaurant) && 
                       !["order", "food", "khana", "khaana", "eat", "want", "need", "send", "give", "menu", "show", "list", "what", "can", "i", "me", "my", "the", "a", "an", "delivery", "deliver", "home", "office", "ghar", "karo", "do", "please", "jaldi", "abhi", "fast", "quick", "now", "today", "tomorrow", "kuch", "something", "anything", "best", "famous", "popular", "good", "tasty", "cheap", "nearby", "near", "close", "around", "any", "other", "store", "restro", "restaurant", "shop", "dukan", "more", "different", "aur", "alag", "dusra", "koi", "bhi", "hotel", "cafe", "dhaba", "browse", "search", "find", "look", "category", "categories", "open", "check", "tell", "suggest", "recommend"].includes((context.food_nlu?.entities?.store_reference || context.extracted_food?.restaurant || "").toLowerCase()) &&
                       (context.food_nlu?.entities?.store_reference || context.extracted_food?.restaurant || "").length >= 3`,
          event: 'restaurant_only',
        },
        {
          // SMART: If NLU extracted specific food items, proceed to search
          // food_reference contains actual food names like ["pizza", "biryani", "burger"]
          // 🔒 FILTER: Exclude vague generic terms that are NOT specific food items
          expression: `context.food_nlu?.entities?.food_reference && Array.isArray(context.food_nlu.entities.food_reference) && context.food_nlu.entities.food_reference.length > 0 &&
                       !context.food_nlu.entities.food_reference.every(ref => ["food", "khana", "khaana", "eat", "order", "item", "items", "menu", "something", "anything", "kuch", "order_food"].includes(String(ref).toLowerCase()))`,
          event: 'has_food_items',
        },
        {
          // SMART: If extracted_food.items has specific food items from NLU mapping
          // 🔒 FILTER: Same vague term filter applied
          expression: `context.extracted_food?.items && Array.isArray(context.extracted_food.items) && context.extracted_food.items.length > 0 &&
                       !context.extracted_food.items.every(ref => ["food", "khana", "khaana", "eat", "order", "item", "items", "menu", "something", "anything", "kuch", "order_food"].includes(String(ref).toLowerCase()))`,
          event: 'has_food_items',
        }
        // DEFAULT: If NLU couldn't extract any food entities, query is vague → show recommendations
      ],
      transitions: {
        multi_store: 'multi_store_search',               // 🏪🏪 Multiple stores detected → parallel search
        restaurant_only: 'search_food_with_restaurant',  // Has restaurant, search for it
        has_food_items: 'merge_nlu_with_llm',            // Has specific food, search for it
        default: 'ask_what_to_eat',                         // No entities = vague query → ask user what they want
      },
    },
    
    // 🆕 Merge NLU entities with LLM extraction - prefer NLU for food items
    merge_nlu_with_llm: {
      type: 'action',
      description: 'Merge NLU entities with LLM extraction, preferring NLU for food items',
      actions: [
        {
          id: 'merge_entities',
          executor: 'response',
          config: {
            // Build search query from NLU food_reference if available, else use LLM
            saveToContext: {
              _nlu_food_reference: '{{food_nlu.entities.food_reference}}',
              _nlu_restaurant: '{{food_nlu.entities.store_reference}}',
              _llm_search_query: '{{extracted_food.search_query}}',
              _llm_restaurant: '{{extracted_food.restaurant}}',
            },
            event: 'merged',
          },
        },
      ],
      transitions: {
        merged: 'build_search_query',
        default: 'build_search_query',
      },
    },
    
    // 🆕 Build final search query preferring NLU entities
    // FIXED: Use response executor instead of LLM for reliable merge
    build_search_query: {
      type: 'action',
      description: 'Build final search query using NLU food_reference if available',
      actions: [
        {
          id: 'build_query',
          executor: 'response',
          config: {
            // Merge NLU and LLM - prefer NLU for both food and restaurant
            saveToContext: {
              // For search query: prefer NLU food_reference, fallback to LLM search_query
              'extracted_food.search_query': '{{_nlu_food_reference || _llm_search_query || "food"}}',
              // For restaurant: ALWAYS prefer NLU store_reference (it's more accurate)
              'extracted_food.restaurant': '{{_nlu_restaurant || _llm_restaurant}}',
            },
            event: 'success',
          },
        },
      ],
      transitions: {
        updated: 'check_restaurant_filter',
        success: 'check_restaurant_filter',
        default: 'check_restaurant_filter',
      },
    },

    // 🆕 Ask user what they want to eat (vague query handler)
    ask_what_to_eat: {
      type: 'wait',
      description: 'Ask user what specific food they want when query is vague',
      onEntry: [
        {
          id: 'ask_food_choice',
          executor: 'response',
          config: {
            message: '{{#if _location_just_received}}📍 Got your location! Now let me find the best options nearby...\n\n{{/if}}What would you like to order today? 🍽️\n\nYou can:\n• Tell me a dish name (e.g., "biryani", "pizza", "burger")\n• Browse the menu\n• See popular items',
            responseType: 'text',
            buttons: [
              { id: 'btn_popular', label: '🔥 Popular items', value: 'popular' },
              { id: 'btn_browse', label: '📋 Browse menu', value: 'browse_menu' },
              { id: 'btn_surprise', label: '🎲 Surprise me', value: 'surprise' }
            ],
            // Clear the flag after showing
            saveToContext: {
              _location_just_received: false,
            },
          },
          output: '_last_response',
        }
      ],
      actions: [],
      transitions: {
        user_message: 'route_food_choice',  // 🔧 FIX: Route through decision node to handle button clicks
        default: 'route_food_choice',
      },
    },

    // 🔧 FIX: Route button clicks from ask_what_to_eat
    // The wait state always fires 'user_message' event for all inputs,
    // so button-specific transitions (browse_menu, popular) never trigger.
    // This decision node checks _user_message to detect button values.
    route_food_choice: {
      type: 'decision',
      description: 'Route food choice based on button value or user text',
      conditions: [
        {
          expression: '/^(browse_menu|browse\\s+menu|browse\\s+categories|categories)$/i.test(context._user_message?.trim()) || context._user_message?.trim() === "browse_menu"',
          event: 'browse_menu',
        },
        {
          expression: '/^(popular|popular\\s+items|trending)$/i.test(context._user_message?.trim()) || context._user_message?.trim() === "popular"',
          event: 'popular',
        },
        {
          expression: '/^(surprise|surprise\\s+me)$/i.test(context._user_message?.trim()) || context._user_message?.trim() === "surprise"',
          event: 'surprise',
        },
        {
          expression: '/^(cancel|exit|quit|bye)$/i.test(context._user_message?.trim())',
          event: 'cancel',
        },
      ],
      transitions: {
        browse_menu: 'show_categories',
        popular: 'show_recommendations',
        surprise: 'show_recommendations',
        cancel: 'cancelled',
        default: 'process_specific_food',  // User typed specific food → NLU extraction
      },
    },

    // 🆕 Process user's specific food choice
    // ⚡ OPTIMIZED: Use NLU instead of LLM for entity extraction
    process_specific_food: {
      type: 'action',
      description: 'Extract food details from user response using NLU',
      actions: [
        {
          id: 'extract_from_nlu',
          executor: 'nlu',
          config: {
            input: '{{_user_message}}',
            extractEntities: true,
          },
          output: 'food_nlu',
        },
        {
          // Map NLU entities to extracted_food format
          id: 'map_entities',
          executor: 'response',
          config: {
            skipResponse: true,
            saveToContext: {
              extracted_food: {
                items: '{{food_nlu.entities.food_reference || []}}',
                restaurant: '{{food_nlu.entities.store_reference || null}}',
                quantity: '{{food_nlu.entities.quantity || 1}}',
                search_query: '{{_user_message}}',
              },
            },
          },
        },
      ],
      transitions: {
        // Check if we have a valid search query before proceeding
        success: 'check_search_query_exists',
        default: 'check_search_query_exists',
      },
    },

    // Search for food items
    // Decision state to check if restaurant filter is needed
    check_restaurant_filter: {
      type: 'decision',
      description: 'Check if user specified a restaurant to filter by',
      conditions: [
        {
          // If restaurant was extracted, use filtered search
          expression: 'context.extracted_food?.restaurant && context.extracted_food.restaurant !== "null" && context.extracted_food.restaurant !== null',
          event: 'has_restaurant',
        }
      ],
      transitions: {
        has_restaurant: 'search_food_with_restaurant',
        default: 'search_food',
      },
    },

    // Search with restaurant filter
    search_food_with_restaurant: {
      type: 'action',
      description: 'Smart search for food items filtered by restaurant name',
      actions: [
        {
          id: 'search_items_restaurant',
          executor: 'search',
          config: {
            index: 'food_items',
            // If no specific items requested, use "popular food" as fallback
            query: '{{#if extracted_food.search_query}}{{extracted_food.search_query}}{{else}}popular food items menu{{/if}}',
            size: 20,
            fields: ['name', 'category_name', 'description', 'store_name'],
            formatForUi: true,
            lat: '{{location.lat}}',
            lng: '{{location.lng}}',
            radius: '10km',
            filters: [
              { field: 'store_name', operator: 'contains', value: '{{extracted_food.restaurant}}' }
            ],
            useSmartSearch: true,
          },
          output: 'search_results',
          // On error (timeout), continue to show_restaurant_not_found instead of failing
          onError: 'continue',
        },
      ],
      transitions: {
        // For express orders with items, go directly to auto-cart
        items_found: 'check_auto_select',
        no_items: 'show_restaurant_not_found',
        error: 'show_restaurant_not_found',
        default: 'show_restaurant_not_found', // Fallback for any unknown event
      },
    },

    // 🏪🏪 MULTI-STORE SEARCH: Search items across multiple stores in parallel
    // Triggered when user mentions 2+ stores: "paneer from ganesh sweets and gulkand from dagu teli"
    multi_store_search: {
      type: 'action',
      description: 'Search items across multiple stores in parallel using store_references from NLU',
      actions: [
        {
          id: 'search_all_stores',
          executor: 'multi_store_search',
          config: {
            // store_references will be read from context.food_nlu.entities.store_references
          },
          output: 'search_results',
        },
      ],
      transitions: {
        items_found: 'multi_store_show_results',
        no_items: 'multi_store_no_results',
        error: 'multi_store_no_results',
        default: 'multi_store_no_results',
      },
    },

    // 🏪🏪 Show combined multi-store search results
    multi_store_show_results: {
      type: 'wait',
      description: 'Display search results from multiple stores with store labels',
      onEntry: [
        {
          id: 'show_multi_store_items',
          executor: 'response',
          config: {
            message: '🏪 I found items from **{{search_results.storesFound}}** stores:\n\n{{#each search_results.storeSummaries}}{{this}}\n{{/each}}{{#if search_results.ecomSuggestions.length}}\n\n🛍️ Some items are available in our **Shop** section — say "search [item] in shop" to find them{{/if}}\n\nTap **Add +** to add items from any store to your cart:',
            cardsPath: 'search_results.cards',
            buttons: [
              { id: 'btn_view_cart', label: '📋 View Cart', value: 'show cart' },
              { id: 'btn_browse', label: '📋 Browse Categories', value: 'browse_menu' },
              { id: 'btn_alternatives', label: '🔄 Find Open Alternatives', value: 'find alternatives for closed stores' },
            ],
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        // Note: button clicks arrive as user_message event (button value stored in _user_message)
        // checkout/view_cart routing is handled by resolve_user_intent → check_resolution_result
        user_message: 'resolve_user_intent',
        default: 'resolve_user_intent',
      },
    },

    // 🏪🏪 Multi-store search found no results
    multi_store_no_results: {
      type: 'action',
      description: 'Handle case where multi-store search found no items - fall back to generic search',
      actions: [
        {
          id: 'multi_store_fallback',
          executor: 'response',
          config: {
            message: '😅 I couldn\'t find items from those specific stores. Let me search more broadly...',
            saveToContext: {
              // Fall back to first store reference for regular search
              'extracted_food.restaurant': '{{food_nlu.entities.store_reference}}',
              'extracted_food.search_query': '{{_user_message}}',
            },
            event: 'fallback',
          },
        },
      ],
      transitions: {
        fallback: 'search_food_with_restaurant',
        default: 'search_food_with_restaurant',
      },
    },

    // New state: Restaurant not found
    show_restaurant_not_found: {
      type: 'action',
      description: 'Tell user restaurant was not found and try Google Places search',
      actions: [
        // First, try searching Google Places for the restaurant
        {
          id: 'external_search_auto',
          executor: 'external_search',
          config: {
            query: '{{extracted_food.restaurant}}',
            city: '{{or location.city "Nashik"}}',
            type: 'restaurant',
            radius: 25000, // 25km radius
            lat: '{{location.lat}}',
            lng: '{{location.lng}}',
          },
          output: 'external_search_results',
        }
      ],
      transitions: {
        // If Google Places found results, show them
        found: 'show_external_vendor_found',
        // If not found anywhere, offer custom pickup
        not_found: 'offer_custom_pickup_manual',
        error: 'offer_custom_pickup_manual',
      },
    },
    
    // NEW: Show Google Places results when restaurant found externally
    show_external_vendor_found: {
      type: 'wait',
      description: 'Show Google Places results and offer custom pickup',
      onEntry: [
        {
          id: 'display_google_result',
          executor: 'response',
          config: {
            message: `⚠️ **"{{extracted_food.restaurant}}" is not a Mangwale partner restaurant.**\n\nBut don't worry! I found it on Google Maps:\n\n📍 **{{external_search_results.topResult.name}}**\n📌 {{external_search_results.topResult.address}}\n{{#if external_search_results.topResult.rating}}⭐ {{external_search_results.topResult.rating}}{{/if}}\n\n🏍️ **Custom Pickup Available!**\nI can send a rider to pick up your order and deliver it to you.\n\n💡 *Note: Menu & prices not available. You'll need to tell us what to order.*`,
            buttons: [
              { id: 'btn_pickup_here', label: '✅ Yes, pickup from here', value: 'yes order from {{external_search_results.topResult.name}}' },
              { id: 'btn_partners', label: '🍽️ Show Partner Restaurants', value: 'show me partner restaurants' },
              { id: 'btn_different', label: '🔄 Search Different Place', value: 'search for different restaurant' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'handle_external_vendor_response',
        default: 'handle_external_vendor_response',
      },
    },
    
    // NEW: Handle user response to external vendor suggestion
    handle_external_vendor_response: {
      type: 'action',
      description: 'Parse if user wants to order from external vendor',
      actions: [
        {
          id: 'parse_external_response',
          executor: 'llm',
          config: {
            systemPrompt: 'Determine if the user wants to order from the suggested external vendor.',
            prompt: 'User said: "{{user_message}}". Vendor: "{{external_search_results.topResult.name}}". Did they agree to order from there? Return JSON: {"confirmed": true/false, "wants_different": true/false}',
            temperature: 0.1,
            maxTokens: 50,
            parseJson: true
          },
          output: '_external_vendor_response',
        }
      ],
      transitions: {
        success: 'check_external_vendor_confirmation',
        error: 'understand_request',
      }
    },
    
    // NEW: Check if user confirmed external vendor
    check_external_vendor_confirmation: {
      type: 'decision',
      description: 'Route based on user confirmation',
      conditions: [
        {
          expression: 'context._external_vendor_response?.confirmed === true',
          event: 'confirmed',
        },
        {
          expression: 'context._external_vendor_response?.wants_different === true',
          event: 'different',
        }
      ],
      transitions: {
        confirmed: 'setup_external_vendor_pickup',
        different: 'understand_request',
        default: 'understand_request',
      }
    },
    
    // NEW: Set up pickup from external vendor
    setup_external_vendor_pickup: {
      type: 'wait',
      description: 'Show external vendor details and offer parcel order options',
      onEntry: [
        {
          id: 'show_vendor_options',
          executor: 'response',
          config: {
            saveToContext: {
              'is_custom_order': true,
              'is_external_vendor': true,
              'external_vendor': {
                'name': '{{external_search_results.topResult.name}}',
                'address': '{{external_search_results.topResult.address}}',
                'lat': '{{external_search_results.topResult.lat}}',
                'lng': '{{external_search_results.topResult.lng}}',
                'maps_link': '{{external_search_results.topResult.maps_link}}',
                'place_id': '{{external_search_results.topResult.place_id}}'
              }
            },
            message: `⚠️ **Not a Mangwale Partner**\n\n📍 **{{external_search_results.topResult.name}}**\n📌 {{external_search_results.topResult.address}}\n🗺️ [View on Google Maps]({{external_search_results.topResult.maps_link}})\n\n🏍️ **Custom Pickup Service:**\nWe'll send a rider to this location to pick up your order.\n\n💡 *You'll need to call the store to place your order, or tell us what to pick up.*`,
            buttons: [
              { id: 'btn_create_parcel', label: '🏍️ Create Pickup Order', value: 'create parcel pickup' },
              { id: 'btn_partners', label: '🍽️ Show Partners', value: 'show partner restaurants' },
              { id: 'btn_call', label: '📞 Get Contact Info', value: 'call store' },
              { id: 'btn_different', label: '🔄 Search Different', value: 'search different place' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'handle_external_vendor_action',
        default: 'handle_external_vendor_action',
      }
    },
    
    // Handle user action choice for external vendor
    handle_external_vendor_action: {
      type: 'action',
      description: 'Parse what user wants to do with external vendor',
      actions: [
        {
          id: 'parse_action',
          executor: 'llm',
          config: {
            prompt: 'User said: "{{user_message}}". What do they want? Options: 1) create_parcel - create pickup/delivery order, 2) share_details - share vendor info, 3) call_store - call the store, 4) search_different - look for different place. Return JSON: {"action": "create_parcel|share_details|call_store|search_different"}',
            temperature: 0.1,
            maxTokens: 30,
            parseJson: true
          },
          output: '_vendor_action',
        }
      ],
      transitions: {
        success: 'route_external_vendor_action',
        error: 'setup_external_vendor_pickup',
      }
    },
    
    // Route based on user's choice
    route_external_vendor_action: {
      type: 'decision',
      conditions: [
        { expression: 'context._vendor_action?.action === "create_parcel"', event: 'create_parcel' },
        { expression: 'context._vendor_action?.action === "share_details"', event: 'share_details' },
        { expression: 'context._vendor_action?.action === "call_store"', event: 'call_store' },
        { expression: 'context._vendor_action?.action === "search_different"', event: 'search_different' },
      ],
      transitions: {
        create_parcel: 'confirm_parcel_delivery_address',
        share_details: 'share_external_vendor_details',
        call_store: 'show_store_contact',
        search_different: 'understand_request',
        default: 'setup_external_vendor_pickup',
      }
    },
    
    // Share vendor details
    share_external_vendor_details: {
      type: 'wait',
      description: 'Share external vendor details that user can forward',
      onEntry: [
        {
          id: 'share_msg',
          executor: 'response',
          config: {
            message: `📍 **Store Details**\n\n🏪 **{{external_vendor.name}}**\n📌 {{external_vendor.address}}\n\n🗺️ Google Maps: {{external_vendor.maps_link}}\n\n_Copy and share this with friends!_`,
            buttons: [
              { id: 'btn_create', label: '🏍️ Create Pickup Order', value: 'create parcel pickup' },
              { id: 'btn_back', label: '⬅️ Back', value: 'go back' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'handle_external_vendor_action',
        default: 'handle_external_vendor_action',
      }
    },
    
    // Show store contact (placeholder - would need phone from Places API)
    show_store_contact: {
      type: 'wait',
      description: 'Show store contact info',
      onEntry: [
        {
          id: 'contact_msg',
          executor: 'response',
          config: {
            message: `📞 **Contact {{external_vendor.name}}**\n\n📌 {{external_vendor.address}}\n\n💡 You can find their contact number on Google Maps:\n🗺️ {{external_vendor.maps_link}}`,
            buttons: [
              { id: 'btn_create', label: '🏍️ Create Pickup Order', value: 'create parcel pickup' },
              { id: 'btn_back', label: '⬅️ Back', value: 'go back' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'handle_external_vendor_action',
        default: 'handle_external_vendor_action',
      }
    },
    
    // Confirm delivery address for parcel
    confirm_parcel_delivery_address: {
      type: 'wait',
      description: 'Confirm user delivery address for parcel pickup',
      onEntry: [
        {
          id: 'confirm_delivery',
          executor: 'response',
          config: {
            message: `🏍️ **Parcel Pickup Order**\n\n📦 **Pickup:** {{external_vendor.name}}\n📌 {{external_vendor.address}}\n\n🏠 **Deliver to:** {{or delivery_address.formatted_address location.formatted_address "Your current location"}}\n\n✅ Confirm delivery address?`,
            buttons: [
              { id: 'btn_confirm', label: '✅ Confirm & Create Order', value: 'confirm delivery address' },
              { id: 'btn_change', label: '📍 Change Delivery Address', value: 'change address' },
              { id: 'btn_cancel', label: '❌ Cancel', value: 'cancel' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'handle_parcel_address_confirmation',
        location: 'save_parcel_delivery_location',
        default: 'handle_parcel_address_confirmation',
      }
    },
    
    // Save delivery location from GPS
    save_parcel_delivery_location: {
      type: 'action',
      description: 'Save GPS location for parcel delivery',
      actions: [
        {
          id: 'save_delivery_loc',
          executor: 'response',
          config: {
            saveToContext: {
              'parcel_delivery_location': {
                'lat': '{{location.lat}}',
                'lng': '{{location.lng}}',
                'address': '{{or location.address location.formatted_address "Shared location"}}',
              }
            },
            message: '📍 Delivery location saved! Creating your order...',
          },
        }
      ],
      transitions: {
        success: 'create_simple_parcel_order',
      }
    },
    
    // Handle parcel address confirmation
    handle_parcel_address_confirmation: {
      type: 'action',
      description: 'Parse user confirmation for parcel delivery',
      actions: [
        {
          id: 'parse_confirm',
          executor: 'llm',
          config: {
            prompt: 'User said: "{{user_message}}". Did they: 1) confirm the delivery address, 2) want to change address, or 3) cancel? Return JSON: {"action": "confirm|change|cancel"}',
            temperature: 0.1,
            maxTokens: 30,
            parseJson: true
          },
          output: '_parcel_confirm',
        }
      ],
      transitions: {
        success: 'route_parcel_confirmation',
        error: 'confirm_parcel_delivery_address',
      }
    },
    
    // Route parcel confirmation
    route_parcel_confirmation: {
      type: 'decision',
      conditions: [
        { expression: 'context._parcel_confirm?.action === "confirm"', event: 'confirm' },
        { expression: 'context._parcel_confirm?.action === "change"', event: 'change' },
        { expression: 'context._parcel_confirm?.action === "cancel"', event: 'cancel' },
      ],
      transitions: {
        confirm: 'create_simple_parcel_order',
        change: 'ask_new_delivery_address',
        cancel: 'order_cancelled',
        default: 'confirm_parcel_delivery_address',
      }
    },
    
    // Ask for new delivery address
    ask_new_delivery_address: {
      type: 'wait',
      description: 'Ask user for new delivery address',
      onEntry: [
        {
          id: 'ask_address',
          executor: 'response',
          config: {
            message: '📍 Please share your delivery location or type your address:',
            buttons: [
              { id: 'btn_share', label: '📍 Share Location', value: '__LOCATION__' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'parse_new_delivery_address',
        location: 'save_parcel_delivery_location',
      }
    },
    
    // Parse typed delivery address
    parse_new_delivery_address: {
      type: 'action',
      description: 'Parse user-typed delivery address',
      actions: [
        {
          id: 'geocode_delivery',
          executor: 'external_search',
          config: {
            query: '{{user_message}}',
            city: '{{or location.city "Nashik"}}',
            type: 'geocode',
            radius: 25000,
          },
          output: 'parsed_delivery_address',
        }
      ],
      transitions: {
        found: 'confirm_parsed_delivery_address',
        not_found: 'ask_new_delivery_address',
        error: 'ask_new_delivery_address',
      }
    },
    
    // Confirm parsed delivery address
    confirm_parsed_delivery_address: {
      type: 'wait',
      description: 'Confirm the parsed delivery address',
      onEntry: [
        {
          id: 'confirm_parsed',
          executor: 'response',
          config: {
            saveToContext: {
              'parcel_delivery_location': {
                'lat': '{{parsed_delivery_address.topResult.lat}}',
                'lng': '{{parsed_delivery_address.topResult.lng}}',
                'address': '{{parsed_delivery_address.topResult.address}}',
              }
            },
            message: '📍 Is this your delivery address?\n\n**{{parsed_delivery_address.topResult.address}}**',
            buttons: [
              { id: 'btn_yes', label: '✅ Yes', value: 'yes correct' },
              { id: 'btn_no', label: '❌ No, try again', value: 'no wrong' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'handle_delivery_address_verify',
        default: 'handle_delivery_address_verify',
      }
    },
    
    // Handle delivery address verification
    handle_delivery_address_verify: {
      type: 'action',
      description: 'Check if user confirmed delivery address',
      actions: [
        {
          id: 'verify',
          executor: 'llm',
          config: {
            prompt: 'User said: "{{user_message}}". Did they confirm yes or no? Return JSON: {"confirmed": true/false}',
            temperature: 0.1,
            maxTokens: 20,
            parseJson: true
          },
          output: '_delivery_verify',
        }
      ],
      transitions: {
        success: 'check_delivery_verified',
        error: 'ask_new_delivery_address',
      }
    },
    
    // Check delivery verified
    check_delivery_verified: {
      type: 'decision',
      conditions: [
        { expression: 'context._delivery_verify?.confirmed === true', event: 'confirmed' },
      ],
      transitions: {
        confirmed: 'create_simple_parcel_order',
        default: 'ask_new_delivery_address',
      }
    },
    
    // CREATE THE SIMPLE PARCEL ORDER
    create_simple_parcel_order: {
      type: 'action',
      description: 'Create simple parcel pickup-drop order',
      actions: [
        {
          id: 'create_order',
          executor: 'response',
          config: {
            saveToContext: {
              'order_type': 'parcel_pickup',
              'order_status': 'created',
              'parcel_order': {
                'pickup': {
                  'name': '{{external_vendor.name}}',
                  'address': '{{external_vendor.address}}',
                  'lat': '{{external_vendor.lat}}',
                  'lng': '{{external_vendor.lng}}',
                },
                'drop': {
                  'address': '{{or parcel_delivery_location.address delivery_address.formatted_address location.formatted_address}}',
                  'lat': '{{or parcel_delivery_location.lat delivery_address.lat location.lat}}',
                  'lng': '{{or parcel_delivery_location.lng delivery_address.lng location.lng}}',
                },
                'created_at': '{{now}}',
              }
            },
            message: `🎉 **Parcel Order Created!**\n\n📦 **Pickup From:**\n🏪 {{external_vendor.name}}\n📌 {{external_vendor.address}}\n\n🏠 **Deliver To:**\n📍 {{or parcel_delivery_location.address delivery_address.formatted_address location.formatted_address "Your location"}}\n\n⏱️ **Estimated:** 30-45 minutes\n\n🏍️ Our delivery partner will:\n1️⃣ Go to the pickup location\n2️⃣ Collect your order (you can call to place order)\n3️⃣ Deliver it to you\n\n💰 **Payment:** Cash on delivery\n\n📞 You'll receive a call when rider is assigned!`,
            buttons: [
              { id: 'btn_track', label: '📍 Track Order', value: 'track my order' },
              { id: 'btn_call_store', label: '📞 Call Store Now', value: 'call store' },
              { id: 'btn_home', label: '🏠 Home', value: 'go to home' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'understand_request',
      }
    },
    
    // Fallback: Manual custom pickup when nothing found
    offer_custom_pickup_manual: {
      type: 'wait',
      description: 'Offer manual address entry for custom pickup',
      actions: [
        {
          id: 'custom_pickup_msg',
          executor: 'response',
          config: {
            message: `❌ **"{{extracted_food.restaurant}}" is not available**\n\nThis restaurant is neither a Mangwale partner nor found on Google Maps.\n\n🏍️ **Custom Pickup Option:**\nYou can still order from ANY place! Just:\n\n1️⃣ Share the **location/address** of the restaurant\n2️⃣ Tell us what to **order**\n3️⃣ We'll pick it up & deliver!\n\n📍 Share the pickup location below:`,
            buttons: [
              { id: 'btn_share_location', label: '📍 Share Location', value: '__LOCATION__' },
              { id: 'btn_browse', label: '🍽️ Browse Partner Restaurants', value: 'show me partner restaurants' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'handle_custom_pickup_location',
        location: 'save_custom_pickup_location',
        default: 'handle_custom_pickup_location',
      }
    },
    
    // Handle custom pickup location from user message (address text)
    handle_custom_pickup_location: {
      type: 'action',
      description: 'Parse user-provided pickup location/address',
      actions: [
        {
          id: 'geocode_address',
          executor: 'external_search',
          config: {
            query: '{{user_message}}',
            city: '{{or location.city "Nashik"}}',
            type: 'establishment',
            radius: 25000,
          },
          output: 'custom_pickup_search',
        }
      ],
      transitions: {
        found: 'confirm_custom_pickup_location',
        not_found: 'request_exact_location',
        error: 'request_exact_location',
      }
    },
    
    // Save location shared directly via GPS/map
    save_custom_pickup_location: {
      type: 'action',
      description: 'Save GPS location shared by user for custom pickup',
      actions: [
        {
          id: 'save_gps_location',
          executor: 'response',
          config: {
            saveToContext: {
              'is_custom_order': true,
              'custom_pickup_location': {
                'lat': '{{location.lat}}',
                'lng': '{{location.lng}}',
                'address': '{{or location.address "Custom pickup location"}}',
                'source': 'gps'
              }
            },
            message: '📍 Got your pickup location!\n\n📝 Now tell me what you\'d like me to order from there.\n\n💡 Example: "2 butter chicken, 3 naan, 1 dal makhani"',
          },
        }
      ],
      transitions: {
        user_message: 'capture_custom_order_items',
      }
    },
    
    // Confirm parsed pickup location
    confirm_custom_pickup_location: {
      type: 'wait',
      description: 'Confirm the parsed pickup address with user',
      actions: [
        {
          id: 'confirm_location',
          executor: 'response',
          config: {
            message: '📍 I found this location:\n\n**{{custom_pickup_search.topResult.name}}**\n{{custom_pickup_search.topResult.address}}\n\nIs this correct?',
            buttons: [
              { id: 'btn_yes', label: '✅ Yes, this is it', value: 'yes correct' },
              { id: 'btn_no', label: '❌ No, try again', value: 'no wrong location' },
              { id: 'btn_share', label: '📍 Share GPS Location', value: '__LOCATION__' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'handle_location_confirmation',
        location: 'save_custom_pickup_location',
        default: 'handle_location_confirmation',
      }
    },
    
    // Handle location confirmation response
    handle_location_confirmation: {
      type: 'action',
      description: 'Check if user confirmed the location',
      actions: [
        {
          id: 'parse_confirmation',
          executor: 'llm',
          config: {
            prompt: 'User said: "{{user_message}}". Did they confirm the location is correct? Return JSON: {"confirmed": true/false}',
            temperature: 0.1,
            maxTokens: 30,
            parseJson: true
          },
          output: '_location_confirmation',
        }
      ],
      transitions: {
        success: 'check_location_confirmed',
        error: 'request_exact_location',
      }
    },
    
    // Check confirmation result
    check_location_confirmed: {
      type: 'decision',
      conditions: [
        {
          expression: 'context._location_confirmation?.confirmed === true',
          event: 'confirmed',
        }
      ],
      transitions: {
        confirmed: 'finalize_custom_pickup_location',
        default: 'request_exact_location',
      }
    },
    
    // Finalize custom pickup location
    finalize_custom_pickup_location: {
      type: 'action',
      description: 'Save confirmed custom pickup location',
      actions: [
        {
          id: 'save_confirmed_location',
          executor: 'response',
          config: {
            saveToContext: {
              'is_custom_order': true,
              'custom_pickup_location': {
                'name': '{{custom_pickup_search.topResult.name}}',
                'address': '{{custom_pickup_search.topResult.address}}',
                'lat': '{{custom_pickup_search.topResult.lat}}',
                'lng': '{{custom_pickup_search.topResult.lng}}',
                'maps_link': '{{custom_pickup_search.topResult.maps_link}}',
                'source': 'search'
              }
            },
            message: '✅ Location saved!\n\n📝 What would you like me to order from **{{custom_pickup_search.topResult.name}}**?\n\n💡 Example: "2 pizzas, 1 coke, garlic bread"',
          },
        }
      ],
      transitions: {
        user_message: 'capture_custom_order_items',
      }
    },
    
    // Request exact location when parsing fails
    request_exact_location: {
      type: 'wait',
      description: 'Ask user for exact location',
      actions: [
        {
          id: 'ask_location',
          executor: 'response',
          config: {
            message: '📍 I couldn\'t find that location. Please:\n\n• Share your **GPS location** using the button below, or\n• Type the **exact address** with landmarks',
            buttons: [
              { id: 'btn_share', label: '📍 Share Location', value: '__LOCATION__' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'handle_custom_pickup_location',
        location: 'save_custom_pickup_location',
      }
    },
    
    // Capture custom order items
    capture_custom_order_items: {
      type: 'action',
      description: 'Parse user-specified items for custom pickup order',
      actions: [
        {
          id: 'parse_items',
          executor: 'llm',
          config: {
            systemPrompt: 'Extract food items and quantities from user message. Be generous with interpretation.',
            prompt: 'User said: "{{user_message}}". Extract items and quantities as JSON: {"items": [{"name": "item name", "quantity": 1, "notes": "any special notes"}], "has_items": true/false}',
            temperature: 0.1,
            maxTokens: 200,
            parseJson: true
          },
          output: 'custom_order_items',
        }
      ],
      transitions: {
        success: 'check_custom_items_captured',
        error: 'ask_custom_items_again',
      }
    },
    
    // Check if items were captured
    check_custom_items_captured: {
      type: 'decision',
      conditions: [
        {
          expression: 'context.custom_order_items?.has_items === true && context.custom_order_items?.items?.length > 0',
          event: 'has_items',
        }
      ],
      transitions: {
        has_items: 'confirm_custom_order',
        default: 'ask_custom_items_again',
      }
    },
    
    // Ask for items again
    ask_custom_items_again: {
      type: 'wait',
      description: 'Ask user to specify items again',
      actions: [
        {
          id: 'ask_items',
          executor: 'response',
          config: {
            message: '📝 I couldn\'t catch the items. Please tell me exactly what you want to order.\n\n💡 Example: "2 butter chicken, 3 naan, 1 dal fry, 2 coke"',
          },
        }
      ],
      transitions: {
        user_message: 'capture_custom_order_items',
      }
    },
    
    // Confirm custom order
    confirm_custom_order: {
      type: 'wait',
      description: 'Show order summary for custom pickup',
      actions: [
        {
          id: 'show_summary',
          executor: 'response',
          config: {
            message: '📋 **Custom Order Summary**\n\n🏪 **Pickup from:** {{or custom_pickup_location.name external_search_results.topResult.name}}\n📍 {{or custom_pickup_location.address external_search_results.topResult.address}}\n\n🛒 **Items:**\n{{#each custom_order_items.items}}• {{quantity}}x {{name}}{{#if notes}} ({{notes}}){{/if}}\n{{/each}}\n\n📦 **Delivery to:** {{or delivery_address.formatted_address location.formatted_address "Your location"}}\n\n💰 Price will be confirmed after pickup.\n\nConfirm to proceed?',
            buttons: [
              { id: 'btn_confirm', label: '✅ Confirm Order', value: 'confirm custom order' },
              { id: 'btn_edit', label: '✏️ Edit Items', value: 'edit items' },
              { id: 'btn_cancel', label: '❌ Cancel', value: 'cancel order' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'handle_custom_order_confirmation',
        default: 'handle_custom_order_confirmation',
      }
    },
    
    // Handle custom order confirmation
    handle_custom_order_confirmation: {
      type: 'action',
      description: 'Parse user confirmation for custom order',
      actions: [
        {
          id: 'parse_confirm',
          executor: 'llm',
          config: {
            prompt: 'User said: "{{user_message}}". Did they: 1) Confirm order, 2) Want to edit, or 3) Cancel? Return JSON: {"action": "confirm|edit|cancel"}',
            temperature: 0.1,
            maxTokens: 30,
            parseJson: true
          },
          output: '_custom_order_action',
        }
      ],
      transitions: {
        success: 'route_custom_order_action',
        error: 'confirm_custom_order',
      }
    },
    
    // Route based on user action
    route_custom_order_action: {
      type: 'decision',
      conditions: [
        { expression: 'context._custom_order_action?.action === "confirm"', event: 'confirm' },
        { expression: 'context._custom_order_action?.action === "edit"', event: 'edit' },
        { expression: 'context._custom_order_action?.action === "cancel"', event: 'cancel' },
      ],
      transitions: {
        confirm: 'create_custom_order',
        edit: 'ask_custom_items_again',
        cancel: 'order_cancelled',
        default: 'confirm_custom_order',
      }
    },
    
    // Create the custom order
    create_custom_order: {
      type: 'action',
      description: 'Create parcel order for custom pickup',
      actions: [
        {
          id: 'create_parcel',
          executor: 'response',
          config: {
            message: '🎉 **Order Created!**\n\nOur delivery partner will:\n1️⃣ Pick up from {{or custom_pickup_location.name external_search_results.topResult.name}}\n2️⃣ Collect your items\n3️⃣ Deliver to you\n\n📞 You\'ll receive a call to confirm the order amount.\n\n🔔 Track your order for live updates!',
            saveToContext: {
              'order_type': 'custom_pickup',
              'order_status': 'pending_partner',
            },
            buttons: [
              { id: 'btn_track', label: '📍 Track Order', value: 'track my order' },
              { id: 'btn_home', label: '🏠 Back to Home', value: 'go to home' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'understand_request',
      }
    },
    
    // Order cancelled
    order_cancelled: {
      type: 'action',
      description: 'Confirm order cancellation',
      actions: [
        {
          id: 'cancel_msg',
          executor: 'response',
          config: {
            message: '❌ Order cancelled. No worries!\n\nAnything else I can help you with?',
            buttons: [
              { id: 'btn_browse', label: '🍽️ Browse Food', value: 'show me food' },
              { id: 'btn_home', label: '🏠 Home', value: 'go home' },
            ],
          },
        }
      ],
      transitions: {
        user_message: 'understand_request',
      }
    },

    search_food: {
      type: 'action',
      description: 'Smart search with spell correction, synonyms, and ML reranking',
      actions: [
        {
          id: 'search_items',
          executor: 'search',
          config: {
            index: 'food_items',
            query: '{{extracted_food.search_query}}',
            size: 15,
            module_id: 4,
            fields: ['name', 'category_name', 'description', 'store_name'],
            formatForUi: true,
            lat: '{{location.lat}}',
            lng: '{{location.lng}}',
            radius: '5km',
            useSmartSearch: true,
          },
          output: 'search_results',
        },
      ],
      transitions: {
        items_found: 'check_auto_select',  // Check if we should auto-select based on extracted quantities
        no_items: 'analyze_no_results',
        error: 'analyze_no_results', // Handle search errors gracefully
      },
    },

    // 🆕 Check if user specified quantities that we should auto-select
    // 🚀 CHANGED: Auto-select ONLY if items exist AND user explicitly mentioned them
    check_auto_select: {
      type: 'decision',
      description: 'Check if extracted_food has EXPLICIT items to auto-add to cart',
      conditions: [
        {
          // ✅ VALIDATION: Only auto-cart if:
          // 1. Items extracted with quantity >= 1
          // 2. User's original message contained EACH food name (validates ALL items, not just first)
          // 3. OR Restaurant context exists (e.g., "ganesh ka paneer")
          // This prevents auto-cart on hallucinated items!
          expression: `
            context.extracted_food?.items && 
            context.extracted_food.items.length > 0 && 
            context.extracted_food.items[0]?.quantity >= 1 &&
            (
              // Verify user message contains extracted item names (ALL items, not just first)
              (context._user_message && context.extracted_food.items.every(function(item) {
                if (!item.name) return false;
                var msg = context._user_message.toLowerCase();
                var words = item.name.toLowerCase().split(' ');
                // At least the first word of each extracted item must appear in user message
                return words.some(function(w) { return w.length > 2 && msg.indexOf(w) >= 0; });
              })) ||
              // OR user explicitly mentioned restaurant (e.g., "ganesh ka paneer")
              (context.extracted_food?.restaurant && context.extracted_food.restaurant !== null && context.extracted_food.restaurant !== "null")
            )
          `,
          event: 'auto_select',
        }
      ],
      transitions: {
        auto_select: 'auto_match_items',
        default: 'show_results',  // Vague query → show results for manual selection
      },
    },

    // 🆕 Auto-match extracted items with search results and add to cart
    auto_match_items: {
      type: 'action',
      description: 'Match extracted items with quantities against search results and add to cart',
      actions: [
        {
          id: 'match_and_add',
          executor: 'auto_cart',  // New executor that matches items and sets cart
          config: {
            extractedItemsPath: 'extracted_food.items',
            searchResultsPath: 'search_results.cards',
          },
          output: 'auto_cart_result',
        },
      ],
      transitions: {
        all_matched: 'confirm_auto_cart',      // All items matched - show confirmation
        partial_match: 'confirm_auto_cart',    // Some matched - show what we found
        needs_disambiguation: 'disambiguate_items',  // Multiple similar items - ask user to choose
        no_match: 'show_results',              // Nothing matched - show results for manual selection
        error: 'show_results',
      },
    },

    // 🆕 Ask user to choose between similar items, then show product cards
    disambiguate_items: {
      type: 'action',
      description: 'Show disambiguation message listing similar items, then show product cards for selection',
      actions: [
        {
          id: 'show_disambiguation_msg',
          executor: 'response',
          config: {
            message: '{{auto_cart_result.message}}',
            saveToContext: {
              _disambiguation_qty: '{{auto_cart_result.disambiguationQuantity}}',
            },
          },
        },
      ],
      transitions: {
        // Route to existing show_results which displays product cards for manual selection
        default: 'show_results',
      },
    },

    // 🆕 Show auto-matched cart and ask for confirmation
    confirm_auto_cart: {
      type: 'wait',
      description: 'Show auto-added items and ask for confirmation',
      onEntry: [
        {
          id: 'show_cart_confirmation',
          executor: 'response',
          config: {
            // Enhanced message for express orders showing delivery info - payment shown later in checkout
            message: '{{auto_cart_result.message}}{{#if _delivery_address_type}}\n\n📍 Delivery: {{_delivery_address_type}}{{/if}}\n\n**Ready to proceed to checkout?**',
            // Show cart items as cards for mobile-friendly display
            cardsPath: 'auto_cart_result.selectedItems',
            buttons: [
              { id: 'btn_confirm', label: '✅ Proceed to Checkout', value: 'checkout' },
              { id: 'btn_modify', label: '✏️ Modify Cart', value: 'show cart' }
            ],
            saveToContext: {
              cart_items: '{{auto_cart_result.selectedItems}}',
              selected_items: '{{auto_cart_result.selectedItems}}',
            },
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'handle_auto_cart_response',
        default: 'handle_auto_cart_response',
      },
    },

    // 🆕 Handle response to auto-cart
    // 🚀 AGENTIC: Using NLU-based conditions instead of .includes()
    handle_auto_cart_response: {
      type: 'action',
      description: 'Use NLU to classify user response to auto-cart',
      actions: [
        {
          id: 'classify_auto_cart_response',
          executor: 'nlu_condition',
          config: {
            intents: ['confirm_checkout', 'confirm_action', 'checkout'],
            minConfidence: 0.5,
          },
          output: 'checkout_check',
        },
      ],
      transitions: {
        matched: 'check_auth_for_checkout',
        not_matched: 'check_cart_modify_intent',
        default: 'check_auth_for_checkout',
      },
    },

    // 🚀 AGENTIC: Check if user wants to modify cart
    check_cart_modify_intent: {
      type: 'action',
      description: 'Check if user wants to modify cart via NLU',
      actions: [
        {
          id: 'classify_cart_modify',
          executor: 'nlu_condition',
          config: {
            intents: ['modify_cart', 'remove_item', 'view_cart'],
            minConfidence: 0.5,
          },
          output: 'cart_modify_check',
        },
      ],
      transitions: {
        matched: 'show_current_cart',
        not_matched: 'check_auth_for_checkout',
        default: 'check_auth_for_checkout',
      },
    },

    // 🏪 Show partner stores/restaurants nearby
    show_partner_stores: {
      type: 'action',
      description: 'Search for partner stores nearby',
      actions: [
        {
          id: 'search_partner_stores',
          executor: 'search',
          config: {
            index: 'stores',
            query: '*',
            size: 10,
            lat: '{{location.lat}}',
            lng: '{{location.lng}}',
            radius: '10km',
            fields: ['name', 'address', 'category', 'rating'],
            formatForUi: true,
          },
          output: 'partner_store_results',
        },
      ],
      transitions: {
        items_found: 'display_partner_stores',
        no_items: 'no_partner_stores_found',
        error: 'show_recommendations',
        default: 'display_partner_stores',
      },
    },

    // Display partner stores
    display_partner_stores: {
      type: 'wait',
      description: 'Show partner stores and wait for selection',
      onEntry: [
        {
          id: 'show_store_list',
          executor: 'response',
          config: {
            message: '🏪 Here are Mangwale partner restaurants near you:\n\nTap on any store to see their menu!',
            responseType: 'cards',
            dynamicMetadata: {
              cards: 'partner_store_results.cards'
            },
          },
          output: '_last_response',
        }
      ],
      transitions: {
        user_message: 'understand_request',
        item_selected: 'handle_store_selection',
        default: 'understand_request',
      },
    },

    // No partner stores found
    no_partner_stores_found: {
      type: 'wait',
      description: 'No partner stores found nearby',
      onEntry: [
        {
          id: 'no_stores_msg',
          executor: 'response',
          config: {
            message: '😔 No partner restaurants found in your area yet.\n\nWe are expanding soon! In the meantime, try these popular items:',
            responseType: 'text',
          },
          output: '_last_response',
        }
      ],
      transitions: {
        default: 'show_recommendations',
      },
    },

    // Handle store selection
    handle_store_selection: {
      type: 'action',
      description: 'User selected a store, search for their items',
      actions: [
        {
          id: 'search_store_items',
          executor: 'search',
          config: {
            index: 'food_items',
            query: '{{_user_message}}',
            size: 10,
            lat: '{{location.lat}}',
            lng: '{{location.lng}}',
            fields: ['name', 'store_name', 'category', 'price'],
            formatForUi: true,
          },
          output: 'search_results',
        },
      ],
      transitions: {
        items_found: 'show_results',
        no_items: 'show_recommendations',
        default: 'show_results',
      },
    },

    // Show food categories for browsing
    show_categories: {
      type: 'action',
      description: 'Show food categories for user to browse',
      actions: [
        {
          id: 'get_categories',
          executor: 'search',
          config: {
            type: 'categories',
            index: 'food_items',
            limit: 8,
          },
          output: 'category_results',
        },
      ],
      transitions: {
        success: 'display_categories',
        error: 'show_recommendations',  // Fallback to recommendations
        default: 'display_categories',
      },
    },

    // Display categories to user
    display_categories: {
      type: 'wait',
      description: 'Show categories and wait for selection',
      onEntry: [
        {
          id: 'show_category_list',
          executor: 'response',
          config: {
            message: '📋 Choose a category to explore:',
            responseType: 'buttons',
            buttonsPath: 'category_results',
            buttonConfig: { labelPath: 'name', valuePath: 'id' },
          },
        }
      ],
      transitions: {
        user_message: 'search_by_category',
        default: 'search_by_category',
      },
    },

    // Search items by selected category (uses dedicated category endpoint)
    search_by_category: {
      type: 'action',
      description: 'Search items in selected category',
      actions: [
        {
          id: 'search_category_items',
          executor: 'search',
          config: {
            type: 'category_items',
            index: 'food_items',
            categoryId: '{{_user_message}}',
            size: 10,
            lat: '{{location.lat}}',
            lng: '{{location.lng}}',
            zone_id: '{{zone_id}}',
          },
          output: 'search_results',
        },
      ],
      transitions: {
        items_found: 'show_results',
        no_items: 'no_results',
        error: 'no_results',
        default: 'show_results',
      },
    },

    // Show popular/recommended items - TIME-AWARE & PERSONALIZED
    show_recommendations: {
      type: 'action',
      description: 'Show time-aware personalized recommendations',
      actions: [
        {
          id: 'get_recommendations',
          executor: 'search',
          config: {
            index: 'food_items',
            // 🕐 recommendation mode: auto-generates time-of-day terms + user history
            query: 'recommendation',
            queryMode: 'recommendation',
            size: 10,
            fields: ['name', 'category_name', 'description', 'store_name'],
            formatForUi: true,
            sortBy: 'rating',
            lat: '{{location.lat}}',
            lng: '{{location.lng}}',
            radius: '15km',
          },
          output: 'recommendation_results',
        },
      ],
      transitions: {
        items_found: 'display_recommendations',
        no_items: 'show_categories',
        error: 'show_categories',
      },
    },

    // Display recommendations to user
    display_recommendations: {
      type: 'wait',
      description: 'Show recommended items as cards',
      onEntry: [
        {
          id: 'show_recs',
          executor: 'response',
          config: {
            message: '{{#if _location_just_received}}📍 Got your location!\n\n{{/if}}{{#if recommendation_results._greeting}}{{recommendation_results._greeting}}{{else}}🎉 Yeh dekho popular items:{{/if}}\n\nKisi bhi item pe tap karo order karne ke liye! 👇',
            cardsPath: 'recommendation_results.cards',
            buttons: [
              { id: 'btn_view_cart', label: '📋 View Cart', value: 'show cart' },
              { id: 'btn_browse', label: '📋 Browse Categories', value: 'browse_menu' },
              { id: 'btn_search', label: '🔍 Search', value: 'search_different' },
            ],
            saveToContext: {
              _location_just_received: false,
            },
          },
          output: '_last_response',
        }
      ],
      transitions: {
        user_message: 'copy_recs_to_search_results',
        item_selected: 'process_selection',
        default: 'copy_recs_to_search_results',
      }
    },

    // 🔧 FIX: Copy recommendation cards to search_results so selection executor can find them
    // Without this, clicking ADD on recommendation cards fails because selection executor
    // reads from search_results but recommendations are stored as recommendation_results
    copy_recs_to_search_results: {
      type: 'action',
      description: 'Copy recommendation_results to search_results for selection processing',
      actions: [
        {
          id: 'copy_recs',
          executor: 'response',
          config: {
            skipResponse: true,
            saveToContext: {
              search_results: '{{recommendation_results}}',
            },
          },
        },
      ],
      transitions: {
        success: 'resolve_user_intent',
        default: 'resolve_user_intent',
      },
    },

    // 🚀 Search for fastest delivery options - now uses recommendation mode
    search_fastest_delivery: {
      type: 'action',
      description: 'Search for nearby restaurants sorted by delivery time',
      actions: [
        {
          id: 'search_fast_delivery',
          executor: 'search',
          config: {
            index: 'food_items',
            query: 'recommendation',
            queryMode: 'recommendation',
            size: 10,
            fields: ['name', 'category_name', 'description', 'store_name'],
            formatForUi: true,
            sortBy: 'delivery_time',
            lat: '{{location.lat}}',
            lng: '{{location.lng}}',
            radius: '5km',
          },
          output: 'fast_delivery_results',
        },
      ],
      transitions: {
        items_found: 'show_fast_delivery_results',
        no_items: 'show_recommendations',
        error: 'show_recommendations',
      },
    },

    // Show fast delivery results
    show_fast_delivery_results: {
      type: 'wait',
      description: 'Show restaurants with fastest delivery',
      onEntry: [
        {
          id: 'show_fast_options',
          executor: 'response',
          config: {
            message: '⚡ Here are the fastest delivery options near you! These restaurants can deliver quickly:',
            dynamicMetadata: {
              cards: 'fast_delivery_results.cards'
            }
          },
          output: '_last_response',
        }
      ],
      transitions: {
        user_message: 'copy_fast_delivery_to_search_results',
        item_selected: 'process_selection',
        default: 'copy_fast_delivery_to_search_results',
      }
    },

    // 🔧 FIX: Copy fast delivery cards to search_results for selection executor
    copy_fast_delivery_to_search_results: {
      type: 'action',
      description: 'Copy fast_delivery_results to search_results for selection processing',
      actions: [
        {
          id: 'copy_fast',
          executor: 'response',
          config: {
            skipResponse: true,
            saveToContext: {
              search_results: '{{fast_delivery_results}}',
            },
          },
        },
      ],
      transitions: {
        success: 'resolve_user_intent',
        default: 'resolve_user_intent',
      },
    },

    // No recommendations fallback
    no_recommendations: {
      type: 'wait',
      description: 'No recommendations available - show categories instead',
      actions: [
        {
          id: 'no_recs_msg',
          executor: 'response',
          config: {
            message: '🍽️ Hamare paas bahut kuch hai! Choose karo kya khana hai:\n\n• 🍕 Pizza\n• 🍔 Burger\n• 🍛 Biryani\n• 🥟 Momos\n• 🥪 Sandwich\n\nYa fir directly bolo kya chahiye!',
            responseType: 'text',
            buttons: [
              { id: 'btn_pizza', label: '🍕 Pizza', value: 'pizza' },
              { id: 'btn_biryani', label: '🍛 Biryani', value: 'biryani' },
              { id: 'btn_burger', label: '🍔 Burger', value: 'burger' },
              { id: 'btn_momos', label: '🥟 Momos', value: 'momos' },
            ],
          },
          output: '_last_response',
        }
      ],
      transitions: {
        user_message: 'understand_request',
        pizza: 'process_specific_food',
        biryani: 'process_specific_food',
        burger: 'process_specific_food',
        momos: 'process_specific_food',
        default: 'understand_request',
      }
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
          event: 'search_external', // First try Google Places search
        }
      ],
      transitions: {
        search_external: 'search_external_vendor', // NEW: Search Google Places first
        default: 'no_results',
      }
    },

    // NEW: Search Google Places for external vendor
    search_external_vendor: {
      type: 'action',
      description: 'Search Google Places for the restaurant not in our database',
      actions: [
        {
          id: 'external_search',
          executor: 'external_search',
          config: {
            query: '{{_failure_analysis.restaurant_name}}',
            location: '{{or location.city "Nashik"}}',
            type: 'restaurant',
            radius: 25000, // 25km radius
            lat: '{{location.lat}}',
            lng: '{{location.lng}}',
          },
          output: 'external_search_results',
        }
      ],
      transitions: {
        found: 'show_external_results',
        not_found: 'offer_custom_pickup',
        error: 'offer_custom_pickup',
      }
    },

    // NEW: Show external search results
    show_external_results: {
      type: 'wait',
      description: 'Display Google Places results to user',
      actions: [
        {
          id: 'display_external',
          executor: 'response',
          config: {
            message: '{{external_search_results.chatMessage}}',
            dynamicMetadata: {
              cards: 'external_search_results.cards'
            }
          },
          output: '_last_response',
        }
      ],
      transitions: {
        user_message: 'handle_external_selection',
        select_external: 'confirm_external_pickup', // Direct selection from card
      }
    },

    // NEW: Handle external vendor selection
    handle_external_selection: {
      type: 'action',
      description: 'Parse user selection from external results',
      actions: [
        {
          id: 'parse_external_selection',
          executor: 'llm',
          config: {
            systemPrompt: 'Extract which external vendor the user selected. Results: {{external_search_results.places}}',
            prompt: 'User said: "{{user_message}}". Which vendor did they select? Return JSON: {"selected_index": 0, "vendor_name": "name", "selected": true/false}',
            temperature: 0.1,
            maxTokens: 80,
            parseJson: true
          },
          output: '_external_selection',
        }
      ],
      transitions: {
        success: 'check_external_selection',
        error: 'show_external_results',
      }
    },

    // NEW: Check if user made a valid selection
    check_external_selection: {
      type: 'decision',
      description: 'Validate external selection',
      conditions: [
        {
          expression: 'context._external_selection?.selected === true',
          event: 'selected',
        }
      ],
      transitions: {
        selected: 'confirm_external_pickup',
        default: 'offer_custom_pickup', // Fallback to manual pickup offer
      }
    },

    // NEW: Confirm pickup from external vendor
    confirm_external_pickup: {
      type: 'action',
      description: 'Set up custom pickup from selected external vendor',
      actions: [
        {
          id: 'set_external_vendor',
          executor: 'response',
          config: {
            saveToContext: {
              'is_custom_order': true,
              'is_external_vendor': true,
              'external_vendor_name': '{{external_search_results.topResult.name}}',
              'external_vendor_address': '{{external_search_results.topResult.address}}',
              'external_vendor_location': {
                'lat': '{{external_search_results.topResult.lat}}',
                'lng': '{{external_search_results.topResult.lng}}'
              },
              'maps_link': '{{external_search_results.topResult.mapsLink}}',
              'custom_pickup_location': {
                'name': '{{external_search_results.topResult.name}}',
                'address': '{{external_search_results.topResult.address}}',
                'lat': '{{external_search_results.topResult.lat}}',
                'lng': '{{external_search_results.topResult.lng}}'
              }
            }
          }
        },
        {
          id: 'confirm_external_message',
          executor: 'llm',
          config: {
            systemPrompt: 'You are confirming a pickup order. Be enthusiastic and brief.',
            prompt: `Great choice! User selected {{or external_vendor_name external_search_results.topResult.name}}.
Address: {{or external_vendor_address external_search_results.topResult.address}}
Distance: {{or external_search_results.topResult.distance "nearby"}}

Tell them we'll send a rider to pick up their order. Ask what specific items they want from this place.`,
            temperature: 0.7,
            maxTokens: 120,
          },
          output: '_last_response',
        }
      ],
      transitions: {
        user_message: 'collect_external_order_items',
      }
    },

    // NEW: Collect items for external order
    collect_external_order_items: {
      type: 'action',
      description: 'Record what items user wants from external vendor',
      actions: [
        {
          id: 'save_items',
          executor: 'response',
          config: {
            saveToContext: {
              'custom_item_details': '{{user_message}}'
            }
          }
        }
      ],
      transitions: {
        success: 'collect_address', // Continue to normal address collection
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
      type: 'wait',
      description: 'Display food items to user and wait for selection',
      onEntry: [
        {
          id: 'display_items',
          executor: 'response',
          config: {
            message: 'Here are some delicious options I found for you:',
            cardsPath: 'search_results.cards',
            buttons: [
              { id: 'btn_view_cart', label: '📋 View Cart', value: 'show cart' },
              { id: 'btn_browse', label: '📋 Browse Categories', value: 'browse_menu' },
              { id: 'btn_search', label: '🔍 Search', value: 'search_different' },
            ],
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'resolve_user_intent',  // ✅ First resolve entities using Search API
        default: 'resolve_user_intent',
      },
    },

    // 🆕 Resolve entities from user message using EntityResolutionService
    resolve_user_intent: {
      type: 'action',
      description: 'Extract and resolve entities (stores, items) using OpenSearch to determine if this is a new search or selection',
      actions: [
        {
          id: 'extract_entities',
          executor: 'nlu',
          config: {},
          output: 'food_nlu',
        },
        {
          id: 'resolve_entities',
          executor: 'entity_resolution',
          config: {
            store_reference: '{{food_nlu.entities.store_reference}}',
            food_reference: '{{food_nlu.entities.food_reference}}',
          },
          output: 'resolved_entities',
        },
      ],
      transitions: {
        success: 'check_resolution_result',
        error: 'process_selection',  // Fallback to selection on error
      },
    },

    // 🆕 Decision: New search vs Selection based on resolved entities from OpenSearch
    check_resolution_result: {
      type: 'decision',
      description: 'Route based on entity resolution results from OpenSearch. PRIORITY: Button actions > Selection patterns > Entity search!',
      conditions: [
        {
          // Case -3: HIGHEST PRIORITY - Detect "browse menu" / "browse categories" button click
          expression: `/^(browse_menu|browse\\s+menu|browse\\s+categories|categories)$/i.test(context._user_message?.trim()) || context.food_nlu?.intent === 'browse_menu' || context.food_nlu?.intent === 'browse_category'`,
          event: 'browse_detected',
        },
        {
          // Case -2.5: Detect "search different" button click
          expression: `/^(search_different|search\\s+different|search\\s+more|new\\s+search)$/i.test(context._user_message?.trim())`,
          event: 'search_different',
        },
        {
          // Case 0: HIGHEST PRIORITY - Detect selection patterns (item_ID, numbers, add to cart)
          // MUST be checked before checkout/view_cart because NLU can misclassify "item_10201" as view_cart
          // Matches: "item_12345" (card button click), "1", "2", "add 1 to cart", "first one", "add paneer to cart", etc.
          expression: `/^item_\\d+/i.test(context._user_message?.trim()) || /^(add\\s+)?\\d+(\\s*,\\s*\\d+)*\\s*(to\\s+cart)?$/i.test(context._user_message?.trim()) || /^(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)(\\s+one)?$/i.test(context._user_message?.trim()) || /^add\\s+.+\\s+to\\s+(my\\s+)?cart$/i.test(context._user_message?.trim()) || /^select\\s+(\\d+|all)/i.test(context._user_message?.trim())`,
          event: 'selection_detected',
        },
        {
          // Case 1: Detect "checkout" button click or intent
          // Matches: "checkout", "place order", "order now", etc.
          // GUARD: Exclude item_ID patterns
          expression: `!(/^item_\\d+/i.test(context._user_message?.trim())) && (/^(checkout|place\\s+order|order\\s+now|proceed\\s+to\\s+(checkout|payment))$/i.test(context._user_message?.trim()) || context.food_nlu?.intent === 'checkout')`,
          event: 'checkout_detected',
        },
        {
          // Case 2: Detect "view cart" / "show cart" button click or intent
          // Matches: "show cart", "view cart", "my cart", "cart", "view_cart" etc.
          // GUARD: Exclude item_ID patterns to prevent NLU misclassification from hijacking selections
          expression: `!(/^item_\\d+/i.test(context._user_message?.trim())) && (/^(show\\s+cart|view\\s+cart|view_cart|my\\s+cart|cart|see\\s+cart|open\\s+cart)$/i.test(context._user_message?.trim()) || context.food_nlu?.intent === 'view_cart')`,
          event: 'view_cart_detected',
        },
        {
          // Case 1: Store resolved by OpenSearch → New search with store filter
          expression: 'context.resolved_entities?.stores && context.resolved_entities.stores.length > 0',
          event: 'store_resolved',
        },
        {
          // Case 2: Store mentioned but NOT found in OpenSearch → Clarify
          expression: 'context.food_nlu?.entities?.store_reference && (!context.resolved_entities?.stores || context.resolved_entities.stores.length === 0)',
          event: 'store_not_found',
        },
        {
          // Case 3: New food items detected (different from current results) → New search
          expression: 'context.resolved_entities?.items && context.resolved_entities.items.length > 0',
          event: 'items_resolved',
        },
      ],
      transitions: {
        browse_detected: 'show_categories',                   // 🔧 Browse categories from results
        search_different: 'ask_what_to_eat',                   // 🔧 New search from results
        checkout_detected: 'check_auth_for_checkout',       // 🔧 FIX: Direct route to checkout
        view_cart_detected: 'show_current_cart',             // 🔧 FIX: Direct route to cart view
        selection_detected: 'clear_entities_for_selection',  // 🆕 Clear resolved_entities first
        store_resolved: 'search_food',
        store_not_found: 'prepare_restaurant_search_from_results',  // 🔧 FIX: Search by store name instead of dead-ending
        items_resolved: 'search_food',
        // Case 4: No new entities → Regular selection from existing results
        default: 'process_selection',
      },
    },

    // 🔧 FIX: When user mentions a restaurant while viewing results, prepare and search for it
    // Previously this went to clarify_store_not_found which dead-ended
    prepare_restaurant_search_from_results: {
      type: 'action',
      description: 'Save restaurant name from NLU and redirect to restaurant food search',
      actions: [
        {
          id: 'save_restaurant_name',
          executor: 'response',
          config: {
            skipResponse: true,
            saveToContext: {
              'extracted_food.restaurant': '{{food_nlu.entities.store_reference}}',
              'extracted_food.search_query': '{{_user_message}}',
            },
            event: 'ready',
          },
        },
      ],
      transitions: {
        ready: 'search_food_with_restaurant',
        default: 'search_food_with_restaurant',
      },
    },

    // 🆕 Clear resolved_entities when selection pattern is detected
    // This prevents SelectionExecutor from thinking we need a new search
    clear_entities_for_selection: {
      type: 'action',
      description: 'Clear resolved_entities when selection is explicitly detected to prevent re-search',
      actions: [
        {
          id: 'clear_resolved_entities',
          executor: 'response',
          config: {
            event: 'cleared',
            saveToContext: {
              resolved_entities: null,  // Clear the entities
              _selection_mode: true,    // Flag that we're in selection mode
            },
          },
        },
      ],
      transitions: {
        cleared: 'process_selection',
        default: 'process_selection',
      },
    },

    // 🆕 Handle case when store doesn't exist in OpenSearch
    clarify_store_not_found: {
      type: 'wait',
      description: 'Store mentioned by user was not found - show available options',
      onEntry: [
        {
          executor: 'response',
          config: {
            message: '❓ I couldn\'t find a store named "{{food_nlu.entities.store_reference}}". Here are the available options:',
            cardsPath: 'search_results.cards',  // Show current results
            buttons: [
              { id: 'btn_select', label: '👆 Choose from above', value: 'select from results' },
              { id: 'btn_new_search', label: '🔍 Try different search', value: 'new search' },
            ],
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'process_selection',
        default: 'process_selection',
      },
    },

    // Process item selection
    process_selection: {
      type: 'action',
      description: 'Parse selected items and quantities using selection executor',
      actions: [
        {
          id: 'parse_selection',
          executor: 'selection',
          config: {
            // Selection executor will parse user message and match against search_results
          },
          output: 'selection_result',
        },
      ],
      transitions: {
        item_selected: 'add_to_cart',
        checkout: 'check_auth_for_checkout',
        cancel: 'check_trigger',
        search_more: 'search_food',
        search_items: 'search_requested_items', // User requested specific items not in results
        view_cart: 'show_current_cart',  // 🆕 Show cart when user asks
        ask_distance: 'show_distance_info',  // 🆕 User asked about distance
        needs_variation: 'prompt_variation_selection',  // 📦 Item has size/weight variations
        unclear: 'clarify_selection',
        error: 'show_results',
      },
    },

    // 🆕 Show distance/location info for displayed stores
    show_distance_info: {
      type: 'wait',
      description: 'Show distance information for stores in search results',
      onEntry: [
        {
          id: 'display_distance',
          executor: 'response',
          config: {
            message: '{{selection_result.followUpResponse}}',
            buttons: [
              { id: 'btn_nearest', label: '📍 Order from Nearest', value: 'nearest store' },
              { id: 'btn_back', label: '⬅️ Back to Results', value: 'show results' },
            ],
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'process_selection',
        default: 'process_selection',
      },
    },

    // 📦 NEW: Prompt user to select a size/weight variation for item
    prompt_variation_selection: {
      type: 'wait',
      description: 'Show item size/weight variations for user to choose',
      onEntry: [
        {
          id: 'show_variations',
          executor: 'response',
          config: {
            message: '{{selection_result.followUpResponse}}',
            quickReplies: '{{#each selection_result.variationOptions}}{"label": "{{this.label}}", "value": "Add {{../selection_result.variationItem.itemName}} to cart [{{this.label}}]"}{{#unless @last}},{{/unless}}{{/each}}',
          },
          output: '_last_response',
        },
        {
          id: 'save_variation_context',
          executor: 'response',
          config: {
            skipResponse: true,
            saveToContext: {
              _pending_variation_item: '{{selection_result.variationItem}}',
              _pending_variation_options: '{{selection_result.variationOptions}}',
            },
          },
        },
      ],
      actions: [],
      transitions: {
        user_message: 'process_selection',
        default: 'process_selection',
      },
    },

    // 🆕 Show current cart contents
    show_current_cart: {
      type: 'action',
      description: 'Show what is currently in the cart',
      actions: [
        {
          id: 'build_cart_display',
          executor: 'cart_manager',
          config: {
            operation: 'validate',
          },
          output: 'cart_validation',
        },
        {
          id: 'display_cart',
          executor: 'response',
          config: {
            message: '{{#if cart_items.length}}🛒 **Your Cart:**\n\n**Total: ₹{{cart_validation.totalPrice}}** ({{cart_validation.totalItems}} items)\n\nWhat would you like to do?{{else}}🛒 Your cart is empty!\n\nBrowse items above and add what you like.{{/if}}',
            cardsPath: 'cart_display',
            buttons: [
              { id: 'btn_add_more', label: '➕ Add More Items', value: 'add_more' },
              { id: 'btn_checkout', label: '✅ Checkout', value: 'checkout' },
              { id: 'btn_clear', label: '🗑️ Clear Cart', value: 'clear_cart' }
            ],
            saveToContext: {
              cart_display: '{{cart_validation.cart_items}}',
            },
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'wait_for_cart_action',
      },
    },

    // 🆕 Wait for user action after showing cart
    wait_for_cart_action: {
      type: 'wait',
      description: 'Wait for user to choose add more, checkout, or clear',
      onEntry: [],
      actions: [],
      transitions: {
        user_message: 'handle_cart_action',
        checkout: 'check_auth_for_checkout',
        add_more: 'show_results',
        clear_cart: 'clear_cart_state',
      },
    },

    // 🆕 Handle cart action choice
    // 🚀 AGENTIC: Using NLU cascade instead of .includes()
    handle_cart_action: {
      type: 'action',
      description: 'Use NLU to classify cart action intent',
      actions: [
        {
          id: 'classify_cart_action',
          executor: 'nlu_condition',
          config: {
            intents: ['confirm_checkout', 'confirm_action', 'checkout'],
            minConfidence: 0.5,
          },
          output: 'cart_action_check',
        },
      ],
      transitions: {
        matched: 'check_auth_for_checkout',
        not_matched: 'check_add_more_intent',
        default: 'process_selection',
      },
    },

    // 🚀 AGENTIC: Check add more intent
    check_add_more_intent: {
      type: 'action',
      description: 'Check if user wants to add more items',
      actions: [
        {
          id: 'classify_add_more',
          executor: 'nlu_condition',
          config: {
            intents: ['add_more_items', 'browse_menu', 'search_product'],
            minConfidence: 0.5,
          },
          output: 'add_more_check',
        },
      ],
      transitions: {
        matched: 'show_results',
        not_matched: 'check_remove_item_intent',
        default: 'process_selection',
      },
    },

    // 🚀 AGENTIC: Check remove specific item intent - MUST come before clear_cart
    check_remove_item_intent: {
      type: 'action',
      description: 'Check if user wants to remove a specific item from cart',
      actions: [
        {
          id: 'classify_remove_item',
          executor: 'nlu_condition',
          config: {
            intents: ['remove_item'],
            minConfidence: 0.5,
          },
          output: 'remove_item_check',
        },
      ],
      transitions: {
        matched: 'find_item_to_remove',
        not_matched: 'check_clear_cart_intent',
        default: 'process_selection',
      },
    },

    // Find which item user wants to remove
    find_item_to_remove: {
      type: 'action',
      description: 'Extract item name from user message and remove from cart',
      actions: [
        {
          id: 'remove_item_action',
          executor: 'cart_manager',
          config: {
            operation: 'remove',
            // No itemId or itemIndex - cart_manager will extract from user message
          },
          output: 'remove_result',
        },
      ],
      transitions: {
        item_removed: 'show_remove_success',
        cart_empty: 'show_cart_empty_after_remove',
        item_not_found: 'remove_item_not_found',
        error: 'remove_item_not_found',
        default: 'remove_item_not_found',
      },
    },

    // Show success message after removing item
    show_remove_success: {
      type: 'wait',
      description: 'Show removal success and wait for next action',
      onEntry: [
        {
          id: 'remove_success_response',
          executor: 'response',
          config: {
            message: '✅ {{remove_result.message}}\n\n🛒 Your cart now has {{remove_result.cart_items.length}} item(s) - ₹{{remove_result.totalPrice}}\n\nWhat would you like to do next?',
            buttons: [
              { id: 'btn_checkout', label: '✅ Checkout', value: 'checkout' },
              { id: 'btn_add', label: '➕ Add More', value: 'add_more' },
              { id: 'btn_cart', label: '🛒 View Cart', value: 'view_cart' }
            ],
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'handle_cart_action',
        checkout: 'check_auth_for_checkout',
        add_more: 'show_results',
        view_cart: 'show_current_cart',
      },
    },

    // Show message when cart becomes empty after removal
    show_cart_empty_after_remove: {
      type: 'wait',
      description: 'Cart is empty after removal',
      onEntry: [
        {
          id: 'cart_empty_response',
          executor: 'response',
          config: {
            message: '✅ {{remove_result.message}}\n\n🛒 Your cart is now empty.\n\nWhat would you like to order?',
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'search_food',
        default: 'search_food',
      },
    },

    // Item not found in cart
    remove_item_not_found: {
      type: 'wait',
      description: 'Tell user the item was not found in cart',
      actions: [
        {
          id: 'not_found_response',
          executor: 'response',
          config: {
            message: '❌ Sorry, I couldn\'t find that item in your cart. Here\'s your current cart:',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'show_current_cart',
      },
    },

    // 🚀 AGENTIC: Check clear cart intent
    check_clear_cart_intent: {
      type: 'action',
      description: 'Check if user wants to clear entire cart',
      actions: [
        {
          id: 'classify_clear_cart',
          executor: 'nlu_condition',
          config: {
            intents: ['clear_cart'],
            minConfidence: 0.5,
          },
          output: 'clear_cart_check',
        },
      ],
      transitions: {
        matched: 'clear_cart_state',
        not_matched: 'process_selection',
        default: 'process_selection',
      },
    },

    // Search for specific items user requested
    search_requested_items: {
      type: 'action',
      description: 'Search for specific items user requested that were not in current results',
      actions: [
        {
          id: 'search_items',
          executor: 'search',
          config: {
            query: '{{selection_result.searchSuggestion}}',
            type: 'food',
            limit: 10,
          },
          output: 'search_results',
        },
      ],
      transitions: {
        items_found: 'show_results',
        no_items: 'no_results',
        error: 'show_results',
      },
    },

    // Clarify unclear selection
    clarify_selection: {
      type: 'wait', // Changed from 'action' to wait for user input
      description: 'Ask user to clarify their selection',
      actions: [
        {
          id: 'clarify_prompt',
          executor: 'response',
          config: {
            message: '{{#if (eq platform "web")}}Please select an item by clicking the "ADD" button below, or type the item name to add it to your cart.{{else}}I didn\'t quite understand your selection. Please:\n- Type a number (1, 2, 3) to select an item\n- Type "Add [item name] to cart"\n- Or say "checkout" when ready{{/if}}',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'process_selection',
      },
    },

    // Add items to cart
    add_to_cart: {
      type: 'action', // Changed to action - routes based on cart_manager result
      description: 'Add selected items to cart',
      onEntry: [],
      actions: [
        {
          id: 'manage_cart',
          executor: 'cart_manager',
          config: {
            operation: 'add',
            newItemsPath: 'selection_result.selectedItems',
          },
          output: 'cart_update_result',
        },
      ],
      transitions: {
        items_added: 'cart_add_success', // Successful add
        store_conflict: 'handle_store_conflict', // Different store conflict
        no_items: 'clarify_selection', // No items to add - ask for clarification
        default: 'cart_add_success', // Fallback
      },
    },

    // State to handle successful cart addition
    cart_add_success: {
      type: 'wait', // Wait for user input after showing cart confirmation
      description: 'Show cart confirmation and wait for next action',
      onEntry: [
        {
          id: 'confirm_cart',
          executor: 'response',
          config: {
            message: `✅ Added to cart!\n\n🛒 {{cart_update_result.cartSummary}}\n\nAdd more items or say "checkout" when ready.`,
            responseType: 'cart_update',
            // Build cart cards from cart items for web display (use cart_items which is in card format)
            cardsPath: 'cart_update_result.cart_items',
            buttons: [
              { id: 'btn_checkout', label: '🛒 Checkout', value: 'checkout' },
              { id: 'btn_add_more', label: '➕ Add More', value: 'add more food' },
              { id: 'btn_clear', label: '🗑️ Clear Cart', value: 'clear cart' },
            ],
            // Save the cart state (cart_data is raw format for cart operations)
            saveToContext: {
              cart_items: '{{cart_update_result.cart_data}}',
              cart_display: '{{cart_update_result.cart_items}}',
              selected_items: '{{cart_update_result.cart_data}}',
              cart_total: '{{cart_update_result.totalPrice}}',
              cart_store_id: '{{cart_update_result.storeId}}',
              cart_store_name: '{{cart_update_result.storeName}}',
            },
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'handle_post_cart_input',
        default: 'handle_post_cart_input',
      },
    },

    // Handle store conflict when user tries to add items from different restaurant
    handle_store_conflict: {
      type: 'wait',
      description: 'Ask user whether to clear cart and switch to new restaurant',
      onEntry: [
        {
          id: 'show_conflict',
          executor: 'response',
          config: {
            message: `⚠️ {{cart_update_result.message}}\n\nYou have items from **{{cart_update_result.currentStoreName}}** in your cart.`,
            responseType: 'store_conflict',
            buttons: [
              { id: 'btn_clear_and_add', label: '🔄 Clear & Add New', value: 'clear and add new' },
              { id: 'btn_keep_cart', label: '🛒 Keep My Cart', value: 'keep cart' },
              { id: 'btn_view_cart', label: '📋 View Cart', value: 'view cart' },
            ],
            // Save conflict info for later use
            saveToContext: {
              cart_conflict_new_store: '{{cart_update_result.newStoreName}}',
              cart_conflict_items: '{{cart_update_result.conflictingItems}}',
            },
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'resolve_store_conflict',
        default: 'resolve_store_conflict',
      },
    },

    // Resolve store conflict based on user choice
    resolve_store_conflict: {
      type: 'decision',
      description: 'Route user choice for store conflict',
      conditions: [
        {
          expression: 'context._user_message?.toLowerCase().includes("clear") || context._user_message?.toLowerCase().includes("switch") || context._user_message?.toLowerCase().includes("new")',
          event: 'clear_and_add',
        },
        {
          expression: 'context._user_message?.toLowerCase().includes("keep") || context._user_message?.toLowerCase().includes("no")',
          event: 'keep_cart',
        },
        {
          expression: 'context._user_message?.toLowerCase().includes("view") || context._user_message?.toLowerCase().includes("cart")',
          event: 'view_cart',
        },
      ],
      transitions: {
        clear_and_add: 'clear_cart_and_add_new',
        keep_cart: 'show_current_cart',
        view_cart: 'show_current_cart',
        default: 'handle_store_conflict', // Re-ask if unclear
      },
    },

    // Clear cart and add the conflicting items
    clear_cart_and_add_new: {
      type: 'action',
      description: 'Clear cart and add items from new restaurant',
      onEntry: [],
      actions: [
        {
          id: 'clear_old_cart',
          executor: 'cart_manager',
          config: {
            operation: 'clear',
          },
          output: 'clear_result',
        },
        {
          id: 'add_new_items',
          executor: 'cart_manager',
          config: {
            operation: 'add',
            // Use the conflicting items saved from the store conflict
            // These were saved in cart_update_result.conflictingItems when store_conflict was triggered
            newItemsPath: 'cart_update_result.conflictingItems',
          },
          output: 'cart_update_result',
        },
      ],
      transitions: {
        items_added: 'cart_add_success',
        default: 'cart_add_success',
      },
    },

    // Handle user input after cart update
    // 🚀 AGENTIC: Using NLU cascade instead of .includes()
    handle_post_cart_input: {
      type: 'action',
      description: 'Use NLU to classify post-cart action intent',
      actions: [
        {
          id: 'classify_post_cart',
          executor: 'nlu_condition',
          config: {
            intents: ['confirm_checkout', 'confirm_action', 'checkout'],
            minConfidence: 0.5,
          },
          output: 'post_cart_checkout_check',
        },
      ],
      transitions: {
        matched: 'check_auth_for_checkout',
        not_matched: 'check_post_cart_clear',
        default: 'process_selection',
      },
    },

    // 🚀 AGENTIC: Check clear cart
    check_post_cart_clear: {
      type: 'action',
      description: 'Check if user wants to clear cart',
      actions: [
        {
          id: 'classify_clear',
          executor: 'nlu_condition',
          config: {
            intents: ['clear_cart'],
            minConfidence: 0.5,
          },
          output: 'post_cart_clear_check',
        },
      ],
      transitions: {
        matched: 'clear_cart_state',
        not_matched: 'check_post_cart_search',
        default: 'process_selection',
      },
    },

    // 🚀 AGENTIC: Check search more
    check_post_cart_search: {
      type: 'action',
      description: 'Check if user wants to search/add more',
      actions: [
        {
          id: 'classify_search',
          executor: 'nlu_condition',
          config: {
            intents: ['add_more_items', 'browse_menu', 'search_product'],
            minConfidence: 0.5,
          },
          output: 'post_cart_search_check',
        },
      ],
      transitions: {
        matched: 'search_food',
        not_matched: 'check_post_cart_view',
        default: 'process_selection',
      },
    },

    // 🚀 AGENTIC: Check view cart
    check_post_cart_view: {
      type: 'action',
      description: 'Check if user wants to view cart',
      actions: [
        {
          id: 'classify_view_cart',
          executor: 'nlu_condition',
          config: {
            intents: ['view_cart'],
            minConfidence: 0.5,
          },
          output: 'post_cart_view_check',
        },
      ],
      transitions: {
        matched: 'show_current_cart',
        not_matched: 'process_selection',
        default: 'process_selection',
      },
    },

    // Check authentication before checkout
    // 🔧 FIX: First refresh auth from session (handles stale context, Redis TTL, late session:join)
    // Then decide based on freshly-synced user_authenticated flag
    check_auth_for_checkout: {
      type: 'action',
      description: 'Refresh auth from session then check if user is authenticated before checkout',
      actions: [
        {
          id: 'refresh_auth_before_checkout',
          executor: 'session',
          config: {
            action: 'refresh_auth',
          },
          output: '_auth_refresh_result',
        },
      ],
      transitions: {
        next: 'decide_auth_for_checkout',
        default: 'decide_auth_for_checkout',
      },
    },

    // Actual decision after auth refresh
    decide_auth_for_checkout: {
      type: 'decision',
      description: 'Decide if user is authenticated after fresh session check',
      conditions: [
        {
          expression: 'context.user_authenticated === true',
          event: 'authenticated',
        },
      ],
      transitions: {
        authenticated: 'collect_address',
        default: 'request_phone',
      },
    },

    // Request phone for authentication
    // IMPROVED: Added escape buttons so users can modify cart or cancel
    request_phone: {
      type: 'wait',
      description: 'Ask user for phone number to authenticate',
      onEntry: [
        {
          id: 'ask_phone',
          executor: 'response',
          config: {
            message: 'To complete your order, please provide your phone number for verification.',
            responseType: 'request_phone',
            buttons: [
              { id: 'btn_modify', label: '✏️ Modify Cart', value: 'modify' },
              { id: 'btn_cancel', label: '❌ Cancel', value: 'cancel' },
            ],
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        phone_provided: 'verify_otp',
        user_message: 'recheck_auth_at_phone',
        default: 'recheck_auth_at_phone',
      },
    },

    // 🔧 CRITICAL FIX: Re-check auth before parsing phone number
    // Handles case where user logs in (Google OAuth etc.) while flow is stuck at request_phone
    // from a previous session. Without this, the flow stays at request_phone forever.
    recheck_auth_at_phone: {
      type: 'action',
      description: 'Re-check authentication before parsing phone - user may have logged in since last check',
      actions: [
        {
          id: 'recheck_auth_action',
          executor: 'session',
          config: {
            action: 'refresh_auth',
          },
          output: '_auth_recheck_result',
        },
      ],
      conditions: [
        {
          expression: 'context.user_authenticated === true && context.user_id > 0',
          event: 'authenticated',
        },
      ],
      transitions: {
        authenticated: 'auth_recovered_message',
        default: 'parse_phone',
      },
    },

    // Show a friendly message when auth is recovered after being at request_phone
    auth_recovered_message: {
      type: 'action',
      description: 'Notify user that they are now logged in and proceed to checkout',
      actions: [
        {
          id: 'auth_recovered_response',
          executor: 'response',
          config: {
            message: '✅ You\'re already logged in! Proceeding with your order...',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'collect_address',
      },
    },

    // Parse phone from user message
    // IMPROVED: Check for escape commands (add_more, modify, cancel) BEFORE phone validation
    parse_phone: {
      type: 'action',
      description: 'Extract phone number from user message, with escape command support',
      actions: [
        {
          id: 'validate_phone_action',
          executor: 'auth',
          config: {
            action: 'validate_phone',
            input: '{{_user_message}}',
          },
          output: 'phone_result',
        },
      ],
      conditions: [
        // Escape commands - allow user to go back to modify cart without completing auth
        {
          expression: 'context._user_message?.toLowerCase().includes("add_more") || context._user_message?.toLowerCase().includes("add more")',
          event: 'add_more',
        },
        {
          expression: 'context._user_message?.toLowerCase().includes("modify") || context._user_message?.toLowerCase().includes("change") || context._user_message?.toLowerCase().includes("edit")',
          event: 'modify',
        },
        {
          expression: 'context._user_message?.toLowerCase().includes("cancel") || context._user_message?.toLowerCase().includes("nevermind") || context._user_message?.toLowerCase().includes("back")',
          event: 'cancel',
        },
        {
          expression: 'context._user_message?.toLowerCase().includes("clear") || context._user_message?.toLowerCase().includes("empty") || context._user_message?.toLowerCase().includes("remove all")',
          event: 'clear_cart',
        },
      ],
      transitions: {
        valid: 'send_otp',
        invalid: 'invalid_phone_with_help',
        add_more: 'show_results',      // Go back to search/browse
        modify: 'show_results',         // Go back to modify cart
        cancel: 'cancelled',
        clear_cart: 'clear_cart_state',
        error: 'request_phone',
      },
    },

    // Better UX: Show help when phone is invalid instead of just re-asking
    invalid_phone_with_help: {
      type: 'action',
      description: 'Show helpful message when phone is invalid',
      actions: [
        {
          id: 'invalid_phone_help',
          executor: 'response',
          config: {
            message: '❌ That doesn\'t look like a valid phone number.\n\n📱 Please enter your 10-digit mobile number (e.g., 9876543210)\n\nOr type:\n• "modify" to edit your cart\n• "cancel" to start over',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'request_phone',
      },
    },

    // Clear cart state
    clear_cart_state: {
      type: 'action',
      description: 'Clear the cart and start fresh',
      actions: [
        {
          id: 'clear_cart_action',
          executor: 'response',
          config: {
            message: '🗑️ Cart cleared! What would you like to order?',
            saveToContext: {
              cart_items: [],
              selected_items: [],
              auto_selected_items: [],
            },
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'search_food',
      },
    },

    // Send OTP
    send_otp: {
      type: 'action',
      description: 'Send OTP to user phone',
      actions: [
        {
          id: 'send_otp_action',
          executor: 'auth',
          config: {
            action: 'send_otp',
          },
          output: 'otp_result',
        },
        {
          id: 'otp_sent_message',
          executor: 'response',
          config: {
            message: 'We\'ve sent an OTP to your phone. Please enter it to continue.',
            responseType: 'request_otp',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        success: 'verify_otp',
        otp_sent: 'verify_otp',
        error: 'otp_error',
      },
    },

    // Verify OTP
    verify_otp: {
      type: 'wait',
      description: 'Wait for user to enter OTP',
      actions: [],
      transitions: {
        user_message: 'check_otp',
      },
    },

    // Check OTP
    check_otp: {
      type: 'action',
      description: 'Verify the OTP entered by user',
      actions: [
        {
          id: 'verify_otp_action',
          executor: 'auth',
          config: {
            action: 'verify_otp',
            otp: '{{_user_message}}',
          },
          output: 'otp_verify_result',
        },
      ],
      transitions: {
        valid: 'collect_address',
        otp_valid: 'collect_address',
        invalid: 'otp_retry',
        otp_invalid: 'otp_retry',
        error: 'otp_error',
      },
    },

    // OTP retry - MUST be wait type to capture next user input
    otp_retry: {
      type: 'wait',
      description: 'Ask user to re-enter OTP',
      actions: [
        {
          executor: 'response',
          config: {
            message: 'That OTP doesn\'t seem right. Please try again or type "resend" to get a new OTP.',
          },
          output: '_retry_response',
        },
      ],
      transitions: {
        user_message: 'check_otp_or_resend',
      },
    },

    // Check if user wants to resend or entered new OTP
    check_otp_or_resend: {
      type: 'decision',
      description: 'Check if user wants to resend OTP',
      conditions: [
        {
          expression: 'context._user_message?.toLowerCase().includes("resend")',
          event: 'resend',
        },
      ],
      transitions: {
        resend: 'send_otp',
        default: 'check_otp',
      },
    },

    // OTP error
    otp_error: {
      type: 'action',
      description: 'Handle OTP error',
      actions: [
        {
          id: 'otp_error_message',
          executor: 'response',
          config: {
            message: 'Sorry, there was an issue with OTP verification. Please try again.',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'request_phone',
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
    // 🚀 AGENTIC: Using NLU cascade instead of .includes()
    check_cart_action: {
      type: 'action',
      description: 'Use NLU to determine next step',
      actions: [
        {
          id: 'classify_cart_next',
          executor: 'nlu_condition',
          config: {
            intents: ['confirm_checkout', 'confirm_action'],
            minConfidence: 0.5,
          },
          output: 'cart_next_check',
        },
      ],
      transitions: {
        matched: 'upsell_offer',
        not_matched: 'check_cart_add_more',
        default: 'confirm_selection',
      },
    },

    // 🚀 AGENTIC: Check add more intent
    check_cart_add_more: {
      type: 'action',
      description: 'Check if user wants to add more',
      actions: [
        {
          id: 'classify_add',
          executor: 'nlu_condition',
          config: {
            intents: ['add_more_items', 'browse_menu', 'search_product'],
            minConfidence: 0.5,
          },
          output: 'cart_add_check',
        },
      ],
      transitions: {
        matched: 'search_food',
        not_matched: 'check_cart_cancel',
        default: 'confirm_selection',
      },
    },

    // 🚀 AGENTIC: Check cancel intent
    check_cart_cancel: {
      type: 'action',
      description: 'Check if user wants to cancel',
      actions: [
        {
          id: 'classify_cancel',
          executor: 'nlu_condition',
          config: {
            intents: ['cancel_flow', 'cancel_order'],
            minConfidence: 0.5,
          },
          output: 'cart_cancel_check',
        },
      ],
      transitions: {
        matched: 'cancelled',
        not_matched: 'confirm_selection',
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

    // Add Upsell Item — skips mock, just acknowledges and continues
    add_upsell_item: {
      type: 'action',
      description: 'Acknowledge upsell and continue to address',
      actions: [
        {
          id: 'ack_upsell',
          executor: 'response',
          config: {
            message: '✅ Great choice! We\'ll add that to your order. Now let\'s get your delivery address.',
          },
        }
      ],
      transitions: {
        success: 'collect_address',
      },
    },

    // Collect delivery address
    collect_address: {
      type: 'wait',
      description: 'Get delivery address',
      onEntry: [
        {
          id: 'get_address_onentry',
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
        waiting_for_input: null,  // 🔧 FIX: Stay in current wait state, don't re-enter and re-trigger onEntry
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
            // Use storeLat/storeLng from cart_items (saved during add_to_cart)
            fromLatPath: 'cart_items.0.storeLat',
            fromLngPath: 'cart_items.0.storeLng',
            // delivery_address uses latitude/longitude not lat/lng
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

    // Collect Payment Method - Fetch from PHP backend (same pattern as parcel flow)
    collect_payment_method: {
      type: 'action',
      description: 'Fetch and display payment methods from PHP backend',
      actions: [
        {
          id: 'fetch_payment_methods',
          executor: 'php_api',
          config: {
            action: 'get_payment_methods',
          },
          output: 'payment_methods_response',
        },
        {
          id: 'show_payment_options',
          executor: 'response',
          config: {
            message: '💳 **Select Payment Method:**',
            buttonsPath: 'payment_methods_response.methods',
            buttonConfig: {
              labelPath: 'name',
              valuePath: 'id',
            },
            responseType: 'request_payment_method',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        success: 'wait_payment_selection',
        error: 'collect_payment_method_fallback',
      },
    },

    // Wait for user to select payment method
    wait_payment_selection: {
      type: 'wait',
      description: 'Wait for payment method selection',
      actions: [],
      transitions: {
        user_message: 'select_payment_method',
        default: 'select_payment_method',
      },
    },

    // Fallback if PHP API fails - show default options
    collect_payment_method_fallback: {
      type: 'wait',
      description: 'Fallback payment method selection',
      onEntry: [
        {
          id: 'ask_payment_fallback',
          executor: 'response',
          config: {
            message: '💳 **Select Payment Method:**',
            buttons: [
              { id: 'btn_wallet', label: '👛 Wallet', value: 'wallet' },
              { id: 'btn_digital', label: '💳 Pay Online', value: 'digital_payment' },
              { id: 'btn_cod', label: '💵 Cash on Delivery', value: 'cash_on_delivery' },
            ],
            responseType: 'request_payment_method',
          },
          output: '_last_response',
        },
      ],
      actions: [],
      transitions: {
        user_message: 'select_payment_method',
        default: 'select_payment_method',
      },
    },

    // Select Payment Method (deterministic)
    select_payment_method: {
      type: 'decision',
      description: 'Determine payment method selection',
      conditions: [
        {
          expression: 'context._user_message === "wallet" || context._user_message?.toLowerCase().includes("wallet") || context._user_message?.toLowerCase().includes("balance")',
          event: 'wallet',
        },
        {
          expression: 'context._user_message === "cash_on_delivery" || context._user_message?.toLowerCase().includes("cod") || context._user_message?.toLowerCase().includes("cash")',
          event: 'cod',
        },
        {
          expression: 'context._user_message === "digital_payment" || context._user_message?.toLowerCase().includes("online") || context._user_message?.toLowerCase().includes("digital") || context._user_message?.toLowerCase().includes("upi") || context._user_message?.toLowerCase().includes("card") || context._user_message?.toLowerCase().includes("razor") || context._user_message?.toLowerCase().includes("pay online")',
          event: 'digital',
        },
      ],
      transitions: {
        wallet: 'check_wallet_balance',
        cod: 'set_payment_cod',
        digital: 'set_payment_digital',
        default: 'collect_payment_method',
      },
    },

    // Check wallet balance before using wallet payment
    check_wallet_balance: {
      type: 'action',
      description: 'Check wallet balance and decide payment path',
      actions: [
        {
          id: 'fetch_wallet',
          executor: 'php_api',
          config: {
            action: 'get_wallet_balance',
            token: '{{config.token}}',
          },
          output: 'wallet_info',
        },
      ],
      transitions: {
        success: 'decide_wallet_payment',
        error: 'set_payment_digital', // Fallback to digital if wallet check fails
      },
    },

    // Decide: full wallet, partial (wallet + online), or insufficient
    decide_wallet_payment: {
      type: 'decision',
      description: 'Check if wallet covers full amount or needs partial payment',
      conditions: [
        {
          // Wallet covers full amount
          expression: 'context.wallet_info?.balance >= context.pricing?.total',
          event: 'full_wallet',
        },
        {
          // Wallet has some balance but not enough - use partial payment
          expression: 'context.wallet_info?.balance > 0 && context.wallet_info?.balance < context.pricing?.total',
          event: 'partial_payment',
        },
      ],
      transitions: {
        full_wallet: 'set_payment_wallet',
        partial_payment: 'show_partial_payment_option',
        default: 'show_wallet_empty', // No wallet balance
      },
    },

    // Wallet covers full amount
    set_payment_wallet: {
      type: 'action',
      description: 'Set payment method to wallet',
      actions: [
        {
          id: 'save_payment_wallet',
          executor: 'response',
          config: {
            saveToContext: {
              payment_method: 'wallet',
              payment_details: { method: 'WALLET', id: 'wallet' },
            },
          },
          output: 'payment_saved',
        },
      ],
      transitions: {
        default: 'show_order_summary',
      },
    },

    // Partial payment: wallet + online
    show_partial_payment_option: {
      type: 'wait',
      description: 'Show partial payment option',
      onEntry: [
        {
          id: 'show_partial',
          executor: 'response',
          config: {
            message: '👛 **Wallet Balance:** {{wallet_info.formattedBalance}}\n💰 **Order Total:** ₹{{pricing.total}}\n\n💡 Your wallet doesn\'t cover the full amount. I\'ll use your wallet balance first (₹{{wallet_info.balance}}) and the remaining **₹{{pricing.total - wallet_info.balance}}** will be charged online via Razorpay.\n\nShall I proceed?',
            buttons: [
              { id: 'btn_partial_yes', label: '✅ Yes, use wallet + pay rest online', value: 'yes use wallet' },
              { id: 'btn_full_online', label: '💳 Pay full amount online', value: 'pay full online' },
              { id: 'btn_cancel_payment', label: '❌ Cancel', value: 'cancel' },
            ],
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'handle_partial_payment_response',
        default: 'handle_partial_payment_response',
      },
    },

    handle_partial_payment_response: {
      type: 'decision',
      description: 'Handle partial payment selection',
      conditions: [
        {
          expression: '/yes|wallet|partial|proceed|haan|ha|ok/i.test(context._user_message || "")',
          event: 'use_partial',
        },
        {
          expression: '/full|online|digital|pay full|card|razorpay/i.test(context._user_message || "")',
          event: 'full_online',
        },
        {
          expression: '/cancel|no|nahi/i.test(context._user_message || "")',
          event: 'cancel',
        },
      ],
      transitions: {
        use_partial: 'set_payment_partial',
        full_online: 'set_payment_digital',
        cancel: 'collect_payment_method',
        default: 'show_partial_payment_option',
      },
    },

    set_payment_partial: {
      type: 'action',
      description: 'Set partial payment: wallet + online',
      actions: [
        {
          id: 'save_partial',
          executor: 'response',
          config: {
            saveToContext: {
              payment_method: 'partial_payment',
              payment_details: {
                method: 'PARTIAL',
                id: 'partial_payment',
                wallet_amount: '{{wallet_info.balance}}',
                online_amount: '{{pricing.total - wallet_info.balance}}',
              },
            },
          },
          output: 'payment_saved',
        },
      ],
      transitions: {
        default: 'show_order_summary',
      },
    },

    // Wallet is empty
    show_wallet_empty: {
      type: 'wait',
      description: 'Wallet is empty, offer alternatives',
      onEntry: [
        {
          id: 'show_empty',
          executor: 'response',
          config: {
            message: '👛 Your wallet balance is **₹0**. Please choose another payment method:',
            buttons: [
              { id: 'btn_digital', label: '💳 Pay Online', value: 'digital_payment' },
              { id: 'btn_cod', label: '💵 Cash on Delivery', value: 'cash_on_delivery' },
            ],
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'select_payment_method',
        default: 'select_payment_method',
      },
    },

    set_payment_cod: {
      type: 'action',
      description: 'Set payment method to COD',
      actions: [
        {
          id: 'save_payment_cod',
          executor: 'response',
          config: {
            saveToContext: {
              payment_method: 'cash_on_delivery',
              payment_details: { method: 'COD', id: 'cash_on_delivery' },
            },
          },
          output: 'payment_saved',
        },
      ],
      transitions: {
        default: 'show_order_summary',
      },
    },

    set_payment_digital: {
      type: 'action',
      description: 'Set payment method to Digital',
      actions: [
        {
          id: 'save_payment_digital',
          executor: 'response',
          config: {
            saveToContext: {
              payment_method: 'digital_payment',
              payment_details: { method: 'ONLINE', id: 'digital_payment' },
            },
          },
          output: 'payment_saved',
        },
      ],
      transitions: {
        default: 'show_order_summary',
      },
    },

    // Show final order summary
    show_order_summary: {
      type: 'wait',
      description: 'Display complete order summary',
      onEntry: [
        {
          id: 'summary_message',
          executor: 'response',
          config: {
            message: '🧾 **Order Summary**\n\n{{cart_update_result.cartSummary}}\n\n🚚 Delivery Fee: ₹{{pricing.deliveryFee}} ({{distance}}km)\n🧾 GST (5%): ₹{{pricing.tax}}\n💳 **Grand Total: ₹{{pricing.total}}**\n💸 Payment: {{payment_method}}\n\n📍 Delivery to: {{delivery_address.label}}\n{{delivery_address.address}}\n\n{{#if cart_update_result.isMultiStore}}📦 _{{cart_update_result.storeCount}} separate orders will be placed_\n\n{{/if}}Reply "confirm" to place order or "cancel" to cancel.',
            buttons: [
              { id: 'btn_confirm', label: '✅ Confirm', value: 'confirm' },
              { id: 'btn_cancel', label: '❌ Cancel', value: 'cancel' },
            ],
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'pre_check_confirmation',
        default: 'pre_check_confirmation',
      },
    },

    // Pre-check: Regex match for obvious confirm/cancel words before NLU
    pre_check_confirmation: {
      type: 'decision',
      description: 'Fast regex check for confirm/cancel before NLU fallback',
      conditions: [
        {
          expression: '/^(confirm|yes|ok|okay|haan|ha|haa|ji|place\\s*order|order\\s*karo|done|proceed|theek|thik)$/i.test(String(_user_message || "").trim())',
          event: 'confirmed',
        },
        {
          expression: '/^(cancel|no|nahi|nhi|nah|band|stop|ruk|mat|chhodo|chhod)$/i.test(String(_user_message || "").trim())',
          event: 'cancelled',
        },
      ],
      transitions: {
        confirmed: 'check_order_type_final',
        cancelled: 'cancelled',
        default: 'check_final_confirmation',
      },
    },

    // Check final confirmation via NLU (fallback for ambiguous messages)
    // 🚀 AGENTIC: Using NLU instead of .includes()
    check_final_confirmation: {
      type: 'action',
      description: 'Use NLU to evaluate final confirmation',
      actions: [
        {
          id: 'classify_confirm',
          executor: 'nlu_condition',
          config: {
            intents: ['confirm_action', 'confirm_checkout'],
            minConfidence: 0.5,
          },
          output: 'final_confirm_check',
        },
      ],
      transitions: {
        matched: 'check_order_type_final',
        not_matched: 'check_final_cancel',
        default: 'show_order_summary',
      },
    },

    // 🚀 AGENTIC: Check cancel intent
    check_final_cancel: {
      type: 'action',
      description: 'Check if user wants to cancel order',
      actions: [
        {
          id: 'classify_final_cancel',
          executor: 'nlu_condition',
          config: {
            intents: ['cancel_flow', 'cancel_order'],
            minConfidence: 0.5,
          },
          output: 'final_cancel_check',
        },
      ],
      transitions: {
        matched: 'cancelled',
        not_matched: 'show_order_summary',
        default: 'show_order_summary',
      },
    },

    // Check order type before placing
    check_order_type_final: {
      type: 'decision',
      description: 'Route to correct order placement (custom, multi-store, or single)',
      conditions: [
        {
          expression: 'context.is_custom_order === true',
          event: 'custom',
        },
        {
          // Multi-store cart: items from multiple restaurants
          expression: 'context.cart_validation?.isMultiStore === true || context.cart_update_result?.isMultiStore === true',
          event: 'multi_store',
        },
      ],
      transitions: {
        custom: 'place_custom_order',
        multi_store: 'check_payment_type_multi_store',
        default: 'check_payment_type_for_order',
      }
    },

    // Route multi-store orders based on payment method
    check_payment_type_multi_store: {
      type: 'decision',
      description: 'Route multi-store payment: wallet goes direct, digital/partial needs gateway',
      conditions: [
        {
          expression: 'context.payment_method === "wallet"',
          event: 'wallet',
        },
        {
          expression: 'context.payment_method === "partial_payment" || context.payment_method === "digital_payment"',
          event: 'digital',
        },
      ],
      transitions: {
        wallet: 'place_multi_store_order',
        digital: 'place_multi_store_order_digital',
        default: 'place_multi_store_order', // COD
      },
    },

    // Place multi-store order (COD/wallet path)
    place_multi_store_order: {
      type: 'action',
      description: 'Place separate orders per store (COD or wallet)',
      actions: [
        {
          id: 'create_multi_order',
          executor: 'order',
          config: {
            type: 'multi_store',
            itemsPath: 'selected_items',
            addressPath: 'delivery_address',
            paymentPath: 'payment_details',
            pricingPath: 'pricing',
          },
          output: 'order_result',
          retryOnError: true,
          maxRetries: 1,
        },
      ],
      transitions: {
        success: 'multi_store_completed',
        error: 'order_failed',
      },
    },

    // Place multi-store order (digital/partial payment path)
    place_multi_store_order_digital: {
      type: 'action',
      description: 'Place separate orders per store with digital/partial payment',
      actions: [
        {
          id: 'create_multi_digital_order',
          executor: 'order',
          config: {
            type: 'multi_store',
            paymentMethod: 'digital_payment',
            itemsPath: 'selected_items',
            addressPath: 'delivery_address',
            paymentPath: 'payment_details',
            pricingPath: 'pricing',
          },
          output: 'order_result',
          retryOnError: true,
          maxRetries: 1,
        },
      ],
      transitions: {
        success: 'show_food_payment_gateway',
        error: 'order_failed',
      },
    },

    // Multi-store order completion (non-digital)
    multi_store_completed: {
      type: 'action',
      description: 'Show multi-store order confirmation with all order IDs',
      actions: [
        {
          id: 'show_multi_confirmation',
          executor: 'response',
          config: {
            message: '✅ **Orders Placed Successfully!**\n\n{{order_result.message}}\n\n📦 Order IDs: {{order_result.orderIds}}\n🔗 Track: {{order_result.trackingUrl}}\n\n_Each restaurant will prepare your order separately. You\'ll receive updates for each._',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'completed',
      },
    },

    // Route based on payment method: COD goes straight, wallet goes straight, digital/partial goes through payment gateway
    check_payment_type_for_order: {
      type: 'decision',
      description: 'Route COD vs digital vs wallet payment for order placement',
      conditions: [
        {
          expression: 'context.payment_method === "wallet"',
          event: 'wallet',
        },
        {
          expression: 'context.payment_method === "partial_payment"',
          event: 'digital', // Partial still goes through digital payment gateway for the remaining amount
        },
        {
          expression: 'context.payment_method === "digital_payment" || context.payment_details?.method === "ONLINE"',
          event: 'digital',
        },
      ],
      transitions: {
        wallet: 'place_order',     // Wallet deducted server-side by PHP, like COD
        digital: 'place_order_digital',
        default: 'place_order', // COD or fallback
      },
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

    // Place order (COD path)
    place_order: {
      type: 'action',
      description: 'Create food order with COD payment',
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
        auth_expired: 'auth_expired_relogin',
        error: 'order_failed',
      },
    },

    // Handle auth token expiry during order placement
    auth_expired_relogin: {
      type: 'action',
      description: 'Auth token expired - inform user and redirect to login',
      actions: [
        {
          id: 'notify_reauth',
          executor: 'response',
          config: {
            message: 'Your session has expired. Please log in again to complete your order. Your cart items have been saved.',
          },
        },
      ],
      transitions: {
        default: 'check_auth_before_flow',
      },
    },

    // Refresh auth from session and check if user is logged in (after token expiry)
    check_auth_before_flow: {
      type: 'action',
      description: 'Refresh auth from session and check if user is logged in',
      actions: [
        {
          id: 'refresh_auth_status',
          executor: 'session',
          config: { action: 'refresh_auth' },
          output: '_auth_status',
        },
      ],
      transitions: {
        authenticated: 'show_order_summary',
        not_authenticated: 'prompt_login_for_order',
        default: 'prompt_login_for_order',
      },
    },

    // Prompt user to log in before placing order (after auth expiry)
    prompt_login_for_order: {
      type: 'action',
      description: 'Prompt user to log in before placing order',
      actions: [
        {
          id: 'login_prompt',
          executor: 'response',
          config: {
            message: 'Please log in to place your order. Your cart has been saved and will be available after login.',
          },
        },
      ],
      transitions: {
        default: 'completed',
      },
    },

    // Place order (digital payment path) - order is created, then we show payment gateway
    place_order_digital: {
      type: 'action',
      description: 'Create food order with digital payment and show payment gateway',
      actions: [
        {
          id: 'create_digital_order',
          executor: 'order',
          config: {
            type: 'food',
            paymentMethod: 'digital_payment',
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
        success: 'show_food_payment_gateway',
        auth_expired: 'auth_expired_relogin',
        error: 'order_failed',
        default: 'order_failed',
      },
    },

    // Show payment gateway - channel-aware: WhatsApp gets link, Web gets SDK trigger
    show_food_payment_gateway: {
      type: 'action',
      description: 'Open payment gateway or send payment link for food order',
      actions: [
        {
          id: 'payment_gateway',
          executor: 'response',
          config: {
            channelResponses: {
              whatsapp: {
                message: '💳 *Complete Payment*\n\nOrder ID: #{{order_result.orderId}}\nAmount: ₹{{pricing.total}}\n\n🔗 Pay securely here:\n{{order_result.paymentLink}}\n\n⏱️ Complete payment within 10 minutes.\nAfter payment, you\'ll receive order confirmation automatically.',
                metadata: {
                  action: 'payment_link_sent',
                  orderId: '{{order_result.orderId}}',
                },
              },
              telegram: {
                message: '💳 *Complete Payment*\n\nOrder ID: #{{order_result.orderId}}\nAmount: ₹{{pricing.total}}\n\n🔗 Pay securely here:\n{{order_result.paymentLink}}\n\n⏱️ Complete payment within 10 minutes.',
                metadata: {
                  action: 'payment_link_sent',
                  orderId: '{{order_result.orderId}}',
                },
              },
              default: {
                message: '💳 **Complete Payment**\n\nOrder ID: #{{order_result.orderId}}\nAmount: ₹{{pricing.total}}\n\n🔗 Click below to pay securely:',
                metadata: {
                  action: 'open_payment_gateway',
                  payment_data: {
                    orderId: '{{order_result.orderId}}',
                    razorpayOrderId: '{{order_result.razorpayOrderId}}',
                    amount: '{{pricing.total}}',
                    paymentLink: '{{order_result.paymentLink}}',
                    currency: 'INR',
                    name: 'Mangwale',
                    description: 'Food Order',
                    prefill: {
                      name: '{{session.user_name}}',
                      phone: '{{session.phone}}',
                    }
                  }
                },
              },
            },
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'wait_food_payment_result',
      },
    },

    // Wait for payment result from frontend/WhatsApp callback
    wait_food_payment_result: {
      type: 'wait',
      description: 'Wait for food order payment completion',
      timeout: 300000, // 5 minutes timeout
      onEntry: [],
      transitions: {
        user_message: 'check_food_payment_result',
        timeout: 'food_payment_timeout',
        default: 'check_food_payment_result',
      },
    },

    // Check the payment result
    check_food_payment_result: {
      type: 'decision',
      description: 'Check if food payment succeeded or failed',
      conditions: [
        {
          expression: 'context._user_message === "__payment_success__"',
          event: 'payment_success',
        },
        {
          expression: 'context._user_message === "__payment_failed__" || context._user_message?.includes("payment_failed")',
          event: 'payment_failed',
        },
        {
          expression: 'context._user_message?.toLowerCase().match(/^(cancel|nahi|no|stop)$/)',
          event: 'cancelled',
        },
        {
          expression: '/^(payment\\s*(is\\s*)?done|paid|pay\\s*kiya|pay\\s*kar\\s*diya|payment\\s*ho\\s*gaya|payment\\s*ho\\s*gya|payment\\s*complete|payment\\s*success|payment\\s*kar\\s*diya|paise\\s*de\\s*diye|paisa\\s*diya|done|ho\\s*gaya|check\\s*status|status\\s*check|verify|payment\\s*kiya)/i.test(String(context._user_message || "").trim())',
          event: 'maybe_paid',
        },
      ],
      transitions: {
        payment_success: 'completed',
        payment_failed: 'food_payment_failed',
        cancelled: 'cancelled',
        maybe_paid: 'verify_food_payment_via_api',
        default: 'food_payment_still_waiting',
      },
    },

    // Verify food payment status from PHP API
    verify_food_payment_via_api: {
      type: 'action',
      description: 'Check food order payment status from PHP backend',
      actions: [
        {
          id: 'check_food_order_status',
          executor: 'php_api',
          config: {
            action: 'get_order_details',
            token: '{{auth_token}}',
            orderId: '{{order_result.orderId}}',
          },
          output: '_food_order_status_check',
        },
      ],
      transitions: {
        default: 'evaluate_food_payment_status',
      },
    },

    // Evaluate if food payment was actually received
    evaluate_food_payment_status: {
      type: 'decision',
      description: 'Check if PHP confirms food payment',
      conditions: [
        {
          expression: 'context._food_order_status_check?.paymentStatus === "paid" || context._food_order_status_check?.payment_status === "paid"',
          event: 'confirmed_paid',
        },
        {
          expression: 'context._food_order_status_check?.orderStatus === "confirmed" || context._food_order_status_check?.order_status === "confirmed"',
          event: 'confirmed_paid',
        },
      ],
      transitions: {
        confirmed_paid: 'completed',
        default: 'food_payment_not_confirmed_yet',
      },
    },

    // Food payment not yet confirmed on backend
    food_payment_not_confirmed_yet: {
      type: 'action',
      description: 'Tell user food payment not yet confirmed',
      actions: [
        {
          id: 'food_not_confirmed_msg',
          executor: 'response',
          config: {
            message: '⏳ Payment not yet confirmed.\n\nIf you have already paid, please wait 1-2 minutes for processing.\n\nIf not, tap below to pay:\n🔗 {{order_result.paymentLink}}',
            buttons: [
              { label: '🔄 Check Again', value: 'payment is done' },
              { label: '❌ Cancel', value: 'cancel' },
            ],
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'wait_food_payment_result',
      },
    },

    // User sent irrelevant message while waiting for food payment
    food_payment_still_waiting: {
      type: 'action',
      description: 'Acknowledge message and keep waiting for food payment',
      actions: [
        {
          id: 'food_still_waiting_msg',
          executor: 'response',
          config: {
            message: '⏳ Waiting for your payment...\n\nOrder ID: #{{order_result.orderId}}\nAmount: ₹{{pricing.total}}\n\n🔗 Pay here: {{order_result.paymentLink}}\n\nReply "payment done" after paying, or "cancel" to cancel.',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'wait_food_payment_result',
      },
    },

    // Payment failed - offer retry or cancel
    food_payment_failed: {
      type: 'action',
      description: 'Handle food payment failure',
      actions: [
        {
          id: 'payment_error',
          executor: 'response',
          config: {
            message: '❌ **Payment Failed**\n\nYour payment could not be completed. The order has been saved.\n\nYou can retry payment or cancel:',
            buttons: [
              { label: '🔄 Retry Payment', value: 'retry_payment', action: 'retry_payment' },
              { label: '❌ Cancel Order', value: 'cancel', action: 'cancel_order' },
            ],
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'await_food_payment_retry',
      },
    },

    // Wait for user decision on payment retry
    await_food_payment_retry: {
      type: 'wait',
      description: 'Wait for user decision on food payment retry',
      onEntry: [],
      transitions: {
        retry_payment: 'show_food_payment_gateway',
        cancel_order: 'cancelled',
        user_message: 'handle_food_payment_retry_input',
        default: 'handle_food_payment_retry_input',
      },
    },

    // Handle text input for payment retry decision
    handle_food_payment_retry_input: {
      type: 'action',
      description: 'Handle text input for food payment retry',
      actions: [
        {
          id: 'interpret_retry',
          executor: 'nlu_condition',
          config: {
            intents: ['cancel_flow', 'cancel_order'],
            minConfidence: 0.5,
          },
          output: '_retry_cancel_check',
        },
      ],
      transitions: {
        matched: 'cancelled',
        not_matched: 'show_food_payment_gateway', // Default: retry payment
        default: 'show_food_payment_gateway',
      },
    },

    // Payment timeout
    food_payment_timeout: {
      type: 'action',
      description: 'Food payment timed out',
      actions: [
        {
          id: 'timeout_msg',
          executor: 'response',
          config: {
            message: '⏰ **Payment Timeout**\n\nPayment session expired. Your order has been saved.\n\nWhat would you like to do?',
            buttons: [
              { label: '🔄 Retry Payment', value: 'retry_payment', action: 'retry_payment' },
              { label: '❌ Cancel', value: 'cancel', action: 'cancel_order' },
            ],
          },
        },
      ],
      transitions: {
        default: 'await_food_payment_retry',
      },
    },

    // Success
    completed: {
      type: 'end',
      description: 'Order successfully placed',
      actions: [
        {
          id: 'success_message',
          executor: 'response',
          config: {
            message: '✅ **Order placed!**\n\n✅ Order ID: #{{order_result.orderId}}\n💰 Total: ₹{{pricing.total}}\n📍 Delivery: {{delivery_address.label}}\n⏱️ ETA: 30-45 minutes\n\n📍 Track your order:\n{{order_result.trackingUrl}}\n\nYou\'ll receive WhatsApp updates on each step!',
          },
          output: '_last_response',
        },
        {
          id: 'learn_from_order',
          executor: 'profile',
          config: {
            action: 'learn_from_order',
          },
          output: '_profile_learned',
        },
        {
          id: 'post_order_question',
          executor: 'profile',
          config: {
            action: 'ask_question',
            context: 'post_food_order',
            onlyIfIncomplete: true,
          },
          output: '_profile_question',
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
            index: 'food_items',
            limit: 8
          },
          output: 'popular_categories'
        },
        {
          id: 'no_results_message',
          executor: 'response',
          config: {
            message: 'Maaf kijiye, "{{_user_message}}" ke liye kuch nahi mila. 😕\n\nAap try kar sakte hain:\n• Pizza 🍕\n• Burger 🍔\n• Biryani 🍛\n• Momos 🥟\n\nKya order karna chahte ho?',
            responseType: 'text', // Clear any previous responseType
            buttons: [
              { id: 'btn_pizza', label: '🍕 Pizza', value: 'pizza' },
              { id: 'btn_burger', label: '🍔 Burger', value: 'burger' },
              { id: 'btn_biryani', label: '🍛 Biryani', value: 'biryani' },
            ],
          },
          output: '_last_response',
        },
      ],
      transitions: {
        user_message: 'understand_request',
        pizza: 'process_specific_food',
        burger: 'process_specific_food',
        biryani: 'process_specific_food',
        default: 'understand_request',
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

  initialState: 'check_trigger',
  finalStates: ['completed', 'cancelled', 'address_error', 'out_of_zone', 'distance_error', 'order_failed', 'food_payment_timeout'],
};
