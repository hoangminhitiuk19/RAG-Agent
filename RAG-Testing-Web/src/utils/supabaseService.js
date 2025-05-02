/**
 * Supabase client initialization service
 */

/**
 * Creates and returns a Supabase client instance
 * @param {string} url - The Supabase project URL
 * @param {string} key - The Supabase anonymous key
 * @returns {Object} Supabase client instance
 */
export function createSupabaseClient(url, key) {
    try {
        console.log('Initializing Supabase with URL:', url);
        console.log('Key starts with:', key.substring(0, 5) + '...');
        
        if (!url || !key) {
            console.error('Missing Supabase credentials');
            return null;
        }
        
        // More reliable access to the CDN-loaded Supabase
        if (window.supabase) {
            return window.supabase.createClient(url, key);
        }
        
        console.error('Supabase client library not found');
        return null;
    } catch (error) {
        console.error('Failed to initialize Supabase client:', error);
        return null;
    }
}

/**
 * Helper function to check if Supabase client is properly initialized
 * @param {Object} client - Supabase client instance
 * @returns {boolean} Whether client is properly initialized
 */
export function validateSupabaseClient(client) {
    return client && typeof client.storage !== 'undefined';
}