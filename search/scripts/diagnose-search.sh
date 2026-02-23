#!/bin/bash
# Search System Diagnostic
# Quick health check of all search components

echo "🔍 MANGWALE SEARCH SYSTEM DIAGNOSTIC"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. OpenSearch Status
echo "1️⃣  OpenSearch Status:"
if curl -s http://localhost:9200/_cluster/health > /dev/null 2>&1; then
    health=$(curl -s http://localhost:9200/_cluster/health | jq -r '.status' 2>/dev/null || echo "unknown")
    echo -e "   ${GREEN}✅ Running${NC} (Health: $health)"
    
    # Check indices
    indices_count=$(curl -s 'http://localhost:9200/_cat/indices?format=json' 2>/dev/null | jq '. | length' 2>/dev/null || echo "0")
    echo "   📊 Total Indices: $indices_count"
    
    # Check for food/ecom indices
    food_exists=$(curl -s 'http://localhost:9200/_cat/indices?format=json' 2>/dev/null | jq -r '.[] | select(.index | contains("food")) | .index' 2>/dev/null)
    ecom_exists=$(curl -s 'http://localhost:9200/_cat/indices?format=json' 2>/dev/null | jq -r '.[] | select(.index | contains("ecom")) | .index' 2>/dev/null)
    
    if [ -n "$food_exists" ]; then
        echo -e "   ${GREEN}✅ Food indices found:${NC} $food_exists"
        food_count=$(curl -s "http://localhost:9200/${food_exists}/_count" 2>/dev/null | jq -r '.count' 2>/dev/null || echo "0")
        echo "      Documents: $food_count"
    else
        echo -e "   ${RED}❌ No food indices found${NC}"
    fi
    
    if [ -n "$ecom_exists" ]; then
        echo -e "   ${GREEN}✅ Ecom indices found:${NC} $ecom_exists"
        ecom_count=$(curl -s "http://localhost:9200/${ecom_exists}/_count" 2>/dev/null | jq -r '.count' 2>/dev/null || echo "0")
        echo "      Documents: $ecom_count"
    else
        echo -e "   ${RED}❌ No ecom indices found${NC}"
    fi
else
    echo -e "   ${RED}❌ Not responding${NC}"
fi
echo ""

# 2. Embedding Service
echo "2️⃣  Embedding Service (Port 3101):"
if curl -s http://localhost:3101/health > /dev/null 2>&1; then
    status=$(curl -s http://localhost:3101/health | jq -r '.status' 2>/dev/null || echo "unknown")
    if [ "$status" == "healthy" ]; then
        echo -e "   ${GREEN}✅ Healthy${NC}"
    else
        echo -e "   ${YELLOW}⚠️  Running but status: $status${NC}"
    fi
else
    echo -e "   ${RED}❌ Not responding${NC}"
fi
echo ""

# 3. Search API Gateway
echo "3️⃣  Search API Gateway (Port 3100):"
if pm2 list 2>/dev/null | grep -q "mangwale-gateway"; then
    status=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="mangwale-gateway") | .pm2_env.status' 2>/dev/null || echo "unknown")
    if [ "$status" == "online" ]; then
        echo -e "   ${GREEN}✅ Online${NC} (PM2)"
    else
        echo -e "   ${YELLOW}⚠️  PM2 Status: $status${NC}"
    fi
    
    # Test search endpoint
    if curl -s "http://localhost:3100/search/food?q=test" > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ API responding${NC}"
    else
        error=$(curl -s "http://localhost:3100/search/food?q=test" 2>&1 | head -1)
        echo -e "   ${RED}❌ API error: $error${NC}"
    fi
else
    echo -e "   ${RED}❌ Gateway not found in PM2${NC}"
fi
echo ""

# 4. MySQL Database
echo "4️⃣  MySQL Database (Port 23306):"
if docker ps | grep -q mangwale_mysql; then
    echo -e "   ${GREEN}✅ Container running${NC}"
    
    # Try to list databases (will fail if no password)
    echo "   🔑 Checking access..."
    if docker exec mangwale_mysql mysql -u root -psecret -e "SHOW DATABASES;" > /dev/null 2>&1; then
        db_count=$(docker exec mangwale_mysql mysql -u root -psecret -e "SHOW DATABASES;" 2>/dev/null | wc -l)
        echo -e "   ${GREEN}✅ Access OK${NC} ($db_count databases)"
    else
        echo -e "   ${YELLOW}⚠️  Need correct credentials${NC}"
    fi
else
    echo -e "   ${RED}❌ Container not running${NC}"
fi
echo ""

# 5. Redis
echo "5️⃣  Redis (Port 6379):"
if docker ps | grep -q redis; then
    if redis-cli -h localhost -p 6379 ping > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Running and responding${NC}"
    else
        echo -e "   ${YELLOW}⚠️  Running but not responding${NC}"
    fi
else
    echo -e "   ${RED}❌ Container not running${NC}"
fi
echo ""

# 6. ClickHouse
echo "6️⃣  ClickHouse (Port 8123):"
if docker ps | grep -q clickhouse; then
    if curl -s http://localhost:8123/ping > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Running and responding${NC}"
    else
        echo -e "   ${YELLOW}⚠️  Running but not responding${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️  Container not running${NC}"
fi
echo ""

# 7. Check for SQL dumps
echo "7️⃣  Data Sources:"
if [ -f "/home/ubuntu/Devs/Search/admin_prod (61) (1).sql" ]; then
    size=$(du -h "/home/ubuntu/Devs/Search/admin_prod (61) (1).sql" | cut -f1)
    echo -e "   ${GREEN}✅ SQL dump found:${NC} $size"
else
    echo -e "   ${YELLOW}⚠️  No SQL dump found${NC}"
fi

if [ -f "/home/ubuntu/Devs/Search/sync-mysql-complete.py" ]; then
    echo -e "   ${GREEN}✅ MySQL sync script exists${NC}"
else
    echo -e "   ${YELLOW}⚠️  MySQL sync script missing${NC}"
fi

if [ -f "/home/ubuntu/Devs/Search/generate-embeddings.py" ]; then
    echo -e "   ${GREEN}✅ Embedding generator exists${NC}"
else
    echo -e "   ${YELLOW}⚠️  Embedding generator missing${NC}"
fi
echo ""

# Summary
echo "===================================="
echo "📊 SUMMARY & RECOMMENDATIONS:"
echo ""

# Check critical issues
if [ -z "$food_exists" ] && [ -z "$ecom_exists" ]; then
    echo -e "${RED}🚨 CRITICAL: No search indices exist!${NC}"
    echo "   Action: Run recovery process to restore data"
    echo "   See: SEARCH_SYSTEM_RECOVERY_PLAN.md"
    echo ""
fi

# Check if we can recover
if docker exec mangwale_mysql mysql -u root -psecret -e "SHOW DATABASES;" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ RECOVERY POSSIBLE:${NC}"
    echo "   1. MySQL is accessible"
    echo "   2. Can sync data to OpenSearch"
    echo "   3. Run: cd /home/ubuntu/Devs/Search && python3 sync-mysql-complete.py"
    echo ""
elif [ -f "/home/ubuntu/Devs/Search/admin_prod (61) (1).sql" ]; then
    echo -e "${YELLOW}⚠️  RECOVERY POSSIBLE (SQL DUMP):${NC}"
    echo "   1. Import SQL dump to MySQL"
    echo "   2. Then sync to OpenSearch"
    echo "   See: SEARCH_SYSTEM_RECOVERY_PLAN.md"
    echo ""
else
    echo -e "${RED}⚠️  RECOVERY UNCERTAIN:${NC}"
    echo "   Need to find MySQL credentials or data source"
    echo "   Check: SEARCH_SYSTEM_RECOVERY_PLAN.md"
    echo ""
fi

echo "===================================="
echo "For detailed recovery steps, see:"
echo "   📄 /home/ubuntu/Devs/Search/SEARCH_SYSTEM_RECOVERY_PLAN.md"
echo ""
