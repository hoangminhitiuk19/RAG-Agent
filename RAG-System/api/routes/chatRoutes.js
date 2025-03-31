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

async function checkQdrantHealth() {
  try {
    return await vectorStoreManager.healthCheck();
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

  console.log('🧪 Incoming chat payload (stream):', {
    user_profile_id,
    farm_id,
    message
  });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.flushHeaders?.();

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

    let structuredData = null;
    if (image_url) {
      const response = await chatService.processMessageStreaming({
        user_profile_id,
        farm_id,
        message,
        conversation_id,
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
    } else {
      await chatService.processMessageStreaming({
        user_profile_id,
        farm_id,
        message,
        conversation_id,
        res
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
