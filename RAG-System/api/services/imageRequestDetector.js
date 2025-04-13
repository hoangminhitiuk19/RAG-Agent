/**
 * Service to detect when requesting an image would be helpful for better assistance
 */
class ImageRequestDetector {
    /**
     * Determine if an image request should be suggested to the user
     */
    shouldRequestImage(message, intent, agricultureAnalysis) {
      // If already pest/disease intent, images are almost always useful
      if (intent === 'PEST_DISEASE_IDENTIFICATION') {
        return {
          shouldRequest: true,
          confidence: 0.9,
          reason: "An image would help identify the pest or disease affecting your plants."
        };
      }
      
      // Look for symptom keywords that indicate visual problems
      const symptomKeywords = [
        'spot', 'spots', 'yellow', 'yellowing', 'brown', 'wilting', 'wilted',
        'dying', 'discoloration', 'holes', 'lesion', 'lesions', 'blight',
        'rust', 'mold', 'mould', 'fungi', 'insects', 'bug', 'bugs', 'pest',
        'disease', 'damaged', 'curling', 'curl', 'stunted', 'growth'
      ];
      
      const messageLower = message.toLowerCase();
      const matchedSymptoms = symptomKeywords.filter(keyword => 
        messageLower.includes(keyword)
      );
      
      // Calculate confidence based on number of matched symptoms
      const matchCount = matchedSymptoms.length;
      let confidence = 0;
      let reason = "";
      
      if (matchCount >= 3) {
        confidence = 0.85;
        reason = "Your description mentions multiple visual symptoms that could be better diagnosed with an image.";
      } else if (matchCount >= 1) {
        confidence = 0.7;
        reason = "An image of the symptoms you're describing would help provide a more accurate diagnosis.";
      }
      
      // Check agriculture analysis (if available) for pest/disease topics
      if (agricultureAnalysis && agricultureAnalysis.primaryTopic === 'pest_and_disease') {
        confidence = Math.max(confidence, 0.8);
        reason = reason || "Based on your question, a picture would help identify the specific issue affecting your plants.";
      }
      
      return {
        shouldRequest: confidence >= 0.7,
        confidence,
        reason: confidence >= 0.7 ? reason : ""
      };
    }
    
    /**
     * Generate an appropriate image request message
     */
    generateImageRequestMessage(crop, symptom) {
      const cropSpecific = crop ? ` of your ${crop} plants` : " of the affected plants";
      const symptomSpecific = symptom ? ` showing the ${symptom}` : "";
      
      return `To provide a more accurate diagnosis, could you share a photo${cropSpecific}${symptomSpecific}? This would help me identify the specific issue and recommend appropriate treatment.`;
    }
  }
  
  // Export singleton instance
  const imageRequestDetector = new ImageRequestDetector();
  module.exports = { imageRequestDetector };