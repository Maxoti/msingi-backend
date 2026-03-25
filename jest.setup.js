/**
 * Jest Setup File
 * Loads environment variables before any tests run
 * This ensures database credentials are available during test execution
 */

require('dotenv').config();

// Verify critical environment variables are loaded
const requiredEnvVars = ['DATABASE_URL'];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ ERROR: Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease ensure your .env file contains all required variables.');
  process.exit(1);
}

// Log successful environment loading (only in verbose mode)
if (process.env.VERBOSE_TESTS === 'true') {
  console.log('✅ Environment variables loaded successfully');
  console.log(`   Database configured: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`);
}

// Set test timeout to 30 seconds for database operations
jest.setTimeout(30000);