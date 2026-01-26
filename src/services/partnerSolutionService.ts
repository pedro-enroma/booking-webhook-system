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
  PSDocfiscalePayload,
  PSDocfiscaleResponse,
  PSDocfiscaleDettaglioPayload,
  PSDocfiscaleDettaglioResponse,
  PSDocfiscaleXMLPayload,
  PSDocfiscaleXMLResponse,
  PSDocfiscaleXMLNotificaResponse,
} from '../types/invoice.types';
import { getCountryFromPhone, generateForeignFiscalCode } from '../utils/phoneCountry';

interface CachedConfig {
  config: PartnerSolutionConfig;
  fetchedAt: number;
}

// FacileWS3 types
interface FacileWSLoginResponse {
  jwt: string;
  fullname: string;
  email: string;
  id: string;
}

interface CommessaResponse {
  id?: string;
  Id?: string;
  codice_commessa?: string;
  CodiceCommessa?: string;
  Titolo_Commessa?: string;
  Titolo?: string;
  Descrizione?: string | null;
  DataInizioValidita?: string;
  DataFineValidita?: string | null;
}

interface CommessaInfo {
  code: string;
  id: string;
}

interface MovimentoFinanziarioPayload {
  externalid: string;
  tipomovimento: 'I' | 'U'; // I = Incasso (income), U = Uscita (expense)
  codicefile: string;
  codiceagenzia: string;
  tipocattura: string;
  importo: number;
  datacreazione: string;
  datamodifica: string;
  datamovimento: string;
  stato: string;
  codcausale: string;
  descrizione: string;
}

interface MovimentoFinanziarioResponse {
  '@id': string;
  '@type': string;
  id: string;
  externalid: string;
  importo: number;
}

