import { formatTime } from './timeUtils.js'; // Assume you have a time formatting utility

let currentMessage = null;
let currentMessageContent = null;
let currentMessageRawText = '';

export function addMessageChunk(chunk, chatMessages, className = '') {
    if (!currentMessageContent) {
        if (!currentMessage) {
            hideTypingIndicator();

            currentMessage = document.createElement('div');
            currentMessage.className = 'message agent-message';

            // Add avatar
            const avatarElement = document.createElement('div');
            avatarElement.className = 'message-avatar';
            avatarElement.innerHTML = '<i class="fas fa-leaf"></i>';
            currentMessage.appendChild(avatarElement);

            const timeElement = document.createElement('div');
            timeElement.className = 'message-time';
            timeElement.textContent = formatTime();
            currentMessage.appendChild(timeElement);

            chatMessages.appendChild(currentMessage);
        }

        currentMessageContent = document.createElement('div');
        currentMessageContent.className = 'message-content';
        currentMessage.insertBefore(currentMessageContent, currentMessage.querySelector('.message-time'));

        currentMessageRawText = '';
    }

    currentMessageRawText += chunk;

    if (className === 'loading-text') {
        let loadingElement = currentMessageContent.querySelector(`.${className}`);
        if (!loadingElement) {
            loadingElement = document.createElement('div');
            loadingElement.className = className;
            currentMessageContent.appendChild(loadingElement);
        }
        loadingElement.textContent = chunk;
    } else {
        try {
            if (typeof marked !== 'undefined') {
                currentMessageContent.innerHTML = marked.parse(currentMessageRawText);
            } else {
                currentMessageContent.innerHTML = formatMarkdown(currentMessageRawText);
            }
        } catch (error) {
            console.error('Markdown parsing error:', error);
            currentMessageContent.innerHTML = formatMarkdown(currentMessageRawText);
        }
    }

    scrollToBottom();
}


export function finalizeMessage() {
    if (currentMessageContent && currentMessageRawText) {
        try {
            currentMessageContent.innerHTML = typeof marked !== 'undefined' 
                ? marked.parse(currentMessageRawText) 
                : formatMarkdown(currentMessageRawText);
        } catch (error) {
            console.error('Error in final markdown parsing:', error);
            currentMessageContent.innerHTML = formatMarkdown(currentMessageRawText);
        }
    }
    
    // Reset message state
    currentMessage = null;
    currentMessageContent = null;
    currentMessageRawText = '';
}

export function formatMarkdown(text) {
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>'); // Links
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic
    text = text.replace(/^\s*-\s+(.*?)$/gm, '<li>$1</li>').replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>'); // Lists
    text = `<p>${text.replace(/\n\n/g, '</p><p>')}</p>`; // Paragraphs
    return text;
}
