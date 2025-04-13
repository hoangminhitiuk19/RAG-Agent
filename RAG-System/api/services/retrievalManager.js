

const { openai } = require('./openai');
const vectorStoreManager = require('./vectorStoreManager');

/**
 * Advanced document retrieval system with dynamic weighting
 * This service enhances RAG by weighting documents based on:
 * - Semantic relevance to the query
 * - Alignment with detected intent
 * - Relevance to agricultural topics and crops
 * - Document metadata (source, date, etc)
 */
class RetrievalManager {

    constructor() {
        // Default knowledge base to collection mappings
        this.knowledgeBaseMap = {
          'AGRICULTURE_KB': 'general_file',
          'CROP_KB': 'unique_file',
          'MARKET_KB': 'general_file',
          'WEATHER_KB': 'general_file',
          'REGIONAL_KB': 'general_file',
          'SYSTEM_KB': 'system',        // For potential future system collection
          'CUSTOMER_KB': 'unique_file'  // For customer-specific data
        };
    }
    /**
     * Register a new knowledge base to collection mapping
     * @param {string} knowledgeBase - Knowledge base identifier
     * @param {string} collection - Collection name
     */
    registerKnowledgeBaseMapping(knowledgeBase, collection) {
        this.knowledgeBaseMap[knowledgeBase] = collection;
        console.log(`Registered mapping: ${knowledgeBase} -> ${collection}`);
    }
    
    /**
     * Bulk register knowledge base mappings
     * @param {Object} mappings - Object with KB keys and collection values
     */
    registerMappings(mappings) {
        if (!mappings || typeof mappings !== 'object') return;
        
        Object.entries(mappings).forEach(([kb, collection]) => {
        this.registerKnowledgeBaseMapping(kb, collection);
        });
    }

    /**
     * Retrieve and weight documents
     * @param {string} query - Original user query
     * @param {Object} queryAugmentation - Augmented query information
     * @param {string[]} collections - Vector store collections to query
     * @param {Object} context - Context information for weighting
     * @returns {Promise<Object>} - Weighted and ranked retrieval results
     */
    async retrieveAndWeight(query, queryAugmentation, collections, context = {}) {
        try {
            // Use the augmented query for retrieval if available
            const retrievalQuery = queryAugmentation?.augmentedQuery || query;
            
            // Ensure we have valid collections
            let collectionsToQuery = collections;
            if (!collectionsToQuery || collectionsToQuery.length === 0) {
                // If no collections specified, check if intent has required KBs
                if (context.intent && context.intent.requiredKnowledgeBases) {
                    collectionsToQuery = this.mapKnowledgeBasesToCollections(context.intent.requiredKnowledgeBases);
                } else {
                    // Default to general_file if nothing else specified
                    collectionsToQuery = ['general_file'];
                }
            }
            
            console.log(`Querying collections: ${collectionsToQuery.join(', ')}`);
            
            // OPTIMIZATION: Use smaller top_k for initial retrieval
            const topK = 6; // Reduced from 15 to 6 per collection
            
            // Step 1: Retrieve initial documents
            const rawResults = await this.retrieveDocuments(retrievalQuery, collectionsToQuery, { limit: topK });
            
            if (!rawResults.length) {
                console.warn(`No results found for query: "${retrievalQuery.substring(0, 100)}..."`);
                return { 
                    weightedResults: [],
                    retrievalStats: {
                        totalRetrieved: 0,
                        retrievalQuery,
                        originalQuery: query,
                        collections
                    }
                };
            }
            
            // Step 2: Apply dynamic weighting
            const weightedResults = await this.applyDynamicWeighting(
                rawResults,
                query,
                queryAugmentation,
                context
            );
            
            // Step 3: Apply final ranking and filtering (finalizeResults is already updated to return 6 docs)
            const finalResults = this.finalizeResults(weightedResults);
            
            // Prepare stats for debugging and transparency
            const retrievalStats = {
                totalRetrieved: rawResults.length,
                totalAfterWeighting: finalResults.length,
                retrievalQuery,
                originalQuery: query,
                collections,
                topScore: finalResults.length > 0 ? finalResults[0].finalScore : 0,
                bottomScore: finalResults.length > 0 ? finalResults[finalResults.length - 1].finalScore : 0
            };
            
            return {
                weightedResults: finalResults,
                retrievalStats
            };
        } catch (error) {
            console.error("Error in retrieveAndWeight:", error);
            return { 
                weightedResults: [],
                retrievalStats: {
                    error: error.message,
                    originalQuery: query,
                    collections
                }
            };
        }
    }
    /**
     * Retrieve documents from vector store
     * @private
     */
    async retrieveDocuments(query, collections, options = {}) {
        try {
            const { limit = 6, scoreThreshold = 0.1 } = options;
            
            // Ensure we have collections to query
            if (!collections || collections.length === 0) {
                collections = ['general_file']; // Default to general_file if none specified
                console.log(`No collections specified, using default: ${collections.join(', ')}`);
            }
            
            console.log(`Attempting to query collections: ${collections.join(', ')} with query: "${query}"`);
            
            // Try to get documents with a more direct approach
            let results = [];
            
            // Process each collection individually
            for (const collection of collections) {
                try {
                    console.log(`Querying collection: ${collection}`);
                    
                    // Check if the queryCollection (singular) method exists
                    if (typeof vectorStoreManager.queryCollection === 'function') {
                        const collectionResults = await vectorStoreManager.queryCollection(collection, query, {
                            limit: limit,
                            scoreThreshold: scoreThreshold
                        });
                        
                        console.log(`Retrieved ${collectionResults.length} documents from collection ${collection}`);
                        results = results.concat(collectionResults);
                    } 
                    // Check if query method exists (some implementations use this naming)
                    else if (typeof vectorStoreManager.query === 'function') {
                        const collectionResults = await vectorStoreManager.query(query, {
                            collection: collection,
                            limit: limit,
                            scoreThreshold: scoreThreshold
                        });
                        
                        console.log(`Retrieved ${collectionResults.length} documents using query method from collection ${collection}`);
                        results = results.concat(collectionResults);
                    }
                    // Try queryCollections method (plural)
                    else if (typeof vectorStoreManager.queryCollections === 'function') {
                        const collectionResults = await vectorStoreManager.queryCollections([collection], query, {
                            limit: limit,
                            scoreThreshold: scoreThreshold
                        });
                        
                        console.log(`Retrieved ${collectionResults.length} documents using queryCollections method from collection ${collection}`);
                        results = results.concat(collectionResults);
                    }
                    else {
                        console.error(`No suitable query method found in vectorStoreManager for collection ${collection}`);
                    }
                } catch (collectionError) {
                    console.error(`Error querying collection ${collection}:`, collectionError);
                    // Continue with next collection
                }
            }
            
            console.log(`Total documents retrieved across all collections: ${results.length}`);
            return results;
        } catch (error) {
            console.error("Error retrieving documents:", error);
            return [];
        }
    }
    
