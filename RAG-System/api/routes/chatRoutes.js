const express = require('express');
const router = express.Router();
const { processMessage, processMessageStream, streamDirectFromAssistant } = require('../services/chatService');
const { getFarmerByUserId,
  getFarmerById,
  getFarmsByFarmerId,
  getFarmById,
  getFarmCrops,
  storeFarmIssue,
  storeIssueDetail,
  getFarmIssueHistory } = require('../services/farmService');
const { queryQdrantRAG, streamQdrantRAGResponse, checkQdrantHealth } = require('../services/qdrantRagService');
const { getWeatherByCity } = require('../services/weatherService');
const chatService = require('../services/chatService');

 
router.get('/debug-enriched-context/:user_id', async (req, res) => {
  try {
    const userId = req.params.user_id;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Get the enriched context
    const { getEnrichedUserContext } = require('../services/farmService');
    const enrichedContext = await getEnrichedUserContext(userId);
    
    if (!enrichedContext) {
      return res.status(404).json({ error: 'No enriched context found for this user' });
    }
    
    // Return the full context
    return res.json({
      enrichedContext,
      debug: {
        farmCount: enrichedContext.farms?.length || 0,
        hasPrimaryFarm: !!enrichedContext.primaryFarm,
        hasPrimaryCrops: enrichedContext.primaryCrops?.length > 0,
        cropCount: enrichedContext.primaryCrops?.length || 0,
        summarized: enrichedContext.contextSummary || 'No summary available'
      }
    });
  } catch (error) {
    console.error('Error fetching enriched context:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Add to chatRoutes.js
router.get('/debug-conversation/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }
    
    try {
      // Test if we can retrieve the thread from OpenAI
      const { default: OpenAI } = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const thread = await openai.beta.threads.retrieve(conversationId);
      
      // Get messages
      const messages = await openai.beta.threads.messages.list(conversationId);
      
      return res.json({
        thread_exists: true,
        thread_id: thread.id,
        message_count: messages?.data?.length || 0,
        first_few_messages: messages?.data?.slice(0, 3).map(m => ({
          role: m.role,
          content_preview: m.content[0]?.text?.value?.substring(0, 50) || 'No content',
          created_at: new Date(m.created_at * 1000).toISOString()
        }))
      });
    } catch (threadError) {
      return res.status(404).json({ 
        error: 'Thread not found or inaccessible',
        message: threadError.message,
        thread_exists: false
      });
    }
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return res.status(500).json({ 
      error: 'Debug endpoint error',
      message: error.message
    });
  }
});

/**
 * @route GET /api/chat/conversations/:id
 * @desc Get conversation history for a specific conversation ID
 */
router.get('/conversations/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }
    
    // Get thread messages from OpenAI
    const messages = await chatService.getConversationHistory(conversationId);
    
    return res.json({
      conversation_id: conversationId,
      messages: messages
    });
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    return res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
});

router.get('/system-status', async (req, res) => {
  try {
    // Check Qdrant status
    const qdrantStatus = await checkQdrantHealth();
    
    // Check Python RAG status
    const { checkPythonServerHealth } = require('../services/ragService');
    const pythonStatus = await checkPythonServerHealth();
    
    res.json({
      qdrant_available: qdrantStatus,
      python_rag_available: pythonStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error checking system status',
      message: error.message
    });
  }
});
/**
 * @route POST /api/chat/message/stream
 * @desc Process a text message with streaming response
 */
router.post('/message/stream', (req, res) => {
  handleStreamingRequest({
    req, 
    res, 
    user_id: req.body.user_id, 
    farm_id: req.body.farm_id, 
    message: req.body.message, 
    image_url: req.body.image_url, 
    conversation_id: req.body.conversation_id,
    rag_type: 'python'
  });
});

/**
 * @route POST /api/chat/message
 * @desc Universal message endpoint for processing all types of queries
 */
router.post('/message', async (req, res) => {
  const { 
    user_id,
    farm_id,
    message,
    image_url,
    conversation_id,
    stream = false,
    rag_type = 'qdrant' // Options: 'qdrant', 'python', 'auto'
  } = req.body;
  
  // Validate required fields
  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  // At least message or image_url must be provided
  if (!message && !image_url) {
    return res.status(400).json({ error: 'Either message or image_url must be provided' });
  }
  
  try {
    // Handle the request based on parameters
    if (stream) {
      return handleStreamingRequest({req, res, user_id, farm_id, message, image_url, conversation_id, rag_type});
    } else {
      const result = await handleSynchronousRequest({user_id, farm_id, message, image_url, conversation_id, rag_type});
      return res.json(result);
    }
  } catch (error) {
    console.error('Error processing message:', error);
    
    if (stream) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      return res.end();
    } else {
      return res.status(500).json({ error: 'Error processing message', details: error.message });
    }
  }
});

