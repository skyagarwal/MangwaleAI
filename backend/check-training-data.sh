#!/bin/bash
# ================================================================================
# Training Data Quality Check Script
# 
# Use this to verify the training data generator is working correctly
# BEFORE running full generation.
# ================================================================================

echo "📊 NLU Training Data Quality Check"
echo "=================================="
echo ""

BASE_URL="http://localhost:3001"

# 1. Check data source statistics
echo "1. Checking available data sources..."
echo "------------------------------------"
STATS=$(curl -s "${BASE_URL}/api/nlu/training/stats")
if [ $? -eq 0 ]; then
    echo "$STATS" | jq '.data.sources' 2>/dev/null || echo "$STATS"
else
    echo "❌ Could not fetch stats. Is the backend running?"
    exit 1
fi
echo ""

# 2. Preview generated data
echo "2. Previewing generated training data (10 samples)..."
echo "-----------------------------------------------------"
PREVIEW=$(curl -s "${BASE_URL}/api/nlu/training/preview?limit=10")
echo "$PREVIEW" | jq '.data.samples[] | {text, intent, language}' 2>/dev/null || echo "$PREVIEW"
echo ""

echo "3. Intent breakdown preview..."
echo "------------------------------"
echo "$PREVIEW" | jq '.data.intentBreakdown' 2>/dev/null
echo ""

# 3. Validate that intents are correct
echo "4. Validating intent distribution..."
echo "------------------------------------"
INTENTS=$(echo "$PREVIEW" | jq -r '.data.intentBreakdown | keys[]' 2>/dev/null)
VALID_INTENTS="order_food track_order greeting chitchat parcel_booking manage_address cancel_order help service_inquiry use_my_details add_to_cart checkout thanks complaint search_product login"

for intent in $INTENTS; do
    if echo "$VALID_INTENTS" | grep -qw "$intent"; then
        echo "✅ $intent - Valid intent"
    else
        echo "❌ $intent - UNKNOWN INTENT! This may cause training issues!"
    fi
done
echo ""

echo "5. Recommendations before full generation:"
echo "------------------------------------------"
echo "   ✓ Review the sample texts above for quality"
echo "   ✓ Check if food item names look real (not test data)"
echo "   ✓ Verify intents match the text meaning"
echo "   ✓ If samples look wrong, DO NOT run full generation"
echo ""

echo "6. To generate full dataset:"
echo "----------------------------"
echo "   curl -X POST ${BASE_URL}/api/nlu/training/generate"
echo ""
echo "=================================================================================="
