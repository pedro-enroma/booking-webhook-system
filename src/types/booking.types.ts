// TIPI PER I DATI DEL WEBHOOK DI BOKUN
// Questi tipi descrivono esattamente la struttura dei dati che riceveremo da Bokun

// Tipo principale per l'intera prenotazione
export interface BookingData {
    creationDate: number;         // Data di creazione in formato timestamp
    bookingId: number;           // ID univoco della prenotazione
    language: string;            // Lingua (es, en, it, ecc.)
    confirmationCode: string;    // Codice di conferma (es. ENRO-66379912)
    externalBookingReference: string;
    status: string;              // CONFIRMED, CANCELLED, ecc.
    currency: string;            // EUR, USD, ecc.
    totalPrice: number;          // Prezzo totale
    totalPaid: number;           // Quanto è stato pagato
    totalDue: number;            // Quanto resta da pagare
    totalDueAsText: string;      // Formato testo (es. "€186,00")
    totalPriceConverted: number;
    customer: Customer;          // I dati del cliente (definito sotto)
    invoice: Invoice;            // I dati della fattura (definito sotto)
    customerPayments: any[];     // Array di pagamenti
    extranetUser: ExtranetUser;  // Chi ha fatto la prenotazione
    paymentType: string;         // NOT_PAID, PAID, ecc.
    seller: Seller;              // Chi vende (EnRoma.com)
    bookingChannel: BookingChannel;
    accommodationBookings: any[];
    activityBookings: ActivityBooking[]; // Le attività prenotate
    routeBookings: any[];
    giftCardBookings: any[];
    bookingFields: any[];
    action: string;              // BOOKING_CONFIRMED
  }
  
  // Tipo per i dati del cliente
  export interface Customer {
    contactDetailsHidden: boolean;
    contactDetailsHiddenUntil: null;
    id: number;                  // ID del cliente nel sistema di origine
    created: null;
    uuid: string;                // Identificatore univoco
    email: string;
    title: null;
    firstName: string;           // Nome
    lastName: string;            // Cognome
    personalIdNumber: null;
    clcEmail: boolean;
    language: null;
    nationality: null;
    sex: null;
    dateOfBirth: null;
    phoneNumber: string;         // Numero di telefono
    phoneNumberCountryCode: null;
    address: null;
    postCode: null;
    state: null;
    place: null;
    country: null;
    organization: null;
    passportId: null;
    passportExpDay: null;
    passportExpMonth: null;
    passportExpYear: null;
    credentials: null;
    acceptsMarketing: boolean;
    tags: null;
    octoNote: null;
  }
  
  // Tipo per le attività prenotate (i tour)
  export interface ActivityBooking {
    bookingId: number;
    parentBookingId: number;
    confirmationCode: string;
    productConfirmationCode: string;
    startDateTime: number;
    endDateTime: number;
    status: string;
    title: string;
    totalPrice: number;
    priceWithDiscount: number;
    product: {
      id: number;
      title: string;
    };
    pricingCategoryBookings: PricingCategoryBooking[];
    rateId: number;
    rateTitle: string;
    date: number;
    dateString: string;
    startTime: string;
  }
  
  // Tipo per i partecipanti di ogni attività
  export interface PricingCategoryBooking {
    id: number;
    pricingCategoryId: number;
    pricingCategory: {
      id: number;
      title: string;
    };
    leadPassenger: boolean;
    age: number;
    bookingAnswers: any[];
    bookedTitle: string;
    occupancy: number;
    quantity: number;
  }
  
  // Altri tipi necessari
  export interface Seller {
    id: number;
    title: string;
    description?: string;
    currencyCode: string;
    countryCode: string;
    phoneNumber: string;
    emailAddress: string;
    website?: string;
  }
  
  export interface Invoice {
    id: number;
    issueDate: number;
    currency: string;
  }
  
  export interface ExtranetUser {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
  }
  
  export interface BookingChannel {
    id: number;
    uuid: string;
    title: string;
    backend: boolean;
    type: string;
  }