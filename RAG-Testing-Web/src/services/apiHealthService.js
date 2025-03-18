import { API_URL } from '../config.js';
import { updateStatus } from '../utils/statusUtils.js';

export async function checkApiHealth(statusIndicator) {
    try {
        // Set initial status to connecting
        updateStatus('connecting');
        
        // Check if API is accessible
        const response = await fetch(`${API_URL}/health`, {  // Updated path
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            updateStatus('online');
        } else {
            updateStatus('offline');
        }
    } catch (error) {
        console.error('API Health check failed:', error);
        updateStatus('offline');
    }
}
