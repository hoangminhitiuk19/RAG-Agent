const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

/**
 * Get configuration values with defaults
 */
function getConfig() {
  let collections = ["general_file", "unique_file"]; // Default
  
  try {
    if (process.env.COLLECTIONS_CONFIG) {
      const configObj = JSON.parse(process.env.COLLECTIONS_CONFIG);
      if (configObj.collections && Array.isArray(configObj.collections)) {
        collections = configObj.collections;
      }
    } else if (process.env.COLLECTION_NAME) {
      // Fallback to single collection if specified
      collections = [process.env.COLLECTION_NAME];
    }
  } catch (err) {
    console.warn('Error parsing COLLECTIONS_CONFIG, using defaults:', err.message);
  }
  return {
    // OpenAI Configuration
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiAssistantId: process.env.OPENAI_ASSISTANT_ID,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
    
    // Weather Configuration
    weatherApiKey: process.env.WEATHER_API_KEY,
    weatherBaseUrl: process.env.WEATHER_BASE_URL || 'https://api.openweathermap.org/data/2.5',
    
    // Vector Database Configuration
    qdrantUrl: process.env.QDRANT_URL,
    qdrantApiKey: process.env.QDRANT_API_KEY,
    
    // Database Configuration
    supabaseUrl: process.env.REGENX_SUPABASE_URL,
    supabaseKey: process.env.REGENX_SERVICE_ROLE_KEY,
    
    // General Configuration
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    
    // Collection names for vector stores
    collections: collections,
  };
}

module.exports = { getConfig };