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
    this.embeddingModel = config.embeddingModel || "text-embedding-3-large";
    
    // Cache for collection existence checks
    this._collectionCache = {};
  }

  /**
   * Check if a collection exists in Qdrant
   * @param {string} collectionName - The collection name to check
   * @returns {Promise<boolean>} - Whether the collection exists
   */
  async collectionExists(collectionName) {
    if (this._collectionCache[collectionName] !== undefined) {
      return this._collectionCache[collectionName];
    }
    
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === collectionName);
      this._collectionCache[collectionName] = exists;
      return exists;
    } catch (error) {
      console.error(`Error checking if collection ${collectionName} exists:`, error);
      return false;
    }
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

      // First check if the collection exists
      const exists = await this.collectionExists(collectionName);
      if (!exists) {
        console.warn(`Collection ${collectionName} does not exist in Qdrant. Skipping query.`);
        return [];
      }

      const { limit = 6, scoreThreshold = 0.0 } = options;
      
      // Get embeddings for the query text
      const embedding = await this._getEmbedding(queryText);
      
      console.log(`Querying collection: ${collectionName} with: "${queryText.substring(0, 50)}..."`);
      
      // Query the collection
      const searchResult = await this.client.search(collectionName, {
        vector: embedding,
        limit: limit,
        score_threshold: scoreThreshold
      });
      
      console.log(`Found ${searchResult.length} results in ${collectionName}`);
      // Format the results
      return searchResult.map(hit => ({
        content: hit.payload.text,
        metadata: {
          source: hit.payload.source || 'unknown',
          score: hit.score,
          id: hit.id,
          collection: collectionName
        }
      }));
    } catch (error) {
      console.error(`Error querying collection ${collectionName}:`, error);
      console.error(`Query text: "${queryText.substring(0, 100)}..."`);
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
      // Filter out collections that don't exist
      const existingCollections = [];
      for (const collection of collectionNames) {
        if (await this.collectionExists(collection)) {
          existingCollections.push(collection);
        } else {
          console.warn(`Collection ${collection} does not exist. Skipping.`);
        }
      }
      
      if (existingCollections.length === 0) {
        console.warn('No valid collections to query');
        return [];
      }
      
      const queryPromises = existingCollections.map(collection => 
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
      // Handle empty or invalid text
      if (!text || typeof text !== 'string' || text.trim() === '') {
        console.warn('Invalid or empty text for embedding generation');
        throw new Error('Invalid text for embedding');
      }
      
      const response = await openai.embeddings.create({
        model: this.embeddingModel,
        input: text
      });
      
      if (!response.data || !response.data[0] || !response.data[0].embedding) {
        throw new Error('Invalid embedding response from OpenAI');
      }
      
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