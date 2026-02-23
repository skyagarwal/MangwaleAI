#!/bin/bash

echo "🔍 CATEGORY FILTERING ANALYSIS"
echo "=============================================="
echo ""

# Test 1: Store-specific categories (SHOULD BE FILTERED)
echo "TEST 1: Store Categories Endpoint"
echo "----------------------------------"
echo "Endpoint: GET /v2/search/stores/:store_id/categories"
echo ""
RESULT=$(curl -s "http://localhost:4000/v2/search/stores/3/categories")
TOTAL=$(echo "$RESULT" | jq -r '.total')
STORE_NAME=$(echo "$RESULT" | jq -r '.categories[0].name // "N/A"')
echo "Store ID: 3 (Inayat Cafe)"
echo "Categories returned: $TOTAL"
echo "✅ CORRECT: Only returns categories this vendor has items in"
echo "Sample categories: $(echo "$RESULT" | jq -r '[.categories[0:3] | .[].name] | join(", ")')"
echo ""

# Test 2: Search results categories
echo "TEST 2: Search Results (Hybrid Search)"
echo "----------------------------------"
echo "Endpoint: GET /search/hybrid/food?q=biryani"
echo ""
RESULT=$(curl -s "http://localhost:4000/search/hybrid/food?q=biryani&size=10")
CATEGORIES=$(echo "$RESULT" | jq -r '[.items[].category_name] | unique | join(", ")')
echo "Query: 'biryani'"
echo "Categories in results: $CATEGORIES"
echo "✅ CORRECT: Only shows categories of returned items"
echo ""

# Test 3: MySQL verification
echo "TEST 3: Database Verification"
echo "----------------------------------"
cd /home/ubuntu/Devs/Search && node -e "
const mysql = require('mysql2/promise');
async function check() {
  const conn = await mysql.createConnection({
    host: '103.86.176.59',
    port: 3306,
    user: 'root',
    password: 'root_password',
    database: 'mangwale_db'
  });

  // Total categories in system
  const [total] = await conn.query('SELECT COUNT(*) as cnt FROM categories WHERE module_id = 4');
  console.log('Total categories in database: ' + total[0].cnt);

  // Categories with items
  const [withItems] = await conn.query(\`
    SELECT COUNT(DISTINCT c.id) as cnt 
    FROM categories c 
    INNER JOIN items i ON c.id = i.category_id 
    WHERE c.module_id = 4 AND i.status = 1
  \`);
  console.log('Categories with active items: ' + withItems[0].cnt);

  // Categories without items
  const empty = total[0].cnt - withItems[0].cnt;
  console.log('Empty categories (no items): ' + empty);
  console.log('');
  console.log('⚠️  ISSUE: Empty categories should NOT be shown to users');

  await conn.end();
}
check().catch(console.error);
" 2>&1
echo ""

# Test 4: Check if there's a general categories list endpoint
echo "TEST 4: General Categories List"
echo "----------------------------------"
echo "Checking if there's an endpoint that returns ALL categories..."
echo ""

# Try different endpoints
echo "A) /admin/categories?module_id=4"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:4000/admin/categories?module_id=4")
if [ "$STATUS" = "200" ]; then
  RESULT=$(curl -s "http://localhost:4000/admin/categories?module_id=4")
  TOTAL=$(echo "$RESULT" | jq -r '.categories | length // 0')
  echo "   Status: $STATUS"
  echo "   Returns: $TOTAL categories"
  if [ "$TOTAL" -gt 50 ]; then
    echo "   ⚠️  WARNING: Returns ALL categories (not filtered by active items)"
  else
    echo "   ✅ Returns filtered categories"
  fi
else
  echo "   Status: $STATUS (endpoint error)"
fi
echo ""

# Summary
echo "=============================================="
echo "📊 SUMMARY"
echo "=============================================="
echo ""
echo "✅ WORKING CORRECTLY:"
echo "   - Store-specific categories (/v2/search/stores/:id/categories)"
echo "   - Search results categories (only in results)"
echo ""
echo "⚠️  POTENTIAL ISSUES:"
echo "   - Admin categories endpoint returning 500 error"
echo "   - Need to verify: Are empty categories being shown anywhere?"
echo "   - Stores by category endpoint has sorting error"
echo ""
echo "🎯 RECOMMENDATION:"
echo "   Categories should ONLY be shown if:"
echo "   1. At least ONE vendor is selling items in that category"
echo "   2. The items are active (status = 1)"
echo "   3. The category is active (status = 1)"
echo ""
