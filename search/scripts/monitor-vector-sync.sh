#!/usr/bin/env bash
# Monitor vector generation progress in real-time
set -euo pipefail

LOGDIR="/home/ubuntu/Devs/Search/tmp"
LATEST_LOG=$(ls -t "$LOGDIR"/vector_sync_*.log 2>/dev/null | head -1)

if [ -z "$LATEST_LOG" ]; then
  echo "No vector sync log found. Is the sync running?"
  exit 1
fi

echo "Monitoring: $LATEST_LOG"
echo "Press Ctrl+C to stop monitoring (sync will continue in background)"
echo ""

# Follow the log and extract progress
tail -f "$LATEST_LOG" | while read line; do
  # Show important progress lines
  if echo "$line" | grep -E "(Indexed|Processing|✅|❌|embeddings|vectors|items|Complete)" then
    echo "$line"
  fi
done
