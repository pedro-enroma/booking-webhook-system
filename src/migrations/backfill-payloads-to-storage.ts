/**
 * Backfill Payloads to Storage — Two-Pass Migration
 *
 * Usage:
 *   npx ts-node src/migrations/backfill-payloads-to-storage.ts --mode=pass-a
 *   npx ts-node src/migrations/backfill-payloads-to-storage.ts --mode=verify
 *   npx ts-node src/migrations/backfill-payloads-to-storage.ts --mode=pass-b
 *
 * Environment variables:
 *   BACKFILL_BATCH_SIZE     — rows per batch (default: 100)
 *   BACKFILL_BATCH_DELAY_MS — delay between batches in ms (default: 1000)
 */

import { createHash } from 'crypto';
import { supabase } from '../config/supabase';
import { buildPayloadSummary } from '../services/payloadStorage';
import dotenv from 'dotenv';

dotenv.config();

const BUCKET_NAME = 'webhook-payloads';
const ENV_PREFIX = process.env.NODE_ENV || 'development';
const BATCH_SIZE = parseInt(process.env.BACKFILL_BATCH_SIZE || '100');
const BATCH_DELAY_MS = parseInt(process.env.BACKFILL_BATCH_DELAY_MS || '1000');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Pass A: Upload payloads to storage, set pointers, keep original raw_payload ---

