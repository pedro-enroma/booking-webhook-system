# Webhook Logging System - Documentation

## Overview
This webhook logging system helps debug and track webhook processing issues, specifically the problem where Bokun sends webhooks out of order (cancellation before update), causing incorrect reservation status in Supabase.

## Problem Being Solved
When Bokun sends multiple webhooks for the same booking:
1. **CANCELLATION webhook arrives first**
2. **UPDATE webhook arrives second** (with CONFIRMED status)

Without proper handling, the UPDATE webhook would override the CANCELLED status, leaving the reservation incorrectly marked as CONFIRMED.

## Features

### 1. Detailed Webhook Logging
- Every webhook is logged with timestamp, payload, and processing result
- Logs are saved both to file and database
- Tracks webhook sequence and detects out-of-order issues

### 2. Out-of-Order Detection
The system automatically detects:
- Webhooks arriving out of sequence
- UPDATE webhooks trying to override CANCELLED status
- Duplicate webhooks

### 3. Smart Webhook Handling
When an out-of-order UPDATE is detected after a CANCELLATION:
- The UPDATE webhook is **SKIPPED** to preserve the CANCELLED status
- The skip is logged for audit purposes
- A warning is returned in the response

## Setup Instructions

### 1. Create Database Tables
Run the SQL script in your Supabase dashboard:

```sql
-- Copy contents from src/database/create-webhook-logs-table.sql
```

Or run the setup script:
```bash
npm run setup-webhook-logging
```

### 2. Install Dependencies
The system uses the existing dependencies. No additional packages needed.

### 3. Start the Server
```bash
npm run dev
```

## Testing the System

### 1. Run the Test Script
```bash
npm run test-webhook-logging
```

This simulates the problematic scenario with out-of-order webhooks.

### 2. Manual Testing with Bokun
1. Create a test booking in Bokun
2. Cancel it immediately
3. Watch the logs to see how webhooks are processed

## Debug Endpoints

### 1. Check Webhook History for a Confirmation Code
```
GET /webhook/debug/history/:confirmationCode
```

Example:
```bash
curl http://localhost:3000/webhook/debug/history/BUE-65636576
```

Response shows:
- Complete webhook sequence
- Any detected issues
- Out-of-order problems

### 2. Get Webhook Logs for a Booking
```
GET /webhook/debug/logs/:bookingId
```

Example:
```bash
curl http://localhost:3000/webhook/debug/logs/114421
```

### 3. Generate Webhook Report
```
GET /webhook/debug/report
```

Optional query parameters:
- `startDate`: ISO date string (default: last 24 hours)
- `endDate`: ISO date string (default: now)

Example:
```bash
curl "http://localhost:3000/webhook/debug/report?startDate=2025-09-20&endDate=2025-09-21"
```

### 4. Get Log File Path
```
GET /webhook/debug/log-file
```

Returns the path to the detailed log file on disk.

## Log Files

Detailed logs are saved to:
```
webhook-logs/webhook-detailed-[timestamp].log
```

Each log entry includes:
- Webhook received timestamp
- Booking IDs and confirmation codes
- Action and status
- Raw payload summary
- Processing result
- Any detected issues

## Database Schema

The `webhook_logs` table stores:
- `booking_id`: The booking ID from the webhook
- `parent_booking_id`: Parent booking ID if applicable
- `confirmation_code`: Booking confirmation code
- `action`: Webhook action (BOOKING_CONFIRMED, BOOKING_UPDATED, etc.)
- `status`: Booking status (CONFIRMED, CANCELLED, etc.)
- `webhook_type`: BOOKING or AVAILABILITY
- `received_at`: When webhook was received
- `processing_started_at`: When processing began
- `processing_completed_at`: When processing finished
- `processing_duration_ms`: Processing time in milliseconds
- `raw_payload`: Complete webhook payload (JSONB)
- `processing_result`: SUCCESS, ERROR, or SKIPPED
- `error_message`: Error details if any
- `out_of_order`: Flag for out-of-order detection
- `is_duplicate`: Flag for duplicate detection

## How It Works

1. **Webhook Received**:
   - Logged immediately with timestamp
   - Analyzed for sequence issues

2. **Sequence Analysis**:
   - Checks if CANCELLATION came before CONFIRMATION
   - Checks if UPDATE comes after CANCELLATION
   - Marks webhooks as out-of-order if detected

3. **Processing Decision**:
   - Normal webhooks: Process as usual
   - Out-of-order UPDATE after CANCELLATION: **SKIP** to preserve CANCELLED status
   - Duplicates: Process but mark as duplicate

4. **Logging**:
   - File: Detailed human-readable logs
   - Database: Structured data for queries
   - Console: Real-time processing info

## Monitoring

### Check for Issues
```sql
-- In Supabase SQL editor
SELECT * FROM webhook_issues;  -- View for problematic webhooks
SELECT * FROM webhook_sequences WHERE webhook_count > 3;  -- Complex sequences
```

### Recent Out-of-Order Webhooks
```sql
SELECT
  confirmation_code,
  booking_id,
  action,
  status,
  received_at
FROM webhook_logs
WHERE out_of_order = TRUE
ORDER BY received_at DESC
LIMIT 10;
```

## Troubleshooting

### If webhooks are still being processed incorrectly:

1. **Check the logs**:
   - Look for "OUT OF ORDER WEBHOOK DETECTED" messages
   - Check if webhooks are being skipped properly

2. **Verify database**:
   - Check `webhook_logs` table for the booking
   - Look at `processing_result` column

3. **Review sequence**:
   - Use `/webhook/debug/history/:confirmationCode` endpoint
   - Check the order of webhooks received

### Common Issues:

- **Webhook not logged**: Check if WebhookLogger is initialized
- **Database errors**: Verify webhook_logs table exists
- **Skipping not working**: Check the out-of-order detection logic

## Production Deployment

1. **Environment Variables**:
   - Ensure all database connections are configured
   - Set appropriate log levels

2. **Log Rotation**:
   - Implement log rotation for file logs
   - Archive old webhook_logs records periodically

3. **Monitoring**:
   - Set up alerts for high error rates
   - Monitor out-of-order webhook frequency

4. **Performance**:
   - Index webhook_logs table properly (already included in SQL)
   - Consider partitioning for high-volume scenarios

## Contact & Support

For issues or questions about the webhook logging system:
1. Check the detailed log files
2. Review the webhook_logs database table
3. Use the debug endpoints to analyze specific bookings