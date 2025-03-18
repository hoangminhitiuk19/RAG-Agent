const axios = require('axios');
const dotenv = require('dotenv');

// Ensure environment variables are loaded
if (!process.env.WEATHER_API_KEY) {
  dotenv.config();
}

/**
 * Get current weather data for a location
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Object} - Weather data
 */
async function getCurrentWeather(lat, lon) {
  try {
    // Log debugging info
    console.log(`Weather API: Getting weather data for coordinates lat=${lat}, lon=${lon}`);
    console.log(`Weather API key length: ${process.env.WEATHER_API_KEY ? process.env.WEATHER_API_KEY.length : 0}`);

    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}&units=metric`
    );
    
    // Structure response
    return {
      temperature: response.data.main.temp,
      feels_like: response.data.main.feels_like,
      humidity: response.data.main.humidity,
      pressure: response.data.main.pressure,
      conditions: response.data.weather[0].main,
      description: response.data.weather[0].description,
      wind_speed: response.data.wind.speed,
      visibility: response.data.visibility,
      country: response.data.sys.country,
      city: response.data.name,
      timestamp: new Date(response.data.dt * 1000).toISOString() // Convert UNIX timestamp to ISO
    };
  } catch (error) {
    console.error('Weather API error:', error);
    return null; // Return null instead of throwing to gracefully handle missing weather data
  }
}

/**
 * Get weather forecast for the next few days
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Array} - Weather forecast
 */
async function getWeatherForecast(lat, lon) {
  try {
    // Fixed endpoint to use the forecast endpoint instead of current weather
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}&units=metric`
    );
    
    // Process forecast data (simplify for our use case)
    const forecast = response.data.list.map(item => ({
      timestamp: item.dt_txt,
      temperature: item.main.temp,
      humidity: item.main.humidity,
      conditions: item.weather[0].main,
      description: item.weather[0].description,
      wind_speed: item.wind.speed
    }));
    
    return forecast;
  } catch (error) {
    console.error('Weather forecast API error:', error);
    return []; // Return empty array instead of throwing
  }
}

/**
 * Check if weather conditions are favorable for disease development
 * @param {Object} weatherData - Weather data 
 * @returns {Object} - Risk assessment
 */
function assessDiseaseRisk(weatherData) {
  if (!weatherData) return { risk: 'unknown', reason: 'No weather data available' };
  
  let risk = 'low';
  const reasons = [];
  
  // High humidity increases risk of fungal diseases
  if (weatherData.humidity > 80) {
    risk = 'high';
    reasons.push('High humidity (>80%)');
  } else if (weatherData.humidity > 70) {
    risk = 'medium';
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
    risk = risk === 'high' ? 'high' : 'medium';
    reasons.push('Cloudy conditions with high humidity');
  }
  
  return {
    risk,
    reasons: reasons.length > 0 ? reasons : ['Normal weather conditions']
  };
}

/**
 * Get weather data by city name
 * @param {string} cityName - City name
 * @param {string} countryCode - Optional country code (2-letter)
 * @returns {Object} - Weather data
 */
async function getWeatherByCity(cityName, countryCode = '') {
    try {
      // Get the API key from environment variables
      const apiKey = process.env.WEATHER_API_KEY;
      
      // Log debugging info
      console.log(`Weather API: Getting weather for city=${cityName}, country=${countryCode || 'none'}`);
      console.log(`Weather API Key exists:`, !!apiKey);
      
      if (!apiKey) {
        throw new Error('Weather API key is missing from environment variables');
      }
      
      let url;
      if (countryCode) {
        url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)},${countryCode}&appid=${apiKey}&units=metric`;
      } else {
        url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&appid=${apiKey}&units=metric`;
      }
      
      console.log(`Making request to: ${url.replace(apiKey, 'API_KEY')}`);
      
      const response = await axios.get(url);
      
      return {
        temperature: response.data.main.temp,
        feels_like: response.data.main.feels_like,
        humidity: response.data.main.humidity,
        pressure: response.data.main.pressure,
        conditions: response.data.weather[0].main,
        description: response.data.weather[0].description,
        wind_speed: response.data.wind.speed,
        visibility: response.data.visibility,
        country: response.data.sys.country,
        city: response.data.name,
        timestamp: new Date(response.data.dt * 1000).toISOString()
      };
    } catch (error) {
      console.error('Weather API error:', error.message);
      return null;
    }
  }

module.exports = {
  getCurrentWeather,
  getWeatherForecast,
  assessDiseaseRisk,
  getWeatherByCity
};