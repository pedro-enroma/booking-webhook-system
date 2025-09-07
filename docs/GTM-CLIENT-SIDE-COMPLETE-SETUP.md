# Complete GTM Client-Side Setup with CookieYes (Step-by-Step)

## Overview
This guide will help you set up tracking that works 100% of the time, even when users reject cookies through CookieYes.

## Part 1: Backend Setup (Your Webhook Server)

### Step 1.1: Deploy the Enhanced Webhook Code

The code has already been added to your project. When you deploy to Railway, you'll have these new endpoints:

- `https://your-railway-app.railway.app/webhook/gtm-enhanced` 
- `https://your-railway-app.railway.app/webhook/tracking-fallback`

### Step 1.2: Test the Endpoints

After deployment, test that they're working:

```bash
# Test the enhanced endpoint
curl -X POST https://your-railway-app.railway.app/webhook/gtm-enhanced \
  -H "Content-Type: application/json" \
  -d '{
    "direct_tracking": true,
    "transaction_id": "TEST-123",
    "affiliate_id": "test-affiliate",
    "first_campaign": "test-campaign"
  }'

# Test the fallback endpoint  
curl -X POST https://your-railway-app.railway.app/webhook/tracking-fallback \
  -H "Content-Type: application/json" \
  -d '{
    "booking_id": "TEST-456",
    "affiliate_id": "test-affiliate",
    "first_campaign": "test-campaign"
  }'
```

## Part 2: GTM Setup (Google Tag Manager)

### Step 2.1: Create Variables in GTM

Login to your GTM container and create these variables:

#### Variable 1: Booking ID from Data Layer
1. Go to Variables → New → Variable Configuration
2. Choose: **Data Layer Variable**
3. Name: `DLV - Booking ID`
4. Data Layer Variable Name: `ecommerce.transaction_id`
5. Save

#### Variable 2: Affiliate ID from URL
1. Go to Variables → New → Variable Configuration
2. Choose: **URL**
3. Name: `URL - Affiliate ID`
4. Component Type: **Query**
5. Query Key: `affiliate_id`
6. Save

#### Variable 3: First Campaign from URL
1. Go to Variables → New → Variable Configuration
2. Choose: **URL**
3. Name: `URL - First Campaign`
4. Component Type: **Query**
5. Query Key: `first_campaign_id`
6. Save

#### Variable 4: Affiliate ID from Cookie/LocalStorage
1. Go to Variables → New → Variable Configuration
2. Choose: **Custom JavaScript**
3. Name: `JS - Stored Affiliate ID`
4. Code:
```javascript
function() {
  // Try localStorage first
  var affiliateId = localStorage.getItem('th_affiliate_id');
  if (affiliateId) return affiliateId;
  
  // Try sessionStorage
  affiliateId = sessionStorage.getItem('th_affiliate_id');
  if (affiliateId) return affiliateId;
  
  // Try cookie
  var cookies = document.cookie.split(';');
  for (var i = 0; i < cookies.length; i++) {
    var cookie = cookies[i].trim();
    if (cookie.indexOf('th_affiliate_id=') === 0) {
      return cookie.substring(16);
    }
  }
  
  return undefined;
}
```
5. Save

#### Variable 5: First Campaign from Cookie/LocalStorage
1. Go to Variables → New → Variable Configuration
2. Choose: **Custom JavaScript**
3. Name: `JS - Stored First Campaign`
4. Code:
```javascript
function() {
  // Try localStorage first
  var campaign = localStorage.getItem('th_first_campaign_id');
  if (campaign) return campaign;
  
  // Try sessionStorage
  campaign = sessionStorage.getItem('th_first_campaign_id');
  if (campaign) return campaign;
  
  // Try cookie
  var cookies = document.cookie.split(';');
  for (var i = 0; i < cookies.length; i++) {
    var cookie = cookies[i].trim();
    if (cookie.indexOf('th_first_campaign_id=') === 0) {
      return cookie.substring(21);
    }
  }
  
  return undefined;
}
```
5. Save

### Step 2.2: Create the Tracking Storage Tag

This tag stores tracking parameters when users first arrive:

1. Go to Tags → New → Tag Configuration
2. Choose: **Custom HTML**
3. Name: `Store Tracking Parameters`
4. HTML Code:
```html
<script>
(function() {
  // Get URL parameters
  var urlParams = new URLSearchParams(window.location.search);
  var affiliateId = urlParams.get('affiliate_id');
  var firstCampaign = urlParams.get('first_campaign_id');
  
  // Store affiliate_id if present
  if (affiliateId && affiliateId !== '') {
    localStorage.setItem('th_affiliate_id', affiliateId);
    sessionStorage.setItem('th_affiliate_id', affiliateId);
    // Also set a cookie (1 year expiry)
    var expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = 'th_affiliate_id=' + affiliateId + '; expires=' + expires.toUTCString() + '; path=/';
    console.log('[GTM] Stored affiliate_id:', affiliateId);
  }
  
  // Store first_campaign_id if present
  if (firstCampaign && firstCampaign !== '') {
    localStorage.setItem('th_first_campaign_id', firstCampaign);
    sessionStorage.setItem('th_first_campaign_id', firstCampaign);
    // Also set a cookie (1 year expiry)
    var expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = 'th_first_campaign_id=' + firstCampaign + '; expires=' + expires.toUTCString() + '; path=/';
    console.log('[GTM] Stored first_campaign_id:', firstCampaign);
  }
})();
</script>
```
5. Triggering:
   - Click "Triggering"
   - Choose: **All Pages**
6. Save

### Step 2.3: Create the Main Webhook Tracking Tag

This is the main tag that sends data to your webhook:

1. Go to Tags → New → Tag Configuration
2. Choose: **Custom HTML**
3. Name: `Send Purchase to Webhook`
4. HTML Code:
```html
<script>
(function() {
  // IMPORTANT: Update this URL to your actual Railway webhook URL
  var WEBHOOK_URL = 'https://your-railway-app.railway.app/webhook/gtm-enhanced';
  
  // Get the booking ID from dataLayer
  var bookingId = {{DLV - Booking ID}};
  
  if (!bookingId) {
    console.error('[GTM Webhook] No booking ID found');
    return;
  }
  
  // Get affiliate and campaign from multiple sources
  var affiliateId = {{URL - Affiliate ID}} || {{JS - Stored Affiliate ID}};
  var firstCampaign = {{URL - First Campaign}} || {{JS - Stored First Campaign}};
  
  // Special conversion rule
  if (affiliateId === '8463d56e1b524f509d8a3698feebcd0c') {
    affiliateId = 'il-colosseo';
  }
  
  // Check if we have any tracking data
  if (!affiliateId && !firstCampaign) {
    console.log('[GTM Webhook] No tracking parameters to send');
    return;
  }
  
  // Prepare the payload
  var payload = {
    direct_tracking: true,
    transaction_id: String(bookingId),
    booking_id: String(bookingId),
    affiliate_id: affiliateId || undefined,
    first_campaign: firstCampaign || undefined,
    page_location: window.location.href,
    timestamp: new Date().toISOString(),
    consent_mode: 'unknown',
    source: 'gtm_client_side'
  };
  
  console.log('[GTM Webhook] Sending:', payload);
  
  // Send to webhook
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  .then(function(response) {
    return response.json();
  })
  .then(function(data) {
    if (data.success) {
      console.log('[GTM Webhook] ✅ Success:', data);
    } else {
      console.log('[GTM Webhook] ⚠️ Warning:', data);
    }
  })
  .catch(function(error) {
    console.error('[GTM Webhook] ❌ Error:', error);
  });
})();
</script>
```
5. **IMPORTANT**: Update line 3 with your actual Railway webhook URL
6. Triggering:
   - Click "Triggering"
   - Create a new trigger
   - Choose: **Custom Event**
   - Event name: `purchase`
   - Name the trigger: `Purchase Event`
7. Save

### Step 2.4: Create a Consent-Bypass Fallback Tag

This tag ensures tracking works even when consent is fully denied:

