const { openai } = require('./openai');

/**
 * Service to extract and summarize relevant context from conversation history
 * Used when the conversation state is CONTINUATION
 */
class ContextSummarizer {
  /**
   * Generate a concise summary of relevant context from conversation history
   * @param {string} currentQuery - Current user message
   * @param {Array} conversationHistory - Previous messages in the conversation
   * @returns {Promise<Object>} - Summarized context and key entities
   */
  async summarizeContext(currentQuery, conversationHistory = []) {
    // If no history or just one message, no summary needed
    if (!conversationHistory || conversationHistory.length <= 1) {
      return {
        summary: "",
        entities: [],
        relevance: 0
      };
    }

    return this.generateContextSummary(currentQuery, conversationHistory);
  }

  /**
   * Use LLM to generate a concise summary of the relevant context
   * @param {string} currentQuery - Current user message
   * @param {Array} conversationHistory - Previous messages in the conversation
   * @returns {Promise<Object>} - Summarized context, key entities, and confidence
   */
  async generateContextSummary(currentQuery, conversationHistory) {
    try {
      const systemPrompt = `
        Your task is to extract only the relevant context from the conversation history
        that would help answer the current query, and create a concise summary.
        
        For the current query, provide:
        1. A 2-3 sentence summary of relevant prior context
        2. A list of key entities/parameters mentioned in previous exchanges
        3. A relevance score (0.0-1.0) indicating how much the prior context matters for the current query
        
        Ignore parts of the conversation that are unrelated to the current query.
        Focus on agricultural domain context when relevant (crops, farming practices, etc).
        
        Return a JSON response with:
        - summary: Concise contextual summary (2-3 sentences)
        - entities: Array of key entities, parameters, or terms from previous exchanges
        - relevance: Value from 0.0 to 1.0 indicating relevance of prior context to current query
      `;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Use the configured model
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
          { role: "user", content: `Current query: ${currentQuery}` }
        ]
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      return {
        summary: result.summary || "",
        entities: result.entities || [],
        relevance: result.relevance || 0
      };
    } catch (error) {
      console.error('Error in context summarization:', error);
      
      // Return empty summary on error
      return {
        summary: "",
        entities: [],
        relevance: 0
      };
    }
  }
}

// Export a singleton instance
const contextSummarizer = new ContextSummarizer();
module.exports = { contextSummarizer, ContextSummarizer };