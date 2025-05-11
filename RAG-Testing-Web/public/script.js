// Application initialization and event binding
import { API_URL, SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_USER_PROFILE_ID, DEFAULT_FARM_ID, APP_VERSION } from '@src/config.js';
import { setupDomElements } from '@src/utils/domUtils.js';
import { setupEventListeners } from '@src/utils/eventUtils.js';
import { sendMessage } from '@src/services/chatService.js';
import { startNewConversation, updateConversationId, updateActiveConversation, initUI } from '@src/utils/conversationUIUtils.js';
import { loadConversations } from '@src/services/conversationService.js';
import { checkApiHealth } from '@src/services/apiHealthService.js';
import { initializeUserData } from '@src/services/userService.js';
import { preventCaching, clearAllCaches } from '@src/utils/cacheUtils.js';
import { addTranslationNoticeStyles } from '@src/utils/uiEnhancements.js';
import { addDevReloadButton } from '@src/utils/devUtils.js';
import { setupDebugTools } from '@src/utils/debugUtils.js';
import { createSupabaseClient, validateSupabaseClient } from '@src/utils/supabaseService.js';
import { uploadImage } from '@src/services/imageService.js';
import { setUserProfileId, setFarmId, setConversations } from '@src/utils/state.js';
import './metadata-fix.js';

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    console.log(`Starting app version: ${APP_VERSION}`);
    console.log('Page load timestamp:', Date.now());
    
    // Get DOM elements
    const domElements = setupDomElements();
    
    // Clear all caches forcefully on startup
    await clearAllCaches();
    initUI();
    // Initialize utilities
    preventCaching();
    addTranslationNoticeStyles();
    addDevReloadButton();
    
    // Initialize services
    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Ensure Supabase client is working
    if (!validateSupabaseClient(supabase)) {
        console.error('Failed to initialize Supabase client. Some features may not work.');
    } else {
        window.supabaseClient = supabase;
        console.log('Supabase client initialized successfully');
    }

    
    // Get user ID and store in state
    const userProfileId = localStorage.getItem('currentUserProfileId') || DEFAULT_USER_PROFILE_ID;
    setUserProfileId(userProfileId);
    setFarmId(DEFAULT_FARM_ID);
    
    // Set up initial conversations array in state - cleared on each load
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
    
    // Load stored conversations - EXPLICITLY DISABLED to prevent caching issues
    // We never load old conversations - this ensures a fresh start every time
    // loadConversations();
    
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
    
    // Add a startup message to console for debugging
    console.log('Application initialization complete with cache clearing');
});


// Add a button to manually show metadata
// Add a button to manually show metadata
function addMetadataButton() {
    // Check if button already exists
    if (document.querySelector('#metadata-button')) return;
    
    const button = document.createElement('button');
    button.id = 'metadata-button';
    button.textContent = "Show Metadata";
    button.style.position = "fixed";
    button.style.bottom = "8px";
    button.style.left = "130px";
    button.style.padding = "10px 15px";
    button.style.backgroundColor = "#4CAF50";
    button.style.color = "white";
    button.style.border = "none";
    button.style.borderRadius = "4px";
    button.style.zIndex = "10000";
    button.style.cursor = "pointer";
    button.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
    button.style.fontSize = "14px";
    button.style.fontWeight = "bold";
    
    button.addEventListener('click', function() {
        // If our global function exists, call it
        if (typeof window.showMessageMetadata === 'function') {
            window.showMessageMetadata();
            button.textContent = "Metadata Updated";
            setTimeout(() => {
                button.textContent = "Show Metadata";
            }, 1500);
        } else {
            button.textContent = "Error: Function Not Found";
            setTimeout(() => {
                button.textContent = "Show Metadata";
            }, 1500);
        }
    });
    
    document.body.appendChild(button);
}

// Call this after initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(addMetadataButton, 1000);
    });
} else {
    // Document already loaded
    setTimeout(addMetadataButton, 1000);
}


function initializeSupabase() {
    // Check if Supabase is already initialized
    if (window.supabaseClient) return;
    
    // Get credentials from wherever they're stored in your app
    const url = localStorage.getItem('supabase_url');
    const key = localStorage.getItem('supabase_key');
    
    if (!url || !key) {
        console.warn('Supabase credentials not found in localStorage');
        return;
    }
    
    // Initialize if the supabase library is available
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        window.supabaseUrl = url;
        window.supabaseKey = key;
        window.supabaseClient = window.supabase.createClient(url, key);
        console.log('Supabase client initialized from local storage');
    } else {
        console.error('Supabase library not loaded');
    }
}