    /**
     * Apply dynamic weighting to retrieved documents
     * @private
     */
    async applyDynamicWeighting(documents, originalQuery, queryAugmentation, context) {
        // If no documents, return empty array
        if (!documents || documents.length === 0) return [];
        
        // If only one document, just return it with max score
        if (documents.length === 1) {
        return [{
            ...documents[0],
            finalScore: 1.0,
            weights: { vector: documents[0].metadata.score || 0.5, intent: 1.0, topic: 1.0 }
        }];
        }
        
        try {
        // Apply rule-based weighting first
        const ruleWeightedDocs = this.applyRuleBasedWeighting(documents, context);
        
        // For small sets, just return the rule-based weighted results
        if (ruleWeightedDocs.length <= 3) {
            return ruleWeightedDocs;
        }
        
        // For larger sets, apply LLM-based weighting
        return await this.applyLLMWeighting(
            ruleWeightedDocs,
            originalQuery,
            queryAugmentation,
            context
        );
        } catch (error) {
        console.error("Error in applyDynamicWeighting:", error);
        
        // Fallback to basic score-based ranking
        return documents.map(doc => ({
            ...doc,
            finalScore: doc.metadata.score || 0.5,
            weights: { vector: doc.metadata.score || 0.5 }
        }));
        }
    }
    
