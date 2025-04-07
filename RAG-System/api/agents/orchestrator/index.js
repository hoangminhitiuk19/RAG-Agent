const { KnowledgeAgent } = require('../knowledge');
const { FunctionAgent } = require('../function');
const vectorStoreManager = require('../../services/vectorStoreManager');
const conversationService = require('../../services/conversationService');
const { conversationStateDetector } = require('../../services/conversationStateDetector');
const { contextSummarizer } = require('../../services/contextSummarizer');
const { agricultureAnalyzer } = require('../../services/agricultureAnalyzer');
const { queryAugmenter } = require('../../services/queryAugmenter');
const { retrievalManager } = require('../../services/retrievalManager');
const { classifyIntent } = require('./enhancedIntentClassifier');
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
      'SYSTEM_KB': 'general_file'
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
      // Step 1: Detect conversation state
      const conversationState = await conversationStateDetector.detectState(
        message, 
        conversationHistory
      );
      
      console.log(`Conversation state detected: ${conversationState.state} (${conversationState.confidence})`);
      
      // Step 2: Context summarization (if CONTINUATION)
      let contextSummary = null;
      if (conversationState.state === 'CONTINUATION') {
        contextSummary = await contextSummarizer.summarizeContext(
          message,
          conversationHistory
        );
        console.log(`Context summary generated, relevance: ${contextSummary.relevance}`);
      }
      
      // Step 3: Classify the intent of the message
      // const { intent, requiredKnowledgeBases, requiredFunctions } = 
      //   await classifyIntent(message, conversationHistory);
      
      // console.log(`Intent classified as: ${intent}`);
      
      // New intent classification with context summary
      const intentClassification = await classifyIntent(message, conversationHistory, contextSummary);
      const { 
        intent, 
        confidence: intentConfidence,
        secondaryIntents,
        explanation: intentExplanation,
        requiredKnowledgeBases, 
        requiredFunctions 
      } = intentClassification;

      console.log(`Intent classified as: ${intent} (confidence: ${intentConfidence})`);
      if (secondaryIntents && secondaryIntents.length > 0) {
        console.log(`Secondary intents: ${secondaryIntents.join(', ')}`);
      }


      // Step 4: Perform agricultural topic and crop analysis
      const agricultureAnalysis = await agricultureAnalyzer.analyzeTopicAndCrops(
        message,
        conversationHistory,
        contextSummary
      );

      console.log(`Agricultural topic: ${agricultureAnalysis.primaryTopic} (${agricultureAnalysis.topicConfidence})`);
      if (agricultureAnalysis.detectedCrops.length > 0) {
        console.log(`Detected crops: ${agricultureAnalysis.detectedCrops.map(c => c.name).join(', ')}`);
      }


      // Step 5: Get farm-specific context if we have farmId
      let farmContext = null;
      if (farmId) {
        const farmContextAgent = require('../function/farmContextAgent');
        farmContext = await farmContextAgent.getFarmContext(farmId, userProfileId);
      }
      
      // Step 6: Handle image analysis if present
      let imageAnalysisResult = null;
      if (imageUrl && requiredFunctions.includes('analyzeImage')) {
        imageAnalysisResult = await this.functionAgent.callFunction({
          name: 'analyzeImage',
          args: { imageUrl }
        });
      }
      
      // Step 7: Retrieve relevant information from vector stores
      // const retrievalResults = await this.retrieveRelevantKnowledge(
      //   message,
      //   conversationHistory,
      //   requiredKnowledgeBases,
      //   contextSummary
      // );
      

      // New retrieval process
      const retrievalData = await this.retrieveRelevantKnowledge(
        message,
        conversationHistory,
        requiredKnowledgeBases,
        contextSummary,
        intentClassification,
        agricultureAnalysis
      );
      
      const retrievalResults = retrievalData.results;
      const queryAugmentation = retrievalData.queryAugmentation;
      const retrievalStats = retrievalData.retrievalStats;

      // Step 8: Determine if we need to execute any functions
      const functionResults = await this.executeFunctions(
        requiredFunctions,
        message,
        farmContext,
        conversationHistory
      );
      
      // Step 9: Generate response with all available context
      const response = await this.knowledgeAgent.generateResponse({
        message,
        conversationHistory,
        conversationState,
        contextSummary,
        retrievalResults,
        farmContext,
        imageAnalysisResult,
        functionResults,
        agricultureAnalysis,
        queryAugmentation
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

  // /**
  //  * Retrieve knowledge from specified vector databases
  //  */
  // async retrieveRelevantKnowledge(message, conversationHistory, knowledgeBases, contextSummary = null, intentClassification = null, agricultureAnalysis = null) {
  //   try {
  //     // Use query augmentation to enhance retrieval
  //     const queryAugmentation = await queryAugmenter.augmentQuery(
  //       message,
  //       contextSummary,
  //       intentClassification,
  //       agricultureAnalysis
  //     );
      
  //     // Use the augmented query for retrieval
  //     const retrievalQuery = queryAugmentation.augmentedQuery;
      
  //     console.log(`Original query: "${message}"`);
  //     console.log(`Augmented query: "${retrievalQuery}"`);
  //     console.log(`Expansion terms: ${queryAugmentation.expansionTerms.join(', ')}`);
      
  //     // Map knowledge bases to collections
  //     const collections = this.mapKnowledgeBasesToCollections(knowledgeBases);
  //     console.log(`Mapped collections: ${collections.join(', ')}`);

  //     const results = await vectorStoreManager.queryCollections(collections, retrievalQuery, {
  //       scoreThreshold: 0.0  // Explicitly set low threshold
  //     });
      
  //     console.log(`Retrieved ${results.length} documents with score range: ${
  //       results.length > 0 
  //         ? `${Math.min(...results.map(r => r.metadata.score))} to ${Math.max(...results.map(r => r.metadata.score))}`
  //         : 'N/A'
  //     }`);
      
  //     if (results.length === 0) {
  //       console.warn(`No results found for query: "${retrievalQuery.substring(0, 100)}..."`);
  //     }
      
  //     // Add query augmentation info to the results for citation/explanation
  //     return {
  //       results,
  //       queryAugmentation
  //     };
  //   } catch (error) {
  //     console.error("Error retrieving knowledge:", error);
  //     return { 
  //       results: [],
  //       queryAugmentation: null
  //     };
  //   }
  // }

  //New retrieve function
  /**
   * Retrieve knowledge from specified knowledge bases
   */
  async retrieveRelevantKnowledge(message, conversationHistory, knowledgeBases, contextSummary = null, intentClassification = null, agricultureAnalysis = null) {
    try {
      // Step 1: Use query augmentation to enhance retrieval
      const queryAugmentation = await queryAugmenter.augmentQuery(
        message,
        contextSummary,
        intentClassification,
        agricultureAnalysis
      );
      // After calling queryAugmenter.augmentQuery:
      console.log(`Original query: "${message}"`);
      console.log(`Augmented query: "${queryAugmentation.augmentedQuery}"`);
      console.log(`Expansion terms: ${queryAugmentation.expansionTerms.join(', ')}`);
      // Step 2: Map knowledge bases to collections
      const collections = retrievalManager.mapKnowledgeBasesToCollections(knowledgeBases);
      console.log(`Mapped collections: ${collections.join(', ')}`);

      // Step 3: Build context for retrieval weighting
      const retrievalContext = {
        intent: intentClassification,
        agricultureAnalysis,
        contextSummary
      };

      // Step 4: Retrieve and weight documents
      const retrievalResults = await retrievalManager.retrieveAndWeight(
        message,
        queryAugmentation,
        collections,
        retrievalContext
      );
      
      console.log(`Retrieved ${retrievalResults.weightedResults.length} weighted documents`);
      console.log(`Retrieval stats: ${JSON.stringify(retrievalResults.retrievalStats)}`);
      
      // Log the top document scores
      if (retrievalResults.weightedResults.length > 0) {
        console.log('Top 3 document scores:');
        retrievalResults.weightedResults.slice(0, 3).forEach((doc, i) => {
          console.log(`${i+1}. Score: ${doc.finalScore.toFixed(2)}, Weights: ${JSON.stringify(doc.weights)}`);
        });
      }
      
      return {
        results: retrievalResults.weightedResults,
        queryAugmentation,
        retrievalStats: retrievalResults.retrievalStats
      };
    } catch (error) {
      console.error("Error retrieving knowledge:", error);
      return { 
        results: [],
        queryAugmentation: null,
        retrievalStats: { error: error.message }
      };
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
    conversation_id,
    conversationHistory = [],
    imageUrl = null,
    res
  }) {
    try {
      // Start timing for performance monitoring
      const startTime = Date.now();
      const metrics = {
        processingTime: {
          total: 0,
          stateDetection: 0,
          contextSummary: 0,
          intentClassification: 0,
          agricultureAnalysis: 0,
          retrieval: 0,
          functionExecution: 0,
          responseGeneration: 0
        },
        documentCounts: {
          retrieved: 0,
          weighted: 0
        },
        confidenceScores: {
          state: 0,
          intent: 0,
          agriculture: 0,
          response: 0
        }
      };
  
      // Step 1: Detect conversation state
      const stateStartTime = Date.now();
      const conversationState = await conversationStateDetector.detectState(
        message, 
        conversationHistory
      );
      metrics.processingTime.stateDetection = Date.now() - stateStartTime;
      metrics.confidenceScores.state = conversationState.confidence;
      
      console.log(`Conversation state detected: ${conversationState.state} (${conversationState.confidence})`);
      
      // Step 2: Context summarization (if CONTINUATION)
      let contextSummary = null;
      if (conversationState.state === 'CONTINUATION') {
        const summaryStartTime = Date.now();
        contextSummary = await contextSummarizer.summarizeContext(
          message,
          conversationHistory
        );
        metrics.processingTime.contextSummary = Date.now() - summaryStartTime;
        console.log(`Context summary generated, relevance: ${contextSummary.relevance}`);
      }
      
      // Step 3: Enhanced Intent Classification
      const intentStartTime = Date.now();
      const intentClassification = await classifyIntent(message, conversationHistory, contextSummary);
      const { 
        intent, 
        confidence: intentConfidence,
        secondaryIntents,
        explanation: intentExplanation,
        requiredKnowledgeBases, 
        requiredFunctions 
      } = intentClassification;
      metrics.processingTime.intentClassification = Date.now() - intentStartTime;
      metrics.confidenceScores.intent = intentConfidence;
  
      console.log(`Intent classified as: ${intent} (confidence: ${intentConfidence})`);
      if (secondaryIntents && secondaryIntents.length > 0) {
        console.log(`Secondary intents: ${secondaryIntents.join(', ')}`);
      }
  
      // Step 4: Combined Topic & Crop Analysis
      const analysisStartTime = Date.now();
      const agricultureAnalysis = await agricultureAnalyzer.analyzeTopicAndCrops(
        message,
        conversationHistory,
        contextSummary
      );
      metrics.processingTime.agricultureAnalysis = Date.now() - analysisStartTime;
      metrics.confidenceScores.agriculture = agricultureAnalysis.topicConfidence;
      
      console.log(`Agricultural topic: ${agricultureAnalysis.primaryTopic} (${agricultureAnalysis.topicConfidence})`);
      if (agricultureAnalysis.detectedCrops.length > 0) {
        console.log(`Detected crops: ${agricultureAnalysis.detectedCrops.map(c => c.name).join(', ')}`);
      }
  
      res.write(`data: ${JSON.stringify({
        text_chunk: "Retrieving relevant information...",
        conversation_id: conversation_id
      })}\n\n`);
  
      // Gather farm context if available
      let farmContext = null;
      if (farmId) {
        const farmContextAgent = require('../function/farmContextAgent');
        farmContext = await farmContextAgent.getFarmContext(farmId, userProfileId);
      }
  
      const farmData = farmContext?.farmData || null;
      const cropData = farmContext?.cropData || [];
      const weatherData = farmContext?.weatherData || null;
  
      // Handle image analysis
      let imageAnalysisResult = null;
      if (imageUrl && requiredFunctions.includes('analyzeImage')) {
        imageAnalysisResult = await this.functionAgent.callFunction({
          name: 'analyzeImage',
          args: { imageUrl }
        });
      }
      console.log('Step 5: Beginning query augmentation and retrieval...');
      // Step 5 & 6: Query Augmentation and Dynamic Knowledge Weighting
      const retrievalStartTime = Date.now();
      const retrievalData = await this.retrieveRelevantKnowledge(
        message,
        conversationHistory,
        requiredKnowledgeBases,
        contextSummary,
        intentClassification,
        agricultureAnalysis
      );
      metrics.processingTime.retrieval = Date.now() - retrievalStartTime;
      
      const retrievalResults = retrievalData.results;
      const queryAugmentation = retrievalData.queryAugmentation;
      const retrievalStats = retrievalData.retrievalStats;
      
      metrics.documentCounts.retrieved = retrievalStats.totalRetrieved || 0;
      metrics.documentCounts.weighted = retrievalResults.length || 0;
      
      console.log(`Step 6: Retrieved ${retrievalData.results.length} documents`);
      console.log(`Query Augmentation: "${retrievalData.queryAugmentation?.augmentedQuery || 'Not available'}"`);
      // Execute required functions
      const functionStartTime = Date.now();
      const functionResults = await this.executeFunctions(
        requiredFunctions,
        message,
        farmData,
        conversationHistory
      );
      metrics.processingTime.functionExecution = Date.now() - functionStartTime;
  
      // Step 7 & 8: Intent-Based Prompt Construction and Response Generation
      const responseStartTime = Date.now();
      
      
      // Build prompt using the promptBuilder
      const { promptBuilder } = require('../../services/promptBuilder');
      const { responseGenerator } = require('../../services/responseGenerator');
      
      console.log('Step 7: Building specialized prompt based on intent...');
      // First build a specialized prompt based on intent
      const promptData = await promptBuilder.buildPrompt({
        message,
        conversationHistory,
        conversationState,
        contextSummary,
        retrievalResults,
        intentClassification,
        agricultureAnalysis,
        queryAugmentation,
        farmContext: farmData,
        imageAnalysisResult,
        functionResults,
        weatherData
      });
      console.log(`Step 8: Prompt built for intent: ${promptData.intentType}`);
      // For streaming response, we'll still use the knowledge agent's stream method
      // but we'll pass it the prompt from our promptBuilder
      const stream = await this.knowledgeAgent.generateResponseWithPrompt({
        message,
        systemPrompt: promptData.system,
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
      
      // Process the response for extracting citations and metadata
      const responseData = responseGenerator.processResponse(
        fullResponse, 
        intent, 
        retrievalResults, 
        agricultureAnalysis
      );
      
      metrics.confidenceScores.response = responseData.confidence;
      metrics.processingTime.responseGeneration = Date.now() - responseStartTime;
      metrics.processingTime.total = Date.now() - startTime;
      
      // Log performance metrics
      console.log('Performance Metrics:');
      console.log(JSON.stringify(metrics, null, 2));
  
      res.write(`data: ${JSON.stringify({
        complete: true,
        conversation_id: conversation_id,
        farm_data: farmData,
        crop_data: cropData,
        weather_data: weatherData,
        sources: retrievalResults.map(doc => ({
          title: doc.metadata?.title || 'Unknown',
          source: doc.metadata?.source || 'Unknown',
          score: doc.finalScore
        })),
        confidence: responseData.confidence,
        metrics: metrics
      })}\n\n`);
    } catch (error) {
      console.error('Error in streamProcess:', error);
      res.write(`data: ${JSON.stringify({ 
        error: error.message,
        conversation_id: conversation_id
      })}\n\n`);
          
    } finally {
      res.end();
    }
  }
  
}

module.exports = { OrchestratorAgent };