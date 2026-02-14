# Authentication Flow by Channel

## Overview

Mangwale supports multiple channels, each with different authentication requirements:

| Channel | Phone Verified By | Auth Method | OTP Required? | Profile Prompt |
|---------|------------------|-------------|---------------|----------------|
| **WhatsApp** | Meta (wa_id) | Auto-login | ❌ NO | Only if new user |
| **Telegram** | Telegram | Auto-login | ❌ NO | Only if new user |
| **Web Chat** | Not verified | OTP Flow | ✅ YES | If `is_personal_info=0` |
| **Mobile App** | Not verified | OTP Flow | ✅ YES | If `is_personal_info=0` |
| **Voice** | Caller ID | Auto-login | ❌ NO | Only if new user |

## Channel-Specific Auth Logic

### 1. WhatsApp (`platform: 'whatsapp'`)

**Why no OTP?** WhatsApp already verified the user's phone number via Meta's infrastructure. The `wa_id` IS the verified phone.

**Flow:**
```
User sends message → Session created with phone as ID
                   → Check if user exists in PHP backend
                   → YES: autoLogin() → Get token
                   → NO:  autoRegister() → Create account → Get token
                   → Store auth_token in session
                   → User is authenticated!
```

**Code path:** `AuthExecutor.autoAuthByPhone()` → `PhpAuthService.autoLogin()` or `autoRegister()`

### 2. Telegram (`platform: 'telegram'`)

Same as WhatsApp - Telegram verifies phone via their platform.

### 3. Web Chat (`platform: 'web'`)

**Why OTP required?** Web sessions are anonymous (sessionId is UUID, not phone). We need OTP to verify phone ownership.

**Flow:**
```
User clicks Login → auth.flow.ts starts
                 → collect_phone state (ask for number)
                 → send_otp state (call PHP /send-otp)
                 → collect_otp state (user enters 6 digits)
                 → verify_otp state (call PHP /verify-otp)
                 → IF is_personal_info=0 → collect_name → collect_email
                 → auth_complete state
```

**Code path:** `auth.flow.ts` → `AuthExecutor.sendOtp()` → `AuthExecutor.verifyOtp()`

### 4. Mobile App (`platform: 'mobile'`)

Same as Web - uses OTP verification.

### 5. Voice/IVR (`platform: 'voice'`)

Similar to WhatsApp - Caller ID is the phone number (verified by telecom).

## First-Time User Profile Enhancement

### When does it trigger?

Profile enhancement runs **after** successful authentication via `CentralizedAuthService.authenticateUser()`:

```typescript
// In auth.executor.ts after OTP verification
this.centralizedAuthService.authenticateUser(
  phone, token, userData, 'web'
).then(() => {
  // Triggers UserProfileEnrichmentService.enrichUserProfile()
});
```

### What does it do?

1. **Creates/updates PostgreSQL profile** (user_profiles table)
2. **Analyzes MySQL order history** (if existing customer)
3. **Extracts patterns:**
   - Favorite cuisines
   - Favorite stores
   - Favorite items
   - Average order value
   - Order frequency
   - Meal time preferences
   - Price sensitivity
   - Dietary type (veg/non-veg)

### Duplicate Prevention

Enrichment is skipped if:
- Profile was enriched in last 24 hours (in-memory cache)
- `user_profiles.updated_at` < 24 hours ago (database check)

### First-Time Profile Questions (Web Only)

If PHP returns `is_personal_info=0` (new user), the auth flow prompts:
1. "What is your name?" → `collect_name` state
2. "What is your email?" → `collect_email` state
3. Calls `PhpAuthService.updateProfile()` to save

**WhatsApp/Telegram:** No prompts - profile created server-side with minimal data. User can complete profile later via "Update profile" intent.

## Key Files

- `backend/src/flow-engine/flows/auth.flow.ts` - Web/Mobile OTP flow
- `backend/src/flow-engine/executors/auth.executor.ts` - Auth actions (OTP, auto-auth)
- `backend/src/auth/centralized-auth.service.ts` - Cross-channel auth state
- `backend/src/personalization/user-profile-enrichment.service.ts` - Profile building
- `backend/src/php-integration/services/php-auth.service.ts` - PHP backend calls

## Testing Auth Flows

### Test WhatsApp Auto-Auth
```bash
# Send message to WhatsApp webhook
curl -X POST localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"919876543210","text":{"body":"hi"}}]}}]}]}'
```

### Test Web OTP Flow
```bash
# Start auth flow
curl -X POST localhost:3000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-123","message":"login"}'
```

## Common Issues

1. **"Bot didn't ask for profile"** - Check `is_personal_info` value from PHP. If =1, user is considered complete.

2. **"OTP sent but verification fails"** - Check PHP backend `/verify-otp` endpoint. May be rate limited or OTP expired.

3. **"WhatsApp user not authenticated"** - Ensure `platform: 'whatsapp'` is set in session. Check `autoLogin`/`autoRegister` PHP endpoints exist.

4. **"Profile enrichment runs too often"** - Check `recentEnrichments` cache and `user_profiles.updated_at`. Cooldown is 24 hours.
