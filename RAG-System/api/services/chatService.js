const OpenAI = require('openai');
const { 
  getFarmerById, 
  getFarmById, 
  getFarmCrops,
  storeFarmIssue,
  storeIssueDetail,
  getEnrichedUserContext
} = require('./farmService');
const { 
  getWeatherByCity,
  assessDiseaseRisk 
} = require('./weatherService');

const { 
  queryRAG, 
  streamRAGResponse,
  enhanceDiagnosisWithRAG 
} = require('./ragService');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Assistant ID for disease recognition
const ASSISTANT_ID = 'asst_EB0lfLqWCH5dDBLSLsMCbTCt';

// Add a conversation metadata cache for weather and farm data
const conversationMetadataCache = {};

// Add a user session cache for storing farmer data at login
const userSessionCache = {};

/**
 * Initialize user session data - call this at login or app startup
 * @param {string} userId - User ID
 * @returns {Object} - Session data with user and farm information
 */
async function initializeUserSession(userId) {
  try {
    if (!userId) return null;
    
    // Get enriched user context with farms and crops
    const enrichedContext = await getEnrichedUserContext(userId);
    
    if (enrichedContext) {
      // Store in user session cache
      userSessionCache[userId] = {
        userData: enrichedContext,
        timestamp: Date.now(),
        primaryFarmId: enrichedContext.primaryFarm?.id || null
      };
      
      console.log(`Initialized user session for ${userId} with ${enrichedContext.farms?.length || 0} farms`);
      return userSessionCache[userId];
    }
    
    return null;
  } catch (error) {
    console.error('Error initializing user session:', error);
    return null;
  }
}

/**
 * Get user session data from cache or initialize if needed
 * @param {string} userId - User ID
 * @returns {Object} - Session data with user and farm information
 */
async function getUserSessionData(userId) {
  try {
    // Return from cache if exists
    if (userSessionCache[userId]) {
      return userSessionCache[userId];
    }
    
    // Initialize if not in cache
    return await initializeUserSession(userId);
  } catch (error) {
    console.error('Error getting user session data:', error);
    return null;
  }
}

/**
 * Stream response directly from OpenAI Assistant for image analysis
 */
async function streamDirectFromAssistant({ req, res, user_id, farm_id, message, image_url, threadId, farmData, cropData, weatherData }) {
  try {
    // Create message content with image and text
    const messageContent = [
      {
        type: 'text',
        text: message || 'Please identify the disease in this coffee plant image and provide treatment recommendations.'
      },
      {
        type: 'image_url',
        image_url: { url: image_url }
      }
    ];

    // Add the message to the thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: messageContent
    });

    // Build instructions with user context
    const instructions = await buildInstructions(user_id, [], farm_id);
    
    // Add weather context if available
    let weatherContext = '';
    if (weatherData) {
      weatherContext = `Current weather: ${weatherData.temperature}°C, ${weatherData.humidity}% humidity, ${weatherData.condition}`;
    }
    
    // Run the assistant on the thread
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
      instructions: `Analyze the image and identify any plant diseases or pests. 
                    Provide a diagnosis, potential causes, and recommendations for treatment.
                    ${weatherContext ? `Consider the current weather conditions: ${weatherContext}` : ''}
                    ${instructions}`
    });
    // Stream "thinking" indication
    res.write(`data: ${JSON.stringify({ text_chunk: "Analyzing image..." })}\n\n`);

    // Poll for completion
    const pollInterval = setInterval(async () => {
      const status = await openai.beta.threads.runs.retrieve(threadId, run.id);
      
      if (status.status === 'completed') {
        clearInterval(pollInterval);
        
        // Get the assistant's response
        const messages = await openai.beta.threads.messages.list(threadId);
        const response = messages.data[0].content[0].text.value;
        
        // Send a clear loading message first
        res.write(`data: ${JSON.stringify({ clear_loading: true })}\n\n`);

        await new Promise(resolve => setTimeout(resolve, 100));
        // Stream the response in chunks
        const chunkSize = 15;
        for (let i = 0; i < response.length; i += chunkSize) {
          const chunk = response.substring(i, i + chunkSize);
          res.write(`data: ${JSON.stringify({ text_chunk: chunk })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        
        // Send completion signal with metadata
        res.write(`data: ${JSON.stringify({ 
          complete: true,
          farm_data: farmData,
          crop_data: cropData,
          weather_data: weatherData
        })}\n\n`);
        
        res.end();
      }
      else if (status.status === 'failed') {
        clearInterval(pollInterval);
        res.write(`data: ${JSON.stringify({ error: "Analysis failed" })}\n\n`);
        res.end();
      }

      
    }, 1000);
    
  } catch (error) {
    console.error('Error streaming from Assistant:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}

/**
 * Process a message from the user (text, image, or both)
 * @param {Object} params - Message parameters
 * @returns {Object} - Response object
 */
async function processMessage({ user_id, farm_id, message, conversation_id = null, queryText = null }) {
  try {
    // Check if we already have cached metadata for this conversation
    let farmData, cropData, weatherData;
    
    if (conversation_id && conversationMetadataCache[conversation_id]) {
      // Use cached data for the conversation
      const cachedData = conversationMetadataCache[conversation_id];
      farmData = cachedData.farmData;
      cropData = cachedData.cropData;
      weatherData = cachedData.weatherData;
      
      console.log(`Using cached metadata for conversation ${conversation_id}`);
    } else {
      // Try to get farm data from user session first
      const userSession = await getUserSessionData(user_id);
      
      if (farm_id && userSession && userSession.userData.farms) {
        // Try to find the farm in the user session
        const farm = userSession.userData.farms.find(f => f.id === farm_id);
        if (farm) {
          farmData = farm;
          cropData = farm.crops || [];
          console.log(`Using farm data from user session for ${farm_id}`);
        }
      }
      
      // If farm data not found in session, get it from database
      if (!farmData) {
        const farmContext = await getFarmContext(farm_id);
        farmData = farmContext.farmData;
        cropData = farmContext.cropData;
      }
      
      // Get weather data only once at the beginning of conversation
      if (farmData && (farmData.city || farmData.municipality)) {
        const location = farmData.city || farmData.municipality;
        try {
          weatherData = await getWeatherByCity(location);
          console.log(`Weather data fetched for location: ${location}`);
        } catch (weatherError) {
          console.log('Weather data not available:', weatherError.message);
        }
      }
      
      // Cache data for this conversation
      if (conversation_id) {
        conversationMetadataCache[conversation_id] = {
          farmData,
          cropData,
          weatherData,
          timestamp: Date.now()
        };
        console.log(`Cached metadata for conversation ${conversation_id}`);
      }
    }
    
    // If no conversation_id is provided, create a new one
    if (!conversation_id) {
      conversation_id = await createNewConversation(user_id, farm_id);
    }
    
    // Process the message with RAG
    const result = await processWithRAG({
      user_id,
      farm_id,
      message,
      threadId: conversation_id, // Use the provided or newly created ID
      farmData,
      cropData,
      weatherData,
      queryText // Pass the translated query if available
    });
    
    // Store the message and response in the conversation history
    await storeConversationHistory(conversation_id, message, result.response);
    
    return {
      ...result,
      conversation_id // Always return the conversation ID
    };
  } catch (error) {
    console.error('Error processing message:', error);
    return {
      response: "I'm sorry, I encountered an error processing your request.",
      error: error.message
    };
  }
}

async function streamFromRAG({ req, res, message, farmData, cropData, threadId, queryText }) {
  try {
    // Setup axios for streaming
    const response = await axios({
      method: 'post',
      url: `${process.env.RAG_API_URL || 'http://localhost:8080'}/stream`,
      data: {
        query: queryText || message, // Use translated query if available
        original_query: message, // Always keep original query for context
        farm_data: farmData,
        crop_data: cropData,
        conversation_history: global.conversationHistory?.[threadId] || []
      },
      responseType: 'stream',
    });

    // Forward the stream to the client
    response.data.on('data', (chunk) => {
      const textChunk = chunk.toString();
      res.write(`data: ${textChunk}\n\n`);
    });

    // Handle end of stream
    response.data.on('end', () => {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });

    // Handle errors
    response.data.on('error', (err) => {
      console.error('Stream error:', err);
      res.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      response.data.destroy(); // Close the axios stream
    });
    
  } catch (error) {
    console.error('Error setting up stream:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}

// Helper function to create a new conversation
// Replace your createNewConversation function
async function createNewConversation(user_id, farm_id) {
  try {
    // Create OpenAI thread directly
    const { default: OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // Create a new thread
    const thread = await openai.beta.threads.create();
    const thread_id = thread.id;
    
    // Store thread_id with user_id association
    // If you need a database record, you can generate your own internal ID
    const internal_id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Store mapping in memory or database
    if (!global.threadMapping) {
      global.threadMapping = {};
    }
    global.threadMapping[internal_id] = {
      thread_id,
      user_id, 
      farm_id,
      created_at: new Date()
    };
    
    return thread_id; // Return the OpenAI thread ID directly
  } catch (error) {
    console.error('Error creating conversation:', error);
    throw error;
  }
}

// Store conversation history
async function storeConversationHistory(conversation_id, user_message, ai_response) {

  if (!global.conversationHistory) {
    global.conversationHistory = {};
  }
  
  if (!global.conversationHistory[conversation_id]) {
    global.conversationHistory[conversation_id] = [];
  }
  
  global.conversationHistory[conversation_id].push(
    { role: 'user', content: user_message },
    { role: 'assistant', content: ai_response }
  );
}

/**
 * Process message with OpenAI Assistant (for images)
 * @param {Object} params - Parameters
 * @returns {Object} - Response with diagnosis
 */
async function processWithAssistant({
  user_id, farm_id, message, image_url, threadId, farmData, cropData, farmerData
}) {
  // Create message content with image and text
  const messageContent = [
    {
      type: 'text',
      text: message || 'Please identify the disease in this coffee plant image.'
    },
    {
      type: 'image_url',
      image_url: { url: image_url }
    }
  ];

  // Add the message to the thread
  await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: messageContent
  });

  // Build instructions with user context - simpler version
  const instructions = await buildInstructions(user_id, [], farm_id);
  
  // Run the assistant on the thread
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: ASSISTANT_ID,
    instructions: `Analyze the image and identify any plant diseases or pests. 
                  Provide a diagnosis, potential causes, and recommendations for treatment. 
                  ${instructions}`
  });

  // Wait for the assistant to complete
  await waitForRunCompletion(threadId, run.id);

  // Get the assistant's response
  const messages = await openai.beta.threads.messages.list(threadId);
  const diagnosis = messages.data[0].content[0].text.value;

  // Track context needed for follow-up questions
  let contextNeeded = {
    needsLocation: !farm_id,
    needsAffectedPercentage: true,
    needsSymptomTimeline: true
  };

  // Try to get weather data from conversation cache first
  let weatherData = null;
  if (threadId && conversationMetadataCache[threadId]?.weatherData) {
    weatherData = conversationMetadataCache[threadId].weatherData;
    console.log(`Using cached weather data for conversation ${threadId}`);
  } else if (farmData) {
    const location = farmData.city || farmData.municipality;
    contextNeeded.needsLocation = false;
    
    if (location) {
      try {
        weatherData = await getWeatherByCity(location);
        
        // Cache the weather data for this conversation
        if (threadId) {
          if (!conversationMetadataCache[threadId]) {
            conversationMetadataCache[threadId] = {};
          }
          conversationMetadataCache[threadId].weatherData = weatherData;
          conversationMetadataCache[threadId].timestamp = Date.now();
          console.log(`Cached weather data for conversation ${threadId}`);
        }
      } catch (weatherError) {
        console.error('Error fetching weather data:', weatherError);
      }
    }
  }

  // Try to enhance diagnosis with RAG
  let enhancedDiagnosis = null;
  try {
    const location = farmData?.city || farmData?.municipality;
    const enhancementResult = await enhanceDiagnosisWithRAG(diagnosis, location);
    enhancedDiagnosis = enhancementResult.enhancedDiagnosis;
    
    if (!weatherData && enhancementResult.weather_data) {
      weatherData = enhancementResult.weather_data;
    }
  } catch (error) {
    console.error('Error enhancing diagnosis:', error);
  }

  // Store issue in database if farm is available
  if (farm_id) {
    try {
      const newIssue = await storeFarmIssue({
        farm_id_fk: farm_id,
        farm_crop_id_fk: cropData?.length > 0 ? cropData[0].farm_crop_id : null,
        issue_type: getIssueType(diagnosis),
        diagnosis: extractDiagnosis(diagnosis),
        primary_cause: getPrimaryCause(diagnosis, weatherData),
        weather_snapshot: weatherData
      });
      
      if (newIssue) {
        await storeIssueDetail({
          issue_id_fk: newIssue.issue_id,
          detail_type: 'initial_diagnosis',
          symptoms: extractSymptoms(diagnosis),
          recommended_action: extractRecommendations(diagnosis),
          image_url: image_url
        });
      }
    } catch (error) {
      console.error('Error storing diagnosis:', error);
    }
  }

  // Assess disease risk if weather data is available
  const riskAssessment = weatherData ? assessDiseaseRisk(weatherData) : null;

  // Generate appropriate follow-up questions
  const followUpQuestions = generateDiagnosisFollowUpQuestions(contextNeeded);

  return {
    conversation_id: threadId,
    diagnosis: enhancedDiagnosis || diagnosis,
    farm_data: farmData,
    crop_data: cropData,
    weather_data: weatherData,
    risk_assessment: riskAssessment,
    follow_up_questions: followUpQuestions,
    from_assistant: true,
    next_action: 'specify_affected_trees'
  };
}

/**
 * Process message with RAG (for text-only queries)
 * @param {Object} params - Parameters
 * @returns {Object} - Response
 */
async function processWithRAG({
  user_id, farm_id, message, threadId, farmData, cropData, farmerData, weatherData, queryText
}) {
  // Add the message to the thread for context preservation
  await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: message
  });

  // Get thread history for context
  const threadHistory = global.conversationHistory?.[threadId] || [];
  
  // Use RAG system for response
  console.log('Using RAG system for query:', message.substring(0, 50) + '...');
  
  try {
    // Query the RAG system with translated query if available
    const ragResponse = await queryRAG(queryText || message, { 
      farmData, 
      cropData,
      userId: user_id,
      threadHistory
    });
    
    // Generate follow-up questions
    const followUpQuestions = generateFollowUpQuestions(message, farmData, cropData);
    
    return {
      conversation_id: threadId,
      response: ragResponse.answer,
      farm_data: farmData,
      crop_data: cropData,
      follow_up_questions: followUpQuestions,
      sources: ragResponse.sources,
      from_rag: true
    };
  } catch (error) {
    console.error('Error in RAG processing:', error);
    
    // Fallback to OpenAI if RAG fails - use simplified buildInstructions
    const instructions = await buildInstructions(user_id, threadHistory, farm_id);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an agricultural assistant helping coffee farmers. 
                    Answer questions based on available context. 
                    Focus on providing actionable advice for coffee farming.
                    ${instructions}`
        },
        {
          role: "user",
          content: message
        }
      ]
    });
    
    return {
      conversation_id: threadId,
      response: response.choices[0].message.content,
      farm_data: farmData,
      crop_data: cropData,
      follow_up_questions: followUpQuestions,
      from_rag: false
    };
  }
}

/**
 * Process a message and stream the response
 * @param {Object} params - Message parameters
 * @param {Object} res - Express response object for streaming
 */
async function processMessageStream({ user_id, farm_id, message, image_url, conversation_id }, res) {
  try {
    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Get farm context if available
    const { farmData, cropData, farmerData } = await getFarmContext(farm_id);
    
    // Create or retrieve thread
    const threadId = await getOrCreateThread(conversation_id);
    
    // Send thread ID immediately so the client has it
    res.write(`data: ${JSON.stringify({ conversation_id: threadId })}\n\n`);
    
    // If message contains an image, we can't stream properly from the Assistant API
    if (image_url) {
      // Process with Assistant without streaming
      const result = await processWithAssistant({
        user_id, farm_id, message, image_url, threadId, farmData, cropData, farmerData
      });
      
      // Simulate streaming by sending chunks
      const diagnosis = result.diagnosis;
      const chunkSize = 15;
      
      for (let i = 0; i < diagnosis.length; i += chunkSize) {
        const chunk = diagnosis.substring(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ text_chunk: chunk })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      
      // Send the completed message data
      res.write(`data: ${JSON.stringify({
        complete: true,
        farm_data: result.farm_data,
        crop_data: result.crop_data,
        weather_data: result.weather_data,
        risk_assessment: result.risk_assessment,
        follow_up_questions: result.follow_up_questions
      })}\n\n`);
      
      res.end();
    } else {
      // Add the message to the thread
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message
      });
      
      // Use RAG for streaming response
      console.log('Streaming RAG response for query:', message.substring(0, 50) + '...');
      await streamRAGResponse(message, { farmData, cropData }, res);
    }
  } catch (error) {
    console.error('Error in streaming message processing:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}



/**
 * Helper function to get farm context data
 * @param {string} farm_id - Farm ID
 * @returns {Object} - Farm context data
 */
async function getFarmContext(farm_id) {
  // Check user session cache first
  for (const userId in userSessionCache) {
    const userSession = userSessionCache[userId];
    if (userSession.userData && userSession.userData.farms) {
      const farm = userSession.userData.farms.find(f => f.id === farm_id);
      if (farm) {
        console.log(`Found farm ${farm_id} in user session cache`);
        return {
          farmData: farm,
          cropData: farm.crops || [],
          farmerData: userSession.userData.farmer
        };
      }
    }
  }
  
  // Fall back to database lookup if not in cache
  let farmData = null;
  let cropData = null;
  let farmerData = null;
  
  if (farm_id) {
    try {
      // Get farm details
      farmData = await getFarmById(farm_id);
      
      // Get crop details for this farm
      cropData = await getFarmCrops(farm_id);
      
      // If farm has a farmer associated, get farmer details
      if (farmData && farmData.farmer_id_fk) {
        farmerData = await getFarmerById(farmData.farmer_id_fk);
      }
    } catch (error) {
      console.error('Error fetching farm context:', error);
    }
  }
  
  return { farmData, cropData, farmerData };
}

/**
 * Helper function to get or create a thread
 * @param {string} conversation_id - Existing conversation ID
 * @returns {string} - Thread ID
 */
async function getOrCreateThread(conversation_id) {
  try {
    if (conversation_id) {
      // Use existing thread
      await openai.beta.threads.retrieve(conversation_id);
      return conversation_id;
    } else {
      // Create a new thread
      const thread = await openai.beta.threads.create();
      return thread.id;
    }
  } catch (error) {
    console.error('Error creating/retrieving thread:', error);
    const thread = await openai.beta.threads.create();
    return thread.id;
  }
}

/**
 * Build instructions from user context
 * @param {string} userId - User ID (always available)
 * @param {Array} threadHistory - Previous conversation (optional)
 * @param {string} farmId - Optional farm ID for specific farm context
 * @returns {string} - Instructions for the AI
 */
async function buildInstructions(userId, threadHistory = [], farmId = null) {
  let instructions = `You are an agricultural assistant helping coffee farmers with their crops.`;
  let contextAdded = false;
  
  // Try to get enriched user context with the specific farm ID
  if (userId) {
    try {
      console.log(`Building instructions for user ${userId}, farm ${farmId || 'not specified'}`);
      const enrichedContext = await getEnrichedUserContext(userId, farmId);
      
      if (enrichedContext && enrichedContext.farmer) {
        instructions += `\n\nFARMER CONTEXT: ${enrichedContext.contextSummary || 'No summary available'}`;
        
        // Add specific farm details if available
        if (enrichedContext.primaryFarm) {
          const farm = enrichedContext.primaryFarm;
          
          // Note if this is the specifically requested farm or just the primary farm
          if (farmId && farm.id === farmId) {
            instructions += `\n\nYou are talking about a specific farm: ${farm.name || farm.id}`;
          }
          
          // Add more specific information about crops if available
          if (farm.crops && farm.crops.length > 0) {
            instructions += `\n\nCROP DETAILS:`;
            
            farm.crops.forEach(crop => {
              instructions += `\n- ${crop.name || 'Unknown crop'}: ${crop.count || 'Unknown number'} trees, planted in ${crop.plantedYear || 'unknown year'} (${crop.age || 'unknown'} years old)`;
            });
            
            // Guide for age-appropriate advice
            instructions += `\n\nProvide age-appropriate advice for the crops. Different aged trees require different care:
- Young trees (1-3 years): Focus on establishment, root development, and protection from harsh conditions
- Productive trees (4-15 years): Focus on maximizing yield, disease prevention, and proper fertilization
- Older trees (16+ years): Consider rejuvenation techniques, pruning, or potential replacement`;
          }
          
          // Add location context if available
          if (farm.location) {
            const location = farm.location;
            const locationStr = [location.city, location.district, location.province, location.country].filter(Boolean).join(", ");
            
            if (locationStr) {
              instructions += `\n\nLOCATION: ${locationStr}`;
              instructions += `\nConsider local weather and growing conditions for this region in your advice.`;
            }
          }
        }
        
        contextAdded = true;
      }
    } catch (error) {
      console.error('Error getting enriched user context:', error);
      // Continue with fallback method if this fails
    }
  }
  
  // Add conversation history guidance if available
  if (threadHistory && threadHistory.length > 0) {
    instructions += `\n\nThis is a continuing conversation. Please maintain context from previous exchanges.`;
    
    // Add specific guidance based on conversation length
    if (threadHistory.length > 3) {
      instructions += ` The conversation has been ongoing for a while, so ensure your responses remain relevant to the farmer's continuing concerns.`;
    }
  }
  
  // Add guidance for personalized responses
  if (contextAdded) {
    instructions += `\n\nThis is a personal farm-specific question. Tailor your advice to this farmer's specific situation.`;
    instructions += `\nAsk specific follow-up questions about which trees are affected (age, location within farm, percentage affected).`;
  } else {
    instructions += `\n\nThis appears to be a general question. Provide broad but practical advice based on coffee farming best practices.`;
    instructions += `\nEncourage the farmer to provide specific details about their farm for more tailored advice in follow-up questions.`;
  }
  
  return instructions;
}

/**
 * Wait for an assistant run to complete
 * @param {string} threadId - OpenAI thread ID
 * @param {string} runId - OpenAI run ID
 * @returns {Object} - Run status
 */
async function waitForRunCompletion(threadId, runId) {
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
  
  while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
    if (runStatus.status === 'requires_action') {
      console.log('Run requires action:', runStatus.required_action);
      // TODO: Handle required actions if needed
    }
    
    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, 1000));
    runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
  }
  
  if (runStatus.status === 'failed') {
    throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
  }
  
  return runStatus;
}

