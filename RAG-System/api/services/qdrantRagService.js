// qdrantRagService.js
const axios = require('axios');
const OpenAI = require('openai');
const dotenv = require('dotenv');

// Load environment variables if not already loaded
if (!process.env.OPENAI_API_KEY) {
  dotenv.config();
}

// Configure Qdrant API endpoint
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'semantic';
const conversationMemoryCache = new Map(); // Store conversation memory for context
// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Cache for embeddings to improve performance
const embeddingCache = new Map();


// Alternative implementation using the official Qdrant client
let qdrantClient = null;

/**
 * Initialize Qdrant client if not already initialized
 * @returns {Object} - The Qdrant client
 */
async function getQdrantClient() {
  if (!qdrantClient) {
    try {
      // This requires installing the package with: npm install @qdrant/js-client-rest
      const { QdrantClient } = require('@qdrant/js-client-rest');
      
      // Create client instance
      qdrantClient = new QdrantClient({ 
        url: QDRANT_URL,
        apiKey: QDRANT_API_KEY
      });
      
      // Test connection
      await qdrantClient.getCollections();
      console.log('✅ Qdrant client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Qdrant client:', error.message);
      throw error;
    }
  }
  return qdrantClient;
}


/**
 * Store message in conversation memory cache
 * @param {string} threadId - Thread/conversation ID
 * @param {string} message - The message content
 * @param {string} role - 'user' or 'assistant'
 */
function addToConversationMemory(threadId, message, role) {
  if (!threadId) return;
  
  // Initialize array if it doesn't exist
  if (!conversationMemoryCache.has(threadId)) {
    conversationMemoryCache.set(threadId, []);
  }
  
  const memory = conversationMemoryCache.get(threadId);
  
  // Add new message
  memory.push({ role, content: message });
  
  // Keep only last 6 messages for context
  if (memory.length > 6) {
    memory.shift(); // Remove oldest message
  }
  
  console.log(`Added ${role} message to memory for ${threadId}. Memory size: ${memory.length}`);
}

function getConversationMemory(threadId) {
  if (!threadId || !conversationMemoryCache.has(threadId)) {
    return [];
  }
  
  return conversationMemoryCache.get(threadId);
}
/**
 * Search vectors using the official Qdrant client
 * @param {Array} queryVector - The query vector
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} - Array of similar vectors with payload
 */
async function searchVectorsWithClient(queryVector, limit = 5) {
    try {
      const client = await getQdrantClient();
      
      // Clean the vector to ensure all values are valid numbers
      const cleanVector = queryVector.map(val => 
        (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)) ? val : 0
      );
      
      console.log(`Searching with client. Vector length: ${cleanVector.length}`);
      
      // Search using the client
      const searchResult = await client.search(COLLECTION_NAME, {
        vector: cleanVector,
        limit: limit,
        with_payload: true,
        with_vector: false
      });
      
      return searchResult;
    } catch (error) {
      console.error('Error searching with Qdrant client:', error.message);
      throw error;
    }
  }
/**
 * Create embedding for text using OpenAI
 * @param {string} text - The text to embed
 * @returns {Promise<Array>} - The embedding vector
 */
async function createEmbedding(text) {
    try {
      // Check cache first
      if (embeddingCache.has(text)) {
        return embeddingCache.get(text);
      }
  
      console.log('Creating embedding for text:', text.substring(0, 50) + '...');
      
      const response = await openai.embeddings.create({
        model: "text-embedding-3-large",  // Explicitly set to text-embedding-3-large
        input: [text]
      });
      
      if (!response.data || !response.data[0] || !response.data[0].embedding) {
        throw new Error('Invalid embedding response format');
      }
      
      const embedding = response.data[0].embedding;
      
      // Cache the result
      embeddingCache.set(text, embedding);
      
      return embedding;
    } catch (error) {
      console.error('Error creating embedding:', error.message || error);
      throw error;
    }
  }
/**
 * Search vectors in Qdrant
 * @param {Array} queryVector - The query vector
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} - Array of similar vectors with payload
 */
