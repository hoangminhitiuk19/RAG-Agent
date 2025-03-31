const { classifyIntent } = require('./intentClassifier');
const { KnowledgeAgent } = require('../knowledge');
const { FunctionAgent } = require('../function');
const vectorStoreManager = require('../../services/vectorStoreManager');
const  conversationService  = require('../../services/conversationService');
const { getConversationContext } = require('../../utils/contextUtils');

class OrchestratorAgent {
  constructor() {
    this.knowledgeAgent = new KnowledgeAgent();
    this.functionAgent = new FunctionAgent();
  }

  /**
   * Map knowledge base IDs to collection names
   * @param {Array} knowledgeBases - Knowledge base IDs
   * @returns {Array} - Collection names
   */
  mapKnowledgeBasesToCollections(knowledgeBases = []) {
    // Default to all collections if none are specified
    if (!knowledgeBases || knowledgeBases.length === 0) {
      return ['general_file', 'unique_file'];
    }
    
    const mapping = {
      'AGRICULTURE_KB': 'general_file',
      'CROP_KB': 'unique_file',
      'SYSTEM_KB': 'system_knowledge'
    };
    
    const collections = knowledgeBases
      .map(kb => mapping[kb])
      .filter(Boolean); // Remove any undefined mappings
      
    // If no valid collections found, return defaults
    return collections.length > 0 ? collections : ['general_file', 'unique_file'];
  }
  /**
   * Main processing function that orchestrates the entire agent workflow
   */
  async process(input) {
    const {
      message,
      userProfileId,
      farmId,
      conversationHistory = [],
      imageUrl = null
    } = input;

    try {
      // Step 1: Classify the intent of the message
      const { intent, requiredKnowledgeBases, requiredFunctions } = 
        await classifyIntent(message, conversationHistory);
      
      console.log(`Intent classified as: ${intent}`);
      
      // Step 2: Get farm-specific context if we have farmId
      let farmContext = null;
      if (farmId) {
        const farmContextAgent = require('../function/farmContextAgent');
        farmContext = await farmContextAgent.getFarmContext(farmId, userProfileId);
      }
      
      // Step 3: Handle image analysis if present
      let imageAnalysisResult = null;
      if (imageUrl && requiredFunctions.includes('analyzeImage')) {
        imageAnalysisResult = await this.functionAgent.callFunction({
          name: 'analyzeImage',
          args: { imageUrl }
        });
      }
      
      // Step 4: Retrieve relevant information from vector stores
      const retrievalResults = await this.retrieveRelevantKnowledge(
        message,
        conversationHistory,
        requiredKnowledgeBases
      );
      
      // Step 5: Determine if we need to execute any functions
      const functionResults = await this.executeFunctions(
        requiredFunctions,
        message,
        farmContext,
        conversationHistory
      );
      
      // Step 6: Generate response with all available context
      const response = await this.knowledgeAgent.generateResponse({
        message,
        conversationHistory,
        retrievalResults,
        farmContext,
        imageAnalysisResult,
        functionResults
      });
      
      return response;
    } catch (error) {
      console.error('Error in OrchestratorAgent:', error);
      return {
        message: "I'm sorry, I encountered an error processing your request. Please try again.",
        error: error.message
      };
    }
  }

  /**
   * Retrieve knowledge from specified vector databases
   */
  async retrieveRelevantKnowledge(message, conversationHistory, knowledgeBases) {
    try {
      // Create a contextual query that includes the conversation context
      const contextualQuery = getConversationContext(message, conversationHistory);
      
      // Map knowledge base IDs to collection names
      const collections = this.mapKnowledgeBasesToCollections(knowledgeBases);
      
      // Query the vector store
      const results = await vectorStoreManager.multiQuery(collections, contextualQuery);
      
      return results; // Already merged and deduplicated by vectorStoreManager
    } catch (error) {
      console.error("Error retrieving knowledge:", error);
      return []; // Return empty array on error
    }
  }

  /**
   * Execute any required functions
   */
  async executeFunctions(requiredFunctions, message, farmContext, conversationHistory) {
    if (!requiredFunctions || requiredFunctions.length === 0) {
      return {};
    }
    
    const functionPromises = requiredFunctions.map(funcName => 
      this.functionAgent.callFunction({
        name: funcName,
        args: { message, farmContext, conversationHistory }
      })
    );
    
    const functionResults = await Promise.all(functionPromises);
    
    // Convert array of results to object with function names as keys
    return functionResults.reduce((acc, result, index) => {
      acc[requiredFunctions[index]] = result;
      return acc;
    }, {});
  }

  /**
   * Merge and deduplicate retrieval results
   */
  mergeRetrievalResults(retrievalResults) {
    // Flatten the array of arrays
    const flatResults = retrievalResults.flat();
    
    // Deduplicate by content
    const uniqueResults = [];
    const seenContent = new Set();
    
    for (const result of flatResults) {
      if (!seenContent.has(result.content)) {
        seenContent.add(result.content);
        uniqueResults.push(result);
      }
    }
    
    return uniqueResults;
  }
  async streamProcess({
    message,
    userProfileId,
    farmId,
    conversationHistory = [],
    imageUrl = null,
    res
  }) {
    try {
      const { intent, requiredKnowledgeBases, requiredFunctions } =
        await classifyIntent(message, conversationHistory);
  
      console.log(`Intent classified as: ${intent}`);
  
      res.write(`data: ${JSON.stringify({ text_chunk: "Retrieving relevant information..." })}\n\n`);
  
      let farmContext = null;
      if (farmId) {
        const farmContextAgent = require('../function/farmContextAgent');
        farmContext = await farmContextAgent.getFarmContext(farmId, userProfileId);
      }
  
      const farmData = farmContext?.farmData || null;
      const cropData = farmContext?.cropData || [];
      const weatherData = farmContext?.weatherData || null;
  
      let imageAnalysisResult = null;
      if (imageUrl && requiredFunctions.includes('analyzeImage')) {
        imageAnalysisResult = await this.functionAgent.callFunction({
          name: 'analyzeImage',
          args: { imageUrl }
        });
      }
  
      const retrievalResults = await this.retrieveRelevantKnowledge(
        message,
        conversationHistory,
        requiredKnowledgeBases
      );
  
      const functionResults = await this.executeFunctions(
        requiredFunctions,
        message,
        farmData,
        conversationHistory
      );
  
      const stream = await this.knowledgeAgent.generateResponse({
        message,
        conversationHistory,
        retrievalResults,
        farmContext: farmData,
        imageAnalysisResult,
        functionResults,
        weatherData,
        stream: true
      });
  
      let fullResponse = '';
      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          const content = chunk.choices[0].delta.content;
          res.write(`data: ${JSON.stringify({ text_chunk: content })}\n\n`);
          fullResponse += content;
        }
      }
  
      res.write(`data: ${JSON.stringify({
        complete: true,
        farm_data: farmData,
        crop_data: cropData,
        weather_data: weatherData,
        sources: retrievalResults.map(doc => ({
          title: doc.metadata?.title || 'Unknown',
          source: doc.metadata?.source || 'Unknown'
        }))
      })}\n\n`);
    } catch (error) {
      console.error('Error in streamProcess:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    } finally {
      res.end();
    }
  }
  
}

module.exports = { OrchestratorAgent };