export class PartnerSolutionService {
  private client: any = null;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private cachedConfig: CachedConfig | null = null;
  private readonly CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // FacileWS3 authentication
  private facileToken: string | null = null;
  private facileTokenExpiry: Date | null = null;
  private readonly FACILE_LOGIN_URL = 'https://facilews.partnersolution.it/login.php';
  private readonly FACILE_WS3_URL = 'https://facilews3.partnersolution.it';

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
   * Authenticate with FacileWS3 API for Commessa operations
   */
  private async authenticateFacileWS3(): Promise<string> {
    // Check if we have a valid token
    if (this.facileToken && this.facileTokenExpiry && new Date() < this.facileTokenExpiry) {
      return this.facileToken;
    }

    const username =
      process.env.FACILEWS_USERNAME ||
      process.env.FACILE_WS3_USERNAME ||
      'alberto@enroma.com';
    const password =
      process.env.FACILEWS_PASSWORD ||
      process.env.FACILE_WS3_PASSWORD ||
      'InSpe2026!';

    try {
      console.log('Authenticating with FacileWS3 API...');

      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await axios.post<FacileWSLoginResponse>(
        this.FACILE_LOGIN_URL,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.facileToken = response.data.jwt;
      // Token valid for ~24 hours, refresh 1 hour before expiry
      this.facileTokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);

      console.log('Successfully authenticated with FacileWS3 API');
      return this.facileToken;
    } catch (error) {
      const axiosError = error as any;
      const message = axiosError.response?.data
        ? JSON.stringify(axiosError.response.data)
        : axiosError.message;
      throw new Error(`FacileWS3 authentication failed: ${message}`);
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
      // IMPORTANT: Must preserve 'delivering' field for Commessa link
      const updatePayload: Record<string, any> = {
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

      // Preserve delivering field if present (links pratica to Commessa)
      if ((current as any).delivering) {
        updatePayload.delivering = (current as any).delivering;
      }

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
      codiceagenzia: process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206',
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
  // DOCFISCALE (SDI ELECTRONIC INVOICE) OPERATIONS
  // ============================================

  /**
   * Create a new Docfiscale (SDI electronic invoice header)
   * Use for creating invoices to be sent to SDI
   */
  async createDocfiscale(payload: PSDocfiscalePayload): Promise<PSDocfiscaleResponse> {
    const client = await this.getClient();

    console.log('Creating docfiscale in Partner Solution:', {
      codiceagenzia: payload.codiceagenzia,
      tipodocumento: payload.tipodocumento,
      denominazione: payload.denominazione,
      cognome: payload.cognome,
      nome: payload.nome,
      importototaledocumento: payload.importototaledocumento,
      externalid: payload.externalid,
    });

    try {
      const response = await client.post('/docfiscales', payload);
      console.log('Docfiscale created successfully:', response.data['@id']);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to create docfiscale: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  /**
   * Get a Docfiscale by IRI
   */
  async getDocfiscale(docfiscaleIri: string): Promise<PSDocfiscaleResponse> {
    const client = await this.getClient();

    try {
      const response = await client.get(docfiscaleIri);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      throw new Error(`Failed to get docfiscale ${docfiscaleIri}: ${axiosError.message}`);
    }
  }

  /**
   * Find Docfiscale by external ID
   */
  async findDocfiscaleByExternalId(externalId: string): Promise<PSDocfiscaleResponse | null> {
    const client = await this.getClient();

    try {
      const response = await client.get('/docfiscales', {
        params: { externalid: externalId },
      });

      const docfiscales = response.data['hydra:member'] as PSDocfiscaleResponse[];
      const match = docfiscales.find(d => d.externalid === externalId);
      return match || null;
    } catch (error) {
      const axiosError = error as any;
      if (axiosError.response?.status === 404) return null;
      throw new Error(`Failed to search docfiscales: ${axiosError.message}`);
    }
  }

  /**
   * Create a Docfiscale line item (Dettaglio)
   */
  async createDocfiscaleDettaglio(payload: PSDocfiscaleDettaglioPayload): Promise<PSDocfiscaleDettaglioResponse> {
    const client = await this.getClient();

    console.log('Creating docfiscale dettaglio:', {
      docfiscale: payload.docfiscale,
      numerolinea: payload.numerolinea,
      descrizione: payload.descrizione?.substring(0, 50),
      quantita: payload.quantita,
      prezzounitario: payload.prezzounitario,
    });

    try {
      const response = await client.post('/docfiscaledettaglios', payload);
      console.log('Docfiscale dettaglio created successfully:', response.data['@id']);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to create docfiscale dettaglio: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  /**
   * Create DocfiscaleXML to submit to SDI
   * This triggers the generation of the FatturaPA XML and submission to SDI
   */
  async createDocfiscaleXML(payload: PSDocfiscaleXMLPayload): Promise<PSDocfiscaleXMLResponse> {
    const client = await this.getClient();

    console.log('Creating docfiscalexml for SDI submission:', {
      docfiscaleid: payload.docfiscaleid,
      formatotrasmissione: payload.formatotrasmissione,
      codicedestinatario: payload.codicedestinatario,
    });

    try {
      const response = await client.post('/docfiscalexmls', payload);
      console.log('DocfiscaleXML created successfully:', response.data['@id']);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to create docfiscalexml: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  /**
   * Get DocfiscaleXML by ID or IRI
   */
  async getDocfiscaleXML(docfiscalexmlIri: string): Promise<PSDocfiscaleXMLResponse> {
    const client = await this.getClient();

    try {
      const response = await client.get(docfiscalexmlIri);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      throw new Error(`Failed to get docfiscalexml ${docfiscalexmlIri}: ${axiosError.message}`);
    }
  }

  /**
   * Get notifications for a DocfiscaleXML (SDI responses)
   */
  async getDocfiscaleXMLNotifiche(docfiscalexmlId: number): Promise<PSDocfiscaleXMLNotificaResponse[]> {
    const client = await this.getClient();

    try {
      const response = await client.get('/docfiscalexmlnotificas', {
        params: { docfiscalexml: docfiscalexmlId },
      });

      return response.data['hydra:member'] || [];
    } catch (error) {
      const axiosError = error as any;
      throw new Error(`Failed to get docfiscalexml notifications: ${axiosError.message}`);
    }
  }

  /**
   * Create a complete SDI invoice from booking data
   * This is the main method for creating an electronic invoice:
   * 1. Creates Docfiscale (invoice header)
   * 2. Creates DocfiscaleDettaglio (line item - "Tour Italia e Vaticano")
   * 3. Creates DocfiscaleXML (submits to SDI)
   */
  async createSdiInvoice(params: {
    customer: {
      firstName: string;
      lastName: string;
      codiceFiscale?: string;
      partitaIva?: string;
      email?: string;
      pec?: string;
      codicesdi?: string;
      address?: string;
      city?: string;
      cap?: string;
      province?: string;
      country?: string;
    };
    booking: {
      confirmationCode: string;
      totalAmount: number;
      invoiceDate: string;
      description?: string;
    };
    praticaIri?: string;  // Optional: link to existing Pratica
    agencyCode?: string;
    sendToSdi?: boolean;  // Default: true
  }): Promise<{
    docfiscale: PSDocfiscaleResponse;
    dettaglio: PSDocfiscaleDettaglioResponse;
    docfiscalexml?: PSDocfiscaleXMLResponse;
  }> {
    const agencyCode = params.agencyCode || process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';

    // Step 1: Create Docfiscale (invoice header)
    console.log(`\n[SDI Invoice] Creating invoice for booking ${params.booking.confirmationCode}...`);

    // Generate invoice number from confirmation code and timestamp
    const invoiceNumber = `INV-${params.booking.confirmationCode}-${Date.now().toString().slice(-6)}`;

    const docfiscalePayload: PSDocfiscalePayload = {
      codiceagenzia: agencyCode,
      stato: 'INS',  // INS = Inserted/Final
      tipooperazione: 'A',  // A = Active (outgoing invoice)
      tipodocumento: 'TD01',  // TD01 = Fattura (Invoice)
      datadocfiscale: params.booking.invoiceDate,
      importototaledocumento: params.booking.totalAmount,
      externalid: params.booking.confirmationCode,
      numerodocfiscale: invoiceNumber,  // Required for SDI submission
      causale: params.booking.description || `Booking ${params.booking.confirmationCode}`,
    };

    // Customer identification
    // For Partner Solution API, always use partitaiva format (even for individuals)
    // For Italian customers: use their actual partitaIva or codiceFiscale
    // For foreign customers: use "00000000000" placeholder
    if (params.customer.partitaIva) {
      docfiscalePayload.partitaiva = params.customer.partitaIva;
    } else if (params.customer.codiceFiscale) {
      // Italian individual with codice fiscale - use as partitaiva for simplicity
      docfiscalePayload.partitaiva = params.customer.codiceFiscale;
    } else {
      // Foreign customer without VAT/CF - use placeholder
      docfiscalePayload.partitaiva = '00000000000';
      // Set country to identify as foreign
      const country = params.customer.country || 'EE';
      docfiscalePayload.nazione = country.length === 3 ? country : this.iso2ToIso3(country);
    }
    // Always use denominazione (full name) for API compatibility
    docfiscalePayload.denominazione = `${params.customer.lastName} ${params.customer.firstName}`.trim();

    // Optional fields
    if (params.customer.pec) docfiscalePayload.pec = params.customer.pec;
    if (params.customer.codicesdi) docfiscalePayload.codicesdi = params.customer.codicesdi;
    if (params.customer.address) docfiscalePayload.indirizzo = params.customer.address;
    if (params.customer.city) docfiscalePayload.comune = params.customer.city;
    if (params.customer.cap) docfiscalePayload.cap = params.customer.cap;
    if (params.customer.province) docfiscalePayload.provincia = params.customer.province;
    if (params.customer.country) docfiscalePayload.nazione = params.customer.country;
    if (params.praticaIri) docfiscalePayload.pratica = params.praticaIri;

    const docfiscale = await this.createDocfiscale(docfiscalePayload);

    // Step 2: Create DocfiscaleDettaglio (line item)
    console.log(`[SDI Invoice] Creating line item for docfiscale ${docfiscale['@id']}...`);

    const dettaglioPayload: PSDocfiscaleDettaglioPayload = {
      docfiscale: docfiscale['@id'],
      numerolinea: 1,
      descrizione: 'Tour Italia e Vaticano',  // Fixed description as per user request
      quantita: 1,
      prezzounitario: params.booking.totalAmount.toFixed(2),
      aliquotaiva: 22,  // 22% VAT
      annullata: 0,
      issoggettoritenuta: 0,
    };

    const dettaglio = await this.createDocfiscaleDettaglio(dettaglioPayload);

    // Step 3: Create DocfiscaleXML (submit to SDI) - optional
    let docfiscalexml: PSDocfiscaleXMLResponse | undefined;

    if (params.sendToSdi !== false) {
      console.log(`[SDI Invoice] Submitting to SDI...`);

      // Extract UUID from IRI (e.g., /docfiscales/uuid -> uuid)
      const docfiscaleUuid = docfiscale['@id'].split('/').pop() || '';

      const xmlPayload: PSDocfiscaleXMLPayload = {
        codiceagenzia: agencyCode,
        stato: 'INS',
        docfiscaleid: docfiscaleUuid,
        tipomovimento: 'E',  // E = Emission (send)
        formatotrasmissione: 'FPR12',  // FPR12 = private clients
        codicedestinatario: params.customer.codicesdi || '0000000',  // Default for private citizens
      };

      docfiscalexml = await this.createDocfiscaleXML(xmlPayload);
      console.log(`[SDI Invoice] Successfully submitted to SDI. XML ID: ${docfiscalexml.id}`);
    }

    console.log(`[SDI Invoice] Invoice created successfully!`);
    console.log(`  - Docfiscale: ${docfiscale['@id']}`);
    console.log(`  - Invoice Number: ${docfiscale.numerodocfiscale}`);
    console.log(`  - Total: €${params.booking.totalAmount}`);

    return { docfiscale, dettaglio, docfiscalexml };
  }

  /**
   * Create a credit note (Nota di Credito) for a refund
   */
  async createSdiCreditNote(params: {
    customer: {
      firstName: string;
      lastName: string;
      codiceFiscale?: string;
      partitaIva?: string;
      email?: string;
      pec?: string;
      codicesdi?: string;
    };
    booking: {
      confirmationCode: string;
      originalInvoiceNumber: string;  // Reference to original invoice
      creditAmount: number;
      creditDate: string;
      description?: string;
    };
    agencyCode?: string;
    sendToSdi?: boolean;
  }): Promise<{
    docfiscale: PSDocfiscaleResponse;
    dettaglio: PSDocfiscaleDettaglioResponse;
    docfiscalexml?: PSDocfiscaleXMLResponse;
  }> {
    const agencyCode = params.agencyCode || process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';

    console.log(`\n[SDI Credit Note] Creating credit note for booking ${params.booking.confirmationCode}...`);

    // Generate credit note number
    const creditNoteNumber = `NC-${params.booking.confirmationCode}-${Date.now().toString().slice(-6)}`;

    const docfiscalePayload: PSDocfiscalePayload = {
      codiceagenzia: agencyCode,
      stato: 'INS',
      tipooperazione: 'A',
      tipodocumento: 'TD04',  // TD04 = Nota di Credito
      datadocfiscale: params.booking.creditDate,
      importototaledocumento: params.booking.creditAmount,
      externalid: `CN-${params.booking.confirmationCode}`,
      numerodocfiscale: creditNoteNumber,  // Required for SDI submission
      causale: params.booking.description ||
        `Nota di credito per fattura ${params.booking.originalInvoiceNumber} - Booking ${params.booking.confirmationCode}`,
    };

    // Customer identification - use partitaiva format for API compatibility
    if (params.customer.partitaIva) {
      docfiscalePayload.partitaiva = params.customer.partitaIva;
    } else if (params.customer.codiceFiscale) {
      docfiscalePayload.partitaiva = params.customer.codiceFiscale;
    } else {
      // Foreign customer placeholder
      docfiscalePayload.partitaiva = '00000000000';
    }
    docfiscalePayload.denominazione = `${params.customer.lastName} ${params.customer.firstName}`.trim();

    if (params.customer.pec) docfiscalePayload.pec = params.customer.pec;
    if (params.customer.codicesdi) docfiscalePayload.codicesdi = params.customer.codicesdi;

    const docfiscale = await this.createDocfiscale(docfiscalePayload);

    // Create line item
    const dettaglioPayload: PSDocfiscaleDettaglioPayload = {
      docfiscale: docfiscale['@id'],
      numerolinea: 1,
      descrizione: `Storno Tour Italia e Vaticano - Rif. Fattura ${params.booking.originalInvoiceNumber}`,
      quantita: 1,
      prezzounitario: params.booking.creditAmount.toFixed(2),
      aliquotaiva: 22,
      annullata: 0,
      issoggettoritenuta: 0,
    };

    const dettaglio = await this.createDocfiscaleDettaglio(dettaglioPayload);

    // Submit to SDI
    let docfiscalexml: PSDocfiscaleXMLResponse | undefined;

    if (params.sendToSdi !== false) {
      // Extract UUID from IRI (e.g., /docfiscales/uuid -> uuid)
      const docfiscaleUuid = docfiscale['@id'].split('/').pop() || '';

      const xmlPayload: PSDocfiscaleXMLPayload = {
        codiceagenzia: agencyCode,
        stato: 'INS',
        docfiscaleid: docfiscaleUuid,
        tipomovimento: 'E',
        formatotrasmissione: 'FPR12',
        codicedestinatario: params.customer.codicesdi || '0000000',
      };

      docfiscalexml = await this.createDocfiscaleXML(xmlPayload);
      console.log(`[SDI Credit Note] Successfully submitted to SDI. XML ID: ${docfiscalexml.id}`);
    }

    console.log(`[SDI Credit Note] Credit note created successfully!`);
    return { docfiscale, dettaglio, docfiscalexml };
  }

  // ============================================
  // COMMESSA (JOB ORDER) OPERATIONS - via FacileWS3
  // ============================================

  /**
   * List all Commesse for the agency
   */
  async listCommesse(): Promise<CommessaResponse[]> {
    const token = await this.authenticateFacileWS3();
    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';

    try {
      const response = await axios.get(
        `${this.FACILE_WS3_URL}/Api/Rest/${agencyCode}/Commesse`,
        { params: { Token: token } }
      );

      return response.data.data?.['@Pagina'] || [];
    } catch (error) {
      const axiosError = error as any;
      throw new Error(`Failed to list commesse: ${axiosError.message}`);
    }
  }

  /**
   * Create a new Commessa
   */
  async createCommessa(params: {
    codice: string;
    titolo: string;
    descrizione?: string;
  }): Promise<{ CommessaID: string }> {
    const token = await this.authenticateFacileWS3();
    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';

    console.log(`Creating Commessa: ${params.codice} - ${params.titolo}`);

    try {
      const response = await axios.post(
        `${this.FACILE_WS3_URL}/Api/Rest/${agencyCode}/Commesse`,
        {
          CodiceCommessa: params.codice,
          TitoloCommessa: params.titolo,
          DescrizioneCommessa: params.descrizione || '',
          ReferenteCommerciale: '',
          NoteInterne: '',
        },
        {
          params: { Token: token },
          headers: { 'Content-Type': 'application/json' },
        }
      );

      console.log(`Commessa created: ${params.codice}`);
      return response.data.data;
    } catch (error) {
      const axiosError = error as any;
      throw new Error(`Failed to create commessa: ${axiosError.message}`);
    }
  }

  /**
   * Build Commessa title/description from a YYYY-MM code (or fallback)
   */
  private buildCommessaTitle(code: string, date?: Date): { title: string; description: string } {
    const monthNames = [
      'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];

    let year: string | null = null;
    let monthName: string | null = null;

    if (date) {
      year = String(date.getFullYear());
      monthName = monthNames[date.getMonth()];
    } else {
      const match = code.match(/^(\d{4})-(\d{2})$/);
      if (match) {
        year = match[1];
        const monthIndex = Number(match[2]) - 1;
        monthName = monthNames[monthIndex] || null;
      }
    }

    if (year && monthName) {
      return {
        title: `${monthName} ${year}`,
        description: `Tour UE ed Extra UE - ${monthName} ${year}`,
      };
    }

    return {
      title: code,
      description: `Tour UE ed Extra UE - ${code}`,
    };
  }

  /**
   * Get or create a Commessa by code and return its UUID
   */
  private async getOrCreateCommessaId(code: string, dateForTitle?: Date): Promise<string> {
    const commesse = await this.listCommesse();
    const existing = commesse.find(
      c => c.codice_commessa === code || c.CodiceCommessa === code
    );

    const existingId = existing?.id || existing?.Id;
    if (existingId) {
      console.log(`Found existing Commessa: ${code}`);
      return existingId;
    }

    const { title, description } = this.buildCommessaTitle(code, dateForTitle);
    const created = await this.createCommessa({
      codice: code,
      titolo: title,
      descrizione: description,
    });

    return created.CommessaID;
  }

  /**
   * Get or create a monthly Commessa
   * Code format: YYYY-MM (e.g., "2026-01" for January 2026)
   */
  async getOrCreateMonthlyCommessa(date?: Date): Promise<CommessaInfo> {
    const commessaCode = this.getMonthlyCommessaCode(date);
    const commessaId = await this.getOrCreateCommessaId(commessaCode, date);
    return { code: commessaCode, id: commessaId };
  }

  /**
   * Get or create a Commessa by explicit code
   */
  async getOrCreateCommessaByCode(code: string): Promise<CommessaInfo> {
    const commessaId = await this.getOrCreateCommessaId(code);
    return { code, id: commessaId };
  }

  /**
   * Search for a client/account by Codice Fiscale or Partita IVA via FacileWS3
   * Returns the account if found, null otherwise
   */
  async findClientByCfOrPi(params: {
    codiceFiscale?: string;
    partitaIva?: string;
  }): Promise<any | null> {
    if (!params.codiceFiscale && !params.partitaIva) {
      throw new Error('Must provide either codiceFiscale or partitaIva');
    }

    const token = await this.authenticateFacileWS3();
    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';

    try {
      const queryParams: any = { Token: token };
      if (params.codiceFiscale) queryParams.cf = params.codiceFiscale;
      if (params.partitaIva) queryParams.pi = params.partitaIva;

      const response = await axios.get(
        `${this.FACILE_WS3_URL}/Api/Rest/Account/${agencyCode}`,
        { params: queryParams }
      );

      const accounts = response.data.data?.['@Pagina'] || [];
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      const axiosError = error as any;
      if (axiosError.response?.status === 404) return null;
      throw new Error(`Failed to search client: ${axiosError.message}`);
    }
  }

  /**
   * Search Anagrafica (detailed client search) via FacileWS3
   */
  async searchAnagrafica(searchParams?: {
    cf?: string;
    pi?: string;
    cognome?: string;
    nome?: string;
  }): Promise<any[]> {
    const token = await this.authenticateFacileWS3();
    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';

    try {
      const queryParams: any = { Token: token, ...searchParams };

      const response = await axios.get(
        `${this.FACILE_WS3_URL}/Api/Rest/${agencyCode}/Anagrafica`,
        { params: queryParams }
      );

      return response.data.data?.['@Pagina'] || [];
    } catch (error) {
      const axiosError = error as any;
      throw new Error(`Failed to search anagrafica: ${axiosError.message}`);
    }
  }

  // ============================================
  // MOVIMENTO FINANZIARIO (PAYMENT) OPERATIONS
  // ============================================

  /**
   * Create a Movimento Finanziario (financial movement/payment)
   */
  async createMovimentoFinanziario(payload: MovimentoFinanziarioPayload): Promise<MovimentoFinanziarioResponse> {
    const client = await this.getClient();

    console.log('Creating movimento finanziario:', {
      externalid: payload.externalid,
      importo: payload.importo,
      codcausale: payload.codcausale,
    });

    try {
      const response = await client.post('/mov_finanziarios', payload);
      console.log('Movimento finanziario created:', response.data['@id']);
      return response.data;
    } catch (error) {
      const axiosError = error as any;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Failed to create movimento finanziario: ${
          typeof errorData === 'object' ? JSON.stringify(errorData) : axiosError.message
        }`
      );
    }
  }

  // ============================================
  // COMPLETE BOOKING FLOW
  // ============================================

  /**
   * Create a complete Pratica from a booking
   * This is the main method for sending a booking to Partner Solution:
   * 1. Get or create monthly Commessa
   * 2. Check/Create Account
   * 3. Create Pratica (with Commessa link)
   * 4. Add Passeggero
   * 5. Add Servizio
   * 6. Add Quota
   * 7. Add Movimento Finanziario
   * 8. Update Pratica status to INS
   */
  async createBookingPratica(params: {
    bookingId: string;           // Numeric booking ID (e.g., "81893011")
    confirmationCode: string;    // Full code (e.g., "CIV-81893011")
    customer: {
      firstName: string;
      lastName: string;
    };
    amount: number;              // Customer price in EUR
    sellerTitle?: string;        // Optional: seller for tracking
    travelDate?: Date;           // Optional: date of service
    serviceTitle?: string;       // Optional: servizio/quota description
    commessaCode?: string;       // Optional: override monthly commessa
    skipAccount?: boolean;       // Optional: skip Account/Cliente creation
  }): Promise<{
    praticaIri: string;
    accountIri: string | null;
    passeggeroIri: string;
    servizioIri: string;
    quotaIri: string;
    movimentoIri: string;
    commessaCode: string;
    commessaId: string;
  }> {
    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
    const supplierCode = 'IT09802381005'; // EnRoma Tours P.IVA - ALWAYS this value
    const now = new Date().toISOString();

    // Pad booking_id to 9 characters with leading zeros (per spec)
    const bookingIdPadded = params.bookingId.padStart(9, '0');

    console.log(`\n=== Creating Pratica for booking ${params.confirmationCode} ===`);
    console.log(`Customer: ${params.customer.firstName} ${params.customer.lastName}`);
    console.log(`Amount: €${params.amount}`);
    console.log(`Booking ID (padded): ${bookingIdPadded}`);

    // Step 1: Get or create monthly Commessa
    const commessaInfo = params.commessaCode
      ? await this.getOrCreateCommessaByCode(params.commessaCode)
      : await this.getOrCreateMonthlyCommessa(params.travelDate);
    console.log(`Using Commessa: ${commessaInfo.code} (${commessaInfo.id})`);

    const client = await this.getClient();

    // Step 2: Create Account (optional - can be skipped)
    let accountIri: string | null = null;
    if (!params.skipAccount) {
      console.log('\nStep 1: Creating Account...');
      const accountPayload = {
        cognome: params.customer.lastName,
        nome: params.customer.firstName,
        flagpersonafisica: 1,
        codicefiscale: bookingIdPadded,  // Must be 9 chars, left-padded with 0
        codiceagenzia: agencyCode,
        stato: 'INS',
        tipocattura: 'PS',
        iscliente: 1,
        isfornitore: 0,
        externalid: bookingIdPadded,     // Must be 9 chars, left-padded with 0
      };
      const accountResponse = await client.post('/accounts', accountPayload);
      accountIri = accountResponse.data['@id'];
      console.log(`  Account created: ${accountIri}`);
    } else {
      console.log('\nStep 1: Skipping Account creation');
    }

    // Step 3: Create Pratica with Commessa link
    console.log('\nStep 2: Creating Pratica...');
    const praticaPayload: any = {
      externalid: bookingIdPadded,       // Must be 9 chars, left-padded with 0
      cognomecliente: params.customer.lastName,
      nomecliente: params.customer.firstName,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      datacreazione: now,
      datamodifica: now,
      stato: 'WP',
      descrizionepratica: 'Tour UE ed Extra UE',
      noteinterne: params.sellerTitle ? `Seller: ${params.sellerTitle}` : '',
      delivering: `commessa:${commessaInfo.id}`,
    };
    // Only add codicecliente if we created an Account (for Cliente linking)
    if (!params.skipAccount) {
      praticaPayload.codicecliente = bookingIdPadded;  // Must be 9 chars, left-padded with 0
    }
    const praticaResponse = await client.post('/prt_praticas', praticaPayload);
    const praticaIri = praticaResponse.data['@id'];
    console.log(`  Pratica created: ${praticaIri}`);

    // Step 4: Add Passeggero
    console.log('\nStep 3: Adding Passeggero...');
    const passeggeroPayload = {
      pratica: praticaIri,
      cognomepax: params.customer.lastName,
      nomepax: params.customer.firstName,
      annullata: 0,
      iscontraente: 1,
    };
    const passeggeroResponse = await client.post('/prt_praticapasseggeros', passeggeroPayload);
    const passeggeroIri = passeggeroResponse.data['@id'];
    console.log(`  Passeggero added: ${passeggeroIri}`);

    // Step 5: Add Servizio
    console.log('\nStep 4: Adding Servizio...');
    const praticaCreationDate = now.split('T')[0];  // Always use pratica creation date per spec
    const serviceTitle = params.serviceTitle || 'Tour UE ed Extra UE';
    const servizioPayload = {
      pratica: praticaIri,
      externalid: bookingIdPadded,           // Must be 9 chars, left-padded with 0
      tiposervizio: 'PKG',                   // Always PKQ per spec
      tipovendita: 'ORG',
      regimevendita: '74T',
      codicefornitore: supplierCode,
      ragsocfornitore: 'EnRoma Tours',
      codicefilefornitore: bookingIdPadded,  // Must be 9 chars, left-padded with 0
      datacreazione: now,
      datainizioservizio: praticaCreationDate,  // Always pratica creation date per spec
      datafineservizio: praticaCreationDate,    // Always pratica creation date per spec
      duratant: 0,
      duratagg: 1,
      nrpaxadulti: 1,                        // Total participants
      nrpaxchild: 0,                         // Always 0 per spec
      nrpaxinfant: 0,                        // Always 0 per spec
      descrizione: serviceTitle,
      tipodestinazione: 'CEENAZ',
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS',
    };
    const servizioResponse = await client.post('/prt_praticaservizios', servizioPayload);
    const servizioIri = servizioResponse.data['@id'];
    console.log(`  Servizio added: ${servizioIri}`);

    // Step 6: Add Quota
    console.log('\nStep 5: Adding Quota...');
    const quotaPayload = {
      servizio: servizioIri,
      descrizionequota: serviceTitle,
      datavendita: now,
      codiceisovalutacosto: 'EUR',
      quantitacosto: 1,
      costovalutaprimaria: params.amount,
      quantitaricavo: 1,
      ricavovalutaprimaria: params.amount,
      codiceisovalutaricavo: 'EUR',
      commissioniattivevalutaprimaria: 0,
      commissionipassivevalutaprimaria: 0,
      progressivo: 1,
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS',
    };
    const quotaResponse = await client.post('/prt_praticaservizioquotas', quotaPayload);
    const quotaIri = quotaResponse.data['@id'];
    console.log(`  Quota added: ${quotaIri}`);

    // Step 7: Add Movimento Finanziario
    // codicefile must match codicefilefornitore in Servizio to link payment to service
    console.log('\nStep 6: Adding Movimento Finanziario...');
    const movimentoPayload: MovimentoFinanziarioPayload = {
      externalid: bookingIdPadded,   // Must be 9 chars, left-padded with 0
      tipomovimento: 'I',
      codicefile: bookingIdPadded,   // Must match codicefilefornitore in Servizio to link
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      importo: params.amount,
      datacreazione: now,
      datamodifica: now,
      datamovimento: now,
      stato: 'INS',
      codcausale: 'PAGBOK',
      descrizione: `Tour UE ed Extra UE - ${params.confirmationCode}`,
    };
    const movimentoResponse = await this.createMovimentoFinanziario(movimentoPayload);
    const movimentoIri = movimentoResponse['@id'];
    console.log(`  Movimento added: ${movimentoIri}`);

    // Step 8: Update Pratica status to INS
    console.log('\nStep 7: Updating Pratica status to INS...');
    await client.put(praticaIri, { ...praticaPayload, stato: 'INS' });
    console.log('  Pratica status updated to INS');

    console.log('\n=== Pratica created successfully ===');
    console.log(`Pratica IRI: ${praticaIri}`);
    console.log(`Commessa: ${commessaInfo.code} (${commessaInfo.id})`);

    return {
      praticaIri,
      accountIri,
      passeggeroIri,
      servizioIri,
      quotaIri,
      movimentoIri,
      commessaCode: commessaInfo.code,
      commessaId: commessaInfo.id,
    };
  }

  /**
   * Save Partner Solution references to the database
   * Call this after createBookingPratica to persist the references for refunds/linking
   */
  async savePsReferencesToDatabase(params: {
    bookingId: number;
    confirmationCode: string;
    customerName: string;
    customerEmail?: string;
    sellerName?: string;
    totalAmount: number;
    bookingCreationDate?: Date;
    psReferences: {
      accountIri: string | null;
      praticaIri: string;
      passeggeroIri: string;
      servizioIri: string;
      quotaIri: string;
      movimentoIri: string;
      commessaCode: string;
    };
  }): Promise<{ invoiceId: string }> {
    console.log(`\nSaving PS references to database for booking ${params.bookingId}...`);

    const { data, error } = await supabase
      .from('invoices')
      .upsert({
        booking_id: params.bookingId,
        confirmation_code: params.confirmationCode,
        invoice_type: 'INVOICE',
        status: 'sent',
        total_amount: params.totalAmount,
        currency: 'EUR',
        customer_name: params.customerName,
        customer_email: params.customerEmail,
        seller_name: params.sellerName,
        booking_creation_date: params.bookingCreationDate?.toISOString().split('T')[0],
        sent_at: new Date().toISOString(),
        // Partner Solution references
        ps_account_iri: params.psReferences.accountIri,
        ps_pratica_iri: params.psReferences.praticaIri,
        ps_passeggero_iri: params.psReferences.passeggeroIri,
        ps_servizio_iri: params.psReferences.servizioIri,
        ps_quota_iri: params.psReferences.quotaIri,
        ps_movimento_iri: params.psReferences.movimentoIri,
        ps_commessa_code: params.psReferences.commessaCode,
        ps_raw_response: params.psReferences,
        created_by: 'api',
      }, {
        onConflict: 'booking_id,invoice_type',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to save PS references:', error);
      throw new Error(`Failed to save PS references: ${error.message}`);
    }

    console.log(`  Saved to invoices table with ID: ${data.id}`);
    return { invoiceId: data.id };
  }

  /**
   * Get PS references from database for a booking
   * Use this when creating refunds/credit notes
   */
  async getPsReferencesFromDatabase(bookingId: number): Promise<{
    invoiceId: string;
    accountIri: string;
    praticaIri: string;
    passeggeroIri: string;
    servizioIri: string;
    quotaIri: string;
    movimentoIri: string;
    commessaCode: string;
  } | null> {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, ps_account_iri, ps_pratica_iri, ps_passeggero_iri, ps_servizio_iri, ps_quota_iri, ps_movimento_iri, ps_commessa_code')
      .eq('booking_id', bookingId)
      .eq('invoice_type', 'INVOICE')
      .single();

    if (error || !data) {
      console.log(`No PS references found for booking ${bookingId}`);
      return null;
    }

    return {
      invoiceId: data.id,
      accountIri: data.ps_account_iri,
      praticaIri: data.ps_pratica_iri,
      passeggeroIri: data.ps_passeggero_iri,
      servizioIri: data.ps_servizio_iri,
      quotaIri: data.ps_quota_iri,
      movimentoIri: data.ps_movimento_iri,
      commessaCode: data.ps_commessa_code,
    };
  }

  /**
   * Generate monthly Commessa code from a date
   * Format: YYYY-MM (e.g., "2026-01")
   */
  getMonthlyCommessaCode(date?: Date): string {
    const targetDate = date || new Date();
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
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
