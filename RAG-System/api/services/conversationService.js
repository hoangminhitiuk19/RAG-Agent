const { supabase } = require('../config/db');
const { openai } = require('./openai');

/**
 * Manages conversations, consolidating functionality from chatService and chatRoutes
 */
class ConversationService {
  constructor() {
    // Cache for thread IDs to avoid redundant API calls
    this.threadCache = {};
    
    // Validate supabase connection
    if (!supabase || !supabase.from) {
      console.error('Supabase client not properly initialized in ConversationService');
    } else {
      console.log('Supabase client available in ConversationService');
    }
  }
  
    /**
     * Get or create an OpenAI thread for a conversation
     * @param {string} conversationId - Existing conversation ID
     * @returns {Promise<string>} - Thread ID
     */
    async getOrCreateThread(conversationId) {
      try {
        // Check cache first
        if (this.threadCache[conversationId]) {
          return this.threadCache[conversationId];
        }
  
        if (conversationId) {
          try {
            // Try to retrieve existing thread from OpenAI
            await openai.beta.threads.retrieve(conversationId);
            
            // Store in cache and return
            this.threadCache[conversationId] = conversationId;
            return conversationId;
          } catch (retrieveError) {
            console.log('Could not retrieve thread, creating new one:', retrieveError.message);
            // Fall through to create new thread
          }
        }
        
        // Create a new thread
        const thread = await openai.beta.threads.create();
        const threadId = thread.id;
        
        // If we have a conversation ID, update the metadata
        if (conversationId) {
          try {
            const { data: chatSession } = await supabase
              .from('chat_sessions')
              .select('metadata')
              .eq('chat_id', conversationId)
              .single();
            
            if (chatSession) {
              // Update metadata with new thread ID
              const metadata = chatSession.metadata || {};
              metadata.openai_thread_id = threadId;
              
              await supabase
                .from('chat_sessions')
                .update({ metadata })
                .eq('chat_id', conversationId);
            }
          } catch (dbError) {
            console.error('Error updating conversation metadata:', dbError);
            // Non-fatal error, continue
          }
        }
        
        // Store in cache and return
        this.threadCache[conversationId] = threadId;
        return threadId;
      } catch (error) {
        console.error('Error in getOrCreateThread:', error);
        const thread = await openai.beta.threads.create();
        return thread.id;
      }
    }
  
    /**
     * Get thread history for a conversation
     * @param {string} threadId - Thread ID
     * @param {Object} options - Options like limit, order
     * @returns {Promise<Array>} - Messages
     */
    async getThreadHistory(threadId, options = {}) {
      if (!threadId) return [];
      
      const { limit = 5, formatForLLM = true } = options;
      
      try {
        const threadMessages = await openai.beta.threads.messages.list(threadId);
        
        if (threadMessages && threadMessages.data) {
          // Process messages according to options
          let messages = threadMessages.data
            .slice(0, limit);
            
          if (formatForLLM) {
            messages = messages.map(msg => ({
              role: msg.role,
              content: msg.content[0].text.value
            }));
          }
          
          return messages.reverse();
        }
      } catch (historyError) {
        console.log('Could not retrieve thread history:', historyError.message);
      }
      
      return [];
    }
  
    /**
     * Store a message in an OpenAI thread
     * @param {string} threadId - Thread ID
     * @param {string} content - Message content
     * @param {string} role - Message role (user/assistant)
     * @param {string} imageUrl - Optional image URL for user messages
     * @returns {Promise<Object>} - Created message
     */
    async storeMessageInThread(threadId, content, role, imageUrl = null) {
      if (!threadId || !content) return null;
      
      try {
        if (imageUrl && role === 'user') {
          // Create message with image
          const messageContent = [
            { type: 'text', text: content },
            { type: 'image_url', image_url: { url: imageUrl } }
          ];
          
          return await openai.beta.threads.messages.create(threadId, {
            role,
            content: messageContent
          });
        } else {
          // Create text-only message
          return await openai.beta.threads.messages.create(threadId, {
            role,
            content
          });
        }
      } catch (storeError) {
        console.log('Could not store message in thread:', storeError.message);
        return null;
      }
    }
  
