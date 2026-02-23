#!/usr/bin/env bash
set -euo pipefail

# Create explicit-mapped indices and point aliases
node scripts/opensearch-setup-food.js

# Index Food items
node scripts/mysql-to-opensearch.js \
  --sql "SELECT id,name,description,image,images,slug,category_id,category_ids,price,tax,discount,veg,status,store_id,module_id,order_count,avg_rating,rating_count,rating,stock,available_time_starts,available_time_ends,created_at,updated_at FROM items WHERE status=1 AND module_id=4" \
  --id id \
  --index-alias food_items

# Index Food stores (include phone/email for Flutter app)
node scripts/mysql-to-opensearch.js \
  --sql "SELECT id,name,slug,phone,email,logo,cover_photo,latitude,longitude,address,status,active,veg,non_veg,delivery,take_away,delivery_time,zone_id,module_id,order_count,total_order,featured,rating,created_at,updated_at FROM stores WHERE status=1 AND module_id=4" \
  --id id \
  --index-alias food_stores

# Index Food categories
node scripts/mysql-to-opensearch.js \
  --sql "SELECT id,name,slug,image,parent_id,position,status,featured,module_id,created_at,updated_at FROM categories WHERE status=1 AND module_id=4" \
  --id id \
  --index-alias food_categories

echo "Food indexing complete."
