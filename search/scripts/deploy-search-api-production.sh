#!/bin/bash

# Deploy search-api with proper Traefik configuration from docker-compose.yml
echo "Stopping existing search-api containers..."
docker stop search-api 2>/dev/null
docker rm search-api 2>/dev/null
docker stop search-api-hybrid 2>/dev/null  
docker rm search-api-hybrid 2>/dev/null

echo "Deploying search-api with Traefik routing..."
docker run -d \
  --name search-api \
  --network search_search-network \
  -p 127.0.0.1:4000:3100 \
  -e NODE_ENV=production \
  -e PORT=3100 \
  -e API_BASE_URL=https://opensearch.mangwale.ai \
  -e DATABASE_HOST=103.86.176.59 \
  -e DATABASE_PORT=3306 \
  -e DATABASE_USER=root \
  -e DATABASE_PASSWORD=root_password \
  -e DATABASE_NAME=mangwale_db \
  -e OPENSEARCH_HOST=http://172.25.0.14:9200 \
  -e EMBEDDING_SERVICE_URL=http://172.25.0.8:3101 \
  -e REDIS_URL=redis://172.25.0.4:6379/2 \
  --restart unless-stopped \
  --label "traefik.enable=true" \
  --label "traefik.docker.network=search_search-network" \
  --label "traefik.http.routers.opensearch-api.rule=Host(\`opensearch.mangwale.ai\`) && (PathPrefix(\`/search\`) || PathPrefix(\`/analytics\`) || PathPrefix(\`/health\`) || PathPrefix(\`/docs\`) || PathPrefix(\`/api-docs\`) || PathPrefix(\`/v2\`) || PathPrefix(\`/v3\`) || PathPrefix(\`/sync\`))" \
  --label "traefik.http.routers.opensearch-api.entrypoints=websecure" \
  --label "traefik.http.routers.opensearch-api.tls.certresolver=letsencrypt" \
  --label "traefik.http.routers.opensearch-api.priority=10" \
  --label "traefik.http.services.opensearch-api.loadbalancer.server.port=3100" \
  --health-cmd "wget --no-verbose --tries=1 --spider http://localhost:3100/health || exit 1" \
  --health-interval 30s \
  --health-timeout 10s \
  --health-retries 5 \
  search_search-api:hybrid

if [ $? -eq 0 ]; then
  echo "✅ search-api deployed successfully"
  echo ""
  echo "Waiting for API to start..."
  sleep 10
  
  echo "Container status:"
  docker ps | grep search-api
  echo ""
  
  echo "API logs:"
  docker logs search-api 2>&1 | tail -5
  echo ""
  
  echo "Testing endpoints:"
  echo "  Local: http://localhost:3100/health"
  curl -s http://localhost:3100/health | jq '.' 2>/dev/null || echo "Local health check failed"
  
  echo ""
  echo "  Production (via Traefik): https://opensearch.mangwale.ai/health"
  sleep 3
  curl -s https://opensearch.mangwale.ai/health | jq '.' 2>/dev/null || echo "Traefik routing check failed"
  
  echo ""
  echo "  Production API search: https://opensearch.mangwale.ai/v2/search/items?q=pizza&module_id=4&size=3"
  curl -s "https://opensearch.mangwale.ai/v2/search/items?q=pizza&module_id=4&size=3" | jq '{module, total: .meta.total, items: (.items | length)}' 2>/dev/null || echo "API search failed"
else
  echo "❌ Failed to deploy search-api"
  exit 1
fi