async function searchVectors(queryVector, limit = 5) {
    try {
      if (!Array.isArray(queryVector)) {
        throw new Error('Query vector must be an array');
      }
      
      // Log vector info for debugging
      console.log(`Searching vectors in Qdrant collection: ${COLLECTION_NAME}`);
      console.log(`Vector length: ${queryVector.length}`);
      
      // Verify vector data - ensure all elements are numbers and not NaN
      const hasInvalidValue = queryVector.some(val => 
        typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)
      );
      
      if (hasInvalidValue) {
        console.error('Invalid vector values detected. Fixing vector...');
        // Clean the vector - replace any invalid values with 0
        queryVector = queryVector.map(val => 
          (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)) ? val : 0
        );
      }
      
      
      
      // Prepare request body according to Qdrant API docs
      const requestBody = {
        vector: queryVector,
        limit: limit,
        with_payload: true,
        with_vector: false // Don't return vectors to save bandwidth
      };
      
      // Convert to string to check JSON validity
      const requestBodyString = JSON.stringify(requestBody);
      console.log('Request body length:', requestBodyString.length);
      console.log('Sample of vector:', JSON.stringify(queryVector.slice(0, 5)));
      
      // Make the request using try-catch for better error handling
      try {
        const response = await axios({
          method: 'post',
          url: `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`,
          headers: {
            'Content-Type': 'application/json',
            'api-key': QDRANT_API_KEY
          },
          data: requestBody,
          timeout: 15000,
          maxBodyLength: 20000000, // Increase max body length
          maxContentLength: 20000000 // Increase max content length
        });
        
        if (!response.data || !response.data.result) {
          console.error('Unexpected Qdrant response:', JSON.stringify(response.data));
          throw new Error('Invalid response from Qdrant');
        }
        
        return response.data.result;
      } catch (error) {
        // Extract detailed error info
        if (error.response) {
          const errorData = error.response.data;
          console.error('Qdrant API error:', {
            status: error.response.status,
            data: errorData,
            message: errorData?.status?.error || error.message
          });
        } else if (error.request) {
          console.error('No response received from Qdrant:', error.message);
        } else {
          console.error('Error setting up request:', error.message);
        }
        throw error;
      }
    } catch (error) {
      console.error('Error in searchVectors:', error.message || error);
      throw error;
    }
}

/**
 * Check if Qdrant collection is available
 * @returns {Promise<boolean>} - Whether Qdrant API is available
 */
