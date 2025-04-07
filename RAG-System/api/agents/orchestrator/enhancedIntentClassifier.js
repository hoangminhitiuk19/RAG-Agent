

const { openai } = require('../../services/openai');

/**
 * Enhanced intent classifier that supports a wider range of intents
 * and provides confidence scores
 */
async function classifyIntent(message, conversationHistory, contextSummary = null) {
  // Incorporate context summary if available
  let contextualMessage = message;
  if (contextSummary && contextSummary.relevance > 0.5) {
    contextualMessage = `${message} (Context: ${contextSummary.summary})`;
  }
  
  // Create a system message that defines all possible intents
  const systemMessage = `
    You are a specialized agricultural intent classifier. Analyze the user's query and categorize it into one of the following intents:
    
    - CLARIFICATION: User seeks to understand something unclear
    - DATA_REQUEST: User wants specific information or data
    - ASK_RECOMMENDATIONS: User requests suggestions or advice
    - GIVE_FEEDBACK: User provides opinions or observations
    - SENTIMENT_RESPONSE: User expresses feelings or reactions
    - OUT_OF_SCOPE: Query outside system capabilities
    - OFFENSIVE_SPAM: Inappropriate content
    - MULTI_INTENT: Query contains multiple intents
    - PRICE_REQUEST: User inquires about costs
    - WEATHER_REQUEST: User asks about climate conditions
    - UPDATE_DATA: User wants to update information
    - REQUEST_USER_GUIDE: User needs help with system usage
    - DEFAULT_FALLBACK: Unable to classify intent
    - ASK_FACTUAL_INFO: User requests factual information
    - PEST_DISEASE_IDENTIFICATION: Identifying pests or diseases (with or without image)
    - ISSUE_TRACKING: Reporting or tracking farm issues
    - FERTILIZER_LOGGING: Recording fertilizer application
    - FERTILIZER_HISTORY: Requesting fertilizer history
    
    Also determine:
    1. Required Knowledge Bases:
      - AGRICULTURE_KB: General agriculture knowledge
      - CROP_KB: Crop-specific information
      - SYSTEM_KB: System usage and capabilities
      
    2. Required Functions:
      - analyzeImage: For image analysis of plants, pests, etc.
      - getWeather: For weather data or forecasts
      - logIssue: To record farm problems
      - logFertilizer: To record fertilizer applications
      - getFarmHistory: To retrieve historical farm data
    
    Return a JSON object with these fields:
    - intent: The primary intent from the list above
    - confidence: A score from 0.0 to 1.0 indicating confidence in the classification
    - secondaryIntents: Array of other possible intents if MULTI_INTENT (empty array otherwise)
    - explanation: Brief explanation of why this intent was chosen
    - knowledgeBases: Array of required knowledge bases
    - functions: Array of required functions
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
        { role: "user", content: contextualMessage }
      ]
    });
    
    // Parse the JSON response
    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      intent: result.intent,
      confidence: result.confidence || 0.7,
      secondaryIntents: result.secondaryIntents || [],
      explanation: result.explanation || "",
      requiredKnowledgeBases: result.knowledgeBases || [],
      requiredFunctions: result.functions || []
    };
  } catch (error) {
    console.error('Error in enhanced intent classification:', error);
    // Default fallback classification
    return {
      intent: 'DEFAULT_FALLBACK',
      confidence: 0.3,
      secondaryIntents: [],
      explanation: "Error during classification",
      requiredKnowledgeBases: ['AGRICULTURE_KB'],
      requiredFunctions: []
    };
  }
}

module.exports = { classifyIntent };