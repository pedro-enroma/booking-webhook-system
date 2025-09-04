import { Router, Request, Response } from 'express';
import { GTMService } from '../services/gtmService';
import { GTMWebhookPayload } from '../types/gtm.types';
import * as crypto from 'crypto';

const router = Router();
const gtmService = new GTMService();

// Middleware for GTM webhook authentication
function authenticateGTMWebhook(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  const apiKey = process.env.GTM_WEBHOOK_API_KEY;
  
  // If no API key is configured, log warning but allow request (for initial setup)
  if (!apiKey) {
    console.warn('⚠️ GTM_WEBHOOK_API_KEY not configured - webhook is unprotected!');
    return next();
  }
  
  // Check Bearer token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('❌ GTM webhook rejected - missing authorization header');
    return res.status(401).json({ 
      success: false, 
      error: 'Authorization required' 
    });
  }
  
  const token = authHeader.substring(7);
  if (token !== apiKey) {
    console.error('❌ GTM webhook rejected - invalid API key');
    return res.status(403).json({ 
      success: false, 
      error: 'Invalid API key' 
    });
  }
  
  next();
}

/**
 * POST /webhook/gtm
 * Receives tracking data from Google Tag Manager Server-Side
 * Updates activity_bookings with affiliate_id and first_campaign
 */
router.post('/webhook/gtm', authenticateGTMWebhook, async (req: Request, res: Response) => {
  const requestId = crypto.randomBytes(8).toString('hex');
  const startTime = Date.now();
  
  console.log('\n' + '='.repeat(70));
  console.log(`🏷️ [GTM-${requestId}] Webhook received at ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  try {
    const payload: GTMWebhookPayload = req.body;
    
    // Log incoming data structure
    console.log('📊 Incoming GTM data:');
    console.log('- Transaction ID:', payload.ecommerce?.transaction_id);
    console.log('- Affiliate ID:', payload.variables?.['TH - url - affiliate_id']);
    console.log('- First Campaign:', payload.variables?.['TH - url - first_campaign_id']);
    console.log('- Event Name:', payload.event_name);
    console.log('- Client ID:', payload.client_id);
    console.log('- Debug Mode:', payload.debug || false);
    
    // Validate required fields
    if (!payload.ecommerce?.transaction_id) {
      console.error('❌ Missing required field: ecommerce.transaction_id');
      return res.status(400).json({
        success: false,
        error: 'Missing required field: ecommerce.transaction_id',
        request_id: requestId
      });
    }
    
    // Check for required GTM variables
    const affiliateId = payload.variables?.['TH - url - affiliate_id'];
    const firstCampaign = payload.variables?.['TH - url - first_campaign_id'];
    
    if (!affiliateId && !firstCampaign) {
      console.warn('⚠️ No affiliate_id or first_campaign provided - nothing to update');
      return res.status(200).json({
        success: true,
        message: 'No tracking data to update',
        request_id: requestId,
        warning: 'Neither affiliate_id nor first_campaign were provided'
      });
    }
    
    // Process the webhook with the GTM service
    console.log(`🔄 Processing GTM webhook for transaction: ${payload.ecommerce.transaction_id}`);
    
    const result = await gtmService.processGTMWebhook(payload);
    
    const processingTime = Date.now() - startTime;
    
    // Log final result
    console.log('='.repeat(70));
    if (result.success) {
      console.log(`✅ [GTM-${requestId}] Successfully processed`);
      console.log(`- Booking ID: ${result.booking_id}`);
      console.log(`- Records Updated: ${result.records_updated}`);
      console.log(`- Affiliate ID: ${result.affiliate_id || 'N/A'}`);
      console.log(`- First Campaign: ${result.first_campaign || 'N/A'}`);
      console.log(`- Total Time: ${processingTime}ms`);
    } else {
      console.warn(`⚠️ [GTM-${requestId}] Processed with warnings`);
      console.log(`- Warning: ${result.warning}`);
      console.log(`- Total Time: ${processingTime}ms`);
    }
    console.log('='.repeat(70) + '\n');
    
    // Return response
    return res.status(200).json({
      success: result.success,
      request_id: requestId,
      booking_id: result.booking_id,
      records_updated: result.records_updated,
      affiliate_id: result.affiliate_id,
      first_campaign: result.first_campaign,
      processing_time_ms: processingTime,
      delay_applied_ms: result.delay_applied_ms,
      warning: result.warning,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    
    console.error('='.repeat(70));
    console.error(`❌ [GTM-${requestId}] Error processing webhook`);
    console.error('- Error:', error.message);
    console.error('- Stack:', error.stack);
    console.error(`- Processing Time: ${processingTime}ms`);
    console.error('='.repeat(70) + '\n');
    
    return res.status(500).json({
      success: false,
      error: error.message,
      request_id: requestId,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /webhook/gtm/health
 * Health check endpoint for GTM webhook
 */
router.get('/webhook/gtm/health', (req: Request, res: Response) => {
  const hasApiKey = !!process.env.GTM_WEBHOOK_API_KEY;
  
  res.json({
    status: 'ok',
    service: 'GTM Webhook Handler',
    version: '1.0.0',
    security: {
      api_key_configured: hasApiKey,
      authentication_enabled: hasApiKey
    },
    configuration: {
      processing_delay_ms: 5000,
      max_retries: 3,
      retry_delay_ms: 2000
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /webhook/gtm/test
 * Test endpoint for GTM webhook (only in development)
 */
if (process.env.NODE_ENV !== 'production') {
  router.post('/webhook/gtm/test', async (req: Request, res: Response) => {
    console.log('🧪 GTM Test webhook received');
    
    // Create test payload
    const testPayload: GTMWebhookPayload = {
      ecommerce: {
        transaction_id: req.body.booking_id || '123456',
        value: 150.00,
        currency: 'EUR'
      },
      variables: {
        'TH - url - affiliate_id': req.body.affiliate_id || 'test-affiliate',
        'TH - url - first_campaign_id': req.body.first_campaign || 'test-campaign'
      },
      event_name: 'purchase',
      client_id: 'test-client-123',
      debug: true,
      test_mode: true
    };
    
    try {
      const result = await gtmService.processGTMWebhook(testPayload);
      
      res.json({
        success: true,
        message: 'Test webhook processed',
        test_mode: true,
        result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        test_mode: true,
        error: error.message
      });
    }
  });
}

export default router;