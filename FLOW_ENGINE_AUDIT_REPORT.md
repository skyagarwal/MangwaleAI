# Flow Engine Comprehensive Audit Report

**Date:** February 2026  
**Scope:** `/backend/src/flow-engine/`  
**Files Audited:** 30+ files (core engine, all executors, all flow definitions)

---

## Table of Contents
1. [Flow Engine Core](#1-flow-engine-core)
2. [State Machine](#2-state-machine)
3. [All Flow Files](#3-all-flow-files)
4. [Executors](#4-executors)
5. [Context Service](#5-context-service)
6. [Session Handling](#6-session-handling)
7. [Summary & Priority Matrix](#7-summary--priority-matrix)

---

## 1. Flow Engine Core

**File:** `flow-engine.service.ts` (1363 lines)

### BUGS

#### BUG-1: `_last_response` never cleared between execution cycles (CRITICAL)
- **File:** [flow-engine.service.ts](backend/src/flow-engine/flow-engine.service.ts#L1297-L1363)
- `extractResponseFromContext()` reads `_last_response` from context but NEVER clears it after reading. If a state runs but doesn't set `_last_response`, the OLD response from a previous state leaks through and is sent to the user.
- **Impact:** Users may receive stale/duplicate messages from previous states.
- **Fix:** Clear `_last_response` after extraction: `this.contextService.set(context, '_last_response', null)` after reading.

#### BUG-2: Context restored via unsafe raw cast (HIGH)
- **File:** [flow-engine.service.ts](backend/src/flow-engine/flow-engine.service.ts#L291)
- `const context: FlowContext = flowRun.context as any;` — No validation that the persisted context conforms to `FlowContext` shape. If the DB contains corrupted/outdated context (e.g., after schema changes), the engine will crash unpredictably at runtime.
- **Fix:** Add schema validation before casting.

#### BUG-3: Hardcoded keyword lists in `findFlowByIntent()` (MEDIUM)
- **File:** [flow-engine.service.ts](backend/src/flow-engine/flow-engine.service.ts#L700-L940)
- Flow matching uses large hardcoded keyword arrays for intent routing. These duplicate NLU capabilities and are brittle — adding new flows requires code changes instead of config.
- **Impact:** Maintenance burden; keyword conflicts between flows.

### ISSUES

#### ISSUE-1: Flow cache has no invalidation mechanism (LOW)
- **File:** [flow-engine.service.ts](backend/src/flow-engine/flow-engine.service.ts)
- 5-minute TTL cache for flow definitions (`flowCache` Map). Only `clearCache()` method exists — no way to invalidate specific flows. If YAML flows are updated in production, stale definitions serve for up to 5 minutes.

#### ISSUE-2: `autoExecuteStates` hard limit of 20 iterations (MEDIUM)
- **File:** [flow-engine.service.ts](backend/src/flow-engine/flow-engine.service.ts#L1254)
- `maxIterations = 20` — complex flows with many decision states (food-order has 50+ states) could hit this limit during auto-execution chains, logging an error and halting mid-flow.
- **Impact:** Silent flow breakage in complex paths.

#### ISSUE-3: Error handling returns raw error text to user (LOW)
- **File:** [flow-engine.service.ts](backend/src/flow-engine/flow-engine.service.ts#L528)
- On unhandled errors, the engine returns a message containing the error details with suggestion to type 'reset'. Error text may contain stack traces or internal details.

---

## 2. State Machine

**File:** `state-machine.engine.ts` (662 lines)

### BUGS

#### BUG-4: Cancel state ternary operator precedence bug (HIGH)
- **File:** [state-machine.engine.ts](backend/src/flow-engine/state-machine.engine.ts#L103)
- Code:
  ```typescript
  const cancelState = state.transitions['cancel'] || state.transitions['cancelled'] || 
                      flow.states['cancelled'] ? 'cancelled' : flow.finalStates[0];
  ```
- Due to JS operator precedence, `||` binds tighter than `?:`. This evaluates as:
  ```typescript
  (state.transitions['cancel'] || state.transitions['cancelled'] || flow.states['cancelled']) ? 'cancelled' : flow.finalStates[0]
  ```
- **Effect:** The VALUE of `state.transitions['cancel']` is NEVER used as the target state. If a state has `transitions: { cancel: 'retry_state' }`, the cancel handler always goes to the global `'cancelled'` state instead of `retry_state`.
- **Fix:** Add explicit parentheses:
  ```typescript
  const cancelState = state.transitions['cancel'] || state.transitions['cancelled'] || 
                      (flow.states['cancelled'] ? 'cancelled' : flow.finalStates[0]);
  ```

#### BUG-5: `'input'` state type defined but NOT handled (MEDIUM)
- **File:** [flow.types.ts](backend/src/flow-engine/types/flow.types.ts) defines `'input'` as a valid state type.
- **File:** [state-machine.engine.ts](backend/src/flow-engine/state-machine.engine.ts#L62-L260) — `executeState()` only handles `'action'`, `'decision'`, `'wait'`, `'end'`. States of type `'input'` fall through to default behavior (treated as action), which may not match developer intent.

#### BUG-6: `'parallel'` state type defined but NOT implemented (MEDIUM)
- **File:** [flow.types.ts](backend/src/flow-engine/types/flow.types.ts) defines `'parallel'` as a valid state type.
- No implementation exists anywhere. Using `type: 'parallel'` in a flow definition silently falls through to action behavior. No `Promise.all()` or concurrent execution logic exists.

#### BUG-7: `'final'` state type not distinguished from `'end'` (LOW)
- **File:** [flow.types.ts](backend/src/flow-engine/types/flow.types.ts) defines both `'final'` and `'end'`.
- State machine only checks for `'end'` to determine completion. `'final'` states are not recognized as terminal states.

### ISSUES

#### ISSUE-4: Stuck state edge case (MEDIUM)
- **File:** [state-machine.engine.ts](backend/src/flow-engine/state-machine.engine.ts#L235-L250)
- If a `'wait'` state has NO transition for `'user_message'`, the engine returns `{nextState: null, completed: false}`. The flow stays permanently stuck in this state — user input is consumed but nothing happens. No warning is logged.
- **Fix:** Log a warning when no transition matches in wait states.

#### ISSUE-5: No timeout enforcement on state execution (LOW)
- `FlowAction.timeout` is defined in `flow.types.ts` but never enforced in `executeActionWithRetry()`. Actions can hang indefinitely.

---

## 3. All Flow Files

### food-order.flow.ts (4367 lines)

#### BUG-8: `add_upsell_item` state uses mock LLM instead of actual cart operation (HIGH)
- **File:** [food-order.flow.ts](backend/src/flow-engine/flows/food-order.flow.ts#L3389-L3413)
- The upsell item addition is labeled `"Add Upsell Item (Mock)"` — it uses LLM to say "Great choice! Added to your order" but NEVER actually adds any item to the cart. User is told the item was added when it wasn't.
- **Impact:** Users pay for fewer items than they expect; order total doesn't match displayed cart.

#### BUG-9: `otp_error` state has `user_message` transition on `action` type (MEDIUM)
- **File:** [food-order.flow.ts](backend/src/flow-engine/flows/food-order.flow.ts#L3271-L3280)
- State `otp_error` has `type: 'action'` but transition `{ user_message: 'request_phone' }`. Action states don't wait for user input — this transition can never fire. The state will auto-execute and follow `default` transition (which doesn't exist), causing `nextState = null`.
- **Fix:** Change to `transitions: { default: 'request_phone' }`.

#### BUG-10: `food_payment_timeout` state doesn't set `output` on response executor (LOW)
- **File:** [food-order.flow.ts](backend/src/flow-engine/flows/food-order.flow.ts#L4246-L4260)
- The response executor action doesn't specify `output: '_last_response'`, so the timeout message may not be returned to the user.

#### BUG-11: `confirm_selection` state is unreachable (LOW)
- **File:** [food-order.flow.ts](backend/src/flow-engine/flows/food-order.flow.ts#L3282-L3310)
- No state has a transition TO `confirm_selection`. It's defined but dead code — the flow uses `show_current_cart` and `cart_add_success` instead.

#### ISSUE-6: TODO — V3/multistage search disabled
- **File:** [food-order.flow.ts](backend/src/flow-engine/flows/food-order.flow.ts#L1543)
- `// TODO: Re-enable when search API supports v3/multistage/conversational`

#### ISSUE-7: Placeholder — External vendor store contact
- **File:** [food-order.flow.ts](backend/src/flow-engine/flows/food-order.flow.ts#L911)
- `// Show store contact (placeholder - would need phone from Places API)`

#### ISSUE-8: `clear_cart_state` uses response executor to clear cart (MEDIUM)
- **File:** [food-order.flow.ts](backend/src/flow-engine/flows/food-order.flow.ts#L3197-L3215)
- Uses `response` executor with `saveToContext` to set `cart_items: []` — this clears the context but NOT the actual cart in the `CartManagerExecutor`. The cart state may be inconsistent if context.data.cart_items is later re-read vs. cart_manager operation state.

### parcel-delivery.flow.ts (2265 lines)

#### BUG-12: `start_auth_flow` and `auth_redirect_end` are placeholder end states (MEDIUM)
- **File:** [parcel-delivery.flow.ts](backend/src/flow-engine/flows/parcel-delivery.flow.ts#L1500-L1515)
- Two states defined as `type: 'end'` with `description: 'Placeholder for flow transition'` — they end the flow without actually starting the auth flow or redirecting. User's parcel order is silently abandoned.
- These states are NOT in `finalStates`, so the flow technically becomes stuck.

#### BUG-13: `handle_payment_retry_input` stores LLM result but never routes on it (HIGH)
- **File:** [parcel-delivery.flow.ts](backend/src/flow-engine/flows/parcel-delivery.flow.ts#L1863-L1885)
- LLM extracts decision to `_retry_decision`, but the transition is `default: 'await_payment_retry'` which goes back to the wait state. The LLM output `_retry_decision` is never checked — the decision is lost.
- **Impact:** After payment failure, text input from user (not buttons) always loops back to retry without acting on their choice.

#### BUG-14: `completed` state type is `'action'` not `'end'` (MEDIUM)
- **File:** [parcel-delivery.flow.ts](backend/src/flow-engine/flows/parcel-delivery.flow.ts#L1938)
- The `completed` state is `type: 'action'` with `transitions: { default: 'check_profile_question' }`. This means the flow continues to profile questions after "completion". However, `completed` is NOT in `finalStates` — `finish` is. This could cause issues with flow run tracking since the "completed" state doesn't mark the flow as done.

#### ISSUE-9: Inconsistent pricing field names
- **File:** [parcel-delivery.flow.ts](backend/src/flow-engine/flows/parcel-delivery.flow.ts)
- Parcel flow uses `pricing.total_charge` while food flow uses `pricing.total`. If pricing executor returns with one naming convention, the other flow's templates will render empty.

#### ISSUE-10: `order_cancelled` state calls PHP API to cancel, then transitions to `finish` but NOT through `completed`
- **File:** [parcel-delivery.flow.ts](backend/src/flow-engine/flows/parcel-delivery.flow.ts#L1906-L1930)
- Cancels correctly via API, but the `finish` state is just `type: 'end'` with no actions. No confirmation message is sent after the cancel API response.

### ecommerce-order.flow.ts (503 lines)

#### BUG-15: `add_to_cart` uses LLM to parse selection instead of cart_manager (HIGH)
- **File:** [ecommerce-order.flow.ts](backend/src/flow-engine/flows/ecommerce-order.flow.ts#L162-L193)
- LLM extracts selection data but NEVER passes it to `cart_manager` executor. The `_selection_data` output is never used. Items are never actually added to the cart. Then `confirm_addition` LLM says "Items added to cart" based on `cart_items.length` which is always 0/unchanged.
- **Impact:** E-commerce cart is completely non-functional.

#### BUG-16: No payment method collection (HIGH)
- **File:** [ecommerce-order.flow.ts](backend/src/flow-engine/flows/ecommerce-order.flow.ts)
- Flow goes: `calculate_pricing` → `show_order_summary` → `check_final_confirmation` → `place_order`. There's NO payment method selection. The `order` executor is called without `paymentMethod` config, defaulting to undefined.

#### BUG-17: No authentication check (MEDIUM)
- **File:** [ecommerce-order.flow.ts](backend/src/flow-engine/flows/ecommerce-order.flow.ts)
- Unlike food and parcel flows, ecommerce has NO auth check before checkout. Orders may be placed without authentication, causing the order executor to fail (requires `auth_token` or `user_id`).

#### BUG-18: `_last_user_message` reference doesn't exist (MEDIUM)
- **File:** [ecommerce-order.flow.ts](backend/src/flow-engine/flows/ecommerce-order.flow.ts#L130-L145)
- Multiple states reference `context._last_user_message` (e.g., `process_user_action`, `check_final_confirmation`). The engine sets `_user_message`, not `_last_user_message`. These conditions will never match.
- **Fix:** Replace all `_last_user_message` with `_user_message`.

### auth.flow.ts (346 lines)

#### ISSUE-11: `check_auth_status` uses `context.user_id` as truthiness check (LOW)
- **File:** [auth.flow.ts](backend/src/flow-engine/flows/auth.flow.ts#L41)
- `expression: 'context.authenticated === true || context.user_id'` — `user_id` of `0` would be falsy, potentially requiring re-auth for edge-case users.

### address-management.flow.ts (520 lines)

#### BUG-19: `wait_for_post_view` uses `user_input` event instead of `user_message` (MEDIUM)
- **File:** [address-management.flow.ts](backend/src/flow-engine/flows/address-management.flow.ts#L261-L268)
- Multiple wait states use `user_input` transition event. The state machine generates `user_message` events when receiving user input, NOT `user_input`. These transitions will never fire — the flow gets stuck.
- **Affected states:** `wait_for_post_view`, `wait_for_choice`, `wait_for_location`, `wait_for_type`, `wait_for_retry`
- **Fix:** Replace all `user_input` with `user_message`.

### order-tracking.flow.ts (679 lines)

#### BUG-20: Button config uses `title`/`payload` instead of `label`/`value` (MEDIUM)
- **File:** [order-tracking.flow.ts](backend/src/flow-engine/flows/order-tracking.flow.ts)
- All buttons use `{ title: '...', payload: '...' }` schema, while the response executor and frontend expect `{ label: '...', value: '...' }`. Buttons may not render correctly.
- **Affected:** All `show_options`, `display_running_orders`, `no_running_orders`, `show_tracking_details`, `confirm_cancel`, `cancel_success`, etc.

#### BUG-21: `trigger_reorder` doesn't actually pre-fill cart items (MEDIUM)
- **File:** [order-tracking.flow.ts](backend/src/flow-engine/flows/order-tracking.flow.ts#L592-L610)
- Says "I've added your previous order items" but only sends a response message. No executor fetches the previous order's items or adds them to the cart. The reorder is never executed.

#### ISSUE-12: Auth token reference inconsistency
- **File:** [order-tracking.flow.ts](backend/src/flow-engine/flows/order-tracking.flow.ts)
- Some states use `{{session.auth_token}}` (e.g., `fetch_running_orders`) while others use `{{auth_token}}` (e.g., `fetch_order_history`). Depending on context structure, one may work while the other doesn't.

### support.flow.ts (682 lines)

#### BUG-22: `create_ticket` doesn't actually create a ticket (HIGH)
- **File:** [support.flow.ts](backend/src/flow-engine/flows/support.flow.ts#L383-L405)
- Two response executor actions with empty messages and outputs `ticket_id` / `ticket_log`. No PHP API call or database write. The ticket ID displayed to users (`{{ticket_id}}`) will be an empty response object, not an actual ticket number.
- **Impact:** Users think they have a ticket for support follow-up but no ticket exists.

#### BUG-23: `collect_issue_details` stores empty response as issue description (MEDIUM)
- **File:** [support.flow.ts](backend/src/flow-engine/flows/support.flow.ts#L368-L382)
- Uses `response` executor with empty `message: ''` and `output: 'issue_description'`. The actual user message (`_user_message`) is not saved — the stored `issue_description` is the response object, not the user's issue text.

### first-time-onboarding.flow.ts (540 lines)

#### ISSUE-13: `onboarding_complete_full` never marks `onboarding_completed` in session (MEDIUM)
- **File:** [first-time-onboarding.flow.ts](backend/src/flow-engine/flows/first-time-onboarding.flow.ts#L403-L440)
- The short flow (WhatsApp) calls `session.save` with `onboarding_completed: true`, but the full flow (Web) does NOT save this flag. Full-flow users may be prompted for onboarding repeatedly.

### game-intro.flow.ts (221 lines)

#### ISSUE-14: Leaderboard is placeholder
- **File:** [game-intro.flow.ts](backend/src/flow-engine/flows/game-intro.flow.ts#L189)
- `// 6. Leaderboard (Placeholder)`

### General Flow Issues

#### ISSUE-15: Multiple flows have `transitions: {}` on `end` states (LOW)
- Every `end` state defines empty `transitions: {}`, which is redundant but harmless.

#### ISSUE-16: Inconsistent `enabled` flag usage
- Some flows define `enabled: true` (food-order, parcel-delivery, auth, address-management) while others omit it entirely (ecommerce, order-tracking, support). The engine may need to handle missing `enabled` as truthy default.

---

## 4. Executors

### php-api.executor.ts (493 lines)

#### BUG-24: `reverse_geocode` and `geocode` return mock data (HIGH)
- **File:** [php-api.executor.ts](backend/src/flow-engine/executors/php-api.executor.ts#L347)
- Both actions return hardcoded mock data:
  - `reverse_geocode`: Returns `{address: 'Nashik, Maharashtra', lat: 0, lng: 0}`
  - `geocode`: Returns `{lat: 0, lng: 0, address: 'Resolved address', formatted_address: '...'}`
- **Impact:** Any flow using geocoding gets coordinates `0,0` (Gulf of Guinea), causing incorrect distance calculations, zone validation failures, and wrong delivery routing.

#### ISSUE-17: TODO — Soft delete not implemented
- **File:** [flow-builder.controller.ts](backend/src/flow-engine/controllers/flow-builder.controller.ts#L255)
- `// TODO: Implement soft delete in FlowEngineService`

#### ISSUE-18: TODO — Flow statistics endpoint
- **File:** [flow-builder.controller.ts](backend/src/flow-engine/controllers/flow-builder.controller.ts#L361)
- `// TODO: Implement in FlowEngineService`

#### ISSUE-19: TODO — Executor metadata
- **File:** [flow-builder.controller.ts](backend/src/flow-engine/controllers/flow-builder.controller.ts#L575)
- `// TODO: Add executor metadata (description, config schema, etc.)`

### order.executor.ts (576 lines)

#### BUG-25: Razorpay amount doesn't include delivery fees or taxes (HIGH)
- **File:** [order.executor.ts](backend/src/flow-engine/executors/order.executor.ts#L382)
- In `createFoodOrder`, `totalAmount` for Razorpay order creation is calculated from item prices only. It does NOT include delivery fee, GST, or other charges. The Razorpay payment amount will be LESS than the actual order total.
- **Impact:** Users are charged less than the order value; business loses revenue on every digital payment.

### pricing.executor.ts (~200 lines)

#### BUG-26: Local pricing diverges from PHP backend pricing (HIGH)
- **File:** [pricing.executor.ts](backend/src/flow-engine/executors/pricing.executor.ts)
- All pricing is calculated locally using env vars (`FOOD_GST_RATE=0.05`, `PARCEL_GST_RATE=0.18`). The PHP backend calculates its own pricing independently. These can diverge if:
  - PHP backend has different rates/logic
  - Discounts/coupons are applied in PHP but not locally
  - Merchant-specific pricing rules exist
- **Impact:** User sees price X in chat but is charged price Y at order creation.

#### ISSUE-20: No discount/coupon support
- **File:** [pricing.executor.ts](backend/src/flow-engine/executors/pricing.executor.ts)
- No coupon validation, discount codes, or promotional pricing. All orders are full price.

#### ISSUE-21: Ecommerce shipping fee and GST are hardcoded
- **File:** [pricing.executor.ts](backend/src/flow-engine/executors/pricing.executor.ts)
- Free shipping over ₹500, else ₹40. GST 18% hardcoded. Not configurable via env vars (unlike food/parcel).

### distance.executor.ts (~200 lines)

#### BUG-27: Default 5km on ANY failure (MEDIUM)
- **File:** [distance.executor.ts](backend/src/flow-engine/executors/distance.executor.ts)
- Returns hardcoded `5.0` km when coordinates are missing, API errors occur, or any fallback is hit. This means:
  - Missing store coordinates → 5km distance → incorrect pricing
  - OSRM service down → 5km → incorrect pricing
  - No warning in flow that this is a fallback value
- **Impact:** Orders may be underpriced or overpriced by significant margins.

### cart-manager.executor.ts (516 lines)

#### BUG-28: `removeFromCart` returns success with modified items but doesn't persist to context (MEDIUM)
- **File:** [cart-manager.executor.ts](backend/src/flow-engine/executors/cart-manager.executor.ts#L234-L285)
- `removeFromCart` returns `cart_items: updatedCart` in the output but does NOT directly modify `context.data.cart_items`. The flow state must explicitly save the output to `cart_items` via `saveToContext` or the removal is lost.
- This is by design (executors shouldn't mutate context directly) BUT the `clearCart` method at [line 400](backend/src/flow-engine/executors/cart-manager.executor.ts#L400-L410) DOES directly modify `context.data.cart_items = []` — inconsistent behavior.

### auth.executor.ts (1092 lines)

#### ISSUE-22: `isCancelCommand` includes "no" as cancel (LOW)
- **File:** [auth.executor.ts](backend/src/flow-engine/executors/auth.executor.ts#L696)
- `const cancelCommands = ['cancel', 'stop', 'quit', 'exit', 'no', 'nevermind']`
- "no" is too broad — user answering "no" to a yes/no question about their name would cancel the auth flow.

#### ISSUE-23: `linkGoogleOAuth` silently succeeds on failure (LOW)
- **File:** [auth.executor.ts](backend/src/flow-engine/executors/auth.executor.ts#L980-L1080)
- Both the fallback path and the catch block return `event: 'account_linked'` with `success: true` even when linking actually failed (`php_linked: false`). The flow treats this as success and proceeds, potentially leading to order creation failures later.

### search.executor.ts (1169 lines)

#### BUG-29: `getImageUrl` helper duplicated 4 times (LOW)
- **File:** [search.executor.ts](backend/src/flow-engine/executors/search.executor.ts)
- The identical `getImageUrl` closure is defined inside `execute()`, `formatHybridSearchResults()`, `formatSearchResults()`, and `formatSmartSearchResults()`. Same logic copy-pasted 4 times.
- **Impact:** Bug fixes or image URL changes must be applied in 4 places.

#### ISSUE-24: `detectLanguage` helper duplicated in auth.executor.ts AND search.executor.ts
- **File:** [search.executor.ts](backend/src/flow-engine/executors/search.executor.ts) and [auth.executor.ts](backend/src/flow-engine/executors/auth.executor.ts)
- Identical `detectLanguage()` method exists in both files.

### session.executor.ts (399 lines)

#### ISSUE-25: `handleSave` merges data directly into `context.data` via `Object.assign`
- **File:** [session.executor.ts](backend/src/flow-engine/executors/session.executor.ts#L111)
- `Object.assign(context.data, dataToSave)` — This can overwrite any context key. If session save data has a key like `_user_message` or `_system`, it would corrupt the flow context.

### nlu-condition.executor.ts (~200 lines)

#### ISSUE-26: NLU failure returns `event: 'error'` which flows don't handle
- **File:** [nlu-condition.executor.ts](backend/src/flow-engine/executors/nlu-condition.executor.ts)
- On NLU service failure, returns `{success: false, event: 'error'}`. Most flows have NO `error` transition on NLU condition states — the default transition fires instead, which may be the wrong path.

### response.executor.ts (295 lines)

- No significant bugs. Well-structured with channel-awareness and dynamic buttons/cards support.

### Disabled executor

#### ISSUE-27: reward-points.executor.ts.disabled has TODO
- **File:** [reward-points.executor.ts.disabled](backend/src/flow-engine/executors/reward-points.executor.ts.disabled#L134)
- `// TODO: Implement in PhpLoyaltyService`
- This executor is disabled. Reward/loyalty features are not functional.

---

## 5. Context Service

**File:** `flow-context.service.ts` (366 lines)

### BUGS

#### BUG-30: `new Function()` used for expression evaluation — code injection risk (HIGH)
- **File:** [flow-context.service.ts](backend/src/flow-engine/flow-context.service.ts#L268)
- Decision conditions use `new Function()` to evaluate arbitrary JavaScript expressions from flow definitions. Although flow definitions are currently code files (not user input), this is:
  - A security risk if YAML flow definitions are loaded from DB (which `yaml-flow-loader.service.ts` enables)
  - Flagged by security scanners
  - Could execute arbitrary JS code if flow definitions are tampered with

#### BUG-31: `noEscape: true` in Handlebars — XSS risk (MEDIUM)
- **File:** [flow-context.service.ts](backend/src/flow-engine/flow-context.service.ts#L135)
- Handlebars is configured with `noEscape: true`, meaning user input interpolated into templates is NOT escaped. If `_user_message` is injected into a template that renders on the web frontend, XSS attacks are possible.

### ISSUES

#### ISSUE-28: `resolveSimpleReference` silently returns undefined for missing paths
- **File:** [flow-context.service.ts](backend/src/flow-engine/flow-context.service.ts#L152)
- Missing paths resolve to `undefined`, which Handlebars renders as empty string. Template interpolation may produce messages with blank holes (e.g., "Your delivery to will arrive" instead of "Your delivery to 123 Main St will arrive").

#### ISSUE-29: Progress capped at 95% until final state (LOW)
- **File:** [flow-context.service.ts](backend/src/flow-engine/flow-context.service.ts#L360)
- Progress bar never shows 100% until flow ends. Users see 95% during the last state.

---

## 6. Session Handling

### Session Executor (session.executor.ts, 399 lines)

#### BUG-32: `handleRefreshAuth` truncated — possible incomplete implementation
- **File:** [session.executor.ts](backend/src/flow-engine/executors/session.executor.ts#L300-L320)
- The method's last block saves Google OAuth data to session but the logic flow suggests it was added as a patch. There's potential for race conditions between:
  1. ChatGateway syncing auth data to session
  2. Flow engine reading session data
  3. `invalidateCache()` timing
- The explicit `invalidateCache(sessionId)` call before each read is a workaround for stale Redis cache.

#### ISSUE-30: Multiple auth data sources create confusion
- **File:** [session.executor.ts](backend/src/flow-engine/executors/session.executor.ts#L237-L280)
- `handleRefreshAuth` checks FOUR sources for authentication:
  1. `sessionData.authenticated`
  2. `sessionData.auth_token`
  3. `sessionData.user_id > 0`
  4. `sessionData.email && sessionData.user_name` (Google OAuth)
  5. `context.data.authenticated`
  6. `context.data.user_authenticated`
  7. `context.data.auth_token`
  8. `context.data.user_id > 0`
- This fragmented auth checking leads to edge cases where users appear authenticated from one source but not another.

#### ISSUE-31: Session data merged into `context.data` AND `context.data._session`
- **File:** [session.executor.ts](backend/src/flow-engine/executors/session.executor.ts#L105-L112)
- `handleSave` writes to both `context.data._session` AND directly into `context.data` via `Object.assign`. This dual-write creates ambiguity about which is the source of truth and pollutes the flow context namespace.

#### ISSUE-32: `handleDelete` reads full session then modifies in-memory — race condition
- **File:** [session.executor.ts](backend/src/flow-engine/executors/session.executor.ts#L164-L185)
- Reads session, deletes keys in memory, then `saveSession()` writes back. If another request modifies the session between read and write, data is lost.

### Session in Flow Engine Service

#### ISSUE-33: Extensive session→context merging on every `processMessage()`
- **File:** [flow-engine.service.ts](backend/src/flow-engine/flow-engine.service.ts#L300-L350)
- Every user message triggers a session read and merge into context. This includes auth data, location, platform, conversation history. Adds latency to every message and risks overwriting flow-set values with stale session data.

#### ISSUE-34: `clearFlowFromSession` preserves conversation history but not auth
- **File:** [flow-engine.service.ts](backend/src/flow-engine/flow-engine.service.ts#L1132)
- When clearing a flow, conversation history is preserved at session level, but auth context from the flow is not synced back. If auth was refreshed during the flow, it may be lost on flow end.

---

## 7. Summary & Priority Matrix

### Critical (Breaks core functionality)
| # | Issue | File | Category |
|---|-------|------|----------|
| BUG-1 | `_last_response` never cleared — stale messages | flow-engine.service.ts | Core |
| BUG-8 | Mock upsell — item not added to cart | food-order.flow.ts | Flow |
| BUG-15 | E-commerce add_to_cart completely non-functional | ecommerce-order.flow.ts | Flow |
| BUG-22 | Support tickets never actually created | support.flow.ts | Flow |
| BUG-24 | Geocoding returns mock coordinates (0,0) | php-api.executor.ts | Executor |
| BUG-25 | Razorpay amount missing delivery + tax | order.executor.ts | Executor |
| BUG-26 | Local pricing diverges from PHP backend | pricing.executor.ts | Executor |

### High (Significant user impact)
| # | Issue | File | Category |
|---|-------|------|----------|
| BUG-2 | Context restored via unsafe `as any` cast | flow-engine.service.ts | Core |
| BUG-4 | Cancel state ternary precedence bug | state-machine.engine.ts | State Machine |
| BUG-13 | Payment retry decision never acted on | parcel-delivery.flow.ts | Flow |
| BUG-16 | E-commerce no payment method collection | ecommerce-order.flow.ts | Flow |
| BUG-30 | `new Function()` code injection risk | flow-context.service.ts | Context |

### Medium (Correctness/stability issues)
| # | Issue | File | Category |
|---|-------|------|----------|
| BUG-3 | Hardcoded keyword lists for intent routing | flow-engine.service.ts | Core |
| BUG-5 | `'input'` state type unhandled | state-machine.engine.ts | State Machine |
| BUG-6 | `'parallel'` state type unimplemented | state-machine.engine.ts | State Machine |
| BUG-9 | `otp_error` wrong state type | food-order.flow.ts | Flow |
| BUG-12 | Placeholder end states in parcel flow | parcel-delivery.flow.ts | Flow |
| BUG-14 | `completed` state is action, not end | parcel-delivery.flow.ts | Flow |
| BUG-17 | E-commerce no auth check | ecommerce-order.flow.ts | Flow |
| BUG-18 | `_last_user_message` doesn't exist | ecommerce-order.flow.ts | Flow |
| BUG-19 | `user_input` event doesn't exist | address-management.flow.ts | Flow |
| BUG-20 | Wrong button schema | order-tracking.flow.ts | Flow |
| BUG-21 | Reorder never pre-fills cart | order-tracking.flow.ts | Flow |
| BUG-23 | Issue description not saved | support.flow.ts | Flow |
| BUG-27 | Default 5km fallback distance | distance.executor.ts | Executor |
| BUG-28 | Inconsistent context mutation | cart-manager.executor.ts | Executor |
| BUG-31 | Handlebars XSS risk | flow-context.service.ts | Context |
| ISSUE-2 | 20-iteration auto-execute limit | flow-engine.service.ts | Core |
| ISSUE-4 | Stuck state with no warning | state-machine.engine.ts | State Machine |
| ISSUE-8 | Cart clear bypasses cart_manager | food-order.flow.ts | Flow |
| ISSUE-9 | Inconsistent pricing field names | parcel vs food flows | Flow |
| ISSUE-13 | Full onboarding missing completion flag | first-time-onboarding.flow.ts | Flow |
| ISSUE-25 | Object.assign can corrupt context | session.executor.ts | Session |

### Low (Minor issues / tech debt)
| # | Issue | File | Category |
|---|-------|------|----------|
| BUG-7 | `'final'` not distinguished from `'end'` | flow.types.ts | State Machine |
| BUG-10 | Missing output on timeout response | food-order.flow.ts | Flow |
| BUG-11 | Unreachable `confirm_selection` state | food-order.flow.ts | Flow |
| BUG-29 | `getImageUrl` duplicated 4x | search.executor.ts | Executor |
| BUG-32 | Possible race in auth refresh | session.executor.ts | Session |
| ISSUE-1 | No per-flow cache invalidation | flow-engine.service.ts | Core |
| ISSUE-3 | Raw error text exposed to users | flow-engine.service.ts | Core |
| ISSUE-5 | Action timeout not enforced | state-machine.engine.ts | State Machine |
| ISSUE-11 | user_id=0 falsy edge case | auth.flow.ts | Flow |
| ISSUE-12 | Auth token reference inconsistency | order-tracking.flow.ts | Flow |
| ISSUE-14 | Placeholder leaderboard | game-intro.flow.ts | Flow |
| ISSUE-15 | Empty transitions on end states | All flows | Flow |
| ISSUE-16 | Inconsistent `enabled` flag | Multiple flows | Flow |
| ISSUE-17-19 | Controller TODOs | flow-builder.controller.ts | Executor |
| ISSUE-20-21 | Missing coupon support, hardcoded fees | pricing.executor.ts | Executor |
| ISSUE-22 | "no" triggers cancel | auth.executor.ts | Executor |
| ISSUE-23 | linkGoogleOAuth silently succeeds | auth.executor.ts | Executor |
| ISSUE-24 | Duplicated detectLanguage | auth+search executors | Executor |
| ISSUE-26 | NLU error event unhandled | nlu-condition.executor.ts | Executor |
| ISSUE-27 | Disabled reward points | reward-points.executor.ts | Executor |
| ISSUE-28-29 | Context interpolation gaps | flow-context.service.ts | Context |
| ISSUE-30-34 | Session fragmentation & races | session/flow-engine | Session |

### Total Counts
- **Bugs:** 32
- **Issues:** 34
- **TODOs/Placeholders:** 6
- **Critical:** 7
- **High:** 5
- **Medium:** 21
- **Low:** 33
