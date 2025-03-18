/**
 * Format a date object or timestamp to a readable time string
 * @param {Date|number} date - Date object or timestamp
 * @returns {string} Formatted time string
 */
export function formatTime(date) {
    if (!date) {
        return 'Just now';
    }
    
    if (!(date instanceof Date)) {
        date = new Date(date);
    }
    
    const now = new Date();
    const diffMs = now - date;
    
    // Less than 1 minute
    if (diffMs < 60000) {
        return 'Just now';
    }
    
    // Less than 1 hour
    if (diffMs < 3600000) {
        const minutes = Math.floor(diffMs / 60000);
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    // Less than 1 day
    if (diffMs < 86400000) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Less than 7 days
    if (diffMs < 604800000) {
        const options = { weekday: 'short', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString([], options);
    }
    
    // Older
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleString([], options);
}

/**
 * Get a simple timestamp for the current time
 * @returns {string} Formatted current time
 */
export function getCurrentTimeString() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}