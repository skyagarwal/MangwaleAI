#!/usr/bin/env bash
set -euo pipefail

API=${API:-http://localhost:3100}

curl -s "$API/health" | jq -r '.ok, .opensearch' >/dev/null

echo "Search ecom items..."
curl -s "$API/search/ecom?q=milk&page=1&size=5" | jq -r '.meta.total'

echo "Nearby ecom stores..."
curl -s "$API/search/ecom/stores?lat=19.98&lon=73.78&radius_km=5&page=1&size=5" | jq -r '.meta.total'

echo "Suggest ecom..."
curl -s "$API/search/ecom/suggest?q=mi&lat=19.98&lon=73.78" | jq -r '.items | length'

echo "Trending analytics..."
curl -s "$API/analytics/trending?window=7d&module=ecom" | jq -r '.rows | length'

echo "DONE"
