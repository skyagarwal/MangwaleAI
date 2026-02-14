# Profile Enhancement & First-Time Onboarding System

## Overview

This document describes the profile building system for Mangwale AI, which helps understand customers better through both **passive enrichment** (analyzing order history) and **active onboarding** (asking questions).

---

## Two Types of Profile Building

### 1. Passive Profile Enrichment (UserProfileEnrichmentService)

**Location:** `/backend/src/personalization/user-profile-enrichment.service.ts`

**What it does:**
- Analyzes user's order history from MySQL
- Extracts patterns automatically without asking questions
- Runs periodically (with 24-hour cooldown to avoid duplicates)

**Data Collected:**
```typescript
{
  favoriteCuisines: ['indian', 'chinese'],    // From order categories
  favoriteStores: ['store1', 'store2'],        // Most ordered from
  favoriteItems: ['paneer tikka', 'noodles'],  // Most ordered items
  avgOrderValue: 250,                          // Average spend
  orderFrequency: 3.5,                         // Orders per week
  preferredMealTimes: ['lunch', 'dinner'],     // Based on order hours
  priceSensitivity: 'moderate',                // budget/moderate/premium
  dietaryType: 'vegetarian',                   // From item veg flags
}
```

**Limitations:**
- Only works for users WITH existing orders
- Cannot know allergies unless user reports them
- Cannot know explicit preferences until orders show pattern

---

### 2. Active Onboarding (First-Time Onboarding Flow) - NEW!

**Location:** `/backend/src/flow-engine/flows/first-time-onboarding.flow.ts`

**What it does:**
- Triggers automatically for first-time WhatsApp/Telegram users
- Asks key profile questions directly
- Shorter flow for WhatsApp (2 questions), longer for Web (5 questions)

**Flow Variants:**

#### WhatsApp/Telegram (Short Flow):
1. Welcome message
2. Ask name (if not set)
3. Ask dietary preference (veg/non-veg/eggetarian)
4. Complete ✅

#### Web/Mobile (Full Flow):
1. Welcome message with "Let's Go!" / "Skip" options
2. Ask name
3. Ask dietary preference
4. Ask favorite cuisines
5. Ask budget preference
6. Ask preferred area (Nashik localities)
7. Complete ✅

---

## When Each System Triggers

### Passive Enrichment Triggers:
- After order completion (via cron job)
- When user has 3+ orders
- Not more than once per 24 hours

### Active Onboarding Triggers:
- First message from a NEW WhatsApp user
- First message from a NEW Telegram user
- `is_new_user` flag in session OR no profile data exists

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     MESSAGE ARRIVES                              │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                  ContextRouter.routeInternal()                   │
│                                                                  │
│  STEP 0: shouldTriggerOnboarding() ────────────────────────────┐ │
│     │                                                          │ │
│     ├── Is WhatsApp/Telegram?                                  │ │
│     ├── Is is_new_user=true OR no profile?                     │ │
│     ├── messageCount <= 1?                                     │ │
│     │                                                          │ │
│     └─── YES → startOnboardingFlow() ◄─────────────────────────┘ │
│              │                                                   │
│              └─→ first_time_onboarding_v1 flow                   │
│                                                                  │
│  STEP 1-5: Normal routing (NLU, flows, agent)                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Files Modified/Created

### New Files:
- `/backend/src/flow-engine/flows/first-time-onboarding.flow.ts` - The onboarding flow definition

### Modified Files:
- `/backend/src/flow-engine/flows/index.ts` - Added first-time-onboarding flow to registry
- `/backend/src/flow-engine/executors/profile.executor.ts` - Added `save_preference` action
- `/backend/src/messaging/services/context-router.service.ts` - Added onboarding detection logic
- `/backend/src/flow-engine/executors/auth.executor.ts` - Mark session with `is_new_user` flag

---

## Profile Executor Actions

| Action | Description | Used By |
|--------|-------------|---------|
| `ask_question` | Ask contextual profile question | Post-order enrichment |
| `save_answer` | Save answer from button click | Post-order enrichment |
| `save_preference` | Save key-value preference | First-time onboarding |
| `check_status` | Check profile completeness | Various |
| `learn_from_order` | Extract data from order | Post-order enrichment |

---

## Example User Journey

### WhatsApp First-Time User:

```
USER: Hi

BOT: 🎉 Welcome to Mangwale!

     Just 2 quick questions to personalize your experience:
     
     Are you vegetarian or non-vegetarian?
     [🥬 Vegetarian] [🍗 Non-Veg] [🍽️ Both]

USER: [clicks 🥬 Vegetarian]

BOT: ✅ You're all set!

     I'll remember your preferences. What would you like to do?
     [🍕 Order Food] [📦 Send Parcel] [❓ Help]
```

### Returning User (No Onboarding):

```
USER: I want to order food

BOT: 🍕 What are you in the mood for?
     [Browse Restaurants] [Quick Picks] [Search]
```

---

## Testing Checklist

1. **WhatsApp New User:**
   - [ ] First message triggers onboarding
   - [ ] Dietary preference saved to session
   - [ ] Next message uses normal routing

2. **WhatsApp Returning User:**
   - [ ] No onboarding triggered
   - [ ] Goes directly to intent routing

3. **Web New User:**
   - [ ] Full onboarding with all 5 questions
   - [ ] "Skip" option works

4. **Profile Persistence:**
   - [ ] Preferences saved to session
   - [ ] Preferences saved to user_profiles table (if authenticated)

---

## Future Enhancements

1. **Progressive Profile Building:**
   - Ask one question per session (not all at once)
   - Questions appear after order completion
   
2. **Allergy Collection:**
   - Critical for food safety
   - Ask explicitly in onboarding

3. **Location Learning:**
   - Learn delivery addresses
   - Suggest nearby restaurants

4. **Behavioral Patterns:**
   - Time-of-day preferences
   - Spice level preferences
   - Order frequency patterns
