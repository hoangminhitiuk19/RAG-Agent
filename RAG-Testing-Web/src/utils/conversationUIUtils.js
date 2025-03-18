import { addMessage } from './messageDisplayUtils.js';
import { setConversationId, getConversationId } from './state.js';

export function startNewConversation() {
    setConversationId(null);
    document.getElementById('conversation-id').textContent = 'New conversation';
    document.getElementById('chat-messages').innerHTML = '';
    addMessage('Hello! I\'m your Farming Assistant. How can I help you today?', 'agent');
    
    // Update UI to reflect the new conversation
    const activeItems = document.querySelectorAll('.conversation-item.active');
    activeItems.forEach(item => item.classList.remove('active'));
}

export function updateConversationId(id) {
    setConversationId(id);
    document.getElementById('conversation-id').textContent = id || 'New conversation';
}

export function updateActiveConversation(id) {
    const currentId = id || getConversationId();
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === currentId);
    });
}