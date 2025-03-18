import { addMessage } from '../utils/messageDisplayUtils.js';
import { processStreamingResponse } from './streamService.js';
import { translateToEnglish } from './translationService.js';
import { updateStatus } from '../utils/statusUtils.js';
import { getCurrentImageUrl, getConversationId, getUserId, getFarmId } from '../utils/state.js';
import { API_URL } from '../config.js';  // Add this import if it's missing

export async function sendMessage({ messageInput, sendButton, typingIndicator, statusIndicator }) {
    // Get values from state
    const currentConversationId = getConversationId();
    const currentImageUrl = getCurrentImageUrl();
    const userId = getUserId();
    const farmId = getFarmId();
    
    const messageText = messageInput.value.trim();
    if (!messageText && !currentImageUrl) return;
    
    try {
        // Disable input and show typing indicator
        messageInput.disabled = true;
        sendButton.disabled = true;
        showTypingIndicator();
        
        // Add user message to chat
        addMessage(messageText, 'user');
        
        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';
        
        // Prepare request data
        const requestData = {
            user_id: userId,
            farm_id: farmId,
            message: messageText,
            conversation_id: currentConversationId
        };
        
        // Add image URL if available
        if (currentImageUrl) {
            requestData.image_url = currentImageUrl;
            clearImagePreview();
        }
        
        console.log('Sending message with data:', requestData);
        
        // Make API request with the correct endpoint
        const response = await fetch(`${API_URL}/api/chat/message/stream`, {  // Updated path
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${await response.text()}`);
        }
        
        // Process streamed response
        await processStreamingResponse(response);
        updateStatus('online');
        
    } catch (error) {
        console.error('Error sending message:', error);
        addMessage(`Error: ${error.message}`, 'system');
        updateStatus('offline');
    } finally {
        // Re-enable input
        messageInput.disabled = false;
        messageInput.focus();
        sendButton.disabled = false;
        hideTypingIndicator();
    }
}

function showTypingIndicator() {
    document.getElementById('typing-indicator').classList.remove('hidden');
}

function hideTypingIndicator() {
    document.getElementById('typing-indicator').classList.add('hidden');
}

function clearImagePreview() {
    document.getElementById('image-preview').innerHTML = '';
}