/**
 * @route POST /api/chat/initialize-user
 * @desc Initialize user session data at login/startup
 */
router.post('/initialize-user', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const sessionData = await chatService.initializeUserSession(user_id);
    
    if (!sessionData) {
      return res.status(404).json({ error: 'Could not initialize user data' });
    }
    
    return res.json({
      success: true,
      message: 'User data initialized successfully',
      user_id: user_id,
      primary_farm_id: sessionData.primaryFarmId,
      farm_count: sessionData.userData.farms?.length || 0
    });
  } catch (error) {
    console.error('Error initializing user data:', error);
    return res.status(500).json({ error: 'Failed to initialize user data' });
  }
});

/**
 * Handle streaming request based on request parameters
 */
async function handleStreamingRequest({req, res, user_id, farm_id, message, image_url, conversation_id, rag_type}) {
  // Configure response for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Check if conversation has cached data
  let farmData, cropData, weatherData;
  
  if (conversation_id && chatService.conversationMetadataCache[conversation_id]) {
    // Use cached data
    const cachedData = chatService.conversationMetadataCache[conversation_id];
    farmData = cachedData.farmData;
    cropData = cachedData.cropData;
    weatherData = cachedData.weatherData;
    console.log(`Using cached metadata for streaming conversation ${conversation_id}`);
  } else {
    // Try to get farm data from user session first
    const userSession = await chatService.getUserSessionData(user_id);
    
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
  }
  
  // Get or create thread ID for conversation continuity
  const threadId = await getOrCreateThread(conversation_id);
  
  // Cache the metadata if not already cached
  if (threadId && !chatService.conversationMetadataCache[threadId]) {
    chatService.conversationMetadataCache[threadId] = {
      farmData,
      cropData,
      weatherData,
      timestamp: Date.now()
    };
    console.log(`Cached metadata for conversation ${threadId}`);
  }
  
  // Send thread ID immediately
  res.write(`data: ${JSON.stringify({ 
    type: 'info', 
    conversation_id: threadId 
  })}\n\n`);

  // Check if a translated query is available for RAG
  const queryText = req.body.query_text || message;

  // Route to appropriate processing function based on content type and RAG preferences
  if (image_url) {
    // Handle image streaming
    await streamDirectFromAssistant({
      req, res, user_id, farm_id, message, image_url, 
      threadId, farmData, cropData, weatherData
    });
  } else {
    // Handle text streaming with appropriate RAG system
    if (rag_type === 'qdrant') {
      await streamQdrantRAGResponse(message, { 
        farmData, cropData, weatherData, threadId,
        threadId,
        queryText: queryText  // Pass translated query for RAG
      }, res);
    } else if (rag_type === 'python') {
      await streamFromRAG({ 
        req, res, message, farmData, cropData, threadId,
        queryText: queryText  // Pass translated query for RAG
      });
    } else {
      // Auto mode - try Qdrant first, fall back to Python RAG if it fails
      try {
        const qdrantAvailable = await checkQdrantHealth();
        if (qdrantAvailable) {
          await streamQdrantRAGResponse(message, { 
            farmData, cropData, weatherData, threadId,
            conversationHistory: await getThreadHistory(threadId),
            queryText: queryText  // Pass translated query for RAG
          }, res);
        } else {
          throw new Error('Qdrant not available');
        }
      } catch (error) {
        console.log('Falling back to Python RAG for streaming:', error.message);
        await streamFromRAG({ 
          req, res, message, farmData, cropData, threadId,
          queryText: queryText  // Pass translated query for RAG
        });
      }
    }
  }
}

