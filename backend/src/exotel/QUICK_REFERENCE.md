# Exotel API - Quick Reference

## 🌐 Public URLs

### Production URLs

**Primary API Domain:**
```
https://api.mangwale.ai/api/exotel
```

**Via Chat Domain (with API Gateway):**
```
https://chat.mangwale.ai/api-gateway/api/exotel
```

**Local Development:**
```
http://localhost:3200/api/exotel
```

### Example Production Endpoints

- **Health Check**: `https://api.mangwale.ai/api/exotel/health`
- **Click-to-Call**: `https://api.mangwale.ai/api/exotel/click-to-call`
- **Send SMS**: `https://api.mangwale.ai/api/exotel/sms/send`
- **Nerve Vendor**: `https://api.mangwale.ai/api/exotel/nerve/vendor/confirm`

### Quick Test

```bash
# Test health endpoint (production)
curl https://api.mangwale.ai/api/exotel/health

# Test health endpoint (local)
curl http://localhost:3200/api/exotel/health
```

---

## 📋 Viewing Logs

### Option 1: Docker Logs (Recommended)

**View all logs:**
```bash
docker logs -f mangwale_ai_service
```

**View only Exotel-related logs:**
```bash
docker logs -f mangwale_ai_service 2>&1 | grep -i "exotel\|nerve"
```

**View last 100 lines:**
```bash
docker logs --tail 100 mangwale_ai_service
```

**View logs with timestamps:**
```bash
docker logs -f --timestamps mangwale_ai_service
```

### Option 2: PM2 Logs (If running with PM2)

**View all logs:**
```bash
pm2 logs mangwale-ai
```

**View only errors:**
```bash
pm2 logs mangwale-ai --err
```

**View last 100 lines:**
```bash
pm2 logs mangwale-ai --lines 100
```

**Log file locations:**
```bash
~/.pm2/logs/mangwale-ai-out.log    # Standard output
~/.pm2/logs/mangwale-ai-error.log  # Errors
```

### Option 3: Development Mode (Terminal)

**If running with `npm run start:dev`:**
```bash
# Logs appear directly in terminal
# Filter for Exotel logs:
npm run start:dev | grep -i "exotel\|nerve"
```

### Option 4: Log Files (If file logging enabled)

**Check log directory:**
```bash
# Default location
ls -lh /var/log/mangwale/

# Or if configured differently
ls -lh ~/logs/
```

**Tail log file:**
```bash
tail -f /var/log/mangwale/mangwale-ai.log
```

**Search logs:**
```bash
grep "Exotel" /var/log/mangwale/*.log
grep "Nerve" /var/log/mangwale/*.log
grep "ERROR" /var/log/mangwale/*.log
```

---

## 🔍 Log Examples

### Exotel Service Logs

**Successful call:**
```
[ExotelService] ✅ ExotelService connected to http://192.168.0.151:3100
[ExotelService] 📞 Click-to-call initiated: +919123456789
```

**Service unavailable:**
```
[ExotelService] ⚠️ Exotel Service not available: connect ECONNREFUSED
```

**Call failed:**
```
[ExotelService] ❌ Click-to-call failed: Invalid phone number format
```

### Nerve Service Logs

**Vendor confirmation:**
```
[NerveService] ✅ NerveService connected to http://192.168.0.151:7100
[NerveService] 📞 Vendor confirmation call: Order 12345 → 919876543210
```

**Callback received:**
```
[NerveService] 📥 Nerve callback: answered for call VC_12345_1234567890
```

### Scheduler Service Logs

**Call scheduled:**
```
[ExotelSchedulerService] 📅 Call scheduled: call_123 to +919123456789 at 2024-01-20T14:00:00Z
```

**Call processed:**
```
[ExotelSchedulerService] ✅ Call completed: call_123 -> +919123456789
```

**Retry scheduled:**
```
[ExotelSchedulerService] 🔄 Call call_123 scheduled for retry at 2024-01-20T14:05:00Z
```

---

## 🧪 Testing with Public URL

### Update Postman Collection

1. Open Postman
2. Click on collection variables
3. Set `baseUrl` to:
   - **Production**: `https://api.mangwale.ai`
   - **Local**: `http://localhost:3200`

### Test Commands

**Health Check:**
```bash
curl https://api.mangwale.ai/api/exotel/health | jq .
```

**Click-to-Call:**
```bash
curl -X POST https://api.mangwale.ai/api/exotel/click-to-call \
  -H "Content-Type: application/json" \
  -d '{
    "agentPhone": "+919876543210",
    "customerPhone": "+919123456789"
  }'
```

**Send SMS:**
```bash
curl -X POST https://api.mangwale.ai/api/exotel/sms/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+919123456789",
    "message": "Test SMS from Mangwale API"
  }'
```

---

## 🐛 Debugging Tips

### Check Service Status

```bash
# Check if container is running
docker ps | grep mangwale_ai_service

# Check container health
docker inspect mangwale_ai_service | grep -A 10 Health
```

### Check Network Connectivity

```bash
# Test Exotel Service (Mercury)
curl http://192.168.0.151:3100/health

# Test Nerve System (Mercury)
curl http://192.168.0.151:7100/health
```

### Monitor Real-Time Activity

```bash
# Watch all Exotel activity
docker logs -f mangwale_ai_service 2>&1 | grep -E "Exotel|Nerve|Scheduler"

# Watch errors only
docker logs -f mangwale_ai_service 2>&1 | grep -E "ERROR|error|❌"
```

### Check Configuration

```bash
# View current config via API
curl https://api.mangwale.ai/api/exotel/config | jq .
```

---

## 📊 Log Filtering Examples

**Filter by service:**
```bash
docker logs mangwale_ai_service 2>&1 | grep "ExotelService"
docker logs mangwale_ai_service 2>&1 | grep "NerveService"
docker logs mangwale_ai_service 2>&1 | grep "SchedulerService"
```

**Filter by action:**
```bash
docker logs mangwale_ai_service 2>&1 | grep "Click-to-call"
docker logs mangwale_ai_service 2>&1 | grep "SMS"
docker logs mangwale_ai_service 2>&1 | grep "Campaign"
```

**Filter by phone number:**
```bash
docker logs mangwale_ai_service 2>&1 | grep "+919123456789"
```

**Filter by time:**
```bash
docker logs --since 1h mangwale_ai_service
docker logs --since 2024-01-20T10:00:00 mangwale_ai_service
```

---

## 🔗 Quick Links

- **Full Documentation**: [EXOTEL_DOCUMENTATION.md](./EXOTEL_DOCUMENTATION.md)
- **Test Scenarios**: [TEST_SCENARIOS.md](./TEST_SCENARIOS.md)
- **Postman Collection**: [Exotel_API_Postman_Collection.json](./Exotel_API_Postman_Collection.json)

---

**Last Updated**: 2024-01-20


