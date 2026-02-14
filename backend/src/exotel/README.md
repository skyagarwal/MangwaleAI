# Exotel Integration Module

Complete telephony and messaging integration for MangwaleAI, providing voice calls, SMS, WhatsApp, and AI-powered voice interactions.

## 📚 Documentation

This module includes comprehensive documentation:

1. **[EXOTEL_DOCUMENTATION.md](./EXOTEL_DOCUMENTATION.md)** - Complete API documentation, architecture, and integration guide
2. **[TEST_SCENARIOS.md](./TEST_SCENARIOS.md)** - Comprehensive test scenarios for all endpoints
3. **[Exotel_API_Postman_Collection.json](./Exotel_API_Postman_Collection.json)** - Postman collection with all endpoints and test data

## 🚀 Quick Start

### 1. Import Postman Collection

1. Open Postman
2. Click **Import**
3. Select `Exotel_API_Postman_Collection.json`
4. Set `baseUrl` variable: `http://localhost:3000`

### 2. Test Health

```bash
GET http://localhost:3000/api/exotel/health
```

### 3. Make Your First Call

```bash
POST http://localhost:3000/api/exotel/click-to-call
{
  "agentPhone": "+919876543210",
  "customerPhone": "+919123456789"
}
```

## 📋 Features

- ✅ **Click-to-Call** - Connect agents to customers
- ✅ **Number Masking** - Virtual numbers for privacy
- ✅ **Verified Calls** - Truecaller branded calls
- ✅ **SMS** - Transactional & promotional messaging
- ✅ **WhatsApp** - Template-based messaging
- ✅ **Campaigns** - Auto-dialer with multiple modes
- ✅ **Scheduled Calls** - Smart scheduling with retries
- ✅ **Nerve AI Calls** - Automated vendor/rider calls
- ✅ **Call Quality Analysis** - CQA analytics
- ✅ **Voice Ordering** - Voice-based order processing

## 🔧 Configuration

### Environment Variables

```env
EXOTEL_SERVICE_URL=http://192.168.0.151:3100
NERVE_SYSTEM_URL=http://192.168.0.151:7100
```

### API Configuration

All settings can be configured via API:

```bash
PUT /api/exotel/config
{
  "serviceUrl": "http://192.168.0.151:3100",
  "apiKey": "your-api-key",
  "apiToken": "your-api-token"
}
```

## 📖 API Endpoints

### Main Endpoints

- `GET /api/exotel/health` - Health check
- `POST /api/exotel/click-to-call` - Initiate call
- `POST /api/exotel/number-masking` - Create masked number
- `POST /api/exotel/sms/send` - Send SMS
- `POST /api/exotel/whatsapp/send` - Send WhatsApp
- `POST /api/exotel/scheduled-calls` - Schedule call
- `POST /api/exotel/nerve/vendor/confirm` - Vendor confirmation

See [EXOTEL_DOCUMENTATION.md](./EXOTEL_DOCUMENTATION.md) for complete API reference.

## 🧪 Testing

### Using Postman

1. Import the collection
2. Set environment variables
3. Run individual requests or entire collection

### Test Scenarios

See [TEST_SCENARIOS.md](./TEST_SCENARIOS.md) for:
- Health & status tests
- Configuration tests
- Click-to-call tests
- SMS/WhatsApp tests
- Campaign tests
- Scheduled calls tests
- Nerve AI voice calls tests
- Integration tests
- Error handling tests
- Performance tests

## 🏗️ Architecture

```
MangwaleAI Backend
    │
    ├── Exotel Module
    │   ├── ExotelService → Exotel Service (Mercury:3100)
    │   └── NerveService → Nerve System (Mercury:7100)
    │
    └── Exotel Cloud API
```

## 📝 Example Usage

### Click-to-Call

```typescript
const result = await exotelService.clickToCall({
  agentPhone: '+919876543210',
  customerPhone: '+919123456789',
  recordCall: true,
});
```

### Schedule Call

```typescript
const result = await schedulerService.scheduleCall({
  phone: '+919123456789',
  purpose: CallPurpose.ORDER_CONFIRMATION,
  context: { orderId: 'ORDER-12345' },
  useVerifiedCall: true,
});
```

### Vendor Confirmation

```typescript
const result = await nerveService.confirmVendorOrder({
  orderId: 12345,
  vendorId: 67,
  vendorPhone: '919876543210',
  vendorName: 'Sharma Dhaba',
  language: 'hi',
});
```

## 🔍 Monitoring

### Health Checks

```bash
GET /api/exotel/health
GET /api/exotel/nerve/health
```

### Statistics

```bash
GET /api/exotel/cqa/stats?period=7d
GET /api/exotel/scheduled-calls/stats/summary
GET /api/exotel/nerve/calls/stats?period=7d
```

## 🐛 Troubleshooting

### Service Not Connecting

1. Check Mercury services:
   ```bash
   curl http://192.168.0.151:3100/health
   curl http://192.168.0.151:7100/health
   ```

2. Verify environment variables
3. Check network connectivity

### Calls Not Working

1. Verify Exotel account balance
2. Check phone number format (E.164)
3. Verify DND/business hours
4. Check Exotel Service logs

## 📚 Additional Resources

- **Complete Documentation**: [EXOTEL_DOCUMENTATION.md](./EXOTEL_DOCUMENTATION.md)
- **Test Scenarios**: [TEST_SCENARIOS.md](./TEST_SCENARIOS.md)
- **Postman Collection**: [Exotel_API_Postman_Collection.json](./Exotel_API_Postman_Collection.json)

## 🔐 Security

- API keys stored in database (encrypted)
- Phone numbers validated and sanitized
- Rate limiting implemented
- Access control for admin endpoints

## 📞 Support

For issues or questions:
1. Check documentation
2. Review test scenarios
3. Check logs
4. Verify Mercury services are running

---

**Version**: 1.0.0  
**Last Updated**: 2024-01-20


