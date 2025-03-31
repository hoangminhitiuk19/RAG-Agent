const { supabase } = require('../server');
const { conversationService } = require('./conversationService');

/**
 * Memory manager that maintains conversation context at different levels
 */
class MemoryManager {
  constructor() {
    // Cache for active conversations
    this.shortTermMemory = new Map();
    // Topic tracking for medium-term memory
    this.mediumTermMemory = new Map();
  }
  
  /**
   * Store short-term memory (current conversation turns)
   */
  async storeShortTermMemory(chatId, message, role) {
    // Store in cache
    if (!this.shortTermMemory.has(chatId)) {
      this.shortTermMemory.set(chatId, []);
    }
    
    this.shortTermMemory.get(chatId).push({ role, content: message });
    
    // Keep only last 10 messages in short term memory
    if (this.shortTermMemory.get(chatId).length > 10) {
      this.shortTermMemory.get(chatId).shift();
    }
    
    // Also persist to database
    await conversationService.storeMessage({
      chatId,
      role,
      content: message,
      source: 'chat_api'
    });
  }
  
  /**
   * Store medium-term memory (session context)
   */
  async storeMediumTermContext(chatId, context) {
    this.mediumTermMemory.set(chatId, {
      ...this.mediumTermMemory.get(chatId),
      ...context,
      updated: Date.now()
    });
    
    // Update chat metadata
    await supabase
      .from('chat_sessions')
      .update({
        metadata: {
          ...this.mediumTermMemory.get(chatId)
        }
      })
      .eq('chat_id', chatId);
  }
  
  /**
   * Get complete conversation context
   */
  async getConversationContext(chatId) {
    // Get short-term memory
    const shortTerm = this.shortTermMemory.get(chatId) || [];
    
    // Get medium-term memory
    const mediumTerm = this.mediumTermMemory.get(chatId) || {};
    
    // Get long-term memory (farm historical data)
    const { data: chatSession } = await supabase
      .from('chat_sessions')
      .select('farm_id')
      .eq('chat_id', chatId)
      .single();
    
    let longTermMemory = {};
    if (chatSession?.farm_id) {
      // Get farm historical data
      longTermMemory = await this.getLongTermMemory(chatSession.farm_id);
    }
    
    return {
      shortTerm,
      mediumTerm,
      longTerm: longTermMemory
    };
  }
  
  /**
   * Get long-term memory (farm data, issue history, etc.)
   */
  async getLongTermMemory(farmId) {
    // Get farm issues
    const { data: issues } = await supabase
      .from('farm_issue_history')
      .select(`
        issue_id,
        issue_type,
        diagnosis,
        primary_cause,
        status,
        reported_at,
        farm_issue_history_detail (*)
      `)
      .eq('farm_id_fk', farmId)
      .order('reported_at', { ascending: false });
    
    return {
      farmId,
      issues: issues || []
    };
  }
}

module.exports = new MemoryManager();