  /**
 * Create a new conversation
 * @param {Object} params - Parameters 
 * @returns {Object} - Created conversation data
 */
  async createConversation({ user_profile_id, farm_id = null, title = null }) {
    const conversation = {
      user_profile_id,
      farm_id,
      title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert(conversation)
      .select()
      .single();
      
    if (error) {
      console.error('Error inserting chat session:', error);
      throw new Error(`Database error: ${error.message}`);
    }
  
    return data;
  }
  
  
  
  /**
   * Get an existing conversation or create a new one
   * @param {string} chatId - Optional existing chat ID
   * @param {Object} params - Parameters for creating a new conversation if needed
   * @returns {Object} - Conversation data
   */
  async getOrCreateConversation(chatId = null, params = {}) {
    // If chat ID provided, get that conversation
    if (chatId) {
      try {
        const { data, error } = await supabase
          .from('chat_sessions')
          .select('*, metadata')
          .eq('chat_id', chatId)
          .single();
        
        if (error) throw error;
        
        // Check if we need to create an OpenAI thread
        let threadId = data.metadata?.openai_thread_id;
        if (!threadId) {
          // Create OpenAI thread if missing
          const thread = await openai.beta.threads.create();
          threadId = thread.id;
          
          // Update metadata
          await supabase
            .from('chat_sessions')
            .update({ 
              metadata: { ...data.metadata, openai_thread_id: threadId }
            })
            .eq('chat_id', chatId);
        }
        
        return {
          chatId: data.chat_id,
          threadId: threadId,
          title: data.title,
          isNew: false
        };
      } catch (error) {
        console.error('Error fetching conversation:', error);
        // If error, create a new conversation
        return this.createConversation(params);
      }
    }
    
    // No chat ID provided, create new conversation
    return this.createConversation(params);
  }
  
  /**
   * Store a message in the conversation history
   * @param {Object} params - Message parameters
   * @returns {Object} - Stored message data
   */
  async storeMessage(params) {
    const { 
      chatId, 
      role, 
      content, 
      source = 'chat_api',
      imageUrl = null,
      metadata = {} 
    } = params;
    
    try {
      // Store in database
      const { data, error } = await supabase
        .from('message_history')
        .insert({
          chat_id: chatId,
          role: role,
          content: content,
          source: source,
          image_url: imageUrl,
          metadata: metadata
        })
        .select();
      
      if (error) throw error;
      
      // Update chat session's updated_at
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('chat_id', chatId);
      
      // Get OpenAI thread ID from chat metadata
      const { data: chatData } = await supabase
        .from('chat_sessions')
        .select('metadata')
        .eq('chat_id', chatId)
        .single();
      
      const threadId = chatData?.metadata?.openai_thread_id;
      
      // If we have a thread ID, also store in OpenAI thread
      if (threadId) {
        try {
          if (imageUrl && role === 'user') {
            // Create message with image in OpenAI thread
            await openai.beta.threads.messages.create(threadId, {
              role: role,
              content: [
                { type: 'text', text: content },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]
            });
          } else {
            // Create text-only message in OpenAI thread
            await openai.beta.threads.messages.create(threadId, {
              role: role,
              content: content
            });
          }
        } catch (openaiError) {
          console.error('Error storing message in OpenAI thread:', openaiError);
          // Non-fatal error, continue
        }
      }
      
      return data[0];
    } catch (error) {
      console.error('Error storing message:', error);
      throw error;
    }
  }
  
  /**
   * Get conversation history
   * @param {string} chatId - Chat ID
   * @param {Object} options - Query options
   * @returns {Array} - Conversation messages
   */
  async getConversationHistory(chatId, options = {}) {
    const { limit = 20, formatForOpenAI = false } = options;
    
    try {
      const { data, error } = await supabase
        .from('message_history')
        .select('*')
        .eq('chat_id', chatId)
        .order('timestamp', { ascending: true })
        .limit(limit);
      
      if (error) throw error;
      
      if (formatForOpenAI) {
        // Format for OpenAI chat completions
        return data.map(msg => ({
          role: msg.role,
          content: msg.content
        }));
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching conversation history:', error);
      return [];
    }
  }
  
  /**
   * Get all conversations for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Array} - Conversations
   */
  async getUserConversations(user_profile_id, options = {}) {
    const { farmId = null, limit = 20 } = options;
  
    try {
      let query = supabase
        .from('chat_sessions')
        .select(`
          chat_id,
          title,
          created_at,
          updated_at,
          metadata,
          farm:farm_id (
            farm_id,
            country,
            province,
            municipality,
            city
          )
        `)
        .eq('user_profile_id', user_profile_id)
        .order('updated_at', { ascending: false })
        .limit(limit);
  
      if (farmId) {
        query = query.eq('farm_id', farmId);
      }
  
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching user conversations:', error);
      return [];
    }
  }
  
    /**
   * Link a chat with a farm issue
   * @param {string} chatId - Chat ID
   * @param {string} issueId - Issue ID
   * @returns {Promise<boolean>} - Success/failure
   */
    async linkChatWithIssue(chatId, issueId) {
        try {
          // Get current chat metadata
          const { data, error } = await supabase
            .from('chat_sessions')
            .select('metadata')
            .eq('chat_id', chatId)
            .single();
          
          if (error) throw error;
          
          // Update metadata with issue ID
          const metadata = data.metadata || {};
          metadata.linked_issue_id = issueId;
          
          await supabase
            .from('chat_sessions')
            .update({ metadata })
            .eq('chat_id', chatId);
            
          console.log(`Linked chat ${chatId} with issue ${issueId}`);
          return true;
        } catch (error) {
          console.error('Error linking chat with issue:', error);
          return false;
        }
      }
      /**
     * Process image with OpenAI Assistant and return diagnosis
     * This creates a temporary thread used only for image analysis
     * @param {string} imageUrl - URL of the image to analyze
     * @param {string} query - Optional context or query about the image
     * @returns {Object} - Diagnosis result
     */
    async analyzeImageWithAssistant(imageUrl, query = 'Identify any pests or diseases in this plant image.') {
        try {
        // Create a new temporary thread just for this analysis
        const thread = await openai.beta.threads.create();
        
        // Add message with image
        await this.storeMessageInThread(thread.id, query, 'user', imageUrl);
        
        // Run assistant and wait for completion
        const run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: getConfig().openaiAssistantId
        });
        
        // Poll for completion
        const runResult = await this._waitForRunCompletion(thread.id, run.id);
        
        if (runResult.status !== 'completed') {
            throw new Error(`Assistant run failed: ${runResult.status}`);
        }
        
        // Get assistant's response
        const messages = await openai.beta.threads.messages.list(thread.id);
        const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
        
        if (assistantMessages.length === 0) {
            return { diagnosis: 'No diagnosis available', confidence: 0 };
        }
        
        // Extract just the text content from the message
        const textContent = assistantMessages[0].content
            .filter(content => content.type === 'text')
            .map(content => content.text.value)
            .join('\n');
            
        // Parse the diagnosis (assuming the assistant returns structured info)
        let diagnosis = textContent;
        let confidence = 'unknown';
        
        try {
            // Try to extract structured data if available
            const match = textContent.match(/Diagnosis:\s*([^,\n]+)(?:,|\n).*Confidence:\s*(\d+)%/i);
            if (match) {
            diagnosis = match[1].trim();
            confidence = parseInt(match[2]);
            }
        } catch (parseError) {
            console.log('Could not parse structured diagnosis, using raw text');
        }
        
        return { 
            diagnosis, 
            confidence,
            rawText: textContent,
            threadId: thread.id  // Return the thread ID in case needed for reference
        };
        } catch (error) {
        console.error('Error analyzing image:', error);
        return { 
            diagnosis: 'Error analyzing image', 
            confidence: 0,
            error: error.message
        };
        }
    }
    /**
     * Wait for an assistant run to complete
     * @private
     */
    async _waitForRunCompletion(threadId, runId, maxAttempts = 30, delayMs = 1000) {
        let attempts = 0;
        
        while (attempts < maxAttempts) {
        const runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
        
        if (['completed', 'failed', 'cancelled', 'expired'].includes(runStatus.status)) {
            return runStatus;
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, delayMs));
        attempts++;
        }
        
        throw new Error('Run timed out');
    }
      /**
       * Clear thread cache
       * @param {string} conversationId - Optional specific conversation to clear
       */
      clearThreadCache(conversationId = null) {
        if (conversationId) {
          delete this.threadCache[conversationId];
        } else {
          this.threadCache = {};
        }
      }
}


module.exports = new ConversationService();