async function checkQdrantHealth() {
  try {
    console.log(`Checking Qdrant health at ${QDRANT_URL}/collections/${COLLECTION_NAME}`);
    const response = await axios.get(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}`,
      {
        headers: {
          'api-key': QDRANT_API_KEY
        },
        timeout: 5000
      }
    );
    
    console.log('Qdrant health check response:', response.status);
    return response.status === 200;
  } catch (error) {
    console.error('Qdrant health check failed:', error.message || error);
    // Log more details if available
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data).substring(0, 500));
    }
    return false;
  }
}


/**
 * Query the Qdrant RAG system
 * @param {string} query - User's question
 * @param {Object} context - Additional context like farm data
 * @returns {Promise<Object>} - RAG response with sources and answer
 */
async function queryQdrantRAG(query, context = {}) {
    try {
      // Check if we have a pre-translated query for RAG
      const queryForRag = context.queryText || query;
      const threadId = context.threadId || null;
          // Get conversation memory if available
    let conversationHistory = [];
    if (threadId) {
      conversationHistory = getConversationMemory(threadId);
      console.log(`Retrieved ${conversationHistory.length} messages from conversation memory for ${threadId}`);
    }
    
    // Add current query to memory
    if (threadId) {
      addToConversationMemory(threadId, query, 'user');
    }
    
    // Use conversation history for query enhancement if available
    let enhancedQuery = queryForRag;
    if (conversationHistory.length > 0) {
      try {
        enhancedQuery = await expandQueryWithContext(queryForRag, conversationHistory);
      } catch (error) {
        console.error("Error expanding query:", error);
        // Continue with original query if enhancement fails
      }
    }
      
      // Check Qdrant availability
      const qdrantAvailable = await checkQdrantHealth();
      if (!qdrantAvailable) {
        console.log('⚠️ Qdrant is not available, falling back to Python RAG');
        const { queryRAG } = require('./ragService');
        return await queryRAG(enhancedQuery, context);
      }
      
      console.log('🔍 Querying Qdrant RAG system with:', enhancedQuery.substring(0, 50) + '...');
      
      // 1. Generate embedding for query
      let queryEmbedding;
      try {
        queryEmbedding = await createEmbedding(enhancedQuery);
      } catch (embeddingError) {
        console.error('❌ Error creating embedding:', embeddingError.message);
        // Provide a fallback response directly instead of throwing
        return getDirectResponse(enhancedQuery, context);
      }
      
      // 2. Search for similar documents in Qdrant - try both methods
      let searchResults = [];
      let useClientLib = false;
      
      try {
        // First try with direct REST API
        searchResults = await searchVectors(queryEmbedding, 6);
      } catch (error) {
        console.log('⚠️ REST API search failed, trying with client library...');
        try {
          // Try with client library if available
          searchResults = await searchVectorsWithClient(queryEmbedding, 6);
          useClientLib = true;
        } catch (clientError) {
          console.error('❌ Both search methods failed:', clientError.message);
          
          // Fall back to Python RAG
          try {
            const { queryRAG } = require('./ragService');
            return await queryRAG(enhancedQuery, context);
          } catch (pythonError) {
            console.error('❌ Python RAG also failed:', pythonError.message);
            // If all methods fail, provide a fallback response directly
            return getDirectResponse(enhancedQuery, context);
          }
        }
      }
      
      // 3. Format retrieved chunks similar to the Python example
      const retrievedChunks = [];
      const distances = [];
      
      searchResults.forEach((hit, i) => {
        const payload = hit.payload;
        const score = hit.score || 0;
        
        distances.push(score);
        retrievedChunks.push(
          `🔹 Chunk ${i+1} (Score: ${score.toFixed(4)})\n` +
          `File: ${payload?.filename || 'Unknown'}\n` +
          `${payload?.text || 'No text available'}`
        );
      });
      
      if (retrievedChunks.length === 0) {
        return getDirectResponse(query, context);
      }
    
    // 4. Format context information
    let farmContext = '';
    if (context.farmData) {
      const location = context.farmData.city || context.farmData.municipality || "Unknown";
      farmContext += `Farm location: ${location}\n`;
      
      if (context.farmData.farm_size) {
        const units = context.farmData.farm_size_unit || "units";
        farmContext += `Farm size: ${context.farmData.farm_size} ${units}\n`;
      }
    }
    
    if (context.cropData && context.cropData.length > 0) {
      const cropDetails = context.cropData.map(crop => {
        const cropName = crop.crop ? `${crop.crop.name} ${crop.crop.varietal || ''}` : 'Unknown crop';
        return `${crop.crop_count} ${cropName} trees planted in ${crop.planted_year || 'unknown year'}`;
      }).join('; ');
      
      farmContext += `Crops: ${cropDetails}\n`;
    }
    
    // 5. Format weather information
    let weatherSection = '';
    if (context.weatherData) {
      weatherSection = `
Weather Conditions:
- Temperature: ${context.weatherData.temperature || 'N/A'}°C
- Humidity: ${context.weatherData.humidity || 'N/A'}%
- Condition: ${context.weatherData.condition || 'N/A'}
`;
    }
    
    let contextText = searchResults.map(hit => 
      `[Document: ${hit.payload?.filename || "Unnamed"}]\n${hit.payload?.text || "No content"}`
    ).join('\n\n');
    
    // BUILD CONVERSATION HISTORY STRING FOR THE PROMPT
    let conversationString = "";
    if (conversationHistory.length > 0) {
      conversationString = "\n\nRecent conversation history:\n";
      // Only include the last 3-4 messages for clarity
      const recentHistory = conversationHistory.slice(-4);
      recentHistory.forEach((msg, i) => {
        conversationString += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
    }
    
    // Create the prompt with conversation history
    const systemPrompt = `
You are an agricultural assistant helping coffee farmers.
You will answer a user's question with the same language and tone as the conversation history.

${conversationString}

Based on the following information and the conversation history above, please answer the user's question:
${enhancedQuery}

Information:
${contextText}
${conversationHistory.length > 0 ? 'IMPORTANT: If the question is a follow-up to the conversation, prioritize maintaining conversation coherence over strictly adhering to the retrieved documents.' : ''}

Provide a detailed, helpful response that directly addresses the user's question.
`;

    // When responding, use the original query (not the translated one)
    const userPrompt = `
**User Question:** ${query}

**Relevant Information:**
${retrievedChunks.join('\n\n')}

${farmContext ? `**Farm Information:**\n${farmContext}\n` : ''}
${weatherSection ? `**Weather Information:**\n${weatherSection}\n` : ''}

**Answer:**
`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",// Or "gpt-4o" if you have access
      temperature: 0.2,
      messages: [
        {"role": "system", "content": systemPrompt},
        {"role": "user", "content": userPrompt}
      ]
    });
    
    // 7. Format the response with sources
    const sources = searchResults.map((hit, i) => ({
      content: hit.payload.text,
      metadata: {
        filename: hit.payload.filename || 'Unknown',
        similarity: hit.score
      },
      similarity: hit.score
    }));
    
    const answer = completion.choices[0].message.content;
    if (threadId) {
      addToConversationMemory(threadId, answer, 'assistant');
    }
    return {
      answer: completion.choices[0].message.content,
      sources,
      from_rag: true,
      rag_type: 'qdrant'
    };
  } catch (error) {
    console.error('❌ Error in queryQdrantRAG:', error.message);
    return getDirectResponse(query, context);
  }
}

async function expandQueryWithContext(query, conversationHistory) {
  // If query is short or appears to be a follow-up (lacks specific keywords)
  if (query.split(' ').length < 5 || 
      query.toLowerCase().match(/^(what|how|why|when|can you|could you|is it|are they)/)) {
    
    try {
      // Use the already initialized OpenAI client from the top of the file
      // instead of creating a new one
      console.log('Expanding query with conversation context...');
      
      // Get the last few exchanges
      const recentHistory = conversationHistory.slice(-4);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Rewrite the user's follow-up question to include context from the conversation history. Make it a standalone, self-contained question that includes all necessary context."
          },
          ...recentHistory.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          {
            role: "user",
            content: query
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      });
      
      const enhancedQuery = response.choices[0].message.content;
      console.log(`Enhanced query: "${query}" → "${enhancedQuery}"`);
      return enhancedQuery;
    } catch (error) {
      console.error("Error expanding query:", error);
      return query; // Return original query if expansion fails
    }
  }
  
  console.log('Query appears complete, no expansion needed');
  return query; // Return original query if it doesn't seem like a follow-up
}
/**
 * Provide a direct response without using RAG when all methods fail
 * @param {string} query - User's question
 * @param {Object} context - Additional context
 * @returns {Object} - Direct response object
 */
function getDirectResponse(query, context = {}) {
    console.log('⚠️ Providing direct response without RAG');
    
    // For coffee leaf issues, provide a generic but helpful response
    if (query.toLowerCase().includes('leaf') || query.toLowerCase().includes('leaves')) {
      return {
        answer: "I notice you're asking about coffee leaves. Without being able to access my full knowledge base at the moment, I can tell you that common coffee leaf issues include:\n\n" +
          "1. Yellowing leaves: Often caused by nitrogen deficiency, over-watering, or iron chlorosis\n" +
          "2. Brown spots: Could indicate fungal diseases like coffee leaf rust or cercospora\n" +
          "3. Curling leaves: Might be due to water stress, mites, or nutrient imbalances\n\n" +
          "For more specific advice, please check soil moisture levels, examine the pattern of discoloration, and look for any pests on the underside of leaves.",
        sources: [],
        from_rag: false,
        error: "RAG systems unavailable"
      };
    }
    
    // Default generic response
    return {
      answer: "I apologize, but I'm currently unable to access my specialized coffee farming knowledge base. For accurate information on your question, please try again later when our systems are fully operational. In the meantime, I'd recommend consulting with a local agricultural extension service or coffee farming cooperative for immediate assistance.",
      sources: [],
      from_rag: false,
      error: "RAG systems unavailable"
    };
  }
/**
 * Stream response from Qdrant RAG system
 * @param {string} query - User's question
 * @param {Object} context - Additional context (farm data, etc.)
 * @param {Object} res - Express response object for streaming
 */
async function streamQdrantRAGResponse(query, context = {}, res) {
  try {
    // Check if we have a pre-translated query text for RAG
    const threadId = context.threadId;

    // Add user message to memory
    if (threadId) {
      addToConversationMemory(threadId, query, 'user');
      console.log(`Added user message to memory for thread ${threadId}`);
    }

    const queryForRag = context.queryText || query;
    
    // First, get the full response from Qdrant RAG
    const ragResponse = await queryQdrantRAG(query, {
      ...context,
      queryText: queryForRag  // Pass the translated query if available
    });
    
    // Send sources first
    res.write(`data: ${JSON.stringify({ 
      sources: ragResponse.sources.map(source => ({
        content: source.content.substring(0, 200) + '...',
        metadata: source.metadata
      })),
      rag_type: 'qdrant'
    })}\n\n`);
    
    // Stream the answer in small chunks for a more natural feel
    const answer = ragResponse.answer;
    const chunkSize = 10;
    
    for (let i = 0; i < answer.length; i += chunkSize) {
      const chunk = answer.substring(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ text_chunk: chunk })}\n\n`);
      
      // Add a small delay for a more natural "typing" effect
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    if (threadId) {
      addToConversationMemory(threadId, answer, 'assistant');
      console.log(`Added assistant response to memory for thread ${threadId}`);
    }
    // Send completion signal
    res.write(`data: ${JSON.stringify({ complete: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error streaming Qdrant RAG response:', error.message || error);
    res.write(`data: ${JSON.stringify({ error: error.message || 'Unknown error' })}\n\n`);
    res.end();
  }
}

/**
 * Enhance a diagnosis with Qdrant RAG context
 * @param {string} diagnosis - Original diagnosis
 * @param {string} location - Farm location
 * @returns {Object} - Enhanced diagnosis and weather data
 */
async function enhanceDiagnosisWithQdrantRAG(diagnosis, location) {
  try {
    const query = `I have a diagnosis about coffee plants: "${diagnosis}". 
    Can you provide more detailed information about this condition, its causes, 
    treatment options, and prevention methods? 
    ${location ? `The farm is located in ${location}.` : ''}`;

    const ragResponse = await queryQdrantRAG(query);
    
    const enhancedDiagnosis = `${diagnosis}\n\nAdditional Information:\n${ragResponse.answer}`;
    
    let weather_data = null;
    if (location) {
      try {
        const { getWeatherByCity } = require('./weatherService');
        weather_data = await getWeatherByCity(location);
      } catch (error) {
        console.error('Error fetching weather data in RAG enhancement:', error.message || error);
      }
    }
    
    return {
      enhancedDiagnosis,
      weather_data,
      sources: ragResponse.sources,
      rag_type: 'qdrant'
    };
  } catch (error) {
    console.error('Error enhancing diagnosis with Qdrant RAG:', error.message || error);
    return { enhancedDiagnosis: diagnosis };
  }
}

/**
 * Add documents to Qdrant
 * @param {Array} documents - Array of document objects with text and metadata
 * @returns {Object} - Result of the operation
 */
async function addDocumentsToQdrant(documents) {
  try {
    const points = [];
    
    // Process each document
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const embedding = await createEmbedding(doc.text);
      
      points.push({
        id: doc.id || `${Date.now()}-${i}`,
        vector: embedding,
        payload: {
          text: doc.text,
          filename: doc.filename || 'unknown',
          ...doc.metadata
        }
      });
    }
    
    // Add to Qdrant in batches if there are many documents
    const BATCH_SIZE = 100;
    let successCount = 0;
    
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      
      const response = await axios.put(
        `${QDRANT_URL}/collections/${COLLECTION_NAME}/points`,
        { points: batch },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': QDRANT_API_KEY
          }
        }
      );
      
      if (response.status === 200) {
        successCount += batch.length;
      }
    }
    
    return {
      status: 'success',
      message: `Added ${successCount} of ${points.length} documents to Qdrant`,
      count: successCount
    };
  } catch (error) {
    console.error('Error adding documents to Qdrant:', error.message || error);
    throw error;
  }
}

// Add this to your qdrantRagService.js for testing
async function testQdrantConnection() {
    try {
      // 1. Test the connection to Qdrant
      console.log('Testing Qdrant connection...');
      const isHealthy = await checkQdrantHealth();
      console.log(`Qdrant health check: ${isHealthy ? 'SUCCESS' : 'FAILED'}`);
      
      if (!isHealthy) {
        throw new Error('Qdrant health check failed');
      }
      
      // 2. Test embedding creation
      console.log('Testing embedding creation...');
      const embedding = await createEmbedding('Test embedding for coffee farming.');
      console.log(`Embedding created successfully with length: ${embedding.length}`);
      
      // 3. Test vector search with a simple query
      console.log('Testing vector search...');
      const searchResults = await searchVectors(embedding, 1);
      console.log(`Search returned ${searchResults.length} results`);
      
      return {
        success: true,
        embedding_length: embedding.length,
        search_results: searchResults.length
      };
    } catch (error) {
      console.error('Test failed:', error.message || error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }

  module.exports = {
    queryQdrantRAG,
    streamQdrantRAGResponse,
    checkQdrantHealth,
    enhanceDiagnosisWithQdrantRAG,
    addDocumentsToQdrant,
    // Export these for testing if needed
    createEmbedding,
    searchVectors,
    searchVectorsWithClient,
    testQdrantConnection,
    getDirectResponse
  };