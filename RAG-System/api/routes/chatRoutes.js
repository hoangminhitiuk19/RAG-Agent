const express = require('express');
const router = express.Router();
const { supabase } = require('../config/db');
const chatService = require('../services/chatService');
const conversationService = require('../services/conversationService');
const { extractStructuredData } = require('../utils/responseParser');
const farmService = require('../services/farmService');
const vectorStoreManager = require('../services/vectorStoreManager');
const { weatherService } = require('../services/weather');

console.log('✅ chatRoutes.js loaded');

router.get('/system-status', async (req, res) => {
  try {
    const qdrantStatus = await checkQdrantHealth();
    res.json({
      qdrant_available: qdrantStatus,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    console.error('Error checking system status:', error);
    res.status(500).json({
      error: 'Error checking system status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});


router.post('/test-agriculture-analysis', async (req, res) => {
  try {
    const { message, conversation_id, previous_messages = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get conversation history if conversation_id is provided
    let conversationHistory = previous_messages;
    if (conversation_id && !previous_messages.length) {
      conversationHistory = await conversationService.getConversationHistory(
        conversation_id, { formatForOpenAI: true }
      );
    }
    
    // Import components
    const { conversationStateDetector } = require('../services/conversationStateDetector');
    const { contextSummarizer } = require('../services/contextSummarizer');
    const { agricultureAnalyzer } = require('../services/agricultureAnalyzer');
    
    // Detect conversation state
    const stateResult = await conversationStateDetector.detectState(
      message, 
      conversationHistory
    );
    
    // Generate context summary if continuation
    let summaryResult = null;
    if (stateResult.state === 'CONTINUATION') {
      summaryResult = await contextSummarizer.summarizeContext(
        message,
        conversationHistory
      );
    }
    
    // Perform agriculture analysis
    const analysisResult = await agricultureAnalyzer.analyzeTopicAndCrops(
      message,
      conversationHistory,
      summaryResult
    );
    
    // Return results
    res.json({
      message,
      conversation_history_length: conversationHistory.length,
      state_detection: stateResult,
      context_summary: summaryResult,
      agriculture_analysis: analysisResult
    });
  } catch (error) {
    console.error('Error testing agriculture analysis:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Add to api/routes/chatRoutes.js

router.post('/test-prompt-builder', async (req, res) => {
  try {
    const { message, conversation_id, knowledge_bases = [], previous_messages = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get conversation history if conversation_id is provided
    let conversationHistory = previous_messages;
    if (conversation_id && !previous_messages.length) {
      conversationHistory = await conversationService.getConversationHistory(
        conversation_id, { formatForOpenAI: true }
      );
    }
    
    // Import components
    const { conversationStateDetector } = require('../services/conversationStateDetector');
    const { contextSummarizer } = require('../services/contextSummarizer');
    const { classifyIntent } = require('../agents/orchestrator/enhancedIntentClassifier');
    const { agricultureAnalyzer } = require('../services/agricultureAnalyzer');
    const { queryAugmenter } = require('../services/queryAugmenter');
    const { retrievalManager } = require('../services/retrievalManager');
    const { promptBuilder } = require('../services/promptBuilder');
    
    // Step 1: Detect conversation state
    const stateResult = await conversationStateDetector.detectState(
      message, 
      conversationHistory
    );
    
    // Step 2: Generate context summary if continuation
    let summaryResult = null;
    if (stateResult.state === 'CONTINUATION') {
      summaryResult = await contextSummarizer.summarizeContext(
        message,
        conversationHistory
      );
    }
    
    // Step 3: Classify intent
    const intentResult = await classifyIntent(
      message,
      conversationHistory,
      summaryResult
    );
    
    // Step 4: Perform agriculture analysis
    const analysisResult = await agricultureAnalyzer.analyzeTopicAndCrops(
      message,
      conversationHistory,
      summaryResult
    );
    
    // Step 5: Augment query
    const augmentationResult = await queryAugmenter.augmentQuery(
      message,
      summaryResult,
      intentResult,
      analysisResult
    );
    
    // Step 6: Map knowledge bases to collections
    const requestedKbs = knowledge_bases.length ? knowledge_bases : intentResult.requiredKnowledgeBases || [];
    const collections = retrievalManager.mapKnowledgeBasesToCollections(requestedKbs);
    
    // Step 7: Build context for retrieval
    const retrievalContext = {
      intent: intentResult,
      agricultureAnalysis: analysisResult,
      contextSummary: summaryResult
    };
    
    // Step 8: Retrieve and weight documents
    const retrievalResults = await retrievalManager.retrieveAndWeight(
      message,
      augmentationResult,
      collections,
      retrievalContext
    );
    
    // Step 9: Build prompt
    const prompt = await promptBuilder.buildPrompt({
      message,
      conversationHistory,
      conversationState: stateResult,
      contextSummary: summaryResult,
      retrievalResults: retrievalResults.weightedResults,
      intentClassification: intentResult,
      agricultureAnalysis: analysisResult,
      queryAugmentation: augmentationResult
    });
    
    // Return results
    res.json({
      message,
      conversation_history_length: conversationHistory.length,
      state_detection: stateResult,
      context_summary: summaryResult,
      intent_classification: intentResult,
      agriculture_analysis: analysisResult,
      query_augmentation: augmentationResult,
      retrieval_results: {
        weighted_documents: retrievalResults.weightedResults.map(doc => ({
          excerpt: doc.pageContent ? doc.pageContent.substring(0, 150) + '...' : 
                  doc.content ? doc.content.substring(0, 150) + '...' : 'No content',
          title: doc.metadata?.title || doc.metadata?.source || 'Unknown',
          source: doc.metadata?.source || doc.metadata?.url || 'Unknown',
          final_score: doc.finalScore,
          weights: doc.weights
        })),
        stats: retrievalResults.retrievalStats,
        collections,
        knowledge_bases: requestedKbs
      },
      prompt: {
        intent_type: prompt.intentType,
        system_prompt: prompt.system.substring(0, 500) + '...',  // Truncate for readability
        prompt_meta: {
          retrieved_sources: prompt.retrievedSources,
          context_included: prompt.contextIncluded,
          agriculture_analysis_included: prompt.agricultureAnalysisIncluded,
          secondary_intents: prompt.secondaryIntents || []
        }
      }
    });
  } catch (error) {
    console.error('Error testing prompt builder:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Add to api/routes/chatRoutes.js

router.post('/test-response-generator', async (req, res) => {
  try {
    const { message, conversation_id, knowledge_bases = [], previous_messages = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get conversation history if conversation_id is provided
    let conversationHistory = previous_messages;
    if (conversation_id && !previous_messages.length) {
      conversationHistory = await conversationService.getConversationHistory(
        conversation_id, { formatForOpenAI: true }
      );
    }
    
    // Import components
    const { conversationStateDetector } = require('../services/conversationStateDetector');
    const { contextSummarizer } = require('../services/contextSummarizer');
    const { classifyIntent } = require('../agents/orchestrator/enhancedIntentClassifier');
    const { agricultureAnalyzer } = require('../services/agricultureAnalyzer');
    const { queryAugmenter } = require('../services/queryAugmenter');
    const { retrievalManager } = require('../services/retrievalManager');
    const { promptBuilder } = require('../services/promptBuilder');
    const { responseGenerator } = require('../services/responseGenerator');
    
    // Step 1: Detect conversation state
    const stateResult = await conversationStateDetector.detectState(
      message, 
      conversationHistory
    );
    
    // Step 2: Generate context summary if continuation
    let summaryResult = null;
    if (stateResult.state === 'CONTINUATION') {
      summaryResult = await contextSummarizer.summarizeContext(
        message,
        conversationHistory
      );
    }
    
    // Step 3: Classify intent
    const intentResult = await classifyIntent(
      message,
      conversationHistory,
      summaryResult
    );
    
    // Step 4: Perform agriculture analysis
    const analysisResult = await agricultureAnalyzer.analyzeTopicAndCrops(
      message,
      conversationHistory,
      summaryResult
    );
    
    // Step 5: Augment query
    const augmentationResult = await queryAugmenter.augmentQuery(
      message,
      summaryResult,
      intentResult,
      analysisResult
    );
    
    // Step 6: Map knowledge bases to collections
    const requestedKbs = knowledge_bases.length ? knowledge_bases : intentResult.requiredKnowledgeBases || [];
    const collections = retrievalManager.mapKnowledgeBasesToCollections(requestedKbs);
    
    // Step 7: Build context for retrieval
    const retrievalContext = {
      intent: intentResult,
      agricultureAnalysis: analysisResult,
      contextSummary: summaryResult
    };
    
    // Step 8: Retrieve and weight documents
    const retrievalResults = await retrievalManager.retrieveAndWeight(
      message,
      augmentationResult,
      collections,
      retrievalContext
    );
    
    // Step 9: Build prompt
    const promptData = await promptBuilder.buildPrompt({
      message,
      conversationHistory,
      conversationState: stateResult,
      contextSummary: summaryResult,
      retrievalResults: retrievalResults.weightedResults,
      intentClassification: intentResult,
      agricultureAnalysis: analysisResult,
      queryAugmentation: augmentationResult
    });
    
    // Step 10: Generate response
    const responseData = await responseGenerator.generateResponse({
      message,
      conversationHistory,
      promptData,
      intentClassification: intentResult,
      retrievalResults: retrievalResults.weightedResults,
      agricultureAnalysis: analysisResult
    });
    
    // Return results
    res.json({
      message,
      conversation_history_length: conversationHistory.length,
      state_detection: stateResult,
      context_summary: summaryResult,
      intent_classification: intentResult,
      agriculture_analysis: analysisResult,
      query_augmentation: augmentationResult,
      retrieval_results: {
        weighted_documents_count: retrievalResults.weightedResults.length,
        collections,
        knowledge_bases: requestedKbs
      },
      prompt: {
        intent_type: promptData.intentType,
        system_prompt_length: promptData.system.length
      },
      response: responseData.response,
      confidence: responseData.confidence,
      metadata: responseData.metadata
    });
  } catch (error) {
    console.error('Error testing response generator:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
router.post('/test-retrieval-weighting', async (req, res) => {
  try {
    // Log the request
    console.log('=============================================');
    console.log('Test Retrieval Weighting Request:');
    console.log('Message:', req.body.message);
    console.log('Knowledge Bases:', req.body.knowledge_bases);
    console.log('=============================================');

    const { message, conversation_id, knowledge_bases = [], previous_messages = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get conversation history if conversation_id is provided
    let conversationHistory = previous_messages;
    if (conversation_id && !previous_messages.length) {
      conversationHistory = await conversationService.getConversationHistory(
        conversation_id, { formatForOpenAI: true }
      );
    }
    
    // Import components
    const { conversationStateDetector } = require('../services/conversationStateDetector');
    const { contextSummarizer } = require('../services/contextSummarizer');
    const { classifyIntent } = require('../agents/orchestrator/enhancedIntentClassifier');
    const { agricultureAnalyzer } = require('../services/agricultureAnalyzer');
    const { queryAugmenter } = require('../services/queryAugmenter');
    const { retrievalManager } = require('../services/retrievalManager');
    
    // Step 1: Detect conversation state
    const stateResult = await conversationStateDetector.detectState(
      message, 
      conversationHistory
    );
    
    // Step 2: Generate context summary if continuation
    let summaryResult = null;
    if (stateResult.state === 'CONTINUATION') {
      summaryResult = await contextSummarizer.summarizeContext(
        message,
        conversationHistory
      );
    }
    
    // Step 3: Classify intent
    const intentResult = await classifyIntent(
      message,
      conversationHistory,
      summaryResult
    );
    
    // Step 4: Perform agriculture analysis
    const analysisResult = await agricultureAnalyzer.analyzeTopicAndCrops(
      message,
      conversationHistory,
      summaryResult
    );
    
    // Step 5: Augment query
    const augmentationResult = await queryAugmenter.augmentQuery(
      message,
      summaryResult,
      intentResult,
      analysisResult
    );
    
    // Step 6: Map knowledge bases to collections
    const requestedKbs = knowledge_bases.length ? knowledge_bases : intentResult.requiredKnowledgeBases || [];
    const collections = retrievalManager.mapKnowledgeBasesToCollections(requestedKbs);
    
    // Step 7: Build context for retrieval
    const retrievalContext = {
      intent: intentResult,
      agricultureAnalysis: analysisResult,
      contextSummary: summaryResult
    };
    
    // Step 8: Retrieve and weight documents
    const retrievalResults = await retrievalManager.retrieveAndWeight(
      message,
      augmentationResult,
      collections,
      retrievalContext
    );
    
    // Log the results
    console.log('=============================================');
    console.log('Retrieval Results:');
    console.log('Collections used:', collections);
    console.log('Documents retrieved:', retrievalResults.weightedResults.length);
    console.log('Retrieval stats:', JSON.stringify(retrievalResults.retrievalStats));
    console.log('=============================================');
    
    // Return results - ONLY SEND THIS RESPONSE ONCE
    res.json({
      message,
      conversation_history_length: conversationHistory.length,
      state_detection: stateResult,
      context_summary: summaryResult,
      intent_classification: intentResult,
      agriculture_analysis: analysisResult,
      query_augmentation: augmentationResult,
      retrieval_results: {
        weighted_documents: retrievalResults.weightedResults.map(doc => ({
          excerpt: doc.pageContent ? doc.pageContent.substring(0, 150) + '...' : 
                  doc.content ? doc.content.substring(0, 150) + '...' : 'No content',
          title: doc.metadata?.title || doc.metadata?.source || 'Untitled',
          source: doc.metadata?.source || doc.metadata?.url || 'Unknown',
          final_score: doc.finalScore,
          weights: doc.weights
        })),
        stats: retrievalResults.retrievalStats,
        collections,
        knowledge_bases: requestedKbs
      }
    });
  } catch (error) {
    console.error('Error testing retrieval weighting:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.post('/test-query-augmentation', async (req, res) => {
  try {
    const { message, conversation_id, previous_messages = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get conversation history if conversation_id is provided
    let conversationHistory = previous_messages;
    if (conversation_id && !previous_messages.length) {
      conversationHistory = await conversationService.getConversationHistory(
        conversation_id, { formatForOpenAI: true }
      );
    }
    
    // Import components
    const { conversationStateDetector } = require('../services/conversationStateDetector');
    const { contextSummarizer } = require('../services/contextSummarizer');
    const { classifyIntent } = require('../agents/orchestrator/enhancedIntentClassifier');
    const { agricultureAnalyzer } = require('../services/agricultureAnalyzer');
    const { queryAugmenter } = require('../services/queryAugmenter');
    
    // Detect conversation state
    const stateResult = await conversationStateDetector.detectState(
      message, 
      conversationHistory
    );
    
    // Generate context summary if continuation
    let summaryResult = null;
    if (stateResult.state === 'CONTINUATION') {
      summaryResult = await contextSummarizer.summarizeContext(
        message,
        conversationHistory
      );
    }
    
    // Classify intent
    const intentResult = await classifyIntent(
      message,
      conversationHistory,
      summaryResult
    );
    
    // Perform agriculture analysis
    const analysisResult = await agricultureAnalyzer.analyzeTopicAndCrops(
      message,
      conversationHistory,
      summaryResult
    );
    
    // Augment query
    const augmentationResult = await queryAugmenter.augmentQuery(
      message,
      summaryResult,
      intentResult,
      analysisResult
    );
    
    // Return results
    res.json({
      message,
      conversation_history_length: conversationHistory.length,
      state_detection: stateResult,
      context_summary: summaryResult,
      intent_classification: intentResult,
      agriculture_analysis: analysisResult,
      query_augmentation: augmentationResult
    });
  } catch (error) {
    console.error('Error testing query augmentation:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.post('/test-intent-classification', async (req, res) => {
  try {
    const { message, conversation_id, previous_messages = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get conversation history if conversation_id is provided
    let conversationHistory = previous_messages;
    if (conversation_id && !previous_messages.length) {
      conversationHistory = await conversationService.getConversationHistory(
        conversation_id, { formatForOpenAI: true }
      );
    }
    
    // Import components
    const { conversationStateDetector } = require('../services/conversationStateDetector');
    const { contextSummarizer } = require('../services/contextSummarizer');
    const { classifyIntent } = require('../agents/orchestrator/enhancedIntentClassifier');
    
    // Detect conversation state
    const stateResult = await conversationStateDetector.detectState(
      message, 
      conversationHistory
    );
    
    // Generate context summary if continuation
    let summaryResult = null;
    if (stateResult.state === 'CONTINUATION') {
      summaryResult = await contextSummarizer.summarizeContext(
        message,
        conversationHistory
      );
    }
    
    // Classify intent with context
    const intentResult = await classifyIntent(
      message,
      conversationHistory,
      summaryResult
    );
    
    // Return results
    res.json({
      message,
      conversation_history_length: conversationHistory.length,
      state_detection: stateResult,
      context_summary: summaryResult,
      intent_classification: intentResult
    });
  } catch (error) {
    console.error('Error testing intent classification:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.post('/test-conversation-components', async (req, res) => {
  try {
    const { message, conversation_id, previous_messages = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get conversation history if conversation_id is provided
    let conversationHistory = previous_messages;
    if (conversation_id && !previous_messages.length) {
      conversationHistory = await conversationService.getConversationHistory(
        conversation_id, { formatForOpenAI: true }
      );
    }
    
    // Import the new services
    const { conversationStateDetector } = require('../services/conversationStateDetector');
    const { contextSummarizer } = require('../services/contextSummarizer');
    
    // Test conversation state detection
    const stateResult = await conversationStateDetector.detectState(
      message, 
      conversationHistory
    );
    
    // Test context summarization if state is CONTINUATION
    let summaryResult = null;
    if (stateResult.state === 'CONTINUATION') {
      summaryResult = await contextSummarizer.summarizeContext(
        message,
        conversationHistory
      );
    }
    
    // Build a retrieval query using the context summary
    let retrievalQuery = message;
    if (summaryResult && summaryResult.relevance > 0.5) {
      retrievalQuery = `${message} (Context: ${summaryResult.summary})`;
    }
    
    // Return results
    res.json({
      message,
      conversation_history_length: conversationHistory.length,
      state_detection: stateResult,
      context_summary: summaryResult,
      retrieval_query: retrievalQuery
    });
  } catch (error) {
    console.error('Error testing conversation components:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.get('/test-retrieval', async (req, res) => {
  try {
    const query = req.query.query || "Coffee farming best practices";
    const threshold = parseFloat(req.query.threshold || 0.0);
    const limit = parseInt(req.query.limit || 10);
    
    console.log(`Testing retrieval with query: "${query}", threshold: ${threshold}, limit: ${limit}`);
    
    const results = await vectorStoreManager.queryCollections(
      ['general_file', 'unique_file'],
      query,
      { scoreThreshold: threshold, limit }
    );
    
    res.json({
      query,
      threshold,
      limit,
      results_count: results.length,
      results: results.map(r => ({
        score: r.metadata.score,
        collection: r.metadata.collection,
        source: r.metadata.source,
        content_preview: r.content.substring(0, 200) + '...'
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/check-qdrant-config', async (req, res) => {
  try {
    const config = require('../config').getConfig();
    
    // Mask the API key for security
    const maskedApiKey = config.qdrantApiKey 
      ? `${config.qdrantApiKey.substring(0, 4)}...${config.qdrantApiKey.substring(config.qdrantApiKey.length - 4)}`
      : null;
    
    res.json({
      url: config.qdrantUrl,
      apiKeyProvided: !!config.qdrantApiKey,
      maskedApiKey,
      collections: config.collections || ['general_file', 'unique_file'],
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/system-test', async (req, res) => {
  try {
    // Test Qdrant health
    const qdrantStatus = await vectorStoreManager.healthCheck();
    
    // Test basic vector retrieval
    const testQuery = "Coffee farming best practices";
    const retrievalResults = await vectorStoreManager.queryCollections(
      ['general_file', 'unique_file'], 
      testQuery, 
      { scoreThreshold: 0.1 }
    );
    
    // Test openAI embedding generation
    const { openai } = require('../services/openai');
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: "Test embedding generation"
    });
    
    res.json({
      status: 'success',
      components: {
        qdrant: qdrantStatus,
        openai: !!embeddingResponse.data,
        vectorRetrieval: {
          found: retrievalResults.length,
          sample: retrievalResults.slice(0, 1)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

async function checkQdrantHealth() {
  try {
    return vectorStoreManager.healthCheck();
  } catch (error) {
    console.error('Error checking Qdrant health:', error);
    return false;
  }
}

router.post('/message', async (req, res) => {
  const {
    user_profile_id,
    farm_id,
    message,
    chatId = null,
    create_new_conversation = false,
    image_url = null
  } = req.body;

  
  if (!user_profile_id) {
    return res.status(400).json({ error: 'User profile ID is required' });
  }

  if (!message && !image_url) {
    return res.status(400).json({ error: 'Message or image URL is required' });
  }

  console.log('🧪 Incoming chat payload:', {
    user_profile_id,
    farm_id,
    message
  });
  try {
    let conversation_id = chatId;
    let isNewConversation = false;

    if (create_new_conversation || !conversation_id) {
      const conversation = await conversationService.createConversation({
        user_profile_id,
        farm_id,
        title: message.length > 30 ? `${message.substring(0, 27)}...` : message
      });

      conversation_id = conversation.chat_id;
      isNewConversation = true;
    }

    await conversationService.storeMessage({
      chatId: conversation_id,
      role: 'user',
      content: message,
      source: 'chat_api',
      imageUrl: image_url,
      metadata: { isNewConversation }
    });

    const history = await conversationService.getConversationHistory(
      conversation_id,
      { formatForOpenAI: true }
    );

    let response;
    if (image_url) {
      response = await chatService.processMessage({
        user_profile_id,
        farm_id,
        message,
        image_url,
        conversation_id
      });

      const structuredData = extractStructuredData(response);
      if (structuredData.hasIssue && farm_id) {
        try {
          const issue = await farmService.storeFarmIssue({
            farm_id_fk: farm_id,
            issue_type: structuredData.issueType,
            diagnosis: structuredData.diagnosis,
            primary_cause: structuredData.primaryCause
          });

          if (issue) {
            await farmService.storeIssueDetail({
              issue_id_fk: issue.issue_id,
              detail_type: 'initial_diagnosis',
              symptoms: structuredData.symptoms,
              recommended_action: structuredData.recommendations,
              image_url
            });

            await conversationService.linkChatWithIssue(conversation_id, issue.issue_id);
          }
        } catch (issueError) {
          console.error('Error storing farm issue:', issueError);
        }
      }
    } else {
      response = await chatService.processMessage({
        user_profile_id,
        farm_id,
        message,
        conversation_id
      });
    }

    await conversationService.storeMessage({
      chatId: conversation_id,
      role: 'assistant',
      content: response.response,
      source: 'chat_api'
    });

    return res.json({
      response: response.response,
      conversation_id,
      isNewConversation
    });
  } catch (error) {
    console.error('Error processing message:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.post('/message/stream', async (req, res) => {
  const {
    user_profile_id,
    farm_id,
    message,
    conversation_id = null,
    create_new_conversation = false,
    image_url = null
  } = req.body;

  if (!user_profile_id) {
    return res.status(400).json({ error: 'User profile ID is required' });
  }

  if (!message && !image_url) {
    return res.status(400).json({ error: 'Message or image URL is required' });
  }

  console.log('🧪 Incoming chat payload (stream):', {
    user_profile_id,
    farm_id,
    message,
    conversation_id
  });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.flushHeaders?.();

  try {
    let activeConversationId = conversation_id;
    let isNewConversation = false;

    if (activeConversationId) {
      const conversationExists = await conversationService.conversationExists(activeConversationId);
      if (!conversationExists) {
        console.log(`Conversation ID ${activeConversationId} not found, creating new conversation`);
        activeConversationId = null;  // Reset to null to create a new conversation
      }
    }

    if (create_new_conversation || !activeConversationId) {
      const conversation = await conversationService.createConversation({
        user_profile_id,
        farm_id,
        title: message.length > 30 ? `${message.substring(0, 27)}...` : message
      });

      activeConversationId = conversation.chat_id;
      isNewConversation = true;

      res.write(`data: ${JSON.stringify({
        type: 'info',
        conversation_id: activeConversationId,
        is_new_conversation: true
      })}\n\n`);

    }

    
    await conversationService.storeMessage({
      chatId: activeConversationId,
      role: 'user',
      content: message,
      source: 'chat_api',
      imageUrl: image_url,
      metadata: { isNewConversation }
    });

    let structuredData = null;
    if (image_url) {
      const response = await chatService.processMessageStreaming({
        user_profile_id,
        farm_id,
        message,
        conversation_id: activeConversationId,
        image_url,
        res
      });

      structuredData = response?.structuredData;

      if (structuredData?.hasIssue && farm_id) {
        try {
          const issue = await farmService.storeFarmIssue({
            farm_id_fk: farm_id,
            issue_type: structuredData.issueType,
            diagnosis: structuredData.diagnosis,
            primary_cause: structuredData.primaryCause
          });

          if (issue) {
            await farmService.storeIssueDetail({
              issue_id_fk: issue.issue_id,
              detail_type: 'initial_diagnosis',
              symptoms: structuredData.symptoms,
              recommended_action: structuredData.recommendations,
              image_url
            });

            await conversationService.linkChatWithIssue(conversation_id, issue.issue_id);

          }
        } catch (issueError) {
          console.error('Error storing farm issue (stream):', issueError);
        }
      }
      await conversationService.storeMessage({
        chatId: activeConversationId,
        role: 'assistant',
        content: message,
        source: 'assistant_api',
        imageUrl: image_url,
        metadata: { isNewConversation }
      });
    } else {
      await chatService.processMessageStreaming({
        user_profile_id,
        farm_id,
        message,
        conversation_id: activeConversationId,
        res
      });

      await conversationService.storeMessage({
        chatId: activeConversationId,
        role: 'system',
        content: message,
        source: 'system',
        metadata: { isNewConversation }
      });
      
    }
  } catch (err) {
    console.error('Error in /message/stream:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});




router.get('/sessions/profile/:userProfileId', async (req, res) => {
  try {
    const user_profile_id = req.params.userProfileId;
    const farmId = req.query.farmId;
    const limit = parseInt(req.query.limit) || 20;

    const sessions = await conversationService.getUserConversations(user_profile_id, {
      farmId,
      limit
    });

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/history/:chatId', async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const limit = parseInt(req.query.limit) || 50;

    const messages = await conversationService.getConversationHistory(chatId, {
      limit
    });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
