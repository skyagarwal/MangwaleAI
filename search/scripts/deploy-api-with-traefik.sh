#!/bin/bash

# Stop and remove existing container
docker stop search-api-hybrid 2>/dev/null
docker rm search-api-hybrid 2>/dev/null

# Deploy search-api with Traefik labels for API routing
docker run -d \
  --name search-api-hybrid \
  --network search_search-network \
  -p 4000:3100 \
  -e DATABASE_HOST=103.86.176.59 \
  -e DATABASE_PORT=3306 \
  -e DATABASE_USER=root \
  -e DATABASE_PASSWORD=root_password \
  -e DATABASE_NAME=mangwale_db \
  -e OPENSEARCH_HOST=http://172.25.0.14:9200 \
  -e EMBEDDING_SERVICE_URL=http://172.25.0.8:3101 \
  -e REDIS_URL=redis://172.25.0.4:6379/2 \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.search-api.rule=Host(\`opensearch.mangwale.ai\`) && PathPrefix(\`/v2\`, \`/search\`, \`/admin\`, \`/categories\`, \`/health\`, \`/api-docs\`)" \
  --label "traefik.http.routers.search-api.entrypoints=websecure" \
  --label "traefik.http.routers.search-api.tls.certresolver=myresolver" \
  --label "traefik.http.services.search-api.loadbalancer.server.port=3100" \
  --label "traefik.http.routers.search-api.priority=10" \
  search_search-api:hybrid

echo "✅ Deployed search-api-hybrid with Traefik routing"
echo "   Domain: opensearch.mangwale.ai"
echo "   API Paths: /v2/*, /search/*, /admin/*, /categories/*, /health, /api-docs"
echo "   Port: 4000 (local) / 3100 (internal)"
echo ""
echo "Waiting for health check..."
sleep 5

# Test the deployment
echo "Testing API health..."
docker logs search-api-hybrid 2>&1 | tail -5
