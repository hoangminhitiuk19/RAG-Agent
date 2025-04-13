const { 
  getFarmerByUserProfileId, 
  getFarmByFarmerId,
  getFarmCropsOfAFarm,
  getCropNameByCropId,
  getFarmIssueHistory,
  getLocationString,
  getLocationHierarchy
} = require('../../services/farmService');
const { weatherService } = require('../../services/weather');

/**
 * Farm context agent to retrieve and manage farm-specific data
 */
class FarmContextAgent {
  constructor() {
    this.contextCache = {};
  }

  async getWeatherForFarm(farm, locationHierarchy) {
    let weather = null;
  
    // Attempt to get weather using coordinates from the farm table
    if (farm.coordinates) {
      try {
        const coordsObj = typeof farm.coordinates === 'string' 
          ? JSON.parse(farm.coordinates) 
          : farm.coordinates;
          
        if (coordsObj && coordsObj.latitude && coordsObj.longitude) {
          weather = await weatherService.getCurrentWeatherByCoordinates(
            coordsObj.latitude, 
            coordsObj.longitude
          );
          console.log('Retrieved weather data using farm coordinates');
        }
      } catch (coordsError) {
        console.error('Error parsing farm coordinates:', coordsError);
      }
    }
  
    // If weather not found by coordinates, try using the city name from the admin_unit table
    if (!weather && locationHierarchy.length > 0) {
      const city = locationHierarchy.find(unit => 
        unit.admin_unit_type === 'City' || unit.admin_unit_type === 'Municipality'
      );
      
      if (city) {
        try {
          weather = await weatherService.getWeatherByCity(city.name);
          console.log(`Weather found for city: ${city.name}`);
        } catch (weatherError) {
          console.log('City-level weather data not available:', weatherError.message);
        }
      }
    }
  
    return weather;
  }

  /**
   * Get comprehensive farm context - the main method for retrieving farm data
   * @param {string} farmId - Farm ID
   * @param {string} userProfileId - Required user_profile_id to lookup farmer and farm
   * @returns {Object} - Complete farm context
   */
  async getFarmContext(farmId, userProfileId) {
    console.log('📥 getFarmContext() called with:', { farmId, userProfileId });
    try {
      const cacheKey = `${farmId}-${userProfileId}`;
      const now = Date.now();
      if (this.contextCache[cacheKey] && 
          (now - this.contextCache[cacheKey].timestamp) < 30 * 60 * 1000) {
        console.log(`Using cached farm context for ${cacheKey}`);
        return this.contextCache[cacheKey].data;
      }

      const farmer = await getFarmerByUserProfileId(userProfileId);
      if (!farmer) return null;

      const farms = await getFarmByFarmerId(farmer.farmer_id);
      const farm = farms.find(f => f.farm_id === farmId);
      if (!farm) return null;

      // Get location details from admin_unit
      let locationHierarchy = [];
      let locationString = '';
      if (farm.admin_unit_id_fk) {
        locationHierarchy = await getLocationHierarchy(farm.admin_unit_id_fk);
        locationString = await getLocationString(farm.admin_unit_id_fk);
      }

      const crops = await getFarmCropsOfAFarm(farmId);

      const weather = await getWeatherForFarm(farm, locationHierarchy);

      const issues = await getFarmIssueHistory(farmId);

      // Enhance farm with location information
      const enhancedFarm = {
        ...farm,
        locationString,
        locationHierarchy
      };

      const contextData = {
        farm: enhancedFarm,
        crops,
        farmer,
        weather,
        issues,
        farmData: enhancedFarm,
        cropData: crops,
        farmerData: farmer,
        weatherData: weather
      };

      this.contextCache[cacheKey] = {
        data: contextData,
        timestamp: now
      };

      return contextData;
    } catch (error) {
      console.error('Error getting farm context:', error);
      return {
        error: error.message,
        farmData: null,
        cropData: [],
        farmerData: null,
        weatherData: null
      };
    }
  }

  /**
   * Get basic farm context (simplified version for common use cases)
   * @param {string} farmId - Farm ID
   * @param {string} userProfileId - User profile ID
   * @returns {Object} - Basic farm context with just farm and crop data
   */
  async getBasicFarmContext(farmId, userProfileId) {
    try {
      const context = await this.getFarmContext(farmId, userProfileId);
      return {
        farmData: context.farm,
        cropData: context.crops,
        farmerData: context.farmer,
        weatherData: context.weather
      };
    } catch (error) {
      console.error('Error getting basic farm context:', error);
      return {
        farmData: null,
        cropData: [],
        farmerData: null,
        weatherData: null
      };
    }
  }

  /**
   * Clear the context cache for a specific farm or all farms
   * @param {string} farmId - Optional farm ID to clear specific cache
   */
  clearCache(farmId = null) {
    if (farmId) {
      Object.keys(this.contextCache).forEach(key => {
        if (key.startsWith(`${farmId}-`)) {
          delete this.contextCache[key];
        }
      });
    } else {
      this.contextCache = {};
    }
  }

  /**
   * Create a natural language summary of the farm context
   * @param {Object} context - Farm context data
   * @returns {string} - Human-readable summary
   */
  createContextSummary(context) {
    if (!context || !context.farm) return '';

    let summary = '';

    if (context.farmer) {
      summary += `${context.farmer.first_name || 'The farmer'} has a farm`;
    } else {
      summary += 'This is a farm';
    }

    if (context.farm.locationString) {
      summary += ` in ${context.farm.locationString}`;
    }

    summary += '. ';

    if (context.crops && context.crops.length > 0) {
      summary += `The farm grows ${context.crops.length} crop varieties including `;
      summary += context.crops.map(c => {
        const name = c.crop?.name || 'Unknown';
        const varietal = c.crop?.varietal || '';
        return varietal ? `${name} ${varietal}` : name;
      }).join(', ');
      summary += '. ';
    }

    if (context.weather) {
      summary += `Current weather: ${context.weather.temperature}°C, ${context.weather.humidity}% humidity, ${context.weather.conditions}. `;
    }

    if (context.issues && context.issues.length > 0) {
      const recentIssue = context.issues[0];
      summary += `The farm has a recent issue with ${recentIssue.diagnosis || recentIssue.issue_type} reported on ${new Date(recentIssue.reported_at).toLocaleDateString()}. `;
    }

    return summary;
  }
}

module.exports = new FarmContextAgent();