    /**
     * Apply rule-based weighting based on metadata and context
     * @private
     */
    applyRuleBasedWeighting(documents, context) {
        const { intent, agricultureAnalysis } = context;
        
        return documents.map(doc => {
        const metadata = doc.metadata || {};
        let weights = {
            vector: metadata.score || 0.5,  // Base vector similarity score
            recency: 0.5,                   // Default recency weight
            intent: 0.5,                    // Intent alignment weight
            topic: 0.5,                     // Topic alignment weight
            source: 0.5                     // Source quality weight
        };
        
        // Adjust weights based on metadata
        if (metadata.date) {
            // Newer documents get higher recency scores
            const docDate = new Date(metadata.date);
            const now = new Date();
            const ageInDays = (now - docDate) / (1000 * 60 * 60 * 24);
            weights.recency = Math.max(0.1, Math.min(1.0, 1 - (ageInDays / 365)));
        }
        
        // Adjust weight based on source quality/type
        if (metadata.source) {
            const sourceWeights = {
            'research_paper': 0.9,
            'official_guidance': 0.85,
            'expert_article': 0.8,
            'farmer_experience': 0.75,
            'blog': 0.6,
            'forum': 0.5,
            'qa': 0.65,
            'news': 0.7
            };
            weights.source = sourceWeights[metadata.source.toLowerCase()] || 0.5;
        }
        
        // Adjust weight based on intent alignment
        if (intent && metadata.categories) {
            const intentMap = {
            'ASK_FACTUAL_INFO': ['fact', 'information', 'explanation', 'definition'],
            'ASK_RECOMMENDATIONS': ['recommendation', 'advice', 'best practice', 'guide'],
            'TROUBLESHOOTING': ['problem', 'solution', 'troubleshooting', 'fix'],
            'PEST_DISEASE_IDENTIFICATION': ['pest', 'disease', 'symptom', 'treatment'],
            'MARKET_PRICING': ['market', 'price', 'trend', 'forecast']
            };
            
            // Check if document categories align with intent
            const intentKeywords = intentMap[intent?.primary] || [];
            const hasAlignedCategory = metadata.categories.some(category => 
            intentKeywords.some(keyword => category.toLowerCase().includes(keyword))
            );
            
            weights.intent = hasAlignedCategory ? 0.9 : 0.3;
        }
        
        // Adjust weight based on agricultural topic alignment
        if (agricultureAnalysis && agricultureAnalysis.primaryTopic && metadata.topics) {
            const hasTopic = metadata.topics.some(topic => 
            topic.toLowerCase() === agricultureAnalysis.primaryTopic.toLowerCase()
            );
            weights.topic = hasTopic ? 0.9 : 0.4;
        }
        
        // If crops are detected, boost documents that mention those crops
        if (agricultureAnalysis && agricultureAnalysis.detectedCrops && 
            agricultureAnalysis.detectedCrops.length > 0 && doc.pageContent) {
            
            const cropMentions = agricultureAnalysis.detectedCrops.filter(crop => 
            doc.pageContent.toLowerCase().includes(crop.name.toLowerCase())
            );
            
            if (cropMentions.length > 0) {
            weights.topic += 0.2; // Boost for crop mention
            }
        }
        
        // Compute final weighted score
        const finalScore = (
            weights.vector * 0.4 +
            weights.recency * 0.1 +
            weights.intent * 0.25 +
            weights.topic * 0.15 +
            weights.source * 0.1
        );
        
        return {
            ...doc,
            finalScore,
            weights
        };
        });
    }
    
