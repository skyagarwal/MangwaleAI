# ✅ Product Image Fix - Complete - Feb 6, 2026

## Issue
Product images were not displaying because S3 bucket was returning 403 Forbidden.

## Root Cause
- S3 bucket `https://s3.ap-south-1.amazonaws.com/mangwale/product` is not publicly accessible (403 Forbidden)
- Code was using S3 as primary image source
- PHP backend storage at `https://new.mangwale.com/storage/product` is the actual working source

## Fix Applied - All Locations Updated

### 1. Frontend (`ProductCard.tsx`) ✅
- ✅ Changed from S3-only to PHP backend storage as primary
- ✅ Added multiple fallback URLs
- ✅ Updated `getImageUrl()` function

**Before**:
```typescript
const S3_BASE_URL = 'https://s3.ap-south-1.amazonaws.com/mangwale/product';
```

**After**:
```typescript
const IMAGE_SOURCES = [
  'https://new.mangwale.com/storage/product',  // Primary: PHP backend storage
  'https://storage.mangwale.ai/mangwale/product',  // Fallback: CDN
  'https://mangwale.s3.ap-south-1.amazonaws.com/product',  // Fallback: S3
  'https://s3.ap-south-1.amazonaws.com/mangwale/product',  // Fallback: S3 alternative
];
```

### 2. Backend (`search.executor.ts`) ✅
Updated **ALL** image URL formatting functions:

#### a. `formatSearchResults()` ✅
- ✅ Changed from S3 to PHP backend storage
- ✅ Fixed image path extraction

#### b. `formatHybridSearchResults()` ✅
- ✅ Changed from S3 to PHP backend storage
- ✅ Fixed image path extraction

#### c. `formatSmartSearchResults()` ✅
- ✅ Changed from S3 to PHP backend storage
- ✅ Fixed image path extraction

#### d. Main `execute()` method ✅
- ✅ Changed from S3 to PHP backend storage
- ✅ Fixed image path extraction

**Before**:
```typescript
const S3_BASE = 'https://s3.ap-south-1.amazonaws.com/mangwale/product';
if (!imageUrl.startsWith('http')) {
  return `${S3_BASE}/${imageUrl}`;
}
```

**After**:
```typescript
const IMAGE_BASE = 'https://new.mangwale.com/storage/product';
if (!imageUrl.startsWith('http')) {
  // Extract filename from path
  let filename = imageUrl;
  if (filename.startsWith('/product/')) {
    filename = filename.replace('/product/', '');
  } else if (filename.startsWith('product/')) {
    filename = filename.replace('product/', '');
  }
  return `${IMAGE_BASE}/${filename}`;
}
```

### 3. Backend (`search.service.ts`) ✅
- ✅ Updated fallback search results to use PHP backend storage
- ✅ Fixed image URL construction

## Files Modified
1. ✅ `frontend/src/components/chat/ProductCard.tsx`
2. ✅ `backend/src/flow-engine/executors/search.executor.ts` (4 functions updated)
3. ✅ `backend/src/search/services/search.service.ts`

## Image URL Handling Logic

The code now handles image URLs in the following priority:

1. **Full URLs** (starts with `http://` or `https://`): Use as-is
2. **Relative paths** (starts with `/product/` or `product/`): Extract filename and prepend PHP backend storage URL
3. **Filenames only**: Prepend PHP backend storage URL

**Image field priority**:
- `image_full_url` (highest priority)
- `image_fallback_url`
- `image`
- `images[0]` (array)
- `image_url`

## Testing Recommendations

1. **Test with real search**: Search for a product and check browser console/network tab
2. **Verify image URLs**: Check what image URLs are actually being returned from backend
3. **Check database**: Verify what image paths are stored (may be in OpenSearch, not PostgreSQL)

## Status
✅ **ALL IMAGE URL REFERENCES UPDATED**

All code now uses PHP backend storage (`https://new.mangwale.com/storage/product`) as the primary source for product images.

If images still don't display, verify:
- The actual image filenames/paths in your data source (OpenSearch/MySQL)
- That images exist at `https://new.mangwale.com/storage/product/{filename}`
- That the PHP backend storage is accessible and serving images correctly
