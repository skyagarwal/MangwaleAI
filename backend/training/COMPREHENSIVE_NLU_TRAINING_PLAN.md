# 🧠 Comprehensive NLU Training Plan - MangwaleAI

## Executive Summary

**Current Status:** 
- 1,980 training samples across 38 intents
- NO entity annotations in training data
- NO tone annotations in training data  
- NO slot training - entities extracted via regex/rules
- Sentiment analysis via LLM (separate from NLU training)

**Architecture Reality:**
```
User Message
    ↓
┌─────────────────────────────────────────────────────────┐
│ NLU Service (nlu.service.ts)                            │
│ ┌─────────────────────┐  ┌─────────────────────────────┐│
│ │ IntentClassifier    │  │ EntityExtractor             ││
│ │ (IndicBERT trained) │  │ (Rule-based/Regex)          ││
│ │ - 38 intents        │  │ - Phone, Email, OTP         ││
│ │ - Text → Intent     │  │ - Food items, Quantities    ││
│ └─────────────────────┘  │ - Locations, Order IDs      ││
│           ↓              └─────────────────────────────┘│
│ ┌─────────────────────┐  ┌─────────────────────────────┐│
│ │ ToneAnalyzer        │  │ LLM Fallback                ││
│ │ (Rule-based/Regex)  │  │ (For low-confidence)        ││
│ │ - 7 tones           │  │ - Intent verification       ││
│ └─────────────────────┘  └─────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**What CAN Be Trained:**
1. ✅ Intent Classification (IndicBERT) - **FOCUS HERE**
2. ❌ Entity Extraction - Currently regex-based (would need NER model)
3. ❌ Tone Detection - Currently keyword-based

---

## 📊 Current Intent Analysis (V12)

### Critical Issues Found:

| Intent | Samples | Issue | Required |
|--------|---------|-------|----------|
| `order_food` | 271 | Needs food TYPE variations | 400+ |
| `parcel_booking` | 237 | Good but merge duplicates | Keep |
| `greeting` | 168 | Over-represented | Reduce |
| `add_to_cart` | 55 | Needs more variations | 150+ |
| `search_product` | 48 | Critical for discovery | 150+ |
| `use_my_details` | 47 | Confuses with login | 100+ |
| `help` | 43 | Merge with service_inquiry | 80+ |
| `complaint` | 36 | Needs frustration patterns | 100+ |
| `thanks` | 35 | Under-represented | 60+ |
| `login` | 31 | Too similar to use_my_details | Merge? |
| `browse_menu` | 33 | Good | Keep |
| `create_parcel_order` | 20 | **DUPLICATE** | Merge→parcel_booking |
| `contact_search` | 1 | **REMOVE** | Delete |
| `earn` | 1 | **REMOVE** | Delete |
| `play_game` | 5 | **REMOVE** | Delete |

---

## 🎯 Proposed Intent Structure (22 Core Intents)

### 1. FOOD ORDERING INTENTS

#### `order_food` (Target: 300 samples)
Food orders from restaurants - the PRIMARY intent.
```
HINDI VARIATIONS:
- "pizza chahiye"
- "biryani mangwao"
- "khana order karo"
- "kuch khane ko mangwao"
- "dinner ke liye kuch order karo"
- "ek paneer tikka aur do naan"
- "butter chicken with rice"
- "mujhe south indian chahiye"

HINGLISH:
- "yaar pizza order kar de"
- "bhai aaj momos khane ka mann hai"
- "kal ke liye food order karna hai"
- "thoda spicy chahiye"
- "chinese food from inayat cafe"

ENGLISH:
- "I want to order food"
- "Can you order some pizza for me"
- "Get me a burger from McDonald's"
- "I'm craving biryani"
- "Order dinner for 4 people"

