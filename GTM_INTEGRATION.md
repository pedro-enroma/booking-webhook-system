# GTM/GA4 Integration Documentation

## Overview
This integration allows Google Tag Manager Server-Side to send affiliate and campaign tracking data to the `activity_bookings` table in Supabase when a purchase is completed.

## Architecture

### Data Flow
1. **User completes purchase** → GTM fires purchase event
2. **GTM Server-Side** → Sends webhook to `/webhook/gtm`
3. **5-second delay** → Ensures Bokun webhook processes first
4. **Lookup booking** → Searches `activity_bookings` by `booking_id`
5. **Update records** → Adds `affiliate_id` and `first_campaign` data
6. **Comprehensive logging** → All events logged for Railway monitoring

## Setup Instructions

### 1. Database Migration
First, add the required columns to your Supabase database:

```bash
# Run the migration to add columns
npm run migrate-gtm
```

Or manually run this SQL in Supabase:
```sql
ALTER TABLE activity_bookings 
ADD COLUMN IF NOT EXISTS affiliate_id VARCHAR(255);

ALTER TABLE activity_bookings 
ADD COLUMN IF NOT EXISTS first_campaign VARCHAR(255);
```

### 2. Environment Configuration
Add to your `.env` file:
```env
# GTM Webhook Security
GTM_WEBHOOK_API_KEY=your-secure-api-key-here
```

### 3. GTM Server-Side Container Setup

#### Required Variables
Ensure these variables are available in your GTM container:
- `TH - url - affiliate_id` - String variable containing affiliate ID
- `TH - url - first_campaign_id` - String variable containing campaign ID

#### Webhook Tag Configuration
Create a new tag in GTM Server-Side:

**Tag Type:** Custom HTTP Request

**Trigger:** Purchase Event (or your conversion event)

**Configuration:**
```javascript
URL: https://your-railway-app.railway.app/webhook/gtm

Method: POST

Headers:
- Authorization: Bearer {{GTM_API_KEY}}
- Content-Type: application/json

Body (JSON):
{
  "ecommerce": {
    "transaction_id": "{{Transaction ID}}",
    "value": {{Value}},
    "currency": "{{Currency}}",
    "items": {{Items}}
  },
  "variables": {
    "TH - url - affiliate_id": "{{TH - url - affiliate_id}}",
    "TH - url - first_campaign_id": "{{TH - url - first_campaign_id}}"
  },
  "event_name": "{{Event Name}}",
  "client_id": "{{Client ID}}",
  "session_id": "{{Session ID}}",
  "page": {
    "location": "{{Page URL}}",
    "referrer": "{{Page Referrer}}"
  }
}
```

## API Endpoints

### POST /webhook/gtm
Main webhook endpoint for GTM data.

**Headers:**
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "ecommerce": {
    "transaction_id": "66379912",  // Required: Maps to booking_id
    "value": 186.00,
    "currency": "EUR"
  },
  "variables": {
    "TH - url - affiliate_id": "cometeelmundo",
    "TH - url - first_campaign_id": "que-ver-en-roma-3-dias-tab"
  },
  "event_name": "purchase",
  "client_id": "GA1.2.123.456"
}
```

**Response:**
```json
{
  "success": true,
  "request_id": "abc123",
  "booking_id": 66379912,
  "records_updated": 2,
  "affiliate_id": "cometeelmundo",
  "first_campaign": "que-ver-en-roma-3-dias-tab",
  "processing_time_ms": 7245,
  "delay_applied_ms": 5000,
  "timestamp": "2025-09-04T10:30:45.123Z"
}
```

### GET /webhook/gtm/health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "GTM Webhook Handler",
  "version": "1.0.0",
  "security": {
    "api_key_configured": true,
    "authentication_enabled": true
  },
  "configuration": {
    "processing_delay_ms": 5000,
    "max_retries": 3,
    "retry_delay_ms": 2000
  }
}
```

## Testing

### Local Testing
```bash
# Test the GTM webhook
npm run test-gtm

# Test with custom booking ID
curl -X POST http://localhost:3000/webhook/gtm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "ecommerce": {"transaction_id": "123456"},
    "variables": {
      "TH - url - affiliate_id": "test-affiliate",
      "TH - url - first_campaign_id": "test-campaign"
    }
  }'
```

## Monitoring

### Railway Logs
All GTM webhook events are logged with detailed information:

```
🏷️ [GTM] Webhook received for transaction 66379912
⏱️ Applying 5000ms delay to ensure Bokun webhook processes first...
🔄 Searching for activity_bookings with booking_id=66379912
✅ Found 2 activity booking(s) for booking_id 66379912
✅ Updated activity_booking 12345 with affiliate and campaign data
✅ Successfully updated 2 activity booking(s)
```

### Database Logs
Optional `gtm_logs` table tracks all events:
- Event timestamps
- Processing duration
- Success/failure status
- Affiliate and campaign data
- Error details

## Error Handling

### Common Issues

1. **No activity bookings found**
   - The webhook includes 3 retries with 2-second delays
   - Total wait time: 5s initial + 6s retries = 11 seconds
   - If still not found, returns warning but doesn't fail

2. **Invalid transaction_id**
   - Must be numeric or contain numeric part
   - Examples: "123456" ✓, "BOOKING-123456" ✓, "ABC" ✗

3. **Missing authentication**
   - Returns 401 if Authorization header missing
   - Returns 403 if API key invalid

## Performance Considerations

- **5-second delay**: Built-in to ensure Bokun processes first
- **Batch updates**: Updates all activity_bookings for a booking_id
- **Retry logic**: 3 retries with 2-second delays if not found
- **Logging**: Comprehensive but doesn't block processing
- **Database indexes**: Created on booking_id for fast lookups

## Security

1. **API Key Authentication**: Required for all requests
2. **HTTPS Only**: Use in production
3. **Rate Limiting**: Implement at proxy/load balancer level
4. **IP Whitelisting**: Optional - restrict to GTM Server IPs

## Troubleshooting

### Check if columns exist
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'activity_bookings' 
AND column_name IN ('affiliate_id', 'first_campaign');
```

### View recent GTM logs
```sql
SELECT * FROM gtm_logs 
ORDER BY timestamp DESC 
LIMIT 20;
```

### Check specific booking
```sql
SELECT booking_id, affiliate_id, first_campaign, status 
FROM activity_bookings 
WHERE booking_id = 66379912;
```

## Support
For issues, check:
1. Railway logs for detailed error messages
2. GTM Server-Side container logs
3. Supabase logs for database errors
4. This documentation for configuration steps