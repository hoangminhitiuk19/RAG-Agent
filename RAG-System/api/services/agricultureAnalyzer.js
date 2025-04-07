const { openai } = require('./openai');

/**
 * Service for analyzing agricultural topics and identifying crops
 * in user queries and conversations
 */
class AgricultureAnalyzer {
  /**
   * Identify agricultural topics and crops in a message
   * @param {string} message - User message
   * @param {Array} conversationHistory - Previous messages in the conversation
   * @param {Object} contextSummary - Context summary if available
   * @returns {Promise<Object>} - Analysis results with topics and crops
   */
  async analyzeTopicAndCrops(message, conversationHistory = [], contextSummary = null) {
    // If context summary is available and relevant, incorporate it
    let contextualMessage = message;
    if (contextSummary && contextSummary.relevance > 0.5) {
      contextualMessage = `${message} (Context: ${contextSummary.summary})`;
    }
    
    return this.performAnalysis(contextualMessage, conversationHistory);
  }

  /**
   * Perform the agricultural analysis using LLM
   * @param {string} contextualMessage - Message with context if available
   * @param {Array} conversationHistory - Previous messages in the conversation
   * @returns {Promise<Object>} - Analysis results
   */
  async performAnalysis(contextualMessage, conversationHistory) {
    try {
      // Extract recent conversation context (last 3 messages for efficiency)
      const recentConversation = conversationHistory.slice(-3);

      const systemPrompt = `
        You are a specialized agricultural domain analyzer focusing on coffee farming. Your task is to:
        
        1. Identify the primary agricultural topic from these categories:
          - nutrition_recommendation: Fertilizer guidance, dosage, timing, and nutrient deficiencies
          - pest_and_disease: Diagnosis, symptoms, prevention, and treatment of pests and diseases
          - climate_adaptation: What to do under extreme or changing weather conditions
          - crop_management: General practices: replanting, watering, pruning, mulching, weeding, shade management
          - regenerative_practices: Composting, cover cropping, reduced tillage, biofertilizer use
          - input_formulation: How to make or apply compost, fish fertilizer, and liquid manures
          - yield_forecast: Estimating expected yield based on current conditions
          - cost_estimation: Calculating fertilizer quantity and cost per season or per hectare
          - compliance_check: National regulations on banned pesticides, safe input usage, legal
          - coffee_varieties: Differences between Robusta, Arabica, local cultivars, and their suitability
          - pesticide_recommendation: When farmers ask about mixing pesticides, quantity mixable, etc
        
        2. Identify any specific crops mentioned, focusing on coffee varieties but including any crops mentioned.
          - For coffee: Detect if Arabica, Robusta, or other specific varieties are mentioned
          - For other crops: Identify any mentioned in the context of intercropping or farming practices
        
        3. For each identified crop, provide confidence scores (0.0-1.0) of how certain you are.
        
        4. Identify taxonomic information for detected crops when possible.
        
        5. Identify any specific agricultural conditions mentioned (soil types, climate, etc.)
        
        Return a JSON object with:
        - primaryTopic: The main agricultural topic from the categories above
        - topicConfidence: A score from 0.0 to 1.0 indicating confidence
        - topicExplanation: Brief explanation of why this topic was chosen
        - detectedCrops: Array of objects, each with:
          - name: Crop name (e.g., "Arabica coffee")
          - confidence: Detection confidence score (0.0-1.0)
          - taxonomy: Taxonomic info if available (e.g., "Coffea arabica")
          - details: Any relevant details about this crop from the query
        - conditions: Array of mentioned agricultural conditions
      `;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          ...recentConversation.map(msg => ({ role: msg.role, content: msg.content })),
          { role: "user", content: contextualMessage }
        ]
      });
      
      // Parse the JSON response
      const result = JSON.parse(response.choices[0].message.content);
      
      return {
        primaryTopic: result.primaryTopic,
        topicConfidence: result.topicConfidence || 0.7,
        topicExplanation: result.topicExplanation || "",
        detectedCrops: result.detectedCrops || [],
        conditions: result.conditions || []
      };
    } catch (error) {
      console.error('Error in agriculture analysis:', error);
      
      // Return default values on error
      return {
        primaryTopic: "crop_management",
        topicConfidence: 0.3,
        topicExplanation: "Default topic due to analysis error",
        detectedCrops: [],
        conditions: []
      };
    }
  }
}

// Export a singleton instance
const agricultureAnalyzer = new AgricultureAnalyzer();
module.exports = { agricultureAnalyzer, AgricultureAnalyzer };