/**
 * Handle synchronous request based on request parameters
 */
async function handleSynchronousRequest({user_id, farm_id, message, image_url, conversation_id, rag_type}) {
  // Check if conversation has cached data
  let farmData, cropData, weatherData;
  
  if (conversation_id && chatService.conversationMetadataCache[conversation_id]) {
    // Use cached data
    const cachedData = chatService.conversationMetadataCache[conversation_id];
    farmData = cachedData.farmData;
    cropData = cachedData.cropData;
    weatherData = cachedData.weatherData;
    console.log(`Using cached metadata for conversation ${conversation_id}`);
  } else {
    // Try to get farm data from user session first
    const userSession = await chatService.getUserSessionData(user_id);
    
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
    
    // Cache the metadata if we have a conversation_id
    if (conversation_id) {
      chatService.conversationMetadataCache[conversation_id] = {
        farmData,
        cropData,
        weatherData,
        timestamp: Date.now()
      };
      console.log(`Cached metadata for conversation ${conversation_id}`);
    }
  }
    
  // Process based on content type
  if (image_url) {
    // Process image using Assistant API
    return await chatService.processMessage({
      user_id,
      farm_id,
      message: message || 'Please analyze this plant image',
      image_url,
      conversation_id
    });
  } else {
    // Get translated query if available
    const queryText = arguments[0].query_text || message;
    
    // Process text message with appropriate RAG system
    if (rag_type === 'qdrant') {
      const threadId = await getOrCreateThread(conversation_id);
      
      // Get weather data if location is available
      let weatherData = null;
      if (farmData && (farmData.city || farmData.municipality)) {
        const location = farmData.city || farmData.municipality;
        try {
          weatherData = await getWeatherByCity(location);
        } catch (weatherError) {
          console.log('Weather data not available:', weatherError.message);
        }
      }
      
      // Store user message in thread
      await storeMessageInThread(threadId, message, 'user');
      
      // Get previous conversation for context
      const previousMessages = await getThreadHistory(threadId);
      // Get response from Qdrant with conversation history
      const ragResponse = await queryQdrantRAG(message, {
        farmData,
        cropData,
        weatherData,
        threadId,
        queryText: queryText  
      });
      
      // Store response in thread
      await storeMessageInThread(threadId, ragResponse.answer, 'assistant');
      
      // Generate follow-up questions
      const followUpQuestions = await generateFollowQuestionsWithFallback({
        query: message,
        answer: ragResponse.answer,
        farmData,
        cropData
      });
      
      // Return response with all context
      return {
        response: ragResponse.answer,
        conversation_id: threadId,
        farm_data: farmData,
        crop_data: cropData,
        weather_data: weatherData,
        follow_up_questions: followUpQuestions,
        sources: ragResponse.sources,
        from_rag: true,
        rag_type: 'qdrant'
      };
    } else if (rag_type === 'python') {
      return await chatService.processMessage({
        user_id,
        farm_id,
        message,
        conversation_id,
        queryText: queryText  // Pass translated query for RAG
      });
    } else {
      // Auto mode - try Qdrant first, fall back to Python RAG
      try {
        const qdrantAvailable = await checkQdrantHealth();
        if (qdrantAvailable) {
          // Use recursive call with explicit rag_type
          return await handleSynchronousRequest({
            user_id, farm_id, message, image_url, conversation_id, rag_type: 'qdrant',
            query_text: queryText  // Pass translated query for RAG
          });
        } else {
          throw new Error('Qdrant not available');
        }
      } catch (error) {
        console.log('Falling back to Python RAG:', error.message);
        return await chatService.processMessage({
          user_id,
          farm_id,
          message,
          conversation_id,
          queryText: queryText  // Pass translated query for RAG
        });
      }
    }
  }
}

