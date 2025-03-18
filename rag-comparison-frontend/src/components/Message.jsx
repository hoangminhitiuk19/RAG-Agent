import React from 'react';

const Message = ({ text, isUser, timestamp, sources }) => {
  return (
    <div className={`message ${isUser ? 'user-message' : 'ai-message'}`}>
      <div className="message-content">
        <p>{text}</p>
        {timestamp && <span className="timestamp">{timestamp}</span>}
      </div>
      
      {sources && sources.length > 0 && (
        <div className="message-sources">
          <h4>Sources:</h4>
          {sources.map((source, index) => (
            <div key={index} className="source-item">
              <p>{source.content.substring(0, 100)}...</p>
              <small>
                {source.metadata.filename} 
                {source.similarity && ` (Similarity: ${(source.similarity * 100).toFixed(2)}%)`}
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Message;