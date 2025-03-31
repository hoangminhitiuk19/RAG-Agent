const { processImageWithAssistant } = require('../../../services/openai');
/**
 * Analyze an image using OpenAI's Assistant API
 * @param {Object} params - Parameters for image analysis
 * @returns {Object} - Analysis results
 */
async function analyzeImage(params) {
  const { imageUrl, query = "What can you see in this image? Does this plant have any diseases or pests?" } = params;
  
  if (!imageUrl) {
    throw new Error('Image URL is required');
  }
  
  try {
    console.log(`Analyzing image at: ${imageUrl}`);
    
    const result = await processImageWithAssistant(imageUrl, query);
    
    return {
      analysis: result.analysis,
      threadId: result.threadId,
      detectedIssues: extractIssues(result.analysis)
    };
  } catch (error) {
    console.error(`Error analyzing image: ${error.message}`);
    throw error;
  }
}

/**
 * Extract structured information about detected issues from analysis text
 * @private
 */
function extractIssues(analysisText) {
  // Common coffee plant diseases and pests to look for
  const keyIssues = {
    diseases: [
      'coffee leaf rust', 'rust', 'hemileia vastatrix',
      'coffee berry disease', 'cbd', 'colletotrichum kahawae',
      'coffee wilt disease', 'fusarium',
      'anthracnose', 'colletotrichum',
      'cercospora', 'brown eye spot',
      'phoma', 'phoma leaf spot',
      'bacterial blight', 'pseudomonas',
      'root rot', 'armillaria',
      'sooty mold'
    ],
    pests: [
      'coffee berry borer', 'hypothenemus hampei',
      'coffee white stem borer', 'xylotrechus quadripes',
      'coffee leaf miner', 'leucoptera',
      'green scale', 'coccus viridis',
      'mealybugs', 'pseudococcus',
      'aphids',
      'coffee berry moth', 'prophantis smaragdina',
      'antestia bugs', 'antestiopsis',
      'coffee thrips', 'diarthrothrips coffeae'
    ],
    deficiencies: [
      'nitrogen deficiency',
      'phosphorus deficiency',
      'potassium deficiency',
      'calcium deficiency',
      'magnesium deficiency',
      'boron deficiency',
      'zinc deficiency',
      'iron deficiency'
    ]
  };
  
  // Look for mentions of key issues
  const foundIssues = {
    diseases: [],
    pests: [],
    deficiencies: [],
    other: []
  };
  
  // Convert analysis to lowercase for case-insensitive matching
  const lowerAnalysis = analysisText.toLowerCase();
  
  // Check for each type of issue
  for (const [category, issueList] of Object.entries(keyIssues)) {
    for (const issue of issueList) {
      if (lowerAnalysis.includes(issue)) {
        // Find the surrounding context
        const index = lowerAnalysis.indexOf(issue);
        const start = Math.max(0, index - 50);
        const end = Math.min(lowerAnalysis.length, index + issue.length + 100);
        const context = analysisText.substring(start, end);
        
        foundIssues[category].push({
          name: issue,
          context: context.trim()
        });
      }
    }
  }
  
  // Check if any issues were found
  const hasIssues = Object.values(foundIssues).some(arr => arr.length > 0);
  
  // If no specific issues found, but text suggests problems
  const problemKeywords = ['disease', 'pest', 'infection', 'damage', 'symptom', 'deficiency', 'stress'];
  if (!hasIssues && problemKeywords.some(keyword => lowerAnalysis.includes(keyword))) {
    foundIssues.other.push({
      name: 'unspecified issue',
      context: analysisText.substring(0, 200) + '...' // First 200 chars as context
    });
  }
  
  return foundIssues;
}

module.exports = { analyzeImage };