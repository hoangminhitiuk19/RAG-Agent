export function addMessage(message, sender = 'agent', timestamp = new Date(), imageUrl = null, metadata = null) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}-message`;

    const avatarElement = document.createElement('div');
    avatarElement.className = 'message-avatar';
    avatarElement.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' 
        : sender === 'system' ? '<i class="fas fa-exclamation-circle"></i>' 
        : '<i class="fas fa-leaf"></i>';
    messageElement.appendChild(avatarElement);

    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';

    if (imageUrl) {
        contentElement.innerHTML = `<div class="message-image-container"><img src="${imageUrl}" class="message-image" alt="Shared image"></div>`;
    }
    
    contentElement.innerHTML += sender === 'user' ? message : formatMarkdown(message);

    
    messageElement.appendChild(contentElement);

    chatMessages.appendChild(messageElement);
    scrollToBottom();
    
    return messageElement;
}

/**
 * Format metadata object into readable HTML
 * @param {Object|string} metadata - The metadata to format
 * @returns {string} Formatted HTML string
 */
export function formatMetadata(metadata) {
    if (!metadata) return '';
    
    // If metadata is a string, try to parse it as JSON
    if (typeof metadata === 'string') {
        try {
            metadata = JSON.parse(metadata);
        } catch (e) {
            return `<div class="metadata-row"><span class="metadata-label">Raw:</span>${metadata}</div>`;
        }
    }
    
    // Display different fields based on what's available
    const result = [];
    
    // Core message info
    if (metadata.id) {
        result.push(`<div class="metadata-row"><span class="metadata-label">Message ID:</span>${metadata.id}</div>`);
    }
    
    if (metadata.conversation_id) {
        result.push(`<div class="metadata-row"><span class="metadata-label">Conversation:</span>${metadata.conversation_id}</div>`);
    }
    
    if (metadata.timestamp || metadata.inserted_at) {
        const timestamp = metadata.timestamp || metadata.inserted_at;
        result.push(`<div class="metadata-row"><span class="metadata-label">Timestamp:</span>${new Date(timestamp).toLocaleString()}</div>`);
    }
    
    // Additional metadata fields
    if (metadata.topic) {
        result.push(`<div class="metadata-row"><span class="metadata-label">Topic:</span>${metadata.topic}</div>`);
    }
    
    if (metadata.source) {
        result.push(`<div class="metadata-row"><span class="metadata-label">Source:</span>${metadata.source}</div>`);
    }
    
    if (metadata.role) {
        result.push(`<div class="metadata-row"><span class="metadata-label">Role:</span>${metadata.role}</div>`);
    }
    
    // If there's a nested metadata object, show that too
    if (metadata.metadata && typeof metadata.metadata === 'object') {
        const nestedMeta = Object.entries(metadata.metadata)
            .filter(([key, val]) => val !== null && val !== undefined)
            .map(([key, val]) => {
                const value = typeof val === 'object' ? JSON.stringify(val) : val;
                return `<div class="metadata-row"><span class="metadata-label">${key}:</span>${value}</div>`;
            })
            .join('');
        
        if (nestedMeta) {
            result.push(`<div class="metadata-row"><span class="metadata-label">Additional Metadata:</span></div>`);
            result.push(nestedMeta);
        }
    }
    
    // If there is extended payload data
    if (metadata.payload && typeof metadata.payload === 'object') {
        result.push(`<div class="metadata-row"><span class="metadata-label">Payload:</span>${JSON.stringify(metadata.payload, null, 2)}</div>`);
    }
    
    // If there's nothing to show, give basic info
    if (result.length === 0) {
        return `<div class="metadata-row">No detailed metadata available</div>`;
    }
    
    return result.join('');
}

export function formatMarkdown(text) {
    if (!text) return '';
    
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>'); // Links
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic
    text = text.replace(/^\s*-\s+(.*?)$/gm, '<li>$1</li>').replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>'); // Lists
    text = `<p>${text.replace(/\n\n/g, '</p><p>')}</p>`; // Paragraphs
    return text;
}

export function scrollToBottom() {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

