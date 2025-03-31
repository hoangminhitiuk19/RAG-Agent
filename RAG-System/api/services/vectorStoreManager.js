const { vectorStore, VectorStore } = require('./vectorService');
const { getConfig } = require('../config');
/**
 * Vector store manager to handle different vector databases
 */
class VectorStoreManager {
  constructor() {
    try {
      const config = getConfig();
      
      if (!config.collections || !Array.isArray(config.collections)) {
        console.warn('No collections found in config, using defaults');
        this.collections = ['general_file', 'unique_file', 'semantic'];
      } else {
        this.collections = config.collections;
        console.log(`Using configured collections: ${this.collections.join(', ')}`);
      }
      
      // Default vector store is Qdrant
      this.defaultStore = vectorStore;
      this.vectorStores = {
        'qdrant': this.defaultStore
      };
      
      // Map knowledge bases to specific vector stores
      this.kbMapping = {
        'AGRICULTURE_KB': { store: 'qdrant', collection: this.collections[0] || 'general_file' },
        'CROP_KB': { store: 'qdrant', collection: this.collections[1] || 'unique_file' },
        'SYSTEM_KB': { store: 'qdrant', collection: this.collections[2] || 'semantic' }
      };
    } catch (error) {
      console.error('Error initializing VectorStoreManager:', error);
      // Fallback to defaults
      this.collections = ['general_file', 'unique_file', 'semantic'];
      this.defaultStore = vectorStore;
      this.vectorStores = { 'qdrant': this.defaultStore };
      this.kbMapping = {
        'AGRICULTURE_KB': { store: 'qdrant', collection: 'general_file' },
        'CROP_KB': { store: 'qdrant', collection: 'unique_file' },
        'SYSTEM_KB': { store: 'qdrant', collection: 'semantic' }
      };
    }
  }
    
    /**
     * Register a new vector store
     */
    registerVectorStore(name, store) {
      this.vectorStores[name] = store;
    }
    /**
   * Check Qdrant health
   * @returns {boolean} - Whether Qdrant is healthy
   */
    async healthCheck() {
      try {
        // Use the default store's client
        const collections = await this.defaultStore.client.getCollections();
        return collections && collections.collections ? true : false;
      } catch (error) {
        console.error('Qdrant health check failed:', error);
        return false;
      }
    }
    /**
     * Query a specific knowledge base
     */
    async queryKnowledgeBase(kbName, queryText, options = {}) {
      const mapping = this.kbMapping[kbName];
      
      if (!mapping) {
        throw new Error(`Unknown knowledge base: ${kbName}`);
      }
      
      const store = this.vectorStores[mapping.store] || this.defaultStore;
      
      return await store.query(mapping.collection, queryText, options);
    }
    
    /**
   * Query multiple collections
   * @param {Array} collections - Collection names to query
   * @param {string} query - Query text
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Combined query results
   */
  async queryCollections(collections, query, options = {}) {
    if (!collections || collections.length === 0) {
      collections = ['general_file', 'unique_file']; // Default collections
    }
    
    console.log(`Querying collections: ${collections.join(', ')}`);
    
    try {
      const allResults = [];
      
      // Query each collection
      for (const collection of collections) {
        try {
          const results = await this.vectorStore.query(collection, query, options.limit || 5);
          allResults.push(...results);
        } catch (error) {
          console.warn(`Error querying collection ${collection}:`, error.message);
        }
      }
      
      // Sort by relevance score
      return allResults.sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('Error in queryCollections:', error);
      return [];
    }
  }
    /**
     * Query multiple knowledge bases
     */
    async multiQuery(kbNames, queryText, options = {}) {
      // Group queries by store to minimize embedding operations
      const queriesByStore = {};
      
      // Map knowledge bases to their stores and collections
      for (const kb of kbNames) {
        const mapping = this.kbMapping[kb];
        if (!mapping) {
          console.warn(`Unknown knowledge base: ${kb}, skipping`);
          continue;
        }
        
        const storeName = mapping.store;
        if (!queriesByStore[storeName]) {
          queriesByStore[storeName] = [];
        }
        
        queriesByStore[storeName].push(mapping.collection);
      }
      
      // Execute queries for each store
      const allResults = [];
      for (const [storeName, collections] of Object.entries(queriesByStore)) {
        const store = this.vectorStores[storeName] || this.defaultStore;
        
        // If we're querying multiple collections in the same store,
        // we can use that store's multiQuery for efficiency
        if (collections.length > 1) {
          const results = await store.query(collections[0], queryText, options);
          allResults.push(...results);
        } else {
          // Get results for each collection
          for (const collection of collections) {
            const results = await store.query(collection, queryText, options);
            allResults.push(...results);
          }
        }
      }
      
      // Deduplicate results
      const seen = new Set();
      const combinedResults = [];
      
      for (const result of allResults) {
        if (!seen.has(result.content)) {
          seen.add(result.content);
          combinedResults.push(result);
        }
      }
      
      // Sort by relevance score
      return combinedResults.sort((a, b) => b.metadata.score - a.metadata.score);
    }
  }

// Export singleton instance
module.exports = new VectorStoreManager();