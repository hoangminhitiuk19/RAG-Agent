import { updateConversationId } from '../utils/conversationUIUtils.js';
import { saveConversation } from './conversationService.js';
import { addMessage, scrollToBottom, formatMarkdown, formatMetadata } from '../utils/messageDisplayUtils.js';
import { finalizeMessage } from '../utils/messageUtils.js';
import { setConversationId, getConversationId } from '../utils/state.js'; // Added import for state management

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
function appendMetadata(messageElement, metadata) {
    if (!messageElement || !metadata) return;
    
    // Find the message-content element
    const contentElement = messageElement.querySelector('.message-content');
    if (!contentElement) return;
    
    // Check if metadata element already exists
    let metadataElement = contentElement.querySelector('.message-metadata');
    if (!metadataElement) {
        // Create a new metadata element
        metadataElement = document.createElement('div');
        metadataElement.className = 'message-metadata';
        contentElement.appendChild(metadataElement);
    }
    
    // Add the formatted metadata (no import needed here anymore)
    metadataElement.innerHTML = formatMetadata(metadata);
    
    // Also store metadata as data attribute on the message element
    messageElement.dataset.metadata = typeof metadata === 'string' ? 
        metadata : JSON.stringify(metadata);
}

export async function processStreamingResponse(response, showTranslationNotice = false) {
    const chatMessages = document.getElementById('chat-messages');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let buffer = '', sources = [], followUpQuestions = [];
    let currentConversationId = getConversationId(); // Initialize with current ID from state

    try {
        currentMessage = currentMessageContent = null;
        currentMessageRawText = '';

        if (showTranslationNotice) {
            const translationNotice = document.createElement('div');
            translationNotice.className = 'translation-notice';
            translationNotice.innerHTML = '<i class="fas fa-language"></i> Query translated to English.';
            chatMessages.appendChild(translationNotice);
        }

        // Also check for conversation ID in response headers
        const headerConversationId = response.headers?.get('X-Conversation-Id');
        if (headerConversationId) {
            currentConversationId = headerConversationId;
            setConversationId(currentConversationId); // Update state
            updateConversationId(currentConversationId); // Update UI
            saveConversation(currentConversationId, false);
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
                            setConversationId(currentConversationId); // Update state
                            updateConversationId(currentConversationId); // Update UI
                            saveConversation(currentConversationId, false);
                            console.log('Conversation ID set to:', currentConversationId);
                        } else if (data.conversation_id && !currentConversationId) {
                            // Alternative format without type field
                            currentConversationId = data.conversation_id;
                            setConversationId(currentConversationId); // Update state
                            updateConversationId(currentConversationId); // Update UI
                            saveConversation(currentConversationId, false);
                            console.log('Alternative format: Conversation ID set to:', currentConversationId);
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
                            if (currentConversationId) {
                                saveConversation(currentConversationId, true, currentMessageRawText);
                            } else {
                                console.warn('No conversation ID available for completed message');
                            }
                        
                            if (sources.length > 0) appendSources(currentMessage, sources);
                            if (followUpQuestions.length > 0) appendFollowUpQuestions(currentMessage, followUpQuestions);
                            
                            // Add metadata to the message if available
                            if (data.metadata) {
                                appendMetadata(currentMessage, data.metadata);
                            }
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
    return { conversationId: currentConversationId, messageContent: currentMessageRawText };
}