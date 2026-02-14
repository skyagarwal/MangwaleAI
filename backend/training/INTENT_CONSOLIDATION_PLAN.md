# 🎯 NLU Intent Consolidation & Enhancement Plan

## Current State Analysis

### Existing Intents (21 total, 873 samples)
| Intent | Samples | Status | Action |
|--------|---------|--------|--------|
| parcel_booking | 173 | ✅ Good | MERGE with create_parcel_order |
| order_food | 143 | ⚠️ Needs more | KEEP + Expand |
| manage_address | 123 | ✅ Good | KEEP |
| chitchat | 88 | ✅ Good | KEEP |
| track_order | 80 | ✅ Good | KEEP |
| greeting | 74 | ✅ Good | KEEP |
| use_my_details | 47 | ⚠️ Could use more | MERGE into confirm_details |
| service_inquiry | 27 | ⚠️ Low | KEEP |
| create_parcel_order | 22 | ❌ Duplicate | MERGE into parcel_booking |
| help | 19 | ⚠️ Low | EXPAND |
| search_product | 17 | ❌ Too low | EXPAND (critical for ecom) |
| checkout | 15 | ⚠️ Low | EXPAND |
| login | 9 | ❌ Too low | MERGE into account_action |
| cancel_order | 8 | ❌ Too low | EXPAND |
| repeat_order | 8 | ❌ Too low | KEEP |
| add_to_cart | 6 | ❌ Too low | EXPAND |
| thanks | 5 | ❌ Too low | MERGE into chitchat |
| complaint | 5 | ❌ Too low | EXPAND |
| earn | 2 | ❌ Remove | REMOVE |
| contact_search | 1 | ❌ Remove | REMOVE |
| browse_menu | 1 | ❌ Remove | MERGE into order_food |

---

## 📋 Recommended Intent Structure (15 Core Intents)

### PRIMARY ROUTING INTENTS (Business Critical)

#### 1. `order_food` - Food & Restaurant Orders
**Purpose:** User wants to order food from restaurants  
**Samples needed:** 200+ (currently 143)
**Examples:**
- "pizza chahiye"
- "biryani from Inayat Cafe"
- "veg thali order karo"
- "menu dikhao"
- "kya kya milta hai yahan"

#### 2. `order_grocery` - Grocery/Kirana Orders ⭐ NEW
**Purpose:** User wants groceries/raw ingredients delivered  
**Samples needed:** 100+
**Examples:**
- "ande chahiye 12"
- "doodh mangwa do 2 litre"
- "atta aur cheeni bhej do"
- "kirana saman chahiye"
- "vegetables lana hai"

#### 3. `parcel_booking` - Courier/Delivery Service
**Purpose:** User wants to send a parcel/document  
**Samples needed:** 195 (current: 173 + 22 merged)
**Examples:**
- "parcel bhejni hai"
- "courier book karo"
- "document pickup karna hai"
- "office se packet lena hai"

#### 4. `track_order` - Order/Delivery Tracking
**Purpose:** User wants to know order status  
**Samples needed:** 100+ (current: 80)
**Examples:**
- "mera order kahan hai"
- "delivery status"
- "rider kahan pahuncha"
- "kitna time lagega"

#### 5. `search_product` - Discovery & Search
**Purpose:** User is exploring/searching for items  
**Samples needed:** 100+ (current: 17)
**Examples:**
- "restaurants near me"
- "pizza shops dikhao"
- "what all can I order"
- "Chinese food options"

### TRANSACTIONAL INTENTS (Order Flow)

#### 6. `add_to_cart` - Cart Addition
**Purpose:** User wants to add item to cart  
**Samples needed:** 50+ (current: 6)
**Examples:**
- "add to cart"
- "cart mein daal do"
- "ye bhi chahiye"

#### 7. `view_cart` - Cart Review
**Purpose:** User wants to see cart contents  
**Samples needed:** 50+
**Examples:**
- "cart dikhao"
- "mera cart"
- "kya order kiya maine"

#### 8. `checkout` - Complete Purchase
**Purpose:** User wants to place order/pay  
**Samples needed:** 50+ (current: 15)
**Examples:**
- "order place karo"
- "checkout"
- "payment karna hai"
- "COD se order karo"

#### 9. `cancel_order` - Cancellation
**Purpose:** User wants to cancel  
**Samples needed:** 50+ (current: 8)
**Examples:**
- "order cancel karo"
- "nahi chahiye ab"
- "cancel my order"

#### 10. `repeat_order` - Reorder
**Purpose:** User wants same order again  
**Samples needed:** 50+ (current: 8)
**Examples:**
- "wahi order karo"
- "last order repeat"
- "same as before"

### SUPPORT INTENTS

#### 11. `help` - General Assistance
**Purpose:** User needs help  
**Samples needed:** 50+ (current: 19)
**Examples:**
- "help chahiye"
- "kya kar sakte ho"
- "madad karo"

#### 12. `complaint` - Issue Reporting
**Purpose:** User has a problem  
**Samples needed:** 50+ (current: 5)
**Examples:**
- "wrong item aaya"
- "order incomplete"
- "refund chahiye"
- "food cold tha"