/**
 * Get conversation history from thread
 */
async function getThreadHistory(threadId) {
  if (!threadId) return [];
  
  try {
    const { default: OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const threadMessages = await openai.beta.threads.messages.list(threadId);
    if (threadMessages && threadMessages.data) {
      // Get the last 5 messages
      return threadMessages.data
        .slice(0, 5)
        .map(msg => ({
          role: msg.role,
          content: msg.content[0].text.value
        }))
        .reverse();
    }
  } catch (historyError) {
    console.log('Could not retrieve conversation history:', historyError.message);
  }
  
  return [];
}

/**
 * Store message in OpenAI thread
 */
async function storeMessageInThread(threadId, content, role) {
  if (!threadId || !content) return;
  
  try {
    const { default: OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    await openai.beta.threads.messages.create(threadId, {
      role: role,
      content: content
    });
  } catch (storeError) {
    console.log('Could not store message in thread:', storeError.message);
  }
}

/**
 * Generate follow-up questions with fallback to defaults
 */
async function generateFollowQuestionsWithFallback({ query, answer, farmData, cropData }) {
  try {
    return await generateFollowUpQuestions({ query, answer, farmData, cropData });
  } catch (error) {
    console.error('Error generating follow-up questions:', error);
    return getDefaultFollowUpQuestions(cropData);
  }
}


/**
 * Stream image processing results
 */
async function streamImageProcessing({req, res, user_id, farm_id, message, image_url, threadId, farmData, cropData, weatherData}) {
  try {
    // Process with Assistant
    const result = await chatService.processWithAssistant({
      user_id, farm_id, message, image_url, threadId, farmData, cropData
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
  } catch (error) {
    console.error('Error processing image:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}
/**
 * @route POST /api/chat/image
 * @desc Process an image for plant disease diagnosis
 */
router.post('/image', async (req, res) => {
  const result = await handleSynchronousRequest({
    user_id: req.body.user_id, 
    farm_id: req.body.farm_id, 
    message: req.body.message || 'Please analyze this plant image', 
    image_url: req.body.image_url, 
    conversation_id: req.body.conversation_id,
    rag_type: 'auto'
  });
  res.json(result);
});


/**
 * @route GET /api/chat/issue-history/:farm_id
 * @desc Get issue history for a specific farm
 */
router.get('/issue-history/:farm_id', async (req, res, next) => {
  try {
    const { farm_id } = req.params;
    const issueHistory = await getFarmIssueHistory(farm_id);
    res.status(200).json(issueHistory);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/chat/qdrant/message
 * @desc Process a message using Qdrant RAG with conversation support
 */
router.post('/qdrant/message', async (req, res) => {
  const result = await handleSynchronousRequest({
    user_id: req.body.user_id, 
    farm_id: req.body.farm_id, 
    message: req.body.message, 
    conversation_id: req.body.conversation_id,
    rag_type: 'qdrant'
  });
  res.json(result);
});

router.post('/stream', async (req, res) => {
  const { user_id, farm_id, message, conversation_id } = req.body;
  
  // Validate required fields
  if (!user_id || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    // Get farm context
    const { farmData, cropData } = await getFarmContext(farm_id);
    
    // Process conversation ID
    const threadId = conversation_id || await createNewConversation(user_id, farm_id);
    
    // Send initial message
    res.write(`data: ${JSON.stringify({
      type: 'info',
      message: 'Starting stream...',
      conversation_id: threadId
    })}\n\n`);
    
    // Stream from RAG
    await streamFromRAG({
      req,
      res,
      message,
      farmData,
      cropData,
      threadId
    });
    
  } catch (error) {
    console.error('Error in streaming endpoint:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

/**
 * @route POST /api/chat/qdrant/message/stream
 * @desc Process a message using Qdrant RAG with streaming and conversation support
 */
router.post('/qdrant/message/stream', (req, res) => {
  handleStreamingRequest({
    req, 
    res, 
    user_id: req.body.user_id, 
    farm_id: req.body.farm_id, 
    message: req.body.message, 
    conversation_id: req.body.conversation_id,
    rag_type: 'qdrant'
  });
});


/**
 * Generate follow-up questions based on conversation context
 * @param {Object} params - Parameters for generating follow-ups
 */
async function generateFollowUpQuestions({ query, answer, farmData, cropData }) {
  try {
    const { default: OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // Build context for follow-up generation
    let context = `Previous question: ${query}\nResponse: ${answer}\n`;
    
    if (farmData) {
      context += `Farm location: ${farmData.city || farmData.municipality || farmData.province || 'Unknown'}\n`;
    }
    
    if (cropData && cropData.length > 0) {
      context += `Crops: ${cropData.map(crop => crop.crop_name).join(', ')}\n`;
    }
    
    // Generate follow-up questions
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an agricultural assistant helping farmers. Generate 3 relevant follow-up questions based on the conversation context. Each question should be concise and directly related to the previous question or the given answer. Format the output as a JSON array of strings."
        },
        {
          role: "user",
          content: context
        }
      ],
      temperature: 0.7,
      max_tokens: 200,
      response_format: { type: "json_object" }
    });
    
    // Parse and return the follow-up questions
    try {
      const result = JSON.parse(completion.choices[0].message.content);
      return result.questions || [];
    } catch (parseError) {
      console.error('Error parsing follow-up questions:', parseError);
      return getDefaultFollowUpQuestions(cropData);
    }
  } catch (error) {
    console.error('Error generating follow-up questions:', error);
    return getDefaultFollowUpQuestions(cropData);
  }
}

/**
 * Get default follow-up questions based on crop data
 * @param {Array} cropData - Crop information
 */
function getDefaultFollowUpQuestions(cropData) {
  const cropNames = cropData && cropData.length > 0 
    ? cropData.map(crop => crop.crop_name).join(' and ') 
    : 'your crops';
  
  return [
    `What are common diseases affecting ${cropNames}?`,
    `How can I improve the yield of ${cropNames}?`,
    `What fertilizers are best for ${cropNames}?`
  ];
}

router.post('/query', async (req, res) => {
  try {
    const { message, useReranking = true, farmId } = req.body;
    
    // Get farm data if farmId is provided
    let farmData = null;
    let cropData = null;
    if (farmId) {
      // Get farm data from your database
    }
    
    // Query the RAG system
    const ragService = require('../services/ragService');
    const result = await ragService.queryRAG(message, { farmData, cropData }, useReranking);
    
    res.json(result);
  } catch (error) {
    console.error('Error in /query route:', error);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

// Helper function to get farm context (extracted from chatService.js to avoid duplication)
async function getFarmContext(farm_id) {
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

// Add to chatRoutes.js
router.get('/debug-conversation/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }
    
    try {
      // Test if we can retrieve the thread from OpenAI
      const thread = await openai.beta.threads.retrieve(conversationId);
      
      // Get messages
      const messages = await openai.beta.threads.messages.list(conversationId);
      
      return res.json({
        thread_exists: true,
        thread_id: thread.id,
        message_count: messages?.data?.length || 0,
        first_few_messages: messages?.data?.slice(0, 3).map(m => ({
          role: m.role,
          content_preview: m.content[0]?.text?.value?.substring(0, 50) || 'No content',
          created_at: new Date(m.created_at * 1000).toISOString()
        }))
      });
    } catch (threadError) {
      return res.status(404).json({ 
        error: 'Thread not found or inaccessible',
        message: threadError.message,
        thread_exists: false
      });
    }
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return res.status(500).json({ 
      error: 'Debug endpoint error',
      message: error.message
    });
  }
});

// Helper function to get or create a thread (extracted from chatService.js)
async function getOrCreateThread(conversation_id) {
  const { default: OpenAI } = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
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

module.exports = router;