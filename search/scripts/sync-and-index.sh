#!/bin/bash

###############################################################################
# Mangwale Search - Database Sync and Indexing Script
# Syncs MySQL data to OpenSearch with proper indexing
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

###############################################################################
# Pre-flight Checks
###############################################################################

check_services() {
    print_header "Checking Services"
    
    # Check OpenSearch (using port 9201 which is mapped from container)
    OPENSEARCH_URL="${OPENSEARCH_URL:-http://localhost:9201}"
    if ! curl -s "${OPENSEARCH_URL}/_cluster/health" > /dev/null; then
        print_error "OpenSearch is not accessible at ${OPENSEARCH_URL}"
        print_info "Trying alternative port 9200..."
        if curl -s http://localhost:9200/_cluster/health > /dev/null; then
            OPENSEARCH_URL="http://localhost:9200"
            print_success "OpenSearch found on port 9200"
        else
            print_error "OpenSearch is not accessible on ports 9200 or 9201"
            exit 1
        fi
    else
        print_success "OpenSearch is accessible at ${OPENSEARCH_URL}"
    fi
    export OPENSEARCH_URL
    
    # Check Search API
    if ! curl -s http://localhost:3100/health > /dev/null; then
        print_warning "Search API is not accessible, but continuing..."
    else
        print_success "Search API is accessible"
    fi
    
    # Check MySQL connection (via docker exec)
    if docker exec mysql mysqladmin ping -h localhost -uroot -psecret 2>/dev/null | grep -q "alive"; then
        print_success "MySQL is accessible"
    else
        print_warning "MySQL container may not be accessible, but will try external connection"
    fi
}

###############################################################################
# Setup Indices
###############################################################################

setup_indices() {
    print_header "Setting Up OpenSearch Indices"
    
    print_info "Setting up Food module indices..."
    if docker exec search-api node /app/scripts/opensearch-setup-food.js; then
        print_success "Food indices setup complete"
    else
        print_error "Food indices setup failed"
        exit 1
    fi
    
    print_info "Setting up E-commerce module indices..."
    if docker exec search-api node /app/scripts/opensearch-setup-ecom.js; then
        print_success "E-commerce indices setup complete"
    else
        print_error "E-commerce indices setup failed"
        exit 1
    fi
    
    print_info "Current indices:"
    curl -s "${OPENSEARCH_URL:-http://localhost:9201}/_cat/indices?v" | grep -E "food_|ecom_|health|status"
}

###############################################################################
# Index Data
###############################################################################

index_food_data() {
    print_header "Indexing Food Module Data"
    
    print_info "Indexing Food items..."
    docker exec search-api node /app/scripts/mysql-to-opensearch.js \
        --sql "SELECT id,name,description,image,images,slug,category_id,category_ids,price,tax,discount,veg,status,store_id,module_id,order_count,avg_rating,rating_count,rating,stock,available_time_starts,available_time_ends,created_at,updated_at FROM items WHERE status=1 AND module_id=4" \
        --id id \
        --index-alias food_items \
        --batch 1000
    
    if [ $? -eq 0 ]; then
        print_success "Food items indexed"
    else
        print_error "Food items indexing failed"
        return 1
    fi
    
    print_info "Indexing Food stores..."
    docker exec search-api node /app/scripts/mysql-to-opensearch.js \
        --sql "SELECT id,name,slug,phone,email,logo,cover_photo,latitude,longitude,address,status,active,veg,non_veg,delivery,take_away,delivery_time,zone_id,module_id,order_count,total_order,featured,rating,created_at,updated_at FROM stores WHERE status=1 AND module_id=4" \
        --id id \
        --index-alias food_stores \
        --batch 1000
    
    if [ $? -eq 0 ]; then
        print_success "Food stores indexed"
    else
        print_error "Food stores indexing failed"
        return 1
    fi
    
    print_info "Indexing Food categories..."
    docker exec search-api node /app/scripts/mysql-to-opensearch.js \
        --sql "SELECT id,name,slug,image,parent_id,position,status,featured,module_id,created_at,updated_at FROM categories WHERE status=1 AND module_id=4" \
        --id id \
        --index-alias food_categories \
        --batch 1000
    
    if [ $? -eq 0 ]; then
        print_success "Food categories indexed"
    else
        print_error "Food categories indexing failed"
        return 1
    fi
}

index_ecom_data() {
    print_header "Indexing E-commerce Module Data"
    
    print_info "Indexing E-commerce items..."
    docker exec search-api node /app/scripts/mysql-to-opensearch.js \
        --sql "SELECT id,name,description,image,images,slug,category_id,category_ids,attributes,price,tax,discount,status,stock,store_id,module_id,order_count,avg_rating,rating_count,rating,created_at,updated_at FROM items WHERE module_id=5 AND status=1" \
        --id id \
        --index-alias ecom_items \
        --batch 1000
    
    if [ $? -eq 0 ]; then
        print_success "E-commerce items indexed"
    else
        print_error "E-commerce items indexing failed"
        return 1
    fi
    
    print_info "Indexing E-commerce stores..."
    docker exec search-api node /app/scripts/mysql-to-opensearch.js \
        --sql "SELECT id,name,slug,phone,email,logo,cover_photo,latitude,longitude,address,status,active,veg,non_veg,delivery_time,zone_id,module_id,order_count,total_order,featured,rating,created_at,updated_at FROM stores WHERE module_id=5 AND status=1" \
        --id id \
        --index-alias ecom_stores \
        --batch 1000
    
    if [ $? -eq 0 ]; then
        print_success "E-commerce stores indexed"
    else
        print_error "E-commerce stores indexing failed"
        return 1
    fi
    
    print_info "Indexing E-commerce categories..."
    docker exec search-api node /app/scripts/mysql-to-opensearch.js \
        --sql "SELECT id,name,slug,image,parent_id,position,status,featured,module_id,created_at,updated_at FROM categories WHERE module_id=5 AND status=1" \
        --id id \
        --index-alias ecom_categories \
        --batch 1000
    
    if [ $? -eq 0 ]; then
        print_success "E-commerce categories indexed"
    else
        print_error "E-commerce categories indexing failed"
        return 1
    fi
}

###############################################################################
# Verify Indexing
###############################################################################

verify_indexing() {
    print_header "Verifying Indexed Data"
    
    print_info "Current index statistics:"
    echo ""
    curl -s "${OPENSEARCH_URL:-http://localhost:9201}/_cat/indices?v" | grep -E "food_|ecom_" | awk '{printf "  %-20s %8s documents\n", $3, $7}'
    
    echo ""
    print_info "Sample queries to verify:"
    echo "  Food items: curl 'http://localhost:3100/search?q=pizza&module=food'"
    echo "  E-com items: curl 'http://localhost:3100/search?q=shirt&module=ecom'"
}

###############################################################################
# Main Execution
###############################################################################

main() {
    print_header "Mangwale Search - Database Sync and Indexing"
    print_warning "IMPORTANT: This script ONLY READS from MySQL (production database)"
    print_warning "No changes will be made to MySQL. All writes are to OpenSearch only."
    echo ""
    
    check_services
    setup_indices
    index_food_data
    index_ecom_data
    verify_indexing
    
    print_header "Sync and Indexing Complete!"
    print_success "All data has been synced from MySQL to OpenSearch"
    print_success "MySQL database was NOT modified (read-only access)"
    print_info "You can now test search queries using the Search API"
}

# Run main function
main

