const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables if not already loaded
if (!process.env.REGENX_SUPABASE_URL) {
  dotenv.config();
}

// Initialize Supabase client
let supabase;

try {
  const supabaseUrl = process.env.REGENX_SUPABASE_URL;
  const supabaseKey = process.env.REGENX_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in db.js');
    throw new Error('Supabase URL or key is missing');
  }
  
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized in db.js');
} catch (error) {
  console.error('Error initializing Supabase client in db.js:', error);
  // Create a mock implementation that won't crash
  supabase = {
    from: () => ({
      select: () => ({ data: null, error: new Error('Supabase client not available') })
    })
  };
}
module.exports = { supabase };