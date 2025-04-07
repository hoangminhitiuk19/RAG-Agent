const { openai } = require('./openai');

/**
 * Service for augmenting user queries with domain-specific terminology
 * to improve retrieval relevance
 */
class QueryAugmenter {
  /**
   * Enhance the original query with relevant terminology
   * @param {string} query - Original user query
   * @param {Object} contextSummary - Context summary if available
   * @param {Object} intentClassification - Intent classification results
   * @param {Object} agricultureAnalysis - Agricultural topic and crop analysis
   * @returns {Promise<Object>} - Augmented query information
   */
  async augmentQuery(query, contextSummary = null, intentClassification = null, agricultureAnalysis = null) {
    // Build the contextual information
    const context = this.buildContextObject(contextSummary, intentClassification, agricultureAnalysis);
    
    return this.generateAugmentedQuery(query, context);
  }

  /**
   * Build a context object from available analysis results
   * @private
   */
  buildContextObject(contextSummary, intentClassification, agricultureAnalysis) {
    const context = {};
    
    if (contextSummary && contextSummary.relevance > 0.3) {
      context.conversationContext = {
        summary: contextSummary.summary,
        entities: contextSummary.entities
      };
    }
    
    if (intentClassification) {
      context.intent = {
        primary: intentClassification.intent,
        secondary: intentClassification.secondaryIntents || []
      };
    }
    
    if (agricultureAnalysis) {
      context.agriculture = {
        topic: agricultureAnalysis.primaryTopic,
        crops: agricultureAnalysis.detectedCrops.map(crop => crop.name),
        taxonomy: agricultureAnalysis.detectedCrops.map(crop => crop.taxonomy).filter(Boolean),
        conditions: agricultureAnalysis.conditions
      };
    }
    
    return context;
  }

  /**
   * Generate augmented query using LLM
   * @param {string} originalQuery - Original user query
   * @param {Object} context - Contextual information
   * @returns {Promise<Object>} - Augmented query results
   */
  async generateAugmentedQuery(originalQuery, context) {
    try {
      const systemPrompt = `
        You are a specialized query expansion system for an agricultural retrieval system focused on coffee farming.
        
        Your task is to enhance the original query with relevant coffee farming terminology to improve retrieval results.
        
        Guidelines:
        1. Expand the query with specific agricultural terms, focusing on the detected crops, diseases, or farming practices
        2. Include scientific names (taxonomies) when available
        3. Add synonyms and related terms that would help with retrieval
        4. Consider farming context like soil conditions, climate, etc.
        5. Keep the augmented query concise but comprehensive
        6. Preserve the original meaning and intent of the query
        7. For pest/disease queries, include symptoms, causes, and treatments
        8. For farming practices, include terminology for various approaches
        
        Return a JSON object with:
        - augmentedQuery: An enhanced version of the original query
        - expansionTerms: An array of specific terms that were added
        - rationale: Brief explanation of the expansion strategy
        - keywords: Key search terms extracted from the query and expansion
      `;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: JSON.stringify({
              originalQuery,
              context
            })
          }
        ]
      });
      
      // Parse the JSON response
      const result = JSON.parse(response.choices[0].message.content);
      
      return {
        originalQuery,
        augmentedQuery: result.augmentedQuery,
        expansionTerms: result.expansionTerms || [],
        rationale: result.rationale || "",
        keywords: result.keywords || []
      };
    } catch (error) {
      console.error('Error in query augmentation:', error);
      
      // Return original query as fallback
      return {
        originalQuery,
        augmentedQuery: originalQuery,
        expansionTerms: [],
        rationale: "Error in query augmentation, using original query",
        keywords: [originalQuery]
      };
    }
  }
}

// Export a singleton instance
const queryAugmenter = new QueryAugmenter();
module.exports = { queryAugmenter, QueryAugmenter };