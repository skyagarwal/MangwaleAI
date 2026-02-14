# MangwaleAI — Deep System Audit & Architecture Review
### February 10, 2026

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Map](#2-architecture-map)
3. [Flow Engine & All Flows](#3-flow-engine--all-flows)
4. [CRITICAL BUGS](#4-critical-bugs)
5. [Hardcoded Values Audit](#5-hardcoded-values-audit)
6. [Mid-Flow Interruption Handling](#6-mid-flow-interruption-handling)
7. [NLU Pipeline & Robustness](#7-nlu-pipeline--robustness)
8. [LLM / Responding Model](#8-llm--responding-model)
9. [Payment Flow Comparison](#9-payment-flow-comparison)
10. [Order Tracking & Post-Payment](#10-order-tracking--post-payment)
11. [Admin Analytics Capabilities](#11-admin-analytics-capabilities)
12. [Marketing & Customer Engagement](#12-marketing--customer-engagement)
13. [Skills Architecture Proposal](#13-skills-architecture-proposal)
14. [Prioritized Fix List](#14-prioritized-fix-list)
15. [Open Questions & Decisions](#15-open-questions--decisions)

---

## 1. System Overview

MangwaleAI is a multi-channel conversational commerce platform serving Nashik, Pune, and Mumbai. It enables food ordering, parcel delivery, and e-commerce shopping via WhatsApp, Web Chat, Telegram, and Instagram.

### Tech Stack

| Layer | Technology | Location |
|-------|-----------|----------|
| **NestJS Backend** | Node.js + TypeScript + Prisma | PM2 `mangwale-backend` port 3200 |
| **Frontend** | Next.js 16.0.0 (Turbopack) | Docker `mangwale-dashboard` port 3005 |
| **PHP Backend** | Laravel (API + Admin) | Remote server 103.160.107.208 |
| **NLU** | IndicBERT v3 (custom) | 192.168.0.151:7012 |
| **NER** | Custom entity extractor | 192.168.0.151:7011 |
| **Search** | Custom search service | localhost:3100 |
| **LLM** | Qwen 2.5 7B AWQ via vLLM | localhost:8002 |
| **Database** | PostgreSQL (state) + MySQL (PHP) | Docker 5432 / Remote 3306 |
| **Cache** | Redis | Port 6381, DB 1 |
| **Payment** | Razorpay (Live) | `rzp_live_RimBDPhloJvdS0` |
| **Tracking** | track.mangwale.in | `TRACKING_BASE_URL` env |
| **CDN** | storage.mangwale.ai | Product images |

### Channels

| Channel | Status | Integration |
|---------|--------|-------------|
| WhatsApp | ✅ Active | WhatsApp Business API |
| Web Chat | ✅ Active | WebSocket at chat.mangwale.ai |
| Telegram | ✅ Active | Bot API |
| Instagram | 🔶 Partial | Module exists |

---

## 2. Architecture Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CHANNELS                                       │
│  WhatsApp ──┐    Web Chat ──┐    Telegram ──┐    Instagram ──┐       │
└─────────────┼───────────────┼──────────────┼───────────────┼─────────┘
              ▼               ▼              ▼               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     NestJS Backend (Port 3200)                       │
│                                                                      │
│  ┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐   │
│  │ Context Router  │──▶│  NLU Pipeline     │──▶│  Flow Engine     │   │
│  │ (message entry) │   │  IndicBERT→LLM→  │   │  (state machine) │   │
│  │                 │   │  Heuristic        │   │  15 flows        │   │
│  └────────────────┘   └──────────────────┘   └───────┬──────────┘   │
│                                                       │              │
│                                              ┌───────┼──────────┐   │
│                                              ▼       ▼          ▼   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ ┌────────┐      │
│  │ 34 Executors  │  │ 7 Agents     │  │ LLM      │ │ PHP    │      │
│  │ (LLM/NLU/    │  │ (legacy      │  │ Service  │ │ API    │      │
│  │  Search/Cart/ │  │  fallback)   │  │ (vLLM)   │ │ Bridge │      │
│  │  Order/etc)   │  │              │  │          │ │        │      │
│  └──────────────┘  └──────────────┘  └──────────┘ └───┬────┘      │
│                                                        │            │
└────────────────────────────────────────────────────────┼────────────┘
                                                         │
                                                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│              PHP Laravel Backend (103.160.107.208)                    │
│  Orders • Products • Stores • Payments • Zones • Config • Auth       │
└──────────────────────────────────────────────────────────────────────┘
```

### Message Processing Pipeline

```
1. User message arrives (WhatsApp/Web/Telegram)
                ▼
2. Context Router (context-router.service.ts)
   ├── Active flow EXISTS? → Is state BROWSABLE or CRITICAL?
   │   ├── BROWSABLE + greeting → Clear flow, respond fresh
   │   ├── CRITICAL → Continue flow (ignore greeting)
   │   └── Other → Route to flow engine
   ├── Active flow NOT exist → NLU classification
   │   ├── IndicBERT confidence ≥ 0.70 → Accept intent
   │   ├── < 0.70 → LLM fallback (Groq/OpenRouter)
   │   │   ├── ≥ 0.50 → Accept
   │   │   └── < 0.50 → Heuristic regex
   │   └── Intent → Flow lookup → Start flow
   └── No flow match → Agent fallback → LLM freeform
```

---

## 3. Flow Engine & All Flows

### 15 Active Flows

| # | Flow ID | Lines | Module | Purpose |
|---|---------|-------|--------|---------|
| 1 | `greeting_v1` | ~200 | general | Weather/festival-aware welcome |
| 2 | `auth_v1` | ~300 | general | Phone → OTP → name → email registration |
| 3 | `first_time_onboarding_v1` | ~250 | personalization | Post-auth profile building (diet, cuisines, budget) |
| 4 | `help_v1` | ~150 | general | Service overview |
| 5 | `game_intro_v1` | ~200 | gamification | 4 games + leaderboard intro |
| 6 | `farewell_v1` | ~100 | general | Goodbye with return encouragement |
| 7 | `chitchat_v1` | ~100 | general | Casual LLM conversation |
| 8 | `feedback_v1` | ~200 | general | Star rating + comments |
| 9 | `food_order_v1` | **4,043** | food | Full ordering: search → select → address → payment |
| 10 | `parcel_delivery_v1` | **2,166** | parcel | 5-question parcel booking with payment |
| 11 | `ecommerce_order_v1` | ~1,500 | ecommerce | Product search → cart → checkout |
| 12 | `order_tracking_v1` | ~800 | general | Track/cancel/history/reorder (22 states) |
| 13 | `support_v1` | ~600 | general | FAQ, tickets, human escalation |
| 14 | `profile_completion_v1` | ~200 | personalization | Dietary preferences, allergies |
| 15 | `address-management` | ~400 | general | CRUD addresses |

### 8 YAML v2 Flows (Secondary)

`customer-order-status`, `delivery-auth`, `delivery-orders`, `location-collection`, `payment-completion`, `user-type-detection`, `vendor-auth`, `vendor-orders`

### 34 Executor Types

| Category | Executors |
|----------|-----------|
| **AI/NLU** | `llm`, `nlu`, `ner`, `pure-ner`, `agent` |
| **Commerce** | `order`, `parcel`, `cart-manager`, `pricing`, `inventory` |
| **Location** | `address`, `zone`, `distance` |
| **Integration** | `php-api`, `search`, `auth` |
| **Session** | `session`, `selection`, `preference`, `profile` |
| **Output** | `response`, `media` |
| **Special** | `game`, `flow-control`, `conditional`, `debug` |

---

## 4. CRITICAL BUGS

### BUG #1: 🔴 Food Orders Skip Payment Gateway Entirely

**Severity**: CRITICAL — Revenue loss
**File**: `food-order.flow.ts`

**The Problem**: When a user selects "digital payment" for a food order, the flow goes:
```
select_payment_method → set_payment_digital → show_order_summary → confirm → place_order → completed
```

There is no `show_payment_gateway`, `wait_payment_result`, or `check_payment_result` state. The Razorpay order IS created server-side (`order.executor.ts` L383-415) but the link is **never shown to the user**.

**Impact**: Every food order with digital payment sits in "pending payment" in PHP while the chatbot says "Order placed!" — customer never pays, order never fulfills.

**Compare parcel flow** (correct):
```
select_payment_method → place_order_digital → show_payment_gateway → wait_payment_result → check_payment_result
                                                                                            ├── success → completed
                                                                                            ├── failed  → payment_failed (retry/COD/cancel) 
                                                                                            └── timeout → payment_timeout
```

**Fix Required**: Add 5 states to food-order.flow.ts: `show_payment_gateway`, `wait_payment_result`, `check_payment_result`, `payment_failed`, `payment_timeout` — mirroring the parcel flow pattern.

---

### BUG #2: 🔴 `verify_payment` Is a Hardcoded Mock

**Severity**: HIGH
**File**: `php-api.executor.ts` L367-374

```typescript
case 'verify_payment':
    return {
      success: true,
      verified: true,      // ALWAYS TRUE — NEVER VERIFIES
      orderId: config.orderId,
      paymentId: config.paymentId,
    };
```

**Impact**: If any flow ever calls `verify_payment`, it will always succeed regardless of actual payment status. Currently parcel flow relies on `__payment_success__` frontend callback instead, but this mock is dangerous.

---

### BUG #3: 🟡 `show_categories` in BOTH State Lists

**File**: `context-router.service.ts`

`show_categories` appears in **both** `BROWSABLE_STATES` and `CRITICAL_WAIT_STATES`. Parcel's `show_categories` (vehicle type selection) should be critical, but food's `show_categories` (food categories) should be browsable. Current flat list can't distinguish by flow.

---

### BUG #4: 🟡 `receiverPhone` Undefined in Tracking URL

**File**: `order-tracking.flow.ts`

Tracking URL is built as `${trackingBaseUrl}/track/${orderId}/${phone}` but `phone` might be undefined if the receiver phone isn't in the order details, producing broken URLs like `https://track.mangwale.in/track/123/undefined`.

---

## 5. Hardcoded Values Audit

### 🔴 HIGH Priority — Must Fix

| What | Where | Value | Risk |
|------|-------|-------|------|
| **Storage CDN** | `search.executor.ts` (×4), `search.service.ts` (×1) | `https://storage.mangwale.ai/mangwale/product` | CDN change = 5 edits across 2 files |
| **Platform Fee** | `parcel.service.ts` L183, `conversation.service.ts` L2719 | `₹5` hardcoded + inline `+ 5` | Fee changes require code deploy, values can diverge |
| **GST Rates** | `pricing.executor.ts` L55, L83 | `5%` (food), `18%` (parcel) | Tax rate changes require code deploy |
| **Zone-City Mapping** | `zone.executor.ts` L61-79 | Nashik=4, Pune=5, Mumbai=6 + lat/lng bounds | New cities require code changes |
| **Fallback Phone** | `php-order.service.ts` L57 | `'9999999999'` as sender | Creates real orders with fake phone |

### 🟡 MEDIUM Priority — Should Fix

| What | Where | Value | Risk |
|------|-------|-------|------|
| **Internal IPs** | 8 files across NLU services | `192.168.0.151` (×8) | ML server move breaks everything |
| **Module IDs** | 6+ files | `module_id: 4` (food), `3` (parcel) | Should use module-id-mapping.ts |
| **Default Zone** | `php-order.service.ts` L45, `parcel.service.ts` L195 | `zone_id: 4` fallback | Defaults to Nashik always |
| **Delivery Rates** | `parcel.service.ts`, `pricing.executor.ts`, `order-orchestrator.service.ts` | Min ₹44, ₹11.11/km, base ₹30, ₹10/km | Multiple conflicting rate defaults |
| **CORS Origins** | `main.ts`, `chat.gateway.ts` | Hardcoded domain list | Should come from env |
| **API URLs** | `channel-config.controller.ts` (×7) | `https://api.mangwale.com` | Should be env-driven |
| **Support Phone** | `command-handler.service.ts` (×3) | `'8888888888'` | Likely placeholder |
| **Toll-free** | `function-executor.service.ts` (×2) | `'1800-123-4567'` | Likely placeholder |

### ✅ Clean — No Issues

| What | Status |
|------|--------|
| **API Keys / Secrets** | All via `configService.get()` or env vars — no keys in source |
| **Tracking URL** | Uses `TRACKING_BASE_URL` env with sensible fallback |
| **Payment Keys** | Via env vars (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) |

---

## 6. Mid-Flow Interruption Handling

### How Interruptions Work Today

| Scenario | Behavior | Quality |
|----------|----------|---------|
| User says "hi" in browsable state (recommendations, search) | Clears flow, shows fresh greeting + menu | ✅ Good |
| User says "hi" in critical state (payment, checkout) | Ignores greeting, continues flow | ✅ Good |
| User says random text in food flow | Treated as food search query → 0 results → recommendations | ❌ Bad |
| User says random text in parcel address collection | LLM tries to extract address from gibberish | ❌ Bad |
| User wants to switch flow mid-conversation | Needs ≥0.70 confidence intent for transactional switch | ⚠️ OK |
| User input matches no flow transition | Falls to agent executor → LLM freeform (loses flow context) | ❌ Bad |

### Gaps

1. **No "I don't understand" re-prompt**: When a flow can't match user input, it silently falls to LLM freeform instead of saying "I didn't understand, did you mean X?" and keeping the user in-flow.

2. **`understand_request` swallows everything**: Food order's `understand_request` state routes ALL inputs (including gibberish) to food search. There's no threshold or validation.

3. **No flow-specific state differentiation**: `BROWSABLE_STATES` and `CRITICAL_WAIT_STATES` are flat lists. `show_categories` means different things in different flows (vehicle type vs food category).

4. **No "leave flow" confirmation**: When a user's intent switches to a different flow, there's no "Are you sure you want to leave your current order?" prompt.

### Recommended Fixes

1. Add a `default_fallback` transition in flows that re-prompts: "Mujhe samajh nahi aaya. Kya aap [expected input] bata sakte hain?"
2. Make state lists flow-prefixed: `food_order:show_categories` vs `parcel:show_categories`
3. Add confidence threshold in `understand_request` — if NLU entity confidence < 0.4, re-prompt instead of searching
4. Add flow-exit confirmation for transactional flows with items in cart

---

## 7. NLU Pipeline & Robustness

### 3-Tier Classification

```
Layer 1: IndicBERT v3 (python, 192.168.0.151:7012)
  └─ confidence ≥ 0.70 → ACCEPT
  
Layer 2: LLM Fallback (Groq/OpenRouter cloud)
  └─ confidence ≥ 0.50 → ACCEPT

Layer 3: Heuristic Regex (local patterns)
  └─ Always returns something (never says "I don't know")
```

### Confidence Thresholds

| Threshold | Context | Action |
|-----------|---------|--------|
| ≥ 0.70 | IndicBERT classification | Accept as final intent |
| < 0.70 | IndicBERT classification | Escalate to LLM |
| ≥ 0.50 | LLM fallback | Accept as final intent |
| < 0.50 | LLM fallback | Fall to heuristics |
| ≥ 0.70 | Context-router flow switching | Minimum for transactional flow switch |
| ≥ 0.80 | Flow restart (parcel/food) | Required to restart a flow |
| ≥ 0.85 | Flow-engine interrupting intent | Required for context-switch |

### Robustness Gaps

1. **LLM fallback threshold too low**: 50% confidence LLM classification can drive order flows
2. **Heuristic never returns "unknown"**: Even gibberish gets a best-guess intent → can trigger wrong flow
3. **No circuit breaker**: When IndicBERT is down, degrades silently — no user notification
4. **AgenticNLU returns `confidence: 0.1, intent: 'unknown'`** but this still gets processed rather than triggering a clarification prompt

---

## 8. LLM / Responding Model

### Model Stack

| Priority | Provider | Model | Use Case |
|----------|----------|-------|----------|
| 1 (Primary) | **vLLM** (local GPU) | Qwen 2.5 7B AWQ | All LLM tasks |
| 2 (Fallback) | **OpenRouter** (cloud) | Qwen 2.5 7B / Llama 3.1 | When vLLM is down |
| 3 (Fallback) | **Groq** (cloud) | Llama 3.1 8B | Fast fallback |
| 4 (Fallback) | **OpenAI** (cloud) | GPT-3.5 | Last resort |

### Smart Model Router (3 Tiers)

| Tier | Model Size | Tasks |
|------|-----------|-------|
| Tier 1 (Fast) | 7B | Greetings, simple Q&A, entity extraction |
| Tier 2 (Medium) | 32B | Complex reasoning, multi-turn |
| Tier 3 (Heavy) | GPT-4 / Claude | Reserved for hard problems |

### LLM Usage Points

| Usage | Service | Purpose |
|-------|---------|---------|
| Freeform conversation | `agent-orchestrator.service.ts` | When no flow matches, generates contextual response |
| Entity extraction | `llm-entity-extractor.service.ts` | Extract food items, addresses from natural language |
| Intent classification | `intent-classifier.service.ts` | Fallback when IndicBERT < 0.70 |
| In-flow responses | `llm.executor.ts` | Dynamic message generation within flows |
| Address parsing | `address.executor.ts` | Extract structured address from freeform text |
| Persona | `VoiceCharactersService` | "Chotu" chatbot personality injection |

### Configuration

| Env Variable | Default | Purpose |
|-------------|---------|---------|
| `VLLM_URL` | `http://localhost:8002` | vLLM server |
| `VLLM_MODEL` | `Qwen/Qwen2.5-7B-Instruct-AWQ` | Model name |
| `DEFAULT_LLM_PROVIDER` | `vllm` | Primary provider |
| `ENABLED_LLM_PROVIDERS` | `groq,openrouter` | Cloud fallbacks |
| `GROQ_API_KEY` | — | Groq API key |
| `OPENROUTER_API_KEY` | — | OpenRouter API key |

### LLM Improvements Needed

1. **Persona consistency**: The "Chotu" persona should be fine-tuned, not just prompt-injected
2. **Response caching**: Cache exists but hit rate unknown — should track and optimize
3. **Multilingual**: Currently switches between Hindi/English but no formal language detection → response language alignment
4. **Tool calling**: LLM has tool definitions but the function execution is brittle — errors aren't gracefully handled

---

## 9. Payment Flow Comparison

### Parcel Delivery (✅ Correct)

```
select_payment_method
  ├── COD → place_order_cod → completed
  └── Digital → place_order_digital → show_payment_gateway ──►  wait_payment_result (5min)
                                                                  ├── __payment_success__ → check_payment_result → completed
                                                                  ├── __payment_failed__  → check_payment_result → payment_failed
                                                                  │                                                 ├── retry
                                                                  │                                                 ├── switch to COD
                                                                  │                                                 └── cancel
                                                                  └── timeout → payment_timeout
```

**Channel-aware payment UI:**
- **WhatsApp**: Sends tappable payment link (`https://new.mangwale.com/payment-mobile?...`)
- **Web Chat**: Sends `paymentLink` in metadata → frontend renders "Pay Now" button → opens link in new tab

### Food Order (❌ BROKEN)

```
select_payment_method
  ├── COD → set_payment_cod → show_order_summary → confirm → place_order → completed     ← OK for COD
  └── Digital → set_payment_digital → show_order_summary → confirm → place_order → completed  ← NO GATEWAY!
```

**Server-side**: `order.executor.ts` L383-415 DOES create Razorpay order + payment link. It returns `paymentLink` and `razorpayOrderId` in `order_result`. But the flow transitions directly to `completed` — the link is never displayed.

### Fix Strategy

Add 5 states to `food-order.flow.ts` after `place_order`:

| New State | Purpose | Transitions |
|-----------|---------|-------------|
| `check_payment_type_for_order` | Decision: COD → completed, Digital → show_payment | COD/Digital |
| `show_food_payment_gateway` | Display Razorpay link (channel-aware, copy from parcel) | → wait |
| `wait_food_payment_result` | 5-minute timeout wait for payment callback | success/failed/timeout |
| `check_food_payment_result` | Decision: success → completed, failed → retry | success/failed |
| `food_payment_failed` | Offer retry/COD/cancel | retry/cod/cancel |

---

## 10. Order Tracking & Post-Payment

### Order Tracking Flow (22 states)

```
start → check_auth → check_intent
  ├── track_order → select_order → show_tracking (with tracking URL)
  ├── cancel_order → select_order → show_cancel_confirmation → cancel_api_call
  ├── order_history → show_history
  └── reorder → select_order → reorder_confirmation → start food flow
```

**Tracking URL**: `https://track.mangwale.in/track/{orderId}/{last10DigitsOfPhone}`

All API calls are real (PHP backend): `getRunningOrders()`, `getOrderDetails()`, `trackOrder()`, `cancelOrder()`. Not mocked.

### Post-Payment Orchestration

After payment succeeds, `PostPaymentOrchestrationService` handles:
1. Order status update in PHP
2. Tracking URL generation
3. Confirmation message to customer (with tracking link)
4. Store notification
5. Delivery partner assignment trigger

### Gaps

1. **Tracking URL phone undefined**: If `receiverPhone` is missing, URL breaks
2. **Reorder flow incomplete**: Selects order to reorder but doesn't pre-fill cart items — just starts a fresh food flow
3. **Auth token inconsistency**: Some flows use `{{auth_token}}`, others `{{session.auth_token}}`
4. **LLM for order ID extraction**: Uses LLM to extract order IDs from messages — regex would be more reliable

---

## 11. Admin Analytics Capabilities

### What EXISTS (Backend Endpoints)

| Endpoint Group | What It Provides |
|---------------|-----------------|
| `/analytics/overview` | Conversations today, active users, AI response time, intent accuracy |
| `/analytics/funnel` | 5-stage conversion: browse → consider → decide → checkout → purchase |
| `/analytics/intent-accuracy` | NLU accuracy metrics |
| `/analytics/response-time` | P50/P95 latency |
| `/analytics/top-intents` | Most common user intents |
| `/admin/search/analytics/dashboard` | Search queries, zero-result rate, conversion |
| `/stats/dashboard` | Agent/flow/module stats |
| **Prometheus metrics** | RED methodology, flow executions, NLU confidence, channel metrics |

### What's MISSING

| Missing Feature | Value | Effort |
|----------------|-------|--------|
| **Customer area heatmap** | See where orders come from, plan expansion | Medium — zone/address data exists |
| **Revenue dashboard** | Track GMV, take rate, average order value | Medium — order data in PHP MySQL |
| **Customer LTV** | Identify high-value customers | Medium — profile + order history data exists |
| **Real-time order monitoring** | Track live orders, delivery status | Low — PHP API calls |
| **Campaign analytics** | Measure marketing ROI | High — campaign system doesn't exist |
| **A/B test results UI** | See prompt variant performance | Low — backend tracking exists |
| **Admin frontend** | Dashboard to visualize all this data | High — no admin frontend built |
| **Flow drop-off analysis** | Where users abandon orders | Low — flow state data in Postgres |

---

## 12. Marketing & Customer Engagement

### What EXISTS

| Feature | Status | Details |
|---------|--------|---------|
| **Exotel Voice** | Active | IVR, call campaigns, scheduling, stats |
| **SMS** | Active | Outbound via notification service |
| **WhatsApp** | Active | Two-way with template messages |
| **Gamification** | Active (4 games) | IntentQuest, LanguageMaster, ToneDetective, ProfileBuilder |
| **Game Rewards** | Active | ₹5-₹15 wallet credits |
| **Training Data Collection** | Active via games | Games generate labeled NLU training data (genius!) |
| **User Profiling** | Active | Diet, cuisines, budget, allergies, order history |

### What's MISSING

| Missing Feature | Business Value | Priority |
|----------------|---------------|----------|
| **WhatsApp broadcast** | Re-engage inactive users, promote deals | HIGH |
| **Customer segmentation** | Target right users with right offers | HIGH |
| **Coupon/promo system** | Drive conversions, retention | HIGH |
| **Push notifications** | For web/mobile users | MEDIUM |
| **Loyalty program** | Beyond gamification — earn points per order | MEDIUM |
| **Automated re-engagement** | "We miss you" flows for inactive users (7d, 14d, 30d) | HIGH |
| **Referral system** | Invite friends, earn credits | MEDIUM |
| **Campaign management UI** | Create, schedule, track campaigns | HIGH |

---

## 13. Skills Architecture Proposal

### Current: Flow-Based State Machine

Each feature is a **monolithic flow** (food order = 4,043 lines). Flows own the entire conversation journey. Address collection is duplicated across food/parcel/ecom flows. Payment is duplicated across parcel flow (and missing from food flow).

### Proposed: Skills Architecture

```
                     ┌────────────────────┐
                     │   Skill Router     │
                     │   (NLU + LLM)      │
                     └────────┬───────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  Food Order  │  │ Parcel       │  │ Order Track  │
    │  Skill       │  │ Skill        │  │ Skill        │
    └──────┬───────┘  └──────┬───────┘  └──────────────┘
           │                 │
     ┌─────┼─────┐     ┌────┼────┐
     ▼     ▼     ▼     ▼    ▼    ▼
  ┌─────┐┌─────┐┌───┐ ┌─────┐┌───┐┌─────┐
  │Addr ││Cart ││Pay│ │Addr ││Pay││Price│   ← SHARED SKILLS
  │Skill││Skill││   │ │Skill││   ││Skill│
  └─────┘└─────┘└───┘ └─────┘└───┘└─────┘
```

### Proposed Skills

| Skill | Lines (est.) | Replaces |
|-------|-------------|----------|
| **Food Ordering** | ~800 | Core of `food_order_v1` (search, selection, cart) |
| **Parcel Delivery** | ~500 | Core of `parcel_delivery_v1` |
| **E-commerce** | ~600 | Core of `ecommerce_order_v1` |
| **Address** (shared) | ~300 | Address collection from all 3 ordering flows |
| **Payment** (shared) | ~400 | Payment gateway from parcel + missing from food |
| **Cart** (shared) | ~300 | Cart management from food + ecommerce |
| **Search** (shared) | ~200 | Product/restaurant search |
| **Order Tracking** | ~400 | `order_tracking_v1` |
| **Auth** (shared) | ~200 | `auth_v1` |
| **Support** | ~300 | `support_v1` |
| **Conversation** | ~200 | greeting + chitchat + farewell |

### Benefits

| Dimension | Flow-Based (Current) | Skills (Proposed) |
|-----------|---------------------|-------------------|
| **Code reuse** | Low — duplicated | High — shared skills |
| **Composability** | None | "Order pizza to my office" = Food + Address + Payment |
| **Maintainability** | 4,043-line files | ~300-800 line skills |
| **Testing** | Integration only | Unit test each skill |
| **Multi-intent** | 1 intent = 1 flow | LLM composes multiple skills |
| **New features** | Create massive new flow | Create focused skill |

### Migration Path

| Phase | What | Risk | Effort |
|-------|------|------|--------|
| **Phase 1** | Extract Address, Payment, Cart as shared services (keep flows as orchestrators) | Low | 2-3 weeks |
| **Phase 2** | Build LLM-powered skill router alongside existing intent router | Medium | 3-4 weeks |
| **Phase 3** | Convert flows to skills one at a time (food → parcel → ecom) | Medium | 4-6 weeks |
| **Phase 4** | Remove legacy flow engine, full skills architecture | High | 2-3 weeks |

---

## 14. Prioritized Fix List

### 🔴 P0 — Critical (Fix Immediately)

| # | Issue | Impact | Effort | File |
|---|-------|--------|--------|------|
| 1 | Food order skips payment gateway | Revenue loss — customers never pay | 4-6 hours | `food-order.flow.ts` |
| 2 | `verify_payment` hardcoded mock | Payment verification never actually verifies | 2 hours | `php-api.executor.ts` |
| 3 | `STORAGE_CDN` duplicated 5× across 2 files | CDN migration impossible without scattered edits | 1 hour | `search.executor.ts`, `search.service.ts` |

### 🟡 P1 — High (Fix This Week)

| # | Issue | Impact | Effort | File |
|---|-------|--------|--------|------|
| 4 | Platform fee `₹5` hardcoded in 2 places | Fee changes require code deploy + values can diverge | 1 hour | `parcel.service.ts`, `conversation.service.ts` |
| 5 | GST rates (5%, 18%) hardcoded | Tax changes require deploy | 1 hour | `pricing.executor.ts` |
| 6 | Zone-city mapping hardcoded | Can't add cities without code change | 2 hours | `zone.executor.ts` |
| 7 | No "I don't understand" re-prompt in flows | Users get confused, drop off | 3-4 hours | All flow files |
| 8 | `9999999999` fallback phone | Creates orders with fake phone | 30 min | `php-order.service.ts` |
| 9 | `192.168.0.151` hardcoded 8 times | ML server move breaks NLU | 1 hour | 8 NLU service files |
| 10 | `show_categories` in both state lists | Ambiguous behavior per flow | 30 min | `context-router.service.ts` |

### 🔵 P2 — Medium (Fix This Sprint)

| # | Issue | Impact | Effort | File |
|---|-------|--------|--------|------|
| 11 | Module IDs hardcoded instead of using mapping | Inconsistency risk | 2 hours | 6+ files |
| 12 | Multiple conflicting delivery rate defaults | Wrong pricing possible | 2 hours | 3 files |
| 13 | Support phone `8888888888` placeholder | Customer confusion | 30 min | `command-handler.service.ts` |
| 14 | CORS origins hardcoded | Deployment inflexibility | 1 hour | `main.ts`, `chat.gateway.ts` |
| 15 | Tracking URL phone undefined | Broken tracking links | 1 hour | `order-tracking.flow.ts` |

### ⚪ P3 — Low (Backlog)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 16 | Auth token inconsistency (`auth_token` vs `session.auth_token`) | Subtle auth bugs | 2 hours |
| 17 | LLM for order ID extraction (should be regex) | Unreliable ID extraction | 1 hour |
| 18 | Reorder flow doesn't pre-fill items | Worse UX | 4 hours |
| 19 | API URLs in `channel-config.controller.ts` (×7) | Multi-env deployment issues | 1 hour |
| 20 | `1800-123-4567` placeholder toll-free | Customer confusion | 30 min |

---

## 15. Open Questions & Decisions

### Architecture Decisions Needed

1. **Skills architecture migration**: Should we start Phase 1 now (extract shared services) while fixing P0/P1 bugs? Or fix bugs first, then refactor?

2. **Food order payment**: The flow is 4,043 lines. Should we add the missing payment states inline, or is this the trigger to extract Payment as a shared skill?

3. **Zone/city expansion**: Hardcoded zone IDs suggest Nashik-first. What is the city expansion plan? Should we build a dynamic zone system now or just add Pune/Mumbai configs?

4. **LLM model upgrade**: Qwen 2.5 7B works but is limited. Is there budget for a larger local model (32B) or should we lean more on cloud providers?

5. **Admin dashboard priority**: Backend analytics endpoints exist but no frontend. Is building an admin dashboard a priority? What metrics matter most?

### Product Questions

6. **COD availability**: COD is reportedly disabled globally in PHP. Is this intentional? Should food orders support COD?

7. **Support phone numbers**: `8888888888` and `1800-123-4567` — what are the real support numbers?

8. **Platform fee**: Is ₹5 the correct platform fee? Should it vary by module or zone?

9. **Delivery pricing**: Three different rate structures exist (₹44 min/₹11.11 per km, ₹30 base/₹10 per km, ₹30 min). Which is correct?

10. **Marketing strategy**: The gamification system is brilliant (games generate NLU training data). Should we prioritize: (a) WhatsApp broadcast campaigns, (b) customer segmentation & targeting, (c) loyalty/rewards program, or (d) referral system?

### Technical Questions

11. **IndicBERT server**: Should `192.168.0.151` services be containerized? Moving them to Docker would eliminate hardcoded IPs.

12. **vLLM server**: Is `localhost:8002` reliable? What's the uptime? Should we add health checks and auto-restart?

13. **Monitoring**: Prometheus/Grafana dashboards exist. Are they being actively monitored? Who gets alerts?

14. **Multi-tenancy**: White-label tenant system exists. Is it being used? Should we build for multi-tenant or focus single-tenant?

15. **YAML v2 flows**: 8 YAML flows exist alongside 15 TypeScript flows. Are YAML flows active in production or experimental?

---

*This document should be updated as decisions are made and fixes are implemented.*
*Generated by deep system audit — February 10, 2026*
