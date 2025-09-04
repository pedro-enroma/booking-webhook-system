import * as crypto from 'crypto';

/**
 * Generate a secure API key for GTM webhook
 * Run with: npx ts-node src/utils/generate-api-key.ts
 */
function generateSecureApiKey(): string {
  // Generate 32 random bytes and convert to hex
  const apiKey = crypto.randomBytes(32).toString('hex');
  
  // Add a prefix to identify it's a GTM key
  const gtmApiKey = `gtm_live_${apiKey}`;
  
  return gtmApiKey;
}

// Generate multiple options
console.log('\n' + '='.repeat(70));
console.log('🔐 GTM API Key Generator');
console.log('='.repeat(70));
console.log('\nGenerated secure API keys for GTM (choose one):\n');

for (let i = 1; i <= 3; i++) {
  const key = generateSecureApiKey();
  console.log(`Option ${i}:`);
  console.log(`${key}`);
  console.log('');
}

console.log('='.repeat(70));
console.log('\n📝 Instructions:');
console.log('1. Choose one of the keys above');
console.log('2. Add it to your Railway environment variables:');
console.log('   GTM_WEBHOOK_API_KEY=your_chosen_key_here');
console.log('3. Use it in your GTM Custom HTML tag:');
console.log("   'Authorization': 'Bearer your_chosen_key_here'");
console.log('\n⚠️  Security Tips:');
console.log('- Never commit this key to your repository');
console.log('- Rotate the key periodically (every 3-6 months)');
console.log('- Use Railway environment variables, not .env file in production');
console.log('='.repeat(70) + '\n');