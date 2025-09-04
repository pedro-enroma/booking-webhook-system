// Types for GTM Server-Side webhook integration
// Handles affiliate and campaign tracking for activity bookings

export interface GTMWebhookPayload {
  // E-commerce data from dataLayer
  ecommerce: {
    transaction_id: string;  // This maps to booking_id in our system
    value?: number;
    currency?: string;
    items?: Array<{
      item_id: string;
      item_name: string;
      price?: number;
      quantity?: number;
    }>;
  };
  
  // GTM Variables that we need
  variables: {
    'TH - url - affiliate_id': string;        // e.g., "cometeelmundo"
    'TH - url - first_campaign_id': string;   // e.g., "que-ver-en-roma-3-dias-tab"
    [key: string]: any; // Allow other variables
  };
  
  // Standard GTM/GA4 fields
  event_name?: string;
  event_timestamp?: number;
  client_id?: string;
  session_id?: string;
  user_id?: string;
  
  // Page context
  page?: {
    location?: string;
    referrer?: string;
    title?: string;
  };
  
  // User context
  user?: {
    email?: string;
    phone?: string;
  };
  
  // Debug info
  debug?: boolean;
  test_mode?: boolean;
}

export interface GTMProcessingResult {
  success: boolean;
  booking_id: number;
  activity_booking_updated: boolean;
  affiliate_id?: string;
  first_campaign?: string;
  records_updated: number;
  processing_time_ms: number;
  delay_applied_ms: number;
  error?: string;
  warning?: string;
}

export interface GTMLogEntry {
  timestamp: string;
  event_type: 'received' | 'processing' | 'searching' | 'updating' | 'completed' | 'error';
  booking_id?: string;
  affiliate_id?: string;
  first_campaign?: string;
  message: string;
  details?: any;
  duration_ms?: number;
}