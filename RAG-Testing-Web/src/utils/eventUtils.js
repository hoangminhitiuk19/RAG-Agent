import { handleImageUpload } from '../services/imageService.js';
import { checkApiHealth } from '../services/apiHealthService.js';
import { getCurrentImageUrl } from './state.js';  // Add this import

export function setupEventListeners(domElements, sendMessage, startNewConversation, uploadImageFunc) {
    const { messageInput, sendButton, newChatButton, imageUpload } = domElements;

    // Message input events
    messageInput.addEventListener('input', () => {
        sendButton.disabled = messageInput.value.trim() === '';

        // Auto-resize textarea
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const currentImageUrl = getCurrentImageUrl();  // Use the imported function
            if (!sendButton.disabled || currentImageUrl) {
                sendMessage();
            }
        }
    });

    sendButton.addEventListener('click', sendMessage);
    newChatButton.addEventListener('click', startNewConversation);

    // Setup image upload
    setupImageUpload(imageUpload, uploadImageFunc);

    // Handle paste events
    document.addEventListener('paste', (e) => handlePaste(e, uploadImageFunc));
}

// Set up image upload handling
function setupImageUpload(imageUpload, uploadImageFunc) {
    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadImageFunc(file);
        e.target.value = ''; // Reset input
    });
}

// Handle paste events for image uploads
function handlePaste(e, uploadImageFunc) {
    const messageInput = document.getElementById('message-input');
    
    if (document.activeElement !== messageInput && !e.target.closest('.chat-interface')) return;

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            const blob = items[i].getAsFile();
            uploadImageFunc(blob);
            break;
        }
    }
}