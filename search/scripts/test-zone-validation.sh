#!/bin/bash

# Test Zone Validation

API_URL="http://localhost:3100"
LAT_INSIDE="19.95"
LON_INSIDE="73.75"
LAT_OUTSIDE="0"
LON_OUTSIDE="0"

echo "Testing Zone Validation..."

# 1. Test with coordinates inside the zone
echo "1. Testing with coordinates INSIDE zone ($LAT_INSIDE, $LON_INSIDE)..."
curl -s "$API_URL/search?q=test&lat=$LAT_INSIDE&lon=$LON_INSIDE" > /dev/null
echo "Request sent."

# 2. Test with coordinates OUTSIDE the zone
echo "2. Testing with coordinates OUTSIDE zone ($LAT_OUTSIDE, $LON_OUTSIDE)..."
curl -s "$API_URL/search?q=test&lat=$LAT_OUTSIDE&lon=$LON_OUTSIDE" > /dev/null
echo "Request sent."

# 3. Check logs for confirmation
echo "Checking logs for zone validation..."
docker logs search-api --tail 20 | grep "Applied zone filter"
docker logs search-api --tail 20 | grep "Failed to get zone ID"

echo "Done."
