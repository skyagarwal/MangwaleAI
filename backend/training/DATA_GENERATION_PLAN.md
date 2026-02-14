# NLU 10k Data Generation & Upgrade Plan

## 1. 🎯 Objective
Generate **10,000 unique, high-quality training samples** for MangwaleAI to fix NLU latency (by improving confidence) and intelligence.

## 2. 🧹 Data Audit Outcome
- **Existing Data (v14):** ~2,300 lines. mixed quality. Contains noise (random chars, wrong intent mapping).
- **Decision:** Start **FRESH** with `v15`. Do not mix old noisy data. Archiving v14.
- **Wrong Data Detected:** During test generation, `Qwen` generated some Chinese text. *Fix applied: Filter added to script.*

## 3. 🧠 Intents & Targets (1,000 samples each)
We focus on **13 Core Intents** for Hyperlocal Business:

1.  **`order_food`**: Pizza, Biryani, Thali, Restaurant orders.
2.  **`parcel_booking`**: Send items, courier, keys, documents.
3.  **`search_product`**: Grocery, Medicine, Electronics search.
4.  **`manage_address`**: Add/Change/Delete addresses, Share location.
5.  **`track_order`**: Where is my order, ETA.
6.  **`cancel_order`**: Stop delivery, change mind.
7.  **`use_my_details`**: Contextual (use saved address/phone).
8.  **`add_to_cart`**: "Add this", "One more".
9.  **`view_cart`**: "Show bill", "List items".
10. **`checkout`**: "Payment", "Confirm order".
11. **`help`**: Support, Human agent.
12. **`greeting`**: Hello, Hi (Cap at 500).
13. **`chitchat`**: Casual talk (Cap at 500).

## 4. ⚙️ Generation Pipeline
- **Engine:** vLLM (Qwen2.5-7B-Instruct-AWQ) running on local network.
- **Script:** `backend/training/generate_v15_dataset.py`
- **Languages:** English, Hindi, Hinglish (Mixed).
- **Output:** `backend/training/nlu_v15_10k.jsonl`

## 5. 🚀 Execution Instructions

Run the generation in the background (takes ~30-45 mins):
```bash
cd /home/ubuntu/Devs/MangwaleAI
export TARGET_SAMPLES=1000
nohup python3 backend/training/generate_v15_dataset.py > backend/training/generation.log 2>&1 &
```

Monitor progress:
```bash
tail -f backend/training/generation.log
```

## 6. 🎓 Training (Next Step)
Once generation completes:
1. Verify file size (`wc -l backend/training/nlu_v15_10k.jsonl` should be ~10,000).
2. Run training container on Mercury:
   ```bash
   docker exec nlu-training python train.py --data /training-data/nlu_v15_10k.jsonl --output /models/v15
   ```
