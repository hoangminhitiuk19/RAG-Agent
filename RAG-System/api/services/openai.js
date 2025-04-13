const { OpenAI } = require("openai");
const { getConfig } = require('../config');


const NodeCache = require('node-cache');
const openaiCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

/**
 * Factory function to create OpenAI client instance
 */
function createOpenAI() {
  const config = getConfig();
  let rawKey = config.openaiApiKey;

  if (typeof rawKey !== 'string') {
    throw new Error('❌ OpenAI API key is not a string');
  }

  const sanitizedKey = rawKey
    .replace(/[\r\n\t\s\u200B-\u200D\uFEFF]/g, ''); // removes newline, tabs, spaces, zero-width

  if (!sanitizedKey.startsWith('sk-')) {
    throw new Error(`❌ Invalid OpenAI API key: ${sanitizedKey}`);
  }

  console.log(`✅ OpenAI key sanitized: ${sanitizedKey.slice(0, 8)}...`);

  return new OpenAI({
    apiKey: sanitizedKey
  });
}

// Create a singleton instance
const openaiInstance = createOpenAI();

module.exports = {
  // Export the singleton instance
  openai: openaiInstance,
  
  // Keep the factory for testing or specialized needs
  createOpenAI,
  
  /**
   * Get chat completion from OpenAI
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Options for the completion
   * @returns {Object} - OpenAI completion response
   */
  // Update getChatCompletion method
  async getChatCompletion(messages, options = {}) {
    try {
      // Generate a cache key
      const cacheKey = JSON.stringify({
        messages: messages.map(m => ({ role: m.role, content: m.content.substring(0, 100) })),
        model: options.model || getConfig().openaiModel,
        temperature: options.temperature || 0.7
      });
      
      // Check cache
      const cachedResponse = openaiCache.get(cacheKey);
      if (cachedResponse) {
        console.log("Using cached OpenAI response");
        return cachedResponse;
      }
      
      const defaultOptions = {
        model: getConfig().openaiModel,
        temperature: 0.3,
        top_p: 0.9,
        max_tokens: 1500
      };
      
      const completionOptions = { ...defaultOptions, ...options, messages };
      
      const response = await openaiInstance.chat.completions.create(completionOptions);
      
      // Cache the response
      openaiCache.set(cacheKey, response);
      
      return response;
    } catch (error) {
      console.error(`OpenAI error: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Stream chat completion from OpenAI
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Options for the completion
   * @returns {ReadableStream} - Stream of completion chunks
   */
  async streamChatCompletion(messages, options = {}) {
    try {
      const defaultOptions = {
        model: getConfig().openaiModel,
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1500,
        stream: true
      };
      
      const completionOptions = { ...defaultOptions, ...options, messages };
      
      return await openaiInstance.chat.completions.create(completionOptions);
    } catch (error) {
      console.error(`OpenAI streaming error: ${error.message}`);
      throw error;
    }
  },

  /**
   * Process image with OpenAI Assistant
   * @param {string} imageUrl - URL of the image to process
   * @param {string} query - User query about the image
   * @returns {Object} - Analysis results
   */
  async processImageWithAssistant(imageUrl, query) {
    try {
      const config = getConfig();
      
      // Create a thread
      const thread = await openaiInstance.beta.threads.create();
      
      // Add a message to the thread with the image
      await openaiInstance.beta.threads.messages.create(thread.id, {
        role: "user",
        content: [
          { type: "text", text: query },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      });
      
      // Run the assistant on the thread
      const run = await openaiInstance.beta.threads.runs.create(thread.id, {
        assistant_id: config.openaiAssistantId
      });
      
      // Poll for the completion
      let runStatus = await openaiInstance.beta.threads.runs.retrieve(thread.id, run.id);
      
      while (runStatus.status !== "completed") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openaiInstance.beta.threads.runs.retrieve(thread.id, run.id);
        
        if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
          throw new Error(`Assistant run ${runStatus.status}: ${runStatus.last_error?.message || "Unknown error"}`);
        }
      }
      
      // Get the messages from the thread
      const messages = await openaiInstance.beta.threads.messages.list(thread.id);
      
      // Return the assistant's response
      const assistantMessages = messages.data.filter(msg => msg.role === "assistant");
      
      if (assistantMessages.length > 0) {
        // Extract just the text content from the message
        const textContents = assistantMessages[0].content
          .filter(content => content.type === "text")
          .map(content => content.text.value);
          
        return { 
          analysis: textContents.join("\n"),
          threadId: thread.id
        };
      } else {
        return { 
          analysis: "No response received from assistant",
          threadId: thread.id
        };
      }
    } catch (error) {
      console.error(`Error processing image: ${error.message}`);
      return { 
        analysis: `Error analyzing image: ${error.message}`,
        error: true
      };
    }
  }
};