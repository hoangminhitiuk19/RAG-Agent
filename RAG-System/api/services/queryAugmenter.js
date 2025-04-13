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
  async augmentQuery(query, contextSummary = null, intentClassification = null, agricultureAnalysis = null, topicSpecificData = null) {
    // Build the contextual information
    const context = this.buildContextObject(contextSummary, intentClassification, agricultureAnalysis, topicSpecificData);
    
    return this.generateAugmentedQuery(query, context);
  }

  /**
   * Build a context object from available analysis results
   * @private
   */
  buildContextObject(contextSummary, intentClassification, agricultureAnalysis, topicSpecificData) {
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
    if (topicSpecificData) {
      context.topicData = topicSpecificData;
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
      You are a specialized query expansion system for an agricultural retrieval system.

      Your task is to enhance the original query by translating non-English queries to English and adding relevant agricultural terminology.

      Guidelines:
      1. Detect the language of the original query
      2. For non-English queries, translate the core meaning to English
      3. Add 3-5 specific English agricultural terms related to the query
      4. For plant health issues (like yellowing leaves):
        - Include terms for relevant nutrient deficiencies
        - Add names of common diseases with those symptoms
        - Include relevant pest names if applicable
      5. Keep the augmented query concise (under 150 characters)
      6. Focus on technical agricultural terminology that would appear in reference documents
      7. Prioritize precision and specificity over breadth

      Return a JSON object with:
      - augmentedQuery: A concise English version with added technical terms (max 150 chars)
      - expansionTerms: An array of 3-5 specific terms that were added
      - keywords: Key search terms extracted from the query and expansion
      `;
      
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
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