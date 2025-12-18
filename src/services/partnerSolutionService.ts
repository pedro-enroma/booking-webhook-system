/**
 * Partner Solution Service
 * Handles all communication with the Partner Solution API (https://catture.partnersolution.it/)
 */

import axios from 'axios';
import { supabase } from '../config/supabase';
import {
  PartnerSolutionConfig,
  PSLoginResponse,
  PSPraticaPayload,
  PSPraticaResponse,
  PSPraticaUpdatePayload,
  PSServizioPayload,
  PSServizioResponse,
  PSQuotaPayload,
  PSQuotaResponse,
  PSPasseggeroPayload,
  PSPasseggeroResponse,
  PSHydraCollection,
  PSStatus,
  PSAccountPayload,
  PSAccountResponse,
} from '../types/invoice.types';
import { getCountryFromPhone, generateForeignFiscalCode } from '../utils/phoneCountry';

interface CachedConfig {
  config: PartnerSolutionConfig;
  fetchedAt: number;
}

export class PartnerSolutionService {
  private client: any = null;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private cachedConfig: CachedConfig | null = null;
  private readonly CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    console.log('PartnerSolutionService initialized');
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  /**
   * Load configuration from database with caching
   */
  async getConfig(): Promise<PartnerSolutionConfig> {
    // Return cached config if still valid
    if (
      this.cachedConfig &&
      Date.now() - this.cachedConfig.fetchedAt < this.CONFIG_CACHE_TTL
    ) {
      return this.cachedConfig.config;
    }

    const { data, error } = await supabase
      .from('partner_solution_config')
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Partner Solution configuration not found: ${error?.message}`);
    }

    this.cachedConfig = {
      config: data as PartnerSolutionConfig,
      fetchedAt: Date.now(),
    };

    return this.cachedConfig.config;
  }

  /**
   * Clear config cache (call after updating config)
   */
  clearConfigCache(): void {
    this.cachedConfig = null;
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  /**
   * Authenticate with Partner Solution API and get JWT token
   */
  private async authenticate(): Promise<string> {
    // Check if we have a valid token
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.token;
    }

    const username = process.env.PARTNER_SOLUTION_USERNAME;
    const password = process.env.PARTNER_SOLUTION_PASSWORD;

    if (!username || !password) {
      throw new Error(
        'Partner Solution credentials not configured. Set PARTNER_SOLUTION_USERNAME and PARTNER_SOLUTION_PASSWORD environment variables.'
      );
    }

    const config = await this.getConfig();

    try {
      console.log(`Authenticating with Partner Solution API at ${config.api_base_url}...`);

      // Partner Solution uses Symfony-style form authentication
      const formData = new URLSearchParams();
      formData.append('_username', username);
      formData.append('_password', password);

      const response = await axios.post<PSLoginResponse>(
        `${config.api_base_url}/login_check`,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        }
      );

      this.token = response.data.token;
      // Token typically valid for 1 hour, refresh 5 mins before expiry
      this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);

      console.log('Successfully authenticated with Partner Solution API');
      return this.token;
    } catch (error) {
      const axiosError = error as any;
      const message = axiosError.response?.data
        ? JSON.stringify(axiosError.response.data)
        : axiosError.message;
      throw new Error(`Partner Solution authentication failed: ${message}`);
    }
  }

  /**
   * Get authenticated axios client
   */
  private async getClient(): Promise<any> {
    const token = await this.authenticate();
    const config = await this.getConfig();

    if (!this.client) {
      this.client = axios.create({
        baseURL: config.api_base_url,
        headers: {
          'Content-Type': 'application/ld+json',
          Accept: 'application/ld+json',
        },
        timeout: 30000, // 30 second timeout
      });

      // Add response interceptor for error logging
      this.client.interceptors.response.use(
        (response: any) => response,
        (error: any) => {
          console.error('Partner Solution API error:', {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response?.status,
            data: error.response?.data,
          });
          return Promise.reject(error);
        }
      );
    }

    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    return this.client;
  }

  // ============================================
  // PRATICA (INVOICE) OPERATIONS
  // ============================================

  /**
   * Create a new Pratica (Practice/Booking) in Partner Solution
   */
  async createPratica(payload: PSPraticaPayload): Promise<PSPraticaResponse> {
    const client = await this.getClient();

    console.log('Creating pratica in Partner Solution:', {
      codiceagenzia: payload.codiceagenzia,
      stato: payload.stato,
      externalid: payload.externalid,
      cognomecliente: payload.cognomecliente,
      nomecliente: payload.nomecliente,
    });

    try {
      const response = await client.post('/prt_praticas', payload);
      console.log('Pratica created successfully:', response.data['@id']);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to create pratica: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  /**
   * Get a Pratica by IRI
   */
  async getPratica(praticaIri: string): Promise<PSPraticaResponse> {
    const client = await this.getClient();

    try {
      const response = await client.get(praticaIri);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      throw new Error(`Failed to get pratica ${praticaIri}: ${axiosError.message}`);
    }
  }

  /**
   * Update Pratica status (WP -> INS to finalize)
   */
  async updatePraticaStatus(praticaIri: string, status: PSStatus): Promise<PSPraticaResponse> {
    const client = await this.getClient();

    console.log(`Updating pratica ${praticaIri} status to ${status}...`);

    try {
      // First get the current pratica to preserve required fields
      const current = await this.getPratica(praticaIri);

      // Build clean payload with only the fields the API accepts
      const updatePayload = {
        codiceagenzia: current.codiceagenzia,
        tipocattura: (current as any).tipocattura || 'API',
        stato: status,
        datacreazione: current.datacreazione,
        datamodifica: new Date().toISOString(),
        cognomecliente: (current as any).cognomecliente,
        nomecliente: (current as any).nomecliente,
        codicecliente: (current as any).codicecliente,
        externalid: current.externalid,
        descrizionepratica: (current as any).descrizionepratica,
        noteinterne: (current as any).noteinterne,
        noteesterne: (current as any).noteesterne,
      };

      const response = await client.put(praticaIri, updatePayload);
      console.log('Pratica status updated successfully');
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to update pratica status: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  /**
   * Update Pratica (status, notes, etc.)
   */
  async updatePratica(praticaIri: string, payload: PSPraticaUpdatePayload): Promise<PSPraticaResponse> {
    const client = await this.getClient();

    console.log(`Updating pratica ${praticaIri}:`, {
      stato: payload.stato,
    });

    try {
      const response = await client.put(praticaIri, payload);
      console.log('Pratica updated successfully');
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to update pratica: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  // ============================================
  // SERVIZIO (LINE ITEM) OPERATIONS
  // ============================================

  /**
   * Create a new Servizio (Service) in Partner Solution
   */
  async createServizio(payload: PSServizioPayload): Promise<PSServizioResponse> {
    const client = await this.getClient();

    console.log('Creating servizio in Partner Solution:', {
      pratica: payload.pratica,
      tiposervizio: payload.tiposervizio,
      tipovendita: payload.tipovendita,
      descrizione: payload.descrizione?.substring(0, 50),
    });

    try {
      const response = await client.post('/prt_praticaservizios', payload);
      console.log('Servizio created successfully:', response.data['@id']);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to create servizio: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  // ============================================
  // QUOTA (PRICING) OPERATIONS
  // ============================================

  /**
   * Create a new Quota (pricing line) for a Servizio
   */
  async createQuota(payload: PSQuotaPayload): Promise<PSQuotaResponse> {
    const client = await this.getClient();

    console.log('Creating quota in Partner Solution:', {
      servizio: payload.servizio,
      descrizionequota: payload.descrizionequota,
      ricavovalutaprimaria: payload.ricavovalutaprimaria,
    });

    try {
      const response = await client.post('/prt_praticaservizioquotas', payload);
      console.log('Quota created successfully:', response.data['@id']);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to create quota: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  // ============================================
  // PASSEGGERO (PASSENGER) OPERATIONS
  // ============================================

  /**
   * Create a new Passeggero (Passenger) for a Pratica
   */
  async createPasseggero(payload: PSPasseggeroPayload): Promise<PSPasseggeroResponse> {
    const client = await this.getClient();

    console.log('Creating passeggero in Partner Solution:', {
      pratica: payload.pratica,
      cognomepax: payload.cognomepax,
      nomepax: payload.nomepax,
    });

    try {
      const response = await client.post('/prt_praticapasseggeros', payload);
      console.log('Passeggero created successfully:', response.data['@id']);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to create passeggero: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  // ============================================
  // ACCOUNT (ANAGRAFICA) OPERATIONS
  // ============================================

  /**
   * Search for an account by external ID (our customer_id)
   */
  async findAccountByExternalId(externalId: string): Promise<PSAccountResponse | null> {
    const client = await this.getClient();

    try {
      const response = await client.get('/accounts', {
        params: { externalid: externalId },
      });

      const accounts = response.data['hydra:member'] as PSAccountResponse[];
      // API may return non-matching results, verify client-side
      const match = accounts.find(a => a.externalid === externalId);
      return match || null;
    } catch (error) {
      const axiosError = error as any;
      if (axiosError.response?.status === 404) return null;
      throw new Error(`Failed to search accounts: ${axiosError.message}`);
    }
  }

  /**
   * Search for an account by email
   */
  async findAccountByEmail(email: string): Promise<PSAccountResponse | null> {
    const client = await this.getClient();

    try {
      const response = await client.get('/accounts', {
        params: { emailcomunicazioni: email },
      });

      const accounts = response.data['hydra:member'] as PSAccountResponse[];
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      const axiosError = error as any;
      if (axiosError.response?.status === 404) return null;
      throw new Error(`Failed to search accounts by email: ${axiosError.message}`);
    }
  }

  /**
   * Create a new Account (Anagrafica) in Partner Solution
   */
  async createAccount(payload: PSAccountPayload): Promise<PSAccountResponse> {
    const client = await this.getClient();

    console.log('Creating account in Partner Solution:', {
      cognome: payload.cognome,
      nome: payload.nome,
      codicefiscale: payload.codicefiscale,
      externalid: payload.externalid,
    });

    try {
      const response = await client.post('/accounts', payload);
      console.log('Account created successfully:', response.data['@id']);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to create account: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  /**
   * Get or create an account for a customer
   * Uses externalid (customer_id) to find existing, or creates new
   * For foreign customers, generates codicefiscale from phone country + customer_id
   */
  async getOrCreateAccount(customer: {
    customer_id: number;
    first_name: string;
    last_name: string;
    email?: string | null;
    phone_number?: string | null;
  }): Promise<PSAccountResponse> {
    const externalId = `CUST-${customer.customer_id}`;

    // Try to find existing account by externalid
    const existing = await this.findAccountByExternalId(externalId);
    if (existing) {
      console.log(`Found existing account for customer ${customer.customer_id}:`, existing['@id']);
      return existing;
    }

    // Determine country from phone number
    const countryCode = getCountryFromPhone(customer.phone_number);
    const codicefiscale = generateForeignFiscalCode(countryCode, customer.customer_id);

    // Create new account
    const payload: PSAccountPayload = {
      cognome: customer.last_name || 'N/A',
      nome: customer.first_name || undefined,
      flagpersonafisica: 1,
      codicefiscale: codicefiscale,
      iscliente: 1,
      isfornitore: 0,
      ispromotore: 0,
      codiceagenzia: 'demo2', // TODO: make configurable
      stato: 'INS',
      tipocattura: 'API',
      externalid: externalId,
      nazione: countryCode.length === 2 ? this.iso2ToIso3(countryCode) : undefined,
      emailcomunicazioni: customer.email || undefined,
      cellulare: customer.phone_number || undefined,
    };

    return this.createAccount(payload);
  }

  /**
   * Convert ISO 2-letter country code to ISO 3-letter
   * (Partner Solution uses 3-letter codes)
   */
  private iso2ToIso3(iso2: string): string {
    const map: Record<string, string> = {
      'ES': 'ESP', 'IT': 'ITA', 'US': 'USA', 'GB': 'GBR', 'FR': 'FRA',
      'DE': 'DEU', 'NL': 'NLD', 'BE': 'BEL', 'PT': 'PRT', 'BR': 'BRA',
      'AR': 'ARG', 'MX': 'MEX', 'CO': 'COL', 'CL': 'CHL', 'PE': 'PER',
      'AU': 'AUS', 'NZ': 'NZL', 'JP': 'JPN', 'CN': 'CHN', 'KR': 'KOR',
      'IN': 'IND', 'RU': 'RUS', 'CH': 'CHE', 'AT': 'AUT', 'PL': 'POL',
      'SE': 'SWE', 'NO': 'NOR', 'DK': 'DNK', 'FI': 'FIN', 'IE': 'IRL',
      'GR': 'GRC', 'TR': 'TUR', 'IL': 'ISR', 'AE': 'ARE', 'SA': 'SAU',
      'ZA': 'ZAF', 'EG': 'EGY', 'MA': 'MAR', 'CA': 'CAN', 'VE': 'VEN',
    };
    return map[iso2.toUpperCase()] || iso2.toUpperCase();
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Check if Partner Solution is configured and accessible
   */
  async healthCheck(): Promise<{
    configured: boolean;
    authenticated: boolean;
    error?: string;
  }> {
    try {
      // Check if credentials are configured
      const hasCredentials = !!(
        process.env.PARTNER_SOLUTION_USERNAME && process.env.PARTNER_SOLUTION_PASSWORD
      );

      if (!hasCredentials) {
        return {
          configured: false,
          authenticated: false,
          error: 'Partner Solution credentials not configured',
        };
      }

      // Try to authenticate
      await this.authenticate();

      return {
        configured: true,
        authenticated: true,
      };
    } catch (error) {
      return {
        configured: true,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Invalidate token (force re-authentication)
   */
  invalidateToken(): void {
    this.token = null;
    this.tokenExpiry = null;
  }
}

// Export singleton instance
export const partnerSolutionService = new PartnerSolutionService();
