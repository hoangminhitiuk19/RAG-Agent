import { testQdrant, testConversationHistory } from '../services/apiService.js';
import { clearAllConversations } from './devUtils.js';
import { recoverImages } from '../services/imageService.js';
import { testSupabaseUpload } from '../services/testService.js';
import { loadConversation } from '../services/conversationService.js';
import { getConversationId, getCurrentImageUrl, getFullState } from './state.js';

export function logAvailableFunctions() {
    console.log('Debug functions defined directly on window object:', {
        testQdrant: typeof window.testQdrant === 'function',
        testConversationHistory: typeof window.testConversationHistory === 'function',
        checkConversationEndpoint: typeof window.checkConversationEndpoint === 'function',
        inspectEnrichedContext: typeof window.inspectEnrichedContext === 'function',
        testContextInAgentResponse: typeof window.testContextInAgentResponse === 'function',
    });
}

export function setupDebugTools(supabase, API_URL, chatMessages) {
    // Add state inspection
    window.getState = getFullState;
    
    // Attach debug functions to window object for console access
    window.clearAllConversations = clearAllConversations;
    window.recoverImages = () => recoverImages(supabase);
    window.testSupabaseUpload = (file) => testSupabaseUpload(supabase, file, getCurrentImageUrl());
    window.testQdrant = testQdrant;
    window.testConversationHistory = (id) => testConversationHistory(id || getConversationId());
    
    // Add the loadConversation function
    window.loadConversation = async (id) => {
        return loadConversation(id, API_URL, chatMessages);
    };
    
    logAvailableFunctions();
}