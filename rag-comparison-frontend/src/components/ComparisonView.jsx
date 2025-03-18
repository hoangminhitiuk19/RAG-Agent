import React, { useState, useEffect } from 'react';
import ChatBox from './ChatBox';
import { queryPythonRAG, queryQdrantRAG } from '../services/api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const ComparisonView = () => {
  const [pythonMessages, setPythonMessages] = useState([]);
  const [qdrantMessages, setQdrantMessages] = useState([]);
  const [pythonLoading, setPythonLoading] = useState(false);
  const [qdrantLoading, setQdrantLoading] = useState(false);
  const [farmId, setFarmId] = useState('');
  const [farms, setFarms] = useState([]);
  const [userId] = useState(() => 'e6a10f89-322f-4fcc-9fbd-c6587907f439');
  
  // Save user ID to localStorage
  useEffect(() => {
    localStorage.setItem('user_id', userId);
  }, [userId]);
  
  // Fetch farms on component mount
  useEffect(() => {
    // Modify fetchFarms to handle missing endpoint
  const fetchFarms = async () => {
    try {
      // Try to fetch farms or use default
      try {
        const response = await fetch(`${API_URL}/farms/user/${userId}`);
        if (response.ok) {
          const data = await response.json();
          setFarms(data);
        }
      } catch (error) {
        console.error('Error fetching farms:', error);
        // Use mock farms data if API fails
        setFarms([
          { farm_id: 'ad8a606b-9c39-4be4-8883-a6641c3eb8f6', name: 'Demo Farm' }
        ]);
      }
    } catch (error) {
      console.error('Error in fetchFarms:', error);
    }
  };
    
    fetchFarms();
  }, [userId]);
  
  // Format timestamp
  const formatTime = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Send message to Python RAG
  const sendToPythonRAG = async (message) => {
    // Add user message to chat
    const userMessage = {
      text: message,
      isUser: true,
      timestamp: formatTime()
    };
    
    setPythonMessages(prev => [...prev, userMessage]);
    setPythonLoading(true);
    
    try {
      const response = await queryPythonRAG(message, farmId, userId);
      
      // Add AI response to chat
      const aiMessage = {
        text: response.response || "Sorry, I couldn't generate a response.",
        isUser: false,
        timestamp: formatTime(),
        sources: response.sources
      };
      
      setPythonMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error querying Python RAG:', error);
      
      // Add error message
      const errorMessage = {
        text: "Sorry, there was an error processing your request.",
        isUser: false,
        timestamp: formatTime()
      };
      
      setPythonMessages(prev => [...prev, errorMessage]);
    } finally {
      setPythonLoading(false);
    }
  };
  
  // Send message to Qdrant RAG
  const sendToQdrantRAG = async (message) => {
    // Add user message to chat
    const userMessage = {
      text: message,
      isUser: true,
      timestamp: formatTime()
    };
    
    setQdrantMessages(prev => [...prev, userMessage]);
    setQdrantLoading(true);
    
    try {
      const response = await queryQdrantRAG(message, farmId, userId);
      
      // Add AI response to chat
      const aiMessage = {
        text: response.response || "Sorry, I couldn't generate a response.",
        isUser: false,
        timestamp: formatTime(),
        sources: response.sources
      };
      
      setQdrantMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error querying Qdrant RAG:', error);
      
      // Add error message
      const errorMessage = {
        text: "Sorry, there was an error processing your request.",
        isUser: false,
        timestamp: formatTime()
      };
      
      setQdrantMessages(prev => [...prev, errorMessage]);
    } finally {
      setQdrantLoading(false);
    }
  };
  
  // Handle simultaneous send to both systems
  const sendToBoth = (message) => {
    sendToPythonRAG(message);
    sendToQdrantRAG(message);
  };

  return (
    <div className="comparison-container">
      <div className="farm-selector">
        <label htmlFor="farm-select">Select Farm:</label>
        <select 
          id="farm-select"
          value={farmId}
          onChange={(e) => setFarmId(e.target.value)}
        >
          <option value="">No farm selected</option>
          {farms.map(farm => (
            <option key={farm.farm_id} value={farm.farm_id}>
              {farm.name}
            </option>
          ))}
        </select>
      </div>
      
      <div className="shared-input">
        <input 
          type="text"
          placeholder="Send to both systems..."
          id="shared-message-input"
        />
        <button onClick={() => {
          const input = document.getElementById('shared-message-input');
          if (input.value.trim() !== '') {
            sendToBoth(input.value);
            input.value = '';
          }
        }}>
          Send to Both
        </button>
      </div>
      
      <div className="chat-boxes">
        <ChatBox 
          title="Python RAG"
          sendMessage={sendToPythonRAG}
          messages={pythonMessages}
          isLoading={pythonLoading}
          ragType="FAISS Vector DB"
        />
        
        <ChatBox 
          title="Qdrant RAG"
          sendMessage={sendToQdrantRAG}
          messages={qdrantMessages}
          isLoading={qdrantLoading}
          ragType="Qdrant Vector DB"
        />
      </div>
    </div>
  );
};

export default ComparisonView;