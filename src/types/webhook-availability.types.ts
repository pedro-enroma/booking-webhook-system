// src/types/webhook-availability.types.ts

export interface AvailabilityWebhookEvent {
    timestamp: string;
    experienceId: string;
    supplierId: string;
    updateReasons: string[];
    dateFrom: string;
    dateTo: string;
  }
  
  // Funzione helper per estrarre il product ID dall'experienceId base64
  export function extractProductIdFromExperience(experienceId: string): string | null {
    try {
      // Decodifica base64
      const decoded = Buffer.from(experienceId, 'base64').toString('utf-8');
      // Il formato dovrebbe essere qualcosa come "Experience:12345"
      const parts = decoded.split(':');
      if (parts.length === 2) {
        return parts[1];
      }
      return null;
    } catch (error) {
      console.error('Errore decodificando experienceId:', error);
      return null;
    }
  }