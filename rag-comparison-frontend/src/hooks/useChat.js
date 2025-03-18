import { useState, useEffect } from 'react';
import { sendMessageToNormalRAG, sendMessageToQdrantRAG } from '../services/api';

const useChat = () => {
  const [normalRAGMessages, setNormalRAGMessages] = useState([]);
  const [qdrantRAGMessages, setQdrantRAGMessages] = useState([]);
  const [loadingNormalRAG, setLoadingNormalRAG] = useState(false);
  const [loadingQdrantRAG, setLoadingQdrantRAG] = useState(false);

  const sendMessage = async (message, isQdrant) => {
    if (isQdrant) {
      setLoadingQdrantRAG(true);
      const response = await sendMessageToQdrantRAG(message);
      setQdrantRAGMessages((prev) => [...prev, { text: message, sender: 'user' }, { text: response.answer, sender: 'agent' }]);
      setLoadingQdrantRAG(false);
    } else {
      setLoadingNormalRAG(true);
      const response = await sendMessageToNormalRAG(message);
      setNormalRAGMessages((prev) => [...prev, { text: message, sender: 'user' }, { text: response.answer, sender: 'agent' }]);
      setLoadingNormalRAG(false);
    }
  };

  return {
    normalRAGMessages,
    qdrantRAGMessages,
    sendMessage,
    loadingNormalRAG,
    loadingQdrantRAG,
  };
};

export default useChat;