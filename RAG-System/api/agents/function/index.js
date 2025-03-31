const { openai } = require('../../services/openai');
const { analyzeImage } = require('../function/functions/imageAnalysis');
// const { getWeatherData } = require('./weatherFunctions');
const { logIssue, getIssueHistory } = require('../function/functions/issueTracking');
const { logFertilizer, getFertilizerHistory } = require('../function/functions/fertilizerLog');

/**
 * Function agent that handles specialized function calling for the RAG system
 */
class FunctionAgent {
  constructor() {
    this.functionRegistry = {
      'analyzeImage': analyzeImage,
      // 'getWeatherData': getWeatherData,
      'logIssue': logIssue,
      'getIssueHistory': getIssueHistory,
      'logFertilizer': logFertilizer,
      'getFertilizerHistory': getFertilizerHistory
    };
  }
  
  /**
   * Call a registered function
   */
  async callFunction({ name, args = {} }) {
    if (!this.functionRegistry[name]) {
      throw new Error(`Function ${name} not found in registry`);
    }
    
    try {
      console.log(`Executing function: ${name}`);
      return await this.functionRegistry[name](args);
    } catch (error) {
      console.error(`Error executing function ${name}:`, error);
      return { error: error.message, success: false };
    }
  }
  
  /**
   * Register a new function in the registry
   */
  registerFunction(name, handler) {
    this.functionRegistry[name] = handler;
  }
}

module.exports = { FunctionAgent };