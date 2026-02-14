# Exotel API - Test Scenarios

This document provides comprehensive test scenarios for all Exotel API endpoints. Use this guide to systematically test the entire system.

---

## Table of Contents

1. [Pre-Testing Setup](#pre-testing-setup)
2. [Health & Status Tests](#health--status-tests)
3. [Configuration Tests](#configuration-tests)
4. [Click-to-Call Tests](#click-to-call-tests)
5. [Number Masking Tests](#number-masking-tests)
6. [SMS Tests](#sms-tests)
7. [WhatsApp Tests](#whatsapp-tests)
8. [Campaign Tests](#campaign-tests)
9. [Scheduled Calls Tests](#scheduled-calls-tests)
10. [Nerve AI Voice Calls Tests](#nerve-ai-voice-calls-tests)
11. [Integration Tests](#integration-tests)
12. [Error Handling Tests](#error-handling-tests)
13. [Performance Tests](#performance-tests)

---

## Pre-Testing Setup

### 1. Environment Setup

**Prerequisites:**
- Backend server running on `http://localhost:3000`
- Exotel Service running on `http://192.168.0.151:3100`
- Nerve System running on `http://192.168.0.151:7100`
- Valid Exotel API credentials
- Test phone numbers (at least 2)

**Postman Collection:**
1. Import `Exotel_API_Postman_Collection.json`
2. Set `baseUrl` variable: `http://localhost:3000`
3. Verify all endpoints are loaded

**Test Data:**
```json
{
  "testAgentPhone": "+919876543210",
  "testCustomerPhone": "+919123456789",
  "testVendorPhone": "+919112233445",
  "testRiderPhone": "+919998877665",
  "testOrderId": "ORDER-12345",
  "testVendorId": 67,
  "testRiderId": 89
}
```

---

## Health & Status Tests

### Test 1.1: Health Check
**Endpoint:** `GET /api/exotel/health`

**Test Steps:**
1. Send GET request to health endpoint
2. Verify response status is 200
3. Verify response contains:
   - `enabled`: boolean
   - `features`: object with feature flags
   - `status`: string

**Expected Result:**
```json
{
  "enabled": true,
  "features": {
    "verifiedCallsEnabled": true,
    "numberMaskingEnabled": true,
    "voiceStreamingEnabled": true,
    "autoDialerEnabled": true,
    "cqaEnabled": true
  },
  "status": "ok"
}
```

**Negative Test:**
- Stop Exotel Service on Mercury
- Verify `enabled: false` and error message

---

### Test 1.2: Get Status
**Endpoint:** `GET /api/exotel/status`

**Test Steps:**
1. Send GET request
2. Verify detailed status information

**Expected Result:**
- Service connectivity status
- Feature availability
- Service URL information

---

## Configuration Tests

### Test 2.1: Get Configuration
**Endpoint:** `GET /api/exotel/config`

**Test Steps:**
1. Send GET request
2. Verify all configuration fields are returned
3. Verify sensitive fields (apiKey, apiToken) are masked

**Expected Result:**
```json
{
  "config": {
    "serviceUrl": "http://192.168.0.151:3100",
    "apiKey": "••••••••",
    "apiToken": "••••••••",
    "accountSid": "your-account-sid",
    "subdomain": "api.in.exotel.com",
    "defaultExoPhone": "08040XXXXX"
  },
  "timing": { ... },
  "retry": { ... },
  "features": { ... }
}
```

---

### Test 2.2: Update Configuration
**Endpoint:** `PUT /api/exotel/config`

**Test Steps:**
1. Get current configuration
2. Update one field (e.g., `defaultExoPhone`)
3. Verify update succeeds
4. Get configuration again and verify change persisted

**Test Data:**
```json
{
  "defaultExoPhone": "08041XXXXX"
}
```

**Expected Result:**
```json
{
  "success": true,
  "message": "Configuration updated"
}
```

**Negative Tests:**
- Invalid service URL format
- Missing required fields
- Invalid subdomain

---

### Test 2.3: Timing Configuration
**Endpoint:** `PUT /api/exotel/config/timing`

**Test Scenarios:**

**Scenario A: Business Hours**
1. Set business hours: 09:00 - 21:00
2. Verify configuration saved
3. Test timing check at 14:00 (should allow)
4. Test timing check at 22:00 (should block)

**Test Data:**
```json
{
  "businessHoursStart": "09:00",
  "businessHoursEnd": "21:00",
  "dndStart": "21:00",
  "dndEnd": "09:00",
  "timezone": "Asia/Kolkata",
  "weekendCallsAllowed": false
}
```

**Scenario B: DND Hours**
1. Set DND: 21:00 - 09:00
2. Test timing check at 22:00 (should block)
3. Test timing check at 10:00 (should allow)

**Scenario C: Weekend Restrictions**
1. Set `weekendCallsAllowed: false`
2. Test timing check on Saturday (should block)
3. Set `weekendCallsAllowed: true`
4. Test timing check on Saturday (should allow)

---

### Test 2.4: Retry Configuration
**Endpoint:** `PUT /api/exotel/config/retry`

**Test Steps:**
1. Update retry config
2. Schedule a call that will fail
3. Verify retry attempts follow configured settings

**Test Data:**
```json
{
  "maxAttempts": 3,
  "initialDelaySeconds": 300,
  "backoffMultiplier": 2,
  "maxDelaySeconds": 3600
}
```

**Expected Behavior:**
- First retry after 5 minutes (300s)
- Second retry after 10 minutes (300 * 2)
- Third retry after 20 minutes (300 * 4, capped at 3600s)

---

### Test 2.5: Feature Flags
**Endpoint:** `PUT /api/exotel/config/features/:feature`

**Test Steps:**
1. Toggle `verifiedCallsEnabled` to `false`
2. Try to make verified call (should fail or use regular call)
3. Toggle back to `true`
4. Verify verified calls work again

**Test Features:**
- `verifiedCallsEnabled`
- `numberMaskingEnabled`
- `voiceStreamingEnabled`
- `autoDialerEnabled`
- `cqaEnabled`

---

## Click-to-Call Tests

### Test 3.1: Basic Click-to-Call
**Endpoint:** `POST /api/exotel/click-to-call`

**Test Steps:**
1. Initiate call with valid phone numbers
2. Verify call SID is returned
3. Verify call status is "initiated"
4. Check actual call connects (if test numbers available)

**Test Data:**
```json
{
  "agentPhone": "+919876543210",
  "customerPhone": "+919123456789",
  "recordCall": true
}
```

**Expected Result:**
```json
{
  "callSid": "EXOTEL_CALL_SID_123",
  "status": "initiated"
}
```

---

### Test 3.2: Click-to-Call with Custom Fields
**Test Steps:**
1. Include `customField`, `callerId`, `timeLimit`
2. Verify all fields are accepted
3. Verify call uses custom caller ID

**Test Data:**
```json
{
  "agentPhone": "+919876543210",
  "customerPhone": "+919123456789",
  "callerId": "08040XXXXX",
  "timeLimit": 1800,
  "customField": "ORDER-12345",
  "statusCallback": "https://your-app.com/webhooks/call-status"
}
```

---

### Test 3.3: Click-to-Call Error Cases
**Negative Tests:**
- Invalid phone number format
- Missing required fields
- Invalid caller ID
- Time limit too short (< 60s) or too long (> 7200s)

**Expected Errors:**
- 400 Bad Request for validation errors
- 500 Internal Server Error for service failures

---

## Number Masking Tests

### Test 4.1: Create Masked Number
**Endpoint:** `POST /api/exotel/number-masking`

**Test Steps:**
1. Create masked number for agent-customer pair
2. Verify virtual number is returned
3. Verify expiry time is set correctly
4. Test calling virtual number routes correctly

**Test Data:**
```json
{
  "partyA": "+919876543210",
  "partyB": "+919123456789",
  "expiresInHours": 24,
  "callType": "trans",
  "context": "ORDER-12345"
}
```

**Expected Result:**
```json
{
  "virtualNumber": "+918040XXXXX",
  "expiresAt": "2024-01-21T14:00:00Z",
  "mappingId": "MAPPING_123"
}
```

---

### Test 4.2: Masked Number Expiry
**Test Steps:**
1. Create masked number with 1 hour expiry
2. Wait for expiry (or manually expire)
3. Verify calls to virtual number fail after expiry

---

### Test 4.3: Multiple Maskings
**Test Steps:**
1. Create masked number for Party A ↔ Party B
2. Create another masked number for Party A ↔ Party C
3. Verify different virtual numbers are assigned
4. Verify each routes to correct party

---

## SMS Tests

### Test 5.1: Send Single SMS
**Endpoint:** `POST /api/exotel/sms/send`

**Test Steps:**
1. Send SMS to valid phone number
2. Verify SMS is sent successfully
3. Check phone receives SMS (if test number available)

**Test Data:**
```json
{
  "to": "+919123456789",
  "message": "Test SMS from Mangwale API",
  "smsType": "transactional",
  "priority": "normal"
}
```

**Expected Result:**
- Status 200
- SMS ID or confirmation

---

### Test 5.2: Send SMS with Template
**Test Steps:**
1. Send SMS with template ID
2. Verify template is used
3. Verify DLT template ID is included (if applicable)

**Test Data:**
```json
{
  "to": "+919123456789",
  "message": "Your order ORDER-12345 has been confirmed.",
  "templateId": "TEMPLATE_123",
  "dltTemplateId": "DLT_TEMPLATE_123",
  "smsType": "transactional"
}
```

---

### Test 5.3: Bulk SMS
**Endpoint:** `POST /api/exotel/sms/bulk`

**Test Steps:**
1. Send bulk SMS to 3-5 recipients
2. Verify all SMS are sent
3. Verify success/failed counts are accurate

**Test Data:**
```json
{
  "from": "MANGWALE",
  "recipients": [
    "+919123456789",
    "+919876543210",
    "+919112233445"
  ],
  "message": "Special offer! Get 20% off.",
  "smsType": "promotional"
}
```

**Expected Result:**
```json
{
  "total": 3,
  "success": 3,
  "failed": 0
}
```

---

### Test 5.4: SMS Timing Compliance
**Test Steps:**
1. Set promotional SMS hours: 10:00 - 21:00
2. Try sending promotional SMS at 09:00 (should fail or queue)
3. Try sending promotional SMS at 11:00 (should succeed)
4. Try sending transactional SMS at any time (should succeed)

---

### Test 5.5: SMS Error Cases
**Negative Tests:**
- Invalid phone number
- Message too long (> 2000 chars)
- Empty message
- Invalid template ID
- Rate limit exceeded

---

## WhatsApp Tests

### Test 6.1: Send WhatsApp Message
**Endpoint:** `POST /api/exotel/whatsapp/send`

**Test Steps:**
1. Send WhatsApp message with template
2. Verify message is sent
3. Check WhatsApp receives message (if test number available)

**Test Data:**
```json
{
  "to": "+919123456789",
  "templateName": "order_confirmation",
  "variables": {
    "orderId": "ORDER-12345",
    "total": "₹450",
    "deliveryTime": "Today by 7 PM"
  },
  "languageCode": "en"
}
```

---

### Test 6.2: WhatsApp Template Variables
**Test Steps:**
1. Send message with multiple variables
2. Verify all variables are substituted correctly
3. Test with missing variables (should fail gracefully)

---

## Campaign Tests

### Test 7.1: Create Campaign
**Endpoint:** `POST /api/exotel/campaigns`

**Test Steps:**
1. Create campaign with 2-3 contacts
2. Verify campaign is created
3. Verify campaign ID is returned
4. Get campaign details and verify

**Test Data:**
```json
{
  "name": "Test Campaign",
  "type": "outbound",
  "contacts": [
    {
      "phone": "+919123456789",
      "name": "Test User 1"
    },
    {
      "phone": "+919876543210",
      "name": "Test User 2"
    }
  ],
  "purpose": "promotional_offer",
  "dialerType": "progressive"
}
```

---

### Test 7.2: Campaign Scheduling
**Test Steps:**
1. Create campaign with future schedule
2. Verify campaign status is "scheduled"
3. Wait for schedule time (or manually trigger)
4. Verify campaign starts automatically

**Test Data:**
```json
{
  "name": "Scheduled Campaign",
  "type": "outbound",
  "contacts": [...],
  "schedule": "2024-01-20T15:00:00Z"
}
```

---

### Test 7.3: Campaign Stats
**Endpoint:** `GET /api/exotel/campaigns/:id/stats`

**Test Steps:**
1. Create and run a campaign
2. Get campaign stats
3. Verify stats include:
   - Total contacts
   - Completed calls
   - Failed calls
   - Success rate

---

### Test 7.4: Different Dialer Types
**Test Steps:**
1. Create campaign with `dialerType: "pace"`
2. Create campaign with `dialerType: "predictive"`
3. Create campaign with `dialerType: "preview"`
4. Create campaign with `dialerType: "progressive"`
5. Verify each type works correctly

---

## Scheduled Calls Tests

### Test 8.1: Schedule Call
**Endpoint:** `POST /api/exotel/scheduled-calls`

**Test Steps:**
1. Schedule call for future time
2. Verify call is scheduled
3. Verify optimal time is calculated (if preferredTime not provided)
4. Get scheduled call status

**Test Data:**
```json
{
  "phone": "+919123456789",
  "purpose": "order_confirmation",
  "context": {
    "orderId": "ORDER-12345"
  },
  "useVerifiedCall": true
}
```

**Expected Result:**
```json
{
  "id": "call_1234567890_abc123",
  "scheduledTime": "2024-01-20T14:00:00Z",
  "status": "scheduled"
}
```

---

### Test 8.2: Optimal Time Calculation
**Test Steps:**
1. Set business hours: 09:00 - 21:00
2. Schedule call at 22:00 (outside hours)
3. Verify call is scheduled for next business hour (09:00 next day)
4. Schedule call at 14:00 (within hours)
5. Verify call is scheduled immediately or at 14:00

---

### Test 8.3: Scheduled Call Retry
**Test Steps:**
1. Schedule call to invalid phone number
2. Verify call fails
3. Verify retry is scheduled with backoff
4. Verify retry attempts follow config
5. Verify call marked as failed after max attempts

**Test Data:**
```json
{
  "phone": "+919999999999",  // Invalid number
  "purpose": "order_confirmation",
  "retryConfig": {
    "maxAttempts": 3,
    "initialDelaySeconds": 60  // Short delay for testing
  }
}
```

---

### Test 8.4: Cancel Scheduled Call
**Endpoint:** `POST /api/exotel/scheduled-calls/:id/cancel`

**Test Steps:**
1. Schedule a call
2. Cancel the call
3. Verify call status is "failed" with reason "Cancelled by user"
4. Verify call is not executed

---

### Test 8.5: Scheduled Call Stats
**Endpoint:** `GET /api/exotel/scheduled-calls/stats/summary`

**Test Steps:**
1. Schedule multiple calls with different statuses
2. Get stats
3. Verify stats include:
   - Pending count
   - Completed count
   - Failed count
   - Retrying count
   - Total attempts

---

## Nerve AI Voice Calls Tests

### Test 9.1: Vendor Order Confirmation
**Endpoint:** `POST /api/exotel/nerve/vendor/confirm`

**Test Steps:**
1. Initiate vendor confirmation call
2. Verify call is initiated
3. Verify call record is created in database
4. Simulate callback with acceptance (DTMF 1)
5. Verify order status updates

**Test Data:**
```json
{
  "orderId": 12345,
  "vendorId": 67,
  "vendorPhone": "919876543210",
  "vendorName": "Sharma Dhaba",
  "orderAmount": 450,
  "itemCount": 3,
  "language": "hi"
}
```

**Expected Result:**
```json
{
  "callId": "VC_12345_1234567890",
  "callSid": "EXOTEL_SID_123",
  "status": "initiated"
}
```

---

### Test 9.2: Vendor Rejection
**Test Steps:**
1. Initiate vendor confirmation call
2. Simulate callback with rejection (DTMF 2)
3. Verify rejection reason is captured
4. Verify order system is notified

**Callback Data:**
```json
{
  "call_id": "VC_12345_1234567890",
  "event": "answered",
  "status": "rejected",
  "dtmf_digits": "2",
  "rejection_reason": "item_unavailable"
}
```

---

### Test 9.3: Vendor Prep Time Collection
**Test Steps:**
1. Initiate vendor confirmation call
2. Simulate callback with prep time (DTMF digits: 30)
3. Verify prep time is captured
4. Verify order system receives prep time

**Callback Data:**
```json
{
  "call_id": "VC_12345_1234567890",
  "event": "completed",
  "status": "prep_time_set",
  "dtmf_digits": "30",
  "prep_time": 30
}
```

---

### Test 9.4: Rider Assignment
**Endpoint:** `POST /api/exotel/nerve/rider/assign`

**Test Steps:**
1. Initiate rider assignment call
2. Verify call is initiated
3. Simulate callback with acceptance
4. Verify rider is assigned to order

**Test Data:**
```json
{
  "orderId": 12345,
  "riderId": 89,
  "riderPhone": "919876543210",
  "riderName": "Ramesh",
  "vendorName": "Sharma Dhaba",
  "vendorAddress": "Near SBI Bank, Main Road",
  "estimatedAmount": 35,
  "language": "hi"
}
```

---

### Test 9.5: Nerve Callback Processing
**Endpoint:** `POST /api/exotel/nerve/callback`

**Test Scenarios:**

**Scenario A: Call Answered**
```json
{
  "call_id": "VC_12345_1234567890",
  "event": "answered",
  "status": "ringing"
}
```

**Scenario B: Call Accepted**
```json
{
  "call_id": "VC_12345_1234567890",
  "event": "completed",
  "status": "accepted",
  "dtmf_digits": "1"
}
```

**Scenario C: Call Failed**
```json
{
  "call_id": "VC_12345_1234567890",
  "event": "failed",
  "status": "no_response"
}
```

**Test Steps:**
1. Send each callback scenario
2. Verify callback is processed
3. Verify database record is updated
4. Verify events are emitted (if applicable)

---

### Test 9.6: Order Call History
**Endpoint:** `GET /api/exotel/nerve/calls/order/:orderId`

**Test Steps:**
1. Make multiple calls for an order (vendor, rider)
2. Get call history
3. Verify all calls are returned
4. Verify calls are sorted by date (newest first)

---

### Test 9.7: Retry Failed Call
**Endpoint:** `POST /api/exotel/nerve/calls/:callId/retry`

**Test Steps:**
1. Create a failed call
2. Retry the call
3. Verify attempt number increases
4. Verify new call is initiated

---

## Integration Tests

### Test 10.1: End-to-End Order Flow
**Test Steps:**
1. Create order
2. Schedule vendor confirmation call
3. Verify call executes at optimal time
4. Simulate vendor acceptance
5. Schedule rider assignment call
6. Simulate rider acceptance
7. Verify order status updates correctly

---

### Test 10.2: Multi-Channel Communication
**Test Steps:**
1. Send SMS order confirmation
2. Make verified call for delivery update
3. Send WhatsApp message with tracking
4. Verify all channels work independently

---

### Test 10.3: Campaign with Scheduling
**Test Steps:**
1. Create campaign with future schedule
2. Verify campaign waits for schedule
3. Verify campaign starts automatically
4. Verify calls respect timing config
5. Verify retries work for failed calls

---

## Error Handling Tests

### Test 11.1: Service Unavailable
**Test Steps:**
1. Stop Exotel Service on Mercury
2. Try to make a call
3. Verify graceful error handling
4. Verify error message is clear

**Expected Error:**
```json
{
  "statusCode": 503,
  "message": "Exotel Service unavailable",
  "error": "Service Unavailable"
}
```

---

### Test 11.2: Invalid Phone Numbers
**Test Steps:**
1. Try calling with invalid format: "9123456789"
2. Try calling with missing country code: "919123456789"
3. Try calling with invalid characters
4. Verify validation errors

**Expected Errors:**
- 400 Bad Request
- Clear validation message

---

### Test 11.3: DND Violation
**Test Steps:**
1. Set DND: 21:00 - 09:00
2. Try scheduling call at 22:00
3. Verify call is scheduled for next available time (09:00)
4. Verify reason is provided

---

### Test 11.4: Rate Limiting
**Test Steps:**
1. Send multiple rapid requests
2. Verify rate limiting is applied
3. Verify appropriate error response

---

### Test 11.5: Network Timeout
**Test Steps:**
1. Simulate network timeout (disconnect Mercury)
2. Verify timeout is handled
3. Verify retry logic works (if applicable)

---

## Performance Tests

### Test 12.1: Concurrent Calls
**Test Steps:**
1. Initiate 10 simultaneous click-to-call requests
2. Verify all calls are processed
3. Verify no calls are dropped
4. Measure response times

---

### Test 12.2: Bulk SMS Performance
**Test Steps:**
1. Send bulk SMS to 100 recipients
2. Measure total time
3. Verify all SMS are sent
4. Check for any failures

---

### Test 12.3: Scheduled Call Processing
**Test Steps:**
1. Schedule 50 calls
2. Verify all are processed within expected time
3. Verify no calls are missed
4. Check processing order (priority-based)

---

### Test 12.4: Database Performance
**Test Steps:**
1. Create 1000 voice call records
2. Query call history
3. Measure query performance
4. Verify pagination works correctly

---

## Test Checklist

### Pre-Production Checklist

- [ ] All health checks pass
- [ ] Configuration can be updated via API
- [ ] Timing checks work correctly
- [ ] Click-to-call connects successfully
- [ ] Number masking creates virtual numbers
- [ ] SMS sends and delivers
- [ ] WhatsApp messages send successfully
- [ ] Campaigns create and execute
- [ ] Scheduled calls execute at correct times
- [ ] Scheduled calls retry on failure
- [ ] Nerve vendor calls work end-to-end
- [ ] Nerve rider calls work end-to-end
- [ ] Callbacks are processed correctly
- [ ] Error handling is graceful
- [ ] All negative test cases pass
- [ ] Performance is acceptable
- [ ] Database queries are optimized
- [ ] Logging is comprehensive
- [ ] Monitoring metrics are available

---

## Test Data Templates

### Valid Test Phone Numbers
```json
{
  "agentPhone": "+919876543210",
  "customerPhone": "+919123456789",
  "vendorPhone": "+919112233445",
  "riderPhone": "+919998877665"
}
```

### Order Context
```json
{
  "orderId": "ORDER-12345",
  "orderAmount": 450,
  "itemCount": 3,
  "deliveryDate": "2024-01-21",
  "vendorName": "Sharma Dhaba",
  "customerName": "John Doe"
}
```

### Campaign Contacts
```json
[
  {
    "phone": "+919123456789",
    "name": "Test User 1",
    "metadata": {
      "orderCount": 5,
      "lastOrderDate": "2024-01-15"
    }
  },
  {
    "phone": "+919876543210",
    "name": "Test User 2",
    "metadata": {
      "orderCount": 2,
      "lastOrderDate": "2024-01-10"
    }
  }
]
```

---

## Automated Testing

### Postman Collection Runner

1. Import collection
2. Set environment variables
3. Run collection with data file
4. Review test results

### Test Script Example

```bash
# Run health check
curl http://localhost:3000/api/exotel/health

# Test click-to-call
curl -X POST http://localhost:3000/api/exotel/click-to-call \
  -H "Content-Type: application/json" \
  -d '{
    "agentPhone": "+919876543210",
    "customerPhone": "+919123456789"
  }'
```

---

## Reporting Issues

When reporting test failures, include:

1. **Endpoint**: Full URL and method
2. **Request**: Complete request body/params
3. **Response**: Status code and body
4. **Expected**: What should have happened
5. **Actual**: What actually happened
6. **Environment**: Server, Mercury services status
7. **Logs**: Relevant error logs

---

**Last Updated**: 2024-01-20
**Version**: 1.0.0


