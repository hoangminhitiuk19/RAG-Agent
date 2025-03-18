import logging
import numpy as np
import subprocess
import sys
import time

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def install_required_packages():
    """Install required packages if not already installed."""
    try:
        import sentence_transformers
    except ImportError:
        logging.info("Installing sentence-transformers...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "sentence-transformers"])

def rerank_chunks(query, chunks, top_k=5):
    """Rerank chunks using query relevance to improve retrieval quality."""
    try:
        # Ensure required packages are installed
        install_required_packages()
        
        from sentence_transformers import CrossEncoder
        
        start_time = time.time()
        
        # Initialize cross-encoder model
        model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
        
        # Prepare pairs of query and chunks
        pairs = []
        for chunk in chunks:
            # Handle different chunk formats (dict with 'text' or plain text)
            if isinstance(chunk, dict) and "text" in chunk:
                chunk_text = chunk["text"]
            else:
                chunk_text = chunk
            pairs.append((query, chunk_text))
        
        # Score pairs using the model
        scores = model.predict(pairs)
        
        # Sort chunks by score
        scored_chunks = list(zip(chunks, scores))
        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        
        # Return top_k chunks
        reranked_chunks = [chunk for chunk, _ in scored_chunks[:top_k]]
        
        # Log reranking statistics
        elapsed = time.time() - start_time
        logging.info(f"Reranking completed in {elapsed:.2f} seconds")
        logging.info(f"Reranking changed order: original vs. reranked")
        
        for i, (chunk, score) in enumerate(scored_chunks[:top_k]):
            # Find the original position
            try:
                if isinstance(chunk, dict) and "text" in chunk:
                    chunk_text = chunk["text"]
                    original_idx = next(i for i, c in enumerate(chunks) 
                                    if isinstance(c, dict) and "text" in c and c["text"] == chunk_text)
                else:
                    original_idx = chunks.index(chunk)
                    
                logging.info(f"  Rank {i+1}: was at position {original_idx+1}, score: {score:.4f}")
            except (ValueError, StopIteration):
                logging.info(f"  Rank {i+1}: new entry, score: {score:.4f}")
        
        return reranked_chunks
        
    except Exception as e:
        logging.error(f"Error during reranking: {e}")
        # Fall back to original ranking if reranking fails
        return chunks[:top_k]

def hybrid_retrieval(query, chunks, top_k=5, use_reranking=True):
    """Combine standard vector search with reranking for better results."""
    if not use_reranking or len(chunks) <= top_k:
        return chunks[:top_k]
        
    # If we have enough chunks, get more than needed for reranking
    retrieved_count = min(top_k * 3, len(chunks))
    candidates = chunks[:retrieved_count]
    
    # Rerank the candidates
    reranked = rerank_chunks(query, candidates, top_k)
    return reranked