/**
 * Extracts a contextual query by combining the current message with relevant conversation history
 * @param {string} message - Current user message
 * @param {Array} conversationHistory - Previous conversation history
 * @returns {string} - Enhanced contextual query for better retrieval
 */
function getConversationContext(message, conversationHistory = []) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return message;
    }
    
    // Get the last few messages to provide context (limit to 5 messages)
    const recentMessages = conversationHistory.slice(-5);
    
    // Extract the text content from each message
    const contextParts = recentMessages.map(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    });
    
    // Add the current message
    contextParts.push(`Current Query: ${message}`);
    
    return contextParts.join('\n');
  }
  
  /**
   * Determines if a query requires detailed historical context
   * @param {string} query - User query
   * @returns {boolean} - Whether the query needs historical context
   */
  function queryNeedsHistoricalContext(query) {
    const historicalKeywords = [
      'previous', 'before', 'earlier', 'last time', 
      'you said', 'you mentioned', 'we discussed',
      'follow up', 'what about', 'and then'
    ];
    
    const queryLower = query.toLowerCase();
    return historicalKeywords.some(keyword => queryLower.includes(keyword));
  }
  
  module.exports = {
    getConversationContext,
    queryNeedsHistoricalContext
  };