/**
 * Generate follow-up questions for diagnosis
 * @param {Object} contextNeeded - Context flags
 * @returns {Array} - Follow-up questions
 */
function generateDiagnosisFollowUpQuestions(contextNeeded) {
  const questions = [];
  
  if (contextNeeded.needsLocation) {
    questions.push({
      type: 'location',
      text: "Which farm or location is this image from? This will help me provide more accurate advice."
    });
  }
  
  if (contextNeeded.needsAffectedPercentage) {
    questions.push({
      type: 'affected_percentage',
      text: "Approximately what percentage of your plants are showing these symptoms?"
    });
  }
  
  if (contextNeeded.needsSymptomTimeline) {
    questions.push({
      type: 'symptom_timeline',
      text: "When did you first notice these symptoms?"
    });
  }
  
  return questions;
}

/**
 * Generate context-gathering follow-up questions
 * @param {string} message - User message
 * @param {Object} farmData - Farm data if available
 * @param {Array} cropData - Crop data if available
 * @returns {Array} - Follow-up questions to ask
 */
function generateFollowUpQuestions(message, farmData, cropData) {
  const questions = [];
  const lowerMessage = message.toLowerCase();
  
  // Farm selection question
  if (!farmData && containsAny(lowerMessage, ['disease', 'pest', 'symptom', 'plant', 'crop', 'tree'])) {
    questions.push({
      text: "Which farm are you seeing this issue on?",
      type: "farm_selection"
    });
  }
  
  // Affected percentage question
  if (containsAny(lowerMessage, ['symptom', 'disease', 'affected', 'damage', 'sick', 'ill']) && 
      !containsAny(lowerMessage, ['percent', '%'])) {
    questions.push({
      text: "What percentage of your trees are affected?",
      type: "percentage"
    });
  }
  
  // Crop variety question
  if (farmData && (!cropData || cropData.length === 0)) {
    questions.push({
      text: "What types of coffee varieties are you growing?",
      type: "crop_info"
    });
  }
  
  // Treatment history question
  if (containsAny(lowerMessage, ['treat', 'solution', 'fix', 'control', 'manage', 'resolve', 'prevent'])) {
    questions.push({
      text: "Have you tried any treatments already?",
      type: "treatment_history"
    });
  }
  
  return questions;
}

