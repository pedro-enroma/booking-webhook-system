import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Test script for GTM webhook integration
 * Run with: npm run test-gtm
 */
async function testGTMWebhook() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const apiKey = process.env.GTM_WEBHOOK_API_KEY;
  
  console.log('\n' + '='.repeat(70));
  console.log('🧪 GTM Webhook Integration Test');
  console.log('='.repeat(70));
  
  // Test cases
  const testCases = [
    {
      name: 'Full GTM payload with both affiliate and campaign',
      payload: {
        ecommerce: {
          transaction_id: '66379912', // Use a real booking ID from your system
          value: 186.00,
          currency: 'EUR',
          items: [
            {
              item_id: '217949',
              item_name: 'Vatican Museums Tour',
              price: 93.00,
              quantity: 2
            }
          ]
        },
        variables: {
          'TH - url - affiliate_id': 'cometeelmundo',
          'TH - url - first_campaign_id': 'que-ver-en-roma-3-dias-tab'
        },
        event_name: 'purchase',
        client_id: 'GA1.2.1234567890.1234567890',
        session_id: 'sess_12345',
        page: {
          location: 'https://enroma.com/checkout/success',
          referrer: 'https://enroma.com/cart',
          title: 'Order Confirmation'
        },
        debug: true
      }
    },
    {
      name: 'Only affiliate ID',
      payload: {
        ecommerce: {
          transaction_id: '66379912'
        },
        variables: {
          'TH - url - affiliate_id': 'tripadvisor'
        },
        event_name: 'purchase'
      }
    },
    {
      name: 'Only campaign ID',
      payload: {
        ecommerce: {
          transaction_id: '66379912'
        },
        variables: {
          'TH - url - first_campaign_id': 'summer-sale-2024'
        },
        event_name: 'purchase'
      }
    }
  ];
  
  // Run tests
  for (const testCase of testCases) {
    console.log('\n' + '-'.repeat(70));
    console.log(`📝 Test: ${testCase.name}`);
    console.log('-'.repeat(70));
    
    try {
      const startTime = Date.now();
      
      const headers: any = {
        'Content-Type': 'application/json'
      };
      
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      console.log('📤 Sending request to:', `${baseUrl}/webhook/gtm`);
      console.log('📦 Payload:', JSON.stringify(testCase.payload, null, 2));
      
      const response = await axios.post(
        `${baseUrl}/webhook/gtm`,
        testCase.payload,
        { headers }
      );
      
      const duration = Date.now() - startTime;
      
      console.log('✅ Response received');
      console.log('📊 Status:', response.status);
      console.log('📋 Response:', JSON.stringify(response.data, null, 2));
      console.log(`⏱️ Total time: ${duration}ms`);
      
      if (response.data.success) {
        console.log('✅ TEST PASSED');
      } else {
        console.log('⚠️ TEST COMPLETED WITH WARNING:', response.data.warning);
      }
      
    } catch (error: any) {
      console.error('❌ TEST FAILED');
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Error:', error.response.data);
      } else {
        console.error('Error:', error.message);
      }
    }
  }
  
  // Test health endpoint
  console.log('\n' + '-'.repeat(70));
  console.log('📝 Test: Health Check');
  console.log('-'.repeat(70));
  
  try {
    const response = await axios.get(`${baseUrl}/webhook/gtm/health`);
    console.log('✅ Health check response:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('❌ Health check failed:', error.message);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('🏁 GTM Webhook Tests Completed');
  console.log('='.repeat(70) + '\n');
}

// Run the test
testGTMWebhook().catch(console.error);