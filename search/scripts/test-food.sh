#!/usr/bin/env bash
set -euo pipefail

base=${BASE_URL:-http://localhost:3100}

say() { echo -e "\n==> $*"; }

say "Health"
curl -fsS "$base/health" | jq '{ok, opensearch}'

say "Basic search (kofta)"
curl -fsS "$base/search/food?q=kofta" | jq '{items:(.items|length), facets:.facets, total:.meta.total}'

say "Veg + price filter"
curl -fsS "$base/search/food?q=burger&veg=1&price_min=100&price_max=300" | jq '{items:(.items|length), veg: (.facets.veg // []), price: (.facets.price // [])}'

say "Pagination: size=10 page=2"
curl -fsS "$base/search/food?q=pizza&size=10&page=2" | jq '{items:(.items|length), meta:.meta}'

say "Geo-ranked items"
curl -fsS "$base/search/food?q=kofta&lat=19.9975&lon=73.7898&radius_km=10&size=5" | jq '{first:.items[0] | {id, name, distance_km, store_id}, total:.meta.total}'

say "Nearby stores (no PII)"
curl -fsS "$base/search/food/stores?lat=19.9975&lon=73.7898&radius_km=10&size=5" | jq '{first:.stores[0] | {id, name, distance_km, has_phone: has("phone"), has_email: has("email")}, total:.meta.total}'
