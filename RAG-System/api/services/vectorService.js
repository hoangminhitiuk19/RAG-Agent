const { QdrantClient } = require('@qdrant/js-client-rest');
const { getConfig } = require('../config');
const { openai } = require('./openai');

class VectorStore {
  constructor() {
    const config = getConfig();
    
    this.client = new QdrantClient({
      url: config.qdrantUrl,
      apiKey: config.qdrantApiKey
    });
    
    this.collections = config.collections;
  }

  /**
   * Query a specific collection with the given text
   * @param {string} collectionName - The direct collection name to query
   * @param {string} queryText - The text to query with
   * @param {Object} options - Query options
   * @returns {Array} - Array of matching documents with their content and metadata
   */
  async query(collectionName, queryText, options = {}) {
    try {
      const { limit = 5, scoreThreshold = 0.7 } = options;
      
      // Get embeddings for the query text
      const embedding = await this._getEmbedding(queryText);
      
      console.log(`Querying collection: ${collectionName} with: "${queryText.substring(0, 50)}..."`);
      
      // Query the collection
      const searchResult = await this.client.search(collectionName, {
        vector: embedding,
        limit: limit,
        score_threshold: scoreThreshold
      });
      
      // Format the results
      return searchResult.map(hit => ({
        content: hit.payload.text,
        metadata: {
          source: hit.payload.source || 'unknown',
          score: hit.score,
          id: hit.id
        }
      }));
    } catch (error) {
      console.error(`Error querying vector store: ${error.message}`);
      return [];
    }
  }

  /**
   * Query multiple collections at once
   * @param {Array<string>} collectionNames - Array of collection names to query
   * @param {string} queryText - The text to query with
   * @param {Object} options - Query options
   * @returns {Array} - Combined array of matching documents
   */
  async multiQuery(collectionNames, queryText, options = {}) {
    try {
      const queryPromises = collectionNames.map(collection => 
        this.query(collection, queryText, options)
      );
      
      // Wait for all queries to complete
      const results = await Promise.all(queryPromises);
      
      // Combine and sort results by score
      const combinedResults = results
        .flat()
        .sort((a, b) => b.metadata.score - a.metadata.score);
      
      return combinedResults;
    } catch (error) {
      console.error(`Error in multi-query: ${error.message}`);
      return [];
    }
  }


  /**
   * Get embedding for text using OpenAI
   * @private
   */
  async _getEmbedding(text) {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error(`Error getting embedding: ${error.message}`);
      throw error;
    }
  }
}

// Export singleton instance and class for flexibility
const vectorStore = new VectorStore();
module.exports = { 
  VectorStore,
  vectorStore
};