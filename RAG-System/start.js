// start.js
const { spawn } = require('child_process');
const path = require('path');

// Set the environment variable to allow multiple OpenMP libraries
process.env.KMP_DUPLICATE_LIB_OK = 'TRUE';

// Start the reranking service first
console.log('Starting Reranking service...');
const rerankServer = spawn('python', ['rag/rerank_server.py'], {
    cwd: path.resolve(__dirname),
    env: {...process.env},  // Pass along the environment variables
    stdio: 'inherit'
});

rerankServer.on('error', (err) => {
  console.error('Failed to start Reranking service:', err);
});

// Wait longer for reranking service to initialize fully
setTimeout(() => {
  // Start the Python RAG server
  console.log('Starting Python RAG server...');
  const ragServer = spawn('python', ['rag/rag_server.py'], {
      cwd: path.resolve(__dirname),
      env: {...process.env},  // Pass along the environment variables
      stdio: 'inherit'
  });

  ragServer.on('error', (err) => {
    console.error('Failed to start Python RAG server:', err);
  });

  // Handle termination of all services
  process.on('SIGINT', () => {
    console.log('Shutting down servers...');
    rerankServer.kill();
    ragServer.kill();
    process.exit(0);
  });

}, 5000); // Wait 5 seconds for reranking service to fully initialize

// Wait even longer for Python RAG server to initialize
setTimeout(() => {
  // Start the Node.js server
  console.log('Starting Node.js server...');
  const nodeServer = spawn('node', ['api/server.js'], {
    stdio: 'inherit'
  });

  nodeServer.on('error', (err) => {
    console.error('Failed to start Node.js server:', err);
  });
}, 10000); // Wait 10 seconds for both Python servers to fully initialize