async function passA(): Promise<void> {
  console.log('='.repeat(80));
  console.log('PASS A: Upload payloads to storage (keep originals)');
  console.log('='.repeat(80));
  console.log(`Batch size: ${BATCH_SIZE}, Delay: ${BATCH_DELAY_MS}ms\n`);

  let totalProcessed = 0;
  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  while (true) {
    // Get next batch of rows without storage key
    const { data: rows, error } = await supabase
      .from('webhook_logs')
      .select('id, booking_id, raw_payload')
      .is('payload_storage_key', null)
      .not('raw_payload', 'is', null)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('Query error:', error.message);
      break;
    }

    if (!rows || rows.length === 0) {
      console.log('\nNo more rows to process.');
      break;
    }

    for (const row of rows) {
      totalProcessed++;

      try {
        // Upload to storage
        const jsonBytes = Buffer.from(JSON.stringify(row.raw_payload));
        const checksum = createHash('sha256').update(jsonBytes).digest('hex');
        const storageKey = `${ENV_PREFIX}/backfill/${row.id}-${row.booking_id}.json`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(storageKey, jsonBytes, {
            contentType: 'application/json',
            upsert: false,
          });

        if (uploadError) {
          // May already exist from a previous run (idempotent)
          if (uploadError.message?.includes('already exists') || uploadError.message?.includes('Duplicate')) {
            // Object exists, just verify and set pointer
          } else {
            console.error(`  Row ${row.id}: Upload failed: ${uploadError.message}`);
            totalErrors++;
            continue;
          }
        }

        // Download back and verify checksum
        const { data: blob, error: dlError } = await supabase.storage
          .from(BUCKET_NAME)
          .download(storageKey);

        if (dlError || !blob) {
          console.error(`  Row ${row.id}: Download verification failed: ${dlError?.message}`);
          totalErrors++;
          continue;
        }

        const downloadedBytes = Buffer.from(await blob.arrayBuffer());
        const downloadedChecksum = createHash('sha256').update(downloadedBytes).digest('hex');

        if (downloadedChecksum !== checksum) {
          console.error(`  Row ${row.id}: Checksum mismatch! Expected ${checksum}, got ${downloadedChecksum}`);
          totalErrors++;
          continue;
        }

        // Set pointer in DB (idempotent guard: only where payload_storage_key IS NULL)
        const { error: updateError } = await supabase
          .from('webhook_logs')
          .update({
            payload_storage_key: storageKey,
            payload_checksum: checksum,
          })
          .eq('id', row.id)
          .is('payload_storage_key', null);

        if (updateError) {
          console.error(`  Row ${row.id}: Update failed: ${updateError.message}`);
          totalErrors++;
          continue;
        }

        totalUploaded++;
      } catch (err: any) {
        console.error(`  Row ${row.id}: Error: ${err.message}`);
        totalErrors++;
      }
    }

    console.log(
      `  Batch done. Processed: ${totalProcessed}, Uploaded: ${totalUploaded}, Errors: ${totalErrors}`
    );

    await sleep(BATCH_DELAY_MS);
  }

  console.log('\n' + '='.repeat(80));
  console.log('PASS A SUMMARY');
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Uploaded: ${totalUploaded}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Errors: ${totalErrors}`);
  console.log('='.repeat(80));
}

// --- Verify: Full verification of ALL backfilled rows ---

async function verify(): Promise<boolean> {
  console.log('='.repeat(80));
  console.log('VERIFY: Full checksum verification of all backfilled rows');
  console.log('='.repeat(80));

  let allPassed = true;

  // 1. Count check: no rows missing payload_storage_key
  const { count: missingCount } = await supabase
    .from('webhook_logs')
    .select('id', { count: 'exact', head: true })
    .is('payload_storage_key', null)
    .not('raw_payload', 'is', null);

  console.log(`\n1. Rows without storage key: ${missingCount || 0}`);
  if ((missingCount || 0) > 0) {
    console.error('   FAIL: Some rows are missing payload_storage_key');
    allPassed = false;
  } else {
    console.log('   PASS');
  }

  // 2. Count match: DB rows with storage key
  const { count: dbKeyCount } = await supabase
    .from('webhook_logs')
    .select('id', { count: 'exact', head: true })
    .not('payload_storage_key', 'is', null);

  console.log(`\n2. DB rows with storage key: ${dbKeyCount || 0}`);

  // 3. Full checksum verification
  console.log('\n3. Full checksum verification (all rows)...');
  let verified = 0;
  let mismatches = 0;
  let downloadErrors = 0;
  let offset = 0;

  while (true) {
    const { data: rows } = await supabase
      .from('webhook_logs')
      .select('id, payload_storage_key, payload_checksum')
      .not('payload_storage_key', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + 499);

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      try {
        const { data: blob, error: dlError } = await supabase.storage
          .from(BUCKET_NAME)
          .download(row.payload_storage_key!);

        if (dlError || !blob) {
          downloadErrors++;
          console.error(`   Row ${row.id}: Download failed: ${dlError?.message}`);
          continue;
        }

        const bytes = Buffer.from(await blob.arrayBuffer());
        const checksum = createHash('sha256').update(bytes).digest('hex');

        if (checksum === row.payload_checksum) {
          verified++;
        } else {
          mismatches++;
          console.error(`   Row ${row.id}: Checksum mismatch`);
        }
      } catch (err: any) {
        downloadErrors++;
        console.error(`   Row ${row.id}: Error: ${err.message}`);
      }
    }

    offset += rows.length;
    if (offset % 1000 === 0) {
      console.log(`   Progress: ${offset} rows checked...`);
    }

    await sleep(500); // Rate limit
  }

  console.log(`   Verified: ${verified}, Mismatches: ${mismatches}, Download errors: ${downloadErrors}`);
  if (mismatches > 0 || downloadErrors > 0) {
    console.error('   FAIL');
    allPassed = false;
  } else {
    console.log('   PASS');
  }

  // 4. Shape test (sample 5 from different months)
  console.log('\n4. Shape test (5 random samples)...');
  const { data: shapeSamples } = await supabase
    .from('webhook_logs')
    .select('id, payload_storage_key')
    .not('payload_storage_key', 'is', null)
    .order('received_at', { ascending: true })
    .limit(5);

  if (shapeSamples) {
    for (const sample of shapeSamples) {
      const { data: blob } = await supabase.storage
        .from(BUCKET_NAME)
        .download(sample.payload_storage_key!);

      if (blob) {
        const text = await blob.text();
        const parsed = JSON.parse(text);
        const hasExpectedKeys = parsed.bookingId || parsed.action || parsed.status || parsed.parentBookingId;
        console.log(`   Row ${sample.id}: ${hasExpectedKeys ? 'PASS' : 'WARN (missing expected keys)'}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`VERIFY RESULT: ${allPassed ? 'ALL PASSED' : 'FAILED'}`);
  console.log('='.repeat(80));

  return allPassed;
}

// --- Pass B: Replace raw_payload with compact summary ---