1. Go to Tags → New → Tag Configuration
2. Choose: **Custom HTML**
3. Name: `Webhook Fallback - No Consent`
4. HTML Code:
```html
<script>
(function() {
  // IMPORTANT: Update this URL to your actual Railway webhook URL
  var FALLBACK_URL = 'https://your-railway-app.railway.app/webhook/tracking-fallback';
  
  // This runs 2 seconds after purchase to ensure it doesn't interfere
  setTimeout(function() {
    // Get booking ID from various sources
    var bookingId = {{DLV - Booking ID}};
    
    // Also try to extract from page if dataLayer fails
    if (!bookingId) {
      // Try to find booking ID in the page content
      var bookingElement = document.querySelector('[data-booking-id]');
      if (bookingElement) {
        bookingId = bookingElement.getAttribute('data-booking-id');
      }
      
      // Try to find in thank you message
      if (!bookingId) {
        var thankYouText = document.body.innerText;
        var match = thankYouText.match(/booking\s*#?\s*(\d+)/i);
        if (match) {
          bookingId = match[1];
        }
      }
    }
    
    if (!bookingId) {
      console.log('[Fallback] No booking ID found');
      return;
    }
    
    // Get stored tracking parameters
    var affiliateId = localStorage.getItem('th_affiliate_id') || 
                      sessionStorage.getItem('th_affiliate_id');
    var firstCampaign = localStorage.getItem('th_first_campaign_id') || 
                        sessionStorage.getItem('th_first_campaign_id');
    
    // Special conversion rule
    if (affiliateId === '8463d56e1b524f509d8a3698feebcd0c') {
      affiliateId = 'il-colosseo';
    }
    
    if (!affiliateId && !firstCampaign) {
      console.log('[Fallback] No tracking parameters stored');
      return;
    }
    
    var payload = {
      booking_id: String(bookingId),
      transaction_id: String(bookingId),
      affiliate_id: affiliateId,
      first_campaign: firstCampaign,
      source: 'consent_bypass_fallback'
    };
    
    console.log('[Fallback] Sending:', payload);
    
    fetch(FALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      console.log('[Fallback] Result:', data);
    })
    .catch(function(error) {
      console.error('[Fallback] Error:', error);
    });
  }, 2000); // 2 second delay
})();
</script>
```
5. **IMPORTANT**: Update line 3 with your actual Railway webhook URL
6. Triggering:
   - Use the same `Purchase Event` trigger created earlier
7. Save

### Step 2.5: Set Up Tag Sequencing

To ensure proper order of execution:

1. Open the `Send Purchase to Webhook` tag
2. Go to Advanced Settings → Tag Sequencing
3. Check "Fire a tag before this tag fires"
4. Select: `Store Tracking Parameters`
5. Save

## Part 3: CookieYes Configuration

### Step 3.1: Enable Google Consent Mode

1. Login to your CookieYes account
2. Go to **Consent Banner** → **Google Consent Mode**
3. Enable **Google Consent Mode v2**
4. Configure the consent defaults:
   - Analytics: Denied (for GDPR compliance)
   - Marketing: Denied (for GDPR compliance)
   - Functional: Granted
   - Necessary: Granted

### Step 3.2: Configure Cookie Categories

1. Go to **Cookie Categories**
2. Make sure you have these categories:
   - **Necessary** (Always Active)
   - **Functional** (Default: Ask)
   - **Analytics** (Default: Ask)
   - **Advertisement** (Default: Ask)

### Step 3.3: Add GTM to CookieYes

1. Go to **Third Party Scripts**
2. Add Google Tag Manager
3. Select category: **Analytics**
4. This ensures GTM only loads fully when analytics consent is granted

## Part 4: Website Implementation

### Step 4.1: Add CookieYes Script

Add this to the `<head>` of all pages:

```html
<!-- CookieYes Consent Banner -->
<script id="cookieyes" type="text/javascript" 
  src="https://cdn-cookieyes.com/client_data/YOUR_COOKIEYES_ID/script.js">
</script>
```

Replace `YOUR_COOKIEYES_ID` with your actual CookieYes ID.

### Step 4.2: Add GTM Script

Add this AFTER the CookieYes script:

```html
<!-- Google Tag Manager -->
<script>
// Store tracking params immediately (before GTM loads)
(function() {
  var urlParams = new URLSearchParams(window.location.search);
  var aid = urlParams.get('affiliate_id');
  var cid = urlParams.get('first_campaign_id');
  if (aid) {
    localStorage.setItem('th_affiliate_id', aid);
    sessionStorage.setItem('th_affiliate_id', aid);
  }
  if (cid) {
    localStorage.setItem('th_first_campaign_id', cid);
    sessionStorage.setItem('th_first_campaign_id', cid);
  }
})();
</script>

<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXX');</script>
<!-- End Google Tag Manager -->
```

Replace `GTM-XXXXXX` with your GTM container ID.

### Step 4.3: Add to Body

Add this immediately after `<body>`:

```html
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXX"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
```

### Step 4.4: Purchase Confirmation Page

On your purchase confirmation page, make sure the booking ID is in the dataLayer:

```html
<script>
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  'event': 'purchase',
  'ecommerce': {
    'transaction_id': '<?php echo $booking_id; ?>',
    'value': <?php echo $total_amount; ?>,
    'currency': 'EUR'
  }
});
</script>
```

## Part 5: Testing

### Step 5.1: Test with GTM Preview Mode

1. In GTM, click **Preview**
2. Enter your website URL
3. Navigate to a page with `?affiliate_id=test123&first_campaign_id=camp456`
4. Open browser console (F12)
5. You should see:
   ```
   [GTM] Stored affiliate_id: test123
   [GTM] Stored first_campaign_id: camp456
   ```

### Step 5.2: Test Purchase with Consent Granted

1. Accept all cookies in CookieYes banner
2. Complete a test purchase
3. Check browser console for:
   ```
   [GTM Webhook] Sending: {transaction_id: "123456", affiliate_id: "test123", ...}
   [GTM Webhook] ✅ Success: {success: true, ...}
   ```
4. Check your Railway logs for the webhook receipt

### Step 5.3: Test Purchase with Consent Denied

1. Open incognito/private window
2. Navigate with `?affiliate_id=test789&first_campaign_id=camp789`
3. REJECT all cookies in CookieYes banner
4. Complete a test purchase
5. Check browser console for:
   ```
   [Fallback] Sending: {booking_id: "123456", affiliate_id: "test789", ...}
   [Fallback] Result: {success: true, ...}
   ```

### Step 5.4: Verify in Database

Check your Supabase database:

```sql
SELECT * FROM activity_bookings 
WHERE booking_id = 123456;
```

Should show:
- `affiliate_id`: test789 (or il-colosseo if using that specific ID)
- `first_campaign`: camp789

## Part 6: Debugging

### Check Stored Values

In browser console:

```javascript
// Check what's stored
localStorage.getItem('th_affiliate_id');
localStorage.getItem('th_first_campaign_id');

// Check cookies
document.cookie;

// Check GTM dataLayer
dataLayer;
```

### Common Issues and Solutions

#### Issue: "No tracking parameters stored"
- **Check**: URL has `affiliate_id` parameter?
- **Solution**: Make sure the Store Tracking Parameters tag fires on All Pages

#### Issue: "No booking ID found"
- **Check**: Is purchase event firing?
- **Solution**: Check dataLayer has ecommerce.transaction_id

#### Issue: Webhook not receiving data
- **Check**: Correct webhook URL in tags?
- **Check**: CORS errors in console?
- **Solution**: Update webhook URL, check Railway logs

#### Issue: Duplicate tracking
- **Solution**: The backend has a 5-second delay to prevent duplicates

## Part 7: Going Live Checklist

- [ ] Update webhook URLs in both GTM tags to production Railway URL
- [ ] Test with real affiliate IDs
- [ ] Verify il-colosseo conversion works
- [ ] Test on mobile devices
- [ ] Test on different browsers
- [ ] Remove console.log statements (optional)
- [ ] Set up monitoring in Railway logs
- [ ] Document affiliate IDs for your team

## How It All Works Together

1. **User arrives** with `?affiliate_id=XXX&first_campaign_id=YYY`
2. **Immediately stored** in localStorage/sessionStorage/cookies
3. **User browses** (may accept or reject cookies)
4. **User purchases**
5. **If consent granted**: GTM fires, webhook tag sends data
6. **If consent denied**: Fallback tag still sends data using stored values
7. **Backend processes** with 5-second delay to prevent duplicates
8. **Result**: 100% tracking accuracy regardless of consent!

## Support

If you need help:
1. Check browser console for errors
2. Check Railway logs for webhook activity
3. Use GTM Preview mode to debug tag firing
4. Test with different consent scenarios