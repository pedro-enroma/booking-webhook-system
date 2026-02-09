/**
 * Payload Storage Service
 * Offloads webhook raw_payload from DB to Supabase Storage.
 * Gated behind ENABLE_PAYLOAD_OFFLOAD feature flag.
 */

import { createHash, randomUUID } from 'crypto';
import { supabase } from '../config/supabase';

const BUCKET_NAME = 'webhook-payloads';
const ENV_PREFIX = process.env.NODE_ENV || 'development';

// In-memory cache for health metrics (30s TTL)
let healthCache: { data: StorageHealthMetrics | null; expiresAt: number } = {
  data: null,
  expiresAt: 0,
};

// --- Feature flag ---

export function isOffloadEnabled(): boolean {
  return process.env.ENABLE_PAYLOAD_OFFLOAD === 'true';
}

// --- Types ---

export interface PayloadUploadResult {
  storageKey: string;
  checksum: string;
}

export interface StorageHealthMetrics {
  uploadSuccesses: number;
  uploadFailures: number;
  checksumMismatches: number;
  lastError: string | null;
  lastOccurredAt: string | null;
}

export interface VerifyResult {
  verified: number;
  mismatches: number;
  errors: number;
}

// --- Core functions ---

/**
 * Upload full payload to Supabase Storage.
 * Returns storage key and SHA-256 checksum.
 */
export async function uploadPayload(
  data: any,
  bookingId: string,
  webhookType: string
): Promise<PayloadUploadResult> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const uuid = randomUUID();
  const storageKey = `${ENV_PREFIX}/${year}/${month}/${bookingId}-${uuid}.json`;

  const jsonBytes = Buffer.from(JSON.stringify(data));
  const checksum = createHash('sha256').update(jsonBytes).digest('hex');

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storageKey, jsonBytes, {
      contentType: 'application/json',
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return { storageKey, checksum };
}

/**
 * Get full payload, transparently handling DB-stored vs storage-backed.
 * If the row has a payload_storage_key, downloads from storage.
 * Otherwise returns raw_payload as-is.
 */
export async function getFullPayload(logEntry: {
  raw_payload: any;
  payload_storage_key?: string | null;
}): Promise<any> {
  // If no storage key, raw_payload is the full payload
  if (!logEntry.payload_storage_key) {
    return logEntry.raw_payload;
  }

  // Download from storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(logEntry.payload_storage_key);

  if (error) {
    console.error(
      `[PayloadStorage] Failed to download ${logEntry.payload_storage_key}: ${error.message}`
    );
    // Fall back to whatever is in raw_payload (may be summary)
    return logEntry.raw_payload;
  }

  const text = await data.text();
  return JSON.parse(text);
}

/**
 * Build a compact ~200-byte summary of the payload for inline DB storage.
 */
export function buildPayloadSummary(data: any): any {
  return {
    _storage_ref: true,
    bookingId: data.bookingId,
    parentBookingId: data.parentBookingId || data.parentBooking?.bookingId,
    action: data.action,
    status: data.status || data.parentBooking?.status,
    productId: data.productId,
    title: data.title,
    startDateTime: data.startDateTime,
    totalPrice: data.totalPrice,
    currency: data.currency,
    creationDate: data.creationDate,
  };
}

// --- Health metrics (DB-persisted) ---

/**
 * Atomically increment a metric counter in payload_storage_health.
 */
export async function incrementMetric(
  metric: 'upload_failure' | 'checksum_mismatch' | 'upload_success',
  errorMsg?: string
): Promise<void> {
  const updateFields: any = {
    count: undefined, // will use raw SQL increment
    updated_at: new Date().toISOString(),
  };

  if (errorMsg) {
    updateFields.last_error = errorMsg;
    updateFields.last_occurred_at = new Date().toISOString();
  }

  // Use RPC or raw update for atomic increment
  const { error } = await supabase.rpc('increment_storage_metric' as any, {
    metric_name: metric,
    error_msg: errorMsg || null,
  });

  // Fallback: if RPC doesn't exist yet, use direct update
  if (error) {
    // Manual atomic increment via raw SQL through a simple approach
    const { data: current } = await supabase
      .from('payload_storage_health')
      .select('count')
      .eq('metric', metric)
      .single();

    if (current) {
      await supabase
        .from('payload_storage_health')
        .update({
          count: current.count + 1,
          updated_at: new Date().toISOString(),
          ...(errorMsg
            ? {
                last_error: errorMsg,
                last_occurred_at: new Date().toISOString(),
              }
            : {}),
        })
        .eq('metric', metric);
    }
  }

  // Invalidate cache
  healthCache.expiresAt = 0;
}

/**
 * Get storage health metrics from DB with 30s in-memory cache.
 */
export async function getStorageHealthMetrics(): Promise<StorageHealthMetrics> {
  const now = Date.now();
  if (healthCache.data && now < healthCache.expiresAt) {
    return healthCache.data;
  }

  const { data, error } = await supabase
    .from('payload_storage_health')
    .select('metric, count, last_error, last_occurred_at');

  if (error || !data) {
    return {
      uploadSuccesses: 0,
      uploadFailures: 0,
      checksumMismatches: 0,
      lastError: null,
      lastOccurredAt: null,
    };
  }

  const byMetric = new Map(data.map((row) => [row.metric, row]));
  const failureRow = byMetric.get('upload_failure');
  const mismatchRow = byMetric.get('checksum_mismatch');

  const metrics: StorageHealthMetrics = {
    uploadSuccesses: byMetric.get('upload_success')?.count || 0,
    uploadFailures: failureRow?.count || 0,
    checksumMismatches: mismatchRow?.count || 0,
    lastError: failureRow?.last_error || mismatchRow?.last_error || null,
    lastOccurredAt:
      failureRow?.last_occurred_at || mismatchRow?.last_occurred_at || null,
  };

  healthCache = { data: metrics, expiresAt: now + 30_000 };
  return metrics;
}

// --- Verification ---

/**
 * Verify recent uploads by re-downloading and comparing checksums.
 * Called by hourly cron job.
 */
export async function verifyRecentUploads(
  hours: number = 2
): Promise<VerifyResult> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('webhook_logs')
    .select('id, payload_storage_key, payload_checksum')
    .not('payload_storage_key', 'is', null)
    .is('payload_verified_at', null)
    .gte('received_at', cutoff)
    .limit(200);

  if (error || !rows || rows.length === 0) {
    return { verified: 0, mismatches: 0, errors: 0 };
  }

  let verified = 0;
  let mismatches = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const { data: blob, error: dlError } = await supabase.storage
        .from(BUCKET_NAME)
        .download(row.payload_storage_key!);

      if (dlError || !blob) {
        errors++;
        console.error(
          `[VerifyUploads] Download failed for row ${row.id}: ${dlError?.message}`
        );
        continue;
      }

      const bytes = Buffer.from(await blob.arrayBuffer());
      const downloadedChecksum = createHash('sha256')
        .update(bytes)
        .digest('hex');

      if (downloadedChecksum === row.payload_checksum) {
        // Mark as verified
        await supabase
          .from('webhook_logs')
          .update({ payload_verified_at: new Date().toISOString() })
          .eq('id', row.id);
        verified++;
      } else {
        mismatches++;
        await incrementMetric('checksum_mismatch', `Row ${row.id}: expected ${row.payload_checksum}, got ${downloadedChecksum}`);
        console.error(
          `[VerifyUploads] Checksum mismatch for row ${row.id}`
        );
      }
    } catch (err: any) {
      errors++;
      console.error(
        `[VerifyUploads] Error verifying row ${row.id}: ${err.message}`
      );
    }
  }

  console.log(
    `[VerifyUploads] Verified: ${verified}, Mismatches: ${mismatches}, Errors: ${errors}`
  );
  return { verified, mismatches, errors };
}

// --- Orphan scanning ---

/**
 * Scan storage bucket for orphan objects (no matching DB row).
 * Logs orphan count + keys. Does NOT auto-delete.
 */
export async function scanOrphanPayloads(): Promise<{
  total: number;
  orphans: number;
  orphanKeys: string[];
}> {
  let allStorageKeys: string[] = [];
  let offset = 0;
  const limit = 1000;

  // Paginated list of all objects in the env prefix
  while (true) {
    const { data: files, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(ENV_PREFIX, { limit, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error || !files || files.length === 0) break;

    // Storage.list returns files at current level; we need recursive listing
    // List year folders first, then month folders, then files
    for (const yearFolder of files) {
      if (!yearFolder.id) {
        // It's a folder
        const { data: monthFolders } = await supabase.storage
          .from(BUCKET_NAME)
          .list(`${ENV_PREFIX}/${yearFolder.name}`, { limit: 100 });

        if (monthFolders) {
          for (const monthFolder of monthFolders) {
            if (!monthFolder.id) {
              const { data: payloadFiles } = await supabase.storage
                .from(BUCKET_NAME)
                .list(`${ENV_PREFIX}/${yearFolder.name}/${monthFolder.name}`, {
                  limit: 10000,
                });

              if (payloadFiles) {
                for (const f of payloadFiles) {
                  if (f.name) {
                    allStorageKeys.push(
                      `${ENV_PREFIX}/${yearFolder.name}/${monthFolder.name}/${f.name}`
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
    break; // list at env prefix level returns year folders; we've recursed
  }

  if (allStorageKeys.length === 0) {
    return { total: 0, orphans: 0, orphanKeys: [] };
  }

  // Get all payload_storage_key values from DB
  const { data: dbRows, error: dbError } = await supabase
    .from('webhook_logs')
    .select('payload_storage_key')
    .not('payload_storage_key', 'is', null);

  const dbKeys = new Set((dbRows || []).map((r) => r.payload_storage_key));

  const orphanKeys = allStorageKeys.filter((key) => !dbKeys.has(key));

  if (orphanKeys.length > 0) {
    console.log(
      `[OrphanScan] Found ${orphanKeys.length} orphan objects out of ${allStorageKeys.length} total`
    );
    orphanKeys.forEach((key) => console.log(`  Orphan: ${key}`));
  } else {
    console.log(
      `[OrphanScan] No orphans found. ${allStorageKeys.length} objects all accounted for.`
    );
  }

  return { total: allStorageKeys.length, orphans: orphanKeys.length, orphanKeys };
}
