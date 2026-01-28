/**
 * Extract country information from phone number
 * Uses phone country code to determine customer's country
 * Fallback: Spain (ES) when no valid phone number
 */

// Map of phone country codes to country info
// Format: phoneCode -> { code: ISO 3166-1 alpha-2, name: country name in Italian for PS }
const PHONE_COUNTRY_MAP: Record<string, { code: string; name: string }> = {
  '1': { code: 'US', name: 'Stati Uniti' },      // USA/Canada
  '7': { code: 'RU', name: 'Russia' },
  '20': { code: 'EG', name: 'Egitto' },
  '27': { code: 'ZA', name: 'Sudafrica' },
  '30': { code: 'GR', name: 'Grecia' },
  '31': { code: 'NL', name: 'Paesi Bassi' },
  '32': { code: 'BE', name: 'Belgio' },
  '33': { code: 'FR', name: 'Francia' },
  '34': { code: 'ES', name: 'Spagna' },
  '36': { code: 'HU', name: 'Ungheria' },
  '39': { code: 'ES', name: 'Spagna' },  // Italy → Spain (avoid Italian invoicing rules)
  '40': { code: 'RO', name: 'Romania' },
  '41': { code: 'CH', name: 'Svizzera' },
  '43': { code: 'AT', name: 'Austria' },
  '44': { code: 'GB', name: 'Regno Unito' },
  '45': { code: 'DK', name: 'Danimarca' },
  '46': { code: 'SE', name: 'Svezia' },
  '47': { code: 'NO', name: 'Norvegia' },
  '48': { code: 'PL', name: 'Polonia' },
  '49': { code: 'DE', name: 'Germania' },
  '51': { code: 'PE', name: 'Perù' },
  '52': { code: 'MX', name: 'Messico' },
  '53': { code: 'CU', name: 'Cuba' },
  '54': { code: 'AR', name: 'Argentina' },
  '55': { code: 'BR', name: 'Brasile' },
  '56': { code: 'CL', name: 'Cile' },
  '57': { code: 'CO', name: 'Colombia' },
  '58': { code: 'VE', name: 'Venezuela' },
  '60': { code: 'MY', name: 'Malesia' },
  '61': { code: 'AU', name: 'Australia' },
  '62': { code: 'ID', name: 'Indonesia' },
  '63': { code: 'PH', name: 'Filippine' },
  '64': { code: 'NZ', name: 'Nuova Zelanda' },
  '65': { code: 'SG', name: 'Singapore' },
  '66': { code: 'TH', name: 'Tailandia' },
  '81': { code: 'JP', name: 'Giappone' },
  '82': { code: 'KR', name: 'Corea del Sud' },
  '84': { code: 'VN', name: 'Vietnam' },
  '86': { code: 'CN', name: 'Cina' },
  '90': { code: 'TR', name: 'Turchia' },
  '91': { code: 'IN', name: 'India' },
  '92': { code: 'PK', name: 'Pakistan' },
  '93': { code: 'AF', name: 'Afghanistan' },
  '94': { code: 'LK', name: 'Sri Lanka' },
  '95': { code: 'MM', name: 'Myanmar' },
  '98': { code: 'IR', name: 'Iran' },
  '212': { code: 'MA', name: 'Marocco' },
  '213': { code: 'DZ', name: 'Algeria' },
  '216': { code: 'TN', name: 'Tunisia' },
  '218': { code: 'LY', name: 'Libia' },
  '220': { code: 'GM', name: 'Gambia' },
  '221': { code: 'SN', name: 'Senegal' },
  '234': { code: 'NG', name: 'Nigeria' },
  '249': { code: 'SD', name: 'Sudan' },
  '251': { code: 'ET', name: 'Etiopia' },
  '254': { code: 'KE', name: 'Kenya' },
  '255': { code: 'TZ', name: 'Tanzania' },
  '256': { code: 'UG', name: 'Uganda' },
  '258': { code: 'MZ', name: 'Mozambico' },
  '260': { code: 'ZM', name: 'Zambia' },
  '261': { code: 'MG', name: 'Madagascar' },
  '263': { code: 'ZW', name: 'Zimbabwe' },
  '351': { code: 'PT', name: 'Portogallo' },
  '352': { code: 'LU', name: 'Lussemburgo' },
  '353': { code: 'IE', name: 'Irlanda' },
  '354': { code: 'IS', name: 'Islanda' },
  '355': { code: 'AL', name: 'Albania' },
  '356': { code: 'MT', name: 'Malta' },
  '357': { code: 'CY', name: 'Cipro' },
  '358': { code: 'FI', name: 'Finlandia' },
  '359': { code: 'BG', name: 'Bulgaria' },
  '370': { code: 'LT', name: 'Lituania' },
  '371': { code: 'LV', name: 'Lettonia' },
  '372': { code: 'EE', name: 'Estonia' },
  '373': { code: 'MD', name: 'Moldavia' },
  '374': { code: 'AM', name: 'Armenia' },
  '375': { code: 'BY', name: 'Bielorussia' },
  '376': { code: 'AD', name: 'Andorra' },
  '377': { code: 'MC', name: 'Monaco' },
  '378': { code: 'SM', name: 'San Marino' },
  '380': { code: 'UA', name: 'Ucraina' },
  '381': { code: 'RS', name: 'Serbia' },
  '382': { code: 'ME', name: 'Montenegro' },
  '383': { code: 'XK', name: 'Kosovo' },
  '385': { code: 'HR', name: 'Croazia' },
  '386': { code: 'SI', name: 'Slovenia' },
  '387': { code: 'BA', name: 'Bosnia ed Erzegovina' },
  '389': { code: 'MK', name: 'Macedonia del Nord' },
  '420': { code: 'CZ', name: 'Repubblica Ceca' },
  '421': { code: 'SK', name: 'Slovacchia' },
  '423': { code: 'LI', name: 'Liechtenstein' },
  '501': { code: 'BZ', name: 'Belize' },
  '502': { code: 'GT', name: 'Guatemala' },
  '503': { code: 'SV', name: 'El Salvador' },
  '504': { code: 'HN', name: 'Honduras' },
  '505': { code: 'NI', name: 'Nicaragua' },
  '506': { code: 'CR', name: 'Costa Rica' },
  '507': { code: 'PA', name: 'Panama' },
  '509': { code: 'HT', name: 'Haiti' },
  '591': { code: 'BO', name: 'Bolivia' },
  '592': { code: 'GY', name: 'Guyana' },
  '593': { code: 'EC', name: 'Ecuador' },
  '595': { code: 'PY', name: 'Paraguay' },
  '598': { code: 'UY', name: 'Uruguay' },
  '852': { code: 'HK', name: 'Hong Kong' },
  '853': { code: 'MO', name: 'Macao' },
  '855': { code: 'KH', name: 'Cambogia' },
  '856': { code: 'LA', name: 'Laos' },
  '880': { code: 'BD', name: 'Bangladesh' },
  '886': { code: 'TW', name: 'Taiwan' },
  '960': { code: 'MV', name: 'Maldive' },
  '961': { code: 'LB', name: 'Libano' },
  '962': { code: 'JO', name: 'Giordania' },
  '963': { code: 'SY', name: 'Siria' },
  '964': { code: 'IQ', name: 'Iraq' },
  '965': { code: 'KW', name: 'Kuwait' },
  '966': { code: 'SA', name: 'Arabia Saudita' },
  '967': { code: 'YE', name: 'Yemen' },
  '968': { code: 'OM', name: 'Oman' },
  '970': { code: 'PS', name: 'Palestina' },
  '971': { code: 'AE', name: 'Emirati Arabi Uniti' },
  '972': { code: 'IL', name: 'Israele' },
  '973': { code: 'BH', name: 'Bahrain' },
  '974': { code: 'QA', name: 'Qatar' },
  '975': { code: 'BT', name: 'Bhutan' },
  '976': { code: 'MN', name: 'Mongolia' },
  '977': { code: 'NP', name: 'Nepal' },
  '992': { code: 'TJ', name: 'Tagikistan' },
  '993': { code: 'TM', name: 'Turkmenistan' },
  '994': { code: 'AZ', name: 'Azerbaigian' },
  '995': { code: 'GE', name: 'Georgia' },
  '996': { code: 'KG', name: 'Kirghizistan' },
  '998': { code: 'UZ', name: 'Uzbekistan' },
};

