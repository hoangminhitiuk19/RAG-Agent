import { addMessage } from '../utils/messageDisplayUtils.js';
import { processStreamingResponse } from './streamService.js';
import { translateToEnglish } from './translationService.js';
import { updateStatus } from '../utils/statusUtils.js';
import { getCurrentImageUrl, getConversationId, getUserProfileId, getFarmId, setConversationId } from '../utils/state.js';
import { saveConversation } from './conversationService.js';
import { API_URL } from '../config.js';

export async function sendMessage({ messageInput, sendButton, typingIndicator, statusIndicator }) {
    // Get values from state
    const currentConversationId = getConversationId();
    const currentImageUrl = getCurrentImageUrl();
    const userProfileId = getUserProfileId();
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
        
        // Prepare request data
        const requestData = {
            user_profile_id: userProfileId,
            farm_id: farmId,
            message: messageText
        };
        
        // Only add conversation_id if it exists
        if (currentConversationId) {
            requestData.conversation_id = currentConversationId;
            console.log('Using existing conversation ID:', currentConversationId);
        } else {
            console.log('Starting new conversation (no ID yet)');
        }
        
        // Add image URL if available
        if (currentImageUrl) {
            requestData.image_url = currentImageUrl;
            clearImagePreview();
        }
        
        console.log('Sending message with data:', requestData);
        
        // Make API request
        const response = await fetch(`${API_URL}/api/chat/message/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${await response.text()}`);
        }
        
        // Process the streaming response
        const { conversationId } = await processStreamingResponse(response);
        
        // If we have a conversation ID from the response that's different from our current one
        if (conversationId && conversationId !== currentConversationId) {
            console.log('Conversation ID updated:', conversationId);
            setConversationId(conversationId);
        }
        
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
    const imagePreview = document.getElementById('image-preview');
    if (imagePreview) {
        imagePreview.innerHTML = '';
    }
}