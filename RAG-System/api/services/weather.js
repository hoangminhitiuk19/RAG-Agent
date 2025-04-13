const axios = require('axios');
const { getConfig } = require('../config');

/**
 * Weather service for fetching and processing weather data
 */
class WeatherService {
  constructor(config = {}) {
    const defaultConfig = getConfig();
    this.apiKey = config.apiKey || process.env.WEATHER_API_KEY || defaultConfig.weatherApiKey;
    this.baseUrl = config.baseUrl || defaultConfig.weatherBaseUrl;
    this.units = config.units || 'metric'; // Use metric by default
  }


  /**
   * Get current weather data for coordinates
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Object} - Weather data
   */
  async getCurrentWeatherByCoordinates(lat, lon) {
    try {
      console.log(`Getting weather data for coordinates lat=${lat}, lon=${lon}`);
      
      const response = await axios.get(
        `${this.baseUrl}/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=${this.units}`
      );
      
      return this._formatWeatherResponse(response.data);
    } catch (error) {
      console.error('Weather API error:', error.message);
      return null;
    }
  }

  /**
   * Get current weather for a city
   * @param {string} city - City name
   * @returns {Promise<Object>} - Weather data
   */
  async getWeatherByCity(city) {
    try {
      console.log(`Getting weather for city=${city}`);
      
      const url = `${this.baseUrl}/weather?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=${this.units}`;
      const response = await axios.get(url);
      
      return this._formatWeatherResponse(response.data);
    } catch (error) {
      console.error(`Error fetching weather for ${city}:`, error.message);
      return null;
    }
  }

  /**
   * Get weather forecast
   * @param {Object} params - Either {lat, lon} or {city, countryCode}
   * @param {number} days - Number of days (default: 5)
   * @returns {Array} - Weather forecast
   */
  async getForecast(params, days = 5) {
    try {
      let queryParams;
      
      if (params.lat && params.lon) {
        queryParams = `lat=${params.lat}&lon=${params.lon}`;
      } else if (params.city) {
        queryParams = `q=${params.city}${params.countryCode ? ',' + params.countryCode : ''}`;
      } else {
        throw new Error('Invalid parameters for forecast');
      }
      
      const response = await axios.get(
        `${this.baseUrl}/forecast?${queryParams}&appid=${this.apiKey}&units=${this.units}`
      );
      
      // Process forecast data (simplify for our use case)
      const forecast = response.data.list.map(item => ({
        timestamp: item.dt_txt,
        temperature: item.main.temp,
        humidity: item.main.humidity,
        conditions: item.weather[0].main,
        description: item.weather[0].description,
        wind_speed: item.wind.speed,
        feels_like: item.main.feels_like,
        pressure: item.main.pressure
      }));
      
      return forecast;
    } catch (error) {
      console.error('Weather forecast API error:', error.message);
      return [];
    }
  }

  /**
   * Check if weather conditions are favorable for disease development
   * @param {Object} weatherData - Weather data 
   * @returns {Object} - Risk assessment
   */
  assessDiseaseRisk(weatherData) {
    if (!weatherData) return { risk: 'unknown', reasons: ['No weather data available'] };
    
    let risk = 'low';
    const reasons = [];
    
    // High humidity increases risk of fungal diseases
    if (weatherData.humidity > 80) {
      risk = 'high';
      reasons.push('High humidity (>80%)');
    } else if (weatherData.humidity > 70) {
      if (risk === 'low') risk = 'medium';
      reasons.push('Elevated humidity (>70%)');
    }
    
    // Warm temperatures with high humidity are ideal for many diseases
    if (weatherData.temperature > 20 && weatherData.humidity > 70) {
      risk = 'high';
      reasons.push('Warm temperature with high humidity');
    }
    
    // Rainy conditions also increase risk
    if (weatherData.conditions === 'Rain' || weatherData.conditions === 'Drizzle') {
      risk = 'high';
      reasons.push('Rainy conditions');
    } else if (weatherData.conditions === 'Clouds' && weatherData.humidity > 70) {
      if (risk === 'low') risk = 'medium';
      reasons.push('Cloudy with high humidity');
    }
    
    return {
      risk,
      reasons: reasons.length > 0 ? reasons : ['Normal weather conditions']
    };
  }

  
  /**
   * Format weather API response to standardized format
   * @private
   */
  _formatWeatherResponse(data) {
    return {
      temperature: data.main.temp,
      feels_like: data.main.feels_like,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      conditions: data.weather[0].main,
      description: data.weather[0].description,
      wind_speed: data.wind.speed,
      visibility: data.visibility,
      country: data.sys.country,
      city: data.name,
      timestamp: new Date(data.dt * 1000).toISOString()
    };
  }
}

// Create a singleton instance of the service
const weatherService = new WeatherService();

// Export the class, singleton instance, and the assessDiseaseRisk function for direct use
module.exports = {
  WeatherService,
  weatherService,
  // Export the disease risk assessment function directly for convenience
  assessDiseaseRisk: (weatherData) => weatherService.assessDiseaseRisk(weatherData)
};