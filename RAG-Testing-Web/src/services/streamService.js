import { updateConversationId } from '../utils/conversationUIUtils.js';
import { saveConversation } from './conversationService.js';
import { scrollToBottom } from '../utils/messageDisplayUtils.js';
import { addMessage } from '../utils/messageDisplayUtils.js';
import { finalizeMessage } from '../utils/messageUtils.js';

let currentMessage = null;
let currentMessageContent = null;
let currentMessageRawText = '';

function addMessageChunk(chunk, className = '') {
    const chatMessages = document.getElementById('chat-messages');
    
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
            timeElement.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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

function hideTypingIndicator() {
    document.getElementById('typing-indicator').classList.add('hidden');
}

function formatMarkdown(text) {
    if (!text) return '';
    
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>'); // Links
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic
    text = text.replace(/^\s*-\s+(.*?)$/gm, '<li>$1</li>').replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>'); // Lists
    text = `<p>${text.replace(/\n\n/g, '</p><p>')}</p>`; // Paragraphs
    return text;
}

function appendSources(messageElement, sources) {
    if (!sources?.length) return;

    const sourcesContainer = document.createElement('div');
    sourcesContainer.className = 'sources-container';
    sourcesContainer.innerHTML = '<h4>Sources</h4>';

    const sourcesList = document.createElement('ul');
    sourcesList.className = 'sources-list';

    sources.forEach(source => {
        const sourceItem = document.createElement('li');
        sourceItem.className = 'source-item';
        sourceItem.textContent = source.metadata?.filename || 'Unknown source';
        sourcesList.appendChild(sourceItem);
    });

    sourcesContainer.appendChild(sourcesList);
    messageElement.appendChild(sourcesContainer);
}

function appendFollowUpQuestions(messageElement, questions) {
    if (!questions?.length) return;

    const questionsContainer = document.createElement('div');
    questionsContainer.className = 'follow-up-container';

    questions.forEach(question => {
        const questionText = typeof question === 'string' ? question : question.text;

        const questionButton = document.createElement('button');
        questionButton.className = 'follow-up-button';
        questionButton.textContent = questionText;

        questionButton.addEventListener('click', () => {
            const messageInput = document.getElementById('message-input');
            messageInput.value = questionText;
            messageInput.dispatchEvent(new Event('input'));
            messageInput.focus();
        });

        questionsContainer.appendChild(questionButton);
    });

    messageElement.appendChild(questionsContainer);
}

export async function processStreamingResponse(response, showTranslationNotice = false) {
    const chatMessages = document.getElementById('chat-messages');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let buffer = '', sources = [], followUpQuestions = [];
    let currentConversationId = null;

    try {
        currentMessage = currentMessageContent = null;
        currentMessageRawText = '';

        if (showTranslationNotice) {
            const translationNotice = document.createElement('div');
            translationNotice.className = 'translation-notice';
            translationNotice.innerHTML = '<i class="fas fa-language"></i> Query translated to English.';
            chatMessages.appendChild(translationNotice);
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let eolIndex;
            while ((eolIndex = buffer.indexOf('\n\n')) >= 0) {
                const eventData = buffer.substring(0, eolIndex).trim();
                buffer = buffer.substring(eolIndex + 2);

                if (eventData.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(eventData.slice(6));
                        console.log('Received data:', data);

                        if (data.type === 'info' && data.conversation_id) {
                            currentConversationId = data.conversation_id;
                            updateConversationId(currentConversationId);
                            saveConversation(currentConversationId, false);
                        } else if (data.clear_loading) {
                            document.querySelectorAll('.message-content .loading-text').forEach(el => el.remove());
                        } else if (data.text_chunk) {
                            addMessageChunk(data.text_chunk, data.is_loading ? 'loading-text' : '');
                        } else if (data.sources) {
                            sources = data.sources;
                        } else if (data.follow_up_questions) {
                            followUpQuestions = data.follow_up_questions;
                        } else if (data.complete) {
                            finalizeMessage();
                            saveConversation(currentConversationId, true, currentMessageRawText);

                            if (sources.length > 0) appendSources(currentMessage, sources);
                            if (followUpQuestions.length > 0) appendFollowUpQuestions(currentMessage, followUpQuestions);
                        }
                    } catch (err) {
                        console.error('Error parsing event data:', err);
                    }
                }
            }
        }

        if (currentMessageContent) finalizeMessage();
    } catch (error) {
        console.error('Error processing stream:', error);
        hideTypingIndicator();
        addMessage(`Error: Could not process response: ${error.message}`, 'system');
    }

    scrollToBottom();
}