/**
 * Check if a string contains any of the keywords
 * @param {string} text - Text to check
 * @param {Array} keywords - Keywords to look for
 * @returns {boolean} - True if text contains any keyword
 */
function containsAny(text, keywords) {
  return keywords.some(keyword => text.includes(keyword));
}

/**
 * Determine issue type from diagnosis text
 * @param {string} diagnosis - Diagnosis text
 * @returns {string} - Issue type
 */
function getIssueType(diagnosis) {
  const lowerDiagnosis = diagnosis.toLowerCase();
  
  if (containsAny(lowerDiagnosis, ['rust', 'blight', 'fungus', 'fungal', 'disease', 'rot'])) {
    return 'disease';
  } else if (containsAny(lowerDiagnosis, ['beetle', 'borer', 'pest', 'insect', 'mite', 'worm'])) {
    return 'pest';
  } else if (containsAny(lowerDiagnosis, ['deficiency', 'nutrient', 'lacking', 'starved'])) {
    return 'nutrient_deficiency';
  }
  
  return 'disease';
}

/**
 * Determine primary cause based on diagnosis and weather
 * @param {string} diagnosis - Diagnosis text
 * @param {Object} weatherData - Weather data
 * @returns {string} - Primary cause
 */
function getPrimaryCause(diagnosis, weatherData) {
  const lowerDiagnosis = diagnosis.toLowerCase();
  
  // Check for weather-related causes
  if (weatherData && weatherData.humidity > 80 && 
      containsAny(lowerDiagnosis, ['rust', 'fungal', 'mold', 'rot'])) {
    return 'weather';
  }
  
  // Check for other common causes
  if (containsAny(lowerDiagnosis, ['overwater', 'irrigation', 'wet', 'water'])) {
    return 'irrigation';
  } else if (containsAny(lowerDiagnosis, ['nutrient', 'deficiency', 'fertiliz', 'feed'])) {
    return 'fertilizer';
  } else if (containsAny(lowerDiagnosis, ['soil', 'ph', 'ground', 'dirt'])) {
    return 'soil_quality';
  } else if (containsAny(lowerDiagnosis, ['prune', 'crowded', 'dense'])) {
    return 'pruning';
  } else if (containsAny(lowerDiagnosis, ['shade', 'sun', 'light', 'exposure'])) {
    return 'shade_management';
  }
  
  return 'unknown';
}

