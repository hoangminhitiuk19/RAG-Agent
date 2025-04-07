// Updated farmService.js file
const dotenv = require('dotenv');
const { supabase } = require('../config/db');
// Load environment variables if not already loaded
if (!process.env.REGENX_SUPABASE_URL) {
  dotenv.config();
}


/**
 * Get admin unit details by admin_unit_id
 */
async function getAdminUnitById(adminUnitId) {
  try {
    const { data, error } = await supabase
      .from('admin_unit')
      .select('admin_unit_id, name, name_local, admin_unit_type, parent_id_fk')
      .eq('admin_unit_id', adminUnitId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching admin unit by id:', error);
    return null;
  }
}

/**
 * Get location hierarchy for an admin unit (traverses parent relationships)
 */
async function getLocationHierarchy(adminUnitId) {
  if (!adminUnitId) return [];
  
  try {
    const units = [];
    let currentId = adminUnitId;
    
    // Prevent infinite loops with a reasonable limit
    for (let i = 0; i < 10; i++) {
      if (!currentId) break;
      
      const unit = await getAdminUnitById(currentId);
      if (!unit) break;
      
      units.unshift(unit); // Add to beginning of array (build from country down)
      currentId = unit.parent_id_fk;
    }
    
    return units;
  } catch (error) {
    console.error('Error fetching location hierarchy:', error);
    return [];
  }
}

/**
 * Get location string from admin_unit_id (e.g. "Ho Chi Minh City, Vietnam")
 */
async function getLocationString(adminUnitId) {
  try {
    const hierarchy = await getLocationHierarchy(adminUnitId);
    if (hierarchy.length === 0) return '';
    
    return hierarchy
      .map(unit => unit.name || unit.name_local)
      .filter(Boolean)
      .join(', ');
  } catch (error) {
    console.error('Error creating location string:', error);
    return '';
  }
}

/**
 * Get farmer by user_profile_id
 */
async function getFarmerByUserProfileId(userProfileId) {
  try {
    const { data, error } = await supabase
      .from('farmer')
      .select('farmer_id, first_name')
      .eq('user_profile_id_fk', userProfileId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching farmer by user_profile_id:', error.message);
    return null;
  }
}

/**
 * Get all farms for a farmer
 */
async function getFarmByFarmerId(farmerId) {
  try {
    const { data, error } = await supabase
      .from('farm')
      .select('farm_id, coordinates, admin_unit_id_fk')
      .eq('farmer_id_fk', farmerId);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching farms by farmer_id:', error);
    return [];
  }
}

/**
 * Get farm crops and attach crop name/varietal from crop table
 */
async function getFarmCropsOfAFarm(farmId) {
  try {
    const { data: farmCrops, error: farmCropsError } = await supabase
      .from('farm_crop')
      .select('farm_crop_id, crop_id_fk, crop_count, planted_year')
      .eq('farm_id_fk', farmId);

    if (farmCropsError) throw farmCropsError;

    const currentYear = new Date().getFullYear();

    const enriched = await Promise.all(farmCrops.map(async (entry) => {
      const cropInfo = await getCropNameByCropId(entry.crop_id_fk);
      
      // Set defaults in case crop info is missing
      const name = cropInfo?.name || 'Unknown Crop';
      const varietal = cropInfo?.varietal || '';
      const full_crop_name = cropInfo?.full_crop_name || name;

      const age = entry.planted_year ? (currentYear - entry.planted_year) : 0;

      return {
        ...entry,
        crop: {
          name,
          varietal,
          full_crop_name
        },
        age
      };
    }));

    return enriched;
  } catch (error) {
    console.error('Error fetching crops of farm:', error);
    return [];
  }
}

/**
 * Get crop name and varietal by crop_id
 */
async function getCropNameByCropId(cropId) {
  try {
    const { data, error } = await supabase
      .from('crop')
      .select('crop_id, varietal, crop_species_id_fk')
      .eq('crop_id', cropId)
      .single();

    if (error) throw error;
    
    if (data && data.crop_species_id_fk) {
      // Get species information
      const { data: speciesData, error: speciesError } = await supabase
        .from('crop_species')
        .select('common_name, scientific_name')
        .eq('crop_species_id', data.crop_species_id_fk)
        .single();
        
      if (speciesError) throw speciesError;
      
      if (speciesData) {
        // Construct full crop name based on the new logic
        const fullName = data.varietal 
          ? `${speciesData.common_name} ${data.varietal}` 
          : speciesData.common_name;
          
        return {
          ...data,
          name: speciesData.common_name,
          scientific_name: speciesData.scientific_name,
          full_crop_name: fullName
        };
      }
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching crop by crop_id:', error);
    return null;
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
    return null;
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
    return null;
  }
}

/**
 * Get issue history for a farm
 * @param {string} farmId - Farm ID
 * @returns {Array} - List of issues with details
 */
async function getFarmIssueHistory(farmId) {
  try {
    const { data: issues, error: issuesError } = await supabase
      .from('farm_issue_history')
      .select(`*`)
      .eq('farm_id_fk', farmId)
      .order('reported_at', { ascending: false });

    if (issuesError) throw issuesError;

    if (issues && issues.length > 0) {
      const issuesWithDetails = await Promise.all(issues.map(async (issue) => {
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
    return [];
  }
}

/**
 * Get enriched context for a user using user_profile_id
 * @param {string} userProfileId - User profile ID
 * @returns {Object} - Enriched context
 */
async function getEnrichedUserContext(userProfileId) {
  try {
    const farmer = await getFarmerByUserProfileId(userProfileId);
    if (!farmer) return null;

    const farms = await getFarmsByFarmerId(farmer.farmer_id);
    if (!farms || farms.length === 0) return { farmer, farms: [], primaryFarm: null, primaryCrops: [] };

    const primaryFarm = farms[0];
    const primaryCrops = await getFarmCrops(primaryFarm.farm_id);

    primaryFarm.crops = primaryCrops.map(crop => {
      const year = crop.planted_year || new Date().getFullYear();
      const age = new Date().getFullYear() - year;
      return {
        ...crop,
        age,
        name: crop.crop?.name || 'Unknown',
        varietal: crop.crop?.varietal || 'Unknown'
      };
    });

    return {
      farmer,
      farms,
      primaryFarm,
      primaryCrops: primaryFarm.crops
    };
  } catch (error) {
    console.error('Error in getEnrichedUserContext:', error);
    return null;
  }
}

/**
 * Create a natural language summary of the user's context
 * @param {Object} context - The formatted user context
 * @returns {string} - A human-readable summary
 */
function createContextSummary(context) {
  if (!context || !context.farmer) return '';

  let summary = `${context.farmer.first_name || 'The farmer'} has ${context.farms?.length || 0} farm(s).`;

  if (context.primaryFarm) {
    const crops = context.primaryFarm.crops || [];
    if (crops.length > 0) {
      summary += ` The primary farm has ${crops.length} crop(s): ` +
        crops.map(c => `${c.name} (${c.age} yrs)`).join(', ') + '.';
    }
  }

  return summary;
}

module.exports = {
  getFarmerByUserProfileId,
  getFarmByFarmerId,
  getFarmCropsOfAFarm,
  getCropNameByCropId,
  storeFarmIssue,
  storeIssueDetail,
  getFarmIssueHistory,
  getEnrichedUserContext,
  createContextSummary,
  getAdminUnitById,
  getLocationHierarchy,
  getLocationString
};
