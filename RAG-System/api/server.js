// Add this at the top of the file
console.log('======================================');
console.log('STARTING SERVER PROCESS');
console.log('🟢 server.js STARTED in:', process.cwd());
console.log('======================================');

// Add global error handlers
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  // Don't exit the process in production
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// Basic requires
const fs = require('fs');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');

// Load environment variables
dotenv.config();
console.log('Environment variables loaded. PORT:', process.env.PORT);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Basic routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'RegenX API is running',
    version: require('./package.json').version,
    time: new Date().toISOString()
  });
});

// Start the server immediately
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  
  // Continue initialization AFTER server is already listening
  setTimeout(() => {
    try {
      console.log('Continuing initialization...');
      // Initialize services and routes in a way that won't crash the server
      initializeServicesAndRoutes();
    } catch (err) {
      console.error('Error during delayed initialization:', err);
    }
  }, 1000);
});

// Function to initialize services and routes
function initializeServicesAndRoutes() {
  try {
    // Initialize external services first
    let supabaseClient = null;
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseUrl = process.env.REGENX_SUPABASE_URL;
      const supabaseKey = process.env.REGENX_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseKey) {
        supabaseClient = createClient(supabaseUrl, supabaseKey);
        global.supabaseClient = supabaseClient;
        console.log('Supabase client initialized');
      } else {
        console.warn('Missing Supabase credentials');
      }
    } catch (err) {
      console.error('Error initializing Supabase:', err);
    }
    
    // Add the health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        services: {
          supabase: supabaseClient ? 'initialized' : 'not available'
        }
      });
    });
    
    // Try to add chat routes
    try {
      const chatRouter = require('./routes/chatRoutes');
      app.use('/api/chat', chatRouter);
      console.log('Chat routes registered');
    } catch (err) {
      console.error('Error registering chat routes:', err);
      app.use('/api/chat', (req, res) => {
        res.status(503).json({ error: 'Chat functionality temporarily unavailable' });
      });
    }
    
    console.log('All routes and services initialized');
  } catch (err) {
    console.error('Error in initialization:', err);
  }
}

// Export the app for testing
module.exports = app;