// chatSessionService.js - Database interactions for chat sessions
const { supabase } = require('../server');

/**
 * Create a new chat session
 * @param {string} userId - User ID
 * @param {string} farmId - Farm ID
 * @param {string} title - Optional chat title
 * @returns {Promise<string>} - Chat ID
 */
async function createChatSession(user_profile_id, farmId, title = null) {
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_profile_id,
        farm_id: farmId,
        title: title || `Chat ${new Date().toLocaleDateString()}`,
        metadata: {}
      })
      .select();

    if (error) throw error;
    return data[0].chat_id;
  } catch (error) {
    console.error('Error creating chat session:', error);
    throw error;
  }
}


/**
 * Store a message in the database
 * @param {string} chatId - The chat session ID
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 * @param {string} source - 'assistant_api' or 'chat_api'
 * @param {string} imageUrl - Optional URL to an image
 * @returns {Promise<Object>} - Stored message data
 */
async function storeMessage(chatId, role, content, source, imageUrl = null) {
  try {
    const { data, error } = await supabase
      .from('message_history')
      .insert({
        chat_id: chatId,
        role: role,
        content: content,
        source: source,
        image_url: imageUrl,
        timestamp: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    return data[0];
  } catch (error) {
    console.error('Error storing message:', error);
    return null;
  }
}

/**
 * Get conversation history for a chat
 * @param {string} chatId - Chat ID
 * @param {number} limit - Maximum messages to retrieve
 * @returns {Promise<Array>} - Array of messages
 */
async function getChatHistory(chatId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('message_history')
      .select('*')
      .eq('chat_id', chatId)
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    // Format messages for OpenAI-compatible structure
    return data.map(msg => ({
      role: msg.role,
      content: msg.content
    })).reverse(); // Reverse to get chronological order
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return [];
  }
}

/**
 * Get all chat sessions for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - List of chat sessions
 */
async function getUserChatSessions(user_profile_id) {
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select(`
        chat_id,
        title,
        created_at,
        updated_at,
        farm:farm_id (
          farm_id,
          country,
          province,
          municipality,
          city
        )
      `)
      .eq('user_profile_id', user_profile_id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching user chat sessions:', error);
    return [];
  }
}


/**
 * Link a chat with a farm issue
 * @param {string} chatId - Chat ID
 * @param {string} issueId - Issue ID
 * @returns {Promise<boolean>} - Success/failure
 */
async function linkChatWithIssue(chatId, issueId) {
  try {
    // Get current metadata
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('metadata')
      .eq('chat_id', chatId)
      .single();
    
    if (error) throw error;
    
    // Update metadata
    const metadata = data.metadata || {};
    metadata.linked_issue_id = issueId;
    
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ metadata })
      .eq('chat_id', chatId);
    
    if (updateError) throw updateError;
    return true;
  } catch (error) {
    console.error('Error linking chat with issue:', error);
    return false;
  }
}

module.exports = {
  createChatSession,
  storeMessage,
  getChatHistory,
  getUserChatSessions,
  linkChatWithIssue
};