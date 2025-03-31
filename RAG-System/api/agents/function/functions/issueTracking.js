const { supabase } = require('../../../config/db.js');

/**
 * Log a farm issue in the database
 * @param {Object} params - Issue details
 * @returns {Object} - Result of the operation
 */
async function logIssue(params) {
  const {
    farmId,
    issueType,
    issueName,
    severity,
    description,
    imageUrl = null,
    recommendedActions = [],
    detectionMethod = 'ai_analysis' // or 'user_reported'
  } = params;
  
  if (!farmId) {
    throw new Error('Farm ID is required');
  }
  
  if (!issueType || !issueName || !severity || !description) {
    throw new Error('Issue details are incomplete');
  }
  
  try {
    const { data, error } = await supabase
      .from('farm_issues')
      .insert({
        farm_id: farmId,
        issue_type: issueType,
        issue_name: issueName,
        severity: severity,
        description: description,
        image_url: imageUrl,
        recommended_actions: recommendedActions,
        detection_method: detectionMethod,
        status: 'open',
        created_at: new Date().toISOString()
      })
      .select();
    
    if (error) {
      throw error;
    }
    
    return {
      success: true,
      message: `Issue "${issueName}" logged successfully`,
      issueId: data[0].id
    };
  } catch (error) {
    console.error(`Error logging issue: ${error.message}`);
    throw error;
  }
}

/**
 * Get issue history for a farm
 * @param {Object} params - Query parameters
 * @returns {Array} - Issue history
 */
async function getIssueHistory(params) {
  const {
    farmId,
    limit = 10,
    status = 'all', // 'open', 'resolved', 'all'
    issueType = null
  } = params;
  
  if (!farmId) {
    throw new Error('Farm ID is required');
  }
  
  try {
    let query = supabase
      .from('farm_issues')
      .select('*')
      .eq('farm_id', farmId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    
    if (issueType) {
      query = query.eq('issue_type', issueType);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw error;
    }
    
    return {
      issues: data,
      count: data.length
    };
  } catch (error) {
    console.error(`Error retrieving issue history: ${error.message}`);
    throw error;
  }
}

module.exports = { logIssue, getIssueHistory };