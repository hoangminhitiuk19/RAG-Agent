export function setupDomElements() {
    return {
        messageInput: document.getElementById('message-input'),
        sendButton: document.getElementById('send-button'),
        chatMessages: document.getElementById('chat-messages'),
        typingIndicator: document.getElementById('typing-indicator'),
        conversationId: document.getElementById('conversation-id'),
        statusIndicator: document.getElementById('status-indicator'),
        newChatButton: document.getElementById('new-chat-button'),
        conversationList: document.getElementById('conversation-list'),
        imageUpload: document.getElementById('image-upload'),
        imagePreview: document.getElementById('image-preview'),
    };
}