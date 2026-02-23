#!/usr/bin/env python3
"""
Comprehensive Image Sync Utility for Mangwale AI Search
This script ensures all images from MySQL are properly synced and accessible via Minio/S3.

Features:
1. Extracts all image paths from MySQL (items, stores, categories, etc.)
2. Validates image existence on Minio/S3
3. Creates proper image URL transformations
4. Generates fallback URLs for redundancy
5. Updates OpenSearch with correct image URLs

Usage:
    python3 image-sync-utility.py --check     # Check image status
    python3 image-sync-utility.py --sync      # Sync images
    python3 image-sync-utility.py --validate  # Validate after sync
"""

import mysql.connector
import requests
import json
import os
import sys
import argparse
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote
from collections import defaultdict

# ============================================
# CONFIGURATION
# ============================================

# MySQL Configuration
MYSQL_CONFIG = {
    'host': os.getenv("MYSQL_HOST", "localhost"),
    'port': int(os.getenv("MYSQL_PORT", "3307")),
    'user': os.getenv("MYSQL_USER", "root"),
    'password': os.getenv("MYSQL_PASSWORD", "secret"),
    'database': os.getenv("MYSQL_DATABASE", "mangwale")
}

# Storage Configuration
MINIO_URL = os.getenv("MINIO_URL", "https://storage.mangwale.ai")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "mangwale")
S3_URL = os.getenv("S3_URL", "https://mangwale.s3.ap-south-1.amazonaws.com")
S3_BUCKET = os.getenv("S3_BUCKET", "mangwale")

# OpenSearch Configuration
OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "http://localhost:9200")

# Image path prefixes in storage
IMAGE_PREFIXES = {
    'item': 'product',
    'store_logo': 'store',
    'store_cover': 'store',
    'category': 'category',
    'banner': 'banner',
    'meta': 'meta'
}


# ============================================
# IMAGE URL BUILDER
# ============================================

class ImageURLBuilder:
    """Build proper image URLs for Minio and S3 with fallbacks"""
    
    def __init__(self):
        self.minio_url = MINIO_URL.rstrip('/')
        self.minio_bucket = MINIO_BUCKET
        self.s3_url = S3_URL.rstrip('/')
        self.s3_bucket = S3_BUCKET
        
    def build_urls(self, image_filename: str, image_type: str = 'item') -> Dict[str, str]:
        """
        Build primary and fallback URLs for an image
        
        Args:
            image_filename: The image filename from MySQL (e.g., "2024-08-14-66bc575e57157.png")
            image_type: Type of image (item, store_logo, store_cover, category, etc.)
            
        Returns:
            Dictionary with 'primary', 'fallback', and 'cdn' URLs
        """
        if not image_filename or image_filename == '[]' or image_filename == 'null':
            return {
                'primary': '',
                'fallback': '',
                'cdn': '',
                'original': ''
            }
        
        # Clean filename
        filename = str(image_filename).strip()
        
        # Get the storage prefix for this image type
        prefix = IMAGE_PREFIXES.get(image_type, 'product')
        
        # Build URLs
        urls = {
            'original': filename,
            'primary': f"{self.minio_url}/{self.minio_bucket}/{prefix}/{filename}",
            'fallback': f"{self.s3_url}/{prefix}/{filename}",
            'cdn': f"https://cdn.mangwale.ai/{prefix}/{filename}"
        }
        
        return urls
    
    def build_store_logo_urls(self, logo: str) -> Dict[str, str]:
        """Build URLs specifically for store logos"""
        return self.build_urls(logo, 'store_logo')
    
    def build_store_cover_urls(self, cover: str) -> Dict[str, str]:
        """Build URLs specifically for store cover photos"""
        return self.build_urls(cover, 'store_cover')
    
    def build_item_image_urls(self, image: str) -> Dict[str, str]:
        """Build URLs specifically for item images"""
        return self.build_urls(image, 'item')
    
    def parse_images_array(self, images_json: str) -> List[Dict[str, str]]:
        """
        Parse the images JSON array field and build URLs for each image
        
        Args:
            images_json: JSON array string like '["image1.png", "image2.png"]'
            
        Returns:
            List of URL dictionaries for each image
        """
        if not images_json or images_json == '[]' or images_json == 'null':
            return []
        
        try:
            images_list = json.loads(images_json) if isinstance(images_json, str) else images_json
            if not isinstance(images_list, list):
                return []
            
            return [self.build_item_image_urls(img) for img in images_list if img]
        except:
            return []


# ============================================
# IMAGE EXTRACTOR
# ============================================

