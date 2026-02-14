# Exotel Integration - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [API Endpoints](#api-endpoints)
5. [Configuration](#configuration)
6. [How It Works](#how-it-works)
7. [Integration Guide](#integration-guide)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)

---

## Overview

The Exotel module provides comprehensive telephony integration for MangwaleAI, enabling voice calls, SMS, WhatsApp messaging, and AI-powered voice interactions. It integrates with:

- **Exotel Service (Mercury)**: `http://192.168.0.151:3100` - Handles all Exotel Cloud API interactions
- **Nerve System (Mercury)**: `http://192.168.0.151:7100` - AI Voice Call Orchestrator

### Key Capabilities

- **Voice Calls**: Click-to-call, number masking, verified calls (Truecaller)
- **Messaging**: SMS (transactional & promotional), WhatsApp Business API
- **AI Voice Calls**: Automated vendor confirmations, rider assignments
- **Campaigns**: Auto-dialer with PACE, predictive, preview, progressive modes
- **Scheduling**: Smart call scheduling with DND and business hours management
- **Analytics**: Call Quality Analysis (CQA), call logs, statistics

---

## Architecture

```
    ┌─────────────────────────────────────────────────────────────┐
    │                   MangwaleAI Backend (NestJS)               │
    │  ┌───────────────────────────────────────────────────────┐  │
    │  │                     Exotel Module                     │  │
    │  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐    │  │
    │  │  │  Controller  │  │   Services   │  │    DTOs   │    │  │
    │  │  └──────────────┘  └──────────────┘  └───────────┘    │  │
    │  └───────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────┘
                          │                    │
                          ▼                    ▼
        ┌─────────────────────────┐  ┌─────────────────────────┐
        │  Exotel Service         │  │  Nerve System           │
        │  (Mercury:3100)         │  │  (Mercury:7100)         │
        │                         │  │                         │
        │  - Click-to-Call        │  │  - AI Voice Calls       │
        │  - SMS/WhatsApp         │  │  - Vendor Confirmations │
        │  - Number Masking       │  │  - Rider Assignments    │
        │  - Verified Calls       │  │  - DTMF Collection      │
        │  - Campaigns            │  │  - TTS/ASR Integration  │
        └─────────────────────────┘  └─────────────────────────┘
                          │                    │
                          ▼                    ▼
        ┌──────────────────────────────────────────────────────┐
        │                   Exotel Cloud API                   │
        │  - Voice Calls                                       │
        │  - SMS Gateway                                       │
        │  - WhatsApp Business API                             │
        │  - Truecaller Verified Calls                         │
        └──────────────────────────────────────────────────────┘
```

### Module Structure

```
src/exotel/
├── controllers/
│   ├── exotel.controller.ts      # Main Exotel API endpoints
│   └── nerve.controller.ts        # Nerve AI voice call endpoints
├── services/
│   ├── exotel.service.ts         # Exotel Service client
│   ├── exotel-config.service.ts  # Configuration management
│   ├── exotel-scheduler.service.ts # Call scheduling & retries
│   └── nerve.service.ts          # Nerve System client
├── dto/
│   └── exotel.dto.ts            # Data Transfer Objects
└── exotel.module.ts             # NestJS module definition
```

---

## Features

### 1. Click-to-Call
Connect agents to customers instantly via phone calls.

**Use Cases:**
- Customer support calls
- Order follow-ups
- Agent-initiated conversations

**Features:**
- Custom caller ID (ExoPhone)
- Call recording
- Time limits
- Status callbacks

### 2. Number Masking
Protect agent and customer privacy with virtual numbers.

**Use Cases:**
- Agent-customer communication
- Delivery partner coordination
- Privacy-compliant calling

**Features:**
- Temporary virtual numbers
- Configurable expiry (1-168 hours)
- Transactional/Promotional modes

### 3. Verified Calls (Truecaller)
Branded caller ID with call reason display.

**Use Cases:**
- Order confirmations
- Delivery updates
- Payment reminders
- High-priority notifications

**Features:**
- Truecaller branding
- Custom call reason
- Higher answer rates

### 4. SMS
Transactional and promotional SMS messaging.

**Use Cases:**
- Order confirmations
- OTP delivery
- Promotional campaigns
- Delivery updates

**Features:**
- DLT compliance (India)
- Template support
- Bulk messaging (up to 100)
- Status callbacks

### 5. WhatsApp Business API
Template-based WhatsApp messaging.

**Use Cases:**
- Order notifications
- Delivery updates
- Customer engagement

**Features:**
- Template-based messages
- Variable substitution
- Multi-language support

### 6. Auto Dialer / Campaigns
Automated outbound calling campaigns.

**Dialer Types:**
- **PACE**: Predictive dialer with optimal pacing
- **Predictive**: AI-powered dialing
- **Preview**: Agent preview before dialing
- **Progressive**: Gradual dialing

**Use Cases:**
- Promotional campaigns
- Feedback collection
- Payment reminders
- Abandoned cart recovery

### 7. Scheduled Calls
Smart call scheduling with automatic retries.

**Features:**
- DND compliance
- Business hours respect
- Exponential backoff retries
- Priority queue
- Optimal timing calculation

### 8. Nerve AI Voice Calls
Fully automated AI voice interactions.

**Call Types:**
- **Vendor Order Confirmation**: Automated vendor order acceptance
- **Vendor Prep Time Collection**: Collect preparation time via DTMF
- **Rider Assignment**: Assign orders to riders via voice
- **Rider Pickup Ready**: Notify riders when order is ready

**Features:**
- Natural language TTS
- DTMF digit collection
- Multi-language support (Hindi, English)
- Call result callbacks
- Automatic retries

### 9. Call Quality Analysis (CQA)
Analyze call recordings for quality and compliance.

**Features:**
- Sentiment analysis
- Keyword detection
- Compliance checking
- Performance metrics

### 10. Voice Ordering
Process orders via voice interactions.

**Features:**
- Voice-to-text order capture
- Order confirmation
- Modification support

---

## API Endpoints

### Base URL
```
http://localhost:3000/api/exotel
```

### Health & Status

#### GET `/health`
Check service health and connectivity.

**Response:**
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
  "status": "ok",
  "serviceUrl": "http://192.168.0.151:3100"
}
```

#### GET `/status`
Get detailed service status.

---

### Configuration

#### GET `/config`
Get all configuration settings.

#### PUT `/config`
Update configuration.

**Request Body:**
```json
{
  "serviceUrl": "http://192.168.0.151:3100",
  "apiKey": "your-api-key",
  "apiToken": "your-api-token",
  "accountSid": "your-account-sid",
  "subdomain": "api.in.exotel.com",
  "defaultExoPhone": "08040XXXXX",
  "dltEntityId": "your-dlt-entity-id"
}
```

#### GET `/config/timing`
Get timing configuration (business hours, DND).

#### PUT `/config/timing`
Update timing configuration.

**Request Body:**
```json
{
  "businessHoursStart": "09:00",
  "businessHoursEnd": "21:00",
  "dndStart": "21:00",
  "dndEnd": "09:00",
  "promoSmsStart": "10:00",
  "promoSmsEnd": "21:00",
  "timezone": "Asia/Kolkata",
  "weekendCallsAllowed": false,
  "holidays": []
}
```

#### GET `/config/retry`
Get retry configuration.

#### PUT `/config/retry`
Update retry configuration.

**Request Body:**
```json
{
  "maxAttempts": 3,
  "initialDelaySeconds": 300,
  "backoffMultiplier": 2,
  "maxDelaySeconds": 3600,
  "retryOnBusy": true,
  "retryOnNoAnswer": true,
  "retryOnNetworkError": true
}
```

#### GET `/config/features`
Get feature flags.

#### PUT `/config/features/:feature`
Toggle a feature (verifiedCallsEnabled, numberMaskingEnabled, etc.).

---

### Timing Check

#### GET `/timing/check?purpose=order_confirmation`
Check if current time allows calling/SMS.

**Query Parameters:**
- `purpose` (optional): Call purpose enum

**Response:**
```json
{
  "canCall": true,
  "canSms": true,
  "canPromoSms": true,
  "reason": null,
  "nextAvailableTime": null,
  "currentTime": "14:30",
  "timezone": "Asia/Kolkata"
}
```

---

### Click-to-Call

#### POST `/click-to-call`
Initiate a call between agent and customer.

**Request Body:**
```json
{
  "agentPhone": "+919876543210",
  "customerPhone": "+919123456789",
  "callerId": "08040XXXXX",
  "timeLimit": 1800,
  "recordCall": true,
  "customField": "ORDER-12345",
  "statusCallback": "https://your-app.com/webhooks/call-status"
}
```

**Response:**
```json
{
  "callSid": "EXOTEL_CALL_SID_123",
  "status": "initiated"
}
```

---

### Number Masking

#### POST `/number-masking`
Create a virtual masked number.

**Request Body:**
```json
{
  "partyA": "+919876543210",
  "partyB": "+919123456789",
  "expiresInHours": 24,
  "callType": "trans",
  "context": "ORDER-12345"
}
```

**Response:**
```json
{
  "virtualNumber": "+918040XXXXX",
  "expiresAt": "2024-01-21T14:00:00Z",
  "mappingId": "MAPPING_123"
}
```

---

### Voice Streaming

#### POST `/voice-stream/start`
Start real-time voice streaming for ASR/TTS.

**Request Body:**
```json
{
  "sessionId": "session_12345",
  "phone": "+919123456789",
  "language": "hi-IN",
  "wsEndpoint": "wss://your-app.com/voice-stream"
}
```

---

### Verified Calls

#### POST `/verified-calls`
Make a Truecaller-verified branded call.

**Request Body:**
```json
{
  "phone": "+919123456789",
  "reason": "Order Delivery Update",
  "orderId": "ORDER-12345",
  "priority": "high"
}
```

---

### SMS

#### POST `/sms/send`
Send a single SMS.

**Request Body:**
```json
{
  "to": "+919123456789",
  "message": "Your order ORDER-12345 has been confirmed.",
  "templateId": "TEMPLATE_123",
  "dltTemplateId": "DLT_TEMPLATE_123",
  "smsType": "transactional",
  "priority": "normal",
  "customField": "ORDER-12345",
  "statusCallback": "https://your-app.com/webhooks/sms-status"
}
```

#### POST `/sms/bulk`
Send SMS to multiple recipients (max 100).

**Request Body:**
```json
{
  "from": "MANGWALE",
  "recipients": ["+919123456789", "+919876543210"],
  "message": "Special offer! Get 20% off.",
  "smsType": "promotional",
  "dltEntityId": "your-dlt-entity-id",
  "dltTemplateId": "DLT_TEMPLATE_456"
}
```

**Response:**
```json
{
  "total": 2,
  "success": 2,
  "failed": 0
}
```

---

### WhatsApp

#### POST `/whatsapp/send`
Send WhatsApp message via template.

**Request Body:**
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

### Campaigns

#### POST `/campaigns`
Create a new campaign.

**Request Body:**
```json
{
  "name": "Festival Sale Campaign",
  "type": "outbound",
  "contacts": [
    {
      "phone": "+919123456789",
      "name": "John Doe",
      "metadata": {
        "orderCount": 5,
        "lastOrderDate": "2024-01-15"
      }
    }
  ],
  "template": "Hello {{name}}, we have a special offer!",
  "purpose": "promotional_offer",
  "dialerType": "progressive",
  "schedule": "2024-01-20T10:00:00Z",
  "retryConfig": {
    "maxAttempts": 3,
    "initialDelaySeconds": 300,
    "backoffMultiplier": 2,
    "maxDelaySeconds": 3600
  },
  "priority": 5,
  "tags": ["festival", "sale"]
}
```

#### GET `/campaigns`
List all campaigns.

#### GET `/campaigns/:id`
Get campaign details.

#### GET `/campaigns/:id/stats`
Get campaign statistics.

---

### Scheduled Calls

#### POST `/scheduled-calls`
Schedule a call for optimal time.

**Request Body:**
```json
{
  "phone": "+919123456789",
  "purpose": "order_confirmation",
  "preferredTime": "2024-01-20T14:00:00Z",
  "context": {
    "orderId": "ORDER-12345",
    "orderAmount": 450,
    "itemCount": 3,
    "deliveryDate": "2024-01-21"
  },
  "useVerifiedCall": true,
  "retryConfig": {
    "maxAttempts": 3,
    "initialDelaySeconds": 300,
    "backoffMultiplier": 2,
    "maxDelaySeconds": 3600
  },
  "priority": 2
}
```

**Response:**
```json
{
  "id": "call_1234567890_abc123",
  "scheduledTime": "2024-01-20T14:00:00Z",
  "status": "scheduled"
}
```

#### GET `/scheduled-calls`
List pending scheduled calls.

#### GET `/scheduled-calls/:id`
Get scheduled call status.

#### POST `/scheduled-calls/:id/cancel`
Cancel a scheduled call.

#### GET `/scheduled-calls/stats/summary`
Get scheduled call statistics.

---

### Recordings

#### GET `/recordings/:callSid`
Get call recording URL.

---

### CQA (Call Quality Analysis)

#### POST `/cqa/analyze`
Analyze a call recording.

**Request Body:**
```json
{
  "callSid": "CALL_SID_123456",
  "analysisType": "full"
}
```

**Analysis Types:**
- `sentiment`: Sentiment analysis only
- `keywords`: Keyword detection only
- `compliance`: Compliance checking only
- `full`: Complete analysis

#### GET `/cqa/stats?period=7d`
Get CQA dashboard statistics.

**Query Parameters:**
- `period`: `24h`, `7d`, `30d`

---

### Voice Ordering

#### POST `/voice-ordering`
Process voice-based order.

**Request Body:**
```json
{
  "phone": "+919123456789",
  "action": "start",
  "orderData": {
    "items": [
      {"name": "Dal Makhani", "quantity": 2, "price": 150}
    ],
    "total": 300
  },
  "sessionId": "session_12345"
}
```

**Actions:**
- `start`: Start new voice order
- `confirm`: Confirm order
- `cancel`: Cancel order
- `modify`: Modify order

---

### Call Logs

#### GET `/calls`
Get call history with filters.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `status`: Call status filter
- `direction`: `inbound` or `outbound`
- `from`: From date (ISO 8601)
- `to`: To date (ISO 8601)
- `phone`: Phone number filter

#### GET `/calls/:callSid`
Get details of a specific call.

---

### Templates

#### GET `/templates/:purpose`
Get call script template for a purpose.

**Purposes:**
- `order_confirmation`
- `delivery_update`
- `payment_reminder`
- `promotional_offer`
- `feedback_request`
- `support_callback`
- `otp_verification`
- `abandoned_cart`
- `custom`

**Response:**
```json
{
  "greeting": "Hello, this is Mangwale calling to confirm your order.",
  "script": "Your order {orderId} for {itemCount} items totaling ₹{total} has been placed successfully.",
  "closingScript": "Thank you for ordering with Mangwale!",
  "maxDuration": 120,
  "priority": 2
}
```

---

### Nerve - AI Voice Calls

#### GET `/nerve/health`
Check Nerve System health.

#### POST `/nerve/vendor/confirm`
Initiate vendor order confirmation call.

**Request Body:**
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

**Response:**
```json
{
  "callId": "VC_12345_1234567890",
  "callSid": "EXOTEL_SID_123",
  "status": "initiated",
  "message": "Call initiated"
}
```

#### POST `/nerve/rider/assign`
Initiate rider assignment call.

**Request Body:**
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

#### POST `/nerve/callback`
Receive callback from Nerve System.

**Request Body:**
```json
{
  "call_id": "VC_12345_1234567890",
  "call_sid": "EXOTEL_SID_123",
  "event": "answered",
  "status": "accepted",
  "dtmf_digits": "1",
  "prep_time": 30,
  "rejection_reason": null,
  "recording_url": "https://recordings.exotel.com/call_123.mp3"
}
```

**Events:**
- `initiated`: Call initiated
- `ringing`: Phone ringing
- `answered`: Call answered
- `accepted`: Order accepted (DTMF 1)
- `rejected`: Order rejected (DTMF 2)
- `prep_time_set`: Prep time collected
- `completed`: Call completed
- `failed`: Call failed
- `busy`: Line busy
- `no_response`: No answer

#### GET `/nerve/calls/order/:orderId`
Get all voice calls for an order.

#### GET `/nerve/calls/stats?period=7d`
Get AI voice call statistics.

#### POST `/nerve/calls/:callId/retry`
Retry a failed voice call.

---

## Configuration

### Environment Variables

```env
# Exotel Service URL (Mercury)
EXOTEL_SERVICE_URL=http://192.168.0.151:3100

# Nerve System URL (Mercury)
NERVE_SYSTEM_URL=http://192.168.0.151:7100

# Exotel API Credentials (optional, can be set via API)
EXOTEL_API_KEY=your-api-key
EXOTEL_API_TOKEN=your-api-token
EXOTEL_ACCOUNT_SID=your-account-sid
EXOTEL_SUBDOMAIN=api.in.exotel.com
EXOTEL_DEFAULT_EXOPHONE=08040XXXXX
EXOTEL_DLT_ENTITY_ID=your-dlt-entity-id
```

### Database Settings

All configuration is stored in the `system_settings` table with keys:

- `exotel-service-url`
- `exotel-api-key`
- `exotel-api-token`
- `exotel-account-sid`
- `exotel-subdomain`
- `exotel-default-exophone`
- `exotel-dlt-entity-id`
- `exotel-business-hours-start`
- `exotel-business-hours-end`
- `exotel-dnd-start`
- `exotel-dnd-end`
- `exotel-promo-sms-start`
- `exotel-promo-sms-end`
- `exotel-timezone`
- `exotel-weekend-calls-allowed`
- `exotel-retry-max-attempts`
- `exotel-retry-initial-delay`
- `exotel-retry-backoff-multiplier`
- `exotel-retry-max-delay`
- `exotel-verified-calls-enabled`
- `exotel-number-masking-enabled`
- `exotel-voice-streaming-enabled`
- `exotel-auto-dialer-enabled`
- `exotel-cqa-enabled`

---

## How It Works

### Click-to-Call Flow

```
1. Client → POST /api/exotel/click-to-call
2. ExotelService → Exotel Service (Mercury:3100)
3. Exotel Service → Exotel Cloud API
4. Exotel Cloud → Calls Agent Phone
5. Exotel Cloud → Calls Customer Phone
6. Exotel Cloud → Bridges both calls
7. Status Callback → Client webhook
```

### Number Masking Flow

```
1. Client → POST /api/exotel/number-masking
2. ExotelService → Exotel Service (Mercury:3100)
3. Exotel Service → Exotel Cloud API
4. Exotel Cloud → Allocates virtual number
5. Virtual number → Routes to Party A or Party B
6. Expires after configured hours
```

### Scheduled Call Flow

```
1. Client → POST /api/exotel/scheduled-calls
2. SchedulerService → Calculates optimal time
3. SchedulerService → Stores in memory/DB
4. Cron Job (every minute) → Checks due calls
5. Timing Check → Validates DND/business hours
6. ExotelService → Initiates call
7. Retry Logic → Handles failures with backoff
8. Status Update → Updates call status
```

### Nerve AI Voice Call Flow

```
1. Client → POST /api/exotel/nerve/vendor/confirm
2. NerveService → Creates voice_calls record
3. NerveService → Calls Nerve System (Mercury:7100)
4. Nerve System → Calls Exotel IVR
5. Exotel IVR → Calls Vendor Phone
6. TTS Engine → Speaks order details
7. DTMF Collection → Vendor presses 1 (accept) or 2 (reject)
8. Nerve System → POST /api/exotel/nerve/callback
9. NerveService → Updates voice_calls record
10. Event Emitter → Notifies order system
```

### SMS Flow

```
1. Client → POST /api/exotel/sms/send
2. ExotelService → Exotel Service (Mercury:3100)
3. Exotel Service → Exotel Cloud API
4. Exotel Cloud → Sends SMS via gateway
5. Status Callback → Client webhook (optional)
```

---

## Integration Guide

### 1. Initialize Module

The module is already imported in `AppModule`. Ensure environment variables are set.

### 2. Basic Click-to-Call

```typescript
import { ExotelService } from './exotel/services/exotel.service';

// In your service
async makeCall() {
  const result = await this.exotelService.clickToCall({
    agentPhone: '+919876543210',
    customerPhone: '+919123456789',
    recordCall: true,
  });
  return result;
}
```

### 3. Schedule a Call

```typescript
import { ExotelSchedulerService } from './exotel/services/exotel-scheduler.service';

async scheduleOrderConfirmation(orderId: string, phone: string) {
  const result = await this.schedulerService.scheduleCall({
    phone,
    purpose: CallPurpose.ORDER_CONFIRMATION,
    context: { orderId },
    useVerifiedCall: true,
  });
  return result;
}
```

### 4. Send SMS

```typescript
async sendOrderConfirmation(orderId: string, phone: string) {
  const result = await this.exotelService.sendSms(
    phone,
    `Your order ${orderId} has been confirmed.`,
    'TEMPLATE_123',
  );
  return result;
}
```

### 5. Vendor Confirmation via Nerve

```typescript
import { NerveService } from './exotel/services/nerve.service';

async confirmVendorOrder(orderId: number, vendorId: number) {
  const vendor = await this.getVendor(vendorId);
  const result = await this.nerveService.confirmVendorOrder({
    orderId,
    vendorId,
    vendorPhone: vendor.phone,
    vendorName: vendor.name,
    orderAmount: order.total,
    language: 'hi',
  });
  return result;
}
```

### 6. Handle Nerve Callback

The callback endpoint is automatically registered. To handle events:

```typescript
// In your order service
@OnEvent('VENDOR_ACCEPTED')
async handleVendorAccepted(data: { orderId: number }) {
  // Update order status
}

@OnEvent('VENDOR_REJECTED')
async handleVendorRejected(data: { orderId: number, reason: string }) {
  // Handle rejection
}
```

---

## Error Handling

### Common Errors

1. **Service Unavailable**
   - Error: `EXOTEL_SERVICE_URL not configured`
   - Solution: Set environment variable or update config via API

2. **Invalid Phone Number**
   - Error: `Invalid phone number format`
   - Solution: Use E.164 format: `+919123456789`

3. **DND Violation**
   - Error: `DND hours - calls not allowed`
   - Solution: Check timing config, schedule for later

4. **Rate Limiting**
   - Error: `Rate limit exceeded`
   - Solution: Implement exponential backoff

5. **Network Error**
   - Error: `Network timeout`
   - Solution: Check Mercury service connectivity

### Retry Logic

Scheduled calls automatically retry with exponential backoff:

```typescript
// Default retry config
{
  maxAttempts: 3,
  initialDelaySeconds: 300,  // 5 minutes
  backoffMultiplier: 2,      // Double each retry
  maxDelaySeconds: 3600       // Max 1 hour
}
```

---

## Best Practices

### 1. Phone Number Format
Always use E.164 format: `+919123456789`

### 2. Timing Compliance
- Check timing before initiating calls: `GET /timing/check`
- Use scheduled calls for non-urgent communications
- Respect DND hours (default: 9 PM - 9 AM)

### 3. Error Handling
- Always handle async errors with try-catch
- Implement retry logic for critical calls
- Log all call attempts for debugging

### 4. Call Recording
- Enable recording for customer support calls
- Store recording URLs in database
- Comply with privacy regulations

### 5. SMS Best Practices
- Use DLT templates for promotional SMS (India)
- Keep messages concise (< 160 chars for single SMS)
- Include opt-out instructions for promotional SMS

### 6. Campaign Management
- Start with small batches
- Monitor campaign stats regularly
- Pause campaigns if error rate is high

### 7. Nerve AI Calls
- Use Hindi (`hi`) for better vendor/rider understanding
- Set appropriate retry configs
- Monitor callback events for order updates

### 8. Configuration
- Store sensitive credentials in database (encrypted)
- Use feature flags to enable/disable features
- Regularly review timing and retry configs

---

## Database Schema

### voice_calls Table (for Nerve calls)

```sql
CREATE TABLE voice_calls (
  id VARCHAR(255) PRIMARY KEY,
  call_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  order_id INTEGER,
  vendor_id INTEGER,
  rider_id INTEGER,
  phone_number VARCHAR(20) NOT NULL,
  recipient_name VARCHAR(255),
  call_sid VARCHAR(255),
  dtmf_digits VARCHAR(10),
  prep_time_minutes INTEGER,
  rejection_reason VARCHAR(100),
  recording_url TEXT,
  language VARCHAR(10) DEFAULT 'hi',
  attempt_number INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 3,
  initiated_at TIMESTAMP DEFAULT NOW(),
  answered_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### system_settings Table

Configuration is stored in the existing `system_settings` table with category `'exotel'`.

---

## Monitoring & Analytics

### Key Metrics to Monitor

1. **Call Success Rate**: Completed calls / Total attempts
2. **Answer Rate**: Answered calls / Total calls
3. **Average Call Duration**: Sum of durations / Call count
4. **SMS Delivery Rate**: Delivered / Sent
5. **Campaign Performance**: Success rate per campaign
6. **Nerve Call Success**: Accepted / Total vendor calls

### Dashboard Endpoints

- `GET /api/exotel/cqa/stats?period=7d` - CQA statistics
- `GET /api/exotel/scheduled-calls/stats/summary` - Scheduled call stats
- `GET /api/exotel/nerve/calls/stats?period=7d` - Nerve call stats
- `GET /api/exotel/campaigns/:id/stats` - Campaign statistics

---

## Security Considerations

1. **API Keys**: Store in database with encryption, never log
2. **Phone Numbers**: Validate format, sanitize before storage
3. **Callbacks**: Verify callback signatures (if Exotel provides)
4. **Rate Limiting**: Implement rate limits to prevent abuse
5. **Access Control**: Restrict configuration endpoints to admins

---

## Troubleshooting

### Service Not Connecting

1. Check Mercury services are running:
   ```bash
   curl http://192.168.0.151:3100/health  # Exotel Service
   curl http://192.168.0.151:7100/health  # Nerve System
   ```

2. Verify network connectivity from backend to Mercury

3. Check environment variables are set correctly

### Calls Not Going Through

1. Verify Exotel account has sufficient balance
2. Check phone numbers are in correct format
3. Verify DND/business hours configuration
4. Check Exotel Service logs on Mercury

### Nerve Calls Failing

1. Verify Nerve System is running and healthy
2. Check voice_calls table exists
3. Verify callback URL is accessible
4. Check Nerve System logs for TTS/ASR errors

---

## Support & Resources

- **Exotel Documentation**: https://developer.exotel.com
- **Nerve System**: Internal documentation on Mercury
- **Module Location**: `src/exotel/`
- **Postman Collection**: `Exotel_API_Postman_Collection.json`

---

**Last Updated**: 2024-01-20
**Version**: 1.0.0


