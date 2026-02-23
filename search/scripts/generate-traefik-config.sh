#!/bin/bash

# Generate Traefik dynamic configuration based on environment variables
# Usage: ./scripts/generate-traefik-config.sh [DOMAIN]

DOMAIN=${1:-${DOMAIN:-search.test.mangwale.ai}}

echo "Generating Traefik configuration for domain: $DOMAIN"

cat > traefik-config/dynamic/search-mangwale.yml <<EOF
http:
  routers:
    # HTTP to HTTPS Redirect
    search-redirect:
      rule: "Host(\`$DOMAIN\`)"
      entryPoints:
        - web
      service: noop@internal
      middlewares:
        - https-redirect

    # API Router (HTTPS)
    search-api:
      rule: "Host(\`$DOMAIN\`) && (PathPrefix(\`/search\`) || PathPrefix(\`/analytics\`) || PathPrefix(\`/health\`) || PathPrefix(\`/docs\`) || PathPrefix(\`/api-docs\`) || PathPrefix(\`/v2\`))"
      service: search-api-service
      entryPoints:
        - websecure
      priority: 10
      tls:
        certResolver: letsencrypt

    # Fix for Legacy Suggest Endpoint
    search-suggest-fix:
      rule: "Host(\`$DOMAIN\`) && PathPrefix(\`/search/suggest\`)"
      service: search-api-service
      entryPoints:
        - websecure
      priority: 20
      middlewares:
        - suggest-rewrite
      tls:
        certResolver: letsencrypt

    # Frontend Router (HTTPS)
    search-frontend:
      rule: "Host(\`$DOMAIN\`)"
      service: search-frontend-service
      entryPoints:
        - websecure
      priority: 1
      tls:
        certResolver: letsencrypt

  middlewares:
    https-redirect:
      redirectScheme:
        scheme: https
        permanent: true
    
    suggest-rewrite:
      replacePathRegex:
        regex: "^/search/suggest(.*)"
        replacement: "/v2/search/suggest$1"

  services:
    search-api-service:
      loadBalancer:
        servers:
          - url: "http://search-api:3100"

    search-frontend-service:
      loadBalancer:
        servers:
          - url: "http://search-frontend:80"
EOF

echo "Configuration generated at traefik-config/dynamic/search-mangwale.yml"