class ImageExtractor:
    """Extract all image references from MySQL database"""
    
    def __init__(self):
        self.conn = None
        self.url_builder = ImageURLBuilder()
        
    def connect(self):
        """Establish MySQL connection"""
        self.conn = mysql.connector.connect(**MYSQL_CONFIG)
        return self.conn
    
    def close(self):
        """Close MySQL connection"""
        if self.conn:
            self.conn.close()
    
    def extract_item_images(self, module_id: int = 4) -> List[Dict]:
        """Extract all image references from items table"""
        cursor = self.conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            i.id,
            i.name,
            i.image,
            i.images,
            s.id as store_id,
            s.name as store_name
        FROM items i
        LEFT JOIN stores s ON i.store_id = s.id
        WHERE i.module_id = %s
        AND (i.image IS NOT NULL OR i.images IS NOT NULL)
        ORDER BY i.id
        """
        
        cursor.execute(query, (module_id,))
        results = cursor.fetchall()
        cursor.close()
        
        # Process and build URLs
        processed = []
        for item in results:
            # Main image
            main_image_urls = self.url_builder.build_item_image_urls(item['image'] or '')
            
            # Additional images
            additional_images = self.url_builder.parse_images_array(item['images'])
            
            processed.append({
                'type': 'item',
                'id': item['id'],
                'name': item['name'],
                'store_id': item['store_id'],
                'store_name': item['store_name'],
                'image': item['image'],
                'image_urls': main_image_urls,
                'additional_images': additional_images,
                'total_images': 1 + len(additional_images)
            })
        
        return processed
    
    def extract_store_images(self, module_id: int = 4) -> List[Dict]:
        """Extract all image references from stores table"""
        cursor = self.conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            id,
            name,
            logo,
            cover_photo,
            meta_image
        FROM stores
        WHERE module_id = %s
        AND (logo IS NOT NULL OR cover_photo IS NOT NULL OR meta_image IS NOT NULL)
        ORDER BY id
        """
        
        cursor.execute(query, (module_id,))
        results = cursor.fetchall()
        cursor.close()
        
        # Process and build URLs
        processed = []
        for store in results:
            logo_urls = self.url_builder.build_store_logo_urls(store['logo'] or '')
            cover_urls = self.url_builder.build_store_cover_urls(store['cover_photo'] or '')
            meta_urls = self.url_builder.build_urls(store['meta_image'] or '', 'meta')
            
            processed.append({
                'type': 'store',
                'id': store['id'],
                'name': store['name'],
                'logo': store['logo'],
                'logo_urls': logo_urls,
                'cover_photo': store['cover_photo'],
                'cover_urls': cover_urls,
                'meta_image': store['meta_image'],
                'meta_urls': meta_urls,
                'total_images': sum([
                    1 if store['logo'] else 0,
                    1 if store['cover_photo'] else 0,
                    1 if store['meta_image'] else 0
                ])
            })
        
        return processed
    
    def extract_category_images(self) -> List[Dict]:
        """Extract all image references from categories table"""
        cursor = self.conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            id,
            name,
            image
        FROM categories
        WHERE image IS NOT NULL AND image != 'def.png'
        ORDER BY id
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        cursor.close()
        
        # Process and build URLs
        processed = []
        for cat in results:
            image_urls = self.url_builder.build_urls(cat['image'] or '', 'category')
            
            processed.append({
                'type': 'category',
                'id': cat['id'],
                'name': cat['name'],
                'image': cat['image'],
                'image_urls': image_urls,
                'total_images': 1 if cat['image'] else 0
            })
        
        return processed


# ============================================
# IMAGE VALIDATOR
# ============================================

