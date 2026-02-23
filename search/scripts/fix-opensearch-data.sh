#!/bin/bash

###############################################################################
# Master Fix Script - OpenSearch Data Enrichment
# Fixes:
#   1. Image URLs (adds CDN and S3 full URLs)
#   2. Geo-points (copies store_location to location)
###############################################################################

set -e

echo "========================================="
echo " 🔧 OpenSearch Data Enrichment"
echo "========================================="
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# Check if dependencies are installed
echo "📦 Checking dependencies..."
npm list @opensearch-project/opensearch &> /dev/null || npm install @opensearch-project/opensearch

echo ""
echo "========================================="
echo " Step 1: Fix Geo-Points"
echo "========================================="
echo ""

node scripts/fix-geopoints.js

if [ $? -ne 0 ]; then
    echo "❌ Geo-point fix failed. Exiting."
    exit 1
fi

echo ""
echo "========================================="
echo " Step 2: Enrich Image URLs"
echo "========================================="
echo ""

node scripts/enrich-images.js

if [ $? -ne 0 ]; then
    echo "❌ Image enrichment failed. Exiting."
    exit 1
fi

echo ""
echo "========================================="
echo " ✅ All Fixes Complete!"
echo "========================================="
echo ""
echo "📊 Verification:"
echo "  Run: curl \"http://localhost:9200/food_items_v4/_search?size=1&pretty\""
echo ""
echo "📝 You should now see:"
echo "  • location: { lat: X, lon: Y } (not null)"
echo "  • image_full_url: https://storage.mangwale.ai/..."
echo "  • image_url_cdn: https://storage.mangwale.ai/..."
echo ""
echo "🎉 Your OpenSearch data is now fully enriched!"
echo ""
