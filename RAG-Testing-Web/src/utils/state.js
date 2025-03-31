/**
 * Central state management for the application
 * This module maintains application state and provides getter/setter methods
 * to access and update it in a controlled manner
 */

// The central state object
const appState = {
    currentConversationId: null,
    conversations: [],
    currentImageUrl: null,
    userProfileId: null,
    farmId: null
};

// Conversation ID management
export function setConversationId(id) {
    appState.currentConversationId = id;
    return appState.currentConversationId;
}

export function getConversationId() {
    return appState.currentConversationId;
}

// Image URL management
export function setCurrentImageUrl(url) {
    appState.currentImageUrl = url;
    return appState.currentImageUrl;
}

export function clearCurrentImageUrl() {
    appState.currentImageUrl = null;
}

export function getCurrentImageUrl() {
    return appState.currentImageUrl;
}

// Conversations collection management
export function getConversations() {
    return appState.conversations;
}

export function setConversations(convos) {
    appState.conversations = convos;
}

export function addConversation(conversation) {
    appState.conversations.push(conversation);
    return appState.conversations;
}

export function updateConversation(id, updateData) {
    const index = appState.conversations.findIndex(c => c.id === id);
    if (index !== -1) {
        appState.conversations[index] = { 
            ...appState.conversations[index], 
            ...updateData 
        };
        return appState.conversations[index];
    }
    return null;
}

export function findConversation(id) {
    return appState.conversations.find(c => c.id === id);
}

// User management
export function setUserProfileId(id) {
    appState.userProfileId = id;
    return appState.userProfileId;
}

export function getUserProfileId() {
    return appState.userProfileId;
}

export function setFarmId(id) {
    appState.farmId = id;
    return appState.farmId;
}

export function getFarmId() {
    return appState.farmId;
}

// Full state export for debugging
export function getFullState() {
    return { ...appState };
}