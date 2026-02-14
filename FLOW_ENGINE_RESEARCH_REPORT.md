# MangwaleAI Flow Engine System — Comprehensive Research Report

**Date:** February 2026  
**Scope:** Full analysis of the NestJS backend flow engine, all flows, executors, and message pipeline  
**Codebase Root:** `backend/src/flow-engine/`

---

## Table of Contents

1. [Message Flow Pipeline (End-to-End)](#1-message-flow-pipeline)
2. [All Existing Flows](#2-all-existing-flows)
3. [Step-by-Step Flow Operation](#3-step-by-step-flow-operation)
4. [YAML Flow Structure](#4-yaml-flow-structure)
5. [Add-to-Cart Mechanism](#5-add-to-cart-mechanism)
6. [Order Flow (Checkout → Placement)](#6-order-flow)
7. [Completeness Assessment](#7-completeness-assessment)
8. [Executor Inventory](#8-executor-inventory)
9. [Parcel Booking Flow](#9-parcel-booking-flow)

---

## 1. Message Flow Pipeline

### End-to-End Message Lifecycle

```
User (Browser/WhatsApp/Telegram/Voice/Mobile)
        │
        ▼
┌─────────────────────────┐
│   ChatGateway (WS)      │  /ai-agent namespace, Socket.io
│   handleMessage()       │  Syncs auth, resolves phone, logs to Postgres
└────────┬────────────────┘
         │ (SYNC call)
         ▼
┌─────────────────────────┐
│  MessageGatewayService  │  Multi-channel handler
│  handleWebSocketMessage │  Dedup → get/create session → auto-auth → log
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   ContextRouter         │  Determines: active flow? new intent? fallback?
└────────┬────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌─────────────────────┐
│  NLU   │  │  FlowEngineService  │
│Pipeline│  │  startFlow() or     │
│        │  │  processMessage()   │
└───┬────┘  └──────┬──────────────┘
    │              │
    │              ▼
    │       ┌─────────────────────┐
    └──────▶│  StateMachineEngine │
            │  executeState()     │
            └──────┬──────────────┘
                   │
                   ▼
            ┌─────────────────────┐
            │  ExecutorRegistry   │
            │  execute(name,ctx)  │
            └──────┬──────────────┘
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
 ┌────────┐  ┌─────────┐  ┌────────┐
 │ NLU    │  │ Search  │  │ Order  │  ...30+ executors
 │Executor│  │Executor │  │Executor│
 └────────┘  └─────────┘  └────────┘
                   │
                   ▼
            ┌─────────────────────┐
            │  Response assembled │
            │  _last_response     │
            │  [BTN|label|value]  │
            └──────┬──────────────┘
                   │
                   ▼
            ┌─────────────────────┐
            │  ChatGateway emits  │
            │  via Socket.io      │
            └─────────────────────┘
```

### Key Components in Detail

| Component | File | Lines | Role |
|-----------|------|-------|------|
| **ChatGateway** | `chat/chat.gateway.ts` | ~1434 | WebSocket entry point. Auth sync, button-click parsing, location handling, typing indicators, response emission |
| **MessageGatewayService** | `chat/services/message-gateway.service.ts` | ~805 | Channel-agnostic handler. Dedup, session management, auto-auth for phone users, Redis pub/sub |
| **FlowEngineService** | `flow-engine/flow-engine.service.ts` | 1363 | Flow lifecycle: start, process, suspend, resume, cancel. Intent-to-flow mapping, context injection |
| **StateMachineEngine** | `flow-engine/state-machine.engine.ts` | 661 | State execution: onEntry → actions → conditions → transitions → onExit. Input validation, error handling with retry |
| **FlowContextService** | `flow-engine/flow-context.service.ts` | 366 | Context CRUD, Handlebars interpolation (`{{path.to.value}}`), JavaScript expression evaluation via `new Function()` |
| **ExecutorRegistryService** | `flow-engine/executor-registry.service.ts` | 131 | Central `Map<string, ActionExecutor>` registry with validation and execution |

### NLU Pipeline (within message processing)

```
User Message
    │
    ▼
IndicBERT Intent Classification (local model)
    │
    ▼
Entity Extraction (NER + LLM hybrid)
    │
    ▼
Tone Analysis (7 emotions: happy, sad, angry, frustrated, confused, neutral, excited)
    │
    ▼
Confidence Check ──── < threshold ────▶ LLM Fallback (Groq)
    │ (≥ threshold)
    ▼
Return: { intent, confidence, entities, language, tone, sentiment }
```

---

## 2. All Existing Flows

### Registered TypeScript Flows (16 flows in `flows/index.ts`)

| # | Flow ID | Trigger(s) | Module | Purpose | Lines |
|---|---------|-----------|--------|---------|-------|
| 1 | `greeting_v1` | `greeting` | general | Personalized welcome (LLM w/ weather, time, festival awareness) | ~60 |
| 2 | `auth_v1` | `login` | general | Phone OTP authentication + profile completion | 346 |
| 3 | `first_time_onboarding_v1` | *(first visit)* | general | New user onboarding | — |
| 4 | `help_v1` | `help` | general | Help menu with navigation | — |
| 5 | `game_intro_v1` | *(game trigger)* | general | Training game introduction | — |
| 6 | `farewell_v1` | `farewell` | general | Goodbye with personalization | — |
| 7 | `chitchat_v1` | `chitchat` | general | Small talk via LLM | — |
| 8 | `feedback_v1` | `feedback` | general | Collect user feedback | — |
| 9 | `parcel_delivery_v1` | `parcel_booking` | parcel | **Full parcel booking** (5-question flow) | 2103 |
| 10 | `food_order_v1` | `order_food\|browse_menu\|browse_category\|ask_recommendation\|ask_famous\|check_availability\|ask_fastest_delivery` | food | **Full food ordering** with external vendor fallback | 3980 |
| 11 | `ecommerce_order_v1` | `search_product` | ecommerce | Product search + cart + order | 503 |
| 12 | `order_tracking_v1` | *(track trigger)* | order | Order status tracking | — |
| 13 | `support_v1` | *(support trigger)* | general | Customer support | — |
| 14 | `profile_v1` | *(profile trigger)* | general | Profile management | — |
| 15 | `address_management_v1` | *(address trigger)* | general | Saved address CRUD | — |
| 16 | *(training_game)* | — | general | **Disabled** (`.disabled` file) | — |

### YAML Flows (v1 — `flows/yaml/`)

| File | Purpose |
|------|---------|
| `auth.flow.yaml` | Authentication flow |
| `complaints.flow.yaml` | Complaint handling |
| `greeting.flow.yaml` | Greeting flow |
| `order.flow.yaml` | Order flow |
| `parcel.flow.yaml` | Parcel tracking (not booking) |
| `search.flow.yaml` | Product search |
| `smart-order.flow.yaml.disabled` | Smart ordering (disabled) |

### YAML Flows (v2 — `flows/yaml-v2/`)

| File | Purpose |
|------|---------|
| `customer-order-status.flow.yaml` | Order tracking with multilingual (EN/HI/MR) |
| `delivery-auth.flow.yaml` | Delivery partner auth |
| `delivery-orders.flow.yaml` | Delivery partner order management |
| `location-collection.flow.yaml` | Location collection sub-flow |
| `payment-completion.flow.yaml` | Payment completion |
| `user-type-detection.flow.yaml` | Customer vs vendor vs delivery detection |
| `vendor-auth.flow.yaml` | Vendor authentication |
| `vendor-orders.flow.yaml` | Vendor order management |

---

## 3. Step-by-Step Flow Operation

### How `FlowEngineService.startFlow()` Works

```
1. Load flow definition by ID
2. Validate flow has initialState and states
3. Resolve phone number via SessionIdentifierService
4. Create FlowRun record in PostgreSQL (Prisma)
5. Create FlowContext with system metadata:
   { _system: { flowId, flowRunId, sessionId, currentState, startedAt, previousStates[] } }
6. Inject session data into context:
   - user_authenticated, userId, userPhone, userName, userEmail
   - location (lat/lng/city/address)
   - platform (web/whatsapp/telegram/voice/mobile)
   - conversation_history (last 10 messages)
   - Enhanced context: weather, active festivals, time-of-day
7. Execute initial state via StateMachineEngine
8. AUTO-EXECUTE loop: Keep advancing through action/decision states
   until hitting a WAIT state (needs user input) or END state
9. Save context to Redis session
10. Return response from _last_response
```

### How `FlowEngineService.processMessage()` Works

```
1. Get active flow ID from session
2. Load FlowRun from PostgreSQL
3. Restore FlowContext from session/DB (merges saved context)
4. Refresh auth/location/platform from session
5. Inject Phase 3 intent (NLU result for intent-aware flows)
6. Set _user_message = incoming message text
7. Execute current state with event='user_message'
8. StateMachineEngine picks up from wait state:
   a. Execute wait-state actions (parse user input)
   b. Find triggered event from action results
   c. Evaluate transitions → determine next state
   d. Run onExit of current state
   e. Transition to next state
9. AUTO-EXECUTE through action/decision states again
10. On flow completion → clearFlowFromSession()
11. On continuation → save context to session + update FlowRun
12. If flow switch intent detected → suspend current flow, start new
```

### State Machine Execution Model (`StateMachineEngine.executeState()`)

```
executeState(stateName, context, event):
  1. Check for intent interruption (cancel/help/context-switch)
  2. If first entry (no event):
     - Run onEntry actions (one-time setup, display prompts)
  3. If resume with event:
     - Skip onEntry (already shown)
     - Execute main actions (parse input, call APIs)
  4. Input Validation (if state has validator):
     - regex, intent, custom, keyword validators
     - Track failure count, max failures → transition to error
  5. For DECISION states:
     - Evaluate conditions[] in order (JavaScript expressions)
     - First matching condition → event
     - No match → 'default' event
  6. Find triggered event:
     - Action states: infer 'success' if all actions pass
     - Wait states: preserve incoming event
  7. Resolve next state from transitions[event]
  8. Run onExit actions
  9. Return { nextState, event, context }
```

### Auto-Execute Loop

The flow engine **never stops at action or decision states**. After each state transition, it checks:

```
while (state.type === 'action' || state.type === 'decision' || state.type === 'end'):
    execute state
    if state.type === 'end': break (flow complete)
    if nextState exists: continue to nextState
    else: break
// Stops at WAIT state → returns response, waits for user input
```

This means a single user message can trigger a cascade of 5–15 states executing in sequence before the next response is sent.

---

## 4. YAML Flow Structure

### Two YAML Versions

**Version 1 (`yaml/`)** uses a simpler schema:

```yaml
name: parcel
version: "1.0"
initial_state: start
context:
  orderId: null
states:
  start:
    type: decision
    on_entry:
      - action: check_active_orders
        params:
          userId: "{{userId}}"
    transitions:
      - event: has_active_orders
        target: show_active_orders
```

**Version 2 (`yaml-v2/`)** uses a richer, more structured schema with multilingual support:

```yaml
id: customer_order_status_v1
name: Customer Order Status
version: '1.0'
triggers:
  - type: intent
    intents: [track_order, order_status]
  - type: message
    patterns: ['track', 'order.*status']
variables:
  order_id: ''
nodes:
  - id: check_active_orders
    type: action
    action: php_api
    params:
      action: get_customer_orders
    outputs:
      orders: orders
    next: check_orders_exist
  - id: no_active_orders
    type: message
    message:
      en: "You don't have any active orders 📭"
      hi: "अभी कोई सक्रिय ऑर्डर नहीं है 📭"
      mr: "सध्या कोणतेही सक्रिय ऑर्डर नाहीत 📭"
    next: wait_for_choice
```

### YAML Loading

The `YamlFlowLoaderService` reads `.yaml`/`.yml` files from the `flows/yaml/` directory, parses them with `js-yaml`, and converts them into the same `FlowDefinition` TypeScript type used by TypeScript flows. This means YAML and TypeScript flows are interchangeable at runtime.

**Key difference:** V2 YAML flows support `nodes` (linear list) rather than `states` (keyed map), and include multilingual messages and trigger patterns as first-class features.

---

## 5. Add-to-Cart Mechanism

### Pipeline: User Selection → Cart Addition

```
User says: "Add 1 to cart" or "paneer tikka" or clicks ADD button
                    │
┌───────────────────▼────────────────────────────┐
│  resolve_user_intent (NLU + entity_resolution) │
│  → Extracts food/store references              │
│  → Checks OpenSearch for matching entities     │
└───────────────────┬────────────────────────────┘
                    │
┌───────────────────▼────────────────────────────┐
│  check_resolution_result (DECISION)            │
│  Priority: selection patterns first!           │
│  • "1", "1,2,3", "add X to cart" → selection   │
│  • Store resolved → new filtered search        │
│  • New items detected → new search             │
│  • Default → process_selection                 │
└───────────────────┬────────────────────────────┘
                    │
┌───────────────────▼────────────────────────────┐
│  process_selection (SelectionExecutor)          │
│  Parses: "1", "1,2,3", "1x2",                 │
│          "first one", "add paneer to cart"      │
│  Returns: selectedItems[], event               │
│  Events: item_selected / checkout / cancel /   │
│          search_more / view_cart / unclear      │
└───────────────────┬────────────────────────────┘
                    │ item_selected
┌───────────────────▼────────────────────────────┐
│  add_to_cart (CartManagerExecutor)              │
│  config.operation = 'add'                      │
│  Validates: same-store constraint              │
│  Returns: items_added / store_conflict /       │
│           no_items                             │
└───────────────────┬────────────────────────────┘
                    │ items_added
┌───────────────────▼────────────────────────────┐
│  cart_add_success (WAIT)                       │
│  Shows: "✅ Added! Cart: X items, ₹Y"          │
│  Buttons: Checkout / Add More / Clear          │
│  Saves: cart_items, cart_total, cart_store_id   │
└────────────────────────────────────────────────┘
```

### Auto-Cart (Express Ordering)

When the NLU detects specific food items with quantities from the user's initial message:

```
User: "2 paneer tikka aur 1 butter naan chahiye"
                    │
┌───────────────────▼─────────────────────────┐
│  understand_request (NLU executor)          │
│  → entities: { items: ["paneer tikka",      │
│     "butter naan"], quantities: [2, 1] }    │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  search_food (SearchExecutor)               │
│  → OpenSearch query with geo-filtering      │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  check_auto_select (DECISION)               │
│  extracted_food has items+quantities?        │
└───────────────────┬─────────────────────────┘
                    │ yes
┌───────────────────▼─────────────────────────┐
│  auto_match_items (AutoCartExecutor)        │
│  Fuzzy-matches extracted items against      │
│  search results using Levenshtein distance  │
│  Returns: all_matched / partial / no_match  │
└───────────────────┬─────────────────────────┘
                    │ all_matched
┌───────────────────▼─────────────────────────┐
│  confirm_auto_cart (WAIT)                   │
│  "Found all items! Confirm?"                │
│  User: "yes" → add all to cart → checkout   │
└─────────────────────────────────────────────┘
```

### Store Conflict Handling

The cart enforces a **single-store constraint**. If a user adds items from restaurant B while having items from restaurant A:

1. `handle_store_conflict` → Shows warning with current store name
2. User chooses: "Clear & Add New" → `clear_cart_and_add_new` → clears old → adds new
3. Or "Keep My Cart" → back to `show_current_cart`

### Cart Data Structure

```typescript
// cart_data (raw — used for operations)
[{ itemId, storeId, storeName, name, price, quantity, storeLat, storeLng }]

// cart_items (card format — used for display)
[{ id, title, subtitle, price, image, buttons: [{ label, value }] }]

// cart_update_result
{ cartSummary, totalPrice, totalItems, storeId, storeName, cart_data, cart_items }
```

---

## 6. Order Flow (Checkout → Placement)

### Food Order Checkout Pipeline

```
check_auth_for_checkout
    │
    ├── authenticated ──────────────────────────▶ collect_address
    │
    └── not authenticated ──▶ request_phone
                                    │
                              parse_phone (with escape: modify/cancel/add_more)
                                    │
                              send_otp → verify_otp → check_otp
                                    │          │
                                    │      invalid → otp_retry → resend / retry
                                    │
                              ┌─────▼──────┐
                              │ AUTHENTICATED│
                              └─────┬──────┘
                                    │
                              collect_address
                              (address executor, offers saved addresses)
                                    │
                              validate_zone
                              (zone executor — checks Nashik service area)
                                    │
                        ┌───────────┴───────────┐
                        │                       │
                  Regular Order            Custom Order
                  (partner store)          (external vendor)
                        │                       │
                  calculate_distance       calculate_custom_distance
                  (store → delivery)       (pickup → delivery)
                        │                       │
                  calculate_pricing        calculate_custom_pricing
                  (food rates)             (parcel rates)
                        │                       │
                  collect_payment_method    show_custom_summary
                  (COD / Digital)               │
                        │                       │
                  show_order_summary       ─────┘
                  (all details + total)
                        │
                  check_final_confirmation
                  (NLU-based yes/no)
                        │
                  ┌─────┴──────┐
                  │            │
             place_order  place_custom_order
             (food type)  (parcel type)
                  │            │
              order executor → PHP Backend API
                  │
              completed
              ("Order #123 placed! ETA: 30-45 min")
```

### Parcel Order Checkout Pipeline

```
show_summary ("Question 5/5: Confirm?")
    │
    ├── confirmed → check_auth_before_order
    │                   │
    │                   ├── authenticated → select_payment_method
    │                   │                       │
    │                   │                  ┌────┴────┐
    │                   │                  │         │
    │                   │            COD path   Digital path
    │                   │                  │         │
    │                   │          place_order_cod  place_order_digital
    │                   │          (order executor)  (order executor)
    │                   │                  │         │
    │                   │              completed  show_payment_gateway
    │                   │                         (Razorpay SDK metadata)
    │                   │                              │
    │                   │                         wait_payment_result
    │                   │                              │
    │                   │                    ┌─────────┴─────────┐
    │                   │                    │                   │
    │                   │              __payment_success__  __payment_failed__
    │                   │                    │                   │
    │                   │               completed         payment_failed
    │                   │                              (retry/COD/cancel)
    │                   │
    │                   └── not authenticated → platform routing
    │                           │
    │                      ┌────┴────┐
    │                      │         │
    │                   web      whatsapp/telegram
    │                      │         │
    │             trigger_frontend   require_login
    │             _auth_order        (inline OTP flow)
    │             (modal popup)           │
    │                                wait_for_phone
    │                                send_otp → verify_otp
    │                                     │
    │                                auth_success
    │                                     │
    │                                resume_after_auth
    │                                (routes back to payment)
    │
    └── cancelled → cancelled (end state)
```

### Order Executor Details

The `order.executor.ts` creates orders via `PhpOrderService`:

- **Food orders:** Sends cart items, delivery address, payment method to PHP API
- **Parcel orders:** Sends pickup/delivery addresses, recipient, vehicle category, pricing, payment to PHP API
- **Custom food orders:** Treated as parcel (rider pickup from external vendor)
- Requires authenticated user (token or userId)
- Supports retry with `maxRetries: 2`

---

## 7. Completeness Assessment

### Production-Ready (Fully Implemented)

| Flow | States | Coverage |
|------|--------|----------|
| **Food Order** | ~80+ states | ✅ Complete: location → NLU → search → auto-cart → selection → cart management → store conflict → auth → address → zone → distance → pricing → payment → order placement → external vendor fallback → custom pickup |
| **Parcel Delivery** | ~50+ states | ✅ Complete: auth → pickup address → zone → delivery address → zone → recipient → vehicle category → distance → pricing → confirmation → payment (COD + Razorpay) → order placement → profile question |
| **Ecommerce Order** | ~20 states | ✅ Basic complete: search → display → selection → cart → address → zone → pricing → summary → confirmation → order |
| **Greeting** | 2 states | ✅ Complete (LLM-personalized) |
| **Auth** | ~10 states | ✅ Complete (phone + OTP + profile) |

### Architecturally Sound but Simpler

| Flow | Status |
|------|--------|
| Farewell, Help, Chitchat, Feedback | Functional but thin (few states, mostly LLM responses) |
| Profile, Address Management | Functional CRUD flows |
| Order Tracking | Structure present, hooks into PHP API |
| First-Time Onboarding | Engagement flow for new users |

### Notable Gaps & Weaknesses

1. **Ecommerce is simpler than Food/Parcel** — No auto-cart, no entity resolution, no external vendor fallback, no store conflict handling. ~503 lines vs 3980 for food.

2. **YAML flows (v1) are simpler prototypes** — The v1 YAML flows use a different schema and appear to be earlier versions or tracking-focused (not the primary flows used for ordering).

3. **YAML v2 flows are multi-role** — Customer, Vendor, and Delivery partner flows exist in v2, addressing a three-sided marketplace, but these appear to be in development/parallel track.

4. **`game-scorer.executor.ts.disabled`** and **`training-game.flow.ts.disabled`** — Gamification features disabled.

5. **Upsell logic is mock** — `add_upsell_item` uses LLM to acknowledge but doesn't actually search/add specific items.

6. **Some decision states use `.includes()` instead of NLU** — Progressive migration from string matching to `nlu_condition` executor is noted with `🚀 AGENTIC` comments, but not 100% complete.

7. **No automatic order tracking integration** — Food order completion says "track your order" but no automatic flow trigger for tracking.

8. **Digital payment verification** — Relies on frontend sending `__payment_success__` / `__payment_failed__` magic strings; no server-side Razorpay webhook verification visible in flow definitions.

---

## 8. Executor Inventory

### Complete List (33 executors, 2 disabled)

| # | Executor Name | File | Purpose |
|---|--------------|------|---------|
| 1 | `adaptive` | `adaptive.executor.ts` | Adaptive response behavior |
| 2 | `address` | `address.executor.ts` | Address collection, saved address selection, geocoding |
| 3 | `agent` | `agent.executor.ts` | Agent/human handoff |
| 4 | `auth` | `auth.executor.ts` | Phone validation, OTP send/verify, auth state management |
| 5 | `auto_cart` | `auto-cart.executor.ts` | Fuzzy-match extracted items against search results for express ordering |
| 6 | `cart_manager` | `cart-manager.executor.ts` | Cart CRUD (add/remove/clear/validate), single-store enforcement |
| 7 | `complex_order_parser` | `complex-order-parser.executor.ts` | Parse complex multi-item orders |
| 8 | `distance` | `distance.executor.ts` | Haversine distance calculation between coordinates |
| 9 | `entity_resolution` | `entity-resolution.executor.ts` | Resolve store/food references via OpenSearch |
| 10 | `external_search` | `external-search.executor.ts` | Google Places API search for non-partner restaurants |
| 11 | ~~`game_scorer`~~ | `game-scorer.executor.ts.disabled` | *Disabled* — Game scoring |
| 12 | `game` | `game.executor.ts` | Training/engagement game logic |
| 13 | `group_order_search` | `group-order-search.executor.ts` | Group order search (multi-user ordering) |
| 14 | `input_validator` | `input-validator.service.ts` | Input validation (regex, intent, custom, keyword) |
| 15 | `inventory` | `inventory.executor.ts` | Inventory/availability checking |
| 16 | `llm` | `llm.executor.ts` | LLM calls (Groq) for dynamic responses, parsing, intent classification |
| 17 | `nlu_condition` | `nlu-condition.executor.ts` | NLU-based conditional routing (intent matching with confidence threshold) |
| 18 | `nlu` | `nlu.executor.ts` | Full NLU pipeline (IndicBERT → entity extraction → tone analysis) |
| 19 | `order` | `order.executor.ts` | Order creation via PhpOrderService (food, parcel, ecommerce) |
| 20 | `parcel` | `parcel.executor.ts` | Parcel-specific: get vehicle categories, calculate shipping via PhpParcelService |
| 21 | `php_api` | `php-api.executor.ts` | Generic PHP backend API calls (payment methods, order status, etc.) |
| 22 | `preference` | `preference.executor.ts` | User preference learning/recall |
| 23 | `pricing` | `pricing.executor.ts` | Price calculation (food/parcel rates, delivery fees, tax) |
| 24 | `profile` | `profile.executor.ts` | Progressive profiling (post-order questions) |
| 25 | `pure_ner` | `pure-ner.executor.ts` | Named entity recognition (standalone) |
| 26 | `response` | `response.executor.ts` | Static response rendering (message, buttons, cards), context save, prevents hallucination |
| 27 | ~~`reward_points`~~ | `reward-points.executor.ts.disabled` | *Disabled* — Loyalty/reward points |
| 28 | `saved_address_selector` | `saved-address-selector.executor.ts` | Saved address selection UI |
| 29 | `search` | `search.executor.ts` | OpenSearch queries (food, products, categories, recommendations) with geo-filtering, fuzzy matching, ML reranking |
| 30 | `selection` | `selection.executor.ts` | Parse user selection from results (numbers, names, "first one", "checkout") |
| 31 | `session` | `session.executor.ts` | Session read/write/refresh_auth operations |
| 32 | `value_proposition` | `value-proposition.executor.ts` | Show value propositions/benefits |
| 33 | `zone` | `zone.executor.ts` | Service area validation (Nashik zone check) |

### Executor Interface

```typescript
interface ActionExecutor {
  name: string;
  execute(context: FlowContext, config: Record<string, any>): Promise<ExecutorResult>;
  validate?(config: Record<string, any>): boolean;
}

// ExecutorResult
{ event?: string, data?: any, message?: string, error?: string }
```

### Executor Dependencies

```
search.executor     → OpenSearch
order.executor      → PhpOrderService, PhpPaymentService
parcel.executor     → PhpParcelService
auth.executor       → PHP Auth API (OTP)
external_search     → Google Places API
nlu.executor        → NluService (IndicBERT)
llm.executor        → Groq API
address.executor    → Geocoding service
zone.executor       → Zone validation service
distance.executor   → Haversine calculation
```

---

## 9. Parcel Booking Flow

### Design Philosophy

> "Ask ONLY what PHP API requires, nothing extra" — 5 questions total (from flow comments)

### Complete State Machine

```
check_trigger
    │
    ▼
init (save trigger intent)
    │
    ▼
check_auth_before_flow (session executor: refresh_auth)
    │
    ├── authenticated → fetch_saved_addresses
    └── not_authenticated → check_platform_for_auth
                                │
                           ┌────┴────┐
                           web      other
                           │         │
                      trigger_    trigger_auth
                      frontend   (inline OTP)
                      _auth          │
                      (modal)   [auth sub-flow within parcel]
                                     │
                                auth_success → resume_after_auth

fetch_saved_addresses (parcel executor: get_saved_addresses)
    │
    ▼
═══════════════════════════════════════
QUESTION 1/5: PICKUP ADDRESS
═══════════════════════════════════════
collect_pickup (address executor)
    │ address_valid
    ▼
validate_pickup_zone (zone executor)
    │ zone_valid
    ▼
═══════════════════════════════════════
QUESTION 2/5: DELIVERY ADDRESS
═══════════════════════════════════════
collect_delivery (address executor)
    │ address_valid
    ▼
validate_delivery_zone (zone executor)
    │ zone_valid
    ▼
═══════════════════════════════════════
QUESTION 3/5: RECIPIENT DETAILS
═══════════════════════════════════════
check_auth_for_recipient (decision)
    │
    ├── authenticated → collect_recipient
    │                      │
    │              ask_recipient_details (WAIT)
    │              "Use my details" button available
    │                      │
    │              extract_recipient (LLM: name + phone)
    │                      │
    │              validate_recipient (regex check)
    │                      │
    └── not_authenticated → must authenticate first
    
═══════════════════════════════════════
QUESTION 4/5: VEHICLE TYPE
═══════════════════════════════════════
fetch_categories (parcel executor: get_categories from PHP)
    │
show_categories (WAIT — display vehicle cards)
    │
handle_vehicle_selection (LLM extracts category ID)
    │
validate_vehicle (check ID exists in available categories)
    │
═══════════════════════════════════════
QUESTION 5/5: CONFIRM & PAY
═══════════════════════════════════════
calculate_distance (Haversine: pickup → delivery)
    │
validate_distance (> 0.01 km, not same location)
    │
calculate_pricing (parcel executor: calculate_shipping)
    │
show_summary (WAIT)
    "📦 Order Summary"
    "📍 Pickup: ... → Delivery: ..."
    "👤 Recipient: name (phone)"
    "📏 Distance: X km"
    "💰 Total: ₹Y"
    Buttons: [Confirm] [Cancel]
    │
check_confirmation (regex: yes/confirm/haan vs no/cancel/nahi)
    │
    ├── confirmed → check_auth_before_order
    │                   │
    │                   ├── authenticated → select_payment_method
    │                   │                       │
    │                   │              fetch payment methods from PHP API
    │                   │              (fallback: COD + Digital)
    │                   │                       │
    │                   │              ┌────────┴────────┐
    │                   │              │                 │
    │                   │         place_order_cod   place_order_digital
    │                   │         (order executor)  (order executor)
    │                   │              │                 │
    │                   │          completed       show_payment_gateway
    │                   │                          (Razorpay metadata)
    │                   │                               │
    │                   │                          wait_payment_result
    │                   │                          (5 min timeout)
    │                   │                               │
    │                   │                    ┌──────────┴──────────┐
    │                   │                    │         │           │
    │                   │               success   failed     timeout
    │                   │                    │         │           │
    │                   │              completed  retry/COD   retry/COD
    │                   │
    │                   └── not_authenticated → platform-aware auth
    │
    └── cancelled → cancelled (end)

completed (end)
    "🎉 Order Confirmed! #OrderID"
    "📍 From: ... → To: ..."
    "💰 Total: ₹Y"
    "⏱️ ETA: 30-45 minutes"
    Buttons: [Track Order] [Home]
    │
    ▼
check_profile_question (progressive profiling)
    │
    ├── question_asked → wait_profile_answer → save → finish
    └── skip → finish
```

### Parcel Flow Specifics

- **Zone validation:** Both pickup and delivery must be within Nashik city limits
- **Recipient details:** LLM-extracted (name + phone), supports "Use my details" for authenticated users
- **Vehicle categories:** Fetched dynamically from PHP API (e.g., Bike Delivery, Auto, Mini Truck)
- **Pricing:** Server-calculated via `PhpParcelService.calculateShipping()` based on distance + vehicle category
- **Payment methods:** Fetched from PHP API, fallback to COD + Digital
- **Razorpay integration:** Order ID created server-side, frontend opens Razorpay SDK, result communicated via special messages (`__payment_success__` / `__payment_failed__`)
- **Platform-aware auth:** Web users get frontend OAuth modal; WhatsApp/Telegram users get inline OTP

---

## Appendix A: Template System

All flow configurations support **Handlebars interpolation**:

```
{{variable}}                     → Simple value lookup
{{nested.path.to.value}}         → Dot-notation traversal
{{or value1 value2}}             → Fallback chain
{{default value "fallback"}}     → Default value
{{#if condition}}...{{/if}}      → Conditional blocks
{{#each array}}...{{/each}}      → Array iteration
{{eq a b}}                       → Equality check
{{ne a b}}                       → Inequality check
{{json object}}                  → JSON stringify
{{path1 || path2 || "default"}}  → Fallback syntax (custom)
```

Registered Handlebars helpers: `eq`, `ne`, `or`, `default`, `json`

## Appendix B: Flow State Types

| Type | Behavior |
|------|----------|
| `action` | Execute actions, auto-transition (never waits for user) |
| `decision` | Evaluate conditions, auto-transition to matching branch |
| `wait` | Execute onEntry (first time), then PAUSE for user input |
| `end` | Execute final actions, terminate flow |
| `input` | (YAML v1 only) Similar to wait |
| `parallel` | (Defined in types, not observed in flows) |
| `final` | (Defined in types, alias for end) |

## Appendix C: Intent-to-Flow Resolution Priority

`FlowEngineService.findFlowByIntent()` uses this priority:

1. **Help/login keyword check** — Direct match on known keywords
2. **Exact intent trigger match** — `flow.trigger === intent`
3. **Prefix match** — `flow.trigger.startsWith(intent)` or vice versa
4. **Partial match** — Fuzzy substring matching
5. **Trigger pattern match** — Pipe-separated patterns (e.g., `order_food|browse_menu`)
6. **Keyword fallback on intent** — Scan intent text for flow-related keywords
7. **Message content keyword fallback** — Scan raw message for keywords
8. **Module fallback** — Map modules (food, parcel, ecommerce) to their primary flow

## Appendix D: Error Handling

```typescript
interface ExecutorError {
  code: string;
  message: string;
  recoverable: boolean;
}

// Error strategies per action:
onError: 'continue' | 'fail' | 'retry' | 'skip'

// Retry with exponential backoff:
retryCount: number       // max retries
retryDelay: number       // base delay in ms
timeout: number          // max execution time
```

## Appendix E: Session Data Injected into Flow Context

```typescript
{
  // Auth
  user_authenticated: boolean,
  userId: string,
  userPhone: string,
  userName: string,
  userEmail: string,
  
  // Location
  location: { lat, lng, city, address },
  
  // Platform
  platform: 'web' | 'whatsapp' | 'telegram' | 'voice' | 'mobile',
  
  // History
  conversation_history: Message[], // last 10
  
  // Enhanced (Phase 3)
  weather: { temp, condition },
  active_festivals: string[],
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night',
  
  // Internal
  _user_message: string,        // current message
  _last_response: any,          // last response sent
  _system: { flowId, flowRunId, sessionId, currentState, previousStates }
}
```
