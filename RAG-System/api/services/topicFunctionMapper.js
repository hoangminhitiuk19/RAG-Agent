
const { supabase } = require('../config/db');

class TopicFunctionMapper {
  constructor() {
    // Define mapping between topics and required functions
    this.topicFunctionMap = {
      'pest_and_disease': ['getWeather'],
      'nutrition_recommendation': ['getWeather', 'getSoilType', 'getFertilizerHistory'],
    //   'climate_adaptation': ['getWeather', 'getFarmHistory'],
    //   'crop_management': ['getFarmHistory', 'getWeather'],
    //   'regenerative_practices': ['getFarmHistory', 'getSoilType'],
    //   'input_formulation': ['getFertilizerHistory', 'getSoilType'],
    //   'yield_forecast': ['getWeather', 'getFarmHistory', 'getFertilizerHistory'],
    //   'cost_estimation': ['getFertilizerHistory'],
    //   'compliance_check': ['getFarmHistory', 'getPesticideHistory'],
    //   'coffee_varieties': ['getFarmHistory'],
    //   'pesticide_recommendation': ['getWeather', 'getPesticideHistory']
    };
    
    // Define function implementations
    this.functionImplementations = {
      'getWeather': this.getWeatherData.bind(this),
      'getSoilType': this.getSoilTypeData.bind(this),
      'getFertilizerHistory': this.getFertilizerHistoryData.bind(this),
      'getFarmHistory': this.getFarmHistoryData.bind(this),
      'getIssueHistory': this.getIssueHistoryData.bind(this),
      'getPesticideHistory': this.getPesticideHistoryData.bind(this)
    };
  }

  /**
   * Get required functions for a given topic
   * @param {string} topic - The primary agricultural topic
   * @returns {Array} - List of required function names
   */
  getRequiredFunctionsForTopic(topic) {
    return this.topicFunctionMap[topic] || [];
  }

  /**
   * Get all required functions for multiple topics, with deduplication
   * @param {Array} topics - List of agricultural topics
   * @returns {Array} - Deduplicated list of required function names
   */
  getAllRequiredFunctions(topics) {
    // Create a Set to automatically handle deduplication
    const requiredFunctions = new Set();
    
    topics.forEach(topic => {
      const functions = this.getRequiredFunctionsForTopic(topic);
      functions.forEach(func => requiredFunctions.add(func));
    });
    
    return Array.from(requiredFunctions);
  }

  /**
   * Execute all required functions for the topics
   * @param {Array} topics - List of agricultural topics
   * @param {Object} farmContext - Farm context data
   * @returns {Promise<Object>} - Results from all executed functions
   */
  async executeRequiredFunctions(topics, farmContext) {
    if (!farmContext) {
      return { error: 'Missing farm context', results: {} };
    }
    
    const functions = this.getAllRequiredFunctions(topics);
    const results = {};
    let allResultsNull = true;
    
    // Execute each function
    await Promise.all(functions.map(async (funcName) => {
      try {
        const funcImpl = this.functionImplementations[funcName];
        if (funcImpl) {
          const result = await funcImpl(farmContext);
          results[funcName] = result;
          
          // Check if at least one result is not null
          if (result !== null && Object.keys(result).length > 0) {
            allResultsNull = false;
          }
        }
      } catch (error) {
        console.error(`Error executing function ${funcName}:`, error);
        results[funcName] = null;
      }
    }));
    
    return { 
      results,
      allResultsNull
    };
  }
  
  // Function implementations
  async getWeatherData(farmContext) {
    try {
      // Return the weather data if it exists in the farm context
      return farmContext.weatherData || null;
    } catch (error) {
      console.error('Error getting weather data:', error);
      return null;
    }
  }
  
  async getSoilTypeData(farmContext) {
    try {
      // Check if farm_soil_type exists in the farm data
      if (farmContext.farmData && farmContext.farmData.farm_soil_type) {
        return { soilType: farmContext.farmData.farm_soil_type };
      }
      return null;
    } catch (error) {
      console.error('Error getting soil type data:', error);
      return null;
    }
  }
  
  async getFertilizerHistoryData(farmContext) {
    try {
      const farmId = farmContext.farmData?.farm_id;
      if (!farmId) return null;
      
      // Query fertilizer_application_log
      const { data: appData, error: appError } = await supabase
        .from('fertilizer_application_log')
        .select('*')
        .eq('farm_id_fk', farmId)
        .order('application_date', { ascending: false })
        .limit(5);
        
      if (appError) throw appError;
      
      // Query fertilizer_bag_log if needed
      const { data: bagData, error: bagError } = await supabase
        .from('fertilizer_bag_log')
        .select('*')
        .eq('farm_id_fk', farmId)
        .order('purchase_date', { ascending: false })
        .limit(5);
        
      if (bagError) throw bagError;
      
      if ((appData && appData.length > 0) || (bagData && bagData.length > 0)) {
        return {
          applications: appData || [],
          purchases: bagData || []
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting fertilizer history:', error);
      return null;
    }
  }
  
  async getFarmHistoryData(farmContext) {
    try {
      if (farmContext.farmData) {
        return {
          established: farmContext.farmData.established_date,
          size: farmContext.farmData.size_in_hectares,
          crops: farmContext.cropData || []
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting farm history data:', error);
      return null;
    }
  }
  
  async getIssueHistoryData(farmContext) {
    try {
      return farmContext.issues || null;
    } catch (error) {
      console.error('Error getting issue history data:', error);
      return null;
    }
  }
  
  async getPesticideHistoryData(farmContext) {
    try {
      const farmId = farmContext.farmData?.farm_id;
      if (!farmId) return null;
      
      // Query pesticide application log
      const { data, error } = await supabase
        .from('pesticide_application')
        .select('*')
        .eq('farm_id_fk', farmId)
        .order('application_date', { ascending: false })
        .limit(5);
        
      if (error) throw error;
      
      return data || null;
    } catch (error) {
      console.error('Error getting pesticide history:', error);
      return null;
    }
  }
}

// Export a singleton instance
const topicFunctionMapper = new TopicFunctionMapper();
module.exports = { topicFunctionMapper };