require('dotenv').config();

/**
 * Environment configuration
 */

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'PORT'
];

// Check for required environment variables
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Error: ${varName} is not defined in environment variables`);
    console.error(`   Please add ${varName} to your .env file`);
  }
});

module.exports = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL,
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'default-secret-change-in-production',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
  JWT_EXPIRE: process.env.JWT_EXPIRE || '24h',
  JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '7d',
  
  // Frontend
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // Helper methods
  isDevelopment: () => (process.env.NODE_ENV || 'development') === 'development',
  isProduction: () => process.env.NODE_ENV === 'production',
  isTest: () => process.env.NODE_ENV === 'test'
};