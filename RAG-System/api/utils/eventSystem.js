/**
 * Simple pub/sub event system
 */
class EventSystem {
    constructor() {
      this.subscribers = {};
    }
    
    /**
     * Subscribe to an event
     */
    subscribe(eventName, callback) {
      if (!this.subscribers[eventName]) {
        this.subscribers[eventName] = [];
      }
      
      const index = this.subscribers[eventName].push(callback) - 1;
      
      // Return unsubscribe function
      return () => {
        this.subscribers[eventName].splice(index, 1);
      };
    }
    
    /**
     * Publish an event
     */
    async publish(eventName, data) {
      if (!this.subscribers[eventName]) return;
      
      console.log(`Event published: ${eventName}`);
      
      // Execute all subscribers asynchronously
      await Promise.all(
        this.subscribers[eventName].map(callback => 
          callback(data).catch(error => 
            console.error(`Error in event subscriber for ${eventName}:`, error)
          )
        )
      );
    }
  }
  
  // Create singleton instance
  const eventSystem = new EventSystem();
  
  // Register standard events
  const EVENTS = {
    ISSUE_DETECTED: 'issue_detected',
    DATA_COLLECTED: 'data_collected',
    FARM_CONTEXT_UPDATED: 'farm_context_updated',
    CONVERSATION_STARTED: 'conversation_started',
    CONVERSATION_ENDED: 'conversation_ended'
  };
  
  module.exports = { eventSystem, EVENTS };