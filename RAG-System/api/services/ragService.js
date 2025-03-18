// services/ragService.js
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables if not already loaded
if (!process.env.OPENAI_API_KEY) {
  dotenv.config();
}

// Configure the Python RAG API endpoint
const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:8080';
console.log(`Using RAG API URL: ${RAG_API_URL}`);
const ragAxios = axios.create({
  baseURL: RAG_API_URL,
  timeout: 60000, // 60 seconds
  headers: {'Content-Type': 'application/json'}
});
/**
 * Check if the Python RAG server is healthy
 */
async function checkPythonServerHealth() {
  try {
    console.log(`Checking RAG health at: ${RAG_API_URL}/health`);
    const response = await ragAxios.get('/health', { timeout: 5000 });
    console.log('Python RAG health check response:', response.data);
    return response.data.status === 'healthy';
  } catch (error) {
    console.error('❌ Error checking Python RAG health:', error.message);
    return false;
  }
}

/**
 * Query the Python RAG service
 */
async function queryRAG(query, context = {}, useReranking = false) {
  try {
    // Check if Python server is running first
    const isPythonServerRunning = await checkPythonServerHealth();
    if (!isPythonServerRunning) {
      console.error('❌ Python RAG server is not running');
      return {
        answer: "I'm sorry, but the RAG system is currently unavailable. Please try again later or contact support.",
        sources: [],
        from_rag: false,
        error: "RAG system unavailable"
      };
    }

    console.log('🔍 Querying Python RAG system with:', query.substring(0, 50) + '...');
    console.log(`Using reranking: ${useReranking}`);
    
    // Use the /query endpoint
    console.log(`Sending query to: ${RAG_API_URL}/query`);
    
    // Add retries for reliability
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const response = await ragAxios.post('/query', {
          query,
          farm_data: context.farmData || null,
          crop_data: context.cropData || null,
          weather_data: context.weatherData || null,
          use_reranking: useReranking
        }, {
          timeout: 60000 // 60 second timeout for the query operation
        });
        
        if (!response.data) {
          throw new Error('Empty response from Python RAG system');
        }
        
        return {
          answer: response.data.answer,
          sources: response.data.sources || [],
          from_rag: true,
          rag_type: 'python'
        };
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          throw error; // Rethrow after exhausting retries
        }
        
        console.warn(`Retry ${retries}/${maxRetries} after error: ${error.message}`);
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  } catch (error) {
    console.error('❌ Error querying Python RAG system:', error.message);
    
    // Return a graceful fallback response
    return {
      answer: "I encountered an issue while searching my knowledge base. Let me provide a general response based on what I know.",
      sources: [],
      from_rag: false,
      error: error.message
    };
  }
}
/**
 * Stream response from RAG system
 * @param {string} query - User's question
 * @param {Object} context - Additional context (farm data, etc.)
 * @param {Object} res - Express response object for streaming
 */
async function streamRAGResponse(query, context = {}, res) {
  try {
    // First, get the full response from RAG API
    const ragResponse = await queryRAG(query, context);
    
    // Send sources first
    res.write(`data: ${JSON.stringify({ 
      sources: ragResponse.sources.map(source => ({
        content: source.content.substring(0, 200) + '...',  // Send preview
        metadata: source.metadata
      }))
    })}\n\n`);
    
    // Then simulate streaming the answer
    const answer = ragResponse.answer;
    const chunkSize = 10;
    
    for (let i = 0; i < answer.length; i += chunkSize) {
      const chunk = answer.substring(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ text_chunk: chunk })}\n\n`);
      
      // Add a small delay for a more natural "typing" effect
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Send completion signal
    res.write(`data: ${JSON.stringify({ complete: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error streaming RAG response:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}

/**
 * Enhance a diagnosis with RAG context
 * @param {string} diagnosis - Original diagnosis
 * @param {string} location - Farm location
 * @returns {Object} - Enhanced diagnosis and weather data
 */
async function enhanceDiagnosisWithRAG(diagnosis, location) {
  try {
    // Create a query to enhance the diagnosis with more specific information
    const query = `I have a diagnosis about coffee plants: "${diagnosis}". 
    Can you provide more detailed information about this condition, its causes, 
    treatment options, and prevention methods? 
    ${location ? `The farm is located in ${location}.` : ''}`;

    // Get relevant information from the RAG system
    const ragResponse = await queryRAG(query);
    
    // Combine the original diagnosis with the enhanced information
    const enhancedDiagnosis = `${diagnosis}\n\nAdditional Information:\n${ragResponse.answer}`;
    
    // Try to get weather data if location is available and not already provided
    let weather_data = null;
    if (location) {
      try {
        const { getWeatherByCity } = require('./weatherService');
        weather_data = await getWeatherByCity(location);
      } catch (error) {
        console.error('Error fetching weather data in RAG enhancement:', error);
      }
    }
    
    return {
      enhancedDiagnosis,
      weather_data,
      sources: ragResponse.sources
    };
  } catch (error) {
    console.error('Error enhancing diagnosis with RAG:', error);
    return { enhancedDiagnosis: diagnosis };
  }
}



module.exports = {
  queryRAG,
  streamRAGResponse,
  enhanceDiagnosisWithRAG,
  checkPythonServerHealth
};