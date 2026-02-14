# 🔧 Google Maps API Fix - Feb 6, 2026

## Issues Found

### 1. ✅ FIXED: Missing Environment Variable in Docker
**Problem**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` was not in `docker-compose.yml` environment section.

**Fix Applied**: Added to `docker-compose.yml`:
```yaml
- NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyC7YEeS-IfkYi6MftfJWpgMFU3fYapoakw
- NEXT_PUBLIC_GOOGLE_CLIENT_ID=60005434458-g8gflo2acsn6b3ejrlvlhdo9u7qd382i.apps.googleusercontent.com
```

### 2. ⚠️ ACTION REQUIRED: Enable Geocoding API
**Problem**: The API key returns `REQUEST_DENIED` with message:
> "This API is not activated on your API project. You may need to enable this API in the Google Cloud Console"

**Required APIs**:
- ✅ Maps JavaScript API (appears enabled)
- ❌ **Geocoding API** (NOT enabled - needs activation)
- ❌ **Places API** (may also need activation for autocomplete)

## Steps to Fix

### Step 1: Enable Geocoding API
1. Go to: https://console.cloud.google.com/apis/library
2. Search for "Geocoding API"
3. Click "Enable"
4. Wait 1-2 minutes for activation

### Step 2: Enable Places API (if using autocomplete)
1. Go to: https://console.cloud.google.com/apis/library
2. Search for "Places API"
3. Click "Enable"

### Step 3: Restart Frontend Container
```bash
cd /home/ubuntu/Devs/MangwaleAI/frontend
docker-compose restart dashboard
# OR
docker restart mangwale-dashboard
```

### Step 4: Verify API Key Restrictions
1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your API key: `AIzaSyC7YEeS-IfkYi6MftfJWpgMFU3fYapoakw`
3. Check "Application restrictions":
   - Should allow: `chat.mangwale.ai`, `*.mangwale.ai`
   - OR set to "None" for testing
4. Check "API restrictions":
   - Should include: Maps JavaScript API, Geocoding API, Places API

## Verification

After enabling APIs and restarting:

1. **Check browser console** - Should see: `✅ Google Maps API loaded`
2. **Test geocoding** - Share location button should work
3. **No errors** - Console should not show "REQUEST_DENIED"

## Current Status

- ✅ API Key exists in `.env.local`
- ✅ API Key added to `docker-compose.yml`
- ⚠️ Geocoding API needs to be enabled in Google Cloud Console
- ⚠️ Frontend container needs restart after docker-compose.yml change

## Next Steps

1. Enable Geocoding API in Google Cloud Console
2. Restart frontend container: `docker restart mangwale-dashboard`
3. Test on https://chat.mangwale.ai
4. Verify location sharing works without errors
