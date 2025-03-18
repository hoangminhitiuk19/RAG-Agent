export function addMessage(message, sender = 'agent', timestamp = new Date(), imageUrl = null) {
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

    const timeElement = document.createElement('div');
    timeElement.className = 'message-time';
    timeElement.textContent = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    messageElement.appendChild(timeElement);

    chatMessages.appendChild(messageElement);
    scrollToBottom();
    
    return messageElement;
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