    /**
     * Apply LLM-based weighting for more sophisticated analysis
     * @private
     */
    async applyLLMWeighting(documents, originalQuery, queryAugmentation, context) {
        // For small document sets, fall back to rule-based weighting
        if (documents.length <= 3) {
            return documents;
        }
        
        try {
            // Create summary representations of documents for the LLM
            const documentSummaries = documents.map((doc, index) => ({
                id: index,
                title: doc.metadata?.title || `Document ${index + 1}`,
                source: doc.metadata?.source || 'Unknown',
                content_excerpt: (doc.pageContent || doc.content || "No content available").substring(0, 200) + '...',
                initial_score: doc.finalScore
            }));
            
            const systemPrompt = `
                You are an expert document relevance judge. Your task is to evaluate the relevance of retrieved documents to a user's query.
                
                You will receive:
                1. The original user query
                2. Query augmentation details (if available)
                3. User intent (if identified)
                4. Agricultural context (if available)
                5. A list of document summaries with their initial relevance scores
                
                For each document, evaluate its relevance to the query on a scale of 0.0 to 1.0 where:
                - 1.0 = Extremely relevant, directly answers the user's question
                - 0.7 = Highly relevant, contains most of the information needed
                - 0.5 = Moderately relevant, contains some useful information
                - 0.3 = Slightly relevant, tangentially related
                - 0.0 = Not relevant
                
                Your response must be a valid JSON array of objects, with each object having:
                - "id": The document ID (integer, matching the id in the input)
                - "relevance": Your relevance score (float between 0 and 1)
                
                Example response:
                [
                    {"id": 0, "relevance": 0.9},
                    {"id": 1, "relevance": 0.4},
                    {"id": 2, "relevance": 0.7}
                ]
            `;
            
            const userMessage = JSON.stringify({
                query: originalQuery,
                query_augmentation: queryAugmentation ? {
                    expanded_query: queryAugmentation.augmentedQuery,
                    keywords: queryAugmentation.keywords
                } : null,
                intent: context.intent ? {
                    primary: context.intent.primary || context.intent.intent,
                    secondary: context.intent.secondary || context.intent.secondaryIntents || []
                } : null,
                agricultural_context: context.agricultureAnalysis ? {
                    topic: context.agricultureAnalysis.primaryTopic,
                    crops: context.agricultureAnalysis.detectedCrops?.map(c => c.name) || [],
                    conditions: context.agricultureAnalysis.conditions || []
                } : null,
                conversation_context: context.contextSummary ? context.contextSummary.summary : null,
                documents: documentSummaries
            });
            
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ]
            });
            
            let result;
            try {
                // Parse the JSON response
                const responseContent = response.choices[0].message.content;
                result = JSON.parse(responseContent);

                // Handle different response formats
                if (result.documents && Array.isArray(result.documents)) {
                    result = result.documents;
                } else if (result.results && Array.isArray(result.results)) {
                    result = result.results;
                } else if (result.evaluations && Array.isArray(result.evaluations)) {
                    // Add this condition to handle the evaluations format
                    result = result.evaluations;
                } else if (!Array.isArray(result)) {
                    console.warn("LLM returned unexpected format:", responseContent);
                    throw new Error("Response is not an array or doesn't contain an array property");
                }
                
                // Validate each item has id and relevance
                const isValid = result.every(item => 
                    typeof item === 'object' && 
                    item !== null && 
                    'id' in item && 
                    'relevance' in item
                );
                
                if (!isValid) {
                    throw new Error("Some items missing required fields");
                }
            } catch (parseError) {
                console.error("Failed to parse LLM response:", parseError);
                throw new Error("Invalid LLM response format: " + parseError.message);
            }
            
            // Map the LLM scores back to documents
            return documents.map((doc, index) => {
                const resultItem = result.find(r => r.id === index);
                const llmScore = resultItem ? resultItem.relevance : doc.finalScore;
                
                // Blend LLM score with rule-based score
                const blendedScore = (llmScore * 0.7) + (doc.finalScore * 0.3);
                
                return {
                    ...doc,
                    finalScore: blendedScore,
                    weights: {
                        ...doc.weights,
                        llm: llmScore
                    }
                };
            });
        } catch (error) {
            console.error("Error in LLM weighting:", error);
            // Fall back to rule-based weights
            return documents;
        }
    }
    
    /**
     * Final ranking and filtering of weighted results
     * @private
     */
    finalizeResults(weightedDocs) {
        // Sort by final score
        const sortedDocs = [...weightedDocs].sort((a, b) => b.finalScore - a.finalScore);
        
        // Filter out very low-scoring documents
        const threshold = 0.3;
        const filteredDocs = sortedDocs.filter(doc => doc.finalScore >= threshold);
        
        // Return up to 10 documents
        return filteredDocs.slice(0, 6);
    }

    /**
     * Map knowledge bases to collections
     * @param {string[]} knowledgeBases - Array of knowledge base identifiers
     * @returns {string[]} - Array of collection names
     */
    mapKnowledgeBasesToCollections(knowledgeBases) {
        if (!knowledgeBases || knowledgeBases.length === 0) {
        return ['general_file']; // Default to general_file if none specified
        }
        
        const mappedCollections = knowledgeBases
        .map(kb => this.knowledgeBaseMap[kb] || kb)
        .filter(Boolean);
        
        // Deduplicate collections
        return [...new Set(mappedCollections)];
    }
}

// Export a singleton instance
const retrievalManager = new RetrievalManager();
const initializeRetrievalManager = () => {
    // You could load these from a config file or environment variables
    const customMappings = {
      // Custom mappings can be added here during application startup
      // 'CUSTOMER_123_KB': 'customer_123_collection',
    };
    
    retrievalManager.registerMappings(customMappings);
    console.log('RetrievalManager initialized with default mappings');
    
    return retrievalManager;
  };
  
// Initialize the manager
initializeRetrievalManager();
module.exports = { retrievalManager, RetrievalManager };