const { openai } = require('../../services/openai');


/**
 * Classifies the intent of a user message and determines required knowledge bases and functions
 */
async function classifyIntent(message, conversationHistory) {
  // Create a system message that defines all possible intents
  const systemMessage = `
    Classify the user query into one of the following intents:
    - GENERAL_AGRICULTURE_QUESTION: General questions about agriculture
    - CROP_SPECIFIC_QUESTION: Questions specific to a crop type
    - SYSTEM_HELP: Questions about using the app
    - PEST_DISEASE_IDENTIFICATION: Identifying pests or diseases (with or without image)
    - ISSUE_TRACKING: Reporting or tracking farm issues
    - FERTILIZER_LOGGING: Recording fertilizer application
    - FERTILIZER_HISTORY: Requesting fertilizer history
    - WEATHER_QUESTION: Questions about weather or weather impact
    
    For each query, determine:
    1. Primary intent
    2. Knowledge bases needed (AGRICULTURE_KB, CROP_KB, SYSTEM_KB)
    3. Functions needed (analyzeImage, getWeather, logIssue, logFertilizer, getFarmHistory)
    
    Return a JSON object with these fields.
  `;
  
  // Extract recent conversation context (last 5 messages)
  const recentConversation = conversationHistory.slice(-5);
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemMessage },
        ...recentConversation.map(msg => ({ role: msg.role, content: msg.content })),
        { role: "user", content: message }
      ]
    });
    
    // Parse the JSON response
    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      intent: result.intent,
      requiredKnowledgeBases: result.knowledgeBases || [],
      requiredFunctions: result.functions || []
    };
  } catch (error) {
    console.error('Error in intent classification:', error);
    // Default fallback classification
    return {
      intent: 'GENERAL_AGRICULTURE_QUESTION',
      requiredKnowledgeBases: ['AGRICULTURE_KB'],
      requiredFunctions: []
    };
  }
}

module.exports = { classifyIntent };