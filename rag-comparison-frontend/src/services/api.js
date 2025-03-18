const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

/**
 * Query the Python RAG system
 * @param {string} message - User message
 * @param {string} farmId - Farm ID (optional)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Response data
 */
export async function queryPythonRAG(message, farmId, userId) {
  try {
    const response = await fetch(`${API_URL}/chat/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        farm_id: farmId || undefined,
        message
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error querying Python RAG:', error);
    throw error;
  }
}

/**
 * Query the Qdrant RAG system
 * @param {string} message - User message
 * @param {string} farmId - Farm ID (optional)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Response data
 */
export async function queryQdrantRAG(message, farmId, userId) {
  try {
    const response = await fetch(`${API_URL}/chat/qdrant/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        farm_id: farmId || undefined,
        message
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error querying Qdrant RAG:', error);
    throw error;
  }
}

/**
 * Stream response from Python RAG
 * @param {string} message - User message
 * @param {string} farmId - Farm ID (optional)
 * @param {string} userId - User ID
 * @param {Function} onChunk - Callback for each chunk
 * @param {Function} onComplete - Callback when streaming is complete
 * @param {Function} onError - Callback for errors
 */
export function streamPythonRAG(message, farmId, userId, onChunk, onComplete, onError) {
  const eventSource = new EventSource(
    `${API_URL}/chat/message/stream?` +
    `user_id=${encodeURIComponent(userId)}` +
    `&message=${encodeURIComponent(message)}` +
    (farmId ? `&farm_id=${encodeURIComponent(farmId)}` : '')
  );
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.text_chunk) {
        onChunk(data.text_chunk);
      } else if (data.complete) {
        onComplete(data);
        eventSource.close();
      }
    } catch (error) {
      console.error('Error parsing SSE data:', error);
      onError(error);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    onError(error);
    eventSource.close();
  };
  
  return eventSource;
}

/**
 * Stream response from Qdrant RAG
 * @param {string} message - User message
 * @param {string} farmId - Farm ID (optional)
 * @param {string} userId - User ID
 * @param {Function} onChunk - Callback for each chunk
 * @param {Function} onComplete - Callback when streaming is complete
 * @param {Function} onError - Callback for errors
 */
export function streamQdrantRAG(message, farmId, userId, onChunk, onComplete, onError) {
  const eventSource = new EventSource(
    `${API_URL}/chat/qdrant/message/stream?` +
    `user_id=${encodeURIComponent(userId)}` +
    `&message=${encodeURIComponent(message)}` +
    (farmId ? `&farm_id=${encodeURIComponent(farmId)}` : '')
  );
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.text_chunk) {
        onChunk(data.text_chunk);
      } else if (data.complete) {
        onComplete(data);
        eventSource.close();
      }
    } catch (error) {
      console.error('Error parsing SSE data:', error);
      onError(error);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    onError(error);
    eventSource.close();
  };
  
  return eventSource;
}

/**
 * Fetch farms for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of farms
 */
export async function getUserFarms(userId) {
  try {
    const response = await fetch(`${API_URL}/farms/user/${userId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching farms:', error);
    throw error;
  }
}