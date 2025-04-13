const { openai } = require('./openai');

/**
 * Service for constructing specialized prompts based on intent
 * and integrating retrieved knowledge in an optimal way
 */
class PromptBuilder {
  /**
   * Build a specialized prompt based on user intent
   * @param {Object} params - Parameters for prompt construction
   * @returns {Promise<Object>} - Generated prompt and related metadata
   */
  async buildPrompt(params) {
    const {
      message,
      conversationHistory,
      conversationState,
      contextSummary,
      retrievalResults,
      intentClassification,
      agricultureAnalysis,
      queryAugmentation,
      farmContext = null,
      imageAnalysisResult = null,
      functionResults = null
    } = params;

    // Select appropriate prompt strategy based on intent
    const intentStrategy = this.getIntentStrategy(intentClassification.intent);
    
    // Build the prompt using the selected strategy
    return intentStrategy({
      message,
      conversationHistory,
      conversationState,
      contextSummary,
      retrievalResults,
      intentClassification,
      agricultureAnalysis,
      queryAugmentation,
      farmContext,
      imageAnalysisResult,
      functionResults
    });
  }

  /**
   * Get the appropriate prompt strategy for the intent
   * @private
   */
  getIntentStrategy(intent) {
    const strategies = {
      'ASK_FACTUAL_INFO': this.buildFactualInfoPrompt.bind(this),
      'ASK_RECOMMENDATIONS': this.buildRecommendationPrompt.bind(this),
      'TROUBLESHOOTING': this.buildTroubleshootingPrompt.bind(this),
      'PEST_DISEASE_IDENTIFICATION': this.buildPestDiseasePrompt.bind(this),
      'MARKET_PRICING': this.buildMarketPricingPrompt.bind(this),
      'MULTI_INTENT': this.buildMultiIntentPrompt.bind(this)
    };
    
    return strategies[intent] || this.buildDefaultPrompt.bind(this);
  }

  /**
   * Format retrieved documents for inclusion in the prompt
   * @private
   */
  formatRetrievedDocuments(retrievedDocs, maxTokens = 3000) {
    if (!retrievedDocs || retrievedDocs.length === 0) {
      return "No relevant information found.";
    }
    
    let formattedDocs = retrievedDocs.map((doc, index) => {
      const source = doc.metadata?.source || doc.metadata?.title || `Document ${index + 1}`;
      const content = doc.pageContent || doc.content || "Content not available";
      
      return `Source: ${source}\nRelevance: ${doc.finalScore.toFixed(2)}\n${content}\n`;
    }).join("\n---\n");
    
    // TODO: Add token counting and truncation to stay within maxTokens
    
    return formattedDocs;
  }

  /**
   * Build prompt for factual information requests
   * @private
   */
  async buildFactualInfoPrompt(params) {
    const {
      message,
      conversationHistory,
      contextSummary,
      retrievalResults,
      agricultureAnalysis,
      queryAugmentation
    } = params;
    
    const retrievedContent = this.formatRetrievedDocuments(retrievalResults);
    
    // Context from previous conversation
    const conversationContext = contextSummary?.summary || "This is a new conversation.";
    
    // Agricultural context
    let agricultureContext = "";
    if (agricultureAnalysis) {
      const crops = agricultureAnalysis.detectedCrops.map(crop => 
        `${crop.name} (${crop.taxonomy || 'No taxonomy'})`).join(', ');
      
      agricultureContext = `
Topic: ${agricultureAnalysis.primaryTopic || 'General agriculture'}
Crops: ${crops || 'None specifically mentioned'}
Conditions: ${agricultureAnalysis.conditions.join(', ') || 'None specifically mentioned'}
      `;
    }
    
    const systemPrompt = `
You are an expert agricultural assistant specializing in regenerative farming. 
Your task is to provide accurate factual information based on the retrieved content.

Guidelines:
1. Focus on providing accurate, factual information directly from the sources
2. Cite your sources using [Source X] notation
3. If the information from different sources conflicts, acknowledge this and explain the different viewpoints
4. If the retrieved information doesn't fully answer the question, acknowledge the limitations
5. Avoid speculation beyond what's in the sources
6. Use technical terminology appropriately given the user's level of expertise
7. Structure your response logically with clear sections if the answer is complex
8. Include relevant numerical data, measurements, or statistics from the sources when available

Conversation Context:
${conversationContext}

Agricultural Context:
${agricultureContext}

User Query: "${message}"
Augmented Query: "${queryAugmentation?.augmentedQuery || message}"

RETRIEVED INFORMATION:
${retrievedContent}
`;

    const prompt = {
      system: systemPrompt,
      intentType: 'ASK_FACTUAL_INFO',
      retrievedSources: retrievalResults?.length || 0,
      contextIncluded: !!contextSummary,
      agricultureAnalysisIncluded: !!agricultureAnalysis
    };
    
    return prompt;
  }

