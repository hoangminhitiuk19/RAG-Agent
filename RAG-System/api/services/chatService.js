const { openai } = require('./openai');
const { 
  getFarmerByUserProfileId, 
  getFarmById, 
  getFarmCrops,
  storeFarmIssue,
  storeIssueDetail,
  getEnrichedUserContext
} = require('./farmService');
const { getWeatherByCity } = require('../services/weather');
const chatSessionService = require('./chatSessionService');
const { getConfig } = require('../config');
const { 
  extractDiagnosis,
  getPrimaryCause
} = require('../utils/responseParser');
const conversationService = require('./conversationService');
const { supabase } = require('../config/db');
const { OrchestratorAgent } = require('../agents/orchestrator');

const ASSISTANT_ID = getConfig().openaiAssistantId;

const conversationMetadataCache = {};
const userSessionCache = {};

/**
 * Initialize user session data
 */
async function initializeUserSession(user_profile_id) {
  try {
    if (!user_profile_id) return null;

    const enrichedContext = await getEnrichedUserContext(user_profile_id);

    if (enrichedContext) {
      userSessionCache[user_profile_id] = {
        userData: enrichedContext,
        timestamp: Date.now(),
        primaryFarmId: enrichedContext.primaryFarm?.id || null
      };

      console.log(`Initialized user session for ${user_profile_id} with ${enrichedContext.farms?.length || 0} farms`);
      return userSessionCache[user_profile_id];
    }

    return null;
  } catch (error) {
    console.error('Error initializing user session:', error);
    return null;
  }
}

async function getUserSessionData(user_profile_id) {
  try {
    if (userSessionCache[user_profile_id]) {
      return userSessionCache[user_profile_id];
    }
    return await initializeUserSession(user_profile_id);
  } catch (error) {
    console.error('Error getting user session data:', error);
    return null;
  }
}
/**
 * Process a message (text only)
 */
async function processMessage({ user_profile_id, farm_id, message, conversation_id = null }) {
  try {
    const orchestrator = new OrchestratorAgent();

    // Optionally: fetch history from DB for context
    const conversationHistory = conversation_id
      ? await conversationService.getConversationHistory(conversation_id, { formatForOpenAI: true })
      : [];
    const responseText = await orchestrator.process({
      conversation_id,
      message,
      userProfileId: user_profile_id,
      farmId: farm_id,
      conversationHistory
    });

    return {
      response: responseText,
      conversation_id
    };
  } catch (error) {
    console.error('Error processing message in chatService:', error);
    return {
      response: "I'm sorry, I encountered an error processing your request.",
      error: error.message
    };
  }
}

/**
 * Stream a message using orchestrator and SSE
 */
async function processMessageStreaming({
  user_profile_id,
  farm_id,
  message,
  conversation_id = null,
  image_url = null,
  res
}) {
  try {
    const orchestrator = new OrchestratorAgent();

    // Include the formatForOpenAI parameter to ensure metadata is included
    const conversationHistory = conversation_id
      ? await conversationService.getConversationHistory(conversation_id, { 
          formatForOpenAI: true,
          limit: 50 // Fetch more history to provide better context
        })
      : [];
      
    // Log the first message's metadata to help debug state detection
    if (conversationHistory.length > 0 && conversationHistory[0].metadata) {
      console.log('First message metadata in history:', JSON.stringify(conversationHistory[0].metadata));
    }

    const response = await orchestrator.streamProcess({
      conversation_id,
      message,
      userProfileId: user_profile_id,
      farmId: farm_id,
      conversationHistory,
      imageUrl: image_url,
      res
    });

    return {
      response,
      conversation_id
    };

  } catch (error) {
    console.error('Error in processMessageStreaming:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}


/**
 * Store message & response to conversation
 */
async function storeConversationHistory(chat_id, user_message, ai_response) {
  try {
    await chatSessionService.storeMessage(chat_id, 'user', user_message, 'chat_api');
    await chatSessionService.storeMessage(chat_id, 'assistant', ai_response, 'chat_api');
  } catch (error) {
    console.error('Error storing conversation history:', error);
  }
}

/**
 * Create a new conversation + thread
 */
async function createNewConversation(user_profile_id, farm_id) {
  try {
    const thread = await openai.beta.threads.create();
    const thread_id = thread.id;

    const chat_id = await chatSessionService.createChatSession(user_profile_id, farm_id);

    await supabase
      .from('chat_sessions')
      .update({ metadata: { openai_thread_id: thread_id } })
      .eq('chat_id', chat_id);

    console.log(`Created new conversation with ID ${chat_id}`);
    return chat_id;
  } catch (error) {
    console.error('Error creating conversation:', error);
    throw error;
  }
}



module.exports = {
  processMessage,
  processMessageStreaming,
  createNewConversation,
  storeConversationHistory,
  initializeUserSession,
  getUserSessionData,
  userSessionCache,
  conversationMetadataCache
};
