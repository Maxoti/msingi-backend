/**
 * M-Pesa Configuration
 * Loads M-Pesa settings from environment variables
 */

const getMpesaConfig = () => {
  const environment = process.env.MPESA_ENVIRONMENT || 'sandbox';
  
  // Base URLs for different environments
  const baseURLs = {
    sandbox: 'https://sandbox.safaricom.co.ke',
    production: 'https://api.safaricom.co.ke'
  };

  return {
    environment,
    baseURL: baseURLs[environment],
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortCode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    callbackURL: process.env.MPESA_CALLBACK_URL || `${process.env.API_BASE_URL}/api/v1/webhooks/mpesa/callback`,
    
    // Validation
    isConfigured: !!(
      process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_SHORTCODE &&
      process.env.MPESA_PASSKEY
    )
  };
};

module.exports = getMpesaConfig;