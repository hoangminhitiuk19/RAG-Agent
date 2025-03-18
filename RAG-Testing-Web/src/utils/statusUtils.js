/**
 * Update the status indicator in the UI
 * @param {string} status - Status to display (online, offline, connecting)
 */
export function updateStatus(status) {
    const statusIndicator = document.getElementById('status-indicator');
    if (!statusIndicator) return;

    // Remove existing status classes
    statusIndicator.classList.remove('online', 'offline', 'connecting');
    
    // Add the new status class
    statusIndicator.classList.add(status);
    
    // Update the title attribute for better UX
    let title = 'Connected';
    if (status === 'offline') title = 'Disconnected';
    if (status === 'connecting') title = 'Connecting...';
    
    statusIndicator.setAttribute('title', title);
}