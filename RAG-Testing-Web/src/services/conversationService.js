import { addMessage } from '../utils/messageDisplayUtils.js';
import { getConversationId, setConversationId, getConversations, setConversations, addConversation, updateConversation } from '../utils/state.js';

export function loadConversations() {
    try {
        const storedConversations = localStorage.getItem('conversations');
        if (storedConversations) {
            const parsedConversations = JSON.parse(storedConversations);
            setConversations(parsedConversations);
            renderConversationList();
        }
        
        const storedConversationId = localStorage.getItem('currentConversationId');
        if (storedConversationId) {
            setConversationId(storedConversationId);
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

export function saveConversation(conversationId, isComplete, message) {
    if (!conversationId) return;
    
    try {
        const conversations = getConversations();
        const existingIndex = conversations.findIndex(c => c.id === conversationId);
        
        if (existingIndex >= 0) {
            // Update existing conversation
            updateConversation(conversationId, {
                lastUpdated: new Date().toISOString(),
                isComplete: isComplete || conversations[existingIndex].isComplete
            });
        } else {
            // Add new conversation
            addConversation({
                id: conversationId,
                title: createTitle(message),
                lastUpdated: new Date().toISOString(),
                isComplete: isComplete || false
            });
        }
        
        // Save to localStorage
        localStorage.setItem('conversations', JSON.stringify(getConversations()));
        localStorage.setItem('currentConversationId', conversationId);
        
        // Update UI
        renderConversationList();
        
    } catch (error) {
        console.error('Error saving conversation:', error);
    }
}

function createTitle(message) {
    if (!message) return 'New conversation';
    
    // Create a title from the first few words of the message
    const words = message.trim().split(' ');
    const titleWords = words.slice(0, 5);
    let title = titleWords.join(' ');
    
    if (words.length > 5) {
        title += '...';
    }
    
    return title;
}

export function renderConversationList() {
    const conversations = getConversations();
    const conversationList = document.getElementById('conversation-list');
    const currentId = getConversationId();
    
    if (!conversationList) return;
    
    // Clear existing list
    conversationList.innerHTML = '';
    
    // Sort by last updated, most recent first
    const sortedConversations = [...conversations].sort((a, b) => 
        new Date(b.lastUpdated) - new Date(a.lastUpdated)
    );
    
    // Add conversations to list
    sortedConversations.forEach(conversation => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.dataset.id = conversation.id;
        
        if (conversation.id === currentId) {
            item.classList.add('active');
        }
        
        item.innerHTML = `
            <span class="conversation-title">${conversation.title}</span>
            <span class="conversation-time">${formatDate(conversation.lastUpdated)}</span>
        `;
        
        item.addEventListener('click', () => loadConversation(conversation.id));
        conversationList.appendChild(item);
    });
}


function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    
    // Today's date
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Within the last week
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    if (date > oneWeekAgo) {
        const options = { weekday: 'short' };
        return date.toLocaleDateString([], options);
    }
    
    // Older dates
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString([], options);
}

export async function loadConversation(id, apiUrl, chatMessages) {
    try {
        setConversationId(id);
        localStorage.setItem('currentConversationId', id);
        
        // Update UI to show active conversation
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === id);
        });
        
        // Update conversation ID display
        document.getElementById('conversation-id').textContent = id;
        
        // Clear messages
        chatMessages.innerHTML = '';
        
        // Add loading message
        const loadingMessage = document.createElement('div');
        loadingMessage.className = 'system-message';
        loadingMessage.textContent = 'Loading conversation...';
        chatMessages.appendChild(loadingMessage);
        
        // Fetch conversation history
        const response = await fetch(`${apiUrl}/conversations/${id}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load conversation: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Remove loading message
        chatMessages.removeChild(loadingMessage);
        
        // Display messages
        if (data && data.messages && data.messages.length) {
            data.messages.forEach(msg => {
                addMessage(msg.content, msg.role);
            });
        } else {
            addMessage('No messages found in this conversation.', 'system');
        }
        
        return data;
        
    } catch (error) {
        console.error('Error loading conversation:', error);
        addMessage(`Error: ${error.message}`, 'system');
        return null;
    }
}