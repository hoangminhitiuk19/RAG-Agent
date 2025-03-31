// Application initialization and event binding
import { API_URL, SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_USER_PROFILE_ID, DEFAULT_FARM_ID, APP_VERSION } from '@src/config.js';
import { setupDomElements } from '@src/utils/domUtils.js';
import { setupEventListeners } from '@src/utils/eventUtils.js';
import { sendMessage } from '@src/services/chatService.js';
import { startNewConversation, updateConversationId, updateActiveConversation } from '@src/utils/conversationUIUtils.js';
import { loadConversations } from '@src/services/conversationService.js';
import { checkApiHealth } from '@src/services/apiHealthService.js';
import { initializeUserData } from '@src/services/userService.js';
import { preventCaching } from '@src/utils/cacheUtils.js';
import { addTranslationNoticeStyles } from '@src/utils/uiEnhancements.js';
import { addDevReloadButton } from '@src/utils/devUtils.js';
import { setupDebugTools } from '@src/utils/debugUtils.js';
import { createSupabaseClient, validateSupabaseClient } from '@src/utils/supabaseService.js';
import { uploadImage } from '@src/services/imageService.js';
import { setUserProfileId, setFarmId, setConversations } from '@src/utils/state.js';


// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    console.log(`Starting app version: ${APP_VERSION}`);
    
    // Get DOM elements
    const domElements = setupDomElements();
    
    // Initialize utilities
    preventCaching();
    addTranslationNoticeStyles();
    addDevReloadButton();
    
    // Initialize services
    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Ensure Supabase client is working
    if (!validateSupabaseClient(supabase)) {
        console.error('Failed to initialize Supabase client. Some features may not work.');
    }
    
    // Get user ID and store in state
    const userProfileId = localStorage.getItem('currentUserProfileId') || DEFAULT_USER_PROFILE_ID;
    setUserProfileId(userProfileId);
    setFarmId(DEFAULT_FARM_ID);
    
    // Set up initial conversations array in state
    setConversations([]);
    
    // Setup event handlers
    setupEventListeners(
        domElements, 
        () => sendMessage({
            ...domElements
        }),
        startNewConversation,
        (file) => uploadImage(file, supabase)
    );
    
    // Load stored conversations
    loadConversations();
    
    // Initialize user data
    await initializeUserData();
    
    // Set up API health check
    checkApiHealth(domElements.statusIndicator);
    
    // Setup debug tools
    setupDebugTools(
        supabase, 
        API_URL,
        domElements.chatMessages
    );
});