/**
 * Parse AI response to extract structured information
 * @param {string} text - Full AI response text
 * @returns {Object} - Structured information
 */
function parseAIResponse(text) {
    return {
      diagnosis: extractDiagnosis(text),
      symptoms: extractSymptoms(text),
      recommendations: extractRecommendations(text),
      issueType: getIssueType(text),
      primaryCause: getPrimaryCause(text),
      severity: extractSeverity(text),
      fullText: text
    };
  }
  
  /**
   * Extract main diagnosis from AI response
   * @param {string} text - Full AI response
   * @returns {string} - Main diagnosis
   */
  function extractDiagnosis(text) {
    // Try to extract diagnosis name from the text
    const diagnosisMatch = text.match(/diagnosis:?\s*([^\.]+)/i) || 
                          text.match(/identified as:?\s*([^\.]+)/i) || 
                          text.match(/appears to be:?\s*([^\.]+)/i);
    
    if (diagnosisMatch && diagnosisMatch[1]) {
      return diagnosisMatch[1].trim();
    }
    
    // If no specific diagnosis found, return first sentence
    const firstSentence = text.split('.')[0];
    return firstSentence || text.substring(0, 100);
  }
  
  /**
   * Extract symptoms from AI response
   * @param {string} text - Full AI response
   * @returns {string} - Symptoms
   */
  function extractSymptoms(text) {
    const symptomsMatch = text.match(/symptoms:?\s*([^\.]+\.)/i) || 
                          text.match(/signs:?\s*([^\.]+\.)/i) ||
                          text.match(/characterized by:?\s*([^\.]+\.)/i);
    
    if (symptomsMatch && symptomsMatch[1]) {
      return symptomsMatch[1].trim();
    }
    
    return '';
  }
  
  /**
   * Extract recommendations from AI response
   * @param {string} text - Full AI response
   * @returns {string} - Recommendations
   */
  function extractRecommendations(text) {
    const recMatch = text.match(/recommend(?:ations|ed)?:?\s*([^\.]+(?:\.(?:[^\.]+)?){0,3})/i) || 
                    text.match(/treatment:?\s*([^\.]+(?:\.(?:[^\.]+)?){0,3})/i) ||
                    text.match(/action:?\s*([^\.]+(?:\.(?:[^\.]+)?){0,3})/i);
    
    if (recMatch && recMatch[1]) {
      return recMatch[1].trim();
    }
    
    return '';
  }
  
  /**
   * Determine issue type from diagnosis text
   * @param {string} text - Diagnosis text
   * @returns {string} - Issue type
   */
  function getIssueType(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('rust') || 
        lowerText.includes('blight') || 
        lowerText.includes('fungus') ||
        lowerText.includes('fungal') ||
        lowerText.includes('disease')) {
      return 'disease';
    } else if (lowerText.includes('beetle') || 
               lowerText.includes('borer') || 
               lowerText.includes('pest') ||
               lowerText.includes('insect')) {
      return 'pest';
    } else if (lowerText.includes('deficiency') ||
               lowerText.includes('nutrient')) {
      return 'nutrient_deficiency';
    }
    
    // Default
    return 'disease';
  }
  
  /**
   * Determine primary cause based on diagnosis
   * @param {string} text - Diagnosis text
   * @returns {string} - Primary cause
   */
  function getPrimaryCause(text) {
    const lowerText = text.toLowerCase();
    
    // Check for common causes
    if (lowerText.includes('weather') ||
        lowerText.includes('humidity') ||
        lowerText.includes('rain')) {
      return 'weather';
    } else if (lowerText.includes('overwatered') || 
        lowerText.includes('irrigation')) {
      return 'irrigation';
    } else if (lowerText.includes('nutrient') ||
               lowerText.includes('deficiency')) {
      return 'fertilizer';
    } else if (lowerText.includes('soil')) {
      return 'soil_quality';
    } else if (lowerText.includes('prune') ||
               lowerText.includes('crowded')) {
      return 'pruning';
    } else if (lowerText.includes('shade') ||
               lowerText.includes('sun exposure')) {
      return 'shade_management';
    }
    
    // Default
    return 'unknown';
  }
  
  /**
   * Extract severity from AI response
   * @param {string} text - Full AI response
   * @returns {string} - Severity level (low, medium, high)
   */
  function extractSeverity(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('severe') || 
        lowerText.includes('serious') || 
        lowerText.includes('critical') || 
        lowerText.includes('high severity')) {
      return 'high';
    } else if (lowerText.includes('moderate') || 
               lowerText.includes('medium')) {
      return 'medium';
    } else if (lowerText.includes('mild') || 
               lowerText.includes('low severity') || 
               lowerText.includes('early stage')) {
      return 'low';
    }
    
    // Default if no severity mentioned
    return 'medium';
  }
  
  module.exports = {
    parseAIResponse,
    extractDiagnosis,
    extractSymptoms,
    extractRecommendations,
    getIssueType,
    getPrimaryCause,
    extractSeverity  
  };