/**
 * Extract main diagnosis from AI response
 * @param {string} text - Full AI response
 * @returns {string} - Main diagnosis
 */
function extractDiagnosis(text) {
  // Try to extract diagnosis name using regex patterns
  const patterns = [
    /diagnosis:?\s*([^\.]+)/i,
    /identified as:?\s*([^\.]+)/i,
    /appears to be:?\s*([^\.]+)/i,
    /condition is:?\s*([^\.]+)/i,
    /suffering from:?\s*([^\.]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // If no specific diagnosis found, return first sentence
  const firstSentence = text.split('.')[0];
  return firstSentence || text.substring(0, 100);
}

/**
 * Extract symptoms from AI response
 * @param {string} text - Full AI response
 * @returns {string} - Symptoms
 */
function extractSymptoms(text) {
  const patterns = [
    /symptoms:?\s*([^\.]+\.)/i,
    /signs:?\s*([^\.]+\.)/i,
    /characterized by:?\s*([^\.]+\.)/i,
    /showing:?\s*([^\.]+\.)/i,
    /exhibits:?\s*([^\.]+\.)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return '';
}

/**
 * Extract recommendations from AI response
 * @param {string} text - Full AI response
 * @returns {string} - Recommendations
 */
function extractRecommendations(text) {
  const patterns = [
    /recommend(?:ations|ed)?:?\s*([^\.]+(?:\.(?:[^\.]+)?){0,3})/i,
    /treatment:?\s*([^\.]+(?:\.(?:[^\.]+)?){0,3})/i,
    /action:?\s*([^\.]+(?:\.(?:[^\.]+)?){0,3})/i,
    /solution:?\s*([^\.]+(?:\.(?:[^\.]+)?){0,3})/i,
    /management:?\s*([^\.]+(?:\.(?:[^\.]+)?){0,3})/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return '';
}

module.exports = {
  processMessage,
  processMessageStream,
  createNewConversation,
  getOrCreateThread,
  getFarmContext,
  processWithRAG,
  processWithAssistant,
  streamFromRAG,
  storeConversationHistory,
  buildInstructions,
  generateFollowUpQuestions,
  streamDirectFromAssistant,
  // Add new exported functions
  initializeUserSession,
  getUserSessionData,
  userSessionCache,
  conversationMetadataCache
};