#### 13. `human_takeover` - Agent Request ⭐ NEW
**Purpose:** User wants human support  
**Samples needed:** 30+
**Examples:**
- "agent se baat karo"
- "real person please"
- "customer care connect karo"

### CONVERSATIONAL INTENTS

#### 14. `greeting` - Initial Greeting
**Purpose:** Start of conversation  
**Samples needed:** 80+ (current: 74 + 5 thanks merged)
**Examples:**
- "hi", "hello", "namaste"
- "good morning"
- "hey chotu"

#### 15. `chitchat` - Small Talk
**Purpose:** Casual conversation, seasonal wishes  
**Samples needed:** 100+ (current: 88)
**Examples:**
- "how are you"
- "merry christmas"
- "thanks"
- "kya haal hai"

### ACCOUNT INTENTS (COMBINED)

#### 16. `manage_address` - Address Management
**Purpose:** Add/edit delivery addresses  
**Samples needed:** 125 (current)
**Examples:**
- "address change karo"
- "new address add"
- GPS coordinates

#### 17. `account_action` - Account Operations ⭐ MERGED
**Purpose:** Login, register, profile  
**Samples needed:** 60+ (current: 9 login + 47 use_my_details)
**Examples:**
- "login karna hai"
- "OTP bhejo"
- "mere saved details use karo"
- "profile update"

---

## 🚫 REMOVED INTENTS

| Intent | Reason | Action |
|--------|--------|--------|
| `create_parcel_order` | Duplicate | → Merge into `parcel_booking` |
| `earn` | Only 2 samples, low priority | Remove |
| `contact_search` | Only 1 sample, covered by help | Remove |
| `browse_menu` | Only 1 sample | → Merge into `order_food` |
| `thanks` | Only 5 samples | → Merge into `chitchat` |
| `login` | Only 9 samples | → Merge into `account_action` |
| `use_my_details` | 47 samples | → Merge into `account_action` |
| `service_inquiry` | Overlap with help | → Merge into `help` |

---

## 🆕 NEW INTENTS TO ADD

### For Hyperlocal Business Expansion

#### 1. `order_grocery` 
**Business case:** Mangwale does kirana/grocery delivery  
**Examples:**
```
- "doodh chahiye 2 packet"
- "ande mangwa do dozen"
- "kirana list hai - atta, tel, cheeni"
- "sabzi lana hai - aloo pyaz tamatar"
- "grocery order karna hai"
```

#### 2. `human_takeover`
**Business case:** Critical for customer satisfaction  
**Examples:**
```
- "real person se baat karni hai"
- "agent connect karo"
- "customer care"
- "bot se nahi insaan se"
```

#### 3. `store_inquiry` (Optional)
**Business case:** Users ask about specific stores  
**Examples:**
```
- "Inayat Cafe ka timing"
- "kya XYZ restaurant open hai"
- "store ka number do"
```

#### 4. `promotions` (Optional)
**Business case:** Users ask about offers  
**Examples:**
```
- "koi offer hai"
- "discount code"
- "coupon use karna hai"
```

---

## 📊 Recommended Training Data Distribution

| Intent | Min Samples | Priority |
|--------|-------------|----------|
| order_food | 200 | 🔴 Critical |
| order_grocery | 100 | 🔴 Critical (NEW) |
| parcel_booking | 200 | 🔴 Critical |
| track_order | 100 | 🔴 Critical |
| search_product | 100 | 🟡 High |
| greeting | 80 | 🟢 Good |
| chitchat | 100 | 🟢 Good |
| add_to_cart | 50 | 🟡 High |
| checkout | 50 | 🟡 High |
| view_cart | 50 | 🟡 High |
| cancel_order | 50 | 🟡 High |
| complaint | 50 | 🟡 High |
| help | 50 | 🟡 High |
| manage_address | 100 | 🟢 Good |
| account_action | 60 | 🟡 High |
| repeat_order | 30 | 🟢 Medium |
| human_takeover | 30 | 🟡 High |

**Total Target:** ~1,400+ samples across 17 intents

---

## 🔄 Migration Script

```bash
# Step 1: Backup current data
cp backend/training/nlu_training_data.jsonl backend/training/nlu_training_data_backup.jsonl

# Step 2: Run consolidation (merge intents)
# - create_parcel_order → parcel_booking
# - thanks → chitchat  
# - login + use_my_details → account_action
# - browse_menu → order_food
# - service_inquiry → help

# Step 3: Remove garbage samples
# - Remove: "btn-0", "2", "5", "8", "9", etc.
# - Remove: samples < 3 characters

# Step 4: Generate new samples using TrainingDataGenerator
# POST /api/nlu/training/generate

# Step 5: Retrain model
# POST /api/admin/learning/trigger-retraining
```

---

## ✅ Implementation Checklist

- [ ] Clean current training data (remove garbage)
- [ ] Merge duplicate intents
- [ ] Add `order_grocery` intent with 100+ samples
- [ ] Add `human_takeover` intent with 30+ samples
- [ ] Expand `search_product` to 100+ samples
- [ ] Expand `complaint` to 50+ samples
- [ ] Update NLU service INTENT_EXAMPLES
- [ ] Retrain model with 5 epochs
- [ ] Deploy to Mercury
- [ ] Monitor accuracy for 1 week
