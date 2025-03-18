// Updated farmService.js file
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables if not already loaded
if (!process.env.REGENX_SUPABASE_URL) {
  dotenv.config();
}

// Initialize Supabase client directly in this file
const supabaseUrl = process.env.REGENX_SUPABASE_URL;
const supabaseKey = process.env.REGENX_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Get farmer information by user ID
 * @param {string} userId - The user's ID
 * @returns {Object} - Farmer data
 */
async function getFarmerByUserId(userId) {
  try {
    // First get the user profile
    const { data: userProfile, error: userProfileError } = await supabase
      .from('user_profile')
      .select('user_profile_id')
      .eq('user_id_fk', userId)
      .single();
    
    if (userProfileError) throw userProfileError;
    if (!userProfile) return null;

    // Then get the farmer using the user_profile_id
    const { data: farmer, error: farmerError } = await supabase
      .from('farmer')
      .select('*')
      .eq('user_profile_id_fk', userProfile.user_profile_id)
      .single();
    
    if (farmerError) throw farmerError;
    return farmer;
  } catch (error) {
    console.error('Error fetching farmer data by user ID:', error);
    return null; // Return null instead of throwing to prevent app crashes
  }
}

/**
 * Get farmer information by ID
 * @param {string} farmerId - The farmer's ID
 * @returns {Object} - Farmer data
 */
async function getFarmerById(farmerId) {
  try {
    const { data, error } = await supabase
      .from('farmer')
      .select('*')
      .eq('farmer_id', farmerId)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching farmer data by ID:', error);
    return null; // Return null instead of throwing to prevent app crashes
  }
}

/**
 * Get all farms for a farmer
 * @param {string} farmerId - The farmer's ID
 * @returns {Array} - List of farms
 */
async function getFarmsByFarmerId(farmerId) {
  try {
    const { data, error } = await supabase
      .from('farm')
      .select('*')
      .eq('farmer_id_fk', farmerId);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching farms for farmer:', error);
    return []; // Return empty array instead of throwing to prevent app crashes
  }
}

/**
 * Get farm details by ID
 * @param {string} farmId - The farm's ID
 * @returns {Object} - Farm data including location and size
 */
async function getFarmById(farmId) {
  try {
    const { data, error } = await supabase
      .from('farm')
      .select(`
        farm_id,
        farm_size,
        farm_size_unit,
        country,
        province,
        municipality,
        city,
        district,
        commune,
        coordinates,
        farmer_id_fk
      `)
      .eq('farm_id', farmId)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching farm data:', error);
    return null; // Return null instead of throwing to prevent app crashes
  }
}

/**
 * Get crops for a specific farm
 * @param {string} farmId - The farm's ID
 * @returns {Array} - List of crops
 */
async function getFarmCrops(farmId) {
  try {
    // First, get farm_crop records
    const { data: farmCrops, error: farmCropsError } = await supabase
      .from('farm_crop')
      .select(`
        farm_crop_id,
        crop_id_fk,
        crop_count,
        planted_year
      `)
      .eq('farm_id_fk', farmId);
    
    if (farmCropsError) throw farmCropsError;
    if (!farmCrops || farmCrops.length === 0) return [];
    
    // For each farm_crop record, get the associated crop details
    const enrichedCrops = await Promise.all(farmCrops.map(async (farmCrop) => {
      // Get crop details
      const { data: crop, error: cropError } = await supabase
        .from('crop')
        .select('name, varietal')
        .eq('crop_id', farmCrop.crop_id_fk)
        .single();
      
      if (cropError) {
        console.error('Error fetching crop details:', cropError);
        return {
          ...farmCrop,
          crop: null
        };
      }
      
      return {
        ...farmCrop,
        crop
      };
    }));
    
    return enrichedCrops;
  } catch (error) {
    console.error('Error fetching farm crops:', error);
    return []; // Return empty array instead of throwing to prevent app crashes
  }
}

/**
 * Store a new farm issue
 * @param {Object} issueData - Issue details
 * @returns {Object} - Created issue data
 */