class ImageValidator:
    """Validate image accessibility on Minio/S3"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mangwale-Image-Sync/1.0'
        })
    
    def check_url(self, url: str, timeout: int = 5) -> Tuple[bool, int]:
        """
        Check if URL is accessible
        
        Returns:
            Tuple of (is_accessible, status_code)
        """
        if not url:
            return False, 0
        
        try:
            response = self.session.head(url, timeout=timeout, allow_redirects=True)
            return response.status_code == 200, response.status_code
        except:
            return False, 0
    
    def validate_image_urls(self, urls: Dict[str, str]) -> Dict[str, any]:
        """Validate all URLs for an image"""
        results = {
            'original': urls.get('original', ''),
            'primary_accessible': False,
            'fallback_accessible': False,
            'cdn_accessible': False,
            'primary_status': 0,
            'fallback_status': 0,
            'cdn_status': 0
        }
        
        if urls.get('primary'):
            results['primary_accessible'], results['primary_status'] = self.check_url(urls['primary'])
        
        if urls.get('fallback'):
            results['fallback_accessible'], results['fallback_status'] = self.check_url(urls['fallback'])
        
        if urls.get('cdn'):
            results['cdn_accessible'], results['cdn_status'] = self.check_url(urls['cdn'])
        
        return results


# ============================================
# OPENSEARCH UPDATER
# ============================================

class OpenSearchImageUpdater:
    """Update OpenSearch indices with proper image URLs"""
    
    def __init__(self):
        self.base_url = OPENSEARCH_URL.rstrip('/')
        self.url_builder = ImageURLBuilder()
    
    def update_item_images(self, item_id: int, image_data: Dict, index_name: str = "food_items_v4"):
        """Update image URLs in OpenSearch for an item"""
        doc_url = f"{self.base_url}/{index_name}/_update/{item_id}"
        
        update_data = {
            "doc": {
                "image": image_data['image_urls']['original'],
                "image_full_url": image_data['image_urls']['primary'],
                "image_fallback_url": image_data['image_urls']['fallback'],
                "image_cdn_url": image_data['image_urls']['cdn']
            }
        }
        
        # Add additional images if present
        if image_data.get('additional_images'):
            update_data["doc"]["images_urls"] = [
                {
                    'primary': img['primary'],
                    'fallback': img['fallback'],
                    'cdn': img['cdn']
                }
                for img in image_data['additional_images']
            ]
        
        try:
            response = requests.post(doc_url, json=update_data, timeout=5)
            return response.status_code in [200, 201]
        except:
            return False
    
    def update_store_images(self, store_id: int, image_data: Dict, index_name: str = "food_stores_v6"):
        """Update image URLs in OpenSearch for a store"""
        doc_url = f"{self.base_url}/{index_name}/_update/{store_id}"
        
        update_data = {
            "doc": {
                "logo": image_data['logo_urls']['original'],
                "logo_full_url": image_data['logo_urls']['primary'],
                "logo_fallback_url": image_data['logo_urls']['fallback'],
                "cover_photo": image_data['cover_urls']['original'],
                "cover_photo_full_url": image_data['cover_urls']['primary'],
                "cover_photo_fallback_url": image_data['cover_urls']['fallback']
            }
        }
        
        try:
            response = requests.post(doc_url, json=update_data, timeout=5)
            return response.status_code in [200, 201]
        except:
            return False


# ============================================
# MAIN OPERATIONS
# ============================================

def check_images(module_id: int = 4):
    """Check and report on all images in the database"""
    print("\n" + "="*70)
    print("IMAGE INVENTORY CHECK")
    print("="*70 + "\n")
    
    extractor = ImageExtractor()
    extractor.connect()
    
    try:
        # Extract items
        print("📦 Extracting item images...")
        item_images = extractor.extract_item_images(module_id)
        print(f"   Found {len(item_images)} items with images")
        
        total_item_images = sum(item['total_images'] for item in item_images)
        print(f"   Total item images (including additional): {total_item_images}")
        
        # Extract stores
        print("\n🏪 Extracting store images...")
        store_images = extractor.extract_store_images(module_id)
        print(f"   Found {len(store_images)} stores with images")
        
        total_store_images = sum(store['total_images'] for store in store_images)
        print(f"   Total store images: {total_store_images}")
        
        # Extract categories
        print("\n📁 Extracting category images...")
        category_images = extractor.extract_category_images()
        print(f"   Found {len(category_images)} categories with images")
        
        total_category_images = sum(cat['total_images'] for cat in category_images)
        print(f"   Total category images: {total_category_images}")
        
        # Summary
        print("\n" + "="*70)
        print("SUMMARY")
        print("="*70)
        print(f"Total entities with images: {len(item_images) + len(store_images) + len(category_images)}")
        print(f"Total image files: {total_item_images + total_store_images + total_category_images}")
        
        # Sample URLs
        if item_images:
            print("\n📸 Sample Item Image URLs:")
            sample = item_images[0]
            print(f"   Item: {sample['name']}")
            print(f"   Primary:  {sample['image_urls']['primary']}")
            print(f"   Fallback: {sample['image_urls']['fallback']}")
            print(f"   CDN:      {sample['image_urls']['cdn']}")
        
        if store_images:
            print("\n🏪 Sample Store Image URLs:")
            sample = store_images[0]
            print(f"   Store: {sample['name']}")
            print(f"   Logo Primary:  {sample['logo_urls']['primary']}")
            print(f"   Logo Fallback: {sample['logo_urls']['fallback']}")
            print(f"   Cover Primary: {sample['cover_urls']['primary']}")
        
        return {
            'items': item_images,
            'stores': store_images,
            'categories': category_images
        }
        
    finally:
        extractor.close()


def validate_images(module_id: int = 4, sample_size: int = 10):
    """Validate image accessibility"""
    print("\n" + "="*70)
    print("IMAGE VALIDATION")
    print("="*70 + "\n")
    
    extractor = ImageExtractor()
    extractor.connect()
    validator = ImageValidator()
    
    try:
        # Get sample of items
        item_images = extractor.extract_item_images(module_id)
        store_images = extractor.extract_store_images(module_id)
        
        # Validate sample items
        print(f"🔍 Validating {min(sample_size, len(item_images))} item images...\n")
        
        accessible_primary = 0
        accessible_fallback = 0
        accessible_cdn = 0
        
        for i, item in enumerate(item_images[:sample_size]):
            result = validator.validate_image_urls(item['image_urls'])
            
            print(f"{i+1}. {item['name'][:40]}")
            print(f"   Primary:  {'✅' if result['primary_accessible'] else '❌'} ({result['primary_status']})")
            print(f"   Fallback: {'✅' if result['fallback_accessible'] else '❌'} ({result['fallback_status']})")
            print(f"   CDN:      {'✅' if result['cdn_accessible'] else '❌'} ({result['cdn_status']})")
            
            if result['primary_accessible']:
                accessible_primary += 1
            if result['fallback_accessible']:
                accessible_fallback += 1
            if result['cdn_accessible']:
                accessible_cdn += 1
        
        # Summary
        sample_count = min(sample_size, len(item_images))
        print("\n" + "="*70)
        print("VALIDATION SUMMARY")
        print("="*70)
        print(f"Primary (Minio):  {accessible_primary}/{sample_count} ({accessible_primary*100//sample_count}%)")
        print(f"Fallback (S3):    {accessible_fallback}/{sample_count} ({accessible_fallback*100//sample_count}%)")
        print(f"CDN:              {accessible_cdn}/{sample_count} ({accessible_cdn*100//sample_count}%)")
        
    finally:
        extractor.close()


def sync_to_opensearch(module_id: int = 4, batch_size: int = 100):
    """Sync all image URLs to OpenSearch"""
    print("\n" + "="*70)
    print("SYNCING IMAGES TO OPENSEARCH")
    print("="*70 + "\n")
    
    extractor = ImageExtractor()
    extractor.connect()
    updater = OpenSearchImageUpdater()
    
    try:
        # Sync items
        print("📦 Syncing item images to OpenSearch...")
        item_images = extractor.extract_item_images(module_id)
        
        success_count = 0
        fail_count = 0
        
        for i, item in enumerate(item_images):
            if updater.update_item_images(item['id'], item):
                success_count += 1
            else:
                fail_count += 1
            
            if (i + 1) % batch_size == 0:
                print(f"   Processed {i + 1}/{len(item_images)} items...")
        
        print(f"   ✅ Successfully updated: {success_count}")
        print(f"   ❌ Failed: {fail_count}")
        
        # Sync stores
        print("\n🏪 Syncing store images to OpenSearch...")
        store_images = extractor.extract_store_images(module_id)
        
        success_count = 0
        fail_count = 0
        
        for i, store in enumerate(store_images):
            if updater.update_store_images(store['id'], store):
                success_count += 1
            else:
                fail_count += 1
            
            if (i + 1) % 50 == 0:
                print(f"   Processed {i + 1}/{len(store_images)} stores...")
        
        print(f"   ✅ Successfully updated: {success_count}")
        print(f"   ❌ Failed: {fail_count}")
        
        print("\n✅ Image sync to OpenSearch complete!")
        
    finally:
        extractor.close()


# ============================================
# CLI
# ============================================

def main():
    parser = argparse.ArgumentParser(description='Mangwale AI Image Sync Utility')
    parser.add_argument('--check', action='store_true', help='Check image inventory')
    parser.add_argument('--validate', action='store_true', help='Validate image accessibility')
    parser.add_argument('--sync', action='store_true', help='Sync images to OpenSearch')
    parser.add_argument('--module-id', type=int, default=4, help='Module ID (default: 4 for food)')
    parser.add_argument('--sample-size', type=int, default=10, help='Sample size for validation')
    
    args = parser.parse_args()
    
    if args.check:
        check_images(args.module_id)
    elif args.validate:
        validate_images(args.module_id, args.sample_size)
    elif args.sync:
        sync_to_opensearch(args.module_id)
    else:
        print("Please specify an action: --check, --validate, or --sync")
        parser.print_help()


if __name__ == "__main__":
    main()
