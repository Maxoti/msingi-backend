require('dotenv').config();
const app = require('./app');
const config = require('./config/env');
const { pool } = require('./config/database');
const scheduler = require('./modules/jobs/scheduler'); // ← ADD THIS LINE
const noCache = require('./shared/middleware/noCache');
const PORT = config.PORT;
app.use('/api/v1', noCache); 
// Track database connection status
let isDbConnected = false;

// Test database connection
const testDatabaseConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log(' Database connection successful');
    console.log('   Server time:', result.rows[0].now);
    isDbConnected = true;
    return true;
  } catch (error) {
    console.error(' Database connection failed:', error.message);
    isDbConnected = false;
    return false;
  }
};

// Retry database connection
const retryDatabaseConnection = async (maxRetries = 5, delay = 5000) => {
  for (let i = 1; i <= maxRetries; i++) {
    console.log(`\n Attempting database connection (${i}/${maxRetries})...`);
    
    const connected = await testDatabaseConnection();
    
    if (connected) {
      console.log('Database connection established!\n');
      return true;
    }
    
    if (i < maxRetries) {
      console.log(` Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.error(' Could not establish database connection after', maxRetries, 'attempts');
  console.error('   Possible causes:');
  console.error('   - Incorrect DATABASE_URL in .env file');
  console.error('   - Network/firewall blocking connection');
  console.error('   - VPN or corporate network restrictions');
  console.error('   - Supabase service temporarily unavailable');
  console.error('\n  Server will start, but API requests requiring database will fail\n');
  
  return false;
};

// Start server
const startServer = async () => {
  // Try to connect to database (with retries)
  await retryDatabaseConnection(3, 3000); // 3 attempts, 3 seconds apart

  // Start Express server regardless of DB status
  const server = app.listen(PORT, () => {
    console.log('');
    console.log(' ========================================');
    console.log(`   Msingi Backend Server is running!`);
    console.log(`   Environment: ${config.NODE_ENV}`);
    console.log(`   Port: ${PORT}`);
    console.log(`   API URL: http://localhost:${PORT}`);
    console.log(`   Health Check: http://localhost:${PORT}/health`);
    console.log(`   Database: ${isDbConnected ? ' CONNECTED' : '❌ NOT CONNECTED'}`);
    console.log('   ========================================');
    console.log('');
    
    if (!isDbConnected) {
      console.warn('  WARNING: Server is running without database connection');
      console.warn('   Check /health endpoint for detailed status');
    }
  });

  // ============================================================
  // START BACKGROUND JOB SCHEDULER (NEW CODE)
  // ============================================================
  if (isDbConnected) {
    try {
      console.log(' Starting background job scheduler...');
      scheduler.start();
      console.log(' Background jobs started\n');
    } catch (error) {
      console.error(' Failed to start scheduler:', error.message);
      console.warn('   Background jobs will not run, but server continues\n');
    }
  } else {
    console.warn('  Skipping scheduler start (database not connected)\n');
  }
  // ============================================================

  // Periodic health check (retry connection every 30 seconds if disconnected)
  setInterval(async () => {
    if (!isDbConnected) {
      console.log(' Database disconnected. Attempting to reconnect...');
      const reconnected = await testDatabaseConnection();
      
      // Start scheduler if we just reconnected
      if (reconnected && scheduler.getStatus && !scheduler.getStatus().running) {
        try {
          console.log(' Starting scheduler after database reconnection...');
          scheduler.start();
          console.log(' Scheduler started');
        } catch (error) {
          console.error(' Failed to start scheduler:', error.message);
        }
      }
    }
  }, 30000);

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    // Stop scheduler first
    try {
      console.log('⏸  Stopping background jobs...');
      scheduler.stop();
      console.log(' Background jobs stopped');
    } catch (error) {
      console.error('  Error stopping scheduler:', error.message);
    }
    
    server.close(async () => {
      console.log(' HTTP server closed');
      
      try {
        await pool.end();
        console.log(' Database pool closed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('  Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(' Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error(' Unhandled Rejection:', error);
  process.exit(1);
});

// Start the server
startServer();