  /**
   * Build prompt for recommendation requests
   * @private
   */
  async buildRecommendationPrompt(params) {
    const {
      message,
      contextSummary,
      retrievalResults,
      agricultureAnalysis,
      farmContext
    } = params;
    
    const retrievedContent = this.formatRetrievedDocuments(retrievalResults);
    
    // Context from previous conversation
    const conversationContext = contextSummary?.summary || "This is a new conversation.";
    
    // Farm context if available
    let farmContextString = "No farm information available.";
    if (farmContext) {
      farmContextString = `
Farm Location: ${farmContext.location || 'Unknown'}
Climate: ${farmContext.climate || 'Unknown'}
Farm Size: ${farmContext.size || 'Unknown'}
Current Crops: ${farmContext.crops?.join(', ') || 'Unknown'}
Soil Type: ${farmContext.soilType || 'Unknown'}
      `;
    }
    
    // Agricultural context
    let agricultureContext = "";
    if (agricultureAnalysis) {
      const crops = agricultureAnalysis.detectedCrops.map(crop => 
        `${crop.name} (${crop.taxonomy || 'No taxonomy'})`).join(', ');
      
      agricultureContext = `
Topic: ${agricultureAnalysis.primaryTopic || 'General agriculture'}
Crops: ${crops || 'None specifically mentioned'}
Conditions: ${agricultureAnalysis.conditions.join(', ') || 'None specifically mentioned'}
      `;
    }
    
    const systemPrompt = `
You are an expert agricultural advisor specializing in regenerative farming. 
Your task is to provide personalized recommendations based on the user's context and the retrieved content.

Guidelines:
1. Provide actionable recommendations tailored to the user's specific situation
2. Consider the farm context, agricultural context, and conversation history
3. Clearly explain the reasoning behind each recommendation
4. Prioritize recommendations by importance or urgency
5. Include implementation steps when relevant
6. Cite sources for recommendations using [Source X] notation
7. Consider both traditional and innovative approaches where appropriate
8. Acknowledge limitations or risks associated with your recommendations
9. If alternative approaches exist, briefly mention them

Conversation Context:
${conversationContext}

Farm Context:
${farmContextString}

Agricultural Context:
${agricultureContext}

User Query: "${message}"

RETRIEVED INFORMATION:
${retrievedContent}
`;

    const prompt = {
      system: systemPrompt,
      intentType: 'ASK_RECOMMENDATIONS',
      retrievedSources: retrievalResults?.length || 0,
      contextIncluded: !!contextSummary,
      farmContextIncluded: !!farmContext,
      agricultureAnalysisIncluded: !!agricultureAnalysis
    };
    
    return prompt;
  }

  /**
   * Build prompt for troubleshooting requests
   * @private
   */
  async buildTroubleshootingPrompt(params) {
    const {
      message,
      contextSummary,
      retrievalResults,
      agricultureAnalysis,
      farmContext,
      imageAnalysisResult
    } = params;
    
    const retrievedContent = this.formatRetrievedDocuments(retrievalResults);
    
    // Context from previous conversation
    const conversationContext = contextSummary?.summary || "This is a new conversation.";
    
    // Image analysis if available
    let imageAnalysisString = "No image analysis available.";
    if (imageAnalysisResult) {
      imageAnalysisString = `
Image Description: ${imageAnalysisResult.description || 'Not provided'}
Detected Issues: ${imageAnalysisResult.issues?.join(', ') || 'None detected'}
Confidence: ${imageAnalysisResult.confidence || 'Not provided'}
Visible Symptoms: ${imageAnalysisResult.symptoms?.join(', ') || 'None detected'}
      `;
    }
    
    // Agricultural context
    let agricultureContext = "";
    if (agricultureAnalysis) {
      const crops = agricultureAnalysis.detectedCrops.map(crop => 
        `${crop.name} (${crop.taxonomy || 'No taxonomy'})`).join(', ');
      
      agricultureContext = `
Topic: ${agricultureAnalysis.primaryTopic || 'General agriculture'}
Crops: ${crops || 'None specifically mentioned'}
Conditions: ${agricultureAnalysis.conditions.join(', ') || 'None specifically mentioned'}
      `;
    }
    
    const systemPrompt = `
You are an expert agricultural troubleshooter specializing in regenerative farming. 
Your task is to diagnose problems and suggest solutions based on the user's situation.

Guidelines:
1. Analyze the problem systematically by identifying symptoms, potential causes, and contributing factors
2. Use diagnostic reasoning to narrow down the most likely causes
3. Present solutions in order of likelihood and ease of implementation
4. Provide clear troubleshooting steps that the user can follow
5. Explain how to verify that the problem has been solved
6. Cite sources using [Source X] notation
7. Include preventative measures to avoid the problem in the future
8. If multiple issues could be present, address each one and explain their relationships
9. Consider environmental factors, farming practices, and timing in your diagnosis

Conversation Context:
${conversationContext}

Image Analysis:
${imageAnalysisString}

Agricultural Context:
${agricultureContext}

User Query: "${message}"

RETRIEVED INFORMATION:
${retrievedContent}
`;

    const prompt = {
      system: systemPrompt,
      intentType: 'TROUBLESHOOTING',
      retrievedSources: retrievalResults?.length || 0,
      contextIncluded: !!contextSummary,
      imageAnalysisIncluded: !!imageAnalysisResult,
      agricultureAnalysisIncluded: !!agricultureAnalysis
    };
    
    return prompt;
  }

  /**
   * Build prompt for pest/disease identification
   * @private
   */
  async buildPestDiseasePrompt(params) {
    const {
      message,
      contextSummary,
      retrievalResults,
      agricultureAnalysis,
      imageAnalysisResult
    } = params;
    
    const retrievedContent = this.formatRetrievedDocuments(retrievalResults);
    
    // Context from previous conversation
    const conversationContext = contextSummary?.summary || "This is a new conversation.";
    
    // Image analysis if available
    let imageAnalysisString = "No image analysis available.";
    if (imageAnalysisResult) {
      imageAnalysisString = `
Image Description: ${imageAnalysisResult.description || 'Not provided'}
Detected Issues: ${imageAnalysisResult.issues?.join(', ') || 'None detected'}
Confidence: ${imageAnalysisResult.confidence || 'Not provided'}
Visible Symptoms: ${imageAnalysisResult.symptoms?.join(', ') || 'None detected'}
      `;
    }
    
    // Agricultural context
    let agricultureContext = "";
    if (agricultureAnalysis) {
      const crops = agricultureAnalysis.detectedCrops.map(crop => 
        `${crop.name} (${crop.taxonomy || 'No taxonomy'})`).join(', ');
      
      agricultureContext = `
Topic: ${agricultureAnalysis.primaryTopic || 'General agriculture'}
Crops: ${crops || 'None specifically mentioned'}
Conditions: ${agricultureAnalysis.conditions.join(', ') || 'None specifically mentioned'}
      `;
    }
    
    const systemPrompt = `
You are an expert in plant pathology and pest management specializing in regenerative farming. 
Your task is to identify pests, diseases, or deficiencies and provide treatment recommendations.

Guidelines:
1. Analyze the symptoms to identify the most likely pest, disease, or deficiency
2. Provide the scientific name of the identified issue when possible
3. Describe the typical progression and impact of the issue
4. Explain environmental or cultural factors that contribute to the problem
5. Recommend a comprehensive treatment approach, including:
   - Immediate control measures
   - Long-term management strategies
   - Preventative practices
6. Cite sources using [Source X] notation
7. Mention similar issues that could be confused with the identified problem
8. If identification is uncertain, present the most likely options with confidence levels
9. Include organic and conventional treatment options when available

Conversation Context:
${conversationContext}

Image Analysis:
${imageAnalysisString}

Agricultural Context:
${agricultureContext}

User Query: "${message}"

RETRIEVED INFORMATION:
${retrievedContent}
`;

    const prompt = {
      system: systemPrompt,
      intentType: 'PEST_DISEASE_IDENTIFICATION',
      retrievedSources: retrievalResults?.length || 0,
      contextIncluded: !!contextSummary,
      imageAnalysisIncluded: !!imageAnalysisResult,
      agricultureAnalysisIncluded: !!agricultureAnalysis
    };
    
    return prompt;
  }

  /**
   * Build prompt for market/pricing information
   * @private
   */
  async buildMarketPricingPrompt(params) {
    const {
      message,
      contextSummary,
      retrievalResults,
      agricultureAnalysis,
      functionResults
    } = params;
    
    const retrievedContent = this.formatRetrievedDocuments(retrievalResults);
    
    // Context from previous conversation
    const conversationContext = contextSummary?.summary || "This is a new conversation.";
    
    // Market function results if available
    let marketData = "No current market data available.";
    if (functionResults && functionResults.marketData) {
      marketData = JSON.stringify(functionResults.marketData, null, 2);
    }
    
    // Agricultural context
    let agricultureContext = "";
    if (agricultureAnalysis) {
      const crops = agricultureAnalysis.detectedCrops.map(crop => 
        `${crop.name} (${crop.taxonomy || 'No taxonomy'})`).join(', ');
      
      agricultureContext = `
Topic: ${agricultureAnalysis.primaryTopic || 'General agriculture'}
Crops: ${crops || 'None specifically mentioned'}
Conditions: ${agricultureAnalysis.conditions.join(', ') || 'None specifically mentioned'}
      `;
    }
    
    const systemPrompt = `
You are an expert in agricultural markets and pricing specializing in agriculture. 
Your task is to provide market insights, pricing information, and trend analysis.

Guidelines:
1. Focus on providing accurate market data and analysis
2. Include relevant pricing information, trends, and forecasts
3. Put data in context with historical patterns when available
4. Explain market factors that influence prices
5. Consider regional and global market dynamics
6. Cite sources using [Source X] notation
7. Acknowledge uncertainty in forecasts and predictions
8. Highlight key factors farmers should monitor
9. If data is limited or outdated, clearly state this limitation
10. Provide actionable insights based on the market information

Conversation Context:
${conversationContext}

Agricultural Context:
${agricultureContext}

Current Market Data:
${marketData}

User Query: "${message}"

RETRIEVED INFORMATION:
${retrievedContent}
`;

    const prompt = {
      system: systemPrompt,
      intentType: 'MARKET_PRICING',
      retrievedSources: retrievalResults?.length || 0,
      contextIncluded: !!contextSummary,
      marketDataIncluded: !!(functionResults && functionResults.marketData),
      agricultureAnalysisIncluded: !!agricultureAnalysis
    };
    
    return prompt;
  }

  /**
   * Build prompt for multi-intent queries
   * @private
   */
  async buildMultiIntentPrompt(params) {
    const {
      message,
      intentClassification,
      contextSummary,
      retrievalResults,
      agricultureAnalysis
    } = params;
    
    const retrievedContent = this.formatRetrievedDocuments(retrievalResults);
    
    // Context from previous conversation
    const conversationContext = contextSummary?.summary || "This is a new conversation.";
    
    // Get secondary intents
    const secondaryIntents = intentClassification.secondaryIntents || [];
    const intentsList = [intentClassification.intent, ...secondaryIntents].join(', ');
    
    // Agricultural context
    let agricultureContext = "";
    if (agricultureAnalysis) {
      const crops = agricultureAnalysis.detectedCrops.map(crop => 
        `${crop.name} (${crop.taxonomy || 'No taxonomy'})`).join(', ');
      
      agricultureContext = `
Topic: ${agricultureAnalysis.primaryTopic || 'General agriculture'}
Crops: ${crops || 'None specifically mentioned'}
Conditions: ${agricultureAnalysis.conditions.join(', ') || 'None specifically mentioned'}
      `;
    }
    
    const systemPrompt = `
You are an expert agricultural assistant specializing in regenerative farming. 
The user's query involves multiple intents: ${intentsList}. 
Your task is to address all aspects of the query comprehensively.

Guidelines:
1. Structure your response to clearly address each intent separately
2. Prioritize the most important or urgent aspects first
3. Ensure smooth transitions between different parts of your response
4. Cite sources using [Source X] notation for each section
5. Maintain a cohesive overall response while addressing multiple aspects
6. If intents conflict, acknowledge this and provide balanced information
7. Use headings to organize your response by topic
8. Tie the different aspects together in a conclusion if appropriate
9. Ensure all parts of the query are addressed

Conversation Context:
${conversationContext}

Agricultural Context:
${agricultureContext}

Detected Intents: ${intentsList}

User Query: "${message}"

RETRIEVED INFORMATION:
${retrievedContent}
`;

    const prompt = {
      system: systemPrompt,
      intentType: 'MULTI_INTENT',
      secondaryIntents: secondaryIntents,
      retrievedSources: retrievalResults?.length || 0,
      contextIncluded: !!contextSummary,
      agricultureAnalysisIncluded: !!agricultureAnalysis
    };
    
    return prompt;
  }

  /**
   * Build default prompt for unclassified intents
   * @private
   */
  async buildDefaultPrompt(params) {
    const {
      message,
      conversationHistory,
      contextSummary,
      retrievalResults,
      agricultureAnalysis
    } = params;
    
    const retrievedContent = this.formatRetrievedDocuments(retrievalResults);
    
    // Context from previous conversation
    const conversationContext = contextSummary?.summary || "This is a new conversation.";
    
    // Agricultural context
    let agricultureContext = "";
    if (agricultureAnalysis) {
      const crops = agricultureAnalysis.detectedCrops.map(crop => 
        `${crop.name} (${crop.taxonomy || 'No taxonomy'})`).join(', ');
      
      agricultureContext = `
Topic: ${agricultureAnalysis.primaryTopic || 'General agriculture'}
Crops: ${crops || 'None specifically mentioned'}
Conditions: ${agricultureAnalysis.conditions.join(', ') || 'None specifically mentioned'}
      `;
    }
    
    const systemPrompt = `
You are an expert agricultural assistant specializing in regenerative farming. 
Your task is to provide helpful information based on the user's query.

Guidelines:
1. Address the user's query directly and comprehensively
2. Use the retrieved information to inform your response
3. Cite sources using [Source X] notation
4. Consider the conversation context in your response
5. If the query is unclear, provide the most helpful response based on your understanding
6. Use appropriate agricultural terminology
7. Structure your response in a clear and logical manner
8. If the query falls outside your expertise, acknowledge limitations

Conversation Context:
${conversationContext}

Agricultural Context:
${agricultureContext}

User Query: "${message}"

RETRIEVED INFORMATION:
${retrievedContent}
`;

    const prompt = {
      system: systemPrompt,
      intentType: 'DEFAULT',
      retrievedSources: retrievalResults?.length || 0,
      contextIncluded: !!contextSummary,
      agricultureAnalysisIncluded: !!agricultureAnalysis
    };
    
    return prompt;
  }
}

// Export a singleton instance
const promptBuilder = new PromptBuilder();
module.exports = { promptBuilder, PromptBuilder };