SPECIFIC FOOD TYPES:
- "ek plate momos"
- "2 paratha aur dahi"
- "cheese pizza medium"
- "veg fried rice"
- "egg biryani"
```

#### `browse_menu` (Target: 100 samples)
User wants to see what's available.
```
- "menu dikhao"
- "kya kya milta hai"
- "options batao"
- "kya available hai"
- "what food can I order"
- "show restaurants near me"
- "pizza shops"
- "chinese food options"
- "veg restaurants"
```

#### `add_to_cart` (Target: 100 samples)
Explicitly adding to cart.
```
- "cart mein daal do"
- "ye bhi add karo"
- "add to cart"
- "isko bhi daal do"
- "aur ek add karo"
- "add this one"
- "cart mein rakh do"
```

#### `view_cart` (Target: 60 samples)
```
- "cart dikhao"
- "mera order kya hai"
- "kya kya order kiya"
- "cart mein kya hai"
- "show my cart"
- "what's in my cart"
```

#### `remove_from_cart` (Target: 60 samples)
```
- "hata do ye"
- "nahi chahiye"
- "remove kar do"
- "cart se nikalo"
- "ye cancel karo"
- "delete this item"
```

#### `checkout` (Target: 80 samples)
```
- "order place karo"
- "checkout"
- "payment karna hai"
- "order confirm karo"
- "proceed to payment"
- "finalize order"
- "book kar do"
```

### 2. PARCEL/DELIVERY INTENTS

#### `parcel_booking` (Target: 200 samples)
Sending parcels/documents.
```
HINDI:
- "parcel bhejni hai"
- "courier book karo"
- "document pickup karwa do"
- "packet bhejni hai"
- "ek samaan door delivery karna hai"

HINGLISH:
- "mujhe parcel book karni hai"
- "bhai ek courier bhejni hai"
- "office se packet lena hai"
- "ghar se pickup karwa do"

ENGLISH:
- "I want to send a parcel"
- "Book a courier for me"
- "Pickup from my office"
- "Send a document to my friend"

CONTEXTUAL:
- "friend ke ghar samaan bhejni hai"
- "mom ke liye birthday gift bhejni hai"
- "urgent document delivery"
```

#### `track_order` (Target: 100 samples)
```
- "mera order kahan hai"
- "delivery status"
- "rider kahan pahuncha"
- "tracking info"
- "where is my package"
- "ETA kya hai"
- "kab tak aayega"
- "kitni der lagegi"
- "parcel kahan tak pahunchi"
```

#### `cancel_order` (Target: 80 samples)
```
- "order cancel karo"
- "booking cancel"
- "nahi chahiye ab"
- "cancel everything"
- "mujhe ye nahi chahiye"
- "ruk jao, cancel karo"
```

### 3. AUTHENTICATION INTENTS

#### `use_my_details` (Target: 100 samples) ⚠️ CRITICAL
User wants to use SAVED details for quick order.
```
CLEAR PATTERNS:
- "use my saved details"
- "mere details use karo"
- "pehle wale details"
- "same address"
- "same number"
- "wo wala address use karo"
- "purana address"
- "last wali details"

WITH NAME/PHONE:
- "Rahul 9876543210"
- "mera naam Priya hai 9888888888"
- "details: Akash, 9923383838"

CONFIRMATION:
- "haan mere details theek hai"
- "yes use my info"
- "confirm my details"
```

#### `login` (Target: 60 samples)
User explicitly wants to log in/sign up.
```
- "login karna hai"
- "sign in"
- "account create karo"
- "register"
- "mera account"
- "log me in"
- "sign up"
```

#### `provide_phone` (Target: 40 samples)
```
- "9876543210"
- "my number is 9876543210"
- "mera number 9158886329"
- "phone: 9923383838"
```

#### `provide_otp` (Target: 40 samples)
```
- "123456"
- "OTP is 259860"
- "code 487142"
- "mera OTP 701472"
```

#### `resend_otp` (Target: 40 samples)
```
- "OTP nahi aaya"
- "resend karo"
- "dobara bhejo"
- "OTP expire ho gaya"
- "new OTP"
```

### 4. LOCATION INTENTS

#### `manage_address` (Target: 100 samples)
```
SHARE LOCATION:
- "📍 Location shared..."
- "location_shared"
- "GPS: 19.9975,73.7898"
- "ye mera location hai"

