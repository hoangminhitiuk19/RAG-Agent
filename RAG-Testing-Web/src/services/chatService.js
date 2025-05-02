import { addMessage } from '../utils/messageDisplayUtils.js';
import { processStreamingResponse } from './streamService.js';
import { translateToEnglish } from './translationService.js';
import { updateStatus } from '../utils/statusUtils.js';
import { getCurrentImageUrl, getConversationId, getUserProfileId, getFarmId, setConversationId, setCurrentImageUrl } from '../utils/state.js';
import { saveConversation } from './conversationService.js';
import { API_URL } from '../config.js';

export async function sendMessage({ messageInput, sendButton, typingIndicator, statusIndicator }) {
    const currentConversationId = getConversationId();
    const currentImageUrl = getCurrentImageUrl();
    const userProfileId = getUserProfileId();
    const farmId = getFarmId();

    const messageText = messageInput.value.trim();

    // ✅ Only send if at least one input is provided
    if (!messageText && !currentImageUrl) return;

    try {
        messageInput.disabled = true;
        sendButton.disabled = true;
        showTypingIndicator();

        // Add user message to chat only if there's text
        let userMessageHtml = '';

        if (messageText) {
            userMessageHtml += `<p>${messageText}</p>`;
        }

        if (currentImageUrl) {
            userMessageHtml += `<img src="${currentImageUrl}" alt="Uploaded image" style="max-width: 200px; border-radius: 6px; margin-top: 8px;" />`;
        }

        // ✅ Add combined message (text and/or image)
        const userMetadata = {
            role: 'user',
            timestamp: new Date().toISOString(),
            source: 'client',
            content: messageText,
            image_url: currentImageUrl
        };
        
        addMessage(userMessageHtml, 'user', new Date(), null, userMetadata);

        // Clear input field
        messageInput.value = '';

        const requestData = {
            user_profile_id: userProfileId,
            farm_id: farmId
        };

        if (messageText) {
            requestData.message = messageText;
        }

        if (currentConversationId) {
            requestData.conversation_id = currentConversationId;
            console.log('Using existing conversation ID:', currentConversationId);
        } else {
            console.log('Starting new conversation (no ID yet)');
        }

        if (currentImageUrl) {
            requestData.image_url = currentImageUrl;

            // ✅ Clear image after sending
            clearImagePreview();
            setCurrentImageUrl(null); // This prevents reusing image in next request
        }

        console.log('📤 Sending message with data:', requestData);

        const response = await fetch(`${API_URL}/api/chat/message/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${await response.text()}`);
        }

        const { conversationId } = await processStreamingResponse(response);

        if (conversationId && conversationId !== currentConversationId) {
            console.log('🔄 Conversation ID updated:', conversationId);
            setConversationId(conversationId);
        }

        updateStatus('online');

    } catch (error) {
        console.error('❌ Error sending message:', error);
        addMessage(`Error: ${error.message}`, 'system');
        updateStatus('offline');
    } finally {
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