// Default fallback: Spain
const DEFAULT_COUNTRY = { code: 'ES', name: 'Spagna' };

/**
 * Extract country code from phone number
 * Handles formats: +34627530167, +34 627530167, 34627530167, etc.
 */
export function extractPhoneCountryCode(phoneNumber: string | null | undefined): string | null {
  if (!phoneNumber) return null;

  // Clean the phone number: remove spaces, dashes, parentheses
  let cleaned = phoneNumber.replace(/[\s\-\(\)\.]/g, '');

  // Handle scientific notation (data quality issue)
  if (cleaned.includes('E+') || cleaned.includes('e+')) {
    return null;
  }

  // Remove leading + if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Try to match country codes (longest first for accuracy)
  // Check 3-digit codes first, then 2-digit, then 1-digit
  for (const length of [3, 2, 1]) {
    const potentialCode = cleaned.substring(0, length);
    if (PHONE_COUNTRY_MAP[potentialCode]) {
      return potentialCode;
    }
  }

  return null;
}

/**
 * Get country info from phone number
 * Returns { code, name } or default (Spain) if not determinable
 */
export function getCountryFromPhone(phoneNumber: string | null | undefined): { code: string; name: string } {
  const phoneCode = extractPhoneCountryCode(phoneNumber);

  if (phoneCode && PHONE_COUNTRY_MAP[phoneCode]) {
    return PHONE_COUNTRY_MAP[phoneCode];
  }

  return DEFAULT_COUNTRY;
}

/**
 * Get country name (in Italian) for Partner Solution nazione field
 */
export function getCountryNameForPS(phoneNumber: string | null | undefined): string {
  return getCountryFromPhone(phoneNumber).name;
}

/**
 * Get ISO country code
 */
export function getCountryCode(phoneNumber: string | null | undefined): string {
  return getCountryFromPhone(phoneNumber).code;
}