CHANGE ADDRESS:
- "address change karna hai"
- "naya address add karo"
- "delivery yahan karo: [address]"
- "office address use karo"
- "home delivery"

TEXT ADDRESS:
- "Sharanpur, Nashik"
- "CBS area, near bus stand"
- "college road, Nashik"
```

### 5. CONVERSATIONAL INTENTS

#### `greeting` (Target: 80 samples)
```
- "hi"
- "hello"
- "namaste"
- "kaise ho"
- "good morning"
- "hey there"
```

#### `thanks` (Target: 60 samples)
```
- "thank you"
- "shukriya"
- "dhanyawad"
- "thanks bhai"
- "bahut bahut dhanyawad"
- "thank you so much"
```

#### `chitchat` (Target: 80 samples)
```
- "how are you"
- "kya haal hai"
- "what's your name"
- "who made you"
- "you're funny"
- "good bot"
- "nice"
```

#### `confirm_action` (Target: 80 samples)
```
- "yes"
- "ok"
- "haan"
- "theek hai"
- "proceed"
- "confirm"
- "chalega"
- "done"
- "👍"
```

#### `skip_action` (Target: 60 samples)
```
- "skip"
- "nahi"
- "baad mein"
- "not now"
- "later"
- "chhodo"
- "rehne do"
```

### 6. SUPPORT INTENTS

#### `complaint` (Target: 100 samples)
```
FRUSTRATION:
- "kya bakwas service hai"
- "order galat aaya"
- "quality bahut kharab hai"
- "refund chahiye"
- "paise wapas karo"
- "bahut time lag raha"

ISSUES:
- "wrong order received"
- "food was cold"
- "item missing"
- "delivery late ho gayi"
- "rider rude tha"
```

#### `help` (Target: 80 samples)
```
- "help chahiye"
- "kaise karu"
- "samajh nahi aa raha"
- "how to order"
- "kya karu ab"
- "guide me"
- "I need assistance"
```

#### `service_inquiry` (Target: 60 samples)
```
- "kya kya kar sakte ho"
- "what services do you offer"
- "delivery charges"
- "minimum order"
- "working hours"
- "do you deliver here"
```

#### `human_takeover` (Target: 50 samples)
```
- "real person se baat karni hai"
- "human agent"
- "customer support"
- "agent se connect karo"
- "speak to a human"
- "live chat"
```

### 7. MODIFIERS/CONTEXT

#### `express_urgency` (Target: 50 samples)
```
- "jaldi chahiye"
- "urgent hai"
- "asap"
- "turant"
- "bahut jaldi"
- "emergency"
```

#### `payment_method` (Target: 50 samples)
```
- "COD"
- "cash on delivery"
- "online payment"
- "UPI"
- "card se"
- "GPay"
- "PhonePe"
```

---

## 📝 Training Data Format

### Current Format (V12) - Intent Only:
```json
{"text": "pizza chahiye", "intent": "order_food"}
{"text": "track my order", "intent": "track_order"}
```

### Enhanced Format for Future Slot Training:
```json
{
  "text": "2 cheese pizza from Inayat Cafe",
  "intent": "order_food",
  "entities": [
    {"type": "quantity", "value": "2", "start": 0, "end": 1},
    {"type": "food_item", "value": "cheese pizza", "start": 2, "end": 14},
    {"type": "restaurant", "value": "Inayat Cafe", "start": 20, "end": 31}
  ],
  "tone": "neutral",
  "language": "en"
}
```

**Note:** Current training only uses text→intent. Entities/tone are extracted separately via rules.

---

## 🌐 Data Collection Sources

### 1. Web Research - How People Order Food

**Swiggy/Zomato Chat Patterns:**
- Quick orders: "paneer butter masala x1"
- Combos: "2 burger + fries + coke"
- Specific: "extra spicy, no onion"
- Discovery: "best biryani near me"

**WhatsApp Food Groups:**
- Casual: "yaar kuch manga le"
- Group orders: "sabke liye pizza order karo"
- Recommendations: "achi jagah batao biryani ke liye"

**Indian E-commerce:**
- Direct: "Amazon se phone order karna hai"
- Compare: "best price kahan milega"

### 2. Regional Variations

**Hindi Belt:**
- "khana mangwa do"
- "order kar do bhai"
- "kuch khane ko"

**Marathi:**
- "pizza pathav"
- "order kar"
- "khayala kahi manga"

**South Indian English:**
- "One chicken biryani please"
- "I want to order only"
- "No need of dessert"

### 3. Time-based Patterns

**Morning:**
- "breakfast ke liye kuch"
- "chai aur paratha"
- "nashta order karo"

**Afternoon:**
- "lunch ka time ho gaya"
- "thali mangwa do"
- "office mein order karo"

**Night:**
- "dinner ke liye pizza"
- "late night craving"
- "kuch halka manga lo"

---

## 🚀 Training Process

### Step 1: Jupiter Container (Local Testing)
```bash
# SSH to Jupiter
ssh ubuntu@jupiter

# Stop vLLM if running (frees GPU)
docker stop vllm-container

# Start NLU training container
docker-compose -f docker-compose.nlu-training.yml up -d

# Run training
docker exec nlu-training python train.py \
  --data /training-data/combined_v14_comprehensive.jsonl \
  --output /models/indicbert_v14 \
  --epochs 5
```

### Step 2: Local Testing
```bash
# Test on Jupiter
curl -X POST http://localhost:7010/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "pizza chahiye"}'

# Run comprehensive tests
npm run test:nlu
```

### Step 3: Deploy to Mercury
```bash
# Copy model to Mercury
scp -r /models/indicbert_v14 ubuntu@mercury:/nlu-models/

# Update Mercury NLU service
ssh ubuntu@mercury
systemctl restart nlu-inference
```

---

## 📋 Action Items

1. **REMOVE these intents:**
   - `contact_search` (1 sample)
   - `earn` (1 sample)
   - `play_game` (5 samples)

2. **MERGE these intents:**
   - `create_parcel_order` → `parcel_booking`
   - `support_request` → `help`

3. **ADD NEW intents:**
   - `human_takeover` (request human agent)

4. **EXPAND these intents:**
   - `order_food`: 271 → 400
   - `add_to_cart`: 55 → 150
   - `search_product`: 48 → 150
   - `use_my_details`: 47 → 100
   - `complaint`: 36 → 100
   - `help`: 43 → 80
   - `thanks`: 35 → 60
   - `remove_from_cart`: 13 → 60
   - `checkout`: 88 → 120

5. **REDUCE over-represented:**
   - `greeting`: 168 → 80 (too many similar examples)
   - `confirm_action`: 90 → 80

---

## 📊 Final Training Data Targets

| Intent | Current | Target | Needed |
|--------|---------|--------|--------|
| order_food | 271 | 400 | +129 |
| parcel_booking | 257* | 250 | -7 |
| greeting | 168 | 80 | -88 |
| track_order | 118 | 120 | +2 |
| manage_address | 116 | 120 | +4 |
| cancel_order | 105 | 100 | -5 |
| chitchat | 102 | 80 | -22 |
| confirm_action | 90 | 80 | -10 |
| checkout | 88 | 120 | +32 |
| add_to_cart | 55 | 150 | +95 |
| search_product | 48 | 150 | +102 |
| use_my_details | 47 | 100 | +53 |
| help | 46* | 80 | +34 |
| complaint | 36 | 100 | +64 |
| thanks | 35 | 60 | +25 |
| browse_menu | 33 | 100 | +67 |
| login | 31 | 60 | +29 |
| repeat_order | 28 | 50 | +22 |
| view_cart | 28 | 60 | +32 |
| service_inquiry | 28 | 60 | +32 |
| remove_from_cart | 13 | 60 | +47 |
| resend_otp | 10 | 40 | +30 |
| human_takeover | 0 | 50 | +50 |

**Total Needed:** ~940 new quality samples

---

*Document created: January 6, 2026*
*Next: Generate comprehensive training dataset*
