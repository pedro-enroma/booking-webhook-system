import axios from 'axios';

// Configuration
const BASE_URL = process.env.WEBHOOK_URL || 'http://localhost:3000';
const CONFIRMATION_CODE = 'BUE-65636576';

// Test webhook payloads that simulate the problematic scenario
const webhooks = [
  {
    name: 'BOOKING_CONFIRMED',
    delay: 0,
    payload: {
      action: 'BOOKING_CONFIRMED',
      status: 'CONFIRMED',
      bookingId: 114421,
      confirmationCode: CONFIRMATION_CODE,
      productId: 'test-product-1',
      title: 'Test Activity',
      startDateTime: '2025-09-21T18:29:44.947Z',
      endDateTime: '2025-09-21T20:29:44.947Z',
      totalPrice: 100,
      parentBooking: {
        bookingId: 112328,
        confirmationCode: CONFIRMATION_CODE,
        status: 'CONFIRMED',
        customer: {
          id: 1001,
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        },
        seller: {
          id: 2001,
          title: 'Test Seller'
        },
        totalPrice: 100,
        currency: 'EUR',
        creationDate: new Date().toISOString()
      }
    }
  },
  {
    name: 'BOOKING_ITEM_CANCELLED (Out of order - comes too early)',
    delay: 1000,
    payload: {
      action: 'BOOKING_ITEM_CANCELLED',
      status: 'CANCELLED',
      bookingId: 114421,
      confirmationCode: CONFIRMATION_CODE,
      productId: 'test-product-1',
      title: 'Test Activity',
      startDateTime: '2025-09-21T18:29:44.947Z',
      endDateTime: '2025-09-21T20:29:44.947Z',
      parentBookingId: 112328
    }
  },
  {
    name: 'BOOKING_UPDATED (Problematic - comes after cancellation)',
    delay: 2000,
    payload: {
      action: 'BOOKING_UPDATED',
      status: 'CONFIRMED', // This is the problem - it's trying to set back to CONFIRMED
      bookingId: 114421,
      confirmationCode: CONFIRMATION_CODE,
      productId: 'test-product-1',
      title: 'Test Activity',
      startDateTime: '2025-09-21T18:29:45.288Z',
      endDateTime: '2025-09-21T20:29:45.288Z',
      totalPrice: 100,
      parentBooking: {
        bookingId: 112328,
        confirmationCode: CONFIRMATION_CODE,
        status: 'CONFIRMED',
        customer: {
          id: 1001,
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        },
        totalPrice: 100,
        currency: 'EUR'
      }
    }
  }
];

async function sendWebhook(webhook: any) {
  console.log(`\n📤 Sending ${webhook.name}...`);
  try {
    const response = await axios.post(
      `${BASE_URL}/webhook/booking`,
      webhook.payload,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Response: ${response.status} - ${JSON.stringify(response.data)}`);

    if (response.data.warning) {
      console.log(`⚠️ Warning: ${response.data.warning}`);
    }

    return response.data;
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`Response: ${JSON.stringify(error.response.data)}`);
    }
  }
}

async function checkWebhookHistory() {
  console.log('\n📊 Checking webhook history...');
  try {
    const response = await axios.get(
      `${BASE_URL}/webhook/debug/history/${CONFIRMATION_CODE}`
    );

    console.log('\n🔍 Webhook Analysis:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.data.issues && response.data.issues.length > 0) {
      console.log('\n⚠️ ISSUES DETECTED:');
      response.data.issues.forEach((issue: any) => {
        console.log(`  - ${issue.type}: ${issue.message}`);
        if (issue.previous_status && issue.new_status) {
          console.log(`    Status change: ${issue.previous_status} → ${issue.new_status}`);
        }
      });
    }

    return response.data;
  } catch (error: any) {
    console.error(`❌ Error checking history: ${error.message}`);
  }
}

async function getWebhookLogs(bookingId: string) {
  console.log(`\n📋 Getting webhook logs for booking ${bookingId}...`);
  try {
    const response = await axios.get(
      `${BASE_URL}/webhook/debug/logs/${bookingId}`
    );

    console.log(`Found ${response.data.webhook_count} webhooks`);

    response.data.webhooks.forEach((webhook: any) => {
      console.log(`\n  - ${webhook.action} | ${webhook.status} | ${webhook.received_at}`);
      if (webhook.out_of_order) {
        console.log('    ⚠️ OUT OF ORDER');
      }
      if (webhook.is_duplicate) {
        console.log('    ⚠️ DUPLICATE');
      }
      if (webhook.processing_result === 'SKIPPED') {
        console.log(`    🚫 SKIPPED: ${webhook.error_message}`);
      }
    });

    return response.data;
  } catch (error: any) {
    console.error(`❌ Error getting logs: ${error.message}`);
  }
}

async function generateReport() {
  console.log('\n📊 Generating webhook report...');
  try {
    const response = await axios.get(
      `${BASE_URL}/webhook/debug/report`
    );

    console.log('\n' + response.data);
    return response.data;
  } catch (error: any) {
    console.error(`❌ Error generating report: ${error.message}`);
  }
}

async function getLogFilePath() {
  try {
    const response = await axios.get(
      `${BASE_URL}/webhook/debug/log-file`
    );

    console.log(`\n📁 Detailed log file: ${response.data.log_file_path}`);
    return response.data.log_file_path;
  } catch (error: any) {
    console.error(`❌ Error getting log file path: ${error.message}`);
  }
}

async function runTest() {
  console.log('🧪 Starting webhook logging test...');
  console.log('=' .repeat(80));
  console.log('This test simulates the problematic scenario:');
  console.log('1. BOOKING_CONFIRMED webhook');
  console.log('2. BOOKING_ITEM_CANCELLED webhook (cancellation)');
  console.log('3. BOOKING_UPDATED webhook (tries to restore CONFIRMED status)');
  console.log('=' .repeat(80));

  // Send webhooks in sequence with delays
  for (const webhook of webhooks) {
    if (webhook.delay > 0) {
      console.log(`\n⏱️ Waiting ${webhook.delay}ms before next webhook...`);
      await new Promise(resolve => setTimeout(resolve, webhook.delay));
    }
    await sendWebhook(webhook);
  }

  // Wait a bit for processing
  console.log('\n⏱️ Waiting for processing to complete...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Check the results
  await checkWebhookHistory();
  await getWebhookLogs('114421');
  await generateReport();
  await getLogFilePath();

  console.log('\n✅ Test completed!');
  console.log('\n📝 Summary:');
  console.log('1. Check the detailed log file for complete webhook processing details');
  console.log('2. Check the database webhook_logs table for stored webhook data');
  console.log('3. The system should have detected and handled the out-of-order UPDATE');
  console.log('4. The booking should remain in CANCELLED status despite the UPDATE webhook');
}

// Run the test
runTest().catch(console.error);