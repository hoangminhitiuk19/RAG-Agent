const { openai } = require('./openai');

/**
 * Service to detect conversation state - whether a new message is:
 * - CONTINUATION: Continues from previous conversation
 * - NEW_TOPIC: Introduces a new topic
 * - INITIAL: First message in a conversation
 */
class ConversationStateDetector {
  /**
   * Detect the conversation state
   * @param {string} currentQuery - Current user message
   * @param {Array} conversationHistory - Previous messages in the conversation
   * @returns {Promise<Object>} - State classification with confidence score
   */
  async detectState(currentQuery, conversationHistory = []) {
    console.log(`State detection: ${conversationHistory.length} messages in history`);
    
    // Check if this is explicitly a new conversation from metadata
    const isNewConversation = conversationHistory.length > 0 && 
                             conversationHistory[0].metadata && 
                             conversationHistory[0].metadata.isNewConversation === true;
    
    // Add debugging for metadata
    if (conversationHistory.length > 0 && conversationHistory[0].metadata) {
      console.log("First message metadata:", JSON.stringify(conversationHistory[0].metadata));
    }
    
    // If no history or explicitly marked as new, it's the initial message
    if (!conversationHistory || conversationHistory.length === 0 || isNewConversation) {
      console.log("Setting state to INITIAL: " + 
                 (isNewConversation ? "new conversation flag" : "no conversation history"));
      return {
        state: 'INITIAL',
        confidence: 1.0,
        explanation: isNewConversation ? 'New conversation based on metadata' : 'First message in conversation'
      };
    }
  
    // For very short queries, likely a continuation
    if (currentQuery.length < 15 && conversationHistory.length > 0) {
      return {
        state: 'CONTINUATION',
        confidence: 0.7,
        explanation: 'Short query, likely continues previous conversation'
      };
    }
  
    // For deeper analysis, use LLM
    return this.analyzeContinuityWithLLM(currentQuery, conversationHistory);
  }

  /**
   * Use LLM to analyze the semantic relationship between current query and conversation history
   * @param {string} currentQuery - Current user message
   * @param {Array} conversationHistory - Previous messages
   * @returns {Promise<Object>} - State classification with confidence and explanation
   */
  async analyzeContinuityWithLLM(currentQuery, conversationHistory) {
    try {
      // Use only the most recent messages (3-4) for efficiency
      const recentMessages = conversationHistory.slice(-4);
      
      const systemPrompt = `
        Your task is to determine if the user's current query continues their previous conversation or introduces a new topic.
        
        Analyze the semantic relationship between the current query and the prior conversation history.
        Look for:
        1. Topic shifts or changes in subject matter
        2. References to prior exchanges (e.g., pronouns like "it", "that", "these")
        3. Contextual dependencies (current query requires previous context to understand)
        
        Return a JSON response with:
        - state: "CONTINUATION" (query directly relates to prior conversation) or "NEW_TOPIC" (introduces unrelated subject)
        - confidence: A value from 0.0 to 1.0 indicating certainty of classification
        - explanation: Brief reason for classification
      `;
      
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Use the configured model
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          ...recentMessages.map(msg => ({ role: msg.role, content: msg.content })),
          { role: "user", content: currentQuery }
        ]
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      return {
        state: result.state,
        confidence: result.confidence,
        explanation: result.explanation
      };
    } catch (error) {
      console.error('Error in conversation state detection:', error);
      
      // Default to CONTINUATION as a safer fallback
      return {
        state: 'CONTINUATION',
        confidence: 0.5,
        explanation: 'Error in analysis, defaulting to continuation'
      };
    }
  }
}

// Export a singleton instance
const conversationStateDetector = new ConversationStateDetector();
module.exports = { conversationStateDetector, ConversationStateDetector };