#!/bin/bash
# ============================================
# NLU Training Script for Mangwale AI
# ============================================
# This script automates the complete NLU training pipeline:
# 1. Clean training data
# 2. Validate training data
# 3. Copy to Jupiter training server
# 4. Trigger retraining
# 5. Deploy to Mercury (GPU) and Jupiter (CPU)
#
# Usage: ./train_nlu.sh [--skip-clean] [--dry-run]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAINING_DATA_FILE="nlu_training_data_cleaned.jsonl"
ORIGINAL_DATA_FILE="nlu_training_data.jsonl"

# Server IPs
MERCURY_IP="192.168.0.151"
JUPITER_IP="localhost"  # or the actual IP

# Training server settings
TRAINING_SERVER_PORT=8082
NLU_PORT=7010

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
SKIP_CLEAN=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-clean)
            SKIP_CLEAN=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}       NLU Training Pipeline${NC}"
echo -e "${BLUE}============================================${NC}"

# Step 1: Clean training data
if [ "$SKIP_CLEAN" = false ]; then
    echo -e "\n${YELLOW}📋 Step 1: Cleaning training data...${NC}"
    cd "$SCRIPT_DIR"
    
    if [ "$DRY_RUN" = true ]; then
        echo "  [DRY RUN] Would run: python3 clean_training_data.py"
    else
        python3 clean_training_data.py
    fi
else
    echo -e "\n${YELLOW}📋 Step 1: Skipping cleaning (--skip-clean)${NC}"
fi

# Step 2: Validate training data
echo -e "\n${YELLOW}✅ Step 2: Validating training data...${NC}"

if [ ! -f "$SCRIPT_DIR/$TRAINING_DATA_FILE" ]; then
    echo -e "${RED}Error: $TRAINING_DATA_FILE not found!${NC}"
    exit 1
fi

SAMPLE_COUNT=$(wc -l < "$SCRIPT_DIR/$TRAINING_DATA_FILE")
INTENT_COUNT=$(jq -r '.intent' "$SCRIPT_DIR/$TRAINING_DATA_FILE" 2>/dev/null | sort | uniq | wc -l)

echo "  Total samples: $SAMPLE_COUNT"
echo "  Unique intents: $INTENT_COUNT"

if [ "$SAMPLE_COUNT" -lt 100 ]; then
    echo -e "${RED}Warning: Too few samples ($SAMPLE_COUNT). Recommended minimum: 100${NC}"
fi

# Step 3: Check training server health
echo -e "\n${YELLOW}🔍 Step 3: Checking training server...${NC}"

check_server() {
    local host=$1
    local port=$2
    local name=$3
    
    if [ "$DRY_RUN" = true ]; then
        echo "  [DRY RUN] Would check $name at $host:$port"
        return 0
    fi
    
    if curl -s --connect-timeout 3 "http://$host:$port/health" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $name ($host:$port) is reachable"
        return 0
    else
        echo -e "  ${RED}✗${NC} $name ($host:$port) is not reachable"
        return 1
    fi
}

# Check Mercury NLU
check_server "$MERCURY_IP" "$NLU_PORT" "Mercury NLU" || true

# Check Jupiter Training Server
check_server "$JUPITER_IP" "$TRAINING_SERVER_PORT" "Jupiter Training Server" || {
    echo -e "${YELLOW}Note: Training server not available. Make sure it's running.${NC}"
}

# Step 4: Upload training data
echo -e "\n${YELLOW}📤 Step 4: Uploading training data...${NC}"

if [ "$DRY_RUN" = true ]; then
    echo "  [DRY RUN] Would upload $TRAINING_DATA_FILE to training server"
else
    # Read the file and upload via API
    UPLOAD_RESPONSE=$(curl -s -X POST \
        "http://$JUPITER_IP:$TRAINING_SERVER_PORT/training/upload" \
        -H "Content-Type: application/json" \
        -d @"$SCRIPT_DIR/$TRAINING_DATA_FILE" 2>/dev/null || echo '{"error":"connection_failed"}')
    
    if echo "$UPLOAD_RESPONSE" | grep -q "error"; then
        echo -e "${YELLOW}Note: Direct upload failed. You may need to manually copy the file.${NC}"
        echo "  Source: $SCRIPT_DIR/$TRAINING_DATA_FILE"
        echo "  Destination: training server data directory"
    else
        echo -e "${GREEN}✓ Training data uploaded successfully${NC}"
    fi
fi

# Step 5: Trigger training
echo -e "\n${YELLOW}🚀 Step 5: Triggering training...${NC}"

if [ "$DRY_RUN" = true ]; then
    echo "  [DRY RUN] Would trigger training at http://$JUPITER_IP:$TRAINING_SERVER_PORT/training/start"
else
    TRAIN_RESPONSE=$(curl -s -X POST \
        "http://$JUPITER_IP:$TRAINING_SERVER_PORT/training/start" \
        -H "Content-Type: application/json" \
        -d '{"data_file": "nlu_training_data_cleaned.jsonl", "epochs": 10}' 2>/dev/null || echo '{"error":"connection_failed"}')
    
    if echo "$TRAIN_RESPONSE" | grep -q "error"; then
        echo -e "${YELLOW}Note: Could not trigger training automatically.${NC}"
        echo "  Please run training manually on Jupiter server."
    else
        echo -e "${GREEN}✓ Training started${NC}"
        echo "  Response: $TRAIN_RESPONSE"
    fi
fi

# Step 6: Show summary
echo -e "\n${BLUE}============================================${NC}"
echo -e "${BLUE}              Summary${NC}"
echo -e "${BLUE}============================================${NC}"
echo "  Training data: $TRAINING_DATA_FILE"
echo "  Samples: $SAMPLE_COUNT"
echo "  Intents: $INTENT_COUNT"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "  1. Monitor training progress on Jupiter"
echo "  2. Once complete, deploy model to Mercury"
echo "  3. Test new model with: curl http://$MERCURY_IP:$NLU_PORT/classify -d '{\"text\":\"test\"}'"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}This was a dry run. No changes were made.${NC}"
fi

echo -e "${GREEN}Done!${NC}"
