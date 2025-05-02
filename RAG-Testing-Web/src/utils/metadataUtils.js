// Rewrite this file to avoid the import conflict and make it cleaner

// Remove this import as it causes circular dependency issues
// import { formatMetadata } from './messageDisplayUtils.js';

/**
 * Utilities for handling message metadata
 */

/**
 * Format metadata object into readable HTML
 * @param {Object|string} metadata - The metadata to format
 * @returns {string} Formatted HTML string
 */
function formatMetadataInternal(metadata) {
    if (!metadata) return '';
    
    // If metadata is a string, try to parse it as JSON
    if (typeof metadata === 'string') {
        try {
            metadata = JSON.parse(metadata);
        } catch (e) {
            return `<div class="metadata-row"><span class="metadata-label">Raw:</span>${metadata}</div>`;
        }
    }
    
    // Display different fields based on what's available
    const result = [];
    
    // Core message info
    if (metadata.id) {
        result.push(`<div class="metadata-row"><span class="metadata-label">Message ID:</span>${metadata.id}</div>`);
    }
    
    if (metadata.conversation_id) {
        result.push(`<div class="metadata-row"><span class="metadata-label">Conversation:</span>${metadata.conversation_id}</div>`);
    }
    
    if (metadata.timestamp || metadata.inserted_at) {
        const timestamp = metadata.timestamp || metadata.inserted_at;
        result.push(`<div class="metadata-row"><span class="metadata-label">Timestamp:</span>${new Date(timestamp).toLocaleString()}</div>`);
    }
    
    // Additional metadata fields
    if (metadata.topic) {
        result.push(`<div class="metadata-row"><span class="metadata-label">Topic:</span>${metadata.topic}</div>`);
    }
    
    if (metadata.source) {
        result.push(`<div class="metadata-row"><span class="metadata-label">Source:</span>${metadata.source}</div>`);
    }
    
    if (metadata.role) {
        result.push(`<div class="metadata-row"><span class="metadata-label">Role:</span>${metadata.role}</div>`);
    }
    
    // If there's a nested metadata object, show that too
    if (metadata.metadata && typeof metadata.metadata === 'object') {
        const nestedMeta = Object.entries(metadata.metadata)
            .filter(([key, val]) => val !== null && val !== undefined)
            .map(([key, val]) => {
                const value = typeof val === 'object' ? JSON.stringify(val) : val;
                return `<div class="metadata-row"><span class="metadata-label">${key}:</span>${value}</div>`;
            })
            .join('');
        
        if (nestedMeta) {
            result.push(`<div class="metadata-row"><span class="metadata-label">Additional Metadata:</span></div>`);
            result.push(nestedMeta);
        }
    }
    
    // If there is extended payload data
    if (metadata.payload && typeof metadata.payload === 'object') {
        result.push(`<div class="metadata-row"><span class="metadata-label">Payload:</span>${JSON.stringify(metadata.payload, null, 2)}</div>`);
    }
    
    // If there's nothing to show, give basic info
    if (result.length === 0) {
        return `<div class="metadata-row">No detailed metadata available</div>`;
    }
    
    return result.join('');
}

/**
 * Extract relevant metadata from a message object based on the Supabase schema
 * @param {Object} message - The message object from the API
 * @returns {Object} Formatted metadata object
 */
export function extractMetadata(message) {
    if (!message) return null;
    
    return {
        id: message.id,
        message_id: message.message_id || message.id,
        conversation_id: message.conversation_id,
        timestamp: message.created_at || message.timestamp || message.inserted_at,
        role: message.role,
        source: message.source,
        topic: message.topic,
        image_url: message.image_url,
        extension: message.extension,
        event: message.event,
        private: message.private,
        updated_at: message.updated_at,
        metadata: message.metadata,
        payload: message.payload
    };
}

/**
 * Add metadata to an existing message element
 * @param {HTMLElement} messageElement - The message DOM element
 * @param {Object} metadata - The metadata object
 */
export function addMetadataToMessage(messageElement, metadata) {
    if (!messageElement || !metadata) return;
    
    // Format and add metadata tooltip
    const contentElement = messageElement.querySelector('.message-content');
    if (!contentElement) return;
    
    // Create or find metadata element
    let metadataElement = contentElement.querySelector('.message-metadata');
    if (!metadataElement) {
        metadataElement = document.createElement('div');
        metadataElement.className = 'message-metadata';
        contentElement.appendChild(metadataElement);
    }
    
    // Update the tooltip content
    metadataElement.innerHTML = formatMetadataInternal(metadata);
    
    // Store metadata as data attribute
    messageElement.dataset.metadata = typeof metadata === 'string' ? 
        metadata : JSON.stringify(metadata);
}