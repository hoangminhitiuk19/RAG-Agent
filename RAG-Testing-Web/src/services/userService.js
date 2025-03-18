import { API_URL } from '../config.js';
import { getUserId, getFarmId } from '../utils/state.js';

export async function initializeUserData(userId) {
    try {
        const response = await fetch(`${API_URL}/api/chat/initialize-user`, {  // Updated path
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                farm_id: getFarmId()
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to initialize user data');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error initializing user data:', error);
        throw error;
    }
}
