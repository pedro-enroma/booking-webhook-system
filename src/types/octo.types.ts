// Tipi per API OCTO (versione Bokun)
export interface OctoProduct {
  id: string;
  supplierId?: string;
  internalName?: string;  // Bokun usa questo invece di "title"
  title?: string;  // Manteniamo per compatibilità
  reference?: string;
  description?: string;
  productType?: string;
  format?: string;
  durationAmount?: string;
  durationUnit?: 'MINUTES' | 'HOURS' | 'DAYS';
  availableCurrencies?: string[];
  defaultCurrency?: string;
  defaultLanguage?: string;  // Language/locale code (e.g., 'en', 'it', 'es')
  locale?: string;  // Alternative field name for language
  instantConfirmation?: boolean;
  instantDelivery?: boolean;
  availabilityRequired?: boolean;  // Bokun usa questo invece di requiresDate
  availabilityType?: 'START_TIME' | 'OPENING_HOURS';  // Per determinare se serve l'orario
  requiresDate?: boolean;
  requiresTime?: boolean;
  capacity?: number;
  pricingFrom?: {
    amount: number;
    currency: string;
    currencyPrecision: number;
  }[];
  options?: Array<{
    id: string;
    default: boolean;
    internalName: string;
    reference?: string;
  }>;
}

export interface OctoAvailability {
  id: string;
  productId: string;
  optionId: string;
  localDateTimeStart: string;
  localDateTimeEnd: string;
  localDate: string;
  localTime: string;
  available: boolean;
  status: 'AVAILABLE' | 'SOLD_OUT' | 'LIMITED';
  vacancies?: number;  // Posti disponibili
  capacity?: number;   // Capacità totale
  pricing?: {
    currency: string;
    currencyPrecision: number;
    unitPrice?: number;
    amount?: number;
  }[];
}