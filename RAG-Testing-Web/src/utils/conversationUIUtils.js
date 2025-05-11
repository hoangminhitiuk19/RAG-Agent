import { addMessage } from './messageDisplayUtils.js';
import { setConversationId, getConversationId } from './state.js';


// Add this new function for clipboard copy functionality
function setupConversationIdCopy() {
    const conversationIdEl = document.getElementById('conversation-id');
    if (conversationIdEl) {
        conversationIdEl.addEventListener('click', function() {
            // Get the text content
            const idText = this.textContent.trim();
            
            // Only attempt to copy if it's not "New conversation"
            if (idText !== 'New conversation') {
                navigator.clipboard.writeText(idText)
                    .then(() => {
                        // Visual feedback
                        const originalBackground = this.style.background;
                        this.style.background = 'rgba(255, 255, 255, 0.3)';
                        
                        // Add temporary tooltip
                        const originalTitle = this.getAttribute('title') || '';
                        this.setAttribute('data-original-title', originalTitle);
                        this.setAttribute('title', 'Copied to clipboard!');
                        
                        // Reset after animation
                        setTimeout(() => {
                            this.style.background = originalBackground;
                            this.setAttribute('title', this.getAttribute('data-original-title') || '');
                            this.removeAttribute('data-original-title');
                        }, 1500);
                    })
                    .catch(err => console.error('Could not copy text: ', err));
            }
        });
    }
}

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

// Export the new function
export function initUI() {
    setupConversationIdCopy();
}