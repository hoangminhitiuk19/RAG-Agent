const APP_VERSION = '1.0.2'; // Increment version

// Clear all browser caches - this is a comprehensive cache-clearing function
export async function clearAllCaches() {
    console.log('Forcefully clearing ALL caches...');
    
    // Specifically clear conversation data
    localStorage.removeItem('conversations');
    localStorage.removeItem('currentConversationId');
    
    // Clear localStorage except critical user settings
    const userProfileId = localStorage.getItem('currentUserProfileId');
    localStorage.clear();
    if (userProfileId) localStorage.setItem('currentUserProfileId', userProfileId);
    console.log('LocalStorage cleared (preserved user profile)');
    
    // Clear sessionStorage
    sessionStorage.clear();
    console.log('SessionStorage cleared');
    
    // Clear Cache API caches
    if ('caches' in window) {
        try {
            const cacheNames = await caches.keys();
            const deletionPromises = cacheNames.map(name => {
                console.log(`Deleting cache: ${name}`);
                return caches.delete(name);
            });
            await Promise.all(deletionPromises);
            console.log('Cache API caches cleared');
        } catch (e) {
            console.error('Error clearing Cache API caches:', e);
        }
    }
    
    // Clear IndexedDB databases
    if ('indexedDB' in window) {
        try {
            // Check if the function exists before calling it (for browser compatibility)
            if (typeof indexedDB.databases === 'function') {
                const databases = await indexedDB.databases();
                databases.forEach(db => {
                    console.log(`Deleting IndexedDB database: ${db.name}`);
                    try {
                        const deleteRequest = indexedDB.deleteDatabase(db.name);
                        deleteRequest.onsuccess = () => console.log(`Successfully deleted ${db.name}`);
                        deleteRequest.onerror = () => console.error(`Failed to delete ${db.name}`);
                    } catch (dbError) {
                        console.error(`Error deleting database ${db.name}:`, dbError);
                    }
                });
            } else {
                console.log('indexedDB.databases() not supported in this browser');
            }
        } catch (e) {
            console.error('Error clearing IndexedDB databases:', e);
        }
    }
    
    // Create unique marker to confirm this page loaded fresh
    localStorage.setItem('page_load_timestamp', Date.now().toString());
    localStorage.setItem('app_version', APP_VERSION);
    
    // Register intent to ignore history on page load
    localStorage.setItem('ignore_conversation_history', 'true');
    
    return true;
}

export function preventCaching() {
    // Always clear cache on page load
    console.log('Setting up cache prevention...');
    
    // Set timestamp for this page load
    localStorage.setItem('last-app-update', Date.now().toString());
    
    // Verify if we have freshly cleared cache
    if (localStorage.getItem('ignore_conversation_history') === 'true') {
        console.log('Fresh page load detected, history will be ignored');
        // Clear the flag after checking it
        localStorage.removeItem('ignore_conversation_history');
    }
    
    // Add cache busting parameter to the URL if not already present
    if (!window.location.href.includes('cache_bust=')) {
        const separator = window.location.href.includes('?') ? '&' : '?';
        // Don't actually modify location to avoid refresh loop
        // This is just for future navigation within the app
        window.cacheBustParam = `${separator}cache_bust=${Date.now()}`;
    }
    
    // Register unload handler to clear cache on page refresh
    window.addEventListener('beforeunload', () => {
        localStorage.setItem('page_unloading', 'true');
    });
}

// Helper to add cache busting to any URL in the app
export function addCacheBustToUrl(url) {
    if (!url) return url;
    try {
        const urlObj = new URL(url, window.location.origin);
        urlObj.searchParams.set('cb', Date.now().toString());
        return urlObj.toString();
    } catch (e) {
        // Fallback for relative URLs or parsing errors
        const bust = `cb=${Date.now()}`;
        return url.includes('?') ? `${url}&${bust}` : `${url}?${bust}`;
    }
}