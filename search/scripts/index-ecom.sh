#!/usr/bin/env bash
set -euo pipefail
# Setup ecom indices and ingest from MySQL
DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$DIR/.." && pwd)

export NODE_NO_WARNINGS=1

node "$ROOT/scripts/opensearch-setup-ecom.js"

# Items (module_id=5) with enrichment
node "$ROOT/scripts/mysql-to-opensearch.js" \
  --sql "SELECT id,name,description,image,images,slug,category_id,category_ids,attributes,price,tax,discount,status,stock,store_id,module_id,order_count,avg_rating,rating_count,rating,created_at,updated_at FROM items WHERE module_id=5 AND status=1" \
  --id id --index-alias ecom_items

# Stores for module 5 (include phone/email for Flutter app)
node "$ROOT/scripts/mysql-to-opensearch.js" \
  --sql "SELECT id,name,slug,phone,email,logo,cover_photo,latitude,longitude,address,status,active,veg,non_veg,delivery_time,zone_id,module_id,order_count,total_order,featured,rating,created_at,updated_at FROM stores WHERE module_id=5 AND status=1" \
  --id id --index-alias ecom_stores

# Categories for module 5
node "$ROOT/scripts/mysql-to-opensearch.js" \
  --sql "SELECT id,name,slug,image,parent_id,position,status,featured,module_id,created_at,updated_at FROM categories WHERE module_id=5 AND status=1" \
  --id id --index-alias ecom_categories

echo "Ecom indices seeded."
