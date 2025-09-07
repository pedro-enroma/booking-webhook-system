/**
 * GTM Consent Mode Handler for CookieYes
 * This script ensures affiliate and campaign tracking works regardless of consent status
 * 
 * Add this to your website's purchase confirmation page
 */

(function() {
  'use strict';
  
  // Configuration
  const WEBHOOK_URL = 'https://your-domain.com/webhook/gtm-enhanced'; // Update with your actual URL
  const FALLBACK_URL = 'https://your-domain.com/webhook/tracking-fallback';
  const DEBUG = true; // Set to false in production
  
  /**
   * Log helper
   */
  function log(message, data) {
    if (DEBUG) {
      console.log(`[GTM Consent Handler] ${message}`, data || '');
    }
  }
  
  /**
   * Get URL parameters
   */
  function getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }
  
  /**
   * Get data from localStorage with fallback to sessionStorage
   */
  function getStoredData(key) {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  }
  
  /**
   * Store tracking parameters when user first lands
   */
  function storeTrackingParams() {
    const affiliateId = getUrlParam('affiliate_id');
    const firstCampaign = getUrlParam('first_campaign_id');
    
    if (affiliateId) {
      localStorage.setItem('th_affiliate_id', affiliateId);
      sessionStorage.setItem('th_affiliate_id', affiliateId);
      log('Stored affiliate_id:', affiliateId);
    }
    
    if (firstCampaign) {
      localStorage.setItem('th_first_campaign_id', firstCampaign);
      sessionStorage.setItem('th_first_campaign_id', firstCampaign);
      log('Stored first_campaign_id:', firstCampaign);
    }
  }
  
  /**
   * Check CookieYes consent status
   */
  function checkCookieYesConsent() {
    // CookieYes sets these variables
    if (typeof CookieYes !== 'undefined' && CookieYes.consent) {
      return {
        analytics: CookieYes.consent.analytics || false,
        advertisement: CookieYes.consent.advertisement || false,
        functional: CookieYes.consent.functional || false
      };
    }
    
    // Check GTM consent state
    if (window.dataLayer) {
      const consentState = window.dataLayer.find(item => 
        item.event === 'consent_update' || item.event === 'consent_default'
      );
      if (consentState) {
        return {
          analytics: consentState.analytics_storage === 'granted',
          advertisement: consentState.ad_storage === 'granted',
          functional: true
        };
      }
    }
    
    return {
      analytics: false,
      advertisement: false,
      functional: true
    };
  }
  
  /**
   * Send tracking data directly to webhook
   */
  function sendDirectTracking(transactionId) {
    const consent = checkCookieYesConsent();
    
    // Get stored tracking parameters
    const affiliateId = getStoredData('th_affiliate_id') || getUrlParam('affiliate_id');
    const firstCampaign = getStoredData('th_first_campaign_id') || getUrlParam('first_campaign_id');
    
    if (!affiliateId && !firstCampaign) {
      log('No tracking parameters found');
      return;
    }
    
    const payload = {
      direct_tracking: true,
      transaction_id: transactionId,
      booking_id: transactionId,
      affiliate_id: affiliateId,
      first_campaign: firstCampaign,
      consent_mode: consent.analytics ? 'granted' : 'denied',
      cookieyes_consent: JSON.stringify(consent),
      page_location: window.location.href,
      client_id: getStoredData('ga_client_id') || 'direct-' + Date.now(),
      timestamp: new Date().toISOString()
    };
    
    log('Sending direct tracking:', payload);
    
    // Send to enhanced webhook
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        log('✅ Direct tracking successful:', data);
      } else if (data.needs_client_retry) {
        // Retry with fallback endpoint
        return sendFallbackTracking(transactionId, affiliateId, firstCampaign);
      } else {
        log('⚠️ Direct tracking warning:', data);
      }
    })
    .catch(error => {
      log('❌ Direct tracking error:', error);
      // Try fallback
      sendFallbackTracking(transactionId, affiliateId, firstCampaign);
    });
  }
  
  /**
   * Send to fallback endpoint
   */
  function sendFallbackTracking(transactionId, affiliateId, firstCampaign) {
    const fallbackPayload = {
      booking_id: transactionId,
      transaction_id: transactionId,
      affiliate_id: affiliateId,
      first_campaign: firstCampaign,
      localStorage: {
        affiliate_id: getStoredData('th_affiliate_id'),
        first_campaign_id: getStoredData('th_first_campaign_id')
      }
    };
    
    log('Sending fallback tracking:', fallbackPayload);
    
    fetch(FALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fallbackPayload)
    })
    .then(response => response.json())
    .then(data => {
      log('✅ Fallback tracking result:', data);
    })
    .catch(error => {
      log('❌ Fallback tracking error:', error);
    });
  }
  
  /**
   * Hook into GTM purchase event
   */
  function hookPurchaseEvent() {
    // Listen for GTM purchase events
    if (window.dataLayer) {
      const originalPush = window.dataLayer.push;
      
      window.dataLayer.push = function() {
        const result = originalPush.apply(window.dataLayer, arguments);
        
        // Check if this is a purchase event
        for (let i = 0; i < arguments.length; i++) {
          const item = arguments[i];
          if (item.event === 'purchase' || item.event === 'transaction') {
            const transactionId = item.ecommerce?.transaction_id || 
                                 item.transaction_id ||
                                 item.value?.transaction_id;
            
            if (transactionId) {
              log('Purchase event detected:', transactionId);
              
              // Always send direct tracking as backup
              setTimeout(() => {
                sendDirectTracking(transactionId);
              }, 100); // Small delay to let GTM process first
            }
          }
        }
        
        return result;
      };
    }
  }
  
  /**
   * Check if on purchase confirmation page
   */
  function checkPurchasePage() {
    // Look for transaction ID in various places
    const transactionId = 
      // From URL
      getUrlParam('booking_id') ||
      getUrlParam('transaction_id') ||
      getUrlParam('order_id') ||
      // From page content (adjust selectors for your site)
      document.querySelector('[data-transaction-id]')?.dataset.transactionId ||
      document.querySelector('.booking-id')?.textContent?.match(/\d+/)?.[0] ||
      // From dataLayer
      window.dataLayer?.find(item => item.ecommerce?.transaction_id)?.ecommerce?.transaction_id;
    
    if (transactionId) {
      log('Purchase page detected with transaction:', transactionId);
      
      // Send tracking immediately
      sendDirectTracking(transactionId);
      
      // Also set up listener for GTM event
      hookPurchaseEvent();
    }
  }
  
  /**
   * Initialize on page load
   */
  function init() {
    log('Initializing GTM Consent Handler');
    
    // Store tracking params if present
    storeTrackingParams();
    
    // Check consent status
    const consent = checkCookieYesConsent();
    log('Consent status:', consent);
    
    // Hook into purchase events
    hookPurchaseEvent();
    
    // Check if this is a purchase page
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkPurchasePage);
    } else {
      checkPurchasePage();
    }
    
    // Listen for CookieYes consent changes
    if (window.CookieYes) {
      window.CookieYes.onConsentUpdate = function() {
        log('Consent updated:', checkCookieYesConsent());
        // Re-check purchase page in case consent was just granted
        checkPurchasePage();
      };
    }
  }
  
  // Initialize
  init();
  
  // Expose for debugging
  if (DEBUG) {
    window.GTMConsentHandler = {
      checkConsent: checkCookieYesConsent,
      sendTracking: sendDirectTracking,
      getStoredData: getStoredData
    };
  }
  
})();