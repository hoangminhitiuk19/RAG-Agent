import { renderConversationList } from '../services/conversationService.js';
import { startNewConversation } from './conversationUIUtils.js';

export function addDevReloadButton() {
    if (!window.DEV_MODE) return;

    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = '🔄 Reload App';
    reloadBtn.style.position = 'fixed';
    reloadBtn.style.bottom = '10px';
    reloadBtn.style.left = '10px';
    reloadBtn.style.zIndex = '9999';
    reloadBtn.style.background = '#ff5722';
    reloadBtn.style.color = 'white';
    reloadBtn.style.border = 'none';
    reloadBtn.style.borderRadius = '4px';
    reloadBtn.style.padding = '8px 12px';
    reloadBtn.style.cursor = 'pointer';

    reloadBtn.addEventListener('click', () => {
        console.log('Forcing reload without cache...');
        window.location.reload(true);
    });

    document.body.appendChild(reloadBtn);
    renderConversationList();
}

export function clearAllConversations() {
    if (confirm('Are you sure you want to clear all conversation history? This cannot be undone.')) {
        localStorage.removeItem('coffee-assistant-conversations-v2');
        localStorage.removeItem('coffee-assistant-conversations');
        renderConversations();
        startNewConversation();
        return 'All conversations cleared';
    }
    return 'Operation cancelled';
}