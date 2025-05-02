// Self-executing function to avoid conflicts
(function() {
    // Simplified function to get the Supabase client from the window object
    function getSupabaseClient() {
        // Simply use the client that was initialized in script.js
        if (window.supabaseClient) {
            return window.supabaseClient;
        }
        
        console.error("No Supabase client found in window object");
        return null;
    }

    // Function to fetch messages by conversation ID
    async function fetchConversationMessages(conversationId) {
        if (!conversationId) {
            console.error("No conversation ID available");
            return null;
        }
        
        try {
            const supabase = getSupabaseClient();
            
            if (!supabase) {
                console.error("Supabase client not available");
                return null;
            }
            
            // Query messages for this conversation
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('timestamp', { ascending: true });
            
            if (error) {
                console.error("Error fetching conversation messages:", error);
                return null;
            }
            
            console.log(`Found ${data?.length || 0} messages for conversation ${conversationId}`);
            return data;
        } catch (err) {
            console.error("Failed to fetch messages:", err);
            return null;
        }
    }
    
    // Function to match DOM messages with database messages
    
    function matchMessagesToDOM(messages, domMessages) {
        if (!messages || !messages.length || !domMessages.length) return [];
        
        console.log(`Matching ${messages.length} database messages to ${domMessages.length} DOM elements`);
        const result = [];
        
        // Match by position and role with special handling for system messages
        let userMessageIndex = 0;
        let assistantMessageIndex = 0;
        
        domMessages.forEach((domMsg, index) => {
            // Check if this is a system/example message (first greeting message)
            const isSystemMessage = domMsg.classList.contains('system-message') || 
                                (index === 0 && domMsg.textContent.includes('Hello') && domMsg.textContent.includes('Assistant'));
            
            if (isSystemMessage) {
                // For system messages, don't try to match with database
                result[index] = {
                    message_id: 'system-message',
                    conversation_id: document.getElementById('conversation-id')?.textContent,
                    timestamp: new Date().toISOString(),
                    metadata: { type: 'system_message', isExample: true },
                    source: 'frontend',
                    role: 'system',
                    content: domMsg.textContent.trim().substring(0, 50) + '...'
                };
                return;
            }
            
            // Normal message matching logic
            const isUser = domMsg.classList.contains('user-message');
            const role = isUser ? 'user' : 'assistant';
            
            // Find messages with this role in the database
            const matchingMessages = messages.filter(m => m.role === role);
            const messageIndex = isUser ? userMessageIndex++ : assistantMessageIndex++;
            
            if (messageIndex < matchingMessages.length) {
                result[index] = matchingMessages[messageIndex];
            } else {
                // Message not found in database
                result[index] = {
                    message_id: 'not-in-db',
                    conversation_id: document.getElementById('conversation-id')?.textContent,
                    timestamp: new Date().toISOString(),
                    metadata: { note: 'Message not found in database' },
                    source: 'frontend',
                    role: role,
                    content: domMsg.textContent.trim().substring(0, 50) + '...'
                };
            }
        });
        
        return result;
    }

    // Function to create and show tooltips with real data
    async function setupMetadataTooltips() {
        console.log("Setting up metadata tooltips from Supabase");
        const messages = document.querySelectorAll('.message');
        if (!messages.length) return;
        
        // Get conversation ID from any available source
        let conversationId = null;
        
        // Option 1: From conversation-id element
        const conversationElement = document.getElementById('conversation-id');
        if (conversationElement) {
            const idText = conversationElement.textContent || conversationElement.innerText;
            if (idText && idText !== 'New conversation') {
                conversationId = idText.trim();
            }
        }
        
        // Option 2: From window global
        if (!conversationId && window.currentConversationId) {
            conversationId = window.currentConversationId;
        }
        
        // Option 3: From URL query parameter
        if (!conversationId) {
            const urlParams = new URLSearchParams(window.location.search);
            const idFromURL = urlParams.get('id');
            if (idFromURL) conversationId = idFromURL;
        }
        
        if (!conversationId) {
            console.warn("No conversation ID found, can't fetch metadata");
            return;
        }
        
        console.log("Using conversation ID:", conversationId);
        
        // Fetch all messages for this conversation
        const conversationMessages = await fetchConversationMessages(conversationId);
        if (!conversationMessages || !conversationMessages.length) {
            console.warn("No messages found for conversation:", conversationId);
            return;
        }
        
        // Match database messages to DOM elements
        const matchedMessages = matchMessagesToDOM(conversationMessages, messages);
        
        // Process each message with its metadata
        messages.forEach((message, index) => {
            // Clean up any existing tooltips to avoid duplication
            const existingTooltips = message.querySelectorAll('.metadata-direct-tooltip');
            existingTooltips.forEach(tooltip => tooltip.remove());
            
            // Get the matched data for this message
            const messageData = matchedMessages[index];
            
            // Create a new tooltip with inline styles
            const tooltip = document.createElement('div');
            tooltip.className = 'metadata-direct-tooltip';
            tooltip.style.cssText = `
                position: absolute;
                display: none;
                top: -5px;
                left: 0;
                transform: translateY(-100%);
                background-color: #1e1e1e;
                color: #ffffff;
                border: 1px solid #333;
                border-radius: 6px;
                padding: 10px;
                font-size: 12px;
                z-index: 10000;
                width: 300px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                white-space: pre-wrap;
                text-align: left;
                font-family: monospace;
                pointer-events: none;
            `;
            
            // Create a visible indicator button
            const indicator = document.createElement('button');
            indicator.textContent = 'ℹ';
            indicator.style.cssText = `
                position: absolute;
                top: 5px;
                right: 5px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                font-size: 12px;
                cursor: pointer;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            message.appendChild(indicator);
            
            // Set position for tooltip container
            message.style.position = 'relative';
            message.appendChild(tooltip);
            
            // Add event listeners for the indicator button
            indicator.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Toggle tooltip visibility
                if (tooltip.style.display === 'none' || !tooltip.style.display) {
                    tooltip.style.display = 'block';
                    tooltip.style.top = '-5px';
                    tooltip.style.right = '25px';
                    tooltip.style.left = 'auto';
                    
                    if (messageData) {
                        // Format the metadata for display
                        let formattedMetadata = '';
                        
                        // Build HTML for metadata display
                        formattedMetadata += `<div style="margin-bottom:5px"><span style="color:#4CAF50;font-weight:bold">Message ID:</span> ${messageData.message_id || 'N/A'}</div>`;
                        formattedMetadata += `<div style="margin-bottom:5px"><span style="color:#4CAF50;font-weight:bold">Conversation ID:</span> ${messageData.conversation_id || 'N/A'}</div>`;
                        formattedMetadata += `<div style="margin-bottom:5px"><span style="color:#4CAF50;font-weight:bold">Timestamp:</span> ${messageData.timestamp || 'N/A'}</div>`;
                        formattedMetadata += `<div style="margin-bottom:5px"><span style="color:#4CAF50;font-weight:bold">Role:</span> ${messageData.role || 'N/A'}</div>`;
                        formattedMetadata += `<div style="margin-bottom:5px"><span style="color:#4CAF50;font-weight:bold">Source:</span> ${messageData.source || 'N/A'}</div>`;
                        
                        // Add nested metadata if available
                        if (messageData.metadata) {
                            formattedMetadata += `<div style="margin-bottom:5px"><span style="color:#4CAF50;font-weight:bold">Metadata:</span></div>`;
                            formattedMetadata += `<div style="margin-left:10px;border-left:2px solid #444;padding-left:10px;">`;
                            
                            for (const [key, value] of Object.entries(messageData.metadata)) {
                                formattedMetadata += `<div style="margin-bottom:3px"><span style="color:#4CAF50;font-weight:bold">${key}:</span> ${JSON.stringify(value)}</div>`;
                            }
                            
                            formattedMetadata += `</div>`;
                        }
                        
                        // Update tooltip content
                        tooltip.innerHTML = formattedMetadata;
                    } else {
                        tooltip.innerHTML = `<div style="color:#ff6b6b;font-weight:bold">No metadata found for this message</div>`;
                    }
                } else {
                    tooltip.style.display = 'none';
                }
            });
            
            // Close tooltip when clicking elsewhere
            document.addEventListener('click', () => {
                tooltip.style.display = 'none';
            });
        });
        
        console.log(`Added tooltips to ${messages.length} messages`);
    }
    
    // Run on page load and periodically
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(setupMetadataTooltips, 1000);
        });
    } else {
        // Document already loaded
        setTimeout(setupMetadataTooltips, 1000);
    }
    
    // Also run periodically to catch new messages
    setInterval(setupMetadataTooltips, 5000);
    
    // Expose function globally for manual triggering
    window.showMessageMetadata = setupMetadataTooltips;
})();