// server.js
const dotenv = require('dotenv');
dotenv.config();
console.log('WEATHER_API_KEY:', process.env.WEATHER_API_KEY ? 'exists' : 'missing');
process.env.KMP_DUPLICATE_LIB_OK = 'TRUE';

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // For handling image uploads

// Initialize Supabase client
const supabaseUrl = process.env.REGENX_SUPABASE_URL;
const supabaseKey = process.env.REGENX_SERVICE_ROLE_KEY;

// Add console.log for debugging
console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key exists:', !!supabaseKey);

// Create Supabase client with error handling
let supabase;
try {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or key is missing');
  }
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized successfully');
} catch (error) {
  console.error('Error initializing Supabase client:', error);
  // Create a dummy client to prevent crashes
  supabase = {
    from: () => ({
      select: () => ({ data: null, error: new Error('Supabase client not available') })
    })
  };
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check Supabase connection
    const { data, error } = await supabase.from('system_health').select('*').limit(1);
    const supabaseStatus = error ? 'disconnected' : 'connected';
    
    // Check RAG connection
    let ragStatus = 'unknown';
    try {
      const { ragService } = require('./services/ragService');
      const ragHealth = await ragService.checkHealth();
      ragStatus = ragHealth.status;
    } catch (err) {
      ragStatus = 'disconnected';
    }
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        api: 'operational',
        database: supabaseStatus,
        rag_system: ragStatus
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Import routes
const chatRouter = require('./routes/chatRoutes');

// Initialize the user session cache on startup
async function initializeDefaultUsers() {
  try {
    const { initializeUserSession } = require('./services/chatService');
    
    // Default user IDs that should be pre-loaded
    const defaultUsers = [
      'e6a10f89-322f-4fcc-9fbd-c6587907f439', // Default test user
      // Add more default users if needed
    ];
    
    console.log('Pre-loading user data for default users...');
    
    // Initialize each user in parallel
    await Promise.all(
      defaultUsers.map(async (userId) => {
        const result = await initializeUserSession(userId);
        console.log(`User ${userId} initialization: ${result ? 'Success' : 'Failed'}`);
      })
    );
    
    console.log('User data pre-loading complete');
  } catch (error) {
    console.error('Error initializing default users:', error);
  }
}

// API Routes
app.use('/api/chat', chatRouter);
app.use('/api/documents', require('./routes/documentRoutes'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ 
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

// Start the server
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Initialize default users after server starts
  await initializeDefaultUsers();
});

module.exports = { app, supabase };