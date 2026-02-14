#!/bin/bash
# NLU Auto-Retrain Runner Script
# Runs inside Docker container for proper database access

set -e

LOG_FILE="/var/log/mangwale/nlu-retrain-$(date +%Y%m%d).log"
mkdir -p /var/log/mangwale

echo "=== NLU Auto-Retrain Started: $(date) ===" >> "$LOG_FILE" 2>&1

cd /home/ubuntu/Devs/MangwaleAI

# Run retrain script inside backend container
docker compose -f docker-compose.dev.yml exec -T backend npx ts-node scripts/nlu-auto-retrain.ts >> "$LOG_FILE" 2>&1

echo "=== NLU Auto-Retrain Completed: $(date) ===" >> "$LOG_FILE" 2>&1
