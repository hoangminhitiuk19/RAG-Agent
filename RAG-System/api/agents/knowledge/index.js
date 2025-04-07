const { openai } = require('../../services/openai');
const vectorStoreManager = require("../../services/vectorStoreManager");

/**
 * Knowledge agent responsible for retrieving and generating responses based on RAG
 */
class KnowledgeAgent {
  constructor() {
    this.modelName = "gpt-4o"; // Add the model name property
    this.vectorStoreManager = vectorStoreManager;
  }

  /**
   * Generate a streaming response using a pre-built system prompt
   */
  async generateResponseWithPrompt({ message, systemPrompt, stream = false }) {
    try {
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ];
      
      const response = await openai.chat.completions.create({
        model: this.modelName,
        messages: messages,
        temperature: 0.3,
        stream: stream
      });
      
      return response;
    } catch (error) {
      console.error("Error generating response with prompt:", error);
      throw error;
    }
  }
  /**
   * Generate a response using RAG
   * @param {Object} options - Options for response generation
   * @returns {Object|Stream} - Response or stream
   */
  async generateResponse({
    message,
    conversationHistory = [],
    conversationState = null, // New parameter
    contextSummary = null,    // New parameter
    retrievalResults = [],
    farmContext = null,
    weatherData = null,
    imageAnalysisResult = null,
    functionResults = {},
    agricultureAnalysis = null,
    stream = false
  }) {
    try {
      // Create messages array for OpenAI
      const messages = [
        {
          role: "system",
          content: this.buildSystemPrompt(farmContext, weatherData)
        }
      ];
      
      // Add context from retrieved documents if available
      if (retrievalResults && retrievalResults.length > 0) {
        const contextText = retrievalResults
          .map(doc => doc.content || doc.text || '')
          .filter(text => text.trim().length > 0)
          .join("\n\n");
          
        if (contextText.trim().length > 0) {
          messages.push({
            role: "system",
            content: `Relevant information:\n${contextText}`
          });
        }
      }
      
      // Add conversation context summary if available (NEW)
      if (conversationState && conversationState.state === 'CONTINUATION' && 
          contextSummary && contextSummary.summary) {
        messages.push({
          role: "system",
          content: `Previous conversation context: ${contextSummary.summary}`
        });
        
        // Add key entities if available
        if (contextSummary.entities && contextSummary.entities.length > 0) {
          messages.push({
            role: "system",
            content: `Key entities from previous conversation: ${contextSummary.entities.join(', ')}`
          });
        }
      }
      
      // Add image analysis if available
      if (imageAnalysisResult) {
        messages.push({
          role: "system",
          content: `Image analysis: ${imageAnalysisResult.analysis}`
        });
      }
      
      // Add conversation history
      if (conversationHistory && conversationHistory.length > 0) {
        // Add up to 5 most recent messages for context
        const recentHistory = conversationHistory.slice(-5);
        recentHistory.forEach(msg => {
          if (msg.role && msg.content) {
            messages.push({
              role: msg.role,
              content: msg.content
            });
          }
        });
      }
      
      // Add the current user message
      messages.push({
        role: "user",
        content: message
      });
      
      // Call OpenAI with or without streaming
      if (stream) {
        return openai.chat.completions.create({
          model: this.modelName,
          messages: messages,
          stream: true
        });
      } else {
        const response = await openai.chat.completions.create({
          model: this.modelName, 
          messages: messages
        });
        
        return response.choices[0].message.content;
      }
      
    } catch (error) {
      console.error("Error generating RAG response:", error);
      throw error;
    }
  }
  
  /**
   * Extract and format sources from retrieval results
   * @private
   */
  _extractSourcesFromResults(retrievalResults) {
    if (!retrievalResults || retrievalResults.length === 0) {
      return [];
    }
    
    // Extract unique sources with their texts
    const sourceMap = new Map();
    
    for (const result of retrievalResults) {
      const source = result.metadata.source;
      if (source && source !== 'unknown') {
        if (!sourceMap.has(source)) {
          sourceMap.set(source, result.content.substring(0, 100) + '...');
        }
      }
    }
    
    // Convert map to array of source objects
    return Array.from(sourceMap.entries()).map(([source, text]) => ({
      source,
      text
    }));
  }
  
  /**
   * Build system prompt with context
   * @param {Object} farmContext - Farm context data
   * @param {Object} weatherData - Weather data
   * @returns {string} - System prompt
   */
  buildSystemPrompt(farmContext, weatherData, agricultureAnalysis) {
    let prompt = `You are an agricultural assistant specializing in coffee farming. 
                Provide practical advice and solutions for coffee farmers based on their specific context and needs.
                Focus on sustainable practices, disease prevention, and yield optimization.`;

    // Add farm context if available
    if (farmContext) {
      prompt += `\n\nFarm information:`;
      
      if (farmContext.location) {
        prompt += `\nLocation: ${farmContext.city || farmContext.municipality || farmContext.location}`;
      }
      
      if (farmContext.crops && farmContext.crops.length > 0) {
        prompt += `\nCrops: ${farmContext.crops.map(c => `${c.name} (${c.age || 'unknown'} years old)`).join(', ')}`;
      }
      
      if (farmContext.size) {
        prompt += `\nFarm size: ${farmContext.size} hectares`;
      }
    }
    
    // Add weather context if available
    if (weatherData) {
      prompt += `\n\nCurrent weather conditions:
                    Temperature: ${weatherData.temperature}°C
                    Humidity: ${weatherData.humidity}%
                    Condition: ${weatherData.condition}
                    Wind speed: ${weatherData.wind?.speed || 'unknown'} m/s`;
    }

    if (agricultureAnalysis) {
      prompt += `\n\nTopic Analysis:`;
      prompt += `\nPrimary Topic: ${agricultureAnalysis.primaryTopic}`;
      
      if (agricultureAnalysis.detectedCrops && agricultureAnalysis.detectedCrops.length > 0) {
        prompt += `\nDetected Crops: ${agricultureAnalysis.detectedCrops.map(crop => 
          `${crop.name} (${crop.taxonomy || 'no taxonomy'})`).join(', ')}`;
      }
      
      if (agricultureAnalysis.conditions && agricultureAnalysis.conditions.length > 0) {
        prompt += `\nMentioned Conditions: ${agricultureAnalysis.conditions.join(', ')}`;
      }
    }
    
    prompt += `\n\nREQUIREMENTS:
              1. Provide specific, actionable advice tailored to the farmer's context
              2. When discussing plant health issues, include symptoms, causes, prevention, and treatment
              3. Consider local weather conditions in your recommendations
              4. Explain concepts in simple language but include technical terms where appropriate
              5. Always recommend sustainable practices and integrated pest management when possible
              6. Format your response in clear sections using markdown`;

    return prompt;
  }
  
  /**
   * Format retrieval results into a readable context
   * @private
   */
  _formatRetrievalContext(retrievalResults) {
    if (!retrievalResults || retrievalResults.length === 0) {
      return "No relevant information found.";
    }
    
    return retrievalResults
      .map((doc, i) => {
        const source = doc.metadata.source || 'Unknown source';
        return `[${i+1}] From ${source}:\n${doc.content}\n`;
      })
      .join('\n');
  }
  
  /**
   * Get system prompt for the knowledge agent
   * @private
   */
  _getSystemPrompt() {
    return `You are an agricultural assistant specialized in helping farmers with their crops, particularly coffee. 
            Your goal is to provide accurate, helpful information based on agricultural best practices.

            When responding to user questions:
            1. Base your answers on the retrieved agricultural information provided
            2. If specific farm context is provided, tailor your advice to that farm's situation
            3. When plant diseases are discussed, provide accurate identification and treatment options
            4. If weather information is available, incorporate it into your advice
            5. Always be honest about what you know and don't know
            6. Cite your sources when providing specific information
            7. Avoid generic advice when specific information is available
            8. If you need more information to give good advice, ask clarifying questions
            9. When images are provided with analysis, reference the analysis in your response

            All advice should be practical, sustainable, and consider the farmer's context.`;
  }
  
  /**
   * Get function definitions for optional function calling
   * @private
   */
  _getFunctionDefinitions() {
    return [
      {
        name: "logFarmIssue",
        description: "Log a detected plant health issue or pest problem for tracking",
        parameters: {
          type: "object",
          properties: {
            issueType: {
              type: "string",
              description: "Type of issue detected (e.g., 'disease', 'pest', 'nutrient deficiency')"
            },
            issueName: {
              type: "string",
              description: "Name of the specific issue (e.g., 'coffee leaf rust', 'coffee berry borer')"
            },
            severity: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
              description: "Severity of the issue"
            },
            description: {
              type: "string",
              description: "Detailed description of the issue"
            },
            recommendedActions: {
              type: "array",
              items: { type: "string" },
              description: "List of recommended actions to address the issue"
            }
          },
          required: ["issueType", "issueName", "severity", "description"]
        }
      },
      {
        name: "logFertilizerApplication",
        description: "Record a farmer's fertilizer application",
        parameters: {
          type: "object",
          properties: {
            fertilizerName: {
              type: "string",
              description: "Name of the fertilizer used"
            },
            npkRatio: {
              type: "string",
              description: "NPK ratio of the fertilizer (e.g., '10-5-5')"
            },
            applicationDate: {
              type: "string",
              description: "Date of application (YYYY-MM-DD)"
            },
            applicationAmount: {
              type: "number",
              description: "Amount of fertilizer applied in kg"
            },
            applicationArea: {
              type: "number", 
              description: "Area fertilized in square meters"
            },
            notes: {
              type: "string",
              description: "Any additional notes about the application"
            }
          },
          required: ["fertilizerName", "applicationDate", "applicationAmount"]
        }
      }
    ];
  }
}

module.exports = { KnowledgeAgent };