async function storeFarmIssue(issueData) {
  try {
    const {
      farm_id_fk,
      farm_crop_id_fk,
      issue_type,
      diagnosis,
      primary_cause,
      weather_snapshot
    } = issueData;
    
    const { data, error } = await supabase
      .from('farm_issue_history')
      .insert({
        farm_id_fk,
        farm_crop_id_fk,
        issue_type,
        diagnosis,
        primary_cause,
        weather_snapshot,
        status: 'open',
        reported_at: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    return data[0];
  } catch (error) {
    console.error('Error storing farm issue:', error);
    return null; // Return null instead of throwing to prevent app crashes
  }
}

/**
 * Store issue detail
 * @param {Object} detailData - Issue detail
 * @returns {Object} - Created detail data
 */
async function storeIssueDetail(detailData) {
  try {
    const {
      issue_id_fk,
      detail_type,
      symptoms,
      recommended_action,
      image_url
    } = detailData;
    
    const { data, error } = await supabase
      .from('farm_issue_history_detail')
      .insert({
        issue_id_fk,
        detail_type,
        symptoms,
        recommended_action,
        image_url,
        recorded_at: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    return data[0];
  } catch (error) {
    console.error('Error storing issue detail:', error);
    return null; // Return null instead of throwing to prevent app crashes
  }
}

/**
 * Get issue history for a farm
 * @param {string} farmId - Farm ID
 * @returns {Array} - List of issues with details
 */
async function getFarmIssueHistory(farmId) {
  try {
    // First, get the issues from farm_issue_history
    const { data: issues, error: issuesError } = await supabase
      .from('farm_issue_history')
      .select(`*`)
      .eq('farm_id_fk', farmId)
      .order('reported_at', { ascending: false });
    
    if (issuesError) throw issuesError;
    
    // Then for each issue, get its details
    if (issues && issues.length > 0) {
      const issuesWithDetails = await Promise.all(issues.map(async (issue) => {
        // Get details for this issue
        const { data: details, error: detailsError } = await supabase
          .from('farm_issue_history_detail')
          .select('*')
          .eq('issue_id_fk', issue.issue_id);
        
        if (detailsError) {
          console.error('Error fetching issue details:', detailsError);
          return {
            ...issue,
            farm_issue_history_detail: []
          };
        }
        
        return {
          ...issue,
          farm_issue_history_detail: details || []
        };
      }));
      
      return issuesWithDetails;
    }
    
    return issues || [];
  } catch (error) {
    console.error('Error fetching farm issue history:', error);
    return []; // Return empty array instead of throwing
  }
}

/**
 * Get enriched context for a user including farm and crop data
 * @param {string} userId - User ID
 * @param {string} specificFarmId - Optional specific farm ID to focus on
 * @returns {Object} - Enriched context
 */
async function getEnrichedUserContext(userId, specificFarmId = null) {
  try {
    // Get the farmer associated with this user ID
    const farmer = await getFarmerByUserId(userId);
    
    if (!farmer) {
      console.log(`No farmer found for user ID ${userId}`);
      return {
        farmer: null,
        farms: [],
        primaryFarm: null,
        primaryCrops: [],
        contextSummary: 'No farmer data available'
      };
    }
    
    // Get all farms for this farmer
    const farms = await getFarmsByFarmerId(farmer.farmer_id);
    
    if (!farms || farms.length === 0) {
      console.log(`No farms found for farmer ID ${farmer.farmer_id}`);
      return {
        farmer: farmer,
        farms: [],
        primaryFarm: null,
        primaryCrops: [],
        contextSummary: `${farmer.first_name || 'Farmer'} has no registered farms.`
      };
    }
    
    // Determine primary farm - either the specifically requested one, or the first one
    let primaryFarm = null;
    if (specificFarmId) {
      primaryFarm = farms.find(f => f.farm_id === specificFarmId);
    }
    
    // If no specific farm was found, use the first one
    if (!primaryFarm && farms.length > 0) {
      primaryFarm = farms[0];
    }
    
    // Get crops for the primary farm
    let primaryCrops = [];
    if (primaryFarm) {
      const farmCrops = await getFarmCrops(primaryFarm.farm_id);
      
      primaryCrops = farmCrops.map(crop => {
        const plantedYear = crop.planted_year || new Date().getFullYear() - 1;
        const currentYear = new Date().getFullYear();
        const age = currentYear - plantedYear;
        
        return {
          id: crop.farm_crop_id,
          crop_id: crop.crop_id_fk,
          name: crop.crop?.name || 'Coffee',
          varietal: crop.crop?.varietal || 'Unknown varietal',
          count: crop.crop_count || 0,
          plantedYear: plantedYear,
          age: age
        };
      });
      
      // Add crops to the primary farm object
      primaryFarm.crops = primaryCrops;
    }
    
    // Build a context summary
    let contextSummary = `${farmer.first_name || 'Farmer'} has ${farms.length} farm(s).`;
    
    if (primaryFarm) {
      const locationParts = [
        primaryFarm.city, 
        primaryFarm.district, 
        primaryFarm.commune, 
        primaryFarm.province, 
        primaryFarm.country
      ].filter(Boolean);
      
      const location = locationParts.length > 0 ? locationParts.join(', ') : 'unknown location';
      
      contextSummary += ` Primary farm is in ${location}`;
      
      if (primaryCrops.length > 0) {
        contextSummary += ` with ${primaryCrops.length} crop varieties (${primaryCrops.map(c => c.name).join(', ')}).`;
      } else {
        contextSummary += ' with no recorded crops.';
      }
    }
    
    return {
      farmer: farmer,
      farms: farms,
      primaryFarm: primaryFarm,
      primaryCrops: primaryCrops,
      contextSummary: contextSummary
    };
  } catch (error) {
    console.error('Error getting enriched user context:', error);
    return {
      error: error.message,
      contextSummary: 'Error retrieving farmer data'
    };
  }
}

/**
 * Create a natural language summary of the user's context
 * @param {Object} context - The formatted user context
 * @returns {string} - A human-readable summary
 */
function createContextSummary(context) {
  if (!context || !context.farmer) {
    return '';
  }
  
  let summary = '';
  
  // Farmer info
  if (context.farmer.name) {
    summary += `You're speaking with ${context.farmer.name}`;
    if (context.farmer.gender) {
      summary += `, a ${context.farmer.gender.toLowerCase()} farmer`;
    }
    if (context.farmer.age) {
      summary += ` who is ${context.farmer.age} years old`;
    }
    summary += '. ';
  }
  
  // Primary farm info
  if (context.primaryFarm) {
    summary += `${context.farmer.name || 'They'} has a ${context.primaryFarm.size || ''} ${context.primaryFarm.sizeUnit || ''} farm`;
    
    if (context.primaryFarm.name) {
      summary += ` in ${context.primaryFarm.name}`;
    }
    summary += '. ';
    
    // Crop information
    if (context.primaryFarm.crops && context.primaryFarm.crops.length > 0) {
      if (context.primaryFarm.crops.length === 1) {
        const crop = context.primaryFarm.crops[0];
        summary += `The farm grows ${crop.count || ''} ${crop.name || 'crops'} planted in ${crop.plantedYear || 'unknown year'}`;
        if (crop.age) {
          summary += ` (${crop.age} years old)`;
        }
        summary += '. ';
      } else {
        summary += `The farm grows multiple crops including `;
        const cropDescriptions = context.primaryFarm.crops.map(crop => {
          let desc = `${crop.count || ''} ${crop.name || 'unknown crop'}`;
          if (crop.age) {
            desc += ` (${crop.age} years old)`;
          }
          return desc;
        });
        
        if (cropDescriptions.length === 2) {
          summary += `${cropDescriptions[0]} and ${cropDescriptions[1]}`;
        } else {
          const lastCrop = cropDescriptions.pop();
          summary += `${cropDescriptions.join(', ')}, and ${lastCrop}`;
        }
        summary += '. ';
      }
    }
    
    // Average age
    if (context.primaryFarm.averageCropAge) {
      summary += `The average age of crops on this farm is ${context.primaryFarm.averageCropAge} years. `;
    }
  }
  
  // Additional farms
  if (context.farms && context.farms.length > 1) {
    summary += `${context.farmer.name || 'The farmer'} also has ${context.farms.length - 1} other farm${context.farms.length > 2 ? 's' : ''}. `;
  }
  
  return summary.trim();
}

module.exports = {
  getFarmerByUserId,
  getFarmerById,
  getFarmsByFarmerId,
  getFarmById,
  getFarmCrops,
  storeFarmIssue,
  storeIssueDetail,
  getFarmIssueHistory,
  getEnrichedUserContext
};

