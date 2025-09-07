#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';
import * as fs from 'fs';

interface CustomerData {
  booking_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
}

async function checkMissingRecords() {
  console.log('🔍 Checking for Missing Records from CSV Files');
  console.log('=' .repeat(70));
  
  // Parse both CSV files
  const csv1 = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id.csv';
  const csv2 = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id 2.csv';
  
  // Parse CSV 1
  const csv1Records: CustomerData[] = [];
  const csv1Content = fs.readFileSync(csv1, 'utf-8');
  const csv1Lines = csv1Content.split('\n');
  for (let i = 1; i < csv1Lines.length && csv1Records.length < 500; i++) {
    const line = csv1Lines[i].trim();
    if (!line) continue;
    const fields = line.split(';').map(f => f.trim());
    if (fields.length >= 4 && fields[3].includes('@')) {
      csv1Records.push({
        booking_id: fields[0],
        first_name: fields[1] || '',
        last_name: fields[2] || '',
        email: fields[3],
        phone_number: fields[4] || undefined
      });
    }
  }
  
  // Parse CSV 2
  const csv2Records: CustomerData[] = [];
  const csv2Content = fs.readFileSync(csv2, 'utf-8');
  const csv2Lines = csv2Content.split('\n');
  for (let i = 1; i < csv2Lines.length && csv2Records.length < 500; i++) {
    const line = csv2Lines[i].trim();
    if (!line) continue;
    const fields = line.split(';').map(f => f.trim());
    if (fields.length >= 4 && fields[3].includes('@')) {
      csv2Records.push({
        booking_id: fields[0],
        first_name: fields[1] || '',
        last_name: fields[2] || '',
        email: fields[3],
        phone_number: fields[4] || undefined
      });
    }
  }
  
  console.log(`📊 Checking first 500 records from each CSV:`);
  console.log(`   CSV 1: ${csv1Records.length} records`);
  console.log(`   CSV 2: ${csv2Records.length} records`);
  console.log(`   Total to check: ${csv1Records.length + csv2Records.length} records\n`);
  
  // Check CSV 1 records
  console.log('📁 CSV 1 - Checking first 500 records...');
  let csv1Missing = [];
  let csv1Found = 0;
  
  for (const record of csv1Records) {
    // Check if booking exists in booking_customers
    const { data } = await supabase
      .from('booking_customers')
      .select('booking_id')
      .eq('booking_id', record.booking_id)
      .single();
    
    if (!data) {
      csv1Missing.push(record);
    } else {
      csv1Found++;
    }
  }
  
  console.log(`   ✓ Found: ${csv1Found}/${csv1Records.length}`);
  console.log(`   ✗ Missing: ${csv1Missing.length}/${csv1Records.length} (${((csv1Missing.length/csv1Records.length)*100).toFixed(1)}%)`);
  
  if (csv1Missing.length > 0 && csv1Missing.length <= 10) {
    console.log('   Missing booking IDs:');
    csv1Missing.forEach(m => {
      console.log(`     - ${m.booking_id}: ${m.first_name} ${m.last_name} (${m.email})`);
    });
  } else if (csv1Missing.length > 10) {
    console.log('   First 10 missing:');
    csv1Missing.slice(0, 10).forEach(m => {
      console.log(`     - ${m.booking_id}: ${m.first_name} ${m.last_name} (${m.email})`);
    });
  }
  
  // Check CSV 2 records
  console.log('\n📁 CSV 2 - Checking first 500 records...');
  let csv2Missing = [];
  let csv2Found = 0;
  
  for (const record of csv2Records) {
    // Check if booking exists in booking_customers
    const { data } = await supabase
      .from('booking_customers')
      .select('booking_id')
      .eq('booking_id', record.booking_id)
      .single();
    
    if (!data) {
      csv2Missing.push(record);
    } else {
      csv2Found++;
    }
  }
  
  console.log(`   ✓ Found: ${csv2Found}/${csv2Records.length}`);
  console.log(`   ✗ Missing: ${csv2Missing.length}/${csv2Records.length} (${((csv2Missing.length/csv2Records.length)*100).toFixed(1)}%)`);
  
  if (csv2Missing.length > 0 && csv2Missing.length <= 10) {
    console.log('   Missing booking IDs:');
    csv2Missing.forEach(m => {
      console.log(`     - ${m.booking_id}: ${m.first_name} ${m.last_name} (${m.email})`);
    });
  } else if (csv2Missing.length > 10) {
    console.log('   First 10 missing:');
    csv2Missing.slice(0, 10).forEach(m => {
      console.log(`     - ${m.booking_id}: ${m.first_name} ${m.last_name} (${m.email})`);
    });
  }
  
  // Check for duplicates in CSVs
  console.log('\n📊 Checking for duplicates in CSV data...');
  const allBookingIds = [...csv1Records, ...csv2Records].map(r => r.booking_id);
  const uniqueBookingIds = new Set(allBookingIds);
  console.log(`   Total records: ${allBookingIds.length}`);
  console.log(`   Unique booking IDs: ${uniqueBookingIds.size}`);
  console.log(`   Duplicates: ${allBookingIds.length - uniqueBookingIds.size}`);
  
  // Overall summary
  console.log('\n' + '=' .repeat(70));
  console.log('📊 OVERALL SUMMARY');
  console.log('=' .repeat(70));
  const totalMissing = csv1Missing.length + csv2Missing.length;
  const totalChecked = csv1Records.length + csv2Records.length;
  const totalFound = csv1Found + csv2Found;
  
  console.log(`   Total checked: ${totalChecked}`);
  console.log(`   Total found: ${totalFound} (${((totalFound/totalChecked)*100).toFixed(1)}%)`);
  console.log(`   Total missing: ${totalMissing} (${((totalMissing/totalChecked)*100).toFixed(1)}%)`);
  
  if (totalMissing > 0) {
    console.log('\n⚠️  There are missing records that need to be imported!');
    console.log('   Run the import scripts to add these missing records.');
  } else {
    console.log('\n✅ All checked records are present in the database!');
  }
  
  // Check database totals
  const { count: totalRelationships } = await supabase
    .from('booking_customers')
    .select('*', { count: 'exact', head: true });
  
  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true });
  
  console.log('\n📊 DATABASE TOTALS:');
  console.log(`   Total customers: ${totalCustomers}`);
  console.log(`   Total relationships: ${totalRelationships}`);
}

checkMissingRecords()
  .then(() => {
    console.log('\n✅ Check completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });