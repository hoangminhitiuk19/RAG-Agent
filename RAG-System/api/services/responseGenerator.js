const { openai } = require('./openai');

/**
 * Service for generating structured responses based on intent
 * and providing metadata about the response
 */
class ResponseGenerator {

    /**
     * Process a complete response string to extract citations and metadata
     * @param {string} response - Full response text
     * @param {string} intent - Classified intent
     * @param {Array} retrievalResults - Retrieval results
     * @param {Object} agricultureAnalysis - Agriculture analysis
     * @returns {Object} - Processed response with metadata
     */
    processResponse(response, intent, retrievalResults, agricultureAnalysis) {
        // Extract citations
        const citationInfo = this.extractCitations(response, retrievalResults);
        
        // Estimate confidence based on citations, intent, and ag analysis
        const confidence = this.estimateConfidence(
            citationInfo.citationsFound,
            retrievalResults.length,
            intent,
            agricultureAnalysis
        );
        
        // Structure response based on intent
        const structuredResponse = {
            response: citationInfo.processedResponse,
            confidence: confidence,
            metadata: {
                intent: intent,
                citations: citationInfo.citations,
                source_domains: this.extractSourceDomains(retrievalResults),
                agriculture_topic: agricultureAnalysis?.primaryTopic,
                crops: agricultureAnalysis?.detectedCrops.map(c => c.name),
                citations_count: citationInfo.citationsFound.length
            }
        };
        
        return structuredResponse;
    }
    /**
     * Generate a structured response based on the prompt
     * @param {Object} params - Parameters for response generation
     * @returns {Promise<Object>} - Generated response and metadata
     */
    async generateResponse(params) {
        const {
        message,
        conversationHistory,
        promptData,
        intentClassification,
        retrievalResults = [],
        agricultureAnalysis = null
        } = params;
        
        try {
            // Generate response using LLM
            const response = await this.callLLM(promptData, message);
            
            // Process and structure the response based on intent
            const structuredResponse = this.processResponse(
                response,
                intentClassification.intent,
                retrievalResults,
                agricultureAnalysis
            );
            
            return structuredResponse;
        } catch (error) {
            console.error("Error generating response:", error);
            
            // Fallback response with error information
            return {
                response: "I apologize, but I encountered an error generating a response. Please try again or rephrase your question.",
                confidence: 0.1,
                metadata: {
                    error: error.message,
                    intent: intentClassification.intent
                }
            };
        }
    }
    
    /**
     * Call OpenAI to generate a response
     * @private
     */
    async callLLM(promptData, message) {
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                { role: "system", content: promptData.system },
                { role: "user", content: message }
                ],
                temperature: this.getTemperatureForIntent(promptData.intentType),
                max_tokens: 1000
            });
        
        return response.choices[0].message.content;
        } catch (error) {
            console.error("Error calling OpenAI:", error);
            throw error;
        }
    }
    
    /**
     * Get appropriate temperature setting based on intent
     * @private
     */
    getTemperatureForIntent(intentType) {
        const temperatureMap = {
            'ASK_FACTUAL_INFO': 0.1, // Lower temperature for factual information (more focused)
            'ASK_RECOMMENDATIONS': 0.4, // Moderate temperature for recommendations (some creativity)
            'TROUBLESHOOTING': 0.2, // Lower temperature for troubleshooting (precision important)
            'PEST_DISEASE_IDENTIFICATION': 0.2, // Lower temperature for identification
            'MARKET_PRICING': 0.1, // Lower for market data (accuracy important)
            'MULTI_INTENT': 0.3, // Moderate for multi-intent queries
            'DEFAULT': 0.3 // Default moderate temperature
        };
        
        return temperatureMap[intentType] || 0.3;
    }
    
    /**
     * Process and structure the response
     * @private
     */
    processResponse(rawResponse, intent, retrievalResults, agricultureAnalysis) {
        // Extract citations
        const citationInfo = this.extractCitations(rawResponse, retrievalResults);
        
        // Estimate confidence based on citations, intent, and ag analysis
        const confidence = this.estimateConfidence(
            citationInfo.citationsFound,
            retrievalResults.length,
            intent,
            agricultureAnalysis
        );
        
        // Structure response based on intent
        const structuredResponse = {
            response: citationInfo.processedResponse,
            confidence: confidence,
            metadata: {
                intent: intent,
                citations: citationInfo.citations,
                source_domains: this.extractSourceDomains(retrievalResults),
                agriculture_topic: agricultureAnalysis?.primaryTopic,
                crops: agricultureAnalysis?.detectedCrops.map(c => c.name),
                citations_count: citationInfo.citationsFound.length
            }
        };
        
        return structuredResponse;
    }
    
    /**
     * Extract citations from the response
     * @private
     */
    extractCitations(response, retrievalResults) {
        // Initialize variables
        const citations = [];
        const citationsFound = [];
        
        // Regular expression to find citation patterns like [Source X] or [Source: something]
        const citationRegex = /\[Source(?:\s*:\s*|\s+)([^\]]+)\]/gi;
        let match;
        
        // Find all citation matches
        while ((match = citationRegex.exec(response)) !== null) {
            const sourceIdentifier = match[1].trim();
            
            // Try to parse as a number first
            const sourceNumber = parseInt(sourceIdentifier, 10);
            
            if (!isNaN(sourceNumber)) {
                // It's a numbered source
                if (!citationsFound.includes(sourceNumber)) {
                    citationsFound.push(sourceNumber);
                    
                    // Map citation to source if available
                    if (retrievalResults.length >= sourceNumber) {
                        const source = retrievalResults[sourceNumber - 1];
                        citations.push({
                        number: sourceNumber,
                        source: source.metadata?.source || source.metadata?.title || `Source ${sourceNumber}`,
                        text: (source.pageContent || source.content || "").substring(0, 150) + "..."
                        });
                    } else {
                        citations.push({
                        number: sourceNumber,
                        source: `Unknown Source ${sourceNumber}`,
                        text: "Source information not available"
                        });
                    }
                }
            } else {
                // It's a named source like "unknown" or something else
                if (!citationsFound.includes(sourceIdentifier)) {
                    citationsFound.push(sourceIdentifier);
                    citations.push({
                        identifier: sourceIdentifier,
                        source: sourceIdentifier,
                        text: "Named source reference"
                    });
                }
            }
        }
        
        return {
        processedResponse: response,
        citations,
        citationsFound
        };
    }
    
    /**
     * Extract unique source domains from retrieval results
     * @private
     */
    extractSourceDomains(retrievalResults) {
        const domains = new Set();
        
        retrievalResults.forEach(result => {
            if (result.metadata?.source) {
                try {
                // Extract domain from URL if it looks like a URL
                if (result.metadata.source.startsWith('http')) {
                    const url = new URL(result.metadata.source);
                    domains.add(url.hostname);
                } else {
                    // Otherwise use the source as is
                    domains.add(result.metadata.source);
                }
                } catch (e) {
                // If URL parsing fails, use the source string as is
                domains.add(result.metadata.source);
                }
            }
        });
        
        return Array.from(domains);
    }
    
    /**
     * Estimate confidence based on response factors
     * @private
     */
    estimateConfidence(citationsFound, totalSources, intent, agricultureAnalysis) {
        // Base confidence starts at 0.5
        let confidence = 0.5;
        
        // If we have citations, increase confidence
        if (citationsFound.length > 0 && totalSources > 0) {
        // Calculate ratio of sources cited
        const citationRatio = citationsFound.length / Math.min(totalSources, 5); // Cap at 5 sources
            confidence += citationRatio * 0.2; // Up to 0.2 boost for citations
        } else {
            confidence -= 0.1; // Penalize for no citations
        }
        
        // Intent-specific confidence adjustments
        if (intent === 'ASK_FACTUAL_INFO' && citationsFound.length === 0) {
            confidence -= 0.15; // Factual info should have citations
        } else if (intent === 'ASK_RECOMMENDATIONS') {
        // Less penalty for recommendations without citations
            confidence -= citationsFound.length === 0 ? 0.05 : 0;
        }
        
        // Agricultural analysis based confidence
        if (agricultureAnalysis) {
            if (agricultureAnalysis.primaryTopic && agricultureAnalysis.primaryTopic !== 'general') {
                confidence += 0.05; // Boost when we have a specific agricultural topic
            }
            if (agricultureAnalysis.detectedCrops && agricultureAnalysis.detectedCrops.length > 0) {
                confidence += 0.05; // Boost when specific crops are detected
            }
        }
        
        // Ensure confidence stays in range [0.1, 0.95]
        return Math.min(0.95, Math.max(0.1, confidence));
    }
}

// Export a singleton instance
const responseGenerator = new ResponseGenerator();
module.exports = { responseGenerator, ResponseGenerator };