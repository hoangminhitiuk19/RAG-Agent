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
    hasIssue: hasIssue(text),
    fullText: text
  };
}

/**
 * Extract main diagnosis from AI response
 * @param {string} text - Full AI response
 * @returns {string} - Main diagnosis
 */
function extractDiagnosis(text) {
  if (!text) return '';
  
  // Try to find a diagnosis section or statement
  const diagnosisRegex = /(?:diagnosis|identified as|appears to be|suffering from|affected by)[:|\s]+([^\.]+)/i;
  const match = text.match(diagnosisRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // If no explicit diagnosis found, return the first sentence as a fallback
  const firstSentence = text.split('.')[0];
  return firstSentence || '';
}

/**
 * Extract symptoms from AI response
 * @param {string} text - Full AI response
 * @returns {string} - Symptoms
 */
function extractSymptoms(text) {
  if (!text) return '';
  
  // Look for a symptoms section
  const symptomsRegex = /(?:symptoms|signs|observable|visible symptoms|characteristics)[:|\s]+([^\.]+(?:\.[^\.]+){0,3})/i;
  const match = text.match(symptomsRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return '';
}

/**
 * Extract recommendations from AI response
 * @param {string} text - Full AI response
 * @returns {string} - Recommendations
 */
function extractRecommendations(text) {
  if (!text) return '';
  
  // Look for recommendations section
  const recommendationsRegex = /(?:recommend|treatment|solution|management|control|how to|suggested actions|steps to take)[:|\s]+([^\.]+(?:\.[^\.]+){0,5})/i;
  const match = text.match(recommendationsRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return '';
}

/**
 * Extract severity level from text
 * @param {string} text - Diagnosis text
 * @returns {string} - Severity level (low, medium, high, critical)
 */
function extractSeverity(text) {
  if (!text) return 'unknown';
  
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('severe') || lowerText.includes('critical') || lowerText.includes('emergency')) {
    return 'critical';
  } else if (lowerText.includes('high') || lowerText.includes('serious') || lowerText.includes('significant')) {
    return 'high';
  } else if (lowerText.includes('medium') || lowerText.includes('moderate')) {
    return 'medium';
  } else if (lowerText.includes('low') || lowerText.includes('mild') || lowerText.includes('minor')) {
    return 'low';
  }
  
  return 'medium'; // Default to medium if no severity mentioned
}

/**
 * Determine issue type from diagnosis text
 * @param {string} text - Diagnosis text
 * @returns {string} - Issue type categorization
 */
function getIssueType(text) {
  if (!text) return 'unknown';
  
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('rust') || 
      lowerText.includes('blight') || 
      lowerText.includes('wilt') ||
      lowerText.includes('fungus') || 
      lowerText.includes('fungal') || 
      lowerText.includes('mold') ||
      lowerText.includes('rot') ||
      lowerText.includes('anthracnose') ||
      lowerText.includes('leaf spot')) {
    return 'disease';
  }
  
  if (lowerText.includes('borer') || 
      lowerText.includes('aphid') || 
      lowerText.includes('mite') ||
      lowerText.includes('bug') ||
      lowerText.includes('beetle') ||
      lowerText.includes('insect') ||
      lowerText.includes('pest') ||
      lowerText.includes('caterpillar')) {
    return 'pest';
  }
  
  if (lowerText.includes('deficiency') || 
      lowerText.includes('nutrient') || 
      lowerText.includes('fertilizer') ||
      lowerText.includes('shortage') ||
      lowerText.includes('lacking')) {
    return 'nutrient deficiency';
  }
  
  if (lowerText.includes('water') || 
      lowerText.includes('irrigation') || 
      lowerText.includes('drought') ||
      lowerText.includes('overwatering')) {
    return 'water issue';
  }
  
  return 'general issue';
}

/**
 * Get primary cause from diagnosis and weather
 * @param {string} text - Diagnosis text
 * @param {Object} weatherData - Weather data if available
 * @returns {string} - Primary cause
 */
function getPrimaryCause(text, weatherData = null) {
  if (!text) return 'unknown';
  
  const lowerText = text.toLowerCase();
  
  // Check for disease causes
  if (lowerText.includes('humidity') || 
      lowerText.includes('moist') || 
      lowerText.includes('wet')) {
    return 'high humidity';
  }
  
  if (lowerText.includes('temperature') || 
      lowerText.includes('heat') || 
      lowerText.includes('cold') ||
      lowerText.includes('warm')) {
    return 'temperature stress';
  }
  
  // Integrate weather data if available
  if (weatherData) {
    if (weatherData.humidity > 80) {
      return 'high humidity';
    }
    if (weatherData.temperature > 30) {
      return 'heat stress';
    }
    if (weatherData.temperature < 10) {
      return 'cold stress';
    }
  }
  
  // Check for other causes
  if (lowerText.includes('overwater') || lowerText.includes('excessive water')) {
    return 'overwatering';
  }
  
  if (lowerText.includes('dry') || 
      lowerText.includes('drought') || 
      lowerText.includes('underwater')) {
    return 'underwatering';
  }
  
  if (lowerText.includes('nutrient') || lowerText.includes('deficiency')) {
    if (lowerText.includes('nitrogen')) return 'nitrogen deficiency';
    if (lowerText.includes('phosphorus')) return 'phosphorus deficiency';
    if (lowerText.includes('potassium')) return 'potassium deficiency';
    if (lowerText.includes('calcium')) return 'calcium deficiency';
    return 'nutrient deficiency';
  }
  
  if (lowerText.includes('pest') || lowerText.includes('insect')) {
    return 'pest infestation';
  }
  
  return 'unknown cause';
}

/**
 * Determine if the text contains issues that should be logged
 * @param {string} text - Input text
 * @returns {boolean} - True if an issue is detected
 */
function hasIssue(text) {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  const issueKeywords = [
    'disease', 'pest', 'infection', 'infestation', 
    'deficiency', 'rot', 'fungus', 'fungal', 
    'virus', 'bacterial', 'blight', 'rust',
    'wilt', 'spot', 'mold', 'aphid', 'borer',
    'nutrient', 'lack of'
  ];
  
  return issueKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Extract structured data from text response
 * @param {string} text - Response text
 * @returns {Object} - Structured data object
 */
function extractStructuredData(text) {
  return {
    hasIssue: hasIssue(text),
    diagnosis: extractDiagnosis(text),
    symptoms: extractSymptoms(text),
    recommendations: extractRecommendations(text),
    issueType: getIssueType(text),
    primaryCause: getPrimaryCause(text),
    severity: extractSeverity(text)
  };
}

module.exports = {
  parseAIResponse,
  extractDiagnosis,
  extractSymptoms,
  extractRecommendations,
  getIssueType,
  getPrimaryCause,
  extractSeverity,
  hasIssue,
  extractStructuredData
};