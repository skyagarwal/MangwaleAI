-- ============================================================================
-- Fix Veg/Non-Veg Data Quality Issues
-- ============================================================================
-- This script identifies and fixes restaurants incorrectly marked as serving
-- non-veg food when their names clearly indicate they are vegetarian/veg-only.
--
-- Date: 2025-12-31
-- Issue: Many restaurants with "Veg", "Vegetarian", "Pure Veg" in names are
--        incorrectly marked as non_veg=1
-- ============================================================================

USE migrated_db;

-- ============================================================================
-- PART 1: ANALYSIS - Show current state
-- ============================================================================

SELECT 'CURRENT STATE ANALYSIS' as '';

SELECT 
    'Total Stores' as metric,
    COUNT(*) as count
FROM stores
WHERE module_id = 4;

SELECT 
    'Pure Veg (veg=1, non_veg=0)' as metric,
    COUNT(*) as count
FROM stores
WHERE module_id = 4 AND veg = 1 AND non_veg = 0;

SELECT 
    'Pure Non-Veg (veg=0, non_veg=1)' as metric,
    COUNT(*) as count
FROM stores
WHERE module_id = 4 AND veg = 0 AND non_veg = 1;

SELECT 
    'Both (veg=1, non_veg=1)' as metric,
    COUNT(*) as count
FROM stores
WHERE module_id = 4 AND veg = 1 AND non_veg = 1;

SELECT 
    'Undefined (NULL values)' as metric,
    COUNT(*) as count
FROM stores
WHERE module_id = 4 AND (veg IS NULL OR non_veg IS NULL);

-- ============================================================================
-- PART 2: IDENTIFY - Show stores that will be fixed
-- ============================================================================

SELECT '\n\nSTORES TO BE FIXED (veg-only names currently marked as non-veg)' as '';

SELECT 
    id,
    name,
    veg,
    non_veg,
    CASE 
        WHEN LOWER(name) REGEXP '\\bpure\\s*veg\\b' THEN 'Pure Veg in name'
        WHEN LOWER(name) REGEXP '\\bvegetarian\\b' THEN 'Vegetarian in name'
        WHEN LOWER(name) REGEXP '\\bveg\\s*(curry|cafe|kitchen|dhaba|restaurant|corner|point|palace)\\b' THEN 'Veg + Food Type'
        WHEN LOWER(name) REGEXP '^veg\\b' THEN 'Starts with Veg'
        WHEN LOWER(name) REGEXP '\\bonly\\s*veg\\b' THEN 'Only Veg in name'
        WHEN LOWER(name) REGEXP '\\bshudh\\b' THEN 'Shudh (Pure) in name'
        WHEN LOWER(name) REGEXP '\\bsatvik\\b|\\bsatwik\\b' THEN 'Satvik in name'
        ELSE 'Other veg indicator'
    END as reason
FROM stores
WHERE module_id = 4 
  AND non_veg = 1
  AND (
    LOWER(name) REGEXP '\\bpure\\s*veg\\b'
    OR LOWER(name) REGEXP '\\bvegetarian\\b'
    OR LOWER(name) REGEXP '\\bveg\\s*(curry|cafe|kitchen|dhaba|restaurant|corner|point|palace)\\b'
    OR LOWER(name) REGEXP '^veg\\b'
    OR LOWER(name) REGEXP '\\bonly\\s*veg\\b'
    OR LOWER(name) REGEXP '\\bshudh\\b'
    OR LOWER(name) REGEXP '\\bsatvik\\b|\\bsatwik\\b'
  )
ORDER BY name;

-- ============================================================================
-- PART 3: FIX - Update non_veg to 0 for veg-only restaurants
-- ============================================================================

-- UNCOMMENT THE FOLLOWING UPDATE STATEMENT TO APPLY FIXES:

/*
UPDATE stores
SET 
    non_veg = 0,
    veg = 1,  -- Ensure veg is set to 1
    updated_at = NOW()
WHERE module_id = 4 
  AND non_veg = 1
  AND (
    LOWER(name) REGEXP '\\bpure\\s*veg\\b'
    OR LOWER(name) REGEXP '\\bvegetarian\\b'
    OR LOWER(name) REGEXP '\\bveg\\s*(curry|cafe|kitchen|dhaba|restaurant|corner|point|palace)\\b'
    OR LOWER(name) REGEXP '^veg\\b'
    OR LOWER(name) REGEXP '\\bonly\\s*veg\\b'
    OR LOWER(name) REGEXP '\\bshudh\\b'
    OR LOWER(name) REGEXP '\\bsatvik\\b|\\bsatwik\\b'
  );

SELECT '\n\nFIX APPLIED' as '';
SELECT CONCAT('Updated ', ROW_COUNT(), ' restaurants to veg-only') as result;
*/

-- ============================================================================
-- PART 4: VERIFICATION - Show what was changed (run after uncommenting UPDATE)
-- ============================================================================

/*
SELECT '\n\nVERIFICATION - Recently updated stores' as '';

SELECT 
    id,
    name,
    veg,
    non_veg,
    updated_at
FROM stores
WHERE module_id = 4
  AND updated_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
  AND veg = 1 
  AND non_veg = 0
ORDER BY updated_at DESC, name;
*/

-- ============================================================================
-- PART 5: ADDITIONAL FIXES - Stores with specific non-veg keywords
-- ============================================================================

SELECT '\n\nNON-VEG RESTAURANTS (should have non_veg=1)' as '';

SELECT 
    id,
    name,
    veg,
    non_veg,
    CASE 
        WHEN LOWER(name) REGEXP '\\bmutton\\b' THEN 'Mutton in name'
        WHEN LOWER(name) REGEXP '\\bchicken\\b' THEN 'Chicken in name'
        WHEN LOWER(name) REGEXP '\\bmeat\\b' THEN 'Meat in name'
        WHEN LOWER(name) REGEXP '\\bbiryani\\b' THEN 'Biryani (often non-veg)'
        WHEN LOWER(name) REGEXP '\\bkebab\\b|\\bkabab\\b' THEN 'Kebab in name'
        WHEN LOWER(name) REGEXP '\\btandoor\\b' THEN 'Tandoor (often non-veg)'
        WHEN LOWER(name) REGEXP '\\bfish\\b' THEN 'Fish in name'
        WHEN LOWER(name) REGEXP '\\begg\\b' THEN 'Egg in name'
        ELSE 'Other non-veg indicator'
    END as reason
FROM stores
WHERE module_id = 4 
  AND (non_veg IS NULL OR non_veg = 0)
  AND (
    LOWER(name) REGEXP '\\bmutton\\b'
    OR LOWER(name) REGEXP '\\bchicken\\b'
    OR LOWER(name) REGEXP '\\bmeat\\b'
    OR LOWER(name) REGEXP '\\bkebab\\b|\\bkabab\\b'
    OR LOWER(name) REGEXP '\\bfish\\b'
    OR LOWER(name) REGEXP '\\begg\\b'
  )
ORDER BY name;

-- UNCOMMENT TO FIX NON-VEG RESTAURANTS:
/*
UPDATE stores
SET 
    non_veg = 1,
    veg = CASE 
        WHEN LOWER(name) REGEXP '\\begg\\b' THEN 1  -- Egg restaurants often also serve veg
        ELSE veg  -- Keep existing veg value
    END,
    updated_at = NOW()
WHERE module_id = 4 
  AND (non_veg IS NULL OR non_veg = 0)
  AND (
    LOWER(name) REGEXP '\\bmutton\\b'
    OR LOWER(name) REGEXP '\\bchicken\\b'
    OR LOWER(name) REGEXP '\\bmeat\\b'
    OR LOWER(name) REGEXP '\\bkebab\\b|\\bkabab\\b'
    OR LOWER(name) REGEXP '\\bfish\\b'
    OR LOWER(name) REGEXP '\\begg\\b'
  );
*/

-- ============================================================================
-- SUMMARY
-- ============================================================================

SELECT '\n\n=== SUMMARY ===' as '';
SELECT 'Script completed. Review the analysis above.' as '';
SELECT 'To apply fixes:' as '';
SELECT '1. Review the stores that will be fixed' as '';
SELECT '2. Uncomment the UPDATE statements in PART 3 and PART 5' as '';
SELECT '3. Run the script again' as '';
SELECT '4. After fixing, reindex OpenSearch data' as '';