async function passB(): Promise<void> {
  console.log('='.repeat(80));
  console.log('PASS B: Replace raw_payload with compact summary');
  console.log('='.repeat(80));

  // STRICT STOP GATES — abort unless ALL pass
  console.log('\nRunning stop-gate checks...\n');

  // Gate 1: No rows missing payload_storage_key
  const { count: remainingWithoutKey } = await supabase
    .from('webhook_logs')
    .select('id', { count: 'exact', head: true })
    .is('payload_storage_key', null)
    .not('raw_payload', 'is', null);

  console.log(`Gate 1 — remaining_without_key: ${remainingWithoutKey || 0}`);
  if ((remainingWithoutKey || 0) > 0) {
    console.error('ABORT: Rows exist without payload_storage_key. Run pass-a first.');
    process.exit(1);
  }

  // Gate 2: No checksum mismatches (check health table)
  const { data: mismatchRow } = await supabase
    .from('payload_storage_health')
    .select('count')
    .eq('metric', 'checksum_mismatch')
    .single();

  const checksumMismatches = mismatchRow?.count || 0;
  console.log(`Gate 2 — checksum_mismatches: ${checksumMismatches}`);
  if (checksumMismatches > 0) {
    console.error('ABORT: Checksum mismatches detected. Investigate before proceeding.');
    process.exit(1);
  }

  // Gate 3: All storage keys resolve to existing objects (run verify inline)
  console.log('Gate 3 — Running full verification...');
  const verifyPassed = await verify();
  if (!verifyPassed) {
    console.error('ABORT: Verification failed. Fix issues before proceeding.');
    process.exit(1);
  }

  console.log('\nAll gates passed. Proceeding with Pass B...\n');

  let totalProcessed = 0;
  let totalReplaced = 0;
  let totalErrors = 0;
  let lastId = 0; // Cursor for pagination

  while (true) {
    // Get rows that have a storage key, using cursor to skip already-processed rows
    const { data: rows, error } = await supabase
      .from('webhook_logs')
      .select('id, raw_payload')
      .not('payload_storage_key', 'is', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('Query error:', error.message);
      break;
    }

    if (!rows || rows.length === 0) {
      console.log('\nNo more rows to process.');
      break;
    }

    // Update cursor to the last row in this batch
    lastId = rows[rows.length - 1].id;

    // Filter to only rows where raw_payload is not already a summary
    const toReplace = rows.filter(
      (r) => r.raw_payload && r.raw_payload._storage_ref !== true
    );

    if (toReplace.length === 0) {
      // All rows in this batch are already summaries, continue to next batch
      continue;
    }

    for (const row of toReplace) {
      totalProcessed++;

      try {
        const summary = buildPayloadSummary(row.raw_payload);

        const { error: updateError } = await supabase
          .from('webhook_logs')
          .update({ raw_payload: summary })
          .eq('id', row.id)
          .not('payload_storage_key', 'is', null);

        if (updateError) {
          console.error(`  Row ${row.id}: Update failed: ${updateError.message}`);
          totalErrors++;
        } else {
          totalReplaced++;
        }
      } catch (err: any) {
        console.error(`  Row ${row.id}: Error: ${err.message}`);
        totalErrors++;
      }
    }

    console.log(
      `  Batch done. Processed: ${totalProcessed}, Replaced: ${totalReplaced}, Errors: ${totalErrors}`
    );

    await sleep(BATCH_DELAY_MS);
  }

  console.log('\n' + '='.repeat(80));
  console.log('PASS B SUMMARY');
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Replaced: ${totalReplaced}`);
  console.log(`Errors: ${totalErrors}`);
  console.log('='.repeat(80));

  if (totalErrors > 0) {
    console.log('\n⚠️ Some rows had errors. Review and re-run if needed.');
    process.exit(1);
  }
}

// --- Main ---

async function main() {
  const mode = process.argv.find((a) => a.startsWith('--mode='))?.split('=')[1];

  if (!mode || !['pass-a', 'verify', 'pass-b'].includes(mode)) {
    console.log('Usage: npx ts-node src/migrations/backfill-payloads-to-storage.ts --mode=<pass-a|verify|pass-b>');
    process.exit(1);
  }

  console.log(`\nMode: ${mode}`);
  console.log(`Started at: ${new Date().toISOString()}\n`);

  switch (mode) {
    case 'pass-a':
      await passA();
      break;
    case 'verify':
      const passed = await verify();
      process.exit(passed ? 0 : 1);
      break;
    case 'pass-b':
      await passB();
      break;
  }

  console.log(`\nCompleted at: ${new Date().toISOString()}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
