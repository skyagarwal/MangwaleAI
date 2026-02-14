# NLU Training System Enhancement - Complete Summary

## Overview

This document summarizes all the NLU training system enhancements made for the Mangwale AI hyperlocal business platform.

---

## 1. Mercury Primary + Jupiter Fallback Architecture

### Problem
The backend was using Jupiter's CPU-based NLU (localhost:7010) instead of Mercury's GPU-accelerated NLU.

### Solution
Implemented automatic failover pattern in both NLU services:

**Files Modified:**
- `backend/src/nlu/services/indicbert.service.ts`
- `backend/src/services/nlu-client.service.ts`
- `backend/.env`

**Architecture:**
```
┌─────────────────┐    Primary    ┌──────────────────┐
│   Backend       │──────────────▶│ Mercury NLU      │
│   (Jupiter)     │               │ (192.168.0.151)  │
│                 │               │ GPU: RTX 3060    │
│                 │               │ Port: 7010       │
│                 │    Fallback   ├──────────────────┤
│                 │──────────────▶│ Jupiter NLU      │
│                 │               │ CPU (localhost)  │
│                 │               │ Port: 7010       │
└─────────────────┘               └──────────────────┘
```

**Environment Variables:**
```env
NLU_PRIMARY_ENDPOINT=http://192.168.0.151:7010
NLU_FALLBACK_ENDPOINT=http://localhost:7010
```

**Features:**
- Automatic health checking every 30 seconds
- Seamless switch to fallback on primary failure
- Auto-recovery when primary comes back online
- Logging of all switches for debugging

---

## 2. Intent Consolidation Plan

### Problem
21 intents with many duplicates and overlapping meanings. Some intents like `earn` and `contact_search` were unused.

### Solution
Consolidated to 17 focused intents optimized for hyperlocal business.

**Intent Mapping:**
| Old Intent | New Intent | Reason |
|------------|-----------|--------|
| create_parcel_order | parcel_booking | Duplicate |
| thanks | chitchat | Merge into chitchat |
| browse_menu | order_food | Merge into food ordering |
| service_inquiry | help | Merge into help |
| earn | REMOVED | Not needed |
| contact_search | REMOVED | Not needed |

**New Intents Added:**
- `order_grocery` - For grocery/kirana orders
- `human_takeover` - For escalation requests

**Final 17 Intents:**
1. greeting
2. chitchat  
3. order_food
4. order_grocery (NEW)
5. search_product
6. track_order
7. cancel_order
8. repeat_order
9. add_to_cart
10. view_cart
11. checkout
12. parcel_booking
13. manage_address
14. login
15. complaint
16. help
17. human_takeover (NEW)

See: `backend/training/INTENT_CONSOLIDATION_PLAN.md`

---

## 3. Training Data Cleanup

### Problem
- 873 samples with garbage data (button IDs, single digits)
- Duplicate samples
- Imbalanced distribution

### Solution
Created automated cleaning script: `backend/training/clean_training_data.py`

**Cleaning Results:**
| Metric | Before | After |
|--------|--------|-------|
| Total Samples | 873 | 926 |
| Garbage Removed | - | 24 |
| Duplicates Removed | - | 25 |
| Synthetic Added | - | 105 |

**Intent Distribution After Cleaning:**
```
✅ parcel_booking: 191
✅ order_food: 138
✅ manage_address: 121
✅ chitchat: 84
✅ track_order: 80
✅ greeting: 61
⚠️ use_my_details: 41
⚠️ help: 41
⚠️ search_product: 32
⚠️ checkout: 25
⚠️ complaint: 20
❌ cancel_order: 18
❌ add_to_cart: 16
❌ repeat_order: 15
❌ order_grocery: 15
❌ human_takeover: 10
❌ view_cart: 10
❌ login: 8
```

**Cleaned Data:** `backend/training/nlu_training_data_cleaned.jsonl`

---

## 4. Self-Learning Integration

### Problem
`NluClientService` (used by IntentRouterService) was missing self-learning hooks.

### Solution
Added `SelfLearningService` integration to `NluClientService`.

**Files Modified:**
- `backend/src/services/nlu-client.service.ts`

**Self-Learning Flow:**
```
Message → NluClientService.classify()
                    ↓
              Get prediction
                    ↓
     ┌──────────────┴──────────────┐
     ↓                              ↓
 confidence > 0.9        0.7 < confidence < 0.9
 Auto-approve             Human review queue
                               ↓
                    confidence < 0.7
                    Label Studio review
```

**Channels Now Feeding Self-Learning:**
- ✅ WhatsApp (whatsapp.provider.ts)
- ✅ Telegram (telegram.provider.ts)
- ✅ WebChat (agent-orchestrator → nlu-client)
- ✅ API calls (nlu.controller.ts)

---

## 5. Training Pipeline

### Script
`backend/training/train_nlu.sh`

**Usage:**
```bash
./train_nlu.sh                # Full pipeline
./train_nlu.sh --skip-clean   # Skip cleaning step
./train_nlu.sh --dry-run      # Preview only
```

**Pipeline Steps:**
1. Clean training data (remove garbage, merge intents)
2. Validate data (count samples, check intents)
3. Check server health (Mercury, Jupiter)
4. Upload to training server
5. Trigger retraining
6. Display summary

---

## 6. Recommended Next Steps

### Immediate (Before Next Training)
1. [ ] Generate more samples for low-count intents using `TrainingDataGeneratorService`
2. [ ] Add real user messages from conversation logs
3. [ ] Set up nightly training schedule

### Short-term (1-2 weeks)
1. [ ] Enable Label Studio for human review (confidence < 0.7)
2. [ ] Create metrics dashboard for NLU accuracy
3. [ ] Add A/B testing for new models

### Long-term
1. [ ] Multi-language support (Hindi, English, Hinglish)
2. [ ] Context-aware intent detection
3. [ ] Real-time model updates without downtime

---

## Files Created/Modified

### Created
| File | Purpose |
|------|---------|
| `backend/training/clean_training_data.py` | Automated data cleaning |
| `backend/training/train_nlu.sh` | Training pipeline script |
| `backend/training/INTENT_CONSOLIDATION_PLAN.md` | Intent mapping guide |
| `backend/training/nlu_training_data_cleaned.jsonl` | Cleaned training data |
| `backend/training/cleaning_stats.json` | Cleaning statistics |
| `backend/training/NLU_TRAINING_ENHANCEMENT_SUMMARY.md` | This document |

### Modified
| File | Changes |
|------|---------|
| `backend/src/nlu/services/indicbert.service.ts` | Mercury primary + fallback |
| `backend/src/services/nlu-client.service.ts` | Mercury fallback + self-learning |
| `backend/.env` | NLU endpoint configuration |

---

## Commands Reference

```bash
# Clean training data
cd backend/training
python3 clean_training_data.py

# View stats
cat cleaning_stats.json | jq

# Run training pipeline
./train_nlu.sh

# Test NLU endpoint
curl -X POST http://192.168.0.151:7010/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "mujhe pizza order karna hai"}'

# Generate new samples from OpenSearch
curl -X POST http://localhost:3000/api/training/generate \
  -H "Content-Type: application/json" \
  -d '{"source": "food_items", "limit": 100}'
```

---

## Support

For questions about the NLU system:
- Check `backend/ARCHITECTURE_MAP.md` for system overview
- See `backend/training/` for all training-related files
- Run `./train_nlu.sh --dry-run` to preview pipeline
