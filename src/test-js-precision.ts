#!/usr/bin/env npx ts-node

console.log('🔍 Testing JavaScript Number Precision');
console.log('=' .repeat(70));

const shortIdStr = '169320102';
const longIdStr = '1757004745682372';

console.log('\n📊 String values:');
console.log(`  Short: "${shortIdStr}"`);
console.log(`  Long:  "${longIdStr}"`);

console.log('\n📊 Parsed as numbers:');
const shortNum = Number(shortIdStr);
const longNum = Number(longIdStr);
console.log(`  Short: ${shortNum}`);
console.log(`  Long:  ${longNum}`);

console.log('\n📊 Number.MAX_SAFE_INTEGER comparison:');
console.log(`  MAX_SAFE_INTEGER: ${Number.MAX_SAFE_INTEGER}`);
console.log(`  Short ID safe? ${shortNum <= Number.MAX_SAFE_INTEGER} (${shortNum} <= ${Number.MAX_SAFE_INTEGER})`);
console.log(`  Long ID safe?  ${longNum <= Number.MAX_SAFE_INTEGER} (${longNum} <= ${Number.MAX_SAFE_INTEGER})`);

console.log('\n📊 Round-trip conversion test:');
console.log(`  Short: "${shortIdStr}" -> ${shortNum} -> "${String(shortNum)}"`);
console.log(`  Match: ${shortIdStr === String(shortNum)}`);
console.log(`  Long:  "${longIdStr}" -> ${longNum} -> "${String(longNum)}"`);
console.log(`  Match: ${longIdStr === String(longNum)}`);

console.log('\n📊 Testing what Supabase returns:');
// Simulating what Supabase might return
const dbShort = 169320102;  // as number
const dbLong = 1757004745682372;  // as number

console.log(`  DB Short: ${dbShort} -> "${String(dbShort)}"`);
console.log(`  DB Long:  ${dbLong} -> "${String(dbLong)}"`);

console.log('\n📊 Map lookup test:');
const map = new Map();
map.set(String(dbShort), 'Francisco David');
map.set(String(dbLong), 'Alejandra');

console.log(`  Lookup "${shortIdStr}": ${map.get(shortIdStr) || 'NOT FOUND'}`);
console.log(`  Lookup "${longIdStr}": ${map.get(longIdStr) || 'NOT FOUND'}`);
console.log(`  Lookup String(${dbShort}): ${map.get(String(dbShort)) || 'NOT FOUND'}`);
console.log(`  Lookup String(${dbLong}): ${map.get(String(dbLong)) || 'NOT FOUND'}`);

console.log('\n✅ Test completed!');