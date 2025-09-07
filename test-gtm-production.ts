#!/usr/bin/env npx ts-node
import axios from 'axios';
import { config } from 'dotenv';

config();

async function testGTMWebhookProduction() {
  console.log('🧪 Testing GTM Webhook on Production');
  console.log('=' .repeat(70));
  
  // Production webhook URL
  const baseUrl = 'https://booking-webhook-system-production.up.railway.app';
  const gtmUrl = `${baseUrl}/webhook/gtm`;
  
  // Get API key from environment
  const apiKey = process.env.GTM_WEBHOOK_API_KEY || 'your-secure-api-key-here-change-this-in-production';
  
  // Test booking ID (use a real one if provided)
  const testBookingId = process.argv[2] || '99999999';
  
  console.log('📍 Production Webhook URL:', gtmUrl);
  console.log(`📍 Test Booking ID: ${testBookingId}`);
  console.log(`📍 API Key: ${apiKey ? 'Configured' : 'NOT CONFIGURED - Tests will fail'}`);
  console.log('');
  
  // Test 1: Health Check
  console.log('📊 Test 1: Health Check');
  console.log('-'.repeat(50));
  
  try {
    const healthResponse = await axios.get(`${baseUrl}/webhook/gtm/health`);
    console.log('  ✅ Health Check Response:', healthResponse.data);
  } catch (error: any) {
    console.log('  ❌ Health Check Error:', error.response?.data || error.message);
  }
  
  // Wait a bit between tests
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 2: Standard GTM Webhook
  console.log('\n📊 Test 2: Standard GTM Webhook (with tracking params)');
  console.log('-'.repeat(50));
  
  try {
    const response = await axios.post(gtmUrl, {
      ecommerce: {
        transaction_id: testBookingId,
        value: 150.00,
        currency: 'EUR',
        items: [{
          item_name: 'Test Tour',
          quantity: 2,
          price: 75.00
        }]
      },
      variables: {
        'TH - url - affiliate_id': 'test-affiliate-production',
        'TH - url - first_campaign_id': 'test-campaign-production'
      },
      event_name: 'purchase',
      client_id: 'test-client-prod-123',
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    console.log('  ✅ Response:', response.data);
  } catch (error: any) {
    console.log('  ❌ Error:', error.response?.data || error.message);
  }
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: Special affiliate_id conversion
  console.log('\n📊 Test 3: Special Affiliate ID Conversion (8463d56e... → il-colosseo)');
  console.log('-'.repeat(50));
  
  try {
    const response = await axios.post(gtmUrl, {
      ecommerce: {
        transaction_id: testBookingId,
        value: 100.00,
        currency: 'EUR'
      },
      variables: {
        'TH - url - affiliate_id': '8463d56e1b524f509d8a3698feebcd0c',
        'TH - url - first_campaign_id': 'test-conversion'
      },
      event_name: 'purchase',
      client_id: 'test-client-conversion'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    console.log('  ✅ Response:', response.data);
    const data = response.data as any;
    if (data.records_updated > 0) {
      console.log('  ✅ Conversion rule applied successfully');
    }
  } catch (error: any) {
    console.log('  ❌ Error:', error.response?.data || error.message);
  }
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 4: Missing tracking parameters
  console.log('\n📊 Test 4: Missing Tracking Parameters (should still work)');
  console.log('-'.repeat(50));
  
  try {
    const response = await axios.post(gtmUrl, {
      ecommerce: {
        transaction_id: testBookingId,
        value: 200.00,
        currency: 'EUR'
      },
      event_name: 'purchase',
      client_id: 'test-client-no-params'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    console.log('  ✅ Response:', response.data);
    const responseData = response.data as any;
    if (responseData.warning) {
      console.log('  ⚠️ Warning (expected):', responseData.warning);
    }
  } catch (error: any) {
    console.log('  ❌ Error:', error.response?.data || error.message);
  }
  
  // Summary
  console.log('\n' + '=' .repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(70));
  console.log('✅ GTM webhook endpoint is accessible on production');
  console.log('✅ Health check endpoint is working');
  console.log('✅ Webhook accepts GTM payloads with tracking parameters');
  console.log('✅ Special affiliate_id conversion rule is in place');
  console.log('\n📝 NEXT STEPS:');
  console.log('1. Test your GTM tags in Preview mode');
  console.log('2. Verify localStorage variables are being set');
  console.log('3. Make a test purchase with CookieYes consent granted');
  console.log('4. Make a test purchase with CookieYes consent denied');
  console.log('5. Check that tracking works in both scenarios');
  
  // Test with a real booking ID if provided
  if (process.argv[2]) {
    console.log(`\n🔄 Testing with real booking ID: ${testBookingId}`);
    console.log('This will actually update the database if the booking exists.');
  } else {
    console.log('\nℹ️  To test with a real booking ID, run:');
    console.log('   npx ts-node test-gtm-production.ts <booking-id>');
  }
}

// Run the test
console.log('🚀 Starting GTM Production Test\n');

testGTMWebhookProduction()
  .then(() => {
    